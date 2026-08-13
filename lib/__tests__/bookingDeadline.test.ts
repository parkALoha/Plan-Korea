import { describe, expect, it } from "vitest";
import { bookByDate, daysUntil } from "@/lib/bookingDeadline";

/** เที่ยงคืน + เวลาที่ระบุ **ตามเครื่อง** — เทสต์ทั้งไฟล์นี้ห้ามใช้สตริงลงท้าย Z
 *  เพราะสิ่งที่กำลังทดสอบคือ "วันตามปฏิทินของคนที่ถือมือถืออยู่" ไม่ใช่วันตาม UTC */
const at = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

describe("daysUntil", () => {
  it("อยู่ในวันเดดไลน์ = 0 ไม่ว่าจะกี่โมงของวันนั้น", () => {
    // นี่คือบั๊กตัวจริง: ของเดิมใช้ `today.toISOString().slice(0,10)` = วันที่ UTC
    // ยืนอยู่กรุงเทพ (UTC+7) ตอน 06:00 ของวันที่ 17 → UTC ยังเป็นวันที่ 16 → คืน 1 แทนที่จะเป็น 0
    // ตั๋วที่ต้องจอง "วันนี้" จึงขึ้นป้าย "🟡 จองภายใน 1 วัน" ทุกเช้าแทน "🔴 ต้องจองวันนี้"
    // (ที่เกาหลี UTC+9 ผิดยาวถึง 09:00 น.) · เช็คหลายเวลาในวันเดียวกันเพื่อให้เทสต์ไม่ผูกกับ timezone ของคนรัน
    for (const [hour, minute] of [
      [0, 1],
      [6, 0],
      [12, 0],
      [23, 59],
    ]) {
      expect(daysUntil("2026-09-17", at(2026, 9, 17, hour, minute))).toBe(0);
    }
  });

  it("นับเป็นวันปฏิทิน ไม่ใช่ช่วง 24 ชม.", () => {
    // 23:59 ของวันที่ 16 ห่างจากเที่ยงคืนวันที่ 17 แค่ 1 นาที แต่ยังต้องนับเป็น "อีก 1 วัน"
    expect(daysUntil("2026-09-17", at(2026, 9, 16, 23, 59))).toBe(1);
    expect(daysUntil("2026-09-17", at(2026, 9, 18, 0, 1))).toBe(-1);
  });

  it("เลยกำหนดมาแล้วคืนค่าติดลบ", () => {
    expect(daysUntil("2026-09-17", at(2026, 9, 20))).toBe(-3);
  });

  it("ข้ามเดือนและข้ามปีคำนวณถูก", () => {
    expect(daysUntil("2026-10-01", at(2026, 9, 25))).toBe(6);
    expect(daysUntil("2027-01-01", at(2026, 12, 30))).toBe(2);
  });
});

describe("bookByDate", () => {
  it("ลบจำนวนวันที่ต้องจองล่วงหน้าออกจากวันใช้ตั๋ว", () => {
    // เคสจริง: KTX 17 ต.ค. เปิดจองล่วงหน้า 30 วัน
    expect(bookByDate("2026-10-17", 30)).toBe("2026-09-17");
    expect(bookByDate("2026-10-21", 7)).toBe("2026-10-14");
    expect(bookByDate("2026-10-01", 1)).toBe("2026-09-30");
  });

  it("ข้อมูลไม่ครบ = null ไม่ใช่เดา", () => {
    expect(bookByDate(null, 30)).toBeNull();
    expect(bookByDate("2026-10-17", null)).toBeNull();
  });

  it("ตัวเลขมหาศาลต้องไม่ทำให้โมดัลพัง", () => {
    // BookingEditModal เรียกฟังก์ชันนี้ตอน render จากค่าใน `<input type="number">`
    // ซึ่ง `min={0}` กันแค่ปุ่มลูกศร ผู้ใช้พิมพ์อะไรลงไปก็ได้ — ของเดิม 1e8 โยน RangeError
    // กลางการ render (โมดัลตั๋วพังทั้งใบ) ส่วน 1e7 คืนสตริงปีขยาย "-025353-09" ออกมาโชว์เฉยๆ
    expect(() => bookByDate("2026-10-21", 1e8)).not.toThrow();
    expect(bookByDate("2026-10-21", 1e8)).toBe(bookByDate("2026-10-21", 3650));
    expect(bookByDate("2026-10-21", 1e7)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ค่าที่ใช้ไม่ได้ = null ไม่ใช่ NaN หรือ Invalid Date", () => {
    expect(bookByDate("2026-10-21", Number.NaN)).toBeNull();
    expect(bookByDate("2026-10-21", Number.POSITIVE_INFINITY)).toBeNull();
    expect(bookByDate("ไม่ใช่วันที่", 7)).toBeNull();
  });

  it("ค่าติดลบถูกปัดขึ้นเป็น 0 — 'จองล่วงหน้า -5 วัน' ไม่มีความหมาย", () => {
    expect(bookByDate("2026-10-21", -5)).toBe("2026-10-21");
  });
});
