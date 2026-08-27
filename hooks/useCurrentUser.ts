"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/auth/browser";

export type CurrentUser =
  | { status: "loading" }
  /** ยังไม่ได้ล็อกอิน — ในทางปฏิบัติแทบไม่เกิดบนหน้านี้ เพราะ proxy.ts กันไว้ก่อนแล้ว
   *  (ทุก path ที่ไม่อยู่ใน PUBLIC_PATHS ต้องมี session ถึงจะเรนเดอร์ถึงตรงนี้) แต่ยังรับสถานะนี้ไว้
   *  เป็นข้อมูลป้องกันชั้นสอง ไม่ใช่ด่าน — สอดคล้องกับที่ `createBrowserSupabase()` บอกไว้ว่า "UX เท่านั้น" */
  | { status: "anon" }
  | { status: "ready"; id: string; displayName: string | null };

/**
 * ผู้ใช้ที่ล็อกอินอยู่ตอนนี้ — สำหรับโชว์ผล UX เท่านั้น (ทักทายด้วยชื่อ) **ไม่ใช่ตัวตัดสินสิทธิ์**
 * (`lib/auth/browser.ts` เขียนกำกับไว้ชัดว่าห้ามใช้ไฟล์นั้นตัดสินสิทธิ์ — สิทธิ์จริงมาจาก RLS เท่านั้น)
 * `id` ก็เป็นแบบเดียวกัน — ใช้เทียบกับ `role` จาก `GET /trips/[tripId]/members` เพื่อ **ซ่อน/โชว์ปุ่ม**
 * เท่านั้น ห้ามใช้แทนการเช็ค `403` จาก route จริง
 *
 * 🔴 **`id` ไม่มีผู้ใช้เลย ณ 28 ส.ค. 2026 — และนั่นตั้งใจ ไม่ใช่ลืมถอน** เพิ่มมาตอนทำปุ่มอัปโหลดรูปปก
 * (owner เท่านั้นที่กดได้) แล้วฟีเจอร์นั้นถูกถอนทั้งชุดวันเดียวกันเมื่อผู้ใช้เปลี่ยนทิศ · P1 สั่งให้เก็บ `id`
 * ไว้เพราะ **`AC10` (สิทธิ์ owner/editor/viewer บน UI) กำลังจะมา** และจะต้องใช้มันแน่
 * 📌 **วันหมดอายุ: ถ้าถึง ~ต.ค. 2026 แล้วยังไม่มีใครใช้ `id` ให้ถอนออก** — ของที่เก็บไว้โดยมีวันหมดอายุ
 * เขียนกำกับ ต่างจากของที่ลืมถอน · เช็คด้วย `grep -rn "useCurrentUser" --include="*.tsx"` ว่ามีใครอ่าน
 * `.id` จริงหรือยัง
 *
 * ยังไม่มี route/hook สำหรับ `profiles.display_name` ในโปรเจกต์นี้ (27 ส.ค. 2026) — อ่านตรงผ่าน
 * `createBrowserSupabase()` แทนที่จะเปิด API route ใหม่ เพราะ `profiles_select` policy อนุญาตให้อ่าน
 * แถวของตัวเองอยู่แล้ว (`id = auth.uid()`) และนี่คือกรณี UX-only ตามที่ไฟล์นั้นออกแบบไว้พอดี
 */
export function useCurrentUser(): CurrentUser {
  const [state, setState] = useState<CurrentUser>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabase();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setState({ status: "anon" });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setState({ status: "ready", id: user.id, displayName: profile?.display_name ?? null });
    })().catch(() => {
      if (!cancelled) setState({ status: "anon" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
