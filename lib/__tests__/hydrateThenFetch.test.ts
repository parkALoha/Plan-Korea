import { describe, expect, it } from "vitest";
import { hydrateThenFetch } from "@/lib/engine/hydrateThenFetch";

/**
 * `E6-AC7` — **การแข่งกันที่การย้ายไป IndexedDB สร้างขึ้น**
 *
 * `localStorage` อ่าน sync → hydrate เสร็จก่อนยิงเน็ตเสมอ **ลำดับมาฟรี**
 * IndexedDB อ่าน async → **ของสดมาถึงก่อนการอ่านแคชเสร็จได้** → เอาแคชทับทีหลัง = ทับของใหม่ด้วยของเก่า
 *
 * 🔴 **เคสสำคัญที่สุดคือเคสที่ 2 (ดิสก์ช้ากว่าเน็ต)** — เป็นเครื่องปกติ ไม่ใช่เคสขอบ
 * และเป็นกิ่งที่ *เหตุผลถูกแล้วยังพลาดได้* เพราะมันขึ้นกับจังหวะ ไม่ใช่ตรรกะ (P1 ชี้ · จึงต้องมีเคสจริง)
 */
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** เก็บลำดับที่ค่าถูก apply จริง — **ตัวสุดท้ายคือสิ่งที่ผู้ใช้เห็นค้างไว้** */
function recorder() {
  const applied: string[] = [];
  return {
    applied,
    applyCache: (v: string) => applied.push(`cache:${v}`),
    applyFresh: (v: string) => applied.push(`fresh:${v}`),
    applyError: () => applied.push("error"),
    isCancelled: () => false,
  };
}

describe("hydrateThenFetch — ลำดับที่ IndexedDB ไม่แถมมาให้", () => {
  it("ดิสก์เร็วกว่าเน็ต → เห็นแคชก่อน แล้วของสดทับ", async () => {
    const r = recorder();
    const out = await hydrateThenFetch<string>({
      ...r,
      readCache: async () => "old",
      fetchFresh: async () => (await tick(20), "new"),
    });
    expect(out).toBe("fresh");
    expect(r.applied).toEqual(["cache:old", "fresh:new"]);
  });

  it("🔴 ดิสก์ช้ากว่าเน็ต → **ห้ามเอาแคชทับของสด** (กิ่งที่การย้ายสร้างขึ้น)", async () => {
    const r = recorder();
    const out = await hydrateThenFetch<string>({
      ...r,
      readCache: async () => (await tick(30), "old"),
      fetchFresh: async () => "new",
    });
    expect(out).toBe("fresh");
    // ถ้าไม่มี `!fresh` guard ผลจะเป็น ["fresh:new", "cache:old"] → ผู้ใช้ค้างที่ของเก่า
    expect(r.applied).toEqual(["fresh:new"]);
  });

  it("เน็ตล้ม + มีแคช → ใช้แคช ไม่ขึ้น error ทับของที่อ่านได้", async () => {
    const r = recorder();
    const out = await hydrateThenFetch<string>({
      ...r,
      readCache: async () => "old",
      fetchFresh: async () => {
        throw new Error("offline");
      },
    });
    expect(out).toBe("cache-only");
    expect(r.applied).toEqual(["cache:old"]);
  });

  it("เน็ตล้ม + ไม่มีแคช → error (คือเคสเปิดครั้งแรกขณะออฟไลน์)", async () => {
    const r = recorder();
    const out = await hydrateThenFetch<string>({
      ...r,
      readCache: async () => null,
      fetchFresh: async () => {
        throw new Error("offline");
      },
    });
    expect(out).toBe("error");
    expect(r.applied).toEqual(["error"]);
  });

  it("อ่านแคชโยน → ถือว่าไม่มีแคช ไม่ใช่พังทั้งเส้น", async () => {
    const r = recorder();
    const out = await hydrateThenFetch<string>({
      ...r,
      readCache: async () => {
        throw new Error("idb blocked");
      },
      fetchFresh: async () => "new",
    });
    expect(out).toBe("fresh");
    expect(r.applied).toEqual(["fresh:new"]);
  });

  it("ยกเลิกระหว่างทาง → ไม่ apply อะไรเลย", async () => {
    const applied: string[] = [];
    const out = await hydrateThenFetch<string>({
      readCache: async () => "old",
      fetchFresh: async () => "new",
      applyCache: (v) => applied.push(`cache:${v}`),
      applyFresh: (v) => applied.push(`fresh:${v}`),
      applyError: () => applied.push("error"),
      isCancelled: () => true,
    });
    expect(out).toBe("cancelled");
    expect(applied).toEqual([]);
  });

  it("🔴 เขียนแคชไม่ลง → ต้องเรียก `onWriteFailed` — ค่าที่คืนแล้วไม่มีใครดู ก็คือกลืนเงียบ", async () => {
    const r = recorder();
    let told = false;
    await hydrateThenFetch<string>({
      ...r,
      readCache: async () => null,
      fetchFresh: async () => "new",
      writeCache: async () => false,
      onWriteFailed: () => {
        told = true;
      },
    });
    expect(told).toBe(true);
  });
});
