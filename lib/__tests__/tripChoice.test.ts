import { describe, expect, it } from "vitest";
import { chooseSoleTrip, soleTripMessage, type SoleTrip } from "@/lib/engine/tripChoice";

/**
 * `lib/engine/tripChoice.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 กฎนี้ตอบคำถาม *"ผู้ใช้กำลังแก้ทริปไหน"* และ **ฝั่งเบราว์เซอร์กับฝั่งเซิร์ฟเวอร์
 * ต้องตอบเหมือนกันเป๊ะ** — ถ้าไม่ **ผู้ใช้จะเห็นทริปคนละใบระหว่างเฟรมแรกกับเฟรมที่สอง**
 *
 * 🎯 **สิ่งที่กฎนี้ห้ามไว้สำคัญกว่าสิ่งที่มันทำ:** ห้าม *"เอาตัวแรกที่เจอ"*
 * ซึ่ง**ถูกเสมอจนวันที่ผู้ใช้สร้างทริปที่สอง** — วันนั้นเขาจะแก้ทริปผิดใบ
 * **โดยหน้าจอไม่มีอะไรผิดปกติเลยสักอย่าง**
 * ⚠️ ผู้ใช้สร้างบัญชีที่สองไปแล้วเมื่อ 26 ส.ค. 2026 → **นี่ไม่ใช่เรื่องสมมติอีกต่อไป**
 */
describe("chooseSoleTrip", () => {
  it("ทริปเดียว → เลือกให้", () => {
    expect(chooseSoleTrip([{ id: "t1" }])).toEqual({ ok: true, tripId: "t1" });
  });

  it("ไม่มีทริป → `none` ไม่ใช่ error (หน้าจอควรชวนสร้าง)", () => {
    expect(chooseSoleTrip([])).toEqual({ ok: false, reason: "none" });
  });

  it("🔴 หลายทริป → `ambiguous` **ห้ามหยิบตัวแรก**", () => {
    const r = chooseSoleTrip([{ id: "t1" }, { id: "t2" }]);
    expect(r.ok).toBe(false);
    expect(r).toEqual({ ok: false, reason: "ambiguous", tripIds: ["t1", "t2"] });
    // 🎯 เคสนี้คือทั้งหมดที่ไฟล์นั้นมีไว้ป้องกัน — ถ้าใครเปลี่ยนเป็น `trips[0]` วันไหน มันต้องแดง
    expect(r).not.toHaveProperty("tripId");
  });

  it("คืน id ครบทุกใบตามลำดับที่รับมา (หน้าจอต้องแสดงให้เลือก)", () => {
    const r = chooseSoleTrip([{ id: "c" }, { id: "a" }, { id: "b" }]);
    expect(r.ok === false && r.reason === "ambiguous" && r.tripIds).toEqual(["c", "a", "b"]);
  });

  it("ไม่แก้ไขอาร์เรย์ที่รับเข้ามา", () => {
    const input = [{ id: "t1" }, { id: "t2" }];
    const copy = JSON.parse(JSON.stringify(input));
    chooseSoleTrip(input);
    expect(input).toEqual(copy);
  });
});

describe("soleTripMessage — ข้อความที่ผู้ใช้อ่านออก", () => {
  const cases: Exclude<SoleTrip, { ok: true }>[] = [
    { ok: false, reason: "none" },
    { ok: false, reason: "ambiguous", tripIds: ["a", "b"] },
    { ok: false, reason: "error", message: "เน็ตหลุด" },
  ];

  it("ทุกเหตุผลมีข้อความ ไม่มีตัวไหนคืนค่าว่างหรือ undefined", () => {
    // ⚠️ `switch` ที่ไม่มี `default` — เหตุผลใหม่ที่ลืมเพิ่มเคสจะคืน `undefined`
    //    แล้วผู้ใช้จะเห็นหน้าจอเปล่า ๆ แทนคำอธิบาย
    for (const c of cases) {
      const m = soleTripMessage(c);
      expect(typeof m, c.reason).toBe("string");
      expect(m.trim().length, c.reason).toBeGreaterThan(0);
    }
  });

  it("บอกจำนวนทริปจริง ไม่ใช่ข้อความตายตัว", () => {
    expect(soleTripMessage({ ok: false, reason: "ambiguous", tripIds: ["a", "b", "c"] })).toContain("3");
  });

  it("ข้อความ error พาเหตุผลจริงติดไปด้วย", () => {
    expect(soleTripMessage({ ok: false, reason: "error", message: "เน็ตหลุด" })).toContain("เน็ตหลุด");
  });
});
