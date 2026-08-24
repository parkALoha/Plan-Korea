import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/nextPath";

describe("safeNextPath — กัน open redirect หลังล็อกอิน", () => {
  describe("ด้านบวก — path ภายในที่ถูกต้องต้องผ่าน", () => {
    // 🔴 ถ้าไม่มีชุดนี้ ฟังก์ชันที่คืน "/" ให้ทุกอย่างจะทำให้เคสด้านลบเขียวหมดทั้งชุด
    it("path ธรรมดาผ่านและคืนค่าเดิมเป๊ะ", () => {
      for (const p of ["/", "/today", "/summary?lang=en", "/trip/abc-123#day-2"]) {
        expect(safeNextPath(p)).toBe(p);
      }
    });
  });

  describe("ด้านลบ — ทุกทางที่พาออกนอกโดเมนต้องกลายเป็น /", () => {
    it("URL เต็มรูปและ scheme อันตราย", () => {
      for (const p of ["https://evil.example", "http://evil.example", "javascript:alert(1)"]) {
        expect(safeNextPath(p)).toBe("/");
      }
    });

    it("protocol-relative", () => {
      expect(safeNextPath("//evil.example")).toBe("/");
      expect(safeNextPath("//evil.example/path")).toBe("/");
    });

    it("🔴 backslash — ช่องที่ตัวตรวจฉบับแรกเปิดไว้ เพราะเบราว์เซอร์แปลง \\ เป็น /", () => {
      expect(safeNextPath("/\\evil.example")).toBe("/");
      expect(safeNextPath("/\\/evil.example")).toBe("/");
      expect(safeNextPath("\\\\evil.example")).toBe("/");
    });

    it("อักขระควบคุมและขึ้นบรรทัดใหม่ (กัน header splitting)", () => {
      expect(safeNextPath("/ok\nSet-Cookie: x=1")).toBe("/");
      expect(safeNextPath("/ok\r\nLocation: https://evil.example")).toBe("/");
      expect(safeNextPath("/ok\t")).toBe("/");
    });

    it("ค่าว่าง/ไม่มี/ยาวเกิน", () => {
      expect(safeNextPath(null)).toBe("/");
      expect(safeNextPath(undefined)).toBe("/");
      expect(safeNextPath("")).toBe("/");
      expect(safeNextPath("/" + "a".repeat(600))).toBe("/");
    });
  });
});
