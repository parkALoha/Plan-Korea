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

  /**
   * 🔴 **ดิสก์ *ไม่ตอบเลยตลอดกาล* — ไม่ใช่แค่ช้า** (P2 เจอสภาพนี้จริงในเบราว์เซอร์ 2 ก.ย. 2026)
   *
   * ## ที่มา และข้อจำกัดของที่มา — เขียนไว้เพราะมันสำคัญกว่าตัวเคส
   * P2 วัดหน้าจอตอน IndexedDB ของโปรไฟล์เบราว์เซอร์ **ค้างสนิท** (`indexedDB.open()` ไม่ยิง
   * `success`/`error`/`blocked` เลยสักตัว) แล้วพบว่า **หน้าจอยังทำงานปกติจากของสด**
   * · 🔴 **แต่นั่นเป็น *อุบัติเหตุ* ไม่ใช่เคสที่ออกแบบไว้ — และไม่มีใครทำซ้ำได้** (เราไม่มีวิธีทำให้
   *   IndexedDB ค้างโดยตั้งใจ) · **P2 เป็นคนยืนยันข้อจำกัดนี้เอง และปฏิเสธไม่ให้จดเป็นหลักฐานของ AC**
   * 🎯 **เคสนี้คือการแปลงข้อสังเกตนั้นให้ *ทำซ้ำได้* — หลักฐานที่ทำซ้ำไม่ได้ ไม่ใช่หลักฐาน มันคือความจำ**
   *
   * ## กิ่งที่ไม่มีเคสไหนเดินผ่านมาก่อน
   * เคส *"ดิสก์ช้ากว่าเน็ต"* ใช้ `tick(30)` — **ยังจบ** · อันนี้ **ไม่จบเลย** ซึ่งเป็นคนละกิ่ง:
   * `await a.readCache()` ไม่คืนค่า → **ตัว `hydrateThenFetch` เองไม่ settle ตลอดกาล**
   */
  it("🔴 ดิสก์ไม่ตอบเลยตลอดกาล → ของสดต้องขึ้นจอ (กิ่งที่ P2 เจอโดยอุบัติเหตุ)", async () => {
    const r = recorder();
    let settled = false;
    const pending = hydrateThenFetch<string>({
      ...r,
      readCache: () => new Promise<string | null>(() => {}), // ไม่ resolve ไม่ reject ตลอดกาล
      fetchFresh: async () => "new",
    });
    void pending.then(() => {
      settled = true;
    });
    await tick(40);

    // ① สิ่งที่ผู้ใช้ต้องได้ — กติกาข้อ ① ที่หัวไฟล์เขียนไว้: *ยิงของสดทันที ไม่รอแคช*
    expect(r.applied, "ที่เก็บพังทั้งใบ ผู้ใช้ยังต้องได้ของสด ไม่ใช่จอค้าง").toEqual(["fresh:new"]);

    // ② 🔴 ปักพฤติกรรมที่ *ยังไม่ดี* ไว้ให้เห็น ไม่ใช่ซ่อน — promise ตัวนี้ค้างถาวร (task รั่วต่อการ mount)
    //    ถ้าวันหนึ่งมีคนใส่ timeout ให้ `readCache` เคสนี้จะแดง → **ตั้งใจ** ให้มาแก้ข้อความนี้พร้อมเหตุผล
    //    ไม่ใช่ให้แก้เงียบ ๆ · วันนี้ยอมรับได้เพราะผลต่อผู้ใช้เป็นศูนย์ (จอได้ของสดไปแล้ว)
    expect(settled, "ถ้าข้อนี้แดง = มีคนทำให้การอ่านแคชมีเพดานเวลา → อัปเดตสัญญาที่หัวไฟล์ด้วย").toBe(false);
  });
});
