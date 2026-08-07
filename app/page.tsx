"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { DayStopsSection } from "@/components/DayStopsSection";
import { HotelLegsPanel } from "@/components/HotelLegsPanel";
import { PlaceSidebar } from "@/components/PlaceSidebar";
import { NearbyPlacesModal } from "@/components/NearbyPlacesModal";
import { CATEGORY_EMOJI, cityCenter, type Place } from "@/data/places";
import { CITY_NAME_TH, ITINERARY } from "@/data/itinerary";
import type { Day } from "@/data/itinerary";
import { applyOvernightOverrides, deriveHotelLegs, dayIdToLegId } from "@/lib/hotelLegs";
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

const DEFAULT_PLAN_ID = "plan-default";

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

  // bootstrap: ครั้งแรกที่ยังไม่มีแผนเลย ให้สร้าง "แผนหลัก" แล้วย้ายตัวเลือกเดิมจากระบบ slot คงที่
  // มาเป็น stops (ใช้ id คงที่ กันกรณี 2 คนเปิดพร้อมกันแล้ว bootstrap ซ้ำ — insert ซ้ำจะแค่ error เฉยๆ)
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    if (!plansLoaded || !selectionsLoaded) return;
    if (plans.length > 0) return;
    bootstrapped.current = true;

    async function bootstrap() {
      const rows: TripStop[] = [];
      for (const day of ITINERARY) {
        let orderIndex = 0;
        for (const slot of day.slots) {
          const sel = selections[slot.id];
          if (!sel) continue;
          rows.push({
            id: `stop-boot-${slot.id}`,
            plan_id: DEFAULT_PLAN_ID,
            day_id: day.id,
            place_id: sel.place_id,
            order_index: orderIndex++,
            dwell_minutes: null,
            travel_mode: null,
            note: null,
            added_by: sel.selected_by,
            updated_at: sel.updated_at,
          });
        }
      }
      await createPlan("แผนหลัก", { id: DEFAULT_PLAN_ID, activate: true });
      if (rows.length > 0) await bulkInsert(rows);
    }

    bootstrap();
  }, [plansLoaded, selectionsLoaded, plans.length, selections, createPlan, bulkInsert]);

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

  // DnD ระดับหน้าเดียว — คลุมทั้งคลัง sidebar และจุดแวะทุกวัน เพื่อให้ลากข้ามระหว่างสองฝั่งนี้ได้
  // (ลากจัดลำดับภายในวันเดียวกันก็ยังผ่าน context เดียวกันนี้)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeDrag, setActiveDrag] = useState<
    { kind: "place"; placeId: string } | { kind: "stop"; stopId: string } | null
  >(null);

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
        <header className="bg-pine px-4 pb-8 pt-10 text-cream">
          <div className="mx-auto max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-widest text-gold">
              11 – 21 ต.ค. 2026 · เที่ยวเกาหลี 12–20
            </div>
            <h1 className="mt-1 text-3xl font-extrabold">🍁 แพลนเที่ยวเกาหลี</h1>
            <p className="mt-1 text-sm text-pine-soft/80">
              เลือกสถานที่ในแต่ละวัน — เลือกแล้วอีกคนเห็นทันที
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <input
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="ชื่อคุณ (เช่น เอ / บี)"
                className="w-40 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-cream placeholder:text-cream/50 focus:border-gold focus:outline-none"
              />
              <span className="text-sm text-cream/90">🗺️ {stops.length} จุดในแผนนี้</span>
            </div>

            {plans.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={activePlanId ?? ""}
                  onChange={(e) => switchActivePlan(e.target.value)}
                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-cream focus:border-gold focus:outline-none [&>option]:text-ink"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleNewPlan}
                  className="rounded-lg bg-white/10 px-2.5 py-1.5 font-medium hover:bg-white/20"
                >
                  + แผนใหม่
                </button>
                <button
                  onClick={handleRenamePlan}
                  className="rounded-lg bg-white/10 px-2.5 py-1.5 font-medium hover:bg-white/20"
                >
                  เปลี่ยนชื่อ
                </button>
                {plans.length > 1 && (
                  <button
                    onClick={handleDeletePlan}
                    className="rounded-lg bg-white/10 px-2.5 py-1.5 font-medium text-maple-soft hover:bg-white/20"
                  >
                    ลบแผนนี้
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {/* pb-28 บนมือถือ: เว้นที่ให้ปุ่มลอย "📍 สถานที่" ไม่ไปทับปุ่ม "+ เพิ่มสถานที่" ของวันสุดท้าย */}
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 lg:flex lg:items-start lg:gap-6 lg:pb-6">
          <div className="mx-auto max-w-2xl flex-1 lg:mx-0">
            {!overallLoaded && (
              <div className="py-10 text-center text-sm text-ink-soft">กำลังโหลด...</div>
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
