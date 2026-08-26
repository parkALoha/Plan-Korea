import { describe, expect, it } from "vitest";
import { soleTrip, soleTripMessage } from "../engine/trip";
import type { Db } from "../engine/db";

/**
 * `E3` — *"ทริปไหน"* · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **เคสที่สำคัญที่สุดคือเคส `ambiguous`** — ไม่ใช่เพราะมันเกิดบ่อย (วันนี้ไม่เกิดเลย)
 * แต่เพราะ **ท่าที่ง่ายกว่า (`trips[0]`) จะเขียวทุกเคสที่เขียนได้วันนี้**
 * และผิดเงียบ ๆ วันที่ผู้ใช้สร้างทริปที่สอง · **นี่คือเคสที่กันอนาคต ไม่ได้กันปัจจุบัน**
 */
const fakeDb = (rows: unknown, error?: { message: string }) =>
  ({
    from: () => ({
      select: () => ({ order: async () => ({ data: rows, error: error ?? null }) }),
    }),
  }) as unknown as Db;

describe("soleTrip — ห้ามเลือกทริปให้เงียบ ๆ", () => {
  it("ทริปเดียว → คืน id นั้น", async () => {
    expect(await soleTrip(fakeDb([{ id: "t1", name: "เกาหลี" }]))).toEqual({ ok: true, tripId: "t1" });
  });

  it("🔴 สองทริป → `ambiguous` **ไม่ใช่ตัวแรก**", async () => {
    const r = await soleTrip(fakeDb([{ id: "t1", name: "a" }, { id: "t2", name: "b" }]));
    expect(r).toEqual({ ok: false, reason: "ambiguous", tripIds: ["t1", "t2"] });
  });

  it("ไม่มีทริป → `none` ซึ่งต่างจาก `error`", async () => {
    // หน้าจอควรชวนสร้างทริป ไม่ใช่ขึ้นข้อความว่าพัง
    expect(await soleTrip(fakeDb([]))).toEqual({ ok: false, reason: "none" });
  });

  it("🔴 อ่านไม่ได้ → `error` **ไม่ใช่ `none`**", async () => {
    // `data: null` จากอ่านไม่ได้ หน้าตาเหมือน `data: null` จากไม่มีแถว
    // ถ้ายุบเป็นอันเดียวกัน ผู้ใช้ที่ session หมดอายุจะเห็น "ยังไม่มีทริป"
    // แล้วกดสร้างทริปใหม่ทับของเดิมที่ยังอยู่
    const r = await soleTrip(fakeDb(null, { message: "JWT expired" }));
    expect(r).toMatchObject({ ok: false, reason: "error" });
    expect(soleTripMessage(r as never)).toContain("JWT expired");
  });

  it("ข้อความของแต่ละเหตุผลต่างกันจริง — ไม่ใช่ข้อความเดียวสามที่", () => {
    const msgs = [
      soleTripMessage({ ok: false, reason: "none" }),
      soleTripMessage({ ok: false, reason: "ambiguous", tripIds: ["a", "b"] }),
      soleTripMessage({ ok: false, reason: "error", message: "x" }),
    ];
    expect(new Set(msgs).size).toBe(3);
  });
});
