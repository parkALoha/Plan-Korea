import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `E3-AC4` — Storage เขียนต้องผ่าน choke point เดียวกับตาราง (10/10 hook) ไม่ใช่ข้อยกเว้น
 *
 * ห่อ 4 จุดใน `BookingEditModal.tsx` เข้า `writeGuard` ผ่าน `hooks/useBookingFile.ts` แล้วยังไม่พอ —
 * ต้องมีอะไรกันจุดที่ 5 ในอนาคตเขียนตรงจาก component แล้วข้าม guard ไปเงียบๆ (P1 ถาม)
 *
 * ปิดที่**ทางเข้า** (ไฟล์ไหนอนุญาตให้เรียก `supabase.storage.from(...).upload/remove/...` ตรงๆ)
 * แทนที่จะพยายามปิดที่ผลลัพธ์ — แพทเทิร์นเดียวกับด่าน `.maybeSingle()` ใน `writeGuard.test.ts`
 * (ตรรกะแยกไม่ได้จากผลลัพธ์เพียวๆ แต่ไฟล์แยกได้)
 */
// 🔴 **แก้ 27 ส.ค. 2026 (P1 · หลัง P2 ชี้ช่องของด่านตัวเองและตกลงกันแล้ว)**
// ด่านนี้บังคับ *ที่ไหน* ไม่ได้บังคับ *ห่อหรือไม่ห่อ* — regex จับ `.upload()` ดิบ ๆ ที่เขียน
// **ในไฟล์ที่อนุญาตเอง** ไม่ได้ · ทางแก้คือทำให้ **ที่เดียวที่อนุญาต = ที่ที่ห่อเสมอ**
// → `lib/engine/guardedStorage.ts` ห่อ `writeGuard` ให้ในตัวมันเอง ผู้เรียกข้ามไม่ได้
// 🎯 **สองคำถามกลายเป็นคำถามเดียว** · รูปเดียวกับ `lib/engine/db.ts` ที่เป็นไฟล์เดียวที่พิมพ์ชื่อตารางได้
// ✅ `hooks/useBookingFile.ts` ย้ายไปเรียกผ่าน `guardedUpload`/`guardedRemove` แล้ว (P2, 27 ส.ค. 2026)
//    เหลือไฟล์เดียวในรายการ — จุดที่เกณฑ์ `E3-AC4` ปิดได้จริงตามที่ P1 ตั้งเป้าไว้
const ALLOWED_FILES = ["lib/engine/guardedStorage.ts"];

/**
 * 🔴 รายชื่อ root ต้องถูก *ยืนยันกับระบบไฟล์* ไม่ใช่เชื่อว่าถูก (P5 ยิงเจอ · P4 ยืนยันเอง · 29 ส.ค. 2026)
 * เปลี่ยน `"components"` → `"components_MOVED"` root เดียว: 59 ไฟล์หลุดการสแกน · `examined` เหลือ 145
 * ยังผ่าน `> 50` สบาย ๆ · **เขียว 3/3 ทั้งที่ไม่ได้สแกนทั้งโฟลเดอร์**
 * 🎯 เกณฑ์ `> 50` เกิดจากเคส "ทุก root ผิด" จึงมีรูปร่างของเหตุการณ์นั้น ไม่ใช่รูปร่างของช่อง
 */
const ROOTS = ["hooks", "app", "components", "lib"] as const;

const WRITE_METHOD = /\.storage\.from\([^)]*\)\s*\.\s*(upload|remove|update|move|copy)\s*\(/;

function scan(): { offenders: string[]; examined: number } {
  const offenders: string[] = [];
  let examined = 0;
  const root = resolve(process.cwd());
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!["__tests__", "node_modules", ".next"].includes(e.name)) walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      const rel = full.slice(root.length + 1);
      if (ALLOWED_FILES.includes(rel)) continue;
      examined++;
      const src = readFileSync(full, "utf8");
      if (WRITE_METHOD.test(src)) offenders.push(rel);
    }
  };
  for (const r of ROOTS) {
    try {
      walk(resolve(root, r));
    } catch {
      /* ไม่มีโฟลเดอร์ก็ข้าม */
    }
  }
  return { offenders, examined };
}

describe("E3-AC4 — ห้ามมีจุดเขียน Supabase Storage นอก choke point ที่กำหนด", () => {
  it("ด่านต้องทำงานได้จริงก่อน — ไม่งั้นเคสข้างล่างเขียวเพราะไม่เจออะไรเลย", () => {
    // 🔴 **เดิมชี้ที่ `lib/stopPhoto.ts` — ไฟล์ที่ *ตั้งใจให้เปลี่ยน* จึงเป็นจุดยึดชั่วคราว**
    //    พอมันย้ายเข้า `guardedStorage` เคสควบคุมก็แดงทันที ทั้งที่ด่านทำงานถูก
    // 🎯 ย้ายมายึดที่ **ที่ถาวร**: `guardedStorage.ts` คือที่เดียวที่จะมีการเขียนตรงตลอดไป
    //    ถ้าวันหนึ่งมันไม่มี = ไม่มีการเขียน Storage ในโปรเจกต์แล้ว ซึ่งควรเป็นการตัดสินใจ ไม่ใช่อุบัติเหตุ
    const src = readFileSync(resolve(process.cwd(), "lib/engine/guardedStorage.ts"), "utf8");
    expect(
      WRITE_METHOD.test(src),
      "regex ไม่จับ lib/engine/guardedStorage.ts ทั้งที่รู้ว่ามีการเขียนจริง"
    ).toBe(true);
  });

  it("🔴 ตัวเดินไฟล์ต้องเดินถึงไฟล์จริง — ควบคุมข้างบนพิสูจน์ *regex* ไม่ได้พิสูจน์ *ตัวเดิน*", () => {
    /**
     * 🔴 **ควบคุมฝั่งบวกข้างบนอ่าน `guardedStorage.ts` ด้วย `readFileSync` ตรง ๆ — ไม่ผ่าน `walk()`**
     * → ถ้า `walk()` เดินไม่ถึงไฟล์เลยสักไฟล์ (เช่นมีคนเปลี่ยนชื่อโฟลเดอร์ · `try/catch` กลืน `ENOENT`)
     *   `offenders` จะเป็น `[]` **แล้วทั้งไฟล์เขียว 2/2 โดยไม่ได้ตรวจอะไรเลย**
     * · ยิงจริงแล้ว (P4 · 28 ส.ค. 2026): เปลี่ยนรายชื่อโฟลเดอร์เป็นชื่อที่ไม่มีอยู่ → **ยังเขียว 2/2**
     * 🎯 **"ไม่เจอ" กับ "ไม่ได้หา" หน้าตาเหมือนกัน — และควบคุมที่ *ข้ามตัวเดิน* ให้ความมั่นใจปลอม ๆ**
     *   (P3 เจอรูปเดียวกันที่ `E6-AC10`: เขียวเพราะ marker เหลือศูนย์ ไม่ใช่เพราะบันเดิลสะอาด)
     */
    expect(scan().examined, "ตัวเดินไฟล์ไม่เจอไฟล์เลย — โฟลเดอร์ถูกย้าย/เปลี่ยนชื่อ ไม่ใช่ 'ไม่มีผู้ละเมิด'").toBeGreaterThan(50);
  });

  it("🔴 ทุก root ในรายชื่อต้องเป็นโฟลเดอร์จริง — ไม่ใช่ชื่อที่ `walk()` กลืนเงียบ", () => {
    // ถาม *ระบบไฟล์* ว่า "ที่ที่เราบอกว่าจะไป มีจริงไหม" แทนถามผลเดินว่า "เดินได้เยอะไหม"
    // `walk()` อยู่ใน try/catch ที่กลืน ENOENT โดยตั้งใจ → root ที่พิมพ์ผิดจะหายเงียบทีละใบ
    const root = resolve(process.cwd());
    for (const r of ROOTS) {
      expect(
        statSync(resolve(root, r), { throwIfNoEntry: false })?.isDirectory() ?? false,
        `root "${r}" ไม่ใช่โฟลเดอร์ที่มีอยู่จริง — การสแกนข้ามมันไปเงียบ ๆ`,
      ).toBe(true);
    }
  });

  it("ไม่มีไฟล์ไหนนอกรายการที่อนุญาตเรียก storage.from(...).upload/remove/update/move/copy ตรงๆ", () => {
    const { offenders } = scan();
    expect(
      offenders,
      "พบการเขียน Supabase Storage ตรงจากไฟล์นอก choke point — เรียกผ่าน guardedUpload/guardedRemove\n" +
        "  จาก lib/engine/guardedStorage.ts แทน (หรือขยาย ALLOWED_FILES ถ้าเป็นจุดใหม่ที่ตั้งใจจริงๆ พร้อมเหตุผลกำกับ)\n" +
        `  ไฟล์: ${offenders.join(" · ")}`
    ).toEqual([]);
  });
});
