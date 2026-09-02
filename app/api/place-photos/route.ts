import { NextRequest, NextResponse } from "next/server";
import { lookupPlace } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { supabaseConfigured } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/auth/server";
import { catalogPublicMapsQueries } from "@/lib/engine/db";
import type { SupabaseClient } from "@supabase/supabase-js";

// เพดานสูงไว้ก่อนเผื่อของเก่า — ตั้งแต่เฟส 19 หน้าแผนรวมคำขอเหลือ 1-2 ครั้งต่อการเปิดหน้า (ดู ?queries=)
const RATE_LIMIT_PER_MINUTE = 300;

/** จำนวนสถานที่สูงสุดต่อ 1 คำขอแบบกลุ่ม — เท่ากับของ /api/place-details */
const MAX_BATCH = 80;

function toPhotoUrls(names: string[]): string[] {
  return names.map((name) => `/api/place-photo?name=${encodeURIComponent(name)}`);
}

/** หา "ชื่อรูป" ของสถานที่หลายที่พร้อมกัน — อ่าน place_photo_cache ทีเดียวด้วย `.in()`
 *  แล้วยิง Google เฉพาะที่ยังไม่เคยแคช (ขนานกัน) */
/**
 * 🔴 **เหตุผลที่ค้นไม่ได้ ต้องเดินทางถึงเบราว์เซอร์ด้วย ไม่ใช่แค่คืนอาเรย์ว่าง** (P2 เจอ · 28 ส.ค. 2026)
 *
 * ก่อนหน้านี้บรรทัด `if (error) return [query, []]` **ทิ้ง `error` ตรงนั้นเลย**
 * → เบราว์เซอร์เห็น `200` + `0 รูป` ซึ่ง **แยกไม่ออกจาก "ค้นแล้วไม่เจอรูปจริง ๆ"**
 * · เกิดจริง: ทรีแพลตฟอร์มไม่มี `GOOGLE_MAPS_API_KEY` → ทุกคีย์คืน 0 รูป **เงียบสนิท**
 *   → P2 สรุปว่า *"คลังไม่มี `googlePlaceId`"* ซึ่งเข้ากับหลักฐานที่มีพอดี **แต่ผิด**
 *   และกว่าจะรู้ต้องไปยิง control บนทริปเกาหลีเทียบ
 *
 * ## ทำไม *ไม่* เปลี่ยนเป็น non-2xx (P2 เสนอ · รับ)
 * ไคลเอนต์อ่าน `d.results ?? {}` — เปลี่ยนเป็น `4xx/5xx` จะไปโดน `.catch()` กลืนอีกแบบหนึ่ง
 * 🎯 **การแก้ที่ทำให้ความเงียบย้ายที่ ไม่ใช่การแก้** → คืน `200` เหมือนเดิม เพิ่มฟิลด์ `errors` ต่างหาก
 * · ไคลเอนต์เดิมที่ไม่รู้จักฟิลด์นี้ทำงานเหมือนเดิมทุกประการ
 */
async function resolveMany(
  db: SupabaseClient,
  queries: string[]
): Promise<{ results: Record<string, string[]>; errors: Record<string, string> }> {
  const cachedNames = new Map<string, string[]>();
  /**
   * 🔴 **แคชได้เฉพาะคิวรีที่พิสูจน์ได้ว่าเป็นของคลังสาธารณะ** (`E3-AC6` · เหมือน `place_details_cache`)
   * ตารางนี้คีย์ด้วย `maps_query` เช่นกัน → สำหรับสถานที่ที่ผู้ใช้เพิ่มเอง มันคือ **ข้อความที่เขาพิมพ์**
   * ⚠️ ไม่ผ่านประตู = ยังตอบผู้ใช้ปกติ **แค่ยิง Google ทุกครั้ง ไม่แตะแคชกลาง**
   */
  const publicQueries = supabaseConfigured
    ? await catalogPublicMapsQueries(db, queries)
    : new Set<string>();

  if (publicQueries.size > 0) {
    const { data, error: cacheReadErr } = await db
      .from("place_photo_cache")
      .select("maps_query, photo_names")
      .in("maps_query", [...publicQueries]);
    noteCacheFailure("place_photo_cache/read", cacheReadErr);
    for (const row of (data ?? []) as { maps_query: string; photo_names: string[] }[]) {
      cachedNames.set(row.maps_query, row.photo_names);
    }
  }

  const failures = new Map<string, string>();
  const entries = await Promise.all(
    queries.map(async (query): Promise<[string, string[]]> => {
      const hit = cachedNames.get(query);
      if (hit) return [query, toPhotoUrls(hit)];

      const { place, error } = await lookupPlace(query, "places.photos");
      if (error) {
        failures.set(query, error);
        return [query, []];
      }

      const photoNames: string[] = place?.photos?.slice(0, 6).map((p) => p.name) ?? [];
      /**
       * 🔴 **route ไม่เขียนแคชอีกต่อไป — และไม่ควรเขียนได้ด้วย** (`Q3` ก้าวที่ 1 · ผู้ใช้ตัดสิน 2 ก.ย. 2026)
       *
       * `route` รันด้วย **ตัวตนของผู้ใช้เอง** (`createServerSupabase()`) → **สิทธิ์อะไรที่ route มี
       * ผู้ใช้มีเท่ากันเสมอ** · ให้ route เขียนแคชได้ = ให้ผู้ใช้ยิง PostgREST ใส่แถวปลอมได้ตรง ๆ
       * และตารางนี้ใช้ร่วมกันทั้งระบบ → **ของปลอมของคนเดียว ทุกคนเห็น**
       *
       * ✅ **ตัวเขียนคืองานเบื้องหลังที่ถือ `service_role` และอยู่นอก `app/`** (`D38`)
       *    จักรวาลของคีย์ = สถานที่ในคลัง ซึ่ง **นับได้และอุ่นล่วงหน้าได้ทั้งหมด**
       *    → ไม่ต้องเดาว่าต้องอุ่นอะไร และผู้ใช้ไม่ต้องมีสิทธิ์เขียนเลยสักบิต
       *
       * ⚠️ **ถอดโค้ดเขียนออกทั้งบล็อก ไม่ได้แค่ปิดด้วยเงื่อนไข** — โค้ดที่เขียนไม่ได้แต่ยัง
       *    หน้าตาเหมือนเขียนได้ คือของที่คนอ่านจะเชื่อว่าแคชถูกเติมจากเส้นนี้
       * 📌 ระหว่างที่งานเบื้องหลังยังไม่มี: **ยิง Google ทุกครั้ง** — เท่ากับพฤติกรรมวันนี้เป๊ะ
       *    เพราะแคชไม่เคยมีสิทธิ์ให้เขียนอยู่แล้ว (`E2-AC11` ยืนยันว่าไม่มีประตูฝั่งไคลเอนต์สักบาน)
       */
      return [query, toPhotoUrls(photoNames)];
    })
  );

  return { results: Object.fromEntries(entries), errors: Object.fromEntries(failures) };
}

// ค้นหาสถานที่ด้วย Places API (New) แล้วคืน "ชื่อรูป" (ไม่ใช่ URL จริง)
// กันไม่ให้ Google API key หลุดไปฝั่ง browser
//
// เช็ค place_photo_cache ใน Supabase ก่อนเสมอ (แคชถาวร ข้าม reload/ข้ามคน) — เจอแล้วไม่ต้องยิง
// Google อีกเลย ต่อเมื่อไม่เจอถึงจะเรียก Google แล้วเก็บผลไว้ในตารางนี้ต่อ
//
// รับได้ 2 แบบเหมือน /api/place-details: `?query=` ทีละที่ · `?queries=a|b|c` ทีเดียวทั้งชุด (เฟส 19)
export async function GET(req: NextRequest) {
  /** 🔴 client ของ *ผู้ใช้* — `D87` ③ ให้สิทธิ์ `authenticated` เท่านั้น · คีย์ `anon` ยังถูก revoke อยู่ */
  const db = await createServerSupabase();
  const limited = rateLimitGuard(req, "place-photos", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const batchParam = req.nextUrl.searchParams.get("queries");
  if (batchParam) {
    const queries = Array.from(
      new Set(batchParam.split("|").map((q) => q.trim()).filter(Boolean))
    ).slice(0, MAX_BATCH);
    if (queries.length === 0) {
      return NextResponse.json({ error: "missing queries" }, { status: 400 });
    }
    const { results, errors } = await resolveMany(db, queries);
    // ส่ง `errors` เฉพาะตอนมีจริง — ไม่งั้นทุกคำขอปกติจะพกฟิลด์ว่างไปด้วย
    return NextResponse.json(
      Object.keys(errors).length > 0 ? { results, errors } : { results }
    );
  }

  const query = req.nextUrl.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }

  const { results, errors } = await resolveMany(db, [query]);
  const reason = errors[query];
  return NextResponse.json(
    reason ? { photos: results[query] ?? [], error: reason } : { photos: results[query] ?? [] }
  );
}
