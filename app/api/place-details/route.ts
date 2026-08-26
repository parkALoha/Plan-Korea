import { NextRequest, NextResponse } from "next/server";
import { lookupPlace, type GoogleOpeningHours, type GoogleReview } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";
import { knownPlaceLocales } from "@/lib/engine/countries";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { supabase, supabaseConfigured } from "@/lib/supabase";

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
async function backfillLocalName(row: CacheRow, locale: Locale) {
  const fresh = await fetchLocalName(row.maps_query, locale);
  if (fresh.nameLocal && supabaseConfigured) {
    const { error: backfillErr } = await supabase
      .from("place_details_cache")
      .update({ name_local: fresh.nameLocal, address_local: fresh.addressLocal, locale })
      .eq("maps_query", row.maps_query);
    noteCacheFailure("place_details_cache/backfill", backfillErr);
  }
  return fresh;
}

/** ยิง Google ใหม่ทั้งชุดสำหรับสถานที่ที่ยังไม่เคยแคช แล้วเก็บลง place_details_cache */
async function resolveFromGoogle(
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
    };
  }

  const googlePlaceId = place?.id ?? null;
  const openingHours = place?.regularOpeningHours ?? null;
  const rating = place?.rating ?? null;
  const userRatingCount = place?.userRatingCount ?? null;
  const primaryType = place?.primaryTypeDisplayName?.text ?? null;
  const reviews = place?.reviews?.slice(0, 3) ?? null;
  const local = locale ? await fetchLocalName(query, locale) : { nameLocal: null, addressLocal: null };

  if (supabaseConfigured && googlePlaceId) {
    const { error: cacheWriteErr } = await supabase.from("place_details_cache").upsert({
      maps_query: query,
      google_place_id: googlePlaceId,
      opening_hours: openingHours,
      rating,
      user_rating_count: userRatingCount,
      primary_type: primaryType,
      reviews,
      name_local: local.nameLocal,
      address_local: local.addressLocal,
      locale: local.nameLocal ? locale : null,
      fetched_at: new Date().toISOString(),
    });
    noteCacheFailure("place_details_cache/write", cacheWriteErr);
  }

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
    const results = await resolveMany(queries, locale);
    return NextResponse.json({ results });
  }

  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }

  const results = await resolveMany([query], locale, live);
  return NextResponse.json(results[query]);
}

/** แกนกลางที่ใช้ร่วมกันทั้งแบบเดี่ยวและแบบกลุ่ม — อ่านแคชทีเดียวด้วย `.in()` แล้วยิง Google เฉพาะที่ยังไม่มี */
async function resolveMany(
  queries: string[],
  locale: Locale | null,
  live = false
): Promise<Record<string, PlaceDetailsResponse>> {
  const cachedRows = new Map<string, CacheRow>();
  if (supabaseConfigured) {
    const { data, error: cacheReadErr } = await supabase
      .from("place_details_cache")
      .select(CACHE_COLUMNS)
      .in("maps_query", queries);
    noteCacheFailure("place_details_cache/read", cacheReadErr);
    for (const row of (data ?? []) as CacheRow[]) cachedRows.set(row.maps_query, row);
  }

  const entries = await Promise.all(
    queries.map(async (q): Promise<[string, PlaceDetailsResponse]> => {
      const row = cachedRows.get(q);
      if (!row) return [q, await resolveFromGoogle(q, live, locale)];

      const needsLocalName = locale != null && row.locale !== locale;
      const local = needsLocalName
        ? await backfillLocalName(row, locale)
        : { nameLocal: row.name_local, addressLocal: row.address_local };

      const result = rowToResponse(row, local.nameLocal, local.addressLocal);
      if (live) result.currentOpeningHours = await fetchCurrentOpeningHoursLive(q);
      return [q, result];
    })
  );

  return Object.fromEntries(entries);
}
