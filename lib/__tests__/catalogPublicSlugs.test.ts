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
  /**
   * 🔴 **เคสนี้คือตัวที่จับ "เปลี่ยนจากถามคลัง ไปตรวจด้วย regex"** — และ `"namsan"` คือหัวใจของมัน
   * `"namsan"` **ผ่าน `^[a-z0-9-]+$` สบาย ๆ** แต่ไม่มีในคลัง → ใครเปลี่ยนไปใช้ regex เมื่อไหร่
   * มันจะกลายเป็น `true` แล้วเคสนี้แดงทันที · **นั่นคือแกนเดียวที่แยกสองวิธีออกจากกัน**
   * · และเหตุผลที่ regex เป็นทางที่ผิด: `custom_places.id` เป็น UUID ซึ่งเข้า `^[a-z0-9-]+$`
   *   **เหมือน slug ทุกประการ** → บัญชีขาวต้องเป็น *สมาชิกภาพ* ไม่ใช่ *หน้าตา*
   * ⚠️ **ห้ามลบ `"namsan"` ออกเพราะดูเหมือนของเกิน** — ถ้าเหลือแต่ `"gyeongbokgung"`
   *   เคสนี้จะเขียวทั้งสองวิธี แล้วไม่มีอะไรในชุดนี้จับการเปลี่ยนไป regex ได้อีกเลย
   * 📌 เคยมี `it()` แยกที่ยืนยันข้อเท็จจริงเรื่อง regex — **ถอดออกแล้ว (P4 ชี้)**
   *   ยิงมัลแตนต์พิสูจน์: เปลี่ยนเป็น regex → เคสนี้แดง · เคสนั้น**เขียว** = ไม่มีอำนาจแยกแยะเลย
   */
  it("คืนเฉพาะ slug ที่มีจริงในคลัง — รวม id ที่ *รูปร่างถูกแต่ไม่มีในคลัง*", async () => {
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
