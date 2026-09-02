import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { stripTsComments } from "./_helpers";

/**
 * `E3-AC9` ① — **`.upsert()` ต้องมี `update` grant รองรับ ไม่งั้นเขียนไม่ลงและเงียบ**
 * เจ้าของ: P1-Lead · 2 ก.ย. 2026
 *
 * ## 🔴 เหตุผลที่ AC ข้อนี้เรียกร้อง *เทสต์* ไม่ใช่ *ย่อหน้าเตือน*
 * `20260825152400_e2_caches.sql:12` เขียนบั๊กนี้ไว้เองตั้งแต่ 25 ส.ค.:
 * > *"ฝั่งเขียน `travel_time_cache` ขาด UPDATE policy อยู่แล้วทั้งที่โค้ดเรียก `.upsert()`"*
 * 🎯 **ย่อหน้านั้นมีอยู่จริง และมันไม่ได้ช่วยเลย** — นั่นคือหลักฐานว่า AC ข้อนี้ถูก
 *
 * ## 🎯 สองแหล่งอิสระ — ไม่ใช่ทะเบียนที่ตรวจตัวเอง
 * ```
 * เซต A  จุดที่โค้ดเรียก .upsert()   ←  app/ + lib/ (ซอร์สแอป)
 * เซต B  ตารางที่มี update grant     ←  supabase/migrations/*.sql
 * ```
 * คนละไฟล์ คนละกลไก คนละคนเขียน · **A \ B ต้องว่าง**
 *
 * ## ⚠️ ขอบเขต — วัดจาก *ไฟล์* ไม่ใช่ *ฐาน*
 * ใครรัน `grant` จาก SQL editor ด่านนี้มองไม่เห็น (drift ที่ทีมเจอของจริงมาแล้ว 1 ก.ย.)
 * 🔴 **นี่คือขอบเขต ไม่ใช่ข้อบกพร่องที่จะแก้ทีหลัง** — ด่านที่วัดจากไฟล์ตอบได้แค่ *"สัญญาในรีโปตรงกันไหม"*
 */
const ROOT = join(__dirname, "..", "..");
const MIGRATIONS = join(ROOT, "supabase-platform", "supabase", "migrations");

/** เซต A — ตารางที่โค้ดแอปเรียก `.upsert()` · `git ls-files` = เห็นเฉพาะไฟล์ที่ติดตามแล้ว */
function tablesUpserted(): string[] {
  const files = execFileSync("git", ["ls-files", "app", "lib"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__"));
  const hits = new Set<string>();
  for (const f of files) {
    /**
     * 🔴 **ใช้ `stripTsComments` ของกลาง ไม่เขียนเอง** — ด่าน `check-naive-strip` จับฉบับแรกของผมได้
     * ผมเขียน `.replace(/^\s*\/\/.*$/gm, "")` ซึ่ง **ยิงจริงแล้วไม่กิน `https://`** (anchor `^\s*` กันไว้)
     * · 🔴 **แต่มันไม่ตัดคอมเมนต์ *ท้ายบรรทัด*** — `const a = 1; // …` รอดทั้งบรรทัด
     *   → คอมเมนต์ที่พูดถึง `.upsert()` ต่อท้ายโค้ดจะถูกนับเป็นจุดเรียก **เงียบ ๆ**
     * 🎯 **ด่านจับด้วยเหตุผลที่ผิด (กลัวกิน URL) แต่ผลลัพธ์ถูก — ของกลางครอบเคสที่ผมพลาดจริง**
     * · ผมจึงไม่ใส่ตัวเองลง `naive-strip-allowed` ทั้งที่ทำได้ · **allowlist แก้ให้ด่านเงียบ ไม่ได้แก้ให้โค้ดถูก**
     */
    const src = stripTsComments(readFileSync(join(ROOT, f), "utf8"));
    for (const m of src.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)[\s\S]{0,200}?\.upsert\(/g)) {
      hits.add(m[1]);
    }
  }
  return [...hits].sort();
}

/** เซต B — ตารางที่ migration ให้สิทธิ์ `update` (ให้ role ไหนก็นับ) */
function tablesWithUpdateGrant(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8").replace(/^\s*--.*$/gm, "");
    for (const m of sql.matchAll(/grant\s+([a-z, ]+?)\s+on\s+public\.([a-z_]+)/gi)) {
      if (/\bupdate\b/i.test(m[1])) out.add(m[2]);
    }
  }
  return out;
}

describe("E3-AC9 ① — .upsert() ต้องมี update grant", () => {
  /** ⚠️ ควบคุมเครื่องวัดฝั่ง A — ถ้าสแกนไม่เจออะไรเลย เคสหลักจะเขียวฟรีตลอดกาล */
  it("เครื่องวัดทำงาน: สแกนเจอจุด `.upsert()` มากกว่า 0", () => {
    expect(tablesUpserted().length, "สแกนไม่เจอ `.upsert()` เลย — regex พังหรือรูปโค้ดเปลี่ยน").toBeGreaterThan(0);
  });

  /** ⚠️ ควบคุมเครื่องวัดฝั่ง B — ถ้าอ่าน grant ไม่เจอเลย ทุกตารางจะดู "ไม่มีสิทธิ์" แล้วเคสหลักแดงปลอม */
  it("เครื่องวัดทำงาน: อ่าน `update` grant จาก migration เจอมากกว่า 0", () => {
    expect(tablesWithUpdateGrant().size, "อ่าน grant ไม่เจอเลย — path migration ผิดหรือรูป SQL เปลี่ยน").toBeGreaterThan(0);
  });

  /**
   * 🔴 **`it.fails` = ผ่าน แปลว่า *บั๊กยังเปิดอยู่ตามที่บันทึกไว้* ไม่ใช่ *ผ่านเกณฑ์***
   * ⚠️ P3 เตือนวันนี้ว่าบรรทัดสรุปของ vitest ไม่พิมพ์ชื่อเคสเมื่อไฟล์ผ่านทั้งไฟล์ —
   * **`8/8 ผ่าน` ของไฟล์นี้จึงอ่านว่า "สะอาด" ไม่ได้** ต้องเปิดไฟล์
   *
   * 🎯 **พลิกเป็นแดงเมื่อ:** มีคน `grant update` ให้ทั้งสามตาราง (ต้องผ่าน P1 + ผู้ใช้ตามกติกา
   * ข้อยกเว้น `service_role` ซึ่งมีจดไว้แล้ว 6 ข้อ) → **ตอนนั้นให้ลบ `.fails` ทิ้ง ไม่ใช่ลบเคส**
   */
  it.fails("🔴 xfail · บั๊กเปิดอยู่: มีตารางที่ `.upsert()` โดยไม่มี update grant", () => {
    const granted = tablesWithUpdateGrant();
    const missing = tablesUpserted().filter((t) => !granted.has(t));
    expect(missing, `ตารางที่เขียนไม่ลงและเงียบ: ${missing.join(" · ")}`).toEqual([]);
  });

  /**
   * ✅ **เคสที่ตรึงขอบเขตของบั๊กไว้ — ถ้ามันโตขึ้น เคสนี้แดง (ไม่ใช่ `xfail` ที่เงียบ)**
   * 🔴 สามตารางนี้คือทั้งหมดที่รู้จัก ณ 2 ก.ย. 2026 · ตารางที่สี่ = ถอยหลัง ต้องมีคนเห็น
   */
  it("🔴 ratchet: บั๊กนี้ครอบ 3 ตารางเท่านั้น — เพิ่มขึ้น = ถอยหลัง", () => {
    const granted = tablesWithUpdateGrant();
    const missing = tablesUpserted().filter((t) => !granted.has(t));
    expect(missing.sort()).toEqual(
      ["place_details_cache", "place_photo_cache", "travel_time_cache"].sort(),
    );
  });
});
