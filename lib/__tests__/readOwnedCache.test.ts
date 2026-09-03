import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **`E6-AC14` — ด่านต้องอยู่ที่ *ชั้นที่เก็บ* และต้องปิด *การแข่งกัน* ด้วย** · P1 · 3 ก.ย. 2026
 *
 * ## ช่องที่เคสนี้มีไว้ปิด — และทำไม `deviceOwnerSwitchWipes.test.ts` ปิดไม่ได้
 * ไฟล์นั้นพิสูจน์ว่า `stampDeviceOwner(A→B)` **ล้างข้อมูล** ซึ่งจริง
 * · 🔴 **แต่การล้างเกิดตอน *ตราเปลี่ยน* · การอ่านเกิดตอน *คอมโพเนนต์ mount* — สองอย่างนี้แข่งกัน**
 * ```
 * DeviceOwnerStamp   root layout · ประทับตราจาก onAuthStateChange  → **async**
 * useActiveTripId    root layout เหมือนกัน · อ่าน lastTripId ใน effect → **ทันทีที่ mount**
 * ```
 * 🎯 **ถ้าตัวอ่านชนะการแข่ง มันได้ข้อมูลของเจ้าของเก่าไปหนึ่งเรนเดอร์** — และเคสในไฟล์นั้นมองไม่เห็นเลย
 *    เพราะมันเรียก `stampDeviceOwner` เองก่อนอ่านเสมอ **ซึ่งคือลำดับที่ *ไม่* เกิดในของจริง**
 * · ⚠️ **ทั้งสองไฟล์ถูกต้องในตัวเอง** — บั๊กอยู่ระหว่างมัน ไม่ใช่ในมัน
 */
const store = new Map<string, string>();
const OWNER_KEY = "trip-device-owner";

vi.stubGlobal("window", {
  localStorage: {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

const A = "user-aaaa-1111";
const B = "user-bbbb-2222";
/**
 * 🔴 **คีย์เปล่า ไม่ใส่ prefix เอง** — `localCache` เติม `trip-cache:v{N}:` ให้เอง
 * · ⚠️ ฉบับแรกของเคสนี้เขียน `"trip-cache:lastTripId"` ตรง ๆ ซึ่งเป็น **prefix รุ่นเก่า**
 *   → `sweepLegacyCaches()` กวาดทิ้งทันทีที่อ่าน · **เคสฝั่งบวกแดง และตัวควบคุมเป็นตัวที่จับได้**
 * 🎯 **เทสต์ที่รู้จัก prefix จะล้าทุกครั้งที่ `CACHE_VERSION` ขยับ** — จึงเขียน/อ่านผ่าน API เท่านั้น
 */
const KEY = "lastTripId";

async function load() {
  return await import("@/lib/auth/deviceOwner");
}

/** จำลอง "เครื่องที่ A ใช้งานมาแล้ว" — ตราเป็น A · มีข้อมูลในแคช */
async function deviceOf(owner: string) {
  store.set(OWNER_KEY, owner);
  const { writeCache } = await import("@/lib/localCache");
  writeCache(KEY, "trip-of-" + owner);
}

beforeEach(() => store.clear());

describe("E6-AC14 — readOwnedCache: ชั้นที่เก็บต้องถามว่าใครกำลังดู", () => {
  it("เจ้าของตัวจริงอ่านได้", async () => {
    const { readOwnedCache } = await load();
    await deviceOf(A);
    expect(readOwnedCache<string>(KEY, A)).toBe("trip-of-" + A);
  });

  /**
   * 🔴 **เคสหัวใจ — และเป็นเคสที่ `deviceOwnerSwitchWipes` เดินไปไม่ถึง**
   * ตรายังเป็น `A` (ยังไม่ทันอัปเดต) · ผู้ดูคือ `B` แล้ว ⇒ **ห้ามเสิร์ฟ**
   * นี่คือหน้าต่างที่ตัวอ่านชนะการแข่งกับตัวประทับตรา
   */
  it("🔴 ตรายังเป็น A แต่ผู้ดูคือ B (ตราอัปเดตไม่ทัน) → ต้องไม่ได้ข้อมูล", async () => {
    const { readOwnedCache } = await load();
    await deviceOf(A);
    expect(
      readOwnedCache<string>(KEY, B),
      "ได้ข้อมูลของ A ไปทั้งที่ผู้ดูคือ B — นี่คือหน้าต่างที่ตัวอ่านชนะการแข่ง",
    ).toBeNull();
  });

  /** 🔴 ไม่มี session = ไม่มีใครล็อกอิน ⇒ **ไม่ใช่ "เสิร์ฟให้ทุกคน"** */
  it("🔴 ไม่มี session (viewerId = null) → ไม่เสิร์ฟ", async () => {
    const { readOwnedCache } = await load();
    await deviceOf(A);
    expect(readOwnedCache<string>(KEY, null)).toBeNull();
  });

  /** 🔴 ตราไม่เคยถูกประทับ = ไม่รู้ว่าข้อมูลเป็นของใคร ⇒ fail-closed */
  it("🔴 ไม่มีตรา แต่มีข้อมูลค้างอยู่ → ไม่เสิร์ฟ", async () => {
    const { readOwnedCache } = await load();
    const { writeCache } = await import("@/lib/localCache");
    writeCache(KEY, "trip-ที่ไม่รู้เจ้าของ");
    expect(readOwnedCache<string>(KEY, A)).toBeNull();
  });

  /**
   * ⚠️ **ตัวควบคุมฝั่งลบ — ถ้าไม่มีเคสนี้ ตัวที่คืน `null` เสมอจะผ่านเคสข้างบนทั้งหมด**
   * และ `E6-AC4` (ออฟไลน์อ่านอย่างเดียวต้องใช้ได้) จะพังเงียบ ๆ
   */
  it("ตัวควบคุม: เจ้าของตัวจริงยังอ่านได้หลังเคส fail-closed ทั้งหมด", async () => {
    const { readOwnedCache } = await load();
    await deviceOf(B);
    expect(
      readOwnedCache<string>(KEY, B),
      "คืน null เสมอ → ออฟไลน์ใช้ไม่ได้ (E6-AC4 พังเงียบ)",
    ).toBe("trip-of-" + B);
  });

  it("ไม่มีข้อมูลในแคช แต่ตรากับผู้ดูตรงกัน → null (ไม่ใช่ throw)", async () => {
    const { readOwnedCache } = await load();
    store.set(OWNER_KEY, A);
    expect(readOwnedCache<string>(KEY, A)).toBeNull();
  });
});
