import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 **`E6-AC5` — ห้ามทำ offline editing** (`PLAN.md §1`) · เจ้าของ: P3-FE/Perf · 29 ส.ค. 2026
 *
 * ## ทำไมไฟล์นี้ถึงเกิด — และทำไมมันเกิดช้ากว่าที่ควร
 * `AC5` เป็น **ข้อห้าม** และหลักฐานเดียวที่เคยมีคือ *"`grep` แล้วไม่เจอคิวเขียน"*
 * 🎯 ***`grep` ที่ได้ 0 แยกไม่ออกระหว่าง "กันไว้แล้ว" กับ "ยังไม่มีใครลอง"*** — มันให้ผลลัพธ์
 * หน้าตาเดียวกันเป๊ะทั้งสองกรณี · P7 เรียกสภาพนี้ว่า *"`grep 0` ในเสื้อผ้าของด่าน"*
 *
 * **กฎที่ P1 ประกาศ 28 ส.ค. 2026 — ข้อห้ามปิดได้เมื่อครบ 3 อย่าง และไฟล์นี้ทำครบทั้งสาม:**
 * ① ด่านที่ **แดงเมื่อละเมิด** → `ไม่มีคิวเขียนออฟไลน์ในซอร์ส`
 * ② **เคสควบคุมฝั่งบวก** — ป้อนของผิดเข้าไปแล้วตัวสแกนต้องจับได้จริง ไม่ใช่คืนอาเรย์ว่างเสมอ
 * ③ **ด่านที่ไม่มีของให้ตรวจ ต้องแดง ไม่ใช่เขียว** → `ตัวเดินไฟล์ต้องเดินถึงซอร์สจริง`
 *
 * ## ⚠️ ครอบเท่าที่มันครอบ — เขียนไว้ตรงนี้เพราะการแปะชื่อ AC ลอย ๆ สร้างรูใหม่
 * ด่านนี้จับ **คำศัพท์ของคิวเขียน ณ วินาทีที่มีคนเพิ่มมันเข้ามา** — มันคือจุดที่ถูกที่สุดที่จะหยุด
 * เพราะคิวเขียนออฟไลน์ **ไม่เคยถูกเพิ่มโดยบังเอิญ** มันมาพร้อมชื่อของมันเสมอ
 * 🔴 **สิ่งที่มัน *ไม่* พิสูจน์: ว่าแอปปฏิเสธการแก้ไขตอนออฟไลน์จริงในเบราว์เซอร์**
 * นั่นเป็นพฤติกรรม ต้องวัดด้วยการรันจริง ไม่ใช่ด้วยตัวสแกนซอร์ส · **ห้ามอ่านด่านนี้ว่าปิด `AC5` ทั้งข้อ**
 * · ของที่แอบเข้ามาได้โดยไม่ใช้คำพวกนี้ (เช่นเก็บ payload ดิบลง `offlineStore` แล้วยิงทีหลัง)
 *   ด่านนี้มองไม่เห็น — **กันคนที่เผลอ ไม่ได้กันคนที่ตั้งใจเลี่ยง**
 *
 * 📌 หลักที่ทำให้ *อ่านอย่างเดียว* เป็นจริงอยู่แล้ววันนี้ เขียนไว้ที่หัว `lib/localCache.ts` เอง:
 * *"ข้อมูลที่แคชนี้ไม่เคยถูกใช้ตัดสินใจตอนเขียน"* — ด่านนี้กันไม่ให้ประโยคนั้นกลายเป็นเท็จเงียบ ๆ
 */

/** โฟลเดอร์ซอร์สที่โค้ดของผู้ใช้จริงอยู่ — เทสต์ไม่ถูกสแกน (มันต้องพิมพ์คำต้องห้ามได้) */
const ROOTS = ["app", "components", "hooks", "lib"];
const SKIP_DIRS = new Set(["__tests__", "node_modules"]);

/**
 * คำศัพท์ของ "คิวเขียนออฟไลน์" — จับที่ *ชื่อ* ไม่ใช่ที่พฤติกรรม (ดูข้อจำกัดข้างบน)
 * 🔴 ห้ามใส่คำกว้างอย่าง `queue` เปล่า ๆ — `queueMicrotask` เป็นของถูกต้อง มีเคสควบคุมกันไว้ข้างล่าง
 */
const QUEUE_WORDS = [
  "outbox",
  "writeQueue",
  "queueWrite",
  "queueMutation",
  "mutationQueue",
  "pendingWrite",
  "pendingMutation",
  "pendingEdit",
  "replayQueue",
  "flushWrites",
  "enqueueWrite",
  "offlineQueue",
  "deferredWrite",
  "unsyncedChange",
];

/**
 * 🔴 **ตัดคอมเมนต์ *ก่อน* สแกน ไม่ใช่หลัง** — ไฟล์นี้เองพูดถึง `outbox` ในคอมเมนต์หลายครั้ง
 * ตัวสแกนที่อ่านก่อนตัด จะนับคำในคอมเมนต์เป็นการละเมิด แล้วเราจะไป *ยกเว้น* ของที่ไม่เคยต้องยกเว้น
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function queueHits(source: string): string[] {
  const code = stripComments(source);
  const re = new RegExp(`\\b(${QUEUE_WORDS.join("|")})`, "gi");
  return (code.match(re) ?? []).map((s) => s.toLowerCase());
}

function sourceFiles(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, relPath);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push({ file: relPath, source: readFileSync(abs, "utf8") });
    }
  };
  for (const root of ROOTS) walk(join(process.cwd(), root), root);
  return out;
}

describe("🔴 E6-AC5 — ห้ามมีคิวเขียนออฟไลน์ (offline editing)", () => {
  it("🔴 ③ ตัวเดินไฟล์ต้องเดินถึงซอร์สจริง — ด่านที่ไม่มีของให้ตรวจ ต้องแดง ไม่ใช่เขียว", () => {
    /**
     * ถ้าโฟลเดอร์ถูกย้าย/เปลี่ยนชื่อ `sourceFiles()` จะคืน `[]` → เคสข้างล่าง **เขียวโดยไม่ได้ตรวจอะไรเลย**
     * = ย้ายรูป "ผ่านฟรี" เข้าไปอยู่ใน CI ซึ่งแย่กว่าไม่มีด่าน เพราะมันดูเหมือนถูกบังคับแล้ว
     * 🎯 รูปเดียวกับ `tripCacheScope` (`> 5` hook) และ `bookingFileStorageGate` (`examined > 50`)
     */
    const files = sourceFiles();
    expect(
      files.length,
      "ไม่เจอไฟล์ซอร์สพอ — โฟลเดอร์ถูกย้าย/เปลี่ยนชื่อ ไม่ใช่ 'ไม่มีผู้ละเมิด' · แก้ตัวเดิน ไม่ใช่แก้เลขนี้",
    ).toBeGreaterThan(100);
    expect(
      files.reduce((n, f) => n + f.source.length, 0),
      "เดินถึงไฟล์แต่อ่านได้ศูนย์ไบต์ — ตัวอ่านพัง ไม่ใช่ซอร์สว่าง",
    ).toBeGreaterThan(100_000);
  });

  it("🔴 ① ไม่มีไฟล์ไหนสร้างคิวเขียนออฟไลน์", () => {
    const offenders: string[] = [];
    for (const { file, source } of sourceFiles()) {
      const hits = queueHits(source);
      if (hits.length) offenders.push(`${file} → ${[...new Set(hits)].join(", ")}`);
    }
    expect(
      offenders,
      "`E6-AC5` ห้าม offline editing — เจอคำศัพท์ของคิวเขียนในไฟล์พวกนี้:\n  " +
        offenders.join("\n  ") +
        "\n  · ถ้านี่คือการทำ offline editing จริง ต้องให้ P7 แย้งด้วยเหตุผลใหม่ + ผู้ใช้อนุมัติก่อน (`PLAN.md §1`)" +
        "\n  · ถ้าเป็นคำพ้องที่ไม่เกี่ยวกัน อย่าเติม allowlist — **เปลี่ยนชื่อตัวแปร** ถูกกว่าทะเบียนที่ต้องมีคนดูแล",
    ).toEqual([]);
  });

  it("🔴 ② เคสควบคุมฝั่งบวก — ตัวสแกนจับของผิดได้จริง ไม่ใช่คืนอาเรย์ว่างเสมอ", () => {
    const violating = [
      "const outbox: Edit[] = [];",
      "async function flushWrites() { await supabase.from('trip_stops').insert(outbox); }",
      "export const pendingMutations = new Map();",
    ].join("\n");
    const hits = queueHits(violating);
    // 🔴 `assert` ว่าของที่ป้อนเข้าไป *match จริง* — ทิศแดงที่ no-op เงียบ ให้ผลเหมือนทิศแดงที่ล้มเหลวเป๊ะ
    expect(hits).toEqual(["outbox", "flushwrites", "outbox", "pendingmutation"]);
  });

  it("🔴 ② คู่กลับด้าน — คอมเมนต์ต้องไม่ถูกนับ แต่โค้ดบรรทัดเดียวกันต้องถูกนับ", () => {
    // ถ้าตัดคอมเมนต์ไม่ทำงาน บรรทัดแรกจะแดง · ถ้าตัดแรงเกินจนกลืนโค้ด บรรทัดที่สองจะเขียว
    expect(queueHits("// ห้ามมี outbox เด็ดขาด\n/* mutationQueue ก็ห้าม */")).toEqual([]);
    expect(queueHits("const outbox = []; // ห้ามมี outbox เด็ดขาด")).toEqual(["outbox"]);
  });

  it("ของถูกต้องที่ชื่อคล้ายกัน ต้องไม่ถูกจับผิด", () => {
    expect(queueHits("queueMicrotask(() => setReady(true));")).toEqual([]);
    expect(queueHits("const q = new Queue(); // คิวทั่วไป ไม่ใช่คิวเขียน")).toEqual([]);
    expect(queueHits('fetch("https://x/y") // "//" ในสตริงต้องไม่ทำให้ตัวตัดคอมเมนต์กินโค้ดทั้งบรรทัด')).toEqual([]);
  });
});
