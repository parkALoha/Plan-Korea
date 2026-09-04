import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { setTripPinned } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ปัก/ถอนหมุดทริป — `PUT /api/engine/trips/[tripId]/pin`
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้สั่งเอง (เรฟ redesign หน้าแรก ข้อ 4)
 *
 * ## 🔴 เป็น **มุมมองส่วนตัว** ไม่ใช่คุณสมบัติของทริป
 * เก็บที่ `trip_members.pinned_at` ของผู้เรียก ⇒ Alice ปักแล้ว Bob ไม่เห็น
 * · **ใครที่เป็นสมาชิกก็ปักได้ ไม่ต้องเป็น owner** — ต่างจาก `PATCH /trips/[tripId]` ที่แก้ตัวทริป
 * 🎯 ***สองเส้นนี้อยู่ใต้ `[tripId]` เหมือนกัน แต่ระดับสิทธิ์ต่างกันคนละชั้น*** — และความต่างนั้น
 *    ไม่มีอะไรใน path บอก ⇒ เขียนไว้ตรงนี้ เพราะคนที่มาเพิ่มเส้นที่สามจะอ่านไฟล์นี้ก่อน
 *
 * ## ⚠️ เขียนผ่าน RPC เท่านั้น — ห้ามเปลี่ยนเป็น `update` ตรง
 * เหตุผล (ช่องยกระดับสิทธิ์จริง ไม่ใช่ความระมัดระวังลอย ๆ) อยู่ที่ `lib/engine/db.ts` → `setTripPinned`
 * และ `supabase-platform/…/20260904140000_e5_pin_trip.sql` · **migration มี assert ที่จะแดงถ้ามีคนเผลอเปิด**
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;

  const limited = rateLimitGuard(req, "engine-pin", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });

  let body: { pinned?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "body ต้องเป็นอ็อบเจกต์" }, { status: 400 });
  }
  // 🔴 ต้องเป็น boolean แท้ ๆ — ไม่รับ `"true"`/`1` เพราะค่าที่แปลงให้เงียบ ๆ
  //    ทำให้ฝั่งเรียกที่ส่งผิดชนิด **ไม่มีวันรู้ว่าตัวเองส่งผิด**
  if (typeof body.pinned !== "boolean") {
    return NextResponse.json({ error: "pinned ต้องเป็น true หรือ false" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { error } = await setTripPinned(db, tripId, body.pinned);
  if (error) {
    const msg = error.message ?? "";
    // RPC โยน `P0002` เมื่อผู้เรียกไม่ได้เป็นสมาชิกทริปนี้ — เป็น `404` ไม่ใช่ `502`
    // ⚠️ **ไม่ใช่ `403`** — เราไม่ยืนยันว่าทริปนี้มีอยู่จริงให้คนนอกรู้ · ไม่พบ = ไม่พบ
    if (error.code === "P0002" || /ไม่พบทริปนี้/.test(msg)) {
      return NextResponse.json({ error: msg || "ไม่พบทริปนี้", code: "NOT_FOUND" }, { status: 404 });
    }
    if (error.code === "42501") {
      return NextResponse.json({ error: msg, code: "42501" }, { status: 403 });
    }
    return NextResponse.json({ error: msg || "ปักหมุดไม่สำเร็จ", code: error.code }, { status: 502 });
  }

  return NextResponse.json(
    { ok: true, pinned: body.pinned },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
