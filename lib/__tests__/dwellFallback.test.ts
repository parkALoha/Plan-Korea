import { describe, it, expect } from "vitest";
import type { Place } from "@/data/places";
import type { TravelMode } from "@/lib/schedule";
import {
  computeSchedule,
  DEFAULT_DWELL_MINUTES,
  DWELL_MINUTES_FALLBACK,
  estimateTravelMinutes,
  estimateTravelMinutesBetween,
} from "@/lib/schedule";

/**
 * 🔴 **หมวดที่ไม่อยู่ในตาราง ต้องไม่ทำให้เวลาทั้งวันเป็น `NaN`** — เจ้าของ: P3-FE/Perf · 29 ส.ค. 2026
 *
 * ## ทำไมเคสนี้ถึงมีอยู่
 * `Category` เป็น union ในโค้ด **แต่ฐานไม่มี `CHECK` กันเลยสักตาราง** — P1 วัด `pg_constraint` จริง
 * (29 ส.ค. 2026): `catalog_places.category` · `custom_places.category` รับสตริงอะไรก็ได้ยาว ≤ 40
 * และ `hooks/useCatalogPlaces.ts` เคย `cast` มันเข้า union ตรง ๆ (`row.category as Category`)
 * 🔴 **`cast` นั้นถูกถอดออกแล้ว 2 ก.ย. 2026 (`E6-AC12`) — `Place["category"]` เป็น `string` แล้ว**
 *    เคสในไฟล์นี้ยังจำเป็นเหมือนเดิมทุกตัวอักษร: ชนิดเปิดกว้างขึ้น *ไม่ได้* แปลว่าตารางมีทุกคีย์
 * → **คีย์ที่ไม่มีใน `DEFAULT_DWELL_MINUTES` เกิดขึ้นได้จริง ไม่ใช่ความเสี่ยงเชิงทฤษฎี**
 *
 * ## 🔴 ทำไมตารางนี้ร้ายกว่าตารางหน้าตาเดียวกันใบอื่น
 * `CATEGORY_EMOJI[unknown]` → `undefined` → React เรนเดอร์ความว่าง = **ไอคอนหายหนึ่งตัว**
 * `DEFAULT_DWELL_MINUTES[unknown]` → `undefined` → `cursor += undefined` → `NaN`
 * → **เวลาถึง/ออกของจุดแวะที่เหลือ *ทั้งสาย* เป็น `NaN`** และเวลาสิ้นสุดวันด้วย
 * 🎯 **ค่าที่ถูก *ใช้* กับค่าที่ถูก *แสดง* พังคนละขนาดกัน** — และ `tsc` ช่วยได้เฉพาะแบบแรก
 * (`Partial<Record<…>>` บังคับให้มี fallback · แบบหลังเขียวสนิทเพราะ `string | undefined` เป็น React child ที่ถูก)
 *
 * ⚠️ เคสนี้ยิงผ่าน `computeSchedule` จริง **ไม่ได้เทียบตารางกับตัวเอง** — ถ้าใครถอด `?? DWELL_MINUTES_FALLBACK`
 * ออก เคสข้างล่างจะแดงด้วย `NaN` ไม่ใช่แดงด้วยตัวเลขไม่ตรง
 */

const place = (id: string, category: string): Place =>
  ({
    id,
    nameTh: id,
    nameEn: id,
    city: "seoul",
    category: category as Place["category"],
    descriptionTh: "",
    lat: 37.5,
    lng: 127,
    mapsQuery: id,
  }) as Place;

const stop = (id: string, placeId: string) => ({ id, placeId, dwellMinutes: null, travelMode: null });
const noTravel = () => 0;

describe("🔴 หมวดนอกตาราง ต้องไม่ทำให้ตารางเวลาเป็น NaN", () => {
  it("หมวดที่รู้จัก — ใช้ค่าจากตาราง (เคสควบคุมฝั่งบวก: ตัวคำนวณทำงานจริง)", () => {
    const p = place("p1", "cafe");
    const day = computeSchedule("09:00", [stop("s1", "p1")], new Map([["p1", p]]), noTravel);
    expect(day.stops[0].resolvedDwellMinutes).toBe(DEFAULT_DWELL_MINUTES.cafe);
    expect(day.stops[0].departure).toBe("09:50");
  });

  it("🔴 หมวดที่ฐานส่งมาแต่ไม่มีในตาราง — ต้องได้ fallback ไม่ใช่ NaN", () => {
    const p = place("p2", "temple-not-in-union");
    const day = computeSchedule("09:00", [stop("s1", "p2")], new Map([["p2", p]]), noTravel);
    expect(day.stops[0].resolvedDwellMinutes).toBe(DWELL_MINUTES_FALLBACK);
    expect(Number.isNaN(day.stops[0].arrivalMinutes)).toBe(false);
    expect(Number.isNaN(day.stops[0].departureMinutes)).toBe(false);
  });

  it("🔴 และมันต้องไม่ลาม — จุดแวะถัดไปหลังหมวดที่ไม่รู้จัก ต้องยังมีเวลาจริง", () => {
    // นี่คือส่วนที่ทำให้ตารางนี้ร้ายกว่าตารางแบบแสดงผล: `cursor` เป็นตัวสะสม
    // `NaN` หนึ่งครั้งทำให้ทุกจุดหลังจากนั้นเป็น `NaN` ตามทั้งสาย
    const places = new Map([
      ["p2", place("p2", "temple-not-in-union")],
      ["p3", place("p3", "cafe")],
    ]);
    const day = computeSchedule("09:00", [stop("s1", "p2"), stop("s2", "p3")], places, noTravel);
    expect(day.stops.map((s) => Number.isNaN(s.arrivalMinutes))).toEqual([false, false]);
    expect(Number.isNaN(day.endOfDayMinutes)).toBe(false);
    expect(day.stops[1].arrival).toBe("10:00");
  });
});

/**
 * 🔴 **โหมดเดินทางที่ไม่อยู่ในตาราง ต้องไม่ทำให้เวลาเดินทางเป็น `NaN`** — P3 · 29 ส.ค. 2026
 *
 * 🎯 **รูปเดียวกับ `DEFAULT_DWELL_MINUTES` ข้างบนเป๊ะ และนั่นคือเหตุผลที่อยู่ไฟล์เดียวกัน:**
 * ***fallback มีอยู่สำหรับ "ยังไม่มีค่า" แต่ไม่ครอบ "มีค่าที่ไม่รู้จัก"***
 * · `DEFAULT_KMH = 25` ครอบ `mode === null` · `DWELL_MINUTES_FALLBACK = 60` ครอบ *ไม่มี `place`*
 * · **ทั้งคู่ไม่ครอบค่าที่ฐานส่งมาแล้วไม่มีในตาราง** — และฐานไม่มี `CHECK` กันสักตาราง (P1 วัด 29 ส.ค.)
 * 🔴 สองใบในวันเดียว → **นี่เป็นรูปที่ต้องไล่หาต่อ ไม่ใช่บั๊กสองตัวที่บังเอิญคล้ายกัน**
 */
describe("🔴 โหมดเดินทางนอกตาราง ต้องไม่ทำให้เวลาเป็น NaN", () => {
  // 🔴 `as TravelMode` ตรง ๆ — เลียนแบบสิ่งที่โค้ดจริงทำกับค่าจากฐาน (`stop.travel_mode as TravelMode`)
  //    ห้ามใช้ `Parameters<typeof …>[1]` เพราะมันกว้างเป็น `TravelMode | null | undefined` (พารามิเตอร์มีค่าเริ่มต้น)
  //    แล้วไปชนกับ `travelMode: TravelMode | null` ของ `ScheduleStopInput`
  const unknownMode = "ferry-not-in-union" as TravelMode;

  it("โหมดที่รู้จัก — เคสควบคุมฝั่งบวก: ตัวคำนวณทำงานจริงและให้คนละค่ากันตามโหมด", () => {
    const walk = estimateTravelMinutes(10, "walk");
    const transit = estimateTravelMinutes(10, "transit");
    expect(Number.isFinite(walk)).toBe(true);
    expect(walk).not.toBe(transit); // ถ้าเท่ากัน แปลว่าตารางไม่ได้ถูกอ่านจริง
  });

  it("🔴 โหมดที่ฐานส่งมาแต่ไม่มีในตาราง — ต้องได้ค่าเริ่มต้น ไม่ใช่ NaN", () => {
    const minutes = estimateTravelMinutes(10, unknownMode);
    expect(Number.isNaN(minutes)).toBe(false);
    expect(minutes).toBe(estimateTravelMinutes(10, null)); // ตกไปที่ DEFAULT_KMH เส้นเดียวกับ "ยังไม่เลือก"
  });

  it("🔴 และมันต้องไม่ลาม — ทั้งวันหลังคู่จุดที่โหมดแปลก ต้องยังมีเวลาจริง", () => {
    // `cursor` สะสมเวลาเดินทาง → `NaN` หนึ่งครั้งทำให้ทุกจุดหลังจากนั้นเป็น `NaN` ตามทั้งสาย
    const places = new Map([
      ["a", place("a", "cafe")],
      ["b", place("b", "cafe")],
    ]);
    places.get("b")!.lat = 37.6;
    const day = computeSchedule(
      "09:00",
      [
        { id: "s1", placeId: "a", dwellMinutes: 30, travelMode: null },
        { id: "s2", placeId: "b", dwellMinutes: 30, travelMode: unknownMode },
      ],
      places,
      estimateTravelMinutesBetween,
    );
    expect(day.stops.map((s) => Number.isNaN(s.arrivalMinutes))).toEqual([false, false]);
    expect(Number.isNaN(day.endOfDayMinutes)).toBe(false);
  });
});
