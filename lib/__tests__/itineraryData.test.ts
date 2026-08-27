import { describe, expect, it } from "vitest";
import { ITINERARY } from "@/data/itinerary";

/**
 * `E5-AC3a` (data · precondition) — โครงวันใน `data/itinerary.ts` ครบ 11 วันของทริปจริง · เจ้าของ: P4 (27 ส.ค. 2026)
 *
 * 🔴 **ขอบเขต — อ่านตรง ๆ อย่าอ่านเกิน (P1 ยืนยัน baseline · 27 ส.ค.):**
 * · ✅ พิสูจน์: `itinerary.ts` มี **11 วันต่อเนื่อง** (2026-10-11..10-21 · ตรงช่วงเที่ยวบิน VN) ไม่ขาด/ซ้ำ · โครงวันครบ
 * · ❌ **ไม่ได้พิสูจน์:**
 *     (ก) UI *เรนเดอร์* วันเหล่านั้นครบ — `vitest` เป็น node ไม่มี DOM · การนับแถวที่ render ต้องใช้เบราว์เซอร์
 *     (ข) จุดแวะจริง · ที่พัก · **ตั๋ว/bookings 8 ใบ** · checklist ตรงกับของเดิม —
 *         **สี่อย่างนี้อยู่ใน DB (prod `ejzibhgqhxdzkovsnpds`) ไม่ใช่ `itinerary.ts`** (checklist อ่านผ่าน `hooks/useChecklist.ts`
 *         → supabase · ที่พัก resolve จาก `trip_hotels` ตอน render) → เป็น **`AC3b`** ที่รอ `E7` **และรอสิ่งที่ทีมอ่านไม่ได้**
 * 🎯 **เขียวที่นี่ ≠ `AC3` ทั้งข้อ · ห้ามติ๊ก `AC3` ด้วยเคสนี้** — มันแค่แทน "P2 เปิดดูด้วยตา" ด้วยสิ่งที่ *นับได้ · fail ได้*
 *    ตัวแยก mirror/measure: เคสนี้ fail เมื่อมีคนแก้ `itinerary.ts` จนวันหาย/เพี้ยน — ซึ่งเป็น regression จริงในไฟล์นี้
 *    แต่มัน fail ไม่ได้เมื่อ "ทริปที่ย้ายเข้าแพลตฟอร์มไม่ตรงของเดิม" (นั่นคือ AC3b · แกนที่สำคัญกว่า)
 */
describe("E5-AC3a (data) — โครงวัน itinerary.ts ครบ", () => {
  it("🔴 11 วันต่อเนื่อง 2026-10-11..10-21 · ไม่ขาด ไม่ซ้ำ ไม่เกิน", () => {
    const dates = ITINERARY.map((d) => d.date);
    const expected = Array.from({ length: 11 }, (_, i) =>
      new Date(Date.UTC(2026, 9, 11 + i)).toISOString().slice(0, 10),
    );
    expect(dates, "วันไม่ตรง 2026-10-11..10-21 (ขาด/ซ้ำ/เกิน) = โครงทริปเพี้ยนจากของจริง").toEqual(expected);
  });

  it("🔴 ทุกวันมีโครงครบ — date · city · weekdayTh · weekdayEn (field โครงหาย = การ์ดพังใน UI)", () => {
    const broken = ITINERARY.filter(
      (d) => !d.date || !d.city || !d.weekdayTh || !d.weekdayEn,
    ).map((d) => d.date || "(no date)");
    expect(broken, "วันที่ field โครงว่าง/หาย").toEqual([]);
  });
});
