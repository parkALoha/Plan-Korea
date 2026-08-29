import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 **ห้าม index `CITY_META` / `CITY_NAME_*` ตรง ๆ — ใช้ `cityMetaOf()` / `cityName*Of()`**
 * เจ้าของ: P3-FE/Perf · 29 ส.ค. 2026 (P1 สั่งเป็นของแรกของ `B6` เพราะไม่ขึ้นกับอะไรเลย)
 *
 * ## บั๊กที่ด่านนี้กันไม่ให้กลับมา — **มันเคยเกิดแล้ว และถูกแก้ไม่ครบ**
 * `CITY_META` เป็น `Record<Day["city"], …>` ที่มี **6 เมืองเกาหลี** · `Day` ที่สร้างจากฐาน (`B6`) มีได้ **42 เมือง**
 * และ **"ยังไม่ระบุเมือง" คือสภาพตั้งต้นของทุกวันในทริปใหม่** → `CITY_META[x]` เป็น `undefined`
 * → อ่าน `.icon` ต่อ → **ทั้งหน้าไม่ขึ้นเลย** ไม่ใช่แค่ไอคอนหาย
 *
 * 🔴 **`tsc` จับไม่ได้ตามนิยาม** — index ของ `Record` ที่คีย์เป็น union ถือว่า *"มีเสมอ"* ตามชนิด
 * ทั้งที่ค่าจริงถูก `cast` เข้ามาจากคลัง 42 เมือง (`usePlatformItinerary.ts:61` เขียนกำกับไว้เอง)
 * · เกิดจริง 28 ส.ค. 2026 ที่ `DayJumpBar` → `cityMetaOf()` ถูกเขียนขึ้นเพราะเคสนั้น
 * · **แต่วันนั้นแก้ไม่ครบ** — `app/summary` ยังเหลือ 2 จุด และ `components/PlaceSidebar` อีก 2 จุด
 * 🎯 ***ของที่แก้แล้วครั้งหนึ่งแต่เหลือจุดที่ไม่ถูกแก้ = ของที่จะกลับมาแน่นอน แค่รอเงื่อนไข*** (P1)
 * และเงื่อนไขคือ `B6` พอดี — วินาทีที่วันมาจากฐาน เมืองนอกเกาหลีจะไหลเข้าทุกจุดที่เหลือ
 *
 * ## ⚠️ ครอบเท่าที่มันครอบ
 * จับ **การ index ด้วยวงเล็บเหลี่ยมในซอร์ส** · ถ้าใครส่งผ่านตัวแปร (`const m = CITY_META; m[x]`)
 * ด่านนี้มองไม่เห็น — **จับรูปที่เกิดจริงและเกิดง่ายที่สุด ไม่ใช่ทุกรูป** (รูปเดียวกับ `dayBridge.test.ts:283`)
 */

const ROOTS = ["app", "components", "hooks", "lib"];
const SKIP_DIRS = new Set(["__tests__", "node_modules"]);
/** บ้านของตัวช่วย — ที่เดียวที่ index ตรงได้ เพราะมันคือคนที่ใส่ fallback ให้ */
const HELPER_FILE = "components/cityMeta.ts";

/**
 * 🔴 **ทะเบียนของที่ยังไม่ถูกแก้ — ไม่ใช่ข้อยกเว้นถาวร · ตอนนี้ว่าง และนั่นคือสภาพที่ถูกต้อง**
 *
 * ประวัติ: 5 ไฟล์ 11 จุด → `app/summary` + `hooks/useTripDnd` (P3) → **`components/*` 7 จุดสุดท้าย
 * (P2 · 29 ส.ค. 2026)**: `PlaceSidebar` 5 · `HotelEditModal` 1 · `ImmigrationSheet` 1 → **0**
 *
 * 🔴 **ทะเบียนว่างไม่ได้แปลว่าด่านนี้หมดหน้าที่** — เคส *"ไม่มีไฟล์ไหน index ตรง"* ข้างล่างยังเดินทั้งรีโป
 * ทุกครั้ง · ของใหม่ที่ index ตรงจะแดงทันทีโดยไม่ต้องมีใครมาเติมทะเบียนก่อน
 * · และเคส *"ตัวเดินไฟล์ต้องเดินถึงซอร์สจริง"* กันไม่ให้ทะเบียนว่าง + ตัวเดินพัง อ่านรวมกันเป็น "เขียว"
 *
 * 📌 **บทเรียนที่ทะเบียนใบนี้ทิ้งไว้ ห้ามลบทิ้งพร้อมตัวเลข:** ตัวเลขในนี้มาจาก*ตัวสแกน* ไม่ใช่การนับด้วยมือ
 * — `grep "CITY_META\["` ที่ใช้รายงานรอบแรกได้ 4 จุด เพราะไม่ได้นับ `CITY_NAME_TH[` / `CITY_NAME_EN[`
 * ซึ่งเป็นรูปเดียวกันทุกประการ · **เลขจาก grep เป็นเบาะแส ไม่ใช่จำนวน**
 */
const KNOWN_DIRECT_INDEX: Record<string, number> = {};

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** จำนวนจุดที่ index ตรง — ตัดคอมเมนต์ก่อน (หลายไฟล์*พูดถึง* `CITY_META[...]` เพื่อเตือนไม่ให้ใช้) */
function directIndexCount(source: string): number {
  return (stripComments(source).match(/\bCITY_(?:META|NAME_TH|NAME_EN)\s*\[/g) ?? []).length;
}

function sourceFiles(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, relPath);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push({ file: relPath, source: readFileSync(abs, "utf8") });
    }
  };
  for (const root of ROOTS) walk(join(process.cwd(), root), root);
  return out;
}

describe("🔴 ห้าม index CITY_META/CITY_NAME_* ตรง ๆ", () => {
  it("🔴 ตัวเดินไฟล์ต้องเดินถึงซอร์สจริง — ไม่มีของให้ตรวจ ต้องแดง ไม่ใช่เขียวเปล่า", () => {
    const files = sourceFiles();
    expect(files.length, "ไม่เจอไฟล์ซอร์สพอ — โฟลเดอร์ถูกย้าย ไม่ใช่ 'ไม่มีผู้ละเมิด'").toBeGreaterThan(100);
    expect(
      files.some((f) => f.file === HELPER_FILE),
      `เดินไม่ถึง ${HELPER_FILE} — ตัวช่วยถูกย้าย/เปลี่ยนชื่อ ต้องมาแก้ด่าน ไม่ใช่ปล่อยผ่าน`,
    ).toBe(true);
  });

  it("🔴 ไม่มีไฟล์ไหน index ตรง นอกจากบ้านของตัวช่วยเอง", () => {
    const offenders: string[] = [];
    for (const { file, source } of sourceFiles()) {
      if (file === HELPER_FILE) continue;
      const n = directIndexCount(source);
      if (n > 0 && n !== KNOWN_DIRECT_INDEX[file]) offenders.push(`${file} → ${n} จุด`);
    }
    expect(
      offenders.sort(),
      "index ตรงแบบนี้ `tsc` จับไม่ได้ และจะเป็น `undefined` ทันทีที่เมืองมาจากฐาน (42 เมือง):\n  " +
        offenders.join("\n  ") +
        "\n  → ใช้ `cityMetaOf()` / `cityNameThOf()` / `cityNameEnOf()` จาก `@/components/cityMeta`",
    ).toEqual([]);
  });

  it("🔴 ทะเบียนต้อง *ผิดได้* — จุดที่ถูกแก้แล้วต้องหลุดออกจากทะเบียน", () => {
    // ถ้า P2 แก้ `PlaceSidebar` แล้ว เคสนี้จะแดงจนกว่าจะลบบรรทัดนั้นออก
    // 🎯 ทะเบียนที่เพี้ยนจากของจริงโดยไม่มีอะไรจับ = แหล่งความจริงใบที่สอง (กฎ P4)
    const stale: string[] = [];
    for (const [file, expected] of Object.entries(KNOWN_DIRECT_INDEX)) {
      const found = directIndexCount(readFileSync(join(process.cwd(), file), "utf8"));
      if (found !== expected) stale.push(`${file} → ทะเบียนว่า ${expected} · ของจริง ${found}`);
    }
    expect(stale, "ทะเบียนไม่ตรงกับรีโปแล้ว — แก้ตัวเลข หรือลบบรรทัดออกถ้าแก้ครบแล้ว:\n  " + stale.join("\n  ")).toEqual([]);
  });

  it("🔴 เคสควบคุมฝั่งบวก — ตัวสแกนจับของผิดได้จริง", () => {
    expect(directIndexCount("const meta = CITY_META[day.city];")).toBe(1);
    expect(directIndexCount("{CITY_META[leg.city].icon} {CITY_NAME_EN[leg.city]}")).toBe(2);
    expect(directIndexCount("CITY_NAME_TH[c]")).toBe(1);
  });

  it("🔴 คู่กลับด้าน — คอมเมนต์ต้องไม่ถูกนับ · การเรียกตัวช่วยต้องไม่ถูกนับ", () => {
    expect(directIndexCount("// ห้ามใช้ CITY_META[city] ตรง ๆ\n/* CITY_NAME_TH[x] */")).toBe(0);
    expect(directIndexCount("cityMetaOf(day.city).icon; cityNameEnOf(leg.city);")).toBe(0);
    // import ของตัว `CITY_META` เอง ไม่ใช่การ index — ต้องไม่ถูกจับ
    expect(directIndexCount('import { CITY_META } from "@/data/itinerary";')).toBe(0);
  });
});
