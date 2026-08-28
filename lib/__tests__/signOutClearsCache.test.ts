import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `signOut()` ต้องล้างแคชท้องถิ่น **ก่อน** `auth.signOut()` — เจ้าของ: P4-QA/Sec · 28 ส.ค. 2026
 *
 * ## ช่องที่ปิด (P2 เจอ · P1 แก้ `3922389`)
 * เดิม `signOut()` เรียกแค่ `auth.signOut()` → **แคชของคนก่อนยังอยู่บนเครื่องทุกคีย์**
 * และแอป hydrate จากแคชก่อน fetch เสมอ → **คนถัดไปเห็นเฟรมแรกเป็นข้อมูลของคนก่อน**
 *
 * ## 🔴 เคสที่สำคัญที่สุดคือเคสที่ `auth.signOut()` **โยน**
 * `auth.signOut()` ยิงเน็ต · ออฟไลน์แล้วมันโยน → **ถ้าล้างทีหลัง การล้างจะไม่เกิดเลย**
 * · ผู้ใช้กด "ออกจากระบบ" ตอนเน็ตไม่ดี → เห็นว่าออกแล้ว **แต่ข้อมูลยังอยู่ให้คนถัดไปเห็น**
 * 🎯 **ถ้าไม่มีเคสนี้ ใครย้ายบรรทัดกลับไปหลัง `await` จะไม่มีอะไรแดง** (P1 ชี้ · เป็นเหตุผลที่ไฟล์นี้มีอยู่)
 *
 * ## ⚠️ `P-21` — "เหลือ 0" ต้องไม่แปลว่า "ไม่เคยมีของเลย"
 * ทุกเคสยืนยัน **จำนวนคีย์ก่อนล้าง > 0** ก่อนเสมอ · ไม่งั้นตัวกวาดที่พังสนิทจะเขียวตลอดกาล
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

const cap = vi.hoisted(() => ({ signOutCalled: 0, signOutThrows: false }));

// S6: spread ของเดิมกลับ ไม่แทนที่ทั้งโมดูล
vi.mock("@/lib/auth/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/browser")>()),
  createBrowserSupabase: () => ({
    auth: {
      signOut: async () => {
        cap.signOutCalled++;
        if (cap.signOutThrows) throw new Error("network down");
      },
    },
  }),
}));

let store: ReturnType<typeof fakeStorage>;

/** คีย์ที่ต้องถูกกวาด — ทั้งรุ่นปัจจุบันและ **รุ่นเก่า** (`trip-cache:` ที่ไม่มี `v`) */
const CACHE_KEYS = [
  "trip-cache:v2:hotels",
  "trip-cache:v2:stops:plan-1",
  "trip-cache:v2:lastTripId",
  "trip-cache:legacy-ของรุ่นเก่า",
  "trip-cache:bookings",
];
/** คีย์ของคนอื่นบนเครื่องเดียวกัน — **ห้ามแตะ** */
const FOREIGN_KEYS = ["theme", "sb-auth-token", "some-other-app:state"];

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal("window", { localStorage: store });
  cap.signOutCalled = 0;
  cap.signOutThrows = false;
  vi.resetModules();
  for (const k of [...CACHE_KEYS, ...FOREIGN_KEYS]) store.setItem(k, "x");
});

const cacheKeysLeft = () => [...store._map.keys()].filter((k) => k.startsWith("trip-cache:"));

describe("signOut() ล้างแคชท้องถิ่น", () => {
  it("ควบคุมฝั่งบวก — ก่อนล้างต้องมีของจริง ไม่งั้น 'เหลือ 0' ไม่ได้แปลว่ากวาดสำเร็จ", () => {
    expect(cacheKeysLeft().length, "ตั้งต้นต้องมีคีย์แคชอยู่จริง").toBe(CACHE_KEYS.length);
  });

  it("🔴 ล้างคีย์แคชครบทุกคีย์ — รวม **คีย์รุ่นเก่า** ที่ `sweepLegacyCaches` ยังไม่เคยเก็บ", async () => {
    const { signOut } = await import("../auth/signIn");
    await signOut();
    expect(cacheKeysLeft(), "คีย์แคชต้องไม่เหลือเลย").toEqual([]);
  });

  it("🔴 ไม่แตะคีย์ของคนอื่นบนเครื่องเดียวกัน", async () => {
    const { signOut } = await import("../auth/signIn");
    await signOut();
    expect([...store._map.keys()].sort(), "กวาดเกินขอบเขต = ลบของแอปอื่น").toEqual([...FOREIGN_KEYS].sort());
  });

  it("🔴🔴 `auth.signOut()` โยน (ออฟไลน์) → แคชต้อง **ถูกล้างไปแล้ว** อยู่ดี", async () => {
    // 🎯 หัวใจของไฟล์นี้ — ย้าย `clearAllCaches()` ไปหลัง `await` เมื่อไหร่ เคสนี้แดงทันที
    cap.signOutThrows = true;
    const { signOut } = await import("../auth/signIn");
    await expect(signOut(), "signOut ต้องโยนต่อ ไม่กลืน error").rejects.toThrow("network down");
    expect(cap.signOutCalled, "ต้องได้ยิง auth.signOut() จริง — ไม่งั้นเคสนี้พิสูจน์แค่ว่าไม่มีอะไรเกิดขึ้น").toBe(1);
    expect(cacheKeysLeft(), "โยนแล้วแคชยังอยู่ = ล้างทีหลัง `await` (ลำดับผิด)").toEqual([]);
  });

  it("localStorage ถูกปิด → ไม่โยนจากขั้นล้าง และยังเรียก `auth.signOut()` ต่อ", async () => {
    vi.stubGlobal("window", { get localStorage(): Storage { throw new Error("blocked"); } });
    const { signOut } = await import("../auth/signIn");
    await expect(signOut()).resolves.toBeUndefined();
    expect(cap.signOutCalled).toBe(1);
  });
});
