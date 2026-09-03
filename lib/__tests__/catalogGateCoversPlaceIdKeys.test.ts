import { describe, expect, it } from "vitest";
import { catalogPublicMapsQueries } from "@/lib/engine/db";
import { PLACE_ID_PREFIX, placeQueryKey } from "@/lib/placeQuery";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * **`E3-AC6` ข้อ 2 — ประตูบัญชีขาวรู้จักคีย์แค่รูปเดียว จากสองรูปที่มีจริง**
 * P1 · 3 ก.ย. 2026 · **บั๊กที่ P1 สร้างเองตอนทำประตูเมื่อ 2 ก.ย.** — เจอตอนไปตอบข้อ 2 ที่ค้างว่า *"ยังไม่มีคำตอบ"*
 *
 * ## กลไก
 * `placeQueryKey()` คืน **สองรูป** · ประตูฉบับแรกเทียบคอลัมน์เดียว
 * ```
 * "<mapsQuery>"      → catalog_places.maps_query        ← ฉบับแรกทำเฉพาะอันนี้
 * "place_id:<gid>"   → catalog_places.google_place_id   ← **ไม่เคยถูกเทียบเลย**
 * ```
 *
 * ## วัดกับข้อมูลจริง (สำเนาแช่แข็ง 670 แถว · สนามซ้อมในเครื่อง `scripts/e7-local-rehearsal.sh`)
 * ```
 * place_details_cache   คีย์รูป place_id:  22 / 140 (16%)   ผ่านประตูฉบับแรก **0**
 * ในนั้นมี google_place_id ตรงกับคลังจริง                      3            ← ถูกกันทิ้งทั้งที่พิสูจน์ได้ว่าสาธารณะ
 * catalog_places.google_place_id ที่ไม่ null                  3 / 203       ← ช่องว่างของ *ข้อมูล* คนละเรื่องกับของ *ประตู*
 * ```
 * 🔴 **ทิศของความเสียหาย: fail-closed — ไม่ใช่ช่องรั่ว แต่แคชตายถาวรสำหรับ *ของที่เราคัดเอง***
 *    ซึ่งเป็นกลุ่มที่เปิดบ่อยที่สุด **และปลอดภัยที่สุดที่จะแคช** → ประตูกลับด้านในทางปฏิบัติ
 * ⚠️ **เงียบสนิท** — ไม่มี error · ผู้ใช้ยังได้คำตอบ (ยิง Google ใหม่ทุกครั้ง) · **เห็นที่บิลค่า API เท่านั้น**
 *
 * ## 📌 บทเรียนที่แพงกว่าตัวบั๊ก — P1 สรุปผิดสองรอบก่อนได้ของจริง
 * รอบแรกสรุปว่า *"`catalog_places` ไม่มีคอลัมน์ google place id → ตรวจไม่ได้เชิงโครงสร้าง"*
 * · **ผิด** — คอลัมน์มีอยู่ แต่ถูกเพิ่มด้วย `alter table` ใน migration ใบถัดมา
 *   (`20260825231932_e2_catalog_places_missing_fields.sql:59`) **ไม่ได้อยู่ในบล็อก `create table` ที่ผมอ่าน**
 * 🎯 **อ่านนิยามจากที่เดียวแล้วสรุปว่า "ไม่มี" — ทั้งที่สคีมาคือผลรวมของ migration ทั้งชุด**
 *   ตระกูลเดียวกับ *"เครื่องวัดสร้างแบบจำลองของรูป"* (`TEAM.md §3.4`) แค่คราวนี้แบบจำลองคือ *"นิยามตารางอยู่ที่ create table"*
 * · ✅ **ตัวที่หักได้คือถามฐานจริง** (`information_schema.columns`) ไม่ใช่ `grep` ที่ฉลาดขึ้น
 */
type Call = { column: string; values: string[] };

/** 🔴 ประตูฉบับใหม่ยิง **สองคิวรี** — ฐานปลอมต้องตอบคนละชุดตามคอลัมน์ ไม่งั้นเคสจะเขียวโดยไม่ได้วัดอะไร */
function fakeDb(byColumn: Record<string, string[]>) {
  const calls: Call[] = [];
  const db = {
    from() {
      return {
        select(column: string) {
          return {
            in(col: string, values: string[]) {
              calls.push({ column: col, values });
              const hits = (byColumn[col] ?? []).filter((v) => values.includes(v));
              return Promise.resolve({ data: hits.map((v) => ({ [column]: v })), error: null });
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const GID = "ChIJ_gwangalli_123";
const KEY_ID = `${PLACE_ID_PREFIX}${GID}`;
const KEY_TEXT = "Gwangalli Beach Busan";

describe("E3-AC6 ② — ประตูต้องรู้จักคีย์ทั้งสองรูป", () => {
  it("คีย์รูป place_id: ที่มีในคลัง ต้องผ่านประตู", async () => {
    const { db } = fakeDb({ google_place_id: [GID] });
    const ok = await catalogPublicMapsQueries(db, [KEY_ID]);
    expect(ok, "คีย์ place_id: ที่พิสูจน์ได้ว่าเป็นของคลัง ถูกกันทิ้ง — แคชตายฟรี").toEqual(new Set([KEY_ID]));
  });

  /** 🔴 คืน **คีย์ในรูปที่ผู้เรียกส่งมา** ไม่ใช่ค่าที่คลังเก็บ — ผู้เรียกเอาไปทำ `.in("maps_query", …)` ต่อ */
  it("🔴 ต้องคืนคีย์รูปเดิม ไม่ใช่ google place id ดิบ", async () => {
    const { db } = fakeDb({ google_place_id: [GID] });
    const ok = await catalogPublicMapsQueries(db, [KEY_ID]);
    expect(ok.has(GID), "คืน gid ดิบ → ผู้เรียกจะ query แคชด้วยคีย์ที่ไม่มีอยู่จริง").toBe(false);
    expect(ok.has(KEY_ID)).toBe(true);
  });

  it("คีย์รูป place_id: ที่ **ไม่มี** ในคลัง ต้องไม่ผ่าน (ทิศลบ)", async () => {
    const { db } = fakeDb({ google_place_id: [] });
    expect(await catalogPublicMapsQueries(db, [KEY_ID])).toEqual(new Set());
  });

  it("ยังตรวจคีย์ข้อความล้วนได้เหมือนเดิม (ไม่ถอยหลัง)", async () => {
    const { db } = fakeDb({ maps_query: [KEY_TEXT] });
    expect(await catalogPublicMapsQueries(db, [KEY_TEXT])).toEqual(new Set([KEY_TEXT]));
  });

  it("🔴 คีย์ปนสองรูปในคำขอเดียว ต้องผ่านทั้งคู่ — และแยกไปถามคนละคอลัมน์", async () => {
    const { db, calls } = fakeDb({ google_place_id: [GID], maps_query: [KEY_TEXT] });
    const ok = await catalogPublicMapsQueries(db, [KEY_ID, KEY_TEXT]);
    expect(ok).toEqual(new Set([KEY_ID, KEY_TEXT]));
    const cols = calls.map((c) => c.column).sort();
    expect(cols, "ต้องถามสองคอลัมน์ — ถามคอลัมน์เดียวคือฉบับที่มีบั๊ก").toEqual(["google_place_id", "maps_query"]);
    // 🔴 ต้องส่ง **gid ที่ถอด prefix แล้ว** ไปถาม ไม่ใช่คีย์เต็ม
    expect(calls.find((c) => c.column === "google_place_id")?.values).toEqual([GID]);
  });

  /** ⚠️ ตัวควบคุม — ไม่มีคีย์รูป place_id: เลย ต้องไม่ยิงคิวรีเปล่าไปถาม `google_place_id` */
  it("ไม่มีคีย์ place_id: → ไม่ยิงคิวรีเปล่า", async () => {
    const { db, calls } = fakeDb({ maps_query: [KEY_TEXT] });
    await catalogPublicMapsQueries(db, [KEY_TEXT]);
    expect(calls.map((c) => c.column)).toEqual(["maps_query"]);
  });

  it("ทั้งสองรูปมาจาก placeQueryKey จริง ไม่ใช่สตริงที่ผมแต่งขึ้น", () => {
    expect(placeQueryKey({ googlePlaceId: GID, mapsQuery: KEY_TEXT })).toBe(KEY_ID);
    expect(placeQueryKey({ mapsQuery: KEY_TEXT })).toBe(KEY_TEXT);
  });
});
