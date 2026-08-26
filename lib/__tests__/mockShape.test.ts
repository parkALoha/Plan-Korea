import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripTsComments } from "./_helpers";

/**
 * ด่านจับ `vi.mock` / `vi.doMock` ที่แทนที่**ทั้งโมดูลของเราเอง** — เจ้าของ: P1-Lead
 * (`S6` · P4 พบเป็นตัวที่สองภายในชั่วโมงเดียว จึงยกเป็นกฎ ไม่ใช่แก้ทีละจุด)
 *
 * ## ปัญหา
 * factory ที่ไม่ spread ของเดิมกลับเข้าไป **แทนที่ทั้งโมดูล** — export ตัวอื่นหายหมด
 * และ **กลืน export ใหม่ทุกตัวที่ใครเพิ่มเข้ามาทีหลัง** โดยไม่มีอะไรเตือน
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
 * โอกาสที่ surface จะโตใต้มือเราจึงต่ำกว่ามาก · (P4 ประเมิน ผมเห็นด้วยและไม่ขยายขอบเขต)
 */

const TESTS_DIR = resolve(__dirname);
const SELF = "mockShape.test.ts";

/** ตัดข้อความในวงเล็บที่สมดุลออกมา เริ่มจากตำแหน่งของ `(` */
function balancedCall(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) return src.slice(openParen, i + 1);
    }
  }
  return src.slice(openParen);
}

/**
 * คืนชื่อโมดูล `@/…` ที่ถูก mock แบบแทนที่ทั้งก้อน
 *
 * 🔴 **เช็คว่า *spread ของเดิมกลับเข้าไปจริง* ไม่ใช่แค่ว่า *ตั้งชื่อพารามิเตอร์ว่า `importOriginal`***
 * ฉบับแรกเช็คแค่ชื่อพารามิเตอร์ · P4 ชี้ว่านั่นคือด่านที่ **ทำให้เขียวได้โดยไม่แก้อะไรเลย**:
 * ```ts
 * vi.mock("@/x", async (importOriginal) => ({ a: fake }));  // ← ไม่ spread · ยังแทนทั้งก้อน · ด่านเขียว
 * ```
 * **วิธีที่ง่ายที่สุดที่จะผ่านด่าน ต้องไม่ใช่วิธีที่ไม่ได้แก้ปัญหา** — รูปเดียวกับเคส anon-insert
 * และ `keyRole` ที่เราจับกันได้วันนี้ · ด่านจึงมองหา `...(await importOriginal` ในตัว body
 *
 * ครอบ `vi.doMock` ด้วย — semantics เดียวกันทุกประการ และคนหยิบใช้เวลาต้อง mock ต่างกันรายเคส
 */
export function offendingMocks(rawSrc: string): string[] {
  const src = stripTsComments(rawSrc);
  const bad: string[] = [];
  const re = /vi\.(?:mock|doMock)\(\s*(["'`])((?:@\/|\.\.?\/)[^"'`]+)\1\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const openParen = src.indexOf("(", m.index);
    const call = balancedCall(src, openParen);
    if (!/\.\.\.\s*\(\s*await\s+importOriginal/.test(call)) bad.push(m[2]);
  }
  return bad;
}

const FILES = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".test.ts"));

describe("S6 — vi.mock ของโมดูลเราเอง ต้องไม่แทนที่ทั้งโมดูล", () => {
  it("มีไฟล์เทสต์ให้สแกนจริง และรวมไฟล์ตัวเองด้วย", () => {
    // 🔴 ถ้าไม่มีไฟล์ เคสข้างล่างจะเขียวโดยไม่ตรวจอะไรเลย (P-21)
    expect(FILES.length).toBeGreaterThan(5);
    expect(FILES, "ไฟล์นี้ต้องไม่อยู่นอกกฎของตัวเอง").toContain(SELF);
  });

  it("🔴 ไม่มีไฟล์ไหน mock โมดูล @/ แบบแทนที่ทั้งก้อน", () => {
    const bad = FILES.filter((f) => f !== SELF).flatMap((f) =>
      offendingMocks(readFileSync(join(TESTS_DIR, f), "utf8")).map((m) => `${f} → ${m}`),
    );
    expect(
      bad,
      "ใช้ `async (importOriginal) => ({ ...(await importOriginal()), ...ที่ต้องการแทน })` แทน",
    ).toEqual([]);
  });

  /**
   * 🔴 ไฟล์ตัวเอง **อยู่ในกฎเหมือนกัน แต่ตรึงลิสต์แทนที่จะบังคับให้ว่าง** (P4 เสนอ · รับ)
   *
   * ฉบับแรกผม **ยกเว้นไฟล์นี้ทั้งไฟล์** เพราะเคสด้านบวกต้องมีตัวอย่างของสิ่งที่ห้ามอยู่จริง
   * → ได้ไฟล์ที่อยู่นอกกฎของตัวเอง 1 ไฟล์ ซึ่งเป็นข้อแลกที่ไม่จำเป็น
   *
   * P4 ชี้ว่าที่จับไฟล์นี้ตอนแรก **4 ที่ มี 2 ที่มาจากคอมเมนต์** → ปัญหาจริงคือ *ตัวจับอ่านคอมเมนต์*
   * ซึ่ง**ไม่ได้จำกัดอยู่ที่ไฟล์นี้** · พอตัดคอมเมนต์แล้ว เหลือแค่ตัวอย่างในเคสด้านบวกจริง 2 ตัว
   * → **ตรึงไว้ 2 ตัวนั้น** · ใครเพิ่ม `vi.mock` ของจริงลงไฟล์นี้ **ลิสต์ไม่เท่าเดิม = แดง**
   * · เป็นสำนวนเดียวกับที่รีโปนี้ใช้อยู่แล้ว: ตรึงสถานะที่รู้ ให้การเปลี่ยนเป็นเรื่องที่มีเทสต์เตือน
   */
  it("🔴 ไฟล์นี้ถูกสแกนด้วย — ตัวอย่างที่เหลือต้องเป็นเคสด้านบวกเท่านั้น", () => {
    const self = offendingMocks(readFileSync(join(TESTS_DIR, SELF), "utf8"));
    expect(self, "มี vi.mock ของจริงเพิ่มเข้ามาในไฟล์นี้").toEqual([
      // เคสด้านบวก — ตัวอย่างของสิ่งที่ห้าม ซึ่ง**ต้องมีอยู่จริง**ไม่งั้นพิสูจน์ไม่ได้ว่าตัวจับทำงาน
      "@/lib/auth/server",
      "@/lib/x",
      "@/lib/named-but-not-spread",
      "@/lib/do-mock",
      "@/lib/fn-form",
      "@/lib/backtick",
      // 🎯 พาธสัมพัทธ์ที่เพิ่งขยายให้ครอบ (P1 · P4 · 27 ส.ค.) — ในไฟล์นี้เป็นสตริงตัวอย่าง ตัวจับเห็นถูกแล้ว
      "../rel",
      "./same-dir",
      // 🎯 อีก 2 ตัวนี้มาจากเคสที่ทดสอบว่า *"ที่อยู่ในคอมเมนต์ต้องไม่ถูกจับ"*
      //    ในไฟล์นี้มันเป็น **สตริงในโค้ด** (อาร์กิวเมนต์ที่ส่งให้ `offendingMocks`) ไม่ใช่คอมเมนต์จริง
      //    → ตัวจับเห็นมันถูกต้องแล้ว · `stripTsComments` ตัดคอมเมนต์ **ไม่ตัดเนื้อในสตริง** โดยตั้งใจ
      //    (ตัดเนื้อในสตริงเมื่อไหร่ ชื่อโมดูลจะหายไปด้วย = ตัวจับตายสนิท — ทางที่ปฏิเสธไปแล้ว)
      "@/lib/bad",
      "@/lib/bad2",
    ]);
  });

  describe("ตัวด่านเอง — 2 ทิศ (กฎ E0 ข้อ 1–2)", () => {
    it("ด้านบวก: จับ factory ที่ไม่ spread ของเดิม", () => {
      expect(offendingMocks(`vi.mock("@/lib/auth/server", () => ({ a }));`)).toEqual([
        "@/lib/auth/server",
      ]);
      expect(offendingMocks(`vi.mock("@/lib/x", async () => ({ a }));`)).toEqual(["@/lib/x"]);
    });

    it("🔴 ด้านบวกที่ยากกว่า: ตั้งชื่อ param ว่า importOriginal แต่ไม่ spread — ต้องยังจับได้", () => {
      // ถ้าเคสนี้เขียว แปลว่าด่านทำให้ผ่านได้ด้วยการเติมชื่อ param เฉย ๆ โดยไม่แก้อะไรเลย
      expect(
        offendingMocks(`vi.mock("@/lib/named-but-not-spread", async (importOriginal) => ({ a }));`),
      ).toEqual(["@/lib/named-but-not-spread"]);
    });

    it("ด้านบวก: รูปแบบอื่นที่ให้ผลเหมือนกัน", () => {
      expect(offendingMocks(`vi.doMock("@/lib/do-mock", () => ({ a }));`)).toEqual(["@/lib/do-mock"]);
      expect(offendingMocks(`vi.mock("@/lib/fn-form", function () { return { a }; });`)).toEqual([
        "@/lib/fn-form",
      ]);
      expect(offendingMocks("vi.mock(`@/lib/backtick`, () => ({ a }));")).toEqual([
        "@/lib/backtick",
      ]);
    });

    it("ด้านลบ: รูปแบบที่ถูกต้องต้องไม่ถูกจับ", () => {
      expect(
        offendingMocks(
          `vi.mock("@/lib/ok", async (importOriginal) => ({ ...(await importOriginal()), a }));`,
        ),
      ).toEqual([]);
    });

    it("ด้านลบ: โมดูลภายนอกอยู่นอกขอบเขตโดยตั้งใจ", () => {
      expect(offendingMocks(`vi.mock("next/headers", () => ({ cookies }));`)).toEqual([]);
    });

    it("🔴 ด้านบวก: พาธสัมพัทธ์ที่ชี้เข้าโมดูลเรา ต้องถูกจับ (S6 ครอบ `../` `./` ไม่ใช่แค่ `@/`)", () => {
      // `../toast` = โมดูลของเราเอง ตามเจตนา S6 ทุกตัวอักษร · regex เดิมจับแค่ `@/` → พาธสัมพัทธ์หลุด (P1 เจอ · P4 แก้)
      expect(offendingMocks(`vi.mock("../rel", () => ({ a }));`)).toEqual(["../rel"]);
      expect(offendingMocks(`vi.mock("./same-dir", () => ({ a }));`)).toEqual(["./same-dir"]);
    });

    it("ด้านลบ: พาธสัมพัทธ์ที่ spread ของเดิม ต้องไม่ถูกจับ (กันขยายจนรัดกินของถูก)", () => {
      expect(
        offendingMocks(`vi.mock("../rel-ok", async (importOriginal) => ({ ...(await importOriginal()), a }));`),
      ).toEqual([]);
    });

    it("🔴 ด้านลบ: ที่พูดถึงในคอมเมนต์ต้องไม่ถูกจับ — ไม่งั้นเรากดดันให้ลบคำอธิบายทิ้ง", () => {
      expect(offendingMocks(`// ห้ามเขียน vi.mock("@/lib/bad", () => ({ a }))`)).toEqual([]);
      expect(offendingMocks(`/* vi.doMock("@/lib/bad2", () => ({ a })) ก็ห้าม */`)).toEqual([]);
    });
  });
});
