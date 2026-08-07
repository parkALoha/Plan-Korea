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
import { CITY_NAME_TH, type Day } from "@/data/itinerary";
import { resolvePlace } from "@/lib/resolvePlace";
import type { CustomPlace, TripStop } from "@/lib/supabase";

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
  removeStop: (stopId: string) => Promise<void>;
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
      if (
        place.city !== targetDay.city &&
        !window.confirm(
          `"${place.nameTh}" อยู่ที่${CITY_NAME_TH[place.city]} แต่วันนี้เที่ยว${CITY_NAME_TH[targetDay.city]} ต้องการเพิ่มเข้าวันนี้เลยไหม?`
        )
      ) {
        return;
      }
      const prevPlace = lastStopPlaceForDay(targetDayId);
      addStop(
        targetDayId,
        activeData.placeId,
        who || undefined,
        defaultTravelModeFor(prevPlace, place)
      ).then(flashNewStop);
      return;
    }

    // activeData.type === "stop"
    const stopId = active.id as string;
    if (overData?.type === "library") {
      removeStop(stopId);
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
    if (
      place.city !== targetDay.city &&
      !window.confirm(
        `"${place.nameTh}" อยู่ที่${CITY_NAME_TH[place.city]} แต่วันนี้เที่ยว${CITY_NAME_TH[targetDay.city]} ต้องการย้ายมาวันนี้เลยไหม?`
      )
    ) {
      return;
    }
    moveStopToDay(stopId, targetDayId);
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
