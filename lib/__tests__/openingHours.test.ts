import { describe, expect, it } from "vitest";
import { isOpenDuring, minutesUntilClose, weekdayHoursLabel } from "@/lib/openingHours";
import type { GoogleOpeningHours } from "@/lib/googlePlaces";

// dateISO ตัวอย่าง: "2026-10-12" คือวันจันทร์ (weekday = 1)
const MONDAY = "2026-10-12";

describe("isOpenDuring", () => {
  it("ไม่มีข้อมูล period คืน null", () => {
    expect(isOpenDuring(null, MONDAY, 600, 660)).toBeNull();
    expect(isOpenDuring({ periods: [] }, MONDAY, 600, 660)).toBeNull();
  });

  it("เปิด 24 ชม. ทุกวัน (ไม่มี period ไหนมี close) คืน true เสมอ", () => {
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 1, hour: 0, minute: 0 } }],
    };
    expect(isOpenDuring(hours, MONDAY, 0, 2000)).toBe(true);
  });

  it("ปิดทั้งวัน (มี period แต่ไม่มีวันไหนตรง)", () => {
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } }],
    };
    expect(isOpenDuring(hours, MONDAY, 600, 660)).toBe(false);
  });

  it("อยู่ในช่วงเปิดปกติ (จันทร์ 9:00-18:00)", () => {
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } }],
    };
    expect(isOpenDuring(hours, MONDAY, 10 * 60, 12 * 60)).toBe(true);
    expect(isOpenDuring(hours, MONDAY, 19 * 60, 20 * 60)).toBe(false);
  });

  it("ร้านเปิดคร่อมเที่ยงคืน (เสาร์ 20:00 - อาทิตย์ 02:00) เช็กฝั่งอาทิตย์เช้าได้", () => {
    // dateISO นี้เป็นอาทิตย์ (weekday=0) เช็กว่าเที่ยงคืนที่แล้ว(เสาร์ 20:00) ยังนับว่าเปิดถึงตี 2 วันนี้
    const SUNDAY = "2026-10-11";
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 6, hour: 20, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }],
    };
    // ตี 1 ของวันอาทิตย์ = 60 นาที (นาทีดิบตั้งแต่เที่ยงคืนอาทิตย์)
    expect(isOpenDuring(hours, SUNDAY, 60, 90)).toBe(true);
    // บ่าย 3 อาทิตย์ ปิดแล้ว (ร้านเปิดรอบถัดไปคือคืนอาทิตย์)
    expect(isOpenDuring(hours, SUNDAY, 15 * 60, 16 * 60)).toBe(false);
  });

  it("จุดแวะคร่อมเที่ยงคืนไปวันถัดไป (นาทีดิบเกิน 1440) เช็กเทียบเวลาเปิดของวันถัดไปได้ถูก — บั๊ก 7.4", () => {
    // วันจันทร์ เปิด 09:00-22:00 ปกติ ไม่ข้ามเที่ยงคืน — จุดแวะเริ่ม 23:30 จันทร์ (1410) อยู่ 60 นาที จบ 00:30 อังคาร (1470)
    // ร้านปิดไปแล้วตั้งแต่ 22:00 จันทร์ ควรได้ false ไม่ใช่ crash หรือเงียบเป็น null
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } }],
    };
    expect(isOpenDuring(hours, MONDAY, 1410, 1470)).toBe(false);
  });

  it("จุดแวะข้ามเที่ยงคืนไปวันถัดไป แต่ร้านเปิดยาวถึงตี 2 ของวันถัดไปจริง (สอดคล้อง offset +1)", () => {
    // อังคาร (weekday=2) เปิด 20:00 จันทร์คืน (day=1) ถึงตี 2 อังคาร (day=2) — สถานการณ์เดียวกับ d0 ฮานอยที่แวะร้านดึก
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 1, hour: 20, minute: 0 }, close: { day: 2, hour: 2, minute: 0 } }],
    };
    // เข้าไปตอน 23:30 จันทร์ (1410) ออกตี 1 อังคาร (1500 = 25:00 นาทีดิบ)
    expect(isOpenDuring(hours, MONDAY, 1410, 1500)).toBe(true);
  });
});

describe("minutesUntilClose", () => {
  it("ไม่มีข้อมูล period คืน null", () => {
    expect(minutesUntilClose(null, MONDAY, 600)).toBeNull();
    expect(minutesUntilClose({ periods: [] }, MONDAY, 600)).toBeNull();
  });

  it("เปิด 24 ชม. ทุกวัน ไม่มีวันปิดให้เตือน คืน null", () => {
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 1, hour: 0, minute: 0 } }],
    };
    expect(minutesUntilClose(hours, MONDAY, 600)).toBeNull();
  });

  it("ตอนนี้ปิดอยู่แล้ว (นอกช่วงเปิด) คืน null ไม่ใช่ค่าติดลบ", () => {
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } }],
    };
    expect(minutesUntilClose(hours, MONDAY, 19 * 60)).toBeNull();
  });

  it("กำลังเปิดอยู่ คืนนาทีที่เหลือก่อนปิดถูกต้อง", () => {
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } }],
    };
    // 17:30 จันทร์ ปิด 18:00 → เหลือ 30 นาที
    expect(minutesUntilClose(hours, MONDAY, 17 * 60 + 30)).toBe(30);
  });

  it("ร้านเปิดคร่อมเที่ยงคืน (เสาร์ 20:00 - อาทิตย์ 02:00) เช็กฝั่งอาทิตย์เช้าได้ถูกต้อง", () => {
    const SUNDAY = "2026-10-11";
    const hours: GoogleOpeningHours = {
      periods: [{ open: { day: 6, hour: 20, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }],
    };
    // ตี 1:30 อาทิตย์ (90 นาที) ปิดตี 2 (120 นาที) → เหลือ 30 นาที
    expect(minutesUntilClose(hours, SUNDAY, 90)).toBe(30);
  });
});

describe("weekdayHoursLabel", () => {
  it("ไม่มีข้อมูลคืน null", () => {
    expect(weekdayHoursLabel(null, MONDAY)).toBeNull();
    expect(weekdayHoursLabel({ weekdayDescriptions: [] }, MONDAY)).toBeNull();
  });

  it("แปลง Date.getDay() (อาทิตย์=0) เป็นดัชนีจันทร์=0 ถูกต้อง", () => {
    const descriptions = ["จันทร์: A", "อังคาร: B", "พุธ: C", "พฤหัส: D", "ศุกร์: E", "เสาร์: F", "อาทิตย์: G"];
    expect(weekdayHoursLabel({ weekdayDescriptions: descriptions }, MONDAY)).toBe("จันทร์: A");
    expect(weekdayHoursLabel({ weekdayDescriptions: descriptions }, "2026-10-11")).toBe("อาทิตย์: G");
  });
});
