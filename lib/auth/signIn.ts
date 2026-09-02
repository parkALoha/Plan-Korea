import { createBrowserSupabase } from "@/lib/auth/browser";
import { clearDeviceData } from "@/lib/auth/deviceData";
import { safeNextPath } from "@/lib/auth/nextPath";

/**
 * 2 ทางเข้าของ E1 (`D42`) — เจ้าของ: P1-Lead · ใช้โดยหน้า `/login` ของ P2
 *
 * signature ตรงกับฟังก์ชันหลอกที่ P2 เว้นไว้เป๊ะ **เพื่อให้สลับเข้าของจริงโดยไม่ต้องแก้ UI สักบรรทัด**
 * (`mockSignInWithGoogle` → `signInWithGoogle` · `mockSendMagicLink` → `sendMagicLink`)
 *
 * 🔴 **ทั้งสองทางกลับมาที่ `/auth/callback` เสมอ** ซึ่งเป็นที่เดียวที่แลก code เป็น session ได้
 * ถ้าใครเปลี่ยนปลายทางตรงนี้ให้ชี้ไปหน้าอื่น **ล็อกอินจะสำเร็จแล้วผู้ใช้กลับมาในสภาพไม่ได้ล็อกอิน**
 */

export type GoogleResult = { ok: true } | { ok: false; error: string };
export type MagicLinkResult = { ok: true } | { ok: false; error: "send-failed" };

/**
 * ที่อยู่ที่จะให้ Supabase เด้งกลับมาหลังยืนยันตัวตนเสร็จ
 *
 * ⚠️ `next` ผ่าน `safeNextPath` **ตั้งแต่ก่อนส่งออกไป** — ตัวเดียวกับที่ `/auth/callback` ใช้ตรวจซ้ำ
 * ตรวจ 2 รอบด้วยฟังก์ชันเดียวกันโดยตั้งใจ: รอบนี้กันไม่ให้ค่าสกปรกออกจากเว็บเราไปเลย
 * รอบที่ callback กันกรณีที่มีคนยิงเข้ามาตรง ๆ โดยไม่ผ่านหน้านี้
 */
function callbackUrl(next?: string | null): string {
  const url = new URL("/auth/callback", window.location.origin);
  const safe = safeNextPath(next);
  if (safe !== "/") url.searchParams.set("next", safe);
  return url.toString();
}

/**
 * เข้าด้วย Google — ฟังก์ชันนี้ **พาเบราว์เซอร์ออกจากหน้าไปเลย** ถ้าสำเร็จ
 * `{ ok: true }` จึงแปลว่า "เริ่มเดินทางแล้ว" ไม่ใช่ "ล็อกอินเสร็จแล้ว"
 */
export async function signInWithGoogle(next?: string | null): Promise<GoogleResult> {
  try {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch {
    // ยังไม่ได้ตั้ง env → `createBrowserSupabase` โยน · ผู้ใช้ไม่ได้ทำอะไรผิด
    return { ok: false, error: "ยังตั้งค่าระบบล็อกอินไม่เสร็จ" };
  }
}

/**
 * ส่ง magic link ไปที่อีเมล
 *
 * 🔴 **`{ ok: true }` ไม่ได้แปลว่าอีเมลนั้นมีอยู่จริง** — Supabase ตอบสำเร็จเหมือนกันหมด
 * ไม่ว่าอีเมลนั้นจะเคยสมัครไว้หรือไม่ **โดยตั้งใจ** เพื่อไม่ให้ใครใช้หน้านี้ไล่เดาว่าใครเป็นสมาชิก
 * → ข้อความบนหน้าจอต้องเป็น *"ถ้าอีเมลนี้ใช้ได้ ลิงก์จะถูกส่งไป"* **ห้ามเขียนว่า "ส่งไปแล้วแน่นอน"**
 */
export async function sendMagicLink(email: string, next?: string | null): Promise<MagicLinkResult> {
  try {
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl(next) },
    });
    if (error) return { ok: false, error: "send-failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "send-failed" };
  }
}

/**
 * ออกจากระบบ แล้วให้ผู้เรียกพาไปหน้าไหนต่อเอง
 *
 * 🔴 **ล้างแคชท้องถิ่น *ก่อน* `auth.signOut()` ไม่ใช่หลัง** (P2 ชี้ · 28 ส.ค. 2026)
 * `auth.signOut()` ยิงเน็ต → **ออฟไลน์แล้วมันโยน** → ถ้าล้างทีหลัง การล้างจะไม่เกิดเลย
 * · **การล้างแคชท้องถิ่นไม่ต้องพึ่งเน็ต จึงควรทำให้สำเร็จก่อนเสมอ**
 * 🎯 ราคาของลำดับที่ผิด: ผู้ใช้กด "ออกจากระบบ" ตอนเน็ตไม่ดี → เห็นว่าออกแล้ว
 *   **แต่ข้อมูลของเขายังอยู่บนเครื่องให้คนถัดไปเห็น**
 */
export async function signOut(): Promise<void> {
  // 🔴 **ที่เก็บมีสองใบ · `clearDeviceData()` เป็นตัวเดียวที่รู้ว่ามีสองใบ** (P7 ชี้ · 28 ส.ค. 2026)
  //    เดิมบรรทัดนี้เป็น `clearAllCaches()` + `clearOfflineStore()` เรียงกัน **ซึ่งแปลว่าผู้เรียกทุกราย
  //    ต้องจำว่ามีสองใบ** — และ `HomeScreen` (ทางสลับบัญชี) จำไม่ได้จริง ๆ · ดูเหตุผลเต็มใน `deviceData.ts`
  //    ⚠️ ต้อง `await` และต้องอยู่ **ก่อน** `auth.signOut()` — มันโยนเมื่อออฟไลน์
  await clearDeviceData();
  const supabase = createBrowserSupabase();
  await supabase.auth.signOut();
}
