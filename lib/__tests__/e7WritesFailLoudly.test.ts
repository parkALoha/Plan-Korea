import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * **`E7` · การเขียนทุกจุดต้องล้ม *ดัง* ไม่ใช่ *เงียบ*** — P4 ชี้ · P1 วัดและเขียน · 3 ก.ย. 2026
 *
 * ## ที่มา: ตัวแก้ `09_completeness` ปิดช่องได้จริง แต่ปลอดภัยด้วยคุณสมบัติที่ไม่มีอะไรค้ำ
 * `09` เป็นก้อน *อ่านล้วน* จึงเงียบได้เมื่อรันด้วย role ที่มองไม่เห็นปลายทาง → ใส่ด่าน role ไปแล้ว
 * · **แต่ P4 ถามต่อว่า *อีก 8 ก้อนล่ะ*** — วันนี้ปลอดภัยเพราะมันเขียนด้วย `insert` เท่านั้น
 *   🔴 **และไม่มีเอกสารหรือด่านใบไหนบังคับข้อนั้นเลย**
 *
 * ## วัดจริงในสนามซ้อม (`scripts/e7-local-rehearsal.sh` · ตาราง `force row level security`)
 * ```
 * ① insert … on conflict do update   → ERROR: new row violates row-level security policy   ดัง ✅
 * ② update … set                     → UPDATE 0                                            เงียบ 🔴
 * ③ delete from                      → DELETE 0                                            เงียบ 🔴
 * ```
 * 🎯 **และ `09` จับ ② ไม่ได้ตามนิยาม** — มันเทียบ *จำนวนแถว* · `update` ที่ no-op ไม่เปลี่ยนจำนวน
 *    → ข้อมูลจะ *ครบจำนวน แต่เนื้อผิด* และทุกด่านจะเขียว
 *
 * ## กติกาที่ไฟล์นี้บังคับ
 * > ก้อน `E7` จะมี `update … set` / `delete from` ได้ **เฉพาะเมื่อมีด่าน role อยู่ในไฟล์เดียวกัน**
 * เพราะ role ที่ข้าม RLS ได้ ไม่มีแถวไหนถูกกรองออก → `0 แถว` แปลว่า *ไม่มีจริง* ไม่ใช่ *มองไม่เห็น*
 *
 * ## ⚠️ สิ่งที่ไฟล์นี้ **ไม่** ทำ
 * ไม่ได้พิสูจน์ว่าก้อนไหนรันด้วย role อะไร — **นั่นเป็นเรื่องของ runbook** ไฟล์นี้บังคับแค่ว่า
 * *ถ้าจะใช้รูปที่เงียบได้ ต้องมีด่านที่ทำให้มันเงียบไม่ได้อยู่ในไฟล์เดียวกัน*
 */
const E7_DIR = join(process.cwd(), "supabase-platform/e7");

/** 🔴 อ่านจากดิสก์ตรง ๆ ไม่ใช่ `git ls-files` — ไฟล์ใหม่ที่ยังไม่ `git add` ต้องถูกมองเห็นด้วย */
const files = readdirSync(E7_DIR).filter((f) => f.endsWith(".sql")).sort();

/** ตัดคอมเมนต์ก่อนสแกน — ไม่งั้นบรรทัดที่ *อธิบาย* รูปต้องห้าม จะถูกนับเป็นการใช้จริง */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

const SILENT_FORMS: ReadonlyArray<readonly [string, RegExp]> = [
  ["update … set", /(^|[^_a-zA-Z])update\s+(?:only\s+)?(?:public\.)?[a-z_]+\s+set\s/i],
  ["delete from", /(^|[^_a-zA-Z])delete\s+from\s/i],
];

const ROLE_GATE = /rolsuper\s+or\s+rolbypassrls/;

describe("E7 — รูปการเขียนที่เงียบได้ ต้องมาคู่กับด่าน role", () => {
  /**
   * 🔴 **จักรวาลว่าง = เคสหายเงียบ** — `it.each` บนรายการว่างผ่านโดยไม่มี error
   * และจำนวนต้องมาจากการนับไฟล์จริง ไม่ใช่เลขที่พิมพ์ไว้เฉย ๆ
   */
  it("จักรวาลต้องไม่ว่าง — ต้องเห็นก้อน E7 ครบ", () => {
    expect(files.length, `ไม่เจอไฟล์ .sql ใน ${E7_DIR} — เคสข้างล่างจะผ่านฟรีทั้งหมด`).toBeGreaterThanOrEqual(11);
    expect(files).toContain("09_completeness.sql");
    expect(files).toContain("00_preflight.sql");
  });

  /**
   * ⚠️ **ตัวควบคุมฝั่งบวก — พิสูจน์ว่าเครื่องวัดจับของผิดได้จริง**
   * 🔴 ถ้าไม่มีเคสนี้ regex ที่ match ไม่ได้เลยจะทำให้ทุกไฟล์ "ผ่าน" และอ่านเหมือนสะอาด
   */
  it("🔴 เครื่องวัดต้องจับรูปที่เงียบได้จริง (ทิศบวก)", () => {
    const mutants = [
      "update place_details_cache set rating = 1.0 where maps_query = 'x';",
      "  UPDATE public.trips SET title = 'x';",
      "delete from trip_stops where id = '1';",
      "  DELETE FROM public.bookings;",
    ];
    for (const m of mutants) {
      const hit = SILENT_FORMS.some(([, re]) => re.test(stripComments(m)));
      expect(hit, `เครื่องวัดมองไม่เห็นรูปนี้: ${m}`).toBe(true);
    }
  });

  /** ⚠️ ตัวควบคุมฝั่งลบ — รูปที่ *ดัง* และคอมเมนต์ ต้องไม่ถูกจับ ไม่งั้นด่านจะแดงใส่คนที่ทำถูก */
  it("ต้องไม่จับรูปที่ล้มดัง และไม่จับคอมเมนต์ (ทิศลบ)", () => {
    const safe = [
      "insert into trip_destinations (trip_id, city_id) values (a, b) on conflict (trip_id, city_id) do update set rank = excluded.rank;",
      "-- ⚠️ ห้ามใช้ update … set ตรงนี้เพราะมันเงียบ",
      "/* delete from x — อธิบายเฉย ๆ */",
      "insert into trips (id) values (a);",
    ];
    for (const s of safe) {
      const hit = SILENT_FORMS.some(([, re]) => re.test(stripComments(s)));
      expect(hit, `ด่านแดงใส่รูปที่ปลอดภัย: ${s}`).toBe(false);
    }
  });

  it.each(files)("%s — ถ้ามีรูปที่เงียบได้ ต้องมีด่าน role ในไฟล์เดียวกัน", (name) => {
    const raw = readFileSync(join(E7_DIR, name), "utf8");
    const code = stripComments(raw);
    const found = SILENT_FORMS.filter(([, re]) => re.test(code)).map(([label]) => label);
    if (found.length === 0) return;
    expect(
      ROLE_GATE.test(raw),
      `${name} ใช้ ${found.join(" · ")} ซึ่ง **ล้มเงียบ** ใต้ role ที่ถูกกรอง (วัดแล้ว: UPDATE 0 / DELETE 0 ไม่ใช่ error)\n` +
        `→ 09_completeness จับไม่ได้ เพราะมันเทียบจำนวนแถว และ no-op ไม่เปลี่ยนจำนวน\n` +
        `→ ใส่ด่าน role แบบเดียวกับก้อน 6/9 หรือเปลี่ยนไปใช้ insert … on conflict do update (ล้มดัง)`,
    ).toBe(true);
  });
});
