import { describe, expect, it } from "vitest";
import { immigrationCountryOf } from "@/lib/immigrationCountry";

/**
 * 🔴 **เอกสาร ตม. — สามผลลัพธ์ ไม่ใช่สอง** · เจ้าของ: P3-FE/Perf · 30 ส.ค. 2026
 *
 * ## บั๊กที่เคสนี้กันไม่ให้กลับมา — สองใบ คนละยุค
 * ① **ค่าเริ่มต้น `"kr"`** (ก่อน `B6`) — ต้นทางเป็นไฟล์ทริปเกาหลี ค่าเริ่มต้นจึงถูกโดยบังเอิญ
 *    พอ `B6` ให้หน้านี้เรนเดอร์ทริปแพลตฟอร์มได้ **ทริปญี่ปุ่นจะได้เอกสาร ตม. เกาหลี** เงียบ ๆ
 * ② 🔴 **เสมอแล้วตัวแรกใน `Map` ชนะ** (P1 จับได้ 30 ส.ค.) — `days > winnerDays` ไม่เคยเห็นการเสมอ
 *    → ทริป 5 วันเกาหลี / 5 วันญี่ปุ่น **ได้ชีตของประเทศที่วันแรกอยู่ โดยไม่มีอะไรฟ้อง**
 *
 * ## 🎯 ทำไม `tie` ต้องแยกจาก `none`
 * ถ้ายุบเป็น `null` เหมือนกัน เราจะเปลี่ยน ***เดาผิด 50%* เป็น *หายเงียบ 100%*** —
 * ผู้ใช้แยกไม่ออกระหว่าง *"ระบบเลือกให้ไม่ได้"* กับ *"ฟีเจอร์นี้ไม่มี"*
 * · **ด่านที่เอาของออก ต้องบอกว่าทำไม** (P1 รับข้อเสนอนี้ 30 ส.ค. 2026)
 */
const d = (city: string) => ({ city });

describe("🔴 เอกสาร ตม. — เลือกได้ / ไม่รู้ / เสมอ", () => {
  it("ประเทศเดียวชนะขาด → เลือกได้ (เคสควบคุมฝั่งบวก: ตัวคำนวณทำงานจริง)", () => {
    // ทริปเกาหลีจริง: ฮานอย 1 วัน (พักเครื่อง) · เกาหลี 10 วัน
    const pick = immigrationCountryOf([d("hanoi"), ...Array.from({ length: 10 }, () => d("seoul"))]);
    expect(pick.kind).toBe("ok");
    if (pick.kind === "ok") {
      expect(pick.code).toBe("kr");
      expect(pick.nameEn).toBeTruthy();
      expect(pick.nameTh).toBeTruthy();
    }
  });

  it("🔴 ทริปจริงของเราต้องยัง *เลือกได้* — สองประเทศแต่ไม่เท่ากัน", () => {
    // 🎯 เคสนี้คือเหตุผลที่ผมปฏิเสธกฎ ">1 ประเทศ → ไม่แสดง" · ทำตามนั้นแล้วทริปหลักเสียเอกสารทันที
    const korea = [d("hanoi"), d("busan"), d("busan"), d("busan"), d("sokcho"), d("sokcho"),
                   d("gangneung"), d("seoul"), d("seoul"), d("suwon"), d("seoul")];
    expect(immigrationCountryOf(korea).kind).toBe("ok");
  });

  it("🔴 เสมอกัน → `tie` ไม่ใช่เดาตัวแรก", () => {
    // ก่อนแก้: `days > winnerDays` ทำให้ `vn` (ตัวแรกที่เจอ) ชนะเงียบ ๆ
    const even = [d("hanoi"), d("hanoi"), d("seoul"), d("seoul")];
    expect(immigrationCountryOf(even).kind).toBe("tie");
    // และลำดับต้องไม่มีผล — สลับแล้วยังต้องเสมอ
    expect(immigrationCountryOf([...even].reverse()).kind).toBe("tie");
  });

  it("ไม่รู้จักประเทศของวันไหนเลย → `none` ไม่ใช่เดา `kr`", () => {
    expect(immigrationCountryOf([d("tokyo"), d("osaka")]).kind).toBe("none");
    expect(immigrationCountryOf([]).kind).toBe("none");
  });

  it("🔴 เมืองที่ไม่รู้จัก ต้องไม่ถูกนับเป็นประเทศหนึ่ง — ไม่งั้นมันจะสร้างการเสมอปลอม", () => {
    // เกาหลี 2 · โตเกียว 2 (ไม่รู้จัก) → **ไม่ใช่เสมอ** เพราะโตเกียวไม่ถูกนับเลย
    expect(immigrationCountryOf([d("seoul"), d("seoul"), d("tokyo"), d("tokyo")]).kind).toBe("ok");
  });

  it("ผู้ชนะแซงหลังเคยเสมอ → กลับมาเป็น `ok` ไม่ค้างที่ `tie`", () => {
    // vn 1 · kr 1 (เสมอ) แล้ว kr ได้เพิ่มเป็น 2 → ธงเสมอต้องถูกล้าง
    expect(immigrationCountryOf([d("hanoi"), d("seoul"), d("seoul")]).kind).toBe("ok");
  });
});
