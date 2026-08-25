import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
/**
 * ของกลางที่ชุดเทสต์หลายไฟล์ใช้ร่วมกัน — **ไม่ใช่ไฟล์เทสต์** (vitest เก็บเฉพาะ `*.test.ts`)
 *
 * 🔴 **ทำไมต้องมีไฟล์นี้:** `stripTsComments` เคยมี 2 ที่จะเกิดขึ้น — `authNoServiceRole.test.ts`
 * เขียนไว้ก่อน แล้ว `mockShape.test.ts` เกือบเขียนซ้ำอีกตัว
 * **ตัวตัดคอมเมนต์ 2 ชุดที่ต่างกันนิดเดียว จะทำให้ด่าน 2 ตัวมองไฟล์เดียวกันคนละแบบ**
 * และช่องจะอยู่ตรงตัวที่หลวมกว่า โดยอ่านทีละไฟล์แล้วถูกทั้งคู่ — `D46`
 */

/**
 * ตัดคอมเมนต์ TS ออกก่อน match
 *
 * 🔴 **จำเป็น ไม่ใช่ของแถม** — ไฟล์ที่อธิบายว่า *"ห้ามเขียนแบบนี้"* จะมีตัวอย่างของสิ่งที่ห้าม
 * อยู่ในคอมเมนต์เสมอ · ด่านที่อ่านทั้งไฟล์จะแดงใส่ไฟล์ที่อธิบายเหตุผลของตัวมันเอง
 * แรงกดดันที่ตามมาคือ **ลบคำอธิบายทิ้งให้เทสต์เขียว = ลบความรู้เพื่อให้ตัวเลขสวย**
 * (บทเรียน `D40` — เจอกับ `rls-policies.sql` ของ P4 · กฎ gitleaks ของ P6 · และด่าน `S6` ของ P1)
 *
 * ⚠️ **เดินทีละตัวอักษรและรู้ว่าอยู่ในสตริงหรือไม่ โดยตั้งใจ:** ตัดแบบไร้เดียงสาจะกิน `//`
 * ที่อยู่ใน `"https://…"` แล้วกลืนโค้ดจริงที่เหลือของบรรทัดไปด้วย
 * → **จับของจริงไม่เจอ ซึ่งเป็นทิศที่แย่กว่าจับผิด**
 */
export function stripTsComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (quote) {
      if (c === "\\") {
        out += c + (next ?? "");
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i++;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }

    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

/**
 * อ่านค่าจาก env แล้ว `.trim()` — **ที่เดียวในไฟล์ที่ยอมให้มีช่องว่างส่วนเกิน** (F2 · P4 พบ)
 *
 * 🔴 ทำไมต้อง trim ที่นี่ ไม่ใช่ใน `keyRole`: คีย์จริงไม่มีช่องว่างอยู่ในตัวมันเลย
 * ช่องว่างมาจาก**ทางเดินของค่า** (คัดลอกจาก dashboard · แปะเข้า GitHub Secrets · here-doc ใน shell)
 * `keyRole` จึงต้องเข้มไว้ — ของที่มีช่องว่างคือของที่ยังไม่ได้ทำความสะอาด **ไม่ใช่คีย์ที่ใช้ได้**
 * ⚠️ ถ้าย้าย trim เข้าไปใน `keyRole` ด่านจะยอมรับค่าที่ไม่เคยผ่านการทำความสะอาด และเราจะไม่รู้เลย
 * ว่ามีที่ไหนอีกในระบบที่ส่งคีย์แบบมี `\n` ต่อท้ายเข้ามา
 */
export function readEnvKey(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * ด่านเดียวของทุกชุดที่ต้องใช้ฐานจริง — **ห้ามมีสองชุด** (`D67`)
 *
 * 🔴 ปัญหาที่มันแก้: `vitest` **ไม่โหลด `.env.local` ให้** · `npx vitest run` เปล่า ๆ จึงขึ้น
 * `224 passed | 59 skipped` ซึ่ง **อ่านเหมือนผ่านสบาย ๆ** ทั้งที่ชุดสดไม่ได้รันเลยสักเคส
 * · ตัวเลข "ผ่าน" ที่ใหญ่กว่าตัวเลข "ข้าม" ทำให้สายตาไม่สะดุด — เป็นรูปที่ `E0` เตือนไว้ทั้งข้อ
 *
 * 🎯 **และรูนี้เกิดกับไฟล์ที่ P4 เขียนเองเมื่อวาน**: `authProviders.test.ts` มีด่านของตัวเอง
 * ที่เขียนว่า `expect(true).toBe(true)` — **จริงเสมอ ไม่ว่าอะไรจะเกิดขึ้น**
 * `rlsMatrix` มีด่านที่ทำงานจริง แต่**ครอบแค่ไฟล์ตัวเอง** → ไฟล์ที่สองจึงหลุดทั้งไฟล์
 *
 * ⚠️ ชื่อ env ยังเป็น `RLS_MATRIX_REQUIRED` ทั้งที่ตอนนี้ครอบมากกว่าเมทริกซ์ — **จงใจไม่เปลี่ยน**
 * เพราะ CI ตั้งค่าไว้แล้วด้วยชื่อนี้ · เปลี่ยนชื่อ = ด่านหายไปเงียบ ๆ ในรอบที่ CI ยังไม่ได้แก้ตาม
 */
export function requireLiveCreds(hasCreds: boolean, label: string, needed: string[]): void {
  if (process.env.RLS_MATRIX_REQUIRED === "1") {
    if (!hasCreds) {
      throw new Error(
        `RLS_MATRIX_REQUIRED=1 แต่ "${label}" ไม่มี creds ครบ\n` +
          `  ต้องมี: ${needed.join(" · ")}\n` +
          `  🔴 ชุดนี้ **ข้าม ไม่ใช่ผ่าน** — และ "ข้าม" อ่านเป็นเขียวได้ใน CI`,
      );
    }
    return;
  }
  if (!hasCreds) {
    console.warn(
      `\n⚠️  ข้ามชุดสด "${label}" เพราะไม่มี creds — **นี่ไม่ใช่การผ่าน**\n` +
        `    ต้องมี: ${needed.join(" · ")}\n` +
        `    รันแบบนี้: set -a && . ./.env.local && set +a && npx vitest run\n`,
    );
  }
}

/**
 * รหัสประเทศที่แต่ละบล็อกในชุดทดสอบ **จองไว้** — `catalog_countries.id` เป็น `[a-z]{2}`
 *
 * 🔴 **ทำไมต้องมีทะเบียน ไม่ใช่แค่ระวัง** (P4 เจอ 25 ส.ค. 2026)
 * namespace มีแค่ **676 ค่า** และทุกบล็อกในไฟล์เดียวกันแชร์มัน · P1 กับ P4 เลือก `"zz"` ตรงกัน
 * โดยไม่รู้ → `beforeAll` ของบล็อกหลังล้มด้วยคีย์ซ้ำ → **8 + 4 = 12 เคสถูก *ข้าม* ไม่ใช่ *แดง***
 * ```
 * Tests  349 passed | 12 skipped     ← อ่านเหมือนรันสบาย ๆ
 * ```
 * 🎯 **บทเรียนที่ P4 ขอให้จดคือข้อนี้ ไม่ใช่ "ระวังชนกัน":**
 * > **การเก็บกวาด/เตรียมที่ล้มเงียบ ทำให้รอบถัดไปถูก *ข้าม* — และ "ข้าม" อ่านเป็นเขียวเสมอ**
 *
 * ค่าที่ใช้ทั้งหมดอยู่ในช่วง **user-assigned ของ ISO 3166-1** (`AA` · `QM`–`QZ` · `XA`–`XZ` · `ZZ`)
 * — ไม่ใช่ประเทศจริงและจะไม่มีวันเป็น จึงชนกับข้อมูลจริงไม่ได้ตามนิยาม
 *
 * ⚠️ **เพิ่มบล็อกใหม่ = เพิ่มคีย์ที่นี่ ไม่ใช่พิมพ์สตริงในบล็อก** · เคส `ทะเบียนรหัสประเทศ`
 * ใน `rlsMatrix.test.ts` จะแดงถ้ามีค่าซ้ำ **ก่อนที่มันจะไปโผล่เป็น "ข้าม" ตอนรัน**
 */
export const TEST_COUNTRY_CODES = {
  /** บล็อกคลังภูมิศาสตร์ (`catalog_countries` · `catalog_cities`) — P1 */
  catalogGeo: "zz",
  /** บล็อกคลังสถานที่ (`catalog_places` · `catalog_place_names`) — P1 */
  catalogPlaces: "zy",
  /** บล็อก `custom_places` — P1 */
  customPlaces: "zx",
  /** บล็อก `trip_stops` — P1 */
  tripStops: "zw",
  /** บล็อกตรวจว่าคลังเขียนจากไคลเอนต์ไม่ได้ — P4 (ยังใช้สตริงในบล็อกตัวเอง · จองไว้ที่นี่กันคนอื่นหยิบ) */
  catalogWriteGuard: "xq",
  /** บล็อก soft delete (`D76`) — P1 */
  softDelete: "zv",
  /** บล็อก `bookings` — P1 */
  bookings: "zu",
  /** บล็อก `checklist_items` · `place_notes` · `hidden_places` — P1 */
  tripContent: "zt",
  /** บล็อก `trip_hotels` (`D51`) — P1 */
  tripHotels: "zs",
  /** บล็อกข้อความ error ของ soft-delete RPC (`P-53`) — P4 */
  rpcMessages: "xr",
  /** บล็อกกิ่ง update ที่ตัวนับ `E2-AC11` หาเจอ — P4 */
  updateBranches: "xs",
  /** บล็อกกวาดคนนอกทุกตาราง (`E2-AC1`) — P4 */
  outsiderSweep: "xt",
} as const;

/** โฟลเดอร์ migration ที่ **รันจริง** — ไม่ใช่เอกสารออกแบบ (ต่างกันแล้วหลายสิบบรรทัด) */
export const MIGRATIONS_DIR = resolve(process.cwd(), "supabase-platform/supabase/migrations");

/** ไฟล์ migration ทั้งหมด · สแกนทั้งโฟลเดอร์ ไม่ระบุชื่อ — ตัวใหม่ถูกครอบเองโดยไม่ต้องแก้เทสต์ */
export const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => join(MIGRATIONS_DIR, f));

/**
 * ตัดคอมเมนต์ SQL ออกก่อน match — **ตัวเดียวของทั้งชุด** (`D67`)
 *
 * 🔴 matcher ที่อ่านทั้งไฟล์จะ **แดงใส่ไฟล์ที่อธิบายว่าทำไมสิ่งนั้นถึงต้องห้าม**
 * แรงกดดันที่มันสร้างคือ *"ลบคอมเมนต์ทิ้งให้เทสต์เขียว"* = **ลบความรู้เพื่อให้ตัวเลขสวย**
 * ⚠️ ข้อจำกัดที่รู้อยู่: `--` ที่อยู่**ข้างในสตริง**จะถูกตัดตามไปด้วย → อาการคือ **จับของจริงไม่เจอ**
 */
export function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * ตารางที่ **ยังมีอยู่** ตามที่ไฟล์ migration บอก — `create` เพิ่ม · `drop` หัก
 *
 * 🔴 **ฉบับแรกของผมอ่านแต่ `create table`** → ตารางที่สร้างแล้วลบทีหลังถูกนับว่ายังอยู่
 * · P1 เจอทันทีจากเคส `MISSING` (`rls_force_probe` ที่เขาสร้างแล้วลบ) **และเคสนั้นแดงเพราะกลไก
 *   ทำงานถูก ไม่ใช่เพราะฐานผิด** · เขาแก้ให้แล้ว — ฉบับนี้แก้ต่ออีก 2 ข้อที่ยังเหลือ
 *
 * ⚠️ **① ต้องเดินตามลำดับในไฟล์ ไม่ใช่ "create ทั้งหมดก่อน แล้วค่อย drop ทั้งหมด"**
 *    `drop` แล้ว `create` ใหม่ในไฟล์เดียวกันคือสำนวนปกติของ migration
 *    → แบบเดิมจะได้ผลลัพธ์ว่า *"ไม่มีตารางนี้"* ทั้งที่มันมีอยู่ **แล้วเคส `TRUNCATE` จะข้ามมันไปเงียบ ๆ**
 *    🎯 ทิศนี้แย่กว่าที่ P1 เจอ: ของเขาแดงผิด (ดัง) **ของนี้ตรวจไม่ครบ (เงียบ)**
 * ⚠️ **② `drop table` รับหลายชื่อคั่นด้วยจุลภาค** — `drop table public.a, public.b;`
 *    regex ที่จับชื่อเดียวจะหักออกแค่ตัวแรก
 *
 * 📌 วันนี้ทั้งสองข้อยังไม่กัด (มี `drop` จริงแค่ตัวเดียวและอยู่ไฟล์ของมันเอง)
 *    **เขียนกันไว้เพราะสำนวนพวกนี้จะมาแน่ และตอนมันมาจะไม่มีใครนึกถึงไฟล์นี้**
 */
export function tablesFromMigrations(sources?: string[]): string[] {
  const alive = new Set<string>();
  const bodies = sources ?? migrationFiles.map((f) => readFileSync(f, "utf8"));
  for (const raw of bodies) {
    const sql = stripComments(raw);
    // จับ `create|drop table [if …] public.a[, public.b…]` **เรียงตามที่ปรากฏจริง**
    for (const m of sql.matchAll(
      /\b(create|drop)\s+table\s+(?:if\s+not\s+exists\s+|if\s+exists\s+)?((?:public\.[a-z_][a-z0-9_]*\s*,?\s*)+)/gi,
    )) {
      const verb = m[1].toLowerCase();
      for (const n of m[2].matchAll(/public\.([a-z_][a-z0-9_]*)/gi)) {
        const name = n[1].toLowerCase();
        if (verb === "create") alive.add(name);
        else alive.delete(name);
      }
    }
  }
  return [...alive].sort();
}

/**
 * ตารางที่ **ผูกกับทริป** — มีคอลัมน์ `trip_id` เป็นของตัวเอง
 *
 * 🎯 **แบ่งด้วยคุณสมบัติของสคีมา ไม่ใช่ด้วยรายชื่อที่พิมพ์ไว้** — ตารางเนื้อหาตัวใหม่ของ `E3`/`E5`
 * จะเข้ารายการนี้เองทันทีที่มันมี `trip_id` **แล้วเคสกวาดคนนอกจะบังคับให้มีคนวาง fixture ให้มัน**
 * · ถ้าใช้รายชื่อที่พิมพ์ไว้ ตารางใหม่จะได้รับการยกเว้นฟรีจากการที่ไม่มีใครนึกถึง — `P-21`
 */
export function tripScopedTables(): string[] {
  const cols = new Map<string, string>();
  const alive = new Set(tablesFromMigrations());
  for (const f of migrationFiles) {
    const sql = stripComments(readFileSync(f, "utf8"));
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)\s*\(([\s\S]*?)\n\);/gi,
    )) {
      cols.set(m[1].toLowerCase(), m[2]);
    }
  }
  return [...alive].filter((t) => /^\s*trip_id\s/m.test(cols.get(t) ?? "")).sort();
}

/**
 * นิยาม **ล่าสุด** ของทุกฟังก์ชัน — `create or replace` ที่รันทีหลังชนะ
 *
 * 🔴 **คู่ของ `policyMapOrdered()` แต่สำหรับฟังก์ชัน** · เหตุผลเดียวกันเป๊ะ:
 * **ไฟล์บอกว่า *เคยเขียนว่าอะไร* ไม่ได้บอกว่า *ตอนนี้เป็นอะไร***
 * · เกิดจริง 25 ส.ค. 2026: P4 อ่าน `app.assert_day_has_no_stops` จากไฟล์ที่สร้างมัน
 *   แล้วสรุปว่ามันไม่กรอง `deleted_at` **ทั้งที่ไฟล์ที่รันทีหลัง replace ไปแล้วพร้อมตัวกรอง**
 *   → เกือบรายงานบั๊กที่ถูกแก้ไปแล้ว · **ตรวจกับฐานจริงคือสิ่งที่กันไว้ ไม่ใช่การอ่านให้ละเอียดขึ้น**
 * ⚠️ **ยังไม่ใช่สภาพของฐาน** — คือสภาพของ*ไฟล์เมื่อรันครบ* · ใครแก้ฟังก์ชันจากแดชบอร์ด ตัวนี้ไม่เห็น
 */
export function effectiveFunctions(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of migrationFiles) {
    const sql = readFileSync(f, "utf8");
    for (const m of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+((?:app|public)\.\w+)\s*\(/gi,
    )) {
      const rest = sql.slice(m.index ?? 0);
      const end = rest.indexOf("\n$$;");
      out.set(m[1].toLowerCase(), stripComments(end > 0 ? rest.slice(0, end) : rest.slice(0, 4000)));
    }
  }
  return out;
}
