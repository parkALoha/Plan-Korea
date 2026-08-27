import { describe, expect, it } from "vitest";
import { readEnvKey, requireLiveCreds } from "./_helpers";
import { testClient } from "./_testClient";

/**
 * ล็อกชุดสด (R11) — **ด่านยืนยันพฤติกรรม ยิง RPC ตรง ไม่ผ่าน `acquireFixtureLock`**
 *
 * 🔴 หลัง `①b (a)`: `globalSetup` ถือล็อก **per-run** ตลอดรอบ (`fixtureLockGlobal.ts`) · เทสต์นี้จึง **ไม่ acquire เอง**
 *    (ถ้า acquire จะรอ globalSetup ปลด = ไม่มีวันได้ → hook timeout) · **ห้าม import `acquireFixtureLock`** (ด่าน source บังคับ)
 * 🎯 แทนที่จะเดินเส้นทาง acquire→release เอง → ทดสอบ **คุณสมบัติของล็อก** กับล็อกที่ globalSetup ถืออยู่:
 *    มีคนถือจริง · holder บอก *รอบ* · ขอซ้ำไม่ได้ · คนอื่นปลดไม่ได้
 * · เส้นทาง acquire→release→re-acquire เต็ม ถูกยิงจริง **ทุกรอบโดย globalSetup เอง** (setup/teardown) — มันพัง = รอบทั้งรอบพัง
 * · `fixtureLockRetry.test.ts` ทดสอบกิ่ง error ของ helper (transient/PGRST202/42501) ด้วย fake client แยกต่างหาก
 */
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const hasCreds = Boolean(SERVICE && URL_);

describe("การรันชุดนี้", () => {
  it("🔴 ถ้าบังคับไว้ ต้องมี creds ครบ — ไม่ใช่ข้ามเงียบ ๆ", () => {
    requireLiveCreds(hasCreds, "fixture lock verify", ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });
});

describe.runIf(hasCreds)("fixture lock — คุณสมบัติ (ทดสอบกับล็อกที่ globalSetup ของรอบนี้ถืออยู่)", () => {
  it("มีคนถือจริง · holder = run-… · ขอซ้ำไม่ได้ · คนอื่นปลดไม่ได้", async () => {
    const admin = testClient(SERVICE);
    const probe = await admin.rpc("fixture_lock_holder");
    if (probe.error?.code === "PGRST202") {
      console.warn("\n⚠️  fixture lock RPC ยังไม่ลง — ข้าม (ปกติ RPC ลงแล้วหลัง migration E0) · ด่านนี้ยังไม่ได้ตรวจอะไร\n");
      return;
    }
    if (probe.error) throw new Error(`fixture_lock_holder: ${probe.error.message}`);

    // globalSetup ของรอบนี้ต้องถือล็อกอยู่ (holder = `run-<pid>-<ts>`)
    const holder = (probe.data ?? [])[0]?.held_by as string | undefined;
    expect(holder, "ควรมีคนถือล็อก (globalSetup ของรอบนี้) — ว่าง = globalSetup ไม่ทำงาน หรือไม่มี creds").toBeTruthy();
    expect(holder, "holder ควรระบุ *รอบ* (run-…) ไม่ใช่ไฟล์ (P1: ชื่อบอก 'ใคร' ไม่ใช่แค่ 'อะไร')").toMatch(/^run-/);

    // ขอซ้ำโดย holder อื่น ต้องไม่ได้ (ล็อกถูกถือแล้ว · TOCTOU กันแล้ว)
    expect((await admin.rpc("acquire_fixture_lock", { p_holder: "verify-other", p_ttl_seconds: 60 })).data).toBe(
      false,
    );
    // คนที่ไม่ได้ถือ ปลดไม่ได้ (ปลดได้เฉพาะเจ้าของ) — ถ้าคืน true = ใครก็ปลดล็อกของรอบที่กำลังรันได้
    expect((await admin.rpc("release_fixture_lock", { p_holder: "verify-other" })).data).toBe(false);
    // holder ยังเป็นรอบเดิม (ไม่ถูกใครแย่งไประหว่างตรวจ)
    expect((await admin.rpc("fixture_lock_holder")).data?.[0]?.held_by).toBe(holder);
  });
});
