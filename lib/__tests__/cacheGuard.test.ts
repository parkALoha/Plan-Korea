import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteCacheFailure, resetCacheFailureNotices } from "@/lib/engine/cacheGuard";

/**
 * `lib/engine/cacheGuard.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 **สิ่งที่ไฟล์นี้ป้องกันคือ *ความเงียบ* ไม่ใช่ความผิดพลาด**
 * แคชเขียนไม่ติด = ระบบยังทำงานถูกทุกอย่าง **แค่จ่ายเงินและเวลาเต็มราคาทุกคำขอ ตลอดไป**
 * → ไม่มีอะไรพัง ไม่มีใครสังเกต · **ตัวเดียวที่จะบอกเราคือ log บรรทัดนี้**
 *
 * ⚠️ เทสต์นี้จึงตรึง **เนื้อของข้อความ** ไม่ใช่แค่ว่า "มีการเรียก `console.error`"
 * เพราะคำแนะนำในข้อความคือสิ่งที่กันไม่ให้คนถัดไปแก้ผิดทาง
 */
beforeEach(() => {
  resetCacheFailureNotices();
  vi.restoreAllMocks();
});

const spy = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("noteCacheFailure", () => {
  it("ไม่มี error → เงียบ", () => {
    const s = spy();
    noteCacheFailure("x/read", null);
    noteCacheFailure("x/read", undefined);
    expect(s).not.toHaveBeenCalled();
  });

  it("🔴 ดังครั้งเดียวต่อจุด — ไม่ใช่ต่อคำขอ", () => {
    // log ทุกคำขอจะกลบตัวเองจนไม่มีใครอ่าน · แคชถูกแตะหลายสิบครั้งต่อการเปิดหน้าหนึ่งครั้ง
    const s = spy();
    for (let i = 0; i < 50; i++) noteCacheFailure("travel_time_cache/write", { code: "42501" });
    expect(s).toHaveBeenCalledTimes(1);
  });

  it("คนละจุด ดังแยกกัน — ไม่ใช่ตัวแรกกลบตัวที่เหลือ", () => {
    const s = spy();
    noteCacheFailure("travel_time_cache/write", { code: "42501" });
    noteCacheFailure("place_details_cache/read", { code: "42501" });
    expect(s).toHaveBeenCalledTimes(2);
  });

  it("🔴 `42501` ต้องพก *คำแนะนำที่กันการแก้ผิดทาง* ไปด้วย", () => {
    const s = spy();
    noteCacheFailure("travel_time_cache/write", { code: "42501", message: "permission denied" });
    const msg = String(s.mock.calls[0][0]);
    expect(msg).toContain("travel_time_cache/write");   // จุดไหน
    expect(msg).toContain("42501");                      // อาการ
    expect(msg).toContain("Q3");                         // คำถามที่ยังไม่มีคำตอบ
    // 🎯 บรรทัดนี้คือสิ่งที่กันคนถัดไปจากทางแก้ที่ "ดูสมเหตุสมผลที่สุด"
    //    (เปิดสิทธิ์ให้ไคลเอนต์เขียนแคช = เปิดทางวางข้อมูลปลอมลงแคชที่คนอื่นใช้)
    expect(msg).toContain("อย่าแก้ด้วยการเปิดสิทธิ์ให้ไคลเอนต์");
  });

  it("รหัสอื่น → ข้อความต่างออกไป และ **ไม่** พกคำแนะนำของ `42501`", () => {
    // ⚠️ ถ้าทุกความล้มเหลวได้ข้อความเดียวกัน คำแนะนำเรื่องสิทธิ์จะขึ้นตอนเน็ตหลุดด้วย
    //    แล้วมันจะกลายเป็นข้อความที่ถูกมองข้าม
    const s = spy();
    noteCacheFailure("travel_time_cache/write", { code: "08006", message: "connection failure" });
    const msg = String(s.mock.calls[0][0]);
    expect(msg).toContain("08006");
    expect(msg).not.toContain("อย่าแก้ด้วยการเปิดสิทธิ์ให้ไคลเอนต์");
  });

  it("error ที่ไม่มี `code`/`message` ก็ยังดัง ไม่ใช่เงียบ", () => {
    // ของที่อธิบายตัวเองไม่ได้ **ยิ่งต้องดัง** — ไม่ใช่ยิ่งเงียบ
    const s = spy();
    noteCacheFailure("x/read", {});
    expect(s).toHaveBeenCalledTimes(1);
  });

  it("`resetCacheFailureNotices()` ทำให้จุดเดิมดังได้อีก (สำหรับเทสต์)", () => {
    const s = spy();
    noteCacheFailure("x/read", { code: "42501" });
    resetCacheFailureNotices();
    noteCacheFailure("x/read", { code: "42501" });
    expect(s).toHaveBeenCalledTimes(2);
  });
});
