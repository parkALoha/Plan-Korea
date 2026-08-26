import { describe, expect, it } from "vitest";
import {
  googleMapsDirectionsUrl,
  googleMapsPlaceUrl,
  hotelNavigationName,
  kakaoMapDirectionsUrl,
  mapActionsFor,
  naverMapAppSchemeUrl,
  naverMapSearchUrl,
  navigationName,
} from "@/lib/mapLinks";

/**
 * `lib/mapLinks.ts` — **ไฟล์นี้ไม่มีเทสต์เลยสักตัวจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 **และมันคือไฟล์ที่สร้างทุกลิงก์นำทางที่ผู้ใช้จะกดจริงระหว่างทริป 11–21 ต.ค. 2026**
 * ความผิดพลาดที่นี่ไม่ปรากฏใน CI และไม่ปรากฏตอน dev — **มันปรากฏตอนมีคนยืนอยู่หน้าสถานี
 * ในปูซานแล้วกดปุ่มแล้วแอปเปิดผิดที่** · เป็นชนิดของบั๊กที่ *ไม่มีทางรู้จนกว่าจะสาย*
 *
 * ⚠️ เทสต์นี้จงใจ **ไม่** ยืนยันว่า URL "ถูกต้องตามเอกสารของ Naver/Kakao"
 * — เรายืนยันแบบนั้นไม่ได้จากที่นี่ · **ที่ยืนยันได้คือรูปที่เราตั้งใจสร้าง ไม่ถูกทำให้เพี้ยนโดยข้อมูล**
 */

const BUSAN = { lat: 35.0966, lng: 129.0306 };

describe("navigationName — ภาษาท้องถิ่นก่อนเสมอ", () => {
  it("ลำดับ: local → cached → en → th", () => {
    const p = { nameLocal: "자갈치시장", nameEn: "Jagalchi", nameTh: "ตลาดจากัลชี" };
    expect(navigationName(p)).toBe("자갈치시장");
    expect(navigationName({ nameEn: "Jagalchi", nameTh: "ตลาดจากัลชี" }, "자갈치")).toBe("자갈치");
    expect(navigationName({ nameEn: "Jagalchi", nameTh: "ตลาดจากัลชี" })).toBe("Jagalchi");
    expect(navigationName({ nameTh: "ตลาดจากัลชี" })).toBe("ตลาดจากัลชี");
  });

  it("🔴 สตริงว่างต้อง **ตกผ่าน** ไม่ใช่ถูกใช้", () => {
    // ใช้ `||` ไม่ใช่ `??` โดยตั้งใจ — ฐานเก็บ `""` ได้จริงเมื่อผู้ใช้บันทึกฟอร์มเปล่า
    // 🎯 ถ้าเปลี่ยนเป็น `??` วันไหน **แอปจะเปิดหน้าค้นหาที่ไม่มีคำค้น** ตอนคนกำลังจะไปไหนสักที่
    expect(navigationName({ nameLocal: "", nameEn: "", nameTh: "ตลาดจากัลชี" })).toBe("ตลาดจากัลชี");
    expect(navigationName({ nameLocal: "", nameTh: "ตลาด" }, "")).toBe("ตลาด");
  });

  it("hotelNavigationName เดินลำดับเดียวกันบนชื่อคอลัมน์ของฐาน", () => {
    expect(hotelNavigationName({ name_local: "호텔", name_en: "Hotel", hotel_name: "โรงแรม" })).toBe("호텔");
    expect(hotelNavigationName({ name_local: null, name_en: "Hotel", hotel_name: "โรงแรม" })).toBe("Hotel");
    expect(hotelNavigationName({ name_local: "", name_en: null, hotel_name: "โรงแรม" })).toBe("โรงแรม");
  });
});

describe("Google Maps", () => {
  it("รู้ place id → ชี้ร้านนั้นเป๊ะ · ไม่รู้ → ค้นด้วยข้อความ", () => {
    expect(googleMapsPlaceUrl("ตลาด", "ChIJabc")).toBe(
      "https://www.google.com/maps/place/?q=place_id:ChIJabc"
    );
    expect(googleMapsPlaceUrl("ตลาดจากัลชี")).toContain("/maps/search/?api=1&query=");
    expect(googleMapsPlaceUrl("ตลาดจากัลชี")).toContain(encodeURIComponent("ตลาดจากัลชี"));
  });

  it("`null`/`undefined` place id ตกไปทางค้นหา ไม่ใช่สร้าง `place_id:null`", () => {
    expect(googleMapsPlaceUrl("x", null)).toContain("/maps/search/");
    expect(googleMapsPlaceUrl("x", undefined)).toContain("/maps/search/");
    expect(googleMapsPlaceUrl("x", "")).toContain("/maps/search/");
  });

  it("พิกัดติดลบไม่ถูกทำให้เพี้ยน", () => {
    // ⚠️ วันนี้ทริปไม่มีพิกัดติดลบ **แต่แพลตฟอร์มจะมี** — และตัวคั่นคือ `,` กับ `-` ปนกัน
    expect(googleMapsDirectionsUrl(-33.8688, 151.2093)).toContain("destination=-33.8688,151.2093");
  });
});

describe("Kakao — ชื่ออยู่ใน *path* คั่นด้วย comma", () => {
  it("🔴 comma ในชื่อต้องถูก encode ไม่งั้นพิกัดเลื่อน", () => {
    // `link/to/{name},{lat},{lng}` — ถ้าชื่อมี comma ที่ไม่ถูก encode
    // **Kakao จะอ่านชิ้นผิดเป็นพิกัด แล้วนำทางไปที่อื่น**
    // 🎯 นี่คือเหตุผลที่ต้องเป็น `encodeURIComponent` ไม่ใช่ `encodeURI`
    //    (`encodeURI` ไม่ encode comma — เปลี่ยนวันไหนจะพังเงียบ)
    const url = kakaoMapDirectionsUrl(BUSAN.lat, BUSAN.lng, "ร้านเจ๊, สาขา 2");
    expect(url.split(",")).toHaveLength(3); // ชื่อ + lat + lng เท่านั้น
    expect(url).toContain("%2C");
    expect(url.endsWith(`,${BUSAN.lat},${BUSAN.lng}`)).toBe(true);
  });

  it("ชื่อเกาหลีถูก encode ครบ", () => {
    expect(kakaoMapDirectionsUrl(1, 2, "자갈치시장")).toContain(encodeURIComponent("자갈치시장"));
  });

  it("`/` ในชื่อไม่สร้าง path segment ใหม่", () => {
    expect(kakaoMapDirectionsUrl(1, 2, "a/b")).toContain("%2F");
  });
});

describe("Naver", () => {
  it("ลิงก์ค้นหาเว็บ encode ชื่อ", () => {
    expect(naverMapSearchUrl("자갈치시장")).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent("자갈치시장")}`
    );
  });

  it("app scheme ใช้ `public` เป็นค่าเริ่มต้น (ขนส่งสาธารณะคือวิธีหลักในเกาหลี)", () => {
    expect(naverMapAppSchemeUrl(1, 2, "x")).toContain("nmap://route/public?");
    expect(naverMapAppSchemeUrl(1, 2, "x", "car")).toContain("nmap://route/car?");
  });

  it("ส่ง `appname` ครบ — Naver ต้องการ ไม่งั้นแอปไม่เปิด", () => {
    expect(naverMapAppSchemeUrl(1, 2, "x")).toContain("appname=plankorea.web");
  });
});

describe("mapActionsFor — รูปที่ต่างกันโดยตั้งใจ", () => {
  const target = { ...BUSAN, name: "자갈치시장" };

  it("เกาหลีได้ 3 เจ้า · Naver เป็น `open` ไม่ใช่ `href`", () => {
    const actions = mapActionsFor("kr", target);
    expect(actions.map((a) => a.provider)).toEqual(["naver", "kakao", "google"]);
    // 🔴 Naver **ไม่มีลิงก์เว็บที่นำทางตรงได้** — ต้องลองแอปแล้วตกกลับเว็บ
    //    ถ้าฝืนให้ทุกเจ้าคืน URL เหมือนกัน **Naver จะถูกทำให้แย่ลงเพื่อความสม่ำเสมอ**
    expect(actions.find((a) => a.provider === "naver")?.kind).toBe("open");
    expect(actions.find((a) => a.provider === "kakao")?.kind).toBe("href");
    expect(actions.find((a) => a.provider === "google")?.kind).toBe("href");
  });

  it("ประเทศที่ทะเบียนไม่รู้จัก → Google อย่างเดียว **ใช้งานได้ ไม่ใช่ปุ่มหาย**", () => {
    expect(mapActionsFor("jp", target).map((a) => a.provider)).toEqual(["google"]);
    expect(mapActionsFor(null, target).map((a) => a.provider)).toEqual(["google"]);
  });

  it("ทุก action มี label ที่ไม่ว่าง", () => {
    // ปุ่มที่ไม่มีข้อความคือปุ่มที่กดไม่ถูกตอนยืนอยู่กลางถนน
    for (const a of mapActionsFor("kr", target)) expect(a.label.trim().length).toBeGreaterThan(0);
  });

  it("`nav_providers` จากฐานสั่งได้ และ action ยังถูกรูป", () => {
    const actions = mapActionsFor("kr", target, ["google", "naver"]);
    expect(actions.map((a) => a.provider)).toEqual(["google", "naver"]);
    expect(actions[1].kind).toBe("open");
  });
});
