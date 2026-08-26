import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";
import { systemMode } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * โหมดของทั้งระบบ — `E3-AC7` · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## 🔴 เส้นเดียวใน `app/api/engine/` ที่ **ไม่บังคับล็อกอิน** — และตั้งใจ
 * ทุกเส้นอื่นเดิน `rateLimitGuard → getUser() (401) → …` · **ที่นี่ไม่มี `getUser()`**
 * เพราะข้อ ③ ของ P7: *"ธงต้องขับ banner ตอน **โหลด** ไม่ใช่ตอน **เขียนพลาด**"*
 * → หน้า `/login` และคนที่เซสชันหมดอายุระหว่าง cutover **ต้องเห็นเหมือนกัน**
 *
 * ⚠️ **มันจะเป็นข้อยกเว้นของด่านที่ P4 *วางแผนไว้* — ซึ่งยังไม่มีอยู่จริงวันนี้**
 *    (*"ไล่ไฟล์ `app/api/engine/** /route.ts` จากดิสก์ แล้วยิงทุกเส้นแบบไม่ล็อกอิน ต้องได้ `401`"*
 *    เขียนไว้เป็นข้อตกลงในคอมเมนต์ของ `custom-places/route.ts` · **ยังไม่ได้เขียนเป็นเคส** — ตรวจแล้ว)
 * 🔴 **จดไว้ตรงนี้เพราะวันที่ด่านนั้นถูกเขียน มันจะแดงใส่ไฟล์นี้ทันที และเป็นความตั้งใจ ไม่ใช่บั๊ก**
 *    — **ถ้าแดงเพราะเส้นนี้ ให้แก้ด่านให้รู้จักข้อยกเว้น ไม่ใช่ใส่ `getUser()` ที่นี่**
 *    เพราะการใส่ `getUser()` จะทำให้ **คนที่เซสชันหมดอายุระหว่าง cutover มองไม่เห็น banner**
 *    ซึ่งเป็นคนกลุ่มเดียวที่ข้อ ③ ของ P7 มีไว้เพื่อเขาโดยเฉพาะ · แจ้ง P4 แล้ว
 *
 * ## ทำไมไม่ให้ไคลเอนต์เรียก RPC ตรง ทั้งที่ `anon` มีสิทธิ์
 * `E3-AC1` — โค้ดที่รันฝั่งเบราว์เซอร์ไม่คุยกับฐานเลยสักเส้น · ไม่มีข้อยกเว้นแม้เส้นที่ไม่มีความลับ
 * **เส้นแบ่งที่มีข้อยกเว้น คือเส้นแบ่งที่ต้องอธิบายทุกครั้งที่มีคนอ่าน**
 *
 * ## 🔴 ไม่แคชเด็ดขาด
 * ค่านี้เปลี่ยนตอน ops กดสวิตช์ **และนาทีที่มันเปลี่ยนคือนาทีที่ผู้ใช้ต้องรู้**
 * `s-maxage` แม้ 10 วินาทีก็แปลว่ามีคนพิมพ์ต่อไปอีก 10 วินาทีโดยไม่รู้
 */
const RATE_LIMIT_PER_MINUTE = 240;

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-system-mode", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const db = await createServerSupabase();
  const { data, error } = await systemMode(db);
  if (error) {
    // 🔴 อ่านธงไม่ได้ **ไม่ใช่** "ระบบปกติ" — ผู้เรียกต้องแยกสองอย่างนี้ออก
    //    คืน `unknown` ไม่ใช่ `readOnly: false` เพราะอย่างหลังคือการเดาแทนผู้ใช้
    return NextResponse.json(
      { error: error.message, unknown: true },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
  const row = (data as { read_only: boolean; reason: string | null }[] | null)?.[0];
  return NextResponse.json(
    { readOnly: row?.read_only ?? false, reason: row?.reason ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
