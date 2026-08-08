import { describe, expect, it } from "vitest";
import { nextOrderIndex, orderIndexAtPosition } from "@/lib/stopOrdering";
import type { TripStop } from "@/lib/supabase";

function stop(id: string, orderIndex: number): TripStop {
  return {
    id,
    plan_id: "p",
    day_id: "d1",
    place_id: id,
    order_index: orderIndex,
    dwell_minutes: null,
    travel_mode: null,
    note: null,
    added_by: null,
    updated_at: "",
  };
}

describe("nextOrderIndex", () => {
  it("วันว่างเปล่าเริ่มที่ 0", () => {
    expect(nextOrderIndex([])).toBe(0);
  });

  it("ต่อท้ายจาก max ไม่ใช่ length — กันชนกับช่องว่าง (บั๊ก 8.1)", () => {
    // วันนี้เหลือ order_index 0,2,3 (ช่องว่างจากการลากจุดออกไปวันอื่น) — length=3 แต่ max+1=4
    const dayStops = [stop("a", 0), stop("b", 2), stop("c", 3)];
    expect(nextOrderIndex(dayStops)).toBe(4);
    // ถ้าใช้ dayStops.length ตรงๆ (บั๊กเดิม) จะได้ 3 ซึ่งชนกับ stop c ที่มี order_index=3 อยู่แล้ว
  });
});

describe("orderIndexAtPosition", () => {
  it("วันว่างเปล่าคืน 0", () => {
    expect(orderIndexAtPosition([], 0)).toBe(0);
  });

  it("แทรกที่ตำแหน่งแรกได้ order_index ของแถวแรก", () => {
    const dayStops = [stop("a", 0), stop("b", 1), stop("c", 2)];
    expect(orderIndexAtPosition(dayStops, 0)).toBe(0);
  });

  it("แทรกท้ายสุด (atIndex >= length) ได้ order_index ต่อจากแถวสุดท้าย", () => {
    const dayStops = [stop("a", 0), stop("b", 1)];
    expect(orderIndexAtPosition(dayStops, 5)).toBe(2);
  });

  it("วันมีช่องว่าง 0,2,3 แทรกตรงกลาง (atIndex=1 ในarray) ได้ order_index ของแถวที่ตำแหน่งนั้นจริงๆ — บั๊ก 8.2", () => {
    // sorted: [a(0), b(2), c(3)] — atIndex=1 ในมุมมอง array คือแถว b ซึ่งมี order_index=2 ไม่ใช่ 1
    const dayStops = [stop("a", 0), stop("b", 2), stop("c", 3)];
    expect(orderIndexAtPosition(dayStops, 1)).toBe(2);
  });

  it("วันมีช่องว่าง แทรกตำแหน่งสุดท้าย (array position เกินจำนวนแถว) ต่อจาก order_index สูงสุดจริง", () => {
    const dayStops = [stop("a", 0), stop("b", 2), stop("c", 3)];
    expect(orderIndexAtPosition(dayStops, 3)).toBe(4);
  });
});
