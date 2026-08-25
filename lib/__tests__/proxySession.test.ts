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
 * ซึ่งจะไปรบกวนเคสด่านของ P4 ที่ทดสอบด้วยของจริง
 */

const REFRESHED = "sb-refreshed-marker";
const refreshSession = vi.fn();

// ⚠️ mock **เฉพาะ `refreshSession`** และปล่อย export อื่นเป็นของจริง
// 🔴 ฉบับแรกเขียน `() => ({ refreshSession })` = แทนที่ทั้งโมดูล → `withSessionCookies` หายไป
//    วันที่ `proxy.ts` เริ่ม import มันจึงพังทันที · **mock ที่แทนทั้งโมดูลจะกลืน export ใหม่ทุกตัว
//    ที่ใครเพิ่มเข้ามาทีหลัง** และข้อความ error ไม่ได้ชี้ไปที่ mock เลยถ้าไม่รู้ว่าต้องมองตรงนี้
vi.mock("@/lib/auth/proxySession", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/proxySession")>()),
  refreshSession,
}));

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
  /** ให้ request ถัดไปนับว่า "ล็อกอินแล้ว" — ด่านใหม่ตัดสินจาก `user` ไม่ใช่คุกกี้ความลับร่วม */
  function signedIn() {
    refreshSession.mockResolvedValue({
      response: responseWithRefreshedCookie(),
      user: { id: "11111111-2222-3333-4444-555555555555" },
    });
  }

  beforeEach(() => {
    refreshSession.mockReset();
    refreshSession.mockResolvedValue({ response: responseWithRefreshedCookie(), user: null });
  });

  it("เรียก refreshSession ทุก request ที่ผ่านด่าน", async () => {
    await proxy(request("/today"));
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("🔴 เส้นทางที่ผ่านเพราะมี session — คุกกี้ที่ต่ออายุต้องรอด", async () => {
    signedIn();
    const res = await proxy(request("/today"));
    expect(res.cookies.get(REFRESHED)?.value, "คุกกี้ต่ออายุหายระหว่างทาง").toBe("1");
  });

  it("🔴 เส้นทางสาธารณะ (/login) — คุกกี้ที่ต่ออายุต้องรอดเหมือนกัน", async () => {
    // เส้นนี้ออกจากฟังก์ชันคนละทางกับเส้นบน จึงต้องมีเคสของตัวเอง
    // ถ้าไม่มี การเผลอคืน NextResponse.next() ตรงจุดนี้จะไม่มีอะไรจับได้
    const res = await proxy(request("/login"));
    expect(res.cookies.get(REFRESHED)?.value).toBe("1");
  });

  it("🔴 /api/* ที่ผ่านเพราะมี session — คุกกี้ที่ต่ออายุต้องรอด", async () => {
    // ทางออกที่สามของฟังก์ชัน · ครบทั้ง 3 ทางที่ "ปล่อยผ่าน"
    // (`AC6`: เดิมทางนี้คือ "ผ่านด่าน PIN ด้วยคุกกี้ถูกต้อง" — คำถามเดิม ด่านใหม่)
    signedIn();
    const res = await proxy(request("/api/place-details"));
    expect(res.cookies.get(REFRESHED)?.value).toBe("1");
  });

  // ── S5 (P4 พบ) — ทางออกที่ **บล็อก** ก็ต้องไม่ทิ้งคุกกี้ที่หมุนไปแล้ว ────────────
  // `refreshSession()` รันไปก่อนถึงด่านเสมอ → token เก่าถูกใช้ไปแล้วไม่ว่าจะออกทางไหน
  // ทิ้ง Set-Cookie = ไคลเอนต์ถือ token เก่าที่อาจถูกเพิกถอนแล้ว = แย่ที่สุดของสองทาง
  describe("🔴 S5 — ทางออกที่บล็อกผู้ใช้ ต้องเก็บคุกกี้ที่ต่ออายุไว้ด้วย", () => {
    // ไม่ต้องตั้งอะไร — ค่าเริ่มต้นของชุดนี้คือ `user: null` = ยังไม่ล็อกอิน = ถูกบล็อก
    it("/api/* ที่ถูกบล็อก 401 — คุกกี้ต้องรอด และ status ต้องยังเป็น 401", async () => {
      const res = await proxy(request("/api/place-details"));
      expect(res.status, "การเก็บคุกกี้ต้องไม่เปลี่ยนสถานะการบล็อก").toBe(401);
      expect(res.cookies.get(REFRESHED)?.value, "คุกกี้ที่หมุนแล้วถูกทิ้ง").toBe("1");
    });

    it("หน้าเว็บที่ถูกเด้งไป /login — คุกกี้ต้องรอด และยังต้องเด้งเหมือนเดิม", async () => {
      const res = await proxy(request("/today"));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/login");
      expect(res.cookies.get(REFRESHED)?.value, "คุกกี้ที่หมุนแล้วถูกทิ้ง").toBe("1");
    });
  });

  it("ต่ออายุ session **ก่อน** ด่านตัดจบ — เส้นที่ถูกบล็อกก็ยังต้องเรียก", async () => {
    // 🔴 ถ้าย้าย refreshSession ไปไว้หลังด่าน เส้นที่ถูกบล็อกจะไม่ถูกต่ออายุเลย
    //    → ผู้ใช้ที่ token ใกล้หมดอายุและบังเอิญเปิดหน้าที่ถูกบล็อก จะเสียโอกาสต่ออายุครั้งนั้นไป
    await proxy(request("/today"));
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});
