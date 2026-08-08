import type { GoogleOpeningHours } from "@/lib/googlePlaces";

// Google periods ใช้ day: 0=อาทิตย์..6=เสาร์ ตรงกับ Date.getDay() ของ JS พอดี
// weekdayDescriptions เป็นข้อความพร้อมใช้ (ภาษาไทยแล้ว) เรียงจันทร์-อาทิตย์ตามเอกสาร Places API (New)
function isoDateToWeekday(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00`).getDay();
}

/** ข้อความเวลาเปิด-ปิดของวันนั้นๆ (ตรงกับวันที่ dateISO ในทริป ไม่ใช่วันนี้จริง) เผื่อไม่มีข้อมูลคืน null */
export function weekdayHoursLabel(
  hours: GoogleOpeningHours | null | undefined,
  dateISO: string
): string | null {
  if (!hours?.weekdayDescriptions?.length) return null;
  const weekday = isoDateToWeekday(dateISO); // 0=อาทิตย์..6=เสาร์
  const mondayFirstIndex = (weekday + 6) % 7; // แปลงเป็นดัชนีจันทร์=0..อาทิตย์=6
  return hours.weekdayDescriptions[mondayFirstIndex] ?? null;
}

function toMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/**
 * เช็กว่าช่วง [arrivalMinutes, departureMinutes) ของวันที่ dateISO อยู่ในเวลาเปิดของสถานที่ไหม
 * arrivalMinutes/departureMinutes เป็นนาทีสะสมแบบไม่ wrap นับจาก 00:00 ของ dateISO
 * (มาจาก ScheduledStop.arrivalMinutes/departureMinutes ใน lib/schedule.ts) — อาจเกิน 1440 ได้เมื่อจุดแวะ
 * อยู่ข้ามเที่ยงคืนไปวันถัดไป (เช่น เที่ยวฮานอยถึงตี 1) เดิมฟังก์ชันนี้รับสตริง HH:MM แล้ว parse เอง
 * ซึ่งไม่มีทางรู้ว่า "00:30" ที่ห่อรอบมาคือของวันเดียวกันหรือวันถัดไป ทำให้เช็กเวลาผิดเงียบๆ
 *
 * คืน true = อยู่ในเวลาเปิดเต็มช่วง, false = ตกนอกเวลาเปิดบางส่วนหรือทั้งหมด, null = ไม่มีข้อมูลให้เช็ก
 */
export function isOpenDuring(
  hours: GoogleOpeningHours | null | undefined,
  dateISO: string,
  arrivalMinutes: number,
  departureMinutes: number
): boolean | null {
  if (!hours?.periods?.length) return null;
  // เปิด 24 ชม. ทุกวัน (ไม่มี period ไหนมี close เลย)
  if (hours.periods.every((p) => !p.close)) return true;

  const weekday = isoDateToWeekday(dateISO);

  // สร้างช่วงเปิดเทียบกับ "เมื่อวาน/วันนี้/พรุ่งนี้" ของ dateISO ทั้งหมด (แทนที่จะดูแค่เมื่อวาน/วันนี้แบบเดิม)
  // เผื่อจุดแวะยาวข้ามเที่ยงคืนไปถึงวันถัดไปจริงๆ (arrivalMinutes/departureMinutes เกิน 1440)
  const windows: Array<{ start: number; end: number }> = [];
  for (const dayOffset of [-1, 0, 1]) {
    const targetWeekday = (weekday + dayOffset + 7) % 7;
    for (const period of hours.periods) {
      if (!period.close) continue; // เปิด 24 ชม. เฉพาะวันนั้น ไม่ต้องเช็ก (ครอบด้วยเงื่อนไข every ด้านบนแล้วถ้าทุก period เป็นแบบนี้)
      if (period.open.day !== targetWeekday) continue;
      const openMin = toMinutes(period.open.hour, period.open.minute) + dayOffset * 1440;
      const spansMidnight = period.close.day !== period.open.day;
      const closeMin =
        toMinutes(period.close.hour, period.close.minute) + dayOffset * 1440 + (spansMidnight ? 1440 : 0);
      windows.push({ start: openMin, end: closeMin });
    }
  }

  if (windows.length === 0) return false; // มีข้อมูล period แต่ไม่มีช่วงเปิดที่เกี่ยวข้องเลย = ปิด

  return windows.some((w) => arrivalMinutes >= w.start && departureMinutes <= w.end);
}
