import { describe, it, expect, beforeEach } from "vitest";
import type { DayBridge } from "@/lib/engine/dayBridge";
import {
  reportDayBridgeWarningIfAny,
  reportDayBridgeDropIfAny,
  readDayBridgeIncomplete,
  subscribeDayBridgeIncomplete,
  resetDayBridgeIncompleteForTest,
} from "@/lib/engine/dayBridgeIncomplete";

/**
 * แถบ "ทริปนี้ยังแสดงข้อมูลบางส่วนไม่ได้" — `E4-AC1`
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026
 *
 * ## 🔴 ไฟล์นี้มีเพราะบั๊กที่ *ธงใบเดียว* สร้างขึ้นเอง ไม่ใช่เพราะอยากได้ coverage
 * `lib/engine/dayBridgeIncomplete.ts` เป็น 1 ใน 6 โมดูลของ `lib/` ที่ **ไม่มีเทสต์อ้างถึงเลย**
 * (วัดด้วยการไล่ `git ls-files` ทั้งรีโป ไม่ใช่เดาจากชื่อโฟลเดอร์) — และมันเป็นตัวที่ใหญ่ที่สุดในหกตัวนั้น
 *
 * ตอนอ่านเพื่อจะเขียนเทสต์ถึงเห็นว่า **ธงใบเดียวมีคนเขียนสองคน** และคนหนึ่งล้างของอีกคนได้
 * 🎯 **เคสแรกข้างล่างคือเคสนั้น — ถ้ามันเขียวกับโค้ดเดิม แปลว่าเทสต์ผิด ไม่ใช่โค้ดถูก**
 */

function bridge(over: Partial<DayBridge> = {}): DayBridge {
  return {
    toDbId: () => null,
    toLegacyId: () => null,
    unmatchedLegacy: [],
    unmatchedDb: [],
    matched: 0,
    ...over,
  };
}

/** สะพานที่ "ปกติ" ในสายตา `reportDayBridgeWarningIfAny` — ใช้เป็นตัวล้างในเคสที่ 1 */
const healthy = bridge({ matched: 5, unmatchedLegacy: [] });

beforeEach(() => {
  // 🔴 `rowsDropped` ล้างเองไม่ได้ตอนใช้งานจริง → เคสก่อนหน้าจะทิ้งมันไว้ให้เคสถัดไป
  //    ถ้าไม่ล้างตรงนี้ เคสหลัง ๆ จะเขียวเพราะธงค้าง ไม่ใช่เพราะสิ่งที่มันตรวจ
  resetDayBridgeIncompleteForTest();
});

describe("แถบสะพานวันไม่ครบ", () => {
  it("🔴 hook ที่พบว่าสะพานปกติ ต้องล้างแถบที่ hook อื่นตั้งไว้จากแถวที่หายไป *ไม่ได้*", () => {
    // ① `useStops` แถวหล่น 2 จาก 10
    expect(reportDayBridgeDropIfAny(10, 8)).toBe(true);
    expect(readDayBridgeIncomplete()).toBe(true);

    // ② `useBookings` สร้างสะพานใบเดียวกัน แล้วพบว่าปกติ (ไม่มีอะไรผิดในมุมของมัน)
    reportDayBridgeWarningIfAny(healthy, 5);

    // ③ จุดแวะ 2 จุดยัง**หายอยู่** — แถบต้องยังอยู่
    expect(readDayBridgeIncomplete()).toBe(true);
  });

  it("ธงของ `reportDayBridgeWarningIfAny` เอง ล้างได้ตามปกติ", () => {
    reportDayBridgeWarningIfAny(bridge({ matched: 3, unmatchedLegacy: ["d7"] }), 3);
    expect(readDayBridgeIncomplete()).toBe(true);

    reportDayBridgeWarningIfAny(healthy, 5);
    expect(readDayBridgeIncomplete()).toBe(false);
  });

  it("ทริปที่ไม่มีวันเลยสักวัน = แถบขึ้น (เคสที่ P2 วัดได้จริง)", () => {
    reportDayBridgeWarningIfAny(healthy, 0);
    expect(readDayBridgeIncomplete()).toBe(true);
  });

  it("`matched === 0` ทั้งที่ฐานมีวัน = **ไม่** ขึ้นแถบ — สภาพปกติของทริปแพลตฟอร์มจนกว่า `E5` จะลง", () => {
    // ⚠️ เคสนี้จดกติกาปัจจุบันไว้ ไม่ได้บอกว่ามันถูกที่สุด — `E5` (P3) เป็นคนตัดสินเรื่องตัวตนของวัน
    //    ถ้าวันหนึ่งตัดสินว่า `matched === 0` ควรเตือน **เคสนี้จะแดงและนั่นคือหน้าที่ของมัน**
    reportDayBridgeWarningIfAny(bridge({ matched: 0, unmatchedLegacy: ["d0", "d1"] }), 4);
    expect(readDayBridgeIncomplete()).toBe(false);
  });

  describe("`reportDayBridgeDropIfAny` คืนค่าอะไร (ผู้เรียกใช้ตัดสินใจว่าจะทับแคชไหม)", () => {
    it("ไม่มีแถวดิบเลย = ไม่ใช่การหล่น — ทริปที่ยังไม่มีข้อมูลจริงต้องเขียนแคชได้", () => {
      expect(reportDayBridgeDropIfAny(0, 0)).toBe(false);
      expect(readDayBridgeIncomplete()).toBe(false);
    });

    it("แมปได้ครบ = ไม่ใช่การหล่น", () => {
      expect(reportDayBridgeDropIfAny(6, 6)).toBe(false);
      expect(readDayBridgeIncomplete()).toBe(false);
    });

    it("หล่นหมดทุกแถว = การหล่น", () => {
      expect(reportDayBridgeDropIfAny(6, 0)).toBe(true);
      expect(readDayBridgeIncomplete()).toBe(true);
    });
  });

  describe("การแจ้งผู้ฟัง — สโตร์ที่เปลี่ยนค่าแล้วไม่แจ้ง = หน้าจอค้างที่ค่าเก่าโดยไม่มีอะไรฟ้อง", () => {
    it("แจ้งเมื่อค่ารวมเปลี่ยน และ **ไม่แจ้ง** เมื่อค่ารวมเท่าเดิม", () => {
      let calls = 0;
      const unsubscribe = subscribeDayBridgeIncomplete(() => void calls++);

      reportDayBridgeDropIfAny(4, 1); // false → true
      expect(calls).toBe(1);

      // 🔴 ธง `bridgeBroken` เปลี่ยน (false → true) แต่ค่า*รวม*ยัง `true` เหมือนเดิม → ห้ามแจ้ง
      reportDayBridgeWarningIfAny(healthy, 0);
      expect(calls).toBe(1);

      // ธง `bridgeBroken` กลับเป็น false แต่ `rowsDropped` ยังตั้งอยู่ → ค่ารวมยัง true → ห้ามแจ้ง
      reportDayBridgeWarningIfAny(healthy, 5);
      expect(calls).toBe(1);
      expect(readDayBridgeIncomplete()).toBe(true);

      unsubscribe();
    });

    it("เลิกฟังแล้วต้องไม่ถูกเรียกอีก", () => {
      let calls = 0;
      const unsubscribe = subscribeDayBridgeIncomplete(() => void calls++);
      unsubscribe();
      reportDayBridgeDropIfAny(3, 0);
      expect(calls).toBe(0);
      expect(readDayBridgeIncomplete()).toBe(true);
    });
  });
});
