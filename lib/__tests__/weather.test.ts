import { describe, expect, it } from "vitest";
import { isWetDay, weatherLabel, type DayWeather } from "@/lib/weather";

/**
 * `lib/weather.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * ใช้ตัดสินว่าวันไหน *"ฝนแรงพอที่จะทำให้แผนกลางแจ้งพัง"*
 * — คอมเมนต์ในไฟล์ระบุเองว่า **ซอรัคซาน `d5` คือวันที่เจ็บสุดถ้าเจอ** (16 ต.ค. 2026)
 */
const day = (o: Partial<DayWeather> = {}): DayWeather =>
  ({ date: "2026-10-16", code: 0, tempMax: 18, tempMin: 8, rainChance: 10, ...o });

describe("weatherLabel", () => {
  it("ไม่มีข้อมูล → บอกว่าไม่มี ไม่ใช่เดาว่าแดดดี", () => {
    expect(weatherLabel(null)).toEqual({ icon: "❔", text: "ไม่มีข้อมูล" });
  });

  it("ขอบของทุกช่วงตรงตามที่ตั้งใจ", () => {
    // ⚠️ ฟังก์ชันนี้เป็น `if` ไล่ลงมา — **ขอบเป็นที่เดียวที่มันพลาดได้**
    const boundaries: [number, string][] = [
      [0, "แดดจัด"], [1, "แดดสลับเมฆ"], [2, "แดดสลับเมฆ"], [3, "เมฆมาก"],
      [4, "หมอก"], [48, "หมอก"], [51, "ฝนละออง"], [57, "ฝนละออง"],
      [61, "ฝน"], [67, "ฝน"], [71, "หิมะ"], [77, "หิมะ"],
      [80, "ฝนซู่"], [82, "ฝนซู่"], [85, "หิมะซู่"], [86, "หิมะซู่"],
      [95, "พายุฝนฟ้าคะนอง"], [99, "พายุฝนฟ้าคะนอง"],
    ];
    for (const [code, text] of boundaries) expect(weatherLabel(code).text, `code ${code}`).toBe(text);
  });

  it("ทุกรหัสได้ไอคอนที่ไม่ว่าง", () => {
    for (let c = 0; c <= 99; c++) expect(weatherLabel(c).icon.length, `code ${c}`).toBeGreaterThan(0);
  });
});

describe("isWetDay — วันที่แผนกลางแจ้งพัง", () => {
  it("โอกาสฝน ≥ 60% = เปียก แม้รหัสจะบอกว่าแดดดี", () => {
    expect(isWetDay(day({ rainChance: 60, code: 0 }))).toBe(true);
    expect(isWetDay(day({ rainChance: 59, code: 0 }))).toBe(false);
  });

  it("รหัสฝน/หิมะ/พายุ = เปียก แม้โอกาสฝนจะต่ำ", () => {
    expect(isWetDay(day({ code: 61, rainChance: 0 }))).toBe(true);
    expect(isWetDay(day({ code: 99, rainChance: 0 }))).toBe(true);
  });

  it("ฝนละออง (51–57) **ไม่นับ** — ตั้งใจ ไม่ใช่ลืม", () => {
    // ละอองไม่ทำให้แผนกลางแจ้งพัง · ถ้านับ ป้ายเตือนจะขึ้นบ่อยจนไม่มีใครอ่าน
    expect(isWetDay(day({ code: 57, rainChance: 0 }))).toBe(false);
  });

  it("ไม่มีข้อมูลเลย → ไม่เปียก (ไม่เตือนมั่ว)", () => {
    expect(isWetDay(day({ code: null, rainChance: null }))).toBe(false);
  });

  it("🔴 สอดคล้องกัน: ทุกรหัสที่ป้ายบอกว่าฝน/หิมะ/พายุ ต้องเป็นวันเปียก", () => {
    // 🎯 เคสนี้จับกรณีที่มีคนแก้ฟังก์ชันหนึ่งแล้วลืมอีกฟังก์ชัน —
    //    ป้ายบอก "ฝน" แต่ระบบไม่ถือว่าเปียก **คือคำแนะนำที่ขัดกันเองบนหน้าจอเดียว**
    const mismatch: number[] = [];
    for (let c = 58; c <= 99; c++) {
      const t = weatherLabel(c).text;
      const saysWet = ["ฝน", "หิมะ", "พายุ"].some((k) => t.startsWith(k));
      if (saysWet !== isWetDay(day({ code: c, rainChance: 0 }))) mismatch.push(c);
    }
    expect(mismatch).toEqual([]);
  });
});
