"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { DayStopsSection } from "@/components/DayStopsSection";
import { HotelLegsPanel } from "@/components/HotelLegsPanel";
import { BookingsPanel } from "@/components/BookingsPanel";
import { ChecklistPanel } from "@/components/ChecklistPanel";
import { PlaceSidebar } from "@/components/PlaceSidebar";
import { NearbyPlacesModal } from "@/components/NearbyPlacesModal";
import { IntercityEditModal } from "@/components/IntercityEditModal";
import { TransferEditModal } from "@/components/TransferEditModal";
import { PlanEditModal, type PlanEditMode } from "@/components/PlanEditModal";
import { TripHeader } from "@/components/TripHeader";
import { TripPrepPanel } from "@/components/TripPrepPanel";
import { DayCardSkeleton } from "@/components/DayCardSkeleton";
import { CATEGORY_EMOJI, type Place } from "@/data/places";
import { ITINERARY } from "@/data/itinerary";
import type { City, Day } from "@/data/itinerary";
import { applyOvernightOverrides, hotelAnchorId } from "@/lib/hotelLegs";
import { resolvePlace } from "@/lib/resolvePlace";
import { haversineKm } from "@/lib/geo";
import { showUndoToast } from "@/lib/toast";
import type { TravelMode } from "@/lib/schedule";
import type { TripStop } from "@/lib/supabase";
import { useHotels } from "@/hooks/useHotels";
import { useBookings } from "@/hooks/useBookings";
import { useChecklist } from "@/hooks/useChecklist";
import { usePlans } from "@/hooks/usePlans";
import { useStops } from "@/hooks/useStops";
import { useCustomPlaces } from "@/hooks/useCustomPlaces";
import { usePlaceNotes } from "@/hooks/usePlaceNotes";
import { useDaySettings } from "@/hooks/useDaySettings";
import { useHiddenPlaces } from "@/hooks/useHiddenPlaces";
import { useOvernightOverrides } from "@/hooks/useOvernightOverrides";
import { useHotelSchedule } from "@/hooks/useHotelSchedule";
import { useTripDnd } from "@/hooks/useTripDnd";
import { useTripWeather } from "@/hooks/useTripWeather";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { BottomNav } from "@/components/BottomNav";
import { DayJumpBar } from "@/components/DayJumpBar";

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
  const { hotels, setHotel, clearHotel } = useHotels();
  const {
    bookings,
    loaded: bookingsLoaded,
    addBooking,
    updateBooking,
    removeBooking,
  } = useBookings();
  const {
    items: checklistItems,
    loaded: checklistLoaded,
    addItem: addChecklistItem,
    toggleItem: toggleChecklistItem,
    removeItem: removeChecklistItem,
    restoreItem: restoreChecklistItem,
  } = useChecklist();
  const { plans, activePlanId, loaded: plansLoaded, createPlan, renamePlan, deletePlan, switchActivePlan } =
    usePlans();
  const {
    stops,
    loaded: stopsLoaded,
    addStop,
    insertStopAt,
    insertIntercityAt,
    insertTransferAt,
    insertHotelAt,
    reorderStops,
    moveStopToDay,
    updateDwellMinutes,
    updateTravelMode,
    updateNote,
    updatePhoto,
    removeStop,
    restoreStop,
  } = useStops(activePlanId);
  const { customPlaces, loaded: customPlacesLoaded } = useCustomPlaces();
  const { placeNotes, stashNote, clearNote } = usePlaceNotes(activePlanId);
  const {
    settings: daySettings,
    loaded: daySettingsLoaded,
    setStartTime,
    setReturnTravelMode,
    setDaysLocked,
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

  const { hotelLegs, hotelForDay, hotelBeforeDay } = useHotelSchedule(itinerary, hotels);
  // Open-Meteo มองไปข้างหน้าได้ ~16 วัน — ก่อนหน้านั้นทุกวันจะว่างเปล่า ซึ่งดูเหมือนฟีเจอร์พัง
  // บอกไปตรงๆ ครั้งเดียวเหนือลิสต์วัน ดีกว่าปล่อยให้เดาเอง
  const { byDay: weatherByDay, daysUntilFirstDay } = useTripWeather(itinerary);

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

  // บริบทตอนกด "+ แทรกเดินทางข้ามเมืองตรงนี้" — เก็บวัน/ตำแหน่งที่จะแทรก + ค่า default จาก/ไปเมือง
  const [intercityContext, setIntercityContext] = useState<{
    dayId: string;
    atIndex: number;
    fromDefault: string;
    toDefault: string;
    fromCity: City;
    toCity: City;
  } | null>(null);

  // modal จัดการแผน (สร้าง/เปลี่ยนชื่อ/ลบ) — null = ปิดอยู่ · เดิมใช้ window.prompt/confirm ของเบราว์เซอร์
  const [planEditMode, setPlanEditMode] = useState<PlanEditMode | null>(null);

  // บริบทตอนกด "✈️ + ไปสนามบิน" — เก็บวัน/ตำแหน่งที่จะแทรก (modal ดึงเที่ยวบินของวันนั้นมาเป็นตัวเลือกเดดไลน์เอง)
  const [transferContext, setTransferContext] = useState<{
    dayId: string;
    atIndex: number;
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

  // เน็ตหลุด = ทั้งหน้าเป็นอ่านอย่างเดียว (เฟส 18) — ใช้กลไก "ล็อกวัน" เดิมซึ่งปิดปุ่มแก้ครบทุกอันอยู่แล้ว
  // (ที่จับลาก / +- เวลา / ลบ / โน้ต / รูป / ปุ่มแทรก / ตัวเลือกโหมดเดินทาง / droppable ของ dnd-kit)
  // แทนที่จะไล่ใส่ disabled ทีละปุ่มใหม่ทั้งหน้า · การแก้ตอนออฟไลน์จะเงียบหายเพราะเขียนตรงเข้า Supabase
  const online = useOnlineStatus();

  // วันที่ล็อกไว้ = แก้ไม่ได้จนกว่าจะปลดล็อก (คอลัมน์ is_locked จาก migration 0021 — ยังไม่รัน = undefined = ไม่ล็อก)
  const isDayLocked = useCallback(
    (dayId: string) => !online || daySettings[dayId]?.is_locked === true,
    [daySettings, online]
  );
  // ตัวนับ/ปุ่ม "ล็อกทุกวัน" อ่านค่าจริงจาก DB ไม่ใช่ isDayLocked ที่ถูกบังคับเป็นล็อกตอนออฟไลน์
  // ไม่งั้นเน็ตหลุดแล้วหัวเว็บจะขึ้น "ล็อกแล้ว 11/11" ทั้งที่ไม่มีวันไหนถูกล็อกจริงสักวัน
  const isDayLockedInDb = useCallback(
    (dayId: string) => daySettings[dayId]?.is_locked === true,
    [daySettings]
  );
  const lockedDayCount = itinerary.filter((d) => isDayLockedInDb(d.id)).length;

  async function handleToggleLockAll() {
    const lockAll = lockedDayCount < itinerary.length;
    await setDaysLocked(
      itinerary.map((d) => d.id).filter((id) => isDayLockedInDb(id) !== lockAll),
      lockAll
    );
  }

  /** เพิ่มจุดแวะพร้อมคืนโน้ต/รูปที่เคยฝากไว้กับสถานที่นี้ตอนลากกลับคลัง (เฟส 22)
   *  ทางเข้าเดียวของทั้งหน้า — ทั้งลากการ์ดจากคลัง กดปุ่ม "+ เพิ่มลงวันนี้" และกดยืนยันในโมดัลรายละเอียด */
  const addStopWithStashedNote = useCallback(
    async (dayId: string, placeId: string, addedBy?: string, travelMode?: string | null) => {
      const stashed = placeNotes[placeId];
      const stopId = await addStop(
        dayId,
        placeId,
        addedBy,
        travelMode,
        stashed ? { note: stashed.note, photoUrl: stashed.photo_url } : undefined
      );
      // ย้ายกลับไปอยู่บนแถวจุดแวะแล้ว — ที่ฝากไว้ในคลังต้องหายไป ไม่งั้นการ์ดยังขึ้นป้าย "มีโน้ต" ค้าง
      if (stashed && stopId) await clearNote(placeId);
      return stopId;
    },
    [placeNotes, addStop, clearNote]
  );

  const { sensors, handleDragStart, handleDragEnd, activeDragLabel } = useTripDnd({
    itinerary,
    customPlaces,
    stops,
    stopsByDay,
    who,
    lastStopPlaceForDay,
    isDayLocked,
    defaultTravelModeFor,
    addStop: addStopWithStashedNote,
    removeStop,
    restoreStop,
    stashPlaceNote: stashNote,
    clearPlaceNote: clearNote,
    reorderStops,
    moveStopToDay,
    flashNewStop,
  });

  /** เวลาเริ่มต้นของแถว "แวะที่พัก" — เช็คอิน/ฝากกระเป๋าแล้วออกไปต่อ ปกติไม่เกินครึ่งชั่วโมง
   *  (ปรับด้วยปุ่ม +/− ที่แถวได้เหมือนจุดแวะปกติ) */
  const HOTEL_STOP_DWELL_MINUTES = 30;

  function handleInsertHotel(dayId: string, atIndex: number) {
    const hotel = hotelForDay(dayId);
    if (!hotel) return; // ปุ่มถูกซ่อนอยู่แล้วเมื่อยังไม่มีที่พัก — กันไว้อีกชั้นเผื่อเรียกจากทางอื่น
    // จุดก่อนหน้าตำแหน่งที่จะแทรก ใช้เดาโหมดเดินทางเข้าแบบเดียวกับจุดแวะปกติ
    const dayStops = stopsByDay[dayId] ?? [];
    const prevStop = atIndex > 0 ? dayStops[atIndex - 1] : undefined;
    const prevPlace = prevStop ? resolvePlace(prevStop.place_id, customPlaces) : null;
    insertHotelAt(
      dayId,
      atIndex,
      {
        hotelPlaceId: hotelAnchorId(hotel),
        dwellMinutes: HOTEL_STOP_DWELL_MINUTES,
        travelMode: defaultTravelModeFor(prevPlace, hotel),
      },
      who || undefined
    ).then(flashNewStop);
  }

  /** ลบจุดแวะแล้วยื่นปุ่ม "เลิกทำ" ให้ (เฟส 20.2) — เดิมกด ✕ ทีเดียวหายถาวร ไม่มีทางกู้
   *  snapshot ที่ removeStop คืนมาเป็นแถวเต็ม (โน้ต/รูป/โหมดเดินทาง/order_index) จึงกลับมาที่เดิมเป๊ะ
   *
   *  ปุ่ม ✕ ฝากโน้ตไว้กับสถานที่ในคลังเหมือนการลากกลับคลังทุกประการ (เฟส 22) — **บนมือถือการ์ดในคลัง
   *  ลากไม่ได้เลย** (draggable=false กันนิ้วเลื่อนดูคลังไม่ได้ ดู PlaceSidebar) ปุ่มนี้จึงเป็นทางเดียว
   *  ที่จะเอาจุดแวะออก ถ้าไม่ฝากด้วย ฟีเจอร์นี้จะใช้ได้แต่บนจอใหญ่ */
  async function handleRemoveStop(stopId: string) {
    const stop = stops.find((s) => s.id === stopId);
    const place = stop ? resolvePlace(stop.place_id, customPlaces) : null;
    const label = place ? `${CATEGORY_EMOJI[place.category]} ${place.nameTh}` : "จุดแวะนี้";
    const stashed = stop
      ? await stashNote(stop.place_id, stop.note ?? null, stop.photo_url ?? null)
      : false;
    const snapshot = await removeStop(stopId);
    if (!snapshot) return;
    showUndoToast(
      stashed ? `เก็บ ${label} กลับคลังแล้ว — โน้ตติดไปด้วย` : `เอา ${label} ออกแล้ว`,
      () => {
        // แถวที่กู้คืนมามีโน้ต/รูปติดมาในตัวอยู่แล้ว ตัวที่ฝากไว้ในคลังจึงต้องล้างทิ้ง (เหมือนทาง drag)
        restoreStop(snapshot);
        if (stashed) clearNote(snapshot.place_id);
      }
    );
  }

  async function handleRemoveChecklistItem(itemId: string) {
    const snapshot = await removeChecklistItem(itemId);
    if (snapshot) {
      showUndoToast(`ลบ "${snapshot.text}" แล้ว`, () => restoreChecklistItem(snapshot));
    }
  }

  async function handlePlanEditSubmit(name: string | null) {
    const mode = planEditMode;
    setPlanEditMode(null);
    if (mode === "create" && name) {
      await createPlan(name, { duplicateFrom: activePlanId ?? undefined, activate: true });
    } else if (mode === "rename" && name && activePlanId) {
      await renamePlan(activePlanId, name);
    } else if (mode === "delete" && activePlanId) {
      await deletePlan(activePlanId);
    }
  }

  const overallLoaded =
    plansLoaded &&
    customPlacesLoaded &&
    hiddenPlacesLoaded &&
    overnightLoaded &&
    bookingsLoaded &&
    checklistLoaded &&
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
          onNewPlan={() => setPlanEditMode("create")}
          onRenamePlan={() => setPlanEditMode("rename")}
          onDeletePlan={() => setPlanEditMode("delete")}
          lockedDayCount={lockedDayCount}
          totalDayCount={itinerary.length}
          onToggleLockAll={handleToggleLockAll}
        />

        {/* pb-28 บนมือถือ: เว้นที่ให้ปุ่มลอย "📍 สถานที่" ไม่ไปทับปุ่ม "+ เพิ่มสถานที่" ของวันสุดท้าย
            lg:max-w-7xl: จอกว้างให้คอลัมน์จุดแวะ (ที่มีแผนที่ต่อวันแปะข้างในอยู่แล้ว) มีที่หายใจ ไม่ใช่ 672px แคบๆ เหมือนเดิม */}
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 lg:flex lg:max-w-7xl lg:items-start lg:gap-6 lg:pb-6">
          {/* min-w-0 บน flex item ตัวนี้จำเป็นจริงๆ — เหตุผลเดียวกับที่อธิบายไว้ใน DayStopsSection.tsx
              (flex item ค่าเริ่มต้นคือ min-width:auto หดต่ำกว่า min-content ไม่ได้) แต่ที่นี่ผลหนักกว่า:
              ไม่มีแล้วคอลัมน์นี้จะกว้าง 1129px ทั้งที่มีที่ให้ 904px แล้วดัน <aside> คลังสถานที่
              หลุดออกนอกจอไป 209px บนจอ 1280 (วัดจริง: scrollWidth 1489 vs clientWidth 1280) */}
          <div className="mx-auto min-w-0 max-w-2xl flex-1 lg:mx-0 lg:max-w-none">
            {!overallLoaded && (
              <>
                <DayCardSkeleton />
                <DayCardSkeleton />
                <DayCardSkeleton />
              </>
            )}

            {/* แถบวัน sticky — กระโดดข้ามวันได้โดยไม่ต้องสกรอลล์ผ่านทั้ง 11 วัน (เฟส 17)
                เฟส 20.3 ย้ายขึ้นมาไว้บนสุด: เดิมอยู่ใต้แผงเตรียมทริปทั้งสาม จึงต้องเลื่อนผ่าน
                แผงพวกนั้นไปก่อนมันถึงจะติดบนจอ = ใช้ไม่ได้ตอนที่ต้องใช้ที่สุด */}
            {overallLoaded && <DayJumpBar itinerary={itinerary} />}

            {overallLoaded && (
              <TripPrepPanel
                hotelsSetCount={hotelLegs.filter((leg) => hotels[leg.id]).length}
                hotelsTotal={hotelLegs.length}
                bookingCount={bookings.length}
                checklistCheckedCount={checklistItems.filter((i) => i.is_checked).length}
                checklistTotal={checklistItems.length}
              >
                <HotelLegsPanel legs={hotelLegs} hotels={hotels} onSave={setHotel} onClear={clearHotel} />

                <BookingsPanel
                  bookings={bookings}
                  onAdd={addBooking}
                  onUpdate={updateBooking}
                  onRemove={removeBooking}
                  who={who || undefined}
                />

                <ChecklistPanel
                  items={checklistItems}
                  onAdd={(text, category) => addChecklistItem(text, category, who || undefined)}
                  onToggle={(itemId, checked) => toggleChecklistItem(itemId, checked, who || undefined)}
                  onRemove={handleRemoveChecklistItem}
                />
              </TripPrepPanel>
            )}

            {overallLoaded && daysUntilFirstDay != null && daysUntilFirstDay > 16 && (
              <div className="mb-4 rounded-xl bg-cream-soft/70 px-3 py-2 text-xs text-ink-soft">
                🌤️ พยากรณ์อากาศรายวันจะขึ้นบนหัวการ์ดเมื่อเหลืออีก ~16 วันก่อนถึงวันนั้น (ตอนนี้อีก{" "}
                {daysUntilFirstDay} วัน)
              </div>
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
                  startTime={daySettings[day.id]?.start_time ?? null}
                  onStartTimeChange={(value) => setStartTime(day.id, value)}
                  locked={isDayLocked(day.id)}
                  onToggleLock={() =>
                    setDaysLocked([day.id], !isDayLockedInDb(day.id))
                  }
                  onReorder={(orderedStopIds) => reorderStops(day.id, orderedStopIds)}
                  onOvernightCityChange={
                    day.overnightOptions
                      ? (city) => setOvernightCity(day.id, city)
                      : undefined
                  }
                  onRemoveStop={handleRemoveStop}
                  onUpdateDwell={updateDwellMinutes}
                  onUpdateTravelMode={updateTravelMode}
                  onUpdateNote={updateNote}
                  onUpdatePhoto={updatePhoto}
                  onAddPlace={() => openPickerForDay(day.id)}
                  onInsertPlace={(atIndex, center, prevPlace) =>
                    setInsertContext({ dayId: day.id, atIndex, center, prevPlace })
                  }
                  onInsertIntercity={(atIndex, fromDefault, toDefault, fromCity, toCity) =>
                    setIntercityContext({
                      dayId: day.id,
                      atIndex,
                      fromDefault,
                      toDefault,
                      fromCity,
                      toCity,
                    })
                  }
                  onInsertTransfer={(atIndex) => setTransferContext({ dayId: day.id, atIndex })}
                  onInsertHotel={(atIndex) => handleInsertHotel(day.id, atIndex)}
                  weather={weatherByDay[day.id] ?? null}
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
                addStopWithStashedNote(
                  dayId,
                  placeId,
                  who || undefined,
                  defaultTravelModeFor(prevPlace, newPlace)
                ).then(flashNewStop);
              }}
              placeNotes={placeNotes}
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
          <div className="fixed inset-x-0 bottom-14 bg-maple-soft px-4 py-2 text-center text-xs text-maple-dark lg:bottom-0">
            กำลังตั้งค่าแผนเริ่มต้น...
          </div>
        )}
      </main>

      <BottomNav />

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

      {transferContext && (
        <TransferEditModal
          day={itinerary.find((d) => d.id === transferContext.dayId) ?? itinerary[0]}
          onClose={() => setTransferContext(null)}
          onSave={(input) => {
            // จุดก่อนหน้าคือจุดสุดท้ายของวันตอนนี้ (ปุ่มอยู่ท้ายการ์ด) — เดาโหมดเดินทางแบบเดียวกับจุดแวะปกติ
            const prevPlace =
              transferContext.atIndex > 0 ? lastStopPlaceForDay(transferContext.dayId) : null;
            const airport = resolvePlace(input.placeId, customPlaces);
            insertTransferAt(
              transferContext.dayId,
              transferContext.atIndex,
              { ...input, travelMode: defaultTravelModeFor(prevPlace, airport) },
              who || undefined
            ).then(flashNewStop);
            setTransferContext(null);
          }}
        />
      )}

      {planEditMode && (
        <PlanEditModal
          mode={planEditMode}
          plan={plans.find((p) => p.id === activePlanId) ?? null}
          onClose={() => setPlanEditMode(null)}
          onSubmit={handlePlanEditSubmit}
        />
      )}

      {intercityContext && (
        <IntercityEditModal
          fromDefault={intercityContext.fromDefault}
          toDefault={intercityContext.toDefault}
          fromCity={intercityContext.fromCity}
          toCity={intercityContext.toCity}
          onClose={() => setIntercityContext(null)}
          onSave={(input) => {
            insertIntercityAt(
              intercityContext.dayId,
              intercityContext.atIndex,
              input,
              who || undefined
            ).then(flashNewStop);
            setIntercityContext(null);
          }}
        />
      )}
    </DndContext>
  );
}
