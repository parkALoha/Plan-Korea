import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ด่านจับ `vi.mock` ที่แทนที่**ทั้งโมดูลของเราเอง** — เจ้าของ: P1-Lead
 * (`S6` · P4 พบเป็นตัวที่สองภายในชั่วโมงเดียว จึงยกเป็นกฎ ไม่ใช่แก้ทีละจุด)
 *
 * ## ปัญหา
 * `vi.mock("@/x", () => ({ a }))` **แทนที่ทั้งโมดูล** — export ตัวอื่นหายหมด
 * และ **จะกลืน export ใหม่ทุกตัวที่ใครเพิ่มเข้ามาทีหลัง** โดยไม่มีอะไรเตือน
 *
 * ## ทำไมต้องเป็นกฎ ไม่ใช่ความระวัง
 * เกิดแล้ว 2 ครั้งในวันเดียว (24 ส.ค. 2026) และครั้งที่สองอยู่บน **`requireUser` = ตัวบังคับสิทธิ์**
 * 🔴 **error ที่ได้ชี้ไปผิดที่:** มันบอกว่า *"ไม่มี export ชื่อนั้น"* ซึ่งอ่านเหมือนบั๊กในโค้ดจริง
 * → ทางแก้ที่ดูสมเหตุสมผลที่สุดคือ**เติม stub ของ export ที่หายลงใน mock**
 * → ถ้า export นั้นคือด่านตรวจสิทธิ์ **เราจะได้เทสต์ที่รับรองโค้ดซึ่งไม่เคยผ่านด่านเลย**
 *
 * > **การซ่อมที่เป็นธรรมชาติที่สุดของบั๊กนี้ คือการปิดด่านความปลอดภัย**
 * > และไม่มีขั้นตอนไหนในนั้นที่รู้สึกผิดปกติ
 *
 * ## ขอบเขต — เฉพาะโมดูลของเราเอง (`@/…`)
 * โมดูลภายนอก (`next/headers` ฯลฯ) **จงใจไม่ครอบ**: เราไม่ได้เป็นคนเพิ่ม export เข้าไปเอง
 * โอกาสที่ surface จะโตใต้มือเราจึงต่ำกว่ามาก · (P4 ประเมินข้อนี้ ผมเห็นด้วยและไม่ขยายขอบเขต)
 */

const TESTS_DIR = resolve(__dirname);

/** `vi.mock("@/…", <factory ที่ไม่รับ importOriginal>)` — คืนชื่อโมดูลที่ผิดกฎ */
function offendingMocks(src: string): string[] {
  const bad: string[] = [];
  // จับ vi.mock("@/…" ตามด้วย argument ที่สอง แล้วดูว่ามี importOriginal ในวงเล็บพารามิเตอร์ไหม
  const re = /vi\.mock\(\s*["'](@\/[^"']+)["']\s*,\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const [, moduleName, params] = m;
    if (!params.includes("importOriginal")) bad.push(moduleName);
  }
  return bad;
}

/**
 * ⚠️ **ยกเว้นไฟล์ตัวเอง — และเหตุผลคือ `D40` ซ้ำรอบที่สามในวันเดียว**
 * เคสด้านบวกข้างล่างต้องมีสตริง `vi.mock("@/…", () => …)` ของจริงอยู่ในไฟล์
 * **ไม่งั้นมันพิสูจน์ไม่ได้ว่าตัวจับทำงาน** → ตัวจับจึงแดงใส่ไฟล์ที่พิสูจน์ตัวมันเอง
 * (เจอตอนรันครั้งแรก: จับ `@/x` · `@/lib/auth/server` · `@/lib/x` ซึ่งเป็นตัวอย่างทั้งหมด)
 *
 * 🔴 **ข้อแลกที่ต้องรู้:** ไฟล์นี้จึงเป็นไฟล์เดียวที่กฎนี้ไม่บังคับ
 * วันนี้ไม่มีผลเพราะที่นี่ไม่มี `vi.mock` ของจริงสักตัว **แต่ถ้าวันหนึ่งมี มันจะไม่ถูกจับ**
 * · ทางเลือกที่ปฏิเสธไป: ตัดสตริงออกก่อน match — จะทำให้ตัวจับ**อ่อนลงกับไฟล์จริงทุกไฟล์**
 *   เพื่อแก้ปัญหาของไฟล์เดียว **แลกผิดทาง**
 */
const SELF = "mockShape.test.ts";

const FILES = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".test.ts") && f !== SELF);

describe("S6 — vi.mock ของโมดูลเราเอง ต้องไม่แทนที่ทั้งโมดูล", () => {
  it("มีไฟล์เทสต์ให้สแกนจริง", () => {
    // 🔴 ถ้าไม่มีไฟล์ เคสข้างล่างจะเขียวโดยไม่ตรวจอะไรเลย (P-21)
    expect(FILES.length).toBeGreaterThan(5);
  });

  it("🔴 ไม่มีไฟล์ไหน mock โมดูล @/ แบบแทนที่ทั้งก้อน", () => {
    const bad = FILES.flatMap((f) =>
      offendingMocks(readFileSync(join(TESTS_DIR, f), "utf8")).map((m) => `${f} → ${m}`),
    );
    expect(
      bad,
      "ใช้ `async (importOriginal) => ({ ...(await importOriginal()), ...ที่ต้องการแทน })` แทน",
    ).toEqual([]);
  });

  describe("ตัวด่านเอง — 2 ทิศ (กฎ E0 ข้อ 1–2)", () => {
    it("ด้านบวก: จับ factory ที่ไม่มี importOriginal ได้", () => {
      expect(offendingMocks(`vi.mock("@/lib/auth/server", () => ({ a }));`)).toEqual([
        "@/lib/auth/server",
      ]);
      expect(offendingMocks(`vi.mock("@/lib/x", async () => ({ a }));`)).toEqual(["@/lib/x"]);
    });

    it("ด้านลบ: รูปแบบที่ถูกต้องต้องไม่ถูกจับ", () => {
      expect(
        offendingMocks(`vi.mock("@/lib/auth/server", async (importOriginal) => ({ a }));`),
      ).toEqual([]);
    });

    it("ด้านลบ: โมดูลภายนอกอยู่นอกขอบเขตโดยตั้งใจ", () => {
      expect(offendingMocks(`vi.mock("next/headers", () => ({ cookies }));`)).toEqual([]);
    });
  });
});
