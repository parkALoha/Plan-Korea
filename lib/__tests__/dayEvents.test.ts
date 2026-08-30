import { describe, expect, it } from "vitest";
import { splitDayEvents, toDayEvent } from "@/lib/engine/dayEvents";
import type { EventStopRow } from "@/lib/engine/dayEvents";

/**
 * 🔴 **กฎการแบ่ง event ก่อน/หลังจุดแวะ** · เจ้าของ: P3-FE/Perf · 30 ส.ค. 2026
 *
 * บั๊กที่เคสนี้กันไม่ให้กลับมา: `E7` ยุบ `day.events[]` กับ `stops[]` เข้าตารางเดียว
 * → **ลำดับเดียว** → event ทั้ง 8 ใบของวันแรกไปกองท้ายวัน รวม "เช็คเอาต์ออกจากโรงแรม" ที่ควรอยู่ต้นวัน
 * 🎯 **ของที่หายคือ *กฎการรวมสองอาเรย์* ไม่ใช่ข้อมูล** — ข้อมูลย้ายมาครบทุกฟิลด์
 */
const ev = (i: number, bound: string | null, title = `e${i}`): EventStopRow => ({
  id: `e${i}`,
  order_index: i,
  event: {
    fixed_start_time: "05:45", title, icon: "🧳",
    event_kind: null, schedule_bound: bound, fixed_end_time: null,
    day_offset: 0, title_en: null, is_alert: false, time_is_flexible: false,
    flight_no: null, flight_from_code: null, flight_to_code: null,
    flight_from_en: null, flight_to_en: null,
    layover_baggage: null, layover_immigration: null,
    layover_leaves_airport: null, layover_terminal_change: null,
    place_ref: null,
  },
});
const stop = (i: number): EventStopRow => ({ id: `s${i}`, order_index: i });

describe("🔴 แบ่ง event ก่อน/หลังจุดแวะ", () => {
  it("แยกแถว event ออกจากจุดแวะ — จุดแวะต้องไม่มี event ปน", () => {
    const { stops, before, after } = splitDayEvents([stop(0), ev(1, null), stop(2)]);
    expect(stops.map((s) => s.id)).toEqual(["s0", "s2"]);
    expect(before.length + after.length).toBe(1);
  });

  it("🔴 ② `before` เป็น *ตัวคั่น* ไม่ใช่ป้าย — ใบที่ `null` ก่อนหน้ามัน อยู่ฝั่ง before ด้วย", () => {
    // อ่านทีละแถวแล้วตัดสิน (`bound === 'before' ? before : after`) จะได้ e0,e2 ไปฝั่ง after ซึ่งผิด
    const { before, after } = splitDayEvents([ev(0, null), ev(1, "before"), ev(2, null), ev(3, "after")]);
    expect(before.map((e) => e.title)).toEqual(["e0", "e1"]);
    expect(after.map((e) => e.title)).toEqual(["e2", "e3"]);
  });

  it("🔴 ③ ไม่มี anchor `before` เลย → ทั้งหมดไป *ก่อน* จุดแวะ · after ว่าง", () => {
    // 🎯 ตรงข้ามกับพฤติกรรมที่ผู้ใช้เห็นวันนี้ (ทุกใบไปต่อท้าย) — วันแบบนี้จะย้ายที่ยกชุด
    const { before, after } = splitDayEvents([ev(0, null), ev(1, null), ev(2, "after")]);
    expect(before.map((e) => e.title)).toEqual(["e0", "e1", "e2"]);
    expect(after).toEqual([]);
  });

  it("🔴 ① แบ่งด้วยลำดับ ไม่ใช่เวลา — เวลาที่ย้อนกลับต้องไม่เปลี่ยนการแบ่ง", () => {
    const late = ev(0, null); late.event!.fixed_start_time = "23:00";
    const early = ev(1, "before"); early.event!.fixed_start_time = "05:00";
    const { before, after } = splitDayEvents([late, early, ev(2, null)]);
    expect(before.map((e) => e.title)).toEqual(["e0", "e1"]); // เรียงตามลำดับแถว ไม่ใช่ตามนาฬิกา
    expect(after.map((e) => e.title)).toEqual(["e2"]);
  });

  it("ไม่มี event เลย → ทั้งสองฝั่งว่าง และจุดแวะครบ", () => {
    const { stops, before, after } = splitDayEvents([stop(0), stop(1)]);
    expect(stops).toHaveLength(2);
    expect(before).toEqual([]);
    expect(after).toEqual([]);
  });

  it("แปลงฟิลด์ครบ — เที่ยวบิน · ที่พัก · ธง", () => {
    const row = ev(0, "before", "ขึ้นเครื่อง");
    Object.assign(row.event!, {
      flight_no: "VN610", flight_from_code: "BKK", flight_to_code: "HAN",
      flight_from_en: "Bangkok", flight_to_en: "Hanoi",
      is_alert: true, time_is_flexible: true, day_offset: 1,
      title_en: "Board", event_kind: "flight", place_ref: "hotel",
    });
    const e = toDayEvent(row);
    expect(e.flight).toEqual({ no: "VN610", fromCode: "BKK", toCode: "HAN", fromEn: "Bangkok", toEn: "Hanoi" });
    expect(e.alert).toBe(true);
    expect(e.editable).toBe(true);
    expect(e.dayOffset).toBe(1);
    expect(e.anchor).toBe("before");
    expect(e.kind).toBe("flight");
    // 🔴 `place_ref = 'hotel'` → `"@hotel"` ซึ่งเป็นค่าพิเศษที่ `lib/eventPlace.ts` รู้จัก
    expect(e.placeId).toBe("@hotel");
  });

  it("🔴 เที่ยวบินไม่ครบชุด → ไม่สร้าง `flight` ครึ่ง ๆ", () => {
    const row = ev(0, null);
    row.event!.flight_no = "VN610"; // ไม่มีรหัสสนามบิน
    expect(toDayEvent(row).flight).toBeUndefined();
  });
});
