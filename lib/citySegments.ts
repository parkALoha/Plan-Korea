import type { City } from "@/data/itinerary";
import { CITY_NAME_TH } from "@/data/itinerary";
import { cityCenter, type Place } from "@/data/places";
import type { TripHotel } from "@/lib/supabase";
import { haversineKm } from "@/lib/geo";
import { isHotelAnchorId } from "@/lib/hotelLegs";

/**
 * แบ่งจุดของวันหนึ่งออกเป็น "ช่วงต่อเมือง" (เฟส 23)
 *
 * ทำไมต้องมี: `DayMapPanel` fit แผนที่ครอบทุกจุดของวัน พอเป็นวันย้ายเมือง (15 ต.ค. ปูซาน→ซกโช
 * 326 กม.) แผนที่เลยซูมออกจนเห็นเกาหลีทั้งประเทศในช่องกว้าง 288px รายละเอียดในเมืองหายหมด
 *
 * ⚠️ ทำไมไม่แบ่งตาม `place.city` ตรงๆ — city tag เชื่อไม่ได้ มีที่มาของ tag เพี้ยน 2 ทาง:
 *  1. `lib/resolvePlace.ts` ให้แถว kind="hotel" (`hotel@lat,lng`) เป็น `city: "seoul"` ฮาร์ดโค้ด
 *     พร้อมคอมเมนต์ว่า "ไม่ได้ใช้จริง" — ไฟล์นี้คือโค้ดแรกที่กรองตามเมือง คอมเมนต์นั้นเลยเป็นเท็จแล้ว
 *  2. สถานที่ที่เพิ่มเองผ่าน `NearbyPlacesModal` ได้ `city = day.city` (`app/page.tsx`) — ร้านแถว
 *     เมียงดงที่เพิ่มในวัน d6 (`day.city = "gangneung"`) จึงถูกเก็บเป็นคังนึงทั้งที่อยู่โซล
 * ถ้าเชื่อ tag ล้วน วันที่ 15 ต.ค. จะได้ช่วง "โซล" ผีขึ้นมากลางวัน
 *
 * จึงต้องเข้าเงื่อนไข 2 อย่างถึงตัด: เมืองเปลี่ยน **และ** ห่างเกิน `MIN_HOP_KM`
 */

/** ระยะขั้นต่ำที่ถือว่า "ข้ามเมืองจริง" — อยู่ระหว่างโซล–ซูวอน (32.3 กม. ไม่ตัด)
 *  กับ ซกโช–คังนึง (56.7 กม. ต้องตัด) · จุดที่ tag เพี้ยนอยู่ห่างเพื่อนบ้านแค่ ~1-5 กม. จึงรอดด่านนี้ */
export const MIN_HOP_KM = 40;

/** ไกลขนาดนี้ = ข้ามเมืองแน่ ไม่ว่า city tag จะเพี้ยนแค่ไหน — กันเคสที่ tag ผิดทั้งสองฝั่งของ hop จริง
 *  (เช่น d6 ที่ผู้ใช้ไม่ได้ใส่แถวสถานี KTX และจุดแรกในโซลเป็นสถานที่เพิ่มเองที่ tag เป็นคังนึง) */
export const HARD_SPLIT_KM = 100;

export type CityPoint = { lat: number; lng: number; city: City | null };

export type CitySegment<T extends CityPoint> = {
  /** เมืองของช่วงนี้ — city แรกที่ไม่ null ใน run · null เมื่อทั้งช่วงไม่มี tag ที่ใช้ได้เลย */
  city: City | null;
  items: T[];
};

function isCity(value: string | null | undefined): value is City {
  return value != null && value in CITY_NAME_TH;
}

const ALL_CITIES = Object.keys(CITY_NAME_TH) as City[];

/**
 * เดาเมืองจากพิกัด — ใช้กับแถว "แวะที่พัก" ที่ `resolvePlace` ตั้ง city เป็น "seoul" ไว้ตายตัว
 *
 * เคยลองทำเป็น `null` แล้วปล่อยให้รับ label ของช่วงที่ตกอยู่ ซึ่ง**ผิด**: วันที่ 16 ต.ค. รอยต่อ
 * ข้ามเมือง 56.7 กม. ตกลงบนแถวแวะที่พักที่คังนึงพอดี พอ city เป็น null ก็ไม่นับว่า "เมืองเปลี่ยน"
 * (และ 56.7 ยังไม่ถึงด่านแข็ง 100) ทั้งวันเลยยุบเหลือช่วงเดียวเหมือนก่อนแก้
 * ต้องหาเมืองจากพิกัดจริงแทน — กลางเมืองแต่ละเมืองห่างกันมากพอจะไม่สับสน
 */
function cityFromCoords(lat: number, lng: number): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const city of ALL_CITIES) {
    const center = cityCenter(city);
    const km = haversineKm(lat, lng, center.lat, center.lng);
    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  }
  return best;
}

/**
 * จัดจุดเป็นช่วงแบบ run ต่อเนื่อง (ไม่ใช่ groupBy) — วัน A→B→A ได้ 3 ช่วงเรียงตามเวลา ไม่ใช่ 2
 *
 * เทียบ city ของแต่ละจุดกับ **city ของช่วง** (ตัวแรกที่ไม่ null) ไม่ใช่จุดก่อนหน้า
 * ไม่งั้นจุดที่ tag เพี้ยนหนึ่งจุดจะทำให้ label ของช่วงแกว่งไปมา
 */
export function buildCitySegments<T extends CityPoint>(
  points: T[],
  options?: { minHopKm?: number; hardSplitKm?: number }
): CitySegment<T>[] {
  const minHopKm = options?.minHopKm ?? MIN_HOP_KM;
  const hardSplitKm = options?.hardSplitKm ?? HARD_SPLIT_KM;
  const segments: CitySegment<T>[] = [];

  for (const point of points) {
    const current = segments[segments.length - 1];
    if (!current) {
      segments.push({ city: point.city, items: [point] });
      continue;
    }

    const previous = current.items[current.items.length - 1];
    const km = haversineKm(previous.lat, previous.lng, point.lat, point.lng);
    // จุดที่ไม่มี city (เช่นแถวแวะที่พัก) ไม่เคยทำให้ตัดช่วง — มันรับ label ของช่วงที่มันตกอยู่ไป
    const cityChanged = point.city != null && current.city != null && point.city !== current.city;

    if ((cityChanged && km > minHopKm) || km > hardSplitKm) {
      segments.push({ city: point.city, items: [point] });
      continue;
    }

    current.items.push(point);
    if (current.city == null) current.city = point.city;
  }

  return segments;
}

export type DayPoint =
  | { kind: "stop"; stopId: string; lat: number; lng: number; city: City | null }
  | { kind: "hotel"; role: "start" | "end"; lat: number; lng: number; city: City | null };

/**
 * แปลงจุดแวะ + ที่พักหัว-ท้ายของวันเป็นช่วงต่อเมือง
 *
 * **ที่พักต้องเป็นจุดชั้นหนึ่ง ไม่ใช่ของแถม** — ไม่งั้นวัน `d5` (16 ต.ค.) ไม่ถูกแก้เลย: วันนั้น
 * `city: "sokcho"` + `overnightCity: "gangneung"` และ**จุดแวะอยู่ซกโชทั้งหมด** ถ้าแบ่งจากจุดแวะ
 * อย่างเดียวจะได้ช่วงเดียว แผนที่ก็ยังครอบซกโช + โรงแรมคังนึงที่ห่าง 56.7 กม. เหมือนเดิม
 */
export function buildDayCitySegments(input: {
  stops: { id: string; place: Pick<Place, "id" | "lat" | "lng" | "city"> }[];
  startHotel: Pick<TripHotel, "lat" | "lng" | "city"> | null;
  endHotel: Pick<TripHotel, "lat" | "lng" | "city"> | null;
}): CitySegment<DayPoint>[] {
  const { stops, startHotel, endHotel } = input;
  const points: DayPoint[] = [];

  if (startHotel) {
    points.push({
      kind: "hotel",
      role: "start",
      lat: startHotel.lat,
      lng: startHotel.lng,
      city: isCity(startHotel.city) ? startHotel.city : null,
    });
  }

  for (const stop of stops) {
    points.push({
      kind: "stop",
      stopId: stop.id,
      lat: stop.place.lat,
      lng: stop.place.lng,
      // แถว "แวะที่พัก" มี city ปลอมเป็น "seoul" เสมอ (ดูหัวไฟล์) — หาเมืองจากพิกัดจริงแทน
      // ส่วน isCity กันเมืองที่อยู่นอกทริป (สนามบินกรุงเทพ/โฮจิมินห์ใน TRANSFER_POINTS) ไม่ให้
      // กลายเป็นชื่อช่วงเมืองบนแผนที่ — ไม่มีวันไหนเที่ยวเมืองพวกนั้น
      city: isHotelAnchorId(stop.place.id)
        ? cityFromCoords(stop.place.lat, stop.place.lng)
        : isCity(stop.place.city)
          ? stop.place.city
          : null,
    });
  }

  // ที่พักคืนก่อนกับคืนนี้มักเป็นที่เดียวกัน — ใส่ซ้ำจะได้ช่วงที่สามงอกมาเปล่าๆ ตอนวันไป-กลับ
  // (เทสต์เดียวกับ `sameHotel` ใน DayMapPanel)
  const sameHotel =
    startHotel != null &&
    endHotel != null &&
    startHotel.lat === endHotel.lat &&
    startHotel.lng === endHotel.lng;

  if (endHotel && !sameHotel) {
    points.push({
      kind: "hotel",
      role: "end",
      lat: endHotel.lat,
      lng: endHotel.lng,
      city: isCity(endHotel.city) ? endHotel.city : null,
    });
  }

  return buildCitySegments(points);
}

/** จำนวนจุดแวะจริงในช่วง (ไม่นับหมุดที่พัก) — ใช้ทั้งบนชิปและตอนเลือกช่วงเริ่มต้น */
export function stopCountIn(segment: CitySegment<DayPoint>): number {
  return segment.items.filter((item) => item.kind === "stop").length;
}
