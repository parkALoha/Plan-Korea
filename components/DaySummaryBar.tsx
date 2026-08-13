"use client";

import type { Place } from "@/data/places";
import type { DaySchedule, TravelMode } from "@/lib/schedule";
import { haversineKm } from "@/lib/geo";
import type { TripHotel } from "@/lib/supabase";

/** Google Maps รับ waypoints ต่อลิงก์ได้จำกัด — เกินกว่านี้ลิงก์จะพัง เลยตัดแล้วบอกผู้ใช้ตรงๆ */
const MAX_WAYPOINTS = 9;

const GOOGLE_TRAVEL_MODE: Record<TravelMode, string> = {
  walk: "walking",
  transit: "transit",
  drive: "driving",
};

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} น.`;
}

function coord(p: { lat: number; lng: number }) {
  return `${p.lat},${p.lng}`;
}

/**
 * สรุปตัวเลขของวัน + ปุ่มเปิดเส้นทางทั้งวันใน Google Maps ทีเดียว (ไว้ใช้ตอนอยู่เกาหลีจริง)
 */
export function DaySummaryBar({
  schedule,
  startHotel,
  endHotel,
  dominantMode,
  hasEstimatedLeg,
}: {
  schedule: DaySchedule;
  startHotel: TripHotel | null;
  endHotel: TripHotel | null;
  /** โหมดเดินทางที่ใช้บ่อยสุดของวันนี้ ใช้เป็น travelmode ของลิงก์ Google Maps */
  dominantMode: TravelMode;
  /** true = ยังมีบางช่วงที่ใช้เวลาประมาณการ (ไม่ใช่เวลาจริงจาก Google) */
  hasEstimatedLeg: boolean;
}) {
  const places = schedule.stops
    .map((s) => s.place)
    .filter((p): p is Place => p != null);
  if (places.length === 0) return null;

  const travelMinutes =
    (schedule.travelMinutesFromStart ?? 0) +
    schedule.stops.reduce((sum, s) => sum + (s.travelMinutesFromPrev ?? 0), 0) +
    (schedule.travelMinutesToEnd ?? 0);

  const legs: Array<{ lat: number; lng: number }> = [
    ...(startHotel ? [{ lat: startHotel.lat, lng: startHotel.lng }] : []),
    ...places.map((p) => ({ lat: p.lat, lng: p.lng })),
    ...(endHotel ? [{ lat: endHotel.lat, lng: endHotel.lng }] : []),
  ];
  const distanceKm = legs.reduce(
    (sum, p, i) => (i === 0 ? 0 : sum + haversineKm(legs[i - 1].lat, legs[i - 1].lng, p.lat, p.lng)),
    0
  );

  const origin = legs[0];
  const destination = legs[legs.length - 1];
  const middle = legs.slice(1, -1);
  const waypoints = middle.slice(0, MAX_WAYPOINTS);
  const truncated = middle.length - waypoints.length;

  const mapsUrl =
    legs.length < 2
      ? null
      : `https://www.google.com/maps/dir/?api=1&origin=${coord(origin)}&destination=${coord(destination)}` +
        (waypoints.length > 0 ? `&waypoints=${waypoints.map(coord).join("|")}` : "") +
        `&travelmode=${GOOGLE_TRAVEL_MODE[dominantMode]}`;

  // มีที่พักหัว/ท้ายก็นับตั้งแต่ออกจนกลับถึงที่พัก ไม่มีก็ใช้เวลาถึงจุดแรก–ออกจากจุดสุดท้ายแทน (ทีละฝั่งได้)
  const dayStart = schedule.departFrom ?? schedule.stops[0].arrival;
  const dayEnd = schedule.arriveBackAt ?? schedule.stops[schedule.stops.length - 1].departure;
  const timeRange = `${dayStart}–${dayEnd}`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line bg-surface-soft/40 px-4 py-2.5 text-[11px] text-content-soft">
      <span>📍 {places.length} จุด</span>
      <span>⏱️ เดินทางรวม ~{formatMinutes(travelMinutes)}</span>
      {timeRange && <span>🕘 {timeRange}</span>}
      <span>📏 ~{distanceKm.toFixed(1)} กม.</span>
      {hasEstimatedLeg && <span className="text-maple-dark">≈ บางช่วงยังเป็นเวลาประมาณการ</span>}
      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded-full bg-pine px-3 py-1.5 font-medium text-cream hover:bg-pine-dark"
        >
          🗺️ เปิดเส้นทางทั้งวันใน Google Maps
        </a>
      )}
      {truncated > 0 && (
        <span className="basis-full text-[10px]">
          * ลิงก์ Google Maps ใส่จุดแวะได้สูงสุด {MAX_WAYPOINTS} จุด อีก {truncated} จุดจึงไม่อยู่ในลิงก์
        </span>
      )}
    </div>
  );
}
