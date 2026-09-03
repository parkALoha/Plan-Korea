// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import { CacheFullBanner } from "@/components/CacheFullBanner";
import { resetCacheFullState, writeCache } from "@/lib/localCache";

/**
 * **`E6-AC7` ครึ่งฝั่งผู้ใช้** — *ผู้ใช้จริงรู้ไหมว่าแคชเต็ม*
 * เจ้าของ: P2-UI/UX · 3 ก.ย. 2026 · ครึ่งฝั่งนักพัฒนา + ตะขออยู่ใน `cacheFullSignal.test.ts` (P1)
 *
 * ## 🔴 สิ่งที่เคสในไฟล์นี้มีไว้จับ — **แถบที่ต่อสายไม่ครบ**
 * ```
 * เต็ม "ก่อน" แถบ mount   ← เกิดบ่อยที่สุด (แคชถูกเขียนตั้งแต่หน้าแรกโหลด)
 * เต็ม "หลัง" แถบ mount   ← ผู้ใช้ที่เปิดค้างไว้แล้วเต็มระหว่างใช้งาน
 * ```
 * **ต่อแค่ทางเดียวจะเขียวครึ่งเดียว และครึ่งที่ขาดจะเงียบสนิท** — ไม่มีอะไรบนจอบอกว่าพลาดอันไหนไป
 *
 * ## ⚠️ สิ่งที่เคสนี้ **ไม่ได้** พิสูจน์
 * มันพิสูจน์ว่า *แถบโผล่เมื่อสัญญาณดัง* · **ไม่ได้พิสูจน์ว่าผู้ใช้จริงเห็นมันบนจอ** —
 * ที่ `app/layout.tsx` วางไว้ถูกที่ไหม ทับกับแถบอื่นไหม อ่านออกบนมือถือไหม **ยังไม่มีใครเห็นด้วยตา**
 * 🔴 **ห้ามอ่านไฟล์นี้ว่า `AC7` ปิดแล้ว** — ความผิดพลาดแบบเดียวกับที่ทำให้ครึ่งแรกถูกติ๊กไปก่อน
 */
describe("CacheFullBanner", () => {
  beforeEach(() => {
    resetCacheFullState();
    // ทำให้ localStorage เต็มตามสั่ง — เคสจริงคือ QuotaExceededError จากเบราว์เซอร์
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
  });
  afterEach(() => {
    /* ไม่มี setup กลางที่เรียก cleanup ให้ — ถ้าไม่ถอด DOM เอง แถบจากเคสก่อนจะค้างอยู่
       แล้วเคสถัดไปจะเห็น <div role="status"> ของเคสเก่า **แล้วอ่านเป็นผลของตัวเอง** */
    cleanup();
    vi.restoreAllMocks();
    resetCacheFullState();
  });

  it("เงียบสนิทตอนที่เก็บยังไม่เต็ม", () => {
    render(<CacheFullBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("เต็ม *ก่อน* แถบ mount → แถบต้องขึ้น (อ่านย้อนหลัง)", () => {
    writeCache("อะไรก็ได้", { a: 1 });
    render(<CacheFullBanner />);
    expect(screen.getByRole("status").textContent).toContain("ที่เก็บในเครื่องเต็ม");
  });

  it("เต็ม *หลัง* แถบ mount → แถบต้องขึ้นเอง ไม่ต้องรีโหลด (สมัครฟัง)", () => {
    render(<CacheFullBanner />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => writeCache("อะไรก็ได้", { a: 1 }));
    expect(screen.getByRole("status").textContent).toContain("ที่เก็บในเครื่องเต็ม");
  });

  it("ข้อความบอก *ผลกับผู้ใช้* ไม่ใช่ชื่อความผิดพลาดทางเทคนิค", () => {
    /* คนที่กำลังจะขึ้นเครื่องต้องตัดสินใจจาก "ของที่เปิดดูจะยังอยู่ไหมตอนไม่มีเน็ต"
       ไม่ใช่จากคำว่า localStorage / quota ซึ่งไม่ได้บอกอะไรเขาเลย */
    writeCache("อะไรก็ได้", { a: 1 });
    render(<CacheFullBanner />);
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("ไม่มีเน็ต");
    expect(text.toLowerCase()).not.toContain("localstorage");
    expect(text.toLowerCase()).not.toContain("quota");
  });

  it("ปิดได้ และปิดแล้วหายไปจริง", () => {
    writeCache("อะไรก็ได้", { a: 1 });
    render(<CacheFullBanner />);
    act(() => screen.getByLabelText("ปิดข้อความนี้").click());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
