import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyLegacyDayPlan } from "@/lib/engine/legacyDayPlan";

/**
 * ด่านของหน้าที่เรนเดอร์วันจาก `data/itinerary.ts` ล้วน (`/today` · `/summary`)
 * เจ้าของ: P3-FE/Perf · 28 ส.ค. 2026
 *
 * ## 🔴 ประวัติของเกณฑ์นี้ — **ถอนสองครั้ง ทั้งสองครั้งเพราะ *วัด* ไม่ใช่เพราะคิดใหม่**
 * ```
 * ① matched === 0                  → ถอน · ทริปญี่ปุ่น 4 วันทับช่วง ITINERARY → matched = 4 ไม่ใช่ 0
 * ② ตรงทั้งชุด (matched===rows===11) → ถอน · P1 เปิดฐานเจอทริป *ของผู้ใช้จริง* 11 วันตรง 11–21 ต.ค. เป๊ะ
 * ③ ปฏิเสธทุกทริปจนกว่า B6           → ปัจจุบัน (P1 ตัดสิน 28 ส.ค. 2026)
 * ```
 * 🎯 **① กับ ② พังด้วยรากเดียวกัน: `buildDayBridge` จับคู่ด้วยวันที่ปฏิทิน ไม่ผูกกับ `tripId` เลย**
 * → **ไม่มีเกณฑ์จากรูปข้อมูลอันไหนแยก *สำเนาที่เหมือนต้นฉบับ* ออกจาก *ต้นฉบับ* ได้**
 * · และช่วงวันที่ทำให้เกิดคือ**ช่วงของทริปจริง** — ทริปที่วางแผนช่วงเดียวกันคือกรณีที่ **น่าจะเกิดที่สุด**
 *   ไม่ใช่เคสสุดโต่ง · ทั้งผมและ P1 พูดข้อนี้กันเองตอนทริปญี่ปุ่น **แล้วก็ยังประเมินต่ำอยู่ดีทั้งคู่**
 *
 * ⚠️ เหตุผลเต็ม · เงื่อนไขที่จะถอนการปฏิเสธ (**`B6` เท่านั้น ไม่ใช่ "เกณฑ์ที่ฉลาดขึ้น"**) · และข้อห้าม
 * merge เข้า `main` ก่อน `B6` — อยู่ที่ `lib/engine/legacyDayPlan.ts` · ที่นี่ตรึงพฤติกรรมอย่างเดียว
 */

describe("classifyLegacyDayPlan — ปฏิเสธทุกทริปจนกว่า B6", () => {
  it("🔴 อ่านไม่ได้ → `unreadable` — แยกจาก `unsupported` เพราะผู้ใช้ทำคนละอย่าง", () => {
    // อ่านไม่ได้ = ต่อเน็ตแล้วลองใหม่ได้เอง · ไม่รองรับ = รอระบบ · ยุบรวมเมื่อไหร่ก็บอกผิดคนเมื่อนั้น
    expect(classifyLegacyDayPlan(null)).toBe("unreadable");
  });

  it("ไม่มีวันเลย → `unsupported`", () => {
    expect(classifyLegacyDayPlan([])).toBe("unsupported");
  });

  it("มีวันแต่ไม่ตรงกับ ITINERARY → `unsupported`", () => {
    expect(classifyLegacyDayPlan(new Array(4).fill({}))).toBe("unsupported");
  });

  /**
   * 🔴 **เคสที่เกณฑ์ ② ปล่อยผ่าน และเป็นบั๊กที่ *ผู้ใช้จริง* เจออยู่**
   * ทริป `9d26d2ba…` (เจ้าของเป็นบัญชี `@gmail.com` ไม่ใช่ fixture) มี 11 วัน `2026-10-11..21`
   * ตรงกับ `ITINERARY` ครบทั้ง 11 → เกณฑ์เดิมตอบ `legacy` → **หน้าแสดงเที่ยวบิน/ที่พักที่เขาไม่ได้ใส่**
   * **นี่คือเคสที่ทั้งไฟล์นี้มีไว้กัน** — ถ้ามันตอบอย่างอื่นเมื่อไหร่ แปลว่าบั๊กกลับมาแล้ว
   */
  it("🔴 ทริปที่วันตรงกับ ITINERARY ครบ 11 วัน → ยังต้อง `unsupported` (เคสของผู้ใช้จริง)", () => {
    expect(classifyLegacyDayPlan(new Array(11).fill({}))).toBe("unsupported");
  });
});

/**
 * 🔴 **บังคับที่ระดับ *ชนิดข้อมูล* ไม่ใช่แค่ที่ค่าที่คืน**
 * การถอด `"legacy"` ออกจาก type คือสิ่งที่ทำให้ "เผลอเปิดทางกลับ" เป็นไปไม่ได้ — ต่างจากการแค่เลิกคืนค่านั้น
 * ซึ่งใครเพิ่มกิ่งใหม่ก็เขียนกลับมาได้โดยไม่มีอะไรฟ้อง
 */
describe("สัญญาของ type", () => {
  it("`legacy` ต้องไม่มีอยู่ใน LegacyDayPlanState อีก", () => {
    const src = readFileSync(join(process.cwd(), "lib/engine/legacyDayPlan.ts"), "utf8");
    const typeLine = src.split("\n").find((l) => l.startsWith("export type LegacyDayPlanState"));
    expect(typeLine, "หา type declaration ไม่เจอ — ไฟล์เปลี่ยนรูป ด่านนี้อาจไม่ได้ตรวจอะไรแล้ว").toBeTruthy();
    expect(typeLine).not.toContain('"legacy"');
    // 🔴 เคสควบคุมฝั่งบวก: ถ้าการอ่าน/หาบรรทัดพัง อันนี้จะแดง แทนที่จะให้ `not.toContain` เขียวลอย ๆ
    expect(typeLine).toContain('"unsupported"');
  });
});

/**
 * 🔴 หน้าที่เรนเดอร์จาก `ITINERARY` **ห้ามกลับไปใช้ `useTripDaysGate`**
 * มันเป็นด่านที่ถูกสำหรับ `TripPlanScreen` (ประกอบกับ `B6` ซึ่งรู้จักทริปแพลตฟอร์มจริง)
 * แต่ **ตอบผิดสำหรับสองหน้านี้** — และการ "รวมให้เหลือด่านเดียว" ดูเหมือนการทำความสะอาดที่สมเหตุสมผลมาก
 */
describe("หน้าที่เรนเดอร์จาก ITINERARY ต้องใช้ด่านที่ถามคำถามถูก", () => {
  for (const page of ["app/today/page.tsx", "app/summary/page.tsx"]) {
    it(`${page} ใช้ useLegacyDayPlanGate ไม่ใช่ useTripDaysGate`, () => {
      const src = readFileSync(join(process.cwd(), page), "utf8");
      expect(src).toContain("useLegacyDayPlanGate(");
      expect(src).not.toContain("useTripDaysGate(");
    });
  }
});
