import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripTsComments } from "./_helpers";

/**
 * ด่านของ **`E6-AC9`** — *ห้ามใช้ `updated_at` เป็น cursor ของ incremental sync* (P7 ขอ · P1 บังคับ)
 *
 * ## ทำไมต้องมีไฟล์นี้ ทั้งที่ `schemaPins.test.ts:880` มีอยู่แล้ว
 * ตัวนั้นปักหมุด ***คลาสของตัวเขียนเงียบ*** ที่ทำให้ข้อห้ามนี้จำเป็น (FK `on delete set null` ·
 * `preserve_authorship` · promote-on-delete — เขียนแถวจริงโดย `updated_at` ไม่ขยับ เพราะ
 * `touch_updated_at` มี `if pg_trigger_depth() > 1 then return`)
 * 🎯 **มันตอบว่า *ทำไมกฎนี้ต้องมี* · ไม่ได้ตอบว่า *มีใครละเมิดกฎหรือยัง*** — ใครเขียน
 * `.gt("updated_at", cursor)` พรุ่งนี้ ไม่มีอะไรแดง · ไฟล์นี้คือครึ่งที่ขาด **เก็บทั้งสองใบไว้**
 *
 * ## กฎ 3 ข้อของข้อห้าม (P1 ประกาศ 28 ส.ค. 2026 หลัง P3 หักข้อสรุปกว้างของ P7)
 * ① ด่าน**แดงเมื่อละเมิด** · ② มี**เคสควบคุมฝั่งบวก** · ③ **ด่านที่ยังไม่มีของให้ตรวจ ต้องแดง ไม่ใช่เขียวเปล่า**
 * 🔴 **ข้อ ③ กัดข้อนี้ตรง ๆ:** วันนี้ทั้งทรีไม่มีใครใช้แพทเทิร์นนี้เลยสักที่ (วัดแล้ว = 0)
 * → เคส "ไม่มีผู้ละเมิด" จะเขียว **ไม่ว่าตัวจับจะทำงานหรือพัง** · `it ②`/`it ③` คือสิ่งเดียวที่แยกสองอย่างนี้ออก
 * **ไม่มีเคสควบคุม = `grep` ที่ได้ `0` ในเสื้อผ้าของด่าน**
 *
 * ## ขอบของด่านนี้ — เขียนไว้เพราะมันอ่านแข็งกว่าที่เป็นจริง
 * · จับได้เฉพาะที่ชื่อคอลัมน์เป็น **literal** — `.gt(col, cursor)` ที่ `col` มาจากตัวแปร **รอด**
 * · ไม่สแกน `lib/__tests__/` (ไฟล์นี้เองต้องถือสตริงละเมิดไว้เป็นเคสควบคุม)
 * · **กัน*การเผลอ* ไม่ได้กัน*คนที่ตั้งใจ*** — เจตนาเดิมของด่านคืออย่างแรก
 */
const ROOT = resolve(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "supabase-platform", "__tests__"]);
const SCAN_DIRS = ["app", "components", "hooks", "lib"];

/** ไฟล์ที่ต้องอยู่ในโซนสแกนเสมอ — ถ้าหลุด แปลว่าโซนสแกนหดโดยไม่มีใครรู้ */
const SENTINEL = "lib/engine/db.ts";

/**
 * แพทเทิร์นที่แปลว่า *"เอา `updated_at` มาเทียบเพื่อดึงเฉพาะของใหม่"*
 *
 * 🔴 **`order("updated_at")` และ `select("updated_at")` ไม่นับ** — เรียงลำดับกับเลือกคอลัมน์
 * ไม่ใช่ cursor · ถ้าจับด้วยจะเป็น false positive ที่ทำให้คนถอดด่านนี้ทิ้ง ซึ่งแย่กว่าไม่มีด่าน
 */
const CURSOR_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["supabase range op", /\.(?:gt|gte|lt|lte)\s*\(\s*[`'"]updated_at[`'"]/g],
  ["postgrest filter", /updated_at=(?:gt|gte|lt|lte)\./g],
  ["sql comparison", /updated_at\s*(?:>=|<=|>|<)(?!=)/g],
];

/** คืนชื่อแพทเทิร์นที่ยิงโดน — **รับซอร์สที่ตัดคอมเมนต์แล้วเท่านั้น** */
export function cursorUsages(strippedCode: string): string[] {
  return CURSOR_PATTERNS.filter(([, re]) => {
    re.lastIndex = 0;
    return re.test(strippedCode);
  }).map(([name]) => name);
}

function rel(p: string): string {
  return p.slice(ROOT.length + 1).split("\\").join("/");
}

function walk(dir: string): string[] {
  let found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      found = found.concat(walk(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) {
      found.push(p);
    }
  }
  return found;
}

const FILES = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

describe("🔴 E6-AC9 — ห้าม `updated_at` เป็น cursor ของ incremental sync", () => {
  it("① ตัวสแกนต้องเห็นไฟล์จริง — 'สแกนแคบลง' กับ 'สแกนความว่างเปล่า' ให้ผลเหมือนกันเป๊ะ (P-21)", () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(
      FILES.map(rel),
      `${SENTINEL} ต้องอยู่ในโซนสแกน — ถ้าหลุด เคส ④ จะเขียวเพราะไม่ได้อ่านอะไร`
    ).toContain(SENTINEL);
  });

  it("② เคสควบคุมฝั่งบวก — ตัวจับต้องแดงกับของละเมิดจริง ทั้ง 3 รูป", () => {
    // ถ้าสามบรรทัดนี้ไม่ถูกจับ เคส ④ ก็ไม่ได้พิสูจน์อะไรเลย
    expect(cursorUsages('q.gt("updated_at", cursor)')).toContain("supabase range op");
    expect(cursorUsages("q.gte(`updated_at`, since)")).toContain("supabase range op");
    expect(cursorUsages("fetch(`/rest/v1/trips?updated_at=gt.${cursor}`)")).toContain("postgrest filter");
    expect(cursorUsages("const sql = `select * from trips where updated_at > $1`")).toContain("sql comparison");
  });

  it("③ เคสควบคุมฝั่งลบ — ของที่ *ไม่ใช่* cursor ต้องไม่ถูกจับ", () => {
    // false positive ทำให้คนถอดด่านทิ้ง ซึ่งแย่กว่าไม่มีด่าน
    expect(cursorUsages('q.order("updated_at", { ascending: false })')).toEqual([]);
    expect(cursorUsages('q.select("id, updated_at")')).toEqual([]);
    expect(cursorUsages("type Row = { updated_at: string | null }")).toEqual([]);
    expect(cursorUsages("if (a.updated_at !== b.updated_at) return")).toEqual([]);
  });

  it("④ ไม่มีไฟล์ไหนในทรีใช้ `updated_at` เป็น cursor", () => {
    const offenders = FILES.flatMap((f) => {
      const hits = cursorUsages(stripTsComments(readFileSync(f, "utf8")));
      return hits.length ? [`${rel(f)} → ${hits.join(", ")}`] : [];
    });
    expect(
      offenders,
      "`D79` ตั้งใจให้ `touch_updated_at` ไม่ stamp ตอน `pg_trigger_depth() > 1` → **มีการเปลี่ยนแถวจริง " +
        "ที่ `updated_at` ไม่ขยับเลย** (FK `on delete set null` · `preserve_authorship`) · " +
        "client ที่ดึงด้วย `updated_at > cursor` จะไม่มีวันเห็นการเปลี่ยนนั้น **และไม่มี error** · " +
        "ช่องทางที่ถูกคือ Realtime + full refetch ตอน cold start (ดู `docs/engine/mobile-arch.md §11.8`)"
    ).toEqual([]);
  });

  it("⑤ เคสควบคุมของ `stripTsComments` — ตัดคอมเมนต์ทิ้ง แต่ห้ามตัดโค้ดทิ้ง", () => {
    // ถ้า stripper คืนสตริงว่างเสมอ เคส ④ จะเขียวตลอดกาลโดยไม่มีอะไรฟ้อง
    expect(cursorUsages(stripTsComments('// ห้ามเขียน q.gt("updated_at", c)'))).toEqual([]);
    expect(cursorUsages(stripTsComments('q.gt("updated_at", c); // อธิบายเฉย ๆ'))).toContain("supabase range op");
  });
});
