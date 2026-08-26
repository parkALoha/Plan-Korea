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
const ALLOWED_FILES = [
  "hooks/useBookingFile.ts",
  // ครึ่งของ P1 (E3-AC4) — เขียนแยกกันโดยตั้งใจ ไม่คุยระหว่างทาง เพื่อเทียบรูปกันตอนรวม
  // ลบบรรทัดนี้ทิ้งเมื่อ lib/stopPhoto.ts ย้ายเข้า writeGuard เสร็จ
  "lib/stopPhoto.ts",
];

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
    // ยืนยันว่า regex จับรูปแบบจริงได้ ด้วยไฟล์ที่รู้อยู่แล้วว่ามี (lib/stopPhoto.ts ที่ยกเว้นไว้)
    const src = readFileSync(resolve(process.cwd(), "lib/stopPhoto.ts"), "utf8");
    expect(WRITE_METHOD.test(src), "regex ไม่จับ lib/stopPhoto.ts ทั้งที่รู้ว่ามีการเขียนจริง").toBe(
      true
    );
  });

  it("ไม่มีไฟล์ไหนนอกรายการที่อนุญาตเรียก storage.from(...).upload/remove/update/move/copy ตรงๆ", () => {
    const offenders = scan();
    expect(
      offenders,
      "พบการเขียน Supabase Storage ตรงจากไฟล์นอก choke point — ย้ายเข้า hooks/useBookingFile.ts\n" +
        "  (หรือขยาย ALLOWED_FILES ถ้าเป็นจุดใหม่ที่ตั้งใจจริงๆ พร้อมเหตุผลกำกับ)\n" +
        `  ไฟล์: ${offenders.join(" · ")}`
    ).toEqual([]);
  });
});
