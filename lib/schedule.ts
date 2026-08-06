import type { Category, Place } from "@/data/places";
import { haversineKm } from "@/lib/geo";

export type TravelMode = "walk" | "transit" | "drive";

export const TRAVEL_MODES: TravelMode[] = ["walk", "transit", "drive"];

export const TRAVEL_MODE_LABEL: Record<TravelMode, string> = {
  walk: "เดิน",
  transit: "ขนส่งสาธารณะ",
  drive: "แท็กซี่/รถ",
};

export const TRAVEL_MODE_EMOJI: Record<TravelMode, string> = {
  walk: "🚶",
  transit: "🚌",
  drive: "🚕",
};

// ความเร็วเฉลี่ยคร่าวๆ ต่อโหมด (กม./ชม.) ใช้ประมาณเวลาเดินทางตอนยังไม่มีข้อมูลจริงจาก Google
// (ดู app/api/travel-time/route.ts ที่ยัง broken อยู่) — เป็นแค่ตัวเลขคร่าวๆ ใน timeline ไม่ใช่ของจริง
const TRAVEL_MODE_KMH: Record<TravelMode, number> = {
  walk: 4.5,
  transit: 20,
  drive: 30,
};

// ค่าเริ่มต้นตอนยังไม่ได้เลือกโหมดเดินทางเลย (ผสมเฉลี่ยเดิน+ขนส่ง+แท็กซี่)
const DEFAULT_KMH = 25;

export function estimateTravelMinutes(distanceKm: number, mode: TravelMode | null = null): number {
  const kmh = mode ? TRAVEL_MODE_KMH[mode] : DEFAULT_KMH;
  return Math.round((distanceKm / kmh) * 60);
}

export function estimateTravelMinutesBetween(
  from: Pick<Place, "lat" | "lng">,
  to: Pick<Place, "lat" | "lng">,
  mode: TravelMode | null = null
): number {
  return estimateTravelMinutes(haversineKm(from.lat, from.lng, to.lat, to.lng), mode);
}

export const DEFAULT_DWELL_MINUTES: Record<Category, number> = {
  culture: 75,
  nature: 90,
  beach: 60,
  market: 50,
  cafe: 50,
  nightlife: 90,
  viewpoint: 25,
  shopping: 60,
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type ScheduleStopInput = {
  id: string;
  placeId: string;
  dwellMinutes: number | null;
  travelMode: TravelMode | null;
};

export type ScheduledStop = ScheduleStopInput & {
  place: Place | undefined;
  resolvedDwellMinutes: number;
  arrival: string;
  departure: string;
  travelMinutesFromPrev: number | null;
};

/**
 * ไล่คำนวณเวลาถึง/ออกของแต่ละจุดแวะในวันนั้น จากเวลาเริ่มต้นวัน + เวลาเดินทางระหว่างจุด + เวลาที่อยู่แต่ละจุด
 * travelMinutesBetween คืนค่า null ได้ (ยังไม่รู้เวลาเดินทาง) — กรณีนั้นถือว่าเดินทาง 0 นาที ไปพลางๆ ก่อนข้อมูลจริงมาถึง
 */
export function computeSchedule(
  startTime: string,
  stops: ScheduleStopInput[],
  placesById: Map<string, Place>,
  travelMinutesBetween: (
    fromPlaceId: string,
    toPlaceId: string,
    travelMode: TravelMode | null
  ) => number | null
): ScheduledStop[] {
  const result: ScheduledStop[] = [];
  let cursor = timeToMinutes(startTime);

  stops.forEach((stop, i) => {
    const place = placesById.get(stop.placeId);
    const travelMinutesFromPrev =
      i === 0 ? null : travelMinutesBetween(stops[i - 1].placeId, stop.placeId, stop.travelMode);
    if (travelMinutesFromPrev != null) cursor += travelMinutesFromPrev;

    const arrival = minutesToTime(cursor);
    const resolvedDwellMinutes =
      stop.dwellMinutes ?? (place ? DEFAULT_DWELL_MINUTES[place.category] : 60);
    cursor += resolvedDwellMinutes;
    const departure = minutesToTime(cursor);

    result.push({
      ...stop,
      place,
      resolvedDwellMinutes,
      arrival,
      departure,
      travelMinutesFromPrev,
    });
  });

  return result;
}
