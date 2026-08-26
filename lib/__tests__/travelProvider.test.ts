import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRealTravelTime, fetchRealTravelTimeOutcome } from "@/lib/travelProvider";

/**
 * `lib/travelProvider.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 **`fetch` ถูกแทนที่ระดับ global ไม่ใช่ `vi.mock` ของโมดูลเรา** — จงใจ
 * `S6` ห้าม mock โมดูล `@/…` แบบแทนที่ทั้งก้อน · และที่นี่ไม่ต้องเลย เพราะสิ่งที่อยากคุมคือ
 * **ขอบนอกจริง (HTTP)** ไม่ใช่โมดูลของเรา → **ทดสอบตรรกะจริงทั้งเส้น ไม่ใช่ทดสอบตัวจำลอง**
 */
const OLD_KEY = process.env.GOOGLE_MAPS_API_KEY;
const A = { lat: 37.5665, lng: 126.978 };
const B = { lat: 35.1796, lng: 129.0756 };

beforeEach(() => { process.env.GOOGLE_MAPS_API_KEY = "test-key"; });
afterEach(() => {
  if (OLD_KEY === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = OLD_KEY;
  vi.unstubAllGlobals();
});

const reply = (body: unknown, ok = true, status = 200) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok, status, json: async () => body,
  } as unknown as Response));

describe("fetchRealTravelTimeOutcome — แยกสาเหตุที่เคยยุบเป็น null ตัวเดียว", () => {
  it("ได้เส้นทางจริง", async () => {
    reply({ routes: [{ duration: "1800s", distanceMeters: 325000 }] });
    const r = await fetchRealTravelTimeOutcome(A, B, "transit");
    expect(r).toEqual({ ok: true, value: { durationMinutes: 30, distanceMeters: 325000 } });
  });

  it("🔴 `200` + ไม่มี route → `no_route` (**ถาวร**) — นี่คือเคสของเกาหลี/`drive`", async () => {
    // ผู้ให้บริการ *ตอบแล้ว* ว่าให้ไม่ได้ · ลองใหม่กี่ครั้งก็ได้คำตอบเดิม → Copilot ต้องบอกว่า "อย่ารอ"
    reply({ routes: [] });
    expect(await fetchRealTravelTimeOutcome(A, B, "drive")).toEqual({ ok: false, reason: "no_route" });
    reply({});
    expect(await fetchRealTravelTimeOutcome(A, B, "walk")).toEqual({ ok: false, reason: "no_route" });
  });

  it("🔴 HTTP ไม่ผ่าน → `provider_failed` (**ชั่วคราว**) — quota/5xx", async () => {
    for (const status of [429, 500, 503, 403]) {
      reply({}, false, status);
      expect(await fetchRealTravelTimeOutcome(A, B, "transit"), String(status))
        .toEqual({ ok: false, reason: "provider_failed" });
    }
  });

  it("🔴 `fetch` **โยน** (เน็ตหลุด/DNS) → `provider_failed` ไม่ใช่ error หลุดขึ้นไป", async () => {
    // ⚠️ `fetch` ไม่ได้คืน response ที่ `!ok` ตอนเน็ตหลุด — **มันโยน**
    //    ฉบับก่อน 27 ส.ค. 2026 ไม่ดัก → error หลุดถึงผู้เรียก **ขัดกับสัญญาของฟังก์ชันเอง**
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(fetchRealTravelTimeOutcome(A, B, "transit")).resolves
      .toEqual({ ok: false, reason: "provider_failed" });
  });

  it("คำตอบผิดรูป → `provider_failed` ไม่ใช่ `no_route`", async () => {
    // ตอบมาแล้วแต่แปลงไม่ได้ = ความล้มเหลวของการถาม · ต่างจาก "ตอบว่าไม่มีเส้นทาง"
    reply({ routes: [{ duration: "ไม่ใช่ตัวเลข" }] });
    expect(await fetchRealTravelTimeOutcome(A, B, "transit")).toEqual({ ok: false, reason: "provider_failed" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); },
    } as unknown as Response));
    expect(await fetchRealTravelTimeOutcome(A, B, "transit")).toEqual({ ok: false, reason: "provider_failed" });
  });

  it("🔴 ไม่มีคีย์ → `not_configured` **แยกจาก `provider_failed`**", async () => {
    // ไม่มีคีย์คือปัญหาของ *เรา* ไม่ใช่ของผู้ให้บริการ
    // ยุบรวมกัน = **สภาพแวดล้อมที่ตั้งค่าไม่ครบจะดูเหมือน Google ล่ม** แล้วไล่ผิดที่
    delete process.env.GOOGLE_MAPS_API_KEY;
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchRealTravelTimeOutcome(A, B, "transit")).toEqual({ ok: false, reason: "not_configured" });
    expect(spy, "ไม่มีคีย์แล้วยังยิง = เผาคำขอเปล่า").not.toHaveBeenCalled();
  });

  it("โหมดถูกแปลงเป็นคำของ Google · `drive` ขอ TRAFFIC_AWARE", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ routes: [] }) } as unknown as Response);
    vi.stubGlobal("fetch", spy);
    await fetchRealTravelTimeOutcome(A, B, "walk");
    expect(JSON.parse(spy.mock.calls[0][1].body).travelMode).toBe("WALK");
    await fetchRealTravelTimeOutcome(A, B, "drive");
    const body = JSON.parse(spy.mock.calls[1][1].body);
    expect(body.travelMode).toBe("DRIVE");
    expect(body.routingPreference).toBe("TRAFFIC_AWARE");
  });

  it("ยิงไปที่ `routes.googleapis.com` เท่านั้น (`E4-AC6` ห้าม legacy)", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ routes: [] }) } as unknown as Response);
    vi.stubGlobal("fetch", spy);
    await fetchRealTravelTimeOutcome(A, B, "transit");
    expect(spy.mock.calls[0][0]).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
  });
});

describe("fetchRealTravelTime — เปลือกบางของตัวข้างบน", () => {
  it("🔴 ทุกสาเหตุยังยุบเป็น `null` เหมือนเดิม — ผู้เรียกเดิมไม่ต้องแก้", async () => {
    reply({ routes: [{ duration: "600s", distanceMeters: null }] });
    expect(await fetchRealTravelTime(A, B, "transit")).toEqual({ durationMinutes: 10, distanceMeters: null });
    reply({ routes: [] });
    expect(await fetchRealTravelTime(A, B, "drive")).toBeNull();
    reply({}, false, 500);
    expect(await fetchRealTravelTime(A, B, "transit")).toBeNull();
  });

  it("🎯 ทั้งสองตัวเดินตรรกะชุดเดียวกัน — ไม่มีทางแยกกันได้", async () => {
    // นี่คือเหตุผลที่เขียนตัวเก่าเป็นเปลือก **ไม่ใช่โค้ดคนละชุด**
    // สองชุดที่ต่างกันนิดเดียว = ช่องจะไปอยู่ตรงตัวที่หลวมกว่า โดยอ่านทีละอันแล้วถูกทั้งคู่ (`D46`)
    reply({ routes: [{ duration: "1800s", distanceMeters: 1 }] });
    const outcome = await fetchRealTravelTimeOutcome(A, B, "transit");
    reply({ routes: [{ duration: "1800s", distanceMeters: 1 }] });
    expect(await fetchRealTravelTime(A, B, "transit")).toEqual(outcome.ok ? outcome.value : null);
  });
});
