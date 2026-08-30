"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORY_EMOJI } from "@/data/places";
import type { Place } from "@/data/places";
import type { Day } from "@/data/itinerary";
import type { TripHotel, TripStop } from "@/lib/supabase";
import { applyOvernightOverrides, hotelForStop, hotelToPlace } from "@/lib/hotelLegs";
import { splitDayEvents } from "@/lib/engine/dayEvents";
import { resolveEventPlace } from "@/lib/eventPlace";
import { LayoverBadges } from "@/components/LayoverBadges";
import { isOpenDuring, minutesUntilClose, weekdayHoursLabel } from "@/lib/openingHours";
import { placeQueryKey } from "@/lib/placeQuery";
import type { GoogleOpeningHours } from "@/lib/googlePlaces";
import { estimateDelayMinutes, shiftTime } from "@/lib/liveDelay";
import { hotelNavigationName, navigationName, mapActionsFor, type MapAction } from "@/lib/mapLinks";
import type { MapProvider } from "@/lib/engine/countries";
import { countryOfCitySlug } from "@/data/emergency";
import { LocalNameCard } from "@/components/LocalNameCard";
import { PlaceDetailModal } from "@/components/PlaceDetailModal";
import { placeDetailsCache } from "@/hooks/usePlaceDetails";
import { INTERCITY_MODE_ICON, INTERCITY_MODE_LABEL, type IntercityMode } from "@/components/IntercityEditModal";
import { BOOKING_CATEGORY_ICON, BOOKING_CATEGORY_LABEL } from "@/components/BookingsPanel";
import { PlaceThumb } from "@/components/PlaceThumb";
import { useHotels } from "@/hooks/useHotels";
import { useBookings } from "@/hooks/useBookings";
import { usePlans } from "@/hooks/usePlans";
import { useStops } from "@/hooks/useStops";
import { useCustomPlaces } from "@/hooks/useCustomPlaces";
import { useOvernightOverrides } from "@/hooks/useOvernightOverrides";
import { useHotelSchedule } from "@/hooks/useHotelSchedule";
import { useTripWeather } from "@/hooks/useTripWeather";
import { useDarkTheme } from "@/hooks/useDarkTheme";
import { useDaySchedule } from "@/hooks/useDaySchedule";
import { useDaySettings } from "@/hooks/useDaySettings";
import { useSignedFiles } from "@/hooks/useSignedFiles";
import { signStoredFile } from "@/lib/engine/files";
import { BottomNav } from "@/components/BottomNav";
import { WeatherBadge } from "@/components/WeatherBadge";
import { EmergencyCard } from "@/components/EmergencyCard";
import type { TravelMode } from "@/lib/schedule";
import { isImageAttachment, safeHttpUrl } from "@/lib/url";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { showUndoToast } from "@/lib/toast";
import NoteBody from "@/components/NoteBody";
import { localDateIso } from "@/lib/localDate";
import { useMounted } from "@/hooks/useMounted";
import { useActiveTripId } from "@/hooks/useActiveTripId";
import { TripDataProvider } from "@/components/TripDataProvider";
import { TripStatusFallback } from "@/components/TripStatusFallback";
import { usePlatformItinerary } from "@/hooks/usePlatformItinerary";
import { DayPlanUnavailableNotice } from "@/components/DayPlanUnavailableNotice";


/** ป้ายชื่อของแถวจุดแวะในลิสต์ "ถัดจากนี้" / "ผ่านมาแล้ว"
 *  แถวพิเศษไม่มีชื่อสถานที่ของตัวเองให้ใช้: ข้ามเมืองใช้ต้นทาง→ปลายทาง ส่วนแวะที่พักดึงชื่อจาก
 *  `trip_hotels` สดๆ (ไม่ใช่จาก place ที่ resolve จาก id ซึ่งเป็นชื่อกลางๆ ว่า "ที่พัก")
 *  — วันย้ายเมืองมีที่พัก 2 แห่ง จึงต้องเลือกให้ตรงกับพิกัดในแถวนั้น ดู hotelForStop */
function stopRowLabel(
  stop: TripStop,
  place: Place | undefined,
  endHotel: TripHotel | null,
  startHotel: TripHotel | null
): string {
  if (stop.kind === "intercity") {
    const mode = (stop.intercity_mode as IntercityMode) ?? "other";
    return `${INTERCITY_MODE_ICON[mode]} ${stop.intercity_from} → ${stop.intercity_to}`;
  }
  if (stop.kind === "hotel") {
    const hotel = hotelForStop(stop.place_id, endHotel, startHotel);
    return `🏨 แวะที่พัก${hotel ? ` · ${hotel.hotel_name}` : ""}`;
  }
  return place ? `${CATEGORY_EMOJI[place.category]} ${place.nameTh}` : "ไม่พบข้อมูลสถานที่";
}

/** วันในทริปที่ตรงกับวันที่ todayIso ตามนาฬิกาเครื่อง — ก่อนทริปคืนวันแรก, หลังทริปคืนวันสุดท้าย */
function findTodayIndex(itinerary: Day[], todayIso: string): number {
  // 🔴 **`B6` (30 ส.ค. 2026 · P3): อาเรย์ว่างเป็นสภาพปกติแล้ว ไม่ใช่เคสที่เป็นไปไม่ได้**
  //    เดิม `itinerary` คือ `ITINERARY` ซึ่งมี 11 วันคงที่ตั้งแต่เฟรมแรกเสมอ → `itinerary[0]` ปลอดภัยโดยบังเอิญ
  //    ตอนนี้วันมาจากฐาน → **เฟรมแรกว่างทุกครั้ง** → `itinerary[0].date` = `TypeError` ทั้งหน้า
  if (itinerary.length === 0) return 0;
  const exact = itinerary.findIndex((d) => d.date === todayIso);
  if (exact >= 0) return exact;
  if (todayIso < itinerary[0].date) return 0;
  return itinerary.length - 1;
}

/**
 * 🔴 **วันว่างสำหรับเฟรมที่ยังไม่มีข้อมูล — ไม่ได้ถูกเรนเดอร์** (`B6` · P3)
 * hook ด้านล่างรับ `day` ทุกตัวและ **ต้องถูกเรียกทุกเฟรมตามกฎของ React** จึงคืนค่าว่างให้มันแทน
 * `undefined` · ประตูข้างล่าง (`dayPlanGate`) คืนหน้าอื่นก่อนถึง JSX ที่ใช้ค่าพวกนี้เสมอ
 * ⚠️ **ห้ามใส่ค่าที่ดูเหมือนข้อมูลจริง** (เช่นวันที่วันนี้) — ถ้าวันหนึ่งประตูรั่ว เราอยากให้จอว่าง
 *    ไม่ใช่จอที่ดูถูกต้องแต่เป็นของปลอม
 */
const EMPTY_DAY: Day = {
  id: "",
  date: "",
  weekdayTh: "",
  weekdayEn: "",
  city: "" as Day["city"],
  cityTh: "",
  cityEn: "",
  slots: [],
};

/** โครงหน้าตอนโหลด — ทรงเดียวกับการ์ด "จุดถัดไป" + ลิสต์ถัดจากนี้ (เฟส 20.4)
 *  เดิมเป็นข้อความ "กำลังโหลด..." เปล่าๆ ขณะที่หน้าแผนมี skeleton อยู่แล้ว
 *  หน้านี้เปิดบนเน็ตมือถือระหว่างเดินทางจริง ยิ่งต้องดูเหมือนกำลังทำงาน ไม่ใช่เหมือนพัง */
function TodaySkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 pt-4" aria-hidden>
      <div className="mb-5 overflow-hidden rounded-2xl border-2 border-line bg-surface-raised">
        <div className="h-7 bg-surface-soft" />
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 shrink-0 rounded-xl bg-surface-soft" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-2/3 rounded bg-surface-soft" />
              <div className="h-4 w-24 rounded bg-surface-soft" />
            </div>
          </div>
          <div className="h-16 rounded-xl bg-surface-soft" />
          <div className="h-12 rounded-xl bg-surface-soft" />
        </div>
      </div>
      <div className="space-y-2 rounded-2xl border border-line bg-surface-raised p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-6 rounded bg-surface-soft" />
        ))}
      </div>
    </div>
  );
}

// เมทาสีของแต่ละผู้ให้บริการ — สีปุ่มเป็นสีแบรนด์ของแอปนั้นๆ ไม่ใช่โทเคนของเว็บเรา (Kakao/Naver มีสีทางการ
// ที่คนไทยจำได้จากแอปจริง) ปุ่มที่แสดงจริงมาจาก mapActionsFor(countryCode, target) ไม่ใช่ลิสต์ตายตัว
const MAP_PROVIDER_STYLE: Record<MapProvider, { emoji: string; className: string }> = {
  google: { emoji: "🧭", className: "bg-pine text-cream hover:bg-pine-dark" },
  kakao: { emoji: "💬", className: "bg-[#FEE500] text-ink hover:brightness-95" },
  naver: { emoji: "🟢", className: "bg-[#03C75A] text-white hover:brightness-95" },
};

function NavButtons({ actions }: { actions: readonly MapAction[] }) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}
    >
      {actions.map((action) => {
        const style = MAP_PROVIDER_STYLE[action.provider];
        const content = (
          <>
            <span className="text-xl">{style.emoji}</span>
            <span className="text-xs font-medium">{action.label}</span>
          </>
        );
        const className = `flex flex-col items-center justify-center gap-1 rounded-xl py-3 ${style.className}`;
        // kind ต่างกันตั้งใจ (ดู lib/mapLinks.ts) — Naver ไม่มีลิงก์เว็บนำทางตรงได้ ต้องเรียกฟังก์ชัน
        // ที่ลองเปิดแอปก่อนแล้วค่อย fallback เอง ทำเป็น <a href> เหมือนเจ้าอื่นไม่ได้
        if (action.kind === "open") {
          return (
            <button key={action.provider} onClick={action.open} className={className}>
              {content}
            </button>
          );
        }
        return (
          <a
            key={action.provider}
            href={action.url}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

/**
 * 🔴 หน้า **bare** — ไม่มี `[tripId]` ใน URL — `E5-AC1`
 * resolve ทริปเองผ่าน `useActiveTripId()` แล้วค่อยห่อ `TripDataProvider` + render เนื้อหาจริง
 * (`TodayPageContent`) ตัวเดียวกับที่ `/trip/[tripId]/today` ใช้ — `app/manifest.ts` ตั้ง
 * `start_url: "/today"` ไว้ตายตัว หน้านี้จึงต้องคงอยู่และใช้งานได้ตลอดไป ไม่ใช่แค่ transitional
 * (ดู `docs/engine/frontend-arch.md` §16 สำหรับเหตุผลที่ไม่ใช้ HTTP redirect)
 */
export default function TodayPage() {
  const trip = useActiveTripId();
  if (trip.status !== "ready") return <TripStatusFallback trip={trip} />;
  return (
    <TripDataProvider tripId={trip.tripId}>
      <TodayPageContent tripId={trip.tripId} />
    </TripDataProvider>
  );
}

/** เนื้อหาจริงของหน้า "วันนี้" — ใช้ร่วมกันทั้งหน้า bare (`/today`) และ `/trip/[tripId]/today` */
export function TodayPageContent({ tripId }: { tripId: string }) {
  const { hotels } = useHotels();
  const { bookings, loaded: bookingsLoaded } = useBookings();
  const { plans, activePlanId, loaded: plansLoaded } = usePlans(tripId);
  const {
    stops,
    loaded: stopsLoaded,
    markVisited,
    unmarkVisited,
    updatePhoto,
  } = useStops(tripId, activePlanId);
  const { customPlaces, loaded: customPlacesLoaded } = useCustomPlaces();
  const { overnightOverrides, loaded: overnightLoaded } = useOvernightOverrides(tripId);
  const { settings: daySettings, loaded: daySettingsLoaded } = useDaySettings(tripId, activePlanId);

  // 🔴 **`B6` (30 ส.ค. 2026 · P3) — แหล่งของวันเปลี่ยนจากไฟล์เป็นฐาน · JSX ไม่ถูกแตะ**
  //    หน้านี้หนักกว่า `/summary` เพราะมันเป็นหน้า *วันเดียว* ที่ index ด้วย `dayIndex` ตรง ๆ
  //    → ต้องมี "วันว่าง" ให้ hook กิน และประตูต้องคืนหน้าอื่นก่อนถึง JSX ที่ deref `day.` 25 จุด
  const platformItinerary = usePlatformItinerary(tripId, true);
  const platformState = platformItinerary.state;
  const itinerary = useMemo(
    () =>
      applyOvernightOverrides(
        platformState.status === "ready" ? platformState.days : [],
        overnightOverrides
      ),
    [platformState, overnightOverrides]
  );
  const { hotelForDay, hotelBeforeDay } = useHotelSchedule(itinerary, hotels);
  const { byDay: weatherByDay } = useTripWeather(itinerary);
  // ธีมมืดของหน้านี้โดยเฉพาะ — เปิดตอน 05:45 วันกลับและทุกคืนระหว่างทริป (เฟส 17)
  const { isDark, toggle: toggleTheme } = useDarkTheme();

  const mounted = useMounted();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const todayIso = localDateIso(now);
  // คำนวณใหม่ทุกครั้งที่ now เดิน (ทุก 30 วิ) แทนที่จะ freeze ด้วย useState ครั้งเดียว
  // (เดิมเปิดค้างข้ามคืนแล้วยังโชว์วันเก่า — บั๊ก 7.5 เพราะมือถือมักอยู่ในกระเป๋าตอนเที่ยวจริง)
  const todayIndex = useMemo(() => findTodayIndex(itinerary, todayIso), [itinerary, todayIso]);

  const [dayIndex, setDayIndex] = useState(todayIndex);
  // ตามวันจริงอัตโนมัติเฉพาะตอนที่ผู้ใช้กำลังดู "วันนี้" อยู่พอดี (ยังไม่ได้กด ‹ › เลือกดูวันอื่นเอง)
  // ไม่งั้นวันจะกระโดดทับตอนผู้ใช้ตั้งใจเลื่อนดูแผนวันถัดไปอยู่
  const prevTodayIndexRef = useRef(todayIndex);
  useEffect(() => {
    if (todayIndex !== prevTodayIndexRef.current) {
      setDayIndex((current) => (current === prevTodayIndexRef.current ? todayIndex : current));
      prevTodayIndexRef.current = todayIndex;
    }
  }, [todayIndex]);

  // 🔴 `?? EMPTY_DAY` — เฟรมที่ยังไม่มีวัน (หรือ index หลุดช่วงตอนจำนวนวันเปลี่ยน)
  //    ประตูข้างล่างคืนหน้าอื่นก่อนเสมอ · ค่านี้มีไว้ให้ hook ที่ต้องถูกเรียกทุกเฟรมเท่านั้น
  const day = itinerary[dayIndex] ?? EMPTY_DAY;
  // เทียบวันที่ตรงๆ ไม่ใช่ index — เดิม dayIndex === todayIndex เป็น true เสมอตอนยังไม่ถึงทริป
  // (findTodayIndex clamp เป็น index 0) ทำให้ /today ขึ้นแถบ "ช้ากว่าแผน" ผิดๆ ทั้งที่ยังอีกหลายเดือน — บั๊ก 7.2
  const isRealToday = day.date === todayIso;
  // ประเทศของวันนี้ — ผูกกับ *เมืองของวันนั้น* ไม่ใช่ทริป (P1: ทริปเดียวข้ามประเทศได้ เช่นทริปนี้เอง
  // ฮานอย→โซล) ต่างจาก countryCode ระดับทริปตัวเดียวที่จะผิดครึ่งทริปทันทีที่ข้ามประเทศ
  // 🔴 ชั่วคราว — ที่ถูกต้องคือ country ของ "สถานที่นั้น" (place.country/hotel.country ที่ P1 เพิ่มไว้ใน
  // DTO แล้ว) แต่ hook ที่ส่งค่านั้นเข้า state ยังไม่เสร็จ (P3 กำลังเขียน useHotels/useCustomPlaces ใหม่
  // อยู่พอดี ห้ามแตะสองไฟล์นั้นตอนนี้) — ระดับวันยังถูกกว่าระดับทริปเดิมมาก เพราะเปลี่ยนค่าได้ทุกวันที่
  // day.city เปลี่ยน ไม่ใช่ค่าคงที่ตลอดทริปแบบเดิม สลับไปใช้ place-level ทันทีที่ hook พร้อม
  // 🔴 `countryOfCitySlug` ไม่ใช่ `countryOfCity` — ตัวหลัง index `COUNTRY_OF_CITY[city]` ตรง ๆ
  //    บน `Record` ที่คีย์เป็น union 6 เมืองเกาหลี → **`undefined` ทันทีที่วันมาจากฐาน (`B6`, 42 เมือง)**
  //    และ `tsc` จับไม่ได้ตามนิยาม (ดู components/cityMeta.ts) · ตัวใหม่คืน `null` เมื่อไม่รู้จัก
  //    `mapActionsFor(null, …)` → ผู้ให้บริการแผนที่ = Google อย่างเดียว ซึ่งใช้ได้ทุกที่ (นโยบายเขียนไว้ที่ data/emergency.ts)
  const mapCountryCode = countryOfCitySlug(day.city);

  /**
   * 🔴 **แยกแถว `kind='event'` ออกจากจุดแวะ + แบ่งก่อน/หลัง** (`B6` · 30 ส.ค. 2026 · P3)
   * `E7` ยุบ `day.events[]` กับ `stops[]` เข้า `trip_stops` ใบเดียว → **ลำดับเดียว** และกฎการรวม
   * ที่เคยอยู่ในตัวเรนเดอร์ไม่ได้ถูกย้ายมา → event ทั้ง 8 ใบของวันแรกไปกองท้ายวัน
   * ⚠️ **ต้องกรองที่นี่ ไม่ใช่แค่ตอนเรนเดอร์** — `dayStops` ถูกใช้อีก ~10 ที่ (จุดถัดไป · ตัวนับ ·
   *    ประเมินความช้า · โมดัลรายละเอียด) · ปล่อย event ปนไว้ = ทุกตัวนั้นนับผิดเงียบ ๆ
   * กฎเต็ม + เคสอยู่ที่ `lib/engine/dayEvents.ts`
   */
  const { stops: dayStops, before: dayEventsBefore, after: dayEventsAfter } = useMemo(
    () =>
      splitDayEvents(
        stops.filter((s) => s.day_id === day.id).sort((a, b) => a.order_index - b.order_index)
      ),
    [stops, day.id]
  );

  // ที่พักคืนนี้ — ดึงแยกไว้เพราะปุ่มนำทางกลับที่พักต้องใช้ชื่อภาษาเกาหลีจากแถวนี้ ไม่ใช่ label ไทยของ anchor
  const endHotel = hotelForDay(day.id);
  // ที่พักคืนก่อนหน้า — วันย้ายเมืองอาจมีแถว "แวะที่พัก" ที่หมายถึงที่นี่ (เช่น กลับไปเอากระเป๋าก่อนย้ายเมือง)
  const startHotel = hotelBeforeDay(day.id);

  // อ่านค่าเดียวกับหน้าแผนเป๊ะๆ (เวลาออกเดินทาง + โหมดขากลับที่พัก) ไม่งั้นเวลาสองหน้าจะไม่ตรงกัน
  const {
    schedule,
    startAnchor,
    endAnchor,
    daySchedule,
    openingHoursByQuery,
    eventsBeforeStops,
    eventsAfterStops,
  } = useDaySchedule({
      day,
      stops: dayStops,
      // 🔴 วันจากฐานไม่มี `day.events` — ส่งผลการแยกจาก `trip_stops` เข้าไปแทน (`B6`)
      //    ส่งเป็น *ผลการแบ่งแล้ว* ไม่ใช่อาเรย์ดิบ เพราะกฎการแบ่งอยู่ที่ `dayEvents.ts` ที่เดียว
      eventsSplit: { before: dayEventsBefore, after: dayEventsAfter },
      customPlaces,
      hotel: endHotel,
      startHotel,
      returnTravelMode: (daySettings[day.id]?.return_travel_mode as TravelMode | null) ?? null,
      startTime: daySettings[day.id]?.start_time ?? null,
    });

  const overallLoaded =
    plansLoaded &&
    stopsLoaded &&
    customPlacesLoaded &&
    overnightLoaded &&
    bookingsLoaded &&
    (!activePlanId || daySettingsLoaded);

  // 🔴 หน้านี้ไม่มีส่วนไหนที่ไม่ผูกกับวัน (P1/P3, 27 ส.ค. 2026 — ดู §21/§22) ต่างจาก `page.tsx`/
  // `summary/page.tsx` ที่แยกที่พัก/booking/checklist ออกจากโครงวันได้ — ที่นี่แม้แต่ header (ชื่อเมือง/
  // วันที่/พยากรณ์อากาศ) ก็เป็น `day` (จาก `itinerary[dayIndex]`) ทั้งหมด จึง gate ทั้งหน้าแทนที่จะแยกส่วน
  // 🔴 `useLegacyDayPlanGate` ไม่ใช่ `useTripDaysGate` — ตัวหลังถามแค่ "มีวันไหม" ซึ่งเลิกเป็นตัวแทน
  //    ของ "หน้านี้เรนเดอร์ทริปนี้ได้ไหม" ตั้งแต่ `create_trip_makes_days` ลง (ทริปแพลตฟอร์มมีวันจริงแล้ว
  //    → `"ready"` → หน้านี้เคยเรนเดอร์แผนเกาหลีทับทริปอื่น) · เหตุผลเต็มอยู่ในไฟล์ของด่าน
  // 🔴 **`B6`: ประตูไม่ได้หาย — คนตอบเปลี่ยน** (30 ส.ค. 2026 · P3)
  //    เดิม `useLegacyDayPlanGate` ตอบ `"unsupported"` เสมอ เพราะแหล่งของวันเป็นไฟล์ทริปเกาหลี
  //    → ทริปอื่นจะได้แผนเกาหลีทับ · ตอนนี้แหล่งเป็นฐานของทริปนั้นเอง คำถามเดิมจึงตอบจากสถานะของมัน
  //    🎯 **ค่าที่คืนใช้ชื่อเดิมทั้งสามค่า** → กิ่ง `if (dayPlanGate === …)` สามอันข้างล่าง **ไม่ต้องแก้สักบรรทัด**
  const dayPlanGate: "loading" | "unreadable" | "unsupported" | "ready" =
    platformState.status === "loading"
      ? "loading"
      : platformState.status === "error"
        ? "unreadable"
        : itinerary.length === 0
          ? "unsupported"
          : "ready";

  const nextIndex = dayStops.findIndex((s) => !s.visited_at);
  const nextStop = nextIndex >= 0 ? dayStops[nextIndex] : null;
  const nextSched = nextIndex >= 0 ? schedule[nextIndex] : null;

  // เวลาเปิด-ปิดจริง 7 วันข้างหน้า (รวมวันหยุดพิเศษ) ของจุดถัดไป — ยิงสดทุกครั้ง ไม่พึ่งแคชถาวร
  // (เฟส 11.5) เพราะข้อมูลนี้มีความหมายแค่ตอนใกล้ถึงวันจริงเท่านั้น เลยเช็คเฉพาะ isRealToday
  const nextPlaceQuery = nextSched?.place ? placeQueryKey(nextSched.place) : null;
  // เก็บ query คู่กับผลลัพธ์ไว้ในสเตทเดียวกัน แล้วเช็คตรงกันตอน render แทนการ setState(null) ตรงๆ ในตัว effect
  // (ต้นเหตุเดียวกับบั๊ก useDayOpeningHours cancelled เดิม — เฟส 7.6/9.2) กันโชว์ค่าของจุดแวะก่อนหน้าค้าง
  const [currentOpeningHoursState, setCurrentOpeningHoursState] = useState<{
    query: string;
    hours: GoogleOpeningHours | null;
  } | null>(null);
  useEffect(() => {
    if (!isRealToday || !nextPlaceQuery) return;
    let cancelled = false;
    fetch(`/api/place-details?query=${encodeURIComponent(nextPlaceQuery)}&live=1`)
      .then((res) => res.json())
      .then((data: { currentOpeningHours?: GoogleOpeningHours | null }) => {
        if (!cancelled) {
          setCurrentOpeningHoursState({ query: nextPlaceQuery, hours: data.currentOpeningHours ?? null });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isRealToday, nextPlaceQuery]);
  const currentOpeningHours =
    isRealToday && currentOpeningHoursState?.query === nextPlaceQuery ? currentOpeningHoursState.hours : null;

  // ชื่อ/ที่อยู่ภาษาท้องถิ่นของจุดถัดไป (เฟส 14) — สถานที่ในคลังมี nameLocal ฝังมาแล้ว
  // ส่วนที่ผู้ใช้เพิ่มเองต้องอ่านจากแคชที่ useDaySchedule ยิงไว้ให้แล้วในคำขอเดียวกับเวลาเปิด-ปิด
  const nextLocal = nextPlaceQuery ? placeDetailsCache.get(nextPlaceQuery) : undefined;

  // กรอง !visited_at ซ้ำอีกชั้น ไม่พึ่ง slice(nextIndex+1) เฉยๆ — ติ๊กข้ามลำดับ (หรือยกเลิกติ๊กจุดก่อนหน้า)
  // ทำให้จุดที่ visited แล้วอยู่หลัง nextIndex ได้ เดิมจะโผล่ซ้ำทั้ง "ถัดจากนี้" และ "ผ่านมาแล้ว" — บั๊ก 8.3
  const upcomingPairs =
    nextIndex >= 0
      ? dayStops
          .map((s, i) => ({ stop: s, sched: schedule[i] }))
          .slice(nextIndex + 1)
          .filter(({ stop }) => !stop.visited_at)
      : [];
  const upcoming = upcomingPairs.map((p) => p.stop);
  const upcomingSched = upcomingPairs.map((p) => p.sched);
  const done = dayStops.filter((s) => s.visited_at);

  // ออกช้ากว่าแผน → เลื่อนเวลาที่ "แสดง" ของจุดที่เหลือให้ดูจริงขึ้น (ไม่แตะเวลาที่วางแผนไว้ใน DB)
  // ดูเฉพาะวันจริงเท่านั้น — เลื่อนดูวันอื่นไม่ควรมีแนวคิด "ช้ากว่าแผน"
  const DELAY_THRESHOLD_MINUTES = 10;
  const rawDelayMinutes = isRealToday ? estimateDelayMinutes(dayStops, schedule, now) : 0;
  const delayMinutes = Math.abs(rawDelayMinutes) >= DELAY_THRESHOLD_MINUTES ? rawDelayMinutes : 0;

  // นาทีตามนาฬิกาเครื่องจริง นับจาก 00:00 ของวันนี้จริง — มีความหมายเฉพาะตอน isRealToday เท่านั้น
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const CLOSING_SOON_THRESHOLD_MINUTES = 60;

  // ปัดซ้าย/ขวาบนหัวการ์ดเพื่อเปลี่ยนวัน — ปุ่ม ‹ › ยังอยู่ครบ อันนี้เป็นทางลัดสำหรับมือเดียว (เฟส 20.4)
  // ใช้ pointer events ล้วนๆ ไม่เพิ่ม dependency · เช็คว่าแนวนอนชนะแนวตั้งชัดเจน ไม่งั้นจะไปแย่งกับการสกรอลล์
  const SWIPE_MIN_PX = 60;
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  function handleSwipeStart(e: React.PointerEvent) {
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  }
  function handleSwipeEnd(e: React.PointerEvent) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
    setDayIndex((i) =>
      dx < 0 ? Math.min(itinerary.length - 1, i + 1) : Math.max(0, i - 1)
    );
  }

  const dateLabel = new Date(day.date).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });

  const dayBookings = bookings
    .filter((b) => b.day_id === day.id || (!b.day_id && b.date === day.date))
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  // เซ็นรวมทีเดียว (E2-AC13 ②) — รูปหน้างานของจุดถัดไป + ตั๋วที่เป็นรูปทุกใบของวันนี้
  const signedFiles = useSignedFiles([
    nextStop?.photo_url,
    ...dayBookings
      .filter((b) => isImageAttachment(b.file_name, b.file_url))
      .map((b) => b.file_url),
  ]);

  // ดูรายละเอียดสถานที่แบบเดียวกับหน้าแผน — เก็บแค่ id แล้วหา place/index สดจาก dayStops/schedule
  // ทุกครั้งที่ render กันข้อมูลค้างเวลาสลับวันหรือ schedule คำนวณใหม่ (delay เลื่อนเวลา ฯลฯ)
  const [detailStopId, setDetailStopId] = useState<string | null>(null);
  // สถานที่ของแถวตารางบินที่กดอยู่ — คนละสเตทกับ detailStopId เพราะแถวพวกนี้ไม่ใช่ trip_stops
  const [detailEventPlace, setDetailEventPlace] = useState<Place | null>(null);

  // ตารางบิน/เวลาตายตัวทั้งวัน — เดิมหน้านี้โชว์แค่ 2 แถว (anchor หน้า/หลัง) ที่เหลือหายไปหมด
  // วันกลับจึงไม่เห็น AREX / เช็คอิน ICN / เที่ยวบินสักแถว ทั้งที่เป็นวันที่ต้องพึ่งหน้านี้ที่สุด
  const allEvents = [...(eventsBeforeStops ?? []), ...eventsAfterStops];
  const startHotelPlace = startHotel ? hotelToPlace(startHotel, day.city) : null;
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const detailIndex = detailStopId ? dayStops.findIndex((s) => s.id === detailStopId) : -1;

  // เปิดไฟล์ตั๋วที่ไม่ใช่รูป (PDF ฯลฯ) — เซ็นใหม่ตอนคลิกเสมอ ไม่ใช้ค่า signed ที่ batch ไว้ (§12.2
  // ux-flows.md) เพราะเป็นการเปิดแท็บใหม่ครั้งเดียว ไม่ใช่รูปที่ค้างแสดงอยู่บนจอ
  const [openingFileFor, setOpeningFileFor] = useState<string | null>(null);
  const [openFileError, setOpenFileError] = useState<string | null>(null);
  async function handleOpenBookingFile(booking: (typeof dayBookings)[number]) {
    if (!booking.file_url || openingFileFor) return;
    setOpeningFileFor(booking.id);
    setOpenFileError(null);
    const url = await signStoredFile(booking.file_url);
    setOpeningFileFor(null);
    if (!url) {
      setOpenFileError(`เปิดไฟล์ของ "${booking.title}" ไม่สำเร็จ — ลองใหม่อีกครั้ง`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // คัดลอกชื่อที่พักให้คนขับดูตอนเที่ยวครบแล้วจะกลับ — เหมือน LocalNameCard แต่ endHotel เป็น TripHotel ไม่ใช่ Place
  const [copiedHotelName, setCopiedHotelName] = useState(false);
  async function copyHotelName(name: string) {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedHotelName(true);
      setTimeout(() => setCopiedHotelName(false), 1500);
    } catch {
      // คัดลอกไม่ได้ (เบราว์เซอร์ไม่ให้สิทธิ์) — ไม่เป็นไร ยังยื่นจอให้คนขับอ่านเองได้
    }
  }
  const detailStop = detailIndex >= 0 ? dayStops[detailIndex] : null;
  const detailSched = detailIndex >= 0 ? schedule[detailIndex] : null;
  const detailPreviousPlace = detailIndex > 0 ? schedule[detailIndex - 1]?.place ?? null : null;

  // ข้อความเตือนของจุดแวะที่กำลังเปิดโมดัลอยู่ (ถ้ามี) — เหมือนกับที่คำนวณให้ไอคอน ⚠️ ในลิสต์ "ถัดจากนี้"
  // แยกคำนวณตรงนี้แทนที่จะโยง state จากลิสต์ เพราะเปิดโมดัลได้จากหลายจุด (การ์ดจุดถัดไป, ลิสต์ผ่านมาแล้ว ฯลฯ)
  const detailHours = detailSched?.place
    ? openingHoursByQuery.get(placeQueryKey(detailSched.place))
    : undefined;
  const detailMightMissClosing =
    detailSched?.place != null &&
    isOpenDuring(
      detailHours,
      day.date,
      detailSched.arrivalMinutes + delayMinutes,
      detailSched.departureMinutes + delayMinutes
    ) === false;
  const detailWarningMessage = detailMightMissClosing
    ? `⚠️ ${delayMinutes !== 0 ? "ตามเวลาที่เลื่อนแล้ว " : ""}ช่วงเวลานี้สถานที่อาจปิดแล้ว — ${
        weekdayHoursLabel(detailHours, day.date) ?? "ไม่มีข้อมูลเวลาเปิด-ปิด"
      }`
    : null;

  // ทั้งหน้านี้ขึ้นกับ "ตอนนี้กี่โมง วันไหนของทริป" ซึ่งมีคำตอบเฉพาะฝั่ง client — ก่อน hydrate เสร็จ
  // จึงแสดงโครงหน้าไปก่อน · ไม่ได้เสียอะไรเลยเพราะข้อมูลทั้งหมดมาจาก Supabase ฝั่ง client อยู่แล้ว
  // HTML ที่ prerender ตอน build ก็เป็น skeleton อยู่ก่อนแล้ว ต่างกันแค่หัวเว็บที่เคยฝังเวลา build ลงไป
  // (ดูเหตุผลเต็มที่ hooks/useMounted.ts)
  if (!mounted) {
    return (
      <main className="min-h-full bg-surface pb-24 text-content lg:pb-10">
        <TodaySkeleton />
      </main>
    );
  }

  if (dayPlanGate === "loading") {
    return (
      <main className="min-h-full bg-surface pb-24 text-content lg:pb-10">
        <TodaySkeleton />
      </main>
    );
  }

  // 🔴 อ่านแหล่งวันไม่ได้ (ออฟไลน์/500) — คนละเหตุกับ "ไม่มีวัน"/"คนละทริป" ผู้ใช้ทำคนละอย่าง
  if (dayPlanGate === "unreadable") {
    return (
      <main className="min-h-full bg-surface pb-24 text-content lg:pb-10">
        <header className="focus-ring-on-dark bg-pine px-4 pb-5 pt-6 text-cream">
          <div className="flex items-center gap-3">
            <Link href={`/trip/${tripId}`} className="text-sm text-cream/80 hover:text-cream hover:underline">
              ← หน้าแผน
            </Link>
          </div>
        </header>
        <div className="px-4 pt-5">
          <DayPlanUnavailableNotice reason="unreadable" />
        </div>
      </main>
    );
  }

  // `no-days` (ฐานไม่มีวัน) กับ `foreign` (มีวันแต่เป็นทริปแพลตฟอร์ม) ใช้ข้อความเดียวกัน — ทั้งคู่แปลว่า
  // **หน้านี้ยังแสดงทริปนี้ไม่ได้ และผู้ใช้ต้องรอระบบ** ไม่ใช่สิ่งที่เขาแก้เองได้
  // 🔴 ทุกทริปที่อ่านได้ → `unsupported` (ปฏิเสธทั้งหมดจนกว่า `B6` · ดู lib/engine/legacyDayPlan.ts)
  if (dayPlanGate === "unsupported") {
    return (
      <main className="min-h-full bg-surface pb-24 text-content lg:pb-10">
        <header className="focus-ring-on-dark bg-pine px-4 pb-5 pt-6 text-cream">
          <div className="flex items-center gap-3">
            <Link href={`/trip/${tripId}`} className="text-sm text-cream/80 hover:text-cream hover:underline">
              ← หน้าแผน
            </Link>
            <Link
              href={`/trip/${tripId}/summary`}
              className="text-sm text-cream/80 hover:text-cream hover:underline"
            >
              📋 สรุปแผน
            </Link>
          </div>
        </header>
        <div className="px-4 pt-5">
          <DayPlanUnavailableNotice />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-surface pb-24 text-content lg:pb-10">
      <header
        className="focus-ring-on-dark bg-pine px-4 pb-5 pt-6 text-cream"
        onPointerDown={handleSwipeStart}
        onPointerUp={handleSwipeEnd}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/trip/${tripId}`} className="text-sm text-cream/80 hover:text-cream hover:underline">
              ← หน้าแผน
            </Link>
            <Link
              href={`/trip/${tripId}/summary`}
              className="text-sm text-cream/80 hover:text-cream hover:underline"
            >
              📋 สรุปแผน
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label={isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-base hover:bg-white/20"
            >
              {isDark ? "☀️" : "🌙"}
            </button>
            <div className="text-xs text-cream/70">
              {now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => setDayIndex((i) => Math.max(0, i - 1))}
            disabled={dayIndex === 0}
            aria-label="วันก่อนหน้า"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl disabled:opacity-30"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-gold">
              {dateLabel} · วัน{day.weekdayTh}
              {!isRealToday && " · (ไม่ใช่วันนี้)"}
            </div>
            <h1 className="text-2xl font-extrabold">{day.cityTh}</h1>
          </div>
          <button
            onClick={() => setDayIndex((i) => Math.min(itinerary.length - 1, i + 1))}
            disabled={dayIndex === itinerary.length - 1}
            aria-label="วันถัดไป"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl disabled:opacity-30"
          >
            ›
          </button>
        </div>
        {weatherByDay[day.id] && (
          <div className="mt-2 text-center">
            <WeatherBadge weather={weatherByDay[day.id]} />
          </div>
        )}
        {!isRealToday && (
          <button
            onClick={() => setDayIndex(todayIndex)}
            className="mx-auto mt-2 block text-xs font-medium text-gold underline"
          >
            กลับไปวันนี้จริง
          </button>
        )}
      </header>

      {!overallLoaded && <TodaySkeleton />}

      {overallLoaded && !activePlanId && (
        <div className="px-4 py-10 text-center text-sm text-content-soft">
          ยังไม่มีแผนที่ใช้งานอยู่ — เปิดหน้าแผนก่อน
        </div>
      )}

      {overallLoaded && activePlanId && (
        <div className="mx-auto max-w-2xl px-4 pt-4">
          {plans.length > 0 && (
            <div className="mb-3 text-center text-xs text-content-soft">
              แผน: {plans.find((p) => p.id === activePlanId)?.name}
            </div>
          )}

          {startAnchor && (
            <div className="mb-3 rounded-xl bg-panel-pine/50 px-3 py-2 text-xs text-panel-pine-ink">
              🏨 ออกจาก {startAnchor.label}
            </div>
          )}

          {/* ตารางบิน/เวลาตายตัว — โครงแถวเดียวกับลิสต์ "ถัดจากนี้" ด้านล่างเป๊ะๆ
              (เวลา w-12 · ไอคอน/รูป h-9 · ชื่อ truncate · ลูกศร › ตอนกดได้) */}
          {allEvents.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
                ✈️ เวลาตายตัวของวันนี้
              </h2>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised">
                {allEvents.map((event, i) => {
                  const place = resolveEventPlace(event, startHotelPlace, customPlaces);
                  const alert = event.alert === true;
                  const row = (
                    <>
                      <span
                        className={`w-12 shrink-0 text-center font-semibold tabular-nums ${
                          alert ? "" : "text-content-soft"
                        }`}
                      >
                        {event.time}
                      </span>
                      {place ? (
                        <PlaceThumb
                          query={placeQueryKey(place)}
                          category={place.category}
                          className="h-9 w-9 shrink-0"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-base">
                          {event.icon}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${alert ? "font-medium" : "text-content"}`}>
                          {place ? `${event.icon} ` : ""}
                          {event.title}
                        </span>
                        <span
                          className={`block truncate text-xs ${alert ? "opacity-80" : "text-content-soft"}`}
                        >
                          {event.endTime ? `ถึง ${event.endTime}` : null}
                          {event.endTime && place ? " · " : null}
                          {place ? `📍 ${place.nameTh}` : null}
                        </span>
                        {event.layover && <LayoverBadges layover={event.layover} />}
                      </span>
                      {place && <span className="shrink-0 text-content-soft/50">›</span>}
                    </>
                  );
                  const tone = alert ? "bg-panel-maple/70 text-panel-maple-ink" : "";
                  return place ? (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDetailEventPlace(place)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-soft/60 active:opacity-70 ${tone}`}
                    >
                      {row}
                    </button>
                  ) : (
                    <div
                      key={i}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${tone}`}
                    >
                      {row}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {delayMinutes !== 0 && (
            <div
              role="status"
              className="mb-3 rounded-xl bg-panel-gold px-3 py-2 text-xs font-medium text-panel-gold-ink"
            >
              {delayMinutes > 0
                ? `⏱️ ดูช้ากว่าแผนไปประมาณ ${delayMinutes} นาที`
                : `⏱️ ดูเร็วกว่าแผนไปประมาณ ${Math.abs(delayMinutes)} นาที`}{" "}
              — เวลาด้านล่างเลื่อนให้อัตโนมัติแล้ว
            </div>
          )}

          {dayStops.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-content-soft">
              วันนี้ยังไม่ได้วางแผนไว้เลย —{" "}
              <Link href={`/trip/${tripId}`} className="text-panel-pine-ink underline">
                ไปเพิ่มจุดแวะที่หน้าแผน
              </Link>
            </div>
          )}

          {/* จุดถัดไป — การ์ดเด่นสุดของหน้า */}
          {nextStop && nextSched && (
            <section className="mb-5 overflow-hidden rounded-2xl border-2 border-maple bg-surface-raised shadow-md shadow-maple/20">
              <div className="bg-maple px-4 py-2 text-xs font-semibold uppercase tracking-wide text-cream">
                📍 จุดถัดไป
              </div>
              <div className="p-4">
                {nextStop.kind === "intercity" ? (
                  <div className="flex items-center gap-3">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-panel-pine/50 text-3xl">
                      {INTERCITY_MODE_ICON[(nextStop.intercity_mode as IntercityMode) ?? "other"]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-bold text-content">
                        {INTERCITY_MODE_LABEL[(nextStop.intercity_mode as IntercityMode) ?? "other"]}
                      </div>
                      <div className="text-sm text-content-soft">
                        {nextStop.intercity_from} → {nextStop.intercity_to}
                      </div>
                      <div className="mt-1 text-sm font-semibold tabular-nums text-content">
                        {shiftTime(nextSched.arrival, delayMinutes)}–{shiftTime(nextSched.departure, delayMinutes)}
                      </div>
                    </div>
                  </div>
                ) : nextSched.place ? (
                  <>
                    {/* แตะรูป/ชื่อเพื่อเปิดรายละเอียดสถานที่แบบเดียวกับหน้าแผน (รีวิว/รูป Google/แผนที่)
                        แยกจากปุ่ม "มาถึงแล้ว" ด้านล่างซึ่งเป็นปุ่มคนละหน้าที่กัน */}
                    <button
                      type="button"
                      onClick={() => setDetailStopId(nextStop.id)}
                      className="flex w-full items-center gap-3 text-left active:opacity-70"
                    >
                      {/* แถวแวะที่พักไม่มีรูปสถานที่ให้ดึง (พิกัดล้วนๆ จาก trip_hotels) ใช้ไอคอนแทน */}
                      {nextStop.kind === "hotel" ? (
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-panel-pine/50 text-3xl">
                          🏨
                        </span>
                      ) : (
                        <PlaceThumb
                          query={placeQueryKey(nextSched.place)}
                          category={nextSched.place.category}
                          className="h-16 w-16 shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xl font-bold leading-tight text-content">
                          {nextStop.kind === "hotel"
                            ? stopRowLabel(nextStop, nextSched.place, endHotel, startHotel)
                            : `${CATEGORY_EMOJI[nextSched.place.category]} ${nextSched.place.nameTh}`}
                        </div>
                        <div className="mt-0.5 text-lg font-semibold tabular-nums text-panel-maple-ink">
                          {shiftTime(nextSched.arrival, delayMinutes)}–{shiftTime(nextSched.departure, delayMinutes)}
                        </div>
                      </div>
                      <span className="shrink-0 self-start text-content-soft/50">›</span>
                    </button>

                    {(() => {
                      // ใช้นาทีดิบ + delayMinutes ตรงๆ แทนการ shift สตริง HH:MM แล้ว parse กลับ — เดิมจุดแวะที่
                      // ข้ามเที่ยงคืนไปวันถัดไปจะเช็กเวลาเปิด-ปิดผิด (บั๊ก 7.4 เดียวกับ deadlineOverrunMinutes)
                      const hours = openingHoursByQuery.get(placeQueryKey(nextSched.place));
                      const hoursLabel = weekdayHoursLabel(hours, day.date);
                      const closed =
                        isOpenDuring(
                          hours,
                          day.date,
                          nextSched.arrivalMinutes + delayMinutes,
                          nextSched.departureMinutes + delayMinutes
                        ) === false;
                      // เตือนล่วงหน้าว่า "จะปิดในอีก X นาที" โดยเทียบเวลานาฬิกาจริงตอนนี้ (ต่างจาก closed
                      // ด้านบนที่เทียบเวลาตามแผน/เลื่อนแล้ว และเตือนเฉพาะตอนสายเกินไปแล้วเท่านั้น)
                      // เฉพาะวันนี้จริงเท่านั้น เพราะ nowMinutes ผูกกับนาฬิกาเครื่อง เลื่อนดูวันอื่นไม่มีความหมาย
                      const closingSoonMinutes =
                        isRealToday && !closed ? minutesUntilClose(hours, day.date, nowMinutes) : null;
                      const closingSoon =
                        closingSoonMinutes != null &&
                        closingSoonMinutes > 0 &&
                        closingSoonMinutes <= CLOSING_SOON_THRESHOLD_MINUTES;
                      if (!hoursLabel && !closed) return null;
                      return (
                        <div
                          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                            closed ? "bg-panel-maple/70 text-panel-maple-ink" : "bg-surface-soft text-content-soft"
                          }`}
                        >
                          {closed &&
                            `⚠️ ${delayMinutes !== 0 ? "ตามเวลาที่เลื่อนแล้ว " : ""}ช่วงเวลานี้สถานที่อาจปิดแล้ว — `}
                          {closingSoon && `⏳ ปิดในอีก ${closingSoonMinutes} นาที — `}
                          {hoursLabel ?? "ไม่มีข้อมูลเวลาเปิด-ปิด"}
                        </div>
                      );
                    })()}

                    {(() => {
                      // เตือนถ้าเวลาเปิด-ปิดจริงของ 7 วันข้างหน้า (รวมวันหยุดพิเศษ) ต่างจากตารางปกติที่โชว์ด้านบน
                      const hours = openingHoursByQuery.get(placeQueryKey(nextSched.place));
                      const regularLabel = weekdayHoursLabel(hours, day.date);
                      const currentLabel = weekdayHoursLabel(currentOpeningHours, day.date);
                      if (!currentLabel || currentLabel === regularLabel) return null;
                      return (
                        <div className="mt-2 rounded-lg bg-panel-gold px-3 py-2 text-xs font-medium text-panel-gold-ink">
                          🎌 วันนี้เวลาเปิด-ปิดอาจต่างจากปกติ (วันหยุดพิเศษ) — {currentLabel}
                        </div>
                      );
                    })()}

                    {nextStop.note && (
                      <div className="mt-2 rounded-lg border-l-2 border-pine-soft bg-surface-soft/50 py-1.5 pl-2.5 pr-2">
                        <NoteBody note={nextStop.note} className="text-sm text-content-soft" />
                      </div>
                    )}

                    {/* signedFiles มี 3 สถานะต่อค่า (E2-AC13 ②) — undefined กำลังเซ็น · null เซ็นไม่สำเร็จ
                        (ต้องบอก ไม่ใช่กลืน) · string เปิดได้ */}
                    {nextStop.photo_url && signedFiles.get(nextStop.photo_url) === undefined && (
                      <div className="mt-2 h-24 w-24 animate-pulse rounded-lg bg-surface-soft" />
                    )}
                    {nextStop.photo_url && signedFiles.get(nextStop.photo_url) === null && (
                      <div
                        className="mt-2 flex h-24 w-24 items-center justify-center rounded-lg bg-surface-soft text-xs text-content-soft"
                        title="เปิดรูปไม่ได้"
                      >
                        🖼️✕
                      </div>
                    )}
                    {nextStop.photo_url &&
                      typeof signedFiles.get(nextStop.photo_url) === "string" && (
                        <button
                          type="button"
                          onClick={() =>
                            setZoomed({
                              src: signedFiles.get(nextStop.photo_url!) as string,
                              alt: "รูปหน้างานของจุดแวะนี้ ขนาดเต็ม",
                            })
                          }
                          aria-label="ดูรูปหน้างานขนาดเต็ม"
                          className="mt-2 block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL ของ Supabase Storage ไม่ใช่ static asset */}
                          <img
                            src={signedFiles.get(nextStop.photo_url) as string}
                            alt="รูปหน้างานของจุดแวะนี้"
                            className="h-24 w-24 rounded-lg object-cover"
                          />
                        </button>
                      )}

                    <div className="mt-4">
                      {/* ส่งชื่อภาษาท้องถิ่นเข้าแอปแผนที่ ไม่ใช่ nameTh — Naver/Kakao ค้นชื่อไทยไม่เจอ (เฟส 14) */}
                      <NavButtons
                        actions={mapActionsFor(mapCountryCode, {
                          lat: nextSched.place.lat,
                          lng: nextSched.place.lng,
                          name: navigationName(nextSched.place, nextLocal?.nameLocal),
                        })}
                      />
                      <LocalNameCard
                        place={nextSched.place}
                        fallbackNameLocal={nextLocal?.nameLocal}
                        fallbackAddressLocal={nextLocal?.addressLocal}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-panel-maple-ink">ไม่พบข้อมูลสถานที่</div>
                )}

                <button
                  onClick={() => {
                    markVisited(nextStop.id);
                    // ยกเลิกได้จากลิสต์ "ผ่านมาแล้ว" อยู่แล้ว แต่ต้องเลื่อนไปหาเอง —
                    // ตอนเดินอยู่กลางถนนที่เกาหลี ปุ่มเลิกทำตรงนี้เร็วกว่ามาก (เฟส 20.4)
                    showUndoToast(
                      `ติ๊กว่ามาถึง ${stopRowLabel(nextStop, nextSched.place, endHotel, startHotel)} แล้ว`,
                      () => unmarkVisited(nextStop.id)
                    );
                  }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-pine py-4 text-base font-bold text-cream hover:bg-pine-dark active:opacity-70"
                >
                  ✅ มาถึงแล้ว
                </button>
              </div>
            </section>
          )}

          {/* วันนี้เที่ยวครบทุกจุดแล้ว */}
          {dayStops.length > 0 && nextIndex === -1 && (
            <section className="mb-5 rounded-2xl border border-panel-pine bg-panel-pine/40 px-4 py-6 text-center">
              <div className="text-lg font-bold text-panel-pine-ink">🎉 เที่ยวครบทุกจุดของวันนี้แล้ว</div>
              {endAnchor && daySchedule.arriveBackAt && (
                <div className="mt-1 text-sm text-panel-pine-ink">
                  🏨 กลับถึง {endAnchor.label} ประมาณ{" "}
                  {shiftTime(daySchedule.arriveBackAt, delayMinutes)}
                </div>
              )}
              {endAnchor && (
                <div className="mt-4 text-left">
                  <div className="mb-2 text-center text-xs font-medium text-panel-pine-ink">
                    🧭 นำทางกลับ {endAnchor.label}
                  </div>
                  {/* ชื่อที่ส่งเข้า Naver/Kakao ต้องเป็นภาษาเกาหลี ไม่งั้นค้นไม่เจอ (บั๊กเดียวกับที่เฟส 14
                      แก้ให้จุดแวะไปแล้ว แต่ที่พักเพิ่งมี name_local ตอนเฟส 16 / migration 0026) */}
                  <NavButtons
                    actions={mapActionsFor(mapCountryCode, {
                      lat: endAnchor.lat,
                      lng: endAnchor.lng,
                      name: endHotel ? hotelNavigationName(endHotel) : endAnchor.label,
                    })}
                  />
                  {endHotel && (
                    <button
                      onClick={() => copyHotelName(hotelNavigationName(endHotel))}
                      className="mt-2 w-full rounded-xl bg-surface-raised/70 px-3 py-2 text-center text-sm font-medium text-panel-pine-ink hover:bg-surface-raised"
                    >
                      {copiedHotelName
                        ? "✓ คัดลอกชื่อที่พักแล้ว"
                        : `📋 คัดลอกชื่อที่พัก (${hotelNavigationName(endHotel)})`}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ถัดจากนี้ */}
          {upcoming.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
                ถัดจากนี้
              </h2>
              <div className="divide-y divide-line rounded-2xl border border-line bg-surface-raised">
                {upcoming.map((s, i) => {
                  const sched = upcomingSched[i];
                  const label = stopRowLabel(s, sched?.place, endHotel, startHotel);
                  const displayArrival = sched ? shiftTime(sched.arrival, delayMinutes) : null;
                  // นาทีดิบ + delayMinutes ตรงๆ เหมือนการ์ด "จุดถัดไป" ด้านบน — กันเช็กพลาดตอนจุดแวะข้ามเที่ยงคืน
                  const upcomingHours = sched?.place
                    ? openingHoursByQuery.get(placeQueryKey(sched.place))
                    : undefined;
                  const mightMissClosing =
                    sched?.place != null &&
                    isOpenDuring(
                      upcomingHours,
                      day.date,
                      sched.arrivalMinutes + delayMinutes,
                      sched.departureMinutes + delayMinutes
                    ) === false;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => sched?.place && setDetailStopId(s.id)}
                      disabled={!sched?.place}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-soft/60 active:opacity-70 disabled:hover:bg-transparent"
                    >
                      <span className="w-12 shrink-0 text-center font-semibold tabular-nums text-content-soft">
                        {displayArrival ?? "-"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-content">{label}</span>
                      {mightMissClosing && <span title="อาจไปไม่ทันเวลาปิด — แตะเพื่อดูรายละเอียด">⚠️</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ผ่านมาแล้ว */}
          {done.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
                ผ่านมาแล้ว ({done.length})
              </h2>
              <div className="divide-y divide-line rounded-2xl border border-line bg-surface-raised">
                {done.map((s) => {
                  const sched = schedule.find((sc) => sc.id === s.id);
                  const label = stopRowLabel(s, sched?.place, endHotel, startHotel);
                  return (
                    <div key={s.id} className="flex items-center gap-1 px-1 py-1">
                      {/* แตะแถวหลัก = ยกเลิกติ๊ก (เหมือนเดิม) ส่วนปุ่ม ℹ️ แยกไว้ต่างหากสำหรับดูรายละเอียด
                          ซ้อนปุ่มในปุ่มไม่ได้ เลยแยกเป็น 2 ปุ่มข้างกันแทนที่จะเป็นแถวเดียวกดได้ทั้งแถว */}
                      <button
                        type="button"
                        onClick={() => unmarkVisited(s.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-soft/60"
                      >
                        <span className="shrink-0 text-pine">✓</span>
                        <span className="min-w-0 flex-1 truncate text-content-soft line-through">{label}</span>
                        <span className="shrink-0 text-[11px] text-content-soft/60">แตะเพื่อยกเลิก</span>
                      </button>
                      {sched?.place && (
                        <button
                          type="button"
                          onClick={() => setDetailStopId(s.id)}
                          aria-label="ดูรายละเอียดสถานที่"
                          className="shrink-0 rounded-full px-2 py-1.5 text-content-soft hover:bg-surface-soft"
                        >
                          ℹ️
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ตั๋ว/booking ของวันนี้ */}
          {dayBookings.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
                🎫 ตั๋ว/booking วันนี้
              </h2>
              <div className="space-y-2">
                {dayBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-raised px-3 py-2.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-base">
                      {BOOKING_CATEGORY_ICON[b.category]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-content-soft">
                        {BOOKING_CATEGORY_LABEL[b.category]}
                        {b.time ? ` · ${b.time}` : ""}
                      </div>
                      <div className="truncate text-sm font-medium text-content">{b.title}</div>
                    </div>
                    {safeHttpUrl(b.link) && (
                      <a
                        href={safeHttpUrl(b.link)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg bg-surface-soft px-2.5 py-1.5 text-xs font-medium text-panel-pine-ink"
                      >
                        เปิดลิงก์
                      </a>
                    )}
                    {b.file_url && isImageAttachment(b.file_name, b.file_url) && (
                      // รูปตั๋วเปิดดูในแอปเลย — หน้านี้คือหน้าที่เปิดค้างไว้ตอนอยู่หน้างานจริง
                      // เด้งออกแท็บใหม่ = เสียที่ที่กำลังดูอยู่ · signedFiles มี 3 สถานะ (E2-AC13 ②)
                      <>
                        {signedFiles.get(b.file_url) === undefined && (
                          <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface-soft" />
                        )}
                        {signedFiles.get(b.file_url) === null && (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-[10px] text-content-soft"
                            title="เปิดรูปตั๋วไม่ได้"
                          >
                            🖼️✕
                          </div>
                        )}
                        {typeof signedFiles.get(b.file_url) === "string" && (
                          <button
                            type="button"
                            onClick={() =>
                              setZoomed({
                                src: signedFiles.get(b.file_url!) as string,
                                alt: `รูปตั๋วที่แนบไว้กับ “${b.title}”`,
                              })
                            }
                            aria-label={`ดูรูปตั๋วของ ${b.title} ขนาดเต็ม`}
                            className="shrink-0"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL ของ Supabase Storage ไม่ใช่ static asset */}
                            <img
                              src={signedFiles.get(b.file_url) as string}
                              alt=""
                              loading="lazy"
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          </button>
                        )}
                      </>
                    )}
                    {b.file_url && !isImageAttachment(b.file_name, b.file_url) && (
                      // ไม่ใช่รูป (PDF ฯลฯ) — เซ็นใหม่ตอนคลิกเสมอ ไม่ใช้ signed URL ค้าง (§12.2)
                      <button
                        type="button"
                        onClick={() => handleOpenBookingFile(b)}
                        disabled={openingFileFor === b.id}
                        className="shrink-0 rounded-lg bg-surface-soft px-2.5 py-1.5 text-xs font-medium text-panel-pine-ink disabled:opacity-60"
                      >
                        {openingFileFor === b.id ? "กำลังเปิด..." : "📎 ไฟล์"}
                      </button>
                    )}
                  </div>
                ))}
                {openFileError && <p className="text-xs text-red-600">{openFileError}</p>}
              </div>
            </section>
          )}

          {/* การ์ดฉุกเฉิน — ท้ายสุดเพราะปกติไม่ได้ใช้ แต่ต้องอยู่ในหน้าที่เปิดอยู่แล้วตอนมีเรื่อง
              เบอร์เปลี่ยนตามประเทศที่อยู่วันนั้น (ฮานอย = เวียดนาม, ที่เหลือ = เกาหลี) */}
          <EmergencyCard city={day.city} hotel={endHotel} bookings={bookings} />
        </div>
      )}

      {detailStop && detailSched?.place && (
        <PlaceDetailModal
          place={detailSched.place}
          previousPlace={detailPreviousPlace}
          hotel={endHotel}
          userNote={detailStop.note}
          userPhotoUrl={detailStop.photo_url}
          stopId={detailStop.id}
          onUpdatePhoto={(url) => updatePhoto(detailStop.id, url)}
          warningMessage={detailWarningMessage}
          onClose={() => setDetailStopId(null)}
        />
      )}
      {detailEventPlace && (
        <PlaceDetailModal
          place={detailEventPlace}
          previousPlace={null}
          hotel={endHotel}
          onClose={() => setDetailEventPlace(null)}
        />
      )}
      {zoomed && (
        <PhotoLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} />
      )}
      <BottomNav tripId={tripId} />
    </main>
  );
}
