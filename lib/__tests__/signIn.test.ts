import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * `E1` `lib/auth/signIn.ts` — 2 ทางเข้า + open-redirect · เจ้าของเทสต์: P4-QA/Sec (27 ส.ค. 2026)
 *
 * ## 🔴 ช่องที่ไฟล์นี้ปิด — **caller ใช้ helper จริงไหม** ไม่ใช่ helper ถูกไหม
 * `nextPath.test.ts` พิสูจน์แล้วว่า `safeNextPath` แข็งแรง (ผมยิง battery ซ้ำ: `//`, `/\`, control,
 * `%2f`, `/.//` — off-origin ถูกปัดทุกตัว · ที่ปล่อยผ่านทุกตัว resolve on-origin)
 * · **แต่ไม่มีเทสต์ไหนพิสูจน์ว่า `signIn.ts` *เรียก* `safeNextPath` ก่อนสร้าง `redirectTo`**
 * → ถ้าใครแก้ `callbackUrl` ให้ `set("next", raw)` แทน `set("next", safe)` **helper ยังเขียว
 *   แต่ open redirect เปิดทันที** — ตระกูลเดียวกับ `trips.name` (helper ถูก · เส้นทางไม่เดินผ่าน)
 *
 * วิธี: mock `createBrowserSupabase` ดัก `redirectTo`/`emailRedirectTo` ที่ route ส่งเข้า supabase
 * แล้วยิง `next` ที่เป็น open-redirect จริง → ต้องไม่มี host หลุดเข้า redirectTo · + เคสบวก (next ถูกส่งต่อ)
 */

const cap = vi.hoisted(() => ({ oauth: null as { options: { redirectTo: string } } | null, otp: null as { options: { emailRedirectTo: string } } | null }));
// S6: spread ของเดิมกลับเข้าไป ไม่แทนที่ทั้งโมดูล (ไม่งั้น export ใหม่ของ browser.ts จะหายเงียบ)
vi.mock("@/lib/auth/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/browser")>()),
  createBrowserSupabase: () => ({
    auth: {
      signInWithOAuth: async (opts: { options: { redirectTo: string } }) => { cap.oauth = opts; return { error: null }; },
      signInWithOtp: async (opts: { options: { emailRedirectTo: string } }) => { cap.otp = opts; return { error: null }; },
      signOut: async () => {},
    },
  }),
}));

import { sendMagicLink, signInWithGoogle } from "@/lib/auth/signIn";

const ORIGIN = "https://oursite.com";
beforeAll(() => { (globalThis as unknown as { window: unknown }).window = { location: { origin: ORIGIN } }; });
afterAll(() => { delete (globalThis as unknown as { window?: unknown }).window; });

const EVIL = ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/path\r\nSet-Cookie: x"];

describe("signIn.ts — next ต้องเดินผ่าน safeNextPath ก่อนเป็น redirectTo (ไม่ใช่แค่ helper ถูก)", () => {
  it("signInWithGoogle: open-redirect next ทุกแบบ → redirectTo ชี้ callback เรา ไม่มี host หลุด", async () => {
    for (const next of EVIL) {
      cap.oauth = null;
      const r = await signInWithGoogle(next);
      expect(r).toEqual({ ok: true });
      const to = cap.oauth!.options.redirectTo;
      expect(to.startsWith(`${ORIGIN}/auth/callback`), `redirectTo หลุดจาก callback: ${to}`).toBe(true);
      expect(to, `host ของผู้โจมตีหลุดเข้า redirectTo จาก next=${JSON.stringify(next)}: ${to}`).not.toContain("evil.com");
      // next อันตราย → safeNextPath คืน "/" → callbackUrl ไม่ใส่ param เลย
      expect(new URL(to).searchParams.get("next"), `next อันตรายไม่ควรถูกส่งต่อ (${next})`).toBeNull();
    }
  });

  it("sendMagicLink: open-redirect next ทุกแบบ → emailRedirectTo ชี้ callback เรา ไม่มี host หลุด", async () => {
    for (const next of EVIL) {
      cap.otp = null;
      const r = await sendMagicLink("a@b.test", next);
      expect(r).toEqual({ ok: true });
      const to = cap.otp!.options.emailRedirectTo;
      expect(to.startsWith(`${ORIGIN}/auth/callback`), `emailRedirectTo หลุด: ${to}`).toBe(true);
      expect(to).not.toContain("evil.com");
      expect(new URL(to).searchParams.get("next")).toBeNull();
    }
  });

  it("เคสบวก: next ภายในที่ถูกต้อง ถูกส่งต่อจริง — พิสูจน์ว่าไม่ได้ปัดทิ้งทุกอย่าง (ด่านที่ปัดหมดก็เขียว)", async () => {
    cap.oauth = null;
    await signInWithGoogle("/trip/42?tab=map");
    expect(new URL(cap.oauth!.options.redirectTo).searchParams.get("next")).toBe("/trip/42?tab=map");
  });
});
