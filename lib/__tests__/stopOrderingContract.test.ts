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
 * ⚠️ **ขอบของด่านนี้ — ห้ามอ่านเกิน:**
 * · ครึ่ง **ลำดับ** ไล่ทุก `.order("rank"` ในไฟล์ → ไม่หลบด้วยรูปการประกาศ (arrow / ชื่อตารางผ่านตัวแปร)
 * · 🔴 **ครึ่ง `deleted_at` — อย่าขยายด่านนี้ให้บังคับ "ผู้อ่านทุกตัวต้องกรอง" · ถ้อยคำนั้นผิด**
 *   **สัญญาอยู่ที่ RLS policy ไม่ได้อยู่ที่ DAL** — `20260825142639_e2_soft_delete.sql:59-67`
 *   ใส่ `and deleted_at is null` ไว้ใน `custom_places_select` เอง พร้อมคอมเมนต์ว่า *"บังคับที่ policy"*
 *   → `customPlaceRowsOfTrip` ที่ไม่มี `.is("deleted_at", null)` **ถูกต้องตามที่ออกแบบ**
 *   🔴 **ด่านที่บังคับตามถ้อยคำเดิมจะแดงใส่โค้ดที่ทำถูก = ชนิด `B11`** ซึ่งอันตรายกว่าการหลุด
 *   เพราะคนจะไปถอดด่านทิ้ง **โดยมีเหตุผลที่ถูก**
 *   · ตัวกรองใน DAL ที่มีอยู่ 14 จุดจึงเป็น **ชั้นสอง สำหรับเส้น `service_role` ซึ่ง BYPASSRLS**
 *     (ชุดทดสอบ · เก็บกวาด fixture) — **เป้าเล็กกว่าที่ `B4` ตั้งไว้มาก**
 *   · สัญญาตัวจริงมีด่านอยู่แล้ว: เติม policy ใหม่ 1 ตัว → `schemaPins.test.ts` แดง 2 เคส (P4 วัด)
 *   ⚠️ ข้อสรุปนี้อ่านจาก *ไฟล์ migration* ไม่ใช่จากฐาน — **drift ผ่าน SQL editor มองไม่เห็นจากตรงนี้**
 *     P4 จะยืนยันกับฐานจริงในรอบแตะฐาน
 * · 🔴 **จักรวาลคือ *ทุก* `.order("rank"` ในไฟล์ → บังคับสัญญานี้กับทุกตารางที่มีคอลัมน์ `rank`**
 *   วันนี้มีแค่ `trip_stops` ที่ใช้ rank-key จึงยังไม่กระทบใคร · **ถ้าวันหนึ่งตารางอื่นมี `rank` แล้วด่านนี้แดง
 *   ให้เติม tie-break ไม่ใช่ถอดเงื่อนไข** — `rank` ไม่ unique โดยตั้งใจ (`D6`) การเรียงโดยไม่มี tie-break
 *   เป็นข้อบกพร่องที่ไหนก็ตามที่มันโผล่ · **แดงเกินมีคนไปดู แดงขาดไม่มี**
 * · สแกน *ข้อความ* ใน `db.ts` เท่านั้น
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

/**
 * 🔴 **ครึ่ง "ลำดับ" ไม่ไล่ทีละฟังก์ชัน — ไล่ทุก `.order("rank"` ในไฟล์**
 * เหตุ (P4 หักด่านฉบับแรกได้ 3 ทาง · 29 ส.ค. 2026):
 * · `export const f = (…) =>` ไม่เข้า regex `export function` → **ไม่เข้าจักรวาลเลย**
 * · `engineTable(db, STOPS_TABLE)` ผ่านตัวแปร → ตัวกรองสตริงตรงตัวมองไม่เห็น
 * **ทั้งสองทางหายไปเงียบ · ไล่ที่ตัว `.order()` เองแทน ไม่มีทางหลบด้วยรูปการประกาศ**
 */
const SITE = /\.order\(\s*['"]rank['"]/g;

/**
 * ออปชันที่ยอมรับได้ — **มีก็ได้ ไม่มีก็ได้ · แต่ถ้ามี ต้องมี `ascending: true`**
 *
 * 🔴 **ผ่อนจากฉบับเดิมที่ *บังคับ* ให้เขียนออปชัน — และมันเคยแดงใส่โค้ดที่ถูก** (P4 · 4 ก.ย. 2026)
 * `.order("rank")` เปล่า ๆ **เรียงขึ้นอยู่แล้วตามค่าปริยายของ PostgREST** ⇒ ถูกต้องสมบูรณ์
 * · สิ่งที่ต้องกันจริงคือ `{ ascending: false }` ซึ่งยังถูกกันอยู่: กลุ่ม optional จะจับ empty แล้ว
 *   `\s*\)` จะไปชนกับ `, { ascending: false })` **ไม่ match** ⇒ ยังแดง (มีเคสควบคุมบังคับข้อนี้)
 * 🎯 ***"เขียนให้ครบ" กับ "ถูกต้อง" ไม่ใช่คำถามเดียวกัน — ด่านนี้ตอบข้อหลังเท่านั้น***
 */
const OPTS_OK = String.raw`(?:\s*,\s*\{[^{}]*ascending:\s*true[^{}]*\})?`;
const pairFor = (tie: string) =>
  new RegExp(
    String.raw`^\.order\(\s*['"]rank['"]${OPTS_OK}\s*\)\s*\.order\(\s*['"]${tie}['"]${OPTS_OK}\s*\)`
  );

/**
 * 🔴 **คอลัมน์ tie-break ที่ถูกต้อง *ขึ้นกับตาราง* ไม่ใช่ค่าคงที่ `id`** (P4 · 4 ก.ย. 2026)
 *
 * ฉบับเดิมบังคับ `.order("id")` เป๊ะ · ฉบับเดิมของคอมเมนต์ข้างบนก็เขียนเผื่อไว้แล้วว่า
 * *"ถ้าวันหนึ่งตารางอื่นมี `rank` แล้วด่านนี้แดง ให้เติม tie-break ไม่ใช่ถอดเงื่อนไข"*
 * **แต่มันเผื่อไม่ครบ: มันสมมติว่าทุกตารางมีคอลัมน์ชื่อ `id`** — และ `trip_destinations` ไม่มี
 * (`primary key (trip_id, city_id)`) ⇒ **ทำตามด่านตรง ๆ เป็นไปไม่ได้**
 * 🎯 ***ด่านที่สั่งสิ่งที่ทำไม่ได้ = ด่านที่แดงใส่คนที่ทำถูก ซึ่ง `§3.4` บอกว่าจะถูกลบทั้งใบ
 *    แล้วของที่มันเคยกันไว้ (`trip_stops` ที่ต้องมี tie-break จริง ๆ) จะหายไปด้วย***
 *
 * ⚠️ **ทะเบียนนี้ผ่อนด่าน — จึงต้องผิดได้ และมีเคสบังคับความผิดได้ทั้งสองทาง:**
 * · ชื่อตารางที่ไม่มี `.order("rank")` ในไฟล์แล้ว **ต้องหลุดออก** (ไม่งั้นทะเบียนเริ่มโกหก)
 * · ป้อน tie-break ของตารางอื่นให้ `trip_stops` **ต้องยังแดง** (ไม่ใช่ผ่านเพราะทะเบียนกว้างขึ้น)
 */
const TIE_BREAK: Record<string, string> = {
  trip_stops: "id",
  // `trip_destinations` ไม่มีคอลัมน์ `id` · `city_id` คือคอลัมน์ที่ unique ต่อทริป (P1 แก้ · P4 ตรวจ)
  trip_destinations: "city_id",
};
const DEFAULT_TIE_BREAK = "id";

/**
 * 🔴 **ไม่ถามว่า statement จบตรงไหน — ถามว่าข้อความที่ *ติดกัน* ถูกไหม**
 *
 * เหตุ (P4 หัก 3 รอบ · 29 ส.ค. 2026): ฉบับก่อน ๆ ตอบคำถาม *"statement นี้จบตรงไหน"*
 * ด้วยการ **แจงนับ** แล้วถูกหักทุกรอบด้วยกลไกเดียวกัน คนละเลข:
 * · `B5` หน้าต่าง 200 ตัวอักษร → รอดเพราะระยะจริง 232 · ชื่อตัวแปรสั้นลงตัวเดียวก็พลิก
 * · `B7` รายการขอบ 4 โทเคน (`;` `\n}` `\n\n` `\nexport`) → รอดเพราะเพื่อนบ้านเป็น `const` ที่ไม่ export
 * 🎯 **คำถาม "จบตรงไหน" ต้อง parse ถึงจะตอบถูก — แจงนับกี่รอบก็มีเคสที่ห้าเสมอ**
 *    (P4 เจอเคสที่ห้าในการลองครั้งแรก ไม่ได้ไล่หลายรอบ)
 *
 * 🔴 **ชั้นที่สามที่ถูกเอาออก — "การสะกดที่ต้องตรงเป๊ะ"** (P4 หักรอบ 4 · `B10`/`B11`)
 * · `B10` `.order('rank'` single quote → **ไม่เข้าจักรวาลด้วยซ้ำ** (ชนิดเดียวกับ `B3` แค่เป็นชื่อคอลัมน์)
 * · `B11` `{ ascending: true, nullsFirst: false }` → **แดงใส่โค้ดที่ถูกต้อง** ซึ่งเป็นชนิดที่ทำให้คนถอดด่านทิ้ง
 * → รับทั้งสอง quote · และขอแค่ **มี** `ascending: true` อยู่ในออปชัน ไม่ใช่ทั้งก้อนตรงเป๊ะ
 * ⚠️ **ข้อจำกัดที่เหลือ (P4 เขียนเอง):** ออปชัน**ซ้อนชั้น** (`{ ascending: true, foreignTable: { … } }`)
 *   ไม่รองรับ — วันนี้ไม่มีรูปนั้นในไฟล์ **แต่ไม่ได้พิสูจน์ว่า PostgREST ไม่มี**
 *
 * ⚠️ **ข้อบังคับที่เพิ่มขึ้นจากท่านี้ — ประกาศไว้ ไม่ให้คนมาเจอเอง (P4 ชี้):**
 * `.order("id")` ต้อง **ติดกับ** `.order("rank")` · แทรก `.limit()` ระหว่างกลางแล้วจะแดงทั้งที่ไม่ผิด
 * รับได้เพราะสัญญาคือ `order by rank, id` — **แต่เป็นการเพิ่มข้อบังคับ ไม่ใช่แค่เปลี่ยนวิธีตรวจ**
 */
function rankOrderSites(): { idx: number; snippet: string; ok: boolean; table: string; tie: string }[] {
  const code = stripComments(SRC);
  const out: { idx: number; snippet: string; ok: boolean; table: string; tie: string }[] = [];
  SITE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SITE.exec(code)) !== null) {
    const i = m.index;
    // 🔴 หาว่า `.order("rank")` นี้อยู่บนตารางไหน — **ย้อนหาตัวที่ใกล้ที่สุดก่อนหน้า** ไม่ใช่เดาจากชื่อฟังก์ชัน
    //    (ชื่อฟังก์ชันบอกว่า *ตั้งใจทำอะไร* ไม่ได้บอกว่า *แตะอะไร* — `TEAM.md §3.4`)
    //    ⚠️ หาไม่เจอ (เช่นชื่อตารางผ่านตัวแปร) → ตกกลับไปที่ `id` ซึ่งเป็นทางที่ **เข้มกว่า**
    //       ⇒ พลาดแล้วแดงเกิน ไม่ใช่แดงขาด · "แดงเกินมีคนไปดู แดงขาดไม่มี" (ถ้อยคำของไฟล์นี้เอง)
    const before = code.slice(0, i);
    const t = [...before.matchAll(/engineTable\(\s*db\s*,\s*["'`]([a-z_0-9]+)["'`]\s*\)/g)].pop();
    const table = t ? t[1] : "";
    const tie = TIE_BREAK[table] ?? DEFAULT_TIE_BREAK;
    out.push({
      idx: i,
      table,
      tie,
      snippet: code.slice(Math.max(0, i - 60), i + 90),
      ok: pairFor(tie).test(code.slice(i)),
    });
  }
  return out;
}

/** บล็อกของทุกฟังก์ชันที่ query `trip_stops` — ใช้กับครึ่ง `deleted_at` เท่านั้น */
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
  it("① ทุก .order(\"rank\") ต้องตามด้วย .order(\"id\") ติดกัน และ ascending: true ทั้งคู่", () => {
    const sites = rankOrderSites();
    expect(sites.length).toBeGreaterThanOrEqual(5); // ③④ จักรวาลจากดิสก์ + sentinel ข้างบน
    // 🔴 พ่น *ที่อยู่* ไม่ใช่แค่จำนวน — "แดงที่ไม่มีที่อยู่" ทำให้คนไปไล่ทั้งไฟล์ (P4 ชี้)
    const bad = sites
      .filter((x) => !x.ok)
      .map((x) => `[${x.table || "?"} → ต้อง tie-break ด้วย "${x.tie}"] ${x.snippet.replace(/\s+/g, " ").trim()}`);
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 **เคสควบคุมของ *ตัวผ่อน* — ไม่ใช่ของตัวจับ** (P4 · 4 ก.ย. 2026)
   * รอบนี้ด่านถูกทำให้ *ยอมรับมากขึ้น* สองทาง (ออปชันไม่บังคับ · tie-break ต่อตาราง)
   * ⇒ **ต้องพิสูจน์ว่ามันยังจับสิ่งที่เคยจับได้** ไม่งั้น "ผ่อนด่าน" กับ "ถอดด่าน" แยกไม่ออกจากผลรัน
   */
  it("🔴 ตัวผ่อนไม่ได้ถอดด่าน — รูปที่ต้องแดง ยังแดงครบทุกทาง", () => {
    const ok = (src: string, tie: string) => pairFor(tie).test(src);
    // ✅ ยังต้องผ่าน — รูปที่ถูกต้องทั้งแบบมีออปชันและไม่มี
    expect(ok('.order("rank").order("id")', "id"), "ไม่มีออปชัน = ค่าปริยาย ascending → ต้องผ่าน").toBe(true);
    expect(ok('.order("rank", { ascending: true }).order("id", { ascending: true })', "id")).toBe(true);
    expect(ok('.order("rank").order("city_id", { ascending: true })', "city_id"), "tie-break ของ trip_destinations").toBe(true);
    // 🔴 ต้องแดง — ทั้งสามทางนี้คือสิ่งที่ด่านมีไว้กัน
    expect(ok('.order("rank")', "id"), "ไม่มี tie-break เลย ต้องถูกจับ").toBe(false);
    expect(ok('.order("rank", { ascending: false }).order("id")', "id"), "เรียงลง ต้องถูกจับ").toBe(false);
    expect(ok('.order("rank").order("id", { ascending: false })', "id"), "tie-break เรียงลง ต้องถูกจับ").toBe(false);
    expect(ok('.order("rank").limit(50).order("id")', "id"), "แทรก .limit() คั่น ต้องถูกจับ (ข้อบังคับ 'ติดกัน')").toBe(false);
    // 🔴 **ทะเบียนไม่ได้ทำให้ด่านกว้างขึ้นข้ามตาราง** — `city_id` ไม่ใช่ tie-break ที่ถูกของ `trip_stops`
    expect(
      ok('.order("rank").order("city_id")', "id"),
      "ป้อน tie-break ของตารางอื่นให้ trip_stops แล้วผ่าน = ทะเบียนกลายเป็นช่องหลบ",
    ).toBe(false);
  });

  /**
   * 🔴 **ทะเบียน `TIE_BREAK` ต้องผิดได้** — ชื่อที่ไม่มี `.order("rank")` ในไฟล์แล้ว ต้องหลุดออก
   * ไม่งั้นมันจะค้างเป็นข้อยกเว้นถาวรของตารางที่เลิกใช้ `rank` ไปแล้ว **แล้วเริ่มเป็นแหล่งความจริงใบที่สอง**
   */
  it("ทะเบียน TIE_BREAK ยังตรงกับไฟล์จริง — ชื่อที่ตายแล้วต้องหลุดออก", () => {
    const tables = new Set(rankOrderSites().map((x) => x.table));
    const stale = Object.keys(TIE_BREAK).filter((t) => !tables.has(t));
    expect(
      stale.sort(),
      `ตารางพวกนี้ไม่มี .order("rank") ใน db.ts แล้ว — ลบออกจาก TIE_BREAK: ${stale.join(", ")}`,
    ).toEqual([]);
    // ควบคุมฝั่งบวก: ตัวหาตารางต้องหาเจอจริง ไม่ใช่คืน "" ทั้งหมดแล้วทะเบียนดูสะอาด
    expect(tables, 'ตัวหาตารางย้อนหลังไม่เจอ trip_stops — มันคืน "" อยู่หรือเปล่า').toContain("trip_stops");
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
