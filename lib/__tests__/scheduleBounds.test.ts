import { describe, expect, it } from "vitest";
import { effectiveMinutes, pickScheduleBounds, type BoundRow } from "../engine/scheduleBounds";

/**
 * `D81` ③ — กฎการเลือกขอบ · เจ้าของ: P1-Lead · กฎมาจาก P5 (26 ส.ค. 2026)
 *
 * 🔴 **เคสที่สำคัญที่สุดในไฟล์นี้คือเคส `day_offset`** — P5 ชี้ว่าทางแก้ที่ตรงไปตรงมาเป็นกับดัก
 * และ **ทริปนี้มีแถวที่จะเหยียบกับดักนั้นจริง** (VN428 ออก 01:15 ของวันถัดไป)
 */
const row = (o: Partial<BoundRow> & Pick<BoundRow, "id">): BoundRow => ({
  rank: "a0", schedule_bound: null, fixed_start_time: null, day_offset: 0, ...o,
});

describe("effectiveMinutes", () => {
  it("HH:MM ธรรมดา", () => {
    expect(effectiveMinutes({ fixed_start_time: "07:30", day_offset: 0 })).toBe(450);
  });

  it("🔴 day_offset บวกเข้าไปเป็นนาที ไม่ใช่ถูกละเลย", () => {
    // VN428 — เคสจริงของทริปนี้ ที่ migration ของ D81 อ้างเป็นเหตุผลของคอลัมน์
    expect(effectiveMinutes({ fixed_start_time: "01:15", day_offset: 1 })).toBe(1515);
  });

  it("ไม่มีเวลา หรือรูปแบบผิด → null (เป็นขอบไม่ได้)", () => {
    expect(effectiveMinutes({ fixed_start_time: null, day_offset: 0 })).toBeNull();
    expect(effectiveMinutes({ fixed_start_time: "7:30", day_offset: 0 })).toBeNull();
    expect(effectiveMinutes({ fixed_start_time: "24:00", day_offset: 0 })).toBeNull();
  });

  it("day_offset เป็น null → ถือเป็น 0", () => {
    expect(effectiveMinutes({ fixed_start_time: "08:00", day_offset: null })).toBe(480);
  });
});

describe("pickScheduleBounds — ขอบคือข้อจำกัด ขอบที่ซ้อนกันจึงตัดกัน", () => {
  it("after เอา **น้อยที่สุด** ไม่ใช่ตัวแรกในลิสต์", () => {
    // เคสที่ P1 ยกถาม: เดดไลน์เช็คอิน 19:00 กับเวลาบิน 21:00
    // ถ้าแถวเวลาบินถูกลากขึ้นบนสุด การเลือก "ตัวแรก" จะได้ 21:00 ซึ่งสายไปสองชั่วโมง
    const rows = [
      row({ id: "flight", rank: "a0", schedule_bound: "after", fixed_start_time: "21:00" }),
      row({ id: "checkin", rank: "a1", schedule_bound: "after", fixed_start_time: "19:00" }),
    ];
    expect(pickScheduleBounds(rows).after?.id).toBe("checkin");
    expect(pickScheduleBounds(rows).afterCount).toBe(2);
  });

  it("before เอา **มากที่สุด** — ขาสองข้างไม่สมมาตร", () => {
    const rows = [
      row({ id: "landed", rank: "a0", schedule_bound: "before", fixed_start_time: "08:00" }),
      row({ id: "immigration", rank: "a1", schedule_bound: "before", fixed_start_time: "09:30" }),
    ];
    expect(pickScheduleBounds(rows).before?.id).toBe("immigration");
  });

  it("🔴 เทียบบนนาทีจริง ไม่ใช่บนสตริง HH:MM — เคส VN428", () => {
    // min() บนสตริงจะเลือก "01:15" เป็นขอบปลาย → ได้ขอบปลายที่มาก่อนวันเริ่มด้วยซ้ำ
    const rows = [
      row({ id: "vn428", rank: "a0", schedule_bound: "after", fixed_start_time: "01:15", day_offset: 1 }),
      row({ id: "curfew", rank: "a1", schedule_bound: "after", fixed_start_time: "22:00", day_offset: 0 }),
    ];
    const picked = pickScheduleBounds(rows);
    expect(picked.after?.id).toBe("curfew");
    expect(effectiveMinutes(picked.after!)).toBe(1320);
  });

  it("เวลาเท่ากันเป๊ะ → ตัวที่มาก่อนในลิสต์ชนะ (tie-break ด้วย rank, id ที่ฐานเรียงมาแล้ว)", () => {
    const rows = [
      row({ id: "first", rank: "a0", schedule_bound: "after", fixed_start_time: "20:00" }),
      row({ id: "second", rank: "a1", schedule_bound: "after", fixed_start_time: "20:00" }),
    ];
    expect(pickScheduleBounds(rows).after?.id).toBe("first");
  });

  it("แถวที่ไม่มีเวลา ไม่นับเป็นขอบเลย — ขอบที่ไม่มีเวลาบีบอะไรไม่ได้", () => {
    const rows = [
      row({ id: "no-time", rank: "a0", schedule_bound: "after", fixed_start_time: null }),
      row({ id: "real", rank: "a1", schedule_bound: "after", fixed_start_time: "18:00" }),
    ];
    const picked = pickScheduleBounds(rows);
    expect(picked.after?.id).toBe("real");
    expect(picked.afterCount).toBe(1);
  });

  it("ไม่มีขอบเลย → null ทั้งสองขา และนับเป็น 0", () => {
    const picked = pickScheduleBounds([row({ id: "x", fixed_start_time: "10:00" })]);
    expect(picked.before).toBeNull();
    expect(picked.after).toBeNull();
    expect(picked.beforeCount).toBe(0);
    expect(picked.afterCount).toBe(0);
  });

  it("🔴 ขาดขอบปลาย = คำเตือนตกเครื่องไม่ render เลย — เคสนี้ตรึงว่ามันคืน null ไม่ใช่เดาค่า", () => {
    // P5: afterAnchorEvent เป็น input ตัวเดียวของ deadlineOverrunMinutes
    // ขาดไป = ไม่มี error ไม่มี fallback · ตรึงไว้ว่าที่นี่ไม่แอบเติมค่าให้
    const rows = [row({ id: "b", schedule_bound: "before", fixed_start_time: "08:00" })];
    expect(pickScheduleBounds(rows).after).toBeNull();
  });
});
