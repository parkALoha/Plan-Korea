import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/stopPhoto.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 **ไฟล์นี้เกือบทำให้เกิดไฟล์กำพร้าสะสมเมื่อเช้านี้** — ตอนผมเปลี่ยน `uploadStopPhoto()`
 * ให้คืน *path* แทน public URL · `storagePathFromPublicUrl()` ตัวเดิมในไฟล์นี้เข้าใจ **เฉพาะรูปแบบเก่า**
 * → มันจะคืน `null` ให้ค่ารูปแบบใหม่ → **รูปเก่าไม่เคยถูกลบ ไม่มีอะไรผิดให้ใครเห็น**
 * · แก้ด้วยการใช้ `storageKeyOf()` ของกลางที่รับทั้งสองรูปแบบ · **เทสต์นี้ตรึงข้อนั้นไว้**
 */
vi.hoisted(() => {
  const g = globalThis as { WebSocket?: unknown };
  g.WebSocket ??= class { constructor() { throw new Error("เทสต์นี้ต้องไม่เปิด WebSocket"); } };
});

const guardedUpload = vi.hoisted(() => vi.fn());
const guardedRemove = vi.hoisted(() => vi.fn());
vi.mock("@/lib/engine/guardedStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine/guardedStorage")>()),
  guardedUpload,
  guardedRemove,
}));

import { removeStopPhoto, uploadStopPhoto } from "@/lib/stopPhoto";

const file = (bytes: number, name = "x.jpg") =>
  new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  guardedUpload.mockResolvedValue(true);
  guardedRemove.mockResolvedValue(true);
});

describe("uploadStopPhoto", () => {
  it("🔴 ไฟล์ใหญ่เกิน 10MB → error **โดยไม่อัปโหลดเลย**", async () => {
    const r = await uploadStopPhoto("s1", file(10 * 1024 * 1024 + 1), null);
    expect(r).toEqual({ error: "ไฟล์ใหญ่เกิน 10MB กรุณาเลือกไฟล์อื่น" });
    // ตรวจก่อนยิง — ไม่ใช่ให้ Storage ปฏิเสธแล้วค่อยบอก (ผู้ใช้รออัปโหลดเสร็จก่อนรู้ว่าใหญ่เกิน)
    expect(guardedUpload).not.toHaveBeenCalled();
  });

  it("10MB พอดี → ผ่าน (ขอบต้องไม่ถูกกันไปด้วย)", async () => {
    const r = await uploadStopPhoto("s1", file(10 * 1024 * 1024), null);
    expect(r).toHaveProperty("url");
    expect(guardedUpload).toHaveBeenCalledTimes(1);
  });

  it("อัปโหลดล้ม → error **และไม่ลบรูปเก่า**", async () => {
    // 🔴 ลบของเก่าทั้งที่ของใหม่ขึ้นไม่สำเร็จ = ผู้ใช้เสียรูปที่เคยมี โดยไม่ได้อะไรกลับมา
    guardedUpload.mockResolvedValue(false);
    const r = await uploadStopPhoto("s1", file(10), "old/photo.jpg");
    expect(r).toEqual({ error: "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" });
    expect(guardedRemove).not.toHaveBeenCalled();
  });

  it("🔴 อัปโหลดสำเร็จ → ลบรูปเก่าด้วย `allowNoRows: true`", async () => {
    // อีกเครื่องอาจเปลี่ยนรูปเดียวกันไปก่อน — **"ไม่มีให้ลบ" = ผลที่ผู้ใช้ต้องการอยู่แล้ว**
    await uploadStopPhoto("s1", file(10), "old/photo.jpg");
    expect(guardedRemove).toHaveBeenCalledTimes(1);
    expect(guardedRemove.mock.calls[0][2]).toEqual({ allowNoRows: true });
  });

  it("ไม่มีรูปเก่า → ไม่เรียกลบเลย", async () => {
    await uploadStopPhoto("s1", file(10), null);
    expect(guardedRemove).not.toHaveBeenCalled();
  });

  it("🔴 ลบรูปเก่าล้ม → **ไม่ทำให้การอัปโหลดล้มตาม**", async () => {
    // แย่ที่สุดคือไฟล์กำพร้าค้างใน bucket ซึ่งดังผ่าน toast ของ `writeGuard` แล้ว
    // 🎯 ถ้าปล่อยให้มันล้มตาม ผู้ใช้จะเห็น "อัปโหลดไม่สำเร็จ" ทั้งที่รูปใหม่ขึ้นไปเรียบร้อยแล้ว
    guardedRemove.mockResolvedValue(false);
    const r = await uploadStopPhoto("s1", file(10), "old/photo.jpg");
    expect(r).toHaveProperty("url");
  });

  it("🔴 รูปเก่าที่เป็น **public URL แบบเก่า** ก็ต้องถูกถอด path ออกได้", async () => {
    // นี่คือบั๊กที่เกือบเกิดเมื่อเช้า: ตัวแปลงที่เข้าใจแค่รูปแบบเดียว → รูปเก่าไม่เคยถูกลบ **เงียบ ๆ**
    await uploadStopPhoto("s1", file(10),
      "https://xyz.supabase.co/storage/v1/object/public/booking-files/stop-photo-a.jpg");
    expect(guardedRemove).toHaveBeenCalledTimes(1);
    expect(guardedRemove.mock.calls[0][1]).toEqual(["stop-photo-a.jpg"]);
  });

  it("🔴 คืน **path** ไม่ใช่ public URL", async () => {
    // `getPublicUrl()` บน bucket ที่ปิดแล้วคืน URL ที่เปิดไม่ได้ (`E2-AC13` ①)
    const r = await uploadStopPhoto("stop-9", file(10), null);
    const url = (r as { url: string }).url;
    expect(url).not.toContain("http");
    expect(url).toContain("stop-photo-stop-9-");
    // ชื่อไฟล์เดิมติดท้ายไว้ให้คนที่เปิด bucket ดูรู้ว่าเป็นไฟล์อะไร
    expect(url.endsWith("-x.jpg")).toBe(true);
  });

  it("ชื่อไฟล์ต่างกันทุกครั้ง — สองรูปของจุดแวะเดียวกันต้องไม่ทับกัน", async () => {
    const a = (await uploadStopPhoto("s1", file(10), null) as { url: string }).url;
    const b = (await uploadStopPhoto("s1", file(10), null) as { url: string }).url;
    expect(a).not.toBe(b);
  });
});

describe("removeStopPhoto", () => {
  it("ค่าว่าง → ไม่เรียกอะไรเลย", async () => {
    for (const v of [null, undefined, ""]) await removeStopPhoto(v);
    expect(guardedRemove).not.toHaveBeenCalled();
  });

  it("มีค่า → ลบด้วย `allowNoRows: true`", async () => {
    await removeStopPhoto("some/path.jpg");
    expect(guardedRemove.mock.calls[0][1]).toEqual(["some/path.jpg"]);
    expect(guardedRemove.mock.calls[0][2]).toEqual({ allowNoRows: true });
  });
});
