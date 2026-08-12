"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATEGORY_EMOJI } from "@/data/places";
import { CITY_META, CITY_NAME_EN, CITY_NAME_TH, ITINERARY } from "@/data/itinerary";
import type { Day } from "@/data/itinerary";
import type { CustomPlace, TripBooking, TripHotel, TripStop } from "@/lib/supabase";
import { applyOvernightOverrides } from "@/lib/hotelLegs";
import {
  TRAVEL_MODE_EMOJI,
  TRAVEL_MODE_LABEL,
  TRAVEL_MODE_LABEL_EN,
  type TravelMode,
} from "@/lib/schedule";
import { haversineKm } from "@/lib/geo";
import { useLang, type Lang, type TKey } from "@/lib/i18n";
import {
  INTERCITY_MODE_ICON,
  INTERCITY_MODE_LABEL,
  INTERCITY_MODE_LABEL_EN,
  type IntercityMode,
} from "@/components/IntercityEditModal";
import {
  BOOKING_CATEGORY_ICON,
  BOOKING_CATEGORY_LABEL,
  BOOKING_CATEGORY_LABEL_EN,
} from "@/components/BookingsPanel";
import { BottomNav } from "@/components/BottomNav";
import { ImmigrationSheet, formatDateEn } from "@/components/ImmigrationSheet";
import { LayoverBadges } from "@/components/LayoverBadges";
import { useHotels } from "@/hooks/useHotels";
import { useBookings } from "@/hooks/useBookings";
import { useChecklist } from "@/hooks/useChecklist";
import { usePlans } from "@/hooks/usePlans";
import { useStops } from "@/hooks/useStops";
import { useCustomPlaces } from "@/hooks/useCustomPlaces";
import { useDaySettings } from "@/hooks/useDaySettings";
import { useOvernightOverrides } from "@/hooks/useOvernightOverrides";
import { useHotelSchedule } from "@/hooks/useHotelSchedule";
import { useDaySchedule } from "@/hooks/useDaySchedule";
import { useDarkTheme } from "@/hooks/useDarkTheme";

function dateLabelOf(iso: string, lang: Lang = "th") {
  if (lang === "en") return formatDateEn(iso).replace(/ \d{4}$/, "");
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function formatMinutes(total: number, lang: Lang = "th") {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (lang === "en") return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} m`;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} น.`;
}

/**
 * การ์ดสรุปของหนึ่งวัน — อ่านอย่างเดียวล้วนๆ ไม่มีปุ่มแก้อะไรเลยสักปุ่ม
 * ใช้ useDaySchedule ตัวเดียวกับหน้าแผน/หน้าวันนี้ เวลาที่โชว์จึงตรงกันทั้งสามหน้าเสมอ
 */
function SummaryDayCard({
  day,
  stops,
  customPlaces,
  hotel,
  startHotel,
  returnTravelMode,
  startTime,
  locked,
  bookings,
  lang,
  t,
}: {
  day: Day;
  stops: TripStop[];
  customPlaces: CustomPlace[];
  hotel: TripHotel | null;
  startHotel: TripHotel | null;
  returnTravelMode: TravelMode | null;
  startTime: string | null;
  locked: boolean;
  bookings: TripBooking[];
  lang: Lang;
  t: (key: TKey) => string;
}) {
  const en = lang === "en";
  const meta = CITY_META[day.city];
  const {
    schedule,
    daySchedule,
    effectiveStartTime,
    startAnchor,
    endAnchor,
    eventsBeforeStops,
    eventsAfterStops,
    mealCount,
  } = useDaySchedule({ day, stops, customPlaces, hotel, startHotel, returnTravelMode, startTime });

  const travelMinutes =
    (daySchedule.travelMinutesFromStart ?? 0) +
    schedule.reduce((sum, s) => sum + (s.travelMinutesFromPrev ?? 0), 0) +
    (daySchedule.travelMinutesToEnd ?? 0);

  const points = [
    ...(startHotel ? [{ lat: startHotel.lat, lng: startHotel.lng }] : []),
    ...schedule.filter((s) => s.place).map((s) => ({ lat: s.place!.lat, lng: s.place!.lng })),
    ...(hotel ? [{ lat: hotel.lat, lng: hotel.lng }] : []),
  ];
  const distanceKm = points.reduce(
    (sum, p, i) => (i === 0 ? 0 : sum + haversineKm(points[i - 1].lat, points[i - 1].lng, p.lat, p.lng)),
    0
  );

  const allEvents = [...(eventsBeforeStops ?? []), ...eventsAfterStops];

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-sm shadow-ink/5 print:break-inside-avoid print:shadow-none">
      <div
        className="px-4 py-3 text-cream print:[print-color-adjust:exact] print:[-webkit-print-color-adjust:exact]"
        style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.colorDark})` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs opacity-80">
              {dateLabelOf(day.date, lang)} · {en ? day.weekdayEn : `วัน${day.weekdayTh}`}
            </div>
            <div className="text-lg font-bold">
              {meta.icon} {en ? day.cityEn : day.cityTh}
            </div>
          </div>
          {locked && <span className="shrink-0 text-xs opacity-90">{t("lockedShort")}</span>}
        </div>
        {/* โน้ตรายวันเป็นข้อความวางแผนของเราเอง ไม่มีคู่ภาษาอังกฤษ — โหมด en ซ่อนไว้แทนที่จะโชว์ไทยปนกลางหน้าอังกฤษ */}
        {day.note && !en && (
          <div className="mt-1 text-xs leading-relaxed opacity-90">{day.note}</div>
        )}
        <div className="mt-1 text-xs opacity-90">
          {t("departAt")} {effectiveStartTime}
        </div>
        {hotel && (
          <div className="mt-1 truncate text-xs opacity-90">
            {t("stayAt")} {(en && hotel.name_en) || hotel.hotel_name}
          </div>
        )}
        {day.noHotel && <div className="mt-1 text-xs opacity-90">{t("travelDayNoHotel")}</div>}
      </div>

      {allEvents.length > 0 && (
        <div className="border-b border-line bg-surface-soft/60 px-4 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-content-soft">
            {t("fixedTimes")}
          </div>
          <div className="mt-1 space-y-1">
            {allEvents.map((event, i) => (
              <div
                key={i}
                className={`flex items-start gap-2.5 rounded-lg px-2 py-1 text-xs ${
                  event.alert ? "bg-panel-maple/70 text-panel-maple-ink" : "text-content"
                }`}
              >
                <div className="w-[4.5rem] shrink-0 text-right font-semibold tabular-nums">
                  {event.time}
                  {event.endTime && <div className="font-normal text-content-soft">↓ {event.endTime}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {event.icon} {(en && event.titleEn) || event.title}
                  </div>
                  {event.detail && !en && (
                    <div className="mt-0.5 leading-relaxed text-content-soft">{event.detail}</div>
                  )}
                  {event.layover && <LayoverBadges layover={event.layover} lang={lang} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="divide-y divide-line">
        {startAnchor && schedule.length > 0 && (
          <div className="flex items-center gap-2 bg-panel-pine/50 px-3 py-2 text-xs text-panel-pine-ink sm:px-4">
            <span className="w-12 shrink-0 text-center font-semibold tabular-nums">
              {effectiveStartTime}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {t("leaveFrom")} {startAnchor.label}
            </span>
          </div>
        )}

        {schedule.length === 0 && (
          <div className="px-4 py-5 text-center text-sm text-content-soft">{t("noStopsToday")}</div>
        )}

        {schedule.map((sched, i) => {
          const stop = stops[i];
          const mode = (stop.travel_mode as TravelMode | null) ?? null;
          return (
            <div key={stop.id} className="px-3 py-2.5 sm:px-4">
              {i > 0 && mode && sched.travelMinutesFromPrev != null && (
                <div className="mb-1.5 pl-14 text-[11px] text-content-soft">
                  {TRAVEL_MODE_EMOJI[mode]}{" "}
                  {en ? TRAVEL_MODE_LABEL_EN[mode] : TRAVEL_MODE_LABEL[mode]} ~
                  {sched.travelMinutesFromPrev} {t("minutes")}
                </div>
              )}
              <div className="flex items-start gap-2">
                <div className="w-12 shrink-0 text-center text-[11px] leading-tight text-content-soft">
                  <div className="font-semibold text-content">{sched.arrival}</div>
                  <div>{sched.departure}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-content">
                    {stop.kind === "intercity"
                      ? `${INTERCITY_MODE_ICON[(stop.intercity_mode as IntercityMode) ?? "other"]} ${
                          (en ? INTERCITY_MODE_LABEL_EN : INTERCITY_MODE_LABEL)[
                            (stop.intercity_mode as IntercityMode) ?? "other"
                          ]
                        } · ${stop.intercity_from} → ${stop.intercity_to}`
                      : stop.kind === "hotel"
                        ? // ชื่อจาก trip_hotels ไม่ใช่จาก sched.place (ซึ่งเป็นชื่อกลางๆ "ที่พัก" จาก id)
                          `🏨 ${en ? "Stop by the hotel" : "แวะที่พัก"}${
                            hotel ? ` · ${(en && hotel.name_en) || hotel.hotel_name}` : ""
                          }`
                        : sched.place
                        ? `${CATEGORY_EMOJI[sched.place.category]} ${
                            en ? sched.place.nameEn : sched.place.nameTh
                          }`
                        : t("noPlaceData")}
                  </div>
                  <div className="text-xs text-content-soft">
                    {t("stayFor")} {sched.resolvedDwellMinutes} {t("minutes")}
                    {stop.added_by ? ` · ${t("chosenBy")} ${stop.added_by}` : ""}
                  </div>
                  {stop.note && !en && (
                    <div className="mt-0.5 text-xs italic text-content-soft">📝 {stop.note}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {endAnchor && daySchedule.arriveBackAt && (
          <div className="flex items-center gap-2 bg-panel-pine/50 px-3 py-2 text-xs text-panel-pine-ink sm:px-4">
            <span className="w-12 shrink-0 text-center font-semibold tabular-nums">
              {daySchedule.arriveBackAt}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {t("backTo")} {endAnchor.label}
            </span>
          </div>
        )}
      </div>

      {bookings.length > 0 && (
        <div className="border-t border-line px-4 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-content-soft">
            {t("todaysBookings")}
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-content">
            {bookings.map((b) => (
              <li key={b.id}>
                {BOOKING_CATEGORY_ICON[b.category]}{" "}
                {(en ? BOOKING_CATEGORY_LABEL_EN : BOOKING_CATEGORY_LABEL)[b.category]}
                {b.time ? ` ${b.time}` : ""} · {b.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {schedule.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line bg-surface-soft/60 px-4 py-2.5 text-[11px] text-content-soft">
          <span>
            📍 {schedule.filter((s) => s.place).length} {t("stops")}
          </span>
          <span>
            🍽️ {mealCount} {t("meals")}
          </span>
          <span>
            ⏱️ {t("travelTotal")}
            {formatMinutes(travelMinutes, lang)}
          </span>
          <span>
            📏 ~{distanceKm.toFixed(1)} {t("km")}
          </span>
        </div>
      )}
    </section>
  );
}

/**
 * `useLang` ใช้ `useSearchParams` ซึ่งบังคับให้ subtree ถึงขอบ Suspense ที่ใกล้ที่สุดเรนเดอร์ฝั่ง client
 * (ดู `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`)
 * — ต้องมี Suspense ครอบ ไม่งั้น build เตือน/พังตอน prerender
 */
export default function SummaryPage() {
  return (
    <Suspense
      fallback={<div className="px-4 py-10 text-center text-sm text-content-soft">กำลังโหลด...</div>}
    >
      <SummaryContent />
    </Suspense>
  );
}

/** หน้าสรุปแผนทั้งทริป — ดูอย่างเดียว แก้อะไรไม่ได้ ไว้เปิดอ่านรวดเดียวหรือส่งให้คนอื่นดู */
function SummaryContent() {
  const { lang, setLang, t } = useLang();
  const searchParams = useSearchParams();
  // `?for=immigration` = เลย์เอาต์เอกสารสำหรับ ตม./K-ETA (บังคับอังกฤษเสมอ ไม่ว่าปุ่มภาษาจะเลือกอะไร)
  const immigrationView = searchParams.get("for") === "immigration";
  const en = lang === "en";
  const { hotels, loaded: hotelsLoaded } = useHotels();
  const { bookings, loaded: bookingsLoaded } = useBookings();
  const { items: checklistItems, loaded: checklistLoaded } = useChecklist();
  const { plans, activePlanId, loaded: plansLoaded } = usePlans();
  const { stops, loaded: stopsLoaded } = useStops(activePlanId);
  const { customPlaces, loaded: customPlacesLoaded } = useCustomPlaces();
  const { settings: daySettings, loaded: daySettingsLoaded } = useDaySettings(activePlanId);
  const { overnightOverrides, loaded: overnightLoaded } = useOvernightOverrides();

  const itinerary = useMemo(
    () => applyOvernightOverrides(ITINERARY, overnightOverrides),
    [overnightOverrides]
  );
  const { hotelLegs, hotelForDay, hotelBeforeDay } = useHotelSchedule(itinerary, hotels);
  // ธีมมืดชุดเดียวกับ /today (เฟส 20.4) — กลางดึกที่เกาหลีกดจาก "วันนี้" มาหน้านี้แล้วเจอพื้นครีม
  // สว่างจ้าใส่ตา ทั้งที่เป็นสองหน้าที่ใช้ต่อกันที่สุด · หน้านี้อ่านอย่างเดียวจึงแปลงโทเคนไม่กี่จุด
  const { isDark, toggle: toggleTheme } = useDarkTheme();

  const stopsByDay = useMemo(() => {
    const map: Record<string, TripStop[]> = {};
    for (const stop of stops) (map[stop.day_id] ??= []).push(stop);
    return map;
  }, [stops]);

  const overallLoaded =
    plansLoaded &&
    hotelsLoaded &&
    bookingsLoaded &&
    checklistLoaded &&
    customPlacesLoaded &&
    overnightLoaded &&
    (!activePlanId || (stopsLoaded && daySettingsLoaded));

  const lockedCount = itinerary.filter((d) => daySettings[d.id]?.is_locked === true).length;
  const daysWithoutStops = itinerary.filter((d) => (stopsByDay[d.id] ?? []).length === 0);

  function handleExportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      plans,
      activePlanId,
      stops,
      hotels,
      bookings,
      checklistItems,
      daySettings,
      overnightOverrides,
      customPlaces,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan-korea-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-full bg-surface pb-24 text-content lg:pb-10">
      {/* โหมด ตม.: ซ่อนหัวเว็บสีเขียวตอนพิมพ์ทั้งก้อน — กระดาษแผ่นแรกต้องเริ่มที่ "Travel Itinerary"
          ไม่ใช่แถบแบรนด์ที่กินพื้นที่ A4 ไปฟรีๆ (บนจอยังโชว์ปกติเพื่อให้กดสลับกลับได้) */}
      <header
        className={`focus-ring-on-dark bg-pine px-4 pb-6 pt-6 text-cream print:[print-color-adjust:exact] print:[-webkit-print-color-adjust:exact] ${
          immigrationView ? "print:hidden" : ""
        }`}
      >
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
            <Link href="/" className="text-sm text-cream/80 hover:text-cream hover:underline">
              {t("backToPlan")}
            </Link>
            <Link href="/today" className="text-sm text-cream/80 hover:text-cream hover:underline">
              {t("today")}
            </Link>
            <div className="ml-auto flex items-center gap-1.5">
              {/* ปุ่มสลับภาษาอยู่ตำแหน่งเดียวกับปุ่มพิมพ์ตามที่วางไว้ในเฟส 16 */}
              <div className="flex overflow-hidden rounded-lg bg-cream/15">
                {(["th", "en"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`px-2.5 py-1 text-xs font-medium ${
                      lang === l ? "bg-cream text-pine" : "hover:bg-cream/25"
                    }`}
                  >
                    {l === "th" ? "🇹🇭 ไทย" : "🇬🇧 EN"}
                  </button>
                ))}
              </div>
              <Link
                href={
                  immigrationView
                    ? `/summary?lang=${lang}`
                    : `/summary?lang=en&for=immigration`
                }
                className="rounded-lg bg-cream/15 px-3 py-1 text-xs font-medium hover:bg-cream/25"
              >
                {immigrationView ? t("fullSummary") : t("immigrationView")}
              </Link>
              <button
                onClick={handleExportJson}
                className="rounded-lg bg-cream/15 px-3 py-1 text-xs font-medium hover:bg-cream/25"
              >
                {t("exportJson")}
              </button>
              <button
                onClick={() => window.print()}
                className="rounded-lg bg-cream/15 px-3 py-1 text-xs font-medium hover:bg-cream/25"
              >
                {t("print")}
              </button>
              {/* สลับธีมได้จากหน้านี้ด้วย ไม่ต้องอ้อมไปกดที่ /today — ค่าเก็บที่เดียวกัน */}
              <button
                onClick={toggleTheme}
                aria-label={isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
                className="rounded-lg bg-cream/15 px-2.5 py-1 text-xs font-medium hover:bg-cream/25"
              >
                {isDark ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold">{t("summaryTitle")}</h1>
          <p className="mt-1 text-sm text-pine-soft/80">
            {t("tripDates")} · {t("readOnlyNote")}
          </p>
          {overallLoaded && !immigrationView && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cream/90">
              <span>
                🗺️ {stops.length} {t("stopsInTrip")}
              </span>
              <span>
                📅 {itinerary.length} {t("days")}
              </span>
              <span>
                🔒 {t("locked")} {lockedCount}/{itinerary.length}
              </span>
              {plans.length > 0 && (
                <span>
                  {t("plan")}: {plans.find((p) => p.id === activePlanId)?.name}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {!overallLoaded && (
        <div className="px-4 py-10 text-center text-sm text-content-soft">{t("loading")}</div>
      )}

      {overallLoaded && immigrationView && (
        <ImmigrationSheet
          hotelLegs={hotelLegs}
          hotels={hotels}
          stopsByDay={stopsByDay}
          customPlaces={customPlaces}
        />
      )}

      {overallLoaded && !immigrationView && (
        <div className="mx-auto max-w-2xl px-4 pt-5">
          {daysWithoutStops.length > 0 && (
            <div className="mb-4 rounded-xl bg-panel-maple/60 px-3 py-2 text-xs text-panel-maple-ink">
              ⚠️ {daysWithoutStops.length} {t("daysWithoutStops")}:{" "}
              {daysWithoutStops.map((d) => dateLabelOf(d.date, lang)).join(", ")}
            </div>
          )}

          <section className="mb-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
              {t("hotelsAll")}
            </h2>
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface-raised">
              {hotelLegs.map((leg) => {
                const hotel = hotels[leg.id];
                return (
                  <div key={leg.id} className="px-3 py-2.5 text-sm">
                    <div className="text-xs text-content-soft">
                      {CITY_META[leg.city].icon} {en ? CITY_NAME_EN[leg.city] : CITY_NAME_TH[leg.city]} ·{" "}
                      {dateLabelOf(leg.startDate, lang)}–{dateLabelOf(leg.endDate, lang)} (
                      {leg.nights.length} {t("nights")})
                    </div>
                    <div className={hotel ? "font-medium text-content" : "text-panel-maple-ink"}>
                      {hotel ? (en && hotel.name_en) || hotel.hotel_name : t("noHotelChosen")}
                    </div>
                    {/* ชื่อ/ที่อยู่ภาษาท้องถิ่นของที่พัก (migration 0026) — ยื่นให้คนขับแท็กซี่ดูได้ตรงนี้เลย */}
                    {hotel?.address_local && (
                      <div className="text-xs text-content-soft">🗣️ {hotel.address_local}</div>
                    )}
                    {hotel?.phone && <div className="text-xs text-content-soft">☎️ {hotel.phone}</div>}
                  </div>
                );
              })}
            </div>
          </section>

          {bookings.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
                {t("bookingsAll")} ({bookings.length})
              </h2>
              <div className="divide-y divide-line rounded-2xl border border-line bg-surface-raised">
                {bookings.map((b) => (
                  <div key={b.id} className="px-3 py-2.5 text-sm">
                    <div className="text-xs text-content-soft">
                      {BOOKING_CATEGORY_ICON[b.category]}{" "}
                      {(en ? BOOKING_CATEGORY_LABEL_EN : BOOKING_CATEGORY_LABEL)[b.category]}
                      {b.date ? ` · ${dateLabelOf(b.date, lang)}` : ""}
                      {b.time ? ` ${b.time}` : ""}
                    </div>
                    <div className="font-medium text-content">{b.title}</div>
                    {b.confirmation_number && (
                      <div className="text-xs text-content-soft">
                        {t("confirmationNumber")} {b.confirmation_number}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {checklistItems.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
                {t("checklistTitle")} ({checklistItems.filter((i) => i.is_checked).length}/
                {checklistItems.length})
              </h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-raised">
                {checklistItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={item.is_checked ? "text-panel-pine-ink" : "text-content-soft/40"}>
                      {item.is_checked ? "✓" : "○"}
                    </span>
                    <span className={item.is_checked ? "text-content-soft line-through" : "text-content"}>
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
            {t("dailyPlan")}
          </h2>
          {itinerary.map((day) => (
            <SummaryDayCard
              key={day.id}
              day={day}
              stops={stopsByDay[day.id] ?? []}
              customPlaces={customPlaces}
              hotel={hotelForDay(day.id)}
              startHotel={hotelBeforeDay(day.id)}
              returnTravelMode={(daySettings[day.id]?.return_travel_mode as TravelMode | null) ?? null}
              startTime={daySettings[day.id]?.start_time ?? null}
              locked={daySettings[day.id]?.is_locked === true}
              bookings={bookings.filter(
                (b) => b.day_id === day.id || (!b.day_id && b.date === day.date)
              )}
              lang={lang}
              t={t}
            />
          ))}
        </div>
      )}

      <div className="print:hidden">
        <BottomNav />
      </div>
    </main>
  );
}
