import { beforeEach, describe, expect, it, vi } from "vitest";
import { __cachePrefixForTests as PREFIX } from "../localCache";

/**
 * `D17`/`E6` — แคชในเครื่องต้องมีเวอร์ชันของ *รูปข้อมูล* (P7 เจอ · P1 ลง · 26 ส.ค. 2026)
 *
 * 🔴 **เคสพวกนี้กันเหตุการณ์ที่ยังไม่เกิด และจะเกิดครั้งเดียวในชีวิตโปรเจกต์: `E7` cutover**
 * แอป hydrate จากแคชก่อน fetch เสมอ → เฟรมแรกหลัง cutover คือข้อมูลรูปเก่า
 * `sortStops` เทียบ `order_index` ที่สคีมาใหม่ไม่มี → `NaN` → **ลำดับจุดแวะมั่วโดยไม่มี error**
 * และมันไม่หายเองจนกว่าผู้ใช้จะล้าง site data **ซึ่งไม่มีใครทำ**
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

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal("window", { localStorage: store });
  // sweep ทำครั้งเดียวต่อโมดูล — รีเซ็ตสถานะโดยโหลดใหม่
  vi.resetModules();
});

describe("แคชในเครื่องต้องมีเวอร์ชัน", () => {
  it("🔴 คีย์ต้องมีเลขเวอร์ชัน — คีย์เปล่าคือคีย์ที่ไม่มีอะไรบอกว่าข้างในเป็นรูปไหน", () => {
    expect(PREFIX).toMatch(/^trip-cache:v\d+:$/);
  });

  it("อ่าน/เขียนรอบปกติยังทำงาน", async () => {
    const m = await import("../localCache");
    m.writeCache("stops:p1", [{ id: "a" }]);
    expect(m.readCache("stops:p1")).toEqual([{ id: "a" }]);
  });

  it("🔴 ของรุ่นเก่าต้องอ่านไม่เจอ — ไม่งั้นเฟรมแรกหลัง cutover เป็นข้อมูลรูปเก่า", async () => {
    store.setItem("trip-cache:stops:p1", JSON.stringify([{ id: "old", order_index: 3 }]));
    const m = await import("../localCache");
    expect(m.readCache("stops:p1")).toBeNull();
  });

  it("🔴 และต้องถูก **กวาดทิ้ง** ไม่ใช่แค่เลิกอ่าน — ของเก่ากินโควตา 5 MB ค้างตลอดกาล", async () => {
    store.setItem("trip-cache:stops:p1", "[]");
    store.setItem("trip-cache:customPlaces", "[]");
    const m = await import("../localCache");
    m.readCache("อะไรก็ได้");
    expect([...store._map.keys()].filter((k) => k.startsWith("trip-cache:") && !k.startsWith(PREFIX)))
      .toEqual([]);
  });

  it("ไม่แตะคีย์ของคนอื่นใน localStorage", async () => {
    store.setItem("sb-auth-token", "อย่าลบ");
    store.setItem("trip-cache:เก่า", "[]");
    const m = await import("../localCache");
    m.readCache("x");
    expect(store.getItem("sb-auth-token")).toBe("อย่าลบ");
  });

  it("localStorage ถูกปิด → ไม่โยน", async () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage { throw new Error("blocked"); },
    });
    const m = await import("../localCache");
    expect(() => m.readCache("x")).not.toThrow();
    expect(() => m.writeCache("x", 1)).not.toThrow();
  });
});
