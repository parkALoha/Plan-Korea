import { NextRequest, NextResponse } from "next/server";
import { lookupPlace } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";
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
async function resolveMany(queries: string[]): Promise<Record<string, string[]>> {
  const cachedNames = new Map<string, string[]>();
  if (supabaseConfigured) {
    const { data } = await supabase
      .from("place_photo_cache")
      .select("maps_query, photo_names")
      .in("maps_query", queries);
    for (const row of (data ?? []) as { maps_query: string; photo_names: string[] }[]) {
      cachedNames.set(row.maps_query, row.photo_names);
    }
  }

  const entries = await Promise.all(
    queries.map(async (query): Promise<[string, string[]]> => {
      const hit = cachedNames.get(query);
      if (hit) return [query, toPhotoUrls(hit)];

      const { place, error } = await lookupPlace(query, "places.photos");
      if (error) return [query, []];

      const photoNames: string[] = place?.photos?.slice(0, 6).map((p) => p.name) ?? [];
      if (supabaseConfigured && photoNames.length > 0) {
        await supabase.from("place_photo_cache").upsert({
          maps_query: query,
          photo_names: photoNames,
          fetched_at: new Date().toISOString(),
        });
      }
      return [query, toPhotoUrls(photoNames)];
    })
  );

  return Object.fromEntries(entries);
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
    return NextResponse.json({ results: await resolveMany(queries) });
  }

  const query = req.nextUrl.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }

  const results = await resolveMany([query]);
  return NextResponse.json({ photos: results[query] ?? [] });
}
