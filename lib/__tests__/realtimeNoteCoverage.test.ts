import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * ทุกจุดที่ `.subscribe()` ต้องบอกความจริงว่า Realtime ยังไม่ส่ง event — `E3-AC3`
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026
 *
 * ## 🔴 ด่านนี้มีเพราะการขาดไป *หนึ่งจุด* แย่กว่าไม่มีธรรมเนียมนี้เลย
 * `lib/engine/realtimeStatus.ts` มีไว้กันข้อสรุปเดียว: *"โค้ด subscribe อยู่ → แปลว่ามันทำงาน"*
 * — ซึ่งเป็นเท็จ (ไม่มีตารางไหนอยู่ใน publication เลย) และ **ไม่มีอะไรในโค้ดฟ้องความเท็จนั้น**
 * เพราะ `.subscribe()` สำเร็จปกติ แค่ไม่มีอะไรส่งมา
 *
 * 🎯 พอ 8 ตารางพ่นบรรทัดเตือนใน dev console แล้วมีตารางเดียวที่เงียบ
 * **ความเงียบนั้นอ่านได้ว่า "ตัวนี้ต่างจากตัวอื่น คือมันทำงาน"** — ตรงข้ามกับความจริงพอดี
 * · เกิดขึ้นจริงแล้วกับ `usePlans.ts` · คอมเมนต์ในไฟล์นั้นเขียนว่า "8 จุด" ขณะที่ของจริงมี 9
 *   **คนที่ไล่ใส่ตามรายการที่ตัวเองนับ ใส่ครบตามรายการนั้นเสมอ — รายการต่างหากที่ขาด**
 *
 * ## ⚠️ ขอบเขตที่ด่านนี้ทำไม่ได้ และต้องเขียนไว้
 * ตรวจได้แค่ว่า **ไฟล์เดียวกันมีทั้งสองอย่าง** — ตรวจไม่ได้ว่าเรียก*หลัง* `.subscribe()` จริงไหม
 * หรือเรียกครบทุก channel ในไฟล์ที่มีหลาย channel
 * · จงใจไม่ตรวจลำดับ: **ด่านที่ต้องรู้หน้าตาของโค้ดคือด่านที่ต้องเดา** (P4 ค้านรูปนั้นไว้ 26 ส.ค. และถูก)
 * · สิ่งที่ด่านนี้จับได้คือ *"ลืมทั้งไฟล์"* ซึ่งเป็นความพลาดที่เกิดขึ้นจริง ไม่ใช่ความพลาดที่จินตนาการขึ้น
 */

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /^(hooks|components|app|lib)\/.*\.tsx?$/.test(f));

describe("ทุกไฟล์ที่ subscribe realtime ต้องเรียก noteRealtimeSubscribed", () => {
  it("ไล่จากดิสก์ ไม่ใช่จากรายการที่พิมพ์มือ — รายการที่พิมพ์มือคือสิ่งที่ขาดไปครั้งก่อน", () => {
    const offenders: string[] = [];
    let subscribers = 0;

    for (const f of files) {
      if (f === "lib/engine/realtimeStatus.ts") continue; // ไฟล์ที่นิยามธรรมเนียมเอง
      const src = readFileSync(f, "utf8");
      if (!/\.subscribe\(\)/.test(src)) continue;
      subscribers++;
      if (!src.includes("noteRealtimeSubscribed")) offenders.push(f);
    }

    // 🔴 ถ้าเลขนี้เป็น 0 แปลว่าด่านไม่ได้ตรวจอะไรเลย — เขียวเพราะไม่มีอะไรให้ดู ไม่ใช่เพราะผ่าน
    expect(subscribers, "หาไฟล์ที่เรียก .subscribe() ไม่เจอสักไฟล์ — ด่านนี้กำลังตรวจความว่าง").toBeGreaterThan(0);
    expect(offenders, `ไฟล์ที่ subscribe แต่ไม่บอกความจริงเรื่อง publication ว่าง`).toEqual([]);
  });
});
