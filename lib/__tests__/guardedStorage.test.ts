import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/engine/guardedStorage.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 **ไฟล์นี้คือที่เดียวในโปรเจกต์ที่เขียน Storage ได้** (`E3-AC4` · `D15`)
 * ด่านของ P2 บังคับว่าการเขียนอยู่ได้แค่ในไฟล์ที่อนุญาต **แต่บังคับ *ห่อหรือไม่ห่อ* ไม่ได้**
 * → ไฟล์นี้ทำให้สองคำถามเป็นคำถามเดียว: **ที่เดียวที่อนุญาต = ที่ที่ห่อเสมอ**
 *
 * ⚠️ **mock ขอบนอกแล้ว spread ของเดิมกลับ** (`S6` — ซึ่งเพิ่งถูกขยายให้ครอบพาธสัมพัทธ์วันนี้)
 */
/**
 * 🔴 **ต้องมีก่อน `vi.mock` — และมันคือจุดที่กติกาสองข้อของทีมตึงกัน** (P1 · 27 ส.ค. 2026)
 *
 * · `S6` บังคับว่า `vi.mock` ของโมดูลเราต้อง **spread `importOriginal()`** (ไม่งั้นกลืน export ใหม่)
 * · แต่ `importOriginal()` บน `@/lib/supabase` **สั่งให้โมดูลนั้นรันจริง** → `createClient()`
 *   → `RealtimeClient` → **`Node.js detected but native WebSocket not found`** (บั๊ก `F1` ที่ P4 บันทึกไว้)
 *
 * 🎯 **ทำตามกติกาข้อหนึ่ง = ชนอีกข้อหนึ่ง** — และไม่มีเอกสารไหนบอกว่าต้องทำยังไง
 * **ทางออก: ให้ `WebSocket` มีอยู่ *ก่อน* กราฟโมดูลถูกโหลด**
 * `vi.hoisted` รันก่อน `vi.mock` → ตอน `importOriginal()` ทำงาน `RealtimeClient` หาเจอแล้ว
 * · ⚠️ **สตับนี้ไม่ได้ต่อ socket จริงและจะไม่มีวันต่อ** — ถ้าเทสต์ไหนพยายามใช้มันจริง มันจะพังตรงนั้น
 *   ซึ่งถูกต้อง: เทสต์นี้ไม่ได้ทดสอบ realtime และไม่ควรเปิด socket
 */
vi.hoisted(() => {
  const g = globalThis as { WebSocket?: unknown };
  g.WebSocket ??= class {
    constructor() {
      throw new Error("เทสต์นี้ต้องไม่เปิด WebSocket — ถ้าเห็น error นี้ แปลว่ามีอะไรพยายามใช้ realtime");
    }
  };
});

const uploadSpy = vi.hoisted(() => vi.fn());
const removeSpy = vi.hoisted(() => vi.fn());
const fromSpy = vi.hoisted(() => vi.fn(() => ({ upload: uploadSpy, remove: removeSpy })));
const writeGuardSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  supabase: { storage: { from: fromSpy } },
}));
vi.mock("@/lib/writeGuard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/writeGuard")>()),
  writeGuard: writeGuardSpy,
}));

import { guardedRemove, guardedUpload } from "@/lib/engine/guardedStorage";
import { BOOKING_FILES_BUCKET } from "@/lib/engine/storageKey";

beforeEach(() => {
  vi.clearAllMocks();
  // ให้ `writeGuard` รัน callback จริงแล้วคืน true — เราวัด *สิ่งที่ถูกส่งเข้าไป* ไม่ใช่ตัว writeGuard
  writeGuardSpy.mockImplementation(async (_label: string, run: () => unknown) => {
    await run();
    return true;
  });
  uploadSpy.mockResolvedValue({ data: { path: "p" }, error: null });
  removeSpy.mockResolvedValue({ data: [{}], error: null });
});

describe("guardedUpload", () => {
  it("ยิงเข้า bucket ของไฟล์ตั๋วเสมอ", async () => {
    await guardedUpload("อัปโหลดรูป", "path/x.jpg", new File([""], "x.jpg"));
    expect(fromSpy).toHaveBeenCalledWith(BOOKING_FILES_BUCKET);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });

  it("ห่อ `writeGuard` เสมอ พร้อม label ของผู้ใช้", async () => {
    await guardedUpload("อัปโหลดรูปจุดแวะ", "p", new File([""], "x"));
    expect(writeGuardSpy).toHaveBeenCalledTimes(1);
    expect(writeGuardSpy.mock.calls[0][0]).toBe("อัปโหลดรูปจุดแวะ");
  });

  it("🔴 ส่งต่อ **เฉพาะ `error`** ไม่ใช่ `data` ของ `.upload()`", async () => {
    // `.upload()` คืน `data` เป็น **object** (`{path,id,fullPath}`) ไม่ใช่ array
    // 🎯 `WriteResult.data` เป็น `unknown[] | null` — ถ้ายัด object เข้าไปจะต้องขยายชนิด
    //    แล้ว **ชนิดจะเลิกบอกว่า "data คือแถว"** ซึ่ง `writeGuard` ทั้งไฟล์ตั้งอยู่บนข้อนั้น
    //    → ทิ้ง `data` ให้ความไม่เข้ากันอยู่ที่จุดเรียก (ตัดสินไว้แล้วในหัวไฟล์)
    uploadSpy.mockResolvedValue({ data: { path: "p", id: "i" }, error: null });
    await guardedUpload("x", "p", new File([""], "x"));
    const result = await writeGuardSpy.mock.calls[0][1]();
    expect(result).toEqual({ error: null });
    expect(result).not.toHaveProperty("data");
  });

  it("ไม่ส่ง `allowNoRows` — และนั่นถูก", async () => {
    // `.upload()` คืน object ไม่ใช่ array → ข้อ "0 แถว" ของ `writeGuard` ไม่ทำงานกับมันอยู่แล้ว
    // **ถูกโดยธรรมชาติของ API ไม่ใช่ช่องที่พลาด**
    await guardedUpload("x", "p", new File([""], "x"));
    expect(writeGuardSpy.mock.calls[0][2]).toBeUndefined();
  });
});

describe("guardedRemove", () => {
  it("🔴 ลิสต์ว่าง → คืน `true` **โดยไม่แตะ Storage เลย**", async () => {
    // "ไม่มีอะไรให้ลบ" = สำเร็จ · และไม่ควรเสียคำขอเปล่า
    expect(await guardedRemove("ลบรูป", [], { allowNoRows: true })).toBe(true);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(writeGuardSpy).not.toHaveBeenCalled();
  });

  it("ส่ง `allowNoRows` ต่อให้ `writeGuard` ตรง ๆ ทั้งสองค่า", async () => {
    // 🔴 `writeGuard` เขียนกติกาไว้เองว่าค่านี้ **ต้องระบุทุกครั้ง ไม่มีค่าตั้งต้น**
    //    (*"ถ้าเป็นค่าตั้งต้น ช่องที่เพิ่งปิดจะเปิดกลับทันที และเปิดกลับแบบที่ไม่มีใครเห็น"*)
    await guardedRemove("ลบรูปเดิม", ["a"], { allowNoRows: true });
    expect(writeGuardSpy.mock.calls[0][2]).toEqual({ allowNoRows: true });
    vi.clearAllMocks();
    writeGuardSpy.mockImplementation(async (_l: string, run: () => unknown) => { await run(); return true; });
    await guardedRemove("ลบรูปที่เพิ่งสร้าง", ["a"], { allowNoRows: false });
    expect(writeGuardSpy.mock.calls[0][2]).toEqual({ allowNoRows: false });
  });

  it("ลบหลายไฟล์ในคำขอเดียว ไม่ใช่ยิงทีละใบ", async () => {
    await guardedRemove("ลบ", ["a", "b", "c"], { allowNoRows: true });
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("ยิงเข้า bucket เดียวกับ upload", async () => {
    await guardedRemove("ลบ", ["a"], { allowNoRows: false });
    expect(fromSpy).toHaveBeenCalledWith(BOOKING_FILES_BUCKET);
  });
});
