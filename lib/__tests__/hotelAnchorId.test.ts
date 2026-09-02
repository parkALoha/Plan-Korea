import { describe, expect, it } from "vitest";
import { hotelAnchorId } from "@/lib/hotelLegs";
import { resolvePlace } from "@/lib/resolvePlace";

describe("hotelAnchorId", () => {
  it("อิงพิกัดของโรงแรม ไม่ใช่ leg_id — เปลี่ยนโรงแรมของ leg เดิมได้ key ใหม่เอง (บั๊ก 9.1)", () => {
    const oldHotel = { lat: 35.15, lng: 129.06 };
    const newHotelSameLeg = { lat: 35.2, lng: 129.1 };
    expect(hotelAnchorId(oldHotel)).not.toBe(hotelAnchorId(newHotelSameLeg));
  });

  it("โรงแรมเดิม พิกัดเดิม ได้ key เดิมเป๊ะๆ (แคชยังใช้ได้ตามปกติ)", () => {
    const hotel = { lat: 35.15, lng: 129.06 };
    expect(hotelAnchorId(hotel)).toBe(hotelAnchorId({ lat: 35.15, lng: 129.06 }));
  });
});

/** แถว "แวะที่พัก" (kind="hotel") เก็บพิกัดไว้ใน place_id ตรงๆ ไม่ได้ join กับ trip_hotels
 *  ถ้ารูปแบบ id ของสองไฟล์นี้หลุดจากกันเมื่อไหร่ resolvePlace จะคืน null → computeSchedule
 *  ถือว่าแถวนั้นไม่มีพิกัด แล้วเวลาเดินทางเข้า/ออกที่พักหายไปเงียบๆ โดยไม่มีใคร error */
describe("resolvePlace กับ id ที่พัก", () => {
  it("อ่านพิกัดกลับจาก id ที่ hotelAnchorId สร้างไว้ได้", () => {
    const place = resolvePlace(hotelAnchorId({ lat: 35.1545767, lng: 129.0573613 }), { customPlaces: [] });
    expect(place).not.toBeNull();
    // hotelAnchorId ปัดเหลือ 5 ตำแหน่ง — คลาดได้ไม่เกินระดับเมตร ซึ่งไม่มีผลกับเวลาเดินทาง
    expect(place!.lat).toBeCloseTo(35.1545767, 4);
    expect(place!.lng).toBeCloseTo(129.0573613, 4);
  });

  it("id ปกติที่ไม่ใช่ที่พักไม่ถูกตีความผิด", () => {
    expect(resolvePlace("ไม่มีอยู่จริง", { customPlaces: [] })).toBeNull();
    expect(resolvePlace("hotel@พัง", { customPlaces: [] })).toBeNull();
  });
});
