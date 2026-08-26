import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import { readEnvKey } from "./_helpers";
import { testClient } from "./_testClient";
import { BOOKING_FILES_BUCKET } from "@/lib/engine/storageKey";

/**
 * `E3-AC7` — read-only mode ต้องครอบ **`storage.objects`** ไม่ใช่แค่ตาราง `public.*` · เจ้าของ: P4-QA/Sec (27 ส.ค. 2026)
 *
 * ## ช่องที่ P2 เจอ
 * trigger `zz_read_only_guard` ผูก `on public.%I` → **ไม่ครอบ schema `storage`** (ไฟล์ตั๋วอยู่ `storage.objects`)
 * → ระหว่างโหมดอ่านอย่างเดียว **ผู้ใช้ยังลบไฟล์ตั๋วได้** · migration ปิดช่องจอดที่ `pending-review/` (ยังไม่ลง)
 *
 * ## 🔴 ทำไมเทสต์นี้ *ไม่* รันในชุดปกติ — มันเข้า **global** read-only mode จริง
 * `app.system_mode` เป็นแถวเดียว · เข้าโหมด = **บล็อก write ของทุกเซสชันที่ active** ตลอด window
 * storage-api เป็นคนละ connection → เลี่ยง rollback-trick ของ `E3-AC7` (rlsMatrix) ไม่ได้ → **ต้อง commit ธงจริง**
 * → รันเฉพาะใน job `readonly-storage` (**`workflow_dispatch` เท่านั้น** · P6 `7a4fb6a`) ตอนไม่มีใครใช้ engine-dev
 *
 * ## รูปสองเฟส (แทน it.fails เพราะ env-gated อยู่แล้ว — ธงเลือก assertion)
 * · `READ_ONLY_MODE_PHASE=reproduce` → คาด **gap เปิด** (ลบได้) · เขียววันนี้ = ยืนยันช่องเปิด
 * · `READ_ONLY_MODE_PHASE=verify`    → คาด **gap ปิด** (ลบไม่ได้) · แดงวันนี้ · เขียวหลังลง migration
 * 🔴 **CI ลง migration เองไม่ได้** (ไม่มี access token/db password) → กด 2 รอบ มีคนลง migration คั่นกลาง (P6 ③)
 *
 * ## ไม่ skip เมื่อธงไม่ตั้ง — **pass-through + เตือนดัง**
 * `describe.runIf(false)` = skip = ชน run-integrity gate (skipped>0) ในทุก build ปกติ
 * → เคสสด pass-through (ไม่ทำอะไร) เมื่อธงไม่ตั้ง · เคส gate ข้างล่างเตือนดังว่า "ไม่ได้รันเคสสำคัญ" (P1)
 */

const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const ANON = readEnvKey("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const ENABLED = process.env.READ_ONLY_MODE_TEST === "1" && Boolean(URL_ && ANON && SERVICE);
const PHASE = process.env.READ_ONLY_MODE_PHASE === "verify" ? "verify" : "reproduce";

describe("E3-AC7 — read-only mode ต้องครอบ storage.objects (workflow_dispatch เท่านั้น)", () => {
  it("🔴 gate: รันเคสสดเฉพาะเมื่อ READ_ONLY_MODE_TEST=1 — ไม่งั้นเตือนดังว่าไม่ได้รัน", () => {
    if (!ENABLED) {
      console.warn(
        "\n⚠️  readOnlyStorage: **ไม่ได้รันเคสสด** — ต้อง `READ_ONLY_MODE_TEST=1` (job `readonly-storage` · workflow_dispatch)\n" +
          "   เทสต์นี้เข้า *global* read-only mode จริง = บล็อก write ทุกเซสชัน · รันเฉพาะตอนไม่มีใครใช้ engine-dev\n" +
          `   PHASE=reproduce (คาด gap เปิด · ลบได้) | PHASE=verify (คาด gap ปิด · ลบไม่ได้) · ตอนนี้ตีความเป็น '${PHASE}'\n`,
      );
    }
    expect(true).toBe(true);
  });

  const stamp = String(Date.now());
  let admin: SupabaseClient;
  let A: SupabaseClient;
  let tripA = "";

  async function listExists(fname: string): Promise<boolean> {
    // อ่านด้วย admin (ข้าม RLS) — ground truth ว่าไฟล์ยังอยู่ไหม
    const ls = await admin.storage.from(BOOKING_FILES_BUCKET).list(tripA, { search: fname });
    if (ls.error) throw new Error(`list storage: ${ls.error.message}`);
    return (ls.data ?? []).some((f) => f.name === fname);
  }

  beforeAll(async () => {
    if (!ENABLED) return;
    admin = testClient(SERVICE);
    // 🔴 D65: ปฏิเสธถ้าฐานอยู่ในสภาพ unsafe (รวมถึงโหมด/mutation ค้างจากรอบก่อน) — คู่กับ pre-flight ของ job
    const unsafe = await admin.rpc("unsafe_state_reason");
    if (unsafe.error) throw new Error(`เรียก unsafe_state_reason ไม่ได้ (D65): ${unsafe.error.message}`);
    if (unsafe.data) throw new Error(`ฐาน unsafe (D65): ${unsafe.data} — ปฏิเสธที่จะรัน · เคลียร์สภาพฐานก่อน`);
    // user A + trip A + อัปโหลดไฟล์ตั๋วไว้ (นอกโหมด)
    const email = `ros-${stamp}@example.test`, password = `pw-${stamp}`;
    const cu = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (cu.error) throw new Error(`createUser: ${cu.error.message}`);
    A = testClient(ANON);
    const si = await A.auth.signInWithPassword({ email, password });
    if (si.error) throw new Error(`signIn: ${si.error.message}`);
    const trip = await A.rpc("create_trip", { p_title: `ros-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21" });
    if (trip.error) throw new Error(`create_trip: ${trip.error.message}`);
    tripA = trip.data.id as string;
  });

  afterAll(async () => {
    if (!ENABLED) return;
    // 🔴 ออกจากโหมดเสมอ (ตาข่ายจริงคือ expiry สั้นฝั่ง DB ถ้า runner ตาย) — ไม่พึ่ง finally อย่างเดียว
    await admin.rpc("set_system_mode", { p_read_only: false });
    // เก็บกวาด: ลบไฟล์ที่เหลือ + trip + user
    if (tripA) {
      await admin.storage.from(BOOKING_FILES_BUCKET).remove([`${tripA}/pc-${stamp}.txt`, `${tripA}/ph-${stamp}.txt`]);
      const { error } = await admin.from("trips").delete().eq("id", tripA);
      if (error) console.warn(`cleanup trip: ${error.message}`);
    }
    const u = (await admin.auth.admin.listUsers()).data.users.find((x) => x.email === `ros-${stamp}@example.test`);
    if (u) { const { error } = await admin.auth.admin.deleteUser(u.id); if (error) console.warn(`cleanup user: ${error.message}`); }
  });

  it("positive control (นอกโหมด · ไม่ผูก phase): A ลบไฟล์ตั๋วของตัวเองได้ — พิสูจน์กลไก storage/สิทธิ์", async () => {
    if (!ENABLED) return;
    const fname = `pc-${stamp}.txt`, p = `${tripA}/${fname}`;
    const up = await A.storage.from(BOOKING_FILES_BUCKET).upload(p, new Blob(["pc"]), { upsert: true });
    expect(up.error, `setup upload (นอกโหมด) ควรสำเร็จ: ${up.error?.message}`).toBeNull();
    await A.storage.from(BOOKING_FILES_BUCKET).remove([p]);
    expect(await listExists(fname), "นอกโหมด A ควรลบไฟล์ตัวเองได้ (ไฟล์หายไป) — ถ้ายังอยู่ = กลไก/สิทธิ์พัง → phase test อ่านไม่ได้").toBe(false);
  });

  it(`phase=${PHASE}: A ลบไฟล์ตั๋วตอนโหมด read-only เปิด`, async () => {
    if (!ENABLED) return;
    const fname = `ph-${stamp}.txt`, p = `${tripA}/${fname}`;
    const up = await A.storage.from(BOOKING_FILES_BUCKET).upload(p, new Blob(["ticket"]), { upsert: true });
    expect(up.error, `setup upload ควรสำเร็จ (ก่อนเข้าโหมด): ${up.error?.message}`).toBeNull();
    // เข้าโหมด read-only · expiry สั้น (ไม่ null) = ตาข่ายถ้า runner ตาย
    const on = await admin.rpc("set_system_mode", { p_read_only: true, p_reason: "readOnlyStorage test", p_expires_in_minutes: 2 });
    if (on.error) throw new Error(`เข้าโหมด read-only ไม่ได้: ${on.error.message}`);
    let existsAfter: boolean;
    try {
      await A.storage.from(BOOKING_FILES_BUCKET).remove([p]); // gap: สำเร็จ(เปิด) หรือถูกบล็อก(ปิด)
      existsAfter = await listExists(fname);
    } finally {
      await admin.rpc("set_system_mode", { p_read_only: false }); // ออกเสมอ
    }
    if (PHASE === "verify") {
      expect(existsAfter, "verify: หลังลง migration ผู้ใช้ต้องลบไฟล์ตั๋วตอนโหมดเปิด *ไม่ได้* (ไฟล์ต้องยังอยู่)").toBe(true);
    } else {
      expect(existsAfter, "reproduce: วันนี้ gap เปิด — ผู้ใช้ยังลบได้ (ไฟล์หาย) · ถ้าไฟล์ยังอยู่ = migration ลงแล้ว → ใช้ PHASE=verify").toBe(false);
    }
  });
});
