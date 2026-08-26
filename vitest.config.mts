import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { runIntegrityFailure } from "./lib/__tests__/_runIntegrity";

/**
 * 🔴 **ด่านสุดท้าย: รอบที่มีเคสถูกข้าม ต้องไม่ออกจากโปรเซสด้วยรหัส 0** (P4 · 26 ส.ค. 2026)
 *
 * วัดมาแล้ว: ไม่มี creds + ไม่ตั้ง `RLS_MATRIX_REQUIRED=1` → **`Tests 26 passed | 230 skipped`
 * และ exit 0** · `requireLiveCreds` กันได้เฉพาะเมื่อมีคน**จำได้ว่าต้องตั้งธง**
 * → ตัวนี้ทำให้ **ลืมตั้งธงแล้วยังแดง** · เหตุผลเต็มอยู่ใน `_runIntegrity.ts`
 *
 * 📌 ตั้งใจให้อยู่ที่ reporter ไม่ใช่ในเทสต์: เทสต์ที่ถูกข้ามไปแล้ว **ไม่มีทางตรวจตัวเองได้**
 */
function countTasks(tasks: readonly unknown[]): { skipped: number; total: number; failed: number } {
  let skipped = 0;
  let total = 0;
  let failed = 0;
  for (const raw of tasks) {
    const t = raw as { type?: string; mode?: string; tasks?: unknown[]; result?: { state?: string } };
    if (t.tasks) {
      const inner = countTasks(t.tasks);
      skipped += inner.skipped;
      total += inner.total;
      failed += inner.failed;
    } else if (t.type === "test" || t.type === "custom") {
      total += 1;
      if (t.mode === "skip" || t.mode === "todo" || t.result?.state === "skip") skipped += 1;
      else if (t.result?.state === "fail") failed += 1;
    }
  }
  return { skipped, total, failed };
}

const runIntegrityReporter = {
  onFinished(files: unknown[] = [], errors: unknown[] = []) {
    const counted = countTasks(files);
    // 🔴 job ที่ **ไม่มี creds โดยการออกแบบ** ประกาศตัวเองใน `ci.yml` (เห็นใน diff)
    //    ไม่ใช่ซ่อนไว้ในไฟล์นี้ — รูปเดียวกับ `migration-guard-exempt` / `no-policy-tables`
    const expectSkipped = process.env.EXPECT_SKIPPED_TESTS === "1";
    const why = runIntegrityFailure(
      {
        skipped: counted.skipped,
        suiteErrors: errors.length + files.filter((f) => (f as { result?: { state?: string } }).result?.state === "fail" && !(f as { tasks?: unknown[] }).tasks?.length).length,
        total: counted.total,
      },
      { expectSkipped },
    );
    // 🔴 **พิมพ์จำนวนที่ข้ามเสมอ แม้ตอนผ่อน** — ธงบอกว่า "ไม่ต้องล้ม" ไม่ได้บอกว่า "ไม่ต้องเห็น"
    //    ถ้าวันหนึ่งมีคนตั้งธงผิดที่ ตัวเลขนี้คือสิ่งเดียวที่จะบอกเขา
    if (expectSkipped && counted.skipped > 0) {
      console.error(
        `\n🟡 ข้าม ${counted.skipped} เคส · job นี้ประกาศ EXPECT_SKIPPED_TESTS=1 จึงไม่ล้ม\n` +
          "   ⚠️ ถ้าคุณไม่ได้ตั้งใจตั้งธงนี้ นี่คือรอบที่ไม่ได้ตรวจอะไรเลย\n",
      );
    }
    if (why) {
      console.error(`\n🔴 รอบนี้อ่านเป็น "ผ่าน" ไม่ได้:\n${why}\n`);
      process.exitCode = 1;
    }
    // 🔴 R11 / P-68 — แดงข้ามเซสชัน · **บอกวิธี *แยกแยะ* ไม่ใช่วิธี *ปัดทิ้ง*** (P1 เจอจริง · P4 · 27 ส.ค. 2026)
    //    8 เซสชันรันชุดสดกับ engine-dev ใบเดียวได้ · `D72` บังคับให้รันชุดเต็มก่อน push ทุกครั้ง
    //    → **ยิ่งทำตาม `D72` โอกาสชนยิ่งสูง** · fixture ของเซสชันอื่นถูก `afterAll`/`purge` ลบกลางคัน
    //    = แดงที่ *ผ่านตอนรันไฟล์นั้นเดี่ยว ๆ* · P1 เกือบรายงาน `search_place_names` ว่าพัง ทั้งที่ไม่พัง
    //
    // 🎯 ข้อความนี้ **ไม่ได้บอกว่า "น่าจะเป็นการชน จึงข้ามได้"** — มันบอก *วิธีตรวจ* ที่ปลอดภัยทั้งสองทาง:
    //    ผ่านตอนรันเดี่ยว = ชน (ไม่ใช่ regression) · ล้มตอนรันเดี่ยว = ของจริง (ยืนยันแล้ว)
    //    การกระทำที่สั่ง (รันไฟล์เดี่ยว) แยกแยะ ไม่ได้ปัดทิ้ง — ต่างจาก "assume แดง=ชน=ignore" ที่อันตราย
    if (counted.failed > 0) {
      console.error(
        `\n🟠 มีเคสล้ม ${counted.failed} เคส · ก่อนสรุปว่าเป็น regression:\n` +
          "   รันไฟล์ที่ล้ม *เดี่ยว ๆ* ก่อน — `npx vitest run <ไฟล์นั้น>`\n" +
          "   · ผ่านตอนรันเดี่ยว = fixture ชนข้ามเซสชัน (`R11`/`P-68`) ไม่ใช่ของพัง · อย่า push ทับ อย่าไล่หาบั๊กที่ไม่มี\n" +
          "   · ล้มตอนรันเดี่ยวด้วย = ของจริง ยืนยันแล้ว\n" +
          // 🔴 ตัวตรวจคือ *รันไฟล์เดี่ยว* ไม่ใช่ *รันชุดเต็มอีกรอบ* (P1 เกือบพลาดข้อนี้ · 27 ส.ค.)
          //    เคสเดิมล้มซ้ำข้ามชุดเต็มหลายรอบ **ไม่ใช่หลักฐานว่าเป็นบั๊กจริง** — เคสที่ใช้ fixture
          //    ร่วมมากที่สุดคือเคสที่ชนทุกครั้ง จึงเป็นเคสเดิมเสมอ · "ซ้ำ" เข้ากับการชน ไม่ได้ค้านมัน
          "   ⚠️ รันชุดเต็ม*อีกรอบ*ไม่ใช่การตรวจ — มันชนได้อีก · ล้มเคสเดิมซ้ำ ≠ บั๊กจริง · ต้องรัน *ไฟล์เดี่ยว*\n",
      );
    }
  },
};

export default defineConfig({
  plugins: [tsconfigPaths()],

  /**
   * 🔴 `server-only` — **ตัวจริงมันโยนโดยตั้งใจ และ vitest ไม่ใช่ผู้รับสารของมัน**
   *
   * `lib/engine/db.ts` มี `import "server-only"` เป็นด่านโครงสร้าง (26 ส.ค. 2026 · P4 ไล่กราฟเจอ
   * เส้นทาง client → `db.ts`) · แพ็กเกจนั้นเลือกไฟล์ด้วย export condition `react-server`
   * ซึ่ง **มีเฉพาะตอน Next build** · vitest จึงได้ `index.js` ที่โยนทันทีที่ import
   *
   * 🎯 **การ alias ตรงนี้ไม่ได้ทำให้ด่านอ่อนลงเลยแม้แต่นิดเดียว — ด่านมันอยู่ที่ `next build`**
   * พิสูจน์แล้วด้วยมือ: เติม `import { dayStops } from "@/lib/engine/db"` ลงใน hook ที่มี
   * `"use client"` แล้ว build **ล้มทันที** (`Client Component Browser: ./lib/engine/db.ts`)
   * · ⚠️ แต่แปลว่า **ชุดเทสต์พิสูจน์เรื่องนี้ให้ไม่ได้** ต้องเป็น `next build` ใน CI เท่านั้น
   */
  resolve: {
    alias: [{ find: /^server-only$/, replacement: new URL("./lib/__tests__/_serverOnlyNoop.ts", import.meta.url).pathname }],
  },

  test: {
    environment: "node",

    // 🔴 ค่าเริ่มต้นของ vitest คือ 5s (test) / 10s (hook) — ตั้งมาสำหรับเทสต์ในหน่วยความจำ
    //    **ชุดสดของเราทุก hook คุยกับฐานจริงข้ามอินเทอร์เน็ตจาก runner ของ GitHub**
    //
    // P6 วัดมาแล้ว (25 ส.ค. 2026) และตัวเลขคือเหตุผล ไม่ใช่ความรู้สึก:
    //    job `rls` เมื่อเช้า :   53s
    //    3 รอบล่าสุด        : 3m12s (แดง) · 3m32s (เขียว) · 3m26s (แดง)
    // 🎯 **รอบที่ *เขียว* ใช้เวลานานกว่ารอบที่ *แดง*** → ไม่ใช่ "ช้าแล้วพัง"
    //    แต่เป็น **"อยู่ริมเส้น แล้วแล้วแต่ดวงว่ารอบไหน hook ตัวไหนเกิน 10 วินาที"**
    //
    // ⚠️ **นี่ไม่ใช่การกลบปัญหา** — เทสต์ที่ควรล้มยังล้มเหมือนเดิมทุกเคส
    //    สิ่งที่เลิกเกิดคือ **การล้มเพราะเน็ตช้า ซึ่งอ่านเหมือนบั๊กแต่ไม่ใช่**
    // 🔴 และแดงที่ไม่ใช่บั๊ก **สอนให้คนเลิกอ่านสีของ CI** ซึ่งเป็นโหมดพังที่ไม่มีเทสต์ไหนจับได้
    //    (คู่แฝดของ *"ผมเลิกดู CI หลังจากมันเขียวมาสักพัก"* ที่ P4 ยกไว้ — คนละทิศ ผลเดียวกัน)
    //
    // 🔴 **แก้ 26 ส.ค. — ประโยคเดิมของผมผิด และ P6 วัดมาหักล้าง**
    //    ผมเคยเขียนว่า *"วันที่ 30s ไม่พอ คำตอบคือลด round trip"* · **การลด round trip แก้ *เวลารวม*
    //    ซึ่งไม่ใช่สิ่งที่ล้ม** — สิ่งที่ล้มคือ **ปฏิบัติการเดี่ยวที่สะดุด**
    //
    //    ตัวเลขของ P6: **รอบที่สุขภาพดี ของที่ช้าที่สุดทั้งรอบ = 280 ms**
    //    แล้วอยู่ ๆ มี hook ตัวหนึ่งใช้เกิน 10 วินาที = **~35 เท่าของค่าสูงสุดปกติ**
    //    → **ไม่มีร่องรอยว่าชุดเทสต์กำลังคืบเข้าหาเส้นเลย** · 3m10s มาจากปฏิบัติการเล็ก ๆ จำนวนมาก
    //
    //    · ถ้าการสะดุด **มีขอบเขต** (เช่น retry ของ connection ~10–15s) → **30s ปิดจบจริง**
    //    · ถ้ามัน **ไม่มีขอบเขต** (connection ค้าง) → 30s แค่ทำให้นานขึ้นกว่าจะโผล่
    //    🔴 **ข้อมูลที่มีแยกสองอย่างนี้ไม่ออก** — vitest รายงานเวลาของ hook **เฉพาะตอนมัน timeout เท่านั้น**
    //
    //    📌 **คำตอบที่ถูกที่สุดคือรอ ไม่ใช่วัดเพิ่มตอนนี้:** ถ้ามันแดงอีกครั้งด้วยเหตุเดิม
    //    **นั่นคือคำตอบทันทีว่า "แค่บางลง"** และตอนนั้นค่อยจับเวลาใน `beforeAll` เอง (โซน P4)
    //    ⚠️ **เขียว 2 รอบไม่ได้พิสูจน์ว่าแก้ได้** — ก่อนแก้ก็เขียวสลับแดง · ที่พิสูจน์ได้เชิงโครงสร้าง
    //    คืออาการเดิม (`timed out in 10000ms`) **เกิดไม่ได้แล้ว** ถ้าไม่เกิน 30s
    hookTimeout: 30_000,
    testTimeout: 30_000,

    reporters: ["default", runIntegrityReporter],
  },
});
