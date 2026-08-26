import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `writeGuard` — แยก *"ถูกปฏิเสธ"* ออกจาก *"ลองใหม่ได้"* (P7 ชี้ · P1 ลง · 26 ส.ค. 2026)
 *
 * 🔴 **`42501` ลองใหม่ไม่ได้ตลอดกาล ไม่ว่าจะมี cutover หรือไม่** — RLS ปฏิเสธแล้วก็ปฏิเสธเหมือนเดิม
 * ฉบับเดิมพูด *"ลองใหม่อีกครั้ง"* กับความล้มเหลวทุกชนิด → **ผู้ใช้กดซ้ำจนสรุปว่าแอปพัง**
 *
 * 🎯 **เคสสำคัญที่สุดคือ `{ error: null, data: [] }`** — UPDATE ที่ถูก RLS กรองออก
 * คืน `200` ไม่มี error ไม่มี `code` ให้ดูเลย (เคสที่ P2 รายงานไว้)
 * **ถ้าไม่จัดเป็น `denied` ด้วยตัวมันเอง มันจะได้ข้อความ "ลองใหม่" เหมือนเดิม**
 */
const toasts: { kind: string; msg: string }[] = [];
vi.mock("../toast", () => ({
  showToast: (kind: string, msg: string) => void toasts.push({ kind, msg }),
}));

let writeGuard: typeof import("../writeGuard").writeGuard;

beforeEach(async () => {
  toasts.length = 0;
  vi.stubGlobal("navigator", { onLine: true });
  ({ writeGuard } = await import("../writeGuard"));
});
afterEach(() => vi.unstubAllGlobals());

const last = () => toasts[toasts.length - 1]?.msg ?? "";

describe("ข้อความต้องบอกสิ่งที่ผู้ใช้ทำต่อได้จริง", () => {
  it("สำเร็จ → ไม่มี toast", async () => {
    expect(await writeGuard("บันทึก", async () => ({ error: null }))).toBe(true);
    expect(toasts).toHaveLength(0);
  });

  it("🔴 `42501` → ห้ามมีคำว่า \"ลองใหม่\"", async () => {
    const ok = await writeGuard("แก้จุดแวะ", async () => ({ error: { code: "42501" } }));
    expect(ok).toBe(false);
    expect(last()).not.toContain("ลองใหม่อีกครั้ง");
    expect(last()).toContain("ไม่มีสิทธิ์");
  });

  it("🔴 `{ error: null, data: [] }` → `denied` เหมือนกัน · **นี่คือเคสที่ไม่มี code ให้ดู**", async () => {
    await writeGuard("แก้ตารางของคนอื่น", async () => ({ error: null, data: [] }));
    expect(last()).not.toContain("ลองใหม่อีกครั้ง");
    expect(last()).toContain("ไม่มีสิทธิ์");
  });

  it("`allowNoRows` → 0 แถวไม่ใช่ความล้มเหลว จึงไม่มี toast", async () => {
    const ok = await writeGuard("ลบ", async () => ({ error: null, data: [] }), { allowNoRows: true });
    expect(ok).toBe(true);
    expect(toasts).toHaveLength(0);
  });

  it("error ชนิดอื่น → ยังพูด \"ลองใหม่\" เหมือนเดิม (ของที่ retry ได้จริง)", async () => {
    await writeGuard("บันทึก", async () => ({ error: { code: "40001" } }));
    expect(last()).toContain("ลองใหม่อีกครั้ง");
  });

  it("ออฟไลน์ → ข้อความของเน็ต ไม่ใช่ของสิทธิ์", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await writeGuard("บันทึก", async () => ({ error: { code: "42501" } }));
    expect(last()).toContain("เน็ตหลุด");
  });

  it("🔴 โยน (คำขอไปไม่ถึง) → **ห้ามเป็น `denied`** เพราะถูกปฏิเสธแปลว่าไปถึงแล้ว", async () => {
    await writeGuard("บันทึก", async () => { throw new Error("network"); });
    expect(last()).not.toContain("ไม่มีสิทธิ์");
    expect(last()).toContain("ลองใหม่อีกครั้ง");
  });

  it("ชุดหลายคำขอ — พังแถวเดียวด้วย 42501 ก็ต้องได้ข้อความของสิทธิ์", async () => {
    await writeGuard("จัดลำดับใหม่", async () => [{ error: null }, { error: { code: "42501" } }]);
    expect(last()).toContain("ไม่มีสิทธิ์");
  });
});
