"use client";

import { useEffect } from "react";

/**
 * ลงทะเบียน service worker (เฟส 18) — **เฉพาะ production เท่านั้น**
 *
 * ตอน dev ห้ามลง เพราะ SW จะไปคั่นกลางระหว่างเบราว์เซอร์กับ dev server แล้วเสิร์ฟบันเดิลเก่าทับ
 * ของที่เพิ่งแก้ (HMR พังเงียบๆ แบบหาสาเหตุยากมาก) · คู่มือ offline ของ Next เองก็ระบุว่าให้ทดสอบ
 * ด้วย `next build && next start` ไม่ใช่ dev server
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // ลงทะเบียนไม่สำเร็จ (เบราว์เซอร์ปิดไว้ / โหมดส่วนตัว) — เว็บยังใช้งานได้ปกติแค่ไม่มี offline
    });
  }, []);

  return null;
}
