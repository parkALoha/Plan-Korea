import { NextRequest, NextResponse } from "next/server";
import { fetchRealTravelTime } from "@/lib/travelProvider";
import { rateLimitGuard } from "@/lib/rateLimit";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { supabaseConfigured } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/auth/server";
import { catalogPublicSlugs } from "@/lib/engine/db";
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

  /**
   * 🔴 **client ของ *ผู้ใช้* ไม่ใช่ client ที่ถือคีย์ `anon`** — `D87` ③ (2 ก.ย. 2026)
   * migration ให้สิทธิ์ `select, insert` กับ **`authenticated` เท่านั้น** (`revoke all … from anon` ยังอยู่)
   * → ถ้ายังใช้ `@/lib/supabase` (คีย์ `anon`) **grant นั้นไม่มีผลเลยสักบรรทัด**
   * · ⚠️ **ผู้เยี่ยมชมที่ไม่ล็อกอินยังเรียก route นี้ได้** — แค่แคชอ่านไม่ได้/เขียนไม่ลง
   *   → เสื่อมเท่าสภาพวันนี้ (ซึ่งล้มทั้งคู่อยู่แล้ว) **ไม่แย่ลง**
   * 🔴 **และตอนนี้ยังไม่มีผลจนกว่า migration จะลงฐาน** — จอดที่ `pending-review/` รอด่านของ P6
   */
  const supabase = await createServerSupabase();

  /**
   * 🔴 **คีย์ต้องเป็น hash — ค่าดิบคือพิกัดที่พัก/UUID ทริป** (`E3-AC6` · ดู `lib/engine/cacheKey.ts`)
   * ไม่มี salt = **ไม่แคชเลย** ไม่ใช่ถอยไปเขียนคีย์ดิบ · เงียบไม่ได้ จึงมี `console.error`
   */
  /**
   * 🔴 **แคชได้ก็ต่อเมื่อ *ทั้งสองปลาย* พิสูจน์ได้ว่าเป็นสถานที่ของคลังสาธารณะ** (`E3-AC6`)
   * `from_place_id` เป็น **คีย์** ของตารางที่ใช้ร่วมกันทั้งระบบ → ค่าที่ไม่สาธารณะ
   * กลายเป็นข้อมูลของทริปหนึ่งที่ทุกคนอ่านได้ทันทีที่ `D87` เปิดสิทธิ์
   * · ของจริงที่ไหลเข้ามาทางนี้: `hotel@<lat>,<lng>` · `custom_places.id`
   *
   * 🎯 **ถามว่า "พิสูจน์ได้ไหมว่าสาธารณะ" ไม่ใช่ "หน้าตาเหมือนของส่วนตัวไหม"**
   * อย่างหลังต้องมีรายการรูปแบบที่ส่วนตัว ซึ่งจะผิด **เงียบ** วันที่มีรูปใหม่
   * 📌 ทางที่ปฏิเสธ: hash คีย์ด้วย salt — ลดระดับได้ **แต่ไม่ปิด** เพราะผู้โจมตีใช้
   *    route นี้เองเป็นเครื่อง hash แล้วเทียบก่อน/หลังในตารางได้ (P4 ชี้ · 2 ก.ย. 2026)
   *    → เลิกทางนั้นแล้ว **อย่าเอากลับมาโดยคิดว่ามันปิดช่อง**
   */
  const publicSlugs = supabaseConfigured
    ? await catalogPublicSlugs(supabase, [originPlaceId, destPlaceId])
    : new Set<string>();
  const canCache =
    supabaseConfigured && publicSlugs.has(originPlaceId) && publicSlugs.has(destPlaceId);

  if (canCache) {
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

  /**
   * 🔴 **route ไม่เขียนแคชอีกต่อไป** (`Q3` ก้าวที่ 1 · ผู้ใช้ตัดสิน 2 ก.ย. 2026)
   * เหตุผลเดียวกับอีกสอง route: **route รันด้วยตัวตนของผู้ใช้ → สิทธิ์ที่ route มี ผู้ใช้มีเท่ากัน**
   *
   * 🔴 **แต่ตารางนี้ต่างจากอีกสองใบ และนั่นคือเหตุผลที่มันอยู่ *ก้าวที่ 2* ไม่ใช่ก้าวที่ 1:**
   * คีย์คือ **คู่** `(ต้นทาง, ปลายทาง, โหมด)` → จักรวาลเป็นกำลังสองของจำนวนสถานที่
   * **อุ่นล่วงหน้าทั้งหมดไม่ได้** ต่างจากอีกสองใบที่คีย์เดียวต่อสถานที่ (นับได้ → อุ่นได้ครบ)
   *
   * ✅ **รูปที่วางไว้สำหรับก้าวที่ 2 — แยก *การขอ* ออกจาก *เนื้อหา*:**
   *    แคชไม่โดน → route ใส่ **คำขอ** (คีย์ล้วน ตรวจกับคลังแล้ว) ลงคิว → ตอบผู้ใช้ด้วยค่าประมาณไปก่อน
   *    งานเบื้องหลังอ่านคิว → ยิง Google → เขียนแคช
   *    🎯 **ผู้ใช้ขอได้ แต่ใส่เนื้อหาไม่ได้** — ซึ่งเป็นสิ่งเดียวที่ต้องกัน
   *
   * 📌 ระหว่างนี้ยิง Google ทุกครั้ง = **พฤติกรรมวันนี้เป๊ะ** เพราะแคชไม่เคยมีสิทธิ์ให้เขียนอยู่แล้ว
   *    (`E2-AC11` ยืนยันกับฐานจริงว่าแคชไม่มีประตูฝั่งไคลเอนต์สักบาน)
   */

  return NextResponse.json({
    durationMinutes: result.durationMinutes,
    distanceMeters: result.distanceMeters,
    isReal: true,
  });
}
