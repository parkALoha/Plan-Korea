import { describe, expect, it } from "vitest";
import { PLACE_ID_PREFIX, parsePlaceIdKey, placeQueryKey } from "@/lib/placeQuery";

/**
 * `lib/placeQuery.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 **คีย์ที่ไฟล์นี้สร้าง คือคีย์ของ `place_details_cache` และ `place_photo_cache`**
 * ผิดที่นี่ = แคชเก็บข้อมูลของ*ร้านอื่น*ไว้ใต้ชื่อร้านที่เราจะไป **แล้วมันจะอยู่อย่างนั้นจนหมดอายุ**
 *
 * เคสจริงที่คอมเมนต์ในไฟล์บันทึกไว้: *"Cup & Cup" ที่กวางอัลลี ปูซาน → แคชไปเก็บเวลาเปิด-ปิด
 * ของร้านชานมชื่อเดียวกันที่ Plano, Texas* เพราะ Google เดาจากตำแหน่งของคนที่เปิดเว็บ
 * 🎯 **บั๊กชนิดนี้ไม่ทำให้อะไรพัง — มันแค่บอกเวลาเปิดร้านผิดให้คนที่กำลังจะเดินไป**
 */
describe("placeQueryKey — place id มาก่อนข้อความเสมอ", () => {
  it("มี place id → ใช้ place id", () => {
    expect(placeQueryKey({ googlePlaceId: "ChIJabc", mapsQuery: "Cup & Cup" })).toBe("place_id:ChIJabc");
  });

  it("ไม่มี place id → ตกไปใช้ข้อความค้นหา", () => {
    expect(placeQueryKey({ mapsQuery: "Jagalchi Market Busan" })).toBe("Jagalchi Market Busan");
    expect(placeQueryKey({ googlePlaceId: null, mapsQuery: "x" })).toBe("x");
    expect(placeQueryKey({ googlePlaceId: undefined, mapsQuery: "x" })).toBe("x");
  });

  it("🔴 `googlePlaceId` เป็นสตริงว่าง → ต้องตกไปใช้ข้อความ ไม่ใช่สร้าง `place_id:`", () => {
    // ฐานเก็บ `""` ได้จริงเมื่อผู้ใช้บันทึกฟอร์มโดยไม่เลือกสถานที่จาก Google
    // ถ้าได้ `"place_id:"` **ทุกสถานที่แบบนั้นจะใช้คีย์แคชเดียวกันหมด** → ปนกันทั้งทริป
    expect(placeQueryKey({ googlePlaceId: "", mapsQuery: "ร้านเจ๊" })).toBe("ร้านเจ๊");
  });
});

describe("parsePlaceIdKey — ถอดกลับได้ตรงกัน", () => {
  it("คีย์แบบ place id → คืน id", () => {
    expect(parsePlaceIdKey("place_id:ChIJabc")).toBe("ChIJabc");
  });

  it("คีย์แบบข้อความ → `null`", () => {
    expect(parsePlaceIdKey("Jagalchi Market Busan")).toBeNull();
    expect(parsePlaceIdKey("")).toBeNull();
  });

  it("🔴 ไป-กลับต้องได้ค่าเดิม (คุณสมบัติที่แคชพึ่งอยู่)", () => {
    for (const id of ["ChIJabc", "ChIJ-_0123", "ChIJ" + "x".repeat(200)]) {
      expect(parsePlaceIdKey(placeQueryKey({ googlePlaceId: id, mapsQuery: "ignored" }))).toBe(id);
    }
  });

  it("🔴 ข้อความค้นหาที่ *บังเอิญ* ขึ้นต้นด้วย `place_id:` — จดไว้ว่ารู้แล้ว", () => {
    // ⚠️ ชื่อร้านที่ขึ้นต้นด้วย `place_id:` จะถูกอ่านเป็น place id
    //    **วันนี้ยังไม่กัด** เพราะไม่มีร้านชื่อแบบนี้ และ Google จะคืน "ไม่พบ" ให้เอง
    // 🎯 เขียนเคสไว้เพื่อ **ตรึงพฤติกรรม ไม่ใช่รับรองว่ามันถูก** — ถ้าวันไหนต้องแก้
    //    จะได้เห็นทันทีว่ากำลังเปลี่ยนอะไร ไม่ใช่ค้นพบว่ามีคนพึ่งพฤติกรรมนี้อยู่
    expect(parsePlaceIdKey("place_id:")).toBe("");
    expect(PLACE_ID_PREFIX).toBe("place_id:");
  });
});
