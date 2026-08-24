import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * เทสต์การเดินสาย session refresh เข้า `proxy.ts` — เจ้าของ: P1-Lead (E1)
 *
 * 🔴 **จับบั๊กชนิดที่ไม่มีอะไรฟ้องเลยจนกว่าจะสาย:** แพทเทิร์นของ `@supabase/ssr` บังคับว่า
 * ต้องคืน **response ตัวที่ `setAll` เขียนคุกกี้ลงไป** · ถ้าใครสร้าง `NextResponse.next()` ใหม่
 * ทีหลัง คุกกี้ที่เพิ่งต่ออายุจะหายไปโดยไม่มี error ไม่มี log ไม่มีอะไรเลย
 *
 * > **อาการจะโผล่ตอน token เดิมหมดอายุเท่านั้น** — ซึ่งอาจเป็นวันถัดไป และจะอ่านว่า
 * > *"อยู่ ๆ ก็หลุด"* ที่ไม่ผูกกับการกระทำไหนเลย · ตามกลับมาถึงบรรทัดนี้แทบไม่ได้
 *
 * แยกไฟล์จาก `proxy.test.ts` โดยตั้งใจ เพราะชุดนี้ต้อง mock `refreshSession`
 * ซึ่งจะไปรบกวนเคสของ P4 ที่ทดสอบด่าน PIN ด้วยของจริง
 */

const REFRESHED = "sb-refreshed-marker";
const refreshSession = vi.fn();

vi.mock("@/lib/auth/proxySession", () => ({ refreshSession }));

const { proxy } = await import("@/proxy");
const { NextRequest, NextResponse } = await import("next/server");

function request(path: string): InstanceType<typeof NextRequest> {
  return new NextRequest(`https://plan.example.com${path}`);
}

/** response ที่ "ถือคุกกี้ต่ออายุแล้ว" — ถ้า proxy ไม่คืนตัวนี้ มาร์กเกอร์จะหาย */
function responseWithRefreshedCookie() {
  const res = NextResponse.next();
  res.cookies.set(REFRESHED, "1");
  return res;
}

describe("proxy ต้องคืน response ที่ถือคุกกี้ต่ออายุแล้ว", () => {
  beforeEach(() => {
    delete process.env.TRIP_PIN;
    delete process.env.TRIP_PIN_SECRET;
    refreshSession.mockReset();
    refreshSession.mockResolvedValue({ response: responseWithRefreshedCookie(), user: null });
  });

  it("เรียก refreshSession ทุก request ที่ผ่านด่าน", async () => {
    await proxy(request("/today"));
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("🔴 เส้นทางที่ปล่อยผ่านเพราะยังไม่ตั้ง PIN — คุกกี้ที่ต่ออายุต้องรอด", async () => {
    const res = await proxy(request("/today"));
    expect(res.cookies.get(REFRESHED)?.value, "คุกกี้ต่ออายุหายระหว่างทาง").toBe("1");
  });

  it("🔴 เส้นทางสาธารณะ (/login) — คุกกี้ที่ต่ออายุต้องรอดเหมือนกัน", async () => {
    // เส้นนี้ออกจากฟังก์ชันคนละทางกับเส้นบน จึงต้องมีเคสของตัวเอง
    // ถ้าไม่มี การเผลอคืน NextResponse.next() ตรงจุดนี้จะไม่มีอะไรจับได้
    const res = await proxy(request("/login"));
    expect(res.cookies.get(REFRESHED)?.value).toBe("1");
  });

  it("🔴 เส้นทางที่ผ่านด่าน PIN ด้วยคุกกี้ถูกต้อง — คุกกี้ที่ต่ออายุต้องรอด", async () => {
    // ทางออกที่สามของฟังก์ชัน · ครบทั้ง 3 ทางที่ "ปล่อยผ่าน"
    const { PIN_COOKIE, expectedPinToken } = await import("@/lib/pinAuth");
    process.env.TRIP_PIN = "1234";
    process.env.TRIP_PIN_SECRET = "secret-for-test";
    const token = expectedPinToken();
    expect(token, "ตั้ง env แล้วต้องได้ token").toBeTruthy();

    const req = new NextRequest("https://plan.example.com/today", {
      headers: { cookie: `${PIN_COOKIE}=${token}` },
    });
    const res = await proxy(req);
    expect(res.cookies.get(REFRESHED)?.value).toBe("1");
  });

  it("ต่ออายุ session **ก่อน** ด่าน PIN ตัดจบ — เส้นที่ถูกบล็อกก็ยังต้องเรียก", async () => {
    // 🔴 ถ้าย้าย refreshSession ไปไว้หลังด่าน เส้นที่ถูกบล็อกจะไม่ถูกต่ออายุเลย
    //    → ผู้ใช้ที่ token ใกล้หมดอายุและบังเอิญเปิดหน้าที่ถูกบล็อก จะเสียโอกาสต่ออายุครั้งนั้นไป
    process.env.TRIP_PIN = "1234";
    process.env.TRIP_PIN_SECRET = "secret-for-test";
    await proxy(request("/today"));
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});
