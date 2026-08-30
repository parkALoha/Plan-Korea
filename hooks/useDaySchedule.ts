"use client";

import { useCallback, useMemo } from "react";
import { CITY_LOCALE, type Place } from "@/data/places";
import type { Day, DayEvent } from "@/data/itinerary";
import type { CustomPlace, TripHotel, TripStop } from "@/lib/supabase";
import { resolvePlace } from "@/lib/resolvePlace";
import {
  computeSchedule,
  estimateTravelMinutesBetween,
  timeToMinutes,
  type DaySchedule,
  type PointRef,
  type ScheduleAnchor,
  type ScheduleStopInput,
  type ScheduledStop,
  type TravelMode,
} from "@/lib/schedule";
import { useDayTravelTimes, type TravelTimePair } from "@/hooks/useDayTravelTimes";
import { useDayOpeningHours } from "@/hooks/useDayOpeningHours";
import { isOpenDuring } from "@/lib/openingHours";
import { placeQueryKey } from "@/lib/placeQuery";
import { hotelAnchorId } from "@/lib/hotelLegs";
import { shouldSkipTravelApi } from "@/lib/engine/countries";
import { countryOfCitySlug } from "@/data/emergency";

/**
 * ตรรกะคำนวณตารางเวลาทั้งวัน — ดึงออกมาจาก DayStopsSection (เดิมฝังอยู่ในนั้นล้วนๆ)
 * เพื่อให้หน้า "วันนี้" (เฟส 6) ใช้ตรรกะเดียวกันเป๊ะกับหน้าแผน ไม่ต้องคำนวณซ้ำแล้วเสี่ยงเวลาไม่ตรงกัน
 */
export function useDaySchedule({
  day,
  stops,
  customPlaces,
  hotel,
  startHotel,
  returnTravelMode,
  startTime,
  eventsSplit,
}: {
  day: Day;
  stops: TripStop[];
  /**
   * 🔴 **ผลการแบ่ง event ที่ผู้เรียกแยกมาแล้ว** (`B6` · 30 ส.ค. 2026 · P3)
   * วันจากฐานไม่มี `day.events` — event เป็นแถวใน `trip_stops` (`kind='event'`)
   * ผู้เรียกกรองออกจาก `stops` แล้วแบ่งด้วย `lib/engine/dayEvents.ts` **ซึ่งเป็นที่เดียวที่มีกฎ**
   * ⚠️ ส่ง *ผลการแบ่ง* ไม่ใช่อาเรย์ดิบ — ถ้าส่งดิบมา กฎจะถูกเขียนซ้ำที่นี่อีกใบ ซึ่งเป็นสิ่งที่
   *    `dayBridge.ts` เตือนไว้เองว่า *"ถ้าแต่ละตัวแปลงเอง มันจะแปลงไม่เหมือนกันสักวัน"*
   */
  eventsSplit?: { before: DayEvent[]; after: DayEvent[] };
  customPlaces: CustomPlace[];
  hotel: TripHotel | null;
  startHotel: TripHotel | null;
  returnTravelMode: TravelMode | null;
  /** เวลาออกเดินทางที่ตั้งเองไว้ — null = ยังไม่เคยตั้ง ให้ใช้ค่า default ของวันนั้น (ดู effectiveStartTime) */
  startTime: string | null;
}) {
  const mealCount = useMemo(
    () =>
      stops.filter((s) => resolvePlace(s.place_id, customPlaces)?.category === "restaurant").length,
    [stops, customPlaces]
  );

  const placesById = useMemo(() => {
    const map = new Map<string, Place>();
    for (const stop of stops) {
      const place = resolvePlace(stop.place_id, customPlaces);
      if (place) map.set(stop.place_id, place);
    }
    return map;
  }, [stops, customPlaces]);

  // ที่พักหัว-ท้ายวัน: ออกจากที่พักคืนก่อน (startHotel) ตอนเช้า แล้วกลับไปนอนที่พักคืนนี้ (hotel) ตอนค่ำ
  // ใช้ hotelAnchorId (อิงพิกัด) เป็น id ของจุด เพื่อให้แคชเวลาเดินทางคีย์เดียวกับ useHotelDistance
  // และเปลี่ยนโรงแรมของ leg เดิมแล้วได้ key ใหม่เองทันที ไม่ค้างเวลาของโรงแรมเก่า (บั๊ก 9.1)
  const startAnchorMode = (stops[0]?.travel_mode as TravelMode | null) ?? null;
  const startAnchor: ScheduleAnchor | null = startHotel
    ? {
        id: hotelAnchorId(startHotel),
        lat: startHotel.lat,
        lng: startHotel.lng,
        label: startHotel.hotel_name,
        mode: startAnchorMode,
      }
    : null;
  const endAnchor: ScheduleAnchor | null = hotel
    ? {
        id: hotelAnchorId(hotel),
        lat: hotel.lat,
        lng: hotel.lng,
        label: hotel.hotel_name,
        mode: returnTravelMode,
      }
    : null;

  // ประเทศของวันนี้ — ใช้แค่ตัดสินว่า "ควรยิง API ไหม" (shouldSkipTravelApi) ไม่ใช่ตัดสิน "จริงหรือประมาณ"
  // ซึ่งยังเป็นหน้าที่ของ isTravelTimeReal (ผลจริงที่ยิงมาแล้ว) เหมือนเดิมทุกจุด — สองคำถามคนละคำถามกัน
  // (P1: "ทะเบียนตอบว่า 'อย่ายิง' ไม่ใช่ 'อย่าเชื่อ'")
  // 🔴 ยังเป็น country **ระดับวัน** ไม่ใช่ระดับสถานที่ — รอ P3 ใส่ country ของสถานที่จริงเข้า hook แล้วค่อยสลับ
  //    (ข้อความเดิมตรงนี้เขียนว่า "ยังใช้ countryOfCity() ชั่วคราว" ซึ่ง **หมดอายุตั้งแต่ 29 ส.ค. 2026**
  //     ตอนสลับมา countryOfCitySlug — และมันขัดกับคอมเมนต์บรรทัดถัดไปในไฟล์เดียวกัน · P1 จับได้ตอนรีวิว)
  // 🔴 `countryOfCitySlug` — ตัวเก่า `countryOfCity()` ซ่อนการ index `COUNTRY_OF_CITY[city]` ไว้ในฟังก์ชัน
  //    → `undefined` ทันทีที่วันมาจากฐาน · `shouldSkipTravelApi(null, …)` = `false` = **ยิง** ซึ่งถูกแล้ว
  //    (ทะเบียนไม่รู้จัก → ให้ผลจริงสอนเรา · เขียนไว้ที่ lib/engine/countries.ts เอง)
  const country = countryOfCitySlug(day.city);

  // คู่จุดที่เลือกโหมดเดินทางแล้วเท่านั้นที่ต้องขอเวลาจริง — คู่ที่ยังไม่เลือกโหมดใช้แค่ตัวเลือกในหน้า picker
  const travelPairs = useMemo(() => {
    const pairs: TravelTimePair[] = [];
    const push = (from: PointRef, to: PointRef, mode: TravelMode | null) => {
      if (!mode) return;
      // รู้แน่ว่าประเทศนี้ไม่เคยตอบโหมดนี้จริง (เช่น kr/DRIVE) — ข้ามได้ ประหยัด quota + ไม่ต้องรอ
      // ประเทศที่ไม่มีในทะเบียนเลย shouldSkipTravelApi คืน false เสมอ (ต้องยิง ให้ผลจริงสอนทะเบียนต่อไป)
      if (shouldSkipTravelApi(country, mode)) return;
      pairs.push({
        fromId: from.id,
        toId: to.id,
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
        mode,
      });
    };

    const firstPlace = stops.length > 0 ? placesById.get(stops[0].place_id) : undefined;
    if (startAnchor && firstPlace) push(startAnchor, firstPlace, startAnchor.mode);

    for (let i = 1; i < stops.length; i++) {
      const mode = stops[i].travel_mode as TravelMode | null;
      const from = placesById.get(stops[i - 1].place_id);
      const to = placesById.get(stops[i].place_id);
      if (!from || !to) continue;
      push(from, to, mode);
    }

    const lastPlace =
      stops.length > 0 ? placesById.get(stops[stops.length - 1].place_id) : undefined;
    if (endAnchor && lastPlace) push(lastPlace, endAnchor, endAnchor.mode);

    return pairs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stops,
    placesById,
    startAnchor?.id,
    startAnchor?.mode,
    endAnchor?.id,
    endAnchor?.mode,
    country,
  ]);

  const realTravelTimes = useDayTravelTimes(travelPairs);

  const mapsQueries = useMemo(
    () => Array.from(new Set(Array.from(placesById.values()).map(placeQueryKey))),
    [placesById]
  );
  // ภาษาท้องถิ่นของเมืองที่เที่ยววันนี้ — ใช้ขอชื่อ/ที่อยู่ภาษาท้องถิ่นมาพร้อมกันในคำขอเดียว (เฟส 14)
  const openingHoursByQuery = useDayOpeningHours(mapsQueries, CITY_LOCALE[day.city]);

  // เหตุการณ์ตายตัว (เที่ยวบิน ฯลฯ) แบ่งเป็นก่อน/หลังช่วงว่างที่แทรกจุดแวะได้ ด้วย anchor "before"/"after"
  // (ดู DayEvent ใน data/itinerary.ts) — ถ้าวันนี้ไม่มี anchor เลย events ทั้งหมดจะแสดงเหนือจุดแวะเหมือนเดิม
  // 🔴 `eventsSplit` (ทริปจากฐาน) ชนะ `day.events` (ไฟล์ทริปเกาหลีเดิม) — วันหนึ่งจะมีแค่ทางเดียว
  const legacyBeforeAnchor = day.events?.find((e) => e.anchor === "before");
  const legacyBeforeIndex = legacyBeforeAnchor ? day.events!.indexOf(legacyBeforeAnchor) : -1;
  const eventsBeforeStops = eventsSplit
    ? eventsSplit.before
    : legacyBeforeIndex >= 0
      ? day.events!.slice(0, legacyBeforeIndex + 1)
      : day.events;
  const eventsAfterStops = eventsSplit
    ? eventsSplit.after
    : legacyBeforeIndex >= 0
      ? day.events!.slice(legacyBeforeIndex + 1)
      : [];
  // เวลาเริ่มต้นที่แนะนำ = เวลาของ anchor `before` — หาในผลการแบ่ง ไม่ใช่ใน `day.events` เท่านั้น
  const beforeAnchorEvent = legacyBeforeAnchor ?? eventsBeforeStops?.find((e) => e.anchor === "before");
  const afterAnchorEvent =
    day.events?.find((e) => e.anchor === "after") ?? eventsAfterStops.find((e) => e.anchor === "after");

  // เวลาเริ่มนับตารางจุดแวะของวันนี้ ตามลำดับความสำคัญ:
  //   1) เวลาที่ตั้งเองไว้ (ตั้งได้ทุกวัน รวมวันบิน — บางทีผ่าน ตม. เร็ว/ช้ากว่าที่เผื่อไว้)
  //   2) เหตุการณ์ตายตัวที่เป็นจุดเริ่มของช่วงว่าง (เช่น ถึงย่านเมืองเก่า 15:30) = ค่าเริ่มต้นที่แนะนำ
  //   3) 07:00 (วันเที่ยวปกติ)
  const defaultStartTime = beforeAnchorEvent?.time ?? "07:00";
  // startTime ?? defaultStartTime ไม่พอ — "" (จากล้างช่อง <input type="time">) เป็น falsy แต่ไม่ใช่ null/undefined
  // ก่อนเฟส 7.3 ค่านี้เคยหลุดไปเป็น effectiveStartTime ตรงๆ แล้วพัง timeToMinutes ทั้งวัน
  const effectiveStartTime = startTime && startTime.trim() !== "" ? startTime : defaultStartTime;

  // เวลาเดินทางจริงจาก Google ถ้ามีในแคชแล้ว ไม่งั้นใช้ประมาณการเส้นตรง — ใช้ทั้งจุดแวะและที่พัก
  const resolveTravelMinutes = useCallback(
    (from: PointRef, to: PointRef, mode: TravelMode | null) => {
      if (mode) {
        const real = realTravelTimes.get(`${from.id}|${to.id}|${mode}`);
        if (real?.minutes != null) return real.minutes;
      }
      return estimateTravelMinutesBetween(from, to, mode);
    },
    [realTravelTimes]
  );

  const buildSchedule = useCallback(
    (orderedStops: TripStop[]): DaySchedule => {
      const inputs: ScheduleStopInput[] = orderedStops.map((s) => ({
        id: s.id,
        placeId: s.place_id,
        dwellMinutes: s.dwell_minutes,
        travelMode: (s.travel_mode as TravelMode | null) ?? null,
      }));
      return computeSchedule(effectiveStartTime, inputs, placesById, resolveTravelMinutes, {
        start: startAnchor,
        end: endAnchor,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      effectiveStartTime,
      placesById,
      resolveTravelMinutes,
      startAnchor?.id,
      startAnchor?.mode,
      endAnchor?.id,
      endAnchor?.mode,
    ]
  );

  const daySchedule = useMemo(() => buildSchedule(stops), [buildSchedule, stops]);
  const schedule: ScheduledStop[] = daySchedule.stops;

  // จุดแวะวันนี้จบช้ากว่าเดดไลน์ตายตัว (เช่น ต้องออกไปขึ้นเครื่อง) ไปกี่นาที — null ถ้าไม่มีเดดไลน์หรือยังไม่เลย
  // นับถึงตอนกลับถึงที่พักด้วยถ้ามีที่พักปลายทาง (เดิมนับแค่ถึงเวลาออกจากจุดสุดท้าย)
  // ใช้ endOfDayMinutes (นาทีสะสมไม่ wrap) แทนการ parse สตริง HH:MM ที่ห่อรอบมาแล้ว — เดิมจบ 00:30 เทียบเดดไลน์
  // 22:00 ได้ค่าติดลบผิดๆ (บั๊ก 7.4) เพราะ timeToMinutes("00:30") ไม่รู้ว่าเป็นของ "วันถัดไป"
  const deadlineOverrunMinutes = useMemo(() => {
    if (!afterAnchorEvent || schedule.length === 0) return null;
    const deadlineMinutes = timeToMinutes(afterAnchorEvent.time) ?? 0;
    const over = daySchedule.endOfDayMinutes - deadlineMinutes;
    return over > 0 ? over : null;
  }, [afterAnchorEvent, schedule.length, daySchedule.endOfDayMinutes]);

  const isTravelTimeReal = useCallback(
    (fromId: string, toId: string, mode: TravelMode | null) =>
      mode != null && realTravelTimes.get(`${fromId}|${toId}|${mode}`)?.minutes != null,
    [realTravelTimes]
  );

  const isClosedAt = useCallback(
    (place: Place, arrivalMinutes: number, departureMinutes: number) =>
      isOpenDuring(openingHoursByQuery.get(placeQueryKey(place)), day.date, arrivalMinutes, departureMinutes) ===
      false,
    [openingHoursByQuery, day.date]
  );

  const closedStopIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of schedule) {
      if (s.place && isClosedAt(s.place, s.arrivalMinutes, s.departureMinutes)) set.add(s.id);
    }
    return set;
  }, [schedule, isClosedAt]);

  // โหมดที่ใช้บ่อยสุดของวัน ใช้เป็น travelmode ของลิงก์ Google Maps ทั้งวัน
  const dominantMode = useMemo<TravelMode>(() => {
    const count: Record<string, number> = {};
    for (const s of stops) if (s.travel_mode) count[s.travel_mode] = (count[s.travel_mode] ?? 0) + 1;
    if (returnTravelMode) count[returnTravelMode] = (count[returnTravelMode] ?? 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return (top?.[0] as TravelMode | undefined) ?? "transit";
  }, [stops, returnTravelMode]);

  const hasEstimatedLeg = schedule.some(
    (s, i) =>
      i > 0 &&
      s.place != null &&
      schedule[i - 1].place != null &&
      !isTravelTimeReal(schedule[i - 1].place!.id, s.place.id, s.travelMode)
  );

  const firstPlace = schedule[0]?.place;
  const lastPlace = schedule[schedule.length - 1]?.place;
  const showStartAnchorRow = startAnchor != null && firstPlace != null;
  const showEndAnchorRow = endAnchor != null && lastPlace != null;

  return {
    mealCount,
    placesById,
    startAnchor,
    endAnchor,
    startAnchorMode,
    openingHoursByQuery,
    beforeAnchorEvent,
    afterAnchorEvent,
    eventsBeforeStops,
    eventsAfterStops,
    defaultStartTime,
    effectiveStartTime,
    buildSchedule,
    daySchedule,
    schedule,
    deadlineOverrunMinutes,
    isTravelTimeReal,
    isClosedAt,
    closedStopIds,
    dominantMode,
    hasEstimatedLeg,
    firstPlace,
    lastPlace,
    showStartAnchorRow,
    showEndAnchorRow,
  };
}
