import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NO_REALTIME_TRANSPORT } from "@/lib/auth/noRealtime";

/**
 * ต่ออายุ session ที่ชั้น proxy — เจ้าของ: P1-Lead (E1)
 *
 * 🔴 **ทำไมต้องอยู่ที่นี่ ไม่ใช่ในหน้าเพจ:** Next 16 เขียนคุกกี้จาก Server Component ไม่ได้
 * (HTTP ตั้งคุกกี้หลังสตรีมเริ่มแล้วไม่ได้) · `lib/auth/server.ts` จึงต้อง `catch` การเขียนทิ้งไว้
 * → **ถ้าไม่มีไฟล์นี้ ไม่มีอะไรต่ออายุ token เลยสักจุด** ผู้ใช้จะถูกเด้งออกเงียบ ๆ ตอนมันหมดอายุ
 * และอาการจะเป็น *"อยู่ ๆ ก็หลุด"* ซึ่งเดาสาเหตุยากมากเพราะมันไม่ผูกกับการกระทำไหนเลย
 *
 * ⚠️ **จุดที่พลาดง่ายที่สุดของแพทเทิร์นนี้:** ต้องคืน `response` ตัวที่ `setAll` เขียนคุกกี้ลงไป
 * ถ้าสร้าง `NextResponse.next()` ใหม่ทีหลัง **token ที่เพิ่งต่ออายุจะหายไปเงียบ ๆ**
 * → ผู้ใช้ยังใช้ได้ตามปกติ **จนถึงวินาทีที่ token เดิมหมดอายุจริง** แล้วหลุดทั้งที่โค้ด "ต่ออายุแล้ว"
 */
export type ProxySession = {
  /** ต้องคืนตัวนี้ออกไปถ้าจะปล่อยผ่าน — มันถือคุกกี้ที่ต่ออายุแล้ว */
  response: NextResponse;
  /** ผู้ใช้ที่ล็อกอินอยู่ · `null` = ไม่มี หรือยังไม่ได้ตั้งค่า Supabase */
  user: User | null;
};

export async function refreshSession(request: NextRequest): Promise<ProxySession> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // ยังไม่ได้ตั้งค่า → ปล่อยผ่านโดยไม่ทำอะไร ตามหลักเดียวกับ fail-open ของด่าน PIN
  //
  // 🔴 **ข้อนี้ปลอดภัย และเหตุผลสำคัญกว่าตัวโค้ด:** ฟังก์ชันนี้ทำอย่างเดียวคือ *ต่ออายุ* token
  // มันไม่ได้เป็นคนตัดสินว่าใครเข้าถึงข้อมูลอะไรได้ — **คนตัดสินคือ RLS ที่ฝั่ง DB**
  // การไม่ต่ออายุจึงแปลว่า "ไม่มีอะไรเกิดขึ้น" ไม่ใช่ "ปล่อยให้ผ่าน"
  // ⚠️ ถ้าวันหนึ่งมีใครย้ายการตัดสินสิทธิ์เข้ามาไว้ในไฟล์นี้ **บรรทัดนี้จะกลายเป็นช่องโหว่ทันที**
  if (!url || !key) {
    return { response: NextResponse.next({ request }), user: null };
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    // 🔴 S1 (P4 พบ · P1 ยืนยันด้วยการรัน) — ขาดบรรทัดนี้แล้ว `createServerClient` **โยนทันที**
    //    บน Node 20 และเนื่องจากฟังก์ชันนี้อยู่บรรทัดแรกของ `proxy()` ผลคือ **ทั้งเว็บ 500 ทุกเส้น**
    realtime: { transport: NO_REALTIME_TRANSPORT },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // 🔴 `getUser()` ไม่ใช่ `getSession()` — และที่นี่มันมี 2 หน้าที่พร้อมกัน:
  //    ① ตรวจ JWT กับเซิร์ฟเวอร์จริง (`getSession` อ่านคุกกี้แล้วคืนโดยไม่ตรวจ = ปลอมได้)
  //    ② **การเรียกนี้เองคือสิ่งที่ทำให้ token ถูกต่ออายุ** ถ้าไม่เรียก ไม่มีอะไรเกิดขึ้นเลย
  const { data, error } = await supabase.auth.getUser();

  return { response, user: error ? null : (data.user ?? null) };
}
