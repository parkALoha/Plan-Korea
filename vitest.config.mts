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
function countTasks(tasks: readonly unknown[]): { skipped: number; total: number } {
  let skipped = 0;
  let total = 0;
  for (const raw of tasks) {
    const t = raw as { type?: string; mode?: string; tasks?: unknown[]; result?: { state?: string } };
    if (t.tasks) {
      const inner = countTasks(t.tasks);
      skipped += inner.skipped;
      total += inner.total;
    } else if (t.type === "test" || t.type === "custom") {
      total += 1;
      if (t.mode === "skip" || t.mode === "todo" || t.result?.state === "skip") skipped += 1;
    }
  }
  return { skipped, total };
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
  },
};

export default defineConfig({
  plugins: [tsconfigPaths()],
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
