import { describe, expect, it } from "vitest";
import { toCustomPlace } from "../engine/customPlaceShape";

/**
 * `E3` — ชั้นแปลงรูป `custom_places` (P1 · 26 ส.ค. 2026)
 *
 * 🔴 **ชั้นนี้คือที่ที่ความผิดพลาดจะ *เงียบ* ที่สุดในทั้ง `E3`**
 * ถ้าแปลงผิด UI ยังทำงาน ยังไม่มี error ที่ไหน **แค่แสดงข้อมูลผิด**
 * — และไม่มีใครเทียบกับของเดิมได้อีกแล้วหลัง `E7` ย้ายข้อมูลจริง
 */
const row = (o: Partial<Parameters<typeof toCustomPlace>[0]> = {}) =>
  ({
    id: "p1", city_id: "city-uuid", category: "food", lat: 1, lng: 2,
    maps_query: "q", google_place_id: null,
    legacy_added_by: "ปาร์ค", created_at: "2026-08-01T00:00:00Z",
    catalog_cities: { legacy_slug: "busan" },
    custom_place_names: [{ locale: "th", name: "ร้านเจ๊", priority: 1 }],
    custom_place_descriptions: [],
    ...o,
  }) as Parameters<typeof toCustomPlace>[0];

describe("toCustomPlace", () => {
  it("แมปครบทุกช่องของรูปเดิม", () => {
    expect(toCustomPlace(row())).toEqual({
      id: "p1", added_by: "ปาร์ค", city: "busan", name_th: "ร้านเจ๊",
      name_en: null, name_ko: null, category: "food", lat: 1, lng: 2,
      maps_query: "q", google_place_id: null, description: null,
      created_at: "2026-08-01T00:00:00Z",
      // 🔴 เพิ่ม 27 ส.ค. 2026 — `country` เข้ามาตอน `c59b678` แล้ว **ผมไม่ได้แตะเทสต์เลย**
      //    เทสต์นี้แดงมาหลายชั่วโมงโดยไม่มีใครรู้ เพราะทรีถูก refactor ค้างจนรันชุดเต็มไม่ได้
      //    🎯 **และที่รู้ก็เพราะ `toEqual` ไม่ใช่ `toMatchObject`** — ถ้าเป็น `toMatchObject`
      //       ช่องใหม่จะเงียบสนิท ตรงกับที่หัวไฟล์เตือนไว้เป๊ะ · **การยืนยันแบบครบช่องคือสิ่งที่จับได้**
      country: null,
    });
  });

  it("🔴 `country` มาจาก **เมือง** และมีเคสจริงที่มันไม่ใช่ `null`", () => {
    // ⚠️ ก่อน 27 ส.ค. 2026 ช่องนี้ไม่มีเทสต์แตะเลยสักเคส — มีแต่ `null` ที่มาจากการไม่ตั้งค่า
    //    `null` ที่ได้จาก "ไม่มีข้อมูล" พิสูจน์การแมปไม่ได้ เพราะโค้ดที่ *ลืมแมปทั้งบรรทัด*
    //    ก็คืน `undefined`/`null` เหมือนกัน → ต้องมีเคสที่ค่า **ไม่ใช่** `null` ถึงจะแยกสองอย่างนี้ออก
    const r = row({ catalog_cities: { legacy_slug: "busan", country_id: "kr-uuid" } });
    expect(toCustomPlace(r).country).toBe("kr-uuid");
  });

  it("เมืองที่ไม่มี `country_id` → `null` ไม่ใช่ `undefined`", () => {
    // ช่องนี้ไหลเข้า UI ตรง ๆ · `undefined` กับ `null` ต่างกันตอน serialize ข้าม network
    const r = row({ catalog_cities: { legacy_slug: "busan", country_id: null } });
    expect(toCustomPlace(r).country).toBeNull();
  });

  it("🔴 หลายชื่อในภาษาเดียว → เอา `priority` น้อยสุด **ไม่ใช่ตัวแรกที่ฐานคืนมา**", () => {
    // PK เป็น (place_id, locale, priority) → หนึ่งภาษามีหลายชื่อได้จริง
    // หยิบตัวแรก = ให้ลำดับที่ฐานคืนมาเป็นคนตัดสิน ซึ่งคือสิ่งที่ D55 ห้ามทั้งข้อ
    const r = row({
      custom_place_names: [
        { locale: "th", name: "ชื่อที่คนเรียก", priority: 2 },
        { locale: "th", name: "ชื่อทางการ", priority: 1 },
      ],
    });
    expect(toCustomPlace(r).name_th).toBe("ชื่อทางการ");
  });

  it("แยกภาษาถูก ไม่ปนกัน", () => {
    const r = row({
      custom_place_names: [
        { locale: "th", name: "ไทย", priority: 1 },
        { locale: "en", name: "English", priority: 1 },
        { locale: "ko", name: "한국", priority: 1 },
      ],
    });
    const c = toCustomPlace(r);
    expect([c.name_th, c.name_en, c.name_ko]).toEqual(["ไทย", "English", "한국"]);
  });

  it("ไม่มีชื่อไทย → ใช้ภาษาอื่นแทนค่าว่าง (`name_th` เป็น not null ในรูปเดิม)", () => {
    const r = row({ custom_place_names: [{ locale: "en", name: "Only English", priority: 1 }] });
    expect(toCustomPlace(r).name_th).toBe("Only English");
  });

  it("🔴 เมืองที่ไม่มี `legacy_slug` → คืน `city_id` **ไม่ใช่สตริงว่าง**", () => {
    // เมืองที่เกิดบนแพลตฟอร์มไม่เคยอยู่ในเว็บเดิม จึงไม่มี slug
    // คืนค่าว่าง = UI จัดกลุ่มทุกเมืองแบบนั้นรวมกันเป็นก้อนเดียวโดยไม่มีใครเห็น
    const r = row({ catalog_cities: { legacy_slug: null } });
    expect(toCustomPlace(r).city).toBe("city-uuid");
  });

  it("ไม่มีเมือง join มาเลย → ยังไม่พัง", () => {
    expect(toCustomPlace(row({ catalog_cities: null })).city).toBe("city-uuid");
  });

  it("🔴 `added_by` มาจาก `legacy_added_by` **ไม่ใช่ uuid ของบัญชี**", () => {
    // UI แสดงเป็นข้อความ · D19 เก็บสตริงเดิมไว้ก็เพื่อข้อนี้
    // ถ้าเอา added_by_user มาใส่ ผู้ใช้จะเห็น uuid บนการ์ดสถานที่
    expect(toCustomPlace(row({ legacy_added_by: null })).added_by).toBeNull();
  });

  it("ไม่มีชื่อเลยสักภาษา → `name_th` เป็นค่าว่าง ไม่ใช่ throw", () => {
    expect(toCustomPlace(row({ custom_place_names: [] })).name_th).toBe("");
  });
});

/**
 * 🔴 **P3 เจอตอนเปิดโค้ดนี้เพื่อตอบคำถามอื่น — และมันใหญ่กว่าคำถามที่ผมถาม**
 *
 * `postgres_changes` ส่งแถวดิบของ *ตารางเดียว* จาก WAL **ไม่ใช่ผลของคิวรี**
 * → `payload.new` ไม่มีคีย์ `catalog_cities`/`custom_place_names` เลย
 * → เรียกตัวแปลงตรง ๆ จะได้ **ชื่อว่าง + `city` เป็น uuid ดิบ ทุกแถวที่เปลี่ยนผ่าน realtime**
 * **โดยที่ component render สำเร็จ ไม่มี error ที่ไหน แค่ชื่อหาย**
 */
describe("แถวที่ไม่ได้ผ่าน join ต้องล้ม ไม่ใช่คืนชื่อว่าง", () => {
  it("🔴 `payload.new` จาก realtime (ไม่มีคีย์ join) → โยน พร้อมบอกว่าต้องทำอะไรแทน", () => {
    const raw = {
      id: "p1", city_id: "city-uuid", category: "food", lat: 1, lng: 2,
      maps_query: "q", google_place_id: null,
      legacy_added_by: null, created_at: "2026-08-01T00:00:00Z",
    } as unknown as Parameters<typeof toCustomPlace>[0];
    expect(() => toCustomPlace(raw)).toThrow(/postgres_changes/);
  });

  it("🔴 คีย์มีแต่เป็น `[]` → **ผ่าน** — สถานที่ที่ยังไม่มีชื่อเกิดได้จริง", () => {
    // ความต่างนี้คือทั้งหมดของกลไก: "ไม่มีคีย์" กับ "คีย์ว่าง" ต้องแยกออกจากกัน
    // ตระกูลเดียวกับ data: null vs data: [] ที่ทีมนี้เดินเข้าไปมาแล้วสามรอบ
    expect(() => toCustomPlace(row({ custom_place_names: [] }))).not.toThrow();
  });

  it("คีย์มีแต่เป็น `null` (join แล้วไม่เจอเมือง) → ผ่าน", () => {
    expect(() => toCustomPlace(row({ catalog_cities: null }))).not.toThrow();
  });
});
