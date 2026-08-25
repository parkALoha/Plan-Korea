import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
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

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 P4 — รูปร่างผลลัพธ์จริงจาก supabase-js · **2 ใน 4 แบบเท่านั้นที่ได้การป้องกัน**", () => {
  /**
   * วัดจริงบน `engine-dev`: ให้ `B` (ไม่ใช่สมาชิก) แก้ทริปของ `A` — RLS กรองทิ้งทุกครั้ง
   * แล้วดูว่า supabase-js คืนอะไรกลับมาตามท้ายคำสั่งแต่ละแบบ
   *
   * | ท้ายคำสั่ง | `error` | `data` | `writeGuard` ตัดสิน |
   * |---|---|---|---|
   * | ไม่มี `.select()`          | `null`     | `null` | ✅ สำเร็จ — **ถูกต้องตามดีไซน์** (ไม่ได้ถาม จึงไม่รู้) |
   * | `.select()`                | `null`     | `[]`   | ✅ **ล้ม** — นี่คือช่องที่เพิ่งปิด |
   * | `.select().maybeSingle()`  | `null`     | `null` | 🔴 **สำเร็จ — ทั้งที่ถามแล้วไม่ได้แถวกลับมา** |
   * | `.select().single()`       | `PGRST116` | `null` | ✅ ล้ม — รอดเพราะทาง `error` ไม่ใช่ทาง `data` |
   *
   * 🔴 **แถวที่สามคือรูเดียวกับที่ `writeGuard` เกิดมาเพื่อปิด แค่เปลี่ยนรูป**
   * `.maybeSingle()` กับ "ไม่ได้เรียก `.select()`" **คืนค่าหน้าตาเหมือนกันเป๊ะ** —
   * คนที่เติม `.maybeSingle()` เพราะคิดว่าได้การป้องกัน **จะไม่ได้อะไรเลย และหน้าจอบอกเหมือนกันทุกอย่าง**
   *
   * 🎯 `writeGuard` แยกสองกรณีนี้จากผลลัพธ์ไม่ได้ **และไม่ควรพยายาม** — คนที่รู้คือจุดเรียก
   * เคสข้างล่างจึง **ตรึงขอบเขตไว้ตามความจริง** แล้วปิดทางด้วยด่านสถิต ไม่ใช่แกล้งว่าปิดได้ในตรรกะ
   */
  it("ตรึงความจริง: `data: null` ตัดสินว่าสำเร็จ — ทั้งกรณีที่ถูกและกรณีที่เป็นรู", async () => {
    expect(await writeGuard("x", async () => ({ error: null, data: null }))).toBe(true);
  });

  it("`data: []` ล้ม — ช่องที่ปิดไปแล้ว", async () => {
    expect(await writeGuard("x", async () => ({ error: null, data: [] }))).toBe(false);
  });

  it("`.single()` รอดทาง error ไม่ใช่ทาง data", async () => {
    expect(await writeGuard("x", async () => ({ error: { code: "PGRST116" }, data: null }))).toBe(
      false,
    );
  });

  it("🔴 `allowNoRows` ครอบทั้งชุด ไม่ใช่ทีละรายการ — Promise.all ที่ปนกันจะได้ใบผ่านยกชุด", async () => {
    // การลบที่ "ไม่มีก็ไม่เป็นไร" + การแก้ที่ "ต้องมีผล" อยู่ในชุดเดียวกัน
    // → ธงใบเดียวปลดล็อกให้ทั้งคู่ · การแก้ที่ถูก RLS กรองจะเงียบไปด้วย
    const mixed = await writeGuard(
      "x",
      async () => [
        { error: null, data: [] }, // การลบที่ยอมให้ว่างได้
        { error: null, data: [] }, // 🔴 การแก้ที่ไม่ควรยอม — แต่แยกไม่ออก
      ],
      { allowNoRows: true },
    );
    expect(mixed, "ชุดผสมได้ใบผ่านทั้งชุด — ข้อจำกัดที่รู้อยู่ ไม่ใช่บั๊กที่เพิ่งเจอ").toBe(true);
  });
});

describe("🔴 ด่านสถิต — `.maybeSingle()` ห้ามอยู่ในคำขอที่ห่อด้วย writeGuard", () => {
  /**
   * ตรรกะแยก `.maybeSingle()` ออกจาก "ไม่ได้เรียก `.select()`" ไม่ได้ — **แต่ไฟล์แยกได้**
   * 🎯 ปิดที่ทางเข้าแทนที่จะพยายามปิดที่ผลลัพธ์ · วันนี้ยังไม่มีใครใช้ **ด่านนี้จึงกันไว้ก่อนที่รูจะเกิด**
   */
  it("ไม่มีจุดไหนใน hooks/app/components ใช้ maybeSingle ในบล็อกของ writeGuard", () => {
    const roots = ["hooks", "app", "components", "lib"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__" && e.name !== "node_modules") walk(full);
        } else if (/\.(ts|tsx)$/.test(e.name) && !full.includes("writeGuard")) {
          const src = readFileSync(full, "utf8");
          for (const m of src.matchAll(/writeGuard\(([\s\S]{0,400}?)\)\s*;/g)) {
            if (m[1].includes("maybeSingle")) offenders.push(full);
          }
        }
      }
    };
    for (const r of roots) {
      try {
        walk(resolve(process.cwd(), r));
      } catch {
        /* โฟลเดอร์ไม่มีก็ข้าม */
      }
    }
    expect(
      offenders,
      "`.maybeSingle()` คืน `data: null` ตอนไม่ได้แถว — writeGuard แยกจาก 'ไม่ได้เรียก select' ไม่ได้\n" +
        "  → ใช้ `.select()` เฉย ๆ (ได้ `[]`) หรือ `.single()` (ได้ error) แทน",
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 ราวที่ลงได้อย่างเดียว — จุดเรียกที่ยังมองไม่เห็นจำนวนแถว", () => {
  /**
   * **ปัญหาที่เลขนี้มีไว้แก้:** `writeGuard` มองเห็นการเขียนที่ถูกกรองทิ้งได้แล้ว
   * **แต่จุดเรียกต้องส่ง `.select()` เข้ามาก่อน มันถึงจะมีอะไรให้เห็น**
   * · วันที่แก้เสร็จ: จุดเรียก **18 จุด · ส่ง `.select()` เข้ามา 0 จุด**
   * · 🎯 **"แก้ถูกแล้ว" กับ "ปิดช่องแล้ว" เป็นคนละเรื่อง** — และตัวเลขนี้คือความต่าง
   *
   * ## ทำไมเป็นราว ไม่ใช่เลขตายตัว และไม่ใช่บรรทัดแจ้งเตือน
   * · **เลขตายตัว (`toBe`)** → ต้องแก้เทสต์ทุกครั้งที่ย้ายจุดเรียก **ค่าแรงสูงโดยไม่ได้อะไรเพิ่ม**
   *   (ย้ายทีละอัน = แก้เลขทีละครั้ง · คนจะเริ่มย้ายเป็นก้อนใหญ่เพื่อเลี่ยงความรำคาญ)
   * · **บรรทัดแจ้งเตือน** → ไม่มีอะไรล้ม · เลขที่อ่านได้อย่างเดียว **สร้างภาพว่ามีคนเฝ้าอยู่ทั้งที่ไม่มี**
   *   และในผลรัน 300+ เคส มันจะกลายเป็นบรรทัดที่ตาเลื่อนผ่านภายในสัปดาห์เดียว
   * · **ราว (`toBeLessThanOrEqual`)** → ย้ายจุดเรียกแล้ว **เขียวเองโดยไม่ต้องแตะเทสต์**
   *   แต่ **เพิ่มจุดที่ 19 ที่ยังมองไม่เห็นแถว → แดงทันที**
   *
   * ⚠️ **ราวไม่ล็อกความคืบหน้า** — ลงไป 10 แล้วขึ้นกลับ 15 ยังเขียว
   *   ทางแก้คือ **ลดเลขนี้ลงตอนย้ายเสร็จเป็นก้อน** ซึ่งเป็นการตัดสินใจ ไม่ใช่งานประจำ
   *   🔴 **ห้ามขึ้นเลขนี้เด็ดขาด** — ขึ้นเมื่อไหร่แปลว่ามีคนเพิ่มการเขียนที่เงียบได้อีกจุด
   *
   * 📌 `E3` ปิดได้เมื่อเลขนี้เป็น **0** — ไม่ใช่เมื่อ "DAL เขียนเสร็จ"
   */
  const UNPROTECTED_TODAY = 18;

  function scan(): { total: number; unprotected: number; files: string[] } {
    const files: string[] = [];
    let total = 0;
    let unprotected = 0;
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (!["__tests__", "node_modules", ".next"].includes(e.name)) walk(full);
        } else if (/\.(ts|tsx)$/.test(e.name) && !full.includes("writeGuard.ts")) {
          const src = readFileSync(full, "utf8");
          for (const m of src.matchAll(/writeGuard\(([\s\S]{0,600}?)\)\s*[;,)]/g)) {
            total++;
            if (!m[1].includes(".select(")) {
              unprotected++;
              files.push(full);
            }
          }
        }
      }
    };
    for (const r of ["hooks", "app", "components", "lib"]) {
      try {
        walk(resolve(process.cwd(), r));
      } catch {
        /* ไม่มีโฟลเดอร์ก็ข้าม */
      }
    }
    return { total, unprotected, files: [...new Set(files)] };
  }

  it("🔴 ต้องอ่านจุดเรียกเจอจริง — ไม่งั้นเคสข้างล่างเขียวด้วยการไม่เจออะไรเลย", () => {
    expect(scan().total, "อ่าน writeGuard( ไม่เจอสักจุด — regex หรือโครงไฟล์เปลี่ยน").toBeGreaterThan(5);
  });

  it("🔴 จำนวนจุดเรียกที่ยังมองไม่เห็นแถว ต้องไม่เพิ่มขึ้น", () => {
    const { unprotected, files } = scan();
    expect(
      unprotected,
      `จุดเรียกที่เขียนแล้วเงียบได้เพิ่มขึ้นเป็น ${unprotected} (เคยเป็น ${UNPROTECTED_TODAY})\n` +
        `  🔴 การเขียนที่ถูก RLS กรองทิ้งที่จุดพวกนี้ **ยังอ่านว่าสำเร็จ**\n` +
        `  → เติม \`.select()\` ในคำขอที่ห่อด้วย writeGuard แล้วเลขจะลงเอง\n` +
        `  ไฟล์: ${files.map((f) => f.split("/").slice(-2).join("/")).join(" · ")}`,
    ).toBeLessThanOrEqual(UNPROTECTED_TODAY);
  });
});
