"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cityCenter, Place } from "@/data/places";
import type { City, Day, DayEvent } from "@/data/itinerary";
import { cityMetaOf, cityNameThOf } from "@/components/cityMeta";
import { DayCityPicker } from "@/components/DayCityPicker";
import type { CatalogCity } from "@/hooks/useTripCatalogCities";
import type { TripHotel, TripStop } from "@/lib/supabase";
import type { PlaceSources } from "@/lib/resolvePlace";
import type { TravelMode } from "@/lib/schedule";
import { useDaySchedule } from "@/hooks/useDaySchedule";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useSignedFiles } from "@/hooks/useSignedFiles";
import { hotelForStop, hotelToPlace } from "@/lib/hotelLegs";
import { weekdayHoursLabel } from "@/lib/openingHours";
import { placeQueryKey } from "@/lib/placeQuery";
import type { DayWeather } from "@/lib/weather";
import { WeatherBadge } from "./WeatherBadge";
import { PlaceDetailModal } from "./PlaceDetailModal";
import { DayEventsPanel } from "./DayEventsPanel";
import { DayMapPanel } from "./DayMapPanel";
import type { IntercityMode } from "./IntercityEditModal";
import { DaySummaryBar } from "./DaySummaryBar";
import { RouteSuggestionModal } from "./RouteSuggestionModal";
import { dayCardElementId } from "./DayJumpBar";
import { InsertBetweenRow } from "./InsertBetweenRow";
import NoteBody from "./NoteBody";
import { SortableStopRow } from "./SortableStopRow";
import { TravelModeRow } from "./TravelModeRow";

export function DayStopsSection({
  day,
  stops,
  eventsSplit,
  placeSources,
  hotel,
  startHotel,
  returnTravelMode,
  onReturnTravelModeChange,
  startTime,
  onStartTimeChange,
  onRemoveStop,
  onUpdateDwell,
  onUpdateTravelMode,
  onUpdateNote,
  onUpdatePhoto,
  onReorder,
  onAddPlace,
  onInsertPlace,
  onInsertIntercity,
  onInsertTransfer,
  onInsertHotel,
  weather,
  flashStopId,
  onOvernightCityChange,
  locked,
  onToggleLock,
  cityOptions,
  currentCityId = null,
  onChangeDayCity,
}: {
  day: Day;
  /** stops for this day only, already sorted by order_index */
  stops: TripStop[];
  /** เหตุการณ์ของวันที่แบ่ง ก่อน/หลัง จุดแวะมาแล้ว — ผู้เรียกที่อ่านข้อมูลจากฐานเป็นคนแบ่งด้วย
   *  `splitDayEvents()` แล้วส่งลงมา · ทริปเกาหลีเดิม (ไฟล์สถิตย์) ไม่ต้องส่ง — `useDaySchedule`
   *  จะตกไปใช้ `day.events` เอง */
  eventsSplit?: { before: DayEvent[]; after: DayEvent[] };
  placeSources: PlaceSources;
  /** ที่พักคืนนี้ = จุดจบของวัน */
  hotel: TripHotel | null;
  /** ที่พักคืนก่อนหน้า = จุดเริ่มของวัน (วันย้ายเมืองจะคนละที่กับ hotel) */
  startHotel: TripHotel | null;
  /** โหมดเดินทางขากลับที่พัก (จุดสุดท้าย → hotel) */
  returnTravelMode: TravelMode | null;
  onReturnTravelModeChange: (mode: TravelMode) => void;
  /** เวลาที่ออกจากที่พักที่ตั้งเองไว้ (ไม่ใช่เวลาถึงจุดแวะแรก) — null = ยังไม่เคยตั้ง ใช้ค่าเริ่มต้นของวันนั้น */
  startTime: string | null;
  onStartTimeChange: (value: string) => void;
  onReorder: (orderedStopIds: string[]) => void;
  /** มีค่าเฉพาะวันที่ยังเลือกเมืองนอนได้ (day.overnightOptions) */
  onOvernightCityChange?: (city: City) => void;
  onRemoveStop: (stopId: string) => void;
  onUpdateDwell: (stopId: string, minutes: number) => void;
  onUpdateTravelMode: (stopId: string, mode: TravelMode) => void;
  onUpdateNote: (stopId: string, note: string | null) => void;
  onUpdatePhoto: (stopId: string, photoUrl: string | null) => void;
  onAddPlace: () => void;
  /** เปิด modal หาร้านอาหารแทรกที่ตำแหน่ง atIndex ของวันนี้ ศูนย์กลางค้นหา = จุดก่อนหน้าตำแหน่งนั้น (หรือที่พัก/กลางเมืองถ้าแทรกก่อนจุดแรก) */
  onInsertPlace: (atIndex: number, center: { lat: number; lng: number }, prevPlace: Place | null) => void;
  /** เปิด modal แทรกเดินทางข้ามเมืองที่ตำแหน่ง atIndex ของวันนี้ พร้อมค่า default จาก/ไปเมือง
   *  (ส่ง city id ไปด้วยเพื่อให้ modal เสนอสถานีจริงของเมืองนั้นเป็นตัวเลือกด่วน) */
  onInsertIntercity: (
    atIndex: number,
    fromDefault: string,
    toDefault: string,
    fromCity: City,
    toCity: City
  ) => void;
  /** เปิด modal แทรกแถว "ไปสนามบิน" ที่ตำแหน่ง atIndex ของวันนี้ */
  onInsertTransfer: (atIndex: number) => void;
  /** แทรกแถว "แวะที่พัก" ที่ตำแหน่ง atIndex ของวันนี้ — เช็คอิน/ฝากกระเป๋ากลางวันแล้วเที่ยวต่อ */
  onInsertHotel: (atIndex: number) => void;
  /** พยากรณ์อากาศของวันนี้ — null/undefined เมื่อยังอยู่นอกช่วงพยากรณ์ ~16 วัน (ปกติตอนวางแผนล่วงหน้า) */
  weather?: DayWeather | null;
  /** id ของจุดแวะที่เพิ่งถูกเพิ่ม (ทั้งวันไหนก็ได้) — ใช้ไฮไลต์แถวนั้นสั้นๆ */
  flashStopId: string | null;
  /** true = วันนี้ลงตัวแล้ว ล็อกไว้กันเผลอลาก/แก้ตอนเลื่อนดู */
  locked: boolean;
  onToggleLock: () => void;
  /**
   * เมืองที่เลือกให้วันนี้ได้ = จุดหมายของทริปนี้ — **มีเฉพาะทริปที่สร้างบนแพลตฟอร์ม**
   * 🔴 `undefined` (ทริปเกาหลีเดิม) ต่างจาก `[]` (ทริปแพลตฟอร์มที่ยังไม่ตั้งจุดหมาย) — ตัวแรกโชว์ชื่อเมือง
   *    เฉย ๆ เหมือนเดิมทุกบรรทัด ตัวหลังโชว์ตัวเลือกที่ว่าง พร้อมบอกว่าต้องไปตั้งจุดหมายก่อน
   */
  cityOptions?: CatalogCity[];
  /** `catalog_cities.id` ของเมืองวันนี้ · `null` = ยังไม่ระบุ — **id ไม่ใช่ชื่อ** เพราะชื่อซ้ำกันได้ */
  currentCityId?: string | null;
  /** บันทึกเมืองของวันนี้ · `null` = ล้างกลับเป็น "ยังไม่ระบุเมือง" · **โยน error เมื่อไม่สำเร็จ** */
  onChangeDayCity?: (cityId: string | null) => Promise<void>;
}) {
  // เซ็น signed URL ของรูปจุดแวะทั้งวันครั้งเดียว (E2-AC13 ②) — ไม่ใช่ให้ SortableStopRow เซ็นเอง
  // ทีละแถว เพราะที่นี่มี stops ทั้งวันอยู่ในมือแล้วโดยธรรมชาติของโครงเดิม ไม่ต้องรื้อ prop chain
  // ใหม่เพื่อสร้างจุด batch (ตามที่ P1 ยืนยันใน ux-flows.md §12)
  const signedStopPhotos = useSignedFiles(stops.map((s) => s.photo_url));

  // droppable ของทั้งวันนี้ — ใช้ตอนลากการ์ดจากคลัง sidebar มาวาง หรือลากจุดแวะข้ามมาจากวันอื่น
  // (การจัดลำดับ/ย้ายข้ามวันจริงๆ ถูกจัดการที่ DndContext ระดับบนสุดใน app/page.tsx)
  const { setNodeRef: setDayDroppableRef, isOver } = useDroppable({
    id: `day-${day.id}`,
    data: { type: "day", dayId: day.id },
    disabled: locked,
  });

  const dateLabel = new Date(day.date).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
  /**
   * 🔴 **วันที่ยังไม่ระบุเมือง หรือเมืองที่ไม่ได้อยู่ในไฟล์เดิม — ต้องไม่พังหน้าจอ**
   * `CITY_META` เป็น `Record<Day["city"], …>` ที่มีแค่ 6 เมืองเกาหลี · ทริปที่สร้างบนแพลตฟอร์มมี
   * **วันที่ไม่มีเมืองเป็นสภาพตั้งต้น** (ผู้ใช้สั่งเอง 28 ส.ค. 2026: *"ไม่ต้องเดา ให้ว่างไว้แล้วผมเลือกเอง"*)
   * และอาจเป็นเมืองนอกไฟล์เดิม (โตเกียว ฯลฯ) → `CITY_META[...]` เป็น `undefined` แล้วอ่าน `.icon` ต่อ = จอขาว
   * · ทริปเกาหลีเดิมไม่กระทบเลย เพราะทุกวันมีเมืองที่อยู่ใน `CITY_META` อยู่แล้ว → เข้าทางซ้ายเสมอ
   */
  const meta = cityMetaOf(day.city);

  // ศูนย์กลางค้นหาตอนแทรกร้านก่อนจุดแรกของวัน (ยังไม่มี "จุดก่อนหน้า" ให้อิง) — ที่พักคืนนั้นก่อน ไม่งั้นใช้กลางเมือง
  // ⚠️ เมืองที่ไม่มีใน `PLACES` จะได้ `NaN` (หารด้วยศูนย์) — ไม่ทำให้พัง แต่ทำให้ลำดับ "ร้านใกล้ ๆ" เพี้ยน
  //    ตอนแทรกจุดแรกของวันที่ยังไม่มีที่พัก · ยอมรับในเฟสนี้ · แก้จริงต้องให้ศูนย์กลางเมืองมาจากคลังในฐาน
  const centerBeforeFirstStop = hotel ? { lat: hotel.lat, lng: hotel.lng } : cityCenter(day.city);

  // ค่า default จาก/ไปของแถวเดินทางข้ามเมือง — เดาจาก city ของวันนี้ ไปเมืองที่นอนคืนนี้ (ถ้าต่างจากเมืองที่เที่ยว)
  const intercityFromCity = day.city;
  const intercityToCity = day.overnightCity ?? day.city;
  const intercityFromDefault = cityNameThOf(intercityFromCity);
  const intercityToDefault = cityNameThOf(intercityToCity);

  const {
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
  } = useDaySchedule({ day, stops, eventsSplit, placeSources, hotel, startHotel, returnTravelMode, startTime });

  // วันที่ล็อกแล้ว = ลงตัวแล้ว ไม่ต้องกางให้เกะกะตอนไล่ดูทั้ง 11 วันบนมือถือ (เฟส 17)
  // ยุบอยู่ = ไม่ mount ทั้งลิสต์และแผนที่ของวันนั้น ได้ performance มาฟรีๆ ด้วย
  // ไม่ใช้ effect sync กับ locked — พอปลดล็อกแล้ว locked เป็น false การ์ดกางเองทันทีจากสูตรนี้
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const collapsed = locked && !manuallyExpanded;

  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [suggestingRoute, setSuggestingRoute] = useState(false);
  // ปุ่มรองท้ายการ์ด (แวะที่พัก / ไปสนามบิน / จัดเส้นทางใหม่) — ปิดไว้ก่อน กดกางเอา
  const [moreOpen, setMoreOpen] = useState(false);
  const viewSched = viewIndex != null ? schedule[viewIndex] : null;

  // ส่งให้แผนที่ใช้โชว์ในป๊อปอัพ (โน้ต + จุดที่จะไปตอนปิด)
  const notesByStopId = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const stop of stops) map[stop.id] = stop.note;
    return map;
  }, [stops]);

  // ไอคอนพาหนะข้ามเมือง (🚌/🚄/🚗) ให้แผนที่เอาไปคั่นชิปเมือง — แถว kind="intercity" มี place_id ว่าง
  // จึงถูกกรองทิ้งก่อนถึงแผนที่ และ ScheduledStop ก็ไม่มีฟิลด์ kind/intercity_* ให้ดูเอง
  const intercityModeBeforeStopId = useMemo(() => {
    const map: Record<string, IntercityMode> = {};
    let pending: IntercityMode | null = null;
    for (const stop of stops) {
      if (stop.kind === "intercity") {
        pending = (stop.intercity_mode as IntercityMode | null) ?? "other";
        continue;
      }
      if (pending) {
        map[stop.id] = pending;
        pending = null;
      }
    }
    return map;
  }, [stops]);

  // ไฮไลต์สองทาง: คลิกหมุดบนแผนที่ ↔ คลิกชื่อสถานที่ในลิสต์ — แยกอิสระต่อวัน คนละหน้าที่กับ flashStopId (pulse ชั่วคราวตอนเพิ่งเพิ่มจุดแวะ)
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  // ตรงกับ breakpoint `lg:` ของ Tailwind ที่คุมเลย์เอาต์ลิสต์+แผนที่คู่กัน (เดียวกับที่ PlaceSidebar ใช้)
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // แผนที่ของวันนี้ mount ก็ต่อเมื่อเลื่อนมาใกล้แล้ว (เฟส 19 — ครึ่งหลังของ P-1 ที่เฟส 13 ทำฝั่งมือถือไป)
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const mapInView = useInViewOnce(mapWrapRef);
  const hasMapPoints = schedule.some((s) => s.place != null);

  // ที่พักที่ตื่นมาจากคืนก่อนหน้า ในรูป Place — ให้แถว `placeId: "@hotel"` ของตารางบิน
  // (เช่น "เช็คเอาต์ + ออกจากโรงแรมโซล" เช้าวันกลับ) เปิดดูรายละเอียดได้เหมือนสถานที่อื่น
  const startHotelPlace = useMemo(
    () => (startHotel ? hotelToPlace(startHotel, day.city) : null),
    [startHotel, day.city]
  );

  useEffect(() => {
    if (!activeStopId) return;
    rowRefs.current.get(activeStopId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeStopId]);

  return (
    <section
      id={dayCardElementId(day.id)}
      className={`mb-5 overflow-hidden rounded-2xl border bg-surface-raised shadow-sm shadow-ink/5 ${
        locked ? "border-pine/40 ring-1 ring-pine/25" : "border-line"
      } scroll-mt-16`}
    >
      <div
        className="focus-ring-on-dark px-4 py-3 text-cream"
        style={{
          background: `linear-gradient(135deg, ${meta.color}, ${meta.colorDark})`,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs opacity-80">
              {dateLabel} · วัน{day.weekdayTh}
            </div>
            {cityOptions && onChangeDayCity ? (
              <DayCityPicker
                dayId={day.id}
                dateLabel={dateLabel}
                currentCityId={currentCityId}
                currentCityTh={day.cityTh}
                icon={meta.icon}
                options={cityOptions}
                onChange={onChangeDayCity}
              />
            ) : (
              <div className="text-lg font-bold">
                {meta.icon} {day.cityTh}
              </div>
            )}
          </div>
          {/* ล็อกวันที่ลงตัวแล้ว — กันเผลอลากจุดแวะหลุดตอนเลื่อนดูบนมือถือ */}
          <button
            onClick={onToggleLock}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              locked
                ? "bg-surface-raised text-content"
                : "border border-white/30 bg-white/10 text-cream hover:bg-white/20"
            }`}
          >
            {locked ? "🔒 ล็อกไว้" : "🔓 ล็อกวันนี้"}
          </button>
        </div>
        {weather && <WeatherBadge weather={weather} className="mt-1.5" />}
        {day.note && <NoteBody note={day.note} className="mt-1 text-xs opacity-90" />}
        {/* ชื่อโรงแรมจาก Google มักพ่วงที่อยู่เต็มมาด้วย บนมือถือกินไป 2-3 บรรทัดในหัวการ์ด — ตัดให้เหลือบรรทัดเดียว */}
        {hotel && (
          <div className="mt-1 truncate text-xs opacity-90" title={hotel.hotel_name}>
            🏨 พักที่ {hotel.hotel_name}
          </div>
        )}
        {day.overnightOptions && onOvernightCityChange && !locked && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs opacity-90">
            <span>🛏️ คืนนี้นอนที่</span>
            {day.overnightOptions.map((city) => {
              const active = (day.overnightCity ?? day.city) === city;
              return (
                <button
                  key={city}
                  onClick={() => onOvernightCityChange(city)}
                  className={`rounded-full px-2.5 py-1.5 font-medium sm:py-1 ${
                    active
                      ? "bg-surface-raised text-content"
                      : "border border-white/30 bg-white/10 text-cream hover:bg-white/20"
                  }`}
                >
                  {cityMetaOf(city).icon} {cityNameThOf(city)}
                  {city === day.overnightOptions?.[0] ? " (จองไว้)" : ""}
                </button>
              );
            })}
          </div>
        )}
        {day.noHotel ? (
          <div className="mt-1 text-xs opacity-90">🛫 วันเดินทาง — ไม่มีคืนที่ต้องจองที่พัก</div>
        ) : (
          <div className="mt-1 text-xs opacity-90">
            {mealCount > 0 ? `🍽️ วางมื้อไว้ ${mealCount} มื้อ` : "⚠️ ยังไม่มีมื้ออาหารวันนี้"}
          </div>
        )}
        {/* เวลาเริ่มนับตารางของวัน — ตั้งเองได้ทุกวันรวมวันบิน (ตารางบินยังล็อกอยู่ในแผงด้านล่าง)
            วันที่มีเหตุการณ์ตายตัวเป็นจุดเริ่ม (เช่น ถึงเมืองเก่าฮานอย 15:30) ใช้เวลานั้นเป็นค่าเริ่มต้นให้
            แต่ถ้าผ่าน ตม./รับกระเป๋าเร็วหรือช้ากว่าที่เผื่อไว้ ก็ปรับเองแล้วกด "กลับไปใช้เวลาแนะนำ" คืนได้ */}
        {locked ? (
          <div className="mt-2 text-xs opacity-90">🕐 ออกเดินทาง {effectiveStartTime} · 🔒 ล็อกไว้</div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs opacity-90">
            <label className="flex items-center gap-1.5">
              🕐 ออกเดินทาง
              <input
                type="time"
                value={effectiveStartTime}
                // กดปุ่ม ✕ ล้างช่องนี้ส่ง "" มา (browser native) — เดิมเขียนลง DB ตรงๆ แล้วพัง timeToMinutes
                // ทั้งวัน (บั๊ก 7.3) เพราะ start_time เป็นคอลัมน์ text ไม่ใช่ time เลยไม่มีด่านกันจากฝั่ง DB
                onChange={(e) => {
                  if (e.target.value) onStartTimeChange(e.target.value);
                }}
                className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-cream [color-scheme:dark] focus:border-gold focus:outline-none"
              />
            </label>
            {beforeAnchorEvent && (
              <span>
                (แนะนำ {beforeAnchorEvent.time} — ต่อจาก {beforeAnchorEvent.icon}{" "}
                {beforeAnchorEvent.title})
              </span>
            )}
            {startTime != null && startTime !== defaultStartTime && (
              <button
                onClick={() => onStartTimeChange(defaultStartTime)}
                className="underline hover:text-gold"
              >
                กลับไปใช้เวลาแนะนำ ({defaultStartTime})
              </button>
            )}
          </div>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setManuallyExpanded(true)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm text-content-soft hover:bg-surface-soft/60"
        >
          <span>
            📍 {stops.length} จุด · {effectiveStartTime}
            {daySchedule.arriveBackAt ? ` – ${daySchedule.arriveBackAt}` : ""}
          </span>
          <span className="shrink-0 text-xs">▸ กางดู</span>
        </button>
      )}

      {!collapsed && eventsBeforeStops && eventsBeforeStops.length > 0 && (
        <DayEventsPanel
          events={eventsBeforeStops}
          hotelPlace={startHotelPlace}
          placeSources={placeSources}
        />
      )}

      {!collapsed && hasMapPoints && (
        <div className="flex gap-1 border-b border-line bg-surface-soft/30 px-3 pt-2 lg:hidden">
          <button
            onClick={() => setMobileView("list")}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-medium ${
              mobileView === "list" ? "bg-surface-raised text-content" : "text-content-soft"
            }`}
          >
            📋 รายการ
          </button>
          <button
            onClick={() => setMobileView("map")}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-medium ${
              mobileView === "map" ? "bg-surface-raised text-content" : "text-content-soft"
            }`}
          >
            🗺️ แผนที่
          </button>
        </div>
      )}
      {/* min-w-0 บนตัว flex item ฝั่งลิสต์สำคัญมาก — ไม่มีแล้วเนื้อหายาวๆ ในลิสต์จะดันแผนที่ทะลุออกนอกการ์ด */}
      {!collapsed && (
      <div className="lg:flex lg:items-start lg:gap-3 lg:px-3 lg:py-3">
        <div
          ref={setDayDroppableRef}
          className={`min-w-0 divide-y divide-line transition-colors lg:flex-1 ${
            mobileView === "list" ? "block" : "hidden"
          } lg:block ${isOver ? "bg-maple-soft/40 ring-2 ring-inset ring-maple" : ""}`}
        >
          {stops.length === 0 && (
            <div className="px-4 py-5 text-center text-sm text-content-soft">
              {locked
                ? "วันนี้ล็อกไว้และยังไม่มีจุดแวะ — ปลดล็อกที่หัวการ์ดถ้าจะเพิ่ม"
                : "ยังไม่มีจุดแวะ — กดปุ่ม “+ เพิ่มสถานที่ให้วันนี้” ด้านล่าง หรือลากจากคลังบนจอใหญ่ก็ได้"}
            </div>
          )}
          {/* จุดเริ่มของวัน = ที่พักคืนก่อนหน้า (วันย้ายเมืองจะเป็นคนละที่กับที่พักคืนนี้) */}
          {showStartAnchorRow && startAnchor && (
            <div className="flex items-center gap-2 bg-pine-soft/40 px-3 py-2 text-xs text-pine-dark sm:px-4">
              <span className="w-12 shrink-0 text-center font-semibold tabular-nums sm:w-14">
                {effectiveStartTime}
              </span>
              <span className="min-w-0 flex-1 truncate" title={startAnchor.label}>
                🏨 ออกจาก {startAnchor.label}
              </span>
            </div>
          )}
          {showStartAnchorRow && startAnchor && firstPlace && (
            <TravelModeRow
              key={`start-${startAnchorMode ?? "unset"}`}
              fromPlace={startAnchor}
              toPlace={firstPlace}
              mode={startAnchorMode}
              resolvedMinutes={daySchedule.travelMinutesFromStart ?? 0}
              isReal={isTravelTimeReal(startAnchor.id, firstPlace.id, startAnchorMode)}
              prefix="จากที่พัก"
              locked={locked}
              onSetMode={(mode) => onUpdateTravelMode(stops[0].id, mode)}
            />
          )}
          {stops.length > 0 && !locked && (
            <InsertBetweenRow
              actions={[
                {
                  label: "+ แทรกร้านอาหารก่อนจุดแรก",
                  tone: "maple",
                  onClick: () => onInsertPlace(0, centerBeforeFirstStop, null),
                },
                ...(hotel
                  ? [
                      {
                        label: "🏨 + แวะที่พักก่อนจุดแรก",
                        tone: "pine" as const,
                        onClick: () => onInsertHotel(0),
                      },
                    ]
                  : []),
                {
                  label: "+ แทรกเดินทางข้ามเมืองก่อนจุดแรก",
                  tone: "pine",
                  onClick: () =>
                    onInsertIntercity(
                      0,
                      intercityFromDefault,
                      intercityToDefault,
                      intercityFromCity,
                      intercityToCity
                    ),
                },
              ]}
            />
          )}
          <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {schedule.map((sched, i) => {
              const stop = stops[i];
              const prevPlace = i > 0 ? schedule[i - 1].place : undefined;
              return (
                <SortableStopRow
                  key={stop.id}
                  stop={stop}
                  dayId={day.id}
                  index={i}
                  sched={sched}
                  prevPlace={prevPlace}
                  travelMinutesIn={
                    i === 0 ? daySchedule.travelMinutesFromStart : sched.travelMinutesFromPrev
                  }
                  isFlashing={stop.id === flashStopId}
                  isActive={stop.id === activeStopId}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(stop.id, el);
                    else rowRefs.current.delete(stop.id);
                  }}
                  isTravelReal={
                    prevPlace != null &&
                    sched.place != null &&
                    isTravelTimeReal(prevPlace.id, sched.place.id, (stop.travel_mode as TravelMode | null) ?? null)
                  }
                  closedWarning={closedStopIds.has(stop.id)}
                  closedHoursLabel={
                    sched.place != null
                      ? weekdayHoursLabel(openingHoursByQuery.get(placeQueryKey(sched.place)), day.date)
                      : null
                  }
                  locked={locked}
                  onSetTravelMode={(mode) => onUpdateTravelMode(stop.id, mode)}
                  onView={() => {
                    setViewIndex(i);
                    setActiveStopId(stop.id);
                  }}
                  onUpdateDwell={(minutes) => onUpdateDwell(stop.id, minutes)}
                  onUpdateNote={(note) => onUpdateNote(stop.id, note)}
                  onUpdatePhoto={(photoUrl) => onUpdatePhoto(stop.id, photoUrl)}
                  onRemoveStop={() => onRemoveStop(stop.id)}
                  onInsertBefore={
                    i > 0 && prevPlace
                      ? () => onInsertPlace(i, { lat: prevPlace.lat, lng: prevPlace.lng }, prevPlace)
                      : undefined
                  }
                  onInsertIntercityBefore={
                    i > 0
                      ? () =>
                          onInsertIntercity(i, intercityFromDefault, intercityToDefault, intercityFromCity, intercityToCity)
                      : undefined
                  }
                  onInsertHotelBefore={i > 0 && hotel ? () => onInsertHotel(i) : undefined}
                  hotelName={hotelForStop(stop.place_id, hotel, startHotel)?.hotel_name ?? null}
                  signedPhotoUrl={
                    stop.photo_url ? signedStopPhotos.get(stop.photo_url) : undefined
                  }
                />
              );
            })}
          </SortableContext>

          {/* จุดจบของวัน = กลับไปนอนที่พักคืนนี้ */}
          {showEndAnchorRow && endAnchor && lastPlace && (
            <TravelModeRow
              key={`end-${returnTravelMode ?? "unset"}`}
              fromPlace={lastPlace}
              toPlace={endAnchor}
              mode={returnTravelMode}
              resolvedMinutes={daySchedule.travelMinutesToEnd ?? 0}
              isReal={isTravelTimeReal(lastPlace.id, endAnchor.id, returnTravelMode)}
              prefix="กลับที่พัก"
              locked={locked}
              onSetMode={onReturnTravelModeChange}
            />
          )}
          {showEndAnchorRow && endAnchor && (
            <div className="flex items-center gap-2 bg-pine-soft/40 px-3 py-2 text-xs text-pine-dark sm:px-4">
              <span className="w-12 shrink-0 text-center font-semibold tabular-nums sm:w-14">
                {daySchedule.arriveBackAt}
              </span>
              <span className="min-w-0 flex-1 truncate" title={endAnchor.label}>
                🏨 กลับถึง {endAnchor.label}
              </span>
            </div>
          )}

          {locked ? (
            <button
              onClick={onToggleLock}
              className="flex w-full items-center justify-center gap-1 px-4 py-3 text-sm font-medium text-content-soft hover:bg-surface-soft/60"
            >
              🔒 วันนี้ล็อกไว้ — แตะเพื่อปลดล็อกและแก้ไข
            </button>
          ) : (
            <div>
              {/* งานที่ทำบ่อยที่สุดของการ์ดนี้ ให้เป็นปุ่มเดียวเต็มความกว้าง (เฟส 20.3)
                  เดิมมี 4 ปุ่มเรียงกันรวดในแถวเดียว บนมือถือกลายเป็นแถวตัวหนังสือที่หาปุ่มหลักไม่เจอ */}
              <div className="flex items-center">
                <button
                  onClick={onAddPlace}
                  className="flex flex-1 items-center justify-center gap-1 px-4 py-3 text-sm font-medium text-maple hover:bg-maple-soft/40"
                >
                  + เพิ่มสถานที่ให้วันนี้
                </button>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className="shrink-0 px-4 py-3 text-sm font-medium text-content-soft hover:bg-surface-soft/60"
                >
                  อื่นๆ {moreOpen ? "▲" : "▼"}
                </button>
              </div>
              {moreOpen && (
                <div className="flex flex-wrap items-center justify-center gap-1 border-t border-line bg-surface-soft/20">
                  {/* ไปสนามบินเป็นแถวท้ายวันเสมอในทางปฏิบัติ จึงวางปุ่มไว้ท้ายการ์ดที่เดียว
                      (ถ้าอยากได้กลางวันก็ลากขึ้นไปได้) */}
                  {/* แวะที่พักท้ายวัน = เอาของไปเก็บก่อนออกไปกินข้าวเย็นต่อ (ต่างจาก anchor "กลับถึงที่พัก"
                      ที่เป็นจุดจบวันเฉยๆ แวะแล้วไปต่อไม่ได้) — ขึ้นเฉพาะวันที่ตั้งที่พักไว้แล้ว */}
                  {hotel && (
                    <button
                      onClick={() => onInsertHotel(stops.length)}
                      className="px-4 py-3 text-sm font-medium text-pine-dark hover:bg-pine-soft/40"
                    >
                      🏨 + แวะที่พัก
                    </button>
                  )}
                  <button
                    onClick={() => onInsertTransfer(stops.length)}
                    className="px-4 py-3 text-sm font-medium text-pine-dark hover:bg-pine-soft/40"
                  >
                    ✈️ + ไปสนามบิน/สถานี
                  </button>
                  {stops.length >= 3 && (
                    <button
                      onClick={() => setSuggestingRoute(true)}
                      className="px-4 py-3 text-sm font-medium text-pine-dark hover:bg-pine-soft/40"
                    >
                      ✨ ลองจัดเส้นทางใหม่
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* บนมือถือต้อง unmount จริง ไม่ใช่ซ่อนด้วย `hidden` — เดิมแผนที่ทุกวัน mount และโหลด tile ครบทุกตัว
            ทั้งที่ผู้ใช้ยังไม่ได้กดแท็บ 🗺️ เลย (วัดที่ 375px: mount 4 ตัว เห็น 0 ตัว, ยิง maps.googleapis.com 43 ครั้ง)
            isDesktop มาจาก useMediaQuery ที่ SSR คืน false เสมอ — จอใหญ่จึง mount หลัง hydrate หนึ่งเฟรม ซึ่งรับได้ */}
        {hasMapPoints && !collapsed && (mobileView === "map" || isDesktop) && (
          <div
            ref={mapWrapRef}
            className="h-72 px-3 pb-3 pt-3 lg:h-[420px] lg:w-72 lg:shrink-0 lg:px-0 lg:pb-0 lg:pt-0"
          >
            {!mapInView ? (
              // กล่องเปล่าขนาดเท่าของจริง — กันหน้ากระตุกตอนแผนที่โผล่มาแทนที่
              <div className="h-full animate-pulse rounded-xl bg-surface-soft/60" />
            ) : (
            <DayMapPanel
              schedule={schedule}
              startHotel={startHotel}
              endHotel={hotel}
              notesByStopId={notesByStopId}
              intercityModeBeforeStopId={intercityModeBeforeStopId}
              closedStopIds={closedStopIds}
              activeStopId={activeStopId}
              onSelectStop={setActiveStopId}
              onOpenDetail={(stopId) => {
                const index = schedule.findIndex((s) => s.id === stopId);
                if (index >= 0) setViewIndex(index);
              }}
              className="h-full"
            />
            )}
          </div>
        )}
      </div>
      )}

      {!collapsed && hasMapPoints && (
        <DaySummaryBar
          schedule={daySchedule}
          startHotel={startHotel}
          endHotel={hotel}
          dominantMode={dominantMode}
          hasEstimatedLeg={hasEstimatedLeg}
        />
      )}

      {!collapsed && deadlineOverrunMinutes != null && afterAnchorEvent && (
        <div className="bg-maple-soft/70 px-4 py-2 text-xs text-maple-dark">
          ⚠️ ตารางที่วางไว้จบช้ากว่ากำหนด &quot;{afterAnchorEvent.title}&quot; ({afterAnchorEvent.time}) ไป{" "}
          {deadlineOverrunMinutes} นาที ลองลดเวลาที่อยู่บางจุดหรือตัดบางจุดออก
        </div>
      )}

      {!collapsed && eventsAfterStops.length > 0 && (
        <DayEventsPanel
          events={eventsAfterStops}
          heading="✈️ ต่อจากนั้น"
          hotelPlace={startHotelPlace}
          placeSources={placeSources}
        />
      )}

      {suggestingRoute && (
        <RouteSuggestionModal
          stops={stops}
          placesById={placesById}
          startAt={startAnchor}
          endAt={endAnchor}
          buildSchedule={buildSchedule}
          isClosedAt={isClosedAt}
          onApply={onReorder}
          onClose={() => setSuggestingRoute(false)}
        />
      )}

      {viewSched?.place && (
        <PlaceDetailModal
          place={viewSched.place}
          previousPlace={
            viewIndex != null && viewIndex > 0 ? schedule[viewIndex - 1].place ?? null : null
          }
          hotel={hotel}
          userNote={viewIndex != null ? stops[viewIndex]?.note : null}
          userPhotoUrl={viewIndex != null ? stops[viewIndex]?.photo_url : null}
          onClose={() => setViewIndex(null)}
        />
      )}
    </section>
  );
}
