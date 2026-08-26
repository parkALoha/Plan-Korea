"use client";

import { useSyncExternalStore } from "react";
import type { DayBridge } from "@/lib/engine/dayBridge";

/**
 * "สะพานวันไม่ครบทำให้แถวหาย" ต้องไม่เงียบ และห้ามทับแคชด้วยผลที่หดแล้ว — `E4-AC1` (P1/P7, 27 ส.ค. 2026)
 *
 * ## ปัญหาที่พบ (P7 ชี้ · P1 ไล่ถึงราก)
 * `useStops`/`useDaySettings`/`useOvernightOverrides`/`useBookings` แปลง `trip_day_id` (uuid จากฐาน)
 * เป็น `"d0"`-style id ผ่าน `buildDayBridge(ITINERARY, dbDays)` — `ITINERARY` เป็นข้อมูลนิ่งของ**ทริป
 * เกาหลีใบนี้ใบเดียว** ทริปที่สร้างใหม่มี `trip_days` ที่ไม่มีคู่ใน `ITINERARY` เลย → สะพานว่าง → แถวทุกแถว
 * ถูกทิ้งใน `mapRows`/`toMap` **โดย `res.ok` เป็น `true`** ไม่มี error ที่ไหน
 *
 * ## 🔴 แก้ 27 ส.ค. 2026 (P1) — เปลี่ยนจาก toast เป็นสถานะของหน้า
 * ตัดสินแล้วว่า `trip_days.id` (uuid) คือตัวตนของวันจริง สะพานนี้จะยังจำเป็นต่อไปสำหรับทริปที่ย้ายมาจาก
 * `ITINERARY` เท่านั้น (`E5` เป็นคนตัดสินเรื่องแหล่งข้อมูลของทริปที่เหลือ) **หมายความว่าทริปที่เกิดบน
 * แพลตฟอร์มทุกใบจะมีสะพานว่างเปล่า *ตลอดไป* จนกว่า `E5` จะลง — ทุกครั้งที่โหลดหน้า ทุกวัน**
 *
 * 🎯 **P1 ชี้ตรง: ของที่ดังทุกครั้งคือของที่ถูกปิดตาไปในสัปดาห์เดียว** — toast (`lib/toast.ts`) ถูกออกแบบ
 * มาสำหรับ*เหตุการณ์* (เขียนไม่ผ่านหนึ่งครั้ง) ไม่ใช่*สถานะที่คงอยู่ตลอดไป* — ใช้ `useSyncExternalStore`
 * แบบเดียวกับ `useOnlineStatus`/`useSystemMode` แทน: เป็นแถบเงียบ ๆ ที่อยู่ตราบใดที่ทริปนี้ยังไม่มีสะพาน
 * ไม่ใช่ป๊อปอัปที่เด้งซ้ำทุก mount แล้วถูกเบรนเผาจนมองไม่เห็น
 *
 * ## ทำไมแยกไฟล์จาก `lib/engine/dayBridge.ts`
 * `dayBridge.ts` **ไม่ import อะไรเลยโดยตั้งใจ** (ทดสอบได้โดยไม่ต้องมี `ITINERARY`/DOM) — ไฟล์นี้ต้องมี
 * module state + `"use client"` จึงอยู่คนละไฟล์ ไม่ทำให้ `dayBridge.ts` เสียคุณสมบัตินั้น
 */

/**
 * 🔴 **สองธง ไม่ใช่ธงเดียว — และเหตุผลคือบั๊กที่ธงเดียวสร้างขึ้นเอง** (P1 · 27 ส.ค. 2026)
 *
 * ของเดิมเป็น `boolean` ใบเดียวที่ **มีคนเขียนสองคน**:
 * · `reportDayBridgeWarningIfAny()` — **ตั้งและล้าง** (มันเห็นทั้งสะพาน จึงล้างได้)
 * · `reportDayBridgeDropIfAny()`    — **ตั้งอย่างเดียว** (เห็นมุมเดียว จึงล้างไม่ได้ · เขียนไว้เองข้างล่าง)
 *
 * ⚠️ **แต่ "ตั้งอย่างเดียว" กันตัวเองไม่ให้ล้างได้ · มันกัน *คนอื่น* ไม่ให้ล้างไม่ได้**
 * มี **4 hook** ที่เรียกทั้งสองฟังก์ชันบนธงใบเดียวกัน:
 *   1. `useStops` แถวหล่น 2 จาก 10 → `reportDayBridgeDropIfAny(10, 8)` → ธง = `true` ✅ ถูก
 *   2. `useBookings` สร้างสะพานใบเดียวกันแล้วพบว่าปกติ → `reportDayBridgeWarningIfAny(…)` → **ธง = `false`**
 *   3. **แถบหาย ทั้งที่จุดแวะ 2 จุดยังหายอยู่**
 *
 * 🎯 **ผลคือแถบขึ้นอยู่กับ *ลำดับที่ hook ทำงานเสร็จ* ไม่ใช่ขึ้นกับสถานะ** — และ 4 hook นั้นเป็น
 * effect คนละตัวที่มี `await` คนละชุด **ลำดับจึงไม่คงที่ และไม่มีใครควบคุมมันได้**
 * · นี่คือเหตุผลว่าทำไมมันไม่ใช่เรื่องของการ "เรียกให้ถูกลำดับ" — **ไม่มีลำดับที่ถูก**
 *
 * ✅ แยกเป็นสองธง แล้วให้แถบ = `bridgeBroken || rowsDropped` → **ไม่มีใครล้างของใคร**
 * · `bridgeBroken` ตั้ง/ล้างได้ เพราะคนตั้งเห็นทั้งสะพานทุกครั้งที่เรียก
 * · `rowsDropped` **ล้างเองไม่ได้ตลอดอายุหน้า** — เป็นพฤติกรรมเดิม และตั้งใจ: คนตั้งเห็นแค่มุมเดียว
 *   จึงไม่มีใครในระบบที่รู้ว่า "หายไปแล้วกลับมาครบ" · โหลดหน้าใหม่คือสิ่งที่ล้างมัน
 */
let bridgeBroken = false;
let rowsDropped = false;
const listeners = new Set<() => void>();

const isIncomplete = () => bridgeBroken || rowsDropped;

function publish(before: boolean): void {
  if (isIncomplete() === before) return;
  for (const listener of listeners) listener();
}

/**
 * รูปมาตรฐานของ external store — **เปิดออกมาเพราะมันคือหน้าตาของสโตร์ ไม่ใช่เพราะเทสต์ต้องใช้**
 * ที่นี่ไม่มี `@testing-library/react` (ตรวจแล้ว) → ถ้าอ่านสถานะได้เฉพาะผ่าน hook
 * **จะไม่มีทางทดสอบได้เลยว่าสโตร์แจ้งผู้ฟังตอนไหน** ซึ่งเป็นครึ่งหนึ่งของความถูกต้องของมัน
 * (สโตร์ที่เปลี่ยนค่าแล้วไม่แจ้ง = หน้าจอค้างที่ค่าเก่า และไม่มีอะไรฟ้อง)
 */
export function subscribeDayBridgeIncomplete(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
}

/** อ่านค่ารวมของสองธง — `bridgeBroken || rowsDropped` */
export function readDayBridgeIncomplete(): boolean {
  return isIncomplete();
}

const subscribe = subscribeDayBridgeIncomplete;
const getSnapshot = readDayBridgeIncomplete;
/** SSR ถือว่าสะพานปกติเสมอ — ค่าจริงมาหลัง hydrate เหมือน `useOnlineStatus` */
const getServerSnapshot = () => false;

/** แถบ "ทริปนี้ยังแสดงข้อมูลบางส่วนไม่ได้" — ดู `components/DayBridgeIncompleteBanner.tsx` */
export function useDayBridgeIncomplete(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * เรียกทันทีหลัง `buildDayBridge()` ทุกครั้งที่ 4 hook สร้างสะพาน — ตั้ง/ล้างสถานะแถบตามผลจริงของ
 * สะพานปัจจุบัน (ไม่สะสม ไม่ latch ค้าง)
 *
 * 🔴 **แก้ 27 ส.ค. 2026 (P1 ไล่จน P2 เจอของจริง) — `unmatchedLegacy.length > 0` เดิมผิด ไม่ใช่แค่กว้างไป**
 * เดิมคิดว่า "มีวันในไฟล์ที่ไม่มีคู่ในฐาน" แปลว่าสะพานพัง — แต่ `dayBridge.ts` เขียนไว้เองว่า
 * `unmatchedDb`/`unmatchedLegacy` ที่ **ไม่ทับกันเลย** คือ**ปกติของทริปที่สร้างบนแพลตฟอร์ม** (วันที่ของ
 * มันไม่มีทางตรงกับปฏิทิน 11 วันของทริปเกาหลี) → `unmatchedLegacy.length` จะเป็นค่าคงที่ (~11) **ตลอดไป
 * ทุกทริปที่ไม่ใช่ทริปเกาหลี** ไม่ว่า `trip_days` ของทริปนั้นจะสมบูรณ์แค่ไหน — เดิมจะดังทุกครั้งตลอดกาล
 * สำหรับทริปแพลตฟอร์มทุกใบ ไม่ใช่แค่ตอนว่างเปล่า — **ผิดแบบเดียวกับ toast ที่เพิ่งแก้ไปเมื่อครู่**
 *
 * 🎯 เงื่อนไขที่ถูก: มีแค่ **2 กรณีที่ควรเตือนจริง**
 * 1. `dbDaysCount === 0` — ทริปนี้ไม่มีวันเลยสักวัน (กรณีที่ P2 วัดได้จริงกับทริปทดสอบ)
 * 2. `bridge.matched > 0 && bridge.unmatchedLegacy.length > 0` — สะพาน**จับคู่ได้บางส่วน** (แปลว่านี่คือ
 *    ทริปที่มีความเกี่ยวพันกับ `ITINERARY` จริง เช่นทริปเกาหลีหลัง `E7`) แต่ยังหลุดบางวัน — ของเดิมที่ P1
 *    ต้องการรักษาไว้สำหรับกรณี "ย้ายข้อมูลบางส่วน"
 * · `matched === 0` เฉย ๆ (ไม่เกี่ยวกับ `dbDaysCount`) **ไม่ใช่สัญญาณของอะไรทั้งนั้นอีกต่อไป** — เป็นสภาพ
 *   ปกติของทริปแพลตฟอร์มทุกใบตราบใดที่ `E5` ยังไม่ลง
 */
export function reportDayBridgeWarningIfAny(bridge: DayBridge, dbDaysCount: number): void {
  const looksBroken = dbDaysCount === 0 || (bridge.matched > 0 && bridge.unmatchedLegacy.length > 0);
  const before = isIncomplete();
  bridgeBroken = looksBroken;
  // 🔴 ล้างได้เฉพาะธงของตัวเอง — `rowsDropped` ไม่ใช่ของฟังก์ชันนี้ และการล้างมันคือบั๊กที่เพิ่งแก้
  publish(before);
}

/**
 * ห้ามทับแคชด้วยผลที่หดเพราะสะพานวันไม่ครบ (P1/P7) — เรียกตอนจะ `writeCache` ทุกจุดที่ผ่านสะพาน
 * คืน `true` = ผู้เรียกควรข้าม `writeCache` รอบนี้ (แถวหายเพราะบั๊ก ไม่ใช่เพราะทริปไม่มีข้อมูลจริง)
 *
 * แยกจาก `reportDayBridgeWarningIfAny` โดยตั้งใจ: ฟังก์ชันนี้อาจ `true` ได้แม้สะพาน*บางส่วน*ใช้ได้
 * (`matched > 0` แต่บางแถวยังหลุดทาง `unmatchedDb`) ซึ่ง `reportDayBridgeWarningIfAny` จะไม่ทริกเกอร์
 * — ตั้งแถบเตือนด้วยถ้าเจอ (แต่ไม่ล้างมันเอง: ตัวนี้เห็นแค่มุมเดียว เฉพาะตัวที่ตรวจทั้งสะพานถึงจะรู้ว่าล้างได้)
 */
export function reportDayBridgeDropIfAny(rawCount: number, mappedCount: number): boolean {
  const dropped = rawCount > 0 && mappedCount < rawCount;
  if (dropped) {
    const before = isIncomplete();
    rowsDropped = true;
    publish(before);
  }
  return dropped;
}

/**
 * ล้างทั้งสองธง — **สำหรับชุดทดสอบเท่านั้น**
 *
 * 🔴 `rowsDropped` ตั้งใจให้ล้างไม่ได้ตอนใช้งานจริง → ถ้าเคสหนึ่งตั้งมันไว้ **เคสถัดไปจะเริ่มด้วยธงที่ตั้งแล้ว**
 * และจะเขียวด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่มันตรวจ (บทเรียนเดียวกับ `forgetAllSignedFiles()`)
 */
export function resetDayBridgeIncompleteForTest(): void {
  const before = isIncomplete();
  bridgeBroken = false;
  rowsDropped = false;
  publish(before);
}
