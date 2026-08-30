// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

/**
 * 🔴 **`subscribe()` ต้องเกิดครั้งเดียวต่อ `(tripId, planId)`** — `E6-AC11` ก้าวที่ 2
 * เจ้าของ: P3-FE/Perf · 30 ส.ค. 2026 · เกณฑ์รับข้อนี้มาจาก P1 โดยตรง
 *
 * ## ทำไมต้องมีเคสนี้ ทั้งที่วันนี้ Realtime ไม่ส่งอะไรเลย
 * `AC11` ย้าย "วัน" ไป provider เดียว · ทางที่ง่ายที่สุดคือใส่ `rows`/`bridge` ลง deps ของเอฟเฟกต์เดิม
 * **ซึ่งถือ `subscribe()` อยู่ด้วย** → `hydrateThenFetch` ยิง `applyCache` แล้ว `applyFresh`
 * = "วัน" เปลี่ยน identity 2 รอบ = **subscribe/unsubscribe 2 รอบต่อการโหลดหนึ่งครั้ง**
 *
 * 🎯 **จังหวะที่ทดสอบได้ กับ จังหวะที่มันจะกัด เป็นคนละจังหวะ** (P1):
 * ```
 * วันนี้              publication ว่าง (`E3-AC3`) → churn ไม่มีผล → **แต่เขียนเคสนับได้**
 * วันเปิด publication  churn มีผลทันที → โผล่มาพร้อมของใหม่อีกสิบอย่าง → **แยกไม่ออกว่าใครทำ**
 * ```
 * · **วันนี้มันเป็นเคสหน่วยเดียว · วันนั้นมันเป็นอาการบนโปรดักชัน**
 *
 * ⚠️ **เคสนี้ไม่ได้ทดสอบว่า Realtime ทำงาน** — มันทดสอบว่า *จำนวนครั้งที่สมัคร* ไม่ผูกกับ "วัน"
 *    ห้ามอ่านว่าเป็นหลักฐานว่า realtime ส่ง event ได้ (วันนี้มันไม่ส่ง และนั่นคือ `E6-AC2b`)
 */

const subscribe = vi.fn();
const removeChannel = vi.fn();
/**
 * 🔴 **`.subscribe()` ต้องคืน channel** — ของจริงคืน · โค้ดเก็บผลลัพธ์ไว้เพื่อ `removeChannel` ตอน cleanup
 * ฉบับแรกของ mock นี้คืน `undefined` → `if (channel)` เป็นเท็จ → **cleanup ไม่เคยเก็บ channel**
 * และ **เคสควบคุมฝั่งบวกข้างล่างเป็นตัวจับ** ไม่ใช่เคสหลัก — เคสหลักยังเขียวสบายกับ mock ที่ผิด
 * 🎯 *mock ที่ไม่ซื่อกับของจริง ทำให้เคสทดสอบสิ่งที่ไม่มีอยู่* · เคสควบคุมจึงไม่ใช่ของประดับ
 */
const channel = vi.fn(() => {
  const api = { on: vi.fn(() => api), subscribe: subscribe.mockImplementation(() => api) };
  return api;
});

vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: { channel, removeChannel },
}));
vi.mock("@/lib/localCache", () => ({ readCache: () => null, writeCache: vi.fn() }));
vi.mock("@/lib/engine/fetchReadJson", () => ({ fetchReadJson: async () => [] }));
vi.mock("@/lib/writeGuard", () => ({ writeGuard: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

/** ค่าที่ provider จะคืน — เปลี่ยน identity ได้เหมือนของจริง (hydrate → fetch) */
let daysValue: { rows: unknown[] | null; bridge: { dayKeyToDbId: Map<string, string>; unmatchedLegacy: string[] } };
vi.mock("@/hooks/useTripDays", () => ({ useTripDays: () => daysValue }));

const bridgeOf = (ids: string[]) => ({
  dayKeyToDbId: new Map(ids.map((i) => [i, i])),
  unmatchedLegacy: [] as string[],
});

const { useDaySettings } = await import("@/hooks/useDaySettings");

describe("🔴 E6-AC11 — subscribe() ครั้งเดียวต่อ (tripId, planId)", () => {
  beforeEach(() => {
    subscribe.mockClear();
    channel.mockClear();
    removeChannel.mockClear();
    daysValue = { rows: null, bridge: bridgeOf([]) };
  });

  it("🔴 'วัน' เปลี่ยน identity สองรอบ (hydrate → fetch) — subscribe ต้องยังเป็น 1", async () => {
    const { rerender } = renderHook(() => useDaySettings("trip-1", "plan-1"));
    expect(subscribe).toHaveBeenCalledTimes(1);

    // รอบที่ 1: แคชมาถึง
    daysValue = { rows: [{ id: "d1" }], bridge: bridgeOf(["d1"]) };
    rerender();
    // รอบที่ 2: ของสดมาทับ — **อาเรย์คนละใบ** เหมือน `hydrateThenFetch` ของจริง
    daysValue = { rows: [{ id: "d1" }, { id: "d2" }], bridge: bridgeOf(["d1", "d2"]) };
    rerender();

    expect(
      subscribe,
      "subscribe ถูกเรียกใหม่ตอน 'วัน' เปลี่ยน — แปลว่า rows/bridge หลุดเข้า deps ของเอฟเฟกต์ที่ถือ channel",
    ).toHaveBeenCalledTimes(1);
  });

  it("🔴 เคสควบคุมฝั่งบวก — เปลี่ยน planId แล้ว subscribe ต้องเกิดใหม่จริง", () => {
    // ถ้าไม่มีเคสนี้ `subscribe` ที่ถูกเรียก 1 ครั้งอาจแปลว่า "ไม่เคยสมัครเลย" ก็ได้
    const { rerender } = renderHook(({ p }: { p: string }) => useDaySettings("trip-1", p), {
      initialProps: { p: "plan-1" },
    });
    expect(subscribe).toHaveBeenCalledTimes(1);
    rerender({ p: "plan-2" });
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(removeChannel, "ต้องเก็บ channel เก่าก่อนสมัครใหม่").toHaveBeenCalled();
  });
});
