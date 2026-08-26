import { describe, expect, it } from "vitest";
import {
  capabilitiesOf,
  countriesWithCapabilities,
  hasRealTravelTime,
  mapProvidersFor,
  shouldSkipTravelApi,
} from "@/lib/engine/countries";
import { mapActionsFor } from "@/lib/mapLinks";
import { countryOfCitySlug } from "@/data/emergency";

/**
 * `E4-AC1` — *"สร้างทริปญี่ปุ่นได้โดยไม่แก้โค้ดสักบรรทัด"* (P1 · 27 ส.ค. 2026)
 *
 * วิธีวัดที่เกณฑ์กำหนดเอง: เพิ่มประเทศใหม่ = แก้ข้อมูล 1 ที่ แล้ว `git diff --stat`
 * ของโฟลเดอร์โค้ดต้องได้ **0 ไฟล์**
 *
 * ## 🔴 เทสต์นี้ยืนยันอะไร และ **ไม่** ยืนยันอะไร — อ่านก่อนติ๊กเกณฑ์
 * ✅ **ยืนยัน:** ประเทศที่โค้ด*ไม่เคยได้ยินชื่อ* เดินผ่านทุกฟังก์ชันได้โดยไม่โยน
 *    ได้ค่าที่ **ใช้งานได้จริง** (ไม่ใช่ค่าว่าง/ปุ่มหาย) และ **ทะเบียนในโค้ดไม่ต้องโตขึ้นเลย**
 * ❌ **ไม่ยืนยัน:** ว่าเปิดหน้าทริปญี่ปุ่นในเบราว์เซอร์แล้วเห็นอะไร — ต้องมีข้อมูลจริงในฐาน
 *    และเดินผ่าน `/trip/[tripId]` · **นั่นคือครึ่งที่เหลือ และมันยังไม่ถูกวัด**
 * 🎯 เขียนแยกไว้ตรง ๆ เพราะเกณฑ์ข้อนี้เคยถูกบล็อกโดย `E5` มาแล้ว —
 *    **การมีเทสต์นี้ไม่ได้แปลว่าเกณฑ์ปิด** มันแปลว่าครึ่งที่วัดได้ วัดแล้ว
 *
 * ⚠️ ใช้รหัสสมมติ `"zu"` **ไม่ใช่ `"jp"` โดยตั้งใจ** — รหัสจริงอาจเผลอไปโผล่ที่ไหนสักแห่ง
 * แล้วเทสต์จะผ่านเพราะมีคนใส่ไว้ให้ ไม่ใช่เพราะระบบรองรับ · **รหัสที่เป็นไปไม่ได้พิสูจน์ได้แน่นกว่า**
 */
const UNKNOWN = "zu";
const TARGET = { lat: 35.68, lng: 139.69, name: "東京駅" };

describe("E4-AC1 — ประเทศที่โค้ดไม่รู้จัก ต้องใช้งานได้ ไม่ใช่พัง", () => {
  it("🔴 ทะเบียนในโค้ดยังมีแค่ 2 ประเทศ — **ไม่ต้องเพิ่มแถวเพื่อรองรับประเทศใหม่**", () => {
    // 🎯 นี่คือหัวใจของเกณฑ์ในรูปที่เทสต์วัดได้:
    //    ถ้าการรองรับประเทศใหม่ *บังคับ* ให้เพิ่มแถวที่นี่ **`git diff` จะได้ 1 ไฟล์เสมอ**
    expect([...countriesWithCapabilities()].sort()).toEqual(["kr", "vn"]);
  });

  it("ไม่มีฟังก์ชันไหนโยน", () => {
    expect(() => capabilitiesOf(UNKNOWN)).not.toThrow();
    expect(() => mapProvidersFor(UNKNOWN)).not.toThrow();
    expect(() => mapActionsFor(UNKNOWN, TARGET)).not.toThrow();
    expect(() => hasRealTravelTime(UNKNOWN, "transit")).not.toThrow();
    expect(() => shouldSkipTravelApi(UNKNOWN, "drive")).not.toThrow();
  });

  it("🔴 ได้ปุ่มนำทางที่ **ใช้งานได้** ไม่ใช่ไม่มีปุ่ม", () => {
    const actions = mapActionsFor(UNKNOWN, TARGET);
    expect(actions).toHaveLength(1);
    expect(actions[0].provider).toBe("google");
    expect(actions[0].kind).toBe("href");
    // ⚠️ "ไม่พัง" ไม่พอ — ปุ่มที่ขึ้นมาแล้วกดไปไม่ถึงไหน แย่พอ ๆ กับไม่มีปุ่ม
    const url = actions[0].kind === "href" ? actions[0].url : "";
    expect(url).toContain("google.com/maps");
    // 🎯 **ลิงก์นำทางใช้พิกัด ไม่ใช่ชื่อ — และนั่นถูกสำหรับประเทศที่เราไม่รู้จัก**
    //    ผมเขียนเคสแรกยืนยันว่าชื่อ `東京駅` ต้องอยู่ใน URL **แล้วมันแดง · เทสต์ผิด ไม่ใช่โค้ดผิด**
    //    ชื่อพึ่งภาษา/การสะกด/ฐานข้อมูลของผู้ให้บริการ · **พิกัดไม่พึ่งอะไรเลย**
    //    → ประเทศที่เราไม่มีข้อมูลชื่อท้องถิ่นเลย ยังนำทางถูกที่ได้
    expect(url).toContain(`destination=${TARGET.lat},${TARGET.lng}`);
  });

  it("🔴 ยิง API เดินทางตามปกติ — ไม่ข้าม", () => {
    // ถ้าข้าม **เราจะไม่มีวันรู้ว่าประเทศนั้นมีข้อมูลจริงไหม เพราะไม่เคยถาม**
    // → ทะเบียนจะ "ถูก" ตลอดไปโดยไม่มีใครท้าทายได้ (คำทำนายที่ทำให้ตัวเองเป็นจริง)
    for (const mode of ["transit", "drive", "walk"] as const) {
      expect(shouldSkipTravelApi(UNKNOWN, mode), mode).toBe(false);
    }
  });

  it("ป้ายเวลาเดินทางเริ่มที่ 'ประมาณการ' — ยังไม่มีหลักฐานว่าจริง", () => {
    for (const mode of ["transit", "drive", "walk"] as const) {
      expect(hasRealTravelTime(UNKNOWN, mode), mode).toBe(false);
    }
    // 🎯 แต่ค่านี้ **ไม่ใช่ตัวตัดสินสุดท้าย** — `isTravelTimeReal` ใช้ผลที่ยิงกลับมาจริง
    //    ซึ่งแม่นกว่าเสมอ · ทะเบียนตอบว่า "อย่ายิง" ไม่ใช่ "อย่าเชื่อ"
  });

  it("🔴 `nav_providers` จากฐานเพิ่มผู้ให้บริการได้ **โดยไม่แตะโค้ดสักบรรทัด**", () => {
    // นี่คือครึ่งที่ทำให้เกณฑ์เป็นไปได้: วันที่มีคนยืนยันว่าญี่ปุ่นใช้ Google ได้ดี
    // และอยากเพิ่มเจ้าอื่น → **`update catalog_countries set nav_providers = …`** จบ
    expect(mapProvidersFor(UNKNOWN, ["google"])).toEqual(["google"]);
    expect(mapActionsFor(UNKNOWN, TARGET, ["google", "kakao"]).map((a) => a.provider))
      .toEqual(["google", "kakao"]);
  });

  it("เมืองของประเทศใหม่ที่เว็บทริปเดิมไม่รู้จัก → `null` ไม่ใช่ `\"kr\"`", () => {
    // ⚠️ ก่อน 27 ส.ค. 2026 บรรทัดนี้จะได้ `"kr"` เพราะ `city === "hanoi" ? "vn" : "kr"`
    //    → **การ์ดฉุกเฉินจะโชว์ 119 ของเกาหลีให้คนที่อยู่โตเกียว**
    expect(countryOfCitySlug("tokyo")).toBeNull();
    expect(capabilitiesOf(countryOfCitySlug("tokyo")).mapProviders).toEqual(["google"]);
  });
});
