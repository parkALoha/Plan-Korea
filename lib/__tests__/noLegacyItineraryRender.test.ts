import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyLegacyDayPlan } from "@/lib/engine/legacyDayPlan";

/**
 * 🔴 **`E7-AC9` (รูปใหม่ · 29 ส.ค. 2026) — *ไม่มีหน้าไหนเรนเดอร์ `ITINERARY` ให้ทริปใดเลย***
 * เจ้าของ: P3-FE/Perf · เกณฑ์เดิม (*"เพิ่มคอลัมน์ตัวระบุแล้วผู้เรียกเช็คก่อนส่งเข้า `buildDayBridge`"*)
 * ถูกถอนโดย P1 เมื่อ 29 ส.ค. 2026 หลัง P3 ไล่ซอร์สแล้วพบว่า **ผู้บริโภคของตัวระบุนั้นหายไปก่อน `E7` แล้ว**
 * (4 hook ส่ง `buildDayBridge([], …)` ทั้งหมด) → คอลัมน์นั้นจะไม่มีใครอ่านตั้งแต่วันที่ลง
 *
 * ## 🔴 คุณค่าทั้งหมดของด่านนี้อยู่ที่ *มันถูกประเมินซ้ำหลัง `E7` ลง* (P7 ชี้)
 * เกณฑ์นี้ **เป็นจริงอยู่แล้ววันนี้** → ถ้าเป็นแค่ช่องติ๊ก มันคือ *ผ่านฟรี* (ขา ② ที่ทีมไล่กันคืน 28 ส.ค.)
 * · สิ่งที่ทำให้ไม่ใช่: ด่านอยู่ใน CI → **วันที่ `E7` ย้ายข้อมูลเข้าฐาน แล้วมีคนอยากเปิดสองหน้ากลับมา
 *   เร็ว ๆ ด้วยการคืนสถานะ `"legacy"` มันจะแดงทันที** ไม่ใช่ผ่านไปเงียบ ๆ เพราะ "AC ติ๊กไปแล้ว"
 * · 🎯 **`E7` ไม่ได้ทำให้เกณฑ์นี้เป็นจริง — มันทำให้ *แรงจูงใจที่จะละเมิด* เกิดขึ้นครั้งแรก**
 *   (ก่อน `E7` การเรนเดอร์ `ITINERARY` ผิดเสมอ · หลัง `E7` ข้อมูลตรงกัน จึงเริ่ม *ดูเหมือน* ทางลัดที่ใช้ได้)
 *
 * ## ทำไมสแกน source พอ ไม่ต้องรอ `E7` รัน (P7 ยืนยัน)
 * ไม่มีผู้เรียกไหนส่ง `ITINERARY` เข้าสะพานเลย → **ไม่มีสภาพข้อมูลใดที่ทำให้เรนเดอร์ได้**
 * สถานะของฐานจึงไม่ใช่ตัวแปรของคำถามนี้ · คำถามคือ *"โค้ดมีทางไปถึงจุดนั้นไหม"*
 *
 * ## ⚠️ ครอบเท่าที่มันครอบ
 * · ✅ ชนิดข้อมูลของด่านไม่มีสมาชิกที่เรนเดอร์ได้ · ✅ ตัวตัดสินไม่มีกิ่งคืนค่านั้น · ✅ สองหน้ายังต่อด่านอยู่จริง
 * · ❌ **ไม่ได้พิสูจน์ว่าเบราว์เซอร์แสดงอะไรบนจอ** — นั่นต้องรันจริง · ห้ามอ่านว่าปิด `E7-AC9` ทั้งข้อ
 * · 📌 `dayBridge.test.ts:283` ตรวจ *ผู้เรียกส่งอะไรเข้าสะพาน* · ไฟล์นี้ตรวจ *หน้ามีทางเรนเดอร์ไหม*
 *   **สองชั้น ไม่ซ้ำกัน** — ถ้าใครเติม `ITINERARY` กลับเข้าสะพาน ตัวนั้นแดง · ถ้าใครคืนสถานะ `"legacy"`
 *   โดยไม่แตะสะพาน **ตัวนั้นเขียว ตัวนี้แดง**
 */

const GATE_FILE = "lib/engine/legacyDayPlan.ts";
const PAGES = ["app/today/page.tsx", "app/summary/page.tsx"];

/** สถานะที่อนุญาต — **ไม่มีตัวไหนทำให้เรนเดอร์ `ITINERARY` ได้** · สมาชิกใหม่ = ต้องมาคุยกัน ไม่ใช่เติมเงียบ */
const ALLOWED_STATES = ["loading", "unreadable", "unsupported"];

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * สมาชิกของ `type LegacyDayPlanState = "a" | "b" | …`
 * 🔴 คืน `null` เมื่อ **หาไม่เจอ** — ผู้เรียกต้องแยก *"ไม่มีสมาชิกผิด"* ออกจาก *"อ่านไม่เจอสักตัว"*
 *    (ถ้าคืน `[]` ทั้งสองกรณี เคสข้างล่างจะเขียวตอนไฟล์ถูกเปลี่ยนรูป = ด่านหายไปเงียบ)
 */
function stateUnionMembers(source: string): string[] | null {
  const m = stripComments(source).match(/export\s+type\s+LegacyDayPlanState\s*=([^;]+);/);
  if (!m) return null;
  const members = m[1].match(/"([^"]+)"/g);
  return members ? members.map((s) => s.slice(1, -1)) : [];
}

/** ค่าสตริงทุกตัวที่ถูก `return` ในไฟล์ (ตัดคอมเมนต์ก่อน) */
function returnedStringLiterals(source: string): string[] {
  return (stripComments(source).match(/return\s+"([^"]+)"/g) ?? []).map((s) =>
    s.replace(/^return\s+"/, "").replace(/"$/, ""),
  );
}

describe("🔴 E7-AC9 — ไม่มีหน้าไหนมีทางเรนเดอร์ ITINERARY ให้ทริปใด", () => {
  it("🔴 ③ อ่านไฟล์ด่านได้จริง และ *แจงชนิดข้อมูลออก* — อ่านไม่ออกต้องแดง ไม่ใช่เขียวเปล่า", () => {
    const source = read(GATE_FILE);
    expect(source.length, `${GATE_FILE} ว่าง/อ่านไม่ได้ — ไม่ใช่ 'ไม่มีของผิด'`).toBeGreaterThan(1_000);
    expect(
      stateUnionMembers(source),
      `แจง \`LegacyDayPlanState\` ไม่ออก — ไฟล์ถูกเปลี่ยนรูป (ย้าย type / เปลี่ยนชื่อ / ใช้ enum)\n` +
        "  🔴 ต้องแก้ตัวแจง ไม่ใช่ลบเคสนี้ — ถ้าปล่อยไว้ เคสข้างล่างจะเขียวโดยไม่ได้ตรวจอะไรเลย",
    ).not.toBeNull();
  });

  it("🔴 ① ชนิดข้อมูลของด่านมีเฉพาะสถานะที่เรนเดอร์ ITINERARY ไม่ได้", () => {
    const members = stateUnionMembers(read(GATE_FILE));
    expect(
      [...(members ?? [])].sort(),
      "สมาชิกของ `LegacyDayPlanState` เปลี่ยนไป — ตัวที่เพิ่มมาทำให้หน้าเรนเดอร์ `ITINERARY` ได้หรือเปล่า\n" +
        "  · ถ้าใช่: นี่คือสิ่งที่ `E7-AC9` ห้าม · ถ้าไม่ใช่: แก้ `ALLOWED_STATES` พร้อมเหตุผล ไม่ใช่ลบเคส",
    ).toEqual([...ALLOWED_STATES].sort());
  });

  it("🔴 ① ตัวตัดสินไม่มีกิ่งไหนคืนสถานะนอกรายการ", () => {
    const returned = [...new Set(returnedStringLiterals(read(GATE_FILE)))].sort();
    expect(returned.filter((s) => !ALLOWED_STATES.includes(s))).toEqual([]);
    // และต้องคืน "อะไรบางอย่าง" จริง ๆ — ถ้าฟังก์ชันถูกรื้อจนไม่มี return สตริงเลย เคสบนจะเขียวเปล่า
    expect(returned.length, "ไม่เจอ `return \"…\"` สักตัว — ตัวตัดสินถูกรื้อ ต้องมาดู ไม่ใช่ปล่อยผ่าน").toBeGreaterThan(0);
  });

  it("🔴 ① พฤติกรรมจริงของตัวตัดสิน — ทุกอินพุตต้องได้สถานะที่เรนเดอร์ไม่ได้", () => {
    const day = { id: "x", date: "2026-10-11" };
    const elevenDays = Array.from({ length: 11 }, (_, i) => ({ id: `d${i}`, date: `2026-10-${11 + i}` }));
    // 🔴 แถว 11 วันตรงช่วงทริปจริง = เคสที่เกณฑ์รุ่นก่อน ๆ ตอบ "legacy" แล้วแสดงแผนเกาหลีทับทริปคนอื่น
    for (const rows of [null, [], [day], elevenDays]) {
      expect(ALLOWED_STATES).toContain(classifyLegacyDayPlan(rows));
    }
    expect(classifyLegacyDayPlan(null)).toBe("unreadable");
    expect(classifyLegacyDayPlan(elevenDays)).toBe("unsupported");
  });

  /**
   * 🔴 **แก้ 30 ส.ค. 2026 พร้อม `B6` — เกณฑ์เดิมบังคับชื่อ `useLegacyDayPlanGate` ตัวเดียว**
   * `B6` เปลี่ยน *คนตอบ* คำถาม *"หน้านี้เรนเดอร์ทริปนี้ได้ไหม"* จาก `useLegacyDayPlanGate`
   * เป็นสถานะของ `usePlatformItinerary` (แหล่งของวันเป็นฐานของทริปนั้นเองแล้ว)
   * 🎯 **เกณฑ์ที่ถูกคือ *"มีประตูสักตัวก่อนเรนเดอร์วัน"* ไม่ใช่ *"เรียกฟังก์ชันชื่อนี้"*** —
   *    ผมเขียนเกณฑ์เดิมผูกกับ **ชื่อ** จึงต้องมาแก้ตอนชื่อเปลี่ยน · เกณฑ์ที่ผูกกับ *คุณสมบัติ* ไม่ต้อง
   *    (รูปเดียวกับ `waiting-on-user.md §3.10`: กฎที่ผูกกับ *เครื่องมือ* ไม่ถูกใช้กับเครื่องมือถัดไป)
   * ⚠️ **แก้เกณฑ์ ไม่ใช่ลบเคส** — ตรงกับ *"ทะเบียนต้องผิดได้"* ของ P4 · P1 อนุมัติล่วงหน้าไว้แล้ว
   */
  it("🔴 ① สองหน้ายังมีประตูก่อนเรนเดอร์วัน — ถอดด่านออกเงียบ ๆ ไม่ได้", () => {
    const GATES = ["useLegacyDayPlanGate", "usePlatformItinerary"];
    const missing = PAGES.filter((p) => {
      const src = stripComments(read(p));
      return !GATES.some((g) => src.includes(g));
    });
    expect(
      missing,
      `หน้าพวกนี้ไม่มีประตูสักตัวแล้ว: ${missing.join(", ")}\n` +
        `  · ประตูที่รับได้: ${GATES.join(" หรือ ")}\n` +
        "  · ถ้าเพิ่มประตูแบบใหม่ ให้เติมชื่อเข้า `GATES` พร้อมเหตุผล — อย่าลบเคสนี้",
    ).toEqual([]);
  });

  it("🔴 ① เคสควบคุมของประตู — ตัวตรวจต้องจับ 'ไม่มีประตูเลย' ได้จริง", () => {
    // ถ้าไม่มีเคสนี้ `GATES.some(...)` ที่กว้างขึ้นอาจกลายเป็น "ผ่านเสมอ" โดยไม่มีใครรู้
    const GATES = ["useLegacyDayPlanGate", "usePlatformItinerary"];
    const noGate = "export default function Page() { return <div>{days.map(d => d.id)}</div>; }";
    expect(GATES.some((g) => stripComments(noGate).includes(g))).toBe(false);
    expect(GATES.some((g) => stripComments("const s = usePlatformItinerary(id, true);").includes(g))).toBe(true);
  });

  it("🔴 ② เคสควบคุมฝั่งบวก — ยัด `\"legacy\"` กลับเข้าไป ตัวสแกนต้องจับได้ทั้งสองชั้น", () => {
    const real = read(GATE_FILE);
    const union = 'export type LegacyDayPlanState = "loading" | "unreadable" | "unsupported";';
    // 🔴 `assert` ว่าการยัดของผิด match จริง — ทิศแดงที่ no-op เงียบ ให้ผลเหมือนทิศแดงที่ล้มเหลวเป๊ะ
    expect(real.split(union).length - 1, "รูปของ union เปลี่ยนไป — เคสควบคุมนี้กำลังจะ no-op").toBe(1);
    const mutated = real
      .replace(union, 'export type LegacyDayPlanState = "loading" | "unreadable" | "unsupported" | "legacy";')
      .replace('return "unsupported";', 'return "legacy";');
    expect(mutated, "การยัดของผิดไม่ได้เปลี่ยนอะไรเลย").not.toBe(real);

    expect(stateUnionMembers(mutated)).toContain("legacy");
    expect(returnedStringLiterals(mutated)).toContain("legacy");
    expect(returnedStringLiterals(mutated).filter((s) => !ALLOWED_STATES.includes(s))).toEqual(["legacy"]);
  });

  it("🔴 ② คู่กลับด้าน — คำในคอมเมนต์ต้องไม่ถูกนับ (ไฟล์จริงพูดถึง `\"legacy\"` หลายครั้ง)", () => {
    expect(stateUnionMembers('// export type LegacyDayPlanState = "legacy";')).toBeNull();
    expect(returnedStringLiterals('/* return "legacy"; */\nreturn "unsupported";')).toEqual(["unsupported"]);
  });
});
