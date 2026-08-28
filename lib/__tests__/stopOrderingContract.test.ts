import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `E2-AC8` — **สัญญาเรื่องลำดับของ `trip_stops` ใน DAL**
 *
 * 🔴 ทำไมต้องมีไฟล์นี้: `db.ts:320` เขียนคำว่า **"ห้าม"** ไว้เองว่า
 * *"ห้ามมีทางเรียกที่ได้ผลลัพธ์นี้โดยไม่มี `deleted_at is null` + `order by rank, id`"*
 * **แล้วไม่มีด่านสักตัว** — P4 ถอด tie-break ออกจาก DAL ทั้งสองจุดเมื่อ 29 ส.ค. 2026
 * แล้ว **เทสต์ทั้ง 803 เคสเขียวหมด**
 *
 * 🎯 ***ข้อห้ามที่เขียนเป็นคอมเมนต์ คือข้อห้ามที่บังคับใช้ด้วยความหวังว่าคนถัดไปจะอ่าน***
 *
 * อาการเวลาพัง: `rank` ไม่ unique โดยตั้งใจ (`D6`) → ขาด tie-break แล้ว
 * **สองเครื่องได้ลำดับจุดแวะคนละแบบเมื่อ rank ชนกัน** · เห็นด้วยตายาก และโทษเน็ตได้ง่าย
 *
 * ⚠️ **ขอบของด่านนี้ — ห้ามอ่านเกิน:** สแกน *ข้อความ* ใน `db.ts` เท่านั้น
 * ไม่ได้พิสูจน์ว่าฐานคืนแถวตามลำดับนั้นจริง และไม่เห็นคิวรีที่เขียนนอกไฟล์นี้
 * · `scheduleBounds.test.ts` **ทดสอบผู้ใช้ของสัญญา ไม่ได้ทดสอบว่าใครทำสัญญาให้**
 *   (คอมเมนต์ในไฟล์นั้นเขียนเองว่า *"ไม่เรียงซ้ำโดยตั้งใจ"*) — จึงพึ่ง DAL 100%
 */

const DB_PATH = resolve(__dirname, "../engine/db.ts");
const SRC = readFileSync(DB_PATH, "utf8");

/**
 * ฟังก์ชันที่ **จงใจ** คืน tombstone ด้วย — ต้องไม่มี `deleted_at is null`
 * 🔴 ทะเบียนนี้ต้อง *ผิดได้*: ถ้าชื่อในนี้ไม่มีในไฟล์แล้ว ต้องแดง ไม่ใช่เงียบ
 */
const RETURNS_TOMBSTONES = ["dayStopsIncludingDeleted"] as const;

/** ตัดคอมเมนต์ออกก่อนสแกน — ไม่งั้นตัวอย่างในคอมเมนต์จะถูกนับเป็นโค้ด */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** บล็อกของทุกฟังก์ชันที่ query `trip_stops` — จักรวาลมาจาก *ไฟล์บนดิสก์* */
function stopQueryBlocks(): { name: string; body: string }[] {
  const code = stripComments(SRC);
  const out: { name: string; body: string }[] = [];
  const fn = /export function (\w+)\s*\([\s\S]*?\n}/g;
  let m: RegExpExecArray | null;
  while ((m = fn.exec(code)) !== null) {
    const b = m[0];
    if (!b.includes('engineTable(db, "trip_stops")') || !b.includes(".select(")) continue;
    // 🔴 ตัดการ *เขียน* ออก — insert/update คืนแถวที่เพิ่งเขียน ลำดับไม่มีความหมาย
    //    (ตัวกรองนี้มีเคสพิสูจน์ว่ามันตัดถูกจริงข้างล่าง ไม่ใช่เชื่อว่าตัดถูก)
    if (/\.(insert|update|delete|upsert)\(/.test(b)) continue;
    out.push({ name: m[1], body: b });
  }
  return out;
}

describe("E2-AC8 — DAL ต้องคืน trip_stops เรียง (rank, id) เสมอ", () => {
  const blocks = stopQueryBlocks();

  // ── ③ ไม่มีของให้ตรวจ = แดง ────────────────────────────────────────────
  // ④ จักรวาลมาจากคนละแหล่งกับผลสแกน: sentinel เป็นชื่อ export ที่รู้ว่ามี
  //    ถ้าไฟล์ถูกย้าย/เปลี่ยนชื่อ/regex พัง → ตกที่นี่ ไม่ใช่ผ่านเพราะ "ไม่เจอผู้ละเมิด"
  it("③④ ตัวสแกนเห็นไฟล์จริงและแจงฟังก์ชันออก", () => {
    expect(SRC.length).toBeGreaterThan(10_000);
    expect(SRC).toContain("export function dayStops(");
    expect(blocks.length).toBeGreaterThanOrEqual(5);
  });

  // 🔴 พิสูจน์ว่า *ตัวกรอง* ทำงาน ไม่ใช่แค่ว่ามันหาเจอ
  //    ถ้าตัวกรองพัง ตัวเขียนจะหลุดเข้ามาแล้วแดงด้วยเหตุผลที่ผิด → ชี้คนไปแก้ของที่ไม่ได้ผิด
  it("③ ตัวกรองตัดฟังก์ชันเขียนออกจริง", () => {
    const names = blocks.map((b) => b.name);
    for (const w of ["insertStop", "updateStop", "updateStopInDay"]) {
      expect(SRC).toContain(`export function ${w}(`); // ยังมีอยู่ในไฟล์
      expect(names).not.toContain(w);                  // แต่ต้องไม่อยู่ในชุดที่ตรวจลำดับ
    }
  });

  // ── ① แดงเมื่อละเมิด ──────────────────────────────────────────────────
  it.each(stopQueryBlocks())("① $name — order by rank แล้วต่อด้วย id", ({ body }) => {
    const rank = body.indexOf('.order("rank"');
    const id = body.indexOf('.order("id"');
    expect(rank).toBeGreaterThan(-1);
    expect(id).toBeGreaterThan(rank); // tie-break ต้องมา *หลัง* rank ไม่ใช่แค่มีอยู่
  });

  it.each(stopQueryBlocks())("① $name — deleted_at is null เว้นตัวที่ตั้งชื่อว่าคืน tombstone", ({ name, body }) => {
    const intentional = (RETURNS_TOMBSTONES as readonly string[]).includes(name);
    expect(body.includes('.is("deleted_at", null)')).toBe(!intentional);
  });

  // 🔴 ทะเบียนต้องผิดได้ — ชื่อที่เลิกมีแล้วต้องหลุดออก ไม่ใช่ค้างเป็นข้อยกเว้นถาวร
  it("ทะเบียนข้อยกเว้นยังตรงกับไฟล์จริง", () => {
    for (const n of RETURNS_TOMBSTONES) expect(SRC).toContain(`export function ${n}(`);
  });

  // ── ② เคสควบคุมฝั่งบวก — ตัวตรวจจับของผิดได้จริงไหม ───────────────────
  it("② ตัวตรวจจับการถอด tie-break และการถอด deleted_at ได้จริง", () => {
    const ok = `export function probe(db: Db) {
      return engineTable(db, "trip_stops").select("*").is("deleted_at", null)
        .order("rank", { ascending: true }).order("id", { ascending: true });\n}`;
    const noTieBreak = ok.replace('.order("id", { ascending: true })', "");
    const noDeleted = ok.replace('.is("deleted_at", null)', "");

    expect(ok.indexOf('.order("id"')).toBeGreaterThan(ok.indexOf('.order("rank"'));
    expect(noTieBreak.includes('.order("id"')).toBe(false);   // ถอดแล้วต้องหายจริง
    expect(noDeleted.includes('.is("deleted_at", null)')).toBe(false);
  });
});
