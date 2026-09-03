import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **`E6-AC7` ครึ่งฝั่งนักพัฒนา — และตะขอสำหรับครึ่งฝั่งผู้ใช้**
 * เจ้าของ: P1-Lead · 2 ก.ย. 2026
 *
 * ## 🔴 ทำไมไฟล์นี้ต้องมี ทั้งที่ `cacheGuard.test.ts` มีอยู่แล้ว
 * `backlog` เขียนว่าครึ่งฝั่งนักพัฒนาของ `AC7` **ปิดแล้ว** โดย `cacheGuard.test.ts`
 * · **แต่ไฟล์นั้นทดสอบ `noteCacheFailure` *ในฐานะฟังก์ชัน*** — ไม่ได้ทดสอบว่ามีใครเรียกมัน
 * · วัดแล้ว: `lib/localCache.ts` **ไม่เคยอยู่ในรายชื่อผู้เรียกเลย** — `writeCache` กลืน error เปล่า ๆ
 * 🎯 ***ด่านที่ทดสอบเครื่องมือ ไม่ได้ทดสอบการใช้เครื่องมือ*** —
 *    และแคชใน `localStorage` คือที่ที่ *โควตาเต็มจริง* (`D17` · เพดาน ~5 MB · ไม่มีทางออกแบบ native แล้ว)
 *
 * ## ⚠️ ไฟล์นี้ยัง **ไม่ปิด** ครึ่งฝั่งผู้ใช้
 * เกณฑ์คือ *"มีอะไรบอกผู้ใช้จริงว่าแคชเต็ม — UI ไม่ใช่ log"*
 * · ที่นี่ทดสอบแค่ว่า **มีสัญญาณให้ UI เกาะ**
 * · ตัว UI อยู่ที่ `components/CacheFullBanner.tsx` + `hooks/useCacheFull.ts`
 *   (`e07598b` · โซน P2) — **เขียนแล้ว แต่ยังไม่มีใครเห็นมันบนจอ** จึงยังไม่ปิด `AC7`
 *
 * 🔴 **แก้ 3 ก.ย. 2026 (P2 เจอ · P2 ร่างถ้อยคำ) — บรรทัดนี้เคยเขียนว่า *"ตัว UI เป็นโซน P2 และยังไม่มี"***
 *    จริงตอนเขียน · **เท็จตั้งแต่ `e07598b`** ซึ่ง P1 เป็นคนดันขึ้น remote เอง
 *    · 🔴 **แล้ว P1 ยกประโยคนี้ไปบอก P2 ว่า *"ตัว UI ยังไม่มี"*** — P2 หักด้วย
 *      `git merge-base --is-ancestor e07598b origin/platform` → YES
 *    🎯 ***ข้อเท็จจริงที่ถูกเก็บไว้คนละที่กับสิ่งที่ทำให้มันจริง จะหมดอายุโดยไม่มีใครแตะมัน***
 *    · ⚠️ **และราคาไม่ใช่ความสับสน — มันคือมีคนไปเขียน UI ซ้ำ**
 *    · 📌 P1 แก้ `backlog.md` (ผ่าน P8) แต่ **ไม่ได้แก้ที่นี่** ซึ่งเป็นแหล่งที่ยกประโยคมา
 *      → P2 ต้องมาทักรอบที่สอง · **แก้ปลายทางแล้วไม่แก้ต้นทาง = ปลายทางจะเพี้ยนอีก**
 *    · ✅ ถ้อยคำใหม่ชี้ **พาธของไฟล์จริง** — หมดอายุยากขึ้นหนึ่งขั้น เพราะถ้าไฟล์ถูกลบจะค้นไม่เจอ
 *      🔴 **แต่มันยังไม่ใช่ด่าน · ยังพึ่งคนอ่าน** — P2 ปฏิเสธการทำเป็นเทสต์เอง เพราะเทสต์ที่ตรวจ
 *      *"UI มีอยู่ไหม"* จะเป็น grep-based gate ซึ่งทีมนี้เพิ่งถอดออกไปหนึ่งใบด้วยเหตุผลที่ดี
 * · 🔴 **ห้ามอ่านไฟล์นี้ว่า `AC7` ปิดแล้ว** — นี่คือความผิดพลาดแบบเดียวกับที่ทำให้ครึ่งแรกถูกติ๊กไปก่อน
 */
const store = new Map<string, string>();
let failNextWrite = false;

vi.stubGlobal("window", {
  localStorage: {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failNextWrite) {
        const e = new Error("exceeded the quota");
        e.name = "QuotaExceededError";
        throw e;
      }
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  },
});

async function load() {
  return {
    cache: await import("@/lib/localCache"),
    guard: await import("@/lib/engine/cacheGuard"),
  };
}

beforeEach(async () => {
  store.clear();
  failNextWrite = false;
  const { cache, guard } = await load();
  cache.resetCacheFullState();
  guard.resetCacheFailureNotices();
  vi.restoreAllMocks();
});

describe("E6-AC7 — เขียนแคชไม่ลงต้องไม่เงียบ", () => {
  /**
   * ⚠️ **ตัวควบคุม** — พิสูจน์ว่าทางเขียนปกติ *ไม่* ส่งสัญญาณ
   * 🔴 ถ้าไม่มีเคสนี้ ตัวที่ส่งสัญญาณทุกครั้งจะผ่านเคสหลักได้
   */
  it("เขียนสำเร็จ → ไม่มีสัญญาณ ไม่มีเสียง", async () => {
    const { cache } = await load();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    cache.onCacheFull((k) => seen.push(k));

    cache.writeCache("k1", { a: 1 });

    expect(seen).toEqual([]);
    expect(cache.hasCacheEverBeenFull()).toBe(false);
    expect(err).not.toHaveBeenCalled();
  });

  it("🔴 ที่เก็บเต็ม → ฝั่งนักพัฒนาได้ยิน (`console.error`)", async () => {
    const { cache } = await load();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    failNextWrite = true;

    cache.writeCache("k1", { a: 1 });

    expect(err, "เขียนไม่ลงแล้วเงียบสนิท — นี่คือสภาพเดิมที่ AC7 มีไว้แก้").toHaveBeenCalled();
  });

  /**
   * 🔴 **ใบนี้คือสิ่งที่ `cacheGuard.test.ts` ตอบไม่ได้** — มันยืนยันว่า *ฟังก์ชันดัง*
   * เคสนี้ยืนยันว่า ***`writeCache` เรียกมันจริง*** ซึ่งเป็นคนละคำถาม
   */
  it("🔴 ที่เก็บเต็ม → มีสัญญาณให้ UI เกาะ (ตะขอของครึ่งฝั่งผู้ใช้)", async () => {
    const { cache } = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    cache.onCacheFull((k) => seen.push(k));
    failNextWrite = true;

    cache.writeCache("trip-42", { a: 1 });

    expect(seen, "ไม่มีสัญญาณ → UI ไม่มีทางรู้ → ครึ่งฝั่งผู้ใช้ปิดไม่ได้ตามนิยาม").toEqual(["trip-42"]);
  });

  /**
   * ⚠️ UI มัก mount **หลัง** การเขียนครั้งแรก — ถ้ามีแต่ event ที่ยิงครั้งเดียว
   * คนที่มาสมัครทีหลังจะไม่มีทางรู้ว่าเคยเต็ม
   */
  it("🔴 คนที่สมัครทีหลังต้องยังรู้ว่าเคยเต็ม", async () => {
    const { cache } = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    failNextWrite = true;
    cache.writeCache("k1", { a: 1 });

    expect(cache.hasCacheEverBeenFull(), "UI ที่ mount ทีหลังจะไม่มีทางรู้").toBe(true);
  });

  it("ถอนการสมัครแล้วต้องไม่ถูกเรียกอีก", async () => {
    const { cache } = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    const off = cache.onCacheFull((k) => seen.push(k));
    off();
    failNextWrite = true;

    cache.writeCache("k1", { a: 1 });

    expect(seen).toEqual([]);
  });
});
