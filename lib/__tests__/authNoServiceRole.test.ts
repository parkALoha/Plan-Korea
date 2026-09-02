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

/**
 * โซนที่กฎนี้บังคับ — **ทุกไฟล์ที่ build เอาไปเสิร์ฟ** ไม่ใช่รายชื่อที่เรานึกออก
 *
 * 🔴 **แก้ 25 ส.ค. 2026 — ฉบับเดิมเป็น `["lib/auth", "app"]` และมันรั่วอยู่จริงตอนที่เขียนอยู่นี้** (P5 ชี้)
 * `lib/supabase.ts` **สร้าง Supabase client และถูก import จากแทบทุก route** แต่ไม่อยู่ในสองโฟลเดอร์นั้น
 * → **เปลี่ยนคีย์บรรทัดเดียวที่นั่น = ทุก route ได้สิทธิ์ service role โดยด่านนี้ยังเขียว**
 * · `lib/googlePlaces.ts` กับ `lib/travelProvider.ts` ก็อ่าน `GOOGLE_MAPS_API_KEY` นอกโซนเดิมเหมือนกัน
 *
 * 🎯 **รากของช่องไม่ใช่ "ลิสต์สั้นไป" — มันคือ*ทิศของการนับ*** · ลิสต์แบบ "โฟลเดอร์ที่น่าสงสัย"
 * แปลว่า **โฟลเดอร์ที่ไม่มีใครนึกถึง = เขียว** → นับจากทั้งทรีแล้วตัดสิ่งที่รู้ว่าไม่ได้เสิร์ฟออกแทน
 * **ของที่ไม่รู้จักจะได้ถูกตรวจ ไม่ใช่ถูกข้าม**
 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "__tests__",
  "supabase", // SQL ล้วน
  "supabase-platform", // worktree อีกทรี ไม่ใช่โค้ดที่ build ที่นี่
  "docs",
  "public",
]);

/**
 * ทะเบียน env ที่โค้ดเสิร์ฟผู้ใช้อ่านได้ — **ทะเบียน ไม่ใช่ใบอนุญาต**
 *
 * 🔴 การมีชื่ออยู่ที่นี่ **ไม่ได้แปลว่าปลอดภัย** — มันแปลว่า *"มีคนอ้างว่าชื่อนี้ไม่ใช่คีย์ที่มีสิทธิ์"*
 * และคำอ้างนั้นต้องหักล้างได้ → **ชั้น B ตรวจ *ค่าจริง* ของทุกชื่อในนี้** (ยังไม่ลง รอ `Q3`)
 * เพราะชั้น A ตัวเดียวยังโดน `P-30`: **ผู้เขียนตั้งชื่ออะไรก็ได้ = ผลิตเงื่อนไขที่ด่านตรวจได้เอง**
 *
 * `NEXT_PUBLIC_*` ผ่านโดยไม่ต้องลงทะเบียน — **สาธารณะตามนิยามของ Next เอง ไม่ใช่ตามที่เราตัดสิน**
 * (Next ฝังค่าลง bundle ฝั่งเบราว์เซอร์ → ใครก็อ่านได้อยู่แล้ว การ "อนุญาต" จึงไม่มีความหมาย)
 */
const ALLOWED_ENV: Record<string, string> = {
  CRON_SECRET: "app/api/keep-alive — ความลับฝั่งเซิร์ฟเวอร์ ใช้ยืนยันว่า cron เป็นคนเรียก ไม่ใช่คีย์ฐานข้อมูล",
  GOOGLE_MAPS_API_KEY: "คีย์ Google ฝั่งเซิร์ฟเวอร์ · ไม่มีสิทธิ์อะไรกับ Supabase เลย",
  TRAVEL_CACHE_KEY_SALT:
    "salt สำหรับ hash คีย์ travel_time_cache (lib/engine/cacheKey.ts · E3-AC6) — ไม่ใช่ credential ของ Supabase และไม่ให้สิทธิ์อะไรเพิ่มกับใครเลย · หน้าที่เดียวคือทำให้คีย์แคชเดาย้อนไม่ได้ · หักล้างคำอ้างนี้ได้โดยดูว่าไม่มีที่ไหนส่งมันเข้า createClient",
  NODE_ENV: "ตัวแปรของ build tool",
};

/**
 * ทะเบียน **ไฟล์** ที่ยกเว้นจากกฎ — *"เครื่องมือ build-time ไม่ใช่โค้ดที่ถูกเสิร์ฟ"*
 *
 * 🔴 **ยกเว้นเป็น *ไฟล์* ไม่ใช่ *โฟลเดอร์* โดยตั้งใจ** (P1 เสนอ · P4 ตัดสิน · 28 ส.ค. 2026)
 * ยกทั้งโฟลเดอร์ (`scripts/`) = **เปิดที่ว่างถาวรให้ไฟล์ที่ยังไม่มีใครเขียน** — ไฟล์ตัวที่สองใน
 * โฟลเดอร์นั้นจะได้รับการยกเว้นฟรีจากการที่ไม่มีใครนึกถึง · **นั่นคือ *ทิศของการนับ* ที่หัวไฟล์นี้เตือนไว้เอง**
 *
 * 🎯 **และการมีชื่ออยู่ที่นี่ไม่ใช่ใบอนุญาต — เหมือน `ALLOWED_ENV` เป๊ะ:** มันคือ *"มีคนอ้างว่าไฟล์นี้
 * ไม่ถูกเสิร์ฟ"* · **คำอ้างนั้นต้องหักล้างได้** → เคส `ทะเบียนไฟล์ยกเว้น` ข้างล่าง**พิสูจน์คำอ้าง**
 * ด้วยการยืนยันว่า (ก) ไฟล์มีอยู่จริง (ข) **ไม่มีไฟล์ในโซนสแกนไหน import มันเลย**
 * · (ข) คือข้อที่ทำให้มันต่างจาก "เชื่อเพราะอยู่คนละโฟลเดอร์" — ถ้าวันหนึ่งมี route ไหน
 *   `import` เครื่องมือตัวนี้เข้ามา **มันจะกลายเป็นโค้ดที่ถูกเสิร์ฟทันที และด่านจะแดง**
 */
const ALLOWED_FILES: Record<string, string> = {
  "scripts/gen-db-types.mjs":
    "อ่านสคีมาจาก PostgREST OpenAPI เพื่อสร้าง `lib/engine/database.types.ts` · รันด้วยมือตอน dev " +
    "(`npm run gen:types`) · ไม่อยู่ใน build graph ของ Next และไม่มีไฟล์ใน `app/`/`lib/` import — " +
    "🔴 ต้องใช้ service role key เพราะ `anon` ถูก revoke จากคลังเกือบทั้งหมด → OpenAPI จะว่างถ้าใช้คีย์อื่น " +
    "— P1 · 28 ส.ค. 2026",
};

/**
 * รูปของคีย์ที่มีสิทธิ์ **ตามที่ Supabase เป็นคนออกแบบ ไม่ใช่ที่เราคิดขึ้น**
 * 🎯 นี่คือสิ่งที่ทำให้ด่านไม่ถูก `P-30`: ผู้เขียนเปลี่ยน*ชื่อ*ได้ตามใจ
 *    แต่ทำให้คีย์ลับ**เลิกขึ้นต้นด้วยคำนำหน้าของมันเอง**ไม่ได้
 * ⚠️ ประกอบจากชิ้นส่วนโดยตั้งใจ — ถ้าเขียนเต็มคำ ไฟล์นี้จะจับตัวเองได้ทันทีที่มีใครขยายโซนสแกน
 */
const SECRET_PREFIX = "sb_" + "secret_";

/** ตัวจับของจริง — **เคสพิสูจน์ข้างล่างต้องเรียกตัวนี้ ไม่ใช่เขียน regex ซ้ำ** (กฎ E0 ข้อ 5) */
function violations(src: string): string[] {
  const code = stripTsComments(src);
  const hits: string[] = [];
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(code)) hits.push("SUPABASE_SERVICE_ROLE_KEY");
  if (/\.auth\s*\.\s*getSession\s*\(/.test(code)) hits.push("auth.getSession()");

  // 🔴 ชั้น A — **นับชื่อ env ที่ไฟล์นี้อ่าน แล้วเทียบกับทะเบียน** ไม่ใช่ไล่จับชื่อที่เราเดาว่าอันตราย
  //    ทิศนี้ทำให้ **ชื่อที่ไม่รู้จัก = แดง** · ทิศเดิมทำให้ **ชื่อที่ไม่รู้จัก = เขียว**
  //    ซึ่งคือช่องที่ P5 ชี้: คีย์ที่มีสิทธิ์ตัวที่สองจะมองไม่เห็นโดยด่านที่เขียนมาเพื่อจับสิ่งนี้พอดี
  for (const m of code.matchAll(/process\s*\.\s*env\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*["'`]([^"'`]+)["'`]\s*\])/g)) {
    const name = m[1] ?? m[2];
    if (!name || name.startsWith("NEXT_PUBLIC_")) continue;
    if (name === "SUPABASE_SERVICE_ROLE_KEY") continue; // จับไปแล้วข้างบน อย่ารายงานซ้ำ
    if (!(name in ALLOWED_ENV)) hits.push(`env ที่ไม่ได้ลงทะเบียน: ${name}`);
  }

  // 🔴 คีย์ที่ถูกแปะตรง ๆ ไม่ผ่าน `process.env` เลย — **เกิดขึ้นแล้วจริงในทีมนี้**
  if (code.includes(SECRET_PREFIX)) hits.push("คีย์ลับถูกแปะเป็นสตริงในโค้ด");

  return hits;
}

/** path เทียบ root แบบ posix — คีย์ของ `ALLOWED_FILES` ใช้รูปนี้ */
function relFromRoot(p: string): string {
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
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) && !/\.d\.ts$/.test(name)) {
      // ไฟล์ที่ลงทะเบียนยกเว้นไว้ — **คำอ้างถูกพิสูจน์ในเคส `ทะเบียนไฟล์ยกเว้น` ไม่ใช่เชื่อที่นี่**
      if (!(relFromRoot(p) in ALLOWED_FILES)) found.push(p);
    }
  }
  return found;
}

const FILES = walk(ROOT);

describe("E3-AC9 / D38 — ฝั่งเซิร์ฟเวอร์ต้องไม่มีสิทธิ์มากกว่าเบราว์เซอร์", () => {
  // 🔴 เคสด้านบวกของ "ตัวชุดเช็คเอง" — ถ้าไม่มีไฟล์ให้สแกน ทุกเคสข้างล่างจะเขียวโดยไม่ตรวจอะไรเลย
  //    (P-21 ของ P4: "สแกนแคบลง" กับ "สแกนความว่างเปล่า" ให้ผลเหมือนกันเป๊ะ)
  it("🔴 ทะเบียนไฟล์ยกเว้น — ไฟล์ต้องมีอยู่จริง **และต้องไม่มีใครในโซนสแกน import มัน**", () => {
    const entries = Object.keys(ALLOWED_FILES);
    // (ก) ไม่มีรายการค้าง — ไฟล์ถูกลบ/ย้ายแล้วทะเบียนยังชี้ = ทะเบียนโกหก (รูปเดียวกับ stale ใน SURFACE)
    const missing = entries.filter((rel) => {
      try {
        return !statSync(join(ROOT, rel)).isFile();
      } catch {
        return true;
      }
    });
    expect(missing, `ทะเบียนยกเว้นชี้ไฟล์ที่ไม่มีอยู่: ${missing.join(" · ")}`).toEqual([]);

    // (ข) 🔴 **ข้อที่ทำให้การยกเว้นนี้ *พิสูจน์ได้* ไม่ใช่ *ประกาศเอา***
    //     ถ้ามีไฟล์ในโซนสแกน import ไฟล์ที่ยกเว้น → มันเดินเข้า build graph = ถูกเสิร์ฟจริง
    //     → คำอ้าง "เครื่องมือ build-time" เป็นเท็จทันที และต้องแดง
    const importers: string[] = [];
    for (const rel of entries) {
      const base = rel.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
      const needle = base.split("/").pop() ?? base;
      for (const f of FILES) {
        const code = stripTsComments(readFileSync(f, "utf8"));
        const re = new RegExp(`(?:from|require\\(|import\\()\\s*["'\`][^"'\`]*${needle}["'\`]`);
        if (re.test(code)) importers.push(`${relFromRoot(f)} → ${rel}`);
      }
    }
    expect(
      importers,
      "ไฟล์ที่ลงทะเบียนว่า 'ไม่ถูกเสิร์ฟ' ถูก import จากโค้ดในโซนสแกน\n" +
        "  🔴 แปลว่ามันเดินเข้า build graph แล้ว — คำอ้างในทะเบียนเป็นเท็จ\n" +
        "  → ถอดออกจากทะเบียน แล้วทำให้มันไม่แตะคีย์ที่มีสิทธิ์ หรือย้ายส่วนที่ถูก import ออกมา",
    ).toEqual([]);
  });

  it("มีไฟล์ให้สแกนจริง และครอบไฟล์ที่เคยหลุด", () => {
    expect(FILES.length).toBeGreaterThan(0);
    // 🔴 ระบุไฟล์ที่ **เคยหลุดจริง** ไม่ใช่แค่ "โฟลเดอร์มีของ" — ถ้าใครหด `SKIP_DIRS`
    //    หรือย้ายไฟล์ ด่านจะแดงพร้อมชื่อไฟล์ ไม่ใช่เงียบแล้วสแกนน้อยลง
    for (const must of [
      join("lib", "auth", "server.ts"),
      join("lib", "supabase.ts"), // ← ช่องที่ P5 ชี้ · สร้าง client และถูก import แทบทุก route
      join("lib", "googlePlaces.ts"),
      join("app", "api", "keep-alive", "route.ts"),
    ]) {
      expect(
        FILES.some((f) => f.endsWith(must)),
        `ไฟล์ที่ต้องถูกสแกนหายไปจากรายการ: ${must}\n` +
          "  → ถ้าย้ายที่จริง แก้รายการนี้ **พร้อมอธิบายว่าทำไมของใหม่ยังถูกครอบ**",
      ).toBe(true);
    }
  });

  it("🔴 ทะเบียน env ต้องอธิบายทุกชื่อที่มีอยู่ — ไม่ใช่รายชื่อค้างจากอดีต", () => {
    // ทะเบียนที่มีชื่อเกินของจริง = ใบอนุญาตค้างให้คนหยิบไปใช้โดยไม่มีใครทบทวน
    const namesInUse = new Set<string>();
    for (const f of FILES) {
      const code = stripTsComments(readFileSync(f, "utf8"));
      for (const m of code.matchAll(/process\s*\.\s*env\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
        if (!m[1].startsWith("NEXT_PUBLIC_")) namesInUse.add(m[1]);
      }
    }
    const stale = Object.keys(ALLOWED_ENV).filter((n) => !namesInUse.has(n));
    expect(
      stale,
      "ทะเบียนมีชื่อที่ไม่มีโค้ดไหนใช้แล้ว — ถอนออก\n" +
        "  🔴 รายการที่ค้างไว้คือใบอนุญาตที่รอคนหยิบ และมันจะถูกหยิบโดยไม่มีใครทบทวนเหตุผลอีกครั้ง",
    ).toEqual([]);
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

    it("🔴 ชั้น A ด้านบวก: **ชื่อที่ไม่เคยมีใครเห็น** ต้องแดง — นี่คือทั้งหมดที่ช่องของ P5 ต้องการ", () => {
      // ชื่อนี้ไม่อยู่ในทะเบียน และไม่มีใครเดาได้ล่วงหน้า — ด่านเดิม (regex ชื่อเดียว) เขียวสนิท
      expect(violations(`const k = process.env.CACHE_WRITER_TOKEN;`)).toContain(
        "env ที่ไม่ได้ลงทะเบียน: CACHE_WRITER_TOKEN",
      );
      // เขียนแบบวงเล็บก็ต้องจับได้ ไม่งั้นเลี่ยงด่านได้ด้วยการเปลี่ยนวิธีพิมพ์
      expect(violations(`const k = process.env["ANOTHER_SECRET"];`)).toContain(
        "env ที่ไม่ได้ลงทะเบียน: ANOTHER_SECRET",
      );
    });

    it("ชั้น A ด้านลบ: `NEXT_PUBLIC_*` และชื่อที่ลงทะเบียนแล้ว ต้องไม่ถูกจับ", () => {
      expect(violations(`const u = process.env.NEXT_PUBLIC_SUPABASE_URL;`)).toEqual([]);
      expect(violations(`const c = process.env.CRON_SECRET;`)).toEqual([]);
    });

    it("🔴 คีย์ที่แปะเป็นสตริงตรง ๆ ต้องแดง — มันไม่ผ่าน `process.env` เลยสักตัว", () => {
      const pasted = `const k = "${SECRET_PREFIX}AbCdEf123";`;
      expect(violations(pasted)).toContain("คีย์ลับถูกแปะเป็นสตริงในโค้ด");
      // และคอมเมนต์ที่ *พูดถึง* ต้องไม่ถูกจับ ด้วยเหตุผลเดียวกับ D40
      expect(violations(`// ห้ามแปะคีย์ที่ขึ้นต้นด้วย ${SECRET_PREFIX} ลงไฟล์`)).toEqual([]);
    });
  });
});
