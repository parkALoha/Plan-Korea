import { describe, expect, it, vi } from "vitest";

/**
 * `lib/engine/customPlaces.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 ชั้นนี้อยู่ระหว่าง `db.ts` กับ `customPlaceShape.ts` — **และมันเป็นที่ที่ error หายเงียบได้ง่ายที่สุด**
 * `customPlaceRowsOfTrip()` คืน `{ data, error }` · ถ้าใครลืมเช็ค `error` แล้ว `data` เป็น `null`
 * ผลคือ **"คลังสถานที่ว่าง"** ซึ่งหน้าตาเหมือน *"ทริปนี้ยังไม่มีใครเพิ่มสถานที่"* เป๊ะ
 * → ผู้ใช้เห็นคลังว่าง · ไม่มี error ที่ไหน · **และของเขายังอยู่ในฐานครบ**
 */
vi.hoisted(() => {
  const g = globalThis as { WebSocket?: unknown };
  g.WebSocket ??= class { constructor() { throw new Error("เทสต์นี้ต้องไม่เปิด WebSocket"); } };
});

const rowsOfTrip = vi.hoisted(() => vi.fn());
vi.mock("@/lib/engine/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine/db")>()),
  customPlaceRowsOfTrip: rowsOfTrip,
}));

import { customPlacesOfTrip, oneCustomPlace } from "@/lib/engine/customPlaces";

/** แถวดิบรูปเดียวกับที่ `customPlaceShape` คาด */
const row = (id = "p1") => ({
  id, city_id: "c", category: "food", lat: 1, lng: 2, maps_query: "q",
  google_place_id: null, legacy_added_by: "ปาร์ค", created_at: "2026-08-01T00:00:00Z",
  catalog_cities: { legacy_slug: "busan", country_id: "kr" },
  custom_place_names: [{ locale: "th", name: "ร้าน", priority: 1 }],
  custom_place_descriptions: [],
});

/** ผลลัพธ์ที่ `.eq().limit()` ต่อท้ายได้ — `oneCustomPlace` ใช้คิวรีตัวเดียวกันแล้วต่อ */
const chainable = (result: unknown) => {
  const p = Promise.resolve(result) as Promise<unknown> & Record<string, unknown>;
  p.eq = () => p;
  p.limit = () => p;
  return p;
};

describe("customPlacesOfTrip", () => {
  it("🔴 `error` ต้อง **โยน** ไม่ใช่คืนลิสต์ว่าง", async () => {
    // 🎯 นี่คือทั้งหมดที่เคสนี้มีไว้: "คลังว่าง" กับ "อ่านไม่ได้" **แยกไม่ออกจากหน้าจอ**
    //    ถ้ากลืน error ผู้ใช้จะเห็นคลังว่าง ทั้งที่ของเขายังอยู่ในฐานครบ
    rowsOfTrip.mockReturnValue(chainable({ data: null, error: { message: "permission denied" } }));
    await expect(customPlacesOfTrip({} as never, "t1")).rejects.toThrow(/permission denied/);
  });

  it("`data` เป็น `null` โดยไม่มี error → ลิสต์ว่าง (ไม่โยน)", async () => {
    // ต่างจากข้างบน: ฐานตอบสำเร็จแต่ไม่มีแถว = **ทริปนี้ยังไม่มีสถานที่จริง ๆ**
    rowsOfTrip.mockReturnValue(chainable({ data: null, error: null }));
    await expect(customPlacesOfTrip({} as never, "t1")).resolves.toEqual([]);
  });

  it("แปลงทุกแถวผ่านตัวแปลงตัวเดียวกับที่ realtime ใช้", async () => {
    rowsOfTrip.mockReturnValue(chainable({ data: [row("a"), row("b")], error: null }));
    const out = await customPlacesOfTrip({} as never, "t1");
    expect(out.map((p) => p.id)).toEqual(["a", "b"]);
    expect(out[0].city).toBe("busan");
    expect(out[0].country).toBe("kr");   // `E4-AC3` — ประเทศมาจากเมือง ไม่ใช่ทริป
  });
});

describe("oneCustomPlace", () => {
  it("🔴 อ่านกลับไม่เจอ → **โยน** ไม่ใช่คืน `undefined`", async () => {
    // 🎯 "สร้างแล้วแต่อ่านกลับไม่เจอ" คือ invariant พัง — ถ้าคืน `undefined` เงียบ ๆ
    //    ผู้เรียกจะเขียนของว่างลง state แล้วผู้ใช้เห็นสถานที่ที่เพิ่งสร้างหายไป
    rowsOfTrip.mockReturnValue(chainable({ data: [], error: null }));
    await expect(oneCustomPlace({} as never, "t1", "p1")).rejects.toThrow(/อ่านกลับไม่เจอ/);
  });

  it("`error` → โยนพร้อมข้อความของฐาน", async () => {
    rowsOfTrip.mockReturnValue(chainable({ data: null, error: { message: "boom" } }));
    await expect(oneCustomPlace({} as never, "t1", "p1")).rejects.toThrow(/boom/);
  });

  it("เจอ → คืนแถวที่แปลงแล้ว", async () => {
    rowsOfTrip.mockReturnValue(chainable({ data: [row("only")], error: null }));
    expect((await oneCustomPlace({} as never, "t1", "only")).id).toBe("only");
  });

  it("🔴 ใช้คิวรีตัวเดียวกับตอนอ่านทั้งลิสต์ — **join ชุดเดียวกันแน่นอน**", async () => {
    // ถ้าใช้คิวรีคนละตัว แถวที่เพิ่งสร้างอาจมีรูปต่างจากแถวที่โหลดมาทั้งลิสต์
    // แล้ว UI จะได้ของสองรูปในลิสต์เดียวกัน โดยไม่มีอะไรผิดให้ใครเห็น
    rowsOfTrip.mockClear();
    rowsOfTrip.mockReturnValue(chainable({ data: [row()], error: null }));
    await oneCustomPlace({} as never, "t1", "p1");
    expect(rowsOfTrip).toHaveBeenCalledTimes(1);
    expect(rowsOfTrip.mock.calls[0][1]).toBe("t1");
  });
});
