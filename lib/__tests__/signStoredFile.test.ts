import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/engine/files.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 **เส้นทาง "เปิดตั๋วตอนไม่มีเน็ต"** — ทริปจริง 11–21 ต.ค. 2026
 * ความผิดพลาดที่นี่ไม่ปรากฏใน CI และไม่ปรากฏตอน dev
 * **มันปรากฏตอนมีคนยืนอยู่หน้าเคาน์เตอร์เช็คอินแล้วเปิดไฟล์ตั๋วไม่ได้**
 *
 * ## ⚠️ เทสต์นี้วัด **ลำดับการตัดสินใจ** ไม่ใช่หน้าตาของค่าที่คืน — จงใจ
 * ฉบับแรกของผมยืนยันว่าค่าที่คืน `^blob:` แล้วมันล้มด้วยเรื่องของ **สภาพแวดล้อม**
 * (`Blob`/`Request`/`URL.createObjectURL` บน Node ไม่เหมือนเบราว์เซอร์)
 * 🎯 **ผมกำลังทดสอบว่า Node จำลองเบราว์เซอร์ได้ไหม ไม่ใช่ว่าโค้ดตัดสินใจถูกไหม**
 * · สิ่งที่ไฟล์นี้ตัดสินจริงคือ **"ลองอะไรก่อน · ตกไปหาอะไรเมื่อไหร่ · ยอมแพ้ตอนไหน"**
 *   → วัดจาก *ใครถูกเรียกบ้าง* ทนต่อสภาพแวดล้อมกว่ามาก และเป็นสิ่งที่ผิดแล้วเจ็บจริง
 *
 * ⚠️ `WebSocket` ต้องมีก่อนกราฟโมดูลโหลด — `@/lib/supabase` สร้าง `RealtimeClient` เสมอ (`F1`)
 */
vi.hoisted(() => {
  const g = globalThis as { WebSocket?: unknown };
  g.WebSocket ??= class {
    constructor() { throw new Error("เทสต์นี้ต้องไม่เปิด WebSocket"); }
  };
});

const createSignedUrl = vi.hoisted(() => vi.fn());
const createSignedUrls = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  supabase: { storage: { from: () => ({ createSignedUrl, createSignedUrls }) } },
}));

import { forgetAllSignedFiles, signStoredFile, signStoredFiles } from "@/lib/engine/files";

const cacheOpen = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  // 🔴 **memo ของ object URL อยู่ระดับ *โมดูล* — ข้ามเคสได้**
  //    ฉบับแรกของเทสต์นี้ใช้คีย์เดียวกัน 2 เคส → เคสที่สองได้ memo hit **แล้วไม่เรียกอะไรเลย**
  //    เคสจึงแดงด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่วัด
  // 🎯 และมันคือรูปเดียวกับ `shouted` ใน `cacheGuard.ts` — **สถานะระดับโมดูลที่เทสต์ต้องล้างเอง**
  //    ทั้งสองไฟล์มีฟังก์ชันล้างไว้ให้แล้ว · **ที่ขาดคือคนเรียกมัน**
  forgetAllSignedFiles();
  cacheOpen.mockResolvedValue({
    match: async () => undefined,     // ไม่เคยแคช (เคสที่ระบุจะ override)
    put: async () => {},
    keys: async () => [],
    delete: async () => true,
  });
  vi.stubGlobal("caches", { open: cacheOpen });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["pdf"]) }));
});
afterEach(() => vi.unstubAllGlobals());

describe("signStoredFile — ลำดับการตัดสินใจ", () => {
  it("ค่าว่าง/`null` → **ไม่แตะ Storage เลย**", async () => {
    for (const v of [null, undefined, ""]) expect(await signStoredFile(v)).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("มีคีย์ → เซ็นก่อน แล้วจึง `fetch` (ไม่ปล่อยให้ `<img src>` ยิงเอง)", async () => {
    // 🔴 signed URL คือ **bearer credential** — ถ้าไปอยู่ใน `<img src>` มันจะหลุดเข้า `sw.js`
    //    และถูกแคชด้วย URL ที่เปลี่ยนลายเซ็นทุกครั้ง (เหตุผลเต็มอยู่ในหัวไฟล์)
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://x/s?token=1" }, error: null });
    await signStoredFile("a/ticket.pdf");
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("token=1");
  });

  it("🔴 เซ็นไม่ได้ (ออฟไลน์) → **ลอง Cache Storage ก่อนยอมแพ้ และไม่ `fetch`**", async () => {
    // นี่คือเคสที่ทั้งไฟล์มีไว้เพื่อมัน · ยืนหน้าเคาน์เตอร์ · ไม่มีเน็ต · เคยเปิดไฟล์นี้แล้ว
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "offline" } });
    await signStoredFile("a/ticket.pdf");
    expect(cacheOpen).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("🔴 เซ็นได้แต่ `fetch` **โยน** (เน็ตหลุดกลางทาง) → ยังลอง Cache Storage", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://x/s" }, error: null });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await signStoredFile("b/ticket.pdf");
    expect(cacheOpen).toHaveBeenCalled();
  });

  it("`fetch` ตอบ `!ok` (403 หมดสิทธิ์ / 404 ไฟล์หาย) → ลอง Cache Storage เหมือนกัน", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://x/s" }, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await signStoredFile("c/ticket.pdf");
    expect(cacheOpen).toHaveBeenCalled();
  });

  it("ไม่มี Cache Storage เลย (เบราว์เซอร์เก่า/SSR) → `null` **ไม่โยน**", async () => {
    vi.stubGlobal("caches", undefined);
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(signStoredFile("d/ticket.pdf")).resolves.toBeNull();
  });

  it("เซ็นไม่ได้ และไม่เคยแคช → `null` ไม่ใช่ค่าที่ดูเหมือนใช้ได้", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(signStoredFile("never/seen.pdf")).resolves.toBeNull();
  });
});

describe("signStoredFiles — เซ็นเป็นชุด", () => {
  it("🔴 ใช้ `createSignedUrls` (พหูพจน์) ไม่ใช่วนเรียกทีละใบ", async () => {
    // ยิงทีละใบคือ N+1 ที่จะไม่มีใครสังเกตจนกว่าทริปจะมีตั๋วหลายสิบใบ
    createSignedUrls.mockResolvedValue({ data: [], error: null });
    await signStoredFiles(["a/1.pdf", "b/2.pdf"]);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("ค่าว่างถูกข้าม — ไม่ทำให้ทั้งชุดล้ม และไม่ถูกส่งเข้า API", async () => {
    createSignedUrls.mockResolvedValue({ data: [], error: null });
    await signStoredFiles([null, "a/x.pdf", undefined, ""]);
    expect(createSignedUrls.mock.calls[0][0]).toEqual(["a/x.pdf"]);
  });

  it("ค่าซ้ำ → ส่งคีย์เดียวเข้า API", async () => {
    createSignedUrls.mockResolvedValue({ data: [], error: null });
    await signStoredFiles(["dup/x.pdf", "dup/x.pdf"]);
    expect(createSignedUrls.mock.calls[0][0]).toEqual(["dup/x.pdf"]);
  });

  it("ไม่มีค่าที่ใช้ได้เลย → **ไม่เรียก API** และคืน map ว่าง", async () => {
    const out = await signStoredFiles([null, undefined, ""]);
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(out.size).toBe(0);
  });
});
