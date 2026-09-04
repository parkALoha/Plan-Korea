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

/* ─────────────────────────────────────────────────────────────────────────────
   เวลาถึง/เวลาสิ้นสุดที่ผู้ใช้กรอกเอง (ผู้ใช้สั่ง 4 ก.ย. 2026)

   🔴 ชุดนี้เขียนพร้อมทิศแดงที่ยิงจริง ไม่ใช่เขียนแล้วดูว่าเขียว — บันทึกผลมัลแตนต์ไว้ที่
      ท้ายไฟล์ เพราะ "เทสต์ผ่าน" ตอบได้แค่ว่าโค้ดวันนี้ทำแบบนี้ ไม่ได้ตอบว่าเทสต์จับอะไรได้
   ───────────────────────────────────────────────────────────────────────────── */
describe("computeSchedule — หมุดเวลาที่ผู้ใช้กรอกเอง", () => {
  const places = new Map<string, Place>([
    ["a", place("a", 35.1, 129.0)],
    ["b", place("b", 35.2, 129.1)],
  ]);
  /** เดินทางคงที่ 30 นาทีทุกขา — ทำให้ตัวเลขที่คาดหวังคำนวณด้วยมือได้ */
  const travel30 = () => 30;
  function stop(id: string, extra: Partial<ScheduleStopInput> = {}): ScheduleStopInput {
    return { id, placeId: id, dwellMinutes: 60, travelMode: null, ...extra };
  }

  it("ไม่มีหมุด = พฤติกรรมเดิมทุกประการ (เคสควบคุมฝั่งลบ)", () => {
    const r = computeSchedule("08:00", [stop("a"), stop("b")], places, travel30);
    expect(r.stops.map((s) => [s.arrival, s.departure])).toEqual([
      ["08:00", "09:00"],
      ["09:30", "10:30"],
    ]);
    expect(r.stops.every((s) => !s.startIsFixed && !s.endIsFixed)).toBe(true);
    expect(r.stops.every((s) => s.timeConflictMinutes === null)).toBe(true);
  });

  it("ปักเวลาถึงช้ากว่าที่ไหลมา → ใช้เวลาที่ปัก และ **จุดถัดไปไหลต่อจากหมุด**", () => {
    const r = computeSchedule(
      "08:00",
      [stop("a"), stop("b", { fixedStartTime: "11:00" })],
      places,
      travel30
    );
    // b ไหลมาถึงได้ 09:30 แต่ปักไว้ 11:00 ⇒ รอถึง 11:00 แล้วอยู่ 60 นาที
    expect(r.stops[1].arrival).toBe("11:00");
    expect(r.stops[1].departure).toBe("12:00");
    expect(r.stops[1].startIsFixed).toBe(true);
    // 🔴 ข้อสำคัญที่สุดของทั้งชุด: หมุดไม่ได้ทำให้ตารางแตกเป็นสองระบบ
    expect(r.stops[1].timeConflictMinutes).toBeNull();
  });

  it("ปักเวลาถึงเร็วกว่าที่เดินทางไปถึงได้ → ยังใช้เวลาที่ปัก แต่ **จดว่าไปไม่ทันกี่นาที**", () => {
    const r = computeSchedule(
      "08:00",
      [stop("a"), stop("b", { fixedStartTime: "09:00" })],
      places,
      travel30
    );
    // เร็วสุดที่ไปถึงได้คือ 09:30 (08:00 + อยู่ 60 + เดินทาง 30) แต่ปักไว้ 09:00
    expect(r.stops[1].arrival).toBe("09:00");
    expect(r.stops[1].timeConflictMinutes).toBe(30);
  });

  it("ปักเวลาสิ้นสุด → ระยะเวลาที่อยู่กลายเป็น *ผลลัพธ์* ทับ dwellMinutes ที่ตั้งไว้", () => {
    const r = computeSchedule(
      "08:00",
      [stop("a", { dwellMinutes: 60, fixedEndTime: "10:30" })],
      places,
      travel30
    );
    expect(r.stops[0].arrival).toBe("08:00");
    expect(r.stops[0].departure).toBe("10:30");
    expect(r.stops[0].resolvedDwellMinutes).toBe(150); // ไม่ใช่ 60 ที่ตั้งไว้
    expect(r.stops[0].endIsFixed).toBe(true);
  });

  it("ปักเวลาสิ้นสุดที่ *เลยเที่ยงคืน* (22:00 → 01:00) ได้ระยะเวลาบวก ไม่ใช่ติดลบ", () => {
    const r = computeSchedule(
      "22:00",
      [stop("a", { fixedEndTime: "01:00" })],
      places,
      travel30
    );
    expect(r.stops[0].arrival).toBe("22:00");
    expect(r.stops[0].departure).toBe("01:00");
    expect(r.stops[0].resolvedDwellMinutes).toBe(180);
  });

  it("ปักเวลาถึงหลังเที่ยงคืนแล้ว ไม่เด้งย้อนกลับไป 24 ชม.", () => {
    // a เริ่ม 23:00 อยู่ 60 นาที → ออก 24:00 · เดินทาง 30 → b ไหลมาถึง 00:30 ของวันถัดไป
    const r = computeSchedule(
      "23:00",
      [stop("a"), stop("b", { fixedStartTime: "01:00" })],
      places,
      travel30
    );
    expect(r.stops[1].arrival).toBe("01:00");
    // นาทีสะสมต้อง **มากกว่า 1440** = ยังเป็นวันถัดไป ไม่ได้เด้งย้อนไปตี 1 ของเมื่อวาน
    expect(r.stops[1].arrivalMinutes).toBe(1500);
    expect(r.stops[1].timeConflictMinutes).toBeNull();
  });

  it("เวลาที่ parse ไม่ได้ ('' จากการล้างช่อง) ถือว่าไม่มีหมุด — ไม่ใช่เที่ยงคืน", () => {
    const r = computeSchedule(
      "08:00",
      [stop("a", { fixedStartTime: "", fixedEndTime: "" })],
      places,
      travel30
    );
    expect(r.stops[0].arrival).toBe("08:00");
    expect(r.stops[0].departure).toBe("09:00");
    expect(r.stops[0].startIsFixed).toBe(false);
    expect(r.stops[0].endIsFixed).toBe(false);
  });
});

describe("computeSchedule — หมุดเวลา: รอบวันที่เลือกผิดได้", () => {
  const places = new Map<string, Place>([
    ["a", place("a", 35.1, 129.0)],
    ["b", place("b", 35.2, 129.1)],
  ]);
  const travel30 = () => 30;
  function stop(id: string, extra: Partial<ScheduleStopInput> = {}): ScheduleStopInput {
    return { id, placeId: id, dwellMinutes: 60, travelMode: null, ...extra };
  }

  /* 🔴 เคสนี้เพิ่มเพราะ **มัลแตนต์รอด** — ถอดตัวเลือก ±1440 ออกจาก `nearestOccurrence`
     แล้วเทสต์ 182 ใบผ่านหมด · เคสข้ามเที่ยงคืนใบแรกที่ผมเขียนเลือกฝั่งที่ `base + t`
     บังเอิญถูกอยู่แล้ว ⇒ ไม่เคยแตะโค้ดที่มันอ้างว่าทดสอบเลย
     🎯 เคสที่ *ผ่าน* กับเคสที่ *วัด* ไม่ใช่เรื่องเดียวกัน — และมันแยกไม่ออกจากผลรัน */
  it("ปักเวลาก่อนเที่ยงคืน แต่ไหลมาถึงหลังเที่ยงคืน → เป็น 'ไปไม่ทัน' ไม่ใช่ 'รออีก 23 ชม.'", () => {
    // a เริ่ม 23:00 อยู่ 60 → ออก 24:00 · เดินทาง 30 → b ไหลมาถึงนาทีที่ 1470 (00:30 วันถัดไป)
    // ปัก b ไว้ 23:30 = ตั้งใจให้ถึงก่อนเที่ยงคืน ⇒ ไปไม่ทัน 60 นาที
    const r = computeSchedule(
      "23:00",
      [stop("a"), stop("b", { fixedStartTime: "23:30" })],
      places,
      travel30
    );
    expect(r.stops[1].arrival).toBe("23:30");
    expect(r.stops[1].arrivalMinutes).toBe(1410); // รอบเดียวกับที่ตั้งใจ ไม่ใช่ 2850
    expect(r.stops[1].timeConflictMinutes).toBe(60);
  });
});
