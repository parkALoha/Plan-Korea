"use client";

import { useState } from "react";
import { signOut } from "@/lib/auth/signIn";

/**
 * ปุ่มออกจากระบบ — เจ้าของ: P1-Lead (E1)
 *
 * 🔴 **จำเป็นสำหรับวัด `E1-AC7`** ไม่ใช่แค่ความสะดวก: ต้องออกจากระบบให้ได้ก่อน
 * ถึงจะเข้าใหม่ด้วย provider อีกทางแล้วดูว่าได้ `user id` เดิมหรือไม่
 *
 * ⚠️ วางไว้ในโฟลเดอร์ของหน้านี้ ไม่ใช่ `components/` — โซนนั้นเป็นของ P2
 * และปุ่มนี้เป็นเครื่องมือตรวจของ E1 ไม่ใช่ component ที่ UI จริงจะใช้ต่อ (`E5` เขียนของจริง)
 *
 * ⚠️ ใช้ `window.location.assign` ไม่ใช่ `router.push` — ต้องให้เบราว์เซอร์ยิง request ใหม่ทั้งรอบ
 * เพื่อให้ `proxy.ts` เห็นคุกกี้ที่เพิ่งถูกล้าง · navigate ฝั่ง client จะยังถือ state เดิมอยู่
 * (หลักเดียวกับที่ `app/unlock/page.tsx` เขียนไว้ตอนปลดล็อก PIN)
 */
export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signOut();
        } finally {
          // ไปต่อไม่ว่าจะสำเร็จหรือไม่ — ค้างอยู่หน้าเดิมโดยกดอะไรไม่ได้ แย่กว่าไปหน้า login
          //
          // 🔴 ปิด lint ตรงนี้โดยตั้งใจ และเหตุผลคือสิ่งที่กฎนั้นชั่งน้ำหนักไม่ได้:
          // กฎห้าม hard navigation เพราะมันทิ้ง state ฝั่ง client ทั้งหมด
          // **สำหรับการออกจากระบบ การทิ้ง state ทั้งหมดคือสิ่งที่เราต้องการ ไม่ใช่ราคาที่ต้องจ่าย**
          // `router.push()` เป็น soft navigation — ข้อมูลที่โหลดไว้ก่อนออกจากระบบยังค้างในหน่วยความจำ
          // และ `proxy.ts` อาจไม่ได้เห็นคุกกี้ที่เพิ่งถูกล้างในรอบเดียวกัน
          // · แพทเทิร์นเดียวกับ `app/unlock/page.tsx` ซึ่งเขียนเหตุผลข้อนี้ไว้แล้วตอนปลดล็อก PIN
          //   (ที่นั่น lint ไม่เตือนเพราะปลายทางเป็นตัวแปร — กฎจึงมองไม่ออกว่าเป็น path ภายใน
          //    **ไม่ใช่เพราะที่นั่นถูกกว่าที่นี่**)
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/login");
        }
      }}
      className="mt-6 w-full rounded-lg border border-line bg-surface-soft py-3 text-sm text-content disabled:opacity-60"
    >
      {busy ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
    </button>
  );
}
