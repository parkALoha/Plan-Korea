import { describe, expect, it } from "vitest";
import {
  computeSchedule,
  minutesToTime,
  timeToMinutes,
  type ScheduleStopInput,
} from "@/lib/schedule";
import type { Place } from "@/data/places";

function place(id: string, lat: number, lng: number): Place {
  return {
    id,
    nameTh: id,
    nameEn: id,
    city: "busan",
    category: "culture",
    descriptionTh: "",
    lat,
    lng,
    mapsQuery: id,
    youtubeQuery: id,
  };
}

describe("timeToMinutes", () => {
  it("แปลงเวลาปกติ", () => {
    expect(timeToMinutes("07:30")).toBe(450);
    expect(timeToMinutes("00:00")).toBe(0);
  });

  it("คืน null เมื่อ parse ไม่ได้ (ค่าว่างจากการล้างช่อง input) — บั๊ก 7.3", () => {
    expect(timeToMinutes("")).toBeNull();
  });

  it("คืน null เมื่อเป็นขยะที่ไม่มี ':'", () => {
    expect(timeToMinutes("7")).toBeNull();
  });
});

describe("minutesToTime", () => {
  it("ห่อรอบเที่ยงคืนไปข้างหน้า", () => {
    expect(minutesToTime(timeToMinutes("23:00")! + 120)).toBe("01:00");
  });

  it("ห่อรอบเที่ยงคืนไปข้างหลัง (ค่าติดลบ)", () => {
    expect(minutesToTime(-30)).toBe("23:30");
  });
});

describe("computeSchedule", () => {
  it("ไม่มีจุดแวะเลย คืนลิสต์ว่างและไม่มี anchor", () => {
    const result = computeSchedule("07:00", [], new Map(), () => null);
    expect(result.stops).toEqual([]);
    expect(result.arriveBackAt).toBeNull();
  });

  it("ไม่มี anchor เริ่ม/จบ — เริ่มนับจาก startTime ตรงๆ", () => {
    const p1 = place("p1", 35.1, 129.0);
    const stops: ScheduleStopInput[] = [
      { id: "s1", placeId: "p1", dwellMinutes: 60, travelMode: null },
    ];
    const placesById = new Map([["p1", p1]]);
    const result = computeSchedule("09:00", stops, placesById, () => 0);
    expect(result.stops[0].arrival).toBe("09:00");
    expect(result.stops[0].departure).toBe("10:00");
    expect(result.departFrom).toBeNull();
  });

  it("travelMinutesBetween คืน null ถือว่าเดินทาง 0 นาที (รอข้อมูลจริง)", () => {
    const p1 = place("p1", 35.1, 129.0);
    const p2 = place("p2", 35.2, 129.1);
    const stops: ScheduleStopInput[] = [
      { id: "s1", placeId: "p1", dwellMinutes: 30, travelMode: null },
      { id: "s2", placeId: "p2", dwellMinutes: 30, travelMode: null },
    ];
    const placesById = new Map([
      ["p1", p1],
      ["p2", p2],
    ]);
    const result = computeSchedule("09:00", stops, placesById, () => null);
    expect(result.stops[1].arrival).toBe("09:30");
    expect(result.stops[1].travelMinutesFromPrev).toBeNull();
  });

  it("คืนนาทีสะสมดิบ (ไม่ wrap 24 ชม.) ให้เทียบเดดไลน์ข้ามเที่ยงคืนได้ — บั๊ก 7.4", () => {
    const p1 = place("p1", 35.1, 129.0);
    const stops: ScheduleStopInput[] = [
      { id: "s1", placeId: "p1", dwellMinutes: 60, travelMode: null },
    ];
    const placesById = new Map([["p1", p1]]);
    // เริ่ม 23:30 + dwell 60 นาที = จบ 00:30 ของวันถัดไป
    const result = computeSchedule("23:30", stops, placesById, () => 0);
    expect(result.stops[0].departure).toBe("00:30");
    expect(result.endOfDayMinutes).toBe(timeToMinutes("23:30")! + 60);
  });
});
