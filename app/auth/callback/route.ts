import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/nextPath";

/**
 * ทางกลับหลังล็อกอิน — เจ้าของ: P1-Lead (E1)
 *
 * 🔴 **ไม่มีไฟล์นี้ = ล็อกอินไม่มีวันสำเร็จ ทั้ง Google และ magic link**
 * ทั้งสองทางจบด้วยการที่ Supabase เด้งผู้ใช้กลับมาที่นี่พร้อม `?code=…`
 * แล้ว **ต้องมีใครสักคนแลก code เป็น session แล้วเขียนลงคุกกี้** ไม่งั้นผู้ใช้จะกลับมาถึงเว็บ
 * ในสภาพ "ยังไม่ล็อกอิน" ทั้งที่เพิ่งกรอกรหัสผ่านมาสำเร็จ
 *
 * ⚠️ **ต้องเป็น Route Handler เท่านั้น ไม่ใช่ Server Component** — Next 16 อนุญาตให้เขียนคุกกี้
 * ได้เฉพาะใน Server Function / Route Handler (HTTP ตั้งคุกกี้หลังสตรีมเริ่มแล้วไม่ได้)
 * ดู `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
 */

/**
 * โดเมนที่จะเด้งกลับไป
 *
 * ⚠️ บน Vercel `request.url` เป็น host ภายใน ไม่ใช่โดเมนที่ผู้ใช้เห็น → ต้องอ่าน `x-forwarded-host`
 *
 * 🔴 **เหตุผลที่ปลอดภัย — แก้ 24 ส.ค. 2026 ตามที่ P4 (`S2`) ชี้ว่าฉบับแรกให้เหตุผลผิด:**
 * ฉบับแรกเขียนว่า *"ปลอดภัยเพราะ `safeNextPath` บังคับให้เป็น path ภายใน"* — **ไม่จริง**
 * `safeNextPath` คุม **path** · `x-forwarded-host` คือ **host** · คนละตัวกันคนละชั้น
 * ปลอม header สำเร็จเมื่อไหร่ ปลายทางคือ `https://evil.example/<path ภายในที่ถูกต้องทุกประการ>`
 * → **การบังคับ path ไม่ได้กันอะไรเลยในทิศนี้**
 *
 * เหตุผลจริงที่ทำให้ยังรับได้วันนี้ มี 2 ข้อ และทั้งคู่**เป็นเงื่อนไขของสภาพแวดล้อม ไม่ใช่ของโค้ดนี้**:
 *   ① เบราว์เซอร์ของเหยื่อ **ตั้ง `x-forwarded-host` ข้ามโดเมนเองไม่ได้** — คนยิงได้แค่ redirect ตัวเอง
 *   ② Vercel **เขียนทับ header นี้เองที่ขอบเครือข่าย** ค่าที่ปลอมมาจึงไปไม่ถึงโค้ดนี้
 * 🔴 **ข้อ ② หายไปทันทีถ้าย้ายออกจาก Vercel** — วันนั้นต้องมี allowlist ของ host ที่ยอมรับ
 * **อย่าอ่านย่อหน้านี้ว่า "กันไว้แล้ว" — มันแปลว่า "ยังไม่โดนเพราะสภาพแวดล้อม"**
 */
function originOf(request: NextRequest): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (!forwardedHost) return url.origin;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${forwardedHost}`;
}

/**
 * รหัสข้อผิดพลาดที่ยอมให้ส่งต่อไปที่ `/login` — ค่าที่ไม่รู้จักกลายเป็น `"unknown"`
 *
 * 🔴 **S3 (P4 ชี้ 24 ส.ค. 2026):** ฉบับแรกส่ง `?error=` ต่อไปดิบ ๆ · ใครยิง `?error=<อะไรก็ได้>`
 * ก็ได้ค่านั้นไปโผล่ที่ URL ของหน้า `/login`
 * ที่ไม่ระเบิดคือ `app/login/page.tsx` **เทียบกับ whitelist ของมันเองก่อนใช้** — ไม่ได้เอาไป render
 *
 * 🎯 **แปลว่าความปลอดภัยของไฟล์นี้ ไปแขวนอยู่กับบรรทัดในไฟล์ของคนอื่น ที่ไม่มีอะไรผูกไว้กับกันเลย**
 * วันที่ P2 เปลี่ยนเป็น `แสดงข้อผิดพลาด: {errorCode}` ซึ่งเป็นสิ่งที่ทำกันปกติ **ช่องเปิดทันที**
 * และคอมเมนต์ฝั่งนี้จะยังอ่านว่ากันไว้แล้ว — **`D46` ที่ผมอ้างเองใน `nextPath.ts` เป๊ะ**
 * → กรองที่นี่ด้วย **ค่าที่ออกจากไฟล์นี้จึงมีจำนวนจำกัดและรู้ล่วงหน้าทั้งหมด**
 */
const KNOWN_ERROR_CODES = new Set([
  "otp_expired", // magic link หมดอายุ — เคสที่พบบ่อยที่สุด
  "link_expired",
  "access_denied", // ผู้ใช้กด "ไม่อนุญาต" ที่หน้า Google
  "server_error",
  "missing_code",
  "exchange_failed",
]);

function knownErrorCode(raw: string | null): string | null {
  if (!raw) return null;
  return KNOWN_ERROR_CODES.has(raw) ? raw : "unknown";
}

function backToLogin(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/login", originOf(request));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"));

  // ① Supabase ส่ง error กลับมาเอง — เคสที่พบบ่อยที่สุดคือลิงก์ magic link หมดอายุ
  //    (`error=access_denied&error_code=otp_expired`) · ส่งต่อให้ `/login` แสดงข้อความที่ P2 เตรียมไว้
  //    🔴 ส่งต่อเฉพาะ **รหัส** ไม่ส่ง `error_description` เพราะมันเป็นข้อความอิสระจากภายนอก
  //       ที่จะไปโผล่บนหน้าเว็บเรา — ไม่มีเหตุผลให้ปลายทางเขียนข้อความบนหน้าจอผู้ใช้ของเรา
  const errorCode = knownErrorCode(searchParams.get("error_code") ?? searchParams.get("error"));
  if (errorCode) {
    return backToLogin(request, { error: errorCode, next });
  }

  // ② ไม่มี code และไม่มี error = มีคนเปิด URL นี้ตรง ๆ · ไม่ใช่ความผิดพลาดของผู้ใช้ แต่ก็ไปต่อไม่ได้
  const code = searchParams.get("code");
  if (!code) {
    return backToLogin(request, { error: "missing_code", next });
  }

  // ③ แลก code เป็น session — ขั้นนี้เองที่เขียนคุกกี้ผ่าน `setAll` ใน `createServerSupabase()`
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // 🔴 ไม่ส่ง `error.message` ต่อไปที่ URL — ข้อความจากชั้น auth บอกรายละเอียดกลไกภายใน
    //    ซึ่งไม่ช่วยผู้ใช้และช่วยคนที่กำลังลองยิงมั่ว · ให้รหัสกลาง ๆ ที่ `/login` แปลเป็นภาษาคนเอง
    return backToLogin(request, { error: "exchange_failed", next });
  }

  return NextResponse.redirect(new URL(next, originOf(request)));
}
