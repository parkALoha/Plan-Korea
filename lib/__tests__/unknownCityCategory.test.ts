import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryMetaOf, UNSET_CATEGORY_META } from "@/components/categoryMeta";
import { cityLocaleOf, placeCityNameThOf } from "@/components/placeCity";
import { UNSET_CITY_NAME_TH } from "@/components/cityMeta";
import { dwellMinutesOf } from "@/lib/schedule";
import { resolvePlace } from "@/lib/resolvePlace";

/**
 * ด่านของ **`E6-AC12`** — *`Place["city"]`/`["category"]` เลิกเป็นยูเนียนปิดที่ `cast` มาจากฐาน*
 * เจ้าของ: P3-FE/Perf · 2 ก.ย. 2026
 *
 * ## 🔴 เกณฑ์รับที่ใช้ — และเกณฑ์ที่ **ถูกถอน** เพราะผ่านได้โดยไม่แก้อะไรเลย
 * เกณฑ์แรก (P1 เขียน) คือ *"ทุก lookup ต้องมีพฤติกรรมที่นิยามไว้เมื่อค่าไม่รู้จัก"*
 * **ช่องของมัน: ไม่มีใครเดินเส้นทางนั้นเลยก็ยังผ่าน** ถ้าผู้ผลิตค่าทุกรายยังใส่ค่าที่ผ่าน type เหมือนเดิม
 * · หลักฐานของช่องคือ `lib/resolvePlace.ts` เอง — `city: "seoul"` ผ่าน type สบาย ๆ
 *   **lookup จึงไม่เคยเห็นค่า "ไม่รู้" เพราะไม่มีใครผลิตมันเลย**
 *
 * **เกณฑ์ที่ใช้จริง (P3 เสนอ · P1 รับ) — สองข้อ และข้อ ② คือข้อที่มีฟัน:**
 * ① ค่านั้นต้องเป็น **"ไม่รู้" ที่ระบบรับได้จริง** (`city: null`) ไม่ใช่ค่าที่ดูเหมือนคำตอบ
 * ② **ค่าสังเคราะห์ต้องเดินผ่านเส้นทาง "ไม่รู้" จริง** — พิสูจน์ด้วยการป้อนเมือง/หมวดที่ไม่รู้จักเข้าทุก lookup
 *
 * 🔴 **ห้ามเขียนเกณฑ์ว่า *"ไม่มี `as Place[...]` เหลือในรีโป"*** — ปิดได้ด้วยการย้าย `cast` ไปที่อื่น
 * โดยไม่แตะราก · ไฟล์นี้จึงตรวจ **พฤติกรรม** ไม่ใช่ตรวจว่ามีคำว่า `as` กี่ตัว
 *
 * ## 📌 เคสปลายทางของ `dwellMinutesOf` อยู่คนละไฟล์ **โดยตั้งใจ**
 * `lib/__tests__/dwellFallback.test.ts` พิสูจน์ผลกับ `computeSchedule` จริงอยู่แล้ว (หมวดไม่รู้จัก →
 * `DWELL_MINUTES_FALLBACK` → เวลาไม่เป็น `NaN`) · **ที่นี่จึงตรวจแค่ตัว accessor ไม่เขียนซ้ำ**
 *
 * ## ⚠️ ครอบเท่าที่มันครอบ
 * ✅ accessor ทุกตัวคืน fallback ที่นิยามไว้ · ✅ โรงแรมสังเคราะห์เดินเส้นทาง `null` จริง
 * ❌ **ไม่ได้พิสูจน์ว่าหน้าจอแสดงอะไร** — การหล่นหายจาก *ลำดับ* (เช่นการจัดกลุ่มใน `PlaceSidebar`)
 *    เป็นคนละชั้นกับ lookup · เคส `PlaceSidebar` ข้างล่างจึงตรวจ *ซอร์ส* ไม่ใช่ผลเรนเดอร์
 */

const UNKNOWN_CITY = "tokyo";
const UNKNOWN_CATEGORY = "onsen";

describe("🔴 E6-AC12 ② — เมือง/หมวดที่ไม่รู้จัก ต้องเดินเส้นทางที่นิยามไว้ ไม่ใช่คืน undefined เงียบ ๆ", () => {
  it("① เคสควบคุมฝั่งบวก — ค่าที่ *รู้จัก* ต้องยังได้ของจริง ไม่ใช่ fallback ทุกอัน", () => {
    // ถ้าไม่มีเคสนี้ accessor ที่คืน fallback เสมอจะทำให้ทุกเคสข้างล่างเขียว โดยไม่ได้ทำงานเลย
    expect(cityLocaleOf("busan")).toBe("ko");
    expect(cityLocaleOf("hanoi")).toBe("vi");
    expect(placeCityNameThOf("seoul")).not.toBe(UNSET_CITY_NAME_TH);
    expect(categoryMetaOf("cafe").label).not.toBe(UNSET_CATEGORY_META.label);
    expect(dwellMinutesOf("culture")).toBe(75);
  });

  it("② เมืองที่ไม่รู้จัก → fallback ที่นิยามไว้ ทุกตัว", () => {
    expect(cityLocaleOf(UNKNOWN_CITY)).toBeNull();
    expect(placeCityNameThOf(UNKNOWN_CITY)).toBe(UNSET_CITY_NAME_TH);
  });

  it("③ หมวดที่ไม่รู้จัก → fallback ที่นิยามไว้ ทุกตัว", () => {
    expect(categoryMetaOf(UNKNOWN_CATEGORY)).toEqual(UNSET_CATEGORY_META);
    expect(dwellMinutesOf(UNKNOWN_CATEGORY)).toBeUndefined();
  });

  it("④ `null`/`undefined` ก็ต้องเดินเส้นทางเดียวกัน — 'ไม่รู้' กับ 'ไม่มีค่า' ห้ามแยกพฤติกรรม", () => {
    expect(cityLocaleOf(null)).toBeNull();
    expect(cityLocaleOf(undefined)).toBeNull();
    expect(placeCityNameThOf(null)).toBe(UNSET_CITY_NAME_TH);
    expect(categoryMetaOf(null)).toEqual(UNSET_CATEGORY_META);
  });

  /**
   * 🔴 index ตรง ๆ ด้วยคีย์จาก prototype คืนค่า **truthy** → `?? fallback` ไม่ช่วยเลย
   * `dwellMinutesOf` เป็นเคสที่แรงที่สุด: `DEFAULT_DWELL_MINUTES["constructor"]` เป็น *ฟังก์ชัน*
   * → `cursor += fn` = `NaN` **ทั้งวัน** ไม่ใช่แค่แถวเดียว
   */
  it("⑤ 🔴 คีย์จาก prototype ต้องตกลง fallback — ไม่ใช่คืนของจาก Object.prototype", () => {
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(categoryMetaOf(key), key).toEqual(UNSET_CATEGORY_META);
      expect(dwellMinutesOf(key), key).toBeUndefined();
      expect(cityLocaleOf(key), key).toBeNull();
      expect(placeCityNameThOf(key), key).toBe(UNSET_CITY_NAME_TH);
    }
  });
});

describe("🔴 E6-AC12 ① — ค่าสังเคราะห์ต้องพูดว่า 'ไม่รู้' ไม่ใช่ค่าที่ดูเหมือนคำตอบ", () => {
  /**
   * 🔴 **เคสนี้คือทั้งข้อ ①** — จนถึง 2 ก.ย. 2026 แถวนี้เป็น `city: "seoul"` พร้อมคอมเมนต์ว่า
   * *"ไม่ได้ใช้จริง แต่ type บังคับให้ใส่"* → **โรงแรมที่โตเกียวประกาศตัวว่าอยู่โซล**
   * · รูปเดียวกับ `noHotel` ที่ "ไม่มีใครส่งมา" แล้ว `hotelLegs` อ่านมันจริง (นับวันบินเป็นคืนที่ต้องมีโรงแรม)
   */
  it("โรงแรมสังเคราะห์ (`hotel@lat,lng`) ต้องมี `city === null`", () => {
    const hotel = resolvePlace("hotel@37.5,127.0", []);
    expect(hotel, "resolve ไม่ออก — รูปของ id เปลี่ยน เคสนี้กำลังจะ no-op").not.toBeNull();
    expect(hotel!.city, 'ค่าที่ "ไม่ได้ใช้จริง" คือค่าที่จะมีคนอ่านวันหนึ่ง').toBeNull();
  });

  it("และมันต้อง *เดินผ่าน* เส้นทางไม่รู้จักจริง ไม่ใช่แค่เก็บ null ไว้เฉย ๆ", () => {
    const hotel = resolvePlace("hotel@37.5,127.0", [])!;
    expect(placeCityNameThOf(hotel.city)).toBe(UNSET_CITY_NAME_TH);
    expect(cityLocaleOf(hotel.city)).toBeNull();
  });
});

describe("🔴 E6-AC12 — หมวดที่ไม่รู้จักต้องไม่หล่นหายจาก *ลำดับ* ของคลังสถานที่", () => {
  /**
   * 🎯 **คนละชั้นกับ lookup** — `PlaceSidebar` วน `CATEGORY_ORDER` เพื่อจัดกลุ่ม
   * สถานที่ที่หมวดไม่อยู่ในลำดับนั้นจะ **ไม่ถูกเรนเดอร์เลย และไม่มี error อะไรทั้งสิ้น**
   * `tsc` มองไม่เห็น เพราะชนิดถูกทุกบรรทัด · accessor ก็ช่วยไม่ได้ เพราะไม่มี lookup ตรงไหนผิด
   * ⚠️ ตรวจ *ซอร์ส* ไม่ใช่ผลเรนเดอร์ — ครอบแค่ว่า "มีทางให้หมวดนอกลำดับโผล่" ไม่ใช่ว่ามันสวย
   */
  /**
   * 🔴 **แก้ 2 ก.ย. 2026 ภายในวันเดียวกับที่เขียน — เกณฑ์เดิมผูกกับ *ชื่อตัวแปรของผมเอง***
   * ฉบับแรกเช็ค `toContain("leftovers")` · P2 รับงานนี้ไปทำต่อในโซนเขา แล้วยุบเป็นถังเดียว
   * (หมวดแปลกสองตัวจะได้ป้าย `"📍 อื่น ๆ"` เหมือนกันเป๊ะสองกลุ่มติดกัน — อ่านเป็นบั๊ก)
   * **พฤติกรรมดีขึ้น · เคสของผมแดง** เพราะมันวัด *ชื่อ* ไม่ได้วัด *คุณสมบัติ*
   * 🎯 รูปเดียวกับที่ทีมเจอกับ `useLegacyDayPlanGate` ใน `GATES` เมื่อเช้านี้เป๊ะ —
   *    **เกณฑ์ที่ผูกกับชื่อ ต้องมาแก้ทุกครั้งที่ชื่อเปลี่ยน · เกณฑ์ที่ผูกกับคุณสมบัติไม่ต้อง**
   * ✅ คุณสมบัติที่แท้จริงคือ **รายชื่อกลุ่มต้อง derive จาก *ข้อมูล* ไม่ใช่จาก `CATEGORY_ORDER` อย่างเดียว**
   *    → ตัววัดคือ "มีการวนคีย์ที่พบจริงในข้อมูล" ซึ่งจริงกับทั้งสองฉบับ และเป็นเท็จกับโค้ดเดิมที่บั๊ก
   * ⚠️ **นี่คือตัวแทนระดับซอร์ส ไม่ใช่การพิสูจน์ว่าจอแสดงอะไร** — ครอบแค่ว่า *มีทางให้มันโผล่*
   */
  /**
   * 🔴 เคสควบคุมของตัววัด — **ยิงกับสตริง ไม่ใช่กับไฟล์ของ P2**
   * ไฟล์นั้นเป็นงานที่เขากำลังพิมพ์อยู่ · การแก้มันชั่วคราวเพื่อทดสอบทิศแดง = แตะงานคนอื่นบนทรีร่วม
   * → พิสูจน์ว่าตัววัดแยกแยะได้จริงด้วยตัวอย่างทั้งสองฝั่งแทน (ฉบับบั๊ก · ฉบับที่ใช้ได้สองแบบ)
   */
  it("เคสควบคุม — ตัววัดต้องแยก 'วน CATEGORY_ORDER อย่างเดียว' ออกจาก 'derive จากข้อมูล'", () => {
    const derivesFromData = (src: string) => /byCategory\.keys\(\)/.test(src);
    const buggy = "return CATEGORY_ORDER.map((c) => ({ c, cards: byCategory.get(c) ?? [] }));";
    const fixedSeparate = "const leftovers = [...byCategory.keys()].filter((c) => !known.has(c));";
    const fixedOneBucket = "cards: [...byCategory.keys()].filter((c) => !known.has(c)).flatMap(…)";
    expect(derivesFromData(buggy), "ฉบับบั๊กต้องถูกจับ").toBe(false);
    expect(derivesFromData(fixedSeparate)).toBe(true);
    expect(derivesFromData(fixedOneBucket)).toBe(true);
  });

  it("PlaceSidebar ต้อง derive กลุ่มจากข้อมูล ไม่ใช่จาก CATEGORY_ORDER อย่างเดียว", () => {
    const src = readFileSync(join(process.cwd(), "components/PlaceSidebar.tsx"), "utf8");
    expect(src, "อ่านไฟล์ไม่ออก — เคสนี้กำลังจะ no-op").toContain("CATEGORY_ORDER");
    expect(
      /byCategory\.keys\(\)/.test(src),
      "จัดกลุ่มด้วย CATEGORY_ORDER อย่างเดียว = สถานที่ที่หมวดไม่รู้จักหายจากคลังเงียบ ๆ\n" +
        "  → ต้องมีการวนคีย์ที่พบจริงในข้อมูล (ถังท้าย/กลุ่มเพิ่ม แล้วแต่ UX ที่เจ้าของโซนเลือก)"
    ).toBe(true);
  });
});
