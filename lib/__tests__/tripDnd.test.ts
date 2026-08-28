// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";
import { ITINERARY } from "@/data/koreaTrip";
import type { TripStop } from "@/lib/supabase";
import { useTripDnd } from "@/hooks/useTripDnd";

/**
 * `E5-AC4` (logic) — ตรรกะตัดสินใน `handleDragEnd` ของ `useTripDnd` · เจ้าของ: P4 (27 ส.ค. 2026)
 *
 * ## ทำไมไฟล์นี้ถึงมีอยู่ และทำไมมันถึงหน้าตาแบบนี้ (P1 ตัดสินทาง (ก) · 27 ส.ค.)
 * P2 พิสูจน์แล้วว่า **ลากจริงในเบราว์เซอร์อัตโนมัติไม่ได้** — `dnd-kit` คำนวณ delta จาก `movementX/Y`
 * ที่เบราว์เซอร์ใส่ให้เฉพาะ trusted event · และ `useTripDnd` คือไฟล์ที่ **"ผ่านสนามจริงมาแล้ว ห้ามเขียนใหม่"**
 * → ทางที่เหลือคือ **ทดสอบโค้ดปัจจุบันโดยไม่แตะมันสักบรรทัด**: render hook จริง แล้วเรียก `handleDragEnd`
 * ด้วย event สังเคราะห์ → assert ว่า callback ตัวไหนถูกเรียกด้วย args อะไร
 * · 🔴 **jsdom เฉพาะไฟล์นี้** (`@vitest-environment` บรรทัดแรก) — `vitest.config.mts` ยังเป็น `node` ทั้งชุด ห้ามแตะ
 * · ⚠️ **`jsdom` ตรึงที่ 25** (`//jsdom` ใน `package.json`) — 26+ ให้ `ERR_REQUIRE_ESM` บน Node 20
 *   และอาการคือไฟล์นี้ขึ้น **`no tests` ไม่ใช่ `FAIL`** ซึ่งอ่านผ่านตาเหมือนผ่าน · อย่า bump จนกว่าทุกเครื่อง+CI จะขึ้น Node 22
 *
 * ## 🔴 ขอบเขต — อ่านตรง ๆ (P1 ย้ำให้เขียนติดไฟล์):
 * ✅ ครอบ "ย้ายไฟล์/refactor แล้ว *ตรรกะตัดสิน* เพี้ยน" — กิ่งไหนเรียก callback ไหน ด้วยลำดับ/args อะไร
 * ❌ **ไม่ครอบ "ลากด้วยนิ้ว/เมาส์จริงแล้วได้ผล"** — sensor ‧ hit-testing ‧ delta เป็นของ dnd-kit + เบราว์เซอร์
 *    อันนั้นต้อง **คนลากจริง** (bracket ก่อน/หลัง refactor — P1 ขอผู้ใช้แล้ว) · เขียวที่นี่ ≠ DnD ใช้ได้จริงบนจอ
 */

// showUndoToast แตะ DOM ของ toast จริง — mock เก็บ message+undo ให้เคสตรวจ (undo คือครึ่งหนึ่งของ contract)
// 🔴 **spread ของเดิมกลับเข้าไปเสมอ (`S6`)** — factory ที่ไม่ spread จะ *แทนที่ทั้งโมดูล*:
//    `showToast`/`dismissToast`/`subscribeToasts`/`getToasts`/`getServerToasts` หายหมด **และกลืน export
//    ใหม่ทุกตัวที่ใครเพิ่มทีหลังโดยไม่มีอะไรเตือน** · ฉบับแรกของไฟล์นี้ผิดข้อนี้ (`4ef1898` → แก้ที่นี่)
const toasts = vi.hoisted(() => ({ list: [] as { message: string; undo: () => void }[] }));
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/toast")>()),
  showUndoToast: (message: string, undo: () => void) => {
    toasts.list.push({ message, undo });
  },
}));

// วันจริงจาก itinerary — d0 = hanoi · d1 = busan (ไม่ปั้น Day ปลอม: ตรรกะ cross-city เทียบ city ของวันจริง)
const d0 = ITINERARY[0]; // hanoi
const d1 = ITINERARY[1]; // busan
const HANOI_PLACE = "hanoi-hoan-kiem";
const BUSAN_PLACE = "busan-gamcheon";

function mkStop(id: string, dayId: string, placeId: string, note: string | null = null): TripStop {
  return {
    id,
    plan_id: "plan-x",
    day_id: dayId,
    place_id: placeId,
    order_index: 0,
    dwell_minutes: null,
    travel_mode: null,
    note,
    photo_url: null,
    added_by: null,
    updated_at: null,
  } as TripStop;
}

/** event สังเคราะห์ — handleDragEnd อ่านแค่ active.id/data.current + over.id/data.current */
function dragEvent(
  active: { id: string; data: unknown },
  over: { id: string; data: unknown } | null,
): DragEndEvent {
  return {
    active: { id: active.id, data: { current: active.data } },
    over: over ? { id: over.id, data: { current: over.data } } : null,
  } as unknown as DragEndEvent;
}

function setup(opts: { lockedDays?: string[]; stops?: TripStop[] } = {}) {
  toasts.list.length = 0;
  const stops = opts.stops ?? [
    mkStop("s1", d1.id, BUSAN_PLACE, "โน้ต s1"),
    mkStop("s2", d1.id, BUSAN_PLACE),
    mkStop("s3", d1.id, BUSAN_PLACE),
  ];
  const fns = {
    lastStopPlaceForDay: vi.fn(() => null),
    isDayLocked: vi.fn((dayId: string) => (opts.lockedDays ?? []).includes(dayId)),
    defaultTravelModeFor: vi.fn(() => "walk" as string | null),
    addStop: vi.fn(() => Promise.resolve("new-stop-id" as string | undefined)),
    removeStop: vi.fn((stopId: string) => Promise.resolve(stops.find((s) => s.id === stopId) ?? stops[0])),
    restoreStop: vi.fn(() => Promise.resolve()),
    stashPlaceNote: vi.fn(() => Promise.resolve(true)),
    clearPlaceNote: vi.fn(() => Promise.resolve()),
    reorderStops: vi.fn(() => Promise.resolve()),
    moveStopToDay: vi.fn(() => Promise.resolve()),
    flashNewStop: vi.fn(),
  };
  const { result } = renderHook(() =>
    useTripDnd({
      itinerary: ITINERARY,
      customPlaces: [],
      stops,
      stopsByDay: { [d1.id]: stops },
      who: "ao",
      ...fns,
    }),
  );
  return { fns, stops, handleDragEnd: result.current.handleDragEnd };
}

describe("E5-AC4 (logic) — handleDragEnd ตัดสินถูกกิ่ง", () => {
  it("🔴 ลากการ์ดจากคลังลงวัน (เมืองเดียวกัน) → addStop(วัน, ที่, who, travelMode) + flashNewStop", async () => {
    const { fns, handleDragEnd } = setup();
    handleDragEnd(dragEvent({ id: BUSAN_PLACE, data: { type: "place", placeId: BUSAN_PLACE } }, { id: d1.id, data: { type: "day", dayId: d1.id } }));
    expect(fns.addStop).toHaveBeenCalledWith(d1.id, BUSAN_PLACE, "ao", "walk");
    await vi.waitFor(() => expect(fns.flashNewStop).toHaveBeenCalledWith("new-stop-id"));
    expect(toasts.list, "เมืองเดียวกันต้องไม่มี toast เตือน").toEqual([]);
  });

  it("🔴 ลากที่ 'คนละเมือง' ลงวัน → ทำก่อนแล้วเตือน (ไม่บล็อกเงียบ) · undo = removeStop ตัวที่เพิ่งเพิ่ม", async () => {
    const { fns, handleDragEnd } = setup();
    handleDragEnd(dragEvent({ id: HANOI_PLACE, data: { type: "place", placeId: HANOI_PLACE } }, { id: d1.id, data: { type: "day", dayId: d1.id } }));
    expect(fns.addStop, "คนละเมืองต้อง 'ทำก่อน' ไม่ใช่บล็อก — วันทางผ่านเที่ยว 2 เมืองได้จริง").toHaveBeenCalled();
    await vi.waitFor(() => expect(toasts.list.length).toBe(1));
    toasts.list[0].undo();
    expect(fns.removeStop, "undo ของ toast ต้องถอนจุดแวะที่เพิ่งเพิ่ม").toHaveBeenCalledWith("new-stop-id");
  });

  it("🔴 วันปลายทางล็อก → ไม่รับอะไรเลย (ด่านสุดท้ายกันคีย์บอร์ดหลุด)", () => {
    const { fns, handleDragEnd } = setup({ lockedDays: [d1.id] });
    handleDragEnd(dragEvent({ id: BUSAN_PLACE, data: { type: "place", placeId: BUSAN_PLACE } }, { id: d1.id, data: { type: "day", dayId: d1.id } }));
    expect(fns.addStop).not.toHaveBeenCalled();
  });

  it("🔴 จัดลำดับในวันเดียวกัน — ลาก s1 ไปวางบน s3 → reorderStops ด้วยลำดับ [s2,s3,s1] (arrayMove จริง ไม่ใช่สลับคู่)", () => {
    const { fns, handleDragEnd } = setup();
    handleDragEnd(dragEvent({ id: "s1", data: { type: "stop", dayId: d1.id } }, { id: "s3", data: { type: "stop", dayId: d1.id } }));
    expect(fns.reorderStops, "ลำดับผิด = ผู้ใช้ลากแล้วการ์ดไปโผล่ผิดที่").toHaveBeenCalledWith(d1.id, ["s2", "s3", "s1"]);
  });

  it("ลากวางบนตัวเอง/ไม่มี over → ไม่ทำอะไร (ไม่มี callback ไหนถูกเรียก)", () => {
    const { fns, handleDragEnd } = setup();
    handleDragEnd(dragEvent({ id: "s1", data: { type: "stop", dayId: d1.id } }, { id: "s1", data: { type: "stop", dayId: d1.id } }));
    handleDragEnd(dragEvent({ id: "s1", data: { type: "stop", dayId: d1.id } }, null));
    for (const f of [fns.addStop, fns.removeStop, fns.reorderStops, fns.moveStopToDay]) expect(f).not.toHaveBeenCalled();
  });

  it("🔴 ย้ายจุดแวะข้ามวัน → moveStopToDay(stop, วันใหม่) · คนละเมือง = เตือน + undo ย้ายกลับวันเดิม", async () => {
    const { fns, handleDragEnd } = setup();
    // s1 (busan) → d0 (hanoi) = ข้ามวัน + คนละเมือง
    handleDragEnd(dragEvent({ id: "s1", data: { type: "stop", dayId: d1.id } }, { id: d0.id, data: { type: "day", dayId: d0.id } }));
    expect(fns.moveStopToDay).toHaveBeenCalledWith("s1", d0.id);
    await vi.waitFor(() => expect(toasts.list.length).toBe(1));
    toasts.list[0].undo();
    expect(fns.moveStopToDay, "undo ต้องย้ายกลับวันต้นทาง").toHaveBeenCalledWith("s1", d1.id);
  });

  it("🔴 วันต้นทางล็อก → ลากจุดแวะออกไม่ได้", () => {
    const { fns, handleDragEnd } = setup({ lockedDays: [d1.id] });
    handleDragEnd(dragEvent({ id: "s1", data: { type: "stop", dayId: d1.id } }, { id: d0.id, data: { type: "day", dayId: d0.id } }));
    expect(fns.moveStopToDay).not.toHaveBeenCalled();
  });

  it("🔴 เก็บกลับคลัง — stash โน้ตก่อน แล้วค่อยลบ · undo = restore + ล้างโน้ตที่ฝาก (ไม่งั้นโน้ตค้าง 2 ที่)", async () => {
    const { fns, stops, handleDragEnd } = setup();
    handleDragEnd(dragEvent({ id: "s1", data: { type: "stop", dayId: d1.id } }, { id: "library", data: { type: "library" } }));
    await vi.waitFor(() => expect(fns.removeStop).toHaveBeenCalledWith("s1"));
    expect(fns.stashPlaceNote, "ต้องฝากโน้ต 'ก่อน' ลบแถว — กลับลำดับ = โน้ตหายถ้าลบสำเร็จแต่ stash พัง").toHaveBeenCalledWith(stops[0].place_id, "โน้ต s1", null);
    await vi.waitFor(() => expect(toasts.list.length).toBe(1));
    toasts.list[0].undo();
    await vi.waitFor(() => expect(fns.restoreStop).toHaveBeenCalled());
    expect(fns.clearPlaceNote, "กู้คืนแล้วต้องล้างโน้ตที่ฝากไว้ — ไม่งั้นสถานที่เดียวมีโน้ต 2 ที่").toHaveBeenCalledWith(stops[0].place_id);
  });
});
