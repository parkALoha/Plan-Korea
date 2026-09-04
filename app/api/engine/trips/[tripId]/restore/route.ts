import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { restoreTrip } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * กู้ทริปที่ลบไว้ — `POST /api/engine/trips/[tripId]/restore`
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## 🔴 ทำไมเป็น route แยก ไม่ใช่ `PATCH { restore: true }`
 * `PATCH /trips/[tripId]` แก้ **เนื้อของทริปที่มองเห็นอยู่** — และทริปที่ถูกลบ *มองไม่เห็น*
 * (`trips_select` กรองมันออกไปแล้ว) ⇒ ยัดเข้าไปใน `PATCH` จะได้เส้นทางที่ทำงานกับแถวที่
 * ทุกบรรทัดอื่นในไฟล์นั้นเชื่อว่าอ่านได้ · **สองความหมายในเมธอดเดียว = คนอ่านต้องเดา**
 *
 * ## 🔴 `POST` ไม่ใช่ `PUT` — กู้คืนไม่ idempotent โดยตั้งใจ
 * กู้ซ้ำต้องได้ `404` ไม่ใช่ `200` เงียบ ๆ · *"กู้สำเร็จ" ครั้งที่สองที่ไม่มีอะไรเกิดขึ้น
 * อ่านเหมือนครั้งแรก* — และนั่นปิดตาคนเรียกไม่ให้เห็นว่าสถานะไม่ตรงกับที่คิด
 *
 * ⚠️ **ไม่คืนธงทริปแนะนำ** — ถ้าทริปนี้เคยเป็น `ทริปแนะนำ` ตอนถูกลบ ต้องประกาศใหม่
 * (ไคลเอนต์ตั้งเองไม่ได้อยู่แล้ว — `published_template_at` เป็นของ `service_role` เท่านั้น)
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;

  const limited = rateLimitGuard(req, "engine-trip-restore", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });

  const db = await createServerSupabase();
  const { error } = await restoreTrip(db, tripId);
  if (error) {
    const msg = error.message ?? "";
    // `P0002` = ไม่ใช่เจ้าของ **หรือ** ทริปไม่ได้ถูกลบอยู่ — RPC ตั้งใจไม่แยกให้คนนอกรู้
    if (error.code === "P0002") {
      return NextResponse.json({ error: msg || "ไม่พบทริปนี้", code: "NOT_FOUND" }, { status: 404 });
    }
    if (error.code === "42501") {
      return NextResponse.json({ error: msg, code: "42501" }, { status: 403 });
    }
    return NextResponse.json({ error: msg || "กู้ทริปไม่สำเร็จ", code: error.code }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
