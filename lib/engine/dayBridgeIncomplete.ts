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

let incomplete = false;
const listeners = new Set<() => void>();

function setDayBridgeIncomplete(next: boolean): void {
  if (next === incomplete) return;
  incomplete = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const getSnapshot = () => incomplete;
/** SSR ถือว่าสะพานปกติเสมอ — ค่าจริงมาหลัง hydrate เหมือน `useOnlineStatus` */
const getServerSnapshot = () => false;

/** แถบ "ทริปนี้ยังแสดงข้อมูลบางส่วนไม่ได้" — ดู `components/DayBridgeIncompleteBanner.tsx` */
export function useDayBridgeIncomplete(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * เรียกทันทีหลัง `buildDayBridge()` ทุกครั้งที่ 4 hook สร้างสะพาน — ตั้ง/ล้างสถานะแถบตามผลจริงของ
 * สะพานปัจจุบัน (ไม่สะสม ไม่ latch ค้าง) `matched === 0` (มีวันในไฟล์แต่ไม่มีคู่ในฐานเลยสักวัน) หรือ
 * `unmatchedLegacy` ไม่ว่าง (มีบางวันหลุด) ทั้งสองแบบคือ "สะพานนี้ใช้ไม่ได้เต็มที่"
 */
export function reportDayBridgeWarningIfAny(bridge: DayBridge, totalLegacyDays: number): void {
  const looksBroken = (totalLegacyDays > 0 && bridge.matched === 0) || bridge.unmatchedLegacy.length > 0;
  setDayBridgeIncomplete(looksBroken);
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
  if (dropped) setDayBridgeIncomplete(true);
  return dropped;
}
