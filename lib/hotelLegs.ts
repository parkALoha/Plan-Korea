import type { Day } from "@/data/itinerary";

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

export function dayIdToLegId(legs: HotelLeg[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const leg of legs) {
    for (const dayId of leg.dayIds) map[dayId] = leg.id;
  }
  return map;
}
