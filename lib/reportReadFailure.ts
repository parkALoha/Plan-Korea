"use client";

import { showToast } from "@/lib/toast";

/**
 * `if (!res.ok) return;` ต้องไม่เงียบ — ฝั่งอ่าน (P1/P7, 27 ส.ค. 2026)
 *
 * `writeGuard` (`lib/writeGuard.ts`) มีอยู่เพราะ *"เขียนไม่ติดแล้วเงียบสนิท"* — หลาย hook อ่านข้อมูลด้วย
 * `if (!res.ok) return` เฉย ๆ ซึ่งเป็นอาการเดียวกันฝั่งอ่าน: fetch ล้ม (500/403/เน็ตหลุดกลางทาง) แล้ว
 * component ยังคงแสดงข้อมูลเก่า/แคชต่อไปโดยไม่มีอะไรบอกว่ามันอาจไม่ใช่ของล่าสุดแล้ว
 *
 * ต่างจาก `lib/engine/dayBridgeIncomplete.ts` โดยตั้งใจ: fetch ล้มเป็น**เหตุการณ์ชั่วคราว** (ลองใหม่แล้ว
 * มักหาย) ไม่ใช่สถานะที่ทริปหนึ่งติดอยู่ตลอดไป — toast จึงเหมาะกับกรณีนี้ ต่างจากกรณีสะพานวันที่ต้องเป็นแถบ
 *
 * ## 🔴 แก้ 27 ส.ค. 2026 (P1) — `status: number` เดียวไม่พอ เพราะ `await fetch()` เองก็โยนได้
 * เดิมรับแค่ `res.status` ซึ่งมีความหมายเฉพาะตอน "ไปถึงเซิร์ฟเวอร์แล้วถูกปฏิเสธ" — แต่ `fetch()` โยนเองเมื่อ
 * คำขอไปไม่ถึงปลายทางเลย (เน็ตขาด/DNS ล่ม/timeout) และ `res.json()` โยนเมื่อ body ไม่ใช่ JSON (captive
 * portal ของ WiFi โรงแรม) — รูปเดียวกับที่ P1 แก้ใน `lib/googlePlaces.ts`/`lib/travelProvider.ts` วันนี้
 * แยกเป็น 3 เหตุ ไม่ยุบรวม เพราะคนอ่านต้องทำคนละอย่าง (ดูโควตา/พารามิเตอร์ · รอเน็ต · ออกจาก captive portal)
 */
export type ReadFailureReason =
  | { kind: "status"; status: number }
  | { kind: "unreachable" }
  | { kind: "invalid-json" };

export function reportReadFailure(reason: ReadFailureReason): void {
  const message =
    reason.kind === "status"
      ? `โหลดข้อมูลไม่สำเร็จ (${reason.status}) — ข้อมูลที่เห็นอาจไม่ล่าสุด ลองรีเฟรชอีกครั้ง`
      : reason.kind === "unreachable"
        ? "ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"
        : "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง — ลองออกจาก WiFi ล็อกอิน (ถ้ามี) แล้วรีเฟรชอีกครั้ง";
  showToast("error", message);
}
