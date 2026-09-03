import { describe, expect, it } from "vitest";
import {
  catalogKeyRows,
  cachedDetailKeys,
  cachedPhotoKeys,
  tripReferencedCatalogPlaceIds,
} from "@/lib/engine/db";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * **`Q3` ก้าวที่ 2 · ฝั่งดึงข้อมูล — เคสหลักคือ *กับดัก 1000 แถว*** · P1 · 3 ก.ย. 2026
 *
 * 🔴 **PostgREST ตัดผลลัพธ์ที่ `db-max-rows` (ค่าเริ่มต้น 1000) เงียบ ๆ** — ไม่มี error ไม่มีสัญญาณ
 * วัดแล้ว `catalog_places` วันนี้ **1118 แถว** ⇒ อ่านรวดเดียวจะขาด **แล้วตัวอุ่นจะข้ามของจริงไปเงียบ ๆ**
 * 🎯 **อาการเวลาโดนตัด อ่านเหมือน "อุ่นครบแล้ว"** — แถวที่หายไปไม่เคยเข้ามาในรายการตั้งแต่แรก
 * · ⚠️ เคสในไฟล์นี้จึงบังคับ **จำนวนหน้าที่ถูกขอ** ไม่ใช่แค่ "ผลลัพธ์ถูก" — ผลลัพธ์ถูกได้ด้วยข้อมูลที่เล็กเกินไป
 */
type Page = { from: number; to: number; table: string };

/** ฐานปลอมที่จำว่าถูกขอหน้าไหนบ้าง และแบ่งหน้าให้เหมือนจริง */
function fakeDb(rowsByTable: Record<string, Record<string, unknown>[]>, err: unknown = null) {
  const pages: Page[] = [];
  const db = {
    from(table: string) {
      const chain = {
        select() {
          return chain;
        },
        not() {
          return chain;
        },
        range(from: number, to: number) {
          pages.push({ from, to, table });
          if (err) return Promise.resolve({ data: null, error: err });
          return Promise.resolve({ data: (rowsByTable[table] ?? []).slice(from, to + 1), error: null });
        },
      };
      return chain;
    },
  };
  return { db: db as unknown as SupabaseClient, pages };
}

const many = (n: number, make: (i: number) => Record<string, unknown>) =>
  Array.from({ length: n }, (_, i) => make(i));

describe("ฝั่งดึงข้อมูลของตัวอุ่นแคช — ต้องไม่โดนตัดที่หน้าเดียว", () => {
  /** 🔴 เคสหลักของไฟล์นี้ — 1118 แถวคือจำนวนจริงบน `engine-dev` วันที่เขียน */
  it("🔴 catalogKeyRows: คลัง 1118 แถว ต้องได้ครบ ไม่ใช่แค่หน้าแรก", async () => {
    const { db, pages } = fakeDb({
      catalog_places: many(1118, (i) => ({ id: `p${i}`, maps_query: `Q${i}`, google_place_id: null })),
    });
    const rows = await catalogKeyRows(db);
    expect(rows, "อ่านไม่ได้").not.toBeNull();
    expect(rows!.length, "ได้ไม่ครบ — โดนตัดที่หน้าแรก").toBe(1118);
    expect(pages.length, "ขอหน้าเดียว = ไม่ได้ไล่หน้าเลย").toBeGreaterThan(1);
  });

  it("จำนวนพอดีขอบหน้า ต้องขอหน้าถัดไปเพื่อรู้ว่าจบ", async () => {
    const { db, pages } = fakeDb({ catalog_places: many(500, (i) => ({ id: `p${i}`, maps_query: null, google_place_id: null })) });
    const rows = await catalogKeyRows(db);
    expect(rows!.length).toBe(500);
    expect(pages.length, "500 = ขนาดหน้าพอดี → ต้องขอหน้าที่สองถึงจะรู้ว่าหมด").toBe(2);
  });

  /**
   * 🔴 **`null` ≠ รายการว่าง** — ถ้าคืนว่างตอนฐานล่ม cron จะรายงานว่า "ไม่มีอะไรต้องอุ่น"
   * ในวันที่ฐานอ่านไม่ได้ **แล้วไม่มีใครรู้**
   */
  it("🔴 อ่านไม่ได้ → คืน null ไม่ใช่รายการว่าง", async () => {
    const { db } = fakeDb({ catalog_places: [] }, { code: "42501" });
    expect(await catalogKeyRows(db)).toBeNull();
    expect(await cachedDetailKeys(db)).toBeNull();
    expect(await cachedPhotoKeys(db)).toBeNull();
    expect(await tripReferencedCatalogPlaceIds(db)).toBeNull();
  });

  it("ตารางว่างจริง → เซตว่าง (ไม่ใช่ null)", async () => {
    const { db } = fakeDb({ place_details_cache: [] });
    const keys = await cachedDetailKeys(db);
    expect(keys).not.toBeNull();
    expect(keys!.size).toBe(0);
  });

  it("cachedDetailKeys / cachedPhotoKeys อ่านคนละตาราง", async () => {
    const { db, pages } = fakeDb({
      place_details_cache: [{ maps_query: "D" }],
      place_photo_cache: [{ maps_query: "P" }],
    });
    expect([...(await cachedDetailKeys(db))!]).toEqual(["D"]);
    expect([...(await cachedPhotoKeys(db))!]).toEqual(["P"]);
    expect(pages.map((p) => p.table)).toEqual(["place_details_cache", "place_photo_cache"]);
  });

  it("tripReferencedCatalogPlaceIds: ตัดค่า null ทิ้ง และไม่ซ้ำ", async () => {
    const { db } = fakeDb({
      trip_stops: [
        { catalog_place_id: "a" },
        { catalog_place_id: "a" },
        { catalog_place_id: null },
        { catalog_place_id: "b" },
      ],
    });
    const ids = await tripReferencedCatalogPlaceIds(db);
    expect([...ids!].sort()).toEqual(["a", "b"]);
  });
});
