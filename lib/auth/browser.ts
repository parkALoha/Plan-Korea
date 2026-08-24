import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client ฝั่งเบราว์เซอร์ที่เก็บ session ลงคุกกี้ (ไม่ใช่ localStorage)
 * เจ้าของ: P1-Lead · ใช้โดยหน้า `/login` ของ P2
 *
 * 🔴 ทำไมต้องเป็นคุกกี้: ฝั่งเซิร์ฟเวอร์อ่าน session ได้ทางคุกกี้เท่านั้น
 * ถ้า client เก็บลง localStorage ตามค่าเริ่มต้นของ `supabase-js`
 * **หน้าเพจฝั่งเซิร์ฟเวอร์จะมองไม่เห็นว่าผู้ใช้ล็อกอินอยู่เลย** ทั้งที่เบราว์เซอร์เห็น
 * → อาการคือ "ล็อกอินแล้วแต่ยังโดนเด้งไป /login" ซึ่งอ่านเหมือนบั๊กของ auth
 *
 * ⛔ ห้ามใช้ไฟล์นี้ตัดสินสิทธิ์ — สิทธิ์ตัดสินที่ RLS เท่านั้น ฝั่ง client เป็นแค่ UX
 */
export function createBrowserSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("ไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createBrowserClient(url, key);
}
