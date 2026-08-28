import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripTsComments } from "./_helpers";

/**
 * ด่านของกติกาที่ทำให้ `offlineStore.clearAll()` ปลอดภัย — **`E6-AC7`** (P7 เสนอ · P1 ขอให้ลงเป็นด่านจริง)
 *
 * ## ทำไมต้องเป็นด่าน ไม่ใช่ข้อตกลง
 * `clearAllCaches()` เดิมล้าง `localStorage` **ตาม prefix** → *"ปลอดภัยโดยต้องจำ"* · ของที่ลืมย้ายเข้า
 * prefix จะรอด (ชื่อพาสปอร์ต · `trip-who` รอดมาแล้วจริง) · ทางกลับ (ล้างทุกอย่างยกเว้นรายการ) แย่กว่า
 * เพราะจะลบ `sb-*` → `auth.signOut()` เพิกถอน session ฝั่งเซิร์ฟเวอร์ไม่ได้ **และเงียบสนิท**
 *
 * 🎯 **ทางที่สามคือแยก *เนมสเปซ*: ข้อมูลเราอยู่ IndexedDB ฐานเดียว → ล้างทั้งฐานโดยไม่ต้องมีรายการ**
 * · `supabase-js` เก็บ session ไว้ `localStorage` ตามค่าเริ่มต้น → **`clearAll()` เอื้อมไม่ถึงตามนิยาม**
 * · 🔴 **แต่ข้อได้เปรียบนี้เป็น *คุณสมบัติของโครงสร้าง* ที่โค้ดสองบรรทัดทำลายได้** — ไฟล์นี้กันสองบรรทัดนั้น
 *
 * ## สองข้อที่บังคับ
 * ① **ห้ามตั้ง `storage` ให้ `createClient`** — ชี้ auth มาที่ที่เก็บของเราเมื่อไหร่ `clearAll()` จะลบ session
 *    ก่อน `auth.signOut()` ได้ใช้ · **นี่คือเหตุผลที่ P1 ปฏิเสธข้อเสนอ "ล้างทุกอย่างยกเว้นรายการ" ของ P3**
 * ② **ห้ามมีใครแตะ `indexedDB` นอก `lib/engine/offlineStore.ts`** — ฐานที่สองที่ `clearAll()` ไม่รู้จัก
 *    คือ *"รายการที่ต้องจำ"* กลับมาในรูปใหม่ **และคราวนี้ไม่มี prefix ให้ grep หาด้วยซ้ำ**
 */
const ROOT = resolve(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "supabase-platform", "__tests__"]);
const SCAN_DIRS = ["app", "components", "hooks", "lib"];

/** ไฟล์เดียวที่ได้รับอนุญาตให้แตะ `indexedDB` — **เจ้าของเนมสเปซ** */
const STORE_FILE = "lib/engine/offlineStore.ts";

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

describe("E6-AC7 — auth อยู่ localStorage · ข้อมูลเราอยู่ IndexedDB · ห้ามปน", () => {
  /**
   * 🔴 เคสด้านบวกของตัวสแกนเอง — **"สแกนแคบลง" กับ "สแกนความว่างเปล่า" ให้ผลเหมือนกันเป๊ะ** (`P-21`)
   * ถ้าไม่มีไฟล์ให้สแกน สองเคสข้างล่างจะเขียวโดยไม่ได้ตรวจอะไรเลย
   */
  it("🔴 ตัวสแกนต้องเห็นไฟล์จริง และต้องเห็นไฟล์ที่มันมีไว้เฝ้า", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(
      FILES.map(rel),
      `${STORE_FILE} ต้องอยู่ในโซนสแกน ไม่งั้นข้อยกเว้นข้างล่างไม่ได้ยกเว้นอะไรเลย`
    ).toContain(STORE_FILE);
  });

  it("① ไม่มีใครตั้ง `storage` ให้ Supabase client — session ต้องอยู่ localStorage ตามค่าเริ่มต้น", () => {
    const offenders = FILES.filter((f) => {
      const code = stripTsComments(readFileSync(f, "utf8"));
      // จับเฉพาะไฟล์ที่ *สร้าง client* แล้วส่ง `storage:` เข้าไป — ไม่ใช่คำว่า `storage` ลอย ๆ
      // (`supabase.storage.from(...)` ของ Storage bucket ต้องไม่ติด)
      return /createClient|createBrowserClient|createServerClient/.test(code) && /\bstorage\s*:/.test(code);
    }).map(rel);
    expect(
      offenders,
      "ตั้ง `storage` ให้ auth = ย้าย session ออกจาก localStorage → `offlineStore.clearAll()` " +
        "อาจลบ session ก่อน `auth.signOut()` ได้ใช้ **และเงียบ** (เหตุผลเดียวกับที่ P1 ปฏิเสธ 'ล้างทุกอย่างยกเว้นรายการ')"
    ).toEqual([]);
  });

  it("② ไม่มีใครแตะ `indexedDB` นอก offlineStore — ฐานที่สองคือรายการที่ต้องจำในรูปใหม่", () => {
    const offenders = FILES.filter((f) => {
      if (rel(f) === STORE_FILE) return false;
      return /\bindexedDB\b|\bIDBFactory\b|\bIDBDatabase\b/.test(stripTsComments(readFileSync(f, "utf8")));
    }).map(rel);
    expect(
      offenders,
      `ฐาน IndexedDB ใบที่สองที่ \`clearAll()\` ไม่รู้จัก = ข้อมูลผู้ใช้ค้างหลัง signOut · ` +
        `ถ้าจำเป็นจริง ให้ผ่าน ${STORE_FILE} ไม่ใช่เปิดฐานเอง`
    ).toEqual([]);
  });
});
