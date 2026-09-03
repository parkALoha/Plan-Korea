import { describe, expect, it } from "vitest";
import { warmTargets, type CatalogKeyRow } from "@/lib/engine/cacheWarmList";
import { PLACE_ID_PREFIX } from "@/lib/placeQuery";

/**
 * **`Q3` ก้าวที่ 2 — แกนเลือกคีย์ที่ต้องอุ่น** · P1 · 3 ก.ย. 2026
 *
 * ตัวเลขในเคสมาจากการวัด `engine-dev` จริง ไม่ใช่แต่งขึ้น:
 * `คลังจริง 202 · คีย์ที่แคชได้ 174 · แคชแล้ว 33 · ต้องอุ่น 141 · อยู่ในทริปจริง 61`
 */
const row = (p: Partial<CatalogKeyRow> & { id: string }): CatalogKeyRow => ({
  mapsQuery: null,
  googlePlaceId: null,
  ...p,
});

describe("warmTargets — เลือกคีย์ที่ต้องอุ่น", () => {
  it("คีย์ข้อความล้วน: คืนคีย์ที่ยังไม่มีในแคช", () => {
    const out = warmTargets({
      catalog: [row({ id: "a", mapsQuery: "Gwangalli Beach Busan" })],
      cachedKeys: [],
    });
    expect(out).toEqual([{ key: "Gwangalli Beach Busan", placeId: "a", priority: "catalog" }]);
  });

  /** 🔴 รูปที่สองของคีย์ — ตัวที่บั๊กวันนี้มองข้ามทั้งสองฝั่ง */
  it("🔴 แถวที่มี googlePlaceId ต้องได้คีย์รูป place_id: ไม่ใช่ข้อความ", () => {
    const out = warmTargets({
      catalog: [row({ id: "a", mapsQuery: "Gwangalli Beach Busan", googlePlaceId: "ChIJxyz" })],
      cachedKeys: [],
    });
    expect(out[0].key).toBe(`${PLACE_ID_PREFIX}ChIJxyz`);
  });

  it("ข้ามแถวที่มีคีย์อยู่ในแคชแล้ว", () => {
    const out = warmTargets({
      catalog: [row({ id: "a", mapsQuery: "X" }), row({ id: "b", mapsQuery: "Y" })],
      cachedKeys: ["X"],
    });
    expect(out.map((t) => t.key)).toEqual(["Y"]);
  });

  /**
   * 🔴 วัดแล้ว 28 แถวในคลังจริงไม่มีคีย์เลย — **ทั้งหมดเป็น `source=transfer`**
   * แคชไม่ได้ *และ* ผ่านประตูอ่านไม่ได้ตามนิยาม → ต้องข้าม ไม่ใช่พยายามอุ่น
   */
  it("🔴 ข้ามแถวที่ไม่มีคีย์เลย (transfer) — ไม่ใช่พยายามอุ่นแล้วล้ม", () => {
    const out = warmTargets({ catalog: [row({ id: "t" })], cachedKeys: [] });
    expect(out).toEqual([]);
  });

  it("🔴 ของที่อยู่ในทริปจริงต้องมาก่อน", () => {
    const out = warmTargets({
      catalog: [row({ id: "a", mapsQuery: "A" }), row({ id: "b", mapsQuery: "B" }), row({ id: "c", mapsQuery: "C" })],
      cachedKeys: [],
      tripReferencedIds: ["c"],
    });
    expect(out.map((t) => t.key)).toEqual(["C", "A", "B"]);
    expect(out[0].priority).toBe("trip");
    expect(out[1].priority).toBe("catalog");
  });

  it("เพดานต่อรอบ (rate limit) ตัดท้าย และตัดหลังเรียงลำดับแล้ว", () => {
    const out = warmTargets({
      catalog: [row({ id: "a", mapsQuery: "A" }), row({ id: "b", mapsQuery: "B" }), row({ id: "c", mapsQuery: "C" })],
      cachedKeys: [],
      tripReferencedIds: ["c"],
      limit: 2,
    });
    expect(out.map((t) => t.key), "ต้องตัดตัวท้าย ไม่ใช่ตัดของทริปทิ้ง").toEqual(["C", "A"]);
  });

  it("คลังสองแถวชี้คีย์เดียวกัน → อุ่นครั้งเดียว", () => {
    const out = warmTargets({
      catalog: [row({ id: "a", mapsQuery: "SAME" }), row({ id: "b", mapsQuery: "SAME" })],
      cachedKeys: [],
    });
    expect(out).toHaveLength(1);
  });

  /**
   * ⚠️ **ตัวควบคุมฝั่งลบ — ถ้าไม่มีเคสนี้ ตัวที่คืนทุกแถวเสมอจะผ่านเคสอื่นได้**
   * คลังที่แคชครบแล้ว ต้องได้ **รายการว่าง** ไม่ใช่ "อุ่นซ้ำก็ไม่เป็นไร"
   */
  it("แคชครบแล้ว → ไม่มีอะไรต้องอุ่น", () => {
    const out = warmTargets({
      catalog: [row({ id: "a", mapsQuery: "A" }), row({ id: "b", googlePlaceId: "G" })],
      cachedKeys: ["A", `${PLACE_ID_PREFIX}G`],
    });
    expect(out).toEqual([]);
  });

  it("limit=0 → ว่าง (ไม่ใช่ไม่จำกัด)", () => {
    expect(warmTargets({ catalog: [row({ id: "a", mapsQuery: "A" })], cachedKeys: [], limit: 0 })).toEqual([]);
  });
});
