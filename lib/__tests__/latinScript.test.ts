import { describe, expect, it } from "vitest";
import { looksLatin } from "@/lib/latinScript";

describe("looksLatin", () => {
  it("ชื่อไทยไม่ผ่าน — เคสจริงที่ทำให้หน้า ตม. มีภาษาไทยปน (เฟส 22)", () => {
    expect(looksLatin("ตลาดปลาจากัลชิ")).toBe(false);
    expect(looksLatin("โรงละครฮานอย")).toBe(false);
  });

  it("ชื่อเกาหลีไม่ผ่าน — ต้องไปขอชื่ออังกฤษมาแทนเหมือนกัน", () => {
    expect(looksLatin("머거방")).toBe(false);
    expect(looksLatin("빕스 부산W스퀘어점")).toBe(false);
  });

  it("มีเกาหลีปนแค่ในวงเล็บก็ไม่ผ่าน — เอกสาร ตม. ต้องอังกฤษล้วนทั้งบรรทัด", () => {
    expect(looksLatin("Arirang Kimbap restaurant(아리랑 김밥 레스토랑)")).toBe(false);
  });

  it("เวียดนามผ่าน — วรรณยุกต์/สระเวียดนามยังเป็นอักษรละติน ไม่ต้องยิง Google ขอชื่อใหม่ให้เปลือง", () => {
    expect(looksLatin("Phở Gia Truyền Bát Đàn")).toBe(true);
    expect(looksLatin("Quán Café Maison De Hanoi")).toBe(true);
  });

  it("อังกฤษล้วน รวมตัวเลข/สัญลักษณ์/ช่องว่าง ผ่านหมด", () => {
    expect(looksLatin("Jagalchi Market")).toBe(true);
    expect(looksLatin("Cup & Cup")).toBe(true);
    expect(looksLatin("Haeundae Blueline Park - Mipo Station")).toBe(true);
    expect(looksLatin("")).toBe(true);
  });
});
