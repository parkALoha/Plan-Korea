import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * เทสต์ของ `app/auth/callback/route.ts` — เจ้าของ: P1-Lead (E1)
 *
 * 🔴 **ทำไมต้องมี ทั้งที่ `nextPath.test.ts` ทดสอบตัวตรวจไปแล้ว:**
 * ชุดนั้นพิสูจน์ว่า `safeNextPath` **ทำงานถูก** · ชุดนี้พิสูจน์ว่า route **เรียกใช้มันจริง**
 * ตัวตรวจที่ถูกต้องแต่ไม่มีใครเรียก กับตัวตรวจที่ไม่มีอยู่ **ให้ผลเหมือนกันเป๊ะ**
 * — และการอ่านโค้ดแยกความต่างนี้ได้ยาก เพราะไฟล์ที่ import มันไว้ *ดูเหมือน* ใช้มันแล้ว
 */

const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  createServerSupabase: async () => ({ auth: { exchangeCodeForSession } }),
}));

const { GET } = await import("@/app/auth/callback/route");
const { NextRequest } = await import("next/server");

const ORIGIN = "https://app.example";

async function callbackLocation(query: string): Promise<string> {
  const res = await GET(new NextRequest(`${ORIGIN}/auth/callback${query}`));
  return res.headers.get("location") ?? "";
}

describe("app/auth/callback — แลก code เป็น session แล้วพากลับ", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  describe("ด้านบวก — ทางที่ถูกต้องต้องทำงานได้", () => {
    it("มี code แล้วไม่ระบุ next → กลับหน้าแรก และแลก code จริง", async () => {
      expect(await callbackLocation("?code=abc")).toBe(`${ORIGIN}/`);
      expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    });

    it("next ที่เป็น path ภายใน → ไปตามนั้น", async () => {
      expect(await callbackLocation("?code=abc&next=/today")).toBe(`${ORIGIN}/today`);
    });
  });

  describe("🔴 ด้านลบ — open redirect ต้องไปไม่ถึงปลายทางภายนอก", () => {
    it.each([
      ["protocol-relative", "//evil.example"],
      ["backslash", "/\\evil.example"],
      ["URL เต็มรูป", "https://evil.example"],
    ])("next แบบ %s → ถูกบังคับกลับหน้าแรกบนโดเมนเรา", async (_label, hostile) => {
      const location = await callbackLocation(`?code=abc&next=${encodeURIComponent(hostile)}`);
      expect(location).toBe(`${ORIGIN}/`);
      expect(location.startsWith(ORIGIN), `หลุดออกนอกโดเมน: ${location}`).toBe(true);
      expect(location).not.toContain("evil.example");
    });
  });

  describe("ทางที่ล้มเหลว — ต้องกลับไป /login พร้อมรหัสที่หน้านั้นอ่านได้", () => {
    it("ลิงก์หมดอายุ (Supabase ส่ง error_code มาเอง) → ส่งต่อรหัสให้ /login", async () => {
      const location = await callbackLocation("?error=access_denied&error_code=otp_expired");
      expect(location).toContain("/login");
      expect(location).toContain("error=otp_expired");
      expect(exchangeCodeForSession, "ไม่มี code ให้แลก จึงต้องไม่เรียก").not.toHaveBeenCalled();
    });

    it("เปิด URL นี้ตรง ๆ โดยไม่มีอะไรเลย → /login?error=missing_code", async () => {
      expect(await callbackLocation("")).toContain("error=missing_code");
    });

    it("แลก code ไม่ผ่าน → /login?error=exchange_failed", async () => {
      exchangeCodeForSession.mockResolvedValue({ error: { message: "PKCE verifier ไม่ตรง" } });
      expect(await callbackLocation("?code=abc")).toContain("error=exchange_failed");
    });

    it("🔴 ห้ามส่งข้อความภายในของชั้น auth ต่อไปที่ URL", async () => {
      exchangeCodeForSession.mockResolvedValue({ error: { message: "PKCE verifier ไม่ตรง" } });
      expect(await callbackLocation("?code=abc")).not.toContain("PKCE");
    });

    it("🔴 ห้ามส่ง error_description จากภายนอกไปโผล่บนหน้าเว็บเรา", async () => {
      const location = await callbackLocation(
        "?error_code=otp_expired&error_description=" + encodeURIComponent("ติดต่อ 08x-xxx"),
      );
      expect(location).not.toContain("error_description");
      expect(location).not.toContain("08x");
    });

    it("next ที่เป็นอันตราย ต้องถูกล้างแม้ในเส้นทางที่ล้มเหลว", async () => {
      const location = await callbackLocation(
        "?error_code=otp_expired&next=" + encodeURIComponent("//evil.example"),
      );
      expect(location).not.toContain("evil.example");
    });
  });
});
