import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `E3-AC8` — ข้อมูลรายทริปต้องไม่ถูกแคชในที่ที่แชร์ข้ามผู้ใช้ · เจ้าของ: P4-QA/Sec (26 ส.ค. 2026)
 *
 * ## 🔴 ทำไมนับ 0 แล้วปิดไม่ได้
 * เกณฑ์เขียนไว้เอง: *"เทสต์ผลลบพิสูจน์อะไรไม่ได้ (in-memory ต่อ instance) → ต้องใช้ static lint เป็นตัวหลัก"*
 * วันนี้ `grep 'use cache'` ทั้งรีโป = **0 จุด** · แต่ 0 วันนี้ไม่ได้แปลว่า 0 พรุ่งนี้ —
 * ต้องมี **ด่านที่แดงวินาทีที่มีคนพิมพ์มันลงไป** ไม่ใช่ตัวนับที่เขียวเพราะยังไม่มีใครพิมพ์
 *
 * ## สิ่งที่อันตรายจริงคือ `'use cache: remote'`
 * doc ของ Next เวอร์ชันนี้ (`03-api-reference/01-directives/use-cache-remote.md`) บอกตรงว่า remote =
 * **"durable caching shared across all server instances"** และลิสต์ *"user-specific parameters"*
 * ไว้ใต้หัวข้อ *when to avoid* เอง → เอาข้อมูลรายทริปใส่แคชนี้ = ผู้ใช้คนอื่นอ่านของเราได้
 *   · `'use cache: private'` = ต่อผู้ใช้ → **ปลอดภัย ไม่จับ**
 *   · `'use cache'` เปล่า = in-memory ต่อ instance → ไม่ใช่ leak ข้ามผู้ใช้ในตัวมันเอง → **ไม่จับ**
 *   · `'use cache: remote'` + `cacheLife`/`cacheTag` (ตัวบอกความคงทน) ในไฟล์รายทริป → **จับ**
 *
 * ## สองชั้น
 * ① **สวิตช์ระบบ** — `'use cache: remote'` ใช้ไม่ได้เลยถ้าไม่เปิด `cacheComponents` ใน next.config
 *    (doc เดียวกัน) · ตราบใดปิด = ช่องนี้ปิดทั้งแอป · เปิดเมื่อไหร่ด่านแดง = บังคับกลับมาอ่าน AC8
 * ② **directive ต่อไฟล์** — ไล่ไฟล์ `app/api/engine/**` + `lib/engine/**` (ชั้นข้อมูลรายทริป)
 *    ห้ามมี directive/marker ของ remote cache · ไฟล์ตัวที่ 12 ถูกครอบเองเพราะสแกนจากดิสก์
 *
 * 🔴 **ทุกชั้นมีเคสด้านบวก** — พิสูจน์ว่าด่าน *แดงได้จริง* ไม่ใช่เขียวเพราะ regex ไม่เคยตรง
 *    (เคยโดนแบบนี้กับ `pipefail`) · เคส plant ไฟล์จริงเดินผ่าน walker ทั้งตัว ไม่ใช่แค่ทดสอบ regex
 */

// ชั้นข้อมูลรายทริป: engine API (เสิร์ฟข้อมูลของผู้ใช้ที่ล็อกอิน) + ชั้น db ของ engine
const PER_TRIP_DIRS = ["app/api/engine", "lib/engine"];

// directive/marker ของแคชที่คงทน/แชร์ข้ามผู้ใช้ — private/bare ไม่อยู่ในนี้โดยตั้งใจ
const REMOTE_CACHE = /["']use cache:\s*remote["']|\bcacheLife\s*\(|\bcacheTag\s*\(/;

// สวิตช์ที่ทำให้ remote cache ทำงานได้ (ไม่มี = directive ข้างบนเป็นหมัน)
const ENABLE_FLAG = /\bcacheComponents\s*:\s*true\b|\bdynamicIO\s*:\s*true\b/;

// ทางออกฉุกเฉิน: จุดที่ตั้งใจให้มี remote cache จริง ๆ (พร้อมเหตุผลกำกับ) — ว่างวันนี้
const ALLOWED_FILES: string[] = [];

function scanDirs(absDirs: string[]): { offenders: string[]; scanned: number } {
  const offenders: string[] = [];
  let scanned = 0;
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // ไม่มีโฟลเดอร์ก็ข้าม
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", ".next", "__tests__"].includes(e.name)) walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      scanned++;
      if (REMOTE_CACHE.test(readFileSync(full, "utf8"))) offenders.push(full);
    }
  };
  absDirs.forEach(walk);
  return { offenders, scanned };
}

describe("E3-AC8 — ห้ามแคชข้อมูลรายทริปในที่ที่แชร์ข้ามผู้ใช้", () => {
  it("control: regex จับ directive อันตราย และปล่อยอันปลอดภัย (private/bare) — ไม่งั้นด่านเขียวเพราะไม่เคยตรง", () => {
    expect(REMOTE_CACHE.test("'use cache: remote'")).toBe(true);
    expect(REMOTE_CACHE.test('"use cache:   remote"')).toBe(true);
    expect(REMOTE_CACHE.test("  cacheTag('trip-' + tripId)")).toBe(true);
    expect(REMOTE_CACHE.test("cacheLife('hours')")).toBe(true);
    // private = ต่อผู้ใช้ · bare = ต่อ instance → ไม่ใช่ leak ข้ามผู้ใช้ → ต้อง **ไม่** จับ
    expect(REMOTE_CACHE.test("'use cache: private'")).toBe(false);
    expect(REMOTE_CACHE.test("'use cache'")).toBe(false);
  });

  it("control (สแกนจริง): plant 'use cache: remote' ลงไฟล์ในไดเรกทอรีชั่วคราว แล้ว walker ต้องเจอ", () => {
    // ไม่แตะ working tree ที่แชร์กัน — เขียนใน OS temp dir เฉพาะเทสต์นี้ แล้วลบทิ้ง
    const tmp = mkdtempSync(join(tmpdir(), "ac8-remote-"));
    try {
      const sub = join(tmp, "sub");
      mkdirSync(sub, { recursive: true });
      const planted = join(sub, "route.ts");
      writeFileSync(planted, "'use cache: remote'\nexport async function GET(){return null}\n");
      const { offenders, scanned } = scanDirs([tmp]);
      expect(scanned, "walker ไม่เดินไฟล์ที่ปลูกไว้เลย").toBeGreaterThan(0);
      expect(
        offenders,
        "สแกนเนอร์เดินไฟล์แล้วยังจับ 'use cache: remote' ที่ปลูกไว้ไม่เจอ = ด่านนี้จะเขียวตลอดเพราะ walker/regex ไม่ทำงาน",
      ).toContain(planted);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("① cacheComponents/dynamicIO ต้องปิดใน next.config — เปิด = remote cache ทำงานได้ทั้งแอป", () => {
    expect(ENABLE_FLAG.test("cacheComponents: true"), "regex จับ flag ไม่ได้").toBe(true);
    expect(ENABLE_FLAG.test("dynamicIO:true")).toBe(true);
    const cfg = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    expect(
      ENABLE_FLAG.test(cfg),
      "next.config เปิด cacheComponents/dynamicIO แล้ว → 'use cache: remote' ทำงานได้ทั้งแอป\n" +
        "  🔴 E3-AC8: ก่อนเปิด ต้องทำ layer-2 ให้ครอบไฟล์รายทริปที่จะแคช และมาแก้ pin นี้พร้อมเหตุผล\n" +
        "  → เปิดโดยไม่ทำสองอย่างนั้น = ข้อมูลทริปของ A อาจถูกเสิร์ฟให้ B จากแคชที่แชร์กัน",
    ).toBe(false);
  });

  it("② ไม่มีไฟล์รายทริป (app/api/engine · lib/engine) ใช้ remote/shared cache directive", () => {
    const root = resolve(process.cwd());
    const dirs = PER_TRIP_DIRS.map((d) => resolve(root, d));
    const { offenders, scanned } = scanDirs(dirs);
    // ถ้า scanned=0 = path ผิด/โฟลเดอร์ย้าย → ด่านจะเขียวเพราะไม่เจออะไร ไม่ใช่เพราะสะอาด
    expect(scanned, "ไม่ได้สแกนไฟล์รายทริปเลยสักไฟล์ — path ใน PER_TRIP_DIRS ยังตรงกับดิสก์ไหม?").toBeGreaterThan(0);
    const rel = offenders.map((f) => f.slice(root.length + 1)).filter((r) => !ALLOWED_FILES.includes(r));
    expect(
      rel,
      "พบ directive/marker ของ remote cache ในไฟล์ข้อมูลรายทริป — remote cache แชร์ข้ามทุก instance\n" +
        "  (doc: use-cache-remote = shared across all server instances) → ข้อมูลทริป A อาจโผล่ให้ B\n" +
        "  ใช้ 'use cache: private' (ต่อผู้ใช้) หรืออย่าแคชชั้นนี้ · ถ้าตั้งใจจริงเพิ่ม ALLOWED_FILES พร้อมเหตุผล\n" +
        `  ไฟล์: ${rel.join(" · ")}`,
    ).toEqual([]);
  });
});
