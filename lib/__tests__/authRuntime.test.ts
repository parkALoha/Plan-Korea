import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * เทสต์ที่ **น่าจะจับ `S1` ได้ตั้งแต่แรก** — เจ้าของ: P1-Lead (E1)
 *
 * 🔴 **ทำไมชุดเทสต์ 223 เคสถึงมองไม่เห็นบั๊กที่ทำให้ทั้งเว็บ 500:**
 * ทุกเคสรันในสภาพที่ **ยังไม่ได้ตั้ง `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`**
 * → `refreshSession()` ออกที่บรรทัด `if (!url || !key)` ทุกครั้ง **ไม่เคยไปถึง `createServerClient` เลย**
 * → เส้นทางที่โยน **ไม่เคยถูกรันสักครั้งเดียว** และผลรวมขึ้นเขียวเต็มทุกรอบ
 *
 * > **เทสต์พิสูจน์ได้แค่เส้นทางที่มันเดินผ่าน · เส้นที่ไม่เคยเดิน คือเส้นที่ไม่มีใครรู้ว่าพัง**
 * > (ญาติของบทเรียน P6 เรื่อง `diff-guard` ที่ self-test 7 เคสผ่านหมดเพราะทดสอบแต่โหมดที่ CI ไม่ได้ใช้)
 *
 * 🎯 ชุดนี้จึง **ตั้ง env ให้ครบก่อนแล้วค่อยเรียก** = จำลองสภาพ "หลังผู้ใช้ตั้งค่าเสร็จ"
 * ซึ่งเป็นสภาพที่โค้ดจะเจอจริงและไม่เคยถูกทดสอบเลย
 */

const FAKE_URL = "https://fake-project.supabase.co";
const FAKE_KEY = "sb_publishable_FakeKeyForTests";

const cookieStore = {
  getAll: () => [],
  set: () => {},
};
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const { refreshSession } = await import("@/lib/auth/proxySession");
const { createServerSupabase, getUser } = await import("@/lib/auth/server");
const { NO_REALTIME_TRANSPORT } = await import("@/lib/auth/noRealtime");
const { NextRequest } = await import("next/server");

describe("S1 — สร้าง Supabase client ฝั่งเซิร์ฟเวอร์ได้จริงบน Node ที่ไม่มี WebSocket", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = FAKE_KEY;
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("🔴 refreshSession() ต้องไม่โยนเมื่อ env ครบ — เส้นทางที่ทำให้ทั้งเว็บ 500", async () => {
    // ถอด `realtime.transport` ออกเมื่อไหร่ เคสนี้แดงทันทีด้วยข้อความ
    // "Node.js detected but native WebSocket not found."
    const req = new NextRequest("https://plan.example.com/today");
    await expect(refreshSession(req)).resolves.toBeDefined();
  });

  it("🔴 createServerSupabase() ต้องไม่โยนเมื่อ env ครบ", async () => {
    await expect(createServerSupabase()).resolves.toBeDefined();
  });

  it("getUser() คืน null แทนที่จะโยน เมื่อต่อปลายทางไม่ได้", async () => {
    // URL ปลอม → fetch ล้ม → ต้องออกมาเป็น "ไม่มีผู้ใช้" ไม่ใช่ระเบิดใส่หน้าเพจ
    await expect(getUser()).resolves.toBeNull();
  });

  it("refreshSession() ยังคืน response ที่ใช้ได้แม้ต่อปลายทางไม่ได้", async () => {
    const req = new NextRequest("https://plan.example.com/today");
    const { response, user } = await refreshSession(req);
    expect(response).toBeDefined();
    expect(user, "ต่อไม่ได้ = ไม่มีผู้ใช้ ไม่ใช่ผู้ใช้ปลอม").toBeNull();
  });
});

describe("NO_REALTIME_TRANSPORT — เป็นด่าน ไม่ใช่แค่ค่าเติมช่อง", () => {
  it("🔴 โยนพร้อมเหตุผลถ้ามีใครเรียกใช้จริง", () => {
    // ถ้าวันหนึ่งมีคนเปิด Realtime ฝั่งเซิร์ฟเวอร์ ต้องแดงพร้อมบอกทางแก้
    // ไม่ใช่เงียบแล้วเปิด socket ค้างไว้ทุก request
    const transport = NO_REALTIME_TRANSPORT as unknown as () => never;
    expect(() => transport()).toThrow(/ต้องไม่เปิด WebSocket/);
  });

  it("ข้อความบอกทางแก้ที่ถูก ไม่ใช่แค่บอกว่าพัง", () => {
    const transport = NO_REALTIME_TRANSPORT as unknown as () => never;
    expect(() => transport()).toThrow(/ไม่ใช่เปลี่ยนตัวนี้ให้เป็น WebSocket จริง/);
  });
});
