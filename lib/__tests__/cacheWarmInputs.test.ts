import { describe, expect, it } from "vitest";
import {
  CACHE_MAX_AGE_DAYS,
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
/** ตัวกรองที่ตัวอ่านสั่ง — เก็บไว้เพื่อ *ยืนยันว่ามันสั่งจริง* ไม่ใช่แค่ให้ chain ไม่พัง */
type Filter = { table: string; column: string; value: unknown };

/** ฐานปลอมที่จำว่าถูกขอหน้าไหนบ้าง และแบ่งหน้าให้เหมือนจริง */
function fakeDb(rowsByTable: Record<string, Record<string, unknown>[]>, err: unknown = null) {
  const pages: Page[] = [];
  const filters: Filter[] = [];
  const db = {
    from(table: string) {
      const chain = {
        select() {
          return chain;
        },
        not() {
          return chain;
        },
        /**
         * 🔴 **บันทึกไว้ ไม่ใช่แค่คืน `chain`** (3 ก.ย. 2026 · ตอนเพิ่ม TTL 30 วัน)
         *
         * ตอนเพิ่ม `.gte("fetched_at", …)` ลงตัวอ่าน เคสสามข้อในไฟล์นี้แดงทันที
         * ด้วย `db.from(...).select(...).gte is not a function` — **แดงที่ถูกต้อง**
         * 🎯 **แต่ทางแก้ที่ง่ายที่สุดคือเติม `gte() { return chain; }` เฉย ๆ**
         *    ซึ่งจะทำให้เคสเขียวกลับมา **โดยไม่มีอะไรตรวจว่าตัวอ่านยังกรองอยู่จริง**
         *    ⇒ วันที่มีคนถอด `.gte` ออก **ไฟล์นี้จะเขียวเหมือนเดิมทุกบรรทัด**
         * ✅ เก็บ argument ไว้ แล้วมีเคสยืนยันว่าตัวกรองถูกสั่งจริง
         */
        gte(column: string, value: unknown) {
          filters.push({ table, column, value });
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
  return { db: db as unknown as SupabaseClient, pages, filters };
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

  /**
   * ══ TTL 30 วัน — ผู้ใช้ตัดสิน 3 ก.ย. 2026 ══════════════════════════════════
   *
   * 🔴 **เคสกลุ่มนี้มีไว้กันสิ่งที่เกือบเกิดตอนเพิ่ม TTL:**
   * การเติม `gte()` เปล่า ๆ ลง stub ทำให้เคสเดิมเขียวกลับมาทันที
   * **โดยไม่มีอะไรตรวจว่าตัวอ่านยังกรองอยู่จริง**
   * ⇒ ถอด `.gte` ออกจาก `db.ts` เมื่อไหร่ ไฟล์นี้จะเขียวเหมือนเดิมทุกบรรทัด
   *
   * 🎯 **ทิศแดงที่ยิงแล้ว:** ลบ `.gte("fetched_at", …)` ออกจาก `cachedDetailKeys`
   *    → เคส ① แดงด้วย `ตัวอ่านไม่ได้กรองอายุแคชเลย` · ใส่กลับ → เขียว
   */
  it("① cachedDetailKeys/cachedPhotoKeys ต้องกรองอายุแคชจริง ไม่ใช่แค่รับ .gte ได้", async () => {
    const d = fakeDb({ place_details_cache: [{ maps_query: "Q1" }] });
    await cachedDetailKeys(d.db);
    const ph = fakeDb({ place_photo_cache: [{ maps_query: "Q1" }] });
    await cachedPhotoKeys(ph.db);

    for (const [name, f] of [["place_details_cache", d.filters], ["place_photo_cache", ph.filters]] as const) {
      expect(f.length, `${name}: ตัวอ่านไม่ได้กรองอายุแคชเลย — แถวเก่าจะถูกนับว่า "มีแคชแล้ว" ตลอดกาล`)
        .toBeGreaterThan(0);
      expect(f[0].column, `${name}: กรองผิดคอลัมน์`).toBe("fetched_at");
      expect(f[0].table).toBe(name);
    }
  });

  it("② ขอบเขตที่กรองต้องเท่ากับ CACHE_MAX_AGE_DAYS ไม่ใช่เลขที่พิมพ์ไว้เอง", async () => {
    const { db, filters } = fakeDb({ place_details_cache: [] });
    const before = Date.now();
    await cachedDetailKeys(db);
    const after = Date.now();

    const cutoff = Date.parse(String(filters[0].value));
    expect(Number.isNaN(cutoff), "ค่าที่ส่งไปไม่ใช่เวลาที่ Postgres อ่านได้").toBe(false);
    // 🔴 เทียบกับ **ค่าคงที่ที่ export ออกมา** ไม่ใช่กับ `30` ที่พิมพ์ซ้ำในเทสต์
    //    · ถ้าเทสต์พิมพ์ `30` เอง มันจะกลายเป็นสำเนาที่ต้องมีคนซิงก์ (`TEAM.md` — ทะเบียนที่ล้าเงียบ)
    const span = CACHE_MAX_AGE_DAYS * 86_400_000;
    expect(cutoff).toBeGreaterThanOrEqual(before - span - 5_000);
    expect(cutoff).toBeLessThanOrEqual(after - span + 5_000);
  });

  /**
   * ⚠️ **เคสควบคุมฝั่งลบ** — พิสูจน์ว่าพารามิเตอร์มีผลจริง ไม่ใช่ค่าตกแต่ง
   * 🔴 ถ้าตัวอ่านเมิน `maxAgeDays` แล้วใช้ค่าคงที่เสมอ เคส ①② ยังเขียวทั้งคู่
   */
  it("③ ส่ง maxAgeDays อื่นเข้าไป ขอบเขตต้องขยับตาม", async () => {
    const { db, filters } = fakeDb({ place_details_cache: [] });
    await cachedDetailKeys(db, 1);
    const cutoff = Date.parse(String(filters[0].value));
    const oneDay = Date.now() - 86_400_000;
    expect(Math.abs(cutoff - oneDay), "ตัวอ่านเมิน maxAgeDays — พารามิเตอร์เป็นแค่ของตกแต่ง")
      .toBeLessThan(5_000);
  });
});
