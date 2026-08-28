import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyLegacyDayPlan } from "@/lib/engine/legacyDayPlan";
import { buildDayBridge } from "@/lib/engine/dayBridge";
import { ITINERARY } from "@/data/itinerary";

/**
 * ด่านของหน้าที่เรนเดอร์วันจาก `data/itinerary.ts` ล้วน (`/today` · `/summary`)
 * เจ้าของ: P3-FE/Perf · 28 ส.ค. 2026
 *
 * ## 🔴 บั๊กที่ไฟล์นี้ตรึงไว้ — P1 ยิงจริงบน `/trip/647ed2c2/summary`
 * ทริปญี่ปุ่น (11–14 ต.ค. โตเกียว) แสดง **แผนทริปเกาหลีทั้งฉบับ** — 11 วัน · ปูซาน/ซกโช/โซล ·
 * เลขไฟลต์ `VN610`/`VN428` — **ออนไลน์ ปกติ ไม่ต้องออฟไลน์**
 *
 * 🎯 **และหัวเรื่องด้านบนถูกต้อง** (ชื่อทริป + ช่วงวันของญี่ปุ่น) ผู้ใช้จึงไม่มีเหตุผลจะสงสัยเนื้อข้างล่าง
 * — *"ข้อมูลผิดพาไปผิดที่"* แย่กว่า *"ข้อมูลไม่ครบ"* มาก
 *
 * ## 🔴 ทำไมด่านเดิมปล่อยผ่าน — และทำไมไม่มีใครผิด
 * `useTripDaysGate` ถาม *"ทริปนี้มีวันไหม"* ซึ่งเคยเป็นตัวแทนที่ถูกของ *"หน้านี้เรนเดอร์ทริปนี้ได้ไหม"*
 * **เพราะทริปแพลตฟอร์มเคยมี 0 วัน** · `create_trip_makes_days` ทำให้มันมีวันจริง → สองคำถามแยกจากกัน
 * → ด่านตอบ `"ready"` ให้เคสที่มันมีไว้บล็อกพอดี
 * **โค้ดยังทำสิ่งที่เขียนไว้เป๊ะทุกบรรทัด — สิ่งที่เปลี่ยนคือโลกรอบมัน** จึงไม่มีเทสต์ไหนแดง
 */

describe("classifyLegacyDayPlan", () => {
  const LEGACY_DAYS = 11; // ITINERARY มี 11 วัน

  it("อ่านไม่ได้ (fetch ล้ม) → `unreadable` — **ห้าม fail-open เป็น legacy**", () => {
    // 🔴 กิ่งนี้คือทางที่ทำให้ออฟไลน์เห็นแผนเกาหลีทับทริปอื่น ถ้าตอบ "legacy"
    expect(classifyLegacyDayPlan(null, 0, LEGACY_DAYS)).toBe("unreadable");
  });

  it("ฐานตอบว่าไม่มีวัน → `no-days`", () => {
    expect(classifyLegacyDayPlan([], 0, LEGACY_DAYS)).toBe("no-days");
  });

  it("มีวันแต่ไม่ตรงกับ `ITINERARY` เลย → `foreign`", () => {
    expect(classifyLegacyDayPlan(new Array(4).fill({}), 0, LEGACY_DAYS)).toBe("foreign");
  });

  it("🔴 ตรง *บางวัน* ยังต้องเป็น `foreign` — เคสที่ `matched === 0` เดิมปล่อยผ่าน", () => {
    // ทริปญี่ปุ่น 4 วัน ตรงกับ ITINERARY ครบทั้ง 4 (เพราะช่วงวันทับกัน) แต่ ITINERARY มี 11 วัน
    // 🔴 เกณฑ์เดิม (`matched === 0`) ตอบ "legacy" ที่นี่ = บั๊กที่ P1 รายงาน **ยังอยู่ครบ**
    expect(classifyLegacyDayPlan(new Array(4).fill({}), 4, LEGACY_DAYS)).toBe("foreign");
  });

  it("🔴 ย้ายมาไม่ครบ (E7 ระหว่างทาง: 8 จาก 11) → `foreign` โดยตั้งใจ", () => {
    expect(classifyLegacyDayPlan(new Array(8).fill({}), 8, LEGACY_DAYS)).toBe("foreign");
  });

  /**
   * 🔴 **ปักลำดับของ early return** (P1 จับได้ · 28 ส.ค. 2026)
   * กิ่งสุดท้ายคือ `matched === rows.length && rows.length === legacyDayCount` — ถ้ามีใครสลับลำดับ
   * หรือเพิ่มกิ่งข้างบน **`(0, 0, 0)` จะกลายเป็น `0 === 0 && 0 === 0` → `legacy`** = fail-open
   * · ตัว hook ไม่ส่งทริปเปิลนี้แล้ว (ตั้งสถานะตรง ๆ) **แต่ฟังก์ชันนี้เป็น API สาธารณะ** — เคสสองตัว
   *   ข้างล่างจึงปักไว้ว่า *"ไม่มีแถว" ต้องชนะการเทียบเลขเสมอ* ไม่ว่าใครจะเรียกด้วยอะไร
   */
  it("🔴 `(null, 0, 0)` → `unreadable` — ห้ามตกไปที่ `0 === 0` แล้วกลายเป็น legacy", () => {
    expect(classifyLegacyDayPlan(null, 0, 0)).toBe("unreadable");
  });

  it("🔴 `([], 0, 0)` → `no-days` — ห้ามตกไปที่ `0 === 0` แล้วกลายเป็น legacy", () => {
    expect(classifyLegacyDayPlan([], 0, 0)).toBe("no-days");
  });

  it("ตรงครบทั้งชุด → `legacy` — ทริปเกาหลีต้องยังแสดงได้ตามปกติ", () => {
    // 🔴 เคสด้านบวกที่ขาดไม่ได้: ถ้าด่านนี้บล็อกทริปเกาหลีด้วย แปลว่าเราแลกบั๊กหนึ่งกับอีกบั๊กหนึ่ง
    expect(classifyLegacyDayPlan(new Array(11).fill({}), 11, LEGACY_DAYS)).toBe("legacy");
  });
});

describe("🔴 เดินของจริง — วันของทริปแพลตฟอร์ม เทียบกับ `ITINERARY` จริง", () => {
  /** วันของทริปญี่ปุ่นที่ P1 ใช้ยิงจริง (11–14 ต.ค. 2026) — ปีเดียวกับทริปเกาหลี แต่คนละช่วง */
  const japanDays = [
    { id: "u1", date: "2026-10-11" },
    { id: "u2", date: "2026-10-12" },
    { id: "u3", date: "2026-10-13" },
    { id: "u4", date: "2026-10-14" },
  ];

  it("🔴 เคสที่ P1 ยิงจริง — ทริปญี่ปุ่นต้องได้ `foreign` (เกณฑ์เดิมได้ `legacy`)", () => {
    const bridge = buildDayBridge(ITINERARY, japanDays);
    // 🔴 วัดแล้ว: ช่วง 11–14 ต.ค. อยู่ใน ITINERARY (11–21 ต.ค.) ทั้งหมด → matched = 4 ไม่ใช่ 0
    expect(bridge.matched).toBe(4);
    // → เกณฑ์เดิม `matched === 0` จะตอบ "legacy" = หน้ายังแสดงแผนเกาหลีทับทริปญี่ปุ่นเหมือนเดิม
    expect(classifyLegacyDayPlan(japanDays, bridge.matched, ITINERARY.length)).toBe("foreign");
  });

  it("ทริปที่วันไม่ทับ `ITINERARY` เลย → `foreign` แน่นอน", () => {
    const farDays = [
      { id: "u1", date: "2027-03-01" },
      { id: "u2", date: "2027-03-02" },
    ];
    const bridge = buildDayBridge(ITINERARY, farDays);
    expect(bridge.matched).toBe(0);
    expect(classifyLegacyDayPlan(farDays, bridge.matched, ITINERARY.length)).toBe("foreign");
  });

  it("ทริปเกาหลีเอง (วันจาก `ITINERARY` ตรง ๆ) → `legacy`", () => {
    const koreaDays = ITINERARY.map((d, i) => ({ id: `u${i}`, date: d.date }));
    const bridge = buildDayBridge(ITINERARY, koreaDays);
    expect(bridge.matched).toBe(ITINERARY.length);
    expect(classifyLegacyDayPlan(koreaDays, bridge.matched, ITINERARY.length)).toBe("legacy");
  });
});

/**
 * 🔴 หน้าที่เรนเดอร์วันจาก `ITINERARY` **ห้ามกลับไปใช้ `useTripDaysGate`**
 * มันเป็นด่านที่ถูกสำหรับผู้เรียกอื่น (`TripPlanScreen` ประกอบกับ `B6`) แต่**ตอบผิดสำหรับสองหน้านี้**
 * — และการ "รวมให้เหลือด่านเดียว" ดูเหมือนการทำความสะอาดที่สมเหตุสมผลมากเวลาอ่านผ่าน ๆ
 */
describe("หน้าที่เรนเดอร์จาก ITINERARY ต้องใช้ด่านที่ถามคำถามถูก", () => {
  for (const page of ["app/today/page.tsx", "app/summary/page.tsx"]) {
    it(`${page} ใช้ useLegacyDayPlanGate ไม่ใช่ useTripDaysGate`, () => {
      const src = readFileSync(join(process.cwd(), page), "utf8");
      expect(src).toContain("useLegacyDayPlanGate(");
      // อ้างถึงในคอมเมนต์ได้ (อธิบายว่าทำไมไม่ใช้) — ห้ามเป็น *การเรียก* เท่านั้น
      expect(src).not.toContain("useTripDaysGate(");
    });
  }
});
