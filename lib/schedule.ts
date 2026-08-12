import type { Category, Place } from "@/data/places";
import { haversineKm } from "@/lib/geo";

export type TravelMode = "walk" | "transit" | "drive";

export const TRAVEL_MODES: TravelMode[] = ["walk", "transit", "drive"];

export const TRAVEL_MODE_LABEL: Record<TravelMode, string> = {
  walk: "เดิน",
  transit: "ขนส่งสาธารณะ",
  drive: "แท็กซี่/รถ",
};

/** คู่ภาษาอังกฤษของ TRAVEL_MODE_LABEL — ใช้บนหน้า /summary?lang=en (เฟส 16) */
export const TRAVEL_MODE_LABEL_EN: Record<TravelMode, string> = {
  walk: "Walk",
  transit: "Public transit",
  drive: "Taxi/car",
};

export const TRAVEL_MODE_EMOJI: Record<TravelMode, string> = {
  walk: "🚶",
  transit: "🚌",
  drive: "🚕",
};

// ความเร็วเฉลี่ยคร่าวๆ ต่อโหมด (กม./ชม.) ใช้ประมาณเวลาเดินทางตอนยังไม่มีเวลาจริงจาก Google ในแคช
// (ดู app/api/travel-time/route.ts) — เป็นแค่ตัวเลขคร่าวๆ ใน timeline ไม่ใช่ของจริง
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
  restaurant: 75,
  // แถว kind="transfer" ตั้ง dwell เองเสมอ (= เวลาเผื่อเช็คอิน) ค่านี้เป็นแค่ fallback ให้ครบ type
  // ใช้ 180 นาทีตามมาตรฐาน "ถึงสนามบิน 3 ชม. ก่อนบินระหว่างประเทศ" ที่ทริปนี้ยึดอยู่แล้ว
  transport: 180,
};

/** คืน null เมื่อ parse ไม่ได้ (เช่น ค่าว่างจากการล้างช่อง <input type="time">) — ผู้เรียกต้อง fallback เอง */
export function timeToMinutes(time: string): number | null {
  const parts = time.split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
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
  /** นาทีสะสมแบบไม่ wrap นับจาก startTime ของวัน (อาจเกิน 1440 เมื่อจุดแวะข้ามเที่ยงคืน)
   *  ใช้เทียบเดดไลน์/เวลาเปิด-ปิดข้ามเที่ยงคืนได้ตรง ต่างจาก arrival/departure ที่ห่อรอบ 24 ชม.แล้วสำหรับแสดงผล */
  arrivalMinutes: number;
  departureMinutes: number;
  travelMinutesFromPrev: number | null;
};

/** จุดอ้างอิงบนแผนที่ที่ใช้ถามเวลาเดินทางได้ — จุดแวะใช้ place.id, ที่พักใช้ hotelAnchorId (lib/hotelLegs.ts,
 *  อิงพิกัดแทน leg_id ตรงๆ กันเวลาแคชค้างของโรงแรมเก่าตอนเปลี่ยนโรงแรม — ตรงกับคีย์แคชใน useHotelDistance) */
export type PointRef = { id: string; lat: number; lng: number };

/** ที่พักหัว/ท้ายวัน — start = ที่พักคืนก่อนหน้าที่ออกมาตอนเช้า, end = ที่พักคืนนี้ที่กลับไปนอน */
export type ScheduleAnchor = PointRef & { label: string; mode: TravelMode | null };

export type DaySchedule = {
  stops: ScheduledStop[];
  /** เวลาออกจากที่พัก = startTime ตรงๆ (null เมื่อไม่มีที่พักต้นทาง) */
  departFrom: string | null;
  travelMinutesFromStart: number | null;
  travelMinutesToEnd: number | null;
  /** เวลากลับถึงที่พักคืนนี้ (null เมื่อไม่มีที่พักปลายทางหรือไม่มีจุดแวะเลย) */
  arriveBackAt: string | null;
  /** นาทีสะสมแบบไม่ wrap ของจุดสิ้นสุดวัน (กลับถึงที่พัก หรือจุดแวะสุดท้ายถ้าไม่มีที่พักปลายทาง)
   *  ใช้เทียบเดดไลน์ตายตัวที่อาจอยู่ข้ามเที่ยงคืนไปวันถัดไป (เช่น ต้องออกไปขึ้นเครื่องตี 1) */
  endOfDayMinutes: number;
};

/**
 * ไล่คำนวณเวลาถึง/ออกของแต่ละจุดแวะในวันนั้น จากเวลาเริ่มต้นวัน + เวลาเดินทางระหว่างจุด + เวลาที่อยู่แต่ละจุด
 * มีที่พักหัว-ท้ายด้วย (anchors): startTime = เวลาที่ "ออกจากที่พัก" ไม่ใช่เวลาถึงจุดแรก
 * travelMinutesBetween คืนค่า null ได้ (ยังไม่รู้เวลาเดินทาง) — กรณีนั้นถือว่าเดินทาง 0 นาที ไปพลางๆ ก่อนข้อมูลจริงมาถึง
 */
export function computeSchedule(
  startTime: string,
  stops: ScheduleStopInput[],
  placesById: Map<string, Place>,
  travelMinutesBetween: (from: PointRef, to: PointRef, travelMode: TravelMode | null) => number | null,
  anchors?: { start?: ScheduleAnchor | null; end?: ScheduleAnchor | null }
): DaySchedule {
  const result: ScheduledStop[] = [];
  // startTime มาจาก DB เสมอเป็นตัวเดินหลัก ถ้า parse ไม่ได้ (แถวเก่าที่เคยเขียน "" ก่อนเฟส 7.3 แก้บั๊ก)
  // fallback เป็น 0 (เที่ยงคืน) แทนที่จะทำให้ cursor เป็น NaN แล้วพังทั้งตาราง
  let cursor = timeToMinutes(startTime) ?? 0;

  const pointOf = (stop: ScheduleStopInput): PointRef | null => {
    const place = placesById.get(stop.placeId);
    return place ? { id: place.id, lat: place.lat, lng: place.lng } : null;
  };

  const startAnchor = anchors?.start ?? null;
  const firstPoint = stops.length > 0 ? pointOf(stops[0]) : null;
  const travelMinutesFromStart =
    startAnchor && firstPoint
      ? travelMinutesBetween(startAnchor, firstPoint, startAnchor.mode)
      : null;
  if (travelMinutesFromStart != null) cursor += travelMinutesFromStart;

  stops.forEach((stop, i) => {
    const place = placesById.get(stop.placeId);
    const from = i === 0 ? null : pointOf(stops[i - 1]);
    const to = pointOf(stop);
    const travelMinutesFromPrev =
      from && to ? travelMinutesBetween(from, to, stop.travelMode) : null;
    if (travelMinutesFromPrev != null) cursor += travelMinutesFromPrev;

    const arrivalMinutes = cursor;
    const arrival = minutesToTime(cursor);
    const resolvedDwellMinutes =
      stop.dwellMinutes ?? (place ? DEFAULT_DWELL_MINUTES[place.category] : 60);
    cursor += resolvedDwellMinutes;
    const departureMinutes = cursor;
    const departure = minutesToTime(cursor);

    result.push({
      ...stop,
      place,
      resolvedDwellMinutes,
      arrival,
      departure,
      arrivalMinutes,
      departureMinutes,
      travelMinutesFromPrev,
    });
  });

  const endAnchor = anchors?.end ?? null;
  const lastPoint = stops.length > 0 ? pointOf(stops[stops.length - 1]) : null;
  const travelMinutesToEnd =
    endAnchor && lastPoint ? travelMinutesBetween(lastPoint, endAnchor, endAnchor.mode) : null;
  const endOfDayMinutes = cursor + (travelMinutesToEnd ?? 0);
  const arriveBackAt = endAnchor && lastPoint ? minutesToTime(endOfDayMinutes) : null;

  return {
    stops: result,
    departFrom: startAnchor && stops.length > 0 ? startTime : null,
    travelMinutesFromStart,
    travelMinutesToEnd,
    arriveBackAt,
    endOfDayMinutes,
  };
}
