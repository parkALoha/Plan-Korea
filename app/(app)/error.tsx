"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

/**
 * ขอบเขตความผิดพลาดของ 3 หน้าหลัก (เฟส C4 · 4 ก.ย. 2026)
 *
 * 🔴 **เว็บนี้ไม่เคยมี `error.tsx` เลยสักไฟล์** — หน้าไหนโยน error ตอนเรนเดอร์ ผู้ใช้จะเจอ
 *    หน้าขาวของ Next พร้อมข้อความอังกฤษ · ซึ่งอาจเกิด **ตอนอยู่กลางเกาหลี เน็ตหลุด**
 *    ไม่มีทางกลับเข้าแผนที่วางไว้ได้เลยนอกจากพิมพ์ URL ใหม่เอง
 *
 * ⚠️ **ใช้ `retry` ไม่ใช่ `reset` — และเหตุผลไม่ใช่ที่ผมเดาไว้ตอนแรก**
 *    เอกสารของเวอร์ชันนี้ (`node_modules/next/dist/docs/.../error.md`) เขียนว่า `retry`
 *    ผมจึงเดาว่า `reset` "ไม่มีแล้ว" และปุ่มจะตายเงียบ — **ผิด** อ่านซอร์สจริงแล้วพบว่า
 *    `client/components/error-boundary.js:110-115` ส่งให้ **ทั้งสองตัว** ⇒ `reset` ยังใช้ได้
 *
 *    ความต่างที่แท้จริงอยู่ที่ *มันทำอะไร* (`error-boundary.js:39-48`):
 *      reset()  → setState({ error: null })                      ล้างสถานะ แล้วเรนเดอร์ *ข้อมูลชุดเดิม* ใหม่
 *      retry()  → startTransition(() => { refresh(); reset() })  **ดึงข้อมูลจากเซิร์ฟเวอร์ใหม่** ก่อนล้าง
 *    error ที่หน้านี้จะเจอจริงส่วนใหญ่มาจากข้อมูลที่โหลดไม่สำเร็จ ⇒ `reset` เฉย ๆ จะเรนเดอร์
 *    ของที่พังอยู่ซ้ำแล้วเด้งกลับมาที่หน้านี้อีก · **`retry` คือตัวที่มีโอกาสแก้ปัญหาได้จริง**
 *
 *    📌 และการทดสอบด้วยการกดปุ่ม **แยกสองตัวนี้ไม่ออก** ถ้า error ที่ฉีดเข้าไปหายได้ด้วยการ
 *       เรนเดอร์ใหม่เฉย ๆ — ตอนตรวจ ผมฉีด error ที่ขึ้นกับ query string แล้วลบ query ทิ้ง
 *       ⇒ ทั้ง `reset` และ `retry` ก็ "ผ่าน" เหมือนกัน · ข้อสรุปนี้มาจากการอ่านซอร์ส ไม่ใช่จากการกด
 *
 * 🎯 ทางออกที่ให้ ไม่ใช่แค่ "ลองใหม่" — ปุ่มที่สองพาไป `/today` เพราะระหว่างทริป
 *    นั่นคือหน้าที่ต้องใช้จริง และเป็นหน้าที่ service worker แคชไว้ให้อ่านได้ตอนเน็ตหลุด
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // ไม่มีบริการเก็บ log ในโปรเจกต์นี้ — อย่างน้อยให้มันอยู่ใน console ของเครื่องที่เจอ
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-4xl" aria-hidden>
        🍂
      </div>
      <h1 className="text-lg font-bold text-content">หน้านี้มีอะไรผิดพลาด</h1>
      <p className="text-sm text-content-soft">
        แผนที่วางไว้ยังอยู่ครบ ไม่ได้หายไปไหน — ลองโหลดหน้านี้ใหม่ หรือข้ามไปหน้า “วันนี้” ก่อนก็ได้
      </p>

      <div className="mt-2 flex w-full flex-col gap-2">
        <Button variant="primary" size="lg" onClick={retry} className="w-full">
          ลองใหม่อีกครั้ง
        </Button>
        <Link
          href="/today"
          className="rounded-control border border-line px-4 py-3 text-sm font-medium text-content-soft hover:bg-surface-soft"
        >
          ไปหน้า “วันนี้”
        </Link>
      </div>

      {/* digest คือรหัสที่ Next ใส่ให้ error ฝั่งเซิร์ฟเวอร์ — เป็นสิ่งเดียวที่โยงไปหา log จริงได้
          ไม่ได้ตั้งใจให้ผู้ใช้อ่าน แต่ถ้าเขาถ่ายจอส่งมา เรามีอะไรให้ตามต่อ */}
      {error.digest && <p className="text-2xs text-content-soft/70">รหัสอ้างอิง: {error.digest}</p>}
    </main>
  );
}
