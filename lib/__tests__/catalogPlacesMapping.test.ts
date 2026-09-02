import { describe, expect, it } from "vitest";
import { toPlaces } from "@/hooks/useCatalogPlaces";
import type { CatalogNameCard } from "@/lib/engine/catalogPlace";

/**
 * ไซด์บาร์คลังใช้ **ตัวแปลงใบเดียวกับ `/stops`** — `E6-AC13` ก้าวที่ 2 · P3 · 2 ก.ย. 2026
 *
 * 🔴 ก่อนหน้านี้ฝั่งไคลเอนต์มีตัวแปลงของตัวเอง (`catalogPlaceToPlace` + `CatalogPlaceRow`)
 * ที่ประกาศ `nameTh: string`/`slug: string` ขณะที่ต้นทางคืน `null` ได้ **โดยไม่มี `cast` ให้ `grep` เจอ**
 * → *ข้อมูลชุดเดียวกัน สองฝั่งให้คำตอบคนละแบบ* · เคสในไฟล์นี้ตรึงว่าเลิกเป็นแบบนั้นแล้ว
 */
const card = (over: Partial<CatalogNameCard> = {}): CatalogNameCard => ({
  slug: "busan-bay101",
  category: "viewpoint",
  citySlug: "busan",
  lat: 35.1,
  lng: 129.1,
  nameTh: "เบย์ 101",
  nameEn: "Bay 101",
  nameLocal: null,
  description: null,
  addressLocal: null,
  mapsQuery: "Bay 101 Busan",
  googlePlaceId: null,
  youtubeQuery: null,
  ...over,
});

describe("toPlaces — ไซด์บาร์คลัง", () => {
  it("① เคสควบคุม — แถวปกติต้องผ่าน ไม่ใช่ถูกกรองทิ้งทั้งหมด", () => {
    const out = toPlaces([card()]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("busan-bay101");
    expect(out[0].nameTh).toBe("เบย์ 101");
  });

  /**
   * ⚠️ **แถวที่ไม่มี `slug` หายจากไซด์บาร์ — ตั้งใจ ไม่ใช่การถดถอย**
   * `POST …/stops` ระบุสถานที่ด้วย slug → แถวไม่มี slug **กดเพิ่มลงวันไม่ได้อยู่แล้ว**
   * โชว์ไว้ = ปุ่มที่กดแล้วได้ `400` เสมอ
   */
  it("② แถวที่ไม่มี slug ถูกคัดออก ไม่ใช่แต่งค่าให้ผ่าน", () => {
    expect(toPlaces([card({ slug: null })])).toEqual([]);
    expect(toPlaces([card({ slug: "" })])).toEqual([]);
    // แถวดีปนแถวเสีย — ต้องเหลือเฉพาะแถวดี ไม่ใช่ทิ้งทั้งชุด
    expect(toPlaces([card({ slug: null }), card()])).toHaveLength(1);
  });

  it("③ 🔴 ชื่อเดินตามลำดับ th → en → local → slug เหมือนฝั่งเซิร์ฟเวอร์", () => {
    // สถานที่ที่คลังมีแต่ชื่อเกาหลี — ตัวที่ข้อเสนอแรก ๆ ลืมกันทั้งทีม
    expect(toPlaces([card({ nameTh: null, nameEn: null, nameLocal: "해운대" })])[0].nameTh).toBe("해운대");
    expect(toPlaces([card({ nameTh: null })])[0].nameTh).toBe("Bay 101");
    expect(
      toPlaces([card({ nameTh: null, nameEn: null, nameLocal: null })])[0].nameTh,
      "ท้ายสุดตกที่ slug ไม่ใช่ `\"\"` — ค่าว่างดูเหมือนสภาพธรรมชาติ ส่วน slug ตามรอยได้"
    ).toBe("busan-bay101");
  });
});
