import { describe, it, expect } from "vitest";
import { cardToPlace, type CatalogNameCard } from "@/lib/engine/catalogPlace";

/**
 * `cardToPlace` — **การตัดสินสองข้อของ `E6-AC13` อยู่ในฟังก์ชันนี้ใบเดียว** · P1 · 2 ก.ย. 2026
 *
 * ① แถวที่ *ระบุตัวไม่ได้* (ไม่มี slug) ต้องไม่เข้าแมปที่ค้นด้วยตัวระบุ
 * ② ชื่อสำรองไล่ `th → en → local → slug` — **`local` คือขั้นที่ทุกข้อเสนอแรกลืม**
 *
 * 🔴 เคสพวกนี้อยู่ที่ตัวแปลง **ไม่ใช่ที่ route** เพราะ route ต้องแตะฐานถึงจะรันได้
 * → เคสที่รันได้โดยไม่แตะของกลาง ตรวจของที่ *ตัดสินใจ* จริง (`§3.3` — ฐาน dev เป็นของกลางใบที่สอง)
 */
const base: CatalogNameCard = {
  slug: "busan-bay101", category: "sight", citySlug: "busan", lat: 35.1, lng: 129.1,
  nameTh: null, nameEn: null, nameLocal: null, description: null,
  addressLocal: null, mapsQuery: null, googlePlaceId: null, youtubeQuery: null,
};

describe("cardToPlace — ① แถวที่ระบุตัวไม่ได้", () => {
  /**
   * 🔴 `legacy_slug` ไม่มี `not null` (`20260825134043_e2_catalog_places.sql:78`)
   * ถ้าปล่อยผ่านโดยยุบเป็น `""` → **สถานที่ไม่มี slug ทุกใบทับกันที่คีย์เดียว**
   * → จุดแวะคนละที่ resolve เป็นที่เดียวกัน · **ผิดแบบดูเหมือนถูก ไม่ใช่ว่างเปล่า** (P3 ชี้)
   */
  it("slug = null → null (ไม่ใช่ Place ที่มี id ว่าง)", () => {
    expect(cardToPlace({ ...base, slug: null, nameTh: "อ่าว 101" })).toBeNull();
  });

  it('slug = "" → null — รูปที่ route เดิมผลิตด้วย `?? ""`', () => {
    expect(cardToPlace({ ...base, slug: "", nameTh: "อ่าว 101" })).toBeNull();
  });

  /** ⚠️ เคสควบคุมทิศตรงข้าม — กันเงื่อนไขที่คืน `null` เสมอแล้วสองเคสบนผ่านฟรี */
  it("slug ปกติ → ไม่ null", () => {
    expect(cardToPlace({ ...base, nameTh: "อ่าว 101" })).not.toBeNull();
  });
});

describe("cardToPlace — ② ลำดับชื่อสำรอง", () => {
  it("มีชื่อไทย → ใช้ชื่อไทย", () => {
    const p = cardToPlace({ ...base, nameTh: "อ่าว 101", nameEn: "Bay 101" });
    expect(p?.nameTh).toBe("อ่าว 101");
  });

  it("ไม่มีไทย มีอังกฤษ → ใช้อังกฤษ ไม่ตกไป slug", () => {
    const p = cardToPlace({ ...base, nameEn: "Bay 101" });
    expect(p?.nameTh).toBe("Bay 101");
  });

  /**
   * 🔴 **เคสที่เป็นเหตุผลของไฟล์นี้** — ข้อเสนอตั้งต้นทั้งสามทาง (`?? slug` · `?? ""` · ไม่ใส่เลย)
   * ตกกับดักเดียวกันหมด เพราะคำถามถูกตั้งว่า *"ไม่มีชื่อ ตกเป็นอะไร"*
   * ซึ่ง **สมมติไปแล้วว่ามีสองภาษา · `catalogPlaceCards` ผลิตสาม**
   * · สถานที่ที่คลังมีแต่ชื่อเกาหลี: `nameTh=null · nameEn=null · nameLocal="해운대"`
   * · ตกไป slug ตรงนั้น = **ทิ้งชื่อที่เรามีอยู่ในมือ** แล้วโชว์ `busan-bay101` แทน `해운대`
   */
  it("มีแต่ชื่อท้องถิ่น → ใช้ชื่อท้องถิ่น ไม่ใช่ slug", () => {
    const p = cardToPlace({ ...base, nameLocal: "해운대" });
    expect(p?.nameTh).toBe("해운대");
    expect(p?.nameTh).not.toBe("busan-bay101");
  });

  /**
   * 🔴 ท้ายสุดตกที่ `slug` **ไม่ใช่ `""`** — `""` คือค่าที่ *ดูเหมือนสภาพธรรมชาติ* (การ์ดไม่มีชื่อ)
   * ส่วน slug เสื่อมแบบเห็นได้และตามรอยได้: ผู้ใช้เห็นแล้วบอกเราได้ เราหาเจอในคิวรีเดียว
   */
  it("ไม่มีชื่อเลยสักภาษา → slug ไม่ใช่ค่าว่าง", () => {
    const p = cardToPlace(base);
    expect(p?.nameTh).toBe("busan-bay101");
    expect(p?.nameTh).not.toBe("");
  });
});

describe("cardToPlace — ฟิลด์ที่ว่างได้จริง ต้องไม่ถูกยกเป็นชื่อ", () => {
  /** ⚠️ `descriptionTh` ว่าง = สภาพปกติ (ญี่ปุ่น 0/57 · ไทย 0/37) **ไม่ใช่ข้อมูลหาย** */
  it('ไม่มีคำบรรยาย → "" ไม่ใช่ชื่อหรือ slug', () => {
    expect(cardToPlace({ ...base, nameTh: "อ่าว 101" })?.descriptionTh).toBe("");
  });

  /** ลิงก์แผนที่ที่ว่าง = พาไปหน้าเปล่า → ตกไปที่ชื่อซึ่งค้นได้จริง */
  it("ไม่มี mapsQuery → ใช้ชื่ออังกฤษแทน ไม่ปล่อยว่าง", () => {
    const p = cardToPlace({ ...base, nameTh: "อ่าว 101", nameEn: "Bay 101" });
    expect(p?.mapsQuery).toBe("Bay 101");
  });
});
