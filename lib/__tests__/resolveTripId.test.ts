import { describe, expect, it } from "vitest";
import { resolveTripId } from "../../hooks/useActiveTripId";

/**
 * `resolveTripId()` — ตัวตัดสิน "ทริปไหน" ตัวเดียวของทั้งแอป (`E5`, P1 ขอ)
 *
 * 🎯 ทดสอบตรงนี้ได้โดยไม่ต้อง mock `fetch`/`localStorage` เพราะฟังก์ชันนี้ **ไม่ทำ side effect เลย**
 * — รับ `trips` ที่ resolve มาแล้วเข้ามาตรง ๆ เหมือนที่ `useActiveTripId()` เรียกจริง
 */
describe("resolveTripId — ลำดับ fromRoute → cachedId → chooseSoleTrip", () => {
  const A = { id: "trip-a" };
  const B = { id: "trip-b" };

  it("fromRoute ที่ยังใช้ได้ → ใช้เลย ไม่ต้องแตะ cachedId", () => {
    const r = resolveTripId([A, B], { fromRoute: "trip-a", cachedId: "trip-b" });
    expect(r).toEqual({ state: { status: "ready", tripId: "trip-a" }, clearCache: false });
  });

  it("🔴 fromRoute เก่าไปแล้ว (ทริปถูกลบ/ถอนสิทธิ์) แต่ cachedId ยังใช้ได้ → ตกไปใช้ cachedId ไม่ใช่ chooseSoleTrip ตรง ๆ", () => {
    const r = resolveTripId([A], { fromRoute: "trip-deleted", cachedId: "trip-a" });
    expect(r.state).toEqual({ status: "ready", tripId: "trip-a" });
    // 🔴 fromRoute เก่าไปแล้วจริง — ต้องล้าง cache เดิมทิ้งด้วย ถึงจะเขียนค่าใหม่ (trip-a) ทับได้ถูกต้อง
    expect(r.clearCache).toBe(true);
  });

  it("ไม่มี fromRoute · cachedId ยังใช้ได้ → ใช้ cachedId ไม่ต้องถาม chooseSoleTrip", () => {
    const r = resolveTripId([A, B], { cachedId: "trip-b" });
    expect(r).toEqual({ state: { status: "ready", tripId: "trip-b" }, clearCache: false });
  });

  it("🔴 cachedId ใช้ไม่ได้แล้ว (ถูกถอนสิทธิ์/ทริปถูกลบ) · มีทริปเดียว → ตกไป chooseSoleTrip และสั่งล้าง cache", () => {
    const r = resolveTripId([A], { cachedId: "trip-gone" });
    expect(r.state).toEqual({ status: "ready", tripId: "trip-a" });
    expect(r.clearCache).toBe(true);
  });

  it("ไม่มี fromRoute/cachedId เลย · มีทริปเดียว → chooseSoleTrip เลือกให้ ไม่ต้องล้าง cache (ไม่มีอะไรให้ล้าง)", () => {
    const r = resolveTripId([A], {});
    expect(r).toEqual({ state: { status: "ready", tripId: "trip-a" }, clearCache: false });
  });

  it("🔴 ไม่มี fromRoute/cachedId ที่ใช้ได้ · มี 2 ทริป → ambiguous ไม่ใช่เดาให้", () => {
    const r = resolveTripId([A, B], {});
    expect(r.state).toEqual({ status: "ambiguous", tripIds: ["trip-a", "trip-b"] });
  });

  it("ไม่มีทริปเลย → none", () => {
    const r = resolveTripId([], {});
    expect(r.state).toEqual({ status: "none" });
  });

  it("🔴 fromRoute และ cachedId เก่าทั้งคู่ · มี 2 ทริปที่เหลือ → ambiguous พร้อมล้าง cache", () => {
    const r = resolveTripId([A, B], { fromRoute: "trip-dead-1", cachedId: "trip-dead-2" });
    expect(r.state).toEqual({ status: "ambiguous", tripIds: ["trip-a", "trip-b"] });
    expect(r.clearCache).toBe(true);
  });
});
