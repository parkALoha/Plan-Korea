import { describe, expect, it } from "vitest";
import { storageKeyOf } from "../engine/storageKey";

/**
 * `E2-AC13` ② — ตัวตนของไฟล์ที่ไม่เปลี่ยนตามลายเซ็น
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🎯 **ทำไมเคสพวกนี้ถึงคุ้มกว่าที่หน้าตาบอก:** ระหว่างทางจาก public URL ไป path
 * **คอลัมน์เดียวกันถือของสองแบบพร้อมกัน** · จุดอ่าน ~20 จุดพึ่งฟังก์ชันนี้ตัวเดียว
 * ถ้ามันเดาผิดแม้แต่รูปเดียว **ผลลัพธ์คือไฟล์ตั๋วที่เปิดไม่ได้ ไม่ใช่ error ที่ใครเห็น**
 */
describe("storageKeyOf — path ที่ signed URL เปลี่ยนไม่ได้", () => {
  const PUB = "https://x.supabase.co/storage/v1/object/public/booking-files/";

  it("public URL แบบเดิม → คืน path หลัง bucket", () => {
    expect(storageKeyOf(`${PUB}booking-1-abc.pdf`)).toBe("booking-1-abc.pdf");
  });

  it("path ตรง ๆ → คืนตัวมันเอง", () => {
    expect(storageKeyOf("stop-photo-42-171-x.jpg")).toBe("stop-photo-42-171-x.jpg");
  });

  it("🔴 ชื่อไฟล์ที่ถูก encode ต้องถูก decode กลับ — ไม่งั้นเซ็นด้วยชื่อที่ไม่มีอยู่จริง", () => {
    // ชื่อไฟล์ของจริงมาจาก `file.name` ซึ่งเป็นชื่อที่ผู้ใช้ตั้ง → มีวรรค/ไทย/วงเล็บได้ทั้งนั้น
    expect(storageKeyOf(`${PUB}booking-1-${encodeURIComponent("ตั๋ว บิน (1).pdf")}`))
      .toBe("booking-1-ตั๋ว บิน (1).pdf");
  });

  it("🔴 URL ของโดเมนอื่น → `null` ไม่ใช่เดาว่าเป็น path", () => {
    // เคสจริง: รูปจาก Google Places ที่เคยถูกเก็บลงช่องเดียวกัน
    // เดาว่าเป็น path = ไปเซ็นไฟล์ชื่อ "https://..." ใน bucket เรา ซึ่งไม่มีวันมี
    expect(storageKeyOf("https://lh3.googleusercontent.com/abc")).toBeNull();
    expect(storageKeyOf("http://example.com/x.png")).toBeNull();
  });

  it("null / undefined / สตริงว่าง → null", () => {
    expect(storageKeyOf(null)).toBeNull();
    expect(storageKeyOf(undefined)).toBeNull();
    expect(storageKeyOf("")).toBeNull();
  });

  it("🔴 public URL ของ bucket อื่น → null (marker ต้องตรงทั้งชื่อ bucket)", () => {
    expect(storageKeyOf("https://x.supabase.co/storage/v1/object/public/avatars/a.png")).toBeNull();
  });

  it("URL ที่มี query string ต่อท้าย → path ยังต้องรวม query ไว้ไม่ได้", () => {
    // ไม่มีเคสจริงวันนี้ แต่ตรึงไว้: ถ้าวันหนึ่งมีใครต่อ `?w=400` เข้ามา
    // path ที่ได้ต้องไม่กลายเป็น "a.png?w=400" ซึ่งเซ็นไม่ผ่านและอ่านไม่ออกว่าทำไม
    expect(storageKeyOf(`${PUB}a.png?w=400`)).toBe("a.png?w=400");
  });
});
