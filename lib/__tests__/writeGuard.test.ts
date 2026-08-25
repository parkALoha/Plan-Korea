import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `writeGuard` — ตารางความจริงของ "เขียนแล้วนับว่าสำเร็จหรือล้ม"
 *
 * 🔴 **ทำไมไฟล์นี้ถึงมีอยู่ (P2 รายงาน · P4 ออกแบบ · P1 ลง · 25 ส.ค. 2026)**
 * ฉบับเดิมรับแค่ `{ error }` → **UPDATE/DELETE ที่ถูก RLS กรองออกคืน `200` ไม่มี error แตะ 0 แถว**
 * ทุกชั้นเหนือขึ้นไปอ่านว่าสำเร็จ · **ไม่ใช่บั๊กของใคร แต่เป็นรูปร่างของ API ที่ทำให้
 * "ถูกปฏิเสธ" กับ "สำเร็จ" หน้าตาเหมือนกัน**
 *
 * ⚠️ **เคสในไฟล์นี้ต้องมีทั้ง 2 ทิศเสมอ** — ถ้ามีแต่ทิศ "ต้องล้ม" ตัวที่ล้มทุกกรณีจะเขียวครบทั้งแผง
 * แล้วเว็บจะบอกว่าเซฟไม่สำเร็จทุกครั้งที่กด ซึ่งผู้ใช้เจอหนักกว่าเงียบ
 */
vi.mock("../toast", () => ({ showToast: vi.fn() }));

const { writeGuard } = await import("../writeGuard");
const { showToast } = await import("../toast");

beforeEach(() => {
  vi.mocked(showToast).mockClear();
  // `reportWriteFailure` อ่าน navigator.onLine เพื่อ *เลือกคำพูด* เท่านั้น ไม่ใช้กรอง
  vi.stubGlobal("navigator", { onLine: true });
});

describe("ทิศที่ต้องผ่าน — ตัดออกไม่ได้ ไม่งั้นทิศล่างเขียวเพราะทุกอย่างล้ม", () => {
  it("ไม่มี error และไม่ได้เรียก `.select()` → สำเร็จ (67 จุดที่มีอยู่วันนี้เดินทางนี้)", async () => {
    expect(await writeGuard("ทดสอบ", async () => ({ error: null }))).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("เรียก `.select()` แล้วได้แถวกลับมา → สำเร็จ", async () => {
    expect(await writeGuard("ทดสอบ", async () => ({ error: null, data: [{ id: 1 }] }))).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("หลายคำขอ ได้แถวครบทุกอัน → สำเร็จ", async () => {
    const run = async () => [
      { error: null, data: [{ id: 1 }] },
      { error: null, data: [{ id: 2 }] },
    ];
    expect(await writeGuard("จัดลำดับใหม่", run)).toBe(true);
  });
});

describe("🔴 ทิศที่ต้องล้ม", () => {
  it("มี error → ล้ม และต้องมีเสียง", async () => {
    expect(await writeGuard("ทดสอบ", async () => ({ error: { code: "42501" } }))).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it("🔴 ไม่มี error แต่ได้ `[]` กลับมา → ล้ม — เคสที่ RLS กรองแถวออกเงียบ ๆ", async () => {
    expect(await writeGuard("แก้แผน", async () => ({ error: null, data: [] }))).toBe(false);
    expect(showToast, "เขียนไม่ผ่านแล้วไม่มีเสียง = อาการเดิมที่ไฟล์นี้ถูกสร้างมาเพื่อปิด").toHaveBeenCalledTimes(1);
  });

  it("🔴 หลายคำขอ พังแถวเดียวก็ล้มทั้งชุด — ลำดับที่เขียนไม่ครบคือลำดับที่ผิด", async () => {
    const run = async () => [
      { error: null, data: [{ id: 1 }] },
      { error: null, data: [] },
    ];
    expect(await writeGuard("จัดลำดับใหม่", run)).toBe(false);
  });

  it("คำขอไปไม่ถึงเซิร์ฟเวอร์ (โยน) → ล้ม และต้องมีเสียง", async () => {
    expect(
      await writeGuard("ทดสอบ", async () => {
        throw new Error("network");
      }),
    ).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

describe("🔴 `allowNoRows` — ทางออกที่ต้องพิมพ์เอง ไม่ใช่ค่าตั้งต้น", () => {
  it("ระบุ `allowNoRows` แล้ว `[]` ไม่ถือว่าล้ม (ลบของที่อาจถูกลบไปแล้ว)", async () => {
    const ok = await writeGuard("ลบจุดแวะ", async () => ({ error: null, data: [] }), {
      allowNoRows: true,
    });
    expect(ok).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("🔴 `allowNoRows` ต้องไม่กลบ error จริง — มันยกเว้นแค่ '0 แถว' ไม่ใช่ 'ทุกความล้มเหลว'", async () => {
    const ok = await writeGuard("ลบจุดแวะ", async () => ({ error: { code: "42501" }, data: [] }), {
      allowNoRows: true,
    });
    expect(ok, "ทางออกนี้กลบ error ได้ = มันกลายเป็นสวิตช์ปิดด่านทั้งตัว").toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it("ค่าตั้งต้นต้องเข้ม — ไม่ส่ง options มา แล้ว `[]` ต้องล้ม", async () => {
    expect(await writeGuard("ทดสอบ", async () => ({ error: null, data: [] }))).toBe(false);
  });
});
