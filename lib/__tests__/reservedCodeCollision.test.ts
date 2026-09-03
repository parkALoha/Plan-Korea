import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEST_COUNTRY_CODES } from "./_helpers";

/**
 * **ด่านเดียวที่กันไม่ให้ `catalogFixtureSweep` ลบประเทศจริง**
 * เจ้าของ: P1-Lead · 3 ก.ย. 2026
 *
 * ## 🔴 ช่องที่ด่านนี้ปิด
 * `catalogFixtureSweep.ts` ลบทุกแถวใต้ `country_id ∈ TEST_COUNTRY_CODES` **ตอนจบทุกรอบเทสต์**
 * · เกณฑ์นั้นปลอดภัยด้วยข้อเท็จจริงข้อเดียว: **ไม่มีประเทศจริงใช้รหัสในช่วง `z*`/`x*`**
 * 🔴 **และข้อเท็จจริงนั้นไม่ได้อยู่ในตัวกวาด — มันอยู่ในหัวคนที่เลือกรหัส**
 *    ⇒ วันที่มีคน seed ประเทศจริงด้วยรหัสที่ชนทะเบียน **ตัวกวาดจะลบมันทิ้งทุกรอบเทสต์
 *      โดยไม่มีอะไรส่งเสียงเลย** · ข้อมูลหาย ไม่ใช่เทสต์แดง
 *
 * ## ✅ ทำไมด่านนี้ผ่านเกณฑ์ ② (แดงเฉพาะการละเมิดจริง)
 * P4 ปฏิเสธด่านที่ *ห้ามพิมพ์รหัสสงวนลงโค้ด* ไปแล้ว เพราะมันแดงใส่ `newCountry.test.ts`
 * ที่พิมพ์รหัสตรง ๆ อย่างถูกต้อง — **ใบนี้ถามคนละคำถาม**
 * ```
 * ใบที่ถูกปฏิเสธ  "มีใครพิมพ์รหัสสงวนไหม"        → แดงใส่คนที่ทำถูก
 * ใบนี้           "มี *ประเทศจริงใน seed* ใช้รหัสสงวนไหม"  → แดงเฉพาะตอนของจริงจะถูกลบ
 * ```
 * 🎯 **การละเมิดของใบนี้คือ *ข้อมูลจริงกำลังจะหาย* — ไม่มีเหตุผลที่ถูกต้องข้อไหนพาไปที่นั่น**
 *
 * ## ⚠️ ทิศทางของความผิดพลาดถูกเลือกไว้
 * ถ้าตัวแจงอ่านไม่ครบ (รูป `insert` แบบอื่น) มันจะ **เห็นน้อยกว่าจริง = ไม่แดง**
 * · นั่นคือทิศที่ปลอดภัยกว่าสำหรับ *ด่านนี้* (ไม่แดงผิด) **แต่แปลว่าด่านอ่อนลงเงียบ ๆ**
 * · ⇒ เคส ① จึงบังคับว่า **ต้องแจงประเทศจริงเจอครบตามที่รู้** ไม่ใช่แค่ "ไม่เจอการชน"
 *   (`TEAM.md` — `0` จาก `grep` แยกไม่ออกระหว่าง *กันไว้แล้ว* กับ *มองไม่เห็น*)
 */
const RESERVED = new Set<string>(Object.values(TEST_COUNTRY_CODES));

/** ดึง `id` ของประเทศจาก `insert into public.catalog_countries (...) values ('xx', …)` */
function seededCountryCodes(): { code: string; file: string }[] {
  const files = execFileSync(
    "git",
    ["ls-files", "--", "supabase-platform/supabase/migrations/*.sql"],
    { encoding: "utf-8" },
  ).trim().split("\n").filter(Boolean);

  const out: { code: string; file: string }[] = [];
  for (const f of files) {
    const sql = readFileSync(f, "utf-8");
    // จับทุกบล็อก `insert into ... catalog_countries ... values` แล้วอ่านจนถึง `;`
    const re = /insert\s+into\s+(?:public\.)?catalog_countries\b[^;]*?\bvalues\b([^;]*);/gis;
    for (const m of sql.matchAll(re)) {
      // แถวหนึ่ง = `('xx', ...)` — เอาสตริงแรกของแต่ละวงเล็บ
      for (const row of m[1].matchAll(/\(\s*'([^']+)'/g)) out.push({ code: row[1], file: f });
    }
  }
  return out;
}

describe("รหัสประเทศสงวน ต้องไม่ชนกับประเทศจริงใน seed", () => {
  const seeded = seededCountryCodes();

  /**
   * 🔴 **ทิศบวก — ถ้าไม่มีเคสนี้ ตัวแจงที่พังสนิทจะทำให้เคส ② เขียวตลอดกาล**
   * `kr`/`vn`/`th`/`jp` เป็นประเทศที่ seed จริงวันนี้ · **ดึงจากไฟล์ ไม่ใช่จากทะเบียนที่ผมเขียน**
   */
  it("① ตัวแจงต้องเห็นประเทศจริงครบ — ไม่ใช่แค่ 'ไม่เจอการชน'", () => {
    const codes = new Set(seeded.map((s) => s.code));
    for (const known of ["kr", "vn", "th", "jp"]) {
      expect(codes.has(known),
        `ตัวแจงมองไม่เห็นประเทศ '${known}' ที่ seed อยู่จริง — ด่านนี้อ่อนลงโดยไม่มีอะไรฟ้อง`)
        .toBe(true);
    }
    expect(codes.size, "แจงได้น้อยผิดปกติ — สงสัยว่ารูป insert เปลี่ยน").toBeGreaterThanOrEqual(4);
  });

  it("② ห้ามมีประเทศใน seed ใช้รหัสที่อยู่ในทะเบียนสงวน", () => {
    const clash = seeded.filter((s) => RESERVED.has(s.code));
    expect(clash.map((c) => `${c.code} (${c.file})`),
      "ประเทศจริงใช้รหัสสงวน → `catalogFixtureSweep` จะลบมันทิ้งทุกรอบเทสต์ โดยไม่มีอะไรส่งเสียง")
      .toEqual([]);
  });

  /**
   * ⚠️ **ทะเบียนต้องไม่ถือชื่อซ้ำ** — รหัสซ้ำสองหน้าที่ทำให้เจ้าของสองคนลบของกันเอง
   * 🔴 และมันเงียบสนิท เพราะ `Object.values` ยังคืนครบ · `Set` ต่างหากที่หด
   */
  it("③ รหัสในทะเบียนต้องไม่ซ้ำกันเอง", () => {
    const all = Object.values(TEST_COUNTRY_CODES);
    expect(RESERVED.size, `มีรหัสซ้ำในทะเบียน: ${all.length} รายการ แต่ไม่ซ้ำ ${RESERVED.size}`)
      .toBe(all.length);
  });
});
