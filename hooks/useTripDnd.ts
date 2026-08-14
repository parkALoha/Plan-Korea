"use client";

import { useMemo, useState } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CATEGORY_EMOJI, type Place } from "@/data/places";
import { CITY_NAME_TH, PLACE_CITY_NAME_TH, type Day } from "@/data/itinerary";
import { resolvePlace } from "@/lib/resolvePlace";
import type { CustomPlace, TripStop } from "@/lib/supabase";
import { showUndoToast } from "@/lib/toast";

interface UseTripDndArgs {
  itinerary: Day[];
  customPlaces: CustomPlace[];
  stops: TripStop[];
  stopsByDay: Record<string, TripStop[]>;
  who: string;
  lastStopPlaceForDay: (dayId: string) => Place | null;
  /** วันที่ถูกล็อกไว้ — ห้ามวางจุดแวะลง และห้ามลากจุดแวะออกไปที่อื่น
   *  (droppable/sortable ฝั่ง UI ปิดไว้แล้ว ตรงนี้เป็นด่านสุดท้ายกันหลุด เช่นลากด้วยคีย์บอร์ด) */
  isDayLocked: (dayId: string) => boolean;
  defaultTravelModeFor: (
    fromPlace: { lat: number; lng: number } | null | undefined,
    toPlace: { lat: number; lng: number } | null | undefined
  ) => string | null;
  addStop: (
    dayId: string,
    placeId: string,
    addedBy?: string,
    travelMode?: string | null
  ) => Promise<string | undefined>;
  /** คืนแถวที่ลบไปทั้งแถว เพื่อเอาไปทำปุ่ม "เลิกทำ" บน toast */
  removeStop: (stopId: string) => Promise<TripStop | undefined>;
  restoreStop: (stop: TripStop) => Promise<void>;
  /** ฝากโน้ต/รูปของจุดแวะไว้กับสถานที่ในคลังก่อนลบแถวทิ้ง (เฟส 22) — คืน false เมื่อไม่มีอะไรให้ฝาก
   *  หรือยังไม่ได้รัน migration 0028 */
  stashPlaceNote: (
    placeId: string,
    note: string | null,
    photoUrl: string | null
  ) => Promise<boolean>;
  /** ล้างโน้ตที่ฝากไว้ — ใช้ตอนกด "เลิกทำ" ซึ่งเอาจุดแวะ (พร้อมโน้ตในตัว) กลับไปที่เดิมแล้ว */
  clearPlaceNote: (placeId: string) => Promise<void>;
  reorderStops: (dayId: string, orderedStopIds: string[]) => Promise<void>;
  moveStopToDay: (stopId: string, targetDayId: string) => Promise<void> | void;
  flashNewStop: (stopId: string | undefined) => void;
}

// DnD ระดับหน้าเดียว — คลุมทั้งคลัง sidebar และจุดแวะทุกวัน เพื่อให้ลากข้ามระหว่างสองฝั่งนี้ได้
// (ลากจัดลำดับภายในวันเดียวกันก็ยังผ่าน context เดียวกันนี้)
export function useTripDnd({
  itinerary,
  customPlaces,
  stops,
  stopsByDay,
  who,
  lastStopPlaceForDay,
  isDayLocked,
  defaultTravelModeFor,
  addStop,
  removeStop,
  restoreStop,
  stashPlaceNote,
  clearPlaceNote,
  reorderStops,
  moveStopToDay,
  flashNewStop,
}: UseTripDndArgs) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeDrag, setActiveDrag] = useState<
    { kind: "place"; placeId: string } | { kind: "stop"; stopId: string } | null
  >(null);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { type: "place"; placeId: string }
      | { type: "stop"; dayId: string }
      | undefined;
    if (!data) return;
    setActiveDrag(
      data.type === "place"
        ? { kind: "place", placeId: data.placeId }
        : { kind: "stop", stopId: event.active.id as string }
    );
  }

  /** ป้ายชื่อสั้นๆ ของจุดแวะ ใช้ในข้อความ toast — แถวพิเศษ (ข้ามเมือง/ที่พัก/สนามบิน) resolve ไม่ได้ ใช้คำกลางๆ */
  function stopLabel(stopId: string) {
    const placeId = stops.find((s) => s.id === stopId)?.place_id;
    const place = placeId ? resolvePlace(placeId, customPlaces) : null;
    return place ? `${CATEGORY_EMOJI[place.category]} ${place.nameTh}` : "จุดแวะนี้";
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as
      | { type: "place"; placeId: string }
      | { type: "stop"; dayId: string }
      | undefined;
    const overData = over.data.current as
      | { type: "day"; dayId: string }
      | { type: "stop"; dayId: string }
      | { type: "library" }
      | undefined;
    if (!activeData) return;

    const targetDayId = overData?.type === "day" || overData?.type === "stop" ? overData.dayId : null;

    // วันปลายทางล็อกอยู่ = ไม่รับอะไรทั้งนั้น / วันต้นทางล็อกอยู่ = ลากจุดแวะออกไม่ได้
    if (targetDayId && isDayLocked(targetDayId)) return;
    if (activeData.type === "stop" && isDayLocked(activeData.dayId)) return;

    if (activeData.type === "place") {
      // ลากการ์ดจากคลังมาวางในวัน — ถ้าคนละเมืองแค่เตือน (เผื่อวันเดินทางที่แวะได้สองเมือง) ไม่บล็อกเงียบๆ
      if (!targetDayId) return;
      const targetDay = itinerary.find((d) => d.id === targetDayId);
      const place = resolvePlace(activeData.placeId, customPlaces);
      if (!targetDay || !place) return;
      const prevPlace = lastStopPlaceForDay(targetDayId);
      addStop(
        targetDayId,
        activeData.placeId,
        who || undefined,
        defaultTravelModeFor(prevPlace, place)
      ).then((stopId) => {
        flashNewStop(stopId);
        // คนละเมืองกับที่เที่ยววันนั้น — ทำให้ก่อนแล้วค่อยบอก พร้อมทางกลับ (วันทางผ่านเที่ยว 2 เมืองได้จริง
        // การเด้งกล่อง "แน่ใจไหม" ขวางทุกครั้งจึงผิดมากกว่าถูก) แทน window.confirm เดิม — เฟส 20.2
        if (place.city !== targetDay.city && stopId) {
          showUndoToast(
            `"${place.nameTh}" อยู่ที่${PLACE_CITY_NAME_TH[place.city]} แต่วันนี้เที่ยว${CITY_NAME_TH[targetDay.city]}`,
            () => removeStop(stopId)
          );
        }
      });
      return;
    }

    // activeData.type === "stop"
    const stopId = active.id as string;
    if (overData?.type === "library") {
      const label = stopLabel(stopId);
      const stop = stops.find((s) => s.id === stopId);
      // "เก็บกลับคลัง" = พักไว้ก่อน ไม่ใช่ทิ้ง — โน้ต/รูปจึงย้ายไปฝากไว้กับตัวสถานที่ในคลัง
      // แล้วติดกลับมาเองตอนลากลงวันอีกครั้ง (เฟส 22) · แถว trip_stops ยังถูกลบเหมือนเดิม
      const stashing = stop
        ? stashPlaceNote(stop.place_id, stop.note ?? null, stop.photo_url ?? null)
        : Promise.resolve(false);
      stashing.then((stashed) =>
        removeStop(stopId).then((snapshot) => {
          if (!snapshot) return;
          showUndoToast(
            stashed ? `เก็บ ${label} กลับคลังแล้ว — โน้ตติดไปด้วย` : `เอา ${label} ออกจากแผนแล้ว`,
            () => {
              // จุดแวะที่กู้คืนมามีโน้ต/รูปติดมาในตัวอยู่แล้ว ตัวที่ฝากไว้ในคลังจึงต้องล้างทิ้ง
              // ไม่งั้นสถานที่เดียวกันจะมีโน้ตค้างอยู่ 2 ที่
              restoreStop(snapshot);
              if (stashed) clearPlaceNote(snapshot.place_id);
            }
          );
        })
      );
      return;
    }
    if (!targetDayId) return;

    if (targetDayId === activeData.dayId) {
      if (overData?.type !== "stop" || over.id === active.id) return;
      const dayStops = stopsByDay[targetDayId] ?? [];
      const oldIndex = dayStops.findIndex((s) => s.id === active.id);
      const newIndex = dayStops.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      reorderStops(
        targetDayId,
        arrayMove(dayStops, oldIndex, newIndex).map((s) => s.id)
      );
      return;
    }

    // ย้ายข้ามวัน — คนละเมืองก็แค่เตือนเหมือนกัน (ทริปทางผ่านบางทีก็เที่ยว 2 เมืองในวันเดียวได้จริง)
    const targetDay = itinerary.find((d) => d.id === targetDayId);
    const movingStop = stops.find((s) => s.id === stopId);
    const place = movingStop ? resolvePlace(movingStop.place_id, customPlaces) : null;
    if (!targetDay || !place) return;
    const sourceDayId = activeData.dayId;
    Promise.resolve(moveStopToDay(stopId, targetDayId)).then(() => {
      if (place.city !== targetDay.city) {
        showUndoToast(
          `"${place.nameTh}" อยู่ที่${PLACE_CITY_NAME_TH[place.city]} แต่วันนี้เที่ยว${CITY_NAME_TH[targetDay.city]}`,
          () => moveStopToDay(stopId, sourceDayId)
        );
      }
    });
  }

  const activeDragLabel = useMemo(() => {
    if (!activeDrag) return null;
    const placeId = activeDrag.kind === "place" ? activeDrag.placeId : stops.find((s) => s.id === activeDrag.stopId)?.place_id;
    if (!placeId) return null;
    const place = resolvePlace(placeId, customPlaces);
    return place ? `${CATEGORY_EMOJI[place.category]} ${place.nameTh}` : null;
  }, [activeDrag, customPlaces, stops]);

  return { sensors, handleDragStart, handleDragEnd, activeDragLabel };
}
