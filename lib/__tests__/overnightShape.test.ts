import { describe, expect, it } from "vitest";
import { buildDayBridge } from "../engine/dayBridge";
import { toOvernightOverrides, type DayOvernightRow } from "../engine/overnightShape";

/** `E3` · `D80` — เจ้าของ: P1-Lead · 26 ส.ค. 2026 */
const bridge = buildDayBridge(
  [{ id: "d0", date: "2026-10-11" }, { id: "d1", date: "2026-10-12" }],
  [{ id: "u0", date: "2026-10-11" }, { id: "u1", date: "2026-10-12" }]
);
const row = (o: Partial<DayOvernightRow>): DayOvernightRow => ({
  id: "u0", date: "2026-10-11", overnight_kind: null, overnight_city_id: null,
  catalog_cities: null, ...o,
});

describe("toOvernightOverrides", () => {
  it("เก็บเฉพาะวันที่ตั้งใจนอนเมืองหนึ่ง แล้วคีย์ด้วย id ของไฟล์เดิม", () => {
    const out = toOvernightOverrides(
      [row({ id: "u1", overnight_kind: "city", overnight_city_id: "c", catalog_cities: { legacy_slug: "busan" } })],
      bridge
    );
    expect(out).toEqual({ d1: "busan" });
  });

  it("🔴 `'none'` (ตั้งใจไม่นอนโรงแรม) ไม่เข้า Record — **และ `null` ก็ไม่เข้าเหมือนกัน**", () => {
    // D80 แยกสามสถานะที่ UI เดิมยุบเป็นอันเดียว · Record ที่ไม่มีคีย์ครอบทั้งสองอย่าง
    // นั่นคือข้อจำกัดของรูปเดิม ไม่ใช่บั๊กของตัวแปลง — E5 ค่อยเปิดให้เห็นครบ
    const out = toOvernightOverrides(
      [row({ overnight_kind: "none" }), row({ id: "u1", overnight_kind: null })],
      bridge
    );
    expect(out).toEqual({});
  });

  it("🔴 วันที่ไม่มีในไฟล์เดิม → ข้าม **ไม่ใช่ใส่ด้วย uuid**", () => {
    // ใส่ uuid = UI ได้คีย์ที่มันหาไม่เจอ แล้วเงียบ
    const out = toOvernightOverrides(
      [row({ id: "u9", overnight_kind: "city", catalog_cities: { legacy_slug: "seoul" } })],
      bridge
    );
    expect(out).toEqual({});
  });

  it("🔴 เมืองที่ไม่มี `legacy_slug` → ข้าม ไม่ใช่ใส่ uuid ให้ UI งง", () => {
    const out = toOvernightOverrides(
      [row({ overnight_kind: "city", overnight_city_id: "c", catalog_cities: { legacy_slug: null } })],
      bridge
    );
    expect(out).toEqual({});
  });

  it("สะพานว่าง (E7 ยังไม่รัน) → Record ว่าง และไม่โยน", () => {
    const empty = buildDayBridge([{ id: "d0", date: "2026-10-11" }], []);
    expect(toOvernightOverrides([row({ overnight_kind: "city", catalog_cities: { legacy_slug: "busan" } })], empty))
      .toEqual({});
  });
});
