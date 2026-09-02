"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/auth/browser";
import { stampDeviceOwner } from "@/lib/auth/deviceOwner";

/**
 * ประทับตรา "ข้อมูลในเครื่องนี้เป็นของใคร" ทุกครั้งที่สถานะ auth เปลี่ยน — `E6-AC14`
 * เจ้าของ: P3-FE/Perf · 2 ก.ย. 2026 (P7 ออกแบบ · P1 เขียน `lib/auth/deviceOwner.ts`)
 *
 * ## 🔴 ใช้ `createBrowserSupabase()` **ไม่ใช่** `supabase` จาก `@/lib/supabase`
 * ```
 * lib/supabase.ts        createClient(...)        เก็บ session ลง **localStorage**
 * lib/auth/browser.ts    createBrowserClient(...) เก็บ session ลง **คุกกี้**  ← ตัวที่ auth จริงใช้
 * ```
 * `signIn`/`signOut` ทั้งหมดเดินผ่านตัวคุกกี้ (`lib/auth/signIn.ts`) → **สมัคร `onAuthStateChange`
 * บนตัว localStorage จะไม่ได้ยินการล็อกอินจริงเลยสักครั้ง และมันจะเงียบ ไม่ใช่พัง**
 * · 🎯 ตราที่ไม่เคยถูกประทับ = `readDeviceOwner()` คืน `null` ตลอดกาล → ผู้อ่าน fail closed →
 *   **แคชใช้ไม่ได้ทั้งแอปโดยไม่มีอะไรฟ้อง** · เป็นทิศที่แย่ที่สุดของงานชิ้นนี้
 *
 * ## 🔴 ทำไมสมัครใน `useEffect` ทั้งที่ข้อกำหนดเขียนว่า "ตัดสินตอน render ก่อนลูก render"
 * **สมัครตอน render ไม่ได้** — เป็น side effect ที่ต้องมี cleanup (React เรียก render ซ้ำได้ตามใจ)
 * · ✅ **แต่ข้อกังวลที่อยู่เบื้องหลังข้อกำหนดนั้นไม่เกิด**: ตราอยู่ใน `localStorage` และ **รอดข้ามการโหลดหน้า**
 *   → ตอนลูกอ่านแคชในรอบแรก **ตราของรอบก่อนอยู่ที่นั่นแล้ว** ไม่ได้รอ effect นี้
 * · `onAuthStateChange` ยิง `INITIAL_SESSION` ทันทีที่สมัคร → ตราถูกยืนยันซ้ำทุกครั้งที่เปิดแอป
 * · ⚠️ **ช่วงที่ตราผิดได้จริงคือ *สลับบัญชี* เท่านั้น** (B ล็อกอินเสร็จ → ก่อน effect นี้ทำงาน)
 *   ซึ่งเป็นรูที่ `deviceOwner.ts` รับไว้แล้วโดยเจตนา — **และจังหวะนั้นออนไลน์เสมอ**
 *
 * ## ⚠️ ไม่มี env → ไม่ประทับ และนั่นถูก
 * `createBrowserSupabase()` โยนเมื่อ env ไม่ครบ · จับไว้เงียบ ๆ เพราะ **ไม่ประทับ = อ่านได้ `null` =
 * ผู้เรียก fail closed** ซึ่งเป็นค่าตั้งต้นที่ปลอดภัยอยู่แล้ว · ปล่อยให้โยนจะทำให้ทั้งแอปขาวตอน dev
 * ที่ยังไม่ตั้ง `.env.local`
 */
export function DeviceOwnerStamp() {
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const supabase = createBrowserSupabase();
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        stampDeviceOwner(session?.user?.id ?? null);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // env ไม่ครบ — ไม่ประทับ · ผู้อ่านจะได้ `null` แล้ว fail closed ตามที่ออกแบบไว้
    }
    return () => unsubscribe?.();
  }, []);

  return null;
}
