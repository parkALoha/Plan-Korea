import { describe, expect, it } from "vitest";
import { hotelAnchorId } from "@/lib/hotelLegs";

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
