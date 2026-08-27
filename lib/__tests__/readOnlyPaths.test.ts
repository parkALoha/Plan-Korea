import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readEnvKey } from "./_helpers";
import { testClient } from "./_testClient";
import { NO_REALTIME_TRANSPORT } from "@/lib/auth/noRealtime";

/**
 * `E3-AC7` — เคสสด **ถาวร** ของเส้นทาง ① DAL และ ② RPC ตอนโหมด read-only เปิด · เจ้าของ: P4 (28 ส.ค. 2026)
 *
 * ## สิ่งที่ปิดช่องนี้
 * `docs/engine/read-only-switch.md` ข้อ 5 เขียนไว้เองว่า *"เคสสดถาวรของ ①② — ยังไม่มี"*
 * · ที่ยืนยันไปแล้วเป็น **one-shot ด้วยมือ** (ยิงครั้งเดียวแล้วจดผล) → **ไม่มีอะไรกันการถอยหลัง**
 * · ① = เขียนผ่าน DAL ตรง ๆ (24 จุดใน `lib/engine/db.ts`) · ② = ผ่าน RPC (11 ตัวที่ไคลเอนต์เรียกได้)
 *
 * ## 🔴 ทำไมมันถึงลงไม่ได้มาก่อน และเงื่อนไข 3 ข้อที่ต้องครบ (P1 ตัดสิน · `read-only-switch.md` ข้อ 8)
 * เปิดโหมดจริงบนฐานที่ **8 เซสชันใช้ร่วมกัน** = ทุกคนที่รันชุดสดพร้อมกันได้ `PT503` หมด (`R11`)
 * **เคสที่พิสูจน์ read-only จะกลายเป็นตัวจุดชนวน `R11` เอง** — เปิดแค่ 200ms ก็โดน
 *   1. ✅ **gate ด้วยธง `READ_ONLY_MODE_TEST=1`** — ไม่รันในชุดปกติ (ธงเดียวกับ `readOnlyStorage`)
 *   2. ✅ **CI ตั้งธงใน job ที่ไม่มีชุดสดอื่นรันขนาน** — `readonly-storage` (P6 · `concurrency: engine-dev-live`)
 *      · ⚠️ **job นั้นต้องรันไฟล์นี้ด้วย** ไม่งั้นเราจะได้เคสที่ไม่เคยรัน **ซึ่งแย่กว่าไม่มีเคส**
 *   3. 🔴 **ปฏิเสธที่จะรันถ้าโหมดเปิดอยู่แล้ว** (= มีคนอื่นอยู่ในหน้าต่างของเขา · เข้าไปซ้อน = cleanup ชนกัน)
 *      **และคืนโหมดใน `finally` เสมอ** ไม่ใช่ท้ายฟังก์ชัน — ข้อนี้ผมตั้งเป็นเงื่อนไขเอง
 *
 * ## 🎯 หน้าต่างสั้นที่สุดเท่าที่ทำได้ — ทดสอบ ① และ ② ใน **หน้าต่างเดียว**
 * ไม่ใช่เปิด-ปิดสองรอบ · ยิ่งหน้าต่างสั้น โอกาสชนเซสชันอื่นยิ่งน้อย (หลักเดียวกับ *"push ทันทีที่เขียว"*)
 *
 * ## ⚠️ เคสด้านบวก **ต้องมาก่อนเปิดโหมด** และมันไม่ใช่ของแถม
 * `read-only-switch.md` ข้อ 7 บันทึกไว้เองว่ารอบแรก P4 ยิงด้วย **id ปลอม** → ได้ `P0001 "ไม่พบรายการนี้"`
 * ซึ่ง **`raise` ที่ขั้น lookup ก่อนถึงบรรทัดที่เขียน**
 * > **"ถูกปฏิเสธ" กับ "ถูกปฏิเสธด้วยเหตุผลที่เรากำลังทดสอบ" เป็นคนละเรื่อง**
 * → เคสนี้จึงพิสูจน์ก่อนว่า **การเขียนชุดเดียวกันนั้นสำเร็จตอนโหมดปิด** แล้วค่อยเปิดโหมด
 *   ถ้าไม่มีขั้นนี้ `PT503` อาจมาจาก args ผิด/แถวไม่มีอยู่ แล้วเราจะอ่านว่า "โหมดทำงาน"
 */

const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const ANON = readEnvKey("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const ENABLED = process.env.READ_ONLY_MODE_TEST === "1" && Boolean(URL_ && ANON && SERVICE);

/** PostgREST แปลง `PT503` ของ trigger เป็น HTTP 503 · ที่ชั้น client เห็นเป็น error code นี้ */
const READ_ONLY_CODE = "PT503";

describe("E3-AC7 — เส้นทาง ①DAL / ②RPC ตอนโหมด read-only (workflow_dispatch เท่านั้น)", () => {
  it("🔴 gate: รันเคสสดเฉพาะเมื่อ READ_ONLY_MODE_TEST=1 — ไม่งั้นเตือนดังว่าไม่ได้รัน", () => {
    if (!ENABLED) {
      console.warn(
        "\n⚠️  readOnlyPaths: **ไม่ได้รันเคสสด** — ต้อง `READ_ONLY_MODE_TEST=1` (job `readonly-storage` · workflow_dispatch)\n" +
          "   เทสต์นี้เข้า *global* read-only mode จริง = บล็อก write ของทุกเซสชันตลอดหน้าต่าง (`R11`)\n" +
          "   🔴 **ถ้า job ไม่ได้รันไฟล์นี้ เราจะมีเคสที่ไม่เคยรัน ซึ่งแย่กว่าไม่มีเคส**\n",
      );
    }
    expect(true).toBe(true);
  });

  const stamp = String(Date.now());
  let admin: SupabaseClient;
  let A: SupabaseClient;
  let tripA = "";

  beforeAll(async () => {
    if (!ENABLED) return;
    admin = testClient(SERVICE);

    // 🔴 **เงื่อนไขข้อ 3 — ปฏิเสธถ้าโหมดเปิดอยู่แล้ว** (มีคนอื่นอยู่ในหน้าต่างของเขา หรือหน้าต่างก่อนค้าง)
    //    เข้าไปซ้อน = `finally` ของสองฝั่งจะปิดโหมดทับกัน แล้วฝั่งที่ยังทดสอบอยู่จะอ่านผลผิด
    const pre = await admin.rpc("system_mode");
    if (pre.error) throw new Error(`อ่าน system_mode ก่อนเริ่มไม่ได้: ${pre.error.message}`);
    const already = (pre.data as { read_only?: boolean }[] | { read_only?: boolean } | null);
    const isOn = Array.isArray(already) ? already[0]?.read_only : already?.read_only;
    if (isOn) {
      throw new Error(
        "🔴 โหมด read-only เปิดค้างอยู่แล้ว — **ปฏิเสธที่จะรัน**\n" +
          "   = มีคนอื่นอยู่ในหน้าต่างของเขา หรือหน้าต่างก่อนหน้าค้าง · เข้าไปซ้อนแล้ว cleanup จะชนกัน",
      );
    }

    const email = `ro-${stamp}@example.test`;
    const password = `pw-${stamp}`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error) throw new Error(`createUser: ${u.error.message}`);
    A = createClient(URL_, ANON, {
      auth: { persistSession: false },
      realtime: { transport: NO_REALTIME_TRANSPORT } as never,
    });
    const si = await A.auth.signInWithPassword({ email, password });
    if (si.error) throw new Error(`signIn: ${si.error.message}`);

    const t = await A.rpc("create_trip", {
      p_title: `ro-${stamp}`,
      p_start_date: "2026-10-11",
      p_end_date: "2026-10-21",
    });
    if (t.error) throw new Error(`สร้างทริป fixture: ${t.error.message}`);
    tripA = t.data.id as string;
  }, 120_000);

  afterAll(async () => {
    if (!ENABLED) return;
    // ตาข่ายสุดท้าย — ถ้าเคสตายกลางทางโดยไม่ผ่าน finally ก็ยังปิดโหมด
    // (`.rpc()` เป็น thenable ไม่ใช่ Promise → ไม่มี `.catch` · ต้อง await แล้วอ่าน `error` เอง)
    const off = await admin.rpc("set_system_mode", { p_read_only: false });
    if (off.error) console.error(`\n🔴 afterAll ปิดโหมดไม่สำเร็จ: ${off.error.message}\n`);
    if (tripA) await admin.from("trips").delete().eq("id", tripA);
  }, 60_000);

  it("ด้านบวก (โหมดปิด) — การเขียนชุดเดียวกันนี้ต้องสำเร็จก่อน ไม่งั้น PT503 ข้างล่างพิสูจน์อะไรไม่ได้", async () => {
    if (!ENABLED) return;
    // ① DAL: เขียนตารางตรง ๆ ผ่าน client ของผู้ใช้
    const ins = await A.from("checklist_items").insert({ trip_id: tripA, text: `pos-${stamp}` }).select("id").single();
    expect(ins.error, `เขียน checklist ตอนโหมดปิดไม่สำเร็จ: ${ins.error?.message}`).toBeNull();
    await A.from("checklist_items").delete().eq("id", ins.data!.id as string);

    // ② RPC: `create_trip` เป็น RPC ที่ไคลเอนต์เรียกได้จริง
    const t = await A.rpc("create_trip", {
      p_title: `pos-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-12",
    });
    expect(t.error, `create_trip ตอนโหมดปิดไม่สำเร็จ: ${t.error?.message}`).toBeNull();
    await admin.from("trips").delete().eq("id", t.data.id as string);
  }, 120_000);

  it("🔴 โหมดเปิด → ① DAL และ ② RPC ต้องถูกบล็อกทั้งคู่ (หน้าต่างเดียว · คืนโหมดใน finally)", async () => {
    if (!ENABLED) return;
    // expiry สั้นเป็นตาข่ายฝั่งฐาน เผื่อ runner ถูกฆ่าก่อน `finally` ได้ทำงาน
    const on = await admin.rpc("set_system_mode", {
      p_read_only: true, p_reason: `readOnlyPaths ${stamp}`, p_expires_in_minutes: 2,
    });
    if (on.error) throw new Error(`เข้าโหมด read-only ไม่ได้: ${on.error.message}`);

    let dalErr: { code?: string; message?: string } | null = null;
    let rpcErr: { code?: string; message?: string } | null = null;
    try {
      const ins = await A.from("checklist_items").insert({ trip_id: tripA, text: `blocked-${stamp}` });
      dalErr = ins.error;
      const t = await A.rpc("create_trip", {
        p_title: `blocked-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-12",
      });
      rpcErr = t.error;
    } finally {
      // 🔴 **`finally` ไม่ใช่ท้ายฟังก์ชัน** — เคสข้างบน throw เมื่อไหร่ โหมดต้องปิดอยู่ดี
      const off = await admin.rpc("set_system_mode", { p_read_only: false });
      if (off.error) console.error(`\n🔴 ปิดโหมดไม่สำเร็จ: ${off.error.message} — expiry ฝั่งฐานคือตาข่ายที่เหลือ\n`);
    }

    expect(dalErr?.code, `① DAL: เขียน checklist สำเร็จตอนโหมดเปิด (หรือถูกปฏิเสธด้วยเหตุอื่น: ${dalErr?.message})`).toBe(READ_ONLY_CODE);
    expect(rpcErr?.code, `② RPC: create_trip สำเร็จตอนโหมดเปิด (หรือถูกปฏิเสธด้วยเหตุอื่น: ${rpcErr?.message})`).toBe(READ_ONLY_CODE);
  }, 180_000);

  it("หลังจบ — โหมดต้องปิดแล้ว (พิสูจน์ว่า finally ทำงาน ไม่ใช่หวังพึ่ง expiry)", async () => {
    if (!ENABLED) return;
    const { data, error } = await admin.rpc("system_mode");
    if (error) throw new Error(`อ่าน system_mode: ${error.message}`);
    const row = Array.isArray(data) ? (data as { read_only?: boolean }[])[0] : (data as { read_only?: boolean });
    expect(row?.read_only, "โหมดยังเปิดค้างหลังเคสจบ — เซสชันอื่นจะเขียนไม่ได้จนกว่า expiry จะหมด").toBe(false);
  }, 60_000);
});
