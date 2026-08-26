import { testClient, acquireFixtureLock } from "./_testClient";

/**
 * `E0` — reaper: กวาด fixture ทริปที่ **รอบเทสต์ก่อนถูกฆ่ากลางทางทิ้งไว้** (P4 ออกแบบ · P1 อนุมัติ 26 ส.ค. 2026)
 *
 * ## ทำไมมันต้องมี — สาเหตุที่วัดแล้ว ไม่ใช่ที่กลัว
 * วัด engine-dev 26 ส.ค.: **890 fixture ทริปค้าง** · 756/890 สร้างใน 3 ชม.เดียว (ก้อน ๆ ไม่ใช่ทุกรอบ)
 * → ไม่ใช่ afterAll ลบไม่ครบ (วัดแล้ว afterAll รันแม้ beforeAll โยน · FK ลูกตรง cascade หมด)
 * → คือ **process ถูกฆ่าก่อน afterAll ได้รัน** (watch Ctrl-C / timeout / ปิดเซสชันกลางรัน) · SIGKILL ไม่มีอะไรใน process รอด
 * ∴ ทางแก้ไม่ใช่ที่ afterAll — คือ **กวาดตอนเริ่มรัน**: ทุกรอบเก็บสุสานที่รอบก่อนทิ้งไว้
 *
 * ## 🔴 ยังไม่ wire — โดยเจตนา
 * ไฟล์นี้ **ไม่ได้อยู่ใน `globalSetup`** และ **ไม่ใช่ `.test.ts`** → vitest ไม่โหลด · tsc ตรวจได้
 * · เปิดใช้ในหน้าต่างผู้ใช้เท่านั้น 2 ขั้น:
 *     1) เพิ่ม `globalSetup: ["./lib/__tests__/fixtureReaper.ts"]` ใน `vitest.config.mts` test block
 *     2) รันด้วย `FIXTURE_REAPER=1` (+ creds)
 * 🎯 **การตั้ง flag ในหน้าต่าง = การอนุมัติกวาด 890 ครั้งแรก** (P1: การลบ 890 ต้องมาจากผู้ใช้ · sweep แรกของ reaper คือ 890 นั้น)
 *
 * ## 4 เงื่อนไขของ P1 (ข้อ 1 ไม่ต่อรอง)
 * 1. ยืนยัน `app.project_identity` = engine-dev **ก่อนลบอะไรทั้งสิ้น** — fail-closed · reaper ชี้ผิดฐาน = npm test กลายเป็นคำสั่งทำลาย
 * 2. **ไม่ลบ user** — เกณฑ์ user ไม่ครบ (P4 วัดเจอ `…@example.com` หลุด `.test`) · ทริปเท่านั้น
 * 3. **ดังเสมอ พิมพ์จำนวนแม้ 0** — reaper ซ่อน *อาการ* ("รอบถูกฆ่า") · N>50 = รอบใหญ่ตายเงียบ ต้องดังกว่า
 * 4. **แมตช์ 100% ของทริป → ล้ม อย่าลบ** — join พัง ไม่ใช่ไม่มีข้อมูลจริง (รูป subscribers>0)
 * · อายุ + fixture_lock: รอบสดอายุไม่กี่นาที · ลบเฉพาะ >2ชม. · ล็อกกันชนรอบสดที่ยังรันอยู่ (forward-compat: RPC ยังไม่ลง = อาศัยอายุ)
 */

const ENGINE_DEV_REF = "pmvxwcimjebogjfimzqy";
const REAP_MIN_AGE_MS = 2 * 60 * 60 * 1000; // 2ชม. — เผื่อมากกว่าเวลารอบสด (~3นาที) หลายเท่า
const LOUD_THRESHOLD = 50;

type TripRow = { id: string; created_by: string; created_at: string };

export default async function fixtureReaperSetup(): Promise<void> {
  // ── gate: ปิดโดยดีฟอลต์ ──────────────────────────────────────────────────
  if (process.env.FIXTURE_REAPER !== "1") return;

  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!URL_ || !SERVICE) {
    console.error("\n🔴 [fixture-reaper] FIXTURE_REAPER=1 แต่ไม่มี URL/SERVICE creds — ไม่กวาด (fail-closed)\n");
    return;
  }

  // ── เงื่อนไข 1 ชั้น A (test-side · ใช้ได้แม้ RPC ยังไม่ลง): URL ต้องเป็น engine-dev ──
  if (!URL_.includes(ENGINE_DEV_REF)) {
    throw new Error(
      `🔴 [fixture-reaper] URL ไม่ใช่ engine-dev (${ENGINE_DEV_REF}) — .env.local ชี้ผิดฐาน · ปฏิเสธการลบทั้งหมด`,
    );
  }

  const admin = testClient(SERVICE);

  // ── เงื่อนไข 1 ชั้น B (authoritative): ฐานที่เชื่อมต่อจริงต้อง self-identify เป็น engine-dev ──
  //    app.project_identity มองผ่าน PostgREST ไม่ได้ → ผ่าน RPC · fail-closed: ยังไม่ลง/error/false = ไม่ลบ
  const ident = await admin.rpc("assert_engine_dev");
  if (ident.error) {
    if (ident.error.code === "PGRST202") {
      console.error(
        "\n🔴 [fixture-reaper] RPC public.assert_engine_dev ยังไม่ลง — ยืนยัน app.project_identity ไม่ได้ · **ไม่ลบ** (เงื่อนไข 1 fail-closed)\n",
      );
      return;
    }
    throw new Error(`🔴 [fixture-reaper] assert_engine_dev error: ${ident.error.message} — ไม่ลบ`);
  }
  console.error(`\n[fixture-reaper] ยืนยันฐาน engine-dev: ${JSON.stringify(ident.data)}\n`);

  // ── fixture_lock — ถ้ามีชุดสดถืออยู่ ข้ามรอบนี้ (timeout สั้น · globalSetup ห้ามค้าง) ──
  const lock = await acquireFixtureLock(admin, "fixture-reaper", { ttlSeconds: 120, timeoutMs: 15_000 }).catch(
    () => null,
  );
  if (lock === null) {
    console.error("\n[fixture-reaper] มีชุดสดถือล็อกอยู่ — ข้ามการกวาดรอบนี้ (รอบหน้าเก็บ)\n");
    return;
  }

  try {
    // ── ระบุ fixture users: email ลงท้าย `.test` (TLD สงวน RFC 2606 · เป็นคนจริงไม่ได้) ──
    const fixtureUserIds = new Set<string>();
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error(`🔴 [fixture-reaper] listUsers error: ${error.message} — ไม่กวาด`);
        return;
      }
      for (const u of data.users) if ((u.email ?? "").endsWith(".test")) fixtureUserIds.add(u.id);
      if (data.users.length < 1000) break;
    }

    // ── ดึงทริปทั้งหมด ────────────────────────────────────────────────────────
    const trips: TripRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("trips").select("id,created_by,created_at").range(from, from + 999);
      if (error) {
        console.error(`🔴 [fixture-reaper] อ่าน trips error: ${error.message} — ไม่กวาด`);
        return;
      }
      const rows = (data ?? []) as TripRow[];
      trips.push(...rows);
      if (rows.length < 1000) break;
    }

    const fixtureTrips = trips.filter((t) => fixtureUserIds.has(t.created_by));

    // ── เงื่อนไข 4: แมตช์ 100% = join พัง → ล้ม อย่าลบ ─────────────────────────
    if (trips.length > 0 && fixtureTrips.length === trips.length) {
      throw new Error(
        `🔴 [fixture-reaper] เกณฑ์แมตช์ 100% (${trips.length}/${trips.length}) — join/เงื่อนไขพัง ไม่ใช่ไม่มีข้อมูลจริง · ปฏิเสธการลบ`,
      );
    }

    // ── อายุ: ลบเฉพาะ >2ชม. (รอบสดอายุไม่กี่นาที ไม่มีทางโดน) ──────────────────
    const cutoff = Date.now() - REAP_MIN_AGE_MS;
    const reapIds = fixtureTrips.filter((t) => Date.parse(t.created_at) < cutoff).map((t) => t.id);

    // ── ลบเป็นก้อน + นับจริง (เงื่อนไข 2: ทริปเท่านั้น ไม่แตะ user) ─────────────
    let deleted = 0;
    for (let i = 0; i < reapIds.length; i += 100) {
      const chunk = reapIds.slice(i, i + 100);
      const { data, error } = await admin.from("trips").delete().in("id", chunk).select("id");
      if (error) {
        console.error(`🔴 [fixture-reaper] ลบก้อน error: ${error.message}`);
        continue;
      }
      deleted += (data ?? []).length;
    }

    // ── เงื่อนไข 3: ดังเสมอ แม้ 0 ─────────────────────────────────────────────
    if (deleted === 0) {
      console.error(`\n[fixture-reaper] ✓ ไม่มีอะไรต้องกวาด (fixture เก่า >2ชม. = 0 · trips ทั้งหมด ${trips.length})\n`);
    } else if (deleted > LOUD_THRESHOLD) {
      console.error(
        `\n🔴 [fixture-reaper] กวาด ${deleted} ทริปที่รอบก่อนทิ้งไว้ — **>${LOUD_THRESHOLD} = รอบใหญ่ตายกลางทาง** ` +
          `(ถูกฆ่าก่อน afterAll) · reaper ทำความสะอาดได้ **แต่อย่ามองข้ามว่าทำไมรอบถึงถูกฆ่าเป็นก้อน**\n`,
      );
    } else {
      console.error(`\n[fixture-reaper] กวาด ${deleted} ทริปที่รอบก่อน (ถูกฆ่าก่อน afterAll) ทิ้งไว้\n`);
    }
  } finally {
    await lock.release();
  }
}
