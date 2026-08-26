import { describe, expect, it } from "vitest";
import { COUNTRY_OF_CITY, countryOfCity, countryOfCitySlug } from "@/data/emergency";
import { ITINERARY } from "@/data/itinerary";
import { capabilitiesOf, shouldSkipTravelApi } from "@/lib/engine/countries";

/**
 * `E4-AC2` — *"`countryOfCity(c) { return c === 'hanoi' ? 'vn' : 'kr' }` ไม่มีอยู่ในโค้ดแล้ว"*
 *
 * 🔴 **เกณฑ์ข้อนี้เกือบถูกปิดทั้งที่ฟังก์ชันยังอยู่ครบทีละตัวอักษร** (P1 · 27 ส.ค. 2026)
 * ผมรัน `grep -rn '"kr"' lib/ app/ components/` แล้วรายงานว่า *"✅ ไม่มีนอก registry"*
 * — **โดยไม่ได้ใส่ `data/` ซึ่งเป็นที่ที่มันอยู่** · ตัวเลขถูก ขอบเขตผิด (`P-61`)
 * 🎯 **บทเรียน: `grep` ที่ไม่ประกาศขอบเขต อ่านเหมือนคำตอบ แต่เป็นแค่คำตอบของสิ่งที่มันมอง**
 */
describe("countryOfCity — ข้อมูล ไม่ใช่เงื่อนไข", () => {
  it("ทุกเมืองในตารางแมปถูก", () => {
    expect(countryOfCity("hanoi")).toBe("vn");
    expect(countryOfCity("seoul")).toBe("kr");
    expect(countryOfCity("busan")).toBe("kr");
  });

  it("🔴 ทุกเมืองที่ `ITINERARY` ใช้จริง ต้องมีในตาราง", () => {
    // ตารางเป็น `Record<City, …>` → `tsc` ค้ำอยู่แล้ว **แต่เฉพาะกับชนิด**
    // เคสนี้ค้ำกับ *ข้อมูลจริง* เผื่อวันที่ `City` กว้างกว่าที่ ITINERARY ใช้ หรือแคบกว่า
    const used = new Set(ITINERARY.map((d) => d.city));
    for (const city of used) expect(COUNTRY_OF_CITY[city]).toBeTruthy();
  });

  describe("🔴 เมืองที่ไม่รู้จัก — เคสที่เทอร์นารีเดิมตอบผิดอย่างมั่นใจ", () => {
    it("โตเกียวไม่ใช่เกาหลี", () => {
      // ฉบับเดิม `city === "hanoi" ? "vn" : "kr"` คืน `"kr"` ให้เมืองนี้
      // → การ์ดฉุกเฉินจะโชว์ **119 ของเกาหลีให้คนที่อยู่ญี่ปุ่น** โดยไม่มีสัญญาณอะไรเลย
      expect(countryOfCitySlug("tokyo")).toBeNull();
    });

    it("สตริงว่าง / null / undefined → null ไม่ใช่ `\"kr\"`", () => {
      expect(countryOfCitySlug("")).toBeNull();
      expect(countryOfCitySlug(null)).toBeNull();
      expect(countryOfCitySlug(undefined)).toBeNull();
    });

    it("ตัวพิมพ์ใหญ่จากฐานยังแมปได้ (`Seoul` = `seoul`)", () => {
      expect(countryOfCitySlug("Seoul")).toBe("kr");
    });
  });

  describe("🎯 ผู้เรียกทั้งหมดรับ `null` ได้ถูกอยู่แล้ว — นี่คือหลักฐานว่ารูปนี้ถูก", () => {
    it("ประเทศไม่รู้จัก → แผนที่เหลือ Google ซึ่งใช้ได้ทุกที่", () => {
      expect(capabilitiesOf(null).mapProviders).toEqual(["google"]);
    });

    it("ประเทศไม่รู้จัก → **ยิง** API ไม่ใช่ข้าม (ให้ผลจริงสอนเรา)", () => {
      // ⚠️ ตรงข้ามกับสัญชาตญาณ: "ไม่รู้จัก" ไม่ควรแปลว่า "อย่ายิง"
      //    เพราะการข้ามจะทำให้เราไม่มีวันรู้ว่าประเทศนั้นมีข้อมูลจริงหรือเปล่า
      expect(shouldSkipTravelApi(null, "drive")).toBe(false);
      expect(shouldSkipTravelApi("jp", "drive")).toBe(false);
      // แต่ประเทศที่ **รู้แล้วว่าไม่มี** ต้องข้าม
      expect(shouldSkipTravelApi("kr", "drive")).toBe(true);
    });
  });
});
