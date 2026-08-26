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
