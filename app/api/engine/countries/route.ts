import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { listSupportedCountries } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * รายชื่อประเทศที่รองรับ — ขั้นแรกของ picker "เลือกประเทศ → เลือกเมือง" (`E5`)
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026 · ขอโดย P2 สำหรับ `TripDestinationPicker`
 *
 * ลำดับเดียวกับ route อื่นทุกตัว: `rateLimitGuard → getUser() → createServerSupabase() → db`
 * **ไม่มีบรรทัดไหนกรองสิทธิ์เอง** — คลังเป็นข้อมูลสาธารณะที่ `authenticated` มี `select` อยู่แล้ว (`D38`)
 *
 * 🔴 **ไม่มี `limit` โดยตั้งใจ — และนั่นคือความต่างจาก `/cities` ไม่ใช่ของที่ลืม**
 * ประเทศเป็นข้อมูล**ปลายปิด** (วันนี้ 4) · เมืองเป็นข้อมูล**ปลายเปิด** (โตขึ้นทุกครั้งที่ seed)
 * · ใส่ `limit` ที่นี่จะสร้างกับดักเดียวกับที่ `/cities` มี: **ตัดหลังเรียง = ของท้ายลิสต์หายเงียบ**
 *   ซึ่งที่ชั้นประเทศแปลว่า **"ประเทศนั้นไม่มีในระบบ"** ในสายตาผู้ใช้ ทั้งที่มี
 *
 * 🔴 **`supported = true` กรองในฐาน ไม่ใช่ที่นี่ และไม่ใช่ฝั่ง UI**
 * ผู้ใช้สั่งว่าจุดหมาย *"ต้องอยู่ในลิสของเรา"* — ถ้ากรองฝั่ง UI ลิสต์จริงยังเปิดอยู่
 * · และถ้า hardcode รายชื่อในโค้ด มันจะหลุดจากคลังทันทีที่มีคนเพิ่มประเทศที่ 5 (`D48`)
 *
 * ⚠️ **ต้องรัน migration `20260828001500` ก่อน** ไม่งั้นตอบ 502 (`column ... does not exist`)
 * · route นี้ใหม่ทั้งอัน วันนี้ยังตอบ 404 อยู่ → **ไม่มีอะไรที่เคยทำงานแล้วพังเพราะไฟล์นี้**
 *   (ต่างจาก `fad69d0` ที่ผมแก้ `select` ของเส้นทางที่คนใช้อยู่ ก่อนฐานจะมีคอลัมน์ → 502 ทั้งเว็บ)
 */
const RATE_LIMIT_PER_MINUTE = 60;

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-countries", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  try {
    const db = await createServerSupabase();
    const { data, error } = await listSupportedCountries(db);
    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    // เปลี่ยนน้อยที่สุดในระบบ แต่ผลผูกกับตัวตนผู้เรียก (ต้องล็อกอิน) → `private` ไม่ใช่ `public`
    // ⚠️ อายุสั้นกว่าที่ข้อมูลสมควรได้ **โดยตั้งใจ** — เปิดประเทศใหม่แล้วต้องเห็นภายในนาที
    //    ไม่ใช่รอผู้ใช้ล้างแคช · แคชที่ยาวเกินทำให้ "เพิ่มแล้วไม่ขึ้น" อ่านเหมือนของพัง
    return NextResponse.json(data ?? [], {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "อ่านรายชื่อประเทศไม่ได้" },
      { status: 502 },
    );
  }
}
