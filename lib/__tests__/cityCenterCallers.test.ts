import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 **`E2-AC16` — ใครยัง `import { cityCenter }` จาก `@/data/places` อยู่บ้าง**
 * เจ้าของ: P2-UI/UX · 3 ก.ย. 2026
 *
 * ## ทำไมไฟล์นี้ต้องมี ทั้งที่ `cityCenter.test.ts` มีอยู่แล้ว
 * ไฟล์นั้นทดสอบว่า **`cityCenterOf()` ทำงานถูก** · **ไม่ได้ทดสอบว่ามีใครยังเรียกตัวเก่าอยู่**
 * 🎯 ***ด่านที่ทดสอบเครื่องมือ ไม่ได้ทดสอบการใช้เครื่องมือ*** — รูปเดียวกับที่ `cacheFullSignal.test.ts`
 * เขียนไว้เองว่า `noteCacheFailure` ถูกทดสอบในฐานะฟังก์ชัน แต่ `localCache.ts` ไม่เคยอยู่ในรายชื่อผู้เรียก
 *
 * ## เกณฑ์ของ `E2-AC16` คือ *ผู้เรียกเลิก import* ไม่ใช่ *มีตัวใหม่แล้ว*
 * `cityCenter()` เฉลี่ยพิกัดของสถานที่ใน `PLACES` (6 เมืองเกาหลี) → **เมืองที่มีสถานที่ 0 แห่งได้ `NaN`**
 * ซึ่งเป็นสภาพของ**ทุกเมืองนอกเกาหลี** · `NaN` ไหลต่อไปได้ไกล (`useTripWeather` → `lat=NaN` → 400 ทุกใบ)
 * และ **`tsc` จับไม่ได้ตามนิยาม** เพราะ `NaN` เป็น `number`
 *
 * ## ⚠️ ครอบเท่าที่มันครอบ
 * จับ **บรรทัด `import` ในซอร์ส** · ถ้าใครเรียกผ่าน re-export หรือ dynamic import ด่านนี้มองไม่เห็น
 * — **จับรูปที่เกิดจริงและเกิดง่ายที่สุด ไม่ใช่ทุกรูป**
 */

const ROOTS = ["app", "components", "hooks", "lib"];
const SKIP_DIRS = new Set(["__tests__", "node_modules"]);
/** บ้านของตัวเก่า — ที่เดียวที่ประกาศมันได้ */
const HOME_FILE = "data/places.ts";

/**
 * 🔴 **ทะเบียนผู้เรียกที่ยังเหลือ — ไม่ใช่ข้อยกเว้นถาวร · ทุกบรรทัดคือหนี้ที่ยังไม่ได้ใช้คืน**
 *
 * ประวัติ: 5 ผู้เรียก → **`DayStopsSection` + `HotelEditModal` ย้ายไป `cityCenterOf()` (P2 · 3 ก.ย. 2026)** → 3
 *
 * 🔴 **`E2-AC16` ปิดได้ก็ต่อเมื่อทะเบียนนี้ว่าง** — และเคส *"ทะเบียนต้องผิดได้"* ข้างล่างจะแดง
 * ทันทีที่ใครแก้ไฟล์ในนี้เสร็จแล้วไม่ลบบรรทัดออก **ทะเบียนที่เพี้ยนจากรีโปโดยไม่มีอะไรจับ
 * = แหล่งความจริงใบที่สอง**
 */
const KNOWN_CALLERS: Record<string, string> = {
  "components/PlaceSidebar.tsx":
    "โหมดทริปเกาหลีจากไฟล์ — กรอง NaN ทิ้งก่อนส่งออกแล้ว · ตั้งใจให้มีสองโหมดจนกว่าทริปไฟล์จะเลิกใช้",
  "hooks/useTripWeather.ts": "ใช้เป็น fallback หลังลองคลังก่อน — ยังไม่ถอดเพราะทริปไฟล์ยังพึ่งมัน",
  "lib/citySegments.ts": "ยังไม่ย้าย — ข้าม NaN เอาเองอยู่ (P1 ส่งให้ P2 พร้อมงาน distance cap)",
};

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * `true` เมื่อไฟล์ `import { … cityCenter … } from "@/data/places"`
 * · `\bcityCenter\b` ไม่ match `cityCenterOf` เพราะ `O` เป็น word char — **นั่นคือจุดที่ต้องแม่น**
 *   ตัวใหม่กับตัวเก่าต่างกันแค่ 2 ตัวอักษร และเราไล่ทั้งรีโปด้วยชื่อนี้
 */
function importsLegacyCityCenter(source: string): boolean {
  return /import\s*(?:type\s*)?\{[^}]*\bcityCenter\b[^}]*\}\s*from\s*["']@\/data\/places["']/.test(
    stripComments(source),
  );
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

describe("E2-AC16 — ผู้เรียก cityCenter() ตัวเก่า", () => {
  it("🔴 ตัวเดินไฟล์ต้องเดินถึงซอร์สจริง — ไม่มีของให้ตรวจ ต้องแดง ไม่ใช่เขียวเปล่า", () => {
    const files = sourceFiles();
    expect(files.length, "ไม่เจอไฟล์ซอร์สพอ — โฟลเดอร์ถูกย้าย ไม่ใช่ 'ไม่มีผู้เรียก'").toBeGreaterThan(100);
    for (const known of Object.keys(KNOWN_CALLERS)) {
      expect(
        files.some((f) => f.file === known),
        `เดินไม่ถึง ${known} — ไฟล์ถูกย้าย/เปลี่ยนชื่อ ต้องมาแก้ด่าน ไม่ใช่ปล่อยผ่าน`,
      ).toBe(true);
    }
  });

  it("🔴 ไม่มีผู้เรียกใหม่นอกทะเบียน", () => {
    const offenders = sourceFiles()
      .filter((f) => f.file !== HOME_FILE && importsLegacyCityCenter(f.source))
      .map((f) => f.file)
      .filter((f) => !(f in KNOWN_CALLERS))
      .sort();
    expect(
      offenders,
      "ผู้เรียกใหม่ของ `cityCenter()` — มันคืน `NaN` เงียบ ๆ สำหรับเมืองนอกเกาหลี และ `tsc` จับไม่ได้:\n  " +
        offenders.join("\n  ") +
        "\n  → ใช้ `cityCenterOf(cities, slug)` จาก `@/lib/engine/cityCenter` ซึ่งคืน `null` แทน",
    ).toEqual([]);
  });

  it("🔴 ทะเบียนต้อง *ผิดได้* — ไฟล์ที่ย้ายแล้วต้องหลุดออกจากทะเบียน", () => {
    const stale = Object.keys(KNOWN_CALLERS)
      .filter((file) => !importsLegacyCityCenter(readFileSync(join(process.cwd(), file), "utf8")))
      .sort();
    expect(
      stale,
      "ไฟล์พวกนี้เลิก import แล้ว — ลบออกจากทะเบียน (และถ้าว่างหมด `E2-AC16` ปิดได้):\n  " + stale.join("\n  "),
    ).toEqual([]);
  });

  it("🔴 เคสควบคุมฝั่งบวก — ตัวสแกนแยกตัวเก่ากับตัวใหม่ได้จริง", () => {
    expect(importsLegacyCityCenter('import { cityCenter } from "@/data/places";')).toBe(true);
    expect(importsLegacyCityCenter('import { Category, Place, cityCenter, placesByCity } from "@/data/places";')).toBe(true);
    // ตัวใหม่ต้องไม่ถูกนับ — ต่างกันแค่ 2 ตัวอักษร
    expect(importsLegacyCityCenter('import { cityCenterOf } from "@/lib/engine/cityCenter";')).toBe(false);
    expect(importsLegacyCityCenter('import { cityCenterOf } from "@/data/places";')).toBe(false);
    // คอมเมนต์ที่*พูดถึง*ตัวเก่าเพื่อเตือน ต้องไม่ถูกนับ
    expect(importsLegacyCityCenter('// import { cityCenter } from "@/data/places";')).toBe(false);
  });
});
