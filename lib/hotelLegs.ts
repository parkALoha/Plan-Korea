import type { City, Day } from "@/data/itinerary";
import type { TripHotel } from "@/lib/supabase";

/**
 * id ของ anchor ที่พักสำหรับคำนวณ/แคชเวลาเดินทาง — อิงพิกัดแทน leg_id ตรงๆ (บั๊ก 9.1)
 * เดิมใช้ leg_id เป็น key ทั้งแคชในแท็บ (L1) และตาราง travel_time_cache (L2) พอเปลี่ยนโรงแรมของ leg เดิม
 * (leg_id ไม่เปลี่ยน แค่พิกัด/ชื่อโรงแรมเปลี่ยน) เวลาเดินทางที่เคยแคชไว้ของโรงแรมเก่าก็ยังถูกใช้ต่อตลอดไป
 * เปลี่ยนเป็นอิงพิกัดแล้วเปลี่ยนโรงแรม = ได้ key ใหม่เองทันที ไม่ต้องเพิ่ม migration/policy update ให้
 * travel_time_cache เลย (migration 0010 มีแค่ policy select/insert ไม่มี update/delete)
 */
export function hotelAnchorId(hotel: Pick<TripHotel, "lat" | "lng">): string {
  return `hotel@${hotel.lat.toFixed(5)},${hotel.lng.toFixed(5)}`;
}

/** id นี้เป็น anchor ที่พัก (แถว kind="hotel") หรือเปล่า — คู่กับ `hotelAnchorId` ที่เป็นเจ้าของรูปแบบ
 *  มีไว้ให้ที่อื่นไม่ต้องเขียน `.startsWith("hotel@")` เอง เวลารูปแบบเปลี่ยนจะได้แก้ที่เดียว */
export function isHotelAnchorId(placeId: string): boolean {
  return placeId.startsWith("hotel@");
}

export type HotelLeg = {
  id: string;
  city: Day["city"];
  dayIds: string[];
  nights: string[]; // ISO dates of each night slept in this leg
  startDate: string; // ISO date of the first night
  endDate: string; // ISO date of checkout (the morning after the last night)
};

function addDaysIso(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// จัดกลุ่มวันที่ติดกันซึ่งนอนเมืองเดียวกัน (overnightCity ถ้ามี ไม่งั้นใช้ city) ให้เป็น "leg" เดียว
// derive จาก ITINERARY สดๆ แทนที่จะแยกลิสต์ไว้เอง กันไม่ให้หลุด sync เวลาแก้แพลน
export function deriveHotelLegs(itinerary: Day[]): HotelLeg[] {
  const legs: HotelLeg[] = [];
  for (const day of itinerary) {
    // วันบิน/นอนบนเครื่อง ไม่มีคืนที่ต้องจองโรงแรม — ข้ามไปเลย ไม่งั้นจะโผล่เป็น leg ว่างๆ ให้กรอกที่พัก
    if (day.noHotel) continue;
    const city = day.overnightCity ?? day.city;
    const current = legs[legs.length - 1];
    if (current && current.city === city) {
      current.dayIds.push(day.id);
      current.nights.push(day.date);
      current.endDate = addDaysIso(day.date, 1);
    } else {
      legs.push({
        id: day.id,
        city,
        dayIds: [day.id],
        nights: [day.date],
        startDate: day.date,
        endDate: addDaysIso(day.date, 1),
      });
    }
  }
  return legs;
}

/**
 * ทับ overnightCity ของวันที่ยังเลือกเมืองนอนได้ (day.overnightOptions) ด้วยตัวเลือกที่ 2 คนเลือกไว้จริง
 * ค่าที่ไม่อยู่ในตัวเลือกจะถูกเมิน — กันข้อมูลเก่า/พิมพ์ผิดใน DB ทำ leg เพี้ยน
 */
export function applyOvernightOverrides(
  itinerary: Day[],
  overrides: Record<string, City>
): Day[] {
  if (Object.keys(overrides).length === 0) return itinerary;
  return itinerary.map((day) => {
    const picked = overrides[day.id];
    if (!picked || !day.overnightOptions?.includes(picked)) return day;
    return { ...day, overnightCity: picked };
  });
}

/**
 * ที่พักที่แถว `kind="hotel"` แถวนั้นหมายถึงจริงๆ — เทียบ `place_id` (`hotel@lat,lng`) กับ anchor
 * ของที่พักคืนนี้ก่อน แล้วค่อยลองที่พักคืนก่อนหน้า
 *
 * วันย้ายเมืองมีที่พัก 2 แห่งในวันเดียว: เช้ายังอยู่ที่พักคืนก่อน (เช่น 16 ต.ค. กลับไปเอากระเป๋าที่ซกโช)
 * แล้วเย็นถึงเช็คอินที่พักคืนนี้ (คังนึง) — เดิมทุกที่ที่โชว์ชื่อโรงแรมของแถวนี้ใช้ "ที่พักคืนนี้" อย่างเดียว
 * แถวตอนเช้าจึงขึ้นชื่อโรงแรมผิดเมือง ทั้งที่พิกัด/เวลาเดินทางถูกอยู่แล้ว
 */
export function hotelForStop(
  placeId: string,
  endHotel: TripHotel | null,
  startHotel: TripHotel | null
): TripHotel | null {
  if (endHotel && placeId === hotelAnchorId(endHotel)) return endHotel;
  if (startHotel && placeId === hotelAnchorId(startHotel)) return startHotel;
  return endHotel;
}

export function dayIdToLegId(legs: HotelLeg[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const leg of legs) {
    for (const dayId of leg.dayIds) map[dayId] = leg.id;
  }
  return map;
}
