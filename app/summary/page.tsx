"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type Place } from "@/data/places";
import { categoryMetaOf } from "@/components/categoryMeta";
import { cityMetaOf, cityNameEnOf, cityNameThOf } from "@/components/cityMeta";
import type { Day } from "@/data/itinerary";
import { immigrationCountryOf } from "@/lib/immigrationCountry";
import { splitDayEvents } from "@/lib/engine/dayEvents";
import type { TripBooking, TripHotel, TripStop } from "@/lib/supabase";
import { applyOvernightOverrides, hotelForStop, hotelOfLeg, hotelToPlace } from "@/lib/hotelLegs";
import { resolveEventPlace } from "@/lib/eventPlace";
import {
  TRAVEL_MODE_EMOJI,
  TRAVEL_MODE_LABEL,
  TRAVEL_MODE_LABEL_EN,
  type TravelMode,
} from "@/lib/schedule";
import { haversineKm } from "@/lib/geo";
import { placeQueryKey } from "@/lib/placeQuery";
import { looksLatin } from "@/lib/latinScript";
import { resolvePlace, type PlaceSources } from "@/lib/resolvePlace";
import { weekdayHoursLabel } from "@/lib/openingHours";
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
import { tripDateRangeLabel } from "@/lib/tripDateRange";
import { LayoverBadges } from "@/components/LayoverBadges";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { PlaceDetailModal } from "@/components/PlaceDetailModal";
import { PlaceThumb } from "@/components/PlaceThumb";
import { isImageAttachment } from "@/lib/url";
import { useHotels } from "@/hooks/useHotels";
import { useBookings } from "@/hooks/useBookings";
import { useChecklist } from "@/hooks/useChecklist";
import { usePlans } from "@/hooks/usePlans";
import { useStops } from "@/hooks/useStops";
import { useCustomPlaces } from "@/hooks/useCustomPlaces";
import { useTripMeta } from "@/hooks/useTripMeta";
import { usePlaceDetails } from "@/hooks/usePlaceDetails";
import { usePlaceNamesEn } from "@/hooks/usePlaceNamesEn";
import { useDaySettings } from "@/hooks/useDaySettings";
import { useOvernightOverrides } from "@/hooks/useOvernightOverrides";
import { useHotelSchedule } from "@/hooks/useHotelSchedule";
import { useDaySchedule } from "@/hooks/useDaySchedule";
import { useDarkTheme } from "@/hooks/useDarkTheme";
import { useSignedFiles } from "@/hooks/useSignedFiles";
import { usePlatformItinerary } from "@/hooks/usePlatformItinerary";
import { DayPlanUnavailableNotice } from "@/components/DayPlanUnavailableNotice";
import { HotelsFlatList } from "@/components/HotelsFlatList";
import { useActiveTripId } from "@/hooks/useActiveTripId";
import { TripDataProvider } from "@/components/TripDataProvider";
import { TripStatusFallback } from "@/components/TripStatusFallback";
import NoteBody from "@/components/NoteBody";


function dateLabelOf(iso: string, lang: Lang = "th") {
  if (lang === "en") return formatDateEn(iso).replace(/ \d{4}$/, "");
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

/**
 * ชื่ออังกฤษที่ใช้โชว์ในโหมด EN — สถานที่ที่เพิ่มเองมี `nameEn` fallback เป็นชื่อไทย (custom_places.name_en
 * เป็น null · ดูเฟส 22.4) หน้าอังกฤษเลยมี "ตลาดปลาจากัลชิ" โผล่ · ตัวไหนไม่ใช่อักษรละตินใช้ชื่อที่ขอ
 * จาก Google มาแทน ขอไม่ได้ก็ใช้ของเดิม (ตรรกะเดียวกับ documentName ในหน้า ตม.)
 */
function placeNameEn(place: Place, namesEn: Record<string, string>): string {
  if (looksLatin(place.nameEn)) return place.nameEn;
  return namesEn[placeQueryKey(place)] ?? place.nameEn;
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
  placeSources,
  hotel,
  startHotel,
  returnTravelMode,
  startTime,
  locked,
  bookings,
  lang,
  namesEn,
  t,
}: {
  day: Day;
  stops: TripStop[];
  placeSources: PlaceSources;
  hotel: TripHotel | null;
  startHotel: TripHotel | null;
  returnTravelMode: TravelMode | null;
  startTime: string | null;
  locked: boolean;
  bookings: TripBooking[];
  lang: Lang;
  /** ชื่ออังกฤษที่ขอจาก Google ให้สถานที่ที่ชื่อไม่ใช่อักษรละติน คีย์ด้วย placeQueryKey (โหมด EN เท่านั้น) */
  namesEn: Record<string, string>;
  t: (key: TKey) => string;
}) {
  const en = lang === "en";
  // 🔴 ห้าม index ตรง — `CITY_META` มี 6 เมืองเกาหลี · `Day` จากฐานมีได้ 42 เมือง (ดู components/cityMeta.ts)
  const meta = cityMetaOf(day.city);
  // เซ็นรูปจุดแวะทั้งวันครั้งเดียว (E2-AC13 ②) — การ์ดนี้เรนเดอร์ต่อวันอยู่แล้วเหมือน DayStopsSection
  /**
   * 🔴 **แยกแถว `kind='event'` ออกจากจุดแวะ + แบ่งก่อน/หลัง** (`B6` · 30 ส.ค. 2026 · P3)
   * เหตุผลเต็มและกฎอยู่ที่ `lib/engine/dayEvents.ts` · การ์ดนี้ใช้ `dayStops` แทน `stops` ทุกที่
   * ⚠️ รวมถึง `stops[i]` ที่ index ด้วยตำแหน่งใน `schedule` — **`schedule` สร้างจาก `dayStops`**
   *    ถ้าปล่อยให้ index ลง `stops` เดิม ตำแหน่งจะเลื่อนทันทีที่วันนั้นมี event (ผิดแบบเงียบ)
   */
  const { stops: dayStops, before: evBefore, after: evAfter } = useMemo(() => splitDayEvents(stops), [stops]);
  const signedStopPhotos = useSignedFiles(dayStops.map((s) => s.photo_url));
  // แถวที่กดเปิดดูรายละเอียดอยู่ — หน้านี้ยังอ่านอย่างเดียวเหมือนเดิม โมดัลไม่มีปุ่มแก้อะไรเลย
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  // แถวตารางบินที่กดอยู่ — คนละสเตทกับ viewIndex เพราะไม่ได้อ้างดัชนีใน schedule (คนละลิสต์กัน)
  const [viewEventPlace, setViewEventPlace] = useState<Place | null>(null);
  const {
    schedule,
    daySchedule,
    effectiveStartTime,
    startAnchor,
    endAnchor,
    eventsBeforeStops,
    eventsAfterStops,
    mealCount,
  } = useDaySchedule({
    day,
    stops: dayStops,
    // 🔴 วันจากฐานไม่มี `day.events` — ส่งผลการแบ่งจาก `trip_stops` เข้าไปแทน (`B6`)
    eventsSplit: { before: evBefore, after: evAfter },
    placeSources, hotel, startHotel, returnTravelMode, startTime,
  });

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
  // ที่พักคืนก่อนหน้าในรูป Place — ให้แถว `placeId: "@hotel"` (เช็คเอาต์เช้าวันกลับ) มีรูป/รายละเอียด
  const startHotelPlace = startHotel ? hotelToPlace(startHotel, day.city) : null;

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
          <NoteBody note={day.note} className="mt-1 text-xs opacity-90" />
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

      {/* แถวตารางบินใช้โครงเดียวกับแถวจุดแวะด้านล่างเป๊ะๆ (เวลา w-12 · รูป h-12 · ชื่อ font-semibold)
          — เดิมเป็นลิสต์ตัวหนังสือย่อส่วนคนละทรง ทำให้วันบิน 11/21 ต.ค. ดูเป็นคนละหน้ากับวันอื่น */}
      {allEvents.length > 0 && (
        <div className="border-b border-line">
          <div className="bg-surface-soft/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-content-soft">
            {t("fixedTimes")}
          </div>
          <div className="divide-y divide-line">
            {allEvents.map((event, i) => {
              const place = resolveEventPlace(event, startHotelPlace, placeSources);
              // แถวเตือน/เดดไลน์ใช้คู่สี panel-maple เหมือนเดิม — ในแถวนั้นปล่อยให้สีตัวอักษรไหลลงมา
              // จากตัวแถว ไม่ทับด้วย text-content ไม่งั้นจะได้ครีมบนครีมตอนธีมมืด
              const alert = event.alert === true;
              const body = (
                <div className="flex w-full items-start gap-2 text-left">
                  <div
                    className={`w-12 shrink-0 text-center text-[11px] leading-tight ${
                      alert ? "opacity-80" : "text-content-soft"
                    }`}
                  >
                    <div className={`font-semibold tabular-nums ${alert ? "" : "text-content"}`}>
                      {event.time}
                    </div>
                    {event.endTime && <div className="tabular-nums">↓ {event.endTime}</div>}
                  </div>
                  {place ? (
                    <PlaceThumb
                      query={placeQueryKey(place)}
                      category={place.category}
                      className="h-12 w-12 shrink-0"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-xl">
                      {event.icon}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div
                      className={`font-semibold ${alert ? "" : "text-content"} ${
                        place ? "hover:underline" : ""
                      }`}
                    >
                      {place ? `${event.icon} ` : ""}
                      {(en && event.titleEn) || event.title}
                    </div>
                    {place && (
                      <div className={`text-xs ${alert ? "opacity-80" : "text-content-soft"}`}>
                        📍 {en ? placeNameEn(place, namesEn) : place.nameTh}
                      </div>
                    )}
                    {/* เรทติ้ง/เวลาเปิด-ปิดจาก Google ชุดเดียวกับแถวจุดแวะ — ไม่ยิง API เพิ่ม (แคชร่วมกัน) */}
                    {place && <SummaryPlaceMeta place={place} dayDate={day.date} />}
                    {event.detail && !en && (
                      <div
                        className={`mt-0.5 text-xs leading-relaxed ${
                          alert ? "opacity-80" : "text-content-soft"
                        }`}
                      >
                        {event.detail}
                      </div>
                    )}
                    {event.layover && <LayoverBadges layover={event.layover} lang={lang} />}
                  </div>
                </div>
              );
              return (
                <div
                  key={i}
                  className={`px-3 py-2.5 sm:px-4 ${alert ? "bg-panel-maple/70 text-panel-maple-ink" : ""}`}
                >
                  {place ? (
                    <button onClick={() => setViewEventPlace(place)} className="w-full">
                      {body}
                    </button>
                  ) : (
                    body
                  )}
                </div>
              );
            })}
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
          const stop = dayStops[i];
          const mode = (stop.travel_mode as TravelMode | null) ?? null;
          // แถวสถานที่จริงเท่านั้นที่กดดูรายละเอียดได้ — แถวข้ามเมือง/แวะที่พัก/ไปสนามบิน ไม่มีอะไรให้ดูต่อ
          const place = stop.kind === "intercity" || stop.kind === "hotel" ? null : sched.place;
          // วันย้ายเมืองมีที่พัก 2 แห่ง — แถว "แวะที่พัก" เลือกตามพิกัดในแถวนั้น ไม่ใช่ที่พักคืนนี้เสมอไป
          const stopHotel = hotelForStop(stop.place_id, hotel, startHotel);
          const title =
            stop.kind === "intercity"
              ? `${INTERCITY_MODE_ICON[(stop.intercity_mode as IntercityMode) ?? "other"]} ${
                  (en ? INTERCITY_MODE_LABEL_EN : INTERCITY_MODE_LABEL)[
                    (stop.intercity_mode as IntercityMode) ?? "other"
                  ]
                } · ${stop.intercity_from} → ${stop.intercity_to}`
              : stop.kind === "hotel"
                ? // ชื่อจาก trip_hotels ไม่ใช่จาก sched.place (ซึ่งเป็นชื่อกลางๆ "ที่พัก" จาก id)
                  `🏨 ${en ? "Stop by the hotel" : "แวะที่พัก"}${
                    stopHotel ? ` · ${(en && stopHotel.name_en) || stopHotel.hotel_name}` : ""
                  }`
                : sched.place
                  ? `${categoryMetaOf(sched.place.category).emoji} ${
                      en ? placeNameEn(sched.place, namesEn) : sched.place.nameTh
                    }`
                  : t("noPlaceData");

          const body = (
            <div className="flex w-full items-start gap-2 text-left">
              <div className="w-12 shrink-0 text-center text-[11px] leading-tight text-content-soft">
                <div className="font-semibold text-content">{sched.arrival}</div>
                <div>{sched.departure}</div>
              </div>
              {/* รูปตัวอย่าง: รูปที่เราอัปโหลดเองมาก่อน ไม่มีก็ใช้รูปแรกจาก Google (เฟส 22)
                  — หน้าสรุปเดิมเป็นตัวหนังสือล้วนจนดูไม่ออกว่าแต่ละที่หน้าตาแบบไหน */}
              {/* signedStopPhotos undefined (loading) / null (เซ็นไม่สำเร็จ) ตกไปที่ PlaceThumb (รูป
                  Google) เหมือน PlaceCard.tsx — การ์ดนี้มี fallback ที่มีความหมายอยู่แล้ว ไม่ต้องมี
                  skeleton ใหม่ (E2-AC13 ②) */}
              {place &&
                (stop.photo_url && typeof signedStopPhotos.get(stop.photo_url) === "string" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL ของ Supabase Storage ไม่ใช่ static asset
                  <img
                    src={signedStopPhotos.get(stop.photo_url) as string}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <PlaceThumb
                    query={placeQueryKey(place)}
                    category={place.category}
                    className="h-12 w-12 shrink-0"
                  />
                ))}
              <div className="min-w-0 flex-1">
                <div className={`font-semibold text-content ${place ? "hover:underline" : ""}`}>
                  {title}
                </div>
                <div className="text-xs text-content-soft">
                  {t("stayFor")} {sched.resolvedDwellMinutes} {t("minutes")}
                  {stop.added_by ? ` · ${t("chosenBy")} ${stop.added_by}` : ""}
                </div>
                {/* เรทติ้ง/ประเภทร้านจาก Google — ข้อมูลชุดเดียวกับที่การ์ดในคลังโชว์ ไม่ต้องยิง API เพิ่ม
                    (usePlaceDetails แคชร่วมกันทั้งแท็บ) */}
                {place && <SummaryPlaceMeta place={place} dayDate={day.date} />}
                {stop.note && !en && (
                  <NoteBody
                    note={stop.note}
                    className="mt-1 border-l-2 border-pine-soft pl-2 text-xs text-content-soft"
                  />
                )}
              </div>
            </div>
          );

          return (
            <div key={stop.id} className="px-3 py-2.5 sm:px-4">
              {i > 0 && mode && sched.travelMinutesFromPrev != null && (
                <div className="mb-1.5 pl-14 text-[11px] text-content-soft">
                  {TRAVEL_MODE_EMOJI[mode]}{" "}
                  {en ? TRAVEL_MODE_LABEL_EN[mode] : TRAVEL_MODE_LABEL[mode]} ~
                  {sched.travelMinutesFromPrev} {t("minutes")}
                </div>
              )}
              {place ? (
                <button onClick={() => setViewIndex(i)} className="w-full">
                  {body}
                </button>
              ) : (
                body
              )}
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

      {viewIndex != null && schedule[viewIndex]?.place && (
        <PlaceDetailModal
          place={schedule[viewIndex].place!}
          previousPlace={viewIndex > 0 ? schedule[viewIndex - 1].place ?? null : null}
          hotel={hotel}
          userNote={dayStops[viewIndex]?.note}
          userPhotoUrl={dayStops[viewIndex]?.photo_url}
          onClose={() => setViewIndex(null)}
        />
      )}

      {viewEventPlace && (
        <PlaceDetailModal
          place={viewEventPlace}
          previousPlace={null}
          hotel={hotel}
          onClose={() => setViewEventPlace(null)}
        />
      )}
    </section>
  );
}

/** เรทติ้ง + ประเภทร้าน + เวลาเปิด-ปิดของวันนั้น — บรรทัดเดียวใต้ชื่อสถานที่ในหน้าสรุป (เฟส 22)
 *  แยกเป็นคอมโพเนนต์เพราะ usePlaceDetails เป็น hook เรียกใน .map() ของ SummaryDayCard ตรงๆ ไม่ได้ */
function SummaryPlaceMeta({ place, dayDate }: { place: Place; dayDate: string }) {
  const details = usePlaceDetails(placeQueryKey(place));
  const hoursLabel = weekdayHoursLabel(details?.openingHours, dayDate);
  if (details?.rating == null && !hoursLabel) return null;
  // คนละบรรทัดกัน — บนมือถือ (375px) ยัดสองอย่างในบรรทัดเดียวแล้วเวลาเปิด-ปิดถูกตัดเหลือ "Monday: Op..."
  return (
    <>
      {details?.rating != null && (
        <div className="mt-0.5 truncate text-[11px] text-content-soft">
          ⭐ {details.rating.toFixed(1)}
          {details.userRatingCount != null && ` (${details.userRatingCount})`}
          {details.primaryType && ` · ${details.primaryType}`}
        </div>
      )}
      {hoursLabel && (
        <div className="mt-0.5 truncate text-[11px] text-content-soft">🕐 {hoursLabel}</div>
      )}
    </>
  );
}

/**
 * `useLang` ใช้ `useSearchParams` ซึ่งบังคับให้ subtree ถึงขอบ Suspense ที่ใกล้ที่สุดเรนเดอร์ฝั่ง client
 * (ดู `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`)
 * — ต้องมี Suspense ครอบ ไม่งั้น build เตือน/พังตอน prerender
 */
/**
 * 🔴 หน้า **bare** — ไม่มี `[tripId]` ใน URL — `E5-AC1`
 * resolve ทริปเองผ่าน `useActiveTripId()` แล้วค่อยห่อ `TripDataProvider` + render เนื้อหาจริง
 * (`SummaryContent`) ตัวเดียวกับที่ `/trip/[tripId]/summary` ใช้ — ดู `docs/engine/frontend-arch.md` §16
 * สำหรับเหตุผลที่ไม่ใช้ HTTP redirect (จะเสียความสามารถแคชออฟไลน์ของ `sw.js`)
 */
export default function SummaryPage() {
  const trip = useActiveTripId();
  return (
    <Suspense
      fallback={<div className="px-4 py-10 text-center text-sm text-content-soft">กำลังโหลด...</div>}
    >
      {trip.status === "ready" ? (
        <TripDataProvider tripId={trip.tripId}>
          <SummaryContent tripId={trip.tripId} />
        </TripDataProvider>
      ) : (
        <TripStatusFallback trip={trip} />
      )}
    </Suspense>
  );
}

/** หน้าสรุปแผนทั้งทริป — ดูอย่างเดียว แก้อะไรไม่ได้ ไว้เปิดอ่านรวดเดียวหรือส่งให้คนอื่นดู
 *  **ใช้ร่วมกันทั้งหน้า bare (`/summary`) และ `/trip/[tripId]/summary`** — ดู `E5-AC1` */
export function SummaryContent({ tripId }: { tripId: string }) {
  const { lang, setLang, t } = useLang();
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const searchParams = useSearchParams();
  /**
   * 🔴 **เดิมยิง `fetch("/api/engine/trips")` ตรง ๆ ในเอฟเฟกต์ที่นี่ — ไม่ผ่านชั้นแคชเลย**
   * ผู้ใช้ทดสอบออฟไลน์จริง (เซิร์ฟเวอร์ดับสนิท) แล้วพบว่า **ทุกอย่างรอด ยกเว้นหัวทริป**:
   * `📋 เกาหลี ต.ค. 2026 · 11 – 21 ต.ค.` กลายเป็น `📋 ทริปนี้` และช่วงวันหายไป
   * → ย้ายไป `useTripMeta` ซึ่ง hydrate จากเครื่องก่อนแล้วให้ของสดทับ (เหตุผลเต็มอยู่ในไฟล์นั้น)
   * · 📌 เหตุผลเดิมที่ต้องดึงทั้งรายการ (*"ยังไม่มี route ดึงทริปเดียวโดยตรง"*) **ยังจริง** — มันอธิบาย
   *   ว่าทำไมต้องยิง endpoint นี้ **แต่ไม่เคยอธิบายว่าทำไมไม่แคช** และไม่มีใครสังเกตจนผู้ใช้เจอเอง
   *
   * ## ⚠️ **ห้ามยิง `/api/engine/trips` ตรง ๆ เพื่อเอาชื่อ/ช่วงวันของทริป — ใช้ `useTripMeta`**
   * มันคือเส้นทางเดียวที่ hydrate จากเครื่องก่อนยิงของสด ⇒ **ออฟไลน์ได้ชื่อจริง ไม่ใช่ "ทริปนี้"**
   *
   * 🔴 **บรรทัดนี้เคยเขียนเป็น *คำบรรยายสภาพของไฟล์อื่น*** (*"`TripHeader.tsx` ยังมีบล็อกเดิมอยู่"*)
   * แล้วมันกลายเป็นเท็จตอน P2 ย้ายไฟล์นั้นไปใช้ `useTripMeta` — **โดยไม่มีอะไรทำให้มันอัปเดตได้เลย**
   * 🎯 ***ข้อเท็จจริงที่เก็บไว้คนละที่กับสิ่งที่ทำให้มันจริง จะหมดอายุโดยไม่มีใครแตะมัน*** —
   * คนที่ทำให้มันเป็นเท็จ (P2) ไม่เคยเปิดไฟล์นี้เลย · **ไม่ใช่ว่าใครลืม แต่ไม่มีเส้นทางให้เห็น**
   * · ✅ **กติกาไม่หมดอายุเมื่อไฟล์อื่นเปลี่ยน · คำบรรยายสภาพหมดอายุเสมอ** (P1 จับ · 3 ก.ย. 2026)
   * · 📌 **ไม่ทำเป็นด่าน** — ด่านที่ห้าม `fetch("/api/engine/trips")` จะแดงใส่โค้ดที่เรียก endpoint นั้น
   *   ด้วยเหตุผลอื่นที่ถูกต้อง (`HomeScreen` · `useActiveTripId` · `useTripCatalogCities`)
   *   = false-red ชนิดที่ทำให้ด่านถูกลบทั้งใบ
   */
  const tripMeta = useTripMeta(tripId);
  const tripTitle = tripMeta?.title ?? undefined;
  // `?for=immigration` = เลย์เอาต์เอกสารสำหรับ ตม./K-ETA (บังคับอังกฤษเสมอ ไม่ว่าปุ่มภาษาจะเลือกอะไร)
  const immigrationView = searchParams.get("for") === "immigration";
  const en = lang === "en";
  const tripDateRange =
    tripMeta?.startDate && tripMeta.endDate
      ? tripDateRangeLabel(tripMeta.startDate, tripMeta.endDate, lang)
      : null;
  const { hotels, loaded: hotelsLoaded } = useHotels();
  const { bookings, loaded: bookingsLoaded } = useBookings();
  // เซ็นรวมทีเดียวทั้งทริป (E2-AC13 ②) — ส่วน "ตั๋ว/booking ทั้งหมด" โชว์ทุกใบพร้อมกันในหน้าเดียว
  const signedBookingFiles = useSignedFiles(
    bookings.filter((b) => isImageAttachment(b.file_name, b.file_url)).map((b) => b.file_url)
  );
  const { items: checklistItems, loaded: checklistLoaded } = useChecklist(tripId);
  const { plans, activePlanId, loaded: plansLoaded } = usePlans(tripId);
  const { stops, catalogPlaces, loaded: stopsLoaded } = useStops(tripId, activePlanId);
  const { customPlaces, loaded: customPlacesLoaded } = useCustomPlaces();
  /** แหล่งค้นสถานที่ก้อนเดียว (`E6-AC13`) — memo เพราะ identity เข้า deps ของ `useDaySchedule` */
  const placeSources = useMemo(
    () => ({ customPlaces, catalog: catalogPlaces }),
    [customPlaces, catalogPlaces]
  );

  const { settings: daySettings, loaded: daySettingsLoaded } = useDaySettings(tripId, activePlanId);
  const { overnightOverrides, loaded: overnightLoaded } = useOvernightOverrides(tripId);

  // 🔴 **`B6` (30 ส.ค. 2026 · P3) — แหล่งของวันเปลี่ยนจากไฟล์เป็นฐาน · JSX ข้างล่างไม่ถูกแตะสักบรรทัด**
  //    มติ `:640-641` เก็บ JSX ที่เรนเดอร์จาก `itinerary` ไว้โดยตั้งใจเพื่อวันนี้ — เปลี่ยนแค่ *ใครป้อน*
  //    🎯 ของที่เปลี่ยนจริงไม่ใช่ "ข้อมูลมาจากไหน" แต่คือ **`itinerary` เลิกเป็นค่าคงที่**:
  //    เดิมมี 11 วันตั้งแต่เฟรมแรกเสมอ · ตอนนี้ **ว่างในเฟรมแรกทุกครั้ง** แล้วค่อยมี
  //    (รูป sync→async ที่ `TEAM.md §3.4` เตือนไว้ — หน้านี้ทนได้เพราะเรนเดอร์ด้วย `.map` ทั้งหมด
  //     ต่างจาก `/today` ที่ index ด้วย `dayIndex` ตรง ๆ จึงต้องมีกิ่งว่างก่อน · ยังไม่ทำในคอมมิตนี้)
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
  const { hotelLegs, hotelForDay, hotelBeforeDay } = useHotelSchedule(itinerary, hotels);
  // ธีมมืดชุดเดียวกับ /today (เฟส 20.4) — กลางดึกที่เกาหลีกดจาก "วันนี้" มาหน้านี้แล้วเจอพื้นครีม
  // สว่างจ้าใส่ตา ทั้งที่เป็นสองหน้าที่ใช้ต่อกันที่สุด · หน้านี้อ่านอย่างเดียวจึงแปลงโทเคนไม่กี่จุด
  const { isDark, toggle: toggleTheme } = useDarkTheme();

  const stopsByDay = useMemo(() => {
    const map: Record<string, TripStop[]> = {};
    for (const stop of stops) (map[stop.day_id] ??= []).push(stop);
    return map;
  }, [stops]);

  // โหมด EN เท่านั้น: สถานที่ที่ชื่อยังเป็นไทย/เกาหลี ต้องไปขอชื่ออังกฤษจาก Google (เฟส 22.4)
  // โหมดไทยส่งลิสต์ว่างเข้าไป = ไม่ยิงอะไรเลย · หน้า ตม. มีชุดของตัวเองใน ImmigrationSheet
  const nonLatinQueries = useMemo(() => {
    if (!en || immigrationView) return [];
    const queries = new Set<string>();
    for (const stop of stops) {
      if (stop.kind === "intercity" || stop.kind === "hotel") continue;
      const place = resolvePlace(stop.place_id, placeSources);
      if (place && !looksLatin(place.nameEn)) queries.add(placeQueryKey(place));
    }
    return Array.from(queries);
  }, [en, immigrationView, stops, placeSources]);
  const namesEn = usePlaceNamesEn(nonLatinQueries);

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

  // 🔴 gate เฉพาะโครงวัน + hotelLegs/immigration ที่ผูกกับ itinerary — ไม่แตะ bookings/checklist ที่ไม่พึ่ง
  // trip_days เลย (P1/P3, 27 ส.ค. 2026 — ดู §21/§22) hotelLegs ใช้ itinerary คำนวณช่วงวันของที่พัก จึงนับเป็น
  // itinerary-dependent ด้วยแม้ hotels เองจะเป็น day-independent
  // 🔴 **`B6`: ประตูไม่ได้หายไป — คนตอบเปลี่ยน** (30 ส.ค. 2026 · P3)
  //    `useLegacyDayPlanGate` ตอบคำถาม *"หน้านี้เรนเดอร์ทริปนี้ได้ไหม"* แล้วตอบ **"ไม่ได้" เสมอ**
  //    เพราะแหล่งของวันเป็นไฟล์ทริปเกาหลี → ทริปอื่นจะได้แผนเกาหลีทับ (P1 ยิงเจอบนทริปญี่ปุ่นจริง)
  //    ตอนนี้แหล่งเป็นฐานของทริปนั้นเอง → **คนตอบคำถามเดียวกันคือสถานะของ `usePlatformItinerary`**
  //    · `error`  → อ่านไม่ได้ (เน็ต/500) — ผู้ใช้ลองใหม่ได้เอง
  //    · `ready` + 0 วัน → ทริปไม่มีวัน — รอระบบ ไม่ใช่สิ่งที่เขาแก้เอง
  //    · `loading` → ไม่ใช่ทั้งสองอย่าง ตกไปที่กิ่ง "กำลังโหลด" ของ JSX เดิม (มีอยู่แล้วท้ายเทอร์นารี)
  //    🔴 ด่าน `noLegacyItineraryRender.test.ts` แก้พร้อมกันในคอมมิตนี้ ไม่ปล่อยให้หลวมระหว่างกลาง
  const immigrationPick = useMemo(() => immigrationCountryOf(itinerary), [itinerary]);
  const dayPlanReady = platformState.status === "ready" && itinerary.length > 0;
  const dayPlanEmpty = platformState.status === "ready" && itinerary.length === 0;
  const dayPlanUnreadable = platformState.status === "error";

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
      placeSources,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan-korea-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** ทุกข้อความปุ่มในดิกชันนารีขึ้นต้นด้วยอิโมจิ+เว้นวรรค — แยกออกมาโชว์อิโมจิเดี่ยวๆ บนจอมือถือ
   *  (ซ่อนคำด้วย `hidden sm:inline`) กันปุ่มรองอย่าง Export/Print ดันจนล้นบรรทัด */
  function splitIconLabel(text: string): [string, string] {
    const spaceIndex = text.indexOf(" ");
    if (spaceIndex === -1) return [text, ""];
    return [text.slice(0, spaceIndex), text.slice(spaceIndex + 1)];
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
          {/* แถวลิงก์กลับ/วันนี้แยกจากแถวปุ่มเครื่องมือเสมอ (ไม่ใช้ ml-auto ดันมาแถวเดียวกันแบบเดิม)
              บนจอมือถือแถวเดียวไม่พอที่อยู่แล้วสำหรับ 5 ปุ่ม เลยแยกให้ชัดเจนแทนที่จะปล่อย wrap มั่วๆ */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 print:hidden">
            <Link href={`/trip/${tripId}`} className="text-sm text-cream/80 hover:text-cream hover:underline">
              {t("backToPlan")}
            </Link>
            <Link
              href={`/trip/${tripId}/today`}
              className="text-sm text-cream/80 hover:text-cream hover:underline"
            >
              {t("today")}
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 print:hidden">
            <div className="flex shrink-0 overflow-hidden rounded-lg bg-cream/15">
              {(["th", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`whitespace-nowrap px-2.5 py-1 text-xs font-medium ${
                    lang === l ? "bg-cream text-pine" : "hover:bg-cream/25"
                  }`}
                >
                  {l === "th" ? "🇹🇭 ไทย" : "🇬🇧 EN"}
                </button>
              ))}
            </div>
            {/* ปุ่มรอง 3 ปุ่ม: โชว์แค่อิโมจิบนจอแคบ (ซ่อนคำด้วย hidden sm:inline) กันดันจนล้นบรรทัด
                — ยังกดใช้งานได้เหมือนเดิม แค่ไม่มีคำกำกับจนกว่าจอจะกว้างพอ (sm ขึ้นไป)
                ต้องมี aria-label ทั้ง 3 ปุ่ม เพราะบนมือถือเหลือแค่อิโมจิ = accessible name ว่างเปล่า
                (อิโมจิไม่นับเป็นชื่อ) ใช้ค่า label ตัวเดียวกับที่โชว์บนจอกว้าง ชื่อจึงตรงกับที่ตาเห็นเสมอ */}
            {(() => {
              const [immIcon, immLabel] = splitIconLabel(
                immigrationView ? t("fullSummary") : t("immigrationView")
              );
              return (
                <Link
                  href={
                    immigrationView
                      ? `/trip/${tripId}/summary?lang=${lang}`
                      : `/trip/${tripId}/summary?lang=en&for=immigration`
                  }
                  aria-label={immLabel}
                  className="shrink-0 whitespace-nowrap rounded-lg bg-cream/15 px-2.5 py-1 text-xs font-medium hover:bg-cream/25"
                >
                  {immIcon} <span className="hidden sm:inline">{immLabel}</span>
                </Link>
              );
            })()}
            {(() => {
              const [icon, label] = splitIconLabel(t("exportJson"));
              return (
                <button
                  onClick={handleExportJson}
                  aria-label={label}
                  className="shrink-0 whitespace-nowrap rounded-lg bg-cream/15 px-2.5 py-1 text-xs font-medium hover:bg-cream/25"
                >
                  {icon} <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })()}
            {(() => {
              const [icon, label] = splitIconLabel(t("print"));
              return (
                <button
                  onClick={() => window.print()}
                  aria-label={label}
                  className="shrink-0 whitespace-nowrap rounded-lg bg-cream/15 px-2.5 py-1 text-xs font-medium hover:bg-cream/25"
                >
                  {icon} <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })()}
            {/* สลับธีมได้จากหน้านี้ด้วย ไม่ต้องอ้อมไปกดที่ /today — ค่าเก็บที่เดียวกัน */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
              className="ml-auto shrink-0 whitespace-nowrap rounded-lg bg-cream/15 px-2.5 py-1 text-xs font-medium hover:bg-cream/25"
            >
              {isDark ? "☀️" : "🌙"}
            </button>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold">
            📋 {tripTitle === undefined ? "…" : (tripTitle ?? (en ? "This trip" : "ทริปนี้"))}
          </h1>
          <p className="mt-1 text-sm text-pine-soft/80">
            {tripDateRange ? `${tripDateRange} · ` : ""}
            {t("readOnlyNote")}
          </p>
          {overallLoaded && !immigrationView && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cream/90">
              <span>
                {/* 🔴 นับเฉพาะจุดแวะจริง — แถว `kind='event'` (ตารางบิน/เช็คเอาต์) ไม่ใช่จุดแวะ (`B6`) */}
                🗺️ {stops.filter((s) => !s.event).length} {t("stopsInTrip")}
              </span>
              {dayPlanReady && (
                <>
                  <span>
                    📅 {itinerary.length} {t("days")}
                  </span>
                  <span>
                    🔒 {t("locked")} {lockedCount}/{itinerary.length}
                  </span>
                </>
              )}
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

      {/* 🔴 `&& immigrationCountry` เพิ่ม `B6`: เอกสารใบเดียวเป็นของประเทศเดียว — ถ้าไม่รู้ว่าประเทศไหน
          **ไม่แสดงดีกว่าเดา** (เดิมค่าเริ่มต้นเป็น `"kr"` ซึ่งปลอดภัยตอนต้นทางเป็นไฟล์ทริปเกาหลีเท่านั้น)
          ตกไปที่กิ่งถัดไปของเทอร์นารีเดิม ไม่ได้เพิ่มกิ่งใหม่ */}
      {overallLoaded && immigrationView && (
        dayPlanReady && immigrationPick.kind === "ok" ? (
          <ImmigrationSheet
            country={immigrationPick}
            days={itinerary}
            hotelLegs={hotelLegs}
            hotels={hotels}
            stopsByDay={stopsByDay}
            placeSources={placeSources}
          />
        ) : dayPlanReady && immigrationPick.kind === "tie" ? (
          /* 🔴 **เสมอกัน → ไม่แสดงชีต *แต่บอกเหตุผล*** (P3 เสนอ · P1 รับ · 30 ส.ค. 2026)
             ถ้าเงียบเฉย ๆ เราจะเปลี่ยน *เดาผิด 50%* เป็น *หายเงียบ 100%* ซึ่งแยกไม่ออกจาก
             "ฟีเจอร์นี้ไม่มี" · ด่านที่เอาของออก ต้องบอกว่าทำไม
             ⚠️ **ถ้อยคำนี้ชั่วคราว — P1 อนุมัติให้ใช้ไปก่อนเพื่อไม่ให้งานติด · รอ P2 เคาะ**
                เขาเปลี่ยนได้โดยไม่ต้องถือว่ากลับมติ */
          <div className="mx-auto max-w-2xl px-4 pt-5">
            <p
              role="status"
              className="rounded-lg bg-panel-gold px-3 py-2 text-center text-xs text-panel-gold-ink"
            >
              {en
                ? "This trip splits evenly between two countries — can't pick an immigration sheet automatically"
                : "ทริปนี้มีสองประเทศจำนวนวันเท่ากัน — เลือกเอกสาร ตม. ให้อัตโนมัติไม่ได้"}
            </p>
          </div>
        ) : dayPlanUnreadable ? (
          <div className="mx-auto max-w-2xl px-4 pt-5">
            <DayPlanUnavailableNotice reason="unreadable" />
          </div>
        ) : dayPlanEmpty ? (
          <div className="mx-auto max-w-2xl px-4 pt-5">
            <DayPlanUnavailableNotice />
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-content-soft">{t("loading")}</div>
        )
      )}

      {overallLoaded && !immigrationView && (
        <div className="mx-auto max-w-2xl px-4 pt-5">
          {dayPlanReady && daysWithoutStops.length > 0 && (
            <div className="mb-4 rounded-xl bg-panel-maple/60 px-3 py-2 text-xs text-panel-maple-ink">
              ⚠️ {daysWithoutStops.length} {t("daysWithoutStops")}:{" "}
              {daysWithoutStops.map((d) => dateLabelOf(d.date, lang)).join(", ")}
            </div>
          )}

          {/* 🔴 อ่านแหล่งวันไม่ได้ — ที่พัก/ตั๋ว/checklist ข้างล่างยังแสดงได้ตามปกติ (ไม่พึ่ง trip_days) */}
          {dayPlanUnreadable && <DayPlanUnavailableNotice reason="unreadable" />}

          {dayPlanEmpty && (
            <>
              <DayPlanUnavailableNotice />
              {/* 🔴 กิ่งนี้คือ "ทริปไม่มีวันสักวัน" → `itinerary` ว่าง → จัด leg ไม่ได้ตามนิยาม
                  แสดงที่พักจริงตรง ๆ ด้วยวันที่ของตัวเองแทน (เหตุผลเดิม 27 ส.ค. คือ leg มาจาก
                  `ITINERARY` ซึ่ง `B6` แก้ไปแล้ว — แต่ข้อสรุปยังเหมือนเดิมด้วยเหตุผลใหม่) */}
              <HotelsFlatList hotels={hotels} />
            </>
          )}

          {dayPlanReady && (
          <section className="mb-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
              {t("hotelsAll")}
            </h2>
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface-raised">
              {hotelLegs.map((leg) => {
                // 🔴 คีย์ของแมป `hotels` คือ **ช่วงวันที่** (`D51`) ไม่ใช่ `leg.id` — ดู `hotelOfLeg()`
                const hotel = hotelOfLeg(hotels, leg);
                return (
                  <div key={leg.id} className="px-3 py-2.5 text-sm">
                    <div className="text-xs text-content-soft">
                      {cityMetaOf(leg.city).icon} {en ? cityNameEnOf(leg.city) : cityNameThOf(leg.city)} ·{" "}
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
          )}

          {bookings.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
                {t("bookingsAll")} ({bookings.length})
              </h2>
              <div className="divide-y divide-line rounded-2xl border border-line bg-surface-raised">
                {bookings.map((b) => {
                  const isImage = isImageAttachment(b.file_name, b.file_url);
                  const thumbSigned = b.file_url ? signedBookingFiles.get(b.file_url) : undefined;
                  return (
                  <div key={b.id} className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-content-soft">
                        {BOOKING_CATEGORY_ICON[b.category]}{" "}
                        {(en ? BOOKING_CATEGORY_LABEL_EN : BOOKING_CATEGORY_LABEL)[b.category]}
                        {b.date ? ` · ${dateLabelOf(b.date, lang)}` : ""}
                        {b.time ? ` ${b.time}` : ""}
                      </div>
                      <div className="font-medium text-content">
                        {b.title}
                        {b.file_url && !isImage ? " 📎" : ""}
                      </div>
                      {b.confirmation_number && (
                        <div className="text-xs text-content-soft">
                          {t("confirmationNumber")} {b.confirmation_number}
                        </div>
                      )}
                    </div>
                    {/* signedBookingFiles มี 3 สถานะ (E2-AC13 ②) — undefined กำลังเซ็น · null เซ็นไม่สำเร็จ
                        (ต้องบอก ไม่ใช่กลืน) · string เปิดได้ */}
                    {isImage && thumbSigned === undefined && (
                      <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface-soft" />
                    )}
                    {isImage && thumbSigned === null && (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-[10px] text-content-soft"
                        title="เปิดรูปตั๋วไม่ได้"
                      >
                        🖼️✕
                      </div>
                    )}
                    {isImage && typeof thumbSigned === "string" && (
                      <button
                        type="button"
                        onClick={() => setZoomed({ src: thumbSigned, alt: b.title })}
                        aria-label={`${b.title} — ${en ? "view ticket photo" : "ดูรูปตั๋วขนาดเต็ม"}`}
                        className="shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL ของ Supabase Storage ไม่ใช่ static asset */}
                        <img
                          src={thumbSigned}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      </button>
                    )}
                  </div>
                  );
                })}
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

          {dayPlanReady && (
          <>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
            {t("dailyPlan")}
          </h2>
          {itinerary.map((day) => (
            <SummaryDayCard
              key={day.id}
              day={day}
              stops={stopsByDay[day.id] ?? []}
              placeSources={placeSources}
              hotel={hotelForDay(day.id)}
              startHotel={hotelBeforeDay(day.id)}
              returnTravelMode={(daySettings[day.id]?.return_travel_mode as TravelMode | null) ?? null}
              startTime={daySettings[day.id]?.start_time ?? null}
              locked={daySettings[day.id]?.is_locked === true}
              bookings={bookings.filter(
                (b) => b.day_id === day.id || (!b.day_id && b.date === day.date)
              )}
              lang={lang}
              namesEn={namesEn}
              t={t}
            />
          ))}
          </>
          )}
        </div>
      )}

      {zoomed && (
        <PhotoLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} />
      )}

      <div className="print:hidden">
        <BottomNav tripId={tripId} />
      </div>
    </main>
  );
}
