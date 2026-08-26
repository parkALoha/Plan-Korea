import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";
import { getToasts, dismissToast } from "@/lib/toast";

/**
 * `fetchReadJson` **สัญญาว่าไม่โยน** — ไฟล์นี้บังคับให้สัญญานั้นจริง เจ้าของ: P3 · 27 ส.ค. 2026
 *
 * ## 🔴 ทำไมข้อนี้สำคัญกว่าที่หน้าตาบอก
 * 19 จุดใน `hooks/` เขียน `const res = await fetch(...); if (!res.ok) {...}` โดยเชื่อว่า `await fetch()`
 * ไม่โยน — แต่มันโยนเองเมื่อคำขอไปไม่ถึงปลายทาง (เน็ตขาด/DNS ล่ม/timeout) ทำให้ `setLoaded(true)` ที่ต้องรัน
 * เสมอไม่เคยถูกเรียก → ค้างที่หน้าโหลดตลอดไป รูปเดียวกับที่ P1 แก้ใน `lib/googlePlaces.ts` วันนี้
 * (ดู `lib/__tests__/googlePlacesUnreachable.test.ts`) — ไฟล์นี้คือเวอร์ชันของฝั่ง `hooks/`
 */

function clearAllToasts() {
  for (const t of getToasts()) dismissToast(t.id);
}

beforeEach(() => {
  clearAllToasts();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearAllToasts();
});

describe("fetchReadJson ไม่โยนไม่ว่าเกิดอะไรขึ้น", () => {
  it("fetch โยน (เน็ตขาด/DNS ล่ม) → คืน null ไม่ใช่โยนต่อ + toast บอก 'ติดต่อไม่ได้'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const out = await fetchReadJson("/api/engine/trips/x/days");
    expect(out).toBeNull();
    const last = getToasts().at(-1);
    expect(last?.message).toBe("ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  });

  it("ไปถึงแล้วถูกปฏิเสธ (!res.ok) → คืน null + toast บอกรหัสสถานะ", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const out = await fetchReadJson("/api/engine/trips/x/days");
    expect(out).toBeNull();
    const last = getToasts().at(-1);
    expect(last?.message).toBe("โหลดข้อมูลไม่สำเร็จ (500) — ข้อมูลที่เห็นอาจไม่ล่าสุด ลองรีเฟรชอีกครั้ง");
  });

  it("body ไม่ใช่ JSON (captive portal ของ WiFi โรงแรม) → แยกออกจากสองอันบน", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError("<!DOCTYPE")) })
    );
    const out = await fetchReadJson("/api/engine/trips/x/days");
    expect(out).toBeNull();
    const last = getToasts().at(-1);
    expect(last?.message).toBe(
      "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง — ลองออกจาก WiFi ล็อกอิน (ถ้ามี) แล้วรีเฟรชอีกครั้ง"
    );
  });

  it("🔴 สามเหตุต้องได้ข้อความคนละอัน — ยุบรวมเมื่อไหร่ก็แก้ผิดทางเมื่อนั้น", async () => {
    const seen = new Set<string>();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("boom")));
    await fetchReadJson("/x");
    seen.add(String(getToasts().at(-1)?.message));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await fetchReadJson("/x");
    seen.add(String(getToasts().at(-1)?.message));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError("x")) })
    );
    await fetchReadJson("/x");
    seen.add(String(getToasts().at(-1)?.message));

    expect(seen.size, `ได้ข้อความซ้ำกัน: ${[...seen].join(" | ")}`).toBe(3);
  });

  it("ทางปกติยังทำงานเหมือนเดิม — ไม่ได้ห่อจนของดีหลุดไปด้วย และไม่มี toast โผล่", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([{ id: "d1", date: "2026-11-01" }]) })
    );
    const before = getToasts().length;
    const out = await fetchReadJson<{ id: string; date: string }[]>("/api/engine/trips/x/days");
    expect(out).toEqual([{ id: "d1", date: "2026-11-01" }]);
    expect(getToasts().length).toBe(before);
  });
});
