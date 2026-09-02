import { NextRequest, NextResponse } from "next/server";
import { lookupPlace } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { supabase, supabaseConfigured } from "@/lib/supabase";

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
  queries: string[]
): Promise<{ results: Record<string, string[]>; errors: Record<string, string> }> {
  const cachedNames = new Map<string, string[]>();
  if (supabaseConfigured) {
    const { data, error: cacheReadErr } = await supabase
      .from("place_photo_cache")
      .select("maps_query, photo_names")
      .in("maps_query", queries);
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
      if (supabaseConfigured && photoNames.length > 0) {
        const { error: cacheWriteErr } = await supabase.from("place_photo_cache").upsert({
          maps_query: query,
          photo_names: photoNames,
          fetched_at: new Date().toISOString(),
        },
      {
        /**
         * 🔴 **`ignoreDuplicates: true` = `ON CONFLICT DO NOTHING` → ต้องการแค่สิทธิ์ `insert`**
         * `D87` ③ (ผู้ใช้เลือกเอง 2 ก.ย. 2026): **เขียนได้ ทับไม่ได้** → `authenticated` ไม่มี `update`
         * · `upsert` แบบเดิมต้องการ `update` เมื่อชนคีย์ → **จะได้ 403 ทุกครั้งที่แคชมีอยู่แล้ว**
         * 🎯 *"คนแรกเขียน แล้วไม่มีใครทับได้"* จึงไม่ใช่แค่นโยบายในฐาน — **บรรทัดนี้คือที่ที่มันเป็นจริง**
         */
        ignoreDuplicates: true,
      },
    );
        noteCacheFailure("place_photo_cache/write", cacheWriteErr);
      }
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
    const { results, errors } = await resolveMany(queries);
    // ส่ง `errors` เฉพาะตอนมีจริง — ไม่งั้นทุกคำขอปกติจะพกฟิลด์ว่างไปด้วย
    return NextResponse.json(
      Object.keys(errors).length > 0 ? { results, errors } : { results }
    );
  }

  const query = req.nextUrl.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }

  const { results, errors } = await resolveMany([query]);
  const reason = errors[query];
  return NextResponse.json(
    reason ? { photos: results[query] ?? [], error: reason } : { photos: results[query] ?? [] }
  );
}
