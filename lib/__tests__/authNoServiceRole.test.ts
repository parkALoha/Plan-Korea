import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripTsComments } from "./_helpers";

/**
 * ด่านของ `E3-AC9` / `D38` — **Server Action ไม่ใช่สิทธิ์พิเศษ**
 *
 * P4 ชี้ว่าข้อผิดเดิม 4 ข้อของเขาเป็น "ข้อเดียวกันสี่หน้า" — เหตุผลผิดตัวเดียวกันคือ
 * *"ย้ายไปเซิร์ฟเวอร์แล้วน่าจะได้สิทธิ์เพิ่ม"* · 🔴 **และมันฟังดูดีพอที่จะผ่านการรีวิวตัวเองได้ทุกครั้ง**
 * → `D38` จึงกำหนดว่าต้องมี**เทสต์ที่พิสูจน์ ไม่ใช่ย่อหน้าที่เตือน**
 *
 * ไฟล์นี้บังคับ 2 ข้อกับโค้ดที่รันจริง:
 *   ① ไม่มี code path ไหนแตะ `SUPABASE_SERVICE_ROLE_KEY`
 *   ② ไม่มีใครใช้ `getSession()` ตัดสินสิทธิ์ — ต้องเป็น `getUser()` เท่านั้น
 *      (`getSession` อ่านคุกกี้แล้วคืนโดยไม่ตรวจกับเซิร์ฟเวอร์ = ปลอมได้ · `getUser` ตรวจจริง
 *       **ทั้งคู่คืนของหน้าตาเหมือนกันเป๊ะ** ต่างกันแค่อันหนึ่งเชื่อได้)
 */

const ROOT = resolve(__dirname, "..", "..");

/** โซนที่กฎนี้บังคับ — โค้ดที่เสิร์ฟให้ผู้ใช้จริง ไม่รวมเทสต์กับสคริปต์ */
const SCANNED = ["lib/auth", "app"];

/** ตัวจับของจริง — **เคสพิสูจน์ข้างล่างต้องเรียกตัวนี้ ไม่ใช่เขียน regex ซ้ำ** (กฎ E0 ข้อ 5) */
function violations(src: string): string[] {
  const code = stripTsComments(src);
  const hits: string[] = [];
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(code)) hits.push("SUPABASE_SERVICE_ROLE_KEY");
  if (/\.auth\s*\.\s*getSession\s*\(/.test(code)) hits.push("auth.getSession()");
  return hits;
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
      found = found.concat(walk(p));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) {
      found.push(p);
    }
  }
  return found;
}

const FILES = SCANNED.flatMap((d) => walk(join(ROOT, d)));

describe("E3-AC9 / D38 — ฝั่งเซิร์ฟเวอร์ต้องไม่มีสิทธิ์มากกว่าเบราว์เซอร์", () => {
  // 🔴 เคสด้านบวกของ "ตัวชุดเช็คเอง" — ถ้าไม่มีไฟล์ให้สแกน ทุกเคสข้างล่างจะเขียวโดยไม่ตรวจอะไรเลย
  //    (P-21 ของ P4: "สแกนแคบลง" กับ "สแกนความว่างเปล่า" ให้ผลเหมือนกันเป๊ะ)
  it("มีไฟล์ให้สแกนจริง และครอบ lib/auth", () => {
    expect(FILES.length).toBeGreaterThan(0);
    expect(FILES.some((f) => f.includes(join("lib", "auth")))).toBe(true);
  });

  it("🔴 ไม่มีไฟล์ไหนแตะ service role key หรือใช้ getSession() ตัดสินสิทธิ์", () => {
    const bad = FILES.map((f) => ({ f, hits: violations(readFileSync(f, "utf8")) })).filter(
      (r) => r.hits.length > 0,
    );
    expect(
      bad.map((r) => `${r.f.slice(ROOT.length + 1)} → ${r.hits.join(", ")}`),
      "เจอ code path ที่ให้สิทธิ์เกินกว่าที่ผู้ใช้มี",
    ).toEqual([]);
  });

  describe("ตัวด่านเอง — ต้องพิสูจน์ทั้งสองทิศ (กฎ E0 ข้อ 1–2)", () => {
    it("ด้านบวก: จับของจริงได้", () => {
      expect(violations(`const k = process.env.SUPABASE_SERVICE_ROLE_KEY;`)).toContain(
        "SUPABASE_SERVICE_ROLE_KEY",
      );
      expect(violations(`const { data } = await supabase.auth.getSession();`)).toContain(
        "auth.getSession()",
      );
    });

    it("🔴 ด้านบวกที่ยากกว่า: จับได้แม้บรรทัดเดียวกันมี URL ที่มี // อยู่", () => {
      // ถ้า stripTsComments กิน `//` ใน URL มันจะกลืนโค้ดจริงที่อยู่หลังจากนั้นไปด้วย
      // → เคสนี้จะแดงทันทีถ้าใครทำ stripper ให้ไร้เดียงสาลง
      const src = `fetch("https://x.example/a"); const k = process.env.SUPABASE_SERVICE_ROLE_KEY;`;
      expect(violations(src)).toContain("SUPABASE_SERVICE_ROLE_KEY");
    });

    it("ด้านลบ: คอมเมนต์ที่ 'พูดถึง' ต้องไม่ถูกจับ — ไม่งั้นเรากดดันให้ลบคำอธิบายทิ้ง", () => {
      expect(violations(`// ⛔ ห้ามใช้ SUPABASE_SERVICE_ROLE_KEY ที่นี่`)).toEqual([]);
      expect(violations(`/* อย่าเรียก supabase.auth.getSession() เพื่อตัดสินสิทธิ์ */`)).toEqual([]);
    });

    it("ด้านลบ: `getUser()` ซึ่งเป็นทางที่ถูก ต้องไม่ถูกจับ", () => {
      expect(violations(`const { data } = await supabase.auth.getUser();`)).toEqual([]);
    });
  });
});
