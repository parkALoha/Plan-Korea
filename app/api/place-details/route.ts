import { NextRequest, NextResponse } from "next/server";
import { lookupPlace, type GoogleOpeningHours, type GoogleReview } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";
import { knownPlaceLocales } from "@/lib/engine/countries";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { supabaseConfigured } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/auth/server";
import { catalogPublicMapsQueries } from "@/lib/engine/db";
import type { SupabaseClient } from "@supabase/supabase-js";

// เพดานสูงไว้ก่อนเผื่อของเก่า — ตั้งแต่เฟส 19 หน้าแผนรวมคำขอเหลือ 1-2 ครั้งต่อการเปิดหน้า (ดู ?queries=)
const RATE_LIMIT_PER_MINUTE = 300;

/** จำนวนสถานที่สูงสุดต่อ 1 คำขอแบบกลุ่ม — ทั้งทริปมี ~46 ที่ เผื่อไว้พอ และกัน URL ยาวเกินเหตุ */
const MAX_BATCH = 80;

type PlaceDetailsResponse = {
  googlePlaceId: string | null;
  openingHours: GoogleOpeningHours | null;
  rating: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  reviews: GoogleReview[] | null;
  /** เวลาเปิด-ปิดจริง 7 วันข้างหน้ารวมวันหยุดพิเศษ — มีค่าเฉพาะตอนขอด้วย ?live=1 (เฟส 11.5)
   *  ไม่เก็บใน place_details_cache เพราะข้อมูลหมดอายุไว ต่างจาก openingHours (ตารางประจำ) ด้านบน */
  currentOpeningHours?: GoogleOpeningHours | null;
  /** ชื่อ/ที่อยู่ภาษาท้องถิ่น (เฟส 14) — มีค่าเมื่อขอด้วย ?locale=ko|vi
   *  ที่คัดไว้ใน data/places.ts ฝัง nameLocal มาแล้วไม่ต้องพึ่งเส้นนี้ · เส้นนี้ไว้ให้สถานที่ที่ผู้ใช้เพิ่มเอง */
  nameLocal?: string | null;
  /**
   * 🔴 **เหตุผลที่หาไม่ได้ — มีค่าเฉพาะตอนล้มจริง** (`/api/place-photos` แก้รูปเดียวกัน 28 ส.ค. 2026)
   *
   * ก่อนหน้านี้ `if (error)` คืนอ็อบเจกต์ `null` ทั้งใบ **แล้วทิ้ง `error` ไป**
   * → เบราว์เซอร์เห็น *"ไม่มีเรตติ้ง/เวลาเปิด-ปิด"* ซึ่ง **แยกไม่ออกจาก "Google ไม่มีข้อมูลของที่นี่"**
   * · เกิดจริง: ทรี dev ไม่มี `GOOGLE_MAPS_API_KEY` → ทุกที่คืน `null` หมด **เงียบสนิท**
   * ⚠️ **ฟิลด์นี้ไม่เปลี่ยน status และไม่เปลี่ยนรูปของฟิลด์เดิมสักตัว** — ไคลเอนต์ที่ไม่รู้จักมันทำงานเหมือนเดิม
   */
  error?: string;
  addressLocal?: string | null;
};

/**
 * ภาษาที่ยอมรับ — allowlist ฝั่งเซิร์ฟเวอร์ ไม่ปล่อยให้ client ส่ง `languageCode` อะไรก็ได้เข้า Google
 *
 * 🔴 **มาจากทะเบียนประเทศ ไม่ใช่รายการที่พิมพ์มือ** — แก้ 27 ส.ค. 2026 (P4 ชี้ · P1 แก้)
 * ฉบับเดิม `["ko", "vi"] as const` **ตรงกับทะเบียนโดยบังเอิญ** และจะเลิกตรงทันทีที่รับประเทศใหม่
 * → `geocode` จะรับภาษาใหม่ · **ที่นี่ไม่รับ** · ค่าเดียวกัน สองเส้น สองกฎ (`D46`)
 *
 * ⚠️ **`place-name` ยังใช้ `["en","ko","vi"]` ของตัวเองต่อไป และนั่นถูก** —
 * `en` เป็น *ภาษาที่ผู้ใช้อยากอ่าน* ไม่ใช่ *ภาษาของจุดหมาย* · **ทะเบียนไม่ควรรู้เรื่องผู้ใช้**
 */
type Locale = string;

const CACHE_COLUMNS =
  "maps_query, google_place_id, opening_hours, rating, user_rating_count, primary_type, reviews, name_local, address_local, locale";

type CacheRow = {
  maps_query: string;
  google_place_id: string | null;
  opening_hours: unknown;
  rating: number | null;
  user_rating_count: number | null;
  primary_type: string | null;
  reviews: unknown;
  name_local: string | null;
  address_local: string | null;
  locale: string | null;
};

function parseLocale(raw: string | null): Locale | null {
  // `includes` บนอาร์เรย์ — ไม่ใช่ index บนออบเจ็กต์ → สายโปรโตไทป์เข้าไม่ถึงตามโครงสร้าง
  return raw && knownPlaceLocales().includes(raw) ? raw : null;
}

/** ดึงชื่อ+ที่อยู่ภาษาท้องถิ่นจาก Google (คนละ request กับตัวหลักเพราะขอคนละ languageCode) */
async function fetchLocalName(query: string, locale: Locale) {
  const { place } = await lookupPlace(query, "places.displayName,places.formattedAddress", {
    languageCode: locale,
  });
  return {
    nameLocal: place?.displayName?.text ?? null,
    addressLocal: place?.formattedAddress ?? null,
  };
}

// ยิงขอ currentOpeningHours สดจาก Google เสมอ ไม่พึ่ง cache ไหนเลย (ทั้ง DB และ Next.js fetch cache)
// เพราะข้อมูลนี้มีความหมายแค่ 7 วันข้างหน้านับจากตอนเรียก แคชไว้นานจะกลายเป็นข้อมูลผิดเงียบๆ
async function fetchCurrentOpeningHoursLive(query: string): Promise<GoogleOpeningHours | null> {
  const { place } = await lookupPlace(query, "places.currentOpeningHours", { noCache: true });
  return place?.currentOpeningHours ?? null;
}

function rowToResponse(row: CacheRow, nameLocal: string | null, addressLocal: string | null): PlaceDetailsResponse {
  return {
    googlePlaceId: row.google_place_id,
    openingHours: row.opening_hours as GoogleOpeningHours | null,
    rating: row.rating,
    userRatingCount: row.user_rating_count,
    primaryType: row.primary_type,
    reviews: row.reviews as GoogleReview[] | null,
    nameLocal,
    addressLocal,
  };
}

/** แคชไว้แล้วแต่ยังไม่มีชื่อท้องถิ่น (หรือเป็นคนละภาษากับที่ขอ) → เติมให้ครั้งเดียวแล้วเก็บลงแถวเดิม
 *  แถวเก่าทั้งหมดที่มีอยู่ก่อนเฟส 14 จะค่อยๆ ถูกเติมเองเมื่อถูกเรียกใช้ ไม่ต้อง backfill ทั้งตาราง */
async function backfillLocalName(db: SupabaseClient,
  row: CacheRow, locale: Locale) {
  /**
   * 🔴 **เดิมบรรทัดถัดจากนี้เขียนผลกลับลงแถวเดิม — ถอดออกแล้ว** (`Q3` ก้าวที่ 1)
   * `update` จาก route = สิทธิ์ที่ผู้ใช้มีเท่ากัน → **เขียนทับแถวของคนอื่นได้**
   * ซึ่งแรงกว่า `insert` ที่เราถอดไปอีก · งานเบื้องหลังเป็นคนเติมชื่อท้องถิ่นแทน
   *
   * ✅ **ผู้ใช้ยังได้ชื่อท้องถิ่นถูกต้องเสมอ** — บรรทัดล่างคืนค่าที่เพิ่งดึงจาก Google
   *    สิ่งที่เสียคือ *การเก็บไว้ใช้ซ้ำ* → **ต้นทุน ไม่ใช่ความถูกต้อง**
   */
  return await fetchLocalName(row.maps_query, locale);
}

/** ยิง Google ใหม่ทั้งชุดสำหรับสถานที่ที่ยังไม่เคยแคช แล้วเก็บลง place_details_cache */
async function resolveFromGoogle(
  db: SupabaseClient,
  query: string,
  live: boolean,
  locale: Locale | null
): Promise<PlaceDetailsResponse> {
  const fieldMask = live
    ? "places.id,places.regularOpeningHours,places.currentOpeningHours,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.reviews"
    : "places.id,places.regularOpeningHours,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.reviews";
  const { place, error } = await lookupPlace(query, fieldMask);
  if (error) {
    return {
      googlePlaceId: null,
      openingHours: null,
      rating: null,
      userRatingCount: null,
      primaryType: null,
      reviews: null,
      error,
    };
  }

  const googlePlaceId = place?.id ?? null;
  const openingHours = place?.regularOpeningHours ?? null;
  const rating = place?.rating ?? null;
  const userRatingCount = place?.userRatingCount ?? null;
  const primaryType = place?.primaryTypeDisplayName?.text ?? null;
  const reviews = place?.reviews?.slice(0, 3) ?? null;
  const local = locale ? await fetchLocalName(query, locale) : { nameLocal: null, addressLocal: null };

  /**
   * 🔴 **route ไม่เขียนแคชอีกต่อไป — และไม่ควรเขียนได้ด้วย** (`Q3` ก้าวที่ 1 · ผู้ใช้ตัดสิน 2 ก.ย. 2026)
   *
   * `route` รันด้วย **ตัวตนของผู้ใช้เอง** → **สิทธิ์อะไรที่ route มี ผู้ใช้มีเท่ากันเสมอ**
   * ให้ route เขียนแคชได้ = ให้ผู้ใช้ยิง PostgREST ใส่ **ชื่อ/ที่อยู่ปลอม** ของสถานที่จริงได้ตรง ๆ
   * → ตารางใช้ร่วมกันทั้งระบบ → **ของปลอมของคนเดียว ทุกคนเห็น** และ `ON CONFLICT DO NOTHING`
   *   ทำให้ **ทับกลับไม่ได้และไม่มีเสียง** (P4 เจอ · เป็นเหตุผลที่ `D87` ถูกถอน)
   *
   * ✅ **ตัวเขียนคืองานเบื้องหลังที่ถือ `service_role` และอยู่นอก `app/`** (`D38`)
   *    จักรวาลของคีย์ = สถานที่ในคลัง — **นับได้ จึงอุ่นล่วงหน้าได้ครบ ไม่ต้องเดา**
   *
   * ⚠️ **ถอดทั้งบล็อก ไม่ได้แค่ปิดด้วยเงื่อนไข** — โค้ดที่เขียนไม่ได้แต่หน้าตาเหมือนเขียนได้
   *    คือของที่คนอ่านจะเชื่อว่าแคชถูกเติมจากเส้นนี้
   */

  return {
    googlePlaceId,
    openingHours,
    rating,
    userRatingCount,
    primaryType,
    reviews,
    currentOpeningHours: live ? place?.currentOpeningHours ?? null : undefined,
    nameLocal: local.nameLocal,
    addressLocal: local.addressLocal,
  };
}

/**
 * resolve สถานที่เป็น Google place ID + เวลาเปิด-ปิด + เรทติ้ง/รีวิว/ประเภทร้าน (เฟส 2)
 * เช็ค place_details_cache ใน Supabase ก่อนเสมอ (แคชถาวร) เจอแล้วไม่ยิง Google ซ้ำ
 *
 * รับได้ 2 แบบ:
 * - `?query=...` — ทีละที่ (ใช้กับ `?live=1` ของหน้า /today ที่ขอแค่จุดถัดไปจุดเดียว)
 * - `?queries=a|b|c` — **ทีเดียวทั้งชุด (เฟส 19)** คืน `{ results: { [query]: {...} } }`
 *   เดิมหน้าแผนยิงเส้นนี้ทีละสถานที่ ~34 ครั้งต่อการเปิดหน้า 1 ครั้ง ตอนนี้เหลือคำขอเดียว
 *   และอ่าน place_details_cache ด้วย `.in()` ครั้งเดียวแทน 34 ครั้ง
 */
export async function GET(req: NextRequest) {
  /** 🔴 client ของ *ผู้ใช้* — `D87` ③ ให้สิทธิ์ `authenticated` เท่านั้น · คีย์ `anon` ยังถูก revoke อยู่ */
  const db = await createServerSupabase();
  const limited = rateLimitGuard(req, "place-details", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const live = req.nextUrl.searchParams.get("live") === "1";
  const locale = parseLocale(req.nextUrl.searchParams.get("locale"));
  const batchParam = req.nextUrl.searchParams.get("queries");
  const query = req.nextUrl.searchParams.get("query");

  if (batchParam) {
    const queries = Array.from(
      new Set(batchParam.split("|").map((q) => q.trim()).filter(Boolean))
    ).slice(0, MAX_BATCH);
    if (queries.length === 0) {
      return NextResponse.json({ error: "missing queries" }, { status: 400 });
    }
    const results = await resolveMany(db, queries, locale);
    return NextResponse.json({ results });
  }

  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }

  const results = await resolveMany(db, [query], locale, live);
  return NextResponse.json(results[query]);
}

/** แกนกลางที่ใช้ร่วมกันทั้งแบบเดี่ยวและแบบกลุ่ม — อ่านแคชทีเดียวด้วย `.in()` แล้วยิง Google เฉพาะที่ยังไม่มี */
async function resolveMany(
  db: SupabaseClient,
  queries: string[],
  locale: Locale | null,
  live = false
): Promise<Record<string, PlaceDetailsResponse>> {
  /**
   * 🔴 **แคชได้เฉพาะคิวรีที่พิสูจน์ได้ว่าเป็นของคลังสาธารณะ** (`E3-AC6` · หลักเดียวกับ `travel_time_cache`)
   * `maps_query` เป็น **คีย์** ของตารางที่ใช้ร่วมกันทั้งระบบ · สำหรับสถานที่ที่ผู้ใช้เพิ่มเอง
   * มันคือ **ข้อความที่เขาพิมพ์** (ชื่อ/ที่อยู่) — และแถวยังถือ `name_local`/`address_local`
   * ที่บอกได้เองว่าเป็นที่ไหน **จึงปิดที่ตัวแถวไม่ได้ ต้องไม่ให้เข้าตารางตั้งแต่แรก**
   * ⚠️ ไม่ผ่านประตู = ยังตอบผู้ใช้ตามปกติ **แค่ยิง Google ทุกครั้ง ไม่แตะแคชกลาง**
   */
  const publicQueries = supabaseConfigured
    ? await catalogPublicMapsQueries(db, queries)
    : new Set<string>();

  const cachedRows = new Map<string, CacheRow>();
  if (publicQueries.size > 0) {
    const { data, error: cacheReadErr } = await db
      .from("place_details_cache")
      .select(CACHE_COLUMNS)
      .in("maps_query", [...publicQueries]);
    noteCacheFailure("place_details_cache/read", cacheReadErr);
    for (const row of (data ?? []) as CacheRow[]) cachedRows.set(row.maps_query, row);
  }

  const entries = await Promise.all(
    queries.map(async (q): Promise<[string, PlaceDetailsResponse]> => {
      const row = cachedRows.get(q);
      if (!row) return [q, await resolveFromGoogle(db, q, live, locale)];

      const needsLocalName = locale != null && row.locale !== locale;
      const local = needsLocalName
        ? await backfillLocalName(db, row, locale)
        : { nameLocal: row.name_local, addressLocal: row.address_local };

      const result = rowToResponse(row, local.nameLocal, local.addressLocal);
      if (live) result.currentOpeningHours = await fetchCurrentOpeningHoursLive(q);
      return [q, result];
    })
  );

  return Object.fromEntries(entries);
}
