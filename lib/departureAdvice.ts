import { minutesToTime, timeToMinutes } from "@/lib/schedule";

/** ค่าเผื่อเช็คอินมาตรฐานของทริปนี้ — 3 ชม. สำหรับบินระหว่างประเทศ (ตรงกับที่เขียนไว้ใน d0/d10) */
export const DEFAULT_CHECKIN_BUFFER_MINUTES = 180;

/** เผื่อความเสี่ยงเพิ่มจากเวลาเดินทางที่ Google บอก (รอรถ/รถมาช้า/เดินหาชานชาลา) */
export const DEFAULT_RISK_BUFFER_MINUTES = 30;

/** เดดไลน์อยู่ก่อนเวลาที่แผนพาไปถึงได้มากสุดเท่านี้ ก่อนจะถือว่าเป็นของ "วันถัดไป" (ดูคอมเมนต์ที่ฟังก์ชัน) */
const NEXT_DAY_THRESHOLD_MINUTES = 12 * 60;

export type DepartureAdvice = {
  /** เวลาที่ต้องถึงสนามบินอย่างช้าที่สุด = เวลาบิน − เผื่อเช็คอิน (นาทีสะสมไม่ wrap) */
  mustArriveByMinutes: number;
  /** เวลาที่ควรออกจากจุดก่อนหน้าอย่างช้าที่สุด = mustArriveBy − เวลาเดินทาง − เผื่อความเสี่ยง */
  shouldLeaveByMinutes: number;
  mustArriveBy: string;
  shouldLeaveBy: string;
  /** ตามแผนที่วางไว้จะถึงสนามบินกี่โมง (นาทีสะสมไม่ wrap) */
  plannedArrivalMinutes: number;
  plannedArrival: string;
  /** > 0 = ไปถึงช้ากว่าที่ควร (นาที) · <= 0 = ทัน (ค่าติดลบคือเวลาที่เหลือ) */
  lateByMinutes: number;
  /** นาทีที่เหลือเผื่อไว้ก่อนถึงเดดไลน์ — ใช้โชว์ "เหลือเวลา X นาที" ตอนยังทัน */
  slackMinutes: number;
};

/**
 * "ควรออกกี่โมงถึงจะทันเครื่อง" — คำนวณย้อนกลับจากเวลาบิน ไม่ใช่เดินหน้าจากเวลาที่วางแผนไว้
 *
 *   เวลาที่ควรออก = เวลาบิน − เผื่อเช็คอิน − เวลาเดินทางจริง − เผื่อความเสี่ยง
 *
 * ทุกค่าเป็น "นาทีสะสมนับจากเวลาเริ่มวัน" แบบเดียวกับ `ScheduledStop.arrivalMinutes` (ไม่ wrap 24 ชม.)
 * เพื่อให้เทียบข้ามเที่ยงคืนได้ถูก — เคสจริงคือ d0 ที่ต้องขึ้นเครื่องตี 1:15 ของวันถัดไป
 * (บั๊กแบบเดียวกับ 7.4 ที่เคยเทียบสตริง "HH:MM" ที่ห่อรอบมาแล้วจนได้ค่าติดลบผิดๆ)
 *
 * `targetTime` เป็น "HH:MM" ของนาฬิกาจริง ไม่ได้บอกว่าวันไหน — ตีความว่าเป็น "รอบถัดไปของเวลานั้น"
 * โดยยอมให้อยู่ก่อนเวลาที่แผนพาไปถึงได้ไม่เกิน 12 ชม. ก่อนจะเลื่อนเป็นวันถัดไป
 * ถ้าไม่มีเงื่อนไข 12 ชม.นี้ เคส "แผนไปถึงช้ากว่าเวลาบินนิดเดียว" (ถึง 11:00 แต่บิน 10:35) จะถูกเลื่อน
 * ไปเป็นเที่ยวบินของพรุ่งนี้แล้วรายงานว่า "มาเร็วไป 23 ชม." แทนที่จะเตือนว่าตกเครื่อง
 */
export function computeDepartureAdvice({
  targetTime,
  plannedArrivalMinutes,
  travelMinutes,
  checkinBufferMinutes = DEFAULT_CHECKIN_BUFFER_MINUTES,
  riskBufferMinutes = DEFAULT_RISK_BUFFER_MINUTES,
}: {
  targetTime: string;
  plannedArrivalMinutes: number;
  travelMinutes: number;
  checkinBufferMinutes?: number;
  riskBufferMinutes?: number;
}): DepartureAdvice | null {
  const rawTarget = timeToMinutes(targetTime);
  if (rawTarget == null) return null;

  // ยกเป็นวันถัดไปทีละ 24 ชม. จนกว่าเดดไลน์จะไม่อยู่ก่อนเวลาที่แผนพาไปถึงเกิน 12 ชม.
  let targetMinutes = rawTarget;
  while (targetMinutes < plannedArrivalMinutes - NEXT_DAY_THRESHOLD_MINUTES) targetMinutes += 1440;

  const mustArriveByMinutes = targetMinutes - checkinBufferMinutes;
  const shouldLeaveByMinutes = mustArriveByMinutes - travelMinutes - riskBufferMinutes;
  const lateByMinutes = plannedArrivalMinutes - mustArriveByMinutes;

  return {
    mustArriveByMinutes,
    shouldLeaveByMinutes,
    mustArriveBy: minutesToTime(mustArriveByMinutes),
    shouldLeaveBy: minutesToTime(shouldLeaveByMinutes),
    plannedArrivalMinutes,
    plannedArrival: minutesToTime(plannedArrivalMinutes),
    lateByMinutes,
    slackMinutes: -lateByMinutes,
  };
}
