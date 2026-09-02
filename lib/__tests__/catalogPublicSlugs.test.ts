import { describe, it, expect } from "vitest";
import { catalogPublicSlugs } from "@/lib/engine/db";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 🔴 **สิ่งที่ชุดนี้กัน: `travel_time_cache` ต้องไม่มีค่าที่ระบุตัวผู้ใช้เป็น *คีย์*** (`E3-AC6`)
 * ของจริงที่เคยไหลเข้าไป — `hotel@<lat>,<lng>` (พิกัดที่พัก) และ `custom_places.id` (UUID ผูกทริป)
 *
 * 🎯 **เคสที่สำคัญที่สุดคือ "ล้มแล้วได้เซตว่าง"** — ถ้าตอนตรวจไม่ได้แล้วเราเดาว่า "คงสาธารณะแหละ"
 *    ช่องจะเปิดในวันที่ฐานมีปัญหา **ซึ่งเป็นวันที่ไม่มีใครมองเรื่องความเป็นส่วนตัว**
 */

type Recorded = { table: string; column: string; values: string[] } | null;

/** ฐานปลอมที่จำว่าถูกถามอะไร — เพื่อยืนยันว่า "ไม่ถาม" ต่างจาก "ถามแล้วไม่เจอ" */
function fakeDb(rows: { legacy_slug: string }[] | null, error: unknown = null) {
  let recorded: Recorded = null;
  const db = {
    from(table: string) {
      return {
        select() {
          return {
            in(column: string, values: string[]) {
              recorded = { table, column, values };
              return Promise.resolve({ data: rows, error });
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, seen: () => recorded };
}

const HOTEL = "hotel@37.55123,126.98765";
const CUSTOM_UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("catalogPublicSlugs — แคชได้ก็ต่อเมื่อพิสูจน์ได้ว่าสาธารณะ", () => {
  it("คืนเฉพาะ slug ที่มีจริงในคลัง", async () => {
    const { db } = fakeDb([{ legacy_slug: "gyeongbokgung" }]);
    const got = await catalogPublicSlugs(db, ["gyeongbokgung", "namsan"]);
    expect(got.has("gyeongbokgung")).toBe(true);
    expect(got.has("namsan")).toBe(false);
  });

  it("🔴 พิกัดที่พักไม่อยู่ในคลัง → แคชไม่ได้", async () => {
    const { db } = fakeDb([]);
    expect((await catalogPublicSlugs(db, [HOTEL])).has(HOTEL)).toBe(false);
  });

  it("🔴 UUID ของสถานที่ส่วนตัวไม่อยู่ในคลัง → แคชไม่ได้", async () => {
    const { db } = fakeDb([]);
    expect((await catalogPublicSlugs(db, [CUSTOM_UUID])).has(CUSTOM_UUID)).toBe(false);
  });

  it("🔴 UUID เข้าเงื่อนไขรูปร่างเดียวกับ slug — ยืนยันว่าเราไม่ได้ตรวจด้วยรูปร่าง", () => {
    /**
     * ถ้าใครวันหลังเปลี่ยนไปใช้ regex แทนการถามคลัง **เคสข้างบนจะยังเขียว** เพราะฐานปลอมคืน `[]`
     * เคสนี้จึงยืนยันข้อเท็จจริงที่ทำให้ทางนั้นผิด: `^[a-z0-9-]+$` แยก UUID ออกจาก slug ไม่ได้เลย
     */
    expect(/^[a-z0-9-]+$/.test(CUSTOM_UUID)).toBe(true);
    expect(/^[a-z0-9-]+$/.test("gyeongbokgung")).toBe(true);
  });

  it("🔴 คิวรีล้ม = เซตว่าง (fail-closed) ไม่ใช่โยน และไม่ใช่เดาว่าสาธารณะ", async () => {
    const { db } = fakeDb(null, { message: "boom" });
    await expect(catalogPublicSlugs(db, ["gyeongbokgung"])).resolves.toEqual(new Set());
  });

  it("🔴 อินพุตว่าง = ไม่ยิงคิวรีเลย — 'ไม่ถาม' ต้องต่างจาก 'ถามแล้วไม่เจอ'", async () => {
    const { db, seen } = fakeDb([{ legacy_slug: "x" }]);
    expect(await catalogPublicSlugs(db, [])).toEqual(new Set());
    expect(seen(), "ยิงคิวรีทั้งที่ไม่มีอะไรให้ถาม").toBeNull();
  });

  it("ถามคลังจริง ด้วยคอลัมน์ที่เป็น id สาธารณะ", async () => {
    const { db, seen } = fakeDb([]);
    await catalogPublicSlugs(db, ["gyeongbokgung", HOTEL]);
    expect(seen()).toEqual({
      table: "catalog_places",
      column: "legacy_slug",
      values: ["gyeongbokgung", HOTEL],
    });
  });
});
