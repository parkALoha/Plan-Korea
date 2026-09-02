import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { stripTsComments } from "./_helpers";

/**
 * **`Q3` ก้าวที่ 1 — โค้ดแอปต้องไม่เขียนตารางแคชเลยสักจุด**
 * เจ้าของไฟล์: P4-QA/Sec (โซน `lib/__tests__/`) · เขียนโดย P1 · 2 ก.ย. 2026
 *
 * ## 🔴 ไฟล์นี้เคยเป็นอย่างอื่น และเหตุผลที่เปลี่ยนสำคัญกว่าตัวเทสต์
 * เดิมชื่อ `upsertNeedsUpdateGrant.test.ts` — ติดตาม **บั๊กที่เปิดอยู่**: โค้ดเรียก `.upsert()`
 * บนตารางที่ไม่มี `update` grant → เขียนไม่ลงและเงียบ · มี `it.fails` กับ ratchet ตรึงไว้ที่ 3 ตาราง
 *
 * 🎯 **บั๊กนั้นถูกปิดด้วยการ *เอาการเขียนออกทั้งหมด* ไม่ใช่ด้วยการเพิ่ม grant** —
 * `route` รันด้วยตัวตนของผู้ใช้ (`createServerSupabase()`) ⇒ **สิทธิ์อะไรที่ route มี ผู้ใช้มีเท่ากัน**
 * ⇒ ให้ route เขียนแคชได้ = ให้ผู้ใช้ยิง PostgREST ใส่ของปลอมลงตารางที่ใช้ร่วมกันได้ตรง ๆ
 *
 * ⚠️ **ตอนการเขียนถูกถอด เทสต์เดิมแดงทั้งสามเคส — และมันถูกทุกเคส:**
 * ตัวควบคุม (`สแกนเจอ .upsert() > 0`) แดงเพราะไม่มีอะไรให้สแกนแล้ว · `it.fails` แดงเพราะบั๊กหาย ·
 * ratchet แดงเพราะขอบเขตหดจาก 3 เป็น 0 · **นั่นคือ ratchet ทำงาน ไม่ใช่ ratchet พัง**
 *
 * ## ทำไมไม่ลบไฟล์ทิ้ง
 * ข้อห้าม *"อย่าเพิ่มการเขียนกลับเข้ามา"* วันนี้อยู่ใน **คอมเมนต์ของ route** เท่านั้น —
 * **คอมเมนต์ไม่ใช่ด่าน** · ไฟล์นี้จึงถูกพลิกเป็นตัวที่บังคับข้อนั้นแทนที่จะหายไปพร้อมบั๊กเดิม
 *
 * ## ⚠️ ขอบเขต — วัดจาก *ไฟล์* ไม่ใช่ *ฐาน*
 * จับได้เฉพาะการเขียนที่เขียนไว้ในซอร์ส · ใครยิง PostgREST ตรงจากเบราว์เซอร์ ด่านนี้มองไม่เห็น
 * 🔴 **สิ่งที่กันเรื่องนั้นคือ *การไม่มี grant* ไม่ใช่ไฟล์นี้** — ไฟล์นี้กันแค่ *เราเผลอเขียนโค้ดเรียกมันเอง*
 */
const ROOT = join(__dirname, "..", "..");

/** ตารางแคชที่ใช้ร่วมกันทั้งระบบ — ห้ามโค้ดแอปเขียนสักใบ */
const CACHE_TABLES = [
  "place_details_cache",
  "place_details_local_cache",
  "place_photo_cache",
  "travel_time_cache",
];

const WRITE_VERBS = "upsert|insert|update|delete";

function appSources(): string[] {
  return execFileSync("git", ["ls-files", "app", "lib"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__"));
}

/** ตารางที่โค้ดแอป **เขียน** (คำกริยาใดก็ได้) · `stripTsComments` ของกลาง ไม่เขียนตัวถอดเอง */
function tablesWritten(): string[] {
  const hits = new Set<string>();
  const re = new RegExp(
    String.raw`\.from\(\s*["'\`]([a-z_]+)["'\`]\s*\)[\s\S]{0,200}?\.(?:${WRITE_VERBS})\(`,
    "g",
  );
  for (const f of appSources()) {
    for (const m of stripTsComments(readFileSync(join(ROOT, f), "utf8")).matchAll(re)) {
      hits.add(m[1]);
    }
  }
  return [...hits].sort();
}

/** ตารางที่โค้ดแอป **อ่าน** — ใช้เป็นตัวควบคุมว่าสแกนเนอร์เห็นตารางแคชจริง */
function tablesRead(): string[] {
  const hits = new Set<string>();
  const re = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)[\s\S]{0,200}?\.select\(/g;
  for (const f of appSources()) {
    for (const m of stripTsComments(readFileSync(join(ROOT, f), "utf8")).matchAll(re)) {
      hits.add(m[1]);
    }
  }
  return [...hits].sort();
}

describe("Q3 ก้าวที่ 1 — โค้ดแอปต้องไม่เขียนตารางแคช", () => {
  /**
   * ⚠️ **ตัวควบคุม ① — ทดสอบ *ตัวจับ* กับตัวอย่างสังเคราะห์ ไม่ใช่กับคลังโค้ด**
   *
   * 🔴 **ทำไมไม่ใช้คลังโค้ดเป็นตัวควบคุมเหมือนฉบับก่อน:** วัดแล้ว — `.from("<สตริง>")` ตามด้วย
   * คำกริยาเขียน มี **0 จุดทั้งรีโป** เพราะชั้น DAL เรียกผ่าน `engineTable(db, name)` ซึ่งชื่อตาราง
   * เป็น **ตัวแปร** → regex ที่อิงสตริงมองไม่เห็นตามนิยาม
   * 🎯 **ถ้าเขียนตัวควบคุมเป็น *"ต้องเจอการเขียนในคลัง > 0"* มันจะแดงตลอดกาลโดยไม่มีบั๊กอะไรเลย**
   *
   * ⚠️ **ตัวควบคุมนี้อ่อนกว่าฉบับก่อนโดยเนื้อแท้ และผมไม่กลบข้อนั้น** — มันพิสูจน์ว่า *รูปแบบถูก*
   * ไม่ได้พิสูจน์ว่า *คลังโค้ดถูกสแกนจริง* · **ตัวควบคุม ② ข้างล่างคือใบที่พิสูจน์ครึ่งหลัง**
   * · 🔴 **ต้องมีทั้งคู่ ใบเดียวไม่พอ** — รูปถูกแต่ไม่ได้อ่านไฟล์ กับ อ่านไฟล์แต่รูปผิด ให้ผลเหมือนกัน
   */
  it("เครื่องวัดทำงาน ①: ตัวจับต้อง match การเขียน และต้องไม่ match การอ่าน", () => {
    const re = new RegExp(
      String.raw`\.from\(\s*["'\`]([a-z_]+)["'\`]\s*\)[\s\S]{0,200}?\.(?:${WRITE_VERBS})\(`,
    );
    expect(re.test('await db.from("place_photo_cache").upsert({ a: 1 })'), "ตัวจับไม่เห็นการเขียน").toBe(true);
    expect(re.test('await db.from("place_photo_cache").insert({ a: 1 })'), "ตัวจับไม่เห็น insert").toBe(true);
    expect(re.test('await db.from("place_photo_cache").select("*")'), "ตัวจับนับการอ่านเป็นการเขียน").toBe(false);
  });

  /**
   * ⚠️ **ตัวควบคุม ②** — พิสูจน์ว่าสแกนเนอร์ *เห็นตารางแคช* จริง
   * 🔴 **ถ้าชื่อตารางพิมพ์ผิดหรือถูก rename เคสหลักจะเขียวเพราะหาไม่เจอ ไม่ใช่เพราะไม่มี**
   * (รูปเดียวกับเคส `MISSING` ของ `E2-AC11` ที่ถามฐาน)
   */
  it("เครื่องวัดทำงาน: สแกนเจอการ *อ่าน* ตารางแคชอย่างน้อยหนึ่งใบ", () => {
    const read = tablesRead().filter((t) => CACHE_TABLES.includes(t));
    expect(
      read,
      `สแกนไม่เจอการอ่านแคชเลย — ชื่อตารางใน CACHE_TABLES อาจพิมพ์ผิดหรือถูก rename\n` +
        `  🔴 ถ้าเป็นแบบนั้น เคสหลักข้างล่างจะเขียวโดยไม่ได้ตรวจอะไร`,
    ).not.toEqual([]);
  });

  it("🔴 ไม่มีโค้ดแอปจุดไหนเขียนตารางแคช", () => {
    const written = tablesWritten().filter((t) => CACHE_TABLES.includes(t));
    expect(
      written,
      "โค้ดแอปเขียนตารางแคช — `route` รันด้วยตัวตนของผู้ใช้ ⇒ สิทธิ์ที่ route มี ผู้ใช้มีเท่ากัน\n" +
        "  ⇒ เปิดทางให้ผู้ใช้ยิง PostgREST ใส่ของปลอมลงตารางที่ทุกคนอ่าน\n" +
        "  ✅ ตัวเขียนที่ถูกต้องคืองานเบื้องหลังที่ถือ `service_role` และอยู่นอก `app/` (`D38`)",
    ).toEqual([]);
  });
});
