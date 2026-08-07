"use client";

import { useCallback, useMemo } from "react";
import { deriveHotelLegs, dayIdToLegId } from "@/lib/hotelLegs";
import type { Day } from "@/data/itinerary";
import type { TripHotel } from "@/lib/supabase";

export function useHotelSchedule(itinerary: Day[], hotels: Record<string, TripHotel>) {
  const hotelLegs = useMemo(() => deriveHotelLegs(itinerary), [itinerary]);
  const legIdByDayId = useMemo(() => dayIdToLegId(hotelLegs), [hotelLegs]);

  const hotelForDay = useCallback(
    (dayId: string) => {
      const legId = legIdByDayId[dayId];
      return legId ? hotels[legId] ?? null : null;
    },
    [legIdByDayId, hotels]
  );

  // ที่พักที่ "ออกมาตอนเช้า" ของวันนั้น = ที่พักของคืนก่อนหน้า
  // วันย้ายเมือง (เช่น เช้าอยู่ปูซาน คืนนอนซกโช) จึงเริ่มวันที่โรงแรมปูซาน แล้วไปจบที่โรงแรมซกโช
  // วันแรกของทริป / วันที่คืนก่อนหน้าไม่มีที่พัก (นอนบนเครื่อง) คืน null
  const hotelBeforeDay = useCallback(
    (dayId: string) => {
      const index = itinerary.findIndex((d) => d.id === dayId);
      for (let i = index - 1; i >= 0; i--) {
        const legId = legIdByDayId[itinerary[i].id];
        if (legId) return hotels[legId] ?? null;
      }
      return null;
    },
    [itinerary, legIdByDayId, hotels]
  );

  return { hotelLegs, legIdByDayId, hotelForDay, hotelBeforeDay };
}
