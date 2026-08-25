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

  it("🔴 URL ที่มี query/hash ต่อท้าย → ตัดออก · **P3 จับได้ว่าเคสนี้เคยขัดกับคอมเมนต์ของตัวเอง**", () => {
    // ฉบับแรก: คอมเมนต์เขียนว่า *"ต้องไม่กลายเป็น a.png?w=400"* แล้ว assert ว่ามันเป็นแบบนั้นพอดี
    // 🎯 **ถ้อยคำกับกลไกเดินคนละทางในเคสเดียวกัน — `D82` ในระยะ 3 บรรทัด และผมเขียนเองทั้งคู่**
    // `?w=400` ไม่ใช่ส่วนของ path ใน bucket → เซ็นด้วยมันจะได้ไฟล์ที่ไม่มีอยู่ และ error อ่านไม่ออก
    expect(storageKeyOf(`${PUB}a.png?w=400`)).toBe("a.png");
    expect(storageKeyOf(`${PUB}a.png#page=2`)).toBe("a.png");
  });

  it("path ตรง ๆ ที่มี `?` → **ไม่ตัด** เพราะมันไม่ใช่ path ที่เราเขียนลงไป", () => {
    // เดาให้มันใช้ได้ = ซ่อนต้นเหตุ · ปล่อยให้เซ็นไม่ผ่านแล้วมีคนมาดูดีกว่า
    expect(storageKeyOf("weird?name.png")).toBe("weird?name.png");
  });
});
