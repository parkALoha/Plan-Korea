import { describe, expect, it } from "vitest";
import { categoryFromGoogleType } from "@/lib/placeCategory";
import { photoUrlAtWidth } from "@/lib/photoUrl";

/**
 * `lib/placeCategory.ts` + `lib/photoUrl.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 * หมวดผิด = ที่เที่ยวไปโผล่กลุ่มผิดตอนกรอง **ซึ่งไม่พังอะไร แค่หาไม่เจอตอนกำลังรีบ**
 */
describe("categoryFromGoogleType", () => {
  it("ตรงตัวในตารางมาก่อน pattern", () => {
    expect(categoryFromGoogleType("museum")).toBe("culture");
    expect(categoryFromGoogleType("beach")).toBe("beach");
    // 🔴 `food_court` อยู่ทั้งในตาราง (market) และใน pattern `_store$|shopping`… ไม่ใช่
    //    แต่คอมเมนต์ในไฟล์ระบุเองว่า **ต้องเป็น market ไม่ใช่ shopping** — ตรึงไว้
    expect(categoryFromGoogleType("food_court")).toBe("market");
  });

  it("🔴 ร้านอาหารแยกตามสัญชาติ — เคสที่ pattern มีไว้แก้", () => {
    // ถ้าไม่มี pattern พวกนี้จะตกเป็น fallback = **ร้านอาหารไปโผล่หมวดจุดชมวิว**
    for (const t of ["korean_restaurant", "vietnamese_restaurant", "thai_restaurant", "seafood_restaurant"]) {
      expect(categoryFromGoogleType(t), t).toBe("restaurant");
    }
  });

  it("pattern อื่น ๆ", () => {
    expect(categoryFromGoogleType("convenience_store")).toBe("shopping");
    expect(categoryFromGoogleType("wine_bar")).toBe("nightlife");
    expect(categoryFromGoogleType("shinto_shrine")).toBe("culture");
    expect(categoryFromGoogleType("state_park")).toBe("nature");
    expect(categoryFromGoogleType("internet_cafe")).toBe("cafe");
  });

  it("ไม่รู้จัก → fallback (เปลี่ยนได้จากผู้เรียก)", () => {
    expect(categoryFromGoogleType("dentist")).toBe("viewpoint");
    expect(categoryFromGoogleType("dentist", "shopping")).toBe("shopping");
    expect(categoryFromGoogleType(null)).toBe("viewpoint");
    expect(categoryFromGoogleType(undefined, "cafe")).toBe("cafe");
    expect(categoryFromGoogleType("")).toBe("viewpoint");
  });

  it("🔴 คีย์สายโปรโตไทป์จาก Google → fallback ไม่ใช่ฟังก์ชัน `Object`", () => {
    // ⚠️ ฉบับก่อน 27 ส.ค. 2026 คืน **ฟังก์ชัน `Object`** ออกมาเป็น `Category`
    //    (`if (exact)` ผ่านเพราะฟังก์ชันเป็นค่า truthy)
    // 🎯 Google ไม่ส่งค่านี้มา — **แต่นั่นคือคุณสมบัติของ Google ไม่ใช่ของโค้ดเรา**
    for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(categoryFromGoogleType(k), k).toBe("viewpoint");
      expect(typeof categoryFromGoogleType(k), k).toBe("string");
    }
  });
});

describe("photoUrlAtWidth", () => {
  it("ต่อ `&w=` เข้ากับ URL ที่ **มี query อยู่แล้ว**", () => {
    expect(photoUrlAtWidth("/api/place-photo?name=abc", 160)).toBe("/api/place-photo?name=abc&w=160");
  });

  it("🔴 ตรึงข้อสมมติ: ฟังก์ชันนี้ใช้ได้เฉพาะกับ URL ที่มี `?` แล้ว", () => {
    // ⚠️ **นี่ไม่ใช่การรับรองว่าถูก — เป็นการเขียนข้อสมมติออกมาให้เห็น**
    //    ผู้เรียกทั้งหมดวันนี้ส่ง `/api/place-photo?name=…` ซึ่งมี query เสมอ
    //    ถ้าวันไหนมีคนส่ง URL เปล่า จะได้ `x&w=160` ซึ่ง **ไม่ใช่ query ที่ route อ่านได้**
    // 🎯 เคสนี้จะแดงทันทีถ้ามีคนเปลี่ยนรูป URL → บังคับให้ตัดสินใจ ไม่ใช่ค้นพบตอนรูปไม่ขึ้น
    expect(photoUrlAtWidth("/x", 400)).toBe("/x&w=400");
  });

  it("ทั้ง 3 ขนาดใน allowlist", () => {
    for (const w of [160, 400, 800] as const) {
      expect(photoUrlAtWidth("/api/place-photo?name=a", w)).toContain(`&w=${w}`);
    }
  });
});
