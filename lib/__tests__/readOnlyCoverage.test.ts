import { describe, expect, it } from "vitest";
import { readEnvKey, requireLiveCreds, tablesFromMigrations } from "./_helpers";
import { testClient } from "./_testClient";

/**
 * `read_only_uncovered_tables()` — ทุกตาราง `public` ต้องติด trigger `zz_read_only_guard` · เจ้าของ: P4 (27 ส.ค. 2026)
 *
 * คู่ **live** ของหมุด **static** `pin:read-only-coverage` (`schemaPins.test.ts`):
 * · static ไล่ `create table public.X` ในไฟล์ migration ว่ามี event ติด guard
 * · live (ตัวนี้) ยิงฟังก์ชันจริงที่สแกน `pg_catalog` ของฐาน → จับตารางที่ *เกิดจริง* แต่ static มองไม่เห็น
 *   (เช่นตารางที่สร้างนอก migration หรือ guard ที่ไม่ได้ติดจริงแม้ migration เขียนไว้)
 * · ฟังก์ชันอยู่ schema `app` (ไม่ expose) → เรียกผ่าน wrapper `public.read_only_uncovered_tables()`
 *   (`20260827200000` · definer · grant service_role · **ข้อยกเว้นที่ 6 ใน TEAM.md** — P1)
 *
 * 🔴 **เคสนี้พิสูจน์ว่า trigger *ถูกติด* ไม่ใช่ว่า trigger *ทำงาน*** (P1 ย้ำ · ผมเน้นเองตอนรับงาน)
 *    "ทำงาน" (write_is_blocked ตรรกะถูก) คือ `public.read_only_selftest()` — คนละคำถาม คนละฟังก์ชัน
 *
 * 🔴 **กับดักเซตว่าง — `[]` มีสองความหมายที่แยกจากข้างนอกไม่ได้** (P1):
 *    ① "ทุกตารางติด guard ครบ" ← ที่ต้องการ · ② "ตัวไล่ตารางพัง เลยไม่เจออะไร" ← เขียวฟรี
 *    → เคส positive control ข้างล่างยืนยันว่า **ฐานมี public table จริงจำนวนมาก** (จักรวาลไม่ว่าง)
 *      ด้วยฟังก์ชัน *คนละตัว* (`table_exposure`) · รูปเดียวกับ `routeFiles().length > 0` ใน `engineAttackSurface`
 *    ⚠️ **สิ่งที่ control นี้ยัง *ไม่* จับ (จดตรง ๆ ไม่ให้อ่านเกิน):** control ยืนยันแค่ **"จักรวาลไม่ว่าง"**
 *       **ไม่ได้ยืนยันว่า enumerator ของฟังก์ชันเองไม่พัง** — ฟังก์ชันคืน `[]` เท่ากันทั้งตอน "ครอบครบ" และตอน
 *       "base scan พังเลยไม่เจออะไร" · แยกจากข้างนอกไม่ได้ · **airtight จริงต้องมี "ตารางทดสอบที่จงใจไม่ติด guard
 *       แล้วฟังก์ชันต้องเจอ"** — migration แยก (โซน P1 · เสนอไว้ถ้าต้องการ)
 *    · relkind: ฟังก์ชันครอบ **`relkind in ('r','p')`** แล้ว (P1 `f3ee6d5` — ปิดรู partitioned *ก่อน* `E7` มาถึง ไม่ใช่รอ)
 *       · partition **ลูก** ไม่ต้องกังวล — trigger `for each row` บนตาราง partitioned ถูก clone ลงทุก partition โดย Postgres เอง
 */

const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const hasCreds = Boolean(SERVICE && URL_);

describe("การรันชุดนี้", () => {
  it("🔴 ถ้าบังคับไว้ ต้องมี creds ครบ — ไม่ใช่ข้ามเงียบ ๆ", () => {
    requireLiveCreds(hasCreds, "read-only coverage", ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });
});

describe.runIf(hasCreds)("read-only coverage (live · read_only_uncovered_tables)", () => {
  it("🔴 positive control — ตัวไล่เห็น public table จริง > 20 (กันกับดักเซตว่าง ก่อนเชื่อ [] · P1)", async () => {
    // ถ้า creds ผิด/ฐานว่าง/ตัวไล่พัง → เคส [] ข้างล่างเขียวฟรี · ยืนยันจักรวาลจริงด้วยฟังก์ชันคนละตัว
    const admin = testClient(SERVICE);
    const { data, error } = await admin.rpc("table_exposure", { p_tables: tablesFromMigrations() });
    if (error) throw new Error(`table_exposure เรียกไม่ได้: ${error.code} ${error.message}`);
    const seen = new Set(((data ?? []) as { table_name: string }[]).map((r) => r.table_name));
    expect(
      seen.size,
      "live DB เห็น public table < 20 = จักรวาลว่าง/creds ผิด → เคส [] ข้างล่างไม่ได้พิสูจน์ว่าครอบครบ",
    ).toBeGreaterThan(20);
  });

  it("🔴 read_only_uncovered_tables() ต้องคืน [] — ทุกตาราง public (relkind 'r'/'p') ติด zz_read_only_guard", async () => {
    const admin = testClient(SERVICE);
    const { data, error } = await admin.rpc("read_only_uncovered_tables");
    if (error) {
      throw new Error(
        `เรียก read_only_uncovered_tables ไม่ได้: ${error.code} ${error.message}\n` +
          "  PGRST202 = wrapper public. ยังไม่ลงฐาน (20260827200000) · 42501 = grant service_role หาย",
      );
    }
    const uncovered = ((data ?? []) as { table_name: string }[]).map((r) => r.table_name).sort();
    expect(
      uncovered,
      "ตาราง public ที่ไม่มี zz_read_only_guard = เขียนทะลุได้ตอนโหมด read-only เปิด · ตารางใหม่ต้องติด guard ในไฟล์ตัวเอง",
    ).toEqual([]);
  });
});
