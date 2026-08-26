import { describe, expect, it } from "vitest";
import { toCustomPlace } from "../engine/customPlaces";

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
    maps_query: "q", description: null, google_place_id: null,
    legacy_added_by: "ปาร์ค", created_at: "2026-08-01T00:00:00Z",
    catalog_cities: { legacy_slug: "busan" },
    custom_place_names: [{ locale: "th", name: "ร้านเจ๊", priority: 1 }],
    ...o,
  }) as Parameters<typeof toCustomPlace>[0];

describe("toCustomPlace", () => {
  it("แมปครบทุกช่องของรูปเดิม", () => {
    expect(toCustomPlace(row())).toEqual({
      id: "p1", added_by: "ปาร์ค", city: "busan", name_th: "ร้านเจ๊",
      name_en: null, name_ko: null, category: "food", lat: 1, lng: 2,
      maps_query: "q", google_place_id: null, description: null,
      created_at: "2026-08-01T00:00:00Z",
    });
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
