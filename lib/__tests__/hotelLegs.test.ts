import { describe, expect, it } from "vitest";
import {
  applyOvernightOverrides,
  deriveHotelLegs,
  dayIdToLegId,
  hotelAnchorId,
  hotelForStop,
} from "@/lib/hotelLegs";
import type { Day } from "@/data/itinerary";
import type { TripHotel } from "@/lib/supabase";

function day(partial: Partial<Day> & Pick<Day, "id" | "date" | "city">): Day {
  return {
    weekdayTh: "จันทร์",
    weekdayEn: "Monday",
    cityTh: partial.city,
    cityEn: partial.city,
    slots: [],
    ...partial,
  };
}

describe("deriveHotelLegs", () => {
  it("วันติดกันเมืองเดียวกันมัดเป็น leg เดียว", () => {
    const itinerary: Day[] = [
      day({ id: "d1", date: "2026-10-12", city: "busan" }),
      day({ id: "d2", date: "2026-10-13", city: "busan" }),
      day({ id: "d3", date: "2026-10-14", city: "busan" }),
    ];
    const legs = deriveHotelLegs(itinerary);
    expect(legs).toHaveLength(1);
    expect(legs[0].dayIds).toEqual(["d1", "d2", "d3"]);
    expect(legs[0].nights).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(legs[0].endDate).toBe("2026-10-15");
  });

  it("เปลี่ยนเมืองแยก leg ใหม่", () => {
    const itinerary: Day[] = [
      day({ id: "d1", date: "2026-10-12", city: "busan" }),
      day({ id: "d2", date: "2026-10-13", city: "seoul" }),
    ];
    const legs = deriveHotelLegs(itinerary);
    expect(legs).toHaveLength(2);
    expect(legs[0].city).toBe("busan");
    expect(legs[1].city).toBe("seoul");
  });

  it("noHotel ถูกข้าม ไม่นับเป็น leg ว่างๆ", () => {
    const itinerary: Day[] = [
      day({ id: "d0", date: "2026-10-11", city: "hanoi", noHotel: true }),
      day({ id: "d1", date: "2026-10-12", city: "busan" }),
    ];
    const legs = deriveHotelLegs(itinerary);
    expect(legs).toHaveLength(1);
    expect(legs[0].city).toBe("busan");
  });

  it("ใช้ overnightCity แทน city เมื่อคืนนี้นอนคนละเมือง", () => {
    const itinerary: Day[] = [
      day({ id: "d1", date: "2026-10-16", city: "gangneung", overnightCity: "sokcho" }),
    ];
    const legs = deriveHotelLegs(itinerary);
    expect(legs[0].city).toBe("sokcho");
  });

  it("dayIdToLegId แม็ปทุกวันในทริปกลับไปหา leg ของตัวเอง", () => {
    const itinerary: Day[] = [
      day({ id: "d1", date: "2026-10-12", city: "busan" }),
      day({ id: "d2", date: "2026-10-13", city: "busan" }),
      day({ id: "d3", date: "2026-10-14", city: "seoul" }),
    ];
    const legs = deriveHotelLegs(itinerary);
    const map = dayIdToLegId(legs);
    expect(map.d1).toBe(map.d2);
    expect(map.d3).not.toBe(map.d1);
  });
});

describe("applyOvernightOverrides", () => {
  it("ไม่มี override เลยคืน itinerary เดิมเป๊ะๆ (reference เดิม)", () => {
    const itinerary: Day[] = [day({ id: "d1", date: "2026-10-16", city: "gangneung" })];
    expect(applyOvernightOverrides(itinerary, {})).toBe(itinerary);
  });

  it("override ที่อยู่ในตัวเลือกทับ overnightCity ให้", () => {
    const itinerary: Day[] = [
      day({
        id: "d1",
        date: "2026-10-16",
        city: "gangneung",
        overnightOptions: ["gangneung", "sokcho"],
      }),
    ];
    const result = applyOvernightOverrides(itinerary, { d1: "sokcho" });
    expect(result[0].overnightCity).toBe("sokcho");
  });

  it("override ที่ไม่อยู่ในตัวเลือกถูกเมิน (ข้อมูลเก่า/พิมพ์ผิดใน DB)", () => {
    const itinerary: Day[] = [
      day({
        id: "d1",
        date: "2026-10-16",
        city: "gangneung",
        overnightOptions: ["gangneung", "sokcho"],
      }),
    ];
    const result = applyOvernightOverrides(itinerary, { d1: "seoul" });
    expect(result[0].overnightCity).toBeUndefined();
  });

  it("วันที่ไม่มี overnightOptions ไม่ถูกแตะแม้มี override ค้างอยู่", () => {
    const itinerary: Day[] = [day({ id: "d1", date: "2026-10-12", city: "busan" })];
    const result = applyOvernightOverrides(itinerary, { d1: "seoul" });
    expect(result[0].overnightCity).toBeUndefined();
  });
});

describe("hotelForStop", () => {
  function hotel(name: string, lat: number, lng: number): TripHotel {
    return {
      // `E3`/`D51` — ไม่มี `leg_id` แล้ว · ช่วงวันที่คือตัวระบุ
      check_in: "2026-10-11",
      check_out: "2026-10-12",
      city: "sokcho",
      hotel_name: name,
      formatted_address: "",
      lat,
      lng,
      updated_at: "2026-08-12T00:00:00Z",
    } as TripHotel;
  }

  const sokcho = hotel("Lecollective SokchoBeach", 38.1899269, 128.600906);
  const gangneung = hotel("Hotel Flow-er", 37.7618307, 128.9026897);

  it("แถวที่ชี้ที่พักคืนนี้ได้ชื่อที่พักคืนนี้", () => {
    expect(hotelForStop(hotelAnchorId(gangneung), gangneung, sokcho)).toBe(gangneung);
  });

  it("แถวที่ชี้ที่พักคืนก่อนหน้าได้ชื่อที่พักคืนก่อนหน้า (วันย้ายเมือง)", () => {
    expect(hotelForStop(hotelAnchorId(sokcho), gangneung, sokcho)).toBe(sokcho);
  });

  it("พิกัดที่ไม่ตรงกับที่พักไหนเลย ตกกลับไปใช้ที่พักคืนนี้เหมือนเดิม", () => {
    expect(hotelForStop("hotel@0.00000,0.00000", gangneung, sokcho)).toBe(gangneung);
  });

  it("ไม่มีที่พักคืนก่อนหน้า (คืนแรกของทริป) ก็ยังคืนที่พักคืนนี้", () => {
    expect(hotelForStop(hotelAnchorId(gangneung), gangneung, null)).toBe(gangneung);
  });
});
