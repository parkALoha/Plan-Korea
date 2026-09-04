import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `cacheHandoff` — สะพาน `localStorage` → IndexedDB · `E6-AC7` (`D17`)
 * เจ้าของ: P7-Mobile · 4 ก.ย. 2026
 *
 * ## 🔴 สองคุณสมบัติที่ไฟล์นี้มีอยู่เพื่อมัน — และทั้งคู่เป็นคุณสมบัติ *เชิงลบ*
 * ```
 * ฝั่งอ่าน   ต้อง **ไม่เขียน** (ไม่เลื่อนขั้นค่าเก่าเข้า IndexedDB)
 * ฝั่งเขียน  ต้อง **ไม่ลบ** ฝาแฝด เมื่อเขียนไม่สำเร็จ
 * ```
 * 🎯 **คุณสมบัติเชิงลบไม่มีอาการตอนมันหาย** — เพิ่มการเลื่อนขั้นเข้าไปวันหนึ่ง ทุกเคสฝั่งบวกยังเขียวหมด
 * (ค่าที่อ่านได้ยังถูก · ฝาแฝดยังถูกลบตอนสำเร็จ) · สิ่งที่พังคือ **ค่าเก่าทับของสดเป็นบางครั้ง**
 * ซึ่งเป็นการแข่งกันที่ **ไม่ล้มในเทสต์ใดเลยตามนิยาม** — เพราะมันขึ้นกับว่าใครจบก่อน
 * ⇒ ต้องดักที่ *"มีการเขียนเกิดขึ้นกี่ครั้ง"* ไม่ใช่ที่ *"ค่าที่ได้ถูกไหม"*
 *
 * ## ⚠️ ขอบ — เขียนไว้เพราะไฟล์นี้อ่านแข็งกว่าที่เป็นจริง
 * · mock `offlineStore` ทั้งใบ ⇒ **ไม่ได้พิสูจน์ว่า IndexedDB จริงทำงาน** (นั่นคือ `E6-AC4` ในเบราว์เซอร์)
 * · พิสูจน์เฉพาะ *สัญญาระหว่างสองที่เก็บ* ซึ่งเป็นส่วนที่ตรรกะล้วนและพลาดเงียบที่สุด
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

/** `null` = ไม่มีของใน IndexedDB · `setOk` = ผลของการเขียน (ใช้จำลองโควตาเต็ม/ฐานเปิดไม่ได้) */
const idb = vi.hoisted(() => ({
  value: null as unknown,
  setOk: true,
  getCalls: 0,
  setCalls: 0,
}));
vi.mock("@/lib/engine/offlineStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine/offlineStore")>()),
  get: async () => {
    idb.getCalls++;
    return idb.value;
  },
  set: async () => {
    idb.setCalls++;
    return idb.setOk;
  },
}));

const noted = vi.hoisted(() => ({ calls: [] as string[] }));
// 🔴 spread ของเดิมกลับเข้าไปเสมอ (`S6`) — factory ที่แทนทั้งโมดูลจะกลืน export ใหม่ที่ใครเพิ่มทีหลัง
vi.mock("@/lib/engine/cacheGuard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine/cacheGuard")>()),
  noteCacheFailure: (where: string) => void noted.calls.push(where),
}));

const KEY = "trip:t1:hotels";
/** คีย์จริงใน `localStorage` — `localCache` เติม prefix เอง · **อ่านจากต้นทาง ไม่เดารูป** */
let TWIN: string;

let store: ReturnType<typeof fakeStorage>;
beforeEach(async () => {
  store = fakeStorage();
  vi.stubGlobal("window", { localStorage: store });
  vi.resetModules();
  idb.value = null;
  idb.setOk = true;
  idb.getCalls = 0;
  idb.setCalls = 0;
  noted.calls = [];
  const { __cachePrefixForTests } = await import("@/lib/localCache");
  TWIN = __cachePrefixForTests + KEY;
});

describe("🔴 E6-AC7 — สะพานสองที่เก็บ", () => {
  it("① ฝั่งอ่าน: มีของใน IndexedDB → ใช้ของนั้น", async () => {
    idb.value = ["จาก-idb"];
    store.setItem(TWIN, JSON.stringify(["จาก-localstorage"]));
    const { readHandoff } = await import("@/lib/engine/cacheHandoff");
    expect(await readHandoff<string[]>(KEY)).toEqual(["จาก-idb"]);
  });

  it("② ฝั่งอ่าน: IndexedDB ว่าง → ตกไปที่ฝาแฝด (นี่คือทางที่กันข้อมูลหายตอนอัปเกรด)", async () => {
    store.setItem(TWIN, JSON.stringify(["จาก-localstorage"]));
    const { readHandoff } = await import("@/lib/engine/cacheHandoff");
    expect(
      await readHandoff<string[]>(KEY),
      "ไม่ตกไปที่ฝาแฝด = ผู้ใช้ที่อัปเกรดแล้วยังไม่เคยยิงสำเร็จ **เปิดออฟไลน์แล้วไม่เห็นอะไรเลย**"
    ).toEqual(["จาก-localstorage"]);
  });

  it("③ ฝั่งอ่าน: ว่างทั้งสองที่ → `null` (ไม่ใช่ค่าปลอม)", async () => {
    const { readHandoff } = await import("@/lib/engine/cacheHandoff");
    expect(await readHandoff<string[]>(KEY)).toBeNull();
  });

  /**
   * 🔴 **เคสที่เป็นเหตุผลของการออกแบบทั้งอัน** — ดู `## สองคุณสมบัติ` ที่หัวไฟล์
   * ถ้าใครเติม "เลื่อนขั้นค่าเก่าเข้า IndexedDB ตอนอ่าน" (ซึ่งเป็นท่ามาตรฐานของ migration
   * และจะดู *ถูกกว่า* ของจริงเสียอีก) เคส ①–③ **ยังเขียวทุกใบ** · เคสนี้คือใบเดียวที่แดง
   */
  it("④ 🔴 ฝั่งอ่านต้องไม่เขียนอะไรเลย — การเลื่อนขั้นคือการแข่งกับของสด", async () => {
    store.setItem(TWIN, JSON.stringify(["จาก-localstorage"]));
    const { readHandoff } = await import("@/lib/engine/cacheHandoff");
    await readHandoff<string[]>(KEY);
    expect(
      idb.setCalls,
      "อ่านแล้วเขียน = ค่าเก่าที่เขียนช้ากว่าจะ **ทับของสดที่เพิ่งลงไป** → เปิดใหม่ได้ของเก่า"
    ).toBe(0);
    expect(store.getItem(TWIN), "ฝั่งอ่านลบฝาแฝด = ทางถอยตอน revert หายไป").not.toBeNull();
  });

  it("⑤ ฝั่งเขียน: สำเร็จ → เก็บฝาแฝดทิ้ง (นี่คือครึ่งที่ทำให้ `D17` เป็นจริง)", async () => {
    store.setItem(TWIN, JSON.stringify(["เก่า"]));
    expect(store.getItem(TWIN), "ไม่มีฝาแฝดก่อนเขียน = เคสนี้ไม่ได้วัดอะไร (`P-21`)").not.toBeNull();
    const { writeHandoff } = await import("@/lib/engine/cacheHandoff");
    expect(await writeHandoff(KEY, ["ใหม่"])).toBe(true);
    expect(
      store.getItem(TWIN),
      "ฝาแฝดไม่ถูกลบ = ย้ายแล้วแต่ `localStorage` ยังเต็มเท่าเดิม → **AC ไม่ได้ลดอะไรเลย**"
    ).toBeNull();
  });

  /**
   * 🔴 คู่ตรงข้ามของ ⑤ — ถ้าลบก่อนแล้วเขียนไม่ลง **ข้อมูลหายทั้งสองที่ในจังหวะเดียว**
   * · เกิดจริงได้: โควตา IndexedDB เต็ม · แท็บอื่นถือฐานค้าง (`open-blocked`) · ที่เก็บถูกปิด
   */
  it("⑥ 🔴 ฝั่งเขียน: ล้มเหลว → ห้ามแตะฝาแฝด", async () => {
    idb.setOk = false;
    store.setItem(TWIN, JSON.stringify(["เก่า"]));
    const { writeHandoff } = await import("@/lib/engine/cacheHandoff");
    expect(await writeHandoff(KEY, ["ใหม่"])).toBe(false);
    expect(
      store.getItem(TWIN),
      "เขียนไม่ลงแล้วยังลบของเก่า = ข้อมูลหายทั้งสองที่พร้อมกัน"
    ).not.toBeNull();
  });

  it("⑦ ฝั่งเขียนแบบยิงแล้วลืม: ล้มแล้วต้องมีเสียง ไม่ใช่กลืนเงียบ", async () => {
    idb.setOk = false;
    const { writeHandoffNoisily } = await import("@/lib/engine/cacheHandoff");
    writeHandoffNoisily(KEY, ["ใหม่"], "hotels");
    await vi.waitFor(() => expect(noted.calls.length).toBeGreaterThan(0));
    expect(noted.calls[0]).toBe("offlineStore/hotels/write");
  });

  it("⑧ เคสควบคุมฝั่งลบ: เขียนสำเร็จต้อง **ไม่** ตะโกน", async () => {
    const { writeHandoffNoisily } = await import("@/lib/engine/cacheHandoff");
    writeHandoffNoisily(KEY, ["ใหม่"], "hotels");
    await vi.waitFor(() => expect(idb.setCalls).toBe(1));
    expect(noted.calls, "ตะโกนตอนสำเร็จ = เสียงที่ไม่มีความหมาย แล้วคนจะเลิกฟัง").toEqual([]);
  });
});
