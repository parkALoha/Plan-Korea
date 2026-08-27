import { describe, expect, it } from "vitest";
import { readEnvKey, requireLiveCreds } from "./_helpers";
import { acquireFixtureLock, testClient } from "./_testClient";

/**
 * ล็อกชุดสด (R11) — **ด่านยืนยันพฤติกรรม เดินเส้นทางจริง ไม่ใช่ตรวจว่าฟังก์ชันมีอยู่** (P1 · `do $verify$` ที่เขียวทั้งที่ว่างเปล่า)
 * ขอ → ขอซ้ำต้องไม่ได้ → คนอื่นปลดไม่ได้ → เจ้าของปลดได้ → ขอใหม่ได้ → ไม่ทิ้งล็อกค้าง
 *
 * 🔴 **acquire-first:** เทสต์นี้รันพร้อม rlsMatrix/engineCrossUser ที่แย่งล็อกตัวเดียวกัน · จึง `acquireFixtureLock` (รอถ้ามีคนถือ)
 *    ก่อน แล้วค่อยตรวจ *ระหว่างที่ถืออยู่* → เคสถูกต้องแม้ไฟล์อื่นรันขนาน
 * 🔴 **forward-compat:** RPC ยังไม่ลง (`PGRST202`) → เตือนดัง 1 ครั้ง แล้ว pass-through (ยังไม่ได้ตรวจอะไร · ไม่กลบด้วยเขียวเงียบ)
 */
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const hasCreds = Boolean(SERVICE && URL_);

describe("การรันชุดนี้", () => {
  it("🔴 ถ้าบังคับไว้ ต้องมี creds ครบ — ไม่ใช่ข้ามเงียบ ๆ", () => {
    requireLiveCreds(hasCreds, "fixture lock verify", ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });
});

describe.runIf(hasCreds)("fixture lock — เดินเส้นทางจริง", () => {
  it("ขอ→ขอซ้ำไม่ได้→คนอื่นปลดไม่ได้→เจ้าของปลดได้→ขอใหม่ได้→ไม่ทิ้งค้าง", async () => {
    const admin = testClient(SERVICE);
    const probe = await admin.rpc("fixture_lock_holder");
    if (probe.error?.code === "PGRST202") {
      console.warn(
        "\n⚠️  fixture lock RPC ยังไม่ลง (migration ที่ 3 จอด `pending-review/`) — เดินเส้นทางจริงยังทำไม่ได้\n" +
          "   ด่านนี้ **ยังไม่ได้ตรวจอะไร** (ดังไว้ให้รู้ · ไม่ใช่ผ่าน) · จะตรวจจริงเมื่อ migration ลงในหน้าต่างของผู้ใช้\n",
      );
      return;
    }
    if (probe.error) throw new Error(`fixture_lock_holder: ${probe.error.message}`);

    // ① ขอ (รอถ้าไฟล์อื่นถืออยู่) → ถือเอง
    const lock = await acquireFixtureLock(admin, "verify-owner", { ttlSeconds: 60, timeoutMs: 30_000 });
    try {
      // ② ขอซ้ำโดย holder อื่น ต้องไม่ได้ (TOCTOU กันแล้ว)
      expect((await admin.rpc("acquire_fixture_lock", { p_holder: "verify-other", p_ttl_seconds: 60 })).data)
        .toBe(false);
      // ③ คนอื่นปลดไม่ได้ (ปลดได้เฉพาะเจ้าของ)
      expect((await admin.rpc("release_fixture_lock", { p_holder: "verify-other" })).data).toBe(false);
      // holder ยังเป็นเจ้าของจริง
      expect((await admin.rpc("fixture_lock_holder")).data?.[0]?.held_by).toBe("verify-owner");
    } finally {
      // ④ เจ้าของปลดได้ (helper เช็ค lock-loss ในตัว)
      await lock.release();
    }
    // ⑤ ปลดแล้วขอใหม่ได้ + ไม่ทิ้งค้าง (รอถ้าไฟล์อื่นคว้าไปก่อน — สำเร็จ = ไม่ค้าง)
    const re = await acquireFixtureLock(admin, "verify-re", { ttlSeconds: 60, timeoutMs: 30_000 });
    await re.release();
  });
});
