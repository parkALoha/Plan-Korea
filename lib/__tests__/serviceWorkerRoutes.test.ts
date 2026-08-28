import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * กฎ routing ของ `public/sw.js` — `E6-AC8` · `E6-AC6` · ด่าน PIN
 * เจ้าของ: P3-FE/Perf · 27 ส.ค. 2026
 *
 * ## 🔴 ทำไมไฟล์นี้มี — `sw.js` ไม่เคยมีเทสต์แตะเนื้อในเลยสักตัว
 * `proxy.test.ts` อ้าง `/sw.js` ในฐานะ *path ที่ proxy ปล่อยผ่าน* ไม่ได้ตรวจว่าตัวไฟล์ทำอะไร
 * → บรรทัด `if (url.pathname.startsWith("/auth/callback")) return;` (`E6-AC8`) **ลบทิ้งวันนี้ก็ไม่มีอะไรแดง**
 * และผลของการลบคือ **ผู้ใช้ล็อกอินไม่ได้ถาวร** จนกว่าจะล้าง site data ซึ่งไม่มีใครทำ (`D42`)
 *
 * ## 🎯 รันของจริง ไม่ใช่ grep ข้อความ
 * โหลดซอร์สจริงมารันใน scope ปลอม แล้ว **ยิง fetch event เข้าไปจริง ๆ** วัดว่า `respondWith` ถูกเรียกไหม
 * · grep หา `startsWith("/auth/callback")` จะเขียวแม้บรรทัดนั้นถูกย้ายไปอยู่หลัง `respondWith` (สายเกินไป)
 * · **การรันแยกสองอย่างนั้นออกจากกัน การอ่านแยกไม่ออก**
 *
 * ## 🔴 เคสควบคุมฝั่งบวกอยู่ล่างสุด — และมันคือเหตุผลที่เชื่อเคสฝั่งลบได้
 * ถ้า harness พัง (เช่น `new Function` ไม่ทันลงทะเบียน handler) **ทุกอย่างจะ "ไม่ถูกจัดการ" เหมือนกันหมด**
 * แล้วเคสฝั่งลบทั้งชุดจะเขียวโดยไม่ได้พิสูจน์อะไรเลย — เคสฝั่งบวกคือตัวที่กันข้อนั้น
 * (บทเรียนของทีมวันนี้: *"ไม่เจอ" กับ "วัดไม่เจอ" คนละประโยค*)
 */

type FetchHandler = (event: {
  request: { url: string; method: string; mode?: string };
  respondWith: (p: unknown) => void;
}) => void;

const ORIGIN = "https://plan.example.test";

/** โหลด `public/sw.js` จริงมารันใน scope ปลอม แล้วคืน handler ของ `fetch` ที่มันลงทะเบียนไว้ */
function loadFetchHandler(): FetchHandler {
  const src = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  const listeners = new Map<string, FetchHandler>();

  const selfStub = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: FetchHandler) => void listeners.set(type, fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  // แคชปลอมที่ "ว่างเสมอ" — พอสำหรับให้ `networkFirst`/`cacheFirst` เดินได้โดยไม่โยน
  const cachesStub = {
    open: async () => ({ match: async () => undefined, put: async () => undefined }),
    keys: async () => [] as string[],
    delete: async () => true,
    match: async () => undefined,
  };
  const fetchStub = async () => ({ status: 200, redirected: false, type: "basic", clone: () => ({}) });

  // รันซอร์สจริงของ SW ใน scope ที่เราคุมเอง — คือทั้งหมดที่ไฟล์นี้ตรวจ
  new Function("self", "caches", "fetch", src)(selfStub, cachesStub, fetchStub);

  const handler = listeners.get("fetch");
  if (!handler) throw new Error("sw.js ไม่ได้ลงทะเบียน fetch handler — harness หรือไฟล์เปลี่ยนรูป");
  return handler;
}

/**
 * ยิง fetch event เข้า handler จริง → `true` = SW เข้าไปจัดการ (เรียก `respondWith`)
 * `false` = ปล่อยผ่านให้เบราว์เซอร์ยิงเน็ตเองตามปกติ
 */
function isHandled(handler: FetchHandler, url: string, opts: { method?: string; mode?: string } = {}) {
  let responded = false;
  handler({
    request: { url, method: opts.method ?? "GET", mode: opts.mode ?? "navigate" },
    respondWith: (p: unknown) => {
      responded = true;
      // กลืน rejection ของ promise ที่เราไม่ได้ await — สนใจแค่ว่า *ถูกเรียก* ไหม
      void Promise.resolve(p).catch(() => undefined);
    },
  });
  return responded;
}

describe("public/sw.js — เส้นทางที่ห้ามแตะ", () => {
  const handler = loadFetchHandler();

  describe("🔴 E6-AC8 / D42 — `/auth/callback` ต้องไม่ผ่าน service worker เลย", () => {
    // one-shot redirect ที่เขียนคุกกี้ session · แคชทับแล้วผู้ใช้ล็อกอินไม่ได้ถาวร
    for (const url of [
      `${ORIGIN}/auth/callback`,
      `${ORIGIN}/auth/callback?code=abc123`,
      `${ORIGIN}/auth/callback/google`,
    ]) {
      it(`ปล่อยผ่าน: ${url.replace(ORIGIN, "")}`, () => {
        expect(isHandled(handler, url)).toBe(false);
      });
    }
  });

  describe("ด่าน PIN ต้องคุยกับเซิร์ฟเวอร์จริงเสมอ", () => {
    for (const url of [`${ORIGIN}/unlock`, `${ORIGIN}/api/unlock`, `${ORIGIN}/api/unlock/verify`]) {
      it(`ปล่อยผ่าน: ${url.replace(ORIGIN, "")}`, () => {
        expect(isHandled(handler, url)).toBe(false);
      });
    }
  });

  describe("🔴 E6-AC6 — ไม่มีอะไรที่ผูกกับทริปถูกแคช (นี่คือสิ่งที่ `D4` ต้องการจริง ๆ)", () => {
    /**
     * 🎯 **`D4` เขียนว่า "แคช SW ต้องแยกรายทริป" — วัดแล้ววันนี้ SW ไม่ได้แคชอะไรที่ผูกกับทริปเลย**
     * `CACHEABLE_API` ทั้ง 5 เส้นคีย์ด้วยสถานที่/พิกัด/วันที่ (ข้อมูลอ้างอิงสาธารณะ ไม่รับ `tripId`)
     * · `ASSET_CACHE` เป็น build asset · `SHELL_CACHE` คีย์ด้วย URL ซึ่ง `/trip/{id}` แยกกันอยู่แล้ว
     *
     * 🔴 **ด่านนี้จึงล็อก *invariant ที่แท้จริง* แทนการใส่ `tripId` ลงชื่อ cache ที่ไม่ได้ปิดอะไร**
     * — วันที่มีคนเติมเส้นที่ผูกกับทริปลง `CACHEABLE_API` (เช่น `/api/engine/trips/.../stops` ที่ดู
     * "แคชได้" มากตอนคิดเรื่องออฟไลน์) **เคสนี้จะแดงทันที** ซึ่งคือจังหวะเดียวที่ `D4` จะกลายเป็นของจริง
     */
    for (const path of [
      "/api/engine/trips/11111111-2222-3333-4444-555555555555/stops",
      "/api/engine/trips/11111111-2222-3333-4444-555555555555/hotels",
      "/api/engine/trips/11111111-2222-3333-4444-555555555555/days",
      "/api/engine/plans?tripId=11111111-2222-3333-4444-555555555555",
    ]) {
      it(`ไม่แคช: ${path}`, () => {
        expect(isHandled(handler, `${ORIGIN}${path}`, { mode: "cors" })).toBe(false);
      });
    }
  });

  it("ข้ามคำขอข้ามโดเมน — Supabase/Google ต้องสดเสมอ", () => {
    expect(isHandled(handler, "https://xyz.supabase.co/rest/v1/trips", { mode: "cors" })).toBe(false);
  });

  it("ข้ามทุก method ที่ไม่ใช่ GET", () => {
    expect(isHandled(handler, `${ORIGIN}/today`, { method: "POST" })).toBe(false);
  });

  /**
   * 🔴 **เคสควบคุมฝั่งบวก — ถ้าชุดนี้แดง เคสฝั่งลบทั้งหมดข้างบนไม่ได้พิสูจน์อะไรเลย**
   * มันยืนยันว่า harness *เห็น* ของที่ต้องเห็น ก่อนจะเชื่อว่ามัน *ไม่เห็น* ของที่ไม่ควรถูกแตะ
   */
  describe("🔴 E6-AC3 (ครึ่งแรก: \"service worker ยังทำงาน\") · เคสควบคุมฝั่งบวก — SW ยังทำงานของมันอยู่จริง", () => {
    it("หน้าเว็บปกติถูกจัดการ (networkFirst + offline fallback)", () => {
      expect(isHandled(handler, `${ORIGIN}/today`)).toBe(true);
    });

    it("static asset ถูกจัดการ (cacheFirst)", () => {
      expect(isHandled(handler, `${ORIGIN}/_next/static/chunks/main.js`, { mode: "no-cors" })).toBe(true);
    });

    it("API ที่แคชได้ถูกจัดการ — และมันคือเส้นที่ไม่ผูกกับทริป", () => {
      expect(isHandled(handler, `${ORIGIN}/api/weather?lat=37.5&lng=127`, { mode: "cors" })).toBe(true);
      expect(isHandled(handler, `${ORIGIN}/api/place-details?query=x`, { mode: "cors" })).toBe(true);
    });
  });
});
