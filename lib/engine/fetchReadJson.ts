"use client";

import { reportReadFailure } from "@/lib/reportReadFailure";

/**
 * `fetch(url)` + `res.json()` ที่ **ไม่โยนไม่ว่าเกิดอะไรขึ้น** — คืน `null` แทนทุกทางพลาด
 * (P1/P3, 27 ส.ค. 2026 — รูปเดียวกับ `callPlacesApi` ใน `lib/googlePlaces.ts`)
 *
 * ## 🔴 ทำไมต้องมี — 19 จุดใน `hooks/` เชื่อว่า `await fetch()` ไม่โยน แล้วมันโยน
 * หลาย hook เขียน `const res = await fetch(...); if (!res.ok) { reportReadFailure(...); return; }`
 * ซึ่งจัดการ "ไปถึงแล้วถูกปฏิเสธ" ไว้แล้ว **แต่ไม่มี `try` ครอบตัว `fetch()` เอง** — พอเน็ตขาด/DNS ล่ม/
 * timeout มันโยนตรงนั้น ฟังก์ชัน `async` ที่เรียกอยู่ก็ reject ทั้งฟังก์ชัน `setLoaded(true)` ที่ตั้งใจให้รัน
 * เสมอไม่ว่าผลจะเป็นยังไง **ไม่เคยถูกเรียก** → ค้างที่หน้าโหลดตลอดไป และ `reportReadFailure()` ที่มีไว้เพื่อ
 * เรื่องนี้โดยตรง **ไม่เคยถูกเรียกเช่นกัน** เพราะโค้ดไปไม่ถึงบรรทัดนั้น
 *
 * ## รวมสามเหตุที่ผู้เรียกไม่ต้องเขียนซ้ำเอง — คืน `null` เดียวกันทั้งสาม
 * ผู้เรียกเช็คแค่ `if (!data) return void setLoaded(true);` โดยไม่ต้องสนใจว่าล้มแบบไหน — `fetchReadJson`
 * เรียก `reportReadFailure` ให้เองแล้วตามเหตุจริง (status / ติดต่อไม่ได้ / JSON พัง)
 *
 * 🔴 **พึ่ง dedupe ของ `lib/toast.ts` (`showToast`) โดยไม่ได้เขียนไว้ที่นั่น** (P1 ตรวจแล้ว, 27 ส.ค. 2026)
 * ตอนเน็ตหลุด **ทุก hook ที่ mount อยู่ยิง `fetchReadJson` พร้อมกันหมด** แล้วทุกอันจะได้ข้อความ
 * `"unreachable"` **เหมือนกันเป๊ะทุกตัวอักษร** — ถ้าไม่มี dedupe จะได้ toast ซ้อนกันเป็นตั้งตามจำนวน hook ที่
 * mount ผู้ใช้เห็น 10 toast แทนที่จะเห็น 1 · ที่ยังปลอดภัยอยู่วันนี้เพราะ `showToast` ที่ `(kind, message)`
 * ตรงกัน **ต่อเวลาอันเดิมแทนที่จะสร้างใหม่** — แต่ dedupe นั้นเขียนไว้ด้วยเหตุผลคนละเรื่อง (ฝั่งเขียนที่พังซ้ำ
 * หลายแถวรวด) ไม่มีที่ไหนบอกว่าไฟล์นี้พึ่งมันอยู่ **ถ้าวันหนึ่งมีคนเติมรายละเอียดต่อ hook ลงในข้อความ (เช่น
 * URL/ชื่อทรัพยากร) ข้อความจะไม่เหมือนกันอีกต่อไป → กลับไปซ้อนกันเป็นตั้งทันทีโดยไม่มีเทสต์ไหนจับ** เพราะทั้ง
 * สองไฟล์ยังถูกในตัวเอง
 */
export async function fetchReadJson<T>(url: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    reportReadFailure({ kind: "unreachable" });
    return null;
  }
  if (!res.ok) {
    reportReadFailure({ kind: "status", status: res.status });
    return null;
  }
  try {
    return (await res.json()) as T;
  } catch {
    reportReadFailure({ kind: "invalid-json" });
    return null;
  }
}
