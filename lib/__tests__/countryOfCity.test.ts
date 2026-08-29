import { describe, expect, it } from "vitest";
import { COUNTRY_OF_CITY, countryOfCitySlug } from "@/data/emergency";
import { ITINERARY } from "@/data/itinerary";
import { CITY_LOCALE } from "@/data/places";
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
    // 🔴 **เขียนใหม่ 29 ส.ค. 2026 ตอนถอด `countryOfCity()` — ห้ามลบเคสนี้ทิ้งพร้อมฟังก์ชัน** (P4 ชี้)
    //    นี่คือ **เคสเดียวในไฟล์ที่ตรวจว่า *ค่า* ถูกประเทศ** · เคสอื่นตรวจว่า *มีคีย์* (`toBeTruthy`)
    //    หรือตรวจว่าไม่รู้จักแล้วตอบ `null` — ทั้งสองแบบผ่านได้แม้ตารางแมปผิดประเทศ
    //    🎯 ถ้าปล่อยให้หายไปพร้อมฟังก์ชัน จะดูเหมือนเสียเคสเดียวจากสิบ **แต่เสียการคุ้มครองทั้งชนิด**
    expect(countryOfCitySlug("hanoi")).toBe("vn");
    expect(countryOfCitySlug("seoul")).toBe("kr");
    expect(countryOfCitySlug("busan")).toBe("kr");
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

    it("ตัวพิมพ์ใหญ่/ช่องว่างจากฐานยังแมปได้", () => {
      // 🎯 ฝั่ง**อ่าน**ผ่อนปรนโดยตั้งใจ · ผลของการเข้มงวดตรงนี้คือ
      //    **คนที่อยู่โซลไม่เห็นเบอร์ฉุกเฉิน** ซึ่งแย่กว่ายอมรับช่องว่างมาก
      //    ⚠️ ที่ควรเข้มงวดคือ CHECK constraint ตอนเขียน — **ยังไม่มี จดไว้แล้ว**
      expect(countryOfCitySlug("Seoul")).toBe("kr");
      expect(countryOfCitySlug("  seoul  ")).toBe("kr");
      expect(countryOfCitySlug("\tSEOUL\n")).toBe("kr");
    });

    it("🔴 สตริงที่ *ดูเหมือน* เมือง แต่ไม่ใช่ → ยังต้องเป็น `null`", () => {
      // ผ่อนปรนเรื่องช่องว่าง **ไม่ใช่**ผ่อนปรนเรื่องความถูกต้อง
      expect(countryOfCitySlug("seoul/../x")).toBeNull();
      expect(countryOfCitySlug("seoul2")).toBeNull();
      expect(countryOfCitySlug("se oul")).toBeNull();
      expect(countryOfCitySlug("__proto__")).toBeNull();
      expect(countryOfCitySlug("constructor")).toBeNull();
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

  /**
   * 🔴 **มีตารางที่รู้เรื่องประเทศอยู่ *สองใบ* คนละคีย์ — และมันเคยไม่ตรงกัน**
   * · `COUNTRY_OF_CITY` (คีย์ = `City` จาก ITINERARY · 6 เมือง)
   * · `CITY_LOCALE` (คีย์ = `Place["city"]` · **8 เมือง** — มี `bangkok`/`hcmc` เพิ่ม)
   *
   * ⚠️ **เทสต์นี้จงใจ *ไม่* ยืนยันว่า "ภาษา ⇒ ประเทศ"** — นั่นคือข้ออนุมานที่ `isKoreanCity()`
   * ใช้แล้วผิด (ถูกลบ 27 ส.ค. 2026) · เกาหลีพูดเกาหลีเป็นเรื่องบังเอิญของสองประเทศนี้ ไม่ใช่กฎ
   * 🎯 **สิ่งที่ยืนยันคือ *ความครอบคลุม*: ทุกวันของทริปต้องตอบได้ทั้งประเทศและภาษา**
   */
  describe("สองตารางที่รู้เรื่องประเทศ ต้องครอบทุกวันของทริป", () => {
    it("ทุกเมืองของ ITINERARY มีทั้ง country และ locale", () => {
      const missing: string[] = [];
      for (const city of new Set(ITINERARY.map((d) => d.city))) {
        if (!COUNTRY_OF_CITY[city]) missing.push(`${city}: ไม่มีประเทศ`);
        if (!CITY_LOCALE[city]) missing.push(`${city}: ไม่มีภาษา`);
      }
      expect(missing).toEqual([]);
    });

    it("เมืองที่มีเฉพาะใน `CITY_LOCALE` → `countryOfCitySlug` ตอบ `null` อย่างซื่อสัตย์", () => {
      // `bangkok` เป็นไทย · `hcmc` เป็นเวียดนาม — ทั้งคู่เป็นสนามบินต่อเครื่อง ไม่ใช่วันของทริป
      // 🎯 `null` ที่นี่ **ถูก** เพราะทะเบียนยังไม่รู้จักไทย · เดาว่า "kr" คือสิ่งที่เราเพิ่งลบทิ้ง
      expect(countryOfCitySlug("bangkok")).toBeNull();
      expect(CITY_LOCALE.bangkok).toBe("th");
    });
  });
});
