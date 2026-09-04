import { describe, expect, it } from "vitest";
import { CATEGORY_COLOR } from "@/data/places";
import {
  contrastRatio,
  markerLabelColor,
  MARKER_LABEL_INK,
  MARKER_LABEL_LIGHT,
} from "@/components/markerLabel";

/**
 * เลขลำดับบนหมุดแผนที่ต้องอ่านออกทุกหมวด (เฟส B4 · 4 ก.ย. 2026)
 *
 * เลขบนหมุดคือ **ทางเดียวที่ผู้ใช้อ่านลำดับเส้นทางของวันบนแผนที่** ไม่ใช่ของประดับ
 * เดิมเป็นสีขาวตายตัวทุกหมวด ⇒ `viewpoint` 2.78:1 และ `restaurant` 3.50:1 อ่านไม่ออก
 *
 * 🔴 **ด่านนี้มีไว้ให้แดงตอนมีคนเพิ่มหมวดใหม่หรือขยับสีหมวด** — ไม่ใช่ไว้ให้เขียว
 *    จักรวาลของมันคือ `CATEGORY_COLOR` **ที่ import มาจากต้นทางจริง** ไม่ใช่รายการที่พิมพ์มือ
 *    ⇒ หมวดใหม่เข้ามาเมื่อไหร่ ก็ถูกตรวจเองทันทีโดยไม่มีใครต้องจำ
 */
describe("สีเลขลำดับบนหมุดแผนที่", () => {
  const AA_TEXT = 4.5;

  it("① เคสควบคุม — เครื่องคำนวณคอนทราสต์ต้องให้ค่าที่รู้คำตอบอยู่แล้วถูก", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 3);
    // ถ้าสองข้อนี้ผิด เลขทุกตัวในไฟล์นี้ไม่มีความหมาย
  });

  it("② เคสควบคุม — ทะเบียนหมวดต้องไม่ว่าง ไม่งั้นข้อ ③ จะเขียวโดยไม่ได้ตรวจอะไรเลย", () => {
    // `it.each` บนทะเบียนว่างจะหายไปเงียบ ๆ (เคสหาย ไม่มี error) — ข้อนี้กันรูปนั้น
    expect(Object.keys(CATEGORY_COLOR).length).toBeGreaterThanOrEqual(10);
  });

  it("③ ทุกหมวดต้องอ่านเลขออก — ≥4.5:1 ด้วยสีที่กติกาเลือกให้", () => {
    const failed: string[] = [];
    for (const [category, bg] of Object.entries(CATEGORY_COLOR)) {
      const fg = markerLabelColor(bg);
      const r = contrastRatio(fg, bg);
      if (r < AA_TEXT) failed.push(`${category} (${bg}) → ${fg} = ${r.toFixed(2)}:1`);
    }
    expect(failed).toEqual([]);
  });

  it("④ ทิศบวกสองขั้ว — พื้นเข้มต้องได้ตัวสว่าง · พื้นสว่างต้องได้ตัวเข้ม", () => {
    // ถ้าไม่มีข้อนี้ ฟังก์ชันที่คืนค่าเดียวตลอดก็ยังทำให้ข้อ ③ เขียวได้ (ตราบใดที่ค่านั้นพอดี)
    expect(markerLabelColor("#33564a")).toBe(MARKER_LABEL_LIGHT); // nature — เขียวสนเข้ม
    expect(markerLabelColor("#c39338")).toBe(MARKER_LABEL_INK); // viewpoint — ทองสว่าง
    // และต้องเลือกได้ทั้งสองแบบจริง ไม่ใช่บังเอิญตรง
    const chosen = new Set(Object.values(CATEGORY_COLOR).map(markerLabelColor));
    expect(chosen.size).toBe(2);
  });

  it("🔴 ⑤ ด่านนี้แดงเป็น — สีที่ไม่มีตัวอักษรใดอ่านออกต้องถูกจับได้", () => {
    // #7b7b7b คือเทาที่ *แย่ที่สุดเท่าที่เป็นไปได้* สำหรับกติกานี้ — หาโดยไล่ทั้ง 256 ระดับ
    // ขาวได้ 4.23 · หมึกเข้มได้ 4.28 ⇒ ตัวเลือกที่ดีที่สุดยังไม่ถึง 4.5
    // ถ้าข้อนี้ล้ม แปลว่าเกณฑ์ในข้อ ③ หลวมจนไม่มีอะไรทำให้มันแดงได้เลย
    //
    // 🔴 **และตัวเลขนี้บอกข้อจำกัดของด่านเอง ซึ่งต้องจดไว้ ไม่ใช่ซ่อน:**
    //    ช่องที่ข้อ ③ จับได้จริงคือ 4.28–4.50 เท่านั้น — แคบมาก
    //    เพราะกติกา "เลือกขาวหรือหมึกเข้ม อันไหนดีกว่า" เกือบทุกสีก็ผ่าน 4.5 อยู่แล้ว
    //    ⇒ ด่านนี้กัน *สีที่ตกจริง* ได้ แต่ไม่ได้แปลว่ามันเข้มงวด
    //      สิ่งที่มันกันได้จริงคือ "มีคนเปลี่ยนสีหมวดไปอยู่ในย่านเทากลาง" ซึ่งเป็นเคสที่เกิดได้
    //      เพราะพาเลตต์นี้ถูกเลือกด้วยตา ไม่ได้ถูกเลือกด้วยตัวเลข
    const impossible = "#7b7b7b";
    const best = contrastRatio(markerLabelColor(impossible), impossible);
    expect(best).toBeLessThan(AA_TEXT);
  });
});
