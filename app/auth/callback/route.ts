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
 * 🔴 **แต่ header นี้ผู้เรียกปลอมได้** จึงใช้ได้เฉพาะตอนอยู่หลัง proxy ที่เราไว้ใจจริง
 * ที่นี่ปลอดภัยเพราะ **ปลายทางถูกบังคับให้เป็น path ภายในด้วย `safeNextPath` อยู่แล้ว**
 * — host ที่ปลอมมาจะได้แค่พาผู้ใช้ไป path ภายในบนโดเมนนั้น ไม่ใช่เอา session ไปที่อื่น
 */
function originOf(request: NextRequest): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (!forwardedHost) return url.origin;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${forwardedHost}`;
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
  const errorCode = searchParams.get("error_code") ?? searchParams.get("error");
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
