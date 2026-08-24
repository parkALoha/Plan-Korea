import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Test matrix ของ RLS — DoD พิเศษของ E1 (ใช้ต่อใน E2)
 *
 * ขอบเขตที่ไฟล์นี้ครอบ / ไม่ครอบ — เขียนไว้ตรงนี้เพราะ "เหตุผลที่ครอบแคบกว่าที่คนอ่านเข้าใจ"
 * คือชนิดของบั๊กที่เอกสารความปลอดภัยของเราจัดเป็นหมวดจับยากที่สุด:
 *   ครอบ    = `profiles` · `trips` · `trip_members` (3 ตารางของ E1) ผ่าน **PostgREST ด้วย JWT จริง**
 *             ซึ่งเป็นเส้นทางเดียวกับที่ browser ใช้ → วัด RLS ตามที่ผู้ใช้จะเจอจริง
 *   ไม่ครอบ = ตารางเนื้อหาของ E2 (ยังไม่มี) · Storage · Realtime
 *           · **การต่อ Postgres ตรง** — ตั้งใจไม่ทำ เพราะ service role มี BYPASSRLS
 *             จะทำให้ทุกเคสผ่านโดยไม่ได้ทดสอบ RLS เลยสักข้อ
 *
 * 🔴 3 กับดักที่ทำให้ matrix แบบนี้ "เขียวหลอก" — กันไว้ทั้งสามข้อในไฟล์นี้:
 *   1. ใช้ service-role key ใน client ทดสอบ → ข้าม RLS หมด → ทุกเคสผ่าน
 *      → `assertAnonKey()` ตรวจ `role` ใน JWT ก่อนรันเคสใดๆ
 *   2. assert ด้วย `error` สำหรับ SELECT → RLS **ไม่ throw** มันคืน 200 + `[]`
 *      → ทุกเคสอ่านเทียบ `data` ไม่ใช่ `error`
 *   3. **เคสด้านลบล้วน** → ถ้า RLS บล็อกทุกอย่าง (เช่นแถว `trip_members` ไม่ถูกสร้าง)
 *      เคส "ต้องถูกบล็อก" จะผ่านหมดจากระบบที่ใช้งานไม่ได้เลย
 *      → เคสด้านบวกรันเป็น **precondition** ถ้าแดง ทั้งชุดถือว่า inconclusive ไม่ใช่ pass
 */

/**
 * 🔴 ต้องอ่าน **ไฟล์ที่รันจริง** ไม่ใช่เอกสารออกแบบ
 *
 * ฉบับแรกอ่าน `docs/engine/schema/0001_identity.sql` ซึ่งเป็นเอกสาร · ของที่ `db push` เอาไปรัน
 * คือไฟล์ใน `supabase-platform/supabase/migrations/` — สองไฟล์นี้ **ต่างกัน 69 บรรทัดแล้ว**
 * (self-check ถูกย้ายออก + guard กันรันผิดฐานถูกเพิ่มเข้า) และจะต่างขึ้นเรื่อยๆ ทุกครั้งที่แปลง
 * → AC2 ที่อ่านเอกสารคือ **การรับรองสิ่งที่ไม่ได้รัน** ซึ่งเป็นรูปแบบเดียวกับที่ทีมเจอมาแล้ว
 *   ตอนไฟล์ SQL วางอยู่นอกโฟลเดอร์ที่ pipeline อ่าน
 *
 * สแกน **ทุกไฟล์** ในโฟลเดอร์ ไม่ใช่ระบุชื่อ — migration ของ E2 จะถูกครอบเองโดยไม่ต้องแก้เทสต์
 */
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase-platform/supabase/migrations");
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => join(MIGRATIONS_DIR, f));

/**
 * อ่านค่าจาก env แล้ว `.trim()` — **ที่เดียวในไฟล์ที่ยอมให้มีช่องว่างส่วนเกิน** (F2 · P4 พบ)
 *
 * 🔴 ทำไมต้อง trim ที่นี่ ไม่ใช่ใน `keyRole`: คีย์จริงไม่มีช่องว่างอยู่ในตัวมันเลย
 * ช่องว่างมาจาก**ทางเดินของค่า** (คัดลอกจาก dashboard · แปะเข้า GitHub Secrets · here-doc ใน shell)
 * `keyRole` จึงต้องเข้มไว้ — ของที่มีช่องว่างคือของที่ยังไม่ได้ทำความสะอาด **ไม่ใช่คีย์ที่ใช้ได้**
 * ⚠️ ถ้าย้าย trim เข้าไปใน `keyRole` ด่านจะยอมรับค่าที่ไม่เคยผ่านการทำความสะอาด และเราจะไม่รู้เลย
 * ว่ามีที่ไหนอีกในระบบที่ส่งคีย์แบบมี `\n` ต่อท้ายเข้ามา
 */
function readEnvKey(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * สร้าง client สำหรับเทสต์ — **ทุกที่ในไฟล์นี้ต้องผ่านตัวนี้ ห้ามเรียก `createClient` ตรง**
 *
 * 🔴 F1 (P4 พบ · P1 ยืนยันด้วยการรัน): `supabase-js 2.112` สร้าง `RealtimeClient` ใน constructor
 * **เสมอ** แม้เราไม่ได้ใช้ Realtime เลยสักเคส · บน Node 20 ไม่มี `globalThis.WebSocket`
 * (เพิ่งมีตั้งแต่ Node 22) → `createClient` โยนทิ้งตั้งแต่บรรทัดแรกของ `beforeAll`
 *
 * 🎯 **อาการที่ทำให้มันรอดมาถึงวันนี้:** ผลรวมยังพิมพ์ว่า `16 passed | 22 skipped`
 * โดยความล้มเหลวไปโผล่แยกเป็น "Failed Suites 1" — **อ่านเหมือนปัญหาสภาพแวดล้อม ไม่ใช่ปัญหา RLS**
 * และ `RLS_MATRIX_REQUIRED=1` ที่มีไว้แปลง skip เป็น fail **ไม่ครอบทางเข้านี้**
 * → นี่คือเหตุผลที่ `owner_id` (คอลัมน์ที่ `P-15` เปลี่ยนชื่อไปแล้ว) อยู่ในไฟล์นี้ได้โดยไม่มีใครเห็น:
 *   **ไม่เคยมีใครรันชุดสดได้จริงสักครั้ง**
 *
 * **ทางแก้ (P4 พิสูจน์บนเครื่องนี้ · ดีกว่าที่ผมทำไปตอนแรก):** ส่ง `transport` เข้าไปเอง
 * `RealtimeClient` ใช้ `options?.transport ?? WebSocketFactory.getWebSocketConstructor()`
 * → **ส่งมาแล้วตัวที่โยนไม่ถูกเรียกเลย** · ไม่ต้องอัป Node ไม่ต้องลง dependency สักตัว
 *
 * 🎯 และสตับตัวนี้ **ไม่ใช่แค่ทางเลี่ยง มันเป็นด่านเพิ่ม**: ชุดนี้ไม่ได้ใช้ realtime เลยสักบรรทัด
 * (P4 grep `channel(` `subscribe` `realtime` `broadcast` `postgres_changes` — ไม่เจอสักตัว)
 * ถ้าวันหนึ่งมีใครเผลอเปิด socket ในเมทริกซ์ **มันจะแดงพร้อมบอกเหตุผล ไม่ใช่เงียบแล้วทำงานได้**
 * — ตรงกับหลักของไฟล์นี้: ถ้าความล้มเหลวไม่ส่งเสียง ต้องไปตั้งใจทำให้มันส่งเสียง
 *
 * ⚠️ **ยังยืนยันไม่ได้ว่า Node 20 ไม่มีกับดักตัวที่สองรออยู่** หลังจากนี้ (`auth.admin.createUser`,
 * `signInWithPassword`) — ต้องมี creds จริงถึงจะรู้ · **อย่านับว่า F1 ปิดสนิทจนกว่าชุดสดจะขยับจริง**
 * 📌 หนี้ที่ยังไม่จ่าย: `supabase-js` เตือนทุกครั้งว่า Node ≤20 เลิกซัพพอร์ตแล้ว · `ci.yml` ปักหมุด
 * `20.12.2` ทั้ง 2 job โดยไม่มี `.nvmrc`/`engines` บอกใครเลยว่าเวอร์ชันนี้สำคัญ → ส่ง P6 แล้ว
 */
const NO_SOCKET = function () {
  throw new Error(
    "เมทริกซ์ RLS ต้องไม่เปิด WebSocket — ถ้าเห็น error นี้ แปลว่ามีเคสไหนเริ่มใช้ realtime\n" +
      "  ทางแก้ที่ถูกคือถามว่าเคสนั้นควรใช้ realtime จริงไหม **ไม่ใช่เปลี่ยนสตับนี้ให้เป็น socket จริง**",
  );
} as unknown as never;

function testClient(key: string): SupabaseClient {
  return createClient(URL_, key, {
    auth: { persistSession: false },
    realtime: { transport: NO_SOCKET },
  });
}

const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const ANON = readEnvKey("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const hasCreds = Boolean(URL_ && ANON && SERVICE);

/**
 * บอกว่าคีย์ใบนี้เป็นคีย์ **ระดับไหน** — กันความผิดพลาดที่แพงที่สุดของชุดนี้:
 * หยิบ service key มาใส่ช่อง anon แล้วเมทริกซ์เขียวทั้งแผงโดยไม่ได้ทดสอบ RLS เลยสักเคส
 * (service role ข้าม RLS โดยนิยาม — ทุกเคส "ถูกปฏิเสธ" จะกลายเป็น "ทำได้" เงียบ ๆ)
 *
 * 🔴 ต้องรองรับ **2 รูปแบบพร้อมกัน** เพราะโปรเจกต์นี้ใช้ทั้งคู่อยู่จริงวันนี้:
 *   · `engine-dev` (แพลตฟอร์ม) ใช้คีย์รุ่นใหม่ `sb_publishable_…` / `sb_secret_…` — **ไม่ใช่ JWT**
 *   · DB ทริป (`main`) ยังใช้ JWT รุ่นเก่า `eyJ…` ที่ถอด claim `role` ได้
 * ฉบับเดิมรองรับแค่ JWT → คืน `null` กับคีย์ใหม่ทั้งสองใบ → เคสด้านล่างล้มแน่นอน
 * แม้ตั้ง secret ถูกทุกช่อง (P6 จำลองยืนยัน · P1 ตรวจซ้ำ 24 ส.ค. 2026)
 *
 * ⚠️ **ด่านนี้ไม่ได้แข็งเท่ากันทั้งสองทาง และต้องรู้ว่าอ่อนลงตรงไหน:**
 *   JWT → `role` เป็น **claim ที่เซิร์ฟเวอร์เซ็นไว้** · คีย์ใหม่ → prefix เป็นแค่ **ป้ายชื่อในสตริง**
 *   ใครตั้งชื่อตัวแปรว่า `sb_publishable_…` แล้วยัดค่า secret ลงไป ด่านนี้จับไม่ได้
 *   → มันกัน "หยิบผิดใบ" (ซึ่งเป็นสิ่งที่เกิดจริง) **ไม่ได้กัน "ตั้งใจปลอม"**
 *
 * 🔴 รูปแบบที่ไม่รู้จัก → คืน `null` = **ล้ม ไม่ใช่ผ่าน** (ตรวจไม่ได้ ≠ ปลอดภัย)
 */
function keyRole(key: string): string | null {
  // F2 (P4): คีย์ที่มีช่องว่างที่ไหนก็ตาม = ยังไม่ผ่านการทำความสะอาด → ปฏิเสธ
  // 🔴 ทิศที่ P4 ชี้ว่าอันตรายคือ `\n` **ต่อท้าย** ซึ่งฉบับก่อน **ผ่าน** ด่านไปได้
  //    (ขณะที่เว้นวรรค **นำหน้า** ล้ม) — ทิศที่ผ่านคือทิศที่เกิดง่ายที่สุดตอนแปะคีย์ด้วยมือ
  //    การทำความสะอาดเกิดที่ `readEnvKey` ที่เดียว · ที่นี่เข้มไว้เพื่อให้รู้ว่ามีทางไหนที่ยังไม่สะอาด
  if (/\s/.test(key)) return null;

  // คีย์รุ่นใหม่ — ไม่มีจุด ไม่มี payload ให้ถอด แยกได้จาก prefix เท่านั้น
  // F4 (P4): ต้องมีตัวคีย์จริงหลัง prefix · `sb_publishable_` เปล่า ๆ เคยอ่านเป็นคีย์ที่ใช้ได้
  if (/^sb_publishable_.+$/.test(key)) return "anon";
  if (/^sb_secret_.+$/.test(key)) return "service_role";

  // คีย์รุ่นเก่า — JWT · base64url ไม่ใช่ base64 ธรรมดา (payload มี `-`/`_` ได้)
  const payload = key.split(".")[1];
  if (!payload) return null;
  try {
    const role: unknown = JSON.parse(Buffer.from(payload, "base64url").toString()).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/**
 * ตัดคอมเมนต์ SQL ออกก่อน match
 *
 * ทำไมต้องมี: ไฟล์ schema อธิบายไว้เองว่า `using (true)` คือบั๊กที่ต้องห้าม (บทเรียน B2)
 * → matcher ที่อ่านทั้งไฟล์จะ **แดงใส่ไฟล์ที่อธิบายว่าทำไมสิ่งนั้นถึงต้องห้าม**
 * แรงกดดันที่มันสร้างคือ "ลบคอมเมนต์ทิ้งให้เทสต์เขียว" = **ลบความรู้เพื่อให้ตัวเลขสวย**
 * ซึ่งแย่กว่าไม่มีเทสต์ (P6 ชนโจทย์เดียวกันกับกฎ gitleaks ที่จับ `.md` ที่แค่พูดถึงชื่อ env)
 *
 * ⚠️ ข้อจำกัดที่รู้อยู่: `--` ที่อยู่ **ข้างในสตริง** จะถูกตัดตามไปด้วย → บรรทัดนั้นสั้นลง
 * ปัจจุบันไฟล์ไม่มีเคสแบบนั้น · ถ้าวันหนึ่งมี อาการคือ **จับของจริงไม่เจอ ไม่ใช่จับผิด**
 * ซึ่งเป็นทิศที่แย่กว่า → เคส "matcher แยกได้" ข้างล่างมีไว้ให้แดงถ้าตัดจนไม่เหลืออะไร
 */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** หา policy ที่ปล่อยผ่าน — ใช้ตัวเดียวกันทั้งกับไฟล์จริงและกับเคสล็อกขอบเขต */
function permissiveIn(sql: string): string[] {
  return stripComments(sql).match(/(?:using|with check)\s*\(\s*true\s*\)/gi) ?? [];
}

// ───────────────────────────────────────────────────────────────────────────
// ส่วนที่รันได้เสมอ ไม่ต้องมี DB
// ───────────────────────────────────────────────────────────────────────────
describe("E1-AC2 — migration ต้องอ้าง identity จริง", () => {
  // 🔴 กันกรณี glob ไม่ match อะไรเลย → เคสข้างล่างจะเขียวจากไฟล์ศูนย์ไฟล์
  it("มีไฟล์ migration ให้ตรวจจริง", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  const whole = migrationFiles.map((f) => readFileSync(f, "utf8")).join("\n");

  // 🔴 สแกนเฉพาะส่วน DDL (ก่อน `commit;`) ไม่รวมบล็อก self-check ท้ายไฟล์
  //    เพราะ self-check ของ P1 **มีสตริง `using (true)` กับ `force row level security`
  //    อยู่ในตัว query ที่ใช้ตรวจหาของพวกนั้น** → สแกนทั้งไฟล์จะจับตัวตรวจแทนที่จะจับของจริง
  //    (เจอตอนรันจริง เพราะเทสต์แดง — ไม่ใช่เพราะไปนั่งอ่านเจอ)
  const sql = stripComments(whole.split(/^commit;/m)[0]);

  it("ตัดบล็อก self-check ออกได้จริง — ไม่งั้นเคสข้างล่างวัดผิดไฟล์", () => {
    expect(sql.length).toBeGreaterThan(1000);
    expect(sql.length).toBeLessThan(whole.length);
    expect(sql).not.toContain("self-check");
  });

  // 🔴 เคสล็อกขอบเขตของตัว matcher เอง — ต้องแยก "ใช้จริง" ออกจาก "พูดถึง" ได้
  //    ถ้าไม่มีคู่นี้ การตัดคอมเมนต์อาจกลายเป็นการตัดจนไม่เหลืออะไรให้จับ แล้วเงียบตลอดกาล
  //    ⚠️ ทั้งสองเคสวิ่งผ่าน `stripComments` + regex **ตัวเดียวกับที่ใช้กับไฟล์จริง**
  //       ไม่ใช่ตรรกะคู่ขนาน ไม่งั้นมันจะพิสูจน์คนละอย่างกับที่รันจริง
  it("matcher แยก 'พูดถึงในคอมเมนต์' ออกจาก 'เขียนใน SQL จริง' ได้", () => {
    const mentionOnly = [
      "-- ⚠️ ห้ามเขียน using (true) เด็ดขาด (บทเรียน B2)",
      "/* ฉบับเก่าเคยเป็น with check (true) ทั้งไฟล์ */",
      "create policy p on public.t for select to authenticated using (app.can_read_trip(id));",
    ].join("\n");
    expect(permissiveIn(mentionOnly), "คอมเมนต์ที่พูดถึงกลับถูกจับ = เทสต์ลงโทษการอธิบายเหตุผล").toEqual([]);

    const forReal = "create policy p on public.t for select to authenticated using (true);";
    expect(permissiveIn(forReal), "SQL จริงหลุด = matcher ตัดมากเกินไป").not.toEqual([]);

    // `--` ท้ายบรรทัดที่มี SQL จริงอยู่ข้างหน้า ต้องยังจับได้
    expect(permissiveIn("... using (true); -- ตั้งใจไว้ชั่วคราว")).not.toEqual([]);
  });

  it("มี auth.uid() มากกว่า 0 จุด (31 migration เดิมได้ 0)", () => {
    expect((sql.match(/auth\.uid\(\)/g) ?? []).length).toBeGreaterThan(0);
  });

  it("🔴 ไม่มี policy ไหนเป็น using (true) / with check (true)", () => {
    expect(permissiveIn(sql)).toEqual([]);
  });

  it("ไม่มี grant แบบเหมารวม (กฎข้อ 5)", () => {
    expect(sql.match(/^grant[^\n;]*\bon all\b/gim) ?? []).toEqual([]);
  });

  it("🔴 ไม่มี force row level security — ถ้ามี กลไก SECURITY DEFINER พังทั้งชุด", () => {
    expect(sql.match(/force\s+row\s+level\s+security/gi) ?? []).toEqual([]);
  });

  // 🔴 เคสคู่ (กฎข้อ 1/2): พิสูจน์ว่าตัวตรวจ *ตรวจเจอ* ได้จริง ไม่ใช่ regex ที่ไม่เคย match อะไร
  //    ยิงตัวตรวจเดียวกันใส่ migration เดิมซึ่งรู้อยู่แล้วว่าเป็น `using (true)` ทั้งไฟล์
  //    ถ้าเคสนี้ไม่เจอ แปลว่าตัวตรวจเสีย ไม่ใช่ว่าไฟล์ใหม่สะอาด — และเคสข้างบนก็เชื่อไม่ได้ตามไปด้วย
  it("ตัวตรวจจับได้จริง — migration เดิมต้องโดนจับว่าเป็น using (true) และไม่มี auth.uid()", () => {
    const legacy = readFileSync(resolve(process.cwd(), "supabase/migrations/0001_init.sql"), "utf8");
    // ใช้ permissiveIn ตัวเดียวกับที่ตรวจไฟล์จริง — ถ้าเขียน regex ซ้ำตรงนี้ เคสนี้จะยังเขียว
    // แม้ stripComments จะตัดจนไม่เหลืออะไรให้จับ = พิสูจน์คนละอย่างกับที่รันจริง
    expect(permissiveIn(legacy).length).toBeGreaterThan(0);
    expect((legacy.match(/auth\.uid\(\)/g) ?? []).length).toBe(0);
  });
});

describe("ความครบของ matrix — ตรวจตัวรายการ ไม่ใช่ตัวระบบ", () => {
  const TABLES = ["profiles", "trips", "trip_members"] as const;
  const VERBS = ["select", "insert", "update", "delete"] as const;
  const PERSONAS = ["A_owner", "B_other_trip", "C_no_trip", "D_anon"] as const;

  it("ครอบ 3 ตาราง × 4 verb × 4 persona = 48 ช่อง", () => {
    expect(TABLES.length * VERBS.length * PERSONAS.length).toBe(48);
  });

  it("มี persona ที่ไม่ได้ล็อกอิน และ persona ที่ล็อกอินแต่ไม่มีทริป — คนละเคสกัน", () => {
    expect(PERSONAS).toContain("D_anon");
    expect(PERSONAS).toContain("C_no_trip");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ตัวด่านเอง — `keyRole` ต้องถูกพิสูจน์ก่อน เพราะทั้งชุดสดพึ่งมันในบรรทัดแรก
//
// 🔴 กฎ E0 ข้อ 1–2: ด่านต้องมีเทสต์ **ทั้งด้านลบและด้านบวก**
//    ด้านลบอย่างเดียวไม่พอ — ฟังก์ชันที่คืน null ให้ทุกอย่างจะทำให้ด้านลบเขียวหมดทั้งชุด
// 🔴 กฎ E0 ข้อ 5: เคสพวกนี้เรียก `keyRole` **ตัวเดียวกับที่ beforeAll ใช้** ไม่ใช่สำเนา
//    (ถ้าเขียนตรรกะซ้ำไว้ในเทสต์ ตัวจริงพังแล้วเทสต์ยังเขียว = พิสูจน์คนละอย่างกับที่รันจริง)
// ───────────────────────────────────────────────────────────────────────────
describe("keyRole — ด่านกันหยิบคีย์ผิดใบ ต้องทำงานกับคีย์ทั้ง 2 รุ่น", () => {
  /** JWT ปลอมที่ถอดได้จริง — ไม่ต้องเซ็น เพราะ keyRole ไม่ตรวจลายเซ็นอยู่แล้ว */
  const jwt = (role: string) =>
    `hdr.${Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url")}.sig`;

  describe("ด้านบวก — คีย์ถูกใบต้องอ่านออกทั้ง 2 รุ่น", () => {
    it("JWT รุ่นเก่า (DB ทริปยังใช้อยู่)", () => {
      expect(keyRole(jwt("anon"))).toBe("anon");
      expect(keyRole(jwt("service_role"))).toBe("service_role");
    });

    it("🔴 คีย์รุ่นใหม่ของ engine-dev — เคสที่ฉบับเดิมล้ม", () => {
      expect(keyRole("sb_publishable_AbCdEf123456")).toBe("anon");
      expect(keyRole("sb_secret_ZyXwVu987654")).toBe("service_role");
    });
  });

  describe("ด้านลบ — หยิบผิดใบต้องจับได้ ทั้ง 2 รุ่น", () => {
    it("🔴 เอา service key ใส่ช่อง anon — เคสที่ทำให้เมทริกซ์เขียวหลอกทั้งแผง", () => {
      expect(keyRole("sb_secret_ZyXwVu987654")).not.toBe("anon");
      expect(keyRole(jwt("service_role"))).not.toBe("anon");
    });

    it("เอา anon key ใส่ช่อง service — อีกทิศหนึ่งของความผิดพลาดเดียวกัน", () => {
      expect(keyRole("sb_publishable_AbCdEf123456")).not.toBe("service_role");
      expect(keyRole(jwt("anon"))).not.toBe("service_role");
    });

    it("🔴 รูปแบบที่ไม่รู้จักต้องคืน null = ล้ม ไม่ใช่ผ่าน (ตรวจไม่ได้ ≠ ปลอดภัย)", () => {
      for (const junk of ["", "not-a-key", "sb_", "eyJhbGciOiJIUzI1NiJ9", "a.b.c"]) {
        expect(keyRole(junk), `"${junk}" ไม่ควรอ่านเป็น role ใดๆ`).toBeNull();
      }
    });

    // F2 (P4) — ทิศที่ฉบับก่อน **ผ่าน** และเป็นทิศที่เกิดง่ายที่สุดสัปดาห์นี้
    it("🔴 คีย์ที่มีช่องว่างต้องล้ม — ทั้งนำหน้าและต่อท้าย (ต่อท้ายคือทิศที่เคยรอด)", () => {
      expect(keyRole("sb_publishable_AbC123\n"), "`\\n` ต่อท้ายเคยผ่านด่านไปได้").toBeNull();
      expect(keyRole(" sb_publishable_AbC123")).toBeNull();
      expect(keyRole("sb_secret_AbC123\r\n")).toBeNull();
      expect(keyRole("sb_publishable_AbC 123")).toBeNull();
    });

    // F4 (P4) — คีย์ที่ถูกตัดจนเหลือแต่ prefix เคยอ่านเป็นคีย์ที่ใช้ได้
    it("prefix เปล่า ๆ ไม่มีตัวคีย์ ต้องล้ม", () => {
      expect(keyRole("sb_publishable_")).toBeNull();
      expect(keyRole("sb_secret_")).toBeNull();
    });
  });

  // 🔴 การทำความสะอาดต้องมีเคสคุม ไม่งั้นมันคือพฤติกรรมที่มองไม่เห็น (กฎ E0 ข้อ 1)
  describe("readEnvKey — ที่เดียวที่ยอมให้มีช่องว่างส่วนเกิน", () => {
    const NAME = "__RLS_MATRIX_TRIM_PROBE__";
    afterEach(() => {
      delete process.env[NAME];
    });

    it("ตัดช่องว่างที่ติดมากับการแปะคีย์ด้วยมือ แล้วผลลัพธ์ต้องผ่าน keyRole ได้", () => {
      process.env[NAME] = "  sb_publishable_AbC123\n";
      const cleaned = readEnvKey(NAME);
      expect(cleaned).toBe("sb_publishable_AbC123");
      expect(keyRole(cleaned), "ทำความสะอาดแล้วต้องใช้ได้จริง").toBe("anon");
    });

    it("env ที่ไม่มีอยู่ ต้องได้สตริงว่าง ไม่ใช่ undefined", () => {
      expect(readEnvKey(NAME)).toBe("");
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ส่วนที่ต้องมี Supabase จริง
//
// 🔴 ไม่มี creds = **skip ไม่ใช่ pass** · และ "skip" อ่านเป็นเขียวได้ใน CI
//    → ตั้ง `RLS_MATRIX_REQUIRED=1` แล้วการ skip จะกลายเป็น fail
//    **E1 จะปิดไม่ได้จนกว่า flag นี้ถูกเปิดใน CI และชุดนี้ผ่านจริง** — ไม่งั้น DoD ข้อนี้
//    คือเทสต์ที่ "ผ่านได้ด้วยการไม่เคยรัน" ซึ่งเป็นสิ่งที่ matrix นี้มีไว้กันตั้งแต่ต้น
// ───────────────────────────────────────────────────────────────────────────
describe("การรันชุดสด", () => {
  it("ถ้าบังคับไว้ ต้องมี creds ครบ", () => {
    if (process.env.RLS_MATRIX_REQUIRED === "1") {
      expect(hasCreds, "RLS_MATRIX_REQUIRED=1 แต่ไม่มี SUPABASE URL/ANON/SERVICE_ROLE ครบ").toBe(true);
    } else if (!hasCreds) {
      console.warn(
        "\n⚠️  ข้ามชุดสดของ RLS matrix เพราะไม่มี creds — **นี่ไม่ใช่การผ่าน**\n" +
          "    ตั้ง NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY\n" +
          "    ของโปรเจกต์ staging แล้วรันใหม่ · ปิด E1 ไม่ได้จนกว่าชุดนี้จะรันจริง\n",
      );
    }
  });
});

describe.runIf(hasCreds)("RLS matrix (สด)", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 🔴 สร้าง client ใน beforeAll ไม่ใช่ตรงนี้ — `describe.runIf(false)` ยัง **รัน body**
  //    ตอน collect (ข้ามเฉพาะตัวเทสต์) → `createClient("")` จะโยนตั้งแต่เก็บไฟล์
  //    แล้วชุดนี้จะ "แดงเพราะไม่มี creds" ปนกับ "แดงเพราะ RLS ผิด" ซึ่งแยกกันไม่ออก
  let admin: SupabaseClient;
  let A: SupabaseClient, B: SupabaseClient, C: SupabaseClient, D: SupabaseClient;
  const ids: Record<string, string> = {};
  let tripA = "";
  let tripB = "";

  /** สร้างผู้ใช้ + client ที่ถือ JWT ของคนนั้น · fixture ตั้งชื่อไม่ซ้ำต่อรอบ (D14) */
  async function makeUser(tag: string): Promise<SupabaseClient> {
    const email = `rls-${tag}-${stamp}@example.test`;
    const password = `pw-${stamp}-${tag}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`สร้างผู้ใช้ ${tag} ไม่ได้: ${error.message}`);
    ids[tag] = data.user!.id;
    const client = testClient(ANON);
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`ล็อกอิน ${tag} ไม่ได้: ${signIn.error.message}`);
    return client;
  }

  beforeAll(async () => {
    admin = testClient(SERVICE);
    D = testClient(ANON);

    // กับดักที่ 1 — key ที่ client ทดสอบถือ ต้องเป็น anon เท่านั้น
    //
    // 🔴 F3 (P4): แยก 2 ความล้มเหลวออกจากกัน เพราะ **ทางแก้ตรงข้ามกัน**
    //    · อ่านรูปแบบไม่ออก → ปัญหาอยู่ที่ **ลิสต์ของเราเก่า** (Supabase ออกรูปแบบใหม่)
    //    · อ่านออกแต่ role ผิด → ปัญหาอยู่ที่ **คนหยิบคีย์ผิดใบ**
    //    ฉบับก่อนพูดว่า "ไม่ใช่ anon key" เหมือนกันทั้งสองกรณี → วันที่รูปแบบที่ 3 มาถึง
    //    คนจะไปไล่หาคีย์ผิดใบ แล้วลงเอยด้วยการ "ขยายด่านจนเขียว" ซึ่งเป็นแรงกดดัน
    //    เดียวกับที่คอมเมนต์ของ `stripComments` ในไฟล์นี้เตือนไว้เอง
    for (const [name, key, want] of [
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON, "anon"],
      ["SUPABASE_SERVICE_ROLE_KEY", SERVICE, "service_role"],
    ] as const) {
      expect(
        keyRole(key),
        `${name}: อ่านรูปแบบคีย์ไม่ออก — ไม่ใช่ JWT และไม่ขึ้นต้นด้วย sb_publishable_/sb_secret_\n` +
          `  🔴 ถ้ามั่นใจว่าคีย์ถูกใบ แปลว่า "ลิสต์รูปแบบของเราเก่า" ไม่ใช่ "หยิบผิดใบ"\n` +
          `  → ขยาย keyRole พร้อมเคส 2 ทิศ **อย่าปิดเคสนี้ทิ้งเพื่อให้เขียว**`,
      ).not.toBeNull();
      expect(keyRole(key), `${name}: หยิบคีย์ผิดใบ — ช่องนี้ต้องเป็น "${want}"`).toBe(want);
    }

    A = await makeUser("a");
    B = await makeUser("b");
    C = await makeUser("c");

    /**
     * 🔴 สร้างทริปผ่าน RPC ไม่ใช่ `insert().select()` — `P-26`
     *
     * ทางเดิมคือทางที่ **ตายที่ `beforeAll`** ทุกครั้ง: `returning` บังคับให้แถวที่เพิ่งสร้าง
     * ผ่าน `trips_select` → `app.can_read_trip` → หาใน `trip_members` ซึ่งยังว่าง
     * เพราะ trigger เป็น `AFTER INSERT` · `create_trip()` คืนแถวจากในฟังก์ชัน `security definer`
     * จึงไม่มี policy ฝั่งอ่านตัวไหนต้องผ่าน (`D49` — ทางที่ถูกไม่ว่าคำตอบเรื่อง snapshot จะเป็นอะไร)
     *
     * ⚠️ **ทางเดิมยังต้องถูกทดสอบต่อไป ไม่ใช่ถูกลืม** — เคส `E1-AC4` ยังยิง insert ตรงอยู่
     * และมันยังต้องถูกปฏิเสธ · ที่เปลี่ยนคือ **วิธีสร้าง fixture** ไม่ใช่สิ่งที่เมทริกซ์วัด
     */
    const mk = async (client: SupabaseClient, owner: string, title: string) => {
      const { data, error } = await client.rpc("create_trip", {
        p_title: title,
        p_start_date: "2026-10-11",
        p_end_date: "2026-10-21",
      });
      if (error) throw new Error(`สร้างทริป ${title} ไม่ได้: ${error.message}`);
      // `owner` ไม่ได้ถูกส่งเข้า RPC โดยตั้งใจ — ฟังก์ชันอ่าน `auth.uid()` เอง
      // จึงใช้มันเป็น **การตรวจ** แทน: ถ้า client กับ persona ที่เราคิดไม่ตรงกัน
      // fixture ทั้งชุดจะผิดเงียบ ๆ แล้วเคสด้านลบจะเขียวด้วยเหตุผลที่ผิด
      if (data.created_by !== ids[owner]) {
        throw new Error(
          `ทริป ${title} ถูกสร้างในนาม ${data.created_by} แต่คาดว่าเป็น ${owner} (${ids[owner]})`,
        );
      }
      return data.id as string;
    };
    tripA = await mk(A, "a", `matrix-A-${stamp}`);
    tripB = await mk(B, "b", `matrix-B-${stamp}`);
  });

  afterAll(async () => {
    // ลบเฉพาะของรอบนี้ — ห้าม truncate ห้ามลบแบบกวาด (staging เป็นของกลาง ไม่มี PITR)
    const userIds = Object.values(ids);

    // 🔴 P-28 — **ทริปต้องถูกลบก่อนผู้ใช้ ไม่ใช่หลัง** (P1 ไล่โซ่นี้ให้ 24 ส.ค. 2026)
    //   `deleteUser` → `auth.users` ถูกลบ → `profiles` ตามไปด้วย `on delete cascade`
    //   → ชน `trips.created_by references public.profiles(id)` ที่เป็น **`on delete restrict`**
    //   ⚠️ และไม่มีทางลบทริปจากฝั่ง client เลย: ไม่มี policy `trips_delete` (ตั้งใจ รอ soft delete ที่ E2)
    //      และ `authenticated` มีแค่ `select, insert, update` → **ต้องเป็น `service_role` เท่านั้น**
    //      (grant แคบ ๆ `select, delete on public.trips` · ข้อยกเว้น D38 จดใน TEAM.md แล้ว)
    //   → ลำดับผิดเมื่อไหร่ **ลบไม่ออกทั้งคู่** และ fixture ค้างถาวรในฐานที่ใช้ร่วมกัน
    //
    // ลบด้วย `created_by` ไม่ใช่ `id` ของ tripA/tripB ที่จำไว้ — เพราะถ้า `beforeAll`
    // ล้มกลางคัน (เกิดมาแล้วจริงกับ P-26) ตัวแปรจะว่างทั้งที่แถวถูกสร้างไปแล้ว
    // `trip_members` หายเองด้วย cascade จาก FK ของ `trips` จึงไม่ต้องลบแยก
    if (userIds.length > 0) {
      const { error } = await admin.from("trips").delete().in("created_by", userIds);
      // 🔴 ดังไว้ ไม่เงียบ — ถ้าเก็บกวาดล้ม fixture จะพอกขึ้นทุกรอบในฐานของกลาง
      //    แต่ **ห้าม throw**: afterAll ที่ล้มจะกลบผลของเคสจริงที่เพิ่งรันไป
      if (error) console.warn(`\n⚠️  ลบทริปของรอบนี้ไม่สำเร็จ: ${error.message}\n`);
    }

    for (const id of userIds) await admin.auth.admin.deleteUser(id).catch(() => {});
  });

  // ── ด้านบวก: precondition ของทั้งชุด ────────────────────────────────────
  describe("ด้านบวก — ต้องผ่านก่อน ไม่งั้นเคสด้านลบไม่ได้พิสูจน์อะไร", () => {
    it("🔴 A อ่านทริปที่ตัวเองเพิ่งสร้างได้ (จับเคสไก่กับไข่ P-13)", async () => {
      const { data, error } = await A.from("trips").select("id,title").eq("id", tripA);
      expect(error).toBeNull();
      expect(
        data,
        "A สร้างทริปแล้วอ่านกลับไม่เห็น = ไม่มีแถว trip_members ของ owner ถูกสร้าง " +
          "→ เคส 'ถูกบล็อก' ทุกข้อข้างล่างจะเขียวจากระบบที่ใช้งานไม่ได้",
      ).toHaveLength(1);
    });

    it("A เห็นแถวสมาชิกของตัวเองใน trip_members", async () => {
      const { data } = await A.from("trip_members").select("role").eq("trip_id", tripA);
      expect(data).toHaveLength(1);
      expect(data?.[0]?.role).toBe("owner");
    });

    it("A แก้ทริปตัวเองได้", async () => {
      const { error } = await A.from("trips").update({ title: `renamed-${stamp}` }).eq("id", tripA);
      expect(error).toBeNull();
      const { data } = await A.from("trips").select("title").eq("id", tripA).single();
      expect(data?.title).toBe(`renamed-${stamp}`);
    });

    it("A อ่านโปรไฟล์ตัวเองได้", async () => {
      const { data } = await A.from("profiles").select("id").eq("id", ids.a);
      expect(data).toHaveLength(1);
    });

    it("A แก้โปรไฟล์ตัวเองได้", async () => {
      const { error } = await A.from("profiles")
        .update({ display_name: `A-${stamp}` })
        .eq("id", ids.a);
      expect(error).toBeNull();
      const { data } = await A.from("profiles").select("display_name").eq("id", ids.a).single();
      expect(data?.display_name).toBe(`A-${stamp}`);
    });

    // 🔴 หลักผูกของ C — ถ้าไม่มีข้อนี้ เคสด้านลบของ C ทั้ง 6 ข้อ (E1-AC3) จะผ่านได้
    //    จาก session ที่ล็อกอินไม่สำเร็จหรือ profile ไม่ถูกสร้าง = ความจริงบนเซตว่างอีกครั้ง
    //    B มีหลักผูกอยู่แล้ว (เห็นทริปตัวเอง) แต่ C เดิมถูกใช้เฉพาะด้านลบล้วน
    it("🔴 C ล็อกอินได้จริงและอ่านโปรไฟล์ตัวเองได้ (หลักผูกของเคสด้านลบทั้งหมดของ C)", async () => {
      const { data, error } = await C.from("profiles").select("id").eq("id", ids.c);
      expect(error).toBeNull();
      expect(
        data,
        "C อ่านโปรไฟล์ตัวเองไม่ได้ = session ของ C ใช้ไม่ได้ → เคส AC3 ทุกข้อไม่ได้พิสูจน์อะไร",
      ).toHaveLength(1);
    });
  });

  // ── E1-AC3: สมาชิกทริปอื่น / คนที่ไม่มีทริป ───────────────────────────────
  describe("E1-AC3 — คนอื่นต้องไม่เห็นทริปของ A", () => {
    it("B (เจ้าของอีกทริป) ยิง GET /trips ได้เฉพาะทริปตัวเอง", async () => {
      const { data, error } = await B.from("trips").select("id");
      expect(error).toBeNull();
      expect(data?.map((r) => r.id)).toEqual([tripB]);
    });

    it("🔴 C (ไม่มีทริปเลย) ยิง GET /trips ได้ [] ไม่ใช่ทริปของ A", async () => {
      const { data, error } = await C.from("trips").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("C ระบุ id ของทริป A ตรงๆ ก็ยังไม่เห็น", async () => {
      const { data } = await C.from("trips").select("id").eq("id", tripA);
      expect(data).toEqual([]);
    });

    it("C แทรกตัวเองเข้าทริป A ไม่ได้ (self-join)", async () => {
      const { error } = await C.from("trip_members").insert({
        trip_id: tripA,
        user_id: ids.c,
        role: "viewer",
      });
      expect(error?.code).toBe("42501");
    });

    it("C แก้ทริป A ไม่ได้ — และต้องยืนยันด้วยการอ่านซ้ำในฐานะ A", async () => {
      // UPDATE ที่ถูก RLS กรองคืน 200 + ไม่มี error → เช็ค error อย่างเดียวคือเช็คผิดทาง
      await C.from("trips").update({ title: `hijacked-${stamp}` }).eq("id", tripA);
      const { data } = await A.from("trips").select("title").eq("id", tripA).single();
      expect(data?.title).not.toBe(`hijacked-${stamp}`);
    });

    it("C ลบสมาชิกของทริป A ไม่ได้", async () => {
      await C.from("trip_members").delete().eq("trip_id", tripA);
      const { data } = await A.from("trip_members").select("user_id").eq("trip_id", tripA);
      expect(data).toHaveLength(1);
    });
  });

  // ── E1-AC4: anon ────────────────────────────────────────────────────────
  describe("E1-AC4 — anon ต้องไม่ได้อะไรเลยทั้ง 3 ตาราง", () => {
    it.each(["profiles", "trips", "trip_members"])("anon SELECT %s ได้ [] หรือถูกปฏิเสธ", async (t) => {
      const { data, error } = await D.from(t).select("*");
      if (error) expect(["42501", "PGRST301", "42P01"]).toContain(error.code);
      else expect(data).toEqual([]);
    });

    // 🔴 ฉบับเดิมเช็คแค่ `error !== null` ซึ่ง **ผ่านได้ด้วยเหตุผลที่ผิด**:
    //    ชื่อคอลัมน์ผิดก็คืน error เหมือนกัน (และมันผิดอยู่จริง — `owner_id` ที่ P-15 เปลี่ยนเป็น
    //    `created_by` ไปแล้ว) → เคสนี้เคยเขียวโดยไม่เคยแตะ RLS สักครั้ง
    //    ต้องยืนยันว่า **ถูกปฏิเสธเพราะสิทธิ์** ไม่ใช่เพราะ schema ไม่รู้จักสิ่งที่เราส่งไป
    it("anon INSERT trips ไม่ได้ — และต้องถูกปฏิเสธเพราะสิทธิ์ ไม่ใช่เพราะคอลัมน์ผิด", async () => {
      const { error } = await D.from("trips").insert({
        created_by: ids.a,
        title: `anon-${stamp}`,
        start_date: "2026-10-11",
        end_date: "2026-10-21",
      });
      expect(error).not.toBeNull();
      expect(["42501", "PGRST301"], `ถูกปฏิเสธด้วยรหัสอื่น: ${error?.code} ${error?.message}`)
        .toContain(error!.code);
    });

    it("anon UPDATE ทริปของ A ไม่ได้ — ยืนยันด้วยการอ่านซ้ำในฐานะ A", async () => {
      await D.from("trips").update({ title: `anon-hijack-${stamp}` }).eq("id", tripA);
      const { data } = await A.from("trips").select("title").eq("id", tripA).single();
      expect(data?.title).not.toBe(`anon-hijack-${stamp}`);
    });

    // P-18: `trip_members` เป็นตารางเดียวที่ authenticated ได้ grant DELETE
    // → เป็นที่เดียวที่ "anon ไม่มี grant" กับ "RLS บล็อก" แยกผลกันไม่ออกถ้าไม่ยิง
    it("anon DELETE trip_members ไม่ได้", async () => {
      await D.from("trip_members").delete().eq("trip_id", tripA);
      const { data } = await A.from("trip_members").select("user_id").eq("trip_id", tripA);
      expect(data).toHaveLength(1);
    });
  });

  // ── P-14 / P-19: ลาออกจากทริป และการกันทริปกำพร้า ──────────────────────
  describe("P-19 — ทริปต้องมี owner เสมอ และคนอื่นต้องลาออกได้", () => {
    it("🔴 owner คนเดียวลาออกไม่ได้ — ยืนยันด้วยการอ่านซ้ำ", async () => {
      // deferred constraint trigger ยิงตอน commit → error อาจมาในรูป 'ทริปต้องมี owner'
      // แต่ถ้ามันเงียบ แถวจะหายจริง → ต้องอ่านซ้ำ ไม่เชื่อว่าไม่มี error
      await A.from("trip_members").delete().eq("trip_id", tripA).eq("user_id", ids.a);
      const { data } = await A.from("trip_members").select("user_id").eq("trip_id", tripA);
      expect(data, "owner คนสุดท้ายลาออกได้ = ทริปกำพร้า กู้จาก client ไม่ได้เลย").toHaveLength(1);
    });

    it("viewer ลาออกเองได้ (P-14 — ฉบับเดิมทำให้ติดอยู่ในทริปถาวร)", async () => {
      const { error: invErr } = await A.from("trip_members").insert({
        trip_id: tripA,
        user_id: ids.c,
        role: "viewer",
      });
      expect(invErr, "owner เชิญ viewer ไม่ได้").toBeNull();

      const { error } = await C.from("trip_members")
        .delete()
        .eq("trip_id", tripA)
        .eq("user_id", ids.c);
      expect(error).toBeNull();
      const { data } = await A.from("trip_members").select("user_id").eq("trip_id", tripA);
      expect(data?.map((r) => r.user_id)).not.toContain(ids.c);
    });

    it("owner คนที่ 2 ลาออกได้ แล้วคนสุดท้ายลาออกไม่ได้", async () => {
      await A.from("trip_members").insert({ trip_id: tripA, user_id: ids.b, role: "owner" });
      // B ลาออกได้ เพราะยังเหลือ A เป็น owner
      await B.from("trip_members").delete().eq("trip_id", tripA).eq("user_id", ids.b);
      const { data: afterB } = await A.from("trip_members").select("user_id").eq("trip_id", tripA);
      expect(afterB?.map((r) => r.user_id)).not.toContain(ids.b);
      // แล้ว A ก็กลับไปเป็น owner คนเดียว → ลาออกไม่ได้อีก
      await A.from("trip_members").delete().eq("trip_id", tripA).eq("user_id", ids.a);
      const { data: afterA } = await A.from("trip_members").select("user_id").eq("trip_id", tripA);
      expect(afterA).toHaveLength(1);
    });

    it("owner ลดตัวเองเป็น editor ไม่ได้ถ้าเป็น owner คนเดียว (เส้นทาง UPDATE)", async () => {
      // trigger ครอบ `after delete or update` → เส้นทางนี้ต้องถูกกันด้วย ไม่ใช่แค่ DELETE
      await A.from("trip_members")
        .update({ role: "editor" })
        .eq("trip_id", tripA)
        .eq("user_id", ids.a);
      const { data } = await A.from("trip_members").select("role").eq("trip_id", tripA).single();
      expect(data?.role, "ลดตัวเองเป็น editor สำเร็จ = ทริปไม่มี owner").toBe("owner");
    });
  });
  // ─────────────────────────────────────────────────────────────────────────
  describe("P-26 — public.create_trip() แทนการ insert ตรงแล้วหวังให้ RETURNING ผ่าน RLS", () => {
    /**
     * 🔴 **ชุดนี้ยังไม่เคยรันเลยสักครั้งตอนที่เขียน** (24 ส.ค. 2026) — token เข้า engine-dev ไม่ได้
     * เขียนไว้ล่วงหน้าเพื่อให้รันได้ทันทีที่ token ใช้ได้ · **อย่านับว่าผ่านจนกว่าจะเห็นผลจริง**
     *
     * ทริปที่ชุดนี้สร้างถูกเก็บกวาดโดย `afterAll` อยู่แล้ว เพราะมันลบตาม `created_by`
     * ของผู้ใช้ในรอบนี้ ไม่ใช่ตาม id ที่จำไว้ — จึงไม่ต้องเก็บกวาดเพิ่มตรงนี้
     */
    const mkArgs = (tag: string) => ({
      p_title: `rpc-${tag}-${stamp}`,
      p_start_date: "2026-10-11",
      p_end_date: "2026-10-21",
    });

    describe("ด้านบวก — ทางที่ถูกต้องยังต้องเดินได้", () => {
      it("🔴 A สร้างทริปผ่าน RPC แล้วได้แถวกลับมา — เคสที่ P-26 ทั้งข้อเป็น", async () => {
        // insert ตรง + `.select()` คือสิ่งที่ล้มด้วย 42501 · RPC คืนแถวจากในฟังก์ชัน definer
        // จึงไม่มี policy ฝั่งอ่านตัวไหนต้องผ่าน และไม่มี snapshot ไหนต้องมองเห็นอะไรทัน
        const { data, error } = await A.rpc("create_trip", mkArgs("a"));
        expect(error, `RPC ล้ม: ${error?.code} ${error?.message}`).toBeNull();
        expect(data?.id, "RPC สำเร็จแต่ไม่คืนแถว = ยังแก้ P-26 ไม่ได้").toBeTruthy();
        expect(data?.created_by, "created_by ต้องมาจาก auth.uid() ข้างในฟังก์ชัน").toBe(ids.a);
      });

      it("แถว owner ใน trip_members ถูกสร้าง — P-13 ต้องไม่กลับมาผ่านทาง RPC", async () => {
        const { data: trip } = await A.rpc("create_trip", mkArgs("a2"));
        const { data } = await A.from("trip_members").select("role").eq("trip_id", trip!.id);
        expect(data, "ไม่มีแถวสมาชิก = ทริปกำพร้าที่กู้จากฝั่ง client ไม่ได้ (P-13)").toHaveLength(1);
        expect(data?.[0]?.role).toBe("owner");
      });

      it("🔴 อ่านทริปที่สร้างผ่าน RPC กลับได้จริง — ไม่ใช่แค่ค่าที่ฟังก์ชันคืนมา", async () => {
        // ฟังก์ชัน definer คืนอะไรก็ได้โดยไม่ผ่าน RLS · เคสนี้จึงอ่านซ้ำด้วย client ปกติ
        // ถ้าเคสบนเขียวแต่เคสนี้แดง = ทริปถูกสร้างแต่มองไม่เห็น ซึ่งคือ P-13 ในรูปที่เนียนกว่าเดิม
        const { data: trip } = await A.rpc("create_trip", mkArgs("a3"));
        const { data } = await A.from("trips").select("id").eq("id", trip!.id);
        expect(data).toHaveLength(1);
      });
    });

    describe("ด้านลบ — ทางที่ผิดต้องเดินไม่ได้", () => {
      it("🔴 P-32 — anon ต้องถูกปฏิเสธที่ **ชั้นสิทธิ์** ไม่ใช่แค่ที่ด่านในฟังก์ชัน", async () => {
        // ฟังก์ชันนี้เป็น security definer = ข้าม RLS โดยนิยาม · จึงมี 2 ชั้นที่ควรกัน anon:
        //   ⑤ สิทธิ์ EXECUTE — `revoke … from public, anon`
        //   ④ ด่านในตัวฟังก์ชัน — `if auth.uid() is null then raise`
        // 🔴 **ทั้งสองชั้นคืน 42501 เหมือนกัน** → เช็คแค่รหัสจะแยกไม่ออกว่าชั้นไหนทำงาน
        //    ซึ่งเป็นสภาพที่เราอยู่มาทั้งวัน · แยกด้วย **ข้อความ** เท่านั้น
        const { error } = await D.rpc("create_trip", mkArgs("anon"));
        expect(error, "anon เรียก create_trip สำเร็จ = ฟังก์ชันข้าม RLS เปิดให้คนไม่ล็อกอิน").not.toBeNull();
        expect(
          error?.message ?? "",
          "ไปถึงด่าน ④ ได้ = ชั้นสิทธิ์ ⑤ ไม่ทำงาน · anon ยัง EXECUTE ได้อยู่ " +
            "(revoke from public ไม่ถอนสิทธิ์ที่ให้ตามชื่อ role)",
        ).not.toContain("ต้องล็อกอินก่อนสร้างทริป");
      });

      it("เรียก RPC แล้วต้องไม่ได้สิทธิ์ในทริปที่ตัวเองไม่ได้สร้าง", async () => {
        // กันเคสที่ฟังก์ชัน definer เผลอสร้างแถวสมาชิกให้ทริปอื่น (รูปหนึ่งของ P-29)
        await C.rpc("create_trip", mkArgs("c"));
        const { data } = await C.from("trips").select("id").eq("id", tripA);
        expect(data, "สร้างทริปตัวเองแล้วเห็นทริปคนอื่น = สิทธิ์รั่วข้ามทริป").toEqual([]);
      });

      it("ส่ง created_by หรือ id เข้าไปไม่ได้ — ลายเซ็นไม่รับ", async () => {
        // ② กับ ③ ของข้อบังคับ: ถ้าวันหนึ่งมีคนเติมพารามิเตอร์เข้าไป เคสนี้จะแดง
        for (const extra of [{ p_created_by: ids.b }, { p_id: tripA }]) {
          const { error } = await A.rpc("create_trip", { ...mkArgs("x"), ...extra });
          expect(error, `ฟังก์ชันรับ ${Object.keys(extra)[0]} เข้าไปได้`).not.toBeNull();
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 สมาชิกที่ไม่ใช่เจ้าของ ต้องเห็นทริปได้ — ช่องที่เมทริกซ์ 48 เคสมองไม่เห็น", () => {
    /**
     * 🎯 **ทำไมเคสนี้ถึงสำคัญกว่าที่หน้าตามันดู**
     *
     * เคสด้านลบทั้งหมดข้างบนพิสูจน์ว่า **คนนอกไม่เห็น** · เคสด้านบวกพิสูจน์ว่า **เจ้าของเห็น**
     * 🔴 **ไม่มีเคสไหนพิสูจน์ว่า *สมาชิกที่ไม่ใช่เจ้าของ* เห็น** — และนั่นคือทั้งหมดที่แพลตฟอร์มนี้มีไว้ทำ
     *
     * ถ้า `trips_select` เขียนเป็น `created_by = auth.uid()` แทน `app.can_read_trip(id)`
     * **เมทริกซ์ทั้ง 48 เคสจะยังเขียวหมด**: A เห็นของตัวเอง · B เห็นแต่ของตัวเอง · C ไม่เห็นอะไร
     * แต่ **ทุกคนที่ถูกเชิญเข้าทริปจะเปิดไม่เห็นอะไรเลย** = ฟีเจอร์หลักพังเงียบสนิท
     *
     * ⚠️ **และ mutation test หาข้อนี้ไม่เจอ** — mutation test พิสูจน์ว่า assert ที่มีอยู่ไวพอ
     * มันไม่บอกว่า **assert ที่ควรมีแต่ไม่มี** คืออันไหน · คนละชนิดของช่องกัน
     */
    it("🔴 viewer ที่เพิ่งถูกเชิญ ต้องอ่านทริปได้ทันที (สิทธิ์มาจาก trip_members ไม่ใช่ created_by)", async () => {
      const { error: invErr } = await A.from("trip_members").insert({
        trip_id: tripA,
        user_id: ids.c,
        role: "viewer",
      });
      expect(invErr, "owner เชิญ viewer ไม่ได้").toBeNull();

      const { data, error } = await C.from("trips").select("id").eq("id", tripA);
      expect(error).toBeNull();
      expect(
        data,
        "C เป็นสมาชิกแล้วแต่ยังอ่านทริปไม่เห็น — policy ผูกกับ created_by ไม่ใช่ trip_members",
      ).toHaveLength(1);
    });

    it("viewer อ่านได้แต่แก้ไม่ได้ — บทบาทต้องมีผล ไม่ใช่แค่การเป็นสมาชิก", async () => {
      await C.from("trips").update({ title: `viewer-edit-${stamp}` }).eq("id", tripA);
      const { data } = await A.from("trips").select("title").eq("id", tripA).single();
      expect(data?.title, "viewer แก้ทริปได้ = บทบาทไม่มีผล").not.toBe(`viewer-edit-${stamp}`);
    });

    it("🔴 ถอดออกจากทริปแล้วต้องมองไม่เห็นทันที — สิทธิ์ตามสมาชิกภาพ ไม่ใช่ให้ครั้งเดียวถาวร", async () => {
      // คู่กับเคสแรก: ถ้าเห็นตอนเป็นสมาชิกแต่ยังเห็นหลังถูกถอด แปลว่าสิทธิ์ไม่ได้ตามสมาชิกภาพจริง
      await A.from("trip_members").delete().eq("trip_id", tripA).eq("user_id", ids.c);
      const { data } = await C.from("trips").select("id").eq("id", tripA);
      expect(data, "ถูกถอดออกแล้วยังเห็นทริปอยู่").toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 profiles กิ่งที่สอง (shares_trip_with) — ไม่เคยถูกทดสอบเลยสักเคส", () => {
    /**
     * `profiles_select` มี **2 กิ่ง**: `id = auth.uid()` **หรือ** `app.shares_trip_with(id)`
     * เคส `profiles` ทั้ง 4 ตัวข้างบนแตะแต่กิ่งแรก (ตัวเองอ่านตัวเอง) — **กิ่งที่สองว่างเปล่า**
     *
     * 🔴 **และกิ่งที่สองพังได้ 2 ทิศ ซึ่งอาการตรงข้ามกันคนละขั้ว:**
     *   · แคบเกินไป → `shares_trip_with` คืน false เสมอ → **หน้า "ใครเพิ่มจุดนี้" ว่างเปล่า**
     *     (ไฟล์ migration เขียนเหตุผลข้อนี้ไว้เองตอนสร้าง policy)
     *   · **กว้างเกินไป → คืน true เสมอ → ทุกคนอ่านโปรไฟล์ทุกคนได้ทั้งระบบ**
     *
     * 🎯 **ทิศที่สองคือทิศที่ 51 เคสก่อนหน้านี้มองไม่เห็นเลย** — ไม่มีเคสไหนให้ `C` ลองอ่านโปรไฟล์
     * ของคนที่ไม่ได้อยู่ทริปเดียวกัน · `shares_trip_with` ที่ `join` ผิดข้างจะรั่วทั้งระบบเงียบ ๆ
     * และเมทริกซ์จะยังเขียวครบทุกเคส เพราะไม่มีใครถาม
     */
    it("🔴 C ที่ไม่ได้อยู่ทริปเดียวกับ A ต้องอ่านโปรไฟล์ A ไม่ได้ (กิ่งกว้างเกินไป)", async () => {
      // สถานะตรงนี้: C ถูกถอดออกจาก tripA แล้วโดยชุดก่อนหน้า → ไม่แชร์ทริปกับ A
      const { data, error } = await C.from("profiles").select("id").eq("id", ids.a);
      expect(error).toBeNull();
      expect(
        data,
        "C อ่านโปรไฟล์ A ได้ทั้งที่ไม่ได้อยู่ทริปเดียวกัน = shares_trip_with กว้างเกินไป " +
          "→ ทุกคนอ่านโปรไฟล์ทุกคนได้ทั้งระบบ",
      ).toEqual([]);
    });

    it("🔴 พอ C เข้าทริปเดียวกับ A แล้ว ต้องอ่านโปรไฟล์ A ได้ (กิ่งแคบเกินไป)", async () => {
      await A.from("trip_members").insert({ trip_id: tripA, user_id: ids.c, role: "viewer" });
      const { data, error } = await C.from("profiles").select("id,display_name").eq("id", ids.a);
      expect(error).toBeNull();
      expect(
        data,
        "อยู่ทริปเดียวกันแล้วยังอ่านโปรไฟล์กันไม่ได้ = หน้า 'ใครเพิ่มจุดนี้' จะว่างเปล่า",
      ).toHaveLength(1);
    });

    it("และพอออกจากทริปแล้ว ต้องอ่านไม่ได้อีก — สองเคสบนคือคู่ mutation ของกันและกัน", async () => {
      // client เดียวกัน · query เดียวกัน · ต่างกันแค่แชร์ทริปหรือไม่ · ผลต้องตรงข้าม
      await A.from("trip_members").delete().eq("trip_id", tripA).eq("user_id", ids.c);
      const { data } = await C.from("profiles").select("id").eq("id", ids.a);
      expect(data, "ออกจากทริปแล้วยังอ่านโปรไฟล์เดิมได้").toEqual([]);
    });
  });

});
