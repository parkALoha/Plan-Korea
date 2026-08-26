import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_COUNTRY_CODES,
  migrationFiles,
  readEnvKey,
  requireLiveCreds,
  stripComments,
  tablesFromMigrations,
  tripScopedTables,
  authorshipPairsFromMigrations,
  effectiveConstraint,
  columnsNamedIn,
} from "./_helpers";

/**
 * Test matrix ของ RLS — DoD พิเศษของ E1 (ใช้ต่อใน E2)
 *
 * ขอบเขตที่ไฟล์นี้ครอบ / ไม่ครอบ — เขียนไว้ตรงนี้เพราะ "เหตุผลที่ครอบแคบกว่าที่คนอ่านเข้าใจ"
 * คือชนิดของบั๊กที่เอกสารความปลอดภัยของเราจัดเป็นหมวดจับยากที่สุด:
 *   ครอบ    = `profiles` · `trips` · `trip_members` (3 ตารางของ E1) ผ่าน **PostgREST ด้วย JWT จริง**
 *             ซึ่งเป็นเส้นทางเดียวกับที่ browser ใช้ → วัด RLS ตามที่ผู้ใช้จะเจอจริง
 *   ไม่ครอบ = Realtime
 *           · ⚠️ **ข้อความเดิมเขียนว่าไม่ครอบ "ตารางเนื้อหาของ E2" กับ "Storage" — หมดอายุแล้ว**
 *             `E2` ลงตารางเนื้อหาครบ และ `E2-AC5` เพิ่มเคส Storage ที่วัดจากข้างนอกด้วย `fetch()` แล้ว
 *             (25 ส.ค. 2026 · P4) — ขอบเขตที่เขียนไว้แคบกว่าของจริง **อ่านแล้วเลิกตรวจ** ซึ่งคือ `D35`
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


describe("tablesFromMigrations — ตัวสแกนที่เคสอื่นพึ่ง ต้องถูกยิงเอง (กฎ E0 ข้อ 1–2)", () => {
  // 🔴 ถ้าตัวนี้พังเงียบ เคส `TRUNCATE` จะตรวจตารางน้อยลงเรื่อย ๆ **โดยยังเขียวทุกรอบ**
  it("create เพิ่ม · drop หัก · เรียงตามลำดับที่ปรากฏ", () => {
    expect(tablesFromMigrations(["create table public.a (id int);"])).toEqual(["a"]);
    expect(tablesFromMigrations(["create table public.a (id int); drop table public.a;"])).toEqual([]);
    // 🔴 สำนวน "ลบแล้วสร้างใหม่" — ต้องได้ว่า **มีอยู่** · ฉบับที่ทำ create ก่อน drop จะได้ว่าไม่มี
    expect(
      tablesFromMigrations(["drop table if exists public.a; create table public.a (id int);"]),
      "ลบแล้วสร้างใหม่ในไฟล์เดียวกัน ต้องนับว่ามีอยู่",
    ).toEqual(["a"]);
    // ข้ามไฟล์ก็ต้องเรียงตามลำดับไฟล์
    expect(tablesFromMigrations(["create table public.a (id int);", "drop table public.a;"])).toEqual([]);
  });

  it("🔴 `drop table` หลายชื่อคั่นจุลภาค ต้องหักออกทุกตัว ไม่ใช่แค่ตัวแรก", () => {
    expect(
      tablesFromMigrations([
        "create table public.a (id int); create table public.b (id int); create table public.c (id int);",
        "drop table if exists public.a, public.b;",
      ]),
    ).toEqual(["c"]);
  });

  it("ด้านลบ: `drop table` ในคอมเมนต์ rollback ต้องไม่ถูกนับ", () => {
    // ทุกไฟล์ migration มีบล็อก rollback ที่เขียน `drop table …` ไว้เป็นคอมเมนต์
    // ถ้าตัวตัดคอมเมนต์พัง ตารางจะหายจากลิสต์ทั้งยวง **แล้วเคส TRUNCATE จะเขียวโดยไม่ตรวจอะไร**
    expect(
      tablesFromMigrations(["create table public.a (id int);\n--   drop table if exists public.a;"]),
    ).toEqual(["a"]);
  });

  it("ด้านบวกกับของจริง: อ่านจากทรีแล้วต้องได้ตารางจำนวนสมเหตุสมผล", () => {
    expect(tablesFromMigrations().length).toBeGreaterThan(15);
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


  /**
   * ล้างคลังทดสอบของรหัสประเทศหนึ่งให้เกลี้ยง — **ลูกก่อนพ่อ · เรียกได้ทั้งก่อนและหลัง**
   *
   * 🔴 **รูปเดิมที่ทุกบล็อกใช้คือ 2 บรรทัด: ลบเมือง แล้วลบประเทศ — และมันไม่พอ**
   * `catalog_places → catalog_cities` เป็น `on delete restrict` → ถ้ารอบก่อนตายกลางคัน
   * หลังสร้าง place ไว้ **เมืองจะลบไม่ออก → ประเทศลบไม่ออก → รอบถัดไปชนคีย์ซ้ำที่ `beforeAll`**
   * → บล็อกนั้น**ข้ามทุกรอบตลอดกาล** จนกว่าจะมีคนไปล้างฐานด้วยมือ
   *
   * 🎯 **เรียกใน `beforeAll` ด้วย ไม่ใช่แค่ `afterAll` — รูปนี้ P1 เขียนก่อน (`purge()` ของเขา) และมันถูกกว่าของผม**
   * ของผมเดิมล้างเฉพาะตอนจบ ซึ่งแปลว่า **รอบที่ตายกลางคันจะพิษต่อไปได้เรื่อย ๆ**
   * · เก็บกวาดตอนเริ่มคือสิ่งที่ทำให้ชุดทดสอบ**หายเองได้** แทนที่จะต้องมีคนมาซ่อม
   *
   * 📌 ไม่ throw โดยตั้งใจ — คืนข้อความให้ผู้เรียกตัดสินใจ · `afterAll` ที่ล้มจะกลบผลของเคสที่เพิ่งรัน
   */
  async function purgeCountry(code: string): Promise<string | null> {
    const cities = (await admin.from("catalog_cities").select("id").eq("country_id", code)).data ?? [];
    const cityIds = cities.map((c) => c.id as string);
    if (cityIds.length > 0) {
      await admin.from("catalog_places").delete().in("city_id", cityIds);
      await admin.from("catalog_cities").delete().in("id", cityIds);
    }
    const { error } = await admin.from("catalog_countries").delete().eq("id", code);
    return error ? error.message : null;
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
  // ── ฐานกับทรีตรงกันไหม — **ต้องมาก่อนทุกอย่าง** ────────────────────────────
  describe("🔴 ฐานที่วัดอยู่ ต้องเป็นฐานของ commit นี้ (P1 · จาก CI แดงของ `9fceac6`)", () => {
    /**
     * P6 ไล่ CI แดงจนถึงราก แล้วพบว่า **ไม่มีบั๊กใน commit นั้นเลย** — migration ถูก apply
     * ลงฐานก่อน push · CI จึงรัน**โค้ดเก่า**กับ**ฐานที่เดินหน้าไปแล้ว**
     *
     * 🔴 **ทิศที่อันตรายกว่าคือทิศตรงข้าม และมันเงียบสนิท:** commit ที่ migration ยัง**ไม่ถูก apply**
     * จะ **เขียว** ถ้าฐานบังเอิญมีสภาพที่มันคาดหวังอยู่แล้วจากงานของคนอื่น
     * → *"ฐานตอนนี้ตรงกับที่ commit นี้คาดหวัง"* **ไม่ใช่** *"migration ของ commit นี้ถูก"*
     *   ทรีที่ใช้ร่วมกัน 8 เซสชันทำให้เรื่องบังเอิญแบบนี้เป็นเรื่องปกติ ไม่ใช่ข้อยกเว้น
     *
     * 🎯 **เคสนี้ไม่ได้ตัดสินว่าโค้ดถูกหรือผิด — มันตัดสินว่าคำตอบของทั้งชุดมีความหมายหรือเปล่า**
     * · แดงที่นี่แปลว่า **ผลของ 400 กว่าเคสข้างล่างอ่านไม่ได้** ไม่ใช่ว่ามีอะไรพัง
     * · 🔴 **ต้องแดง ไม่ใช่ skip** — ไฟล์นี้เตือนตัวเองไว้ทั้งไฟล์แล้วว่า **"ข้าม" อ่านเป็น "เขียว"**
     *
     * ⚠️ **ขอบเขตที่รู้อยู่ และต้องรู้:** `supabase_migrations.schema_migrations` บันทึกเฉพาะสิ่งที่
     * **ลงผ่าน CLI** · SQL ที่รันมือจาก dashboard **ไม่ถูกบันทึกเลย** → เคสนี้ตอบได้ว่า
     * *"ไฟล์พวกนี้ถูก apply แล้วหรือยัง"* **ตอบไม่ได้ว่า** *"ฐานมีแค่ไฟล์พวกนี้"*
     * (บานที่เหลือคือของที่ `table_exposure` ถามแทน — คนละคำถาม ต้องมีทั้งคู่)
     */
    /**
     * ดึงเลขเวอร์ชันจากชื่อไฟล์ — **ส่วนที่เปราะที่สุดของเคสข้างล่าง**
     * ถ้ามันคืน `null` ทุกไฟล์ `inTree` จะว่าง แล้ว `notApplied` ก็ว่างตาม → **เขียวโดยไม่ตรวจอะไร**
     * 🔴 จึงต้องมีเคสยิงใส่มันตรง ๆ · เคสข้างล่างเรียก**ตัวนี้ตัวเดียวกัน** (กฎ `E0` ข้อ 5)
     */
    const versionOf = (path: string): string | null =>
      /(\d{14})_/.exec(path.split("/").pop() ?? "")?.[1] ?? null;

    it("ตัวดึงเลขเวอร์ชันทำงาน 2 ทิศ — ไม่งั้นเคสข้างล่างเทียบเซตว่างกับเซตว่าง", () => {
      expect(versionOf("/a/b/20260825214436_e2_preserve_authorship.sql")).toBe("20260825214436");
      expect(versionOf("20260824043822_identity.sql")).toBe("20260824043822");
      // ด้านลบ — ชื่อที่ไม่เข้ารูปต้องคืน null ไม่ใช่เดาเอา
      expect(versionOf("/a/b/readme.sql")).toBeNull();
      expect(versionOf("/a/b/2026_short.sql")).toBeNull();
    });

    it("🔴 ตัวเทียบจับความต่างได้จริง — ทั้งสองทิศ", () => {
      // ยิงใส่ตรรกะเดียวกับเคสจริง โดยไม่ต้องแตะโฟลเดอร์ migration ของจริง
      // (วางไฟล์ปลอมที่นั่นแล้วมีคน `db push` ระหว่างนั้น = แถวค้างในฐานที่ลบไม่ออกง่าย ๆ)
      const diff = (tree: string[], db: string[]) => ({
        ฐานยังไม่ได้รัน: tree.filter((v) => !db.includes(v)).sort(),
        ฐานรันของที่ไม่มีในทรี: db.filter((v) => !tree.includes(v)).sort(),
      });
      expect(diff(["1", "2"], ["1", "2"])).toEqual({ ฐานยังไม่ได้รัน: [], ฐานรันของที่ไม่มีในทรี: [] });
      expect(diff(["1", "2"], ["1"]).ฐานยังไม่ได้รัน).toEqual(["2"]);
      expect(diff(["1"], ["1", "2"]).ฐานรันของที่ไม่มีในทรี).toEqual(["2"]);
    });

    it("🔴 migration ในทรี กับที่ฐานรันไปแล้ว ต้องเป็นชุดเดียวกัน", async () => {
      const { data, error } = await admin.rpc("applied_migrations");
      // fail closed — เรียกไม่ได้ = ตอบไม่ได้ = แดง **ไม่ใช่ผ่าน** (`D48`)
      expect(
        error?.message ?? null,
        "เรียก applied_migrations() ไม่ได้ → **ตอบไม่ได้ว่าฐานตรงกับทรีไหม**\n" +
          "  ถ้ายังไม่ได้ลง migration ตัวนั้น นั่นคือคำตอบของเคสนี้พอดี ไม่ใช่เหตุให้ข้าม",
      ).toBeNull();

      const inDb = new Set((data as Array<{ version: string }>).map((r) => r.version));
      const inTree = new Set(migrationFiles.map(versionOf).filter((v): v is string => Boolean(v)));
      // ถ้าตัวดึงพังทั้งยวง เคสข้างล่างจะเทียบเซตว่างกับเซตว่างแล้วเขียว — กันไว้ตรงนี้
      expect(inTree.size, "ดึงเลขเวอร์ชันจากชื่อไฟล์ไม่ได้เลยสักไฟล์").toBe(migrationFiles.length);

      const notApplied = [...inTree].filter((v) => !inDb.has(v)).sort();
      const notInTree = [...inDb].filter((v) => !inTree.has(v)).sort();

      expect(
        { ฐานยังไม่ได้รัน: notApplied, ฐานรันของที่ไม่มีในทรี: notInTree },
        "ฐานกับทรีไม่ตรงกัน — **ผลของทั้งชุดข้างล่างไม่มีความหมาย**\n" +
          "  · `ฐานยังไม่ได้รัน` → รัน `db push` ก่อน · เคสที่พึ่งสคีมาใหม่จะแดงด้วยเหตุผลที่ผิด\n" +
          "    🔴 **และบางเคสจะ *เขียว* ด้วยเหตุผลที่ผิด** ถ้าฐานบังเอิญมีสภาพนั้นจากงานคนอื่น\n" +
          "  · `ฐานรันของที่ไม่มีในทรี` → คุณอยู่คนละ commit กับฐาน (หรือมีคน apply ของที่ยังไม่ commit)\n" +
          "    ⚠️ **ฐานย้อนเวลาไม่ได้** — commit เก่าจะแดงตลอดกาล แต่จะแดงพร้อมเหตุผลที่ถูก",
      ).toEqual({ ฐานยังไม่ได้รัน: [], ฐานรันของที่ไม่มีในทรี: [] });
    });

    it("ด้านบวกของตัวเทียบเอง — ทั้งสองฝั่งต้องไม่ว่าง", async () => {
      // `P-21` อีกครั้ง: สองเซตว่างเทียบกันแล้วเท่ากันเสมอ **และอ่านเป็น "ตรงกันเป๊ะ"**
      const { data } = await admin.rpc("applied_migrations");
      expect((data as unknown[]).length, "ฐานบอกว่าไม่เคยรัน migration เลย").toBeGreaterThan(0);
      expect(migrationFiles.length, "หาไฟล์ migration ในทรีไม่เจอสักไฟล์").toBeGreaterThan(0);
    });
  });

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
    it("🔴 `E2-AC12` ① — ไคลเอนต์ตั้ง `deleted_at` เองไม่ได้สักตาราง", async () => {
      /**
       * **`E2-AC12` เขียนไว้ว่า:** *"การลบกลายเป็น `UPDATE` → เมทริกซ์ที่ยืนยันว่า C ถูกปฏิเสธ `DELETE`
       * กำลังทดสอบ verb ที่แอปไม่เรียกอีกแล้ว"* — ข้อนี้คือครึ่งที่ตามมาจากประโยคนั้น
       *
       * 🎯 **ถ้า `deleted_at` อยู่ใน column grant เมื่อไหร่ การรับประกันของ RPC หายทันที**
       * `soft_delete_*` ทั้ง 6 ตัวตรวจสิทธิ์แล้วค่อยเขียน `deleted_at` · แต่ trigger invariant
       * บางตัวผูกกับ `before update` **บางตัวไม่มีเลย** → ทางตรงจะข้ามการตรวจที่อยู่*ในตัว RPC*
       * (เช่น `soft_delete_*` เช็ค `can_read_trip` เพื่อไม่ให้รั่วว่าแถวมีอยู่ — `P-53`)
       *
       * 🔴 **ผมเข้าใจผิดเรื่องนี้มาก่อนและแก้ตัวเองด้วยการถามฐาน:** ไฟล์ migration ตัวหนึ่ง
       * เขียน `grant update (…, deleted_at)` ไว้จริง **แต่ไฟล์ที่รันทีหลัง revoke แล้ว grant ใหม่โดยไม่มีมัน**
       * → **อ่านไฟล์แล้วสรุปว่ารั่ว · ถามฐานแล้วพบว่าไม่รั่ว** · เคสนี้จึงถามฐาน ไม่ใช่ grep ไฟล์
       */
      const { data, error } = await admin.rpc("client_writable_timestamps", {
        p_columns: ["deleted_at"],
      });
      expect(error, `เรียกด่านไม่ได้: ${error?.message}`).toBeNull();
      expect(
        data ?? [],
        "ไคลเอนต์เขียน `deleted_at` ได้ตรง ๆ — **ทางลบที่ไม่ผ่าน `soft_delete_*` เปิดอยู่**\n" +
          "  🔴 การตรวจที่อยู่*ในตัว RPC* (เช่น ไม่รั่วว่าแถวมีอยู่ · `P-53`) ถูกข้ามทั้งหมดบนทางนี้\n" +
          "  ทางแก้: ถอด `deleted_at` ออกจาก column grant **อย่าเติมชื่อตารางลงข้อยกเว้น**",
      ).toEqual([]);
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
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * `P-60` — คลังลูก 2 ใบที่มาจาก `data/emergency.ts` และ `data/airportAccess.ts`
   *
   * 🔴 **ทั้งคู่ต้องอยู่ในรายชื่อที่ `E2-AC2` ระบุชื่อ ไม่ใช่ผ่านเพราะขึ้นต้นด้วย `catalog_`** (`D48`)
   *    — และเคสนี้คือสิ่งที่ทำให้ *"อยู่ในรายชื่อ"* แปลว่าอะไรจริง ๆ: **อ่านได้ทุกคน · เขียนไม่ได้เลย**
   *
   * 🎯 **สองทิศ ไม่ใช่ทิศเดียว** — เคส "เขียนไม่ได้" อย่างเดียวจะเขียวเท่ากันถ้าตารางเข้าไม่ถึงเลย
   */
  describe("🔴 E2 — คลังลูก: `catalog_country_contacts` · `catalog_place_access` (`P-60`)", () => {
    const cc = TEST_COUNTRY_CODES.catalogChildren;
    let placeId = "";
    let contactId = "";
    let accessId = "";

    /**
     * 🔴 เก็บกวาดของค้างก่อนเสมอ — **ไม่ใช่ความระมัดระวัง แต่เป็นสิ่งที่เคสนี้สอนผมเมื่อกี้**
     *
     * รอบแรกที่ผมรัน `beforeAll` ล้มกลางคัน แล้ว `afterAll` เก็บกวาดไม่ออก
     * (`catalog_cities.country_id … on delete restrict` — ลบประเทศไม่ได้ถ้าเมืองยังอยู่)
     * → แถวค้าง → รอบถัดไป `beforeAll` ล้มด้วยคีย์ซ้ำ → **บล็อกนี้ "ข้าม" ทุกรอบตลอดกาล**
     *
     * 🎯 และมันโผล่เป็น **`Failed Suites 1`** ขณะที่บรรทัดสรุปพิมพ์ว่า `487 passed | 3 skipped`
     *    — **`F1` ของ P4 ซ้ำรอยเป๊ะ** · ผมเกือบรายงานเขียวเพราะ grep ของผมเองมองไม่เห็นบรรทัดนั้น
     */
    async function purge() {
      const { data: cities } = await admin.from("catalog_cities").select("id").eq("country_id", cc);
      for (const c of cities ?? []) {
        await admin.from("catalog_places").delete().eq("city_id", c.id as string);
        await admin.from("catalog_cities").delete().eq("id", c.id as string);
      }
      await admin.from("catalog_country_contacts").delete().eq("country_id", cc);
      await admin.from("catalog_countries").delete().eq("id", cc);
    }

    beforeAll(async () => {
      await purge();
      await admin.from("catalog_countries").insert({ id: cc, name_th: "ทดสอบลูกคลัง", name_en: "CatalogChildren" });
      const city = await admin.from("catalog_cities").insert({
        country_id: cc, name_th: "เมืองลูกคลัง", name_en: "ChildCity", lat: 1, lng: 1, timezone: "UTC",
      }).select("id").single();
      if (city.error) throw new Error(`สร้างเมืองไม่ได้: ${city.error.message}`);
      const place = await admin.from("catalog_places").insert({
        city_id: city.data!.id, category: "transfer", source: "transfer",
        transfer_kind: "airport", lat: 1, lng: 1,
      }).select("id").single();
      if (place.error) throw new Error(`สร้างสถานที่ไม่ได้: ${place.error.message}`);
      placeId = place.data!.id as string;

      const contact = await admin.from("catalog_country_contacts").insert({
        country_id: cc, label: "สายด่วนทดสอบ", local_number: "119",
      }).select("id").single();
      if (contact.error) throw new Error(`สร้างเบอร์ฉุกเฉินไม่ได้: ${contact.error.message}`);
      contactId = contact.data!.id as string;

      const access = await admin.from("catalog_place_access").insert({
        place_id: placeId, label: "รถไฟทดสอบ", minutes: 43, from_label: "สถานีทดสอบ",
      }).select("id").single();
      if (access.error) throw new Error(`สร้างเส้นทางเข้าเมืองไม่ได้: ${access.error.message}`);
      accessId = access.data!.id as string;
    });

    // 🔴 **ต้องลบตามลำดับพ่อลูก** — `catalog_cities`/`catalog_places` เป็น `on delete restrict`
    //    ฉบับแรกของผมลบ place แล้วลบ country ทันที · **เมืองค้างอยู่ตรงกลาง ลบประเทศจึงไม่ออก**
    //    และมันล้มเงียบ เพราะ `afterAll` ไม่ได้ตรวจผล
    afterAll(purge);

    it("ด้านบวก: ทุกคนที่ล็อกอินอ่านคลังลูกได้ — ถ้าข้อนี้แดง เคสด้านลบไม่ได้พิสูจน์อะไร", async () => {
      const c = await A.from("catalog_country_contacts").select("label, local_number").eq("id", contactId).single();
      expect(c.error?.message ?? null, "อ่านเบอร์ฉุกเฉินไม่ได้").toBeNull();
      expect(c.data!.local_number).toBe("119");

      const a = await B.from("catalog_place_access").select("label, minutes").eq("id", accessId).single();
      expect(a.error?.message ?? null, "อ่านเส้นทางเข้าเมืองไม่ได้").toBeNull();
      expect(a.data!.minutes).toBe(43);
    });

    it("🔴 ผู้ใช้เขียนคลังลูกไม่ได้ทั้ง 3 verb · anon ไม่ได้อะไรเลย", async () => {
      for (const t of ["catalog_country_contacts", "catalog_place_access"] as const) {
        const id = t === "catalog_country_contacts" ? contactId : accessId;
        const upd = await A.from(t).update({ label: "แก้ชื่อ" }).eq("id", id);
        expect(upd.error?.code, `ผู้ใช้แก้ ${t} ได้`).toBe("42501");
        const del = await A.from(t).delete().eq("id", id);
        expect(del.error?.code, `ผู้ใช้ลบ ${t} ได้`).toBe("42501");
        const sel = await D.from(t).select("id").eq("id", id);
        expect((sel.data ?? []).length, `anon อ่าน ${t} ได้`).toBe(0);
      }
      const insC = await A.from("catalog_country_contacts").insert({ country_id: cc, label: "ปลอม", local_number: "1" });
      expect(insC.error?.code, "ผู้ใช้เพิ่มเบอร์ฉุกเฉินได้").toBe("42501");
      const insA = await A.from("catalog_place_access").insert({ place_id: placeId, label: "ปลอม", minutes: 1, from_label: "x" });
      expect(insA.error?.code, "ผู้ใช้เพิ่มเส้นทางได้").toBe("42501");
    });

    it("🔴 `transfer_kind` ตั้งได้เฉพาะเมื่อ `source='transfer'` — ชุดค่าที่ขัดกันเขียนลงไปไม่ได้", async () => {
      const bad = await admin.from("catalog_places").update({ source: "curated" }).eq("id", placeId);
      expect(
        bad.error?.message ?? null,
        "เปลี่ยนเป็น curated ทั้งที่ยังมี transfer_kind ได้ — check ไม่ทำงาน",
      ).not.toBeNull();
    });
  });

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
    const cc3 = TEST_COUNTRY_CODES.customPlaces;
    let tripC = "", cityC = "", placeC = "";

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

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — `checklist_items` · `place_notes` · `hidden_places` (D53 · D70 · D76)", () => {
    /**
     * ✅ เขียนก่อน `db push`
     *
     * 🔴 **`Q1` ทำงานอีกครั้ง** — `column-map.md` เขียน `place_id` ว่า *"คงเดิม"* ทั้งใน
     * `place_notes` และ `hidden_places` **แต่ `D53` แยกการอ้างสถานที่เป็นสองคอลัมน์ไปแล้ว**
     * → *"คงเดิม"* ชี้ไปคอลัมน์ที่ไม่มีอยู่ในสคีมาใหม่ · ตัดสิน:
     *   · **`place_notes` ได้ทั้งสองแบบ** (โน้ตบนสถานที่ที่ผู้ใช้เพิ่มเองก็สมเหตุสมผล) → XOR แบบ `trip_stops`
     *   · **`hidden_places` ได้เฉพาะคลังกลาง** — *"ซ่อน"* สถานที่ที่ตัวเองเพิ่มไม่มีความหมาย **ลบทิ้งเลยตรงกว่า**
     */
    let tripK = "", planK = "", catK = "", myK = "";
    const ccK = TEST_COUNTRY_CODES.tripContent;

    beforeAll(async () => {
      await admin.from("catalog_cities").delete().eq("country_id", ccK);
      await admin.from("catalog_countries").delete().eq("id", ccK);
      await admin.from("catalog_countries").insert({ id: ccK, name_th: "ทดสอบเจ็ด", name_en: "T7" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: ccK, name_th: "เมืองK", name_en: "CityK", lat: 35, lng: 129, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      const cp = await admin.from("catalog_places")
        .insert({ city_id: ci.data.id, category: "sight", lat: 35, lng: 129 })
        .select("id").single();
      if (cp.error) throw new Error(`seed place: ${cp.error.message}`);
      catK = cp.data.id as string;

      const t = await A.rpc("create_trip", {
        p_title: `content-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripK = t.data.id as string;
      await A.from("trip_members").insert({ trip_id: tripK, user_id: ids.b, role: "editor" });
      await A.from("trip_members").insert({ trip_id: tripK, user_id: ids.c, role: "viewer" });

      const pl = await A.from("trip_plans").select("id").eq("trip_id", tripK).eq("is_active", true).single();
      planK = pl.data!.id as string;

      const mp = await A.from("custom_places")
        .insert({ trip_id: tripK, city_id: ci.data.id, category: "cafe", lat: 35.1, lng: 129.1 })
        .select("id").single();
      if (mp.error) throw new Error(`สร้าง custom place: ${mp.error.message}`);
      myK = mp.data.id as string;
    });

    afterAll(async () => {
      await admin.from("catalog_places").delete().eq("id", catK);
      await admin.from("catalog_countries").delete().eq("id", ccK);
    });

    describe("`checklist_items`", () => {
      let itemK = "";

      it("ด้านบวก: editor เพิ่มรายการได้ · เซิร์ฟเวอร์เติมคนเพิ่มให้", async () => {
        const { data, error } = await B.from("checklist_items")
          .insert({ trip_id: tripK, text: `พาสปอร์ต ${stamp}`, category: "เอกสาร" })
          .select("id,added_by_user,is_checked").single();
        expect(error, `เพิ่มรายการไม่ได้: ${error?.message}`).toBeNull();
        itemK = data!.id as string;
        expect(data?.added_by_user).toBe(ids.b);
        expect(data?.is_checked, "รายการใหม่ต้องยังไม่ถูกติ๊ก").toBe(false);
      });

      it("🔴 ติ๊กแล้วต้องรู้ว่าใครติ๊ก — และไคลเอนต์ตั้งเองไม่ได้", async () => {
        // 🔴 **UPDATE ที่ถูก RLS กรอง คืน 200 ไม่มี error** — เคสฉบับแรกของผม assert `42501`
        //    แล้วแดง · **ผมเดินเข้ากับดักที่ P2 รายงานและ P4 ตรึงไว้แล้ว เป็นครั้งที่สองของวัน**
        //    → ต้อง **อ่านกลับมายืนยัน** ไม่ใช่เชื่อว่าไม่มี error แปลว่าถูกปฏิเสธ
        await C.from("checklist_items").update({ is_checked: true }).eq("id", itemK);
        const afterViewer = await B.from("checklist_items").select("is_checked").eq("id", itemK).single();
        expect(afterViewer.data?.is_checked, "viewer ติ๊กรายการสำเร็จ").toBe(false);

        const byB = await B.from("checklist_items").update({ is_checked: true }).eq("id", itemK);
        expect(byB.error, `editor ติ๊กไม่ได้: ${byB.error?.message}`).toBeNull();

        const { data } = await B.from("checklist_items").select("checked_by_user").eq("id", itemK).single();
        expect(data?.checked_by_user, "ติ๊กแล้วไม่รู้ว่าใครติ๊ก").toBe(ids.b);

        const fake = await B.from("checklist_items").update({ checked_by_user: ids.a }).eq("id", itemK);
        expect(fake.error?.code, `ตั้ง checked_by_user เองได้: ${fake.error?.message ?? "ไม่มี error"}`).toBe("42501");
      });

      it("🔴 ติ๊กออกแล้วต้องล้างคนติ๊กด้วย — ไม่งั้นค้างเป็นชื่อคนที่ไม่ได้ติ๊กแล้ว", async () => {
        await B.from("checklist_items").update({ is_checked: false }).eq("id", itemK);
        const { data } = await B.from("checklist_items").select("checked_by_user").eq("id", itemK).single();
        expect(data?.checked_by_user, "ติ๊กออกแล้วชื่อคนติ๊กยังค้าง").toBeNull();
      });

      it("🔴 ลบผ่าน RPC เท่านั้น", async () => {
        const hard = await B.from("checklist_items").delete().eq("id", itemK);
        expect(hard.error?.code, `ยังลบจริงได้: ${hard.error?.message ?? "ไม่มี error"}`).toBe("42501");
        const soft = await B.rpc("soft_delete_checklist_item", { p_id: itemK });
        expect(soft.error, `ลบผ่าน RPC ไม่ได้: ${soft.error?.message}`).toBeNull();
        const seen = await B.from("checklist_items").select("id").eq("id", itemK);
        expect(seen.data).toEqual([]);
      });
    });

    describe("`place_notes` — XOR แบบเดียวกับ `trip_stops`", () => {
      it("ด้านบวก: โน้ตบนสถานที่คลังกลาง และบนสถานที่ของทริป ได้ทั้งคู่", async () => {
        const a1 = await B.from("place_notes")
          .insert({ trip_id: tripK, plan_id: planK, catalog_place_id: catK, note: "อร่อย" });
        expect(a1.error, `โน้ตบนคลังกลางไม่ได้: ${a1.error?.message}`).toBeNull();

        const a2 = await B.from("place_notes")
          .insert({ trip_id: tripK, plan_id: planK, custom_place_id: myK, note: "ร้านลับ" });
        expect(a2.error, `โน้ตบนสถานที่ของทริปไม่ได้: ${a2.error?.message}`).toBeNull();
      });

      it("🔴 โน้ตที่ไม่ชี้สถานที่เลย หรือชี้สองแหล่ง เขียนลงไม่ได้", async () => {
        const none = await B.from("place_notes")
          .insert({ trip_id: tripK, plan_id: planK, note: "ลอย ๆ" });
        expect(none.error?.code, `โน้ตที่ไม่ชี้อะไรเลยเขียนได้: ${none.error?.message ?? "ไม่มี error"}`).toBe("23514");

        const both = await B.from("place_notes")
          .insert({ trip_id: tripK, plan_id: planK, catalog_place_id: catK, custom_place_id: myK, note: "สอง" });
        expect(both.error?.code, `โน้ตที่ชี้สองแหล่งเขียนได้: ${both.error?.message ?? "ไม่มี error"}`).toBe("23514");
      });

      it("🔴 viewer อ่านโน้ตได้ แต่เขียนไม่ได้ · anon ไม่ได้อะไรเลย", async () => {
        const r = await C.from("place_notes").select("note").eq("trip_id", tripK);
        expect(r.data, "viewer อ่านโน้ตไม่ได้").not.toHaveLength(0);
        const w = await C.from("place_notes")
          .insert({ trip_id: tripK, plan_id: planK, catalog_place_id: catK, note: "x" });
        expect(w.error?.code).toBe("42501");
        const anon = await D.from("place_notes").select("note");
        expect(anon.data ?? []).toEqual([]);
      });
    });

    describe("`hidden_places` — คลังกลางเท่านั้น และลบจริงโดยตั้งใจ", () => {
      it("ด้านบวก: ซ่อนแล้วอ่านกลับได้ · เอากลับคืนได้ด้วยการลบแถว", async () => {
        const h = await B.from("hidden_places")
          .insert({ trip_id: tripK, catalog_place_id: catK });
        expect(h.error, `ซ่อนไม่ได้: ${h.error?.message}`).toBeNull();

        const seen = await C.from("hidden_places").select("catalog_place_id").eq("trip_id", tripK);
        expect(seen.data, "viewer ไม่เห็นรายการที่ถูกซ่อน = หน้าจอสองคนไม่ตรงกัน").toHaveLength(1);

        // 🔴 **ลบจริงโดยตั้งใจ** — tombstone ของ "การเลิกซ่อน" ไม่มีความหมาย (`D76` ระบุผู้ได้/ไม่ได้)
        const un = await B.from("hidden_places").delete().eq("trip_id", tripK).eq("catalog_place_id", catK);
        expect(un.error, `เอากลับคืนไม่ได้: ${un.error?.message}`).toBeNull();
      });

      it("🔴 ซ่อนซ้ำไม่ได้ · viewer ซ่อนไม่ได้", async () => {
        await B.from("hidden_places").insert({ trip_id: tripK, catalog_place_id: catK });
        const dup = await B.from("hidden_places").insert({ trip_id: tripK, catalog_place_id: catK });
        expect(dup.error?.code, `ซ่อนซ้ำได้: ${dup.error?.message ?? "ไม่มี error"}`).toBe("23505");

        const v = await C.from("hidden_places").insert({ trip_id: tripK, catalog_place_id: catK });
        expect(v.error?.code).toBe("42501");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — `trip_hotels`: `D51` ที่รอ `D76` มาตั้งแต่ต้น", () => {
    /**
     * ✅ เขียนก่อน `db push`
     *
     * `D51` ตัดสินไว้ตั้งแต่ 24 ส.ค. ว่า **`leg_id` ที่เป็นค่าคำนวณต้องหายไป** — ใบจองที่พัก
     * ผูกกับ **ช่วงวันที่ของตัวเอง** (`check_in` / `check_out`) แทน
     * > *"คืนนี้นอนที่ไหน" = แถวที่ `check_in <= วันนั้น < check_out`*
     * 🔴 และ `D51` เขียนไว้เองว่าต้องมี **exclusion constraint กันช่วงวันซ้อนกัน**
     *    **เขียนไม่ได้จนกว่าตระกูลนี้จะมี `deleted_at`** — ซึ่งคือเหตุผลที่ P7 บังคับให้ `D76` ตัดสินก่อน
     *
     * 🎯 **เคสที่สำคัญที่สุดของบล็อกนี้คือเคสสุดท้าย** — ที่พักที่ถูกลบไปแล้ว **ต้องไม่กันช่วงวัน**
     * ถ้ากัน ผู้ใช้จะจองที่พักคืนเดิมใหม่ไม่ได้ตลอดกาล โดยที่หน้าจอไม่มีอะไรอยู่ตรงนั้นเลย
     */
    let tripH = "", cityH = "";
    const ccH = TEST_COUNTRY_CODES.tripHotels;

    beforeAll(async () => {
      await admin.from("catalog_cities").delete().eq("country_id", ccH);
      await admin.from("catalog_countries").delete().eq("id", ccH);
      await admin.from("catalog_countries").insert({ id: ccH, name_th: "ทดสอบแปด", name_en: "T8" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: ccH, name_th: "เมืองH", name_en: "CityH", lat: 37, lng: 127, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      cityH = ci.data.id as string;

      const t = await A.rpc("create_trip", {
        p_title: `hotel-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripH = t.data.id as string;
      await A.from("trip_members").insert({ trip_id: tripH, user_id: ids.b, role: "editor" });
      await A.from("trip_members").insert({ trip_id: tripH, user_id: ids.c, role: "viewer" });
    });

    afterAll(async () => {
      await admin.from("catalog_countries").delete().eq("id", ccH);
    });

    it("ด้านบวก: editor เพิ่มที่พักพร้อมช่วงวันได้", async () => {
      const { error } = await B.from("trip_hotels").insert({
        trip_id: tripH, city_id: cityH, hotel_name: `โรงแรม A ${stamp}`,
        check_in: "2026-10-11", check_out: "2026-10-14",
      });
      expect(error, `เพิ่มที่พักไม่ได้: ${error?.message}`).toBeNull();
    });

    it("ด้านบวก: ช่วงวันที่ต่อกันพอดี (เช็คเอาต์วันเดียวกับเช็คอินอันถัดไป) ต้องได้", async () => {
      const { error } = await B.from("trip_hotels").insert({
        trip_id: tripH, city_id: cityH, hotel_name: `โรงแรม B ${stamp}`,
        check_in: "2026-10-14", check_out: "2026-10-17",
      });
      expect(
        error,
        `ช่วงวันต่อกันพอดีถูกปฏิเสธ: ${error?.message}\n` +
          "  🔴 = ใช้ `[]` แทน `[)` · ย้ายโรงแรมวันไหนก็ชนกันหมด ซึ่งเป็นเรื่องปกติของทุกทริป",
      ).toBeNull();
    });

    it("🔴 D51 — ช่วงวันซ้อนกันในทริปเดียวไม่ได้ (นอน 2 ที่คืนเดียวกัน)", async () => {
      const { error } = await B.from("trip_hotels").insert({
        trip_id: tripH, city_id: cityH, hotel_name: `ซ้อน ${stamp}`,
        check_in: "2026-10-12", check_out: "2026-10-13",
      });
      expect(
        error?.code,
        `ที่พักซ้อนช่วงวันเขียนลงได้: ${error?.message ?? "ไม่มี error"}\n` +
          "  = 'คืนนี้นอนที่ไหน' ตอบได้สองคำตอบ และไม่มีอะไรบอกว่าอันไหนจริง",
      ).toBe("23P01");
    });

    it("ด้านบวก: ทริปคนละใบ ช่วงวันซ้อนกันได้ตามปกติ", async () => {
      const t2 = await A.rpc("create_trip", {
        p_title: `hotel2-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      const { error } = await A.from("trip_hotels").insert({
        trip_id: t2.data.id, city_id: cityH, hotel_name: `คนละทริป ${stamp}`,
        check_in: "2026-10-12", check_out: "2026-10-13",
      });
      expect(error, `ทริปคนละใบยังชนกัน = exclusion ไม่ได้แยกตามทริป: ${error?.message}`).toBeNull();
    });

    it("🔴 `check_out` ต้องหลัง `check_in`", async () => {
      const { error } = await B.from("trip_hotels").insert({
        trip_id: tripH, city_id: cityH, hotel_name: `ย้อนเวลา ${stamp}`,
        check_in: "2026-10-20", check_out: "2026-10-19",
      });
      expect(error?.code, `ช่วงวันย้อนหลังเขียนได้: ${error?.message ?? "ไม่มี error"}`).toBe("23514");
    });

    it("🔴 viewer เพิ่มที่พักไม่ได้ · anon ไม่ได้อะไรเลย", async () => {
      const v = await C.from("trip_hotels").insert({
        trip_id: tripH, city_id: cityH, hotel_name: "x", check_in: "2026-10-18", check_out: "2026-10-19",
      });
      expect(v.error?.code).toBe("42501");
      const anon = await D.from("trip_hotels").select("hotel_name");
      expect(anon.data ?? []).toEqual([]);
    });

    it("🔴 **เคสที่ `D76` ถูกบังคับให้ตัดสินก่อนเพราะข้อนี้** — ที่พักที่ถูกลบแล้วต้องไม่กันช่วงวัน", async () => {
      const mk = await B.from("trip_hotels").insert({
        trip_id: tripH, city_id: cityH, hotel_name: `จะถูกลบ ${stamp}`,
        check_in: "2026-10-18", check_out: "2026-10-20",
      }).select("id").single();
      expect(mk.error, `เพิ่มที่พักไม่ได้: ${mk.error?.message}`).toBeNull();

      const del = await B.rpc("soft_delete_trip_hotel", { p_id: mk.data!.id });
      expect(del.error, `ลบที่พักไม่ได้: ${del.error?.message}`).toBeNull();

      const again = await B.from("trip_hotels").insert({
        trip_id: tripH, city_id: cityH, hotel_name: `จองใหม่ ${stamp}`,
        check_in: "2026-10-18", check_out: "2026-10-20",
      });
      expect(
        again.error,
        `จองที่พักคืนเดิมใหม่ไม่ได้: ${again.error?.message}\n` +
          "  🔴 = exclusion ไม่มี `where (deleted_at is null)` → ที่พักที่ผู้ใช้มองไม่เห็นแล้ว\n" +
          "     ยังกันช่วงวันอยู่ตลอดกาล และไม่มีอะไรบนหน้าจออธิบายได้เลยว่าทำไม",
      ).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 กิ่งที่ตัวนับ `E2-AC11` หาเจอในรอบแรก — 5 policy ที่ไม่เคยถูกยิงเลย", () => {
    /**
     * ตัวนับ `E2-AC11` (ใน `schemaPins.test.ts`) รันครั้งแรกแล้วชี้มา 5 กิ่ง:
     * `custom_places.update` · `custom_place_names.update` · `place_notes.update`
     * · `trip_hotels.update` · `trip_day_plan_settings.select`
     * **ทั้งห้าเขียนไว้ในไฟล์ครบ มี grant ครบ และไม่มีเคสไหนแตะเลยสักเคส**
     *
     * 🔴 **เคสด้านลบของ `update` ที่นี่ต้องอ่านค่ากลับ ไม่ใช่ดู error** — และข้อนี้สำคัญ:
     * `authenticated` **มี column grant ครบ** → `viewer` ยิง `update` แล้ว **ไม่ได้ `42501`**
     * RLS แค่กรองแถวออก → **PostgREST คืน "สำเร็จ" กับการอัปเดต 0 แถว**
     * 🎯 เขียน `expect(error).not.toBeNull()` เมื่อไหร่ **เคสจะแดงทั้งที่ระบบทำงานถูก**
     *    และถ้าเขียน `expect(error).toBeNull()` **มันจะเขียวทั้งที่ viewer แก้ได้จริงก็ตาม**
     *    → **มีทางเดียวที่ตอบได้: อ่านแถวกลับมาดู**
     *
     * ⚠️ **`B` เป็นคนนอก ไม่ใช่ editor ในบล็อกนี้** — จึงได้ 3 persona ต่อกิ่ง:
     * เจ้าของแก้ได้ · viewer แก้ไม่ได้ · คนนอกแก้ไม่ได้
     */
    const ccU = TEST_COUNTRY_CODES.updateBranches;
    let tripU2 = "", planU = "", dayU = "", cityU = "", myU = "";

    beforeAll(async () => {
      await purgeCountry(ccU);
      await admin.from("catalog_countries").insert({ id: ccU, name_th: "ทดสอบอัปเดต", name_en: "UPD" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: ccU, name_th: "เมืองU", name_en: "CityU", lat: 35, lng: 129, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      cityU = ci.data.id as string;

      const t = await A.rpc("create_trip", {
        p_title: `upd-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripU2 = t.data.id as string;
      // เชิญ `C` เป็น viewer เท่านั้น — `B` เป็นคนนอกโดยตั้งใจ
      const inv = await A.from("trip_members").insert({ trip_id: tripU2, user_id: ids.c, role: "viewer" });
      if (inv.error) throw new Error(`เชิญ C: ${inv.error.message}`);

      const pl = await A.from("trip_plans").select("id").eq("trip_id", tripU2).eq("is_active", true).single();
      if (pl.error) throw new Error(`หาแผน: ${pl.error.message}`);
      planU = pl.data.id as string;
      const dy = await A.from("trip_days").insert({ trip_id: tripU2, date: "2026-10-12" }).select("id").single();
      if (dy.error) throw new Error(`สร้างวัน: ${dy.error.message}`);
      dayU = dy.data.id as string;

      const mp = await A.from("custom_places")
        .insert({ trip_id: tripU2, city_id: cityU, category: "cafe", lat: 35.1, lng: 129.1, description: "เดิม" })
        .select("id").single();
      if (mp.error) throw new Error(`custom place: ${mp.error.message}`);
      myU = mp.data.id as string;

      const seeds: Array<[string, Record<string, unknown>]> = [
        ["custom_place_names", { trip_id: tripU2, place_id: myU, locale: "th", name: "ชื่อเดิม" }],
        ["place_notes", { trip_id: tripU2, plan_id: planU, custom_place_id: myU, note: "โน้ตเดิม" }],
        ["trip_hotels", {
          trip_id: tripU2, city_id: cityU, hotel_name: "โรงแรมเดิม",
          check_in: "2026-10-12", check_out: "2026-10-14",
        }],
        ["trip_day_plan_settings", {
          trip_id: tripU2, plan_id: planU, trip_day_id: dayU, start_time: "08:00",
        }],
      ];
      for (const [table, row] of seeds) {
        const { error } = await A.from(table).insert(row);
        if (error) throw new Error(`seed ${table}: ${error.message}`);
      }
    });

    afterAll(async () => {
      await admin.from("trips").delete().eq("id", tripU2);
      const error = await purgeCountry(ccU);
      if (error) console.warn(`\n⚠️  เก็บกวาดคลังของบล็อก update ไม่สำเร็จ: ${error}\n`);
    });

    /**
     * ตรรกะร่วมของทั้ง 5 กิ่ง — **เคสข้างล่างเรียกตัวนี้ ไม่ใช่ก๊อปกัน** (`E0` ข้อ 5)
     *
     * ⚠️ **แต่ *จุดเรียก* ต้องพิมพ์ชื่อตารางเป็นสตริงตรง ๆ ห้ามส่งผ่านตัวแปร** — และเหตุผลไม่ใช่สไตล์:
     * ตัวนับ `E2-AC11` อ่าน `.from("X").update(` **จากซอร์ส** · `.from(table)` ที่ `table` เป็นตัวแปร
     * มันมองไม่เห็น → เคสมีอยู่จริงแต่ถูกนับว่าไม่มี
     * 🎯 **นี่คือข้อจำกัดที่ตั้งใจไว้แบบนั้น:** ตัวนับที่ตามตัวแปรได้ ต้องเดา และ**ตัวนับที่เดาได้ = ตัวนับที่โกงได้**
     *    ทิศที่มันพลาดคือ **รายงานว่าครอบน้อยกว่าจริง** ซึ่งสั่งให้ไปทำงานเพิ่ม ไม่ใช่ปล่อยผ่าน
     */
    async function branchCase(
      label: string,
      was: string,
      // 📌 `PromiseLike` ไม่ใช่ `Promise` — query builder ของ supabase-js เป็น thenable
      //    ที่ยังไม่ถูก await จึงไม่มี `catch`/`finally` ให้ TypeScript เห็น
      write: (c: SupabaseClient, value: string) => PromiseLike<{ error: { message: string } | null }>,
      read: (c: SupabaseClient) => PromiseLike<{ data: Record<string, unknown> | null }>,
      mine = "แก้โดยเจ้าของ",
    ) {
      const col = label.split(".")[1];
      // ① ด้านบวก — ถ้าข้อนี้แดง เคสด้านลบข้างล่างไม่ได้พิสูจน์อะไร (`P-44`)
      const ok = await write(A, mine);
      expect(ok.error?.message ?? null, `เจ้าของแก้ ${label} ไม่ได้`).toBeNull();
      expect((await read(A)).data![col]).toBe(mine);

      // ② 🔴 viewer — **ต้องอ่านค่ากลับ ไม่ใช่ดู error**
      const byViewer = await write(C, was);
      expect(
        (await read(A)).data![col],
        `viewer แก้ ${label} ได้จริง (error = ${byViewer.error?.message ?? "ไม่มี"})\n` +
          "  🔴 อย่าเปลี่ยนเคสนี้ไปเช็ค error — `authenticated` มี column grant ครบ\n" +
          "     RLS กรองแถวออกเฉย ๆ **PostgREST คืนว่าสำเร็จกับการอัปเดต 0 แถว**",
      ).toBe(mine);

      // ③ คนนอก — แก้ไม่ได้ และต้องมองไม่เห็นแถวด้วย
      await write(B, was);
      expect((await read(A)).data![col], `คนนอกแก้ ${label} ได้`).toBe(mine);
      expect((await read(B)).data, `คนนอกอ่าน ${label} ของทริปที่ไม่ได้อยู่ได้`).toBeNull();
    }

    it("🔴 custom_places.update — เจ้าของแก้ได้ · viewer กับคนนอกแก้ไม่ได้", async () => {
      await branchCase(
        "custom_places.description",
        "เดิม",
        (c, v) => c.from("custom_places").update({ description: v }).eq("id", myU),
        (c) => c.from("custom_places").select("description").eq("id", myU).maybeSingle(),
      );
    });

    it("🔴 custom_place_names.update — เจ้าของแก้ได้ · viewer กับคนนอกแก้ไม่ได้", async () => {
      await branchCase(
        "custom_place_names.name",
        "ชื่อเดิม",
        (c, v) => c.from("custom_place_names").update({ name: v }).eq("place_id", myU),
        (c) => c.from("custom_place_names").select("name").eq("place_id", myU).maybeSingle(),
      );
    });

    it("🔴 place_notes.update — เจ้าของแก้ได้ · viewer กับคนนอกแก้ไม่ได้", async () => {
      await branchCase(
        "place_notes.note",
        "โน้ตเดิม",
        (c, v) => c.from("place_notes").update({ note: v }).eq("trip_id", tripU2),
        (c) => c.from("place_notes").select("note").eq("trip_id", tripU2).maybeSingle(),
      );
    });

    it("🔴 trip_hotels.update — เจ้าของแก้ได้ · viewer กับคนนอกแก้ไม่ได้", async () => {
      await branchCase(
        "trip_hotels.hotel_name",
        "โรงแรมเดิม",
        (c, v) => c.from("trip_hotels").update({ hotel_name: v }).eq("trip_id", tripU2),
        (c) => c.from("trip_hotels").select("hotel_name").eq("trip_id", tripU2).maybeSingle(),
      );
    });

    it("🔴 trip_day_plan_settings.update — เจ้าของแก้ได้ · viewer กับคนนอกแก้ไม่ได้", async () => {
      // 🔴 ค่าต้องผ่าน `check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`
      //    ฉบับแรกของเคสนี้ยัดสตริงภาษาไทยลงไปแล้วแดง — **และมันแดงถูก**
      //    (`23514` ไม่ใช่เรื่องสิทธิ์ · ถ้าไม่ดูให้ดีจะสรุปว่า "เจ้าของแก้ไม่ได้" ซึ่งผิด)
      await branchCase(
        "trip_day_plan_settings.start_time",
        "08:00",
        (c, v) => c.from("trip_day_plan_settings").update({ start_time: v }).eq("trip_day_id", dayU),
        (c) => c.from("trip_day_plan_settings").select("start_time").eq("trip_day_id", dayU).maybeSingle(),
        "09:30",
      );
    });

    it("🔴 trip_day_plan_settings.select — viewer อ่านได้ (กิ่งที่ไม่เคยถูกยิง) · คนนอกไม่ได้", async () => {
      // 🎯 กิ่งนี้ต่างจาก 5 ตัวข้างบน: เป็นกิ่ง **ด้านอ่าน** และ `viewer` ต้อง **ผ่าน**
      //    ถ้าไม่มีเคสนี้ `can_read_trip` พังแบบ "ปฏิเสธทุกคน" ได้โดยไม่มีอะไรแดง (`P-44`)
      const asViewer = await C.from("trip_day_plan_settings")
        .select("start_time, trip_day_id")
        .eq("trip_day_id", dayU);
      expect(asViewer.error?.message ?? null).toBeNull();
      expect(asViewer.data, "viewer อ่านการตั้งค่าของวันไม่ได้ — หน้าจอเขาจะไม่มีเวลาเริ่มวัน").toHaveLength(1);

      const asOutsider = await B.from("trip_day_plan_settings")
        .select("start_time")
        .eq("trip_day_id", dayU);
      expect(asOutsider.data, "คนนอกอ่านการตั้งค่าของทริปที่ไม่ได้อยู่ได้").toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 D81 — `trip_stops` รับเหตุการณ์: constraint ต้องกันครึ่งชุดและกันข้ามชนิด", () => {
    /**
     * `D81` ยุบ `day.events` เข้า `trip_stops` แทนที่จะสร้างตารางที่สาม — **+20 คอลัมน์ · 5 constraint**
     *
     * 🔴 **ทิศที่สำคัญที่สุดไม่ใช่ "เหตุการณ์เขียนได้ไหม" แต่คือ "แถวที่ไม่ใช่เหตุการณ์ ถือของของเหตุการณ์ได้ไหม"**
     * ถ้ารั่ว จุดแวะธรรมดาจะถือ `flight_no` ได้ แล้ว **หน้าที่พิมพ์เอกสารให้ ตม. จะอ่านเจอเที่ยวบิน
     * บนแถวที่ไม่ใช่เที่ยวบิน โดยไม่มีอะไรค้านเลยสักชั้น**
     *
     * 🎯 **และ "ครึ่งชุด" อันตรายกว่า "ไม่มีเลย"** — ฟิลด์บิน 3 จาก 5 ไม่ใช่ error ที่ไหนเลย
     * มันคือ**ช่องว่างที่ถูกพิมพ์ลงเอกสารจริง** · `flight_fields_complete` จึงบังคับ 5 หรือ 0 ไม่มีระหว่างกลาง
     *
     * ⚠️ **P1 ขอให้ผมไม่เชื่อเขาเป็นพิเศษที่ `event_flags_only_on_events`** เพราะ
     * `day_offset`/`is_alert`/`time_is_flexible` เป็น `not null default` → **`num_nonnulls` นับไม่ได้**
     * (`false` กับ `0` เป็นค่าที่ไม่ใช่ null) จึงต้องแยกเป็น check ตัวที่สอง
     * → ผมยิงทั้งสามคอลัมน์แยกกัน (`6a`–`6c`) **กันครบทั้งสาม** · และยิงฝั่งบวกว่าเหตุการณ์ยังตั้งค่าได้
     */
    const ccE = TEST_COUNTRY_CODES.stopEvents;
    let tripE = "", planE = "", dayE = "", catE = "";
    let rank = 100;

    const EV = { fixed_start_time: "08:00", title: "ทดสอบเหตุการณ์", icon: "✈️" };
    const FLIGHT = {
      flight_no: "VN409", flight_from_code: "BKK", flight_to_code: "ICN",
      flight_from_en: "Bangkok", flight_to_en: "Seoul",
    };
    const LAYOVER = {
      layover_baggage: "through-checked", layover_immigration: "none",
      layover_leaves_airport: false, layover_terminal_change: false,
    };

    beforeAll(async () => {
      await purgeCountry(ccE);
      await admin.from("catalog_countries").insert({ id: ccE, name_th: "ทดสอบเหตุการณ์", name_en: "EVT" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: ccE, name_th: "เมืองE", name_en: "CityE", lat: 35, lng: 129, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      const cp = await admin.from("catalog_places")
        .insert({ city_id: ci.data.id, category: "sight", lat: 35, lng: 129 })
        .select("id").single();
      if (cp.error) throw new Error(`seed place: ${cp.error.message}`);
      catE = cp.data.id as string;

      const t = await A.rpc("create_trip", {
        p_title: `evt-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripE = t.data.id as string;
      const pl = await A.from("trip_plans").select("id").eq("trip_id", tripE).eq("is_active", true).single();
      planE = pl.data!.id as string;
      const dy = await A.from("trip_days").insert({ trip_id: tripE, date: "2026-10-12" }).select("id").single();
      if (dy.error) throw new Error(`สร้างวัน: ${dy.error.message}`);
      dayE = dy.data.id as string;
    });

    afterAll(async () => {
      await admin.from("trips").delete().eq("id", tripE);
      const error = await purgeCountry(ccE);
      if (error) console.warn(`\n⚠️  เก็บกวาดคลังของบล็อก D81 ไม่สำเร็จ: ${error}\n`);
    });

    /** ยิง insert หนึ่งครั้ง แล้วเก็บกวาดถ้ามันผ่าน — **เคสข้างล่างเรียกตัวนี้ทุกตัว** (`E0` ข้อ 5) */
    async function attempt(row: Record<string, unknown>) {
      const r = await A.from("trip_stops")
        .insert({ trip_id: tripE, plan_id: planE, trip_day_id: dayE, rank: `r${rank++}`, ...row })
        .select("id");
      if (!r.error && r.data?.[0]) await admin.from("trip_stops").delete().eq("id", r.data[0].id as string);
      return r.error?.code ?? null;
    }

    // 🔴 ด้านบวกต้องมาก่อน — ถ้าเขียนเหตุการณ์ที่ถูกต้องไม่ได้เลย เคสด้านลบทั้งแผงจะเขียว
    //    เพราะ **ทุกอย่างถูกปฏิเสธ** ไม่ใช่เพราะ constraint แม่นยำ (`P-44`)
    describe("ด้านบวก — เหตุการณ์ที่ถูกต้องต้องเขียนได้", () => {
      it("เหตุการณ์ทั่วไป ไม่ต้องมี `event_kind` (มันเป็น optional จริง ๆ)", async () => {
        expect(await attempt({ kind: "event", ...EV })).toBeNull();
      });
      it("เที่ยวบินครบชุด 5 ฟิลด์", async () => {
        expect(await attempt({ kind: "event", ...EV, event_kind: "flight", ...FLIGHT })).toBeNull();
      });
      it("เหตุการณ์ตั้ง `day_offset`/`is_alert` ได้ (สิ่งที่ check ตัวที่สองต้องไม่ห้าม)", async () => {
        expect(await attempt({ kind: "event", ...EV, day_offset: 3, is_alert: true })).toBeNull();
      });
    });

    describe("🔴 ด้านลบ — แถวที่ไม่ใช่เหตุการณ์ ต้องถือของของเหตุการณ์ไม่ได้เลย", () => {
      it("จุดแวะธรรมดาถือ `flight_no` ไม่ได้", async () => {
        expect(
          await attempt({ kind: "place", catalog_place_id: catE, ...FLIGHT }),
          "จุดแวะธรรมดาถือเที่ยวบินได้ — เอกสารสำหรับ ตม. จะอ่านเจอโดยไม่มีอะไรค้าน",
        ).toBe("23514");
      });

      // 🔴 สามข้อนี้คือจุดที่ P1 บอกว่าตัวเองพลาดได้มากที่สุด — `num_nonnulls` มองไม่เห็นคอลัมน์
      //    ที่มี `not null default` จึงต้องมี check ตัวที่สองแยก · ยิงทีละคอลัมน์ ไม่ยิงรวม
      it.each(["day_offset", "is_alert", "time_is_flexible"])(
        "🔴 จุดแวะธรรมดาตั้ง `%s` ไม่ได้ (check ตัวที่สอง · `num_nonnulls` มองไม่เห็น)",
        async (col) => {
          const value = col === "day_offset" ? 1 : true;
          expect(
            await attempt({ kind: "place", catalog_place_id: catE, [col]: value }),
            `${col} หลุดจาก check ตัวที่สอง — คอลัมน์ที่มี default ไม่ถูก num_nonnulls นับ`,
          ).toBe("23514");
        },
      );
    });

    describe("🔴 ด้านลบ — ครึ่งชุด และข้ามชนิด", () => {
      it("เที่ยวบินครึ่งชุด (3 จาก 5) เขียนไม่ลง", async () => {
        expect(
          await attempt({
            kind: "event", ...EV, event_kind: "flight",
            flight_no: "VN1", flight_from_code: "BKK", flight_to_code: "ICN",
          }),
          "ครึ่งชุดผ่าน — **ช่องว่างจะถูกพิมพ์ลงเอกสารจริงโดยไม่มี error ที่ไหนเลย**",
        ).toBe("23514");
      });

      it("`event_kind='layover'` ใส่ฟิลด์เที่ยวบินไม่ได้ (else-branch ต้องบังคับ 0)", async () => {
        expect(await attempt({ kind: "event", ...EV, event_kind: "layover", ...LAYOVER, ...FLIGHT })).toBe("23514");
      });

      it("`event_kind='flight'` ใส่ฟิลด์ช่วงต่อเครื่องด้วยไม่ได้", async () => {
        expect(await attempt({ kind: "event", ...EV, event_kind: "flight", ...FLIGHT, ...LAYOVER })).toBe("23514");
      });

      it("🔴 `event_kind` ว่าง แต่ใส่ฟิลด์เที่ยวบินครบ ต้องเขียนไม่ลง", async () => {
        // `null = 'flight'` คืน NULL ไม่ใช่ true → ต้องตกไป else-branch ที่บังคับ 0
        // ⚠️ ถ้า CASE เขียนผิดจนคืน NULL ทั้งก้อน **check จะผ่าน** เพราะ NULL ไม่ใช่ false
        expect(
          await attempt({ kind: "event", ...EV, ...FLIGHT }),
          "เที่ยวบินไม่มีชนิดกำกับ — CASE คืน NULL แล้ว check ปล่อยผ่าน",
        ).toBe("23514");
      });

      it("เหตุการณ์ต้องมี `icon`/`title`/`fixed_start_time` ครบ", async () => {
        expect(await attempt({ kind: "event", fixed_start_time: "08:00", title: "x" })).toBe("23514");
      });

      it("เหตุการณ์ชี้สถานที่ได้ทางเดียว — `catalog_place_id` + `place_ref` พร้อมกันไม่ได้", async () => {
        expect(await attempt({ kind: "event", ...EV, catalog_place_id: catE, place_ref: "hotel" })).toBe("23514");
      });

      it("`kind='transfer'` ยังต้องมีสถานที่ 1 ที่เหมือนเดิม (D81 ไม่ได้ทำให้หลวมลง)", async () => {
        expect(await attempt({ kind: "transfer" })).toBe("23514");
      });
    });


    describe("🔴 คอลัมน์ที่ 21 ต้องถูกตัดสิน ไม่ใช่ถูกลืม", () => {
      /**
       * `event_columns_only_on_events` ระบุชื่อคอลัมน์ **17 ชื่อที่คนพิมพ์** · `event_flags_only_on_events` อีก 3
       * → **วันที่มีคอลัมน์ที่ 21 ไม่มีอะไรบังคับให้คนเติมชื่อลงไป** และรูปที่มันพังคือ
       *   *"คอลัมน์ใหม่ของเหตุการณ์ ไปโผล่บนจุดแวะธรรมดาได้"* — **รูเดิมที่ constraint นี้มีอยู่เพื่อปิดพอดี**
       *
       * 🔴 **ไม่ใช้ทะเบียน และเหตุผลเป็นของ P1:** ทะเบียนของทีมอีก 3 ตัวเป็นรายการของ*ข้อยกเว้น* โตช้ามาก
       * **ทะเบียนคอลัมน์จะเป็นรายการของ*ของปกติ*** → โตทุกครั้งที่มีงาน → กลายเป็นขั้นตอนที่คนลืม
       * แล้วจบที่ **คนเติมชื่อลงลิสต์เพื่อให้เขียว โดยไม่ได้ตัดสินอะไรเลย** ซึ่งคือสิ่งที่ทะเบียนมีไว้บังคับ
       *
       * ✅ **รูปที่ใช้แทน:** `คอลัมน์สดทั้งหมด − ชื่อที่ปรากฏใน constraint จริง − ลิสต์แช่แข็งก่อน D81 = ว่าง`
       *   ① **ลิสต์ที่เหลือไม่โตอีกแล้ว** — เป็นสภาพ ณ วันที่ `D81` ลง **ข้อเท็จจริงทางประวัติศาสตร์ ไม่ใช่ของที่ต้องดูแล**
       *   ② ฝั่ง "ของใหม่" อ่านจาก **constraint ที่บังคับจริง** ไม่ใช่จากลิสต์ที่คนพิมพ์ → `P-63`
       *   ③ **ทางเดียวที่ทำให้คอลัมน์ที่ 21 เขียวคือใส่มันเข้า check ตัวใดตัวหนึ่ง** = ตัดสินจริง
       *
       * 🎯 **คอลัมน์สดมาจากฐาน ไม่ใช่จากไฟล์** — คอลัมน์ที่ถูกเพิ่มจากแดชบอร์ดโดยไม่ผ่าน migration
       *   จะโผล่ที่นี่ และไม่มี constraint ไหนครอบมัน → **แดง** · ถ้าอ่านจากไฟล์ทั้งสองฝั่ง มันจะมองไม่เห็น
       */
      /** สภาพของ `trip_stops` **ก่อน** `D81` — แช่แข็ง ไม่ต้องอัปเดตอีก */
      const PRE_D81_COLUMNS = [
        "added_by_user", "catalog_place_id", "created_at", "custom_place_id", "deleted_at",
        "dwell_minutes", "id", "intercity_from", "intercity_mode", "intercity_to", "kind",
        "legacy_added_by", "note", "photo_path", "plan_id", "rank", "transfer_target_label",
        "transfer_target_time", "travel_mode", "trip_day_id", "trip_id", "updated_at",
        "updated_by_user", "visited_at",
      ] as const;

      it("🔴 ด้านบวกของ *ตัวจับ* — ชื่อที่ขึ้นต้นเหมือนกันต้องไม่ถูกนับว่าถูกครอบ", () => {
        /**
         * 🔴 **เคสนี้สำคัญกว่าเคสข้างล่าง** — จุดอ่อนของการจับชื่อในข้อความคือ substring
         * ถ้ามันจับแบบ substring `day_offset_extra` จะ "ถูกครอบ" เพราะ body มีคำว่า `day_offset`
         * → **คอลัมน์ใหม่ผ่านเงียบ ๆ ในทิศที่ P1 กลัวพอดี** และเคสข้างล่างจะเขียวตลอดกาล
         */
        const body = "kind = 'event' or (day_offset = 0 and not is_alert and not time_is_flexible)";
        const got = columnsNamedIn(body, ["day_offset", "day_offset_extra", "is_alert", "alert", "time_is_flexible"]);
        expect([...got].sort(), "ตัวจับนับชื่อที่ไม่ได้อยู่ใน constraint ว่าถูกครอบ").toEqual([
          "day_offset", "is_alert", "time_is_flexible",
        ]);
        expect(got.has("day_offset_extra"), "`day_offset_extra` ถูกนับว่าถูกครอบ เพราะจับแบบ substring").toBe(false);
        expect(got.has("alert"), "`alert` ถูกนับเพราะเป็นส่วนหนึ่งของ `is_alert`").toBe(false);
      });

      it("🔴 ทุกคอลัมน์ของ `trip_stops` ต้องถูกตัดสินแล้ว — ไม่มีตัวไหนหลุดทั้งสองฝั่ง", async () => {
        // ① คอลัมน์สดจากฐาน — ต้องมีแถวก่อน ไม่งั้นอ่านชื่อคอลัมน์ไม่ได้เลย (`P-21`)
        const row = await A.from("trip_stops")
          .insert({ trip_id: tripE, plan_id: planE, trip_day_id: dayE, rank: "col", kind: "event", ...EV })
          .select("*").single();
        expect(row.error?.message ?? null, "สร้างแถวตัวอย่างไม่ได้ — อ่านรายชื่อคอลัมน์สดไม่ได้").toBeNull();
        const live = Object.keys(row.data as Record<string, unknown>).sort();
        await admin.from("trip_stops").delete().eq("id", (row.data as { id: string }).id);
        expect(live.length, "อ่านคอลัมน์สดได้น้อยผิดปกติ").toBeGreaterThan(40);

        // ② constraint ที่บังคับจริง — ตามลำดับ `drop`/`add` (D81 drop แล้ว add ใหม่ในไฟล์เดียว)
        const colsBody = effectiveConstraint("trip_stops", "trip_stops_event_columns_only_on_events");
        const flagsBody = effectiveConstraint("trip_stops", "trip_stops_event_flags_only_on_events");
        expect(colsBody, "หา constraint `event_columns_only_on_events` ไม่เจอ").not.toBeNull();
        expect(flagsBody, "หา constraint `event_flags_only_on_events` ไม่เจอ").not.toBeNull();
        // ถ้า body ว่าง ตัวจับจะไม่ match อะไรเลย แล้วเคสจะแดงมั่ว — กันไว้ให้ข้อความบอกสาเหตุถูก
        expect(colsBody!.length, "body ของ constraint สั้นผิดปกติ").toBeGreaterThan(80);

        const covered = new Set([
          ...columnsNamedIn(colsBody!, live),
          ...columnsNamedIn(flagsBody!, live),
          ...PRE_D81_COLUMNS,
        ]);
        const undecided = live.filter((c) => !covered.has(c));

        expect(
          undecided,
          "มีคอลัมน์บน `trip_stops` ที่ไม่มี constraint ไหนครอบ และไม่ได้มีมาก่อน `D81`\n" +
            "  🔴 ถ้ามันเป็นคอลัมน์ของ *เหตุการณ์* → จุดแวะธรรมดาจะถือมันได้ **ซึ่งคือรูที่ constraint นี้มีอยู่เพื่อปิด**\n" +
            "  · ของเหตุการณ์ที่ nullable → ใส่ชื่อลงใน `event_columns_only_on_events`\n" +
            "  · ของเหตุการณ์ที่ `not null default` → ใส่ลงใน `event_flags_only_on_events`\n" +
            "    (**`num_nonnulls` มองไม่เห็นคอลัมน์ที่มี default** — `false`/`0` ไม่ใช่ null)\n" +
            "  · ไม่ใช่ของเหตุการณ์ → **มาคุยกัน** อย่าเติมลง `PRE_D81_COLUMNS` ลิสต์นั้นแช่แข็งแล้ว",
        ).toEqual([]);
      });
    });

    it("🔴 ย้ายแถวข้ามทริปด้วย `update` ไม่ได้ — `trip_id` ไม่อยู่ใน column grant ฝั่ง update", async () => {
      const mine = await A.from("trip_stops")
        .insert({ trip_id: tripE, plan_id: planE, trip_day_id: dayE, rank: "zz", kind: "event", ...EV })
        .select("id").single();
      expect(mine.error?.message ?? null).toBeNull();

      const other = await A.rpc("create_trip", {
        p_title: `evt2-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      const moved = await A.from("trip_stops").update({ trip_id: other.data.id }).eq("id", mine.data!.id);
      expect(
        moved.error?.code,
        "ย้ายจุดแวะข้ามทริปได้ — แถวจะโผล่ในทริปของคนอื่นโดย RLS ไม่ได้ถูกละเมิดสักข้อ",
      ).toBe("42501");

      await admin.from("trips").delete().eq("id", other.data.id);
      await admin.from("trip_stops").delete().eq("id", mine.data!.id);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 D56/E2 — `search_place_names()`: `invoker` ที่ไม่มีการตรวจสิทธิ์เลยสักบรรทัด", () => {
    /**
     * 🔴 **ฟังก์ชันนี้เป็น `security invoker` และ *ไม่มีโค้ดตรวจสิทธิ์อยู่ในตัวมันเลย***
     * มันพึ่ง RLS ของ `trip_stops` ล้วน ๆ ผ่าน `exists (...)` → **ถ้า RLS ไม่ครอบตรงไหน มันรั่วเงียบ**
     * · นั่นทำให้เคสแรกของบล็อกนี้ไม่ใช่เคสฟีเจอร์ **แต่เป็นเคสความปลอดภัย**
     *
     * 🎯 **และ `invoker` คือทางเลือกที่ถูกสำหรับฟังก์ชันชนิดนี้** — `definer` จะแปลว่าต้องเขียน
     * การตรวจสิทธิ์เองทุกบรรทัด แล้วเราจะได้แหล่งความจริงที่สองที่ต้องคอยให้ตรงกับ RLS (`P-15`)
     * · ราคาของมันคือ **ต้องมีเคสยืนยันว่า RLS ครอบจริง** ไม่ใช่เชื่อว่าครอบ
     *
     * ⚠️ **สองเจตนา (`identify`/`discover`) กลับทิศกันสองข้อ และผิดข้างแล้วยังดูปกติทั้งคู่:**
     * `picker_hidden` — `identify` ไม่กรอง (สนามบินคือจุดแวะจริง) · `discover` กรอง
     * ของที่อยู่ในทริปแล้ว — `identify` คืน (มันคือสิ่งที่ถาม) · `discover` ตัดออก
     */
    const ccR = TEST_COUNTRY_CODES.placeSearch;
    let tripR = "", cityR = "", inTrip = "", hiddenP = "", freeP = "", myR = "";

    beforeAll(async () => {
      await purgeCountry(ccR);
      await admin.from("catalog_countries").insert({ id: ccR, name_th: "ทดสอบค้นหา", name_en: "SRCH" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: ccR, name_th: "เมืองR", name_en: "CityR", lat: 35, lng: 129, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      cityR = ci.data.id as string;

      const mkPlace = async (pickerHidden: boolean, name: string) => {
        const p = await admin.from("catalog_places")
          .insert({ city_id: cityR, category: "sight", lat: 35, lng: 129, picker_hidden: pickerHidden })
          .select("id").single();
        if (p.error) throw new Error(`seed place: ${p.error.message}`);
        const n = await admin.from("catalog_place_names")
          .insert({ place_id: p.data.id, city_id: cityR, name, locale: "th" });
        if (n.error) throw new Error(`seed name: ${n.error.message}`);
        return p.data.id as string;
      };
      inTrip = await mkPlace(false, `ทงแดมุนในทริป ${stamp}`);
      hiddenP = await mkPlace(true, `ทงแดมุนซ่อน ${stamp}`);
      freeP = await mkPlace(false, `ทงแดมุนอิสระ ${stamp}`);

      const t = await A.rpc("create_trip", {
        p_title: `srch-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripR = t.data.id as string;
      const pl = await A.from("trip_plans").select("id").eq("trip_id", tripR).eq("is_active", true).single();
      const dy = await A.from("trip_days").insert({ trip_id: tripR, date: "2026-10-12" }).select("id").single();
      if (dy.error) throw new Error(`สร้างวัน: ${dy.error.message}`);
      const base = { trip_id: tripR, plan_id: pl.data!.id, trip_day_id: dy.data.id };

      await A.from("trip_stops").insert({ ...base, rank: "a", kind: "place", catalog_place_id: inTrip });
      const mp = await A.from("custom_places")
        .insert({ trip_id: tripR, city_id: cityR, category: "cafe", lat: 35.1, lng: 129.1 })
        .select("id").single();
      if (mp.error) throw new Error(`custom place: ${mp.error.message}`);
      myR = mp.data.id as string;
      await A.from("custom_place_names")
        .insert({ trip_id: tripR, place_id: myR, locale: "th", name: `ร้านลับ ${stamp}` });
      await A.from("trip_stops").insert({ ...base, rank: "b", kind: "place", custom_place_id: myR });
    });

    afterAll(async () => {
      await admin.from("trips").delete().eq("id", tripR);
      const error = await purgeCountry(ccR);
      if (error) console.warn(`\n⚠️  เก็บกวาดคลังของบล็อกค้นหาไม่สำเร็จ: ${error}\n`);
    });

    type Hit = { source: string; place_id: string };
    const search = async (
      c: SupabaseClient,
      args: Record<string, unknown>,
    ): Promise<{ rows: Hit[]; code: string | null }> => {
      const r = await c.rpc("search_place_names", { p_trip_id: tripR, ...args });
      return { rows: (r.data ?? []) as Hit[], code: r.error?.code ?? null };
    };

    it("🔴 ① คนนอกเรียกด้วย `p_trip_id` ของ A ต้องได้ 0 แถว — ฟังก์ชันไม่มีด่านของตัวเอง", async () => {
      const mine = await search(A, { p_query: "ทงแดมุน", p_intent: "identify" });
      // ด้านบวกต้องมาก่อน: ถ้าเจ้าของก็ได้ 0 เคสด้านลบไม่ได้พิสูจน์อะไร (`P-44`)
      expect(mine.rows.length, "เจ้าของค้นของตัวเองไม่เจอ — เคสด้านลบข้างล่างไม่มีความหมาย").toBeGreaterThan(0);

      const outsider = await search(B, { p_query: "ทงแดมุน", p_intent: "identify" });
      expect(
        outsider.rows,
        "คนนอกค้นเจอสถานที่ในทริปของคนอื่น\n" +
          "  🔴 ฟังก์ชันเป็น `invoker` และไม่มีการตรวจสิทธิ์ในตัวเลย — ถ้าข้อนี้แดง แปลว่า\n" +
          "     RLS ของ `trip_stops` ไม่ได้ครอบเส้นทางที่ `exists (...)` เดิน",
      ).toEqual([]);
    });

    it("🔴 ② `p_intent` ที่ไม่ใช่สองค่านั้น ต้อง raise ไม่ใช่คืน 0 แถว", async () => {
      // 🎯 0 แถวอ่านเหมือน "ไม่เจอ" — ซึ่งคือสิ่งที่คนเรียกจะเชื่อ แล้วเขียนจุดเรียกผิดต่อไปเงียบ ๆ
      for (const bad of ["nope", "", "IDENTIFY", null]) {
        const r = await search(A, { p_query: "ทงแดมุน", p_intent: bad });
        expect(r.code, `p_intent=${JSON.stringify(bad)} ไม่ raise — คืน ${r.rows.length} แถวแทน`).not.toBeNull();
      }
    });

    it("🔴 ③ `picker_hidden` — `discover` ต้องไม่คืน · `identify` ต้องคืน (กลับทิศกัน)", async () => {
      const disc = await search(A, { p_query: "ทงแดมุน", p_intent: "discover", p_city_id: cityR });
      expect(
        disc.rows.some((r) => r.place_id === hiddenP),
        "`discover` คืนสถานที่ที่ถูกซ่อนจากตัวเลือก",
      ).toBe(false);
      expect(disc.rows.some((r) => r.place_id === freeP), "`discover` ไม่คืนของที่ควรคืน").toBe(true);
    });

    it("🔴 ④ `discover` ตัดของที่อยู่ในทริปแล้วออก · `identify` ไม่ตัด", async () => {
      const disc = await search(A, { p_query: "ทงแดมุน", p_intent: "discover", p_city_id: cityR });
      expect(disc.rows.some((r) => r.place_id === inTrip), "`discover` เสนอของที่อยู่ในทริปแล้ว").toBe(false);

      const idf = await search(A, { p_query: "ทงแดมุน", p_intent: "identify" });
      expect(idf.rows.some((r) => r.place_id === inTrip), "`identify` ไม่คืนของที่อยู่ในทริป").toBe(true);
    });

    it("🔴 ⑤ `identify` ต้องเจอสถานที่ที่ผู้ใช้เพิ่มเอง ไม่ใช่แค่คลังกลาง", async () => {
      const r = await search(A, { p_query: "ร้านลับ", p_intent: "identify" });
      expect(
        r.rows.some((x) => x.source === "custom" && x.place_id === myR),
        "`identify` มองไม่เห็น custom place — *ทุกอย่างที่ทริปอ้างถึง* ต้องรวมของที่ผู้ใช้เพิ่มเองด้วย",
      ).toBe(true);
    });

    it("🔴 ⑥ จุดแวะที่ถูกลบแล้ว ต้องไม่นับว่า 'อยู่ในทริป' ทั้งสองขา", async () => {
      // สร้างจุดแวะชี้ `freeP` แล้วลบ → `discover` ต้องยังเสนอ `freeP` · `identify` ต้องไม่คืน
      const pl = await A.from("trip_plans").select("id").eq("trip_id", tripR).eq("is_active", true).single();
      const dy = await A.from("trip_days").select("id").eq("trip_id", tripR).limit(1).single();
      const st = await A.from("trip_stops")
        .insert({ trip_id: tripR, plan_id: pl.data!.id, trip_day_id: dy.data!.id, rank: "zzz", kind: "place", catalog_place_id: freeP })
        .select("id").single();
      expect(st.error?.message ?? null).toBeNull();

      const beforeDelete = await search(A, { p_query: "ทงแดมุน", p_intent: "discover", p_city_id: cityR });
      expect(beforeDelete.rows.some((r) => r.place_id === freeP), "ยังไม่ลบ แต่ `discover` ยังเสนออยู่").toBe(false);

      const del = await A.rpc("soft_delete_trip_stop", { p_id: st.data!.id });
      expect(del.error?.message ?? null).toBeNull();

      const afterDelete = await search(A, { p_query: "ทงแดมุน", p_intent: "discover", p_city_id: cityR });
      expect(
        afterDelete.rows.some((r) => r.place_id === freeP),
        "ลบจุดแวะแล้ว แต่ `discover` ยังไม่เสนอสถานที่นั้นกลับมา\n" +
          "  🔴 = แถวที่ผู้ใช้ลบไปแล้วยังบังคับพฤติกรรมอยู่ · ตระกูลเดียวกับที่พัก `D76` ที่กันช่วงวันตลอดกาล",
      ).toBe(true);

      const idf = await search(A, { p_query: "ทงแดมุน", p_intent: "identify" });
      expect(idf.rows.some((r) => r.place_id === freeP), "`identify` ยังคืนจุดแวะที่ถูกลบแล้ว").toBe(false);
    });

    it("🔴 ⑦ คำค้นว่าง/ช่องว่างล้วน ต้องได้ 0 แถว ไม่ใช่ทั้งคลัง", async () => {
      for (const q of ["", "   ", "\t"]) {
        const r = await search(A, { p_query: q, p_intent: "discover", p_city_id: cityR });
        expect(r.rows, `คำค้น ${JSON.stringify(q)} คืน ${r.rows.length} แถว`).toEqual([]);
      }
    });
    describe("🔴 `P-66` — อักขระของ LIKE ในคำค้น ต้องเป็น *ตัวอักษร* ไม่ใช่ *ไวลด์การ์ด*", () => {
      /**
       * บั๊กเดิม: `search_norm` ทำแค่ `lower` + `unaccent` แล้ว `q` ไปโผล่ใน `like '%'||q||'%'` ดิบ ๆ
       * → **ค้น `%` ได้คลังทั้งเมือง** · ด่าน *"คำค้นว่างต้องไม่คืนทั้งคลัง"* ถูกเดินอ้อมด้วยอักขระเดียว
       *
       * 🎯 **สิ่งที่ P1 จดไว้ และผมคิดว่าคมกว่าตัวบั๊ก:** คอมเมนต์เหนือด่านนั้นพูดถึง *ผลลัพธ์ที่จะกัน*
       * (*"คืนศูนย์แถว ไม่ใช่คืนทั้งคลัง"*) · โค้ดพูดถึง *ทางเดียวที่คนเขียนนึกออก* (สตริงว่าง)
       * **สองบรรทัดติดกัน ไม่มีอะไรขัดกัน — มันแค่ครอบไม่เท่ากัน** จึงมองไม่เห็นจากการอ่าน
       *
       * 🔴 **และเกณฑ์ที่ถูกไม่ใช่ *"ค้น `%` ต้องได้ 0 แถว"*** — นั่นจริงเฉพาะคลังที่บังเอิญไม่มีชื่อไหนมี `%`
       * (*"ลด 50% ร้าน"* เป็นชื่อร้านที่มีจริงได้) · **เกณฑ์ที่ถูกคือ: `%` ต้องหาเจอเฉพาะชื่อที่มี `%` จริง**
       * → บล็อกนี้จึง seed ชื่อที่มี `%` และ `_` ไว้ **เพื่อให้เคสแยก "escape ถูก" ออกจาก "บล็อกทิ้ง" ได้**
       */
      let pctPlace = "", undPlace = "";

      beforeAll(async () => {
        const mk = async (name: string) => {
          const p = await admin.from("catalog_places")
            .insert({ city_id: cityR, category: "sight", lat: 35, lng: 129 })
            .select("id").single();
          if (p.error) throw new Error(`seed: ${p.error.message}`);
          await admin.from("catalog_place_names")
            .insert({ place_id: p.data.id, city_id: cityR, name, locale: "th" });
          return p.data.id as string;
        };
        pctPlace = await mk(`ลด 50% ร้าน ${stamp}`);
        undPlace = await mk(`ร้าน_ลับ ${stamp}`);
      });

      it("🔴 `%` และ `_` ต้องไม่กวาดทั้งคลัง — ต้องเจอเฉพาะชื่อที่มีอักขระนั้นจริง", async () => {
        const pct = await search(A, { p_query: "%", p_intent: "discover", p_city_id: cityR });
        expect(
          pct.rows.map((r) => r.place_id),
          "ค้น `%` ได้มากกว่าชื่อที่มี `%` จริง — ไวลด์การ์ดยังทำงานอยู่",
        ).toEqual([pctPlace]);

        const und = await search(A, { p_query: "_", p_intent: "discover", p_city_id: cityR });
        expect(und.rows.map((r) => r.place_id), "ค้น `_` กวาดเกิน").toEqual([undPlace]);
      });

      it("🔴 ลำดับการ escape — `\\` ต้องถูกแทนก่อน `%`/`_` ไม่งั้นมันย้อนกลับเป็นไวลด์การ์ด", async () => {
        /**
         * 🎯 **เคสที่ยิงแค่ `'%'` ตัวเดียวจะเขียวแม้ลำดับผิด** — ต้องมีทั้ง `\` และ `%` ในสตริงเดียว
         * ถ้าแทน `%`→`\%` ก่อน แล้วค่อยแทน `\`→`\\` ตัว `\` ที่เพิ่งใส่จะโดนซ้ำเป็น `\\%`
         * = **หลุดกลับไปเป็นไวลด์การ์ด โดยที่เคสของบั๊กเดิมมองไม่เห็นเลย**
         */
        for (const q of ["\\%", "a\\%b_c", "\\", "\\_"]) {
          const r = await search(A, { p_query: q, p_intent: "discover", p_city_id: cityR });
          expect(r.rows, `คำค้น ${JSON.stringify(q)} คืน ${r.rows.length} แถว — ต้องไม่ตรงกับชื่อไหนเลย`).toEqual([]);
        }
      });

      it("🔴 ด้านบวก: ชื่อที่มี `%`/`_` จริง ต้องยัง **ค้นเจอ** — escape ไม่ใช่การบล็อก", async () => {
        // ถ้าทางแก้เป็น "ตัดอักขระทิ้ง" หรือ "ปฏิเสธคำค้นที่มีอักขระพวกนี้" เคสนี้จะแดง
        // และนั่นคือความต่างที่เคสด้านลบข้างบนแยกไม่ออกด้วยตัวเอง
        const byPct = await search(A, { p_query: "50%", p_intent: "discover", p_city_id: cityR });
        expect(byPct.rows.some((r) => r.place_id === pctPlace), "ค้นชื่อที่มี `%` จริงไม่เจอ").toBe(true);

        const byUnd = await search(A, { p_query: "ร้าน_ลับ", p_intent: "discover", p_city_id: cityR });
        expect(byUnd.rows.some((r) => r.place_id === undPlace), "ค้นชื่อที่มี `_` จริงไม่เจอ").toBe(true);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 Q6 — คำบรรยายสถานที่ 2 ใบ: คลังกลางเขียนไม่ได้เลย · ของทริปผูกสิทธิ์ทริป", () => {
    /**
     * `catalog_place_descriptions` — **ไม่มี policy ฝั่งเขียนเลยสักตัว** และไม่มี grant ฝั่งเขียน
     * รูปเดียวกับ `catalog_places`: **ปิดสองชั้น** (ไม่มี policy = RLS ปฏิเสธ · ไม่มี grant = ไม่ถึง RLS ด้วยซ้ำ)
     * · 🔴 **ต้องยิงทั้ง `insert`/`update`/`delete` แยกกัน** — ชั้นที่ปฏิเสธต่างกันให้รหัสต่างกัน
     *   และ *"ปฏิเสธเพราะไม่มีสิทธิ์"* กับ *"ปฏิเสธเพราะ RLS"* คนละกลไก **ถ้าวันหนึ่งมีคน `grant` กลับ
     *   ชั้นที่เหลือคือ RLS และเราต้องรู้ว่ามันยังอยู่**
     *
     * `custom_place_descriptions` — policy ครบ 4 ผูก `can_read_trip`/`can_write_trip`
     * ⚠️ **`update` ของตารางนี้ไม่มี error ให้ดูเมื่อถูกปฏิเสธ** (มี column grant · RLS กรองแถวออก)
     * → เคส viewer/คนนอกต้อง **อ่านค่ากลับ** ไม่ใช่เช็ค error · เหมือน 5 กิ่งที่ตัวนับ `E2-AC11` เจอ
     */
    const ccG = TEST_COUNTRY_CODES.descriptions;
    let tripG = "", cityG = "", catG = "", myG = "";

    beforeAll(async () => {
      await purgeCountry(ccG);
      await admin.from("catalog_countries").insert({ id: ccG, name_th: "ทดสอบคำบรรยาย", name_en: "DESC" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: ccG, name_th: "เมืองG", name_en: "CityG", lat: 35, lng: 129, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      cityG = ci.data.id as string;
      const cp = await admin.from("catalog_places")
        .insert({ city_id: cityG, category: "sight", lat: 35, lng: 129 })
        .select("id").single();
      if (cp.error) throw new Error(`seed place: ${cp.error.message}`);
      catG = cp.data.id as string;
      const cd = await admin.from("catalog_place_descriptions")
        .insert({ place_id: catG, locale: "th", description: `คำบรรยายกลาง ${stamp}` });
      if (cd.error) throw new Error(`seed catalog desc: ${cd.error.message}`);

      const t = await A.rpc("create_trip", {
        p_title: `desc-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripG = t.data.id as string;
      // `C` เป็น viewer · `B` เป็นคนนอกโดยตั้งใจ
      const inv = await A.from("trip_members").insert({ trip_id: tripG, user_id: ids.c, role: "viewer" });
      if (inv.error) throw new Error(`เชิญ C: ${inv.error.message}`);

      const mp = await A.from("custom_places")
        .insert({ trip_id: tripG, city_id: cityG, category: "cafe", lat: 35.1, lng: 129.1 })
        .select("id").single();
      if (mp.error) throw new Error(`custom place: ${mp.error.message}`);
      myG = mp.data.id as string;
    });

    afterAll(async () => {
      await admin.from("trips").delete().eq("id", tripG);
      await admin.from("catalog_places").delete().eq("id", catG);
      const error = await purgeCountry(ccG);
      if (error) console.warn(`\n⚠️  เก็บกวาดคลังของบล็อกคำบรรยายไม่สำเร็จ: ${error}\n`);
    });

    describe("`catalog_place_descriptions` — อ่านได้ทุกคน เขียนไม่ได้เลย", () => {
      it("ด้านบวก: ผู้ใช้ที่ล็อกอินอ่านคำบรรยายกลางได้", async () => {
        const r = await C.from("catalog_place_descriptions").select("description").eq("place_id", catG);
        expect(r.error?.message ?? null).toBeNull();
        expect(r.data, "คลังกลางอ่านไม่ได้ — เคสด้านลบข้างล่างจะไม่ได้พิสูจน์อะไร").toHaveLength(1);
      });

      it("🔴 เขียนคลังกลางไม่ได้ทั้ง 3 verb — ยิงแยกเพราะชั้นที่ปฏิเสธต่างกัน", async () => {
        const ins = await A.from("catalog_place_descriptions")
          .insert({ place_id: catG, locale: "en", description: "hacked" });
        expect(ins.error?.code, "ไคลเอนต์เพิ่มคำบรรยายลงคลังกลางได้").toBe("42501");

        const upd = await A.from("catalog_place_descriptions")
          .update({ description: "hacked" }).eq("place_id", catG);
        expect(upd.error?.code, "ไคลเอนต์แก้คำบรรยายของคลังกลางได้").toBe("42501");

        const del = await A.from("catalog_place_descriptions").delete().eq("place_id", catG);
        expect(del.error?.code, "ไคลเอนต์ลบคำบรรยายของคลังกลางได้").toBe("42501");

        // แถวต้องยังอยู่ครบหลังลองทั้งสามทาง
        const still = await admin.from("catalog_place_descriptions").select("description").eq("place_id", catG);
        expect(still.data, "แถวหายไปทั้งที่ทุก verb ถูกปฏิเสธ").toHaveLength(1);
      });

      it("🔴 `anon` ไม่ได้อะไรเลย", async () => {
        const r = await D.from("catalog_place_descriptions").select("description").eq("place_id", catG);
        // คลังกลางเปิดให้ `authenticated` เท่านั้น — `anon` ต้องไม่เห็น
        expect(r.data ?? [], "anon อ่านคลังกลางได้").toEqual([]);
      });
    });

    describe("`custom_place_descriptions` — ผูกกับสิทธิ์ของทริป", () => {
      it("ด้านบวก: เจ้าของเพิ่มและแก้คำบรรยายของสถานที่ตัวเองได้", async () => {
        const ins = await A.from("custom_place_descriptions")
          .insert({ trip_id: tripG, place_id: myG, locale: "th", description: `เดิม ${stamp}` });
        expect(ins.error?.message ?? null, "เจ้าของเพิ่มไม่ได้").toBeNull();

        const upd = await A.from("custom_place_descriptions")
          .update({ description: `แก้แล้ว ${stamp}` }).eq("place_id", myG).eq("locale", "th");
        expect(upd.error?.message ?? null).toBeNull();

        const back = await A.from("custom_place_descriptions")
          .select("description").eq("place_id", myG).eq("locale", "th").single();
        expect(back.data!.description).toBe(`แก้แล้ว ${stamp}`);
      });

      it("🔴 viewer อ่านได้ แต่แก้ไม่ได้ — **ต้องอ่านค่ากลับ ไม่ใช่ดู error**", async () => {
        const seen = await C.from("custom_place_descriptions").select("description").eq("place_id", myG);
        expect(seen.data, "viewer อ่านคำบรรยายของทริปที่ตัวเองอยู่ไม่ได้").toHaveLength(1);

        const byViewer = await C.from("custom_place_descriptions")
          .update({ description: "แก้โดย viewer" }).eq("place_id", myG).eq("locale", "th");
        const after = await A.from("custom_place_descriptions")
          .select("description").eq("place_id", myG).eq("locale", "th").single();
        expect(
          after.data!.description,
          `viewer แก้ได้จริง (error = ${byViewer.error?.message ?? "ไม่มี"})\n` +
            "  🔴 อย่าเปลี่ยนไปเช็ค error — มี column grant · RLS กรองแถวออกเฉย ๆ แล้วคืนว่าสำเร็จ",
        ).toBe(`แก้แล้ว ${stamp}`);
      });

      it("🔴 viewer เพิ่มและลบไม่ได้", async () => {
        const ins = await C.from("custom_place_descriptions")
          .insert({ trip_id: tripG, place_id: myG, locale: "en", description: "viewer" });
        expect(ins.error?.code, "viewer เพิ่มคำบรรยายได้").toBe("42501");

        await C.from("custom_place_descriptions").delete().eq("place_id", myG).eq("locale", "th");
        const still = await A.from("custom_place_descriptions").select("locale").eq("place_id", myG);
        expect(still.data, "viewer ลบคำบรรยายได้ — วัดจากจำนวนแถว ไม่ใช่จาก error").toHaveLength(1);
      });

      it("🔴 คนนอกไม่เห็นและแตะไม่ได้เลย", async () => {
        const seen = await B.from("custom_place_descriptions").select("description").eq("place_id", myG);
        expect(seen.data ?? [], "คนนอกเห็นคำบรรยายของทริปที่ไม่ได้อยู่").toEqual([]);

        const ins = await B.from("custom_place_descriptions")
          .insert({ trip_id: tripG, place_id: myG, locale: "ja", description: "คนนอก" });
        expect(ins.error?.code).toBe("42501");

        await B.from("custom_place_descriptions").delete().eq("place_id", myG);
        const still = await A.from("custom_place_descriptions").select("locale").eq("place_id", myG);
        expect(still.data, "คนนอกลบคำบรรยายของทริปคนอื่นได้").toHaveLength(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2-AC1 — คนนอกอ่านอะไรของทริป A ไม่ได้เลย **ทุกตารางที่ผูกกับทริป**", () => {
    /**
     * **`US-E2` เขียนไว้ตรงตัว:** *"ในฐานะผู้ใช้ C ฉันต้องไม่สามารถอ่านหรือแก้อะไรของทริป A ได้เลย
     * ไม่ว่าจะพยายามทางไหน"* — บล็อกนี้คือข้อนั้น กวาดทีเดียวทุกตาราง
     *
     * 🎯 **รายชื่อตารางมาจาก *คุณสมบัติของสคีมา* ไม่ใช่จากรายชื่อที่พิมพ์ไว้** — "มีคอลัมน์ `trip_id`"
     *    → ตารางเนื้อหาตัวใหม่ของ `E3`/`E5` เข้ารายการเองทันที **และเคสนี้จะแดงจนกว่าจะมีคนวาง fixture ให้**
     *    ถ้าใช้รายชื่อที่พิมพ์ไว้ ตารางใหม่จะได้รับการยกเว้นฟรีจากการที่ไม่มีใครนึกถึง (`P-21`)
     *
     * 🔴 **เคสด้านบวกไม่ใช่ของแถม มันคือเงื่อนไขที่ทำให้เคสด้านลบมีความหมาย**
     *    `C` เห็น 0 แถว **อ่านได้สองแบบเสมอ**: *"RLS กันได้"* หรือ *"ไม่มีข้อมูลให้เห็นตั้งแต่แรก"*
     *    → ทุกตารางต้องผ่าน **A เห็น ≥1 แถว ในวินาทีเดียวกัน** ก่อน ไม่งั้นถือว่า**สรุปไม่ได้ ไม่ใช่ผ่าน**
     *
     * ⚠️ **ครอบเฉพาะ `select`** — และเป็นการเลือกที่ตั้งใจ ไม่ใช่ความขี้เกียจ:
     *    `insert`/`update` แบบกวาดต้องส่ง payload ที่ถูกต้องของแต่ละตาราง · payload ผิดจะได้
     *    `PGRST204`/`42703`/`23502` ซึ่ง **ไม่ใช่คำตอบเรื่องสิทธิ์** แล้วเคสจะเขียวด้วยเหตุผลที่ผิด
     *    (ผมเคยรายงานผิดด้วยรูปนี้มาแล้วจริง) → ฝั่งเขียนถูกครอบรายตารางในบล็อกอื่นด้วย payload จริง
     */
    const ccS = TEST_COUNTRY_CODES.outsiderSweep;
    const SCOPED = tripScopedTables();
    let tripS = "";

    beforeAll(async () => {
      await purgeCountry(ccS);
      await admin.from("catalog_countries").insert({ id: ccS, name_th: "ทดสอบกวาด", name_en: "SWP" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: ccS, name_th: "เมืองS", name_en: "CityS", lat: 35, lng: 129, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      const cp = await admin.from("catalog_places")
        .insert({ city_id: ci.data.id, category: "sight", lat: 35, lng: 129 })
        .select("id").single();
      if (cp.error) throw new Error(`seed place: ${cp.error.message}`);

      const t = await A.rpc("create_trip", {
        p_title: `sweep-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripS = t.data.id as string;

      // `trip_members` + `trip_plans` ถูกสร้างโดย `create_trip` แล้ว
      const pl = await A.from("trip_plans").select("id").eq("trip_id", tripS).eq("is_active", true).single();
      if (pl.error) throw new Error(`หาแผน: ${pl.error.message}`);
      const planS = pl.data.id as string;
      const dy = await A.from("trip_days").insert({ trip_id: tripS, date: "2026-10-12" }).select("id").single();
      if (dy.error) throw new Error(`สร้างวัน: ${dy.error.message}`);
      const dayS = dy.data.id as string;
      const mp = await A.from("custom_places")
        .insert({ trip_id: tripS, city_id: ci.data.id, category: "cafe", lat: 35.1, lng: 129.1 })
        .select("id").single();
      if (mp.error) throw new Error(`custom place: ${mp.error.message}`);
      const myS = mp.data.id as string;

      const rows: Array<[string, Record<string, unknown>]> = [
        ["trip_day_plan_settings", { trip_id: tripS, plan_id: planS, trip_day_id: dayS, start_time: "08:00" }],
        ["custom_place_names", { trip_id: tripS, place_id: myS, locale: "th", name: `ชื่อ ${stamp}` }],
        ["custom_place_descriptions", { trip_id: tripS, place_id: myS, locale: "th", description: `คำบรรยาย ${stamp}` }],
        ["trip_stops", { trip_id: tripS, plan_id: planS, trip_day_id: dayS, kind: "place", custom_place_id: myS, rank: "m" }],
        ["place_notes", { trip_id: tripS, plan_id: planS, custom_place_id: myS, note: `โน้ต ${stamp}` }],
        ["hidden_places", { trip_id: tripS, catalog_place_id: cp.data.id }],
        ["checklist_items", { trip_id: tripS, text: `รายการ ${stamp}` }],
        ["bookings", { trip_id: tripS, category: "flight", title: `เที่ยวบิน ${stamp}` }],
        ["trip_hotels", {
          trip_id: tripS, city_id: ci.data.id, hotel_name: `โรงแรม ${stamp}`,
          check_in: "2026-10-12", check_out: "2026-10-14",
        }],
      ];
      for (const [table, row] of rows) {
        const { error } = await A.from(table).insert(row);
        if (error) throw new Error(`seed ${table}: ${error.message}`);
      }
    });

    afterAll(async () => {
      // 🔴 ลบลูกก่อนพ่อ — `catalog_places → catalog_cities → catalog_countries` เป็น `on delete restrict`
      //    ฉบับแรกของบล็อกนี้เขียน `.eq("city_id", null)` ซึ่ง**ลบอะไรไม่ได้เลย** → เมืองลบไม่ออก
      //    → ประเทศลบไม่ออก → รอบถัดไปชนคีย์ซ้ำที่ `beforeAll` **แล้วทั้งบล็อกจะขึ้นเป็น "ข้าม"**
      //    🎯 **`console.warn` ตัวนี้เองที่จับมันได้** — ถ้าเขียน `.catch(() => {})` จะเงียบจนกว่าจะพังรอบหน้า
      await admin.from("trips").delete().eq("id", tripS);
      const error = await purgeCountry(ccS);
      if (error) console.warn(`\n⚠️  เก็บกวาดคลังของบล็อกกวาดไม่สำเร็จ: ${error}\n`);
    });

    it("🔴 ตารางที่ผูกกับทริปทุกใบต้องมี fixture — ตารางใหม่ต้องแดง ไม่ใช่ถูกข้าม", async () => {
      const empty: string[] = [];
      for (const t of SCOPED) {
        const { data, error } = await A.from(t).select("trip_id").eq("trip_id", tripS).limit(1);
        if (error || !data || data.length === 0) empty.push(`${t}${error ? ` (${error.code})` : ""}`);
      }
      expect(
        empty,
        "ตารางที่ผูกกับทริป แต่บล็อกนี้ไม่มีแถวให้คนนอกลอง\n" +
          "  🔴 **`C เห็น 0 แถว` บนตารางว่าง ไม่ได้พิสูจน์อะไรเลย** — เคสข้างล่างจะเขียวฟรี\n" +
          "  → ถ้าเพิ่งเพิ่มตารางที่มี `trip_id` ให้เติม fixture ใน `beforeAll` ของบล็อกนี้",
      ).toEqual([]);
    });

    it("🔴 คนนอกอ่านทุกตารางที่ผูกกับทริป ต้องได้ 0 แถว", async () => {
      /**
       * 🔴 **เคสนี้ตรวจ fixture ของตัวเอง *ในรอบเดียวกับที่ยิงคนนอก* ไม่พึ่งเคสข้างบน** (`P-67`)
       *
       * ฉบับแรกพึ่งเคส *"ทุกตารางต้องมี fixture"* ที่รันก่อนหน้า · P1 ชี้ช่องที่ตามมา:
       * **ถ้า fixture หายไป *ระหว่าง* สองเคส เคสนี้จะเขียว เพราะตารางว่าง ไม่ใช่เพราะ RLS กันได้**
       * และมันเกิดขึ้นได้จริง ไม่ใช่ทฤษฎี — เรารันชุดสดพร้อมกันใส่ `engine-dev` ใบเดียวกัน
       * `beforeAll` ของอีกรอบล้างคลังตามรหัสประเทศที่ **ตายตัวต่อบล็อก** จึงลบของรอบนี้ทิ้งกลางคัน
       *
       * 🎯 **รอบที่เจอจริงได้ *แดงปลอม* ซึ่งเสียเวลาแต่ไม่มีใครเชื่อผิด**
       *    **ทิศที่อันตรายคือทิศตรงข้าม และมันเงียบสนิท** — นี่คือกับดักที่หัวบล็อกนี้เตือนตัวเองไว้เป๊ะ
       *    (*"`C เห็น 0 แถว` บนตารางว่าง ไม่ได้พิสูจน์อะไรเลย"*) แค่มาจากสาเหตุที่ไม่มีใครคิดถึงตอนเขียน
       */
      const leaked: string[] = [];
      for (const t of SCOPED) {
        // ① เจ้าของต้องยังเห็นแถว **ณ วินาทีเดียวกัน** — ถ้าไม่เห็น ผลของ ② ไม่มีความหมาย
        const mine = await A.from(t).select("trip_id").eq("trip_id", tripS);
        if (mine.error) {
          leaked.push(`${t} → เจ้าของอ่านไม่ได้: ${mine.error.code} — สรุปไม่ได้ ไม่ใช่ผ่าน`);
          continue;
        }
        if ((mine.data ?? []).length === 0) {
          leaked.push(
            `${t} → fixture หายไประหว่างเคส · **ผลของตารางนี้สรุปไม่ได้**\n` +
              "       (มีคนรันชุดสดซ้อนอยู่หรือเปล่า — `P-67`)",
          );
          continue;
        }

        // ② คนนอกต้องไม่เห็นอะไรเลย
        const { data, error } = await C.from(t).select("trip_id").eq("trip_id", tripS);
        // 🔴 `42501` (ไม่มีสิทธิ์) ก็ยอมรับได้ — แต่ **error อื่นคือ "ตอบไม่ได้" ไม่ใช่ "กันได้"**
        if (error && error.code !== "42501") leaked.push(`${t} → ตอบไม่ได้: ${error.code} ${error.message}`);
        else if (data && data.length > 0) leaked.push(`${t} → คนนอกเห็น ${data.length} แถว`);
      }
      expect(
        leaked,
        "คนนอกอ่านข้อมูลของทริปที่ไม่ได้อยู่ได้ — **นี่คือข้อความของ `US-E2` ทั้งประโยค**",
      ).toEqual([]);
    });

    it("🔴 คนนอกอ่านทริปเองไม่ได้ · และ anon ก็ไม่ได้", async () => {
      // `trips` ไม่มีคอลัมน์ `trip_id` (มันคือ `id`) จึงไม่อยู่ในรายการกวาด — ต้องมีเคสของตัวเอง
      expect((await A.from("trips").select("id").eq("id", tripS)).data, "เจ้าของอ่านทริปตัวเองไม่ได้").toHaveLength(1);
      expect((await C.from("trips").select("id").eq("id", tripS)).data, "คนนอกเห็นทริปของ A").toEqual([]);
      expect((await D.from("trips").select("id").eq("id", tripS)).data ?? [], "anon เห็นทริปของ A").toEqual([]);
    });

    it("🔴 คนนอกลบแถวของทริป A ไม่ได้สักตาราง — และแถวต้องยังอยู่ครบหลังลอง", async () => {
      // ฝั่ง `delete` กวาดได้จริงโดยไม่ต้องมี payload (ต่างจาก insert/update) จึงครอบตรงนี้ได้เลย
      /**
       * 🔴 **นับต้องแยก "อ่านไม่ได้" ออกจาก "ไม่มีแถว" — ผมเขียนพลาดข้อนี้เองในฉบับแรก**
       * ฉบับแรกใช้ `(...).data ?? []` → **การอ่านที่ล้ม (timeout · เน็ตสะดุด) ให้ `data: null`
       * แล้วกลายเป็น `0` แล้วเคสจะรายงานว่า "คนนอกลบข้อมูลได้"** ทั้งที่ไม่มีใครลบอะไรเลย
       * · เกิดขึ้นจริง: `hidden_places: 1 → 0` แดงหนึ่งครั้งในชุดเต็ม **แต่รันบล็อกเดี่ยวผ่านทุกครั้ง**
       * 🎯 **เป็นกับดักตัวเดียวกับที่ผมเตือน P1 เรื่อง `custom_places` (`data: null` จากไม่มีสิทธิ์
       *    หน้าตาเหมือน `data: null` จากไม่มีแถว) — และผมเดินเข้าไปเองในไฟล์ของตัวเอง**
       * → รายงานผิดทิศที่แย่ที่สุด: **ส่งคนไปตามล่าช่องโหว่ที่ไม่มีอยู่จริง**
       */
      const count = async (t: string): Promise<number> => {
        const r = await A.from(t).select("trip_id").eq("trip_id", tripS);
        if (r.error) throw new Error(`อ่าน ${t} ไม่ได้: ${r.error.code} ${r.error.message}`);
        return (r.data ?? []).length;
      };

      const before = new Map<string, number>();
      for (const t of SCOPED) before.set(t, await count(t));
      for (const t of SCOPED) await C.from(t).delete().eq("trip_id", tripS);

      const damaged: string[] = [];
      for (const t of SCOPED) {
        const after = await count(t);
        if (after !== before.get(t)) damaged.push(`${t}: ${before.get(t)} → ${after}`);
      }
      expect(
        damaged,
        "คนนอกลบข้อมูลของทริปที่ไม่ได้อยู่ได้\n" +
          "  🔴 **อ่านจำนวนแถวกลับ ไม่ใช่ดู error** — `delete` ที่ RLS กรองแถวออกหมด\n" +
          "     คืนว่า **สำเร็จ** กับการลบ 0 แถว ไม่มี error ให้ดูเลยสักตัว",
      ).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2-AC11 — ถามฐานว่าประตูบานไหนเปิดอยู่ (`table_exposure`)", () => {
    /**
     * ด่านที่อ่านไฟล์ migration จับได้ทุกอย่างที่**ถูกเขียนลงไฟล์** และนั่นคือขอบเขตของมัน
     * P7 ชี้ 2 บานที่ไฟล์มองไม่เห็นตามนิยาม: **view ที่ไม่ตั้ง `security_invoker`**
     * (รันด้วยสิทธิ์เจ้าของ → ข้าม `revoke` ทั้งชุด) และ **สมาชิกภาพใน publication**
     * (เพิ่มจาก dashboard ได้โดยไม่ผ่านไฟล์สักไฟล์ → รีวิว migration มองไม่เห็นตลอดกาล)
     *
     * 🔴 **เกณฑ์ผ่านไม่ใช่ "0 แถว"** — ประโยคนั้นเคยอยู่ในคอมเมนต์ของฟังก์ชันและมัน**เท็จ**
     * `service_role` มีสิทธิ์บนแคชจริง ๆ (ข้อยกเว้นที่ 5) และมันควรโผล่มา
     * → เกณฑ์คือ **ไม่มีแถวที่ `grantee` เป็น `anon`/`authenticated`/`PUBLIC` และไม่มีแถว `MISSING`**
     */
    const CACHES = [
      "place_details_cache",
      "place_details_local_cache",
      "place_photo_cache",
      "travel_time_cache",
    ];
    const CLIENT_ROLES = ["anon", "authenticated", "PUBLIC"];
    type Door = { table_name: string; door: string; grantee: string; detail: string };

    const exposure = async (tables: string[]): Promise<Door[]> => {
      const { data, error } = await admin.rpc("table_exposure", { p_tables: tables });
      if (error) throw new Error(`เรียก table_exposure ไม่ได้: ${error.message}`);
      return data as Door[];
    };

    it("🔴 แคช 4 ใบ — ไม่มีประตูสำหรับไคลเอนต์เลยสักบาน ทั้ง 5 ทาง", async () => {
      const rows = await exposure(CACHES);
      const open = rows.filter((r) => CLIENT_ROLES.includes(r.grantee));
      expect(
        open.map((r) => `${r.table_name} · ${r.door} · ${r.grantee} · ${r.detail}`),
        "มีทางเข้าถึงแคชจากฝั่งไคลเอนต์\n" +
          "  · `view` = มีคนสร้าง view ทับโดยไม่ตั้ง `security_invoker` (P7 บาน ③)\n" +
          "  · `publication` = มีคนกดเพิ่มเข้า Realtime จาก dashboard (P7 บาน ④)\n" +
          "  · `column-grant` = ลอกรูป `grant insert (col, …)` ของตารางอื่นมาใส่แคช",
      ).toEqual([]);
    });

    it("🔴 ไม่มีชื่อไหนเป็น `MISSING` — ไม่งั้นเคสข้างบนตรวจตารางที่ไม่มีอยู่", async () => {
      const rows = await exposure(CACHES);
      expect(
        rows.filter((r) => r.door === "MISSING").map((r) => r.table_name),
        "ชื่อตารางในเคสนี้ resolve ไม่ได้ — พิมพ์ผิด หรือถูก rename ไปแล้ว\n" +
          "  🔴 ก่อนมี `MISSING` ทั้งสองกรณีคืน 0 แถว **ซึ่งอ่านเป็น 'ปิดสนิท'**",
      ).toEqual([]);
    });

    it("🔴 ด้านบวกของสัญญาณเตือน — ชื่อที่ไม่มีอยู่ ต้องดัง ไม่ใช่เงียบ", async () => {
      // `P-21` — ถ้าตัวเตือนพัง เคสข้างบนจะเขียวตลอดกาลโดยไม่มีใครรู้
      const ghost = `ตารางที่ไม่มีจริง_${stamp}`;
      const rows = await exposure([ghost]);
      expect(rows).toHaveLength(1);
      expect(rows[0].door, "ชื่อที่ resolve ไม่ได้กลับเงียบ = ด่านนี้ตรวจความว่างเปล่า").toBe("MISSING");
    });

    it("ด้านบวก: `catalog_places` ต้องเห็นประตูของ `authenticated` จริง", async () => {
      // ตารางที่ **ควร** เปิดให้อ่าน — ถ้าตรงนี้ว่าง แปลว่าตัวตรวจคืนว่างเสมอ
      const rows = await exposure(["catalog_places"]);
      expect(
        rows.filter((r) => r.grantee === "authenticated").length,
        "คลังสาธารณะไม่มีประตูให้ `authenticated` เลย → ตัวตรวจไม่ได้ตรวจ หรือคลังอ่านไม่ได้จริง",
      ).toBeGreaterThan(0);
    });

    it("🔴 สิทธิ์ของ `service_role` บนแคช = 3 verb เป๊ะตามข้อยกเว้นที่ 5", async () => {
      /**
       * 🎯 **เคสนี้ตรึงบทเรียนว่า `grant` คือการ *เพิ่ม* ไม่ใช่การ *กำหนด***
       * ข้อยกเว้นที่ 5 เขียน `select, insert, delete` · คำสั่ง `grant` ก็เขียนตามนั้นถูก
       * แต่ Supabase แจกสิทธิ์พื้นฐานให้ `service_role` ตอน `create table` อยู่แล้ว
       * → ถ้าไม่ `revoke` ก่อน ของจริงจะมากกว่าที่ทะเบียนเขียนไว้ **โดยไม่มีบรรทัดไหนผิด**
       * ⚠️ **ห้ามอ่านจำนวนแทนรายการ** — `7` ไม่ใช่ `ALL` (`ALL` = 8 เพราะมี `UPDATE`)
       *    การนับตัวเลขทำให้สรุปผิดได้ทั้งสองทิศ **ลิสต์ชื่อเท่านั้นที่ตอบได้**
       */
      const rows = await exposure(CACHES);
      for (const t of CACHES) {
        const verbs = rows
          .filter((r) => r.table_name === t && r.grantee === "service_role" && r.door === "grant")
          .map((r) => r.detail)
          .sort();
        expect(
          verbs,
          `${t}: สิทธิ์ของ service_role ไม่ตรงกับข้อยกเว้นที่ 5 ที่จดไว้ใน TEAM.md\n` +
            "  · **มีเกิน** → `grant` ถูกใช้โดยไม่ `revoke all from service_role` ก่อน\n" +
            "    ระวัง `TRUNCATE`: มัน **ข้าม RLS · ข้าม policy · ไม่ยิง row trigger** และฐานนี้ไม่มี PITR\n" +
            "  · **มีขาด** → ชุดทดสอบวาง fixture ของตัวเองไม่ได้ แล้วเคสแคชจะเขียวเพราะตารางว่าง",
        ).toEqual(["DELETE", "INSERT", "SELECT"]);
      }
    });
    it("🔴 ไม่มีตารางไหนใน `public` ที่ `service_role` ยัง `TRUNCATE` ได้ (P7)", async () => {
      /**
       * `TRUNCATE` **ไม่ยิง row trigger สักตัว** · ข้าม RLS · ข้าม policy · ข้าม `force row level security`
       * · ไม่เหลือ tombstone · และฐานนี้ **ไม่มี PITR**
       * 🔴 P7 ชี้ตัวอย่างที่จบเรื่อง: `truncate public.trip_days cascade` **ลบจุดแวะทั้งฐาน
       *    โดยด่าน `D73` ไม่ทำงานสักครั้ง** — ด่านที่เขียนมาเพื่อกันเรื่องนี้พอดี
       *
       * 🎯 **รายชื่อตารางมาจากไฟล์ในทรี ไม่ใช่ลิสต์ที่พิมพ์ไว้** — ตารางที่เกิดใหม่ถูกครอบเอง
       *    และมันเชื่อได้เพราะเคส "ฐานกับทรีตรงกัน" ข้างบนพิสูจน์ไปแล้วว่าสองฝั่งเป็นชุดเดียวกัน
       *    ⚠️ ถ้าเคสนั้นแดง เคสนี้ก็ไม่มีความหมาย — **มันพึ่งกันโดยตั้งใจ**
       */
      const tables = tablesFromMigrations();

      // ด้านบวกของตัวดึงรายชื่อเอง — regex ที่พังจะให้ลิสต์ว่าง แล้วเคสนี้เขียวโดยไม่ตรวจอะไร
      expect(tables.length, "ดึงชื่อตารางจากไฟล์ migration ไม่ได้เลย").toBeGreaterThan(15);

      const rows = await exposure(tables);
      expect(
        rows.filter((r) => r.door === "MISSING").map((r) => r.table_name),
        "มีตารางที่อยู่ในไฟล์แต่ไม่มีในฐาน — เคสนี้กำลังตรวจของที่ไม่มีอยู่",
      ).toEqual([]);

      expect(
        rows.filter((r) => r.detail === "TRUNCATE").map((r) => `${r.table_name} → ${r.grantee}`),
        "ยังมี TRUNCATE เหลืออยู่\n" +
          "  🔴 **`grant` เป็นการ *เพิ่ม* ไม่ใช่ *กำหนด*** และ Supabase แจกสิทธิ์พื้นฐานให้ตอน\n" +
          "     `create table` เอง → ตารางที่เกิดใหม่จะมาพร้อม `TRUNCATE` **โดยไม่มีบรรทัดไหนผิด**\n" +
          "  → ถอนที่ชั้น `alter default privileges` ด้วย ไม่ใช่ไล่ถอนทีละใบ ไม่งั้นมันกลับมาเรื่อย ๆ",
      ).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 D78 — ขอบเขตของ `preserve_authorship` ต้องมีคนตัดสิน ไม่ใช่ผลข้างเคียงของการตั้งชื่อ", () => {
    /**
     * `authorship_columns()` จับคู่ด้วย **รูปของชื่อล้วน ๆ**: `<x>_by_user` (uuid) + `legacy_<x>_by` (text)
     * → **คู่ที่ 9 จะถูกครอบทันทีที่มีคนตั้งชื่อให้เข้ารูป โดยไม่มีใครตัดสินใจสักคน**
     *
     * P1 เขียนไว้ว่านั่นคือข้อดี (ตารางใหม่ของ `E3`/`E5` ได้ฟรี ไม่ต้องแก้ไฟล์ไหน)
     * **และครึ่งแรกถูก** — พิมพ์ชื่อตารางตายตัวคือวิธีสร้าง `P-55` ตัวที่สองด้วยมือตัวเอง
     *
     * 🔴 **แต่กลไกนี้ปลอดภัยเฉพาะกับคอลัมน์ที่เขียนครั้งเดียวแล้วไม่เปลี่ยนอีก**
     *    `preserve_authorship` เขียน `legacy_*` **ครั้งเดียวตลอดกาล** (`and %I is null`)
     *    และ **ไม่มีที่ไหนล้างมันเลยสักแห่ง** → ถ้า `<x>_by_user` เปลี่ยนค่าได้เมื่อไหร่
     *    สองคอลัมน์จะขัดกันเอง และตัวที่แช่ไว้จะเป็นตัวที่ผิด
     *
     * ⚠️ **คอมเมนต์ของฟังก์ชันเขียนว่า *"updated_by_user ไม่เข้าเกณฑ์โดยตั้งใจ"*
     *    แต่ไม่มีเกณฑ์ไหนในฟังก์ชันตัดมันออกเลยสักบรรทัด** — มันไม่เข้าเพราะ `legacy_updated_by`
     *    ยังไม่มีใครสร้าง · วันที่มีคนสร้างด้วยเหตุผลอะไรก็ตาม **มันจะถูกครอบเงียบ ๆ**
     *    🎯 ตระกูลเดียวกับป้าย *"ข้อยกเว้นที่ 4"* ที่ P1 จับได้เอง: **ข้อความอ้างกฎที่โค้ดไม่ได้บังคับ**
     *
     * → เคสนี้จึงตรึง **รายการ** ไม่ใช่ **จำนวน**: คู่ที่ 9 ต้องทำให้แดง และคนที่เพิ่มต้องตอบคำถามเดียว
     *   ก่อนเติมลงลิสต์ — **"คอลัมน์นี้เขียนทับได้ไหม"** ถ้าได้ กลไกนี้ยังไม่พร้อมรับมัน
     */
    const AUTHORSHIP_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
      // [ตาราง, คอลัมน์ uuid, คอลัมน์สตริงสำรอง] — เรียงตามที่ฟังก์ชันเรียงมา (table, column)
      ["bookings", "added_by_user", "legacy_added_by"],
      ["checklist_items", "added_by_user", "legacy_added_by"],
      // 🔴 คู่นี้คือคู่เดียวในลิสต์ที่ `<x>_by_user` **เปลี่ยนค่าได้** — `stamp_checked_by()`
      //    ล้างมันทุกครั้งที่มีคนติ๊กออก โดยมีคอมเมนต์กำกับเหตุผลไว้ในไฟล์ migration เองว่า
      //    *"ติ๊กออกต้องล้าง ไม่งั้นชื่อคนที่ไม่ได้ติ๊กแล้วจะค้างบนแถว"*
      //    ⚠️ แต่ **ไม่มีอะไรล้าง `legacy_checked_by`** → ดูรายงาน `P-56` ที่ส่ง P1 แล้ว
      ["checklist_items", "checked_by_user", "legacy_checked_by"],
      ["custom_places", "added_by_user", "legacy_added_by"],
      ["hidden_places", "hidden_by_user", "legacy_hidden_by"],
      ["place_notes", "added_by_user", "legacy_added_by"],
      ["trip_hotels", "added_by_user", "legacy_added_by"],
      ["trip_stops", "added_by_user", "legacy_added_by"],
    ] as const;

    it("🔴 แหล่งที่สอง: คู่ที่อ่านได้จากไฟล์ ต้องตรงกับที่ฟังก์ชันรายงาน", () => {
      /**
       * 🔴 **เคสนี้มีอยู่เพราะเคสข้างล่างตรวจตัวเองไม่ได้** — ลิสต์ `AUTHORSHIP_PAIRS`
       * ผมก๊อปมาจากผลของ `authorship_columns()` เอง (คอมเมนต์ในลิสต์เขียนไว้ตรง ๆ ว่า
       * *"เรียงตามที่ฟังก์ชันเรียงมา"*) → **ถ้าตรรกะจับคู่ของฟังก์ชันพลาดคู่ไหนตั้งแต่แรก
       * ลิสต์จะพลาดคู่เดียวกัน และเคสข้างล่างจะเขียวตลอดกาล**
       *
       * 🎯 บทเรียนของ P1 (`P-63`) ที่ผมเอามาใช้กับงานตัวเอง: *ตัวตรวจที่ได้ค่าคาดหวังมาจาก
       * แหล่งเดียวกับของที่ถูกตรวจ ยืนยันได้แค่ว่า "ผมพิมพ์ตรงกับที่ผมคิด"*
       * · เขาเจอมันกับ `do $verify$` ที่นับ 37 คอลัมน์จากลิสต์ผิดตัวเดียวกัน **แล้วมันเขียว**
       *
       * → ตัวนี้อ่าน **ไฟล์** · ฟังก์ชันอ่าน **ฐาน** · ลิสต์เป็น **การตัดสินของคน** — สามแหล่ง
       */
      const fromFiles = authorshipPairsFromMigrations().map(([t, u, l]) => `${t}.${u} → ${l}`);
      const registry = AUTHORSHIP_PAIRS.map(([t, u, l]) => `${t}.${u} → ${l}`);
      expect(fromFiles.length, "อ่านคู่จากไฟล์ไม่ได้เลย — เคสนี้กำลังเทียบเซตว่าง").toBeGreaterThan(3);
      expect(
        fromFiles,
        "ไฟล์กับทะเบียนไม่ตรงกัน\n" +
          "  · **ไฟล์มีมากกว่า** → มีคู่ที่ `authorship_columns()` อาจมองไม่เห็น **นั่นคือบั๊กของฟังก์ชัน**\n" +
          "  · **ทะเบียนมีมากกว่า** → มีคู่ที่ถูกลบไปแล้วแต่ยังค้างในทะเบียน",
      ).toEqual(registry);
    });

    it("🔴 ครอบ 8 คู่นี้พอดี — ไม่ขาดและไม่เกิน", async () => {
      const { data, error } = await admin.rpc("authorship_columns");
      expect(error?.message ?? null, "เรียก authorship_columns() ไม่ได้").toBeNull();

      const actual = (data as Array<{ table_name: string; user_column: string; legacy_column: string }>)
        .map((r) => `${r.table_name}.${r.user_column} → ${r.legacy_column}`);
      const expected = AUTHORSHIP_PAIRS.map(([t, u, l]) => `${t}.${u} → ${l}`);

      expect(
        actual,
        "ขอบเขตของ `preserve_authorship` เปลี่ยนไปจากลิสต์ที่มีคนตัดสินไว้\n" +
          "  · **มีคู่เพิ่ม** → ตอบก่อนเติมลงลิสต์: **คอลัมน์ `<x>_by_user` นั้นเขียนทับได้ไหม**\n" +
          "    ถ้าได้ อย่าเพิ่งเติม — `legacy_*` ถูกเขียนครั้งเดียวและไม่มีใครล้าง มันจะขัดกันเอง\n" +
          "  · **มีคู่หาย** → ประวัติของตารางนั้นเลิกถูกเก็บแล้ว และไม่มีอะไรอื่นบอก\n" +
          "  🔴 ตัวเลข 8 ไม่ใช่ประเด็น **รายการต่างหาก** — 8 คู่ที่ต่างออกไปก็ยังต้องแดง",
      ).toEqual(expected);
    });

    it("🔴 ด้านบวกของตัวฟังก์ชันเอง — ต้องไม่ใช่ว่ามันคืนว่างเสมอ", async () => {
      const { data } = await admin.rpc("authorship_columns");
      // `P-21` — "ครอบทุกอย่างแล้ว" กับ "ไม่ได้ตรวจอะไรเลย" ให้ลิสต์ว่างเหมือนกันเป๊ะ
      expect((data as unknown[]).length, "คืนลิสต์ว่าง → trigger เดินลูป 0 รอบ และเงียบสนิท").toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 P-53 — ข้อความ error ต้องต่างเฉพาะกับคนที่รู้ความต่างนั้นอยู่แล้ว", () => {
    /**
     * `…150942` แก้ soft-delete RPC ทั้ง 6 ตัวให้แยกด้วย **`can_read_trip`** ไม่ใช่ `can_write_trip`
     * บล็อกนี้พิสูจน์ว่ามันจริง **และต้องยิง 2 ทิศ ทิศเดียวไม่พอ**
     *
     * | ใคร | ต้องได้ | ถ้าได้ผิด แปลว่า |
     * |---|---|---|
     * | `viewer` (อ่านได้ เขียนไม่ได้) | *"ไม่มีสิทธิ์แก้"* | คนที่**เห็นแถวอยู่แล้ว**ถูกบอกว่าไม่มีแถว = หน้าจอโกหกเขา |
     * | คนนอก · id จริง | *"ไม่พบ"* | 🔴 **existence oracle** — เดา id ถูกแล้วรู้ว่ามีจริง |
     * | คนนอก · id มั่ว | *"ไม่พบ"* **ตัวเดียวกันเป๊ะ** | ถ้าต่างแม้แต่ไบต์เดียว = oracle เหมือนเดิม |
     *
     * 🔴 **ทิศที่คนลืมคือทิศแรก** และการลืมมันทำให้ทุกเคสของทิศที่สองเขียวสวย:
     * แก้ให้ *ทุกคน* ได้ *"ไม่พบ"* → ไม่มี oracle จริง ๆ **แต่ viewer จะเจอเว็บที่บอกว่า
     * รายการที่เขากำลังมองอยู่ตรงหน้าไม่มีอยู่** · เป็นรูปเดียวกับ `P-44`: ปฏิเสธทุกคน = ปลอดภัยและใช้ไม่ได้
     *
     * 🎯 **เทียบทั้ง 4 ฟิลด์ ไม่ใช่แค่ `message`** — PostgREST คืน `code`/`message`/`details`/`hint`
     * ช่องรั่วที่เหลืออยู่ได้สบายคือ `details` ที่หลุดมาต่างกันโดยไม่มีใครดู
     *
     * ⚠️ **`B` เป็นคนนอกของบล็อกนี้โดยตั้งใจ — ไม่เชิญเข้าทริป**
     * บล็อกเนื้อหาอื่นเชิญ `B` เป็น editor กับ `C` เป็น viewer หมด จึง**ไม่มีคนนอกให้ยิงเลยสักบล็อก**
     * ซึ่งคือเหตุผลที่ช่องนี้ไม่เคยถูกวัดมาก่อน
     */
    const ccQ = TEST_COUNTRY_CODES.rpcMessages;
    const FAKE_ID = "00000000-0000-4000-8000-000000000000";
    let tripQ = "", planQ = "", dayQ = "", cityQ = "", catQ = "", myQ = "";

    /** id ของแถวจริงในแต่ละตาราง · เติมใน `beforeAll` */
    const rows: Record<string, string> = {};

    /** ชื่อ RPC → ข้อความ "ไม่พบ" ที่มันใช้ (ต่างกันต่อตาราง ซึ่งไม่รั่วเพราะคนเลือก RPC เองอยู่แล้ว) */
    const RPCS = [
      ["soft_delete_checklist_item", "checklist_items"],
      ["soft_delete_place_note", "place_notes"],
      ["soft_delete_booking", "bookings"],
      ["soft_delete_trip_hotel", "trip_hotels"],
      ["soft_delete_trip_stop", "trip_stops"],
      ["soft_delete_custom_place", "custom_places"],
    ] as const;

    beforeAll(async () => {
      await purgeCountry(ccQ);
      await admin.from("catalog_countries").insert({ id: ccQ, name_th: "ทดสอบข้อความ", name_en: "MSG" });
      const ci = await admin.from("catalog_cities")
        .insert({ country_id: ccQ, name_th: "เมืองQ", name_en: "CityQ", lat: 35, lng: 129, timezone: "Asia/Seoul" })
        .select("id").single();
      if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
      cityQ = ci.data.id as string;
      const cp = await admin.from("catalog_places")
        .insert({ city_id: cityQ, category: "sight", lat: 35, lng: 129 })
        .select("id").single();
      if (cp.error) throw new Error(`seed place: ${cp.error.message}`);
      catQ = cp.data.id as string;

      const t = await A.rpc("create_trip", {
        p_title: `msg-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริป: ${t.error.message}`);
      tripQ = t.data.id as string;

      // 🔴 เชิญ `C` เป็น viewer เท่านั้น · **`B` ไม่ถูกเชิญ** — นั่นคือทั้งหมดที่บล็อกนี้ต้องการ
      const inv = await A.from("trip_members").insert({ trip_id: tripQ, user_id: ids.c, role: "viewer" });
      if (inv.error) throw new Error(`เชิญ C: ${inv.error.message}`);

      const pl = await A.from("trip_plans").select("id").eq("trip_id", tripQ).eq("is_active", true).single();
      if (pl.error) throw new Error(`หาแผน: ${pl.error.message}`);
      planQ = pl.data.id as string;

      const dy = await A.from("trip_days").insert({ trip_id: tripQ, date: "2026-10-12" }).select("id").single();
      if (dy.error) throw new Error(`สร้างวัน: ${dy.error.message}`);
      dayQ = dy.data.id as string;

      const mp = await A.from("custom_places")
        .insert({ trip_id: tripQ, city_id: cityQ, category: "cafe", lat: 35.1, lng: 129.1 })
        .select("id").single();
      if (mp.error) throw new Error(`custom place: ${mp.error.message}`);
      myQ = mp.data.id as string;
      rows.custom_places = myQ;

      const mk = async (table: string, payload: Record<string, unknown>) => {
        const { data, error } = await A.from(table).insert(payload).select("id").single();
        if (error) throw new Error(`seed ${table}: ${error.message}`);
        rows[table] = data.id as string;
      };
      await mk("checklist_items", { trip_id: tripQ, text: `รายการ ${stamp}` });
      await mk("place_notes", { trip_id: tripQ, plan_id: planQ, catalog_place_id: catQ, note: `โน้ต ${stamp}` });
      await mk("bookings", { trip_id: tripQ, category: "flight", title: `เที่ยวบิน ${stamp}` });
      await mk("trip_hotels", {
        trip_id: tripQ, city_id: cityQ, hotel_name: `โรงแรม ${stamp}`,
        check_in: "2026-10-12", check_out: "2026-10-14",
      });
      await mk("trip_stops", {
        trip_id: tripQ, plan_id: planQ, trip_day_id: dayQ,
        kind: "place", catalog_place_id: catQ, rank: "m",
      });
    });

    afterAll(async () => {
      // 🔴 ลบลูกก่อนพ่อ — `catalog_places` เป็น `on delete restrict` จาก `catalog_cities`
      //    (ผมเคยพลาดข้อนี้มาแล้วในบล็อกคลัง แล้วรอบถัดไปชนคีย์ซ้ำ → เคส "ข้าม" ที่อ่านเป็นเขียว)
      await admin.from("trips").delete().eq("id", tripQ);
      const error = await purgeCountry(ccQ);
      if (error) console.warn(`\n⚠️  เก็บกวาดคลังของบล็อก P-53 ไม่สำเร็จ: ${error}\n`);
    });

    // ── ด้านบวก: ถ้าตรงนี้แดง เคสข้างล่างวัดความว่างเปล่า ────────────────────
    it("ด้านบวก: แถวจริงถูกสร้างครบทั้ง 6 ตาราง", () => {
      const missing = RPCS.filter(([, table]) => !rows[table]).map(([, table]) => table);
      expect(missing, "ไม่มีแถวให้ยิง → เคสด้านลบทั้งหมดจะเขียวเพราะไม่มีอะไรให้เห็น").toEqual([]);
    });

    it.each(RPCS)("🔴 %s — viewer ต่างจากคนนอก · คนนอกกับ id มั่วต้องเหมือนกันเป๊ะ", async (rpc, table) => {
      const shape = (e: { code?: string; message?: string; details?: string; hint?: string } | null) =>
        JSON.stringify({ code: e?.code, message: e?.message, details: e?.details, hint: e?.hint });

      const viewer = await C.rpc(rpc, { p_id: rows[table] });
      const outsiderReal = await B.rpc(rpc, { p_id: rows[table] });
      const outsiderFake = await B.rpc(rpc, { p_id: FAKE_ID });

      // ทั้งสามต้องล้ม — ถ้าตัวไหนสำเร็จ นั่นคือปัญหาที่ใหญ่กว่าเรื่องข้อความ
      for (const [who, r] of [["viewer", viewer], ["คนนอก/id จริง", outsiderReal], ["คนนอก/id มั่ว", outsiderFake]] as const) {
        expect(r.error, `${who} ลบสำเร็จ — นี่ไม่ใช่ปัญหาข้อความแล้ว แต่เป็นสิทธิ์`).not.toBeNull();
      }

      // ① ทิศที่คนลืม — viewer ต้อง**ไม่**ถูกบอกว่าไม่มีแถว
      expect(
        viewer.error!.message,
        "viewer ถูกบอกว่า 'ไม่พบ' ทั้งที่เขาเห็นแถวนั้นอยู่บนหน้าจอ\n" +
          "  🔴 นี่คือรูปของ `P-44`: ปฏิเสธทุกคนเหมือนกันหมด = เคสด้านลบเขียวครบ และเว็บโกหกผู้ใช้",
      ).toContain("ไม่มีสิทธิ์");

      // ② คนนอกต้องได้ 'ไม่พบ' — ไม่ใช่ 'ไม่มีสิทธิ์' ที่ยืนยันว่า id นั้นมีจริง
      expect(
        outsiderReal.error!.message,
        "คนนอกถูกบอกว่า 'ไม่มีสิทธิ์' → ยืนยันว่า id ที่เขาเดามีอยู่จริง = existence oracle",
      ).toContain("ไม่พบ");

      // ③ ข้อที่แข็งที่สุด — เทียบทั้งก้อน ไม่ใช่แค่ข้อความ
      expect(
        shape(outsiderFake.error),
        `${rpc}: id จริงกับ id มั่ว ให้ผลไม่เหมือนกันสำหรับคนนอก\n` +
          "  → ความต่างนั้นเองคือคำตอบว่า id ไหนมีอยู่จริง ไม่ว่ามันจะอยู่ในฟิลด์ไหน",
      ).toBe(shape(outsiderReal.error));

      // ④ viewer กับคนนอกต้องต่างกันจริง — ไม่ใช่ผ่าน ① ② ด้วยความบังเอิญของ substring
      expect(viewer.error!.message).not.toBe(outsiderReal.error!.message);

      // ⑤ ไม่มีอะไรถูกลบจริงระหว่างทาง — RPC ที่ `raise` แล้วยัง `update` ทันเป็นไปได้
      //    ถ้าลำดับในฟังก์ชันสลับ · **ข้อความถูกแต่ของหายไปแล้ว** คืออาการที่ไม่มีใครไปดู
      //
      // 🔴 **วัดด้วยสายตาของเจ้าของ ไม่ใช่ `service_role`** ด้วยเหตุผล 2 ข้อ:
      //    ① policy ฝั่งอ่านของตระกูล `D76` กรอง `deleted_at is null` อยู่แล้ว
      //       → "ยังเห็นอยู่" คือคำตอบเดียวกับ "ยังไม่ถูกลบ" **และตรงกับสิ่งที่ผู้ใช้เจอจริง**
      //    ② `custom_places` เป็นตารางเนื้อหา **ใบเดียวที่ไม่มี grant ให้ `service_role` เลย**
      //       (ทุกใบอื่นมี `select, delete` ตามข้อยกเว้นที่ 4) → `admin.from(...).single()`
      //       คืน `data: null` เพราะ **ไม่มีสิทธิ์** ไม่ใช่เพราะ **ไม่มีแถว**
      //       ⚠️ ถ้าเช็คแบบ `expect(data?.deleted_at).toBeNull()` มันจะ**เขียวด้วยเหตุผลที่ผิด**ทันที
      //          — รายงาน P1 แล้ว · เก็บกวาดยังทำงานเพราะ cascade จาก `trips` ไม่ใช่เพราะ grant
      const seen = await A.from(table).select("id").eq("id", rows[table]);
      expect(seen.error?.message ?? null, `${table}: เจ้าของอ่านไม่ได้ — เคสนี้วัดอะไรไม่ได้`).toBeNull();
      expect(seen.data, `${table}: RPC ล้มแต่แถวหายไปจากสายตาเจ้าของแล้ว`).toHaveLength(1);
    });

    it("ด้านบวก: เจ้าของลบได้จริงทั้ง 6 ตัว — ไม่งั้นเคสข้างบนอาจเขียวเพราะ RPC พังทั้งตัว", async () => {
      const failed: string[] = [];
      for (const [rpc, table] of RPCS) {
        const { error } = await A.rpc(rpc, { p_id: rows[table] });
        if (error) failed.push(`${rpc}: ${error.message}`);
      }
      expect(failed, "เจ้าของลบไม่ได้ → ข้อความ 'ไม่มีสิทธิ์/ไม่พบ' ข้างบนอาจมาจาก RPC ที่พังเฉย ๆ").toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 P-55 / D78 — ตรึงพฤติกรรมวันนี้: ประวัติตายพร้อมบัญชีคนเพิ่ม", () => {
    /**
     * 🔴 **เคสในบล็อกนี้ตรึงสิ่งที่เรา *ไม่* ต้องการ ไม่ใช่สิ่งที่เราต้องการ**
     *
     * `column-map.md` เขียนเหตุผลของ `legacy_added_by` ไว้เองว่าสตริงเดิมคือ
     * **ข้อมูลเดียวที่บอกได้ว่าใครเพิ่มอะไร "ห้ามทิ้ง"** · แต่คอลัมน์นั้นอยู่บนตาราง
     * ที่รับ**แถวใหม่**ด้วย และแถวใหม่ไม่มีสตริงเดิมให้เก็บ
     * → **ประวัติรอดสำหรับแถวที่ย้ายมา และตายสำหรับแถวที่เกิดใหม่ — สลับข้างกับสัญชาตญาณพอดี**
     *
     * `on delete set null` ทำงานถูกทุกตัวอักษร · ไม่มี error ไม่มีคำเตือน · แถวยังอยู่ครบ
     * **หน้าจอจะบอกว่า "ไม่มีใครเพิ่มรายการนี้" ซึ่งไม่เคยเป็นความจริงเลยสักวินาที**
     *
     * ⚠️ **ถ้าบล็อกนี้แดง แปลว่าน่าจะมีคนแก้ถูกแล้ว ไม่ใช่มีคนทำพัง**
     *    → ไปอ่าน `D78` ข้อ ② กับ `Q4` ก่อนแตะอะไร **แล้วลบบล็อกนี้ทิ้งทั้งบล็อก อย่าแก้ให้มันเขียว**
     *    เหตุผลที่ต้องมีทั้งที่รู้ว่าจะถูกลบ: `D78` ข้อ ② ลงมือไม่ได้จนกว่า `Q4` จะปิด
     *    (**เขียนชื่อคนที่ลบบัญชีไปแล้ว ถอนกลับไม่ได้** จึงเป็นการตัดสินใจของผู้ใช้ ไม่ใช่ของเรา)
     *    ระหว่างนั้นการสูญเสียนี้ **ไม่มีอะไรบันทึกไว้ในโค้ดเลยสักบรรทัด**
     *
     * 🎯 **สิ่งที่บล็อกนี้เพิ่มจากที่ P1 ขอ: ไม่ใช่คอลัมน์เดียว — เป็น 3 และช่องที่ 3 ต่างชนิด**
     *    ยิงจริงแล้วบน engine-dev · ลบบัญชีเดียว หายพร้อมกันหมด:
     *      · `added_by_user`   → null · **มี** `legacy_added_by` ให้ลง
     *      · `checked_by_user` → null · **มี** `legacy_checked_by` ให้ลง
     *      · `updated_by_user` → null · 🔴 **ไม่มี `legacy_updated_by` อยู่ที่ไหนเลยทั้งสคีมา**
     *    → **ทางแก้ของ `D78` ข้อ ② ครอบได้ 2 ใน 3** · ตัวที่ 3 ไม่ใช่ "ยังไม่ได้ทำ" แต่คือ
     *      **ไม่มีที่ให้ลง** — และมันจะเงียบต่อไปแม้หลังแก้ `D78` เสร็จ ถ้าไม่มีใครจดไว้ตรงนี้
     */
    let tripP = "";
    let itemP = "";
    let ghostId = "";
    let ghostName = "";
    let ghost: SupabaseClient;

    beforeAll(async () => {
      /**
       * 🔴 **สร้างผู้ใช้เองตรงนี้ ไม่เรียก `makeUser`** — เพราะเคสนี้**ลบเขาเป็นส่วนหนึ่งของการทดสอบ**
       * `makeUser` ลงทะเบียนใน `ids` ซึ่ง `afterAll` หลักจะไล่ `deleteUser` ทุกตัว
       * → จะได้ `console.warn` "ลบผู้ใช้ทดสอบไม่สำเร็จ" ทุกรอบ ทั้งที่ทุกอย่างถูกต้อง
       * **คำเตือนที่ดังทุกรอบโดยไม่มีอะไรผิด คือวิธีสอนคนให้เลิกอ่านคำเตือน**
       */
      const email = `rls-ghost-${stamp}@example.test`;
      const password = `pw-${stamp}-ghost`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw new Error(`สร้างผู้ใช้ผีไม่ได้: ${created.error.message}`);
      ghostId = created.data.user!.id;
      ghost = testClient(ANON);
      const signIn = await ghost.auth.signInWithPassword({ email, password });
      if (signIn.error) throw new Error(`ล็อกอินผีไม่ได้: ${signIn.error.message}`);

      // ทริปของบล็อกนี้เอง — ผีเป็นแค่ `editor` ไม่ใช่เจ้าของ
      // 🔴 ข้อนี้**จำเป็นต่อการมีอยู่ของเคส** ไม่ใช่รายละเอียด: ถ้าผีเป็นเจ้าของ
      //    `deleteUser` จะชน `trips.created_by … on delete restrict` แล้วลบไม่ออก (`P-28`)
      //    → **ช่องนี้เปิดเฉพาะกับคนที่ไม่ใช่เจ้าของ ซึ่งคือคนส่วนใหญ่ในทริปที่มีหลายคน**
      const t = await A.rpc("create_trip", {
        p_title: `ghost-${stamp}`,
        p_start_date: "2026-10-11",
        p_end_date: "2026-10-21",
      });
      if (t.error) throw new Error(`สร้างทริปของบล็อก P-55 ไม่ได้: ${t.error.message}`);
      tripP = t.data.id as string;
      const inv = await A.from("trip_members").insert({
        trip_id: tripP,
        user_id: ghostId,
        role: "editor",
      });
      if (inv.error) throw new Error(`เชิญผีเป็น editor ไม่ได้: ${inv.error.message}`);

      // 🔴 อ่านชื่อไว้**ก่อน**ลบบัญชี — หลังลบแล้วไม่มีที่ไหนให้อ่านอีก
      //    `admin` (service_role) ไม่มี grant บน `profiles` → ต้องอ่านผ่าน client ของผีเอง
      const prof = await ghost.from("profiles").select("display_name").eq("id", ghostId).single();
      if (prof.error) throw new Error(`อ่าน display_name ของผีไม่ได้: ${prof.error.message}`);
      ghostName = prof.data!.display_name as string;
    });

    afterAll(async () => {
      // เผื่อเคสล้มกลางคันก่อนถึงขั้นลบ — ผีต้องไม่ค้างในฐานของกลาง
      // ทริปเป็นของ `A` จึงถูกเก็บกวาดโดย `afterAll` หลักตาม `created_by` อยู่แล้ว
      if (!ghostId) return;
      const { error } = await admin.auth.admin.deleteUser(ghostId);
      // ปกติเคสที่ 3 ลบไปแล้ว → ตรงนี้ error เป็นเรื่องธรรมดา **จึงเงียบโดยตั้งใจ**
      // ต่างจาก `afterAll` หลักที่ต้องดัง เพราะที่นั่น "ลบไม่ออก" คือความผิดปกติจริง
      if (error && !/not.?found|does not exist/i.test(error.message)) {
        console.warn(`\n⚠️  ลบผู้ใช้ผี ${ghostId} ไม่สำเร็จ: ${error.message}\n`);
      }
    });

    it("ด้านบวก: ผี (editor) เพิ่มรายการได้ · เซิร์ฟเวอร์เติมชื่อคนเพิ่มให้เอง", async () => {
      const { data, error } = await ghost
        .from("checklist_items")
        .insert({ trip_id: tripP, text: `ของผี ${stamp}`, category: "เอกสาร" })
        .select("id, added_by_user, legacy_added_by")
        .single();
      expect(error?.message ?? null, "ผีเพิ่มรายการไม่ได้ — เคสข้างล่างจะไม่ได้พิสูจน์อะไรเลย").toBeNull();
      itemP = data!.id as string;
      expect(data!.added_by_user, "trigger `stamp_added_by` ไม่ได้เติมค่า").toBe(ghostId);
      expect(data!.legacy_added_by, "แถวที่เกิดใหม่ไม่มีสตริงเดิม — นี่คือรากของ P-55").toBeNull();
    });

    it("ด้านบวก: ผีติ๊กรายการของตัวเอง → ทั้ง 3 คอลัมน์ชี้ไปที่ผีพร้อมกัน", async () => {
      const upd = await ghost.from("checklist_items").update({ is_checked: true }).eq("id", itemP);
      expect(upd.error?.message ?? null).toBeNull();

      const { data } = await admin
        .from("checklist_items")
        .select("added_by_user, checked_by_user, updated_by_user")
        .eq("id", itemP)
        .single();
      // ทั้งสามถูกเติมโดย trigger ฝั่งเซิร์ฟเวอร์ — ไคลเอนต์ไม่มีสิทธิ์คอลัมน์ไหนเลย
      expect(data!.added_by_user).toBe(ghostId);
      expect(data!.checked_by_user).toBe(ghostId);
      expect(data!.updated_by_user).toBe(ghostId);
    });

    it("ลบบัญชีผีได้ เพราะเขาไม่ใช่เจ้าของทริป (ต่างจาก `P-28`)", async () => {
      const { error } = await admin.auth.admin.deleteUser(ghostId);
      expect(
        error?.message ?? null,
        "ลบไม่ออก → สมมติฐานของบล็อกนี้ผิด ไปตรวจว่ามี FK ตัวใหม่เป็น `restrict` หรือเปล่า",
      ).toBeNull();
    });

    /**
     * 🟢 **`D78` ข้อ ② ลงแล้ว 25 ส.ค. 2026 — เคสตรึงของ P4 ถูกแทนที่ตามที่เขาสั่งไว้เอง**
     *
     * ข้อความ assert ของเคสเดิมเขียนไว้ว่า *"ถ้าคุณเพิ่งลงมือตาม `D78` ข้อ ② — **ลบบล็อกนี้ทิ้ง**
     * ⚠️ อย่าแก้ตัวเลขให้เคสเขียว บล็อกนี้มีไว้เพื่อถูกลบ ไม่ใช่เพื่อถูกดูแล"*
     * → **ลบเคสตรึงทิ้งจริง** และเขียนด้านบวกแทนในที่เดิม · เคส 3 ตัวข้างบนยังใช้ได้ทั้งหมด
     *   (ผู้ใช้ตัดสิน `Q4` = เก็บ `display_name` · trigger `app.preserve_authorship`)
     *
     * 🔴 **ช่องที่ 3 ที่ P4 ชี้ไว้ยังเปิดอยู่ และเคสนี้ตรึงมันไว้แทน:** `updated_by_user`
     *    **ไม่มี `legacy_updated_by` อยู่ที่ไหนเลยทั้งสคีมา** → `D78` ข้อ ② ครอบไม่ได้ตามนิยาม
     *    · P1 ตัดสินว่า**ไม่เพิ่มคอลัมน์นั้น**: `updated_by_user` แปลว่า *"คนล่าสุดที่แก้"*
     *      ซึ่งถูกเขียนทับทุกครั้งที่มีคนแก้ต่ออยู่แล้ว — แช่เป็นข้อความ = แช่ค่าที่กำลังจะถูกทับ
     *      ต่างจาก `added_by` ที่เป็นข้อเท็จจริงที่เกิดครั้งเดียวและไม่เปลี่ยนอีก
     *    · ⚠️ **ถ้าวันหนึ่งมีคนเห็นต่างและเพิ่ม `legacy_updated_by` เข้ามา `app.preserve_authorship`
     *      จะครอบมันเองทันทีโดยไม่ต้องแก้ไฟล์ไหนเลย** — และเคสนี้จะแดง ซึ่งคือสัญญาณที่ถูก
     */
    it("🟢 D78/Q4 — แถวอยู่ต่อ และยังบอกได้ว่าใครเพิ่ม/ใครติ๊ก แม้บัญชีหายไปแล้ว", async () => {
      const { data, error } = await admin
        .from("checklist_items")
        .select(
          "id, text, added_by_user, legacy_added_by, checked_by_user, legacy_checked_by, updated_by_user",
        )
        .eq("id", itemP)
        .maybeSingle();

      expect(error?.message ?? null).toBeNull();
      // ① แถวต้องไม่หายไปกับบัญชี — ถ้าหาย แปลว่ามีใครเปลี่ยน FK เป็น cascade
      //    ซึ่งแย่กว่า `P-55` อีกชั้น: ของในทริปของคนอื่นหายเพราะคนที่สามลบบัญชีตัวเอง
      expect(data, "แถวหายไปพร้อมบัญชี — นั่นไม่ใช่ P-55 แต่เป็นของที่แย่กว่า").not.toBeNull();
      expect(data!.text).toContain(stamp);

      // ② FK ยังทำงานเหมือนเดิม — ตัวชี้ไปที่บัญชีต้องหลุด ไม่ใช่ค้างชี้ไปที่ของที่ไม่มีแล้ว
      expect(data!.added_by_user, "`on delete set null` ไม่ทำงาน").toBeNull();
      expect(data!.checked_by_user, "`on delete set null` ไม่ทำงาน").toBeNull();

      // ③ 🟢 หัวใจของ `D78` ข้อ ② — ชื่อถูกเขียนไว้ก่อน FK จะล้างตัวชี้
      expect(
        data!.legacy_added_by,
        "ประวัติ 'ใครเพิ่ม' หายไปพร้อมบัญชี — `D78` ข้อ ② ถอยหลัง\n" +
          "  ตรวจ: trigger ต้องเป็น `before delete` ไม่ใช่ `after` · และต้องอยู่บน `public.profiles`",
      ).toBe(ghostName);
      expect(data!.legacy_checked_by, "ประวัติ 'ใครติ๊ก' หายไปพร้อมบัญชี").toBe(ghostName);

      // ④ 🔴 ช่องที่ 3 — ตรึงไว้ว่ามัน**ยังหาย** และนั่นคือการตัดสินใจ ไม่ใช่ของค้าง
      expect(
        data!.updated_by_user,
        "ถ้าข้อนี้ไม่ใช่ null แปลว่ามีคนเพิ่ม `legacy_updated_by` เข้ามา — ไปอ่านคอมเมนต์เหนือเคสนี้ก่อนแก้",
      ).toBeNull();
    });

    it("🔴 ห้ามทับสตริงเดิมที่ `E7` ย้ายมา — `display_name` เป็นของสำรอง ไม่ใช่ของหลัก", async () => {
      // แถวที่ "ย้ายมาจากทริปเก่า" จำลองด้วยการเขียน `legacy_added_by` ไปตั้งแต่ตอน insert
      // (ไคลเอนต์มีสิทธิ์คอลัมน์นี้ตอน insert จริง — ดู grant ของ `checklist_items`)
      // 🔴 ผีถูกลบไปแล้วตั้งแต่เคสก่อนหน้า จึงต้องใช้ `B` ที่ยังอยู่ แล้วยืนยันว่า
      //    trigger ของ**ผี**ไม่ได้ไปแตะแถวนี้ เพราะมันไม่ใช่แถวของผี
      const seeded = await A.from("checklist_items")
        .insert({
          trip_id: tripP,
          text: `ของที่ย้ายมา ${stamp}`,
          category: "เอกสาร",
          legacy_added_by: "ปาร์ค (สตริงเดิมจากทริปเก่า)",
        })
        .select("id, legacy_added_by")
        .single();
      expect(seeded.error?.message ?? null).toBeNull();
      expect(
        seeded.data!.legacy_added_by,
        "ไคลเอนต์เขียน `legacy_added_by` ตอน insert ไม่ได้ — `E7` จะย้ายค่าเดิมเข้ามาไม่ได้เลย",
      ).toBe("ปาร์ค (สตริงเดิมจากทริปเก่า)");
    });
    it("🔴 `P-56` — ติ๊กออกต้องล้างชื่อสำรองด้วย ไม่ใช่แค่ตัวชี้", async () => {
      /**
       * `stamp_checked_by()` ล้าง `checked_by_user` ตอนติ๊กออกมาตั้งแต่แรก **และคอมเมนต์ในไฟล์
       * migration เขียนเหตุผลไว้เองว่า** *"ไม่งั้นชื่อคนที่ไม่ได้ติ๊กแล้วจะค้างบนแถวและหน้าจอจะบอกว่าเขาติ๊ก"*
       *
       * 🔴 `legacy_checked_by` ของ `D78` **พาบั๊กนั้นกลับมาทั้งดุ้น** — มันถูกเขียนตอนลบบัญชี
       * และ **ไม่มีที่ไหนล้างมันเลย** → รายการที่ไม่ได้ติ๊ก ยังมีชื่อคนติ๊กแปะอยู่
       * และมัน **ฟื้นทุกครั้งที่มีคนติ๊กออก** ไม่ใช่ครั้งเดียว
       *
       * 🎯 **บทเรียนกว้างกว่าตัวบั๊ก:** คอลัมน์สำรองต้องเดินตาม**วงจรชีวิต**ของตัวที่มันสำรอง
       * ไม่ใช่แค่รับค่ามาตอนตัวจริงกำลังจะหาย · `legacy_*` ปลอดภัยกับคอลัมน์ที่เขียนครั้งเดียว
       * **`checked_by_user` ไม่ใช่แบบนั้น** — ดูทะเบียนคู่คอลัมน์ในบล็อก `D78` ข้างล่าง
       */
      // สถานะตั้งต้นจากเคสก่อนหน้า: ติ๊กอยู่ · ตัวชี้ null (บัญชีถูกลบ) · ชื่อสำรอง = ชื่อผี
      const before = await admin
        .from("checklist_items")
        .select("is_checked, legacy_checked_by")
        .eq("id", itemP)
        .single();
      expect(before.data!.is_checked, "เคสนี้ต้องเริ่มจากสถานะ 'ติ๊กอยู่'").toBe(true);
      expect(before.data!.legacy_checked_by, "เคสนี้ต้องเริ่มจากสถานะ 'มีชื่อสำรอง'").toBe(ghostName);

      const un = await A.from("checklist_items").update({ is_checked: false }).eq("id", itemP);
      expect(un.error?.message ?? null, "เจ้าของติ๊กออกไม่ได้").toBeNull();

      const after = await admin
        .from("checklist_items")
        .select("is_checked, checked_by_user, legacy_checked_by")
        .eq("id", itemP)
        .single();
      expect(after.data!.is_checked).toBe(false);
      expect(after.data!.checked_by_user, "ตัวชี้ไม่ถูกล้าง").toBeNull();
      expect(
        after.data!.legacy_checked_by,
        "รายการไม่ได้ถูกติ๊ก แต่ยังมีชื่อคนติ๊กแปะอยู่\n" +
          "  → หน้าจอจะบอกว่า 'ติ๊กโดย <คนที่ลบบัญชีไปแล้ว>' บนรายการที่ยังไม่ติ๊ก\n" +
          "  🔴 และมันฟื้นทุกครั้งที่มีคนติ๊กออก ไม่ใช่ครั้งเดียว",
      ).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2 — แคช 4 ใบ: ชั้น ③ ของ `P-33` (ไคลเอนต์ต้องแตะไม่ได้เลยสักทาง)", () => {
    /**
     * แคชไม่มี policy สักตัว และถูก `revoke all from public, anon, authenticated`
     * → **ไม่ใช่ "RLS กรองให้เห็น 0 แถว" แต่คือ "ไม่มีสิทธิ์แตะตารางเลย"** — คนละกลไก
     *   จึงต้อง assert `42501` **ไม่ใช่ `data === []`** · ถ้าเจอ `[]` แปลว่าด่านเปลี่ยนชั้นไปแล้ว
     *
     * 🔴 **กับดักข้อ 3 ของหัวไฟล์ ใช้กับบล็อกนี้แรงเป็นพิเศษ:**
     * ตารางที่ **ว่างเปล่า** ทำให้เคสด้านลบทุกข้อเขียว **โดยไม่ได้พิสูจน์อะไรเลย**
     * → `beforeAll` **seed ด้วย `service_role` ก่อน** และเคสแรกยืนยันว่าแถวอยู่จริง
     *   ถ้าเคสนั้นแดง ทั้งบล็อกถือว่า inconclusive ไม่ใช่ pass
     *
     * 📌 `P-33` เขียนไว้ว่า *"`authenticated` ที่ไม่ใช่ใครเป็นพิเศษ ต้องถูกปฏิเสธครบ 4 verb"* —
     *    แคชไม่มี `trip_id` จึงไม่มีคำถามว่า "สมาชิกคนไหน" · คำถามเดียวคือ **แตะได้ไหม**
     */
    const CACHES = [
      "place_details_cache",
      "place_details_local_cache",
      "place_photo_cache",
      "travel_time_cache",
    ] as const;

    const key = `p4-cache-${stamp}`;
    const seedRow: Record<string, Record<string, unknown>> = {
      place_details_cache: { maps_query: key },
      place_details_local_cache: { maps_query: key, locale: "th" },
      place_photo_cache: { maps_query: key },
      travel_time_cache: {
        from_place_id: `${key}-a`,
        to_place_id: `${key}-b`,
        travel_mode: "walk",
        duration_minutes: 5,
      },
    };
    /** คอลัมน์ที่ใช้ระบุแถวของรอบนี้ — ต่างกันตามตาราง */
    const idCol: Record<string, string> = {
      place_details_cache: "maps_query",
      place_details_local_cache: "maps_query",
      place_photo_cache: "maps_query",
      travel_time_cache: "from_place_id",
    };
    const idVal = (t: string) => (t === "travel_time_cache" ? `${key}-a` : key);

    beforeAll(async () => {
      for (const t of CACHES) {
        const { error } = await admin.from(t).insert(seedRow[t]);
        if (error) throw new Error(`seed ${t} ไม่ได้ (ข้อยกเว้นที่ 5 ใช้ไม่ได้?): ${error.message}`);
      }
    });

    afterAll(async () => {
      for (const t of CACHES) {
        const { error } = await admin.from(t).delete().eq(idCol[t], idVal(t));
        if (error) console.warn(`\n⚠️  เก็บ fixture แคช ${t} ไม่สำเร็จ: ${error.message}\n`);
      }
    });

    it.each(CACHES)("🔴 precondition — มีแถวอยู่จริงใน %s ก่อนเริ่มเคสด้านลบ", async (t) => {
      const { data, error } = await admin.from(t).select(idCol[t]).eq(idCol[t], idVal(t));
      expect(error, `service_role อ่าน ${t} ไม่ได้: ${error?.message}`).toBeNull();
      expect(data, "ไม่มีแถว = เคสด้านลบข้างล่างเขียวเพราะตารางว่าง ไม่ใช่เพราะด่าน").toHaveLength(1);
    });

    it.each(CACHES)("🔴 authenticated แตะ %s ไม่ได้ครบทั้ง 4 verb", async (t) => {
      const attempts: Array<[string, { error: { code?: string } | null }]> = [
        ["select", await A.from(t).select(idCol[t]).limit(1)],
        ["insert", await A.from(t).insert(seedRow[t])],
        ["update", await A.from(t).update({ fetched_at: "2020-01-01T00:00:00Z" }).eq(idCol[t], idVal(t))],
        ["delete", await A.from(t).delete().eq(idCol[t], idVal(t))],
      ];
      for (const [verb, r] of attempts) {
        expect(
          r.error?.code,
          `${t} · ${verb} ไม่ได้ถูกปฏิเสธเพราะสิทธิ์ — ได้ ${r.error?.code ?? "ไม่มี error เลย"}`,
        ).toBe("42501");
      }
    });

    it.each(CACHES)("anon แตะ %s ไม่ได้", async (t) => {
      const { error } = await D.from(t).select(idCol[t]).limit(1);
      expect(error?.code).toBe("42501");
    });

    it.each(CACHES)("🔴 แถวใน %s ยังอยู่ครบหลังทุก verb — ไม่มีอันไหนสำเร็จบางส่วน", async (t) => {
      // ปฏิเสธแล้วต้องไม่เหลือร่องรอย · `update`/`delete` ที่ "ถูกปฏิเสธ" แต่แก้แถวไปแล้วบางส่วน
      // จะมองไม่เห็นเลยถ้าดูแต่ error
      const { data } = await admin.from(t).select("fetched_at").eq(idCol[t], idVal(t));
      expect(data, `แถวใน ${t} หายหลังไคลเอนต์ลอง delete`).toHaveLength(1);
      expect(
        String(data?.[0]?.fetched_at ?? "").startsWith("2020"),
        `fetched_at ถูกไคลเอนต์ทับได้ ทั้งที่ update ขึ้น 42501`,
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("🔴 E2-AC5 / D12 — Storage: ไฟล์การจองต้องเปิดจากข้างนอกไม่ได้", () => {
    /**
     * 🎯 **เกณฑ์จริงของ `E2-AC5` วัดจาก *ข้างนอก* เท่านั้น** — *"เปิด URL จากหน้าต่างที่ไม่ล็อกอิน"*
     * → เคสพวกนี้ใช้ **`fetch()` ตรง ไม่ผ่าน supabase client** เพราะ client แนบ header ให้เอง
     *   ทดสอบผ่าน client แล้วผ่าน **ไม่ได้แปลว่าลิงก์ที่หลุดออกไปจะเปิดไม่ได้**
     *
     * 🔴 และหัวไฟล์นี้เคยเขียนไว้เองว่า *"ไม่ครอบ … Storage"* — ตอนนี้มีของให้ครอบแล้ว
     *
     * ⚠️ **ตัวกันกับดักข้อ 3:** `400` จาก URL สาธารณะ **อาจแปลว่า "ไม่มีไฟล์" ก็ได้**
     *    → มีเคสด้านบวกคู่กันเสมอ: เจ้าของโหลดได้ · signed URL เปิดได้ **แปลว่าไฟล์มีอยู่จริง**
     */
    const BUCKET = "booking-files";
    let tripS = "";
    let filePath = "";

    beforeAll(async () => {
      const { data: trip, error } = await A.rpc("create_trip", {
        p_title: `storage-${stamp}`,
        p_start_date: "2026-10-11",
        p_end_date: "2026-10-21",
      });
      if (error) throw new Error(`สร้างทริปสำหรับเคส storage ไม่ได้: ${error.message}`);
      tripS = trip.id;
      filePath = `${tripS}/receipt-${stamp}.pdf`;
      const up = await A.storage
        .from(BUCKET)
        .upload(filePath, new Blob([`ใบเสร็จ ${stamp}`], { type: "application/pdf" }), {
          contentType: "application/pdf",
        });
      if (up.error) throw new Error(`เจ้าของทริปอัปโหลดไม่ได้: ${up.error.message}`);
    });

    afterAll(async () => {
      const rm = await admin.storage.from(BUCKET).remove([filePath]);
      if (rm.error) console.warn(`\n⚠️  ลบไฟล์ fixture ไม่สำเร็จ: ${rm.error.message}\n`);
    });

    it("ด้านบวก: เจ้าของทริปโหลดไฟล์ของตัวเองได้ — ถ้าข้อนี้แดง เคสด้านลบไม่ได้พิสูจน์อะไร", async () => {
      const { data, error } = await A.storage.from(BUCKET).download(filePath);
      expect(error, `เจ้าของโหลดไม่ได้: ${error?.message}`).toBeNull();
      expect(data, "ไฟล์ไม่มีอยู่ = เคส 400 ข้างล่างเขียวเพราะไม่มีไฟล์ ไม่ใช่เพราะด่าน").toBeTruthy();
    });

    it("🔴 E2-AC5 — เปิด public URL จากข้างนอกโดยไม่ล็อกอิน ต้องไม่ได้ไฟล์", async () => {
      const res = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${filePath}`);
      expect(
        res.status,
        "ลิงก์สาธารณะเปิดได้ = ใครที่ได้ลิงก์ไป เปิดใบเสร็จของคนอื่นได้ทันที",
      ).toBeGreaterThanOrEqual(400);
    });

    it("🔴 เปิด object URL ตรง ๆ โดยไม่มี header ก็ต้องไม่ได้", async () => {
      // เส้นนี้ต่างจากเส้น `/public/` — บัคเก็ต private กันเส้นแรก **ไม่ได้กันเส้นนี้โดยอัตโนมัติ**
      const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${filePath}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("ด้านบวก: signed URL ที่เจ้าของสร้าง เปิดได้จริงจากข้างนอก", async () => {
      // 🔴 คู่ตรงข้ามของเคสข้างบน — พิสูจน์ว่า `400` มาจากการกัน ไม่ใช่จากไฟล์ที่ไม่มี
      const { data, error } = await A.storage.from(BUCKET).createSignedUrl(filePath, 60);
      expect(error).toBeNull();
      const res = await fetch(data!.signedUrl);
      expect(res.status, "signed URL เปิดไม่ได้ = ผู้ใช้จริงดูไฟล์ตัวเองไม่ได้").toBe(200);
    });

    it("🔴 คนนอกทริปโหลดไฟล์ไม่ได้", async () => {
      const { error } = await C.storage.from(BUCKET).download(filePath);
      expect(error, "คนนอกโหลดไฟล์การจองของทริปคนอื่นได้").not.toBeNull();
    });

    it("🔴 คนนอกอัปโหลดเข้าโฟลเดอร์ของทริปคนอื่นไม่ได้", async () => {
      // policy ผูกกับ segment แรกของ path ไม่ใช่กับ bucket — เคสนี้เดินเส้นนั้นโดยตรง
      const { error } = await C.storage
        .from(BUCKET)
        .upload(`${tripS}/evil-${stamp}.pdf`, new Blob(["x"], { type: "application/pdf" }));
      expect(error, "คนนอกวางไฟล์ในโฟลเดอร์ทริปคนอื่นได้").not.toBeNull();
    });
  });

});
