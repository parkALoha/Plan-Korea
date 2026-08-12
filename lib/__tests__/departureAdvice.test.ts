import { describe, expect, it } from "vitest";
import { computeDepartureAdvice } from "@/lib/departureAdvice";

describe("computeDepartureAdvice", () => {
  it("คำนวณย้อนกลับจากเวลาบิน: ต้องถึงสนามบิน = เวลาบิน − เผื่อเช็คอิน", () => {
    // d10 จริง: ออกจากโรงแรม 05:45 ถึง ICN 07:15 · VN409 บิน 10:35 เผื่อเช็คอิน 3 ชม.
    const advice = computeDepartureAdvice({
      targetTime: "10:35",
      plannedArrivalMinutes: 7 * 60 + 15,
      travelMinutes: 60,
    })!;
    expect(advice.mustArriveBy).toBe("07:35"); // 10:35 − 3 ชม.
    expect(advice.shouldLeaveBy).toBe("06:05"); // 07:35 − 60 น. − เผื่อ 30 น.
    expect(advice.lateByMinutes).toBe(-20);
    expect(advice.slackMinutes).toBe(20);
  });

  it("เตือนเมื่อแผนพาไปถึงช้ากว่าเส้นตาย", () => {
    const advice = computeDepartureAdvice({
      targetTime: "10:35",
      plannedArrivalMinutes: 8 * 60, // 08:00 ช้ากว่า 07:35 ไป 25 นาที
      travelMinutes: 60,
    })!;
    expect(advice.lateByMinutes).toBe(25);
  });

  it("เที่ยวบินตี 1:15 ของวันถัดไปถือเป็นเส้นตายข้ามเที่ยงคืน ไม่ใช่ 'เลยไปแล้ว'", () => {
    // d0 จริง: เที่ยวฮานอยถึงดึก แล้วบิน VN428 ตี 1:15 — arrivalMinutes เป็นนาทีสะสมไม่ wrap
    const advice = computeDepartureAdvice({
      targetTime: "01:15",
      plannedArrivalMinutes: 22 * 60 + 5, // 22:05 ของวันเดียวกัน
      travelMinutes: 40,
    })!;
    expect(advice.mustArriveByMinutes).toBe(24 * 60 + 75 - 180); // ตี 1:15 วันถัดไป − 3 ชม.
    expect(advice.mustArriveBy).toBe("22:15");
    expect(advice.lateByMinutes).toBe(-10);
    expect(advice.shouldLeaveBy).toBe("21:05");
  });

  it("แผนถึงช้ากว่าเวลาบินนิดเดียว ต้องเตือนตกเครื่อง ไม่ใช่เลื่อนไปเที่ยวบินพรุ่งนี้", () => {
    const advice = computeDepartureAdvice({
      targetTime: "10:35",
      plannedArrivalMinutes: 11 * 60, // ถึง 11:00 หลังเครื่องออกไปแล้ว
      travelMinutes: 30,
    })!;
    expect(advice.lateByMinutes).toBe(205); // 11:00 − (10:35 − 3 ชม.)
  });

  it("เคารพค่าเผื่อที่ตั้งเอง", () => {
    const advice = computeDepartureAdvice({
      targetTime: "12:00",
      plannedArrivalMinutes: 9 * 60,
      travelMinutes: 45,
      checkinBufferMinutes: 120,
      riskBufferMinutes: 0,
    })!;
    expect(advice.mustArriveBy).toBe("10:00");
    expect(advice.shouldLeaveBy).toBe("09:15");
  });

  it("คืน null เมื่อเวลาเป้าหมาย parse ไม่ได้ (ช่องว่างจาก <input type=time>)", () => {
    expect(
      computeDepartureAdvice({ targetTime: "", plannedArrivalMinutes: 600, travelMinutes: 30 })
    ).toBeNull();
  });
});
