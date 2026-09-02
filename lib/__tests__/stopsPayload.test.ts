import { describe, expect, it } from "vitest";
import { parseStopsPayload } from "@/lib/engine/stopsPayload";

/**
 * ด่านของ **`E6-AC13`** ส่วนที่ *ไม่มีใครเห็นจนกว่ามันจะเกิด* — การเปลี่ยนรูปคำตอบของ `/stops`
 * เจ้าของ: P3-FE/Perf · 2 ก.ย. 2026 (P1 ขอให้มีเคสจริง ไม่ใช่ "เขียนโค้ดเผื่อไว้")
 *
 * 🔴 **อาเรย์ → อ็อบเจกต์ คือการเปลี่ยนที่โค้ดเก่าอ่านแล้วได้ `undefined` ไม่ใช่ error**
 * `rows.length` บนอ็อบเจกต์ = `undefined` → **จุดแวะหายทั้งวันแบบเงียบ** ซึ่งจับยากกว่าหน้าพัง
 */
describe("🔴 E6-AC13 — parseStopsPayload รับได้ทั้งรูปเก่าและรูปใหม่", () => {
  it("① รูปเก่า (อาเรย์ล้วน) → ยังอ่านแถวได้ครบ · `places` ว่าง", () => {
    const out = parseStopsPayload<{ id: string }>([{ id: "a" }, { id: "b" }]);
    expect(out).not.toBeNull();
    expect(out!.stops.map((s) => s.id)).toEqual(["a", "b"]);
    expect(out!.places).toEqual({});
  });

  it("② รูปใหม่ (`{ stops, places }`) → อ่านทั้งสองฝั่ง", () => {
    const place = { id: "busan-bay101", nameTh: "เบย์101" };
    const out = parseStopsPayload<{ id: string }>({ stops: [{ id: "a" }], places: { "busan-bay101": place } });
    expect(out!.stops).toHaveLength(1);
    expect(out!.places["busan-bay101"]).toEqual(place);
  });

  it("③ 🔴 `[]` = ทริปไม่มีจุดแวะ · `null` = อ่านไม่ออก — **ห้ามยุบรวม**", () => {
    // สองอย่างนี้ให้ผู้ใช้ทำคนละอย่าง: ไม่มีจุดแวะ = เพิ่มจุดได้เลย · อ่านไม่ออก = ต่อเน็ตแล้วลองใหม่
    expect(parseStopsPayload([])).toEqual({ stops: [], places: {} });
    expect(parseStopsPayload({ stops: [] })).toEqual({ stops: [], places: {} });
    expect(parseStopsPayload(null)).toBeNull();
    expect(parseStopsPayload(undefined)).toBeNull();
  });

  it("④ ซองที่อ่านไม่ออก → `null` ไม่ใช่ก้อนว่างที่ดูเหมือนสำเร็จ", () => {
    expect(parseStopsPayload({ error: "boom" })).toBeNull();
    expect(parseStopsPayload({ stops: "ไม่ใช่อาเรย์" })).toBeNull();
    expect(parseStopsPayload("ข้อความเปล่า")).toBeNull();
    expect(parseStopsPayload(42)).toBeNull();
  });

  it("⑤ `places` ที่รูปผิด ต้องตกเป็น `{}` ไม่ใช่ทำให้ทั้งซองอ่านไม่ออก", () => {
    // แถวจุดแวะสำคัญกว่า side-map — เสีย side-map = ชื่อไม่มา · เสียแถว = ทั้งวันหาย
    expect(parseStopsPayload({ stops: [{ id: "a" }], places: [] })!.places).toEqual({});
    expect(parseStopsPayload({ stops: [{ id: "a" }], places: null })!.places).toEqual({});
    expect(parseStopsPayload({ stops: [{ id: "a" }], places: 7 })!.places).toEqual({});
  });

  /**
   * 🔴 เคสควบคุมฝั่งบวก — ถ้า `parseStopsPayload` ถูกรื้อจนคืน `null` เสมอ เคส ③/④ จะเขียวหมด
   * โดยไม่ได้ตรวจอะไรเลย (*"ไม่มีอะไรพัง"* กับ *"ไม่ได้ตรวจอะไร"* ให้ผลเหมือนกันเป๊ะ)
   */
  it("⑥ เคสควบคุม — ตัวแปลงต้องคืนของจริงได้ ไม่ใช่ `null` เสมอ", () => {
    expect(parseStopsPayload([{ id: "x" }])).not.toBeNull();
    expect(parseStopsPayload({ stops: [{ id: "x" }] })).not.toBeNull();
  });
});
