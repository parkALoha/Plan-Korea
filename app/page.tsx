"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { DayStopsSection } from "@/components/DayStopsSection";
import { HotelLegsPanel } from "@/components/HotelLegsPanel";
import { PlaceSidebar } from "@/components/PlaceSidebar";
import { NearbyPlacesModal } from "@/components/NearbyPlacesModal";
import { TripHeader } from "@/components/TripHeader";
import { DayCardSkeleton } from "@/components/DayCardSkeleton";
import type { Place } from "@/data/places";
import { ITINERARY } from "@/data/itinerary";
import type { Day } from "@/data/itinerary";
import { applyOvernightOverrides } from "@/lib/hotelLegs";
import { resolvePlace } from "@/lib/resolvePlace";
import { haversineKm } from "@/lib/geo";
import type { TravelMode } from "@/lib/schedule";
import type { TripStop } from "@/lib/supabase";
import { useHotels } from "@/hooks/useHotels";
import { useSelections } from "@/hooks/useSelections";
import { usePlans } from "@/hooks/usePlans";
import { useStops } from "@/hooks/useStops";
import { useCustomPlaces } from "@/hooks/useCustomPlaces";
import { useDaySettings } from "@/hooks/useDaySettings";
import { useHiddenPlaces } from "@/hooks/useHiddenPlaces";
import { useOvernightOverrides } from "@/hooks/useOvernightOverrides";
import { useLegacyBootstrap } from "@/hooks/useLegacyBootstrap";
import { useHotelSchedule } from "@/hooks/useHotelSchedule";
import { useTripDnd } from "@/hooks/useTripDnd";

// ระยะที่ถือว่า "เดินไปได้" — ต่ำกว่านี้เดาโหมดเดินทางเป็นเดิน ที่เหลือเดาเป็นขนส่งสาธารณะ
// (ทริปนี้ไม่มีรถส่วนตัว แท็กซี่ต้องเลือกเองเสมอ ไม่ใช่ค่าเริ่มต้น) ใช้ตอนเพิ่ม/แทรกจุดแวะใหม่
// เพื่อให้มันไปดึงเวลาจริงจาก Google มาโชว์ได้ทันทีโดยไม่ต้องรอผู้ใช้กดเลือกโหมดเอง
const WALK_THRESHOLD_KM = 1;

function defaultTravelModeFor(
  fromPlace: { lat: number; lng: number } | null | undefined,
  toPlace: { lat: number; lng: number } | null | undefined
): TravelMode | null {
  if (!fromPlace || !toPlace) return null;
  const km = haversineKm(fromPlace.lat, fromPlace.lng, toPlace.lat, toPlace.lng);
  return km < WALK_THRESHOLD_KM ? "walk" : "transit";
}

export default function Home() {
  // ระบบเดิม (fixed slot) — ยังอ่านไว้เผื่อ bootstrap ครั้งแรกเท่านั้น ไม่ได้ใช้ render แล้ว
  const { selections, loaded: selectionsLoaded } = useSelections();

  const { hotels, setHotel, clearHotel } = useHotels();
  const { plans, activePlanId, loaded: plansLoaded, createPlan, renamePlan, deletePlan, switchActivePlan } =
    usePlans();
  const {
    stops,
    loaded: stopsLoaded,
    addStop,
    insertStopAt,
    reorderStops,
    moveStopToDay,
    updateDwellMinutes,
    updateTravelMode,
    updateNote,
    removeStop,
    bulkInsert,
  } = useStops(activePlanId);
  const { customPlaces, loaded: customPlacesLoaded } = useCustomPlaces();
  const {
    settings: daySettings,
    loaded: daySettingsLoaded,
    setStartTime,
    setReturnTravelMode,
  } = useDaySettings(activePlanId);
  const {
    hiddenPlaceIds,
    loaded: hiddenPlacesLoaded,
    hidePlace,
    unhidePlace,
  } = useHiddenPlaces();
  const {
    overnightOverrides,
    loaded: overnightLoaded,
    setOvernightCity,
  } = useOvernightOverrides();

  // แผนทริปจริงที่ใช้ทั้งหน้า = ITINERARY + คืนที่เลือกเมืองนอนเองไว้ (เช่น คืน 16 ต.ค. คังนึง/ซกโช)
  const itinerary = useMemo(
    () => applyOvernightOverrides(ITINERARY, overnightOverrides),
    [overnightOverrides]
  );

  const [who, setWho] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem("trip-who") ?? "" : ""
  );

  useEffect(() => {
    if (who) window.localStorage.setItem("trip-who", who);
  }, [who]);

  // เมือง/วันที่โฟกัสอยู่ใน sidebar เลือกสถานที่ — คุมจากที่นี่แทนที่จะให้ sidebar เก็บ state เอง
  // เพื่อให้ปุ่ม "+ เพิ่มสถานที่" ในแต่ละวันสั่งโฟกัส sidebar มาที่วันนั้นได้เลย
  // เปิดมาให้อยู่ที่วันแรกในเกาหลี ไม่ใช่วันบิน/พักเครื่องที่ฮานอย (ซึ่งเป็นวันแรกตามลำดับเวลา)
  const firstKoreaDay = ITINERARY.find((d) => d.city !== "hanoi") ?? ITINERARY[0];
  const [activeCity, setActiveCity] = useState<Day["city"]>(firstKoreaDay.city);
  const [focusedDayId, setFocusedDayId] = useState<string>(firstKoreaDay.id);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  function openPickerForDay(dayId: string) {
    const day = itinerary.find((d) => d.id === dayId);
    if (!day) return;
    setActiveCity(day.city);
    setFocusedDayId(dayId);
    // sidebar หลักโชว์อยู่แล้วบนจอใหญ่ (lg ขึ้นไป) — เปิด overlay มือถือเฉพาะจอเล็กที่มันถูกซ่อนอยู่
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarMobileOpen(true);
    }
  }

  useLegacyBootstrap({
    plansLoaded,
    selectionsLoaded,
    plans,
    selections,
    createPlan,
    bulkInsert,
  });

  const { hotelLegs, hotelForDay, hotelBeforeDay } = useHotelSchedule(itinerary, hotels);

  const stopsByDay = useMemo(() => {
    const map: Record<string, TripStop[]> = {};
    for (const stop of stops) {
      (map[stop.day_id] ??= []).push(stop);
    }
    return map;
  }, [stops]);

  // place ที่ถูกเพิ่มลงวันไหนก็ได้ของเมืองนั้นแล้ว — กันไม่ให้โชว์ซ้ำใน sidebar ให้เลือกอีก
  const selectedPlaceIdsByCity = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const day of itinerary) {
      const set = (map[day.city] ??= new Set());
      for (const stop of stopsByDay[day.id] ?? []) set.add(stop.place_id);
    }
    return map;
  }, [itinerary, stopsByDay]);
  const selectedPlaceIdsForCity = useCallback(
    (city: string) => selectedPlaceIdsByCity[city] ?? new Set<string>(),
    [selectedPlaceIdsByCity]
  );

  const lastStopPlaceForDay = useCallback(
    (dayId: string) => {
      const dayStops = stopsByDay[dayId];
      if (!dayStops || dayStops.length === 0) return null;
      return resolvePlace(dayStops[dayStops.length - 1].place_id, customPlaces);
    },
    [stopsByDay, customPlaces]
  );

  // บริบทตอนกด "+ แทรกร้านตรงนี้" ระหว่างจุดแวะ 2 จุด — เก็บวัน/ตำแหน่งที่จะแทรก + จุดศูนย์กลางค้นหา
  // (จุดก่อนหน้าตำแหน่งนั้น) ไว้เปิด modal ค้นร้านอาหารแบบเจาะจงตำแหน่ง แยกจากปุ่ม "ร้านใกล้ๆ" ที่คลังข้างเคียง
  const [insertContext, setInsertContext] = useState<{
    dayId: string;
    atIndex: number;
    center: { lat: number; lng: number };
    prevPlace: Place | null;
  } | null>(null);

  // id ของจุดแวะที่เพิ่งถูกเพิ่ม (ลากหรือกด +) — ใช้ไฮไลต์แถวนั้นสั้นๆ ให้รู้สึกว่า "เพิ่มสำเร็จ"
  const [flashStopId, setFlashStopId] = useState<string | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashNewStop = useCallback((stopId: string | undefined) => {
    if (!stopId) return;
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlashStopId(stopId);
    flashTimeoutRef.current = setTimeout(() => setFlashStopId(null), 1100);
  }, []);

  const { sensors, handleDragStart, handleDragEnd, activeDragLabel } = useTripDnd({
    itinerary,
    customPlaces,
    stops,
    stopsByDay,
    who,
    lastStopPlaceForDay,
    defaultTravelModeFor,
    addStop,
    removeStop,
    reorderStops,
    moveStopToDay,
    flashNewStop,
  });

  async function handleNewPlan() {
    const name = window.prompt("ชื่อแผนใหม่ (เช่น แผน B)");
    if (!name?.trim()) return;
    await createPlan(name.trim(), { duplicateFrom: activePlanId ?? undefined, activate: true });
  }

  async function handleRenamePlan() {
    if (!activePlanId) return;
    const current = plans.find((p) => p.id === activePlanId);
    const name = window.prompt("ตั้งชื่อแผนใหม่", current?.name);
    if (!name?.trim()) return;
    await renamePlan(activePlanId, name.trim());
  }

  async function handleDeletePlan() {
    if (!activePlanId || plans.length <= 1) return;
    const current = plans.find((p) => p.id === activePlanId);
    if (!window.confirm(`ลบแผน "${current?.name}" ทิ้งเลยไหม (ลบจุดแวะในแผนนี้ทั้งหมดด้วย)`)) return;
    await deletePlan(activePlanId);
  }

  const overallLoaded =
    selectionsLoaded &&
    plansLoaded &&
    customPlacesLoaded &&
    hiddenPlacesLoaded &&
    overnightLoaded &&
    (!activePlanId || (stopsLoaded && daySettingsLoaded));
  const activePlan = plans.find((p) => p.id === activePlanId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <main className="min-h-full">
        <TripHeader
          who={who}
          onWhoChange={setWho}
          stopsCount={stops.length}
          plans={plans}
          activePlanId={activePlanId}
          onSwitchPlan={switchActivePlan}
          onNewPlan={handleNewPlan}
          onRenamePlan={handleRenamePlan}
          onDeletePlan={handleDeletePlan}
        />

        {/* pb-28 บนมือถือ: เว้นที่ให้ปุ่มลอย "📍 สถานที่" ไม่ไปทับปุ่ม "+ เพิ่มสถานที่" ของวันสุดท้าย
            lg:max-w-7xl: จอกว้างให้คอลัมน์จุดแวะ (ที่มีแผนที่ต่อวันแปะข้างในอยู่แล้ว) มีที่หายใจ ไม่ใช่ 672px แคบๆ เหมือนเดิม */}
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 lg:flex lg:max-w-7xl lg:items-start lg:gap-6 lg:pb-6">
          <div className="mx-auto max-w-2xl flex-1 lg:mx-0 lg:max-w-none">
            {!overallLoaded && (
              <>
                <DayCardSkeleton />
                <DayCardSkeleton />
                <DayCardSkeleton />
              </>
            )}

            {overallLoaded && (
              <HotelLegsPanel legs={hotelLegs} hotels={hotels} onSave={setHotel} onClear={clearHotel} />
            )}

            {overallLoaded &&
              itinerary.map((day) => (
                <DayStopsSection
                  key={day.id}
                  day={day}
                  stops={stopsByDay[day.id] ?? []}
                  customPlaces={customPlaces}
                  hotel={hotelForDay(day.id)}
                  startHotel={hotelBeforeDay(day.id)}
                  returnTravelMode={
                    (daySettings[day.id]?.return_travel_mode as TravelMode | null) ?? null
                  }
                  onReturnTravelModeChange={(mode) => setReturnTravelMode(day.id, mode)}
                  startTime={daySettings[day.id]?.start_time ?? "07:00"}
                  onStartTimeChange={(value) => setStartTime(day.id, value)}
                  onReorder={(orderedStopIds) => reorderStops(day.id, orderedStopIds)}
                  onOvernightCityChange={
                    day.overnightOptions
                      ? (city) => setOvernightCity(day.id, city)
                      : undefined
                  }
                  onRemoveStop={removeStop}
                  onUpdateDwell={updateDwellMinutes}
                  onUpdateTravelMode={updateTravelMode}
                  onUpdateNote={updateNote}
                  onAddPlace={() => openPickerForDay(day.id)}
                  onInsertPlace={(atIndex, center, prevPlace) =>
                    setInsertContext({ dayId: day.id, atIndex, center, prevPlace })
                  }
                  flashStopId={flashStopId}
                />
              ))}
          </div>

          {overallLoaded && (
            <PlaceSidebar
              itinerary={itinerary}
              customPlaces={customPlaces}
              who={who || undefined}
              lastStopPlaceForDay={lastStopPlaceForDay}
              hotelForDay={hotelForDay}
              onAddStopToDay={(dayId, placeId, coords) => {
                const prevPlace = lastStopPlaceForDay(dayId);
                // coords มาจาก NearbyPlacesModal ตอนสร้าง custom place ใหม่ — ใช้แทน resolvePlace
                // เพราะ customPlaces state ยังไม่ทันมีสถานที่นี้ (รอ realtime echo) ส่วนสถานที่จากคลังปกติ resolve ได้เลย
                const newPlace = coords ?? resolvePlace(placeId, customPlaces);
                addStop(
                  dayId,
                  placeId,
                  who || undefined,
                  defaultTravelModeFor(prevPlace, newPlace)
                ).then(flashNewStop);
              }}
              selectedPlaceIdsForCity={selectedPlaceIdsForCity}
              hiddenPlaceIds={hiddenPlaceIds}
              onHidePlace={(placeId) => hidePlace(placeId, who || undefined)}
              onUnhidePlace={unhidePlace}
              activeCity={activeCity}
              onActiveCityChange={setActiveCity}
              focusedDayId={focusedDayId}
              onFocusedDayIdChange={setFocusedDayId}
              mobileOpen={sidebarMobileOpen}
              onMobileOpenChange={setSidebarMobileOpen}
            />
          )}
        </div>

        {overallLoaded && !activePlan && (
          <div className="fixed inset-x-0 bottom-0 bg-maple-soft px-4 py-2 text-center text-xs text-maple-dark">
            กำลังตั้งค่าแผนเริ่มต้น...
          </div>
        )}
      </main>

      <DragOverlay>
        {activeDragLabel && (
          <div className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ink shadow-lg shadow-ink/20 ring-2 ring-maple">
            {activeDragLabel}
          </div>
        )}
      </DragOverlay>

      {insertContext && (
        <NearbyPlacesModal
          kind="restaurant"
          city={itinerary.find((d) => d.id === insertContext.dayId)?.city ?? activeCity}
          center={insertContext.center}
          addedBy={who || undefined}
          onClose={() => setInsertContext(null)}
          onAdded={(placeId, coords) => {
            insertStopAt(
              insertContext.dayId,
              placeId,
              insertContext.atIndex,
              who || undefined,
              defaultTravelModeFor(insertContext.prevPlace, coords)
            ).then(flashNewStop);
            setInsertContext(null);
          }}
        />
      )}
    </DndContext>
  );
}
