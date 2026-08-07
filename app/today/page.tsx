"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CATEGORY_EMOJI } from "@/data/places";
import { ITINERARY } from "@/data/itinerary";
import type { Day } from "@/data/itinerary";
import { applyOvernightOverrides } from "@/lib/hotelLegs";
import { isOpenDuring, weekdayHoursLabel } from "@/lib/openingHours";
import { estimateDelayMinutes, shiftTime } from "@/lib/liveDelay";
import { googleMapsDirectionsUrl, kakaoMapDirectionsUrl, openNaverMap } from "@/lib/mapLinks";
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
import { useDaySchedule } from "@/hooks/useDaySchedule";

function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** วันในทริปที่ตรงกับวันนี้จริงตามนาฬิกาเครื่อง — ก่อนทริปคืนวันแรก, หลังทริปคืนวันสุดท้าย */
function findTodayIndex(itinerary: Day[]): number {
  const iso = todayISODate();
  const exact = itinerary.findIndex((d) => d.date === iso);
  if (exact >= 0) return exact;
  if (iso < itinerary[0].date) return 0;
  return itinerary.length - 1;
}

function NavButtons({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <a
        href={googleMapsDirectionsUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center justify-center gap-1 rounded-xl bg-pine py-3 text-cream hover:bg-pine-dark"
      >
        <span className="text-xl">🧭</span>
        <span className="text-xs font-medium">Google</span>
      </a>
      <a
        href={kakaoMapDirectionsUrl(lat, lng, name)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center justify-center gap-1 rounded-xl bg-[#FEE500] py-3 text-ink hover:brightness-95"
      >
        <span className="text-xl">💬</span>
        <span className="text-xs font-medium">Kakao</span>
      </a>
      <button
        onClick={() => openNaverMap(lat, lng, name)}
        className="flex flex-col items-center justify-center gap-1 rounded-xl bg-[#03C75A] py-3 text-white hover:brightness-95"
      >
        <span className="text-xl">🟢</span>
        <span className="text-xs font-medium">Naver</span>
      </button>
    </div>
  );
}

export default function TodayPage() {
  const { hotels } = useHotels();
  const { bookings, loaded: bookingsLoaded } = useBookings();
  const { plans, activePlanId, loaded: plansLoaded } = usePlans();
  const {
    stops,
    loaded: stopsLoaded,
    markVisited,
    unmarkVisited,
  } = useStops(activePlanId);
  const { customPlaces, loaded: customPlacesLoaded } = useCustomPlaces();
  const { overnightOverrides, loaded: overnightLoaded } = useOvernightOverrides();

  const itinerary = useMemo(
    () => applyOvernightOverrides(ITINERARY, overnightOverrides),
    [overnightOverrides]
  );
  const { hotelForDay, hotelBeforeDay } = useHotelSchedule(itinerary, hotels);

  // เริ่มที่วันจริงตามนาฬิกาเครื่องครั้งเดียว — หลังจากนั้นผู้ใช้เลื่อนดูวันอื่นได้อิสระด้วย ‹ ›
  const [todayIndex] = useState(() => findTodayIndex(ITINERARY));
  const [dayIndex, setDayIndex] = useState(todayIndex);
  const day = itinerary[dayIndex];
  const isRealToday = dayIndex === todayIndex;

  const dayStops = useMemo(
    () => stops.filter((s) => s.day_id === day.id).sort((a, b) => a.order_index - b.order_index),
    [stops, day.id]
  );

  const returnTravelMode = null; // ค่าประมาณการพอสำหรับหน้านี้ (ตั้งค่าจริงในหน้าแผน)
  const { schedule, startAnchor, endAnchor, daySchedule, openingHoursByQuery, beforeAnchorEvent, afterAnchorEvent } =
    useDaySchedule({
      day,
      stops: dayStops,
      customPlaces,
      hotel: hotelForDay(day.id),
      startHotel: hotelBeforeDay(day.id),
      returnTravelMode,
      startTime: "07:00",
    });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const overallLoaded = plansLoaded && stopsLoaded && customPlacesLoaded && overnightLoaded && bookingsLoaded;

  const nextIndex = dayStops.findIndex((s) => !s.visited_at);
  const nextStop = nextIndex >= 0 ? dayStops[nextIndex] : null;
  const nextSched = nextIndex >= 0 ? schedule[nextIndex] : null;

  const upcoming = nextIndex >= 0 ? dayStops.slice(nextIndex + 1) : [];
  const upcomingSched = nextIndex >= 0 ? schedule.slice(nextIndex + 1) : [];
  const done = dayStops.filter((s) => s.visited_at);

  // ออกช้ากว่าแผน → เลื่อนเวลาที่ "แสดง" ของจุดที่เหลือให้ดูจริงขึ้น (ไม่แตะเวลาที่วางแผนไว้ใน DB)
  // ดูเฉพาะวันจริงเท่านั้น — เลื่อนดูวันอื่นไม่ควรมีแนวคิด "ช้ากว่าแผน"
  const DELAY_THRESHOLD_MINUTES = 10;
  const rawDelayMinutes = isRealToday ? estimateDelayMinutes(dayStops, schedule, now) : 0;
  const delayMinutes = Math.abs(rawDelayMinutes) >= DELAY_THRESHOLD_MINUTES ? rawDelayMinutes : 0;

  const dateLabel = new Date(day.date).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });

  const dayBookings = bookings
    .filter((b) => b.day_id === day.id || (!b.day_id && b.date === day.date))
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  return (
    <main className="min-h-full pb-10">
      <header className="bg-pine px-4 pb-5 pt-6 text-cream">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-cream/80 hover:text-cream hover:underline">
            ← หน้าแผน
          </Link>
          <div className="text-xs text-cream/70">
            {now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
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
        {!isRealToday && (
          <button
            onClick={() => setDayIndex(todayIndex)}
            className="mx-auto mt-2 block text-xs font-medium text-gold underline"
          >
            กลับไปวันนี้จริง
          </button>
        )}
      </header>

      {!overallLoaded && (
        <div className="px-4 py-10 text-center text-sm text-ink-soft">กำลังโหลด...</div>
      )}

      {overallLoaded && !activePlanId && (
        <div className="px-4 py-10 text-center text-sm text-ink-soft">
          ยังไม่มีแผนที่ใช้งานอยู่ — เปิดหน้าแผนก่อน
        </div>
      )}

      {overallLoaded && activePlanId && (
        <div className="mx-auto max-w-2xl px-4 pt-4">
          {plans.length > 0 && (
            <div className="mb-3 text-center text-xs text-ink-soft">
              แผน: {plans.find((p) => p.id === activePlanId)?.name}
            </div>
          )}

          {startAnchor && (
            <div className="mb-3 rounded-xl bg-pine-soft/50 px-3 py-2 text-xs text-pine-dark">
              🏨 ออกจาก {startAnchor.label}
            </div>
          )}

          {beforeAnchorEvent && (
            <div className="mb-3 rounded-xl bg-cream-soft px-3 py-2 text-xs text-ink">
              {beforeAnchorEvent.icon} {beforeAnchorEvent.title} ({beforeAnchorEvent.time})
            </div>
          )}
          {afterAnchorEvent && (
            <div className="mb-3 rounded-xl bg-maple-soft/70 px-3 py-2 text-xs font-medium text-maple-dark">
              {afterAnchorEvent.icon} {afterAnchorEvent.title} ({afterAnchorEvent.time})
            </div>
          )}

          {delayMinutes !== 0 && (
            <div className="mb-3 rounded-xl bg-gold/20 px-3 py-2 text-xs font-medium text-maple-dark">
              {delayMinutes > 0
                ? `⏱️ ดูช้ากว่าแผนไปประมาณ ${delayMinutes} นาที`
                : `⏱️ ดูเร็วกว่าแผนไปประมาณ ${Math.abs(delayMinutes)} นาที`}{" "}
              — เวลาด้านล่างเลื่อนให้อัตโนมัติแล้ว
            </div>
          )}

          {dayStops.length === 0 && (
            <div className="rounded-2xl border border-dashed border-cream-soft px-4 py-8 text-center text-sm text-ink-soft">
              วันนี้ยังไม่ได้วางแผนไว้เลย —{" "}
              <Link href="/" className="text-pine-dark underline">
                ไปเพิ่มจุดแวะที่หน้าแผน
              </Link>
            </div>
          )}

          {/* จุดถัดไป — การ์ดเด่นสุดของหน้า */}
          {nextStop && nextSched && (
            <section className="mb-5 overflow-hidden rounded-2xl border-2 border-maple bg-white shadow-md shadow-maple/20">
              <div className="bg-maple px-4 py-2 text-xs font-semibold uppercase tracking-wide text-cream">
                📍 จุดถัดไป
              </div>
              <div className="p-4">
                {nextStop.kind === "intercity" ? (
                  <div className="flex items-center gap-3">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-pine-soft/50 text-3xl">
                      {INTERCITY_MODE_ICON[(nextStop.intercity_mode as IntercityMode) ?? "other"]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-bold text-ink">
                        {INTERCITY_MODE_LABEL[(nextStop.intercity_mode as IntercityMode) ?? "other"]}
                      </div>
                      <div className="text-sm text-ink-soft">
                        {nextStop.intercity_from} → {nextStop.intercity_to}
                      </div>
                      <div className="mt-1 text-sm font-semibold tabular-nums text-ink">
                        {shiftTime(nextSched.arrival, delayMinutes)}–{shiftTime(nextSched.departure, delayMinutes)}
                      </div>
                    </div>
                  </div>
                ) : nextSched.place ? (
                  <>
                    <div className="flex items-center gap-3">
                      <PlaceThumb
                        query={nextSched.place.mapsQuery}
                        category={nextSched.place.category}
                        className="h-16 w-16 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xl font-bold leading-tight text-ink">
                          {CATEGORY_EMOJI[nextSched.place.category]} {nextSched.place.nameTh}
                        </div>
                        <div className="mt-0.5 text-lg font-semibold tabular-nums text-maple-dark">
                          {shiftTime(nextSched.arrival, delayMinutes)}–{shiftTime(nextSched.departure, delayMinutes)}
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const displayArrival = shiftTime(nextSched.arrival, delayMinutes);
                      const displayDeparture = shiftTime(nextSched.departure, delayMinutes);
                      const hours = openingHoursByQuery.get(nextSched.place.mapsQuery);
                      const hoursLabel = weekdayHoursLabel(hours, day.date);
                      const closed = isOpenDuring(hours, day.date, displayArrival, displayDeparture) === false;
                      if (!hoursLabel && !closed) return null;
                      return (
                        <div
                          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                            closed ? "bg-maple-soft/70 text-maple-dark" : "bg-cream-soft text-ink-soft"
                          }`}
                        >
                          {closed &&
                            `⚠️ ${delayMinutes !== 0 ? "ตามเวลาที่เลื่อนแล้ว " : ""}ช่วงเวลานี้สถานที่อาจปิดแล้ว — `}
                          {hoursLabel ?? "ไม่มีข้อมูลเวลาเปิด-ปิด"}
                        </div>
                      );
                    })()}

                    {nextStop.note && (
                      <div className="mt-2 text-sm italic text-ink-soft">📝 {nextStop.note}</div>
                    )}

                    <div className="mt-4">
                      <NavButtons
                        lat={nextSched.place.lat}
                        lng={nextSched.place.lng}
                        name={nextSched.place.nameTh}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-maple-dark">ไม่พบข้อมูลสถานที่</div>
                )}

                <button
                  onClick={() => markVisited(nextStop.id)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-pine py-4 text-base font-bold text-cream hover:bg-pine-dark active:opacity-70"
                >
                  ✅ มาถึงแล้ว
                </button>
              </div>
            </section>
          )}

          {/* วันนี้เที่ยวครบทุกจุดแล้ว */}
          {dayStops.length > 0 && nextIndex === -1 && (
            <section className="mb-5 rounded-2xl border border-pine-soft bg-pine-soft/40 px-4 py-6 text-center">
              <div className="text-lg font-bold text-pine-dark">🎉 เที่ยวครบทุกจุดของวันนี้แล้ว</div>
              {endAnchor && daySchedule.arriveBackAt && (
                <div className="mt-1 text-sm text-pine-dark">
                  🏨 กลับถึง {endAnchor.label} ประมาณ{" "}
                  {shiftTime(daySchedule.arriveBackAt, delayMinutes)}
                </div>
              )}
            </section>
          )}

          {/* ถัดจากนี้ */}
          {upcoming.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                ถัดจากนี้
              </h2>
              <div className="divide-y divide-cream-soft rounded-2xl border border-cream-soft bg-white">
                {upcoming.map((s, i) => {
                  const sched = upcomingSched[i];
                  const label =
                    s.kind === "intercity"
                      ? `${INTERCITY_MODE_ICON[(s.intercity_mode as IntercityMode) ?? "other"]} ${s.intercity_from} → ${s.intercity_to}`
                      : sched?.place
                        ? `${CATEGORY_EMOJI[sched.place.category]} ${sched.place.nameTh}`
                        : "ไม่พบข้อมูลสถานที่";
                  const displayArrival = sched ? shiftTime(sched.arrival, delayMinutes) : null;
                  const mightMissClosing =
                    sched?.place != null &&
                    displayArrival != null &&
                    isOpenDuring(
                      openingHoursByQuery.get(sched.place.mapsQuery),
                      day.date,
                      displayArrival,
                      shiftTime(sched.departure, delayMinutes)
                    ) === false;
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="w-12 shrink-0 text-center font-semibold tabular-nums text-ink-soft">
                        {displayArrival ?? "-"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">{label}</span>
                      {mightMissClosing && <span title="อาจไปไม่ทันเวลาปิด">⚠️</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ผ่านมาแล้ว */}
          {done.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                ผ่านมาแล้ว ({done.length})
              </h2>
              <div className="divide-y divide-cream-soft rounded-2xl border border-cream-soft bg-white">
                {done.map((s) => {
                  const sched = schedule.find((sc) => sc.id === s.id);
                  const label =
                    s.kind === "intercity"
                      ? `${INTERCITY_MODE_ICON[(s.intercity_mode as IntercityMode) ?? "other"]} ${s.intercity_from} → ${s.intercity_to}`
                      : sched?.place
                        ? `${CATEGORY_EMOJI[sched.place.category]} ${sched.place.nameTh}`
                        : "ไม่พบข้อมูลสถานที่";
                  return (
                    <button
                      key={s.id}
                      onClick={() => unmarkVisited(s.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-cream-soft/60"
                    >
                      <span className="shrink-0 text-pine">✓</span>
                      <span className="min-w-0 flex-1 truncate text-ink-soft line-through">{label}</span>
                      <span className="shrink-0 text-[11px] text-ink-soft/60">แตะเพื่อยกเลิก</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ตั๋ว/booking ของวันนี้ */}
          {dayBookings.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                🎫 ตั๋ว/booking วันนี้
              </h2>
              <div className="space-y-2">
                {dayBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2.5 rounded-xl border border-cream-soft bg-white px-3 py-2.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream-soft text-base">
                      {BOOKING_CATEGORY_ICON[b.category]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-ink-soft">
                        {BOOKING_CATEGORY_LABEL[b.category]}
                        {b.time ? ` · ${b.time}` : ""}
                      </div>
                      <div className="truncate text-sm font-medium text-ink">{b.title}</div>
                    </div>
                    {b.link && (
                      <a
                        href={b.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg bg-cream-soft px-2.5 py-1.5 text-xs font-medium text-pine-dark"
                      >
                        เปิดลิงก์
                      </a>
                    )}
                    {b.file_url && (
                      <a
                        href={b.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg bg-cream-soft px-2.5 py-1.5 text-xs font-medium text-pine-dark"
                      >
                        📎 ไฟล์
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
