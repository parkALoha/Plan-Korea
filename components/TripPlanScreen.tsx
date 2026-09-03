"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { MapsApiProvider } from "@/components/MapsApiProvider";
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
import { type Place } from "@/data/places";
import { categoryMetaOf } from "@/components/categoryMeta";
import type { City, Day } from "@/data/itinerary";
import { hotelAnchorId } from "@/lib/hotelLegs";
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
import { splitDayEvents } from "@/lib/engine/dayEvents";
import { useTripWeather } from "@/hooks/useTripWeather";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { BottomNav } from "@/components/BottomNav";
import { DayJumpBar } from "@/components/DayJumpBar";
import { useTripDaysGate } from "@/hooks/useTripDaysGate";
import { useTripCatalogCities } from "@/hooks/useTripCatalogCities";
import { usePlatformItinerary } from "@/hooks/usePlatformItinerary";
import { readPersonalValue, writePersonalValue } from "@/hooks/personalLocalValue";
import { DayPlanUnavailableNotice } from "@/components/DayPlanUnavailableNotice";
import { HotelsFlatList } from "@/components/HotelsFlatList";

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

/**
 * หน้าวางแผน (แผนที่/ลากจุดแวะ) ของทริปหนึ่งใบ — ใช้เดียวที่ `/trip/[tripId]` (`E5`)
 *
 * 🔴 เดิมชื่อ `HomeContent` และ export จาก `app/page.tsx` — ย้ายออกมาเป็นไฟล์ของตัวเอง (27 ส.ค. 2026)
 * ตอนที่ `/` เปลี่ยนความหมายจาก "หน้าดีเทลทริปเดียว" เป็นหน้า Home (ลิสต์ทริป) จริง — ถ้ายังฝังไว้ใน
 * `app/page.tsx` แล้วแก้ไฟล์นั้นให้เป็น Home จะได้ import วนทันที (`app/trip/[tripId]/page.tsx` เคย
 * import ตัวนี้ข้ามมาจาก `@/app/page`) ชื่อเปลี่ยนเป็น `TripPlanScreen` เพื่อไม่ให้ปนกับความหมายใหม่ของ
 * "Home" — เนื้อโค้ดข้างในเหมือนเดิมทุกบรรทัด (`E5-AC3`: ทริปเกาหลี 11 วันต้องแสดงครบเท่าเดิม)
 */
/** `[]` ตัวเดียวใช้ซ้ำ — ถ้าเขียน `[]` ลอย ๆ จะได้อ็อบเจกต์ใหม่ทุก render แล้ว `useMemo` ที่พึ่งมันพังหมด */
const EMPTY_DAYS: Day[] = [];

export function TripPlanScreen({ tripId }: { tripId: string }) {
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
  } = useChecklist(tripId);
  const { plans, activePlanId, loaded: plansLoaded, createPlan, renamePlan, deletePlan, switchActivePlan } =
    usePlans(tripId);
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
    catalogPlaces,
  } = useStops(tripId, activePlanId);
  const { customPlaces, loaded: customPlacesLoaded } = useCustomPlaces();
  /**
   * แหล่งค้นสถานที่ก้อนเดียว (`E6-AC13`) — `useMemo` เพราะ identity ของมันเข้า deps ของ
   * `useDaySchedule`/`useTripDnd` · สร้างใหม่ทุก render = memo ข้างในนั้นตายทั้งชุด
   */
  const placeSources = useMemo(
    () => ({ customPlaces, catalog: catalogPlaces }),
    [customPlaces, catalogPlaces]
  );

  const { placeNotes, stashNote, clearNote } = usePlaceNotes(tripId, activePlanId);
  const {
    settings: daySettings,
    loaded: daySettingsLoaded,
    setStartTime,
    setReturnTravelMode,
    setDaysLocked,
  } = useDaySettings(tripId, activePlanId);
  const {
    hiddenPlaceIds,
    loaded: hiddenPlacesLoaded,
    hidePlace,
    unhidePlace,
  } = useHiddenPlaces(tripId);
  // 🔴 `overnightOverrides` ไม่ถูกอ่านแล้ว — มันมีไว้ทับคืนที่เลือกเมืองนอนเองลงบน `ITINERARY`
  //    ซึ่งเส้นทางนั้นถูกตัดออกจากหน้านี้แล้ว · **ยังเรียกฮุคอยู่** เพราะ `setOvernightCity` ยังใช้
  //    และ `overnightLoaded` ยังนับรวมใน `overallLoaded` · `B6` จะกลับมาใช้ค่านี้กับวันจากฐาน
  const { loaded: overnightLoaded, setOvernightCity } = useOvernightOverrides(tripId);

  // `B6` เฟส 1 — เมืองปลายทางของทริปนี้จากคลังในฐาน
  const tripCatalogCities = useTripCatalogCities(tripId);
  /** ทริปที่ตั้งจุดหมายไว้แล้ว = ทริปที่วันของมันมาจากฐานได้ */
  const isPlatformTrip =
    tripCatalogCities.status === "ready" && tripCatalogCities.cities.length > 0;
  const { state: platformItinerary, reload: reloadPlatformItinerary } = usePlatformItinerary(
    tripId,
    isPlatformTrip
  );

  /**
   * แหล่งของ "วัน" ที่หน้านี้แสดง — **สี่สถานะ แยกจากกันชัด ไม่มีอันไหนเป็นค่าเริ่มต้นของอีกอัน**
   *
   * ## 🔴 บน branch `platform` **ไม่มีทริปใบไหนที่ `data/itinerary.ts` เป็นคำตอบที่ถูก** (P1 ตัดสิน 28 ส.ค. 2026)
   * ทริปเกาหลีจริงอยู่บน production/`main` · `E7` ยังไม่ย้ายข้อมูลมา → ทุกครั้งที่เส้นทาง legacy ทำงานที่นี่
   * **มันผิดโดยโครงสร้าง ไม่ใช่ผิดบางกรณี**
   *
   * ⚠️ **เดิมผมมี `isLegacyTrip = ready && cities.length === 0` — และมันยุบสองอย่างเข้าด้วยกัน** (P3 ชี้)
   * ```
   * "ทริปเกาหลีเดิม ที่เมืองไม่ได้อยู่ในคลัง"      ← ตอนเขียน ตั้งใจให้เข้าเงื่อนไขนี้
   * "ทริปแพลตฟอร์มที่เจ้าของยังไม่ได้เลือกเมือง"   ← ไม่ได้ตั้งใจ แต่เข้าเงื่อนไขเดียวกันเป๊ะ
   * ```
   * 🎯 **ตอนเขียน เงื่อนไขนี้แยกได้จริง เพราะทริปแพลตฟอร์มยังไม่มี** — โลกเปลี่ยน ความหมายของเงื่อนไข
   * เลยเปลี่ยนตาม โดยที่ตัวเงื่อนไขไม่ได้ขยับสักตัวอักษร · **นี่คือเหตุผลที่ต้องเขียนสถานะให้ครบ
   * แทนที่จะพึ่ง "ที่เหลือทั้งหมด"**
   *
   * 📌 หลักฐานที่ P1 ยิงบนจอ: ทริป `9d26d2ba` (ของผู้ใช้จริง · 17 จุดในฐาน) เปิด `/trip/<id>` แล้วเห็น
   * **VN610 · ปูซาน · ซกโช · โซล ที่เจ้าของไม่ได้ใส่** ขณะที่ `/today` กับ `/summary` บอกว่ายังไม่รองรับ
   * — **ทริปใบเดียวกัน เรนเดอร์เป็นคนละทริป ขึ้นกับว่าอยู่หน้าไหน**
   *
   * 🔴 **และ control ที่ผมเขียนไว้เองใน `b49fb22` ("ทริปเกาหลีออฟไลน์ยังขึ้นครบ 11 วัน + VN610")
   * กำลังปกป้องพฤติกรรมนี้อยู่** — มันเขียวทุกครั้ง และมันยืนยันสิ่งที่ไม่ควรมีบน branch นี้
   * · ผมเขียนมันเพราะกลัวทริปจริงหายตอนออฟไลน์ ซึ่ง **เป็นความกลัวที่ถูกสำหรับ `main` และผิดที่สำหรับ `platform`**
   *
   * ⚠️ **JSX ที่เรนเดอร์จาก `itinerary` ต้องไม่ถูกลบ** — `B6` จะกลับมาใช้เส้นทางเดิมโดยเปลี่ยนแค่
   * *แหล่งของวัน* · ลบตอนนี้ = เขียนใหม่ทั้งหมดตอนนั้น
   */
  type DayPlanSource =
    | { kind: "loading" }
    | { kind: "platform"; days: Day[] }
    /** อ่านได้ และรู้ว่าไม่ใช่ทริปแพลตฟอร์ม — **ยังไม่รองรับ ไม่ใช่ "ไม่มีข้อมูล"**
     *  ผู้ใช้ที่มีจุดแวะอยู่ในฐานแล้วเห็นคำว่า "ไม่มีข้อมูล" จะคิดว่าข้อมูลของเขาหาย */
    | { kind: "unsupported" }
    /** ถามไม่ได้ (ออฟไลน์/เน็ตสะดุด) — **คนละเรื่องกับ `unsupported`** */
    | { kind: "unreadable" };

  const dayPlanSource: DayPlanSource = useMemo(() =>
    tripCatalogCities.status === "error" ||
    (isPlatformTrip && platformItinerary.status === "error")
      ? { kind: "unreadable" }
      : tripCatalogCities.status === "loading" ||
          (isPlatformTrip && platformItinerary.status === "loading")
        ? { kind: "loading" }
        : isPlatformTrip && platformItinerary.status === "ready"
          ? { kind: "platform", days: platformItinerary.days }
          : { kind: "unsupported" },
  [tripCatalogCities, isPlatformTrip, platformItinerary]);

  /* `unreadable` มีสองทางเข้า และหน้าจอบอกไม่ได้ว่าทางไหน — ตั้งใจให้เหมือนกัน เพราะ
     **ผู้ใช้ทำอย่างเดียวกันทั้งสองกรณี** (ต่อเน็ตแล้วลองใหม่) · ข้อความสองแบบจะสร้างความสับสนเปล่า
     🔴 แต่ *คนไล่บั๊ก* ต้องแยกได้ — และมันเสียเวลาจริงไปแล้วหนึ่งรอบ (P3 เจอ · 3 ก.ย. 2026):
     `DayPlanUnavailableNotice` ถูกเรนเดอร์จาก 3 หน้า → **ข้อความบนจอระบุหน้าไม่ได้ และระบุสาเหตุก็ไม่ได้**
     ⇒ บอกเฉพาะฝั่งนักพัฒนา · ผู้ใช้ไม่เห็นความต่างสักตัวอักษร
     📌 อยู่ในเอฟเฟกต์ไม่ใช่ในเนื้อ render — `console.warn` ตอน render เป็น side effect (`react-hooks/purity`)
        และจะดังซ้ำทุกรอบที่ re-render · ที่นี่ดังเมื่อ *สถานะเปลี่ยน* เท่านั้น */
  const catalogStatus = tripCatalogCities.status;
  const itineraryStatus = platformItinerary.status;
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (catalogStatus !== "error" && !(isPlatformTrip && itineraryStatus === "error")) return;
    console.warn(
      `[dayPlan] unreadable · catalogCities=${catalogStatus} · platformItinerary=${itineraryStatus}` +
        ` · isPlatformTrip=${isPlatformTrip}`,
    );
  }, [catalogStatus, itineraryStatus, isPlatformTrip]);

  // ห่อ `useMemo` เพราะค่าเป็นเงื่อนไข — ปล่อยลอยแล้ว React Compiler รักษา memo ที่ต่อจากมันไม่ได้
  // (แบบเดียวกับ `platformCityIdByDayId` · `allCardsForCity` ใน `PlaceSidebar`)
  const itinerary = useMemo(
    () => (dayPlanSource.kind === "platform" ? dayPlanSource.days : EMPTY_DAYS),
    [dayPlanSource]
  );
  /** true = การ์ดวันมาจากฐานจริง → เลือกเมืองรายวันได้ */
  const usePlatformDays = dayPlanSource.kind === "platform";

  // ห่อ `useMemo` เพราะค่าเป็นเงื่อนไข — ปล่อยเป็นนิพจน์ลอยแล้วอ็อบเจกต์ใหม่ทุก render จะทำให้
  // `selectedPlaceIdsByCatalogCityId` ที่พึ่งมันคำนวณใหม่ทุกครั้ง (eslint จับให้ · แบบเดียวกับ
  // `allCardsForCity` ใน `PlaceSidebar`)
  const platformCityIdByDayId = useMemo(
    () => (platformItinerary.status === "ready" ? platformItinerary.cityIdByDayId : {}),
    [platformItinerary]
  );
  const platformCityOptions =
    tripCatalogCities.status === "ready" ? tripCatalogCities.cities : [];

  /**
   * เลือกเมืองให้วันหนึ่ง — `B6` เฟส 3 · ผู้ใช้สั่งเอง 28 ส.ค. 2026 (*"ไม่ต้องเดา ให้ว่างไว้แล้วผมเลือกเอง"*)
   * 🔴 อ่านใหม่จากฐานหลังบันทึกสำเร็จ ไม่ใช่แก้ในมือ (เหตุผลอยู่ใน `usePlatformItinerary`)
   * · โยน `Error` ต่อเมื่อ API ตอบไม่ ok เพื่อให้ปุ่มฝั่ง UI รู้ว่า **ยังไม่สำเร็จ** ไม่ใช่เงียบแล้วดูเหมือนสำเร็จ
   */
  const setDayCity = useCallback(
    async (dayId: string, cityId: string | null) => {
      const res = await fetch(`/api/engine/trips/${tripId}/days`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, cityId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `บันทึกเมืองไม่สำเร็จ (${res.status})`);
      }
      reloadPlatformItinerary();
    },
    [tripId, reloadPlatformItinerary]
  );

  // 🔴 ชื่อผู้ใช้ — ข้อมูลส่วนบุคคล ต้องถูกล้างตอน `signOut` (ดู `hooks/personalLocalValue.ts`)
  //    เดิมเขียนคีย์ดิบ `"trip-who"` ซึ่งอยู่นอก `trip-cache:` → `clearAllCaches()` กวาดไม่ถึง
  const [who, setWho] = useState(() => readPersonalValue("who", "trip-who"));

  useEffect(() => {
    if (who) writePersonalValue("who", who);
  }, [who]);

  // เมือง/วันที่โฟกัสอยู่ใน sidebar เลือกสถานที่ — คุมจากที่นี่แทนที่จะให้ sidebar เก็บ state เอง
  // เพื่อให้ปุ่ม "+ เพิ่มสถานที่" ในแต่ละวันสั่งโฟกัส sidebar มาที่วันนั้นได้เลย
  // เปิดมาให้อยู่ที่วันแรกใน**ประเทศหลัก**ของทริป ไม่ใช่วันบิน/พักเครื่องที่จุดแวะขาไป (ซึ่งเป็นวันแรก
  // ตามลำดับเวลา) — 🔴 แก้ 27 ส.ค. 2026 (`E4-AC2`, P1 พบ): เดิมเทียบ `d.city !== "hanoi"` ตรง ๆ ซึ่งฝัง
  // สมมติฐาน "ไม่ใช่ฮานอย = เกาหลี" ไว้ในโค้ด ใช้ได้เฉพาะทริปนี้ทริปเดียว เปลี่ยนเป็นเทียบประเทศของวันนั้น
  // กับประเทศของวันแรกผ่าน registry (`countryOfCity`) แทน — ผลลัพธ์เดิมทุกประการสำหรับทริปนี้
  // (วันแรก = ฮานอย = "vn" ทุกวันอื่น = "kr") แต่ไม่ต้องแก้จุดนี้อีกถ้าวันหนึ่งจุดแวะขาไปเปลี่ยนประเทศ
  // 🔴 **ไม่ seed จาก `ITINERARY` อีกแล้ว** — ค่าตั้งต้นที่มาจากทริปอื่นคือรากของบั๊ก "เล็งวันที่ไม่มีอยู่จริง"
  //    ที่แก้ไปใน `0f0715c` · ตอนนี้ปล่อยว่าง แล้ว derive จาก `itinerary` ที่แสดงอยู่จริง (ดูข้างล่าง)
  const [activeCity, setActiveCity] = useState<Day["city"]>("" as Day["city"]);
  const [focusedDayId, setFocusedDayId] = useState<string>("");
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  /**
   * 🔴 **วันที่ไซด์บาร์เล็งอยู่ ต้องเป็นวันที่มีอยู่จริงใน `itinerary` ที่กำลังแสดง**
   *
   * `focusedDayId` ตั้งต้นจาก `ITINERARY` (ไฟล์ทริปเกาหลี) **เสมอ** เพราะเป็น `useState` initializer
   * ที่รันครั้งเดียวตอน mount — ตอนนั้นยังไม่รู้ด้วยซ้ำว่าทริปนี้เป็นแบบไหน
   * 🎯 **อาการบนทริปแพลตฟอร์ม: ปุ่ม "+ เพิ่มลงวันนี้" ในคลังไม่เพิ่มอะไรเลย**
   *    ⚠️ **ผมเขียนไว้ก่อนหน้านี้ว่า "เงียบสนิท ไม่มี toast ไม่มี error" — ผิด และถอนแล้ว**
   *    ของจริงมีทั้ง toast และ `console.error` · รอบแรกผมอ่าน console **หลังโหลดหน้าใหม่**
   *    และ toast หมดอายุไปแล้ว → **ผมวัดไม่เจอ แล้วสรุปว่ามันไม่มี** ซึ่งเป็นคนละเรื่องกัน
   *    🔴 ของจริงแย่กว่าเงียบ: มันบอกเหตุผล**ผิด** — *"วันนี้ยังไม่มีในระบบของทริปนี้"* + ชี้ไปที่ `E7`
   *    ทั้งที่วันนั้นอยู่ในฐานเรียบร้อย · ดูรายละเอียดที่ `useStops.ts` (แมป `dayToUuid`)
   * · ⚠️ **นี่คือเหตุผลที่ผมยืนยันข้อ "ตัวกรองเมืองผิดใบ" ไม่ได้ตอนแรก** — เพิ่มจุดแวะไม่ติดตั้งแต่ต้นทาง
   * · derive ตอน render แทนที่จะ `setState` ใน effect (แพทเทิร์นเดียวกับ `useTripCatalogCities`)
   */
  const focusedDayIdInList = itinerary.some((d) => d.id === focusedDayId)
    ? focusedDayId
    : (itinerary[0]?.id ?? focusedDayId);


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
  // 🔴 ส่งคลังเมืองเข้าไปด้วย — พิกัดของเมืองมาจาก `catalog_cities` ไม่ใช่ค่าเฉลี่ยจากไฟล์สถิตย์
  //    (`E2-AC16`) · ไม่ส่ง = เมืองนอก 6 เมืองเกาหลีจะไม่มีพยากรณ์อากาศเลย
  const { byDay: weatherByDay, daysUntilFirstDay } = useTripWeather(
    itinerary,
    tripCatalogCities.status === "ready" ? tripCatalogCities.cities : []
  );

  /**
   * 🔴 **แถว `kind='event'` ต้องไม่ปนอยู่ในลิสต์จุดแวะ** (P3 เจอ · P1 ส่งต่อ · P2 ทำ · 2 ก.ย. 2026)
   *
   * โครงเดิมของเว็บทริปเป็น **สองอาเรย์** (`day.events[]` กับ `stops[]`) → ตัวเรนเดอร์รวมเองเป็นสามส่วน
   * · `E7` ยุบทั้งสองเข้า `trip_stops` ใบเดียว ซึ่ง **บังคับให้มีลำดับเดียว** และกฎการรวมไม่ได้ถูกย้ายมา
   * → เหตุการณ์ (เที่ยวบิน · เช็คเอาต์) ไหลไปกองท้ายวันตาม `rank` · ผู้ใช้เห็น
   *   `🧳 เช็คเอาต์ออกจากโรงแรม 05:45` **โผล่ท้ายวัน** หลังจุดแวะตอนเย็น
   *
   * 🔴 **กรองอย่างเดียวไม่พอ และเกือบเป็นบั๊กชนิดเดียวกับที่กำลังแก้** — ถ้ากรองทิ้งเฉย ๆ
   * เหตุการณ์จะ *หายจากหน้าแผนทั้งใบ* · ที่แสดงผลมีอยู่แล้ว (`DayEventsPanel` ใน `DayStopsSection`)
   * แต่มันอ่านจาก `useDaySchedule` ซึ่งต้องได้ `eventsSplit` ป้อนเข้าไป — **ไม่มีใครป้อนให้**
   * → จึงส่งทั้ง *จุดแวะที่กรองแล้ว* และ *เหตุการณ์ที่แบ่งแล้ว* ลงไปคู่กัน
   *
   * 📌 **กรองที่ต้นทาง ไม่ใช่ที่จุดเรนเดอร์** — `stopsByDay` ถูกใช้อีกหลายที่ (DnD · ตัวนับ ·
   *    `lastStopPlaceForDay` · `selectedPlaceIdsByCity`) · กรองแค่ตอนแสดงจะทำให้ทุกตัวนั้นนับผิดเงียบ ๆ
   * 📌 **ดัชนีไม่ต้องแปลง** — `atIndex` ถูกแก้ที่เซิร์ฟเวอร์แล้ว (`stopRanksInDay` · `4f825fa`)
   *    ให้นับเฉพาะแถวจุดแวะ ซึ่งตรงกับสิ่งที่ผู้เรียกทุกตัวเชื่ออยู่แล้ว
   */
  const dayEventsSplit = useMemo(() => {
    const rowsByDay: Record<string, TripStop[]> = {};
    for (const stop of stops) {
      (rowsByDay[stop.day_id] ??= []).push(stop);
    }
    const map: Record<string, ReturnType<typeof splitDayEvents<TripStop>>> = {};
    for (const [dayId, rows] of Object.entries(rowsByDay)) map[dayId] = splitDayEvents(rows);
    return map;
  }, [stops]);

  const stopsByDay = useMemo(() => {
    const map: Record<string, TripStop[]> = {};
    for (const [dayId, split] of Object.entries(dayEventsSplit)) map[dayId] = split.stops;
    return map;
  }, [dayEventsSplit]);

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

  /**
   * เวอร์ชันเดียวกัน **แต่คีย์ด้วย `catalog_cities.id`** — สำหรับไซด์บาร์โหมดคลัง (`B6`)
   *
   * 🔴 **ทำไมคีย์เดิมใช้ไม่ได้:** `selectedPlaceIdsByCity` คีย์ด้วย `day.city` ซึ่งเป็น `legacy_slug`
   * · เมืองในคลังส่วนใหญ่ **ไม่มี `legacy_slug`** (มีแค่ 6 เมืองเกาหลี) → ได้ `""`
   * · และ **วันที่ยังไม่ระบุเมืองก็ได้ `""` เหมือนกัน** → โตเกียว · โอซากา · วันที่ยังว่าง **ตกลงถังเดียวกันหมด**
   * 🎯 อาการ: สถานที่ที่เพิ่มลงวันแล้ว **ยังโผล่ในคลังให้เลือกซ้ำ** (หรือหายทั้งที่ยังไม่ได้เพิ่ม ถ้าชนถังกัน)
   *    — ไม่มี error ไม่มีอะไรฟ้อง · เป็นชนิดเดียวกับที่ `useTripCatalogCities` เตือนเรื่องเทียบวันที่
   *
   * ⚠️ **ยังไม่ได้ยิงยืนยันสด** (28 ส.ค. 2026 · ผู้ใช้กำลังลากจุดแวะบนฐาน dev อยู่ ผมเลยไม่เขียนฐาน)
   *    ที่ยืนยันแล้วคือ *เส้นทางโค้ด* เท่านั้น · เคสที่จะพิสูจน์: เพิ่มสถานที่ลงวันที่เมือง = โตเกียว
   *    แล้วดูว่าการ์ดนั้นหายจากคลังของโตเกียว **และยังอยู่** ในคลังของอีกเมืองที่ `legacy_slug` เป็น null เหมือนกัน
   */
  const selectedPlaceIdsByCatalogCityId = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const day of itinerary) {
      const cityId = platformCityIdByDayId[day.id];
      if (!cityId) continue; // วันที่ยังไม่ระบุเมือง — ไม่มีถังของตัวเอง และไม่ควรไปปนถังใคร
      const set = (map[cityId] ??= new Set());
      for (const stop of stopsByDay[day.id] ?? []) set.add(stop.place_id);
    }
    return map;
  }, [itinerary, stopsByDay, platformCityIdByDayId]);
  const selectedPlaceIdsForCatalogCity = useCallback(
    (cityId: string) => selectedPlaceIdsByCatalogCityId[cityId] ?? new Set<string>(),
    [selectedPlaceIdsByCatalogCityId]
  );

  const lastStopPlaceForDay = useCallback(
    (dayId: string) => {
      const dayStops = stopsByDay[dayId];
      if (!dayStops || dayStops.length === 0) return null;
      return resolvePlace(dayStops[dayStops.length - 1].place_id, placeSources);
    },
    [stopsByDay, placeSources]
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
    placeSources,
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
    const prevPlace = prevStop ? resolvePlace(prevStop.place_id, placeSources) : null;
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
    const place = stop ? resolvePlace(stop.place_id, placeSources) : null;
    const label = place ? `${categoryMetaOf(place.category).emoji} ${place.nameTh}` : "จุดแวะนี้";
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

  // 🔴 gate เฉพาะโครงวัน (ITINERARY + DayJumpBar/PlaceSidebar ที่ผูกกับมัน) — ไม่แตะ TripPrepPanel
  // (ที่พัก/booking/checklist) เพราะไม่มีตัวไหนพึ่ง trip_days เลย (P1/P3, 27 ส.ค. 2026 — ดู §21/§22)
  const dayPlanGate = useTripDaysGate(tripId);
  const dayPlanLoaded =
    overallLoaded && dayPlanGate !== "loading" && dayPlanSource.kind !== "loading";
  const dayPlanReady =
    overallLoaded && dayPlanGate === "ready" && dayPlanSource.kind === "platform";
  const dayPlanEmpty = overallLoaded && dayPlanGate === "empty";
  /**
   * 🔴 **อ่านแหล่งที่มาของวันไม่ได้** — ต่างจาก `dayPlanEmpty` (ฐานตอบว่าไม่มีวัน) คนละเหตุคนละข้อความ
   * ถ้าไม่มีสถานะนี้ ออฟไลน์จะได้ **โครงร่างค้างตลอดไป** ซึ่งอ่านว่า "กำลังโหลด" ทั้งที่ไม่มีอะไรกำลังโหลด
   */
  const dayPlanUnreadable = overallLoaded && dayPlanSource.kind === "unreadable";
  /**
   * อ่านได้ · รู้ว่าไม่ใช่ทริปแพลตฟอร์ม → **ยังไม่รองรับ** · ใช้ข้อความ `no-days` ที่เขียนไว้ว่า
   * *"ระบบกำลังรองรับทริปหลายใบอยู่"* — บอกว่า **ยังไม่รองรับ ไม่ใช่ "ไม่มีข้อมูล"**
   * 🔴 ผู้ใช้ที่มีจุดแวะอยู่ในฐานแล้วเห็นคำว่า "ไม่มีข้อมูล" จะคิดว่าข้อมูลของเขาหาย (P1 ย้ำ)
   */
  const dayPlanUnsupported = overallLoaded && dayPlanSource.kind === "unsupported";

  return (
    // MapsApiProvider ครอบเฉพาะหน้านี้ ไม่ได้อยู่ใน layout อีกแล้ว — หน้าแผนเป็นหน้าเดียวที่มี `<Map>`
    // จริง (DayMapPanel ในแต่ละวัน) ส่วน /today กับ /summary ใช้แผนที่แบบ iframe ที่ไม่พึ่ง SDK
    // เหตุผลเต็มอยู่ใน app/layout.tsx · แผนที่ยังคง lazy mount ตาม useInViewOnce เหมือนเดิม
    // — provider โหลด SDK อย่างเดียว ไม่ได้สั่งวาดแผนที่
    <MapsApiProvider>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <main className="min-h-full">
        <TripHeader
          tripId={tripId}
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
            {!dayPlanLoaded && !dayPlanUnreadable && !dayPlanUnsupported && (
              <>
                <DayCardSkeleton />
                <DayCardSkeleton />
                <DayCardSkeleton />
              </>
            )}

            {dayPlanUnreadable && <DayPlanUnavailableNotice reason="unreadable" />}
            {dayPlanUnsupported && !dayPlanUnreadable && <DayPlanUnavailableNotice />}
            {dayPlanEmpty && !dayPlanUnsupported && !dayPlanUnreadable && <DayPlanUnavailableNotice />}

            {/* แถบวัน sticky — กระโดดข้ามวันได้โดยไม่ต้องสกรอลล์ผ่านทั้ง 11 วัน (เฟส 17)
                เฟส 20.3 ย้ายขึ้นมาไว้บนสุด: เดิมอยู่ใต้แผงเตรียมทริปทั้งสาม จึงต้องเลื่อนผ่าน
                แผงพวกนั้นไปก่อนมันถึงจะติดบนจอ = ใช้ไม่ได้ตอนที่ต้องใช้ที่สุด */}
            {dayPlanReady && <DayJumpBar itinerary={itinerary} />}

            {overallLoaded && (
              <TripPrepPanel
                // 🔴 hotelsSetCount/hotelsTotal มาจาก hotelLegs (คำนวณจาก ITINERARY) — ตอนสะพานว่าง
                // (dayPlanEmpty) leg ไม่มีทางตรงกับที่พักจริงของทริปแพลตฟอร์มเลย จะได้ "0/11 ⚠️" เสมอ
                // ไม่ว่าจะบันทึกที่พักไปกี่ที่แล้ว — ใช้จำนวนที่พักจริงแทนตอนนั้น ไม่มี "ครบ/ไม่ครบ" ให้เทียบ
                // (P1/P3, 27 ส.ค. 2026 — ดู §22/§23)
                hotelsSetCount={
                  dayPlanReady ? hotelLegs.filter((leg) => hotels[leg.id]).length : Object.keys(hotels).length
                }
                hotelsTotal={dayPlanReady ? hotelLegs.length : Object.keys(hotels).length}
                bookingCount={bookings.length}
                checklistCheckedCount={checklistItems.filter((i) => i.is_checked).length}
                checklistTotal={checklistItems.length}
              >
                {dayPlanReady ? (
                  <HotelLegsPanel legs={hotelLegs} hotels={hotels} onSave={setHotel} onClear={clearHotel} />
                ) : (
                  <HotelsFlatList hotels={hotels} />
                )}

                <BookingsPanel
                  bookings={bookings}
                  // วันของทริปนี้เท่านั้น — `itinerary` เป็น `[]` เมื่อยังไม่รู้/ไม่รองรับ
                  // จึงได้ตัวเลือกว่างแทนวันของทริปอื่น ซึ่งเป็นสิ่งที่ถูก
                  days={itinerary.map((d) => ({ id: d.id, date: d.date, cityTh: d.cityTh }))}
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

            {dayPlanReady && daysUntilFirstDay != null && daysUntilFirstDay > 16 && (
              <div className="mb-4 rounded-xl bg-cream-soft/70 px-3 py-2 text-xs text-ink-soft">
                🌤️ พยากรณ์อากาศรายวันจะขึ้นบนหัวการ์ดเมื่อเหลืออีก ~16 วันก่อนถึงวันนั้น (ตอนนี้อีก{" "}
                {daysUntilFirstDay} วัน)
              </div>
            )}

            {dayPlanReady &&
              itinerary.map((day) => (
                <DayStopsSection
                  key={day.id}
                  day={day}
                  stops={stopsByDay[day.id] ?? []}
                  eventsSplit={
                    dayEventsSplit[day.id]
                      ? { before: dayEventsSplit[day.id].before, after: dayEventsSplit[day.id].after }
                      : undefined
                  }
                  placeSources={placeSources}
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
                  {...(usePlatformDays
                    ? {
                        cityOptions: platformCityOptions,
                        currentCityId: platformCityIdByDayId[day.id] ?? null,
                        onChangeDayCity: (cityId: string | null) => setDayCity(day.id, cityId),
                      }
                    : null)}
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

          {dayPlanReady && (
            <PlaceSidebar
              catalogCities={tripCatalogCities.status === "ready" ? tripCatalogCities.cities : undefined}
              itinerary={itinerary}
              customPlaces={customPlaces}
              who={who || undefined}
              lastStopPlaceForDay={lastStopPlaceForDay}
              hotelForDay={hotelForDay}
              onAddStopToDay={(dayId, placeId, coords) => {
                const prevPlace = lastStopPlaceForDay(dayId);
                // coords มาจาก NearbyPlacesModal ตอนสร้าง custom place ใหม่ — ใช้แทน resolvePlace
                // เพราะ customPlaces state ยังไม่ทันมีสถานที่นี้ (รอ realtime echo) ส่วนสถานที่จากคลังปกติ resolve ได้เลย
                const newPlace = coords ?? resolvePlace(placeId, placeSources);
                addStopWithStashedNote(
                  dayId,
                  placeId,
                  who || undefined,
                  defaultTravelModeFor(prevPlace, newPlace)
                ).then(flashNewStop);
              }}
              placeNotes={placeNotes}
              selectedPlaceIdsForCity={selectedPlaceIdsForCity}
              selectedPlaceIdsForCatalogCity={selectedPlaceIdsForCatalogCity}
              hiddenPlaceIds={hiddenPlaceIds}
              onHidePlace={(placeId) => hidePlace(placeId, who || undefined)}
              onUnhidePlace={unhidePlace}
              activeCity={activeCity}
              onActiveCityChange={setActiveCity}
              focusedDayId={focusedDayIdInList}
              onFocusedDayIdChange={setFocusedDayId}
              mobileOpen={sidebarMobileOpen}
              onMobileOpenChange={setSidebarMobileOpen}
            />
          )}
        </div>

        {/* 🔴 เดิมเขียนว่า "กำลังตั้งค่าแผนเริ่มต้น..." เหมือนเป็นสถานะ loading ชั่วคราว — ผิด (P1 ชี้
            27 ส.ค. 2026) `overallLoaded` เป็น true แล้วตอนถึงบรรทัดนี้ ไม่มีอะไรกำลังโหลดอยู่จริง ·
            สถานะจริงคือ "ไม่มีแผนไหน active เลย" ซึ่งเกิดถาวรได้ (เช่นลบแผน active ทิ้งแล้วไม่มีแผนไหน
            ขึ้นมาแทน — ก่อน migration `pending-review` ตัวที่ 4 ลง) ข้อความเดิมสั่งให้ผู้ใช้ "รอ" ทั้งที่
            ไม่มีอะไรจะเสร็จ ทางแก้จริงคือกด ⚙️ แล้วเลือกแผน — บอกตรงนั้นแทน */}
        {overallLoaded && !activePlan && (
          <div className="fixed inset-x-0 bottom-14 bg-maple-soft px-4 py-2 text-center text-xs text-maple-dark lg:bottom-0">
            ยังไม่มีแผนที่ใช้งานอยู่ — แตะปุ่ม ⚙️ มุมขวาบนเพื่อเลือกแผน
          </div>
        )}
      </main>

      <BottomNav tripId={tripId} />

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

      {transferContext && itinerary.length > 0 && (
        <TransferEditModal
          day={itinerary.find((d) => d.id === transferContext.dayId) ?? itinerary[0]}
          onClose={() => setTransferContext(null)}
          onSave={(input) => {
            // จุดก่อนหน้าคือจุดสุดท้ายของวันตอนนี้ (ปุ่มอยู่ท้ายการ์ด) — เดาโหมดเดินทางแบบเดียวกับจุดแวะปกติ
            const prevPlace =
              transferContext.atIndex > 0 ? lastStopPlaceForDay(transferContext.dayId) : null;
            const airport = resolvePlace(input.placeId, placeSources);
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
    </MapsApiProvider>
  );
}
