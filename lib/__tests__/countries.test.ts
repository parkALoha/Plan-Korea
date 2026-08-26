import { describe, expect, it } from "vitest";
import {
  capabilitiesOf,
  shouldSkipTravelApi,
  countriesWithCapabilities,
  hasRealTravelTime,
  mapProvidersFor,
  shouldSkipTravelApiForLeg,
  placeLocaleOf,
  knownPlaceLocales,
} from "../engine/countries";

/**
 * `E4-AC1`/`AC3` — ทะเบียนความสามารถรายประเทศ
 *
 * 🔴 **เคสที่สำคัญที่สุดคือเคสประเทศที่ *ไม่มี* ในทะเบียน** — ไม่ใช่เคสที่มี
 * `E4-AC1` วัดว่า *"สร้างทริปญี่ปุ่นได้โดยไม่แก้โค้ดสักบรรทัด"* · ถ้าประเทศที่ไม่รู้จักทำให้พัง
 * การเพิ่มญี่ปุ่นจะกลายเป็นการแก้โค้ดทันที และ `AC1` ตกทุกครั้งโดยไม่มีใครสังเกต
 */
describe("E4 — ทะเบียนความสามารถรายประเทศ", () => {
  it("🔴 ประเทศที่ไม่มีในทะเบียน ต้องใช้งานได้ ไม่ใช่พัง (`E4-AC1`)", () => {
    for (const unknown of ["jp", "JP", "th", "us", "xx"]) {
      const cap = capabilitiesOf(unknown);
      expect(cap, `${unknown} ต้องได้ค่ากลับ ไม่ใช่ undefined`).toBeTruthy();
      expect(cap.mapProviders.length, `${unknown} ต้องมีแผนที่ให้ใช้อย่างน้อยหนึ่งเจ้า`).toBeGreaterThan(0);
    }
  });

  it("🔴 ประเทศที่ไม่รู้จัก ต้องถือว่าเวลาเดินทาง **เป็นประมาณการทุกโหมด**", () => {
    // ทิศของการเดาผิดสำคัญกว่าความแม่น: เดาว่า "ตอบได้" แล้วผิด = ผู้ใช้เห็นเวลาผิดโดยไม่มีป้าย
    // เดาว่า "ตอบไม่ได้" แล้วผิด = เห็นป้าย "(ประมาณการ)" เกินจริง — **อย่างหลังกู้ได้ อย่างแรกไม่**
    for (const mode of ["transit", "drive", "walk"] as const) {
      expect(hasRealTravelTime("jp", mode), `jp/${mode} ไม่ควรถูกถือว่าเป็นเวลาจริง`).toBe(false);
    }
  });

  it("null / undefined / สตริงว่าง ต้องไม่โยน", () => {
    for (const v of [null, undefined, ""]) {
      expect(() => capabilitiesOf(v)).not.toThrow();
      expect(mapProvidersFor(v).length).toBeGreaterThan(0);
    }
  });

  it("🔴 ด้านบวก — เกาหลีต้องต่างจากค่าเริ่มต้นจริง ไม่งั้นทะเบียนไม่ได้ทำอะไรเลย", () => {
    // ถ้าข้อนี้ไม่มี เคสข้างบนจะเขียวได้แม้ทะเบียนว่างเปล่าทั้งใบ
    expect(hasRealTravelTime("kr", "transit"), "PLAN.md §2: เกาหลีมี TRANSIT จริง").toBe(true);
    expect(hasRealTravelTime("kr", "drive"), "PLAN.md §2: เกาหลีไม่มี DRIVE (ข้อจำกัดกฎหมาย)").toBe(false);
    expect(hasRealTravelTime("kr", "walk"), "PLAN.md §2: เกาหลีไม่มี WALK").toBe(false);
    expect(mapProvidersFor("kr")[0], "เกาหลีควรเห็นเจ้าถิ่นก่อน").not.toBe("google");
  });

  it("ตัวพิมพ์ใหญ่/เล็กของรหัสประเทศต้องไม่ทำให้ผลต่างกัน", () => {
    expect(capabilitiesOf("KR")).toEqual(capabilitiesOf("kr"));
  });

  it("🔴 ทุกประเทศในทะเบียนต้องมีแผนที่อย่างน้อยหนึ่งเจ้า — แถวที่ลืมใส่จะทำให้ปุ่มหายทั้งหน้า", () => {
    for (const c of countriesWithCapabilities()) {
      expect(mapProvidersFor(c).length, `${c} ไม่มี mapProviders`).toBeGreaterThan(0);
    }
  });

  describe("shouldSkipTravelApi — 'อย่ายิง' ไม่ใช่ 'อย่าเชื่อ'", () => {
    it("🔴 ประเทศที่ไม่รู้จัก ต้อง **ยิงตามปกติ** ไม่ใช่ข้าม", () => {
      // ถ้าข้ามด้วย จะไม่มีวันรู้ว่าญี่ปุ่นตอบ DRIVE ได้จริงไหม เพราะไม่เคยถาม
      // → ทะเบียนจะ "ถูก" ตลอดไปโดยไม่มีใครท้าทายได้ · คำทำนายที่ทำให้ตัวเองเป็นจริง
      for (const mode of ["transit", "drive", "walk"] as const) {
        expect(shouldSkipTravelApi("jp", mode), `jp/${mode} ต้องไม่ถูกข้าม`).toBe(false);
      }
      expect(shouldSkipTravelApi(null, "drive")).toBe(false);
    });

    it("🔴 ข้ามเฉพาะที่ **รู้แน่ว่าไม่มี** — และต้องไม่ข้ามโหมดที่มี", () => {
      expect(shouldSkipTravelApi("kr", "drive"), "รู้แน่ว่าเกาหลีไม่มี → ข้าม").toBe(true);
      expect(shouldSkipTravelApi("kr", "walk")).toBe(true);
      expect(shouldSkipTravelApi("kr", "transit"), "เกาหลีมี TRANSIT → ห้ามข้าม").toBe(false);
      expect(shouldSkipTravelApi("vn", "drive"), "เวียดนามมีครบ → ห้ามข้าม").toBe(false);
    });

    it("🎯 ความต่างจาก hasRealTravelTime อยู่ที่ประเทศที่ไม่รู้จัก — ถ้าเหมือนกันแปลว่าฟังก์ชันนี้ไม่จำเป็น", () => {
      expect(hasRealTravelTime("jp", "drive")).toBe(false); // ไม่รู้ → ถือเป็นประมาณการ
      expect(shouldSkipTravelApi("jp", "drive")).toBe(false); // แต่ยังต้องยิงเพื่อไปรู้
    });
  });

  /**
   * 🔴 **สายโปรโตไทป์ — บั๊กจริงที่เจอด้วยเทสต์ 27 ส.ค. 2026 ไม่ใช่การเผื่อไว้**
   *
   * ฉบับก่อนหน้าเขียน `CAPABILITIES[countryCode.toLowerCase()] ?? UNKNOWN_COUNTRY`
   * · `"constructor"` → คืนฟังก์ชัน `Object` **ออกมาเป็นความสามารถของประเทศ**
   * · `"__proto__"` → คืน `Object.prototype`
   * ทั้งคู่เป็นค่า truthy → `??` ไม่ทำงาน → `.mapProviders` เป็น `undefined`
   * → `mapActionsFor()` เรียก `.map()` บนนั้น → **`TypeError` พัง UI ทั้งหน้า**
   *
   * 🎯 **จับได้เพราะลงมือเขียนเคส ไม่ใช่เพราะนึกออก** — ผมกำลังจะฝากช่องนี้ให้ P4 ไปลอง
   * ทั้งที่รู้อยู่แล้วว่ามันอยู่ตรงไหน · **การส่งต่อช่องที่ตัวเองรู้แล้ว คือละคร ไม่ใช่การทดสอบ**
   */
  describe("คีย์ที่เป็นสมบัติของ Object ไม่ใช่ประเทศ", () => {
    const HOSTILE = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];

    it("ไม่โยน `TypeError` สักตัว", () => {
      for (const k of HOSTILE) {
        expect(() => capabilitiesOf(k), k).not.toThrow();
        expect(() => mapProvidersFor(k), k).not.toThrow();
        expect(() => shouldSkipTravelApi(k, "drive"), k).not.toThrow();
      }
    });

    it("ได้ค่าของ 'ประเทศที่ไม่รู้จัก' เหมือนสตริงมั่วทั่วไป", () => {
      for (const k of HOSTILE) {
        expect(capabilitiesOf(k).mapProviders, k).toEqual(["google"]);
        expect(capabilitiesOf(k).realTravelModes, k).toEqual([]);
        // ⚠️ ไม่รู้จัก → **ยิง** ไม่ใช่ข้าม (ให้ผลจริงสอนเรา) เหมือน `"jp"` ทุกประการ
        expect(shouldSkipTravelApi(k, "drive"), k).toBe(false);
      }
    });

    it("ไม่โผล่ในรายชื่อประเทศที่ทะเบียนรู้จัก", () => {
      const known = countriesWithCapabilities();
      for (const k of HOSTILE) expect(known, k).not.toContain(k);
      expect([...known].sort()).toEqual(["kr", "vn"]);
    });
  });

  /**
   * 🔴 **`nav_providers` จากฐานเป็นเจ้าของ · ตารางในโค้ดเป็นค่าสำรอง** (27 ส.ค. 2026)
   * คอลัมน์นี้มีในฐานมาตั้งแต่ `20260825132854` และ `rlsMatrix` ทดสอบมันอยู่
   * **แต่ไม่มีโค้ดแอปไหนอ่านมันเลย** — ผมสร้างตารางในโค้ดขึ้นมาตอบคำถามเดียวกันโดยไม่รู้
   */
  describe("nav_providers จากฐาน", () => {
    it("ฐานตอบมา → ใช้ของฐาน ไม่ใช่ของโค้ด", () => {
      // เกาหลีในตารางโค้ดคือ ["naver","kakao","google"] · ฐานสั่งให้เหลือ google อย่างเดียวได้
      expect(mapProvidersFor("kr", ["google"])).toEqual(["google"]);
      expect(mapProvidersFor("vn", ["kakao", "google"])).toEqual(["kakao", "google"]);
    });

    it("🔴 ลิสต์ว่าง = **ยังไม่ตั้งค่า** ไม่ใช่ **ไม่มีแผนที่**", () => {
      // `nav_providers` มี `default '{}'` → ทุกประเทศที่เพิ่งเพิ่มจะว่าง
      // ถ้าตีความว่า "ไม่มีแผนที่" **ประเทศใหม่จะไม่มีปุ่มนำทางเลยสักปุ่ม**
      expect(mapProvidersFor("kr", [])).toEqual(["naver", "kakao", "google"]);
      expect(mapProvidersFor("jp", [])).toEqual(["google"]);
      expect(mapProvidersFor("jp", null)).toEqual(["google"]);
      expect(mapProvidersFor("jp", undefined)).toEqual(["google"]);
    });

    it("🔴 ค่าที่ไม่รู้จักจากฐานถูกทิ้ง — `text[]` ไม่มี CHECK บังคับ", () => {
      expect(mapProvidersFor("kr", ["bing", "naver", "here"])).toEqual(["naver"]);
    });

    it("🔴 ถ้าทิ้งจนหมด ต้องตกไปใช้ค่าสำรอง ไม่ใช่คืนลิสต์ว่าง", () => {
      // แถวที่ข้อมูลพังทั้งแถว **ต้องไม่ทำให้ผู้ใช้ไม่มีปุ่มนำทาง**
      expect(mapProvidersFor("kr", ["bing", "here"])).toEqual(["naver", "kakao", "google"]);
      expect(mapProvidersFor("jp", ["bing"])).toEqual(["google"]);
    });

    it("คีย์โปรโตไทป์จากฐานก็ถูกทิ้งเหมือนกัน", () => {
      expect(mapProvidersFor("jp", ["constructor", "__proto__"])).toEqual(["google"]);
    });
  });

  /**
   * 🔴 **ขาเดินทางข้ามประเทศ — ช่องที่ P5 ชี้ และไม่เคยมีใครตัดสิน** (27 ส.ค. 2026)
   * ทริปนี้มีวันข้ามประเทศ 3 วัน ตั้งแต่วันแรก · `shouldSkipTravelApi()` รับประเทศเดียว
   */
  describe("shouldSkipTravelApiForLeg", () => {
    it("ในประเทศเดียวกันที่รู้แน่ว่าไม่มีโหมดนี้ → ข้าม", () => {
      expect(shouldSkipTravelApiForLeg("kr", "kr", "drive")).toBe(true);
      expect(shouldSkipTravelApiForLeg("kr", "KR", "walk")).toBe(true); // ตัวพิมพ์ไม่สำคัญ
    });

    it("ในประเทศเดียวกันที่มีโหมดนี้ → ไม่ข้าม", () => {
      expect(shouldSkipTravelApiForLeg("kr", "kr", "transit")).toBe(false);
      expect(shouldSkipTravelApiForLeg("vn", "vn", "drive")).toBe(false);
    });

    it("🔴 ข้ามประเทศ → **ยิงเสมอ** แม้ทั้งสองฝั่งจะรู้ว่าไม่มีโหมดนี้", () => {
      // เกาหลีไม่มี drive จริง · แต่ขา โซล→ฮานอย ไม่ใช่ "ขาของเกาหลี" หรือ "ขาของเวียดนาม"
      // 🎯 เราไม่มีนิยามว่าความสามารถของขานี้เป็นของใคร **และการเดาที่นี่ราคาแพงกว่าการยิง**
      expect(shouldSkipTravelApiForLeg("kr", "vn", "drive")).toBe(false);
      expect(shouldSkipTravelApiForLeg("vn", "kr", "walk")).toBe(false);
    });

    it("ไม่รู้ปลายใดปลายหนึ่ง → ยิง", () => {
      expect(shouldSkipTravelApiForLeg(null, "kr", "drive")).toBe(false);
      expect(shouldSkipTravelApiForLeg("kr", null, "drive")).toBe(false);
      expect(shouldSkipTravelApiForLeg("kr", "zu", "drive")).toBe(false);
      expect(shouldSkipTravelApiForLeg(undefined, undefined, "drive")).toBe(false);
    });

    it("คีย์โปรโตไทป์ยังปลอดภัย", () => {
      expect(() => shouldSkipTravelApiForLeg("constructor", "constructor", "drive")).not.toThrow();
      expect(shouldSkipTravelApiForLeg("constructor", "constructor", "drive")).toBe(false);
    });
  });

  /**
   * 🔴 **ภาษาของสถานที่ — ก่อนวันนี้มีรายการอยู่ 4 ที่ที่ไม่ตรงกัน** (`D46`)
   * `place-details`=["ko","vi"] · `place-name`=["en","ko","vi"] · `geocode`=**ไม่ตรวจเลย** · `CITY_LOCALE` มี "th"
   */
  describe("placeLocaleOf / knownPlaceLocales", () => {
    it("ประเทศที่รู้จักได้ภาษาท้องถิ่น", () => {
      expect(placeLocaleOf("kr")).toBe("ko");
      expect(placeLocaleOf("VN")).toBe("vi");
    });

    it("🔴 ไม่รู้จัก → `null` **ไม่ใช่ `\"en\"`**", () => {
      // ไม่รู้ภาษาของที่นั่น ≠ รู้ว่าเป็นอังกฤษ
      // ส่ง `null` ให้ Google = ให้มันเลือกเอง · ส่ง `"en"` = **สั่งให้ทับชื่อท้องถิ่นด้วยอังกฤษ**
      expect(placeLocaleOf("jp")).toBeNull();
      expect(placeLocaleOf(null)).toBeNull();
      expect(placeLocaleOf("constructor")).toBeNull();
    });

    it("รายการ allowlist มาจากทะเบียน ไม่ใช่รายการที่พิมพ์มือ", () => {
      expect([...knownPlaceLocales()].sort()).toEqual(["ko", "vi"]);
    });

    it("🔴 ทุกประเทศในทะเบียนต้องมีช่องนี้ (ไม่ปล่อยให้เงียบ)", () => {
      for (const cc of countriesWithCapabilities()) {
        expect(capabilitiesOf(cc), cc).toHaveProperty("placeLocale");
        expect(placeLocaleOf(cc), cc).toBeTruthy();
      }
    });
  });
});
