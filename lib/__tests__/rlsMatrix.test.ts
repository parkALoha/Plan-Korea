import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TEST_COUNTRY_CODES, readEnvKey, requireLiveCreds } from "./_helpers";

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

/**
 * ตัดสินว่าจะปล่อยให้ชุดสดรันหรือไม่ จากสถานะธง `app.unsafe_state` — เจ้าของ: P4 (`D65`)
 *
 * 🔴 **ปัญหาที่มันแก้:** ระหว่าง mutation test ฐานอยู่ในสภาพ RLS เปิดโล่งหลายนาที
 * **P8 รู้คนเดียว · P1 กับ P4 ไม่รู้** · สิ่งเดียวที่จับได้คือ P1 บังเอิญรันเทสต์ด้วยเหตุผลคนละเรื่อง
 * → **"เห็นแดงแล้วหยุด" คือคนทำถูก ไม่ใช่ระบบทำงาน — และอย่างแรกทำซ้ำไม่ได้**
 * · เคสที่น่ากลัวกว่าคือทิศกลับ: **อ่านว่า "เทสต์แกว่ง" แล้วรันใหม่** ซึ่งเป็นสิ่งที่คนทำกันเป็นปกติ
 *
 * ⚠️ **ขอบเขตที่ธงนี้ทำไม่ได้ ห้ามอ่านเกิน:** มันบอกว่า *"มีคนตั้งใจทำ"* **ไม่ได้บอกว่า *"ฐานปลอดภัย"***
 * ฐานพังด้วยเหตุอื่น (migration ครึ่งทาง · แก้ policy จาก dashboard) → **ธงว่าง และชุดนี้จะบอกว่าปกติดี**
 * **เป็นช่องทางสื่อสารระหว่างคน ไม่ใช่การตรวจสภาพฐาน**
 *
 * @returns ข้อความที่ต้องโยน · `null` = ปล่อยผ่าน
 */
export function unsafeGuardMessage(
  reason: string | null,
  error: { code?: string; message?: string } | null,
): string | null {
  // 🔴 อ่านสถานะไม่ได้ → **ล้ม ไม่ใช่ผ่าน** · "ตรวจไม่ได้ ≠ ปลอดภัย" (หลักเดียวกับ keyRole)
  //    ถ้าปล่อยผ่าน ด่านนี้จะหายไปเงียบ ๆ บนฐานที่ยังไม่ได้รัน migration ของมัน
  if (error) {
    return (
      `ตรวจสภาพฐานไม่ได้ (${error.code ?? "-"}: ${error.message ?? "?"})\n` +
      `  🔴 ชุดนี้ปฏิเสธที่จะรันต่อ — **ตรวจไม่ได้ ไม่เท่ากับปลอดภัย**\n` +
      `  ถ้าฐานยังไม่มี public.unsafe_state_reason() ให้รัน migration ก่อน อย่าลบด่านนี้ทิ้ง`
    );
  }
  if (reason) {
    return (
      `🔴 ฐานนี้ถูกทำให้ไม่ปลอดภัยโดยตั้งใจอยู่ตอนนี้: "${reason}"\n` +
      `  ผลจากรอบนี้ **ไม่มีความหมาย** — อย่าอ่านว่าเทสต์แกว่ง และอย่ารันใหม่เพื่อให้เขียว\n` +
      `  ถ้าคุณไม่ใช่คนปักธง: มีอีกเซสชันกำลังทดสอบอยู่ **รอให้เขารันก้อนคืนค่าก่อน**\n` +
      `  ถ้าคุณเป็นคนปัก: ยังไม่ได้รันก้อน R (\`select public.unsafe_state_clear()\`)`
    );
  }
  return null;
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
  /**
   * 🔴 **`D61` — บล็อกนี้เคยรับรองความครบ โดยตัวมันเองมีจุดบอดเดียวกับที่มันควรจับ**
   *
   * ฉบับเดิมมี persona 4 ตัว: `A_owner` · `B_other_trip` · `C_no_trip` · `D_anon`
   * **ทั้ง 4 ตัวคือ "เจ้าของ" หรือ "คนนอก" — ไม่มีตัวไหนเป็น *สมาชิกที่ไม่ใช่เจ้าของ* เลย**
   * ซึ่งเป็นสถานะที่ผู้ใช้จริงส่วนใหญ่ของแพลตฟอร์มจะอยู่ · **แขกไม่ใช่คนนอก**
   * → มันจึงประกาศว่า "ครอบ 48 ช่อง" ครบถ้วน **ในขณะที่กิ่งครึ่งหนึ่งของ policy ไม่มีใครเดินไปถึง**
   *
   * ⚠️ และเคสเดิม `expect(3 * 4 * 4).toBe(48)` **เป็นการคูณเลขให้ตัวเองดู** — จริงเสมอ
   * ไม่ว่าเมทริกซ์จะทดสอบอะไรหรือไม่ทดสอบอะไร · **เขียวที่แปลว่า "ไม่ได้ตรวจ" ในรูปที่บริสุทธิ์ที่สุด**
   */
  // 🔴 เพิ่ม `trip_days` 25 ส.ค. 2026 (`E2`) — **ตารางเนื้อหาตัวแรกของโปรเจกต์**
  //    ก่อนหน้านี้ทุกตารางเป็นตารางสิทธิ์/ตัวตน ซึ่งเขียนได้เฉพาะ `owner`
  //    → `editor` กับ `viewer` ไม่เคยมีที่ให้ต่างกัน (`P-46`) · ตารางนี้คือที่แรก
  // 🔴 เพิ่มตารางคลัง 25 ส.ค. — **ตารางชนิดที่สองของระบบ**: ข้อมูลสาธารณะที่ผู้ใช้เขียนไม่ได้
  //    ต่างจากตารางอื่นทั้งหมดใน `public` ซึ่งเป็นข้อมูลผู้เช่าที่ RLS ผูกกับ `trip_members`
  const TABLES = [
    "profiles", "trips", "trip_members", "trip_days", "trip_plans", "trip_day_plan_settings",
    "catalog_countries", "catalog_cities", "catalog_places", "catalog_place_names",
    "custom_places", "custom_place_names", "trip_stops", "bookings",
  ] as const;
  const VERBS = ["select", "insert", "update", "delete"] as const;
  const PERSONAS = [
    "A_owner",
    "B_other_trip",
    "C_no_trip",
    "D_anon",
    // 🔴 เพิ่ม 24 ส.ค. 2026 (D61) — สองตัวนี้คือช่องว่างที่ทำให้ 13 กิ่งไม่มีเคส
    "C_member_viewer",
    "C_member_editor",
  ] as const;

  it("🔴 ต้องมี persona ที่เป็นสมาชิกแต่ไม่ใช่เจ้าของ — ไม่งั้นเมทริกซ์รู้จักคิดแต่เรื่องคนนอก", () => {
    const insiders = PERSONAS.filter((p) => p.includes("member"));
    expect(
      insiders.length,
      "ไม่มี persona ที่อยู่ในทริปแต่ไม่ควรมีอำนาจ = กิ่ง 'สมาชิกที่ไม่ใช่ owner' ของทุก policy ว่าง",
    ).toBeGreaterThan(0);
  });

  it("แยก persona ที่ไม่ได้ล็อกอิน ออกจาก persona ที่ล็อกอินแต่ไม่มีทริป", () => {
    expect(PERSONAS).toContain("D_anon");
    expect(PERSONAS).toContain("C_no_trip");
  });

  /**
   * แผนที่ `ตาราง.ชื่อ` → เงื่อนไข **ตามสภาพหลัง migration ทุกไฟล์รันจบ**
   *
   * 🔴 **แก้ 25 ส.ค. 2026 — ฉบับเดิมมองไม่เห็น `drop policy`**
   * `D76` ถอด policy `DELETE` ของ `trip_stops`/`custom_places` ออกด้วย `drop policy` ในไฟล์ทีหลัง
   * **แต่ข้อความ `create policy … for delete` ยังอยู่ในไฟล์เก่า** → ด่านรายงานว่ายังมีอยู่
   * 🎯 **ด่านที่อ่าน *ไฟล์* แทน *สภาพจริง* — หมวดเดียวกับที่ P7 ชี้ตอนเสนอ `has_column_privilege`**
   * · ตอนนี้เดิน `create`/`drop` **ตามลำดับ** เหมือนที่ Postgres ทำ
   * · ⚠️ **ยังไม่ใช่สภาพของฐาน** — มันคือสภาพของ*ไฟล์เมื่อรันครบ* · ใครแก้ policy จากแดชบอร์ด ด่านนี้ไม่เห็น
   *   (ตัวที่ตอบเรื่องฐานคือ `client_writable_timestamps()` และเมทริกซ์สด)
   */
  function policyMapOrdered(): Map<string, string> {
    const src = migrationFiles.map((f) => readFileSync(f, "utf8")).join("\n");
    const out = new Map<string, string>();
    const re = /(create|drop)\s+policy\s+(?:if\s+exists\s+)?(\S+)\s+on\s+public\.(\w+)([\s\S]*?);/g;
    for (const m of src.matchAll(re)) {
      const key = `${m[3]}.${m[2]}`;
      if (m[1] === "drop") out.delete(key);
      else out.set(key, stripComments(m[4]).replace(/\s+/g, " ").trim().toLowerCase());
    }
    return out;
  }

  /** verb ที่แต่ละตารางมี policy จริง — จากสภาพหลังไฟล์ทุกตัวรันจบ ไม่ใช่ทุกบรรทัดที่เคยเขียน */
  function policiedVerbs(table: string): string[] {
    const verbs: string[] = [];
    for (const [key, body] of policyMapOrdered()) {
      if (key.split(".")[0] !== table) continue;
      const v = body.match(/^\s*for (\w+)/)?.[1];
      if (v) verbs.push(v);
    }
    return verbs.sort();
  }

  it("🔴 ตารางที่ **จงใจไม่มี** policy DELETE ต้องไม่มีต่อไป — เพิ่มเมื่อไหร่ต้องเป็นการตัดสินใจ", () => {
    // `D18`: ไม่มี policy = เข้าไม่ถึงจาก client เลย ไม่ใช่แค่ซ่อนปุ่ม
    // `profiles` ลบผ่าน auth.users แล้ว cascade · `trips` รอ soft delete ที่ E2
    // 🔴 เคสนี้จะแดงถ้ามีคนเติม DELETE เข้ามา — ซึ่งคือสิ่งที่ควรเกิด ไม่ใช่สิ่งที่ต้องแก้ให้ผ่าน
    for (const t of TABLES) {
      const verbs = policiedVerbs(t);
      expect(verbs.length, `อ่าน policy ของ ${t} ไม่เจอเลย — regex หรือชื่อตารางเปลี่ยน`).toBeGreaterThan(0);
      expect(verbs.every((v) => (VERBS as readonly string[]).includes(v)), `${t} มี verb นอกลิสต์: ${verbs}`).toBe(true);
      // 🔴 ทะเบียนตารางที่ **ตั้งใจ** ให้ลบได้ · ที่เหลือมี DELETE เมื่อไหร่ต้องมาเถียงกันที่นี่ก่อน
      //    ฉบับเดิมเขียนเป็นข้อยกเว้นตัวเดียว (`trip_members`) ซึ่งอ่านไม่ออกว่าเป็นทะเบียน
      //    · `trip_members` — ถอดสมาชิก/ลาออกเอง · `trip_plans` — ผู้ใช้ลบแผนจริง (usePlans.ts:157)
      //    ⚠️ เติมชื่อลงที่นี่ = ประกาศว่า "ลบแล้วหายจริง ยอมรับได้" · ถ้าคำตอบคือ soft delete
      //       ทางที่ถูกคือ **ไม่เติม** แล้วไปทำ `deleted_at` (`E2-AC12`) แทน
      // `custom_places`/`custom_place_names` — ผู้ใช้ลบสถานที่ที่ตัวเองเพิ่มได้จริงวันนี้
      // 🔴 และลบสถานที่ที่ยังอยู่ในแผนไม่ได้ **เพราะ `trip_stops.custom_place_id` เป็น `restrict`**
      //    — กันด้วย FK ไม่ใช่ด้วยเคสที่แดงทีหลัง (บทเรียนจาก `D73`)
      // `trip_stops` — ผู้ใช้ลบจุดแวะจริงทุกวัน · `E2-AC12` (soft delete) ยังไม่ตัดสินทั้งตระกูล
      // 🔴 เมื่อ `E2-AC12` ตัดสินแล้วว่าเป็น soft delete ชื่อนี้ต้องออกจากลิสต์ **ไม่ใช่อยู่ต่อ**
      // 🔴 `trip_stops` และ `custom_places` **ออกจากลิสต์แล้ว 25 ส.ค. — `D76` ตัดสิน soft delete**
      //    ตรงกับที่เขียนไว้เองว่า *"เมื่อ `E2-AC12` ตัดสินแล้ว ชื่อต้องออกจากลิสต์ ไม่ใช่อยู่ต่อ"*
      //    `custom_place_names` ยังอยู่ — เป็นใบที่หายไปกับพ่อ ไม่ใช่ของที่ผู้ใช้ลบทีละแถว
      const MAY_DELETE = ["trip_members", "trip_plans", "custom_place_names"];
      if (!MAY_DELETE.includes(t)) {
        expect(verbs, `${t} มี policy DELETE แล้ว — ตั้งใจหรือเปล่า`).not.toContain("delete");
      }
    }
  });

  /**
   * แผนที่ `ตาราง.ชื่อ` → เงื่อนไขที่ normalize แล้ว · **เอาการประกาศครั้งสุดท้าย**
   * เพราะนั่นคือสิ่งที่เหลืออยู่ในฐานหลัง migration ทุกตัวรันจบ
   */
  /** ชื่อเดิมที่เคสอื่นเรียกอยู่ — ตอนนี้ชี้ไปตัวที่รู้จัก `drop policy` แล้ว */
  const policyMap = policyMapOrdered;

  it("🔴 รายชื่อ policy ต้องไม่เปลี่ยน — เพิ่ม/ลบ/เปลี่ยนชื่อ ต้องมาไล่กิ่งก่อน", () => {
    // 🎯 `P-48` เดิมนับ **จำนวนคำสั่ง `create policy`** ซึ่งเป็นพร็อกซี ไม่ใช่ของจริง:
    //    P1 ประกาศ `trips_select` ซ้ำเพื่อให้ฐานตรงกับไฟล์ → **ไม่มี policy ใหม่สักตัว**
    //    แต่ด่านนับได้ 11 แล้วแดง · **ด่านที่แดงใส่การเปลี่ยนแปลงที่ไม่ได้เปลี่ยนสิ่งที่มันวัด
    //    จะถูกทำให้เงียบด้วยการขึ้นเลข และครั้งถัดไปมันจะไม่กัดอะไรเลย**
    expect([...policyMap().keys()].sort()).toEqual([
      // 🔴 คลัง: `select` ตัวเดียวต่อตาราง · **ไม่มีฝั่งเขียนเลยโดยตั้งใจ** (`D18`)
      //    เติม policy ฝั่งเขียนให้คลังเมื่อไหร่ = ผู้ใช้แก้คลังกลางได้ ต้องเป็นการตัดสินใจ
      // 🔴 `bookings` ไม่มี policy DELETE — `D76` soft delete · ลบผ่าน RPC
      "bookings.bookings_insert",
      "bookings.bookings_select",
      "bookings.bookings_update",
      "catalog_cities.catalog_cities_select",
      "catalog_countries.catalog_countries_select",
      "catalog_place_names.catalog_place_names_select",
      "catalog_places.catalog_places_select",
      // 🔴 คลัง**ของผู้เช่า** — ครบ 4 verb ต่างจากคลังกลางที่มีแต่ `select` (`D75`)
      "custom_place_names.custom_place_names_delete",
      "custom_place_names.custom_place_names_insert",
      "custom_place_names.custom_place_names_select",
      "custom_place_names.custom_place_names_update",
      "custom_places.custom_places_insert",
      "custom_places.custom_places_select",
      "custom_places.custom_places_update",
      "profiles.profiles_insert",
      "profiles.profiles_select",
      "profiles.profiles_update",
      // 🔴 3 ตัวนี้เพิ่ม 25 ส.ค. 2026 พร้อม `trip_days` — ไล่กิ่งแล้วทั้งสามก่อนแก้ค่านี้
      //    (`_select` → viewer อ่านได้ · `_insert`/`_update` → viewer เขียนไม่ได้ · `with check` → ย้ายวันข้ามทริปไม่ได้)
      "trip_day_plan_settings.tdps_insert",
      "trip_day_plan_settings.tdps_select",
      "trip_day_plan_settings.tdps_update",
      "trip_days.trip_days_insert",
      "trip_days.trip_days_select",
      "trip_days.trip_days_update",
      "trip_members.trip_members_delete",
      "trip_members.trip_members_insert",
      "trip_members.trip_members_select",
      "trip_members.trip_members_update",
      // 🔴 `trip_plans_delete` เป็น policy DELETE ตัวแรกของ `E2` — เป็นการตัดสินใจ ไม่ใช่การคัดลอก
      //    (ผู้ใช้ลบแผนจริงวันนี้ · ลบแผนสุดท้ายถูกกันด้วย constraint trigger ไม่ใช่ด้วย policy)
      "trip_plans.trip_plans_delete",
      "trip_plans.trip_plans_insert",
      "trip_plans.trip_plans_select",
      "trip_plans.trip_plans_update",
      "trip_stops.trip_stops_insert",
      "trip_stops.trip_stops_select",
      "trip_stops.trip_stops_update",
      "trips.trips_insert",
      "trips.trips_select",
      "trips.trips_update",
    ]);
  });

  /** verb ของ policy · อ่านจากตัว body ที่ `policyMap()` normalize มาแล้ว */
  function verbOf(body: string): string | null {
    return body.match(/^\s*for (\w+)/)?.[1] ?? null;
  }

  /**
   * 🔴 `P-46` ในรูปที่**เครื่องตรวจได้** ไม่ใช่รูปที่ต้องมีคนจำได้
   *
   * `D61` วัดไว้ว่า `editor` กับ `viewer` มีสิทธิ์เท่ากันเป๊ะใน `E1` — **ซึ่งถูกต้องสำหรับ `E1`**
   * เพราะไม่มีตารางเนื้อหาสักตัว ทุก policy ฝั่งเขียนจึงเป็น `owner` ล้วน
   * มันกลายเป็นบั๊กในวินาทีที่ตารางเนื้อหาตัวแรกเกิด และวิธีที่มันจะเกิดคือ **การคัดลอกบรรทัดที่ถูก**:
   *
   * > คนเขียนตารางถัดไปคัดลอก `using (app.can_read_trip(trip_id))` จาก policy `_select` ที่อยู่เหนือมัน
   * > ไปวางใน `_insert`/`_update` **ซึ่งอ่านแล้วดูถูกต้องทุกตัวอักษร**
   * > → `viewer` แก้แผนได้ทั้งทริป · และ**ไม่มีเคสไหนแดง** เพราะเคสทั้งหมดถามว่า *คนนอก* ทำอะไรไม่ได้
   *
   * 🎯 ด่านนี้ไม่ต้องรู้จักตารางใหม่ล่วงหน้า — มันอ่านจากไฟล์ที่รันจริง จึงครอบของที่ยังไม่ถูกเขียน
   */
  it("🔴 policy ฝั่ง 'เขียน' ต้องไม่ตัดสินด้วย can_read_trip — ไม่งั้น viewer แก้ได้ทั้งทริป", () => {
    const offenders: string[] = [];
    for (const [key, body] of policyMap()) {
      const verb = verbOf(body);
      if (!verb || verb === "select") continue;
      if (body.includes("can_read_trip")) offenders.push(`${key} (for ${verb})`);
    }
    expect(
      offenders,
      "policy ฝั่งเขียนที่กรองด้วยสิทธิ์ **อ่าน** — สมาชิกอ่านอย่างเดียวจะเขียนได้ทันที\n" +
        "  ทางแก้คือเปลี่ยนเป็น app.can_write_trip() **ไม่ใช่เพิ่มชื่อลงข้อยกเว้นของด่านนี้**",
    ).toEqual([]);
  });

  /**
   * ทะเบียนตารางเนื้อหา — **ประตูที่บังคับให้ตารางใหม่ต้องมาไล่กิ่งก่อน**
   *
   * ตารางไหนมี policy ฝั่งเขียนที่อ้าง `can_write_trip` = ตารางที่ `editor`/`viewer` ต่างกันจริง
   * → ต้องมีเคสสด **2 ทิศ** ของมันในไฟล์นี้: `editor` เขียนได้ · `viewer` เขียนไม่ได้
   * ⚠️ **ด่านนี้พิสูจน์ไม่ได้ว่าเคสถูกเขียนจริง** มันบังคับแค่ให้ *มีคนตัดสินใจ* ตอนเพิ่มตาราง
   *    (ถ้าแดง: ไปเพิ่มเคส 2 ทิศก่อน **แล้วค่อย**เติมชื่อลงลิสต์นี้ — ไม่ใช่เติมชื่อให้เขียวแล้วจบ)
   */
  /**
   * 🔴 **ทะเบียนรหัสประเทศของชุดทดสอบ — ค่าซ้ำต้องแดง *ก่อน* ที่มันจะกลายเป็น "ข้าม"**
   *
   * P4 กับ P1 เลือก `"zz"` ตรงกันโดยไม่รู้ → `beforeAll` ของบล็อกหลังล้มด้วยคีย์ซ้ำ
   * → **12 เคสถูกข้าม และผลรวมพิมพ์ว่า `349 passed | 12 skipped` ซึ่งอ่านเหมือนรันสบาย ๆ**
   * 🎯 บทเรียนคือ **"ข้าม" อ่านเป็นเขียวเสมอ** ไม่ใช่ "ระวังชนกัน"
   */
  it("🔴 รหัสประเทศของแต่ละบล็อกต้องไม่ซ้ำกัน — namespace มีแค่ 676 ค่าและทุกบล็อกแชร์มัน", () => {
    const codes = Object.values(TEST_COUNTRY_CODES);
    expect(
      new Set(codes).size,
      `มีรหัสซ้ำใน TEST_COUNTRY_CODES: ${codes.join(", ")}\n` +
        "  🔴 ถ้าปล่อยไว้ บล็อกหลังจะล้มที่ beforeAll แล้วเคสของมันจะถูก **ข้าม** ไม่ใช่ **แดง**",
    ).toBe(codes.length);
    for (const c of codes) {
      expect(c, `รหัส ${c} ไม่ใช่ [a-z]{2} — catalog_countries.id จะปฏิเสธ`).toMatch(/^[a-z]{2}$/);
    }
  });

  it("🔴 ตารางเนื้อหาต้องขึ้นทะเบียน — ตารางใหม่ที่ยังไม่มีเคส 2 ทิศ ต้องไม่ผ่านเงียบ ๆ", () => {
    const content = new Set<string>();
    for (const [key, body] of policyMap()) {
      if (body.includes("can_write_trip")) content.add(key.split(".")[0]);
    }
    expect([...content].sort()).toEqual([
      "bookings", "custom_place_names", "custom_places",
      "trip_day_plan_settings", "trip_days", "trip_plans", "trip_stops",
    ]);
  });

  /**
   * ทะเบียน `security definer` — **รั้ว column grant ไม่ครอบข้างในฟังก์ชันพวกนี้โดยนิยาม**
   *
   * `…freeze_row_times` ปิดไม่ให้ไคลเอนต์ตั้ง `created_at`/`updated_at`/`updated_by_user` เอง
   * ด้วย **column grant** (P4 ยิงจริง 6 ทางเข้ารวม `upsert` ทั้งสองแบบ — ถูกปฏิเสธหมด)
   *
   * 🔴 **แต่ `security definer` รันด้วยสิทธิ์ของ *เจ้าของฟังก์ชัน* ซึ่งถือ grant ระดับตารางเต็ม**
   * → รั้วคอลัมน์ไม่มีผลข้างในนั้นเลยสักนิด · ฟังก์ชันที่รับ payload ตรง ๆ แล้วส่งต่อ
   *   จะเขียนคอลัมน์ที่รั้วห้ามไว้ได้ทันที **โดยไม่มีด่านไหนส่งเสียง**
   *
   * 🎯 วันนี้ยังไม่รั่ว **เพราะลายเซ็นของฟังก์ชันที่มีอยู่มันแคบ ไม่ใช่เพราะรั้วกัน** —
   *   รูปเดียวกับ `E1-AC8` (ปลอดภัยเพราะ provider ที่เปิดอยู่ ไม่ใช่เพราะกติกา)
   *
   * ⚠️ **`E3` คือการเพิ่ม RPC เป็นชุด** — ถ้าไม่มีด่านนี้ มันคือการรื้อรั้วทีละท่อนโดยไม่มีใครนับ
   */
  it("🔴 รายชื่อ security definer ต้องไม่เปลี่ยน — RPC ใหม่ต้องถูกตรวจก่อนขึ้นทะเบียน", () => {
    const src = migrationFiles.map((f) => stripComments(readFileSync(f, "utf8"))).join("\n");
    const found = new Set<string>();
    const re =
      /create\s+(?:or\s+replace\s+)?function\s+((?:app|public)\.\w+)\s*\([\s\S]*?\)\s*returns([\s\S]*?)(?:\$\$|\bas\b)/gi;
    for (const m of src.matchAll(re)) {
      if (m[2].toLowerCase().includes("security definer")) found.add(m[1]);
    }
    expect(found.size, "อ่านฟังก์ชันไม่เจอเลย — regex หรือรูปแบบไฟล์เปลี่ยน").toBeGreaterThan(5);
    expect(
      [...found].sort(),
      "มี security definer ตัวใหม่ หรือหายไป\n" +
        "  🔴 ถามก่อนขึ้นทะเบียน: **ฟังก์ชันตัวใหม่รับคอลัมน์ที่ column grant ห้ามไว้หรือเปล่า**\n" +
        "     (`created_at` · `updated_at` · `updated_by_user` · หรือ `id` ของตารางไหนก็ตาม)\n" +
        "  ข้างในฟังก์ชัน definer **รั้วคอลัมน์ไม่มีผล** — ต้องกันที่ลายเซ็น ไม่ใช่หวังให้ grant กัน",
    ).toEqual([
      // 🔴 เพิ่ม 2 ตัว 25 ส.ค. (P1) — **trigger ที่ยืนยันค่าคงที่ของฐาน ไม่ใช่สิทธิ์ของผู้ใช้**
      //    คำตอบของคำถามข้างบน: **ทั้งคู่ไม่รับพารามิเตอร์เลย** (เป็น trigger function)
      //    และไม่คืนข้อมูลออกไปสักไบต์ — คืน `null`/`old` แล้ว `raise` เท่านั้น
      //    เหตุผลที่ต้องเป็น definer: invoker แปลว่า **ค่าคงที่ถูกบังคับกับบางคน และเงียบกับบางคน**
      //    · และคนที่มันเงียบด้วยคือคนที่มีสิทธิ์มากที่สุด ซึ่งกลับด้านกับสิ่งที่ควรเป็น
      "app.assert_day_has_no_stops",
      // 🔴 เพิ่ม 25 ส.ค. — FK `restrict` กันการลบ**จริง**ได้ แต่ **ไม่รู้จัก `deleted_at`**
      //    ถ้าไม่มีตัวนี้ soft delete จะพาสถานที่หายไปจากใต้จุดแวะที่ยังชี้อยู่
      "app.assert_place_not_in_use",
      "app.assert_trip_has_owner",
      "app.assert_trip_has_plan",
      "app.bootstrap_trip_owner",
      "app.can_read_trip",
      "app.can_write_trip",
      "app.handle_new_user",
      "app.shares_trip_with",
      "app.trip_owner_count",
      "app.trip_role",
      "public.client_writable_timestamps",
      "public.create_trip",
      // 🔴 `P-53` — soft delete ต้องผ่าน RPC เพราะ PostgREST ห่อ `UPDATE` ด้วย `RETURNING` เสมอ
      //    → แถวที่เพิ่งทำให้ตัวเองหายไป ไม่ผ่าน policy `SELECT` ของตัวเอง · **`P-26` กลับด้าน**
      //    คำตอบของคำถามข้างบน: รับ `p_id uuid` ตัวเดียว · ตั้ง `deleted_at` เท่านั้น
      //    · ถาม `app.can_write_trip()` ของคนเรียกเองก่อนทำอะไรทั้งสิ้น
      "public.soft_delete_booking",
      "public.soft_delete_custom_place",
      "public.soft_delete_trip_stop",
      "public.unsafe_state_clear",
      "public.unsafe_state_reason",
      "public.unsafe_state_set",
    ]);
  });

  it("🔴 เงื่อนไขของ policy ต้องไม่เปลี่ยน — ชื่อเดิมแต่กว้างขึ้น คือเคสที่รายชื่ออย่างเดียวมองไม่เห็น", () => {
    // 🔴 `P-35` (P1 พบ): `using (app.can_read_trip(id) or created_by = auth.uid())`
    //    **ชื่อเดิม · จำนวนเดิม · รายชื่อเดิม · แต่ `created_by` กลายเป็นแหล่งสิทธิ์ที่สอง**
    //    → ด่านที่นับชื่อจับไม่ได้เลย · ต้องตรึง**เนื้อ**ไม่ใช่แค่**ป้าย**
    //    ⚠️ แดงข้อนี้ = ไปไล่กิ่งของ policy ที่เปลี่ยน **แล้วค่อยอัปเดตค่านี้** ไม่ใช่อัปเดตให้ผ่าน
    const fingerprint = createHash("sha256")
      .update([...policyMap().entries()].sort().map(([k, v]) => `${k}=${v}`).join("\n"))
      .digest("hex")
      .slice(0, 16);
    // 🔴 อัปเดตรอบ 9 (`2a759c27…` → `35d64de3…`) — `bookings` 3 policy (ไม่มี DELETE · `D76`)
    // 🔴 อัปเดตรอบ 8 (`01adb82c…` → `2a759c27…`) — **ค่าไม่ได้เปลี่ยนเพราะ policy เปลี่ยน**
    //    แต่เพราะตัวสแกนเพิ่งรู้จัก `drop policy` → policy ที่ถูกถอดออกไม่ถูกนับอีกต่อไป
    //    🎯 ค่าเดิมคือ fingerprint ของ**ไฟล์ทุกบรรทัดที่เคยเขียน** · ค่าใหม่คือของ**สภาพหลังรันจบ**
    // 🔴 อัปเดตรอบ 7 (`d223b58a…` → `01adb82c…`) — `D76` soft delete
    //    `trip_stops_select`/`custom_places_select` เติม `and deleted_at is null`
    //    · policy `DELETE` ของทั้งสองตาราง **ถูกถอดออก** (ลบผ่าน RPC เท่านั้น · `P-53`)
    // 🔴 อัปเดตรอบ 6 (`be2d37ba…` → `d223b58a…`) — `trip_stops` 4 policy
    //    กิ่งที่ไล่แล้ว: editor เขียนได้ · viewer ถูกปฏิเสธ · `D70` ชี้สถานที่ข้ามทริปไม่ได้
    //    · `D53` check ผูกกับ `kind` (0 · 1 · ห้าม 2) · `trip_id` เขียนไม่ได้ · `D73` trigger ยิงจริง
    // 🔴 อัปเดตรอบ 5 (`9dfaba9e…` → `be2d37ba…`) — `custom_places` + `custom_place_names` 8 policy
    //    ครบ 4 verb ทั้งสองตาราง · ทุกกิ่งมีเคสสด (editor เขียนได้ · viewer อ่านได้เขียนไม่ได้ · คนนอกไม่เห็น)
    // 🔴 อัปเดตรอบ 4 (`f9c74ff5…` → `9dfaba9e…`) — คลังครบ 4 ตาราง (`places` · `place_names`)
    //    ทั้งสองเป็น `select` + `using (true)` เหมือนสองตัวแรก · **ไม่มีฝั่งเขียนเลยสักตัว**
    // 🔴 อัปเดตรอบ 3 (`b039fbcc…` → `f9c74ff5…`) — เพิ่มตารางคลัง 2 policy
    //    ทั้งคู่เป็น `using (true)` **โดยตั้งใจและระบุชื่อไว้** (`D74`) — คลังเป็นข้อมูลสาธารณะ
    //    ⚠️ ถ้าวันหนึ่ง fingerprint เปลี่ยนเพราะมีคนเติม policy **ฝั่งเขียน** ให้คลัง นั่นคือคนละเรื่องกันสิ้นเชิง
    // 🔴 อัปเดต 25 ส.ค. 2026 รอบ 2 (`badfb2d0…` → `b039fbcc…`) — เพิ่มชั้นแผน 7 policy
    //    (`trip_plans` 4 ตัว รวม **DELETE ตัวแรกของ `E2`** · `trip_day_plan_settings` 3 ตัว)
    //    ทุกตัวมีเคสสดของตัวเองแล้ว รวมเคส `D70` ที่พิสูจน์ว่า **FK ประกอบ** เป็นตัวปฏิเสธ ไม่ใช่ RLS
    // 🔴 อัปเดตรอบ 1 (`1463dca6…` → `badfb2d0…`) — เพิ่ม `trip_days` 3 policy
    //    **ไล่กิ่งก่อนแล้วค่อยเปลี่ยนค่า ไม่ใช่เปลี่ยนค่าให้เขียว:** ทั้งสามกิ่งมีเคสสดของตัวเองแล้ว
    //    (`_select` → viewer อ่านได้ · `_insert` → viewer ถูกปฏิเสธ / editor ผ่าน · `_update` → `with check` กันย้ายวันข้ามทริป)
    //    และเคสพวกนั้นถูกเห็น **แดงด้วย `PGRST205` ก่อน `db push`** จึงรู้ว่ามันแตะตารางจริง
    expect(fingerprint, "เงื่อนไขของ policy บางตัวเปลี่ยนไป — ไล่กิ่งใหม่ก่อนอัปเดตค่านี้").toBe(
      "35d64de3e07af763",
    );
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
describe("unsafeGuardMessage — ด่านสภาพฐาน · 2 ทิศ (กฎ E0 ข้อ 1–2)", () => {
  // 🔴 เคสพวกนี้เรียก **ฟังก์ชันตัวเดียวกับที่ beforeAll ใช้** ไม่ใช่สำเนา (กฎ E0 ข้อ 5)
  it("ด้านลบ: ฐานสะอาด → ปล่อยผ่าน", () => {
    expect(unsafeGuardMessage(null, null)).toBeNull();
  });

  it("🔴 ด้านบวก: มีธง → ต้องล้ม และข้อความต้องบอกเหตุผลที่ปักไว้", () => {
    const msg = unsafeGuardMessage("mutation test ก้อน A", null);
    expect(msg).not.toBeNull();
    expect(msg, "ข้อความไม่บอกเหตุผลที่ปัก = คนอ่านไม่รู้ว่าใครทำอะไรอยู่").toContain(
      "mutation test ก้อน A",
    );
  });

  it("🔴 ด้านบวก: อ่านสถานะไม่ได้ → ต้องล้ม ไม่ใช่ผ่าน (ตรวจไม่ได้ ≠ ปลอดภัย)", () => {
    // ถ้าปล่อยผ่าน ด่านนี้จะหายไปเงียบ ๆ บนฐานที่ยังไม่มีฟังก์ชัน — คือด่านที่ไม่มีอยู่
    const msg = unsafeGuardMessage(null, { code: "PGRST202", message: "function not found" });
    expect(msg).not.toBeNull();
    expect(msg).toContain("PGRST202");
  });

  it("ข้อความต้องห้ามการรันใหม่ให้เขียว — เพราะนั่นคือสิ่งที่คนทำเป็นปกติ", () => {
    expect(unsafeGuardMessage("x", null)).toContain("อย่ารันใหม่เพื่อให้เขียว");
  });
});

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
    // ใช้ด่านตัวเดียวกับทุกชุดสด (`_helpers`) — สองชุดที่ต่างกันนิดเดียวจะทำให้
    // ไฟล์หนึ่งถูกบังคับ อีกไฟล์หลุด ซึ่งเกิดขึ้นแล้วจริงกับ `authProviders.test.ts`
    requireLiveCreds(hasCreds, "RLS matrix (สด)", [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
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

    // 🔴 ก่อนอย่างอื่นทั้งหมด — ฐานอยู่ในสภาพที่ผลมีความหมายหรือเปล่า
    //    ต้องมาก่อนสร้าง fixture ไม่งั้นเราจะเขียนข้อมูลลงฐานที่ RLS เปิดโล่งอยู่
    const flag = await admin.rpc("unsafe_state_reason");
    const block = unsafeGuardMessage(flag.data ?? null, flag.error);
    if (block) throw new Error(block);

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

    // 🔴 ฉบับเดิมเป็น `.catch(() => {})` — **กลืนความล้มเหลวทั้งหมดโดยไม่มีสัญญาณ**
    //    เส้นทางที่ล้มได้จริง: `deleteUser` → `profiles` cascade → ชน `trips.created_by`
    //    ที่เป็น `on delete restrict` ถ้ามีทริปของรอบนี้หลงเหลือ (เช่นถูกสร้างนอกตัวกรองข้างบน)
    //    → ผู้ใช้ค้างในฐานของกลางถาวร **และพอกขึ้นทุกรอบโดยไม่มีใครรู้**
    //    ⚠️ ยัง **ไม่ throw** ด้วยเหตุผลเดียวกับข้างบน: afterAll ที่ล้มจะกลบผลของเคสที่เพิ่งรัน
    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`\n⚠️  ลบผู้ใช้ทดสอบ ${id} ไม่สำเร็จ: ${error.message}\n`);
    }
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

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 trip_members — กิ่งที่ไม่มีใครเดินไปถึง (นับกิ่ง แล้วนับเคส)", () => {
    /**
     * ไล่ `trip_members` ทั้ง 4 policy ด้วยวิธีเดียวกับ `P-44`:
     *
     * | policy | เงื่อนไข | เคสที่มีอยู่ก่อนหน้านี้ |
     * |---|---|---|
     * | `_select` | `can_read_trip(trip_id)` | **owner อ่านเท่านั้น** — สมาชิกที่ไม่ใช่ owner ไม่เคยลอง |
     * | `_insert` | `trip_role = 'owner'` | owner เชิญ ✅ · คนนอกเชิญ ✅ · **สมาชิกที่ไม่ใช่ owner เชิญ — ไม่เคยลอง** |
     * | `_update` | `trip_role = 'owner'` | **ไม่มีเคสด้านบวกเลย** และ **ไม่มีใครลองเลื่อนขั้นตัวเอง** |
     * | `_delete` | 2 กิ่ง | ลาออกเอง ✅ · **owner ถอดคนอื่น — ไม่มีเคสด้านบวก** |
     *
     * 🔴 **ช่องที่แพงที่สุดคือ `_update`**: ไม่มีเคสไหนถามว่า *"viewer เลื่อนตัวเองเป็น owner ได้ไหม"*
     * ถ้า policy เขียนเป็น `can_read_trip` แทน `trip_role = 'owner'` **ใครที่ถูกเชิญเข้าทริป
     * ก็ยึดทริปได้ทันที** และเมทริกซ์ 54 เคสจะยังเขียวครบ เพราะทุกเคสถามแต่ว่า *คนนอก* ทำอะไรไม่ได้
     */
    beforeAll(async () => {
      const { error } = await A.from("trip_members").insert({
        trip_id: tripA,
        user_id: ids.c,
        role: "viewer",
      });
      if (error) throw new Error(`เชิญ C เป็น viewer ไม่ได้: ${error.message}`);
    });

    afterAll(async () => {
      await A.from("trip_members").delete().eq("trip_id", tripA).eq("user_id", ids.c);
    });

    it("ด้านบวก: viewer เห็นรายชื่อสมาชิกของทริปที่ตัวเองอยู่", async () => {
      const { data, error } = await C.from("trip_members").select("user_id").eq("trip_id", tripA);
      expect(error).toBeNull();
      expect(data, "สมาชิกมองไม่เห็นว่าใครอยู่ในทริปด้วยกัน").not.toHaveLength(0);
    });

    it("🔴 viewer เลื่อนตัวเองเป็น owner ไม่ได้ — ทางยึดทริปที่ไม่เคยมีใครทดสอบ", async () => {
      // UPDATE ที่ถูก RLS กรองคืน 200 ไม่มี error → ต้องอ่านซ้ำในฐานะ A ถึงจะรู้ผลจริง
      await C.from("trip_members")
        .update({ role: "owner" })
        .eq("trip_id", tripA)
        .eq("user_id", ids.c);
      const { data } = await A.from("trip_members")
        .select("role")
        .eq("trip_id", tripA)
        .eq("user_id", ids.c)
        .single();
      expect(data?.role, "viewer เลื่อนตัวเองเป็น owner สำเร็จ = ใครถูกเชิญก็ยึดทริปได้").toBe(
        "viewer",
      );
    });

    it("🔴 viewer เชิญคนอื่นเข้าทริปไม่ได้ — สมาชิกภาพไม่ใช่สิทธิ์เชิญ", async () => {
      const { error } = await C.from("trip_members").insert({
        trip_id: tripA,
        user_id: ids.b,
        role: "viewer",
      });
      expect(error?.code, `viewer เชิญคนอื่นได้: ${error?.message ?? "ไม่มี error เลย"}`).toBe(
        "42501",
      );
    });

    it("🔴 viewer ถอด owner ออกไม่ได้", async () => {
      await C.from("trip_members").delete().eq("trip_id", tripA).eq("user_id", ids.a);
      const { data } = await A.from("trip_members").select("user_id").eq("trip_id", tripA);
      expect(data?.map((r) => r.user_id), "viewer ถอด owner ออกได้ = ทริปถูกยึด").toContain(ids.a);
    });

    it("ด้านบวก: owner เปลี่ยนบทบาทสมาชิกคนอื่นได้ (ไม่มีเคสนี้มาก่อนเลย)", async () => {
      const { error } = await A.from("trip_members")
        .update({ role: "editor" })
        .eq("trip_id", tripA)
        .eq("user_id", ids.c);
      expect(error).toBeNull();
      const { data } = await A.from("trip_members")
        .select("role")
        .eq("trip_id", tripA)
        .eq("user_id", ids.c)
        .single();
      expect(data?.role, "owner เปลี่ยนบทบาทคนอื่นไม่ได้ = ฟีเจอร์จัดการทีมพังเงียบ").toBe("editor");
    });

    it("ด้านบวก: owner ถอดสมาชิกคนอื่นออกได้ (กิ่งแรกของ _delete ที่ไม่เคยถูกเดิน)", async () => {
      await A.from("trip_members").delete().eq("trip_id", tripA).eq("user_id", ids.c);
      const { data } = await A.from("trip_members").select("user_id").eq("trip_id", tripA);
      expect(data?.map((r) => r.user_id), "owner ถอดคนอื่นออกไม่ได้").not.toContain(ids.c);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 กิ่งที่เหลือของ trips_insert · trips_update · profiles_* ", () => {
    /**
     * ปิดรายการ `D60` ให้ครบทุก policy ของ `E1`
     *
     * 🔴 **ข้อแรกเป็นช่องที่ผมสร้างขึ้นเองตอนย้าย `mk()` ไปใช้ RPC (`dc386ec`)**
     * ก่อนหน้านั้น `mk()` ยิง `insert` ตรง ทุกรอบของ `beforeAll` จึงเดินผ่าน `trips_insert` เสมอ
     * · พอย้ายไป RPC (ซึ่งเป็น `security definer` = **ข้าม RLS**) **ไม่มีอะไรเดินผ่าน policy นั้นอีกเลย**
     * → เคสด้านลบเดียวที่เหลือคือ anon (`E1-AC4`) ซึ่งถูกกันด้วย **grant** ไม่ใช่ policy
     * ⚠️ **การย้ายไปทางที่ปลอดภัยกว่า ทำให้ด่านเก่าหลุดออกจากการทดสอบโดยไม่มีใครสังเกต** —
     *   ชนิดเดียวกับที่ `D60` มีไว้จับ แค่มาจากทางที่เราเป็นคนทำเอง
     */
    it("🔴 ด้านลบ: A สร้างทริปในนามคนอื่นไม่ได้ (trips_insert · กิ่งนี้ไม่มีใครเดินตั้งแต่ย้ายไป RPC)", async () => {
      const { error } = await A.from("trips").insert({
        created_by: ids.b,
        title: `forged-${stamp}`,
        start_date: "2026-10-11",
        end_date: "2026-10-21",
      });
      expect(error?.code, `A สร้างทริปในนาม B ได้: ${error?.message ?? "ไม่มี error"}`).toBe("42501");
    });

    it("ด้านบวก: A สร้างทริปในนามตัวเองด้วย insert ตรงได้ (ไม่มี .select() จึงไม่ชน P-26)", async () => {
      // `.select()` ต่างหากที่ล้ม ไม่ใช่ `insert` — เคสนี้ตรึงความต่างนั้นไว้
      const { error } = await A.from("trips").insert({
        created_by: ids.a,
        title: `direct-${stamp}`,
        start_date: "2026-10-11",
        end_date: "2026-10-21",
      });
      expect(error, "insert ตรงในนามตัวเองถูกปฏิเสธ = trips_insert เข้มเกินไป").toBeNull();
    });

    it("🔴 editor แก้ทริปไม่ได้ — บทบาทกลางที่ไม่มีเคสไหนในไฟล์นี้เคยแตะ", async () => {
      // ⚠️ เคสนี้**ตรึงพฤติกรรมวันนี้** (`trips_update` = owner เท่านั้น) ไม่ใช่รับรองว่าถูก
      //    ถ้า E2 ตัดสินว่า editor ควรแก้ทริปได้ **ให้แก้เคสนี้อย่างตั้งใจ ไม่ใช่ลบทิ้งให้ผ่าน**
      //    📌 วันนี้ `editor` กับ `viewer` มีสิทธิ์เท่ากันทุกประการใน E1 — ดูรายงาน P-46
      await A.from("trip_members").insert({ trip_id: tripA, user_id: ids.c, role: "editor" });
      await C.from("trips").update({ title: `editor-edit-${stamp}` }).eq("id", tripA);
      const { data } = await A.from("trips").select("title").eq("id", tripA).single();
      expect(data?.title, "editor แก้ทริปได้ ทั้งที่ policy เขียนว่า owner เท่านั้น").not.toBe(
        `editor-edit-${stamp}`,
      );
      await A.from("trip_members").delete().eq("trip_id", tripA).eq("user_id", ids.c);
    });

    it("🔴 A แก้โปรไฟล์คนอื่นไม่ได้ (profiles_update · เดิมทดสอบแต่แก้ของตัวเอง)", async () => {
      await A.from("profiles").update({ display_name: `hijack-${stamp}` }).eq("id", ids.b);
      const { data } = await B.from("profiles").select("display_name").eq("id", ids.b).single();
      expect(data?.display_name, "A แก้โปรไฟล์ B ได้").not.toBe(`hijack-${stamp}`);
    });

    it("🔴 A สร้างแถว profiles ให้คนอื่นไม่ได้ (profiles_insert · ไม่มีเคสเลยทั้งสองทิศ)", async () => {
      const { error } = await A.from("profiles").insert({ id: ids.b, display_name: `fake-${stamp}` });
      expect(error, "A แทรกแถว profiles ของ B ได้").not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 P-35 — created_by ต้องไม่เป็นแหล่งสิทธิ์ที่สอง (P-15 ในรูปที่เงียบที่สุด)", () => {
    /**
     * 🎯 **เคสนี้เกิดจากคำถามของ P1 ที่ว่า "ถ้าก้อนคืนค่าถูกพิมพ์กว้างกว่าเดิมล่ะ"**
     *
     * ถ้า `trips_select` กลายเป็น `using (app.can_read_trip(id) or created_by = auth.uid())`
     * **เคสทั้ง 67 ตัวก่อนหน้านี้ยังเขียวครบ**:
     *   · เจ้าของเห็นทริปตัวเอง → ผ่านทั้งสองแบบ
     *   · สมาชิกเห็น → ผ่านทั้งสองแบบ
     *   · **คนนอกไม่เห็น → ผ่านทั้งสองแบบ เพราะ `created_by` ไม่ได้ช่วยคนนอก**
     *
     * 🔴 คนเดียวที่ผลต่างคือ **คนสร้างที่ถูกถอดออกจาก `trip_members` แล้ว** — และไม่มีเคสไหนถามถึงเขาเลย
     * → `created_by` กลายเป็นสิทธิ์ถาวรที่ถอดไม่ได้ **ผ่านช่องที่หลักฐานความปลอดภัยหลักของเรามองไม่เห็น**
     *
     * ⚠️ เคส `viewer ที่เพิ่งถูกเชิญ` จับทิศ *"เข้มเกินไป"* ได้ · **ทิศ "กว้างเกินไป" ไม่มีอะไรจับ จนถึงเคสนี้**
     */
    it("🔴 คนสร้างทริปที่ถูกถอดออกจาก trip_members แล้ว ต้องอ่านทริปตัวเองไม่ได้", async () => {
      // ใช้ทริปใหม่ ไม่แตะ tripA — เคสอื่นพึ่งสมาชิกภาพของ tripA อยู่
      const { data: trip, error: mkErr } = await A.rpc("create_trip", {
        p_title: `p35-${stamp}`,
        p_start_date: "2026-10-11",
        p_end_date: "2026-10-21",
      });
      expect(mkErr).toBeNull();

      // ต้องมี owner คนที่ 2 ก่อน ไม่งั้น A ลาออกไม่ได้ (P-19 กันทริปไม่มี owner)
      const { error: invErr } = await A.from("trip_members").insert({
        trip_id: trip.id,
        user_id: ids.b,
        role: "owner",
      });
      expect(invErr, "เชิญ B เป็น owner คนที่ 2 ไม่ได้").toBeNull();

      const { error: outErr } = await A.from("trip_members")
        .delete()
        .eq("trip_id", trip.id)
        .eq("user_id", ids.a);
      expect(outErr).toBeNull();

      // ถึงตรงนี้ A ยังเป็น `created_by` ของทริปนี้อยู่ แต่ไม่ใช่สมาชิกแล้ว
      const { data } = await A.from("trips").select("id").eq("id", trip.id);
      expect(
        data,
        "คนสร้างที่ถูกถอดออกแล้วยังอ่านทริปได้ = created_by เป็นแหล่งสิทธิ์ที่สอง (P-15 พัง)",
      ).toEqual([]);

      // และ B ที่ยังเป็นสมาชิกต้องยังเห็น — กันเคส "เขียวเพราะทริปหายไปเฉย ๆ"
      const { data: bSees } = await B.from("trips").select("id").eq("id", trip.id);
      expect(bSees, "B ก็ไม่เห็น = ทริปหาย ไม่ใช่ RLS กรอง → เคสบนพิสูจน์ไม่ได้").toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — trip_days: ตารางเนื้อหาตัวแรก · และเคสแรกที่ editor ≠ viewer (P-46)", () => {
    /**
     * ทำไมบล็อกนี้สร้างทริปของตัวเอง ไม่ใช้ `tripA`:
     * เคสอื่นพึ่งสมาชิกภาพของ `tripA` อยู่ (บล็อก `trip_members` เชิญ/ถอด `C` เข้าออก)
     * ถ้ามาใช้ร่วมกัน ลำดับการรันจะกลายเป็นส่วนหนึ่งของผล — ซึ่งเป็นวิธีที่เมทริกซ์เขียวหลอกได้เงียบที่สุด
     *
     * 🔴 **เคสด้านบวกของ `editor` ต้องมี ไม่ใช่มีแต่ด้านลบของ `viewer`** (`P-44`)
     * ถ้า `can_write_trip` เขียนผิดจนปฏิเสธทุกคน เคสด้านลบจะเขียวครบทั้งแผง
     * โดยที่ **ไม่มีใครแก้แผนได้เลยทั้งแพลตฟอร์ม** — อาการที่ผู้ใช้เจอคือ "เว็บพัง" ไม่ใช่ "ปลอดภัยดี"
     */
    let tripD = "";
    const day1 = "2026-10-12";
    const day2 = "2026-10-13";

    beforeAll(async () => {
      const { data, error } = await A.rpc("create_trip", {
        p_title: `days-${stamp}`,
        p_start_date: "2026-10-11",
        p_end_date: "2026-10-21",
      });
      if (error) throw new Error(`สร้างทริปของบล็อก trip_days ไม่ได้: ${error.message}`);
      tripD = data.id as string;

      const { error: e1 } = await A.from("trip_members").insert({
        trip_id: tripD,
        user_id: ids.b,
        role: "editor",
      });
      if (e1) throw new Error(`เชิญ B เป็น editor ไม่ได้: ${e1.message}`);

      const { error: e2 } = await A.from("trip_members").insert({
        trip_id: tripD,
        user_id: ids.c,
        role: "viewer",
      });
      if (e2) throw new Error(`เชิญ C เป็น viewer ไม่ได้: ${e2.message}`);
    });

    // ── ด้านบวก — precondition ของทั้งบล็อก ────────────────────────────────
    describe("ด้านบวก — ถ้าตรงนี้แดง เคสด้านลบข้างล่างไม่ได้พิสูจน์อะไรเลย", () => {
      it("owner เพิ่มวันได้", async () => {
        const { error } = await A.from("trip_days").insert({ trip_id: tripD, date: day1 });
        expect(error, `owner เพิ่มวันไม่ได้: ${error?.message}`).toBeNull();
      });

      it("🔴 editor เพิ่มวันได้ — กิ่งที่ทำให้ `editor` มีความหมายต่างจาก `viewer` เป็นครั้งแรก", async () => {
        const { error } = await B.from("trip_days").insert({ trip_id: tripD, date: day2 });
        expect(
          error,
          `editor เพิ่มวันไม่ได้: ${error?.message}\n` +
            "  ถ้าข้อนี้แดง อย่าเพิ่งดีใจกับเคส viewer ข้างล่าง — มันจะเขียวเพราะไม่มีใครเขียนได้เลย",
        ).toBeNull();
      });

      it("🔴 viewer อ่านวันได้ — คนที่ถูกเชิญมาดูแผน ต้องเห็นแผน (P-44)", async () => {
        const { data, error } = await C.from("trip_days").select("date").eq("trip_id", tripD);
        expect(error).toBeNull();
        expect(
          data,
          "viewer เปิดมาเจอหน้าเปล่า = ฟีเจอร์หลักตายโดยที่ข้ออ้างความปลอดภัยยังจริงทุกข้อ",
        ).toHaveLength(2);
      });
    });

    // ── ด้านลบ ──────────────────────────────────────────────────────────────
    it("🔴 viewer เพิ่มวันไม่ได้ — เคสที่ `P-46` มีอยู่เพื่อข้อนี้ข้อเดียว", async () => {
      const { error } = await C.from("trip_days").insert({ trip_id: tripD, date: "2026-10-14" });
      expect(
        error?.code,
        `viewer เพิ่มวันได้: ${error?.message ?? "ไม่มี error เลย"}\n` +
          "  = policy ฝั่งเขียนกรองด้วยสิทธิ์อ่าน · บทบาท 'ดูอย่างเดียว' ไม่มีอยู่จริง",
      ).toBe("42501");
    });

    it("🔴 viewer แก้วันไม่ได้ — UPDATE ที่ถูก RLS กรองคืน 200 ต้องอ่านซ้ำถึงจะรู้ผลจริง", async () => {
      await C.from("trip_days")
        .update({ timezone: "Pacific/Kiritimati" })
        .eq("trip_id", tripD)
        .eq("date", day1);
      const { data } = await A.from("trip_days")
        .select("timezone")
        .eq("trip_id", tripD)
        .eq("date", day1)
        .single();
      expect(data?.timezone, "viewer แก้วันสำเร็จ").toBeNull();
    });

    it("🔴 ย้ายวันไปทริปที่ตัวเองไม่ใช่สมาชิก ไม่ได้ — กิ่งที่มีแต่ `with check` เท่านั้นที่กัน", async () => {
      // A เขียน `tripD` ได้ (owner) → `using` ผ่าน · แต่เขียน `tripB` ไม่ได้ → `with check` ต้องปฏิเสธ
      // ตัด `with check` ออกเมื่อไหร่ ข้อนี้จะเป็นทางลากทั้งวัน (พร้อมจุดแวะ) เข้าไปในทริปของคนอื่น
      const { error } = await A.from("trip_days")
        .update({ trip_id: tripB })
        .eq("trip_id", tripD)
        .eq("date", day1);
      expect(
        error?.code,
        `ย้ายวันข้ามทริปสำเร็จ: ${error?.message ?? "ไม่มี error เลย"}`,
      ).toBe("42501");
    });

    it("🔴 คนนอกอ่านวันของทริปที่ตัวเองไม่ได้อยู่ ไม่ได้ (cross-tenant read)", async () => {
      const { error: mkErr } = await B.from("trip_days").insert({ trip_id: tripB, date: day1 });
      expect(mkErr, "B เพิ่มวันในทริปตัวเองไม่ได้").toBeNull();

      const { data } = await A.from("trip_days").select("id").eq("trip_id", tripB);
      expect(data, "A ไม่ได้เป็นสมาชิก tripB แต่เห็นวันของมัน").toEqual([]);
    });

    it("🔴 คนนอกเพิ่มวันเข้าทริปของคนอื่นไม่ได้ — `with check` ฝั่ง INSERT (กิ่งที่ยังไม่มีใครเดิน)", async () => {
      // เคส "ย้ายวันไปทริปที่ไม่ได้เป็นสมาชิก" ข้างบนเดินกิ่ง UPDATE · กิ่ง INSERT เป็นคนละทาง
      // 🔴 ถ้ากิ่งนี้หลุด คนนอกจะ **สร้างข้อมูลในทริปคนอื่น** ได้ ซึ่งแย่กว่าอ่านได้
      //    เพราะเจ้าของทริปจะเห็นวันที่ตัวเองไม่ได้สร้าง โดยไม่มีอะไรบอกว่ามาจากไหน
      const { error } = await A.from("trip_days").insert({ trip_id: tripB, date: "2026-10-19" });
      expect(error?.code, `A เพิ่มวันเข้าทริปของ B ได้: ${error?.message ?? "ไม่มี error"}`).toBe(
        "42501",
      );
    });

    it("🔴 ไม่มีใครลบวันได้ แม้แต่ owner — `D18`: ไม่มี policy DELETE คือเข้าไม่ถึง ไม่ใช่ซ่อนปุ่ม", async () => {
      // ⚠️ DELETE ที่ถูก RLS กรองคืน 200 ไม่มี error → เช็ค error อย่างเดียวคือเช็คผิดทาง
      //    ต้องอ่านซ้ำถึงจะรู้ว่าแถวยังอยู่จริงไหม (รูปเดียวกับเคส UPDATE ข้างบน)
      // 🎯 เคสนี้ตรึง **การไม่มีอยู่โดยตั้งใจ** — ถ้าวันหนึ่งมีคนเติม policy DELETE เข้ามา
      //    เคสนี้จะแดง และนั่นคือสิ่งที่ควรเกิด ไม่ใช่สิ่งที่ต้องแก้ให้ผ่าน
      const { data: before } = await A.from("trip_days").select("id").eq("trip_id", tripD);
      expect(before, "ต้องมีวันอยู่ก่อน ไม่งั้นเคสนี้เขียวเพราะไม่มีอะไรให้ลบ").not.toHaveLength(0);

      await A.from("trip_days").delete().eq("trip_id", tripD);
      const { data: after } = await A.from("trip_days").select("id").eq("trip_id", tripD);
      expect(after?.length, "owner ลบวันได้ = มี policy DELETE ที่ไม่ควรมี").toBe(before?.length);
    });

    it("🔴 anon ไม่ได้อะไรเลยจาก trip_days", async () => {
      const { data, error } = await D.from("trip_days").select("id");
      // ได้ `[]` (RLS กรอง) หรือถูกปฏิเสธที่ชั้นสิทธิ์ — ทั้งสองทางรับได้ แต่ต้องไม่ใช่ "ได้แถวมา"
      expect(data ?? [], `anon อ่าน trip_days ได้: ${error?.message ?? ""}`).toEqual([]);
    });

    /**
     * 🔴 **เคสนี้เคยยืนยันสิ่งที่อ่อนกว่า และการเปลี่ยนคือการรัดให้แน่นขึ้น ไม่ใช่การแก้ให้เขียว**
     *
     * ฉบับแรก (25 ส.ค. เช้า) ยืนยันว่า *"ส่ง `updated_at` มาได้ แต่ trigger จะทับให้"*
     * ซึ่งจริงตอนนั้น **และครอบแค่ครึ่งเดียวของพื้นผิว** — `before update` ไม่ยิงตอน `INSERT`
     * P7 ไล่ DDL ที่ลงจริงแล้วเจอ (`mobile-arch.md §11.10`) → ปิดด้วย column grant
     * (`20260825122247_e2_freeze_row_times.sql`)
     *
     * ตอนนี้ทั้งสองทางถูกปฏิเสธที่**ชั้นสิทธิ์** ซึ่งแรงกว่าการถูกทับเงียบ ๆ:
     * ไคลเอนต์ที่ส่งมาจะได้ยินเสียง แทนที่จะเข้าใจว่าค่าที่ตัวเองส่งมีผล
     * · ด้านบวก (`updated_at` ยังขยับเองตอน update ปกติ) อยู่ในบล็อก `E2-AC9 ครึ่งที่หายไป` ท้ายไฟล์
     */
    it("🔴 E2-AC9 — `updated_at` ที่ client ส่งมาต้องถูกปฏิเสธ ไม่ใช่แค่ถูกทับ (D7)", async () => {
      const { error } = await A.from("trip_days")
        .update({ timezone: "Asia/Seoul", updated_at: "2000-01-01T00:00:00.000Z" })
        .eq("trip_id", tripD)
        .eq("date", day2);
      expect(
        error?.code,
        `client ส่ง updated_at มาแล้วไม่มีอะไรค้าน: ${error?.message ?? "ไม่มี error"}`,
      ).toBe("42501");

      // และการแก้ที่ถูกต้อง (ไม่ส่งคอลัมน์เวลา) ต้องยังผ่าน — ไม่งั้นข้อบนเขียวเพราะแก้อะไรไม่ได้เลย
      const ok = await A.from("trip_days")
        .update({ timezone: "Asia/Seoul" })
        .eq("trip_id", tripD)
        .eq("date", day2);
      expect(ok.error, `แก้ timezone ตามปกติไม่ได้: ${ok.error?.message}`).toBeNull();

      const { data } = await A.from("trip_days")
        .select("timezone")
        .eq("trip_id", tripD)
        .eq("date", day2)
        .single();
      expect(data?.timezone).toBe("Asia/Seoul");
    });

    it("🔴 วันซ้ำในทริปเดียวกันไม่ได้ — `trip_stops.day_id` จะชี้ได้สองที่ถ้าปล่อย", async () => {
      const { error } = await A.from("trip_days").insert({ trip_id: tripD, date: day1 });
      expect(error?.code, `เพิ่มวันซ้ำสำเร็จ: ${error?.message ?? "ไม่มี error เลย"}`).toBe("23505");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — ชั้นแผน: trip_plans + trip_day_plan_settings (D52 · D69 · D70)", () => {
    /**
     * ทริปของบล็อกนี้แยกจากบล็อกอื่นด้วยเหตุผลเดียวกับบล็อก `trip_days`:
     * เคสที่นี่ **ลบแผน** และ **สลับ `is_active`** ซึ่งถ้าไปทำกับ fixture ร่วม
     * ลำดับการรันจะกลายเป็นส่วนหนึ่งของผล
     *
     * `tripQ` มีไว้ข้อเดียว: เป็น**ทริปที่สองที่ A เขียนได้** เพื่อพิสูจน์ `D70`
     * — ถ้าใช้ทริปที่ A เขียนไม่ได้ RLS จะปฏิเสธก่อน แล้วเราจะไม่รู้เลยว่า FK ประกอบทำงานไหม
     * 🎯 **นี่คือจุดที่เคสส่วนใหญ่พลาด: มันพิสูจน์ว่า *อะไรบางอย่าง* ปฏิเสธ ไม่ใช่ว่า *ตัวที่เราสร้าง* ปฏิเสธ**
     */
    let tripP = "";
    let tripQ = "";
    let planP = "";
    let dayP = "";
    let dayQ = "";

    const mkTrip = async (title: string) => {
      const { data, error } = await A.rpc("create_trip", {
        p_title: `${title}-${stamp}`,
        p_start_date: "2026-10-11",
        p_end_date: "2026-10-21",
      });
      if (error) throw new Error(`สร้างทริป ${title} ไม่ได้: ${error.message}`);
      return data.id as string;
    };

    const mkDay = async (trip: string, date: string) => {
      const { data, error } = await A.from("trip_days")
        .insert({ trip_id: trip, date })
        .select("id")
        .single();
      if (error) throw new Error(`สร้างวัน ${date} ไม่ได้: ${error.message}`);
      return data.id as string;
    };

    beforeAll(async () => {
      tripP = await mkTrip("plans-P");
      tripQ = await mkTrip("plans-Q");
      dayP = await mkDay(tripP, "2026-10-12");
      dayQ = await mkDay(tripQ, "2026-10-12");

      const { error: e1 } = await A.from("trip_members").insert({
        trip_id: tripP, user_id: ids.b, role: "editor",
      });
      if (e1) throw new Error(`เชิญ B เป็น editor ไม่ได้: ${e1.message}`);

      const { error: e2 } = await A.from("trip_members").insert({
        trip_id: tripP, user_id: ids.c, role: "viewer",
      });
      if (e2) throw new Error(`เชิญ C เป็น viewer ไม่ได้: ${e2.message}`);

      // 🔴 `P-54` — `create_trip()` สร้าง `'แผน A'` (active) ให้แล้วตั้งแต่ 25 ส.ค.
      //    fixture เดิมสร้างซ้ำแล้วชน `trip_plans_one_active` · **การที่มันชนคือหลักฐานว่าพฤติกรรมเปลี่ยนจริง**
      const { data, error } = await A.from("trip_plans")
        .select("id").eq("trip_id", tripP).eq("is_active", true).single();
      if (error) throw new Error(`อ่านแผนตั้งต้นไม่ได้: ${error.message}`);
      planP = data.id as string;
    });

    describe("ด้านบวก — precondition", () => {
      it("editor สร้างแผนเพิ่มได้", async () => {
        const { error } = await B.from("trip_plans").insert({ trip_id: tripP, name: "แผน B" });
        expect(error, `editor สร้างแผนไม่ได้: ${error?.message}`).toBeNull();
      });

      it("viewer อ่านแผนได้", async () => {
        const { data, error } = await C.from("trip_plans").select("name").eq("trip_id", tripP);
        expect(error).toBeNull();
        expect(data, "viewer เปิดมาไม่เห็นแผนสักใบ").not.toHaveLength(0);
      });

      it("🔴 D70 ด้านบวก — คู่ที่ถูกต้อง (แผนกับวันของทริปเดียวกัน) ต้องเขียนได้", async () => {
        const { error } = await A.from("trip_day_plan_settings").insert({
          trip_id: tripP, plan_id: planP, trip_day_id: dayP, start_time: "08:30",
        });
        expect(
          error,
          `คู่ที่ถูกต้องยังเขียนไม่ได้: ${error?.message}\n` +
            "  ถ้าข้อนี้แดง เคส D70 ด้านลบข้างล่างจะเขียวเพราะไม่มีใครเขียนอะไรได้เลย",
        ).toBeNull();
      });
    });

    it("🔴 D70 — แผนของทริปหนึ่ง + วันของอีกทริปหนึ่ง ต้องเขียนลงไปไม่ได้", async () => {
      // A เขียนได้ทั้ง tripP และ tripQ → RLS ไม่ใช่ตัวที่ปฏิเสธข้อนี้ · FK ประกอบต่างหาก
      const { error } = await A.from("trip_day_plan_settings").insert({
        trip_id: tripP, plan_id: planP, trip_day_id: dayQ,
      });
      expect(
        error?.code,
        `จับคู่ข้ามทริปสำเร็จ: ${error?.message ?? "ไม่มี error เลย"}\n` +
          "  = แถวที่พ่อสองคนอยู่คนละทริป · และ cascade ของแผนจะลบของทริปอื่นได้",
      ).toBe("23503");
    });

    it("🔴 D52 — สองแผน active ในทริปเดียวกันไม่ได้ (แผนตั้งต้นนับเป็นใบแรก)", async () => {
      const { error } = await A.from("trip_plans").insert({
        trip_id: tripP, name: "แผน C", is_active: true,
      });
      expect(
        error?.code,
        `มีแผน active สองใบพร้อมกัน: ${error?.message ?? "ไม่มี error เลย"}`,
      ).toBe("23505");
    });

    it("🔴 viewer สร้างแผนไม่ได้", async () => {
      const { error } = await C.from("trip_plans").insert({ trip_id: tripP, name: "แผนของ viewer" });
      expect(error?.code, `viewer สร้างแผนได้: ${error?.message ?? "ไม่มี error"}`).toBe("42501");
    });

    it("🔴 viewer เขียนตั้งค่ารายวันไม่ได้", async () => {
      const { error } = await C.from("trip_day_plan_settings").insert({
        trip_id: tripP, plan_id: planP, trip_day_id: dayP, start_time: "09:00",
      });
      expect(error?.code, `viewer เขียนตั้งค่ารายวันได้: ${error?.message ?? "ไม่มี error"}`).toBe("42501");
    });

    it("🔴 viewer ลบแผนไม่ได้", async () => {
      await C.from("trip_plans").delete().eq("trip_id", tripP).eq("name", "แผน B");
      const { data } = await A.from("trip_plans").select("name").eq("trip_id", tripP);
      expect(data?.map((r) => r.name), "viewer ลบแผนสำเร็จ").toContain("แผน B");
    });

    it("start_time ที่ไม่ใช่ HH:MM ต้องถูกปฏิเสธที่ฐาน ไม่ใช่ไปพังตอนคำนวณเวลาทั้งวัน", async () => {
      const { error } = await A.from("trip_day_plan_settings")
        .update({ start_time: "8am" })
        .eq("plan_id", planP)
        .eq("trip_day_id", dayP);
      expect(error?.code, `รับค่าเวลาที่ผิดรูปแบบ: ${error?.message ?? "ไม่มี error"}`).toBe("23514");
    });

    it("🔴 คนนอกอ่านแผนของทริปที่ตัวเองไม่ได้อยู่ ไม่ได้", async () => {
      const { data } = await B.from("trip_plans").select("id").eq("trip_id", tripQ);
      expect(data, "B ไม่ได้เป็นสมาชิก tripQ แต่เห็นแผนของมัน").toEqual([]);
    });

    // 🔴 ต้องอยู่ท้ายสุดของบล็อก — มันลบแผนจนเหลือใบเดียว
    describe("ทริปต้องมีแผนเหลืออย่างน้อย 1 เสมอ (รูปแบบเดียวกับ P-19)", () => {
      it("ด้านบวก: editor ลบแผนที่ไม่ใช่ใบสุดท้ายได้", async () => {
        const { error } = await B.from("trip_plans")
          .delete()
          .eq("trip_id", tripP)
          .eq("name", "แผน B");
        expect(error, `ลบแผนที่ไม่ใช่ใบสุดท้ายไม่ได้: ${error?.message}`).toBeNull();
        const { data } = await A.from("trip_plans").select("name").eq("trip_id", tripP);
        expect(data?.map((r) => r.name)).not.toContain("แผน B");
      });

      it("🔴 ลบแผนใบสุดท้ายไม่ได้ — ทริปที่ไม่มีแผนคือทริปที่เปิดมาแล้วไม่มีอะไรเลย", async () => {
        const { error } = await A.from("trip_plans").delete().eq("trip_id", tripP);
        expect(
          error,
          "ลบแผนใบสุดท้ายสำเร็จ = ทริปกลายเป็นใบเปล่าที่ผู้ใช้กู้เองไม่ได้",
        ).not.toBeNull();
        // 🔴 P4: `not.toBeNull()` อย่างเดียว **ผ่านได้ด้วย error อะไรก็ได้** — policy เปลี่ยน · FK · คอลัมน์ผิด
        //    เคสนี้ตั้งชื่อว่าทดสอบ trigger จึงต้องยืนยันว่า **trigger เป็นคนปฏิเสธ** ไม่ใช่อย่างอื่น
        //    (บทเรียนเดียวกับเคส anon-insert ที่เคยเขียวเพราะชื่อคอลัมน์ผิด ไม่ใช่เพราะ RLS)
        expect(
          error?.message ?? "",
          `ถูกปฏิเสธด้วยเหตุอื่น ไม่ใช่ trigger: ${error?.code} ${error?.message}`,
        ).toContain("ลบแผนสุดท้ายไม่ได้");
        const { data } = await A.from("trip_plans").select("id").eq("trip_id", tripP);
        expect(data, "แผนหายไปทั้งที่ trigger ควรกันไว้").toHaveLength(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2-AC9 ครึ่งที่หายไป — ไคลเอนต์ตั้งเวลาของแถวเองไม่ได้ (P7 พบ)", () => {
    /**
     * `app.touch_updated_at()` เป็น `before update` → **ไม่ยิงตอน INSERT**
     * และ `default now()` มีผลก็ต่อเมื่อไคลเอนต์ *ไม่ส่ง* คอลัมน์นั้นมา
     * `grant insert on <table>` เป็นสิทธิ์ระดับตาราง = ครอบทุกคอลัมน์
     * → แถวเกิดมาพร้อมเวลาที่ไคลเอนต์พิมพ์เอง **และชนะ LWW ตั้งแต่วินาทีแรก**
     *
     * 🔴 **เคสเดิมของ `E2-AC9` ทดสอบด้าน `UPDATE` ซึ่งเป็นด้านที่ trigger ครอบอยู่แล้ว**
     * ด้าน `INSERT` ไม่มีใครลอง — รูปแบบเดิมของทีมนี้: ผ่านเพราะทดสอบด้านที่มันครอบ
     *
     * ทางแก้เป็น **column grant** ไม่ใช่ trigger `before insert` เพราะ `E7` ต้องย้ายข้อมูลจริง
     * เข้ามาพร้อมเวลาเดิม — `service_role` ยังตั้งได้ ส่วน `authenticated` แตะไม่ได้
     * ⚠️ ราคาของมันคือ **คอลัมน์ใหม่จะไม่มีสิทธิ์โดยอัตโนมัติ** → ต้องมีเคสด้านบวกคู่กันเสมอ
     * ไม่งั้นวันที่มีคนลืมเติมชื่อคอลัมน์ลง grant เราจะเห็นแค่ "ปลอดภัยดี"
     */
    let tripT = "";
    let planT = "";
    let dayT = "";

    beforeAll(async () => {
      const { data, error } = await A.rpc("create_trip", {
        p_title: `times-${stamp}`,
        p_start_date: "2026-10-11",
        p_end_date: "2026-10-21",
      });
      if (error) throw new Error(`สร้างทริปของบล็อกเวลาไม่ได้: ${error.message}`);
      tripT = data.id as string;

      const day = await A.from("trip_days")
        .insert({ trip_id: tripT, date: "2026-10-15" })
        .select("id")
        .single();
      if (day.error) throw new Error(`สร้างวันไม่ได้: ${day.error.message}`);
      dayT = day.data.id as string;

      const plan = await A.from("trip_plans")
        .insert({ trip_id: tripT, name: "แผนเวลา" })
        .select("id")
        .single();
      if (plan.error) throw new Error(`สร้างแผนไม่ได้: ${plan.error.message}`);
      planT = plan.data.id as string;
    });

    const FAKE = "2000-01-01T00:00:00.000Z";

    describe("ด้านบวก — แถวปกติต้องยังเขียนได้ (กันเคสลืมเติมคอลัมน์ลง grant)", () => {
      it("insert ที่ไม่ส่งคอลัมน์เวลามา ต้องผ่านทุกตาราง", async () => {
        const day = await A.from("trip_days").insert({ trip_id: tripT, date: "2026-10-16" });
        expect(day.error, `trip_days: ${day.error?.message}`).toBeNull();

        const plan = await A.from("trip_plans").insert({ trip_id: tripT, name: "แผนเวลา 2" });
        expect(plan.error, `trip_plans: ${plan.error?.message}`).toBeNull();

        const tdps = await A.from("trip_day_plan_settings").insert({
          trip_id: tripT, plan_id: planT, trip_day_id: dayT, start_time: "07:30",
        });
        expect(tdps.error, `trip_day_plan_settings: ${tdps.error?.message}`).toBeNull();
      });

      it("update คอลัมน์ปกติต้องยังผ่าน", async () => {
        const { error } = await A.from("trip_plans")
          .update({ name: "แผนเวลา (แก้ชื่อ)" })
          .eq("id", planT);
        expect(error, `แก้ชื่อแผนไม่ได้: ${error?.message}`).toBeNull();
      });
    });

    it("🔴 INSERT ที่ส่ง created_at มาเอง ต้องถูกปฏิเสธ — ทั้ง 3 ตารางของ E2", async () => {
      const day = await A.from("trip_days")
        .insert({ trip_id: tripT, date: "2026-10-17", created_at: FAKE });
      expect(day.error?.code, `trip_days รับ created_at: ${day.error?.message ?? "ไม่มี error"}`).toBe("42501");

      const plan = await A.from("trip_plans")
        .insert({ trip_id: tripT, name: "แผนปลอม", created_at: FAKE });
      expect(plan.error?.code, `trip_plans รับ created_at: ${plan.error?.message ?? "ไม่มี error"}`).toBe("42501");

      const tdps = await A.from("trip_day_plan_settings")
        .insert({ trip_id: tripT, plan_id: planT, trip_day_id: dayT, created_at: FAKE });
      expect(tdps.error?.code, `tdps รับ created_at: ${tdps.error?.message ?? "ไม่มี error"}`).toBe("42501");
    });

    it("🔴 INSERT ที่ส่ง updated_at มาเอง ต้องถูกปฏิเสธ — นี่คือค่าที่ตัดสิน last-write-wins", async () => {
      const { error } = await A.from("trip_days")
        .insert({ trip_id: tripT, date: "2026-10-18", updated_at: FAKE });
      expect(
        error?.code,
        `แถวเกิดมาพร้อม updated_at ที่ไคลเอนต์พิมพ์เอง: ${error?.message ?? "ไม่มี error"}\n` +
          "  = เครื่องที่นาฬิกาผิดชนะ LWW ตั้งแต่วินาทีแรก และไม่มีอะไรซ่อมจนกว่าจะมีคนแก้แถวนั้น",
      ).toBe("42501");
    });

    it("🔴 UPDATE ที่ส่ง created_at มาเอง ต้องถูกปฏิเสธ — ไม่มี trigger ตัวไหนซ่อมคอลัมน์นี้เลย", async () => {
      const { error } = await A.from("trip_plans").update({ created_at: FAKE }).eq("id", planT);
      expect(
        error?.code,
        `แก้ created_at ได้: ${error?.message ?? "ไม่มี error"}\n` +
          "  · useChecklist.ts:14 เรียงด้วยค่านี้ → ลำดับที่ผู้ใช้เห็นขึ้นกับค่าที่ไคลเอนต์พิมพ์มา",
      ).toBe("42501");
    });

    it("🔴 profiles / trips ก็ต้องปิดเหมือนกัน — ตารางของ E1 ไม่ได้ยกเว้น", async () => {
      const prof = await A.from("profiles").update({ updated_at: FAKE }).eq("id", ids.a);
      expect(prof.error?.code, `profiles รับ updated_at: ${prof.error?.message ?? "ไม่มี error"}`).toBe("42501");

      const trip = await A.from("trips").update({ created_at: FAKE }).eq("id", tripT);
      expect(trip.error?.code, `trips รับ created_at: ${trip.error?.message ?? "ไม่มี error"}`).toBe("42501");
    });

    it("ด้านบวกที่ต้องไม่หายไป: UPDATE ปกติยังทำให้ updated_at ขยับเองโดยเซิร์ฟเวอร์", async () => {
      const before = await A.from("trip_plans").select("updated_at").eq("id", planT).single();
      await new Promise((r) => setTimeout(r, 1100));
      // 🔴 เคยใช้ `is_active: true` — ชนแผนตั้งต้นที่ `create_trip()` สร้างให้ (`P-54`)
      //    เปลี่ยนมาแก้ `name` ซึ่งวัดสิ่งเดียวกัน (UPDATE ปกติต้องทำให้ `updated_at` ขยับ)
      const { error } = await A.from("trip_plans").update({ name: `ชื่อใหม่ ${stamp}` }).eq("id", planT);
      expect(error, `แก้ is_active ไม่ได้: ${error?.message}`).toBeNull();
      const after = await A.from("trip_plans").select("updated_at").eq("id", planT).single();
      expect(
        new Date(after.data!.updated_at as string).getTime(),
        "updated_at ไม่ขยับ = column grant ปิดจนเซิร์ฟเวอร์เขียนเองไม่ได้ด้วย",
      ).toBeGreaterThan(new Date(before.data!.updated_at as string).getTime());
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 updated_by_user — ประวัติที่ backfill ไม่ได้ (P7 · D57 ข้อ 2)", () => {
    /**
     * คอลัมน์เพิ่มทีหลังถูกมาก · **ประวัติของแถวที่ถูกแก้ไปแล้วก่อนคอลัมน์มีอยู่ = `NULL` ตลอดกาล**
     * นั่นคือของที่เข้าเงื่อนไข *"เพิ่มทีหลังแล้วเจ็บ"* จริง — ไม่ใช่ `client_edited_at`
     *
     * 🎯 **เคสนี้พิสูจน์ deny-by-default ของ column grant ด้วย** — `…122247` ให้ `grant update (…)`
     * แบบระบุชื่อคอลัมน์ · `updated_by_user` เกิดทีหลัง จึง **ไม่มีสิทธิ์โดยอัตโนมัติ**
     * ไม่ต้องมี `revoke` เพิ่มสักบรรทัดในไฟล์ที่เพิ่มคอลัมน์
     */
    let tripU = "";

    beforeAll(async () => {
      const { data, error } = await A.rpc("create_trip", {
        p_title: `by-user-${stamp}`,
        p_start_date: "2026-10-11",
        p_end_date: "2026-10-21",
      });
      if (error) throw new Error(`สร้างทริปไม่ได้: ${error.message}`);
      tripU = data.id as string;
      const inv = await A.from("trip_members").insert({
        trip_id: tripU, user_id: ids.b, role: "editor",
      });
      if (inv.error) throw new Error(`เชิญ B ไม่ได้: ${inv.error.message}`);
    });

    /**
     * 🔴 **ฉบับแรกของเคสนี้ให้ `B` แก้ `trips` — และมันตกหลุมที่ P2 เพิ่งรายงานเข้ามาพอดี**
     * `trips_update` เป็นของ `owner` เท่านั้น · `B` เป็น `editor` → RLS กรองแถวออก
     * **PostgREST คืน 200 ไม่มี error และแตะ 0 แถว** → `expect(error).toBeNull()` เขียว
     * แล้วเคสไปแดงบรรทัดถัดไปด้วยอาการที่อ่านเหมือน *"trigger ไม่ทำงาน"* ทั้งที่ trigger ปกติดีทุกอย่าง
     * 🎯 **เคสนี้จึงเป็นหลักฐานของปัญหา `writeGuard` ที่ P2 รายงาน — มันกัดผมเองภายในชั่วโมงเดียวกัน**
     * → ย้ายมาใช้ `trip_plans` ซึ่ง `editor` เขียนได้จริง **และอ่านค่าที่เปลี่ยนกลับมาด้วย ไม่เชื่อแค่ว่าไม่มี error**
     */
    it("🔴 แก้แล้วต้องรู้ว่าใครแก้ — และต้องเป็น *คนที่แก้จริง* ไม่ใช่เจ้าของทริป", async () => {
      const mk = await A.from("trip_plans")
        .insert({ trip_id: tripU, name: "แผนของใคร" })
        .select("id")
        .single();
      expect(mk.error, `สร้างแผนไม่ได้: ${mk.error?.message}`).toBeNull();
      const planU = mk.data!.id as string;

      const { error } = await B.from("trip_plans").update({ name: "B แก้ชื่อ" }).eq("id", planU);
      expect(error, `editor แก้ชื่อแผนไม่ได้: ${error?.message}`).toBeNull();

      const { data } = await A.from("trip_plans")
        .select("name,updated_by_user")
        .eq("id", planU)
        .single();
      expect(data?.name, "การแก้ไม่ได้เกิดขึ้นจริง → ข้อล่างไม่ได้วัด trigger").toBe("B แก้ชื่อ");
      expect(
        data?.updated_by_user,
        "อ่านไม่ได้ว่าใครแก้ล่าสุด = banner 'ถูกทับโดย ‹ชื่อ›' ที่ mobile-arch §3.3 เขียนไว้ ทำไม่ได้",
      ).toBe(ids.b);
    });

    it("🔴 ไคลเอนต์ตั้ง updated_by_user เองไม่ได้ — สวมรอยว่าคนอื่นเป็นคนแก้", async () => {
      const { error } = await A.from("trips")
        .update({ title: `สวมรอย ${stamp}`, updated_by_user: ids.b })
        .eq("id", tripU);
      expect(
        error?.code,
        `เขียน updated_by_user ได้: ${error?.message ?? "ไม่มี error"}\n` +
          "  = โยนความผิดให้คนอื่นได้ · และ D38 บอกว่าค่านี้ต้องมาจาก auth.uid() ฝั่งเซิร์ฟเวอร์เท่านั้น",
      ).toBe("42501");
    });

    it("🔴 UPDATE ที่ไม่ได้เปลี่ยนอะไรเลย ต้องไม่นับเป็นการแก้ (retry เกิดจริง)", async () => {
      const before = await A.from("trips")
        .select("title,updated_at,updated_by_user")
        .eq("id", tripU)
        .single();
      expect(before.error).toBeNull();
      await new Promise((r) => setTimeout(r, 1100));

      // เขียน **ค่าเดิมเป๊ะ** ทับ — คือสิ่งที่ retry ทำ (`useOnlineStatus.ts:12-17`: navigator.onLine โกหก)
      const { error } = await A.from("trips")
        .update({ title: before.data!.title as string })
        .eq("id", tripU);
      expect(error).toBeNull();

      const after = await A.from("trips")
        .select("updated_at,updated_by_user")
        .eq("id", tripU)
        .single();
      expect(
        after.data?.updated_at,
        "เขียนค่าเดิมทับแล้ว updated_at ขยับ = ใครกดรีเฟรชก็กลายเป็นคนแก้ล่าสุด",
      ).toBe(before.data?.updated_at);
      expect(after.data?.updated_by_user).toBe(before.data?.updated_by_user);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 ด่านสภาพปลายทาง — ถามฐาน ไม่ใช่อ่าน migration (P7 · §11.11)", () => {
    /**
     * 🔴 **ปัญหาที่ด่านนี้แก้ และเหตุผลที่ด่านแบบ grep แก้ไม่ได้**
     *
     * `…122247` ปิดรูด้วย column grant · แต่กติกา *"ต้อง `revoke` ระดับตารางก่อน"* แปลว่า
     * **migration ไฟล์ไหนก็ตามในอนาคตที่เขียน `grant insert/update on <t> to authenticated`
     * ระดับตาราง จะเปิดรูกลับทันทีเงียบ ๆ**
     * · และมีไฟล์แบบนั้นอยู่แล้ว 1 ไฟล์ (`…120856_e2_trip_plans.sql:174-175`)
     *   **ซึ่งรอดเพราะบังเอิญรันก่อนตัว freeze เท่านั้น ไม่ใช่เพราะเขียนถูก**
     * · อีก ~10 ตารางข้างหน้าจะมีบล็อก `grant` แบบนี้ทุกไฟล์
     *
     * 🎯 **ด่านที่อ่านข้อความใน migration ทนต่อเวลาไม่ได้** — มันจับได้แค่รูปแบบที่เรานึกออกวันนี้
     * ด่านนี้ถามฐานว่า *ตอนนี้* สิทธิ์เป็นยังไง จึงครอบไฟล์ที่ยังไม่ถูกเขียน
     * · รูปแบบเดียวกับที่ `E2-AC1` ยืนยันสิทธิ์จริง แทนที่จะยืนยันว่ามีบรรทัด policy อยู่
     */
    it("🔴 authenticated ต้องเขียน created_at / updated_at / updated_by_user ไม่ได้เลยสักตาราง", async () => {
      const { data, error } = await admin.rpc("client_writable_timestamps");
      expect(error, `เรียกด่านไม่ได้: ${error?.message} — ยังไม่ได้รัน migration หรือเปล่า`).toBeNull();
      expect(
        data ?? [],
        "มีตารางที่ไคลเอนต์ยังตั้งเวลา/ผู้แก้ของแถวเองได้\n" +
          "  🔴 เกือบแน่นอนว่ามาจาก `grant insert/update on <t> to authenticated` ระดับตารางในไฟล์ใหม่\n" +
          "  ทางแก้: `revoke` ระดับตารางก่อน แล้ว `grant` แบบระบุชื่อคอลัมน์ **อย่าเติมชื่อลงข้อยกเว้นของด่านนี้**",
      ).toEqual([]);
    });

    /**
     * 🔴 **ด่านข้างบนเขียวตั้งแต่รอบแรกที่รัน — ซึ่งเป็นอาการเดียวกับ `expect(true).toBe(true)`**
     * ฟังก์ชันที่คืน 0 แถว *เสมอ* (เขียนชื่อ role ผิด · ส่ง oid ผิด · กรองผิด) จะทำให้ด่านเขียวตลอดกาล
     * **โดยไม่มีอะไรบอกว่ามันไม่ได้ตรวจอะไรเลย** → ต้องมีทิศที่พิสูจน์ว่ามันยังมองเห็นอยู่
     */
    it("🔴 ด้านบวกของด่านเอง — ยิงคอลัมน์ที่ *รู้ว่าเขียนได้* เข้าไป ต้องคืนแถว", async () => {
      const { data, error } = await admin.rpc("client_writable_timestamps", {
        p_columns: ["start_time"],
      });
      expect(error, `เรียกด่านไม่ได้: ${error?.message}`).toBeNull();
      expect(
        data ?? [],
        "ยิงคอลัมน์ที่ไคลเอนต์เขียนได้แน่ ๆ (`trip_day_plan_settings.start_time`) แล้วยังได้ 0 แถว\n" +
          "  🔴 = ด่านไม่ได้ตรวจอะไรเลย และเคสข้างบนที่ 'เขียว' ก็ไม่ได้แปลว่าอะไร",
      ).not.toHaveLength(0);
    });

    it("ด้านลบของด่านเอง — anon เรียกด่านนี้ไม่ได้ (P-32: กันที่ชั้นสิทธิ์ ไม่ใช่ในบอดี้)", async () => {
      const { error } = await D.rpc("client_writable_timestamps");
      expect(error?.message ?? "", `anon เรียกได้: ${JSON.stringify(error)}`).toContain("permission denied");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 D73 — การเลื่อนตัดสินใจที่เริ่มแบกน้ำหนักตอนที่ไม่มีใครกลับไปอ่าน", () => {
    /**
     * `trip_days` **ไม่มี `deleted_at` และไม่มี policy `DELETE`** โดยตั้งใจ — ยกไปตัดสินพร้อม `E3`
     * เหตุผลที่เขียนไว้ตอนนั้น (*"วันถูกสร้าง/ลบตามช่วงวันของทริป ไม่ใช่ของที่ผู้ใช้ลบทีละใบ"*)
     * **ถูกต้องสมบูรณ์ ณ ตอนนั้น เพราะ `trip_stops` ยังไม่มี — ลบวันทิ้งไม่ได้ทำลายอะไร**
     *
     * 🔴 **P7 ชี้ว่าวินาทีที่ `trip_stops` ลงพร้อม `on delete cascade` การเลื่อนอันเดิมเริ่มลบข้อมูลผู้ใช้:**
     * > ผู้ใช้แก้ `end_date` จาก 21 เป็น 19 ต.ค. → ตัวปรับช่วงวันของ `E3` ลบ 2 วันนั้น
     * > → **cascade ลบจุดแวะของ 2 วันนั้นทิ้งทั้งหมด · RLS ไม่มีผลกับ cascade · ไม่มีอะไรส่งเสียง**
     * · ต่างชั้นจาก "ลบทริป/ลบแผน" ที่รับความเสี่ยงไว้แล้ว เพราะ **ย่นช่วงวันคือการแก้แผนธรรมดา
     *   ที่ผู้ใช้ทำระหว่างวางแผนตามปกติ โดยไม่รู้เลยว่ามันลบข้อมูล**
     *
     * 🎯 **เคสนี้ไม่ได้กันการลบ — มันกันไม่ให้การตัดสินใจนั้นเกิดขึ้นโดยไม่มีใครเห็นเรื่อง cascade**
     * ตราบใดที่ `trip_days` ไม่มี policy `DELETE` เส้นทางนั้นไม่มีอยู่ · วันที่มีคนเพิ่ม เคสนี้จะแดง
     * พร้อมข้อความที่พาไปอ่านเรื่อง cascade **ก่อน**ที่มันจะกินข้อมูลจริง
     */
    it("🔴 `trip_days` ต้องยังไม่มี policy DELETE — เพิ่มเมื่อไหร่ต้องอ่านเรื่อง cascade ก่อน", () => {
      const src = migrationFiles.map((f) => readFileSync(f, "utf8")).join("\n");
      const hasDelete = /create policy\s+\S+\s+on\s+public\.trip_days\s*\n\s*for delete/i.test(src);
      expect(
        hasDelete,
        "มี policy DELETE บน trip_days แล้ว\n" +
          "  🔴 ก่อนปล่อยผ่าน: `trip_stops` ห้อยกับ `trip_days` ด้วย cascade หรือยัง\n" +
          "     ถ้าใช่ → ลบวันหนึ่งวัน = ลบจุดแวะของวันนั้นทั้งหมด **โดย RLS ไม่มีผลและไม่มีอะไรส่งเสียง**\n" +
          "     ทางเลือกที่คุยไว้: soft delete ที่ `trip_days` · หรือให้ตัวปรับช่วงวันปฏิเสธวันที่ยังมีจุดแวะ",
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — คลังภูมิศาสตร์: อ่านได้ทุกคน เขียนไม่ได้เลย (D54 · D74 · B6)", () => {
    /**
     * คลังเป็นตารางชนิดที่สองของระบบ: **ข้อมูลสาธารณะที่ผู้ใช้เขียนไม่ได้**
     * ต่างจากทุกตารางอื่นใน `public` ซึ่งเป็นข้อมูลของผู้เช่าที่ RLS ผูกกับ `trip_members`
     *
     * 🔴 **เคสด้านบวกที่นี่สำคัญเป็นพิเศษ** — policy เป็น `using (true)` ตัวเดียว
     * ถ้า `grant select` หายไป (หรือ `revoke ... from anon` เผลอกวาด `authenticated` ไปด้วย)
     * **เคสด้านลบทั้งหมดจะเขียวครบ โดยที่ไม่มีใครอ่านคลังได้เลยทั้งแพลตฟอร์ม**
     */
    /**
     * `zz` = ช่วง **user-assigned** ของ ISO 3166-1 (`AA` · `QM`–`QZ` · `XA`–`XZ` · `ZZ`)
     * — ไม่ใช่ประเทศจริงและจะไม่มีวันเป็น จึงชนกับข้อมูลจริงไม่ได้ตามนิยาม
     * 🔴 ฉบับแรกใช้ `` `t${stamp}`.slice(0,2) `` ซึ่งได้ `t1` → **ตัวเลขไม่ผ่าน `^[a-z]{2}$`**
     * (`check` จับได้ทันทีที่รันครั้งแรก — ซึ่งคือสิ่งที่ `check` มีไว้ทำ)
     */
    const cc = TEST_COUNTRY_CODES.catalogGeo;
    let cityId = "";

    beforeAll(async () => {
      // เก็บกวาดของรอบก่อนที่อาจค้าง (ฐานเป็นของกลาง · `zz` เป็นค่าคงที่ ไม่ใช่ค่าต่อรอบ)
      await admin.from("catalog_cities").delete().eq("country_id", cc);
      await admin.from("catalog_countries").delete().eq("id", cc);

      const co = await admin
        .from("catalog_countries")
        .insert({ id: cc, name_th: "ทดสอบ", name_en: "Testland", nav_providers: ["google"] });
      if (co.error) throw new Error(`seed country ไม่ได้: ${co.error.message}`);

      const ci = await admin
        .from("catalog_cities")
        .insert({
          country_id: cc,
          legacy_slug: `city-${stamp}`.slice(0, 40),
          name_th: "เมืองทดสอบ",
          name_en: "Testville",
          lat: 35.1,
          lng: 129.0,
          timezone: "Asia/Seoul",
        })
        .select("id")
        .single();
      if (ci.error) throw new Error(`seed city ไม่ได้: ${ci.error.message}`);
      cityId = ci.data.id as string;
    });

    afterAll(async () => {
      await admin.from("catalog_cities").delete().eq("country_id", cc);
      await admin.from("catalog_countries").delete().eq("id", cc);
    });

    it("ด้านบวก: ผู้ใช้ที่ล็อกอินอ่านคลังได้ — ถ้าข้อนี้แดง เคสด้านลบข้างล่างไม่ได้พิสูจน์อะไร", async () => {
      const { data, error } = await A.from("catalog_cities").select("name_th,lat,lng").eq("id", cityId);
      expect(error, `อ่านคลังไม่ได้: ${error?.message}`).toBeNull();
      expect(data, "คลังอ่านไม่ได้ = ทุกหน้าที่แสดงชื่อเมืองพังทั้งแพลตฟอร์ม").toHaveLength(1);
    });

    it("ด้านบวก: อ่านประเทศได้ และ `nav_providers` เป็นรายชื่อ ไม่ใช่ boolean", async () => {
      const { data } = await A.from("catalog_countries").select("nav_providers").eq("id", cc).single();
      expect(
        data?.nav_providers,
        "เพิ่ม provider ใหม่ต้องเป็น update ไม่ใช่ alter table (B6)",
      ).toEqual(["google"]);
    });

    it("🔴 ผู้ใช้เขียนคลังไม่ได้ — ไม่มี policy ฝั่งเขียนสักตัว และ grant ก็ไม่ให้", async () => {
      const ins = await A.from("catalog_cities").insert({
        country_id: cc, name_th: "เมืองปลอม", name_en: "Fake", lat: 0, lng: 0, timezone: "UTC",
      });
      expect(ins.error?.code, `ผู้ใช้เพิ่มเมืองได้: ${ins.error?.message ?? "ไม่มี error"}`).toBe("42501");

      const upd = await A.from("catalog_cities").update({ name_th: "แก้ชื่อ" }).eq("id", cityId);
      expect(upd.error?.code, `ผู้ใช้แก้คลังได้: ${upd.error?.message ?? "ไม่มี error"}`).toBe("42501");

      const del = await A.from("catalog_cities").delete().eq("id", cityId);
      expect(del.error?.code, `ผู้ใช้ลบคลังได้: ${del.error?.message ?? "ไม่มี error"}`).toBe("42501");
    });

    it("🔴 anon ไม่ได้อะไรเลยจากคลัง — เว็บนี้ต้องล็อกอินก่อน", async () => {
      const { data, error } = await D.from("catalog_cities").select("id");
      expect(data ?? [], `anon อ่านคลังได้: ${error?.message ?? ""}`).toEqual([]);
    });

    it("🔴 D54 — เมืองต้องมีพิกัดของตัวเอง ใส่ไม่ครบต้องเขียนลงไม่ได้", async () => {
      const { error } = await admin.from("catalog_cities").insert({
        country_id: cc, name_th: "ไม่มีพิกัด", name_en: "NoCoord", timezone: "UTC",
      });
      expect(
        error?.code,
        `เมืองที่ไม่มีพิกัดเขียนลงได้: ${error?.message ?? "ไม่มี error"}\n` +
          "  = cityCenter() กลับไปเฉลี่ยจากลูก ซึ่งเป็นบั๊กที่ D54 ถูกเขียนขึ้นมาเพื่อปิด",
      ).toBe("23502");
    });

    it("🔴 พิกัดนอกช่วงที่เป็นไปได้ ต้องถูกปฏิเสธ ไม่ใช่ไปโผล่บนแผนที่", async () => {
      const { error } = await admin.from("catalog_cities").insert({
        country_id: cc, name_th: "พิกัดพัง", name_en: "Bad", lat: 999, lng: 0, timezone: "UTC",
      });
      expect(error?.code, `รับ lat=999: ${error?.message ?? "ไม่มี error"}`).toBe("23514");
    });

    it("🔴 `legacy_slug` ซ้ำไม่ได้ — E7 join ด้วยคอลัมน์นี้ ซ้ำ = join ผิดแถวเงียบ ๆ", async () => {
      const { error } = await admin.from("catalog_cities").insert({
        country_id: cc,
        legacy_slug: `city-${stamp}`.slice(0, 40),
        name_th: "ซ้ำ", name_en: "Dup", lat: 1, lng: 1, timezone: "UTC",
      });
      expect(error?.code, `slug ซ้ำเขียนลงได้: ${error?.message ?? "ไม่มี error"}`).toBe("23505");
    });

    it("🔴 ลบประเทศที่ยังมีเมืองอยู่ไม่ได้ (`restrict`) — เมืองกำพร้าคือเมืองที่ไม่มีประเทศ", async () => {
      const { error } = await admin.from("catalog_countries").delete().eq("id", cc);
      expect(error?.code, `ลบประเทศที่มีเมืองได้: ${error?.message ?? "ไม่มี error"}`).toBe("23503");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — คลังสถานที่: `catalog_places` + `catalog_place_names` (D55 · D70)", () => {
    /**
     * ⚠️ **เคสชุดนี้ไม่เคยถูกเห็นแดงก่อน apply — P1 เผลอ `db push` ก่อนเขียนเคส**
     * ผิดกฎข้อ 2 ของรายการที่ P1 เป็นคนดูแลเอง (*"ต้องเห็นมันแดงก่อน"*) · **เขียนไว้แทนที่จะเงียบ**
     * สิ่งที่แบกน้ำหนักแทนในชุดนี้คือ **คู่สองทิศทุกข้อ**: ทางที่ถูกต้องต้องผ่าน และทางที่ผิดต้องถูกปฏิเสธ
     * **ด้วยรหัสข้อผิดพลาดที่ระบุ** — constraint ที่ไม่มีอยู่จะทำให้ครึ่งหลังแดงทันที
     * 📌 ครั้งหน้าเขียนเคสก่อน push — ราคาของการทำผิดลำดับคือหลักฐานที่อ่อนกว่าที่ควรเป็น
     */
    const cc2 = TEST_COUNTRY_CODES.catalogPlaces;
    let cityA = "", cityB = "", placeA = "";

    const mkCity = async (slug: string, lat: number) => {
      const { data, error } = await admin
        .from("catalog_cities")
        .insert({ country_id: cc2, legacy_slug: slug, name_th: slug, name_en: slug, lat, lng: 100, timezone: "Asia/Seoul" })
        .select("id").single();
      if (error) throw new Error(`seed city ${slug}: ${error.message}`);
      return data.id as string;
    };

    beforeAll(async () => {
      await admin.from("catalog_cities").delete().eq("country_id", cc2);
      await admin.from("catalog_countries").delete().eq("id", cc2);
      const co = await admin.from("catalog_countries")
        .insert({ id: cc2, name_th: "ทดสอบสอง", name_en: "Testland2" });
      if (co.error) throw new Error(`seed country: ${co.error.message}`);

      cityA = await mkCity(`ca-${stamp}`.slice(0, 40), 35);
      cityB = await mkCity(`cb-${stamp}`.slice(0, 40), 36);

      const pl = await admin.from("catalog_places")
        .insert({ city_id: cityA, legacy_slug: `pl-${stamp}`.slice(0, 60), category: "food", source: "curated", weather_sensitivity: "mixed", lat: 35, lng: 100 })
        .select("id").single();
      if (pl.error) throw new Error(`seed place: ${pl.error.message}`);
      placeA = pl.data.id as string;

      const nm = await admin.from("catalog_place_names")
        .insert({ place_id: placeA, city_id: cityA, locale: "th", name: "ตลาดกลางคืน", priority: 1 });
      if (nm.error) throw new Error(`seed name: ${nm.error.message}`);
    });

    afterAll(async () => {
      await admin.from("catalog_places").delete().in("city_id", [cityA, cityB]);
      await admin.from("catalog_cities").delete().eq("country_id", cc2);
      await admin.from("catalog_countries").delete().eq("id", cc2);
    });

    it("ด้านบวก: ผู้ใช้ที่ล็อกอินอ่านสถานที่และชื่อได้", async () => {
      const pl = await A.from("catalog_places").select("category,weather_sensitivity").eq("id", placeA).single();
      expect(pl.error, `อ่านสถานที่ไม่ได้: ${pl.error?.message}`).toBeNull();
      expect(pl.data?.weather_sensitivity).toBe("mixed");

      const nm = await A.from("catalog_place_names").select("name").eq("place_id", placeA);
      expect(nm.data, "ชื่ออ่านไม่ได้ = ทุกที่ที่แสดงชื่อสถานที่พัง").toHaveLength(1);
    });

    it("🔴 D70 — ชื่อของสถานที่ในเมือง A จะถูกติดป้ายเมือง B ไม่ได้", async () => {
      // `admin` เขียนได้ทั้งสองเมือง → **FK ประกอบเป็นตัวปฏิเสธ ไม่ใช่สิทธิ์**
      const { error } = await admin.from("catalog_place_names")
        .insert({ place_id: placeA, city_id: cityB, locale: "en", name: "Wrong City", priority: 1 });
      expect(
        error?.code,
        `จับคู่ข้ามเมืองสำเร็จ: ${error?.message ?? "ไม่มี error"}\n` +
          "  = ค้นชื่อแบบจำกัดเมืองก่อนจะคืนผลของเมืองอื่น ซึ่งคือปัญหาที่ city_id ถูก denormalize มาเพื่อแก้",
      ).toBe("23503");
    });

    it("🔴 D55 — `priority` ซ้ำใน (place, locale) เดียวกันไม่ได้ · เสมอกันไม่ได้", async () => {
      const { error } = await admin.from("catalog_place_names")
        .insert({ place_id: placeA, city_id: cityA, locale: "th", name: "ชื่อที่สอง", priority: 1 });
      expect(error?.code, `priority ซ้ำเขียนลงได้: ${error?.message ?? "ไม่มี error"}`).toBe("23505");
    });

    it("ด้านบวกของ `priority`: ชื่อที่สองในภาษาเดียวกันเพิ่มได้ ถ้าลำดับไม่ชน", async () => {
      const ins = await admin.from("catalog_place_names")
        .insert({ place_id: placeA, city_id: cityA, locale: "th", name: "ชื่อเล่น", priority: 2 });
      expect(ins.error, `เพิ่มชื่อที่สองไม่ได้: ${ins.error?.message}`).toBeNull();

      // 🎯 หัวใจของ `priority`: **ลบตัวที่ 1 แล้วตัวที่ 2 กลายเป็น primary เอง ไม่ต้องเขียนอะไรเลย**
      await admin.from("catalog_place_names")
        .delete().eq("place_id", placeA).eq("locale", "th").eq("priority", 1);
      const { data } = await admin.from("catalog_place_names")
        .select("name,priority").eq("place_id", placeA).eq("locale", "th").order("priority").limit(1);
      expect(
        data?.[0]?.name,
        "ลบชื่ออันดับ 1 แล้วไม่มีชื่อไหนเป็น primary = สถานะที่ `is_primary` ปล่อยผ่าน แต่ `priority` ต้องไม่",
      ).toBe("ชื่อเล่น");
    });

    it("🔴 `weather_sensitivity` รับได้ 3 ค่าเท่านั้น — ห้ามให้ Copilot เดาเอง", async () => {
      const { error } = await admin.from("catalog_places")
        .insert({ city_id: cityA, category: "culture", weather_sensitivity: "maybe", lat: 1, lng: 1 });
      expect(error?.code, `รับค่าที่ไม่มีในรายการ: ${error?.message ?? "ไม่มี error"}`).toBe("23514");
    });

    it("🔴 `legacy_slug` ซ้ำไม่ได้ — E7 join ด้วยคอลัมน์นี้", async () => {
      const { error } = await admin.from("catalog_places")
        .insert({ city_id: cityA, legacy_slug: `pl-${stamp}`.slice(0, 60), category: "food", lat: 1, lng: 1 });
      expect(error?.code, `slug ซ้ำเขียนลงได้: ${error?.message ?? "ไม่มี error"}`).toBe("23505");
    });

    it("🔴 ผู้ใช้เขียนคลังสถานที่ไม่ได้ · anon ไม่ได้อะไรเลย", async () => {
      const ins = await A.from("catalog_places")
        .insert({ city_id: cityA, category: "fake", lat: 1, lng: 1 });
      expect(ins.error?.code, `ผู้ใช้เพิ่มสถานที่ได้: ${ins.error?.message ?? "ไม่มี error"}`).toBe("42501");

      const anon = await D.from("catalog_place_names").select("name");
      expect(anon.data ?? [], "anon อ่านชื่อสถานที่ได้").toEqual([]);
    });

    it("🔴 ลบเมืองที่ยังมีสถานที่อยู่ไม่ได้ (`restrict`) · แต่ลบสถานที่แล้วชื่อหายตาม (`cascade`)", async () => {
      const city = await admin.from("catalog_cities").delete().eq("id", cityA);
      expect(city.error?.code, `ลบเมืองที่มีสถานที่ได้: ${city.error?.message ?? "ไม่มี error"}`).toBe("23503");

      const p2 = await admin.from("catalog_places")
        .insert({ city_id: cityB, category: "temp", lat: 2, lng: 2 }).select("id").single();
      expect(p2.error).toBeNull();
      await admin.from("catalog_place_names")
        .insert({ place_id: p2.data!.id, city_id: cityB, locale: "th", name: "ชั่วคราว", priority: 1 });
      await admin.from("catalog_places").delete().eq("id", p2.data!.id);
      const left = await admin.from("catalog_place_names").select("name").eq("place_id", p2.data!.id);
      expect(left.data, "ลบสถานที่แล้วชื่อยังค้าง = แถวกำพร้าที่ไม่มีใครเห็น").toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — catalog: ตารางชนิดที่สอง (สาธารณะ อ่านอย่างเดียว)", () => {
    /**
     * คลังไม่มีข้อมูลผู้ใช้เลยสักแถว · คำถามจึงไม่ใช่ *"สมาชิกคนไหนเห็นอะไร"* แต่คือ
     * **"ไคลเอนต์เขียนมันได้ไหม"** — ซึ่งเป็นคำถามที่เมทริกซ์เดิมไม่เคยถามกับตารางไหนเลย
     *
     * 🔴 **`fingerprint` จับได้ถ้ามีคนเติม policy ฝั่งเขียนให้คลัง แต่มันบอกแค่ "มีอะไรเปลี่ยน"**
     * เคสพวกนี้ถามตรง ๆ ว่า *"คลังยังเขียนจากไคลเอนต์ไม่ได้อยู่ไหม"* — คนละคำถาม
     *
     * ⚠️ **ต้องยืนยันว่าถูกปฏิเสธ *เพราะสิทธิ์* (`42501`) ไม่ใช่เพราะ payload ผิด**
     * ตอนสำรวจ ผมเขียนโพรบที่ส่งคอลัมน์ผิด แล้วได้ `PGRST204`/`42703` กลับมา
     * **ซึ่งอ่านเหมือน "ถูกปฏิเสธ" ทั้งที่ไม่เคยไปถึงด่านสิทธิ์เลย** — บทเรียนเดียวกับเคส anon-insert
     */
    const CATALOG = [
      "catalog_countries",
      "catalog_cities",
      "catalog_places",
      "catalog_place_names",
    ] as const;

    it.each(CATALOG)("🔴 authenticated เขียน %s ไม่ได้ — ต้องถูกปฏิเสธเพราะสิทธิ์", async (t) => {
      // payload ถูกตามสคีมาโดยตั้งใจ เพื่อให้ถ้าหลุดด่านสิทธิ์ มันจะไปตายที่อื่น ไม่ใช่ตายก่อนถึงด่าน
      const payload: Record<string, unknown> =
        t === "catalog_countries"
          ? { id: "qq", name_th: `x${stamp}`, name_en: `x${stamp}` }
          : t === "catalog_cities"
            ? { country_id: "qq", name_th: "x", name_en: "x", lat: 1, lng: 1, timezone: "UTC" }
            : t === "catalog_places"
              ? { city_id: ids.a, category: "x", lat: 1, lng: 1 }
              : { place_id: ids.a, city_id: ids.a, locale: "th", name: "x" };
      const { error } = await A.from(t).insert(payload);
      expect(error?.code, `เขียน ${t} ได้ หรือถูกปฏิเสธด้วยเหตุอื่น: ${error?.message}`).toBe("42501");
    });

    it.each(CATALOG)("anon อ่าน %s ไม่ได้ — คลังเปิดให้เฉพาะคนที่ล็อกอิน", async (t) => {
      const { error } = await D.from(t).select("*").limit(1);
      expect(error?.code).toBe("42501");
    });

    it.each(CATALOG)("ด้านบวก: authenticated อ่าน %s ได้ — คลังต้องใช้งานได้จริง", async (t) => {
      const { error } = await A.from(t).select("*").limit(1);
      expect(error, `อ่านคลังไม่ได้ = ฟีเจอร์ค้นสถานที่ตายทั้งฟีเจอร์: ${error?.message}`).toBeNull();
    });
  });

  describe("🔴 E2 — FK ประกอบของ catalog_place_names · กิ่ง UPDATE", () => {
    /**
     * FK `(city_id, place_id) → catalog_places(city_id, id)` กัน *ชื่อของเมือง X + สถานที่ของเมือง Y*
     * · P1 ทดสอบกิ่ง **INSERT** ไว้แล้ว · **กิ่ง UPDATE เป็นคนละทางและยังไม่มีใครเดิน**
     *   (บทเรียนเดียวกับ `trip_days`: ย้ายแถวทีหลัง ไม่ใช่สร้างแถวผิดตั้งแต่ต้น)
     *
     * ⚠️ ใช้ `service_role` เพราะไคลเอนต์เขียนคลังไม่ได้ (เคสข้างบนพิสูจน์แล้ว)
     *    → นี่คือการทดสอบ **ความถูกต้องของข้อมูล** ไม่ใช่ของสิทธิ์
     * 🔴 `id` ของประเทศเป็น `[a-z]{2}` เท่านั้น — เลือก `zz` (ISO สงวนไว้ให้ใช้เอง ไม่ชนของจริง)
     *    และ **ลบก่อนสร้างทุกครั้ง** เผื่อรอบก่อนตายกลางคัน
     */
    // 🔴 `id` ของประเทศเป็น `[a-z]{2}` — **namespace มีแค่ 676 ค่า และบล็อกอื่นในไฟล์นี้ใช้ `zz`/`zy` แล้ว**
    //    ผมเลือก `zz` ตอนแรกแล้ว**ชนกับบล็อกของ P1 จริง** — ทั้งสองบล็อกล้ม 12 เคสถูกข้ามเงียบ ๆ
    //    ⚠️ `xq` อยู่ในช่วง `XA–XZ` ที่ ISO 3166 สงวนให้ใช้เอง — ไม่ชนของจริงและไม่ชนบล็อกอื่น
    const CO = "xq";
    let cityA = "";
    let cityB = "";
    let placeA = "";

    beforeAll(async () => {
      await admin.from("catalog_countries").delete().eq("id", CO);
      const mkCity = (n: string) => ({
        country_id: CO,
        name_th: `เมือง${n}${stamp}`.slice(0, 40),
        name_en: `City${n}${stamp}`.slice(0, 40),
        lat: 1,
        lng: 1,
        timezone: "Asia/Bangkok",
      });
      const e1 = await admin
        .from("catalog_countries")
        .insert({ id: CO, name_th: `ทดสอบ${stamp}`.slice(0, 40), name_en: `Test${stamp}`.slice(0, 40) });
      if (e1.error) throw new Error(`สร้างประเทศ fixture ไม่ได้: ${e1.error.message}`);
      const a = await admin.from("catalog_cities").insert(mkCity("A")).select("id").single();
      const b = await admin.from("catalog_cities").insert(mkCity("B")).select("id").single();
      if (a.error || b.error) throw new Error(`สร้างเมือง fixture ไม่ได้: ${a.error?.message ?? b.error?.message}`);
      cityA = a.data.id;
      cityB = b.data.id;
      const pl = await admin
        .from("catalog_places")
        .insert({ city_id: cityA, category: "test", lat: 1, lng: 1 })
        .select("id")
        .single();
      if (pl.error) throw new Error(`สร้างสถานที่ fixture ไม่ได้: ${pl.error.message}`);
      placeA = pl.data.id;
      const nm = await admin
        .from("catalog_place_names")
        .insert({ place_id: placeA, city_id: cityA, locale: "th", name: `ชื่อ${stamp}` });
      if (nm.error) throw new Error(`สร้างชื่อ fixture ไม่ได้: ${nm.error.message}`);
    });

    afterAll(async () => {
      // 🔴 **ลบลูกก่อนพ่อ** — `catalog_cities.country_id … on delete restrict`
      //    ฉบับแรกลบแต่ประเทศ → ติด restrict → **ล้มเงียบ** เพราะไม่ได้ดู error
      //    → รอบถัดไป `beforeAll` ชนคีย์ซ้ำ → ทั้งบล็อก **ถูกข้าม ไม่ใช่แดง** และ "142 ผ่าน 4 ข้าม"
      //      อ่านเหมือนผ่านสบาย ๆ · **เป็นบั๊กเดียวกับที่ afterAll ของ trips เคยเป็น และผมทำซ้ำเอง**
      const { data: cities } = await admin.from("catalog_cities").select("id").eq("country_id", CO);
      const cityIds = (cities ?? []).map((c) => c.id as string);
      if (cityIds.length > 0) {
        // `catalog_place_names` หายเองด้วย cascade จาก `catalog_places`
        await admin.from("catalog_places").delete().in("city_id", cityIds);
        await admin.from("catalog_cities").delete().in("id", cityIds);
      }
      const { error } = await admin.from("catalog_countries").delete().eq("id", CO);
      // 🔴 ดังไว้ ไม่เงียบ — เก็บกวาดที่ล้มเงียบทำให้รอบถัดไปถูกข้ามโดยไม่มีใครรู้ว่าทำไม
      if (error) console.warn(`\n⚠️  เก็บ fixture คลัง (${CO}) ไม่สำเร็จ: ${error.message}\n`);
    });

    it("ต้องมีแถวชื่ออยู่จริงก่อน — ไม่งั้นเคสข้างล่างเขียวเพราะไม่มีอะไรให้ย้าย", async () => {
      const { data } = await admin.from("catalog_place_names").select("city_id").eq("place_id", placeA);
      expect(data).toHaveLength(1);
    });

    it("🔴 ย้าย city_id ของชื่อไปเมืองอื่นไม่ได้ — กิ่ง UPDATE ของ FK ประกอบ", async () => {
      const { error } = await admin
        .from("catalog_place_names")
        .update({ city_id: cityB })
        .eq("place_id", placeA);
      expect(error?.code, "ย้ายได้ = ชื่อของเมืองหนึ่งไปเกาะสถานที่ของอีกเมือง").toBe("23503");

      // อ่านซ้ำ — UPDATE ที่ถูกปฏิเสธกับ UPDATE ที่ไม่เจอแถว หน้าตาต่างกันแค่ตรงนี้
      const { data } = await admin.from("catalog_place_names").select("city_id").eq("place_id", placeA);
      expect(data?.[0]?.city_id, "แถวถูกย้ายไปแล้วทั้งที่ error ขึ้น").toBe(cityA);
    });

    it("🔴 ค้นชื่อแบบบางส่วนได้จริง — index ที่ *มีอยู่* กับที่ *ทำงาน* เป็นคนละเรื่อง", async () => {
      // `catalog_place_names_trgm_idx` ถูกสร้างไว้ **แต่ไม่มีเคสไหนพิสูจน์ว่าค้นได้** (P1 ชี้เอง)
      // ⚠️ **ขอบเขตที่เคสนี้พิสูจน์ได้จริง:** การค้นแบบบางส่วน *คืนผลถูก*
      //    มัน **ไม่ได้พิสูจน์ว่า planner ใช้ index ตัวนั้น** — ข้อนั้นต้อง `explain` ซึ่งต้องผ่าน SQL Editor
      //    → ถ้า index ถูกลบทิ้ง เคสนี้จะยังเขียว (ช้าลงเฉย ๆ) · จดไว้ ไม่ใช่แกล้งว่าครอบ
      const needle = `${stamp}`.slice(-4);
      const { data, error } = await admin
        .from("catalog_place_names")
        .select("name")
        .eq("place_id", placeA)
        .ilike("name", `%${needle}%`);
      expect(error).toBeNull();
      expect(data, `ค้น "%${needle}%" ไม่เจอชื่อที่เพิ่งสร้าง`).toHaveLength(1);
    });

    it("(เทียบ) กิ่ง INSERT ยังกันเหมือนเดิม", async () => {
      const { error } = await admin
        .from("catalog_place_names")
        .insert({ place_id: placeA, city_id: cityB, locale: "en", name: `X${stamp}` });
      expect(error?.code).toBe("23503");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — `custom_places` + `custom_place_names`: สถานที่ของผู้ใช้ (D53 · D75)", () => {
    /**
     * ✅ **ชุดนี้เขียนก่อน `db push` ตามกฎข้อ 2** — ต่างจากชุด `catalog_places` ที่ P1 เผลอทำสลับ
     *
     * ตารางนี้คือ **คลังของผู้เช่า** — รูปทรงเหมือนคลังกลาง แต่โมเดลความปลอดภัยตรงข้ามกัน
     * 🎯 **และนั่นคือเหตุผลทั้งหมดของ `D75`**: ชื่อของมันอยู่ตารางแยกจาก `catalog_place_names`
     * เพราะตารางเดียวจะบังคับให้ policy เดียวรับใช้ทั้ง `using (true)` และเงื่อนไขผูก `trip_members`
     * ด้วย `or` — **และบั๊กใน `or` นั้นครั้งเดียวคือชื่อสถานที่ในทริปคนอื่นรั่ว**
     */
    let tripC = "", cityC = "", cc3 = TEST_COUNTRY_CODES.customPlaces, placeC = "";

    beforeAll(async () => {
      const t = await A.rpc("create_trip", {
        p_title: `custom-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripC = t.data.id as string;

      const inv = await A.from("trip_members").insert({ trip_id: tripC, user_id: ids.b, role: "editor" });
      if (inv.error) throw new Error(`เชิญ B: ${inv.error.message}`);
      const inv2 = await A.from("trip_members").insert({ trip_id: tripC, user_id: ids.c, role: "viewer" });
      if (inv2.error) throw new Error(`เชิญ C: ${inv2.error.message}`);

      await admin.from("catalog_cities").delete().eq("country_id", cc3);
      await admin.from("catalog_countries").delete().eq("id", cc3);
      await admin.from("catalog_countries").insert({ id: cc3, name_th: "ทดสอบสาม", name_en: "T3" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: cc3, name_th: "เมืองC", name_en: "CityC", lat: 37, lng: 127, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      cityC = ci.data.id as string;
    });

    afterAll(async () => {
      await admin.from("catalog_cities").delete().eq("country_id", cc3);
      await admin.from("catalog_countries").delete().eq("id", cc3);
    });

    it("ด้านบวก: editor เพิ่มสถานที่ของตัวเองได้ และอ่านกลับได้", async () => {
      const { data, error } = await B.from("custom_places")
        .insert({ trip_id: tripC, city_id: cityC, category: "cafe", lat: 37.1, lng: 127.1 })
        .select("id,added_by_user").single();
      expect(error, `editor เพิ่มสถานที่ไม่ได้: ${error?.message}`).toBeNull();
      placeC = data!.id as string;
      expect(data?.added_by_user, "ไม่รู้ว่าใครเพิ่ม = คอลัมน์ที่ E1-AC5 มีไว้เพื่อสิ่งนี้ไม่ทำงาน").toBe(ids.b);
    });

    it("ด้านบวก: viewer อ่านสถานที่ของทริปได้ แต่เพิ่มไม่ได้", async () => {
      const r = await C.from("custom_places").select("id").eq("trip_id", tripC);
      expect(r.error).toBeNull();
      expect(r.data, "viewer เปิดมาไม่เห็นสถานที่ที่ทีมเพิ่มไว้").not.toHaveLength(0);

      const w = await C.from("custom_places")
        .insert({ trip_id: tripC, city_id: cityC, category: "x", lat: 1, lng: 1 });
      expect(w.error?.code, `viewer เพิ่มสถานที่ได้: ${w.error?.message ?? "ไม่มี error"}`).toBe("42501");
    });

    it("🔴 คนนอกทริปมองไม่เห็นสถานที่ของทริปนั้น — คลังของผู้เช่า ไม่ใช่คลังกลาง", async () => {
      // สร้างทริปของ B เองแล้วดูว่า A (ไม่ใช่สมาชิก) เห็นไหม
      const t2 = await B.rpc("create_trip", {
        p_title: `outsider-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      expect(t2.error).toBeNull();
      const mk = await B.from("custom_places")
        .insert({ trip_id: t2.data.id, city_id: cityC, category: "secret", lat: 2, lng: 2 });
      expect(mk.error, `B เพิ่มสถานที่ในทริปตัวเองไม่ได้: ${mk.error?.message}`).toBeNull();

      const seen = await A.from("custom_places").select("id").eq("trip_id", t2.data.id);
      expect(seen.data, "A ไม่ได้เป็นสมาชิกแต่เห็นสถานที่ของทริป B").toEqual([]);
    });

    it("🔴 D75 — ชื่ออยู่ตารางของตัวเอง และผูกกับทริปเดียวกันเสมอ", async () => {
      const ok = await B.from("custom_place_names")
        .insert({ trip_id: tripC, place_id: placeC, locale: "th", name: "ร้านลับ", priority: 1 });
      expect(ok.error, `เพิ่มชื่อไม่ได้: ${ok.error?.message}`).toBeNull();

      // `D70` — ติดป้ายชื่อด้วย `trip_id` ของทริปอื่นไม่ได้ แม้จะเป็นทริปที่ B เขียนได้เอง
      const t3 = await B.rpc("create_trip", {
        p_title: `other-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      const bad = await B.from("custom_place_names")
        .insert({ trip_id: t3.data.id, place_id: placeC, locale: "en", name: "Wrong", priority: 1 });
      expect(
        bad.error?.code,
        `ผูกชื่อข้ามทริปสำเร็จ: ${bad.error?.message ?? "ไม่มี error"}`,
      ).toBe("23503");
    });

    it("🔴 `priority` ซ้ำไม่ได้ · และลบอันดับ 1 แล้วอันดับ 2 ขึ้นแทนเอง", async () => {
      const dup = await B.from("custom_place_names")
        .insert({ trip_id: tripC, place_id: placeC, locale: "th", name: "ซ้ำ", priority: 1 });
      expect(dup.error?.code, `priority ซ้ำได้: ${dup.error?.message ?? "ไม่มี error"}`).toBe("23505");

      const two = await B.from("custom_place_names")
        .insert({ trip_id: tripC, place_id: placeC, locale: "th", name: "ชื่อรอง", priority: 2 });
      expect(two.error).toBeNull();
      await B.from("custom_place_names")
        .delete().eq("place_id", placeC).eq("locale", "th").eq("priority", 1);
      const { data } = await B.from("custom_place_names")
        .select("name").eq("place_id", placeC).eq("locale", "th").order("priority").limit(1);
      expect(data?.[0]?.name, "ลบอันดับ 1 แล้วไม่มีชื่อไหนขึ้นแทน").toBe("ชื่อรอง");
    });

    it("🔴 anon ไม่ได้อะไรเลยจากทั้งสองตาราง", async () => {
      const p = await D.from("custom_places").select("id");
      const n = await D.from("custom_place_names").select("name");
      expect(p.data ?? [], "anon อ่าน custom_places ได้").toEqual([]);
      expect(n.data ?? [], "anon อ่าน custom_place_names ได้").toEqual([]);
    });

    it("🔴 ไคลเอนต์ตั้ง `added_by_user` เองไม่ได้ — สวมรอยว่าคนอื่นเป็นคนเพิ่ม", async () => {
      const { error } = await B.from("custom_places")
        .insert({ trip_id: tripC, city_id: cityC, category: "fake", lat: 3, lng: 3, added_by_user: ids.a });
      expect(error?.code, `ตั้ง added_by_user ได้: ${error?.message ?? "ไม่มี error"}`).toBe("42501");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — `trip_stops`: ตารางที่เป็นทั้งทริป (D6 · D36 · D53 · D70 · D73)", () => {
    /**
     * ✅ **เขียนก่อน `db push`**
     *
     * ตารางนี้คือทั้งทริป — ไปไหน กี่โมง ค้างที่ไหน · `visited_at` คือเวลาที่อยู่จุดนั้นจริง
     * `transfer_target_label` มีเลขไฟลต์จริง · **วันนี้ `using (true)` = ไล่ดูได้ว่าเจ้าของทริป
     * อยู่ตรงไหนตอนไหนย้อนหลังได้ทั้งทริป**
     */
    let tripS = "", planS = "", dayS1 = "", dayS2 = "", catPlace = "", myPlace = "", otherPlace = "";
    const cc4 = TEST_COUNTRY_CODES.tripStops;

    beforeAll(async () => {
      await admin.from("catalog_cities").delete().eq("country_id", cc4);
      await admin.from("catalog_countries").delete().eq("id", cc4);
      await admin.from("catalog_countries").insert({ id: cc4, name_th: "ทดสอบสี่", name_en: "T4" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: cc4, name_th: "เมืองS", name_en: "CityS", lat: 35, lng: 129, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      const cp = await admin.from("catalog_places")
        .insert({ city_id: ci.data.id, category: "sight", lat: 35, lng: 129 })
        .select("id").single();
      if (cp.error) throw new Error(`seed catalog place: ${cp.error.message}`);
      catPlace = cp.data.id as string;

      const t = await A.rpc("create_trip", {
        p_title: `stops-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripS = t.data.id as string;
      await A.from("trip_members").insert({ trip_id: tripS, user_id: ids.b, role: "editor" });
      await A.from("trip_members").insert({ trip_id: tripS, user_id: ids.c, role: "viewer" });

      const pl = await A.from("trip_plans").insert({ trip_id: tripS, name: "แผน A" }).select("id").single();
      if (pl.error) throw new Error(`สร้างแผน: ${pl.error.message}`);
      planS = pl.data.id as string;

      const d1 = await A.from("trip_days").insert({ trip_id: tripS, date: "2026-10-12" }).select("id").single();
      const d2 = await A.from("trip_days").insert({ trip_id: tripS, date: "2026-10-13" }).select("id").single();
      if (d1.error || d2.error) throw new Error(`สร้างวัน: ${d1.error?.message ?? d2.error?.message}`);
      dayS1 = d1.data!.id as string;
      dayS2 = d2.data!.id as string;

      const mp = await A.from("custom_places")
        .insert({ trip_id: tripS, city_id: ci.data.id, category: "cafe", lat: 35.1, lng: 129.1 })
        .select("id").single();
      if (mp.error) throw new Error(`สร้าง custom place: ${mp.error.message}`);
      myPlace = mp.data.id as string;

      // สถานที่ของ *ทริปอื่น* ที่ A เขียนได้เหมือนกัน — ใช้พิสูจน์ว่า **FK เป็นตัวปฏิเสธ ไม่ใช่สิทธิ์**
      const t2 = await A.rpc("create_trip", {
        p_title: `stops-other-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      const op = await A.from("custom_places")
        .insert({ trip_id: t2.data.id, city_id: ci.data.id, category: "cafe", lat: 35.2, lng: 129.2 })
        .select("id").single();
      if (op.error) throw new Error(`สร้าง custom place ทริปอื่น: ${op.error.message}`);
      otherPlace = op.data.id as string;
    });

    afterAll(async () => {
      await admin.from("catalog_places").delete().eq("id", catPlace);
      await admin.from("catalog_cities").delete().eq("country_id", cc4);
      await admin.from("catalog_countries").delete().eq("id", cc4);
    });

    describe("ด้านบวก — precondition", () => {
      it("editor เพิ่มจุดแวะที่ชี้คลังกลางได้", async () => {
        const { error } = await B.from("trip_stops").insert({
          trip_id: tripS, plan_id: planS, trip_day_id: dayS1,
          kind: "place", catalog_place_id: catPlace, rank: "m", dwell_minutes: 60,
        });
        expect(error, `editor เพิ่มจุดแวะไม่ได้: ${error?.message}`).toBeNull();
      });

      it("จุดแวะที่ชี้สถานที่ของทริปตัวเองได้", async () => {
        const { error } = await B.from("trip_stops").insert({
          trip_id: tripS, plan_id: planS, trip_day_id: dayS1,
          kind: "place", custom_place_id: myPlace, rank: "n",
        });
        expect(error, `ชี้ custom place ไม่ได้: ${error?.message}`).toBeNull();
      });

      it("`kind='intercity'` ไม่ต้องมีสถานที่เลย — แถวชนิดนี้มีอยู่จริงวันนี้ (`useStops.ts:223`)", async () => {
        const { error } = await B.from("trip_stops").insert({
          trip_id: tripS, plan_id: planS, trip_day_id: dayS1,
          kind: "intercity", intercity_from: "ปูซาน", intercity_to: "ซกโช", rank: "o",
        });
        expect(error, `แถว intercity เขียนไม่ได้: ${error?.message}`).toBeNull();
      });

      it("🔴 `rank` ซ้ำได้โดยเจตนา — 2 เครื่องแทรกที่เดียวกันย่อมได้ค่าเท่ากัน (P7)", async () => {
        const { error } = await B.from("trip_stops").insert({
          trip_id: tripS, plan_id: planS, trip_day_id: dayS1,
          kind: "place", catalog_place_id: catPlace, rank: "m",
        });
        expect(
          error,
          `rank ซ้ำถูกปฏิเสธ: ${error?.message}\n` +
            "  🔴 มี unique บน rank อยู่ = คนแทรกทีหลังได้ error แทนที่จะได้จุดของตัวเอง = **แถวหาย**\n" +
            "  ลำดับที่นิ่งมาจาก tie-break (rank, id) ไม่ใช่จากการห้ามชน",
        ).toBeNull();
      });
    });

    it("🔴 D70 — จุดแวะชี้สถานที่ของทริปอื่นไม่ได้ (FK เป็นตัวปฏิเสธ ไม่ใช่สิทธิ์)", async () => {
      const { error } = await A.from("trip_stops").insert({
        trip_id: tripS, plan_id: planS, trip_day_id: dayS1,
        kind: "place", custom_place_id: otherPlace, rank: "p",
      });
      expect(error?.code, `ชี้สถานที่ข้ามทริปได้: ${error?.message ?? "ไม่มี error"}`).toBe("23503");
    });

    it("🔴 D53 — `kind='place'` ต้องมีสถานที่ **หนึ่งเดียว** ไม่ใช่ศูนย์ ไม่ใช่สอง", async () => {
      const none = await B.from("trip_stops").insert({
        trip_id: tripS, plan_id: planS, trip_day_id: dayS1, kind: "place", rank: "q",
      });
      expect(
        none.error?.code,
        `แถว place ที่ไม่มีสถานที่เขียนลงได้: ${none.error?.message ?? "ไม่มี error"}\n` +
          "  = บั๊กที่เงียบที่สุดที่เป็นไปได้ในตารางนี้ (P4 ค้าน `<= 1` ด้วยเหตุผลนี้)",
      ).toBe("23514");

      const both = await B.from("trip_stops").insert({
        trip_id: tripS, plan_id: planS, trip_day_id: dayS1,
        kind: "place", catalog_place_id: catPlace, custom_place_id: myPlace, rank: "r",
      });
      expect(both.error?.code, `แถวที่มีสถานที่สองแหล่ง: ${both.error?.message ?? "ไม่มี error"}`).toBe("23514");
    });

    it("🔴 viewer เพิ่ม/แก้จุดแวะไม่ได้", async () => {
      const ins = await C.from("trip_stops").insert({
        trip_id: tripS, plan_id: planS, trip_day_id: dayS1,
        kind: "place", catalog_place_id: catPlace, rank: "s",
      });
      expect(ins.error?.code, `viewer เพิ่มจุดแวะได้: ${ins.error?.message ?? "ไม่มี error"}`).toBe("42501");
    });

    it("🔴 ไคลเอนต์ย้ายจุดแวะข้ามทริปด้วยการเขียน `trip_id` ไม่ได้ (P7)", async () => {
      const { error } = await B.from("trip_stops")
        .update({ trip_id: tripS }).eq("trip_id", tripS).eq("rank", "n");
      expect(
        error?.code,
        `เขียน trip_id ได้: ${error?.message ?? "ไม่มี error"}\n` +
          "  · op ที่เขียน trip_id เดี่ยว ๆ ไม่ใช่ no-op แต่คือย้ายแถวข้ามทริป",
      ).toBe("42501");
    });

    it("🔴 D73 — ลบวันที่ยังมีจุดแวะอยู่ไม่ได้ (trigger ต้อง *ยิงจริง* ไม่ใช่แค่มีอยู่)", async () => {
      const { error } = await admin.from("trip_days").delete().eq("id", dayS1);
      expect(
        error,
        "ลบวันที่มีจุดแวะสำเร็จ = cascade กินจุดแวะทิ้งเงียบ ๆ · RLS ไม่มีผลกับ cascade",
      ).not.toBeNull();

      const left = await admin.from("trip_stops").select("id").eq("trip_day_id", dayS1);
      expect(left.data, "จุดแวะหายไปแล้วทั้งที่ trigger ควรขวาง").not.toHaveLength(0);
    });

    it("ด้านบวกของ D73: ลบวันที่ *ไม่มี* จุดแวะได้ตามปกติ", async () => {
      const { error } = await admin.from("trip_days").delete().eq("id", dayS2);
      expect(error, `ลบวันว่างไม่ได้: ${error?.message} — trigger เข้มเกินไป`).toBeNull();
    });

    it("🔴 ลบสถานที่ที่ยังอยู่ในแผนไม่ได้ — สองชั้น: `restrict` กันการลบจริง · trigger กัน soft delete", async () => {
      // ชั้นที่ 1: `DELETE` ตรง ๆ ถูกถอดออกทั้ง policy และ grant แล้ว (`D76`)
      const hard = await B.from("custom_places").delete().eq("id", myPlace);
      expect(hard.error?.code, `ยังลบจริงได้: ${hard.error?.message ?? "ไม่มี error"}`).toBe("42501");

      // ชั้นที่ 2: soft delete ก็ไม่ได้ ถ้ายังมีจุดแวะที่ยังไม่ถูกลบชี้อยู่
      // 🔴 FK `restrict` **ไม่รู้จัก `deleted_at`** — ถ้าไม่มี trigger ชั้นนี้จะเปิดโล่ง
      const soft = await B.rpc("soft_delete_custom_place", { p_id: myPlace });
      expect(soft.error, `soft delete สถานที่ที่ยังถูกใช้อยู่สำเร็จ`).not.toBeNull();
    });

    it("ด้านบวก: ลบทริปทั้งใบยังทำได้ — cascade ต้องไม่ถูก trigger ของ D73 ขวาง", async () => {
      const t = await A.rpc("create_trip", {
        p_title: `cascade-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      const p = await A.from("trip_plans").insert({ trip_id: t.data.id, name: "P" }).select("id").single();
      const d = await A.from("trip_days").insert({ trip_id: t.data.id, date: "2026-10-12" }).select("id").single();
      await A.from("trip_stops").insert({
        trip_id: t.data.id, plan_id: p.data!.id, trip_day_id: d.data!.id,
        kind: "place", catalog_place_id: catPlace, rank: "m",
      });
      const { error } = await admin.from("trips").delete().eq("id", t.data.id);
      expect(
        error,
        `ลบทริปทั้งใบไม่ได้: ${error?.message}\n` +
          "  🔴 = `when (pg_trigger_depth() = 0)` หายไป → trigger ขวาง cascade ที่ถูกต้องด้วย",
      ).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2-AC12 / D76 — soft delete: ลบแล้วหายจากสายตา แต่แถวยังอยู่", () => {
    /**
     * ✅ เขียนก่อน `db push`
     *
     * `D76` ตัดสินครั้งเดียวทั้งตระกูลหลังจากถูกเลื่อนมา **5 ตารางติดกัน** (P7 จับได้)
     * · ลบ = `UPDATE` ตั้ง `deleted_at` · **policy `DELETE` และ `grant delete` ถูกถอดออก**
     * · อ่าน = policy เติม `and deleted_at is null` — **บังคับที่ policy ไม่ใช่ที่ query**
     *   ลืมที่ query แล้ว**เห็นน้อยลง** ไม่ใช่เห็นมากขึ้น
     */
    let tripD2 = "", planD = "", dayD = "", placeD = "", stopD = "";
    const ccD = TEST_COUNTRY_CODES.softDelete;

    beforeAll(async () => {
      await admin.from("catalog_cities").delete().eq("country_id", ccD);
      await admin.from("catalog_countries").delete().eq("id", ccD);
      await admin.from("catalog_countries").insert({ id: ccD, name_th: "ทดสอบห้า", name_en: "T5" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: ccD, name_th: "เมืองD", name_en: "CityD", lat: 37, lng: 127, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);

      const t = await A.rpc("create_trip", {
        p_title: `soft-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripD2 = t.data.id as string;
      await A.from("trip_members").insert({ trip_id: tripD2, user_id: ids.c, role: "viewer" });

      const pl = await A.from("trip_plans").insert({ trip_id: tripD2, name: "P" }).select("id").single();
      planD = pl.data!.id as string;
      const dd = await A.from("trip_days").insert({ trip_id: tripD2, date: "2026-10-12" }).select("id").single();
      dayD = dd.data!.id as string;
      const pc = await A.from("custom_places")
        .insert({ trip_id: tripD2, city_id: ci.data.id, category: "cafe", lat: 1, lng: 1 })
        .select("id").single();
      if (pc.error) throw new Error(`สร้างสถานที่: ${pc.error.message}`);
      placeD = pc.data.id as string;

      const st = await A.from("trip_stops")
        .insert({ trip_id: tripD2, plan_id: planD, trip_day_id: dayD, kind: "place", custom_place_id: placeD, rank: "m" })
        .select("id").single();
      if (st.error) throw new Error(`สร้างจุดแวะ: ${st.error.message}`);
      stopD = st.data.id as string;
    });

    afterAll(async () => {
      await admin.from("catalog_cities").delete().eq("country_id", ccD);
      await admin.from("catalog_countries").delete().eq("id", ccD);
    });

    it("🔴 `DELETE` ตรง ๆ ทำไม่ได้อีกแล้ว — ลบต้องผ่าน RPC", async () => {
      const { error } = await A.from("trip_stops").delete().eq("id", stopD);
      expect(
        error?.code,
        `ยังลบจริงได้: ${error?.message ?? "ไม่มี error"}\n` +
          "  = `grant delete`/policy DELETE ยังค้างอยู่ · soft delete จะถูกข้ามได้ทุกครั้ง",
      ).toBe("42501");
    });

    /**
     * 🔴 **`P-53` — ฉบับแรกของเคสนี้ยิง `update({ deleted_at })` ตรง ๆ แล้วได้
     * `42501 new row violates row-level security policy` · วัดจากฐานจริง:**
     * ```
     * update trip_stops set note = 'x'         → ✅ ผ่าน
     * update trip_stops set deleted_at = now()  → 🔴 ถูกปฏิเสธ
     * ```
     * **PostgREST ห่อทุก `UPDATE` ด้วย CTE ที่มี `RETURNING`** → แถวใหม่ต้องผ่าน policy `SELECT` ด้วย
     * → **การตั้ง `deleted_at` ทำให้แถวใหม่มองไม่เห็นโดยตัวมันเอง แล้วถูกปฏิเสธเพราะมองไม่เห็น**
     *
     * 🎯 **นี่คือ `P-26` เป๊ะ แค่กลับด้าน** — รากเดียวกัน (`RETURNING` เจอ policy ที่ซ่อนแถว)
     * และทางแก้ตัวเดียวกัน: **RPC `security definer`** (`D49`)
     * · ✅ ของแถม: **"ลบ" กลายเป็น *การกระทำที่มีชื่อ*** แทน *"เขียนคอลัมน์หนึ่งที่ต้องจำเองว่าแปลว่าลบ"*
     */
    it("ด้านบวก: ลบผ่าน RPC ได้ แล้วแถวหายจากสายตาทันที", async () => {
      const upd = await A.rpc("soft_delete_trip_stop", { p_id: stopD });
      expect(upd.error, `ลบจุดแวะไม่ได้: ${upd.error?.message}`).toBeNull();

      const seen = await A.from("trip_stops").select("id").eq("id", stopD);
      expect(seen.data, "ลบแล้วยังเห็นอยู่ = policy ไม่ได้กรอง `deleted_at is null`").toEqual([]);

      const asViewer = await C.from("trip_stops").select("id").eq("id", stopD);
      expect(asViewer.data, "viewer ยังเห็นแถวที่ถูกลบ").toEqual([]);
    });

    it("🔴 แถวยังอยู่จริงในฐาน — นี่คือความต่างทั้งหมดระหว่าง soft delete กับ delete", async () => {
      const { data } = await admin.from("trip_stops").select("id,deleted_at,updated_by_user").eq("id", stopD);
      expect(data, "แถวหายจริง = ไม่ใช่ soft delete").toHaveLength(1);
      expect(data?.[0]?.deleted_at, "deleted_at ว่าง ทั้งที่ถูกลบไปแล้ว").not.toBeNull();
      expect(
        data?.[0]?.updated_by_user,
        "soft delete คือ UPDATE → ต้องได้ 'ใครลบ' ฟรีจาก updated_by_user (D76)",
      ).toBe(ids.a);
    });

    it("🔴 ไคลเอนต์เขียน `deleted_at` เองไม่ได้เลย — เหลือทางเดียวจริง ๆ ไม่ใช่ 'สองทางแต่แนะนำทางนี้'", async () => {
      const { error } = await A.from("trip_stops")
        .update({ deleted_at: null }).eq("trip_id", tripD2);
      expect(
        error?.code,
        `ไคลเอนต์เขียน deleted_at ได้: ${error?.message ?? "ไม่มี error"}\n` +
          "  · ถ้าเขียนได้ แปลว่า 'กู้คืน' ก็ทำได้เงียบ ๆ โดยไม่ผ่านด่านของ RPC เลย",
      ).toBe("42501");
    });

    it("🔴 D76 + D73 — วันที่จุดแวะถูกลบหมดแล้ว ต้องลบวันได้ (trigger ต้องไม่นับ tombstone)", async () => {
      const { error } = await admin.from("trip_days").delete().eq("id", dayD);
      expect(
        error,
        `ลบวันไม่ได้ทั้งที่จุดแวะถูกลบไปหมดแล้ว: ${error?.message}\n` +
          "  🔴 = trigger นับ tombstone เป็นจุดแวะที่ยังอยู่ · ผู้ใช้เห็นวันว่างแต่ลบไม่ได้ตลอดกาล\n" +
          "  ต้องมี `and deleted_at is null` ในเงื่อนไขของ `app.assert_day_has_no_stops()`",
      ).toBeNull();
    });

    it("🔴 ลบสถานที่ที่ยังมีจุดแวะ *ที่ยังไม่ถูกลบ* ชี้อยู่ ไม่ได้", async () => {
      const d2 = await A.from("trip_days").insert({ trip_id: tripD2, date: "2026-10-14" }).select("id").single();
      const st2 = await A.from("trip_stops").insert({
        trip_id: tripD2, plan_id: planD, trip_day_id: d2.data!.id,
        kind: "place", custom_place_id: placeD, rank: "n",
      });
      expect(st2.error).toBeNull();

      const del = await A.rpc("soft_delete_custom_place", { p_id: placeD });
      expect(
        del.error,
        "ลบสถานที่ที่ยังถูกใช้อยู่สำเร็จ = จุดแวะจะชี้ไปสถานที่ที่ผู้ใช้มองไม่เห็น",
      ).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 P-54 — invariant ที่บังคับตอน *ออก* แต่ไม่บังคับตอน *เข้า* (P4 พบ)", () => {
    /**
     * `app.assert_trip_has_plan()` เขียนว่า *"ทริปต้องมีแผนอย่างน้อย 1 แผน"*
     * และเคสของ P1 เขียนว่า *"ทริปที่ไม่มีแผนคือทริปที่เปิดมาแล้วไม่มีอะไรเลย"*
     *
     * 🔴 **แต่ P4 ยิงจริงแล้วพบว่า `create_trip()` สร้างทริปที่มี 0 แผน**
     * → **นั่นคือสภาพของทุกทริปที่สร้างผ่านทางที่ตั้งใจให้ใช้**
     * · trigger กันแค่ *ลบแผนใบสุดท้าย* — **ถ้าไม่เคยมีแผนเลย ไม่มีอะไรให้กัน**
     *
     * 🎯 **และเคสเดิมของ P1 เขียวเพราะ fixture สร้างแผนให้เอง** — มันทดสอบ invariant
     * บนข้อมูลที่ถูกสร้างมาให้ผ่าน invariant นั้นพอดี **ส่วนทางสร้างจริงไม่ผ่าน**
     * นี่คือ *"เขียวเพราะเราจัดฉากให้มันเขียว"* ในรูปที่อ่านไม่ออกจากตัวเคส
     */
    it("🔴 ทริปที่เพิ่งสร้าง ต้องมีแผนตั้งต้นมาแล้ว 1 แผน และเป็นแผนที่ใช้อยู่", async () => {
      const t = await A.rpc("create_trip", {
        p_title: `invariant-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      expect(t.error, `สร้างทริปไม่ได้: ${t.error?.message}`).toBeNull();

      const { data, error } = await A.from("trip_plans")
        .select("name,is_active").eq("trip_id", t.data.id);
      expect(error).toBeNull();
      expect(
        data,
        "ทริปที่เพิ่งสร้างมี 0 แผน = invariant ที่ trigger อ้างว่าคุ้มครอง เป็นเท็จตั้งแต่วินาทีแรก",
      ).toHaveLength(1);
      expect(
        data?.[0]?.is_active,
        "มีแผนแต่ไม่มีแผนไหนถูกใช้อยู่ = หน้าจอไม่รู้ว่าจะโชว์แผนไหน",
      ).toBe(true);
    });

    it("ด้านบวกที่ต้องไม่หายไป: แผนตั้งต้นลบไม่ได้ถ้ามันเป็นใบเดียว", async () => {
      const t = await A.rpc("create_trip", {
        p_title: `invariant2-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      const { error } = await A.from("trip_plans").delete().eq("trip_id", t.data.id);
      expect(
        error?.message,
        "ลบแผนตั้งต้นใบเดียวได้ = trigger ไม่ครอบแผนที่ระบบสร้างให้",
      ).toContain("ทริปต้องมีแผนอย่างน้อย 1 แผน");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 ทางหนีของ assert_trip_has_plan — ลบทริปทั้งใบต้องไม่ติด invariant", () => {
    /**
     * `assert_trip_has_plan()` เขียนว่า:
     * ```sql
     * if exists (select 1 from public.trips where id = old.trip_id)
     *    and not exists (select 1 from public.trip_plans where trip_id = old.trip_id)
     * ```
     * 🎯 **บรรทัด `exists(trips …)` คือทางหนี** — ตอนลบทริปทั้งใบ แผนถูก cascade ลบตาม
     * ถ้าไม่มีเงื่อนไขนั้น trigger จะมองว่า *"ทริปนี้ไม่มีแผนแล้ว"* แล้วขัดการลบทริปทิ้ง
     * → **ลบทริปไม่ได้เลยทั้งระบบ** และอาการจะโผล่เป็น error ที่ชี้ไปที่ `trip_plans`
     *   ทั้งที่คนกดลบ *ทริป* — ตามกลับมาถึงบรรทัดนี้ยาก
     *
     * 🔴 **ไม่มีเคสไหนกันบรรทัดนั้นไว้** จนถึงเคสนี้ (P4 ยิงยืนยันด้วยมือก่อน 25 ส.ค. 2026)
     * ⚠️ ใช้ `service_role` เพราะ **ไคลเอนต์ลบทริปไม่ได้** (ไม่มี `trips_delete` policy · `D18`)
     *    → นี่คือการทดสอบ **ความถูกต้องของ invariant** ไม่ใช่ของสิทธิ์
     */
    it("service_role ลบทริปที่มีแผนอยู่ได้ — cascade ต้องไม่ถูก trigger ขัด", async () => {
      const { data: trip, error: mkErr } = await A.rpc("create_trip", {
        p_title: `cascade-${stamp}`,
        p_start_date: "2026-10-11",
        p_end_date: "2026-10-21",
      });
      expect(mkErr).toBeNull();

      // ต้องมีแผนอยู่จริงก่อน ไม่งั้นเคสนี้เขียวเพราะไม่มีอะไรให้ trigger ขัด
      const { data: plans } = await A.from("trip_plans").select("id").eq("trip_id", trip.id);
      expect(plans, "ทริปใหม่ไม่มีแผน — เคสนี้พิสูจน์ทางหนีไม่ได้ (ดู P-54)").not.toHaveLength(0);

      const { error } = await admin.from("trips").delete().eq("id", trip.id);
      expect(
        error,
        `ลบทริปที่มีแผนไม่ได้ = ทางหนี exists(trips) หาย → ลบทริปไม่ได้ทั้งระบบ: ${error?.message}`,
      ).toBeNull();

      const { data: left } = await A.from("trips").select("id").eq("id", trip.id);
      expect(left, "ทริปยังอยู่ทั้งที่ลบสำเร็จ").toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — `bookings`: ของที่จ่ายเงินไปแล้ว (D51 · D73 · E2-AC13)", () => {
    /**
     * ✅ เขียนก่อน `db push`
     *
     * 🔴 **ใบจองคือของที่จ่ายเงินไปแล้ว** — เหตุผลข้อเดียวกับที่ `D51` ถอดมันออกจาก `leg_id`
     * ที่เป็นค่าคำนวณ · และเป็นเหตุผลที่ P7 บอกว่าด่าน `D73` ต้องนับมันด้วย
     *
     * `E2-AC13` — `file_url` → **`file_path`** · ชื่อเดิมจะโกหกทันทีที่ bucket เป็น private
     * P8 ชี้ว่า `AC5` *"ผ่านทันทีที่กดปิด bucket"* **และวินาทีเดียวกันนั้นทุกแถวเดิมชี้ไป URL ที่ตายแล้ว**
     */
    let tripB2 = "", dayB = "", bookingB = "";
    const ccB = TEST_COUNTRY_CODES.bookings;

    beforeAll(async () => {
      await admin.from("catalog_cities").delete().eq("country_id", ccB);
      await admin.from("catalog_countries").delete().eq("id", ccB);
      await admin.from("catalog_countries").insert({ id: ccB, name_th: "ทดสอบหก", name_en: "T6" });

      const t = await A.rpc("create_trip", {
        p_title: `book-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripB2 = t.data.id as string;
      await A.from("trip_members").insert({ trip_id: tripB2, user_id: ids.b, role: "editor" });
      await A.from("trip_members").insert({ trip_id: tripB2, user_id: ids.c, role: "viewer" });

      const d = await A.from("trip_days").insert({ trip_id: tripB2, date: "2026-10-14" }).select("id").single();
      if (d.error) throw new Error(`สร้างวัน: ${d.error.message}`);
      dayB = d.data.id as string;
    });

    afterAll(async () => {
      await admin.from("catalog_countries").delete().eq("id", ccB);
    });

    it("ด้านบวก: editor เพิ่มใบจองที่ผูกกับวันได้ และ `added_by_user` ถูกเซิร์ฟเวอร์เติม", async () => {
      const { data, error } = await B.from("bookings")
        .insert({ trip_id: tripB2, trip_day_id: dayB, category: "flight", title: `VN409 ${stamp}`, status: "booked" })
        .select("id,added_by_user").single();
      expect(error, `editor เพิ่มใบจองไม่ได้: ${error?.message}`).toBeNull();
      bookingB = data!.id as string;
      expect(data?.added_by_user).toBe(ids.b);
    });

    it("ด้านบวก: ใบจองที่ *ไม่* ผูกกับวันก็มีได้ — ตั๋วที่ยังไม่รู้วัน", async () => {
      const { error } = await B.from("bookings")
        .insert({ trip_id: tripB2, category: "hotel", title: `ยังไม่รู้วัน ${stamp}` });
      expect(
        error,
        `ใบจองที่ไม่ผูกวันเขียนไม่ได้: ${error?.message}\n` +
          "  · FK ประกอบที่มี null ต้องไม่ถูกบังคับ (MATCH SIMPLE) ไม่งั้นต้องรู้วันก่อนถึงจะจองได้",
      ).toBeNull();
    });

    it("🔴 D70 — ใบจองผูกกับวันของทริปอื่นไม่ได้", async () => {
      const t2 = await A.rpc("create_trip", {
        p_title: `book-other-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      const d2 = await A.from("trip_days").insert({ trip_id: t2.data.id, date: "2026-10-14" }).select("id").single();
      const { error } = await A.from("bookings")
        .insert({ trip_id: tripB2, trip_day_id: d2.data!.id, category: "x", title: "ข้ามทริป" });
      expect(error?.code, `ผูกใบจองข้ามทริปได้: ${error?.message ?? "ไม่มี error"}`).toBe("23503");
    });

    it("🔴 viewer เพิ่มใบจองไม่ได้ · anon ไม่เห็นอะไรเลย", async () => {
      const ins = await C.from("bookings").insert({ trip_id: tripB2, category: "x", title: "y" });
      expect(ins.error?.code, `viewer เพิ่มใบจองได้: ${ins.error?.message ?? "ไม่มี error"}`).toBe("42501");
      const anon = await D.from("bookings").select("id");
      expect(anon.data ?? [], "anon อ่านใบจองได้ — ในนั้นมีเลขที่จองจริง").toEqual([]);
    });

    it("🔴 E2-AC13 — คอลัมน์ชื่อ `file_path` ไม่ใช่ `file_url`", async () => {
      const { error } = await B.from("bookings")
        .update({ file_path: "trips/x/ticket.pdf", file_name: "ticket.pdf" }).eq("id", bookingB);
      expect(error, `เขียน file_path ไม่ได้: ${error?.message}`).toBeNull();

      const bad = await B.from("bookings").update({ file_url: "https://x" }).eq("id", bookingB);
      expect(
        bad.error,
        "ยังมีคอลัมน์ `file_url` อยู่ = ชื่อจะโกหกทันทีที่ bucket เป็น private",
      ).not.toBeNull();
    });

    it("🔴 D73 — ด่านต้องโตตาม: ลบวันที่ยังมี *ใบจอง* ผูกอยู่ ไม่ได้ (P7)", async () => {
      const { error } = await admin.from("trip_days").delete().eq("id", dayB);
      expect(
        error,
        "ลบวันที่มีใบจองสำเร็จ = cascade กินใบจองทิ้งเงียบ ๆ\n" +
          "  🔴 ใบจองคือของที่จ่ายเงินไปแล้ว · ด่านที่รู้จักลูกไม่ครบคือด่านที่ครอบไม่ครบเงียบ ๆ",
      ).not.toBeNull();
    });

    it("🔴 D76 — ลบใบจองผ่าน RPC · แถวยังอยู่ · หายจากสายตา", async () => {
      const del = await B.rpc("soft_delete_booking", { p_id: bookingB });
      expect(del.error, `ลบใบจองไม่ได้: ${del.error?.message}`).toBeNull();

      const seen = await B.from("bookings").select("id").eq("id", bookingB);
      expect(seen.data, "ลบแล้วยังเห็น").toEqual([]);

      const row = await admin.from("bookings").select("deleted_at").eq("id", bookingB);
      expect(row.data?.[0]?.deleted_at, "แถวหายจริง = ไม่ใช่ soft delete").not.toBeNull();
    });

    it("ด้านบวกของ D73: พอใบจองถูกลบหมดแล้ว ลบวันได้", async () => {
      const { error } = await admin.from("trip_days").delete().eq("id", dayB);
      expect(
        error,
        `ลบวันไม่ได้ทั้งที่ใบจองถูกลบหมดแล้ว: ${error?.message}\n` +
          "  🔴 = ด่านนับ tombstone เป็นใบจองที่ยังอยู่ (กับดักเดียวกับที่ P7 เจอกับ trip_stops)",
      ).toBeNull();
    });
  });

});
