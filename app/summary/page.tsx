"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CATEGORY_EMOJI } from "@/data/places";
import { CITY_META, CITY_NAME_TH, ITINERARY } from "@/data/itinerary";
import type { Day } from "@/data/itinerary";
import type { CustomPlace, TripBooking, TripHotel, TripStop } from "@/lib/supabase";
import { applyOvernightOverrides } from "@/lib/hotelLegs";
import { TRAVEL_MODE_EMOJI, TRAVEL_MODE_LABEL, type TravelMode } from "@/lib/schedule";
import { haversineKm } from "@/lib/geo";
import { INTERCITY_MODE_ICON, INTERCITY_MODE_LABEL, type IntercityMode } from "@/components/IntercityEditModal";
import { BOOKING_CATEGORY_ICON, BOOKING_CATEGORY_LABEL } from "@/components/BookingsPanel";
import { BottomNav } from "@/components/BottomNav";
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

function dateLabelOf(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
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
}) {
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
    <section className="mb-4 overflow-hidden rounded-2xl border border-cream-soft bg-white shadow-sm shadow-ink/5">
      <div
        className="px-4 py-3 text-cream"
        style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.colorDark})` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs opacity-80">
              {dateLabelOf(day.date)} · วัน{day.weekdayTh}
            </div>
            <div className="text-lg font-bold">
              {meta.icon} {day.cityTh}
            </div>
          </div>
          {locked && <span className="shrink-0 text-xs opacity-90">🔒 ล็อกแล้ว</span>}
        </div>
        {day.note && <div className="mt-1 text-xs leading-relaxed opacity-90">{day.note}</div>}
        <div className="mt-1 text-xs opacity-90">🕐 ออกเดินทาง {effectiveStartTime}</div>
        {hotel && <div className="mt-1 truncate text-xs opacity-90">🏨 พักที่ {hotel.hotel_name}</div>}
        {day.noHotel && <div className="mt-1 text-xs opacity-90">🛫 วันเดินทาง — ไม่มีคืนที่ต้องจอง</div>}
      </div>

      {allEvents.length > 0 && (
        <div className="border-b border-cream-soft bg-cream-soft/40 px-4 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            ✈️ เวลาตายตัวของวันนี้
          </div>
          <div className="mt-1 space-y-1">
            {allEvents.map((event, i) => (
              <div
                key={i}
                className={`flex items-start gap-2.5 rounded-lg px-2 py-1 text-xs ${
                  event.alert ? "bg-maple-soft/70 text-maple-dark" : "text-ink"
                }`}
              >
                <div className="w-[4.5rem] shrink-0 text-right font-semibold tabular-nums">
                  {event.time}
                  {event.endTime && <div className="font-normal text-ink-soft">↓ {event.endTime}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {event.icon} {event.title}
                  </div>
                  {event.detail && (
                    <div className="mt-0.5 leading-relaxed text-ink-soft">{event.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="divide-y divide-cream-soft">
        {startAnchor && schedule.length > 0 && (
          <div className="flex items-center gap-2 bg-pine-soft/40 px-3 py-2 text-xs text-pine-dark sm:px-4">
            <span className="w-12 shrink-0 text-center font-semibold tabular-nums">
              {effectiveStartTime}
            </span>
            <span className="min-w-0 flex-1 truncate">🏨 ออกจาก {startAnchor.label}</span>
          </div>
        )}

        {schedule.length === 0 && (
          <div className="px-4 py-5 text-center text-sm text-ink-soft">ยังไม่มีจุดแวะในวันนี้</div>
        )}

        {schedule.map((sched, i) => {
          const stop = stops[i];
          const mode = (stop.travel_mode as TravelMode | null) ?? null;
          return (
            <div key={stop.id} className="px-3 py-2.5 sm:px-4">
              {i > 0 && mode && sched.travelMinutesFromPrev != null && (
                <div className="mb-1.5 pl-14 text-[11px] text-ink-soft">
                  {TRAVEL_MODE_EMOJI[mode]} {TRAVEL_MODE_LABEL[mode]} ~{sched.travelMinutesFromPrev} นาที
                </div>
              )}
              <div className="flex items-start gap-2">
                <div className="w-12 shrink-0 text-center text-[11px] leading-tight text-ink-soft">
                  <div className="font-semibold text-ink">{sched.arrival}</div>
                  <div>{sched.departure}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">
                    {stop.kind === "intercity"
                      ? `${INTERCITY_MODE_ICON[(stop.intercity_mode as IntercityMode) ?? "other"]} ${
                          INTERCITY_MODE_LABEL[(stop.intercity_mode as IntercityMode) ?? "other"]
                        } · ${stop.intercity_from} → ${stop.intercity_to}`
                      : sched.place
                        ? `${CATEGORY_EMOJI[sched.place.category]} ${sched.place.nameTh}`
                        : "ไม่พบข้อมูลสถานที่"}
                  </div>
                  <div className="text-xs text-ink-soft">
                    อยู่ {sched.resolvedDwellMinutes} นาที
                    {stop.added_by ? ` · เลือกโดย ${stop.added_by}` : ""}
                  </div>
                  {stop.note && <div className="mt-0.5 text-xs italic text-ink-soft">📝 {stop.note}</div>}
                </div>
              </div>
            </div>
          );
        })}

        {endAnchor && daySchedule.arriveBackAt && (
          <div className="flex items-center gap-2 bg-pine-soft/40 px-3 py-2 text-xs text-pine-dark sm:px-4">
            <span className="w-12 shrink-0 text-center font-semibold tabular-nums">
              {daySchedule.arriveBackAt}
            </span>
            <span className="min-w-0 flex-1 truncate">🏨 กลับถึง {endAnchor.label}</span>
          </div>
        )}
      </div>

      {bookings.length > 0 && (
        <div className="border-t border-cream-soft px-4 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            🎫 ตั๋ว/booking ของวันนี้
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-ink">
            {bookings.map((b) => (
              <li key={b.id}>
                {BOOKING_CATEGORY_ICON[b.category]} {BOOKING_CATEGORY_LABEL[b.category]}
                {b.time ? ` ${b.time}` : ""} · {b.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {schedule.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-cream-soft bg-cream-soft/40 px-4 py-2.5 text-[11px] text-ink-soft">
          <span>📍 {schedule.filter((s) => s.place).length} จุด</span>
          <span>🍽️ {mealCount} มื้อ</span>
          <span>⏱️ เดินทางรวม ~{formatMinutes(travelMinutes)}</span>
          <span>📏 ~{distanceKm.toFixed(1)} กม.</span>
        </div>
      )}
    </section>
  );
}

/** หน้าสรุปแผนทั้งทริป — ดูอย่างเดียว แก้อะไรไม่ได้ ไว้เปิดอ่านรวดเดียวหรือส่งให้คนอื่นดู */
export default function SummaryPage() {
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

  return (
    <main className="min-h-full pb-24 lg:pb-10">
      <header className="bg-pine px-4 pb-6 pt-6 text-cream">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-cream/80 hover:text-cream hover:underline">
              ← หน้าแผน
            </Link>
            <Link href="/today" className="text-sm text-cream/80 hover:text-cream hover:underline">
              📍 วันนี้
            </Link>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold">📋 สรุปแผนเที่ยวเกาหลี</h1>
          <p className="mt-1 text-sm text-pine-soft/80">
            11 – 21 ต.ค. 2026 · หน้านี้ดูอย่างเดียว แก้ไขไม่ได้ (แก้ที่หน้าแผน)
          </p>
          {overallLoaded && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cream/90">
              <span>🗺️ {stops.length} จุดทั้งทริป</span>
              <span>📅 {itinerary.length} วัน</span>
              <span>🔒 ล็อกแล้ว {lockedCount}/{itinerary.length} วัน</span>
              {plans.length > 0 && <span>แผน: {plans.find((p) => p.id === activePlanId)?.name}</span>}
            </div>
          )}
        </div>
      </header>

      {!overallLoaded && (
        <div className="px-4 py-10 text-center text-sm text-ink-soft">กำลังโหลด...</div>
      )}

      {overallLoaded && (
        <div className="mx-auto max-w-2xl px-4 pt-5">
          {daysWithoutStops.length > 0 && (
            <div className="mb-4 rounded-xl bg-maple-soft/60 px-3 py-2 text-xs text-maple-dark">
              ⚠️ ยังไม่มีจุดแวะ {daysWithoutStops.length} วัน:{" "}
              {daysWithoutStops.map((d) => dateLabelOf(d.date)).join(", ")}
            </div>
          )}

          <section className="mb-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              🏨 ที่พักทั้งทริป
            </h2>
            <div className="divide-y divide-cream-soft rounded-2xl border border-cream-soft bg-white">
              {hotelLegs.map((leg) => {
                const hotel = hotels[leg.id];
                return (
                  <div key={leg.id} className="px-3 py-2.5 text-sm">
                    <div className="text-xs text-ink-soft">
                      {CITY_META[leg.city].icon} {CITY_NAME_TH[leg.city]} · {dateLabelOf(leg.startDate)}–
                      {dateLabelOf(leg.endDate)} ({leg.nights.length} คืน)
                    </div>
                    <div className={hotel ? "font-medium text-ink" : "text-maple-dark"}>
                      {hotel ? hotel.hotel_name : "⚠️ ยังไม่ได้เลือกที่พัก"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {bookings.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                🎫 ตั๋ว/booking ทั้งหมด ({bookings.length})
              </h2>
              <div className="divide-y divide-cream-soft rounded-2xl border border-cream-soft bg-white">
                {bookings.map((b) => (
                  <div key={b.id} className="px-3 py-2.5 text-sm">
                    <div className="text-xs text-ink-soft">
                      {BOOKING_CATEGORY_ICON[b.category]} {BOOKING_CATEGORY_LABEL[b.category]}
                      {b.date ? ` · ${dateLabelOf(b.date)}` : ""}
                      {b.time ? ` ${b.time}` : ""}
                    </div>
                    <div className="font-medium text-ink">{b.title}</div>
                    {b.confirmation_number && (
                      <div className="text-xs text-ink-soft">เลขที่จอง {b.confirmation_number}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {checklistItems.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                ✅ ของที่ต้องเตรียม ({checklistItems.filter((i) => i.is_checked).length}/
                {checklistItems.length})
              </h2>
              <ul className="divide-y divide-cream-soft rounded-2xl border border-cream-soft bg-white">
                {checklistItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={item.is_checked ? "text-pine" : "text-ink-soft/40"}>
                      {item.is_checked ? "✓" : "○"}
                    </span>
                    <span className={item.is_checked ? "text-ink-soft line-through" : "text-ink"}>
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            📅 แผนรายวัน
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
            />
          ))}
        </div>
      )}

      <BottomNav />
    </main>
  );
}
