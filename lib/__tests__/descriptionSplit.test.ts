import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationFiles, stripComments } from "./_helpers";

/**
 * `Q6` — คำบรรยายแยกตามภาษาแล้ว · **แต่แยกได้ไม่ครบ และนี่คือที่ที่ความไม่ครบถูกตรึงไว้**
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## สถานะจริง ไม่ใช่สถานะที่อยากให้เป็น
 * ```
 * catalog_places.description  →  ✅ ย้ายเข้า catalog_place_descriptions แล้ว · drop คอลัมน์แล้ว
 * custom_places.description   →  🔴 ตารางใหม่มีแล้ว **แต่คอลัมน์เดิมยังอยู่**
 * ```
 * เหตุผลที่ยังไม่ drop: `hooks/useCustomPlaces.tsx` ทำ `insert(newPlace)` ด้วยอ็อบเจกต์ทั้งก้อน
 * ซึ่งมี `description` อยู่ใน type → **drop = insert พังทันที**
 *
 * ## 🔴 ทำไมต้องมีไฟล์นี้ แทนที่จะเขียนว่า "เดี๋ยวค่อย drop"
 * *"เดี๋ยวค่อย"* ที่ไม่มีเงื่อนไขคือ `D73` ตัวถัดไป — ข้อยกเว้นที่อยู่นานกว่าเหตุผลของมัน
 * และคืนที่แล้วทีมนี้เจอมันซ้ำจนยกเป็นคลาส · **เงื่อนไขจึงต้องเป็นของที่รันได้ ไม่ใช่ของที่จำได้**
 *
 * 🎯 **เคสข้างล่างผูกสองสิ่งเข้าด้วยกัน: คอลัมน์ในฐาน กับ บรรทัดในโค้ด**
 * วันที่ใครแก้ข้างใดข้างหนึ่ง อีกข้างจะแดงพร้อมบอกว่าต้องแก้อะไรคู่กัน
 * — รูปเดียวกับ `D81` ⑦.๕ (*DDL กับผู้ใช้ของมันต้องอยู่คอมมิตเดียวกัน*)
 */

const HOOK = join(__dirname, "../../hooks/useCustomPlaces.tsx");

/** คอลัมน์ที่ยังมีอยู่จริงหลังเดิน migration ครบทุกไฟล์ */
function columnsOf(table: string): Set<string> {
  const cols = new Set<string>();
  for (const sql of migrationFiles.map((f) => stripComments(readFileSync(f, "utf8")))) {
    const created = new RegExp(
      `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\)\\s*;`,
      "i"
    ).exec(sql);
    if (created) {
      for (const piece of created[1].split("\n")) {
        const m = /^\s{2}(\w+)\s+\w/.exec(piece);
        if (m && !/^(primary|foreign|unique|check|constraint|exclude)$/i.test(m[1])) cols.add(m[1]);
      }
    }
    const re = new RegExp(`alter\\s+table\\s+(?:public\\.)?${table}\\b([\\s\\S]*?);`, "gi");
    for (const stmt of sql.matchAll(re)) {
      for (const m of stmt[1].matchAll(/\badd\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)) cols.add(m[1]);
      for (const m of stmt[1].matchAll(/\bdrop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi)) cols.delete(m[1]);
    }
  }
  return cols;
}

describe("Q6 — คำบรรยายแยกภาษา · และครึ่งที่ยังไม่แยกต้องไม่เงียบ", () => {
  it("🔴 `catalog_places.description` ต้องหายไปแล้ว — ห้ามมีใครเติมกลับ", () => {
    // เติมกลับ = สองที่ตอบคำถามเดียวกัน ซึ่งคือสิ่งที่ `Q6` มีไว้ปิด (`D69`/`P-51` รูปเดิม)
    expect(columnsOf("catalog_places")).not.toContain("description");
  });

  it("ตารางคำบรรยายของคลังกลางมีอยู่จริง", () => {
    expect(columnsOf("catalog_place_descriptions").size).toBeGreaterThan(0);
    expect([...columnsOf("catalog_place_descriptions")]).toContain("locale");
  });

  it("ตารางคำบรรยายของคลังทริปมีอยู่จริง", () => {
    expect([...columnsOf("custom_place_descriptions")]).toContain("locale");
  });

  /**
   * 🔴 **เคสที่มีค่าที่สุดในไฟล์นี้** — ตรึง *ความไม่ครบ* ไว้กับ *เหตุผลของมัน*
   *
   * ไม่ได้บอกว่า "ห้าม drop" · บอกว่า **drop ได้เมื่อโค้ดที่พึ่งมันเลิกพึ่งแล้ว — ในคอมมิตเดียวกัน**
   * ทั้งสองทิศแดง:
   * · drop คอลัมน์ทิ้งโดยที่ hook ยังส่ง `description` → `insert` จะพังจริงตอนรัน **เคสนี้แดงก่อน**
   * · แก้ hook ให้เลิกส่งแล้วปล่อยคอลัมน์ค้าง → เคสนี้แดง เตือนว่าถึงเวลา drop แล้ว
   */
  it("🔴 `custom_places.description` กับ `useCustomPlaces.tsx` ต้องเลิกพึ่งกันพร้อมกัน", () => {
    const columnExists = columnsOf("custom_places").has("description");
    const hookSendsIt = /insert\(newPlace\)/.test(readFileSync(HOOK, "utf8"));

    expect(
      columnExists,
      hookSendsIt
        ? "🔴 `useCustomPlaces.tsx` ยัง `insert(newPlace)` ซึ่งมี `description` อยู่ใน type\n" +
          "   → `custom_places.description` ยัง drop ไม่ได้ · เติมกลับก่อน แล้วค่อยแก้ hook พร้อมกัน"
        : "🟢 hook เลิกส่ง `description` แล้ว → **ถึงเวลา drop `custom_places.description`**\n" +
          "   ย้ายค่าเดิมเข้า `custom_place_descriptions` ก่อน แล้ว drop ในคอมมิตเดียวกับที่แก้ hook\n" +
          "   (เงื่อนไขนี้เขียนไว้ที่ `20260826082858_e2_q6_localized_descriptions.sql`)"
    ).toBe(hookSendsIt);
  });
});
