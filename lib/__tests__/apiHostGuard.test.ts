import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `E4-AC5` / `E4-AC6` — เกณฑ์สองข้อที่ผ่านด้วย **การไม่มีอยู่** (P1 · 27 ส.ค. 2026)
 *
 * · `AC5`: ห้ามเรียก ODsay / Kakao / Naver API ใหม่แม้แต่ตัวเดียว (ทะเบียนมี*ช่องเสียบ* แต่**ห้ามเสียบ**)
 * · `AC6`: ห้ามเรียก Google Maps legacy (`maps.googleapis.com/maps/api/*`) — คีย์โปรเจกต์นี้ไม่ได้เปิดไว้
 *
 * 🔴 **ทำไมต้องเป็นด่านถาวร ไม่ใช่ `grep` ครั้งเดียวแล้วติ๊ก**
 * เกณฑ์ที่วัดด้วย "ไม่เจออะไรเลย" **ผ่านได้ฟรีตลอดกาล** — และวันที่มีคนเผลอเสียบ
 * มันจะยังติ๊กอยู่ในเอกสาร เพราะไม่มีใครกลับไปรัน `grep` เดิมอีก
 *
 * 🔴 **และวันนี้พิสูจน์แล้วว่า `grep` ครั้งเดียวเชื่อไม่ได้:** ผมรายงาน *"✅ ไม่มี `"kr"` นอกทะเบียน"*
 * จาก `grep -rn lib/ app/ components/` — **โดยไม่ได้ใส่ `data/` ซึ่งเป็นที่ที่มันอยู่** (`P-61`)
 * → ด่านนี้จึงประกาศขอบเขตด้วย `git ls-files` **ไม่ใช่รายชื่อโฟลเดอร์ที่ผมพิมพ์เอง**
 */

/** ทุกไฟล์ต้นฉบับที่ git ติดตาม — ขอบเขตมาจาก git ไม่ใช่จากความจำของคนเขียนด่าน */
function trackedSources(): string[] {
  const out = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { encoding: "utf8" });
  return out.split("\n").filter((f) => f && !f.includes("__tests__"));
}

const FORBIDDEN: { name: string; ac: string; re: RegExp }[] = [
  { name: "Google Maps legacy", ac: "E4-AC6", re: /maps\.googleapis\.com\/maps\/api\//i },
  { name: "ODsay", ac: "E4-AC5", re: /(api\.)?odsay\.com/i },
  { name: "Kakao API", ac: "E4-AC5", re: /(dapi|apis)\.kakao\.com/i },
  { name: "Naver API", ac: "E4-AC5", re: /(openapi\.naver|naveropenapi)\.com/i },
];

/**
 * ⚠️ **ตัดคอมเมนต์ออกก่อนตรวจ** — ไฟล์ของทีมนี้อธิบาย*ข้อห้าม*ด้วยการเขียนชื่อโฮสต์ที่ห้าม
 * ถ้าไม่ตัด ด่านจะแดงใส่คนที่เขียนคำเตือน แล้วคำเตือนจะถูกลบเพื่อให้ CI เขียว — ตรงข้ามกับที่ต้องการ
 * · ตัดแบบหยาบพอ (`//` ทั้งบรรทัด · `/* … *\/` · บรรทัดที่ขึ้นต้นด้วย `*`) เพราะ **พลาดฝั่งเข้มงวดเกิน
 *   ดีกว่าพลาดฝั่งหลวมเกิน** — ถ้าตัดไม่หมด อย่างมากคือแดงแล้วมีคนมาดู
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    // 🔴 `(?<!:)` จำเป็น **ไม่ใช่ของตกแต่ง** — ฉบับแรกเขียน `/\/\/.*$/` เฉย ๆ
    //    แล้ว `"https://dapi.kakao.com/…"` ถูกตัดเหลือ `"https:` เพราะ `//` ของ *โปรโตคอล*
    //    → **ด่านลบ URL ทุกตัวที่มันมีหน้าที่หา** แล้วรายงานว่าสะอาด
    //    ⚠️ เคส self-test ที่ป้อน*สตริง*ให้ regex ตรง ๆ **ผ่านฉลุย** เพราะไม่ได้เดินผ่านบรรทัดนี้
    //    · เคสที่จับได้คือเคสที่เขียนไฟล์ลงดิสก์จริงแล้วเรียก `violationsIn()` ทั้งเส้น
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? "" : l.replace(/(?<!:)\/\/.*$/, "")))
    .join("\n");
}

function violationsIn(files: string[]): string[] {
  const hits: string[] = [];
  for (const f of files) {
    const code = stripComments(readFileSync(f, "utf8"));
    for (const { name, ac, re } of FORBIDDEN) {
      const lines = code.split("\n");
      lines.forEach((l, i) => {
        if (re.test(l)) hits.push(`${f}:${i + 1} — ${name} (${ac})`);
      });
    }
  }
  return hits;
}

describe("E4-AC5/AC6 — โฮสต์ API ที่ห้ามเรียก", () => {
  it("ขอบเขตของด่านมาจาก git และต้องไม่ว่าง", () => {
    // 🔴 ด่านที่สแกน 0 ไฟล์ก็ "ผ่าน" — เคสนี้กันไม่ให้ผ่านเพราะไม่มีอะไรให้มอง
    expect(trackedSources().length).toBeGreaterThan(100);
  });

  it("🔴 self-test: ด่านนี้ยังจับของผิดได้จริง", () => {
    // 🎯 **ด่านที่ไม่เคยเห็นของผิด กับด่านที่พัง หน้าตาเหมือนกันเป๊ะ** (P6 · `guards.sh`)
    //    เคสนี้ป้อนของผิดให้มันโดยตรง — ถ้าวันไหน regex พัง เคสนี้แดงก่อนเคสจริงจะเขียวหลอก
    const bad = 'const u = "https://maps.googleapis.com/maps/api/js?key=x";\nfetch("https://api.odsay.com/v1");';
    expect(FORBIDDEN.filter((f) => f.re.test(bad)).map((f) => f.name)).toEqual(
      expect.arrayContaining(["Google Maps legacy", "ODsay"])
    );
  });

  it("self-test: คอมเมนต์ที่*อธิบาย*ข้อห้าม ต้องไม่ทำให้ด่านแดง", () => {
    const doc = "// ห้ามเรียก maps.googleapis.com/maps/api/* ดู AGENTS.md\nconst x = 1;";
    expect(stripComments(doc)).not.toMatch(/maps\.googleapis\.com/);
  });

  it("🔴 self-test เส้นทางเต็ม: อ่านไฟล์จริงจากดิสก์แล้วต้องแดง", () => {
    // ⚠️ เคส self-test ข้างบนป้อน**สตริง**ให้ regex — พิสูจน์ได้แค่ว่า regex ถูก
    //    **ไม่ได้พิสูจน์ว่า `readFileSync` → `stripComments` → รายงาน ทำงานต่อกันจริง**
    // 🎯 บทเรียนตรง ๆ จาก `do $verify` ที่เขียวทั้งที่ไม่ได้เขียนอะไรเลย (26 ส.ค. 2026):
    //    **ตัวตรวจที่เดินคนละเส้นทางกับของจริง ยืนยันได้แค่เส้นทางของตัวเอง**
    const dir = mkdtempSync(join(tmpdir(), "hostguard-"));
    const f = join(dir, "planted.ts");
    writeFileSync(f, 'export const u = "https://dapi.kakao.com/v2/local/search";\n');
    const hits = violationsIn([f]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("Kakao API");
    expect(hits[0]).toContain("planted.ts:1");
  });

  it("self-test เส้นทางเต็ม: ไฟล์ที่มีแต่คอมเมนต์เตือน ต้องเขียว", () => {
    const dir = mkdtempSync(join(tmpdir(), "hostguard-"));
    const f = join(dir, "warns.ts");
    writeFileSync(f, "/** ห้ามยิง dapi.kakao.com เด็ดขาด */\nexport const x = 1;\n");
    expect(violationsIn([f])).toEqual([]);
  });

  it("🔴 URL บนบรรทัดโค้ดที่มีคอมเมนต์ต่อท้าย — ต้องเห็น URL และตัดคอมเมนต์", () => {
    // เคสนี้คือจุดที่ `(?<!:)` ตัดสินใจถูกหรือผิด · ทั้งสองฝั่งของบรรทัดต้องทำงานพร้อมกัน
    const line = 'const u = "https://api.odsay.com/v1"; // ตัวนี้ห้ามใช้ ดู dapi.kakao.com ด้วย';
    const stripped = stripComments(line);
    expect(stripped).toContain("api.odsay.com");   // URL ในโค้ด: ต้องเหลือ
    expect(stripped).not.toContain("dapi.kakao");  // ชื่อในคอมเมนต์: ต้องหาย
  });

  it("ไม่มีไฟล์ไหนเรียกโฮสต์ต้องห้าม", () => {
    expect(violationsIn(trackedSources())).toEqual([]);
  });
});
