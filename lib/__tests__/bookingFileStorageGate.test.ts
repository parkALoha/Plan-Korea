import { readFileSync, readdirSync } from "node:fs";
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

const WRITE_METHOD = /\.storage\.from\([^)]*\)\s*\.\s*(upload|remove|update|move|copy)\s*\(/;

function scan(): string[] {
  const offenders: string[] = [];
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
      const src = readFileSync(full, "utf8");
      if (WRITE_METHOD.test(src)) offenders.push(rel);
    }
  };
  for (const r of ["hooks", "app", "components", "lib"]) {
    try {
      walk(resolve(root, r));
    } catch {
      /* ไม่มีโฟลเดอร์ก็ข้าม */
    }
  }
  return offenders;
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

  it("ไม่มีไฟล์ไหนนอกรายการที่อนุญาตเรียก storage.from(...).upload/remove/update/move/copy ตรงๆ", () => {
    const offenders = scan();
    expect(
      offenders,
      "พบการเขียน Supabase Storage ตรงจากไฟล์นอก choke point — เรียกผ่าน guardedUpload/guardedRemove\n" +
        "  จาก lib/engine/guardedStorage.ts แทน (หรือขยาย ALLOWED_FILES ถ้าเป็นจุดใหม่ที่ตั้งใจจริงๆ พร้อมเหตุผลกำกับ)\n" +
        `  ไฟล์: ${offenders.join(" · ")}`
    ).toEqual([]);
  });
});
