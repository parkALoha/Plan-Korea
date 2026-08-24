import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
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
  // คีย์รุ่นใหม่ — ไม่มีจุด ไม่มี payload ให้ถอด แยกได้จาก prefix เท่านั้น
  if (key.startsWith("sb_publishable_")) return "anon";
  if (key.startsWith("sb_secret_")) return "service_role";

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
    const client = createClient(URL_, ANON, { auth: { persistSession: false } });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`ล็อกอิน ${tag} ไม่ได้: ${signIn.error.message}`);
    return client;
  }

  beforeAll(async () => {
    admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    D = createClient(URL_, ANON, { auth: { persistSession: false } });

    // กับดักที่ 1 — key ที่ client ทดสอบถือ ต้องเป็น anon เท่านั้น
    expect(keyRole(ANON), "NEXT_PUBLIC_SUPABASE_ANON_KEY ไม่ใช่ anon key").toBe("anon");
    expect(keyRole(SERVICE), "SUPABASE_SERVICE_ROLE_KEY ไม่ใช่ service_role key").toBe("service_role");

    A = await makeUser("a");
    B = await makeUser("b");
    C = await makeUser("c");

    const mk = async (client: SupabaseClient, owner: string, title: string) => {
      const { data, error } = await client
        .from("trips")
        .insert({ created_by: ids[owner], title, start_date: "2026-10-11", end_date: "2026-10-21" })
        .select("id")
        .single();
      if (error) throw new Error(`สร้างทริป ${title} ไม่ได้: ${error.message}`);
      return data.id as string;
    };
    tripA = await mk(A, "a", `matrix-A-${stamp}`);
    tripB = await mk(B, "b", `matrix-B-${stamp}`);
  });

  afterAll(async () => {
    // ลบเฉพาะของรอบนี้ — ห้าม truncate ห้ามลบแบบกวาด (staging เป็นของกลาง ไม่มี PITR)
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id).catch(() => {});
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
});
