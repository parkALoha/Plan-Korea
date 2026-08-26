import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  searchPlacesText,
  autocompletePlaces,
  searchNearby,
  getPlaceDetails,
} from "@/lib/googlePlaces";

/**
 * 4 ฟังก์ชันใน `lib/googlePlaces.ts` **สัญญาว่าไม่โยน** — ไฟล์นี้บังคับให้สัญญานั้นจริง
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026
 *
 * ## 🔴 ทำไมข้อนี้สำคัญกว่าที่หน้าตาบอก
 * ทุกตัวคืน `{ …, error: string | null }` และจัดการทางพลาดไว้ 2 ทาง (ไม่มีคีย์ · `!res.ok`)
 * **แต่ `await fetch()` โยนเองเมื่อคำขอไปไม่ถึงปลายทาง** — และ **route ทั้ง 7 เส้นที่เรียกไฟล์นี้
 * ไม่มี `try` เลยสักตัว** (นับจากดิสก์) เพราะเชื่อสัญญานั้น
 *
 * 🎯 **ทางพลาดที่น่าจะเกิดที่สุด คือทางเดียวที่หลุดจากสัญญา** — ผู้ใช้ได้หน้า 500 ของ Next
 * แทนข้อความที่เราเขียนไว้ **ในนาทีที่เน็ตแย่ที่สุด** ซึ่งคือนาทีที่คนกำลังเที่ยวอยู่ต่างประเทศ
 * ต้องการให้แอปบอกความจริงมากที่สุด
 *
 * · รูปเดียวกับที่แก้ไปแล้วใน `lib/travelProvider.ts` เช้านี้ — **บทเรียนเดียวกัน คนละไฟล์**
 */

const KEY = "GOOGLE_MAPS_API_KEY";
let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env[KEY];
  process.env[KEY] = "test-key-not-a-real-one";
});

afterEach(() => {
  if (savedKey === undefined) delete process.env[KEY];
  else process.env[KEY] = savedKey;
  vi.unstubAllGlobals();
});

/** ทั้ง 4 ตัวคืนรูปต่างกัน — ดึงเฉพาะ `error` ออกมาเทียบ และเช็ค payload ว่าว่างจริง */
const CALLS = [
  { name: "searchPlacesText", run: () => searchPlacesText("ร้านกาแฟ", "places.id"), label: "places search" },
  { name: "autocompletePlaces", run: () => autocompletePlaces("โซล", null), label: "autocomplete" },
  {
    name: "searchNearby",
    run: () => searchNearby({ lat: 37.5, lng: 127 }, ["cafe"], "places.id"),
    label: "nearby search",
  },
  { name: "getPlaceDetails", run: () => getPlaceDetails("places/abc", "id"), label: "place details" },
] as const;

describe("Places API ติดต่อไม่ได้ ต้องไม่โยนออกมาจากฟังก์ชัน", () => {
  for (const c of CALLS) {
    it(`${c.name}: fetch โยน → คืน error ไม่ใช่โยนต่อ`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
      // 🔴 ถ้าฟังก์ชันโยน บรรทัดนี้จะทำให้เคสแดงทันที — ซึ่งคือทั้งหมดที่ไฟล์นี้ตรวจ
      const out = await c.run();
      expect(out.error).toBe(`${c.label} ติดต่อไม่ได้`);
    });

    it(`${c.name}: body ไม่ใช่ JSON → แยกออกจาก "ติดต่อไม่ได้"`, async () => {
      // เกิดจริงกับ captive portal ของ WiFi โรงแรม: ตอบ 200 แต่ body เป็นหน้า HTML ล็อกอิน
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError("<!DOCTYPE")) })
      );
      const out = await c.run();
      expect(out.error).toBe(`${c.label} ตอบกลับไม่ใช่ JSON`);
    });

    it(`${c.name}: ไปถึงแล้วถูกปฏิเสธ → ข้อความเดิมพร้อมรหัส (ไม่ถูกยุบรวมกับสองอันบน)`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
      const out = await c.run();
      expect(out.error).toBe(`${c.label} failed: 429`);
    });
  }

  it("🔴 สามเหตุต้องได้ข้อความคนละอัน — ยุบรวมเมื่อไหร่ก็แก้ผิดทางเมื่อนั้น", async () => {
    const seen = new Set<string>();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("boom")));
    seen.add(String((await searchPlacesText("x", "places.id")).error));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    seen.add(String((await searchPlacesText("x", "places.id")).error));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError("x")) })
    );
    seen.add(String((await searchPlacesText("x", "places.id")).error));

    // ติดต่อไม่ได้ → รอเน็ต · ถูกปฏิเสธ → ดูโควตา/พารามิเตอร์ · body พัง → ออกจาก captive portal
    expect(seen.size, `ได้ข้อความซ้ำกัน: ${[...seen].join(" | ")}`).toBe(3);
  });

  it("ไม่มีคีย์ = ไม่ยิงเลย และไม่ใช่ 'ติดต่อไม่ได้'", async () => {
    delete process.env[KEY];
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const out = await searchPlacesText("x", "places.id");
    expect(out.error).toBe("GOOGLE_MAPS_API_KEY not set");
    expect(spy).not.toHaveBeenCalled();
  });

  it("ทางปกติยังทำงานเหมือนเดิม — ไม่ได้ห่อจนของดีหลุดไปด้วย", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ places: [{ id: "p1" }] }) })
    );
    const out = await searchPlacesText("x", "places.id");
    expect(out.error).toBeNull();
    expect(out.places).toEqual([{ id: "p1" }]);
  });
});
