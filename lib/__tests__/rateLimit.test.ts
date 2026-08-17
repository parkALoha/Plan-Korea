import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isRateLimited, rateLimitGuard } from "@/lib/rateLimit";

/**
 * เทสต์ด่าน rate limit — ไฟล์นี้เป็นเทสต์ชุดแรกของ `lib/rateLimit.ts`
 *
 * ⚠️ `buckets` เป็น `Map` ระดับโมดูล จึงอยู่ข้ามเทสต์ในไฟล์นี้ และไม่มีทาง reset จากภายนอก
 * → **ทุกเทสต์ต้องใช้ key ของตัวเองที่ไม่ซ้ำใคร** (ดู `k()`) ไม่ใช่แก้ด้วยการเรียงลำดับเทสต์
 * นี่ไม่ใช่ข้อจำกัดของเทสต์ แต่เป็นคุณสมบัติของตัวโค้ดที่เทสต์นี้บันทึกไว้: state อยู่ในหน่วยความจำ
 * ของ process และรีเซ็ตเองเมื่อ instance ถูกรีไซเคิล ซึ่งเป็นรากของข้อจำกัดใน
 * `docs/engine/security-review.md §5.1`
 *
 * สิ่งที่ตั้งใจบันทึกไว้ให้เห็นเป็นตัวเลข ไม่ใช่แค่ให้ผ่าน:
 *   1. เพดานคือ "อนุญาต `limit` ครั้ง แล้วบล็อกครั้งที่ `limit + 1`"
 *   2. คนละ key คนละถัง — และ key มาจาก `x-forwarded-for` ตัว**ซ้ายสุด** ซึ่ง client เขียนได้เอง
 *   3. 🔴 ถังล้นแล้ว `clear()` ทั้งกระบิ = **ปลด rate limit ของคนที่กำลังโดนจำกัดอยู่**
 */

let seq = 0;
/** key ที่ไม่ซ้ำกับเทสต์อื่นในไฟล์นี้ */
function k(name: string): string {
  seq += 1;
  return `${name}-${seq}`;
}

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://example.com/api/unlock", { headers });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isRateLimited() — เพดานต่อ window", () => {
  it("อนุญาตครบ limit ครั้ง แล้วบล็อกครั้งถัดไป", () => {
    const key = k("basic");
    expect(isRateLimited(key, 3, 60_000)).toBe(false); // 1
    expect(isRateLimited(key, 3, 60_000)).toBe(false); // 2
    expect(isRateLimited(key, 3, 60_000)).toBe(false); // 3
    expect(isRateLimited(key, 3, 60_000)).toBe(true); // 4 — เกิน
  });

  it("บล็อกแล้วบล็อกต่อเนื่อง ไม่ใช่บล็อกสลับปล่อย", () => {
    const key = k("sticky");
    for (let i = 0; i < 2; i += 1) expect(isRateLimited(key, 2, 60_000)).toBe(false);
    for (let i = 0; i < 5; i += 1) expect(isRateLimited(key, 2, 60_000)).toBe(true);
  });

  it("limit = 0 บล็อกตั้งแต่ครั้งแรกไม่ได้ — ครั้งแรกสร้างถังใหม่จึงผ่านเสมอ", () => {
    // จดพฤติกรรมจริงไว้ตรงๆ: การสร้างถังใหม่ `return false` ก่อนดู limit
    // ถ้าวันหลังต้องใช้ `limit = 0` เป็น "ปิดตาย" จะต้องแก้โค้ด ไม่ใช่หวังว่ามันทำอยู่แล้ว
    const key = k("zero");
    expect(isRateLimited(key, 0, 60_000)).toBe(false);
    expect(isRateLimited(key, 0, 60_000)).toBe(true);
  });

  it("คนละ key คนละถัง ไม่กวนกัน", () => {
    const a = k("sep-a");
    const b = k("sep-b");
    expect(isRateLimited(a, 1, 60_000)).toBe(false);
    expect(isRateLimited(a, 1, 60_000)).toBe(true);
    expect(isRateLimited(b, 1, 60_000)).toBe(false); // b ยังไม่เคยถูกใช้
  });

  it("ข้าม window แล้วเริ่มนับใหม่", () => {
    vi.useFakeTimers();
    const key = k("window");
    expect(isRateLimited(key, 1, 60_000)).toBe(false);
    expect(isRateLimited(key, 1, 60_000)).toBe(true);

    vi.advanceTimersByTime(60_000); // ครบ window พอดี (เงื่อนไขเป็น >=)
    expect(isRateLimited(key, 1, 60_000)).toBe(false);
    expect(isRateLimited(key, 1, 60_000)).toBe(true);
  });

  it("ยังไม่ครบ window ไม่รีเซ็ต", () => {
    vi.useFakeTimers();
    const key = k("window-partial");
    expect(isRateLimited(key, 1, 60_000)).toBe(false);
    expect(isRateLimited(key, 1, 60_000)).toBe(true);

    vi.advanceTimersByTime(59_999);
    expect(isRateLimited(key, 1, 60_000)).toBe(true);
  });

  it("🔴 ถังล้น 5,000 แล้ว clear() ทั้งกระบิ — ปลด limit ของคนที่กำลังโดนจำกัดอยู่", () => {
    // `rateLimit.ts:7-9` เขียนกำกับเองว่ายอมรับผลข้างเคียงนี้เพราะ "เป็นด่านคุมค่าใช้จ่าย
    // ไม่ใช่ด่านความปลอดภัย" — แต่ `/api/unlock` **เป็นด่านความปลอดภัย** (`unlock/route.ts:5-8`
    // เขียนเองว่าเพดานนี้คือสิ่งเดียวที่ทำให้ PIN สั้นๆ พอใช้ได้ ห้ามถอดออก)
    // เทสต์นี้บันทึกช่องนั้นเป็นตัวเลข ไม่ใช่ข้อความในเอกสาร — ดู security-review.md §5.1 ข้อ 3
    const victim = k("victim");
    expect(isRateLimited(victim, 1, 60_000)).toBe(false);
    expect(isRateLimited(victim, 1, 60_000)).toBe(true); // โดนจำกัดแล้ว

    // ยิงด้วย key ใหม่จำนวนมาก (ในของจริง = ปลอม x-forwarded-for ให้ต่างกันทุก request)
    for (let i = 0; i < 5_100; i += 1) isRateLimited(`flood-${seq}-${i}`, 1, 60_000);

    // ถังของเหยื่อหายไปพร้อม clear() → เริ่มนับใหม่ได้เลยโดยไม่ต้องรอ window
    expect(isRateLimited(victim, 1, 60_000)).toBe(false);
  });
});

describe("rateLimitGuard() — ตัวห่อสำหรับ API route", () => {
  it("คืน null เมื่อยังไม่เกินเพดาน (ให้ route ทำงานต่อ)", () => {
    const route = k("guard-ok");
    expect(rateLimitGuard(req({ "x-forwarded-for": "1.1.1.1" }), route, 2)).toBeNull();
    expect(rateLimitGuard(req({ "x-forwarded-for": "1.1.1.1" }), route, 2)).toBeNull();
  });

  it("คืน 429 พร้อม JSON เมื่อเกินเพดาน", async () => {
    const route = k("guard-429");
    rateLimitGuard(req({ "x-forwarded-for": "2.2.2.2" }), route, 1);
    const res = rateLimitGuard(req({ "x-forwarded-for": "2.2.2.2" }), route, 1);

    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
    await expect(res?.json()).resolves.toEqual({ error: "rate limited" });
  });

  it("นับแยกตาม routeName — เพดานของ route หนึ่งไม่กินอีก route", () => {
    const a = k("route-a");
    const b = k("route-b");
    const ip = { "x-forwarded-for": "3.3.3.3" };
    rateLimitGuard(req(ip), a, 1);
    expect(rateLimitGuard(req(ip), a, 1)).not.toBeNull(); // a เกินแล้ว
    expect(rateLimitGuard(req(ip), b, 1)).toBeNull(); // b ยังว่าง
  });

  it("นับแยกตาม IP", () => {
    const route = k("per-ip");
    rateLimitGuard(req({ "x-forwarded-for": "4.4.4.4" }), route, 1);
    expect(rateLimitGuard(req({ "x-forwarded-for": "4.4.4.4" }), route, 1)).not.toBeNull();
    expect(rateLimitGuard(req({ "x-forwarded-for": "5.5.5.5" }), route, 1)).toBeNull();
  });

  it("ไม่มี x-forwarded-for → รวมกันอยู่ถังเดียวชื่อ 'unknown'", () => {
    const route = k("no-xff");
    expect(rateLimitGuard(req(), route, 1)).toBeNull();
    expect(rateLimitGuard(req(), route, 1)).not.toBeNull();
  });

  it("🔴 x-forwarded-for หลายค่า → นับด้วยตัวซ้ายสุด ซึ่งเป็นค่าที่ client เขียนเองได้", () => {
    // `rateLimit.ts:38` ใช้ `.split(",")[0]` = ตัวซ้ายสุด · `rateLimit.ts:7` เขียนเองว่า "ปลอมได้"
    // เทสต์นี้ยืนยันพฤติกรรม เพื่อให้การเปลี่ยนไปใช้ IP จากแพลตฟอร์ม (ข้อเสนอใน
    // security-review.md §5.2) เป็นการเปลี่ยนที่มีเทสต์คุม ไม่ใช่การเปลี่ยนแบบไม่รู้ว่ากระทบอะไร
    const route = k("xff-left");
    const real = "9.9.9.9";

    // 2 request ที่มาจาก IP จริงเดียวกัน แต่เติมค่าซ้ายสุดต่างกัน → คนละถัง
    expect(rateLimitGuard(req({ "x-forwarded-for": `1.0.0.1, ${real}` }), route, 1)).toBeNull();
    expect(rateLimitGuard(req({ "x-forwarded-for": `1.0.0.2, ${real}` }), route, 1)).toBeNull();

    // ยิงซ้ำด้วยค่าซ้ายสุดเดิมจึงจะโดนจำกัด
    expect(rateLimitGuard(req({ "x-forwarded-for": `1.0.0.1, ${real}` }), route, 1)).not.toBeNull();
  });

  it("ตัดช่องว่างรอบ IP ก่อนใช้เป็น key", () => {
    const route = k("xff-trim");
    expect(rateLimitGuard(req({ "x-forwarded-for": "  8.8.8.8 , 1.1.1.1" }), route, 1)).toBeNull();
    expect(rateLimitGuard(req({ "x-forwarded-for": "8.8.8.8" }), route, 1)).not.toBeNull();
  });
});
