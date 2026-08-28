import { describe, expect, it } from "vitest";
import { buildDayBridge, dayBridgeWarning } from "../engine/dayBridge";

/**
 * `E3` — สะพาน `"d0"` ⇄ `date` ⇄ `uuid` (`P-72`)
 *
 * 🔴 **เคสที่สำคัญที่สุดไม่ใช่เคสที่แปลงถูก — คือเคสที่ *ไม่มีอะไรให้แปลง***
 * ถ้า `E7` ยังไม่ได้ย้ายข้อมูล ฐานไม่มีแถวเลย → ทุกการแปลงคืน `null`
 * → hook ทุกตัวเงียบและไม่ทำอะไร **โดยไม่มี error ที่ไหน หน้าจอดูเหมือนแค่ "ยังไม่มีข้อมูล"**
 * นั่นคือกับดัก `P-21` เป๊ะ: *สแกนความว่างเปล่า* กับ *สแกนแล้วไม่เจอ* ให้ผลเหมือนกัน
 */
const L = (id: string, date: string) => ({ id, date });

describe("buildDayBridge", () => {
  const legacy = [L("d0", "2026-10-11"), L("d1", "2026-10-12"), L("d2", "2026-10-13")];
  const db = [L("u0", "2026-10-11"), L("u1", "2026-10-12"), L("u2", "2026-10-13")];

  it("จับคู่ด้วย `date` ได้ทั้งสองทาง", () => {
    const b = buildDayBridge(legacy, db);
    expect(b.toDbId("d1")).toBe("u1");
    expect(b.toLegacyId("u2")).toBe("d2");
    expect(b.matched).toBe(3);
  });

  it("วันที่ไม่รู้จัก → `null` ทั้งสองทาง", () => {
    const b = buildDayBridge(legacy, db);
    expect(b.toDbId("d99")).toBeNull();
    expect(b.toLegacyId("ไม่มี")).toBeNull();
  });

  it("🔴 ฐานว่างเปล่า → `matched` เป็น 0 **และบอกได้ว่าเพราะ `E7` ยังไม่รัน**", () => {
    const b = buildDayBridge(legacy, []);
    expect(b.matched).toBe(0);
    expect(b.unmatchedLegacy).toEqual(["d0", "d1", "d2"]);
    expect(dayBridgeWarning(b, legacy.length)).toContain("E7 ยังไม่ได้ย้ายข้อมูล");
  });

  it("🔴 ขาดบางวัน → ข้อความ **คนละอันกับ** ยังไม่ย้ายเลย", () => {
    // สองสาเหตุนี้คนละเรื่องและคนละทางแก้ · ยุบรวมเป็น "ไม่เจอ" = ไม่มีใครรู้ว่าต้องทำอะไร
    const b = buildDayBridge(legacy, [db[0], db[2]]);
    expect(b.matched).toBe(2);
    expect(b.unmatchedLegacy).toEqual(["d1"]);
    const w = dayBridgeWarning(b, legacy.length);
    expect(w).toContain("d1");
    expect(w).not.toContain("E7");
  });

  it("วันที่มีในฐานแต่ไม่มีในไฟล์ → `unmatchedDb` (ทริปที่สร้างบนแพลตฟอร์ม)", () => {
    const b = buildDayBridge(legacy, [...db, L("u9", "2026-10-20")]);
    expect(b.unmatchedDb).toEqual(["u9"]);
    // ⚠️ ไม่ใช่ปัญหา จึงไม่เตือน — ต่างจาก `unmatchedLegacy`
    expect(dayBridgeWarning(b, legacy.length)).toBeNull();
  });

  /**
   * 🔴 **ทริปที่สร้างบนแพลตฟอร์ม — `matched === 0` เป็นเรื่อง *ปกติ* ไม่ใช่อาการของ `E7`** (P4 · 28 ส.ค. 2026)
   *
   * เคสนี้กับเคส **"ฐานว่างเปล่า → E7"** ข้างบน **ต้องอยู่ด้วยกันเสมอ**:
   * ทั้งคู่มี `matched === 0` เหมือนกันเป๊ะ · สิ่งที่แยกคือ `unmatchedDb` มีของหรือไม่
   * 🎯 **ถ้าเหลือแค่เคสเดียว ใครทำให้ `dayBridgeWarning` คืน `null` เสมอ (หรือเตือนเสมอ) จะไม่มีอะไรฟ้อง**
   * · ก่อนแก้ `110`: ผู้ใช้ทริปแพลตฟอร์มเห็นข้อความโทษ `E7` **ทั้งที่วันอยู่ในฐานครบ** — ข้อความที่ชี้ผิดที่
   *   ส่งคนไปไล่ที่ที่ไม่มีอะไรผิด **แพงกว่าความเงียบ** (P2 เจอของจริง)
   */
  it("🔴 ทริปแพลตฟอร์ม (ไม่มีวันไหนตรงไฟล์เดิม) → แมปครบและ **ไม่เตือนเรื่อง `E7`**", () => {
    const platformDays = [L("p0", "2027-01-01"), L("p1", "2027-01-02")];
    const b = buildDayBridge(legacy, platformDays);

    expect(b.matched, "ไม่มีวันไหนตรงกับไฟล์เดิม").toBe(0);
    expect(b.unmatchedDb, "วันของแพลตฟอร์มต้องถูกนับว่า *มีอยู่* ไม่ใช่หายไป").toEqual(["p0", "p1"]);

    // 🔴 แมปต้องไม่ว่าง — hook ที่คีย์ด้วยวันปั้นแมปเองจาก ITINERARY แล้วได้ว่าง คือบั๊กที่ `B6` เจอ
    expect(b.dayKeyToDbId.get("p0"), "วันแพลตฟอร์มต้องแมปหาตัวเอง").toBe("p0");
    expect(b.dayKeyToDbId.get("p1")).toBe("p1");
    expect(b.toDbId("p1"), "`toDbId` ต้องรับ uuid ของวันแพลตฟอร์มได้").toBe("p1");

    // 🎯 ครึ่งที่คู่กับเคส `E7` ข้างบน — เงื่อนไขเดียวกัน (`matched === 0`) คนละคำตอบ
    expect(
      dayBridgeWarning(b, legacy.length),
      "ทริปแพลตฟอร์มต้องไม่ถูกกล่าวหาว่า E7 ยังไม่รัน — วันอยู่ในฐานครบแล้ว",
    ).toBeNull();
  });

  it("🔴 มีทั้งวันที่ตรงและวันของแพลตฟอร์ม → เตือนเฉพาะวันที่ขาดจริง ไม่ใช่เหมารวม", () => {
    const b = buildDayBridge(legacy, [L("u0", "2026-10-11"), L("p9", "2027-01-01")]);
    expect(b.matched).toBe(1);
    expect(b.unmatchedDb).toEqual(["p9"]);
    expect(b.unmatchedLegacy, "d1/d2 ขาดจริง — ต้องยังถูกรายงาน").toEqual(["d1", "d2"]);
    // `matched > 0` → ไม่เข้ากิ่งแพลตฟอร์ม และไม่เข้ากิ่ง E7 → ต้องได้ข้อความ "ขาดบางวัน"
    const w = dayBridgeWarning(b, legacy.length);
    expect(w, "ขาดบางวันต้องได้ข้อความของตัวเอง").toContain("d1, d2");
    expect(w, "และต้องไม่ใช่ข้อความของ E7").not.toContain("E7");
  });

  it("🔴 วันที่ซ้ำในไฟล์ → ตัวหลังไปอยู่ `unmatchedLegacy` **ไม่ใช่ทับตัวแรกเงียบ ๆ**", () => {
    const b = buildDayBridge([L("d0", "2026-10-11"), L("dX", "2026-10-11")], [db[0]]);
    expect(b.toDbId("d0")).toBe("u0");
    expect(b.unmatchedLegacy).toEqual(["dX"]);
  });

  it("ไม่มีวันในไฟล์เลย → ไม่เตือน (ไม่มีอะไรให้แปลง จึงไม่มีอะไรผิด)", () => {
    expect(dayBridgeWarning(buildDayBridge([], db), 0)).toBeNull();
  });
});
