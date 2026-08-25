import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `E2-AC6` — **ทุกคอลัมน์ของ 14 ตารางเดิม ต้องมีปลายทางใน [`column-map.md`](../../docs/engine/column-map.md)**
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## 🔴 ทำไมไฟล์นี้ถึงต้องมี ทั้งที่ `column-map.md` เขียนว่าตรวจแล้ว
 *
 * หัวไฟล์นั้นเขียนไว้เองว่า:
 * > *"ตัวสร้างไฟล์นี้ปฏิเสธที่จะออกผล ถ้ามีคอลัมน์ไหนไม่มีคำตอบ … รอบแรกมันจับความผิดของผมเอง **10 จุด**"*
 *
 * **ตัวสร้างนั้นไม่เคยถูก commit** — มันเป็นสคริปต์ครั้งเดียวในเซสชันที่จบไปแล้ว
 * 🎯 **ด่านที่มีอยู่แค่ในความจำของเซสชันที่ตายไปแล้ว ไม่ต่างอะไรกับไม่มีด่าน**
 * และ `111/111` ที่เหลืออยู่คือ**ตัวเลข** ไม่ใช่**การตรวจ** — `D82` เคสที่ห้าพูดเรื่องนี้ตรง ๆ:
 * > *"ตัวเลขที่ถูก กับตัวเลขที่บอกขอบเขตครบ เป็นคนละคุณสมบัติ"*
 *
 * ## 🔴 และเลขคาดหวังในไฟล์นี้ **ห้าม**มาจาก `column-map.md` (`P-63`)
 *
 * คืนเดียวกับที่เขียนไฟล์นี้ ผมเพิ่งพลาดรูปนั้นมาสด ๆ: เขียน `do $verify$` ตรวจ `grant`
 * โดยเอาเลขคาดหวังมาจากลิสต์เดียวกับที่พิมพ์ผิด → **เขียว ทั้งที่รูเปิดอยู่**
 * → ที่นี่จึง **แยกสองแหล่งจากกันจริง ๆ**:
 * ```
 * ของที่ถูกตรวจ  : docs/engine/column-map.md   (คำตอบที่คนเขียน)
 * ของที่ใช้ตรวจ  : supabase/migrations/*.sql   (สคีมาเดิมที่รันจริง)
 * ```
 * · ⚠️ **`supabase/migrations/` คือ migration ของเว็บทริปเดิม ไม่ใช่ของแพลตฟอร์ม** — อ่านอย่างเดียว ไม่แตะ
 *
 * ## ⚠️ ข้อจำกัดที่ไฟล์นี้แก้ไม่ได้ และห้ามอ่านว่าแก้แล้ว
 * ตัวเลขมาจาก **ไฟล์ migration ไม่ใช่ DB จริง** · `PLAN.md §5` ให้ผู้ใช้ copy-paste รัน SQL เอง
 * **สคีมาจริงต่างจากไฟล์ได้โดยไม่มีอะไรฟ้อง** → `E7` ต้อง `\\d` ทุกตารางบน DB จริงก่อนแปลงอะไร
 */

const LEGACY_DIR = join(__dirname, "../../supabase/migrations");
const MAP_PATH = join(__dirname, "../../docs/engine/column-map.md");

const CONSTRAINT_START = /^(primary|foreign|unique|check|constraint|exclude)\b/i;

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** แยกตามตัวคั่นที่อยู่นอกวงเล็บเท่านั้น — `numeric(10, 2)` ต้องไม่ถูกหั่นกลาง */
function splitTopLevel(body: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** เดิน migration ตามลำดับ แล้วคืนสคีมา **ผลลัพธ์สุดท้าย** (add/drop/rename สะสมกันจริง) */
export function schemaFromSql(sources: readonly string[]): Map<string, string[]> {
  const tables = new Map<string, string[]>();

  for (const source of sources) {
    const sql = stripSqlComments(source);
    for (const raw of splitTopLevel(sql, ";")) {
      const stmt = raw.trim();

      const created = /^create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*)\)\s*$/i.exec(stmt);
      if (created) {
        const cols = tables.get(created[1]) ?? [];
        for (const piece of splitTopLevel(created[2], ",")) {
          const c = piece.trim();
          if (!c || CONSTRAINT_START.test(c)) continue;
          const name = c.split(/\s/)[0].replace(/"/g, "");
          if (!cols.includes(name)) cols.push(name);
        }
        tables.set(created[1], cols);
        continue;
      }

      const altered = /^alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\b([\s\S]*)$/i.exec(stmt);
      if (altered) {
        const [, table, rest] = altered;
        // 🔴 หนึ่ง `alter table` มี `add column` ได้หลายตัว — ฉบับแรกของผมจับแค่ตัวแรก
        //    ผลคือได้ 97 คอลัมน์แทนที่จะเป็น 111 **และมันดูเหมือนตัวเลขที่สมเหตุสมผล**
        for (const m of rest.matchAll(/\badd\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)) {
          const cols = tables.get(table) ?? [];
          if (!cols.includes(m[1])) cols.push(m[1]);
          tables.set(table, cols);
        }
        for (const m of rest.matchAll(/\bdrop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi)) {
          const cols = tables.get(table);
          if (cols && cols.includes(m[1])) cols.splice(cols.indexOf(m[1]), 1);
        }
        for (const m of rest.matchAll(/\brename\s+column\s+(\w+)\s+to\s+(\w+)/gi)) {
          const cols = tables.get(table);
          if (cols && cols.includes(m[1])) cols[cols.indexOf(m[1])] = m[2];
        }
        continue;
      }

      const dropped = /^drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/i.exec(stmt);
      if (dropped) tables.delete(dropped[1]);
    }
  }
  return tables;
}

function legacySchema(): Map<string, string[]> {
  const files = readdirSync(LEGACY_DIR).filter((f) => f.endsWith(".sql")).sort();
  return schemaFromSql(files.map((f) => readFileSync(join(LEGACY_DIR, f), "utf8")));
}

/** คอลัมน์ **ต้นทาง** ที่ `column-map.md` ตอบไว้ แยกตามหัวข้อ `## \`<ตาราง>\` → …` */
export function answersFromMarkdown(markdown: string): Map<string, Set<string>> {
  const answers = new Map<string, Set<string>>();
  let current: Set<string> | null = null;

  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(?:[^\w`]*\s*)?`(\w+)`\s*→/.exec(line);
    if (heading) {
      current = new Set();
      answers.set(heading[1], current);
      continue;
    }
    if (/^##\s/.test(line)) {
      // หัวข้ออื่น (เช่น `data/places.ts` หรือหัวข้อสรุป) — ปิดหน้าต่างไว้ ไม่เก็บแถวต่อจากนี้
      current = null;
      continue;
    }
    if (!current) continue;
    const row = /^\|\s*`(\w+)`\s*\|/.exec(line);
    if (row) current.add(row[1]);
  }
  return answers;
}

function answeredColumns(): Map<string, Set<string>> {
  return answersFromMarkdown(readFileSync(MAP_PATH, "utf8"));
}

/** คืนคู่ที่ขาด/เกิน — ตรรกะเดียวกับที่เคสของไฟล์จริงใช้ ไม่ใช่ฉบับคัดลอก */
export function coverageGaps(
  schema: Map<string, string[]>,
  answers: Map<string, Set<string>>
): { gaps: string[]; ghosts: string[] } {
  const gaps: string[] = [];
  const ghosts: string[] = [];
  for (const [table, cols] of schema) {
    const answered = answers.get(table);
    if (!answered) continue;
    for (const col of cols) if (!answered.has(col)) gaps.push(`${table}.${col}`);
  }
  for (const [table, answered] of answers) {
    const cols = schema.get(table);
    if (!cols) continue;
    for (const col of answered) if (!cols.includes(col)) ghosts.push(`${table}.${col}`);
  }
  return { gaps, ghosts };
}

describe("E2-AC6 — ทุกคอลัมน์เดิมต้องมีคำตอบ และทุกคำตอบต้องชี้ไปที่คอลัมน์ที่มีจริง", () => {
  const schema = legacySchema();
  const answers = answeredColumns();

  it("แยกสคีมาเดิมออกมาได้ 14 ตาราง / 111 คอลัมน์", () => {
    // 🔴 ตัวเลขนี้เป็น **สัญญาณเตือน ไม่ใช่เกณฑ์** — เกณฑ์จริงคือสองเคสข้างล่าง
    //    ถ้ามันขยับ แปลว่ามีคนแตะ migration ของเว็บทริปเดิม ซึ่งควรมีคนมาอ่านว่าทำไม
    const total = [...schema.values()].reduce((n, cols) => n + cols.length, 0);
    expect(schema.size).toBe(14);
    expect(total).toBe(111);
  });

  it("🔴 ทุกตารางเดิมมีหัวข้อของตัวเองใน column-map.md", () => {
    const missing = [...schema.keys()].filter((t) => !answers.has(t)).sort();
    expect(missing, `ตารางที่ไม่มีหัวข้อ: ${missing.join(", ")}`).toEqual([]);
  });

  it("🔴 ทุกคอลัมน์เดิมมีแถวคำตอบ — ไม่มีคอลัมน์ไหนเงียบหายไป", () => {
    const { gaps } = coverageGaps(schema, answers);
    expect(gaps, `คอลัมน์ที่ไม่มีคำตอบ: ${gaps.join(" · ")}`).toEqual([]);
  });

  it("🔴 ทุกแถวคำตอบชี้ไปที่คอลัมน์ที่มีจริง — 5 ใน 10 ความผิดรอบแรกเป็นชนิดนี้", () => {
    // ตอบชี้ผิดอ่านเหมือนตอบครบทุกประการ · และมันจะรอดทุกการนับ เพราะจำนวนแถวเท่าเดิม
    const { ghosts } = coverageGaps(schema, answers);
    expect(ghosts, `คำตอบที่ชี้ไปคอลัมน์ที่ไม่มีอยู่: ${ghosts.join(" · ")}`).toEqual([]);
  });
});

/**
 * 🔴 **เคสด้านบวกของด่านนี้เอง — ห้ามลบ**
 *
 * สี่เคสข้างบนเขียวตั้งแต่รันครั้งแรก **ซึ่งเป็นสิ่งที่ควรสงสัยมากที่สุด ไม่ใช่สบายใจที่สุด**
 * > *"สะอาด" กับ "ไม่ได้สแกนอะไรเลย" ให้ output เหมือนกันเป๊ะ* (P4 · `P-21`)
 *
 * บล็อกนี้ยิงตรรกะ**ตัวเดียวกัน** (`coverageGaps` · `schemaFromSql` · `answersFromMarkdown`)
 * ใส่ข้อมูลที่**รู้ว่าผิด** แล้วยืนยันว่ามันจับได้ · **ไม่ใช่ฉบับคัดลอกมาทดสอบ** —
 * ถ้าเป็นฉบับคัดลอก มันจะพิสูจน์แค่ว่าฉบับคัดลอกทำงาน ซึ่งไม่เกี่ยวกับด่านจริงเลย
 */
describe("ด่านนี้จับของผิดได้จริงไหม — เคสด้านบวก", () => {
  const SQL = [
    `create table public.demo (
       id uuid primary key,
       title text,
       primary key (id)
     );`,
    `alter table public.demo
       add column if not exists note text,
       add column if not exists icon text;`,
    `alter table public.demo drop column title;`,
    `alter table public.demo rename column icon to emoji;`,
  ];

  /** เขียน markdown เป็นบรรทัด ๆ — หลบ `\n` ในสตริงยาวที่อ่านยากและพิมพ์ผิดง่าย */
  const md = (...lines: string[]) => lines.join("\n");

  it("อ่าน add หลายตัวในคำสั่งเดียว · drop · rename ได้ครบ", () => {
    // 🔴 เคสนี้ตรึงบั๊กจริงของผมเอง: ฉบับแรกจับ `add column` แค่ตัวแรกของแต่ละคำสั่ง
    //    ได้ 97 คอลัมน์แทน 111 **และ 97 ก็ดูเหมือนตัวเลขที่สมเหตุสมผล**
    expect(schemaFromSql(SQL).get("demo")).toEqual(["id", "note", "emoji"]);
  });

  it("ไม่นับบรรทัด constraint เป็นคอลัมน์", () => {
    const sql = `create table public.t (
      id uuid,
      constraint t_pk primary key (id),
      unique (id)
    );`;
    expect(schemaFromSql([sql]).get("t")).toEqual(["id"]);
  });

  it("🔴 คอลัมน์ที่ไม่มีคำตอบ → ต้องถูกจับ", () => {
    const answers = answersFromMarkdown(md(
      "## `demo` → `demo`",
      "",
      "| คอลัมน์ | ปลายทาง |",
      "|---|---|",
      "| `id` | คงเดิม |",
    ));
    expect(coverageGaps(schemaFromSql(SQL), answers).gaps).toEqual(["demo.note", "demo.emoji"]);
  });

  it("🔴 คำตอบที่ชี้ไปคอลัมน์ที่ไม่มีอยู่ → ต้องถูกจับ", () => {
    // `title` ถูก drop ไปแล้ว — คำตอบที่ยังพูดถึงมันคือคำตอบที่ล้าสมัย
    // และมันจะรอดทุกการ **นับ** เพราะจำนวนแถวเท่าเดิม
    const answers = answersFromMarkdown(md(
      "## `demo` → `demo`",
      "| `id` | คงเดิม |",
      "| `note` | คงเดิม |",
      "| `emoji` | คงเดิม |",
      "| `title` | คงเดิม |",
    ));
    expect(coverageGaps(schemaFromSql(SQL), answers).ghosts).toEqual(["demo.title"]);
  });

  it("🔴 หัวข้ออื่นต้องปิดหน้าต่าง ไม่ใช่ดูดแถวของหัวข้อถัดไปเข้ามา", () => {
    // ถ้าไม่ปิด แถวของ `data/places.ts` จะถูกนับเป็นคำตอบของตารางก่อนหน้า
    // → ตารางก่อนหน้าจะดู "ครบเกิน" **และนั่นคือทิศที่อันตราย: รูถูกปิดด้วยคำตอบของเรื่องอื่น**
    const answers = answersFromMarkdown(md(
      "## `demo` → `demo`",
      "| `id` | คงเดิม |",
      "",
      "## 🟢 `data/places.ts` → `catalog_places`",
      "| `nameKo` | ใหม่ |",
    ));
    expect([...(answers.get("demo") ?? [])]).toEqual(["id"]);
    expect(answers.has("data")).toBe(false);
  });
});
