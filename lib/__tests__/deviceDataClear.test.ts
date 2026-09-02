import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `clearDeviceData()` ต้องล้าง **ที่เก็บทั้งสองใบ** — เจ้าของ: P1-Lead · 2 ก.ย. 2026 · `E6-AC7`
 *
 * ## 🔴 ทำไมต้องมีไฟล์นี้ ทั้งที่ `signOutClearsCache.test.ts` มีอยู่แล้ว
 * ไฟล์นั้นคุม **ลำดับ** (ล้างก่อนยิงเน็ต) · ไฟล์นี้คุม **ความครบ** (สองใบ ไม่ใช่ใบเดียว)
 * · ตอนที่ `signOut()` ล้างแค่ `localStorage` ไฟล์นั้น **เขียวทุกเคส** เพราะมันไม่เคยถามถึงใบที่สอง
 * 🎯 **ด่านที่ถามคำถามเดียว มองไม่เห็นคำถามที่สอง แม้จะอยู่บนโค้ดบรรทัดเดียวกัน**
 *
 * ## ⚠️ `P-21` — ทุกเคสยืนยัน "มีของก่อนล้าง" ก่อนเสมอ
 * ไม่งั้นตัวกวาดที่พังสนิทจะเขียวตลอดกาล เพราะ "เหลือ 0" กับ "ไม่เคยมี" ให้ผลเหมือนกัน
 */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}

const idb = vi.hoisted(() => ({ clearCalls: 0 }));
vi.mock("@/lib/engine/offlineStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine/offlineStore")>()),
  clearAll: async () => { idb.clearCalls++; },
}));

/** คีย์ของแอป — ต้องหายทั้งหมด · รวม **ชื่อพาสปอร์ต** ซึ่งเป็นเหตุผลที่ด่านนี้มีอยู่ */
const APP_KEYS = [
  "trip-cache:v2:passportNames",
  "trip-cache:v2:hotels",
  "trip-cache:v2:bookings",
  "trip-cache:legacy-รุ่นเก่า",
];
/** คีย์ของแอปอื่นบนเครื่องเดียวกัน — **ห้ามแตะ** */
const FOREIGN_KEYS = ["theme", "sb-auth-token"];

let store: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal("window", { localStorage: store });
  idb.clearCalls = 0;
  vi.resetModules();
  for (const k of [...APP_KEYS, ...FOREIGN_KEYS]) store.setItem(k, "x");
});

const appKeysLeft = () => [...store._map.keys()].filter((k) => k.startsWith("trip-cache:"));

describe("clearDeviceData() — ความครบของที่เก็บทั้งสองใบ", () => {
  it("ล้าง localStorage ทุกคีย์ของแอป (P-21: ต้องมีของก่อนล้าง)", async () => {
    expect(appKeysLeft().length, "ไม่มีของก่อนล้าง = เคสนี้ไม่ได้วัดอะไร").toBeGreaterThan(0);
    const { clearDeviceData } = await import("@/lib/auth/deviceData");
    await clearDeviceData();
    expect(appKeysLeft()).toEqual([]);
  });

  /**
   * 🔴 **เคสที่เป็นเหตุผลของไฟล์นี้** — ถ้าใครถอด `await clearOfflineStore()` ออก
   * เคสข้างบนยังเขียว **เพราะมันดูแค่ `localStorage`** · เคสนี้คือตัวเดียวที่แดง
   */
  it("🔴 เรียกตัวล้าง IndexedDB ด้วย ไม่ใช่แค่ localStorage", async () => {
    const { clearDeviceData } = await import("@/lib/auth/deviceData");
    await clearDeviceData();
    expect(idb.clearCalls, "IndexedDB ไม่ถูกล้าง — ข้อมูลทริปของคนก่อนอยู่ครบ").toBe(1);
  });

  /**
   * 🔴 **เคสที่บังคับ *ลำดับ* ให้เป็นสัญญา ไม่ใช่คำเตือน** (P2 ชี้ว่าเขาพึ่งมัน · 2 ก.ย. 2026)
   * `HomeScreen` เรียกด้วย `void clearDeviceData()` ในเอฟเฟกต์ sync → **มันไม่รอ**
   * `clearAllCaches()` อยู่ก่อน `await` ตัวแรกจึงรันทันที → ชื่อพาสปอร์ตหายในจังหวะเดียวกับโค้ดเดิม
   *
   * ⚠️ **เคสนี้จงใจ *ไม่* `await`** — ถ้า `await` มันจะเขียวไม่ว่าลำดับข้างในจะเป็นอย่างไร
   * 🎯 สลับให้ `await clearOfflineStore()` ขึ้นก่อนเมื่อไหร่ → เคสนี้แดง **เคสอื่นทุกใบยังเขียว**
   *    ซึ่งเป็นสิ่งเดียวที่กันไม่ให้เหตุผลของ P2 ตายเงียบตอนมีคนจัดระเบียบฟังก์ชันนี้
   */
  it("🔴 ไม่ await → localStorage ต้องถูกล้าง **ไปแล้ว** ทันที (ลำดับเป็นสัญญา)", async () => {
    expect(appKeysLeft().length, "ไม่มีของก่อนล้าง = เคสนี้ไม่ได้วัดอะไร").toBeGreaterThan(0);
    const { clearDeviceData } = await import("@/lib/auth/deviceData");
    const pending = clearDeviceData();                    // ← จงใจไม่ await
    expect(
      appKeysLeft(),
      "localStorage ยังไม่ถูกล้างในจังหวะ sync — `clearAllCaches()` ถูกเลื่อนไปหลัง await แล้ว",
    ).toEqual([]);
    await pending;
  });

  it("ไม่แตะคีย์ของแอปอื่น", async () => {
    const { clearDeviceData } = await import("@/lib/auth/deviceData");
    await clearDeviceData();
    for (const k of FOREIGN_KEYS) expect(store.getItem(k), `${k} ถูกลบทั้งที่ไม่ใช่ของเรา`).toBe("x");
  });

  /**
   * 🔴 **ลำดับ: localStorage ต้องถูกล้างแม้ IndexedDB จะพัง**
   * IndexedDB ใช้ไม่ได้ในบางบริบท (โหมดส่วนตัว · โควตาเต็ม) · ถ้ามันโยนแล้วเราปล่อยให้ทั้งฟังก์ชันล้ม
   * **โดยที่ localStorage ยังไม่ถูกแตะ ผู้ใช้จะเสียทั้งสองใบ** — ชื่อพาสปอร์ตค้างเพราะที่เก็บอีกใบพัง
   */
  it("🔴 IndexedDB โยน → localStorage ต้องถูกล้างไปแล้วอยู่ดี", async () => {
    vi.doMock("@/lib/engine/offlineStore", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/engine/offlineStore")>()),
      clearAll: async () => { throw new Error("IndexedDB ใช้ไม่ได้"); },
    }));
    const { clearDeviceData } = await import("@/lib/auth/deviceData");
    await expect(clearDeviceData()).rejects.toThrow();
    expect(appKeysLeft(), "localStorage ยังไม่ถูกล้างตอน IndexedDB พัง").toEqual([]);
  });
});
