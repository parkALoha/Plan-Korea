import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";
import { peekTripInvite } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ดูว่าลิงก์เชิญนี้ชวนไปไหน — `POST /api/engine/invites/peek`
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## 🔴 `POST` ทั้งที่เป็นการ "อ่าน" — และนั่นคือเหตุผลทั้งหมด
 * โทเคนเป็น **ความลับที่ให้สิทธิ์เขียนทริป** ⇒ **ห้ามอยู่ใน URL**
 * URL ไปโผล่ที่: log ของเซิร์ฟเวอร์ · ประวัติเบราว์เซอร์ · `Referer` ที่ส่งไปเว็บอื่น · บุ๊กมาร์กที่แชร์กัน
 * 🎯 ***`GET` ที่ถูกหลัก REST แต่ทำให้ความลับรั่วออกไปสี่ทาง แพ้ `POST` ที่ "ผิดหลัก" แต่ไม่รั่ว***
 * · ⚠️ ตัวลิงก์ที่ผู้ใช้กด (`/invite/<token>`) **ยังมีโทเคนใน URL อยู่ดี** — เลี่ยงไม่ได้ มันคือวิธีส่งต่อ
 *   ⇒ ข้อนี้ลด *จำนวนที่ที่มันไปโผล่* ไม่ได้ทำให้เป็นศูนย์ · **อย่าอ่านว่าโทเคนปลอดภัยแล้ว**
 *
 * ## 🔴 ไม่มีด่านล็อกอิน — ตั้งใจ (ต้องอยู่ใน `PUBLIC_PATHS` ของ `proxy.ts` ด้วย)
 * คนกดลิงก์ยังไม่มีบัญชี **ต้องรู้ว่ากำลังจะรับอะไรก่อนตัดสินใจสมัคร**
 * · RPC คืนแค่ `trip_title · inviter_name · role · expired` — 🔴 **ไม่มี `trip_id`**
 *   ⇒ ถือลิงก์แล้วยังยิง endpoint อื่นของทริปไม่ได้ · เห็นแผนต้องกดรับและล็อกอิน
 *
 * ## ⚠️ `rateLimitGuard` แคบกว่าเส้นอื่น **เพราะเส้นนี้เดาโทเคนได้**
 * ไม่มีด่านล็อกอิน + รับค่าที่ถ้าเดาถูกจะได้ข้อมูล ⇒ เป็นเส้นเดียวในระบบที่ *brute force มีความหมาย*
 * · โทเคน 256 บิตทำให้เดาไม่ไหวอยู่แล้ว — **ข้อนี้เป็นชั้นที่สอง ไม่ใช่ชั้นแรก**
 */
const RATE_LIMIT_PER_MINUTE = 20;

export async function POST(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-invite-peek", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  let body: { token?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  // 🔴 ตรวจรูปก่อนถึงฐาน — โทเคนของเราเป็น hex 64 ตัวเสมอ · ค่าที่ผิดรูปไม่มีทางตรงกับอะไร
  //    ⇒ ตัดทิ้งที่นี่ = ไม่เปลืองคำขอไปฐาน และไม่ให้คนยิงสุ่มใช้เราเป็นตัววัดว่าอะไร "เกือบถูก"
  if (typeof body?.token !== "string" || !/^[0-9a-f]{64}$/.test(body.token)) {
    return NextResponse.json({ error: "ลิงก์นี้ใช้ไม่ได้", code: "NOT_FOUND" }, { status: 404 });
  }

  const db = await createServerSupabase();
  const { data, error } = await peekTripInvite(db, body.token);
  if (error) {
    // ⚠️ **ทุกความล้มเหลวตอบ 404 เหมือนกันหมด** — ไม่บอกว่า "มีลิงก์นี้แต่หมดอายุ" ให้คนสุ่มรู้
    //    (สถานะหมดอายุบอกได้ *หลัง* โทเคนถูกต้องแล้วเท่านั้น — นั่นคือช่อง `expired` ข้างล่าง)
    if (error.code === "P0002") {
      return NextResponse.json({ error: "ลิงก์นี้ใช้ไม่ได้", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
  }

  const row = (data ?? [])[0];
  if (!row) {
    return NextResponse.json({ error: "ลิงก์นี้ใช้ไม่ได้", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json(
    { tripTitle: row.trip_title, inviterName: row.inviter_name, role: row.role, expired: row.expired },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
