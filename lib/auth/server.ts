import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NO_REALTIME_TRANSPORT } from "@/lib/auth/noRealtime";

/**
 * ชั้น auth ฝั่งเซิร์ฟเวอร์ของแพลตฟอร์ม (E1) — เจ้าของ: P1-Lead
 *
 * 🔴 **D38 — Server Action ไม่ใช่สิทธิ์พิเศษ**
 * ไฟล์นี้ใช้ **anon key เท่านั้น** เหมือนที่เบราว์เซอร์ใช้ · การอยู่ฝั่งเซิร์ฟเวอร์
 * ทำให้ **ความลับไม่หลุดขึ้น bundle** — ไม่ได้ทำให้ **มีสิทธิ์เข้าถึงข้อมูลมากขึ้น** แม้แต่แถวเดียว
 * สิทธิ์ทุกอย่างยังมาจาก RLS ที่อ่าน `auth.uid()` จาก JWT ของผู้ใช้คนนั้น
 * ⛔ **ห้าม import `SUPABASE_SERVICE_ROLE_KEY` ในไฟล์นี้หรือไฟล์ไหนใต้ `lib/auth/`**
 *    มีเทสต์ `lib/__tests__/authNoServiceRole.test.ts` บังคับข้อนี้ และมันเห็นแดงมาแล้ว
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    // ต่างจาก lib/supabase.ts เดิมที่ใส่ค่าปลอมเพื่อไม่ให้แอปพังตอนโหลดหน้า —
    // ที่นั่นทำได้เพราะทุกจุดเรียกเช็ค `supabaseConfigured` ก่อน
    // 🔴 ที่นี่ทำแบบนั้นไม่ได้: client ที่ต่อกับ URL ปลอมจะคืน "ไม่มีผู้ใช้" ซึ่ง
    //    **อ่านเหมือนผู้ใช้ยังไม่ล็อกอิน ทั้งที่ความจริงคือระบบตั้งค่าไม่ครบ**
    //    สองสถานะนี้ต้องแยกกันให้ขาด ไม่งั้นการตั้งค่าพลาดจะโผล่เป็นหน้า login ตลอดกาล
    throw new Error(`ไม่ได้ตั้ง env ${name} — auth ทำงานไม่ได้`);
  }
  return v;
}

/**
 * Supabase client ที่อ่าน/เขียน session ผ่านคุกกี้ของ request ปัจจุบัน
 *
 * ⚠️ `cookies()` ของ Next 16 เป็น **async** (เวอร์ชัน 14 ลงไปเป็น sync)
 *    — ดู `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      // 🔴 S1 — เหตุผลเต็มอยู่ใน `lib/auth/noRealtime.ts` · ขาดบรรทัดนี้แล้วโยนบน Node 20
      realtime: { transport: NO_REALTIME_TRANSPORT },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // 🔴 กลืนโดยตั้งใจ และนี่คือจุดที่ต้องอธิบาย ไม่ใช่ปล่อยผ่าน:
            // Next 16 อนุญาต `.set` เฉพาะใน Server Function / Route Handler เท่านั้น
            // เรียกจาก Server Component เมื่อไหร่จะโยนเสมอ (HTTP ตั้งคุกกี้หลังสตรีมเริ่มแล้วไม่ได้)
            // → การอ่าน session ในหน้าเพจจึงต้องยอมให้ "ต่ออายุ token ไม่สำเร็จ" ผ่านไปเงียบ ๆ ได้
            // ⚠️ **แลกมาด้วยของที่ต้องจำ:** ถ้าไม่มีใครต่ออายุ token เลย ผู้ใช้จะถูกเด้งออกเมื่อมันหมดอายุ
            //    ตอนนี้ยังไม่มี middleware ต่ออายุให้ — **เป็นของค้างจริงของ E1 ไม่ใช่รายละเอียดที่ละเลยได้**
          }
        },
      },
    },
  );
}

/**
 * ผู้ใช้ที่ล็อกอินอยู่ · คืน `null` ถ้าไม่มี
 *
 * 🔴 **ใช้ `getUser()` ไม่ใช่ `getSession()` — และความต่างนี้คือเรื่องความปลอดภัย ไม่ใช่สไตล์**
 * `getSession()` อ่านค่าจาก**คุกกี้** แล้วคืนมาโดย**ไม่ตรวจกับเซิร์ฟเวอร์ auth เลย**
 * → ใครแก้คุกกี้เองก็ได้ `user` ที่หน้าตาสมบูรณ์แบบกลับมา
 * `getUser()` ยิงไปตรวจ JWT กับเซิร์ฟเวอร์จริงทุกครั้ง
 *
 * > **สองฟังก์ชันนี้คืนของหน้าตาเหมือนกันเป๊ะ ต่างกันแค่อันหนึ่งเชื่อได้ อีกอันเชื่อไม่ได้**
 * > — คลาสเดียวกับที่ `docs/engine/README.md` เรียกว่า *ผลลัพธ์ที่ดูปลอดภัยกับที่พังสนิท หน้าตาเหมือนกัน*
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/** เหมือน `getUser()` แต่เด้งไป `/login` ถ้ายังไม่ล็อกอิน — ใช้ในหน้าที่ต้องมีตัวตนเสมอ */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
