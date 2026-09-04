"use client";

import { useCallback, useMemo } from "react";
import { deriveHotelLegs, dayIdToLeg, dayIdToLegId, hotelOfLeg } from "@/lib/hotelLegs";
import type { Day } from "@/data/itinerary";
import type { TripHotel } from "@/lib/supabase";

/**
 * 🔴 **แก้ 4 ก.ย. 2026 (P1 ชี้ · P2 ยืนยันแล้วแก้) — `hotelForDay`/`hotelBeforeDay` คืน `null` เสมอ**
 *
 * เดิมทั้งคู่หาที่พักด้วย `hotels[legId]` โดย `legId` มาจาก `dayIdToLegId()` = **`day.id`** (`"d1"`)
 * แต่แมป `hotels` คีย์ด้วย **ช่วงวันที่** (`"2026-10-12..2026-10-15"`) ตั้งแต่ `D51` (`useHotels.tsx:64`)
 * ⇒ คนละจักรวาลคีย์ **ไม่มีวันเจอ** → `startAnchor`/`endAnchor` ของ `useDaySchedule` ไม่เคยถูกตั้ง
 *   → ที่พักไม่เคยเป็นจุดเริ่ม-จบของวันเลยแม้แต่วันเดียว
 *
 * 🎯 **ไม่มีอะไรฟ้องเพราะ `hotels` เป็น `Record<string, TripHotel>`** — ดัชนีด้วยสตริงอะไรก็
 * คอมไพล์ผ่าน และผลลัพธ์ `undefined` ถูกกลืนด้วย `?? null` ที่บรรทัดเดียวกัน · อาการปลายทาง
 * ("วันนี้ไม่มีที่พัก") **แยกไม่ออกจากสภาพปกติของทริปที่ยังไม่ได้จองที่พัก**
 * · 📌 คอมมิตที่เปลี่ยนคีย์คือ `67f6fc7` ซึ่ง **ไม่ได้แตะไฟล์นี้เลย** — ความหมายของค่าที่รับมา
 *   เปลี่ยนใต้เท้า (รูปเดียวกับ `bridge.matched` ที่ `useOvernightOverrides` โดนเมื่อ 30 ส.ค.)
 * · ยังไม่มีเทสต์คลุม `hotelForDay` — เทสต์ของ `lib/hotelLegs.ts` ตรวจแค่ตัวแมป ไม่ได้ตรวจ *การใช้แมป*
 *
 * ✅ ตัวแปลงเดียวคือ `hotelOfLeg(hotels, leg)` — รับ **leg ทั้งใบ** จึงไม่มีรูปให้เลือกคีย์ผิดอีก
 */
export function useHotelSchedule(itinerary: Day[], hotels: Record<string, TripHotel>) {
  const hotelLegs = useMemo(() => deriveHotelLegs(itinerary), [itinerary]);
  const legIdByDayId = useMemo(() => dayIdToLegId(hotelLegs), [hotelLegs]);
  const legByDayId = useMemo(() => dayIdToLeg(hotelLegs), [hotelLegs]);

  const hotelForDay = useCallback(
    (dayId: string) => {
      const leg = legByDayId[dayId];
      return leg ? hotelOfLeg(hotels, leg) : null;
    },
    [legByDayId, hotels]
  );

  // ที่พักที่ "ออกมาตอนเช้า" ของวันนั้น = ที่พักของคืนก่อนหน้า
  // วันย้ายเมือง (เช่น เช้าอยู่ปูซาน คืนนอนซกโช) จึงเริ่มวันที่โรงแรมปูซาน แล้วไปจบที่โรงแรมซกโช
  // วันแรกของทริป / วันที่คืนก่อนหน้าไม่มีที่พัก (นอนบนเครื่อง) คืน null
  const hotelBeforeDay = useCallback(
    (dayId: string) => {
      const index = itinerary.findIndex((d) => d.id === dayId);
      for (let i = index - 1; i >= 0; i--) {
        const leg = legByDayId[itinerary[i].id];
        // 🔴 หยุดที่วันแรกที่ *มี leg* ไม่ใช่วันแรกที่ *มีที่พัก* — พฤติกรรมเดิม ตั้งใจคงไว้:
        //    เมื่อคืนมี leg แต่ยังไม่ได้จอง = "ยังไม่ได้จอง" ไม่ใช่ "ไปเอาที่พักของสองคืนก่อนมาแทน"
        if (leg) return hotelOfLeg(hotels, leg);
      }
      return null;
    },
    [itinerary, legByDayId, hotels]
  );

  return { hotelLegs, legIdByDayId, hotelForDay, hotelBeforeDay };
}
