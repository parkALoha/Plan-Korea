import { describe, expect, it } from "vitest";
import { estimateDelayMinutes, shiftTime } from "@/lib/liveDelay";
import type { ScheduledStop } from "@/lib/schedule";
import type { TripStop } from "@/lib/supabase";

function stop(id: string, visitedAt: string | null): TripStop {
  return {
    id,
    plan_id: "p",
    day_id: "d1",
    place_id: id,
    order_index: 0,
    dwell_minutes: null,
    travel_mode: null,
    note: null,
    added_by: null,
    updated_at: "",
    visited_at: visitedAt,
  };
}

function sched(id: string, arrivalMinutes: number): ScheduledStop {
  return {
    id,
    placeId: id,
    dwellMinutes: null,
    travelMode: null,
    place: undefined,
    resolvedDwellMinutes: 60,
    arrival: "00:00",
    departure: "01:00",
    arrivalMinutes,
    departureMinutes: arrivalMinutes + 60,
    travelMinutesFromPrev: null,
  };
}

describe("estimateDelayMinutes", () => {
  it("ยังไม่ติ๊กจุดไหนเลย — เทียบเวลาปัจจุบันกับจุดแรก ไม่ให้ติดลบ", () => {
    const dayStops = [stop("s1", null)];
    const schedule = [sched("s1", 9 * 60)];
    const now = new Date(2026, 9, 12, 9, 30); // 09:30 แผนวางไว้ 09:00 → ช้า 30 นาที
    expect(estimateDelayMinutes(dayStops, schedule, now)).toBe(30);
  });

  it("ยังไม่ถึงเวลาจุดแรก — ไม่ติดลบ (clamp เป็น 0)", () => {
    const dayStops = [stop("s1", null)];
    const schedule = [sched("s1", 9 * 60)];
    const now = new Date(2026, 9, 12, 8, 0);
    expect(estimateDelayMinutes(dayStops, schedule, now)).toBe(0);
  });

  it("ติ๊กจุดแรกแล้ว — เทียบเวลาจริงที่ติ๊กกับแผน", () => {
    const dayStops = [stop("s1", "2026-10-12T02:15:00.000Z")]; // UTC 02:15 = ตัวอย่าง local time ตามเครื่อง
    const schedule = [sched("s1", 9 * 60)];
    const visitedLocal = new Date(dayStops[0].visited_at!);
    const expectedActualMinutes = visitedLocal.getHours() * 60 + visitedLocal.getMinutes();
    const now = new Date(2026, 9, 12, 12, 0);
    expect(estimateDelayMinutes(dayStops, schedule, now)).toBe(expectedActualMinutes - 9 * 60);
  });

  it("ติ๊กข้ามลำดับ — ใช้จุดล่าสุดที่ติ๊ก ไม่ใช่จุดแรก", () => {
    const dayStops = [stop("s1", null), stop("s2", "2026-10-12T03:00:00.000Z")];
    const schedule = [sched("s1", 9 * 60), sched("s2", 10 * 60)];
    const visitedLocal = new Date(dayStops[1].visited_at!);
    const expectedActualMinutes = visitedLocal.getHours() * 60 + visitedLocal.getMinutes();
    const now = new Date(2026, 9, 12, 12, 0);
    expect(estimateDelayMinutes(dayStops, schedule, now)).toBe(expectedActualMinutes - 10 * 60);
  });

  it("ไม่มีจุดแวะเลยคืน 0", () => {
    expect(estimateDelayMinutes([], [], new Date())).toBe(0);
  });
});

describe("shiftTime", () => {
  it("delta เป็น 0 คืนค่าเดิมตรงๆ ไม่ยุ่งกับ parse", () => {
    expect(shiftTime("09:00", 0)).toBe("09:00");
  });

  it("เลื่อนไปข้ามเที่ยงคืนได้", () => {
    expect(shiftTime("23:30", 90)).toBe("01:00");
  });

  it("parse ไม่ได้ (สตริงพัง) คืนค่าเดิมแทนที่จะได้ NaN:NaN", () => {
    expect(shiftTime("", 30)).toBe("");
  });
});
