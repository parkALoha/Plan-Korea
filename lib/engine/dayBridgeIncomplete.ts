"use client";

import { showToast } from "@/lib/toast";
import type { DayBridge } from "@/lib/engine/dayBridge";

/**
 * "สะพานวันไม่ครบทำให้แถวหาย" ต้องไม่เงียบ และห้ามทับแคชด้วยผลที่หดแล้ว — `E4-AC1` (P1/P7, 27 ส.ค. 2026)
 *
 * ## ปัญหาที่พบ (P7 ชี้ · P1 ไล่ถึงราก)
 * `useStops`/`useDaySettings`/`useOvernightOverrides`/`useBookings` แปลง `trip_day_id` (uuid จากฐาน)
 * เป็น `"d0"`-style id ผ่าน `buildDayBridge(ITINERARY, dbDays)` — `ITINERARY` เป็นข้อมูลนิ่งของ**ทริป
 * เกาหลีใบนี้ใบเดียว** ทริปที่สร้างใหม่ (`POST /api/engine/trips`, `6a7d9a7`) มี `trip_days` ที่ไม่มีคู่ใน
 * `ITINERARY` เลย → สะพานว่าง → แถวทุกแถวถูกทิ้งใน `mapRows`/`toMap` **โดย `res.ok` เป็น `true`** ไม่มี
 * error ที่ไหน แล้วผลที่หดแล้ว (มักเป็น `[]`) ถูกเขียนทับ `writeCache` — ครั้งต่อไปแม้ออฟไลน์ก็ยังเห็นแต่ของ
 * ที่หายไปแล้ว **นี่คือกับดัก `P-21`/`D22`: "สะพานว่าง" กับ "ทริปนี้ไม่มีข้อมูลจริง" หน้าตาเหมือนกันเป๊ะ**
 *
 * ## ทำไมแยกไฟล์จาก `lib/engine/dayBridge.ts`
 * `dayBridge.ts` **ไม่ import อะไรเลยโดยตั้งใจ** (ทดสอบได้โดยไม่ต้องมี `ITINERARY`/DOM) — ฟังก์ชันนี้
 * ต้องเรียก `showToast` (`"use client"`) จึงอยู่คนละไฟล์ ไม่ทำให้ `dayBridge.ts` เสียคุณสมบัตินั้น
 *
 * ⚠️ **นี่คือทางบรรเทาระหว่างรอตัดสินทางแก้จริง ไม่ใช่ทางแก้** — ทางแก้จริง (ทริปใหม่ควรใช้ `trip_days.id`
 * ของฐานตรง ๆ แทนสะพาน `"d0"` ที่มีความหมายเฉพาะทริปเกาหลีใบนี้) เป็นการตัดสินใจที่ใหญ่กว่าที่ P1 ยังไม่ได้
 * ชี้ทาง — ตัวนี้แค่ทำให้ปัญหา **มองเห็นได้และไม่ทำลายแคชเพิ่ม** ระหว่างรอ ไม่ได้แก้ที่ต้นตอ
 */
const WARNING_MESSAGE = "บางวันของทริปนี้ยังไม่มีในฐานข้อมูล — ข้อมูลที่เห็นตอนนี้อาจไม่ครบ";

/** ข้อความเดียวกันทุกจุดเรียก — `showToast` dedupe ด้วย (kind, message) เดียวกันให้เอง จึงไม่ซ้อนกัน
 *  เป็นตั้งแม้หลาย hook จะเจอปัญหาเดียวกันพร้อมกันในหน้าเดียว */
function warn() {
  showToast("error", WARNING_MESSAGE);
}

export function reportDayBridgeDropIfAny(rawCount: number, mappedCount: number): boolean {
  if (rawCount === 0 || mappedCount >= rawCount) return false;
  warn();
  return true; // ผู้เรียกควรข้าม writeCache รอบนี้ — อย่าทับแคชที่อาจถูกต้องอยู่แล้วด้วยผลที่หด
}

/**
 * 🔴 **แก้ 27 ส.ค. 2026 — P1/P7 ชี้ว่า `dayBridge.ts` มีสัญญาณนี้ให้อยู่แล้วและไม่มีใครอ่านเลย**
 * (`grep -rn "matched|unmatchedDb|unmatchedLegacy" hooks/ app/ components/` = 0 ผลลัพธ์ก่อนคอมมิตนี้)
 *
 * ตรวจที่ตัวสะพานเองตอนสร้าง (ก่อนจะไปถึงขั้น mapRows/toMap) — ดักได้**เร็วกว่า**
 * `reportDayBridgeDropIfAny` (ซึ่งต้องรอให้มีแถวจริงหดไปก่อนถึงจะรู้): เตือนได้ตั้งแต่เปิดทริปใหม่ครั้งแรก
 * ก่อนมีใครเพิ่มจุดแวะเลยด้วยซ้ำ — **verified จริงกับทริปที่สองของ P2 ("P2 live-verify test trip",
 * `fe767e84-…`): `trip_days` ในฐาน = 0 แถว → `bridge.matched === 0` และ `unmatchedLegacy.length === 11`
 * (เท่ากับจำนวนวันทั้งหมดในไฟล์) ตรงกับเงื่อนไขที่ `dayBridgeWarning()` เขียนไว้เองว่า "ยังไม่มีวันของทริปนี้
 * ในฐานเลยสักวัน" เป๊ะ**
 *
 * ⚠️ **ไม่ได้แทนที่ `reportDayBridgeDropIfAny`** — ยังต้องมีทั้งคู่: ตัวนี้เตือน**ก่อน**มีข้อมูลให้หาย
 * (proactive) ส่วนตัวนั้นกันแคช**ตอน**ข้อมูลหายจริง (reactive, จำเป็นแม้สะพานจะ*บางส่วน*ใช้ได้ — เช่น
 * `matched > 0` แต่ยังมีบางแถวหลุด `unmatchedDb` ซึ่งเงื่อนไขนี้จะไม่ทริกเกอร์)
 */
export function reportDayBridgeWarningIfAny(bridge: DayBridge, totalLegacyDays: number): void {
  const looksBroken = (totalLegacyDays > 0 && bridge.matched === 0) || bridge.unmatchedLegacy.length > 0;
  if (looksBroken) warn();
}
