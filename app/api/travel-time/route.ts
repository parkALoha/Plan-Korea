import { NextRequest, NextResponse } from "next/server";
import { fetchRealTravelTime } from "@/lib/travelProvider";
import { rateLimitGuard } from "@/lib/rateLimit";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { TRAVEL_MODES, type TravelMode } from "@/lib/schedule";

// ยิงเป็นชุดตอนเปิดหน้าแผน (1 ครั้งต่อคู่จุดที่เลือกโหมดแล้ว) — เผื่อไว้สำหรับทริปที่จุดแวะแน่นกว่านี้
const RATE_LIMIT_PER_MINUTE = 150;

// คำนวณเวลาเดินทางจริงระหว่าง 2 จุด ผ่าน Routes API (New)
// เช็ค travel_time_cache ใน Supabase ก่อนเสมอ (แคชถาวร คู่จุด+โหมดในทริปคงที่) เจอแล้วไม่ยิง Google ซ้ำ
// ใช้ key ฝั่งเซิร์ฟเวอร์เท่านั้น
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "travel-time", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const originPlaceId = req.nextUrl.searchParams.get("originPlaceId");
  const destPlaceId = req.nextUrl.searchParams.get("destPlaceId");
  const originLat = req.nextUrl.searchParams.get("originLat");
  const originLng = req.nextUrl.searchParams.get("originLng");
  const destLat = req.nextUrl.searchParams.get("destLat");
  const destLng = req.nextUrl.searchParams.get("destLng");
  const mode = req.nextUrl.searchParams.get("mode") as TravelMode | null;

  if (!originPlaceId || !destPlaceId || !originLat || !originLng || !destLat || !destLng) {
    return NextResponse.json({ error: "missing coordinates" }, { status: 400 });
  }
  if (!mode || !TRAVEL_MODES.includes(mode)) {
    return NextResponse.json({ error: "missing or invalid mode" }, { status: 400 });
  }

  if (supabaseConfigured) {
    const { data: cached, error: cacheReadErr } = await supabase
      .from("travel_time_cache")
      .select("duration_minutes, distance_meters")
      .eq("from_place_id", originPlaceId)
      .eq("to_place_id", destPlaceId)
      .eq("travel_mode", mode)
      .maybeSingle();
    noteCacheFailure("travel_time_cache/read", cacheReadErr);
    if (cached) {
      return NextResponse.json({
        durationMinutes: cached.duration_minutes,
        distanceMeters: cached.distance_meters,
        isReal: true,
      });
    }
  }

  const result = await fetchRealTravelTime(
    { lat: parseFloat(originLat), lng: parseFloat(originLng) },
    { lat: parseFloat(destLat), lng: parseFloat(destLng) },
    mode
  );

  if (!result) {
    // Google ไม่มีเส้นทางให้โหมดนี้ (พบบ่อยกับเดิน/ขับรถในเกาหลีใต้) — ให้ผู้เรียก fallback เป็นประมาณการ
    return NextResponse.json({ durationMinutes: null, isReal: false });
  }

  if (supabaseConfigured) {
    const { error: cacheWriteErr } = await supabase.from("travel_time_cache").upsert({
      from_place_id: originPlaceId,
      to_place_id: destPlaceId,
      travel_mode: mode,
      duration_minutes: result.durationMinutes,
      distance_meters: result.distanceMeters,
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
    noteCacheFailure("travel_time_cache/write", cacheWriteErr);
  }

  return NextResponse.json({
    durationMinutes: result.durationMinutes,
    distanceMeters: result.distanceMeters,
    isReal: true,
  });
}
