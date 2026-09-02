import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **`E6-AC14` — ด่านเปลี่ยนเจ้าของเครื่อง ต้องอยู่ที่ *ชั้นที่เก็บ* ไม่ใช่ที่หน้าจอ**
 * เจ้าของ AC: โซน P7 (ยังไม่มีใครถือ) · เขียนโดย P1 · 2 ก.ย. 2026 · ต้นเรื่อง: P4 เจอระหว่างตรวจ `de4b005`
 *
 * ## 🔴 บั๊กที่เคสนี้มีไว้จับ — และทำไมเคสเดิมจับไม่ได้
 * ด่าน *"เจ้าของเปลี่ยนโดยไม่กด sign-out"* เคยมีจุดเดียวคือ `components/HomeScreen.tsx`
 * · **ผู้อ่าน `lastTripId` คือ `hooks/useActiveTripId.ts` ซึ่งถูกเรียกจาก `app/layout.tsx` (root)**
 * ⇒ **สลับบัญชี แล้วเปิดลิงก์ทริปตรง ๆ ตอนออฟไลน์ = ไม่เคยผ่านหน้าแรกเลยสักครั้ง**
 *   → ได้ `lastTripId` ของเจ้าของเก่าไปใช้ต่อ
 * 🎯 **`de4b005` ปิดแค่เส้น sign-out — ไม่ใช่คลาสทั้งหมด** (P4 กำชับไว้ตอนส่ง AC)
 *
 * ## ⚠️ เคสในไฟล์นี้จงใจ **ไม่แตะ `HomeScreen` เลย**
 * ถ้าเรียกผ่านหน้าจอ มันจะเขียวด้วยด่านเดิม แล้วเราจะไม่รู้ว่าชั้นที่เก็บทำงานหรือเปล่า
 * · **จำลองเส้นทางที่บั๊กใช้จริง: ประทับตรา → สลับตรา → อ่านแคช** ไม่มีหน้าจอในสมการ
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

const A = "user-aaaa-1111";
const B = "user-bbbb-2222";
const LAST_TRIP = "trip-cache:lastTripId";

let store: ReturnType<typeof fakeStorage>;

async function load() {
  return await import("@/lib/auth/deviceOwner");
}

/** จำลองสภาพ "เครื่องของ A ที่ใช้งานมาแล้ว" — มีตรา + มีข้อมูลทริปในแคช */
function deviceUsedBy(ownerId: string) {
  store._map.set("trip-device-owner", ownerId);
  store._map.set(LAST_TRIP, JSON.stringify("trip-of-" + ownerId));
}

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal("window", { localStorage: store });
  vi.stubGlobal("localStorage", store);
  idb.clearCalls = 0;
});

describe("E6-AC14 — สลับเจ้าของเครื่องต้องล้างข้อมูลที่ชั้นที่เก็บ", () => {
  it("🔴 A → B: `lastTripId` ของ A ต้องหายไป **โดยไม่ผ่าน HomeScreen เลย**", async () => {
    const { stampDeviceOwner } = await load();
    deviceUsedBy(A);
    // ⚠️ `P-21` — ยืนยันว่า "มีของก่อนล้าง" ไม่งั้นตัวกวาดที่พังสนิทจะเขียวตลอดกาล
    expect(store.getItem(LAST_TRIP), "ตั้งต้นไม่มีข้อมูลของ A — เคสนี้จะไม่ได้วัดอะไร").not.toBeNull();

    stampDeviceOwner(B);

    expect(store.getItem(LAST_TRIP), "ข้อมูลของเจ้าของเก่ายังอยู่หลังสลับบัญชี").toBeNull();
    expect(store.getItem("trip-device-owner"), "ตราต้องเป็นของเจ้าของใหม่").toBe(B);
  });

  it("🔴 ล้างที่เก็บใบที่สองด้วย ไม่ใช่แค่ localStorage", async () => {
    const { stampDeviceOwner } = await load();
    deviceUsedBy(A);
    stampDeviceOwner(B);
    expect(idb.clearCalls, "IndexedDB ไม่ถูกล้างตอนสลับเจ้าของ").toBeGreaterThan(0);
  });

  /**
   * ⚠️ **เคสควบคุมฝั่งลบ — ถ้าไม่มี ด่านที่ล้างทุกครั้งจะเขียวหมด**
   * `null → X` คือเครื่องเปล่าหรือเพิ่งรู้จักเจ้าของ · **ไม่มีข้อมูลของใครให้ล้าง**
   */
  it("null → X: ไม่ล้าง (เครื่องเปล่า/เพิ่งรู้จักเจ้าของ)", async () => {
    const { stampDeviceOwner } = await load();
    store._map.set(LAST_TRIP, JSON.stringify("trip-เก่าที่ยังไม่รู้เจ้าของ"));
    stampDeviceOwner(A);
    expect(store.getItem(LAST_TRIP)).not.toBeNull();
    expect(idb.clearCalls).toBe(0);
  });

  /**
   * ⚠️ **เคสควบคุมฝั่งลบใบที่สอง — และเป็นใบที่กันของที่แย่กว่าเคสข้างบน**
   * `X → null` คือ sign-out ซึ่ง `signOut()` ล้างเองอยู่แล้ว
   * 🔴 **ถ้าล้างที่นี่ด้วย session ที่กะพริบชั่วขณะจะกวาดแคชทิ้งโดยไม่มีใครสลับบัญชี** — ผู้ใช้เสียแคชฟรี
   */
  it("X → null: ไม่ล้าง (sign-out มีทางล้างของตัวเองอยู่แล้ว · และ session กะพริบต้องไม่กวาดแคช)", async () => {
    const { stampDeviceOwner } = await load();
    deviceUsedBy(A);
    stampDeviceOwner(null);
    expect(store.getItem(LAST_TRIP), "session กะพริบแล้วแคชหาย").not.toBeNull();
    expect(idb.clearCalls).toBe(0);
  });

  /**
   * 🔴 **`X → null → Y` — รูที่เคสอีก 6 ข้อเดินผ่านไม่ถึง** (P7 เจอ · ยิงพิสูจน์บน worktree ที่หมุด)
   *
   * **เส้นทางที่เกิดง่ายที่สุดในโลกจริง:** refresh token หมดอายุ (โดยเฉพาะตอนออฟไลน์)
   * → ผู้ใช้เห็นหน้า login → **ล็อกอินเป็นอีกบัญชี** = *"สลับบัญชีโดยไม่กด sign-out"* ตรงถ้อยคำ AC
   *
   * 🎯 **ต้นเหตุ: ตราตอบคนละคำถามกับที่โค้ดใช้มันอยู่**
   * ```
   * ตราเคยตอบว่า  "ตอนนี้ใครล็อกอินอยู่"        → ต้องลบเมื่อไม่มีใครล็อกอิน
   * ตราต้องตอบว่า  "ข้อมูลในเครื่องนี้เป็นของใคร" → **ไม่มีเหตุให้ลบตอน session หาย เพราะข้อมูลยังอยู่**
   * ```
   * 🔴 **และหลักการนี้อยู่ในเคสข้างล่างอยู่แล้ว** (*ตราต้องรอด `clearAllCaches()`*) —
   * **`removeItem` ตอน `null` ขัดกับเคสที่ไฟล์นี้เขียนเอง** · ตราต้องอยู่ *นานกว่า* ข้อมูล ไม่ใช่สั้นกว่า
   */
  it("🔴 X → null → Y: session หมดอายุแล้วอีกคนล็อกอิน — ข้อมูลของคนเก่าต้องหาย", async () => {
    const { stampDeviceOwner } = await load();
    deviceUsedBy(A);
    stampDeviceOwner(null);   // session หมดอายุ — **ไม่ได้กด sign-out จึงไม่มีใครล้างให้**
    expect(store.getItem(LAST_TRIP), "ตั้งต้นผิด: ข้อมูลหายไปตั้งแต่ session หมดอายุ").not.toBeNull();
    stampDeviceOwner(B);
    expect(store.getItem(LAST_TRIP), "ข้อมูลของ A ยังอยู่หลัง B ล็อกอิน").toBeNull();
  });

  it("X → X (ยืนยันตราซ้ำตอนเปิดแอป): ไม่ล้าง", async () => {
    const { stampDeviceOwner } = await load();
    deviceUsedBy(A);
    stampDeviceOwner(A);
    expect(store.getItem(LAST_TRIP), "เปิดแอปซ้ำแล้วแคชหาย").not.toBeNull();
    expect(idb.clearCalls).toBe(0);
  });

  /**
   * 🔴 **ตราต้องรอด `clearAllCaches()`** — ไม่งั้นล้างแคชแล้วลืมว่าใครเป็นเจ้าของ
   * → ครั้งถัดไป `readDeviceOwner()` คืน `null` → กลายเป็นเคส `null → X` → **ไม่ล้างอีกเลยตลอดกาล**
   * · นี่คือเหตุผลที่ `OWNER_KEY` อยู่นอก `trip-cache:` และเคสนี้คือสิ่งที่บังคับมัน
   */
  it("🔴 ตราเจ้าของต้องไม่ถูกกวาดไปพร้อมแคช — ไม่งั้นด่านนี้ตายเงียบตั้งแต่ครั้งที่สอง", async () => {
    const { stampDeviceOwner, readDeviceOwner } = await load();
    deviceUsedBy(A);
    stampDeviceOwner(B);
    expect(readDeviceOwner(), "ตราหายไปพร้อมแคช → รอบหน้าจะกลายเป็น null→X แล้วไม่ล้างอีกเลย").toBe(B);
  });
});
