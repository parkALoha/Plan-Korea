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
 * สร้างช่วงเปิด-ปิดทั้งหมดที่เกี่ยวข้องกับ dateISO (เทียบกับเมื่อวาน/วันนี้/พรุ่งนี้ทั้ง 3 วัน)
 * เป็นนาทีสะสมแบบไม่ wrap นับจาก 00:00 ของ dateISO — ใช้ร่วมกันทั้ง isOpenDuring และ minutesUntilClose
 */
function buildOpenWindows(
  periods: NonNullable<GoogleOpeningHours["periods"]>,
  dateISO: string
): Array<{ start: number; end: number }> {
  const weekday = isoDateToWeekday(dateISO);
  const windows: Array<{ start: number; end: number }> = [];
  for (const dayOffset of [-1, 0, 1]) {
    const targetWeekday = (weekday + dayOffset + 7) % 7;
    for (const period of periods) {
      if (!period.close) continue; // เปิด 24 ชม. เฉพาะวันนั้น
      if (period.open.day !== targetWeekday) continue;
      const openMin = toMinutes(period.open.hour, period.open.minute) + dayOffset * 1440;
      const spansMidnight = period.close.day !== period.open.day;
      const closeMin =
        toMinutes(period.close.hour, period.close.minute) + dayOffset * 1440 + (spansMidnight ? 1440 : 0);
      windows.push({ start: openMin, end: closeMin });
    }
  }
  return windows;
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

  const windows = buildOpenWindows(hours.periods, dateISO);
  if (windows.length === 0) return false; // มีข้อมูล period แต่ไม่มีช่วงเปิดที่เกี่ยวข้องเลย = ปิด

  return windows.some((w) => arrivalMinutes >= w.start && departureMinutes <= w.end);
}

/**
 * ถ้า nowMinutes (นาทีสะสมนับจาก 00:00 ของ dateISO ไม่ wrap) อยู่ในช่วงเปิดของสถานที่พอดี
 * คืนจำนวนนาทีที่เหลือก่อนปิด — ใช้เตือน "จะปิดในอีก X นาที" ล่วงหน้า ต่างจาก isOpenDuring ที่บอกแค่
 * เปิด/ปิดตอนนั้น คืน null เมื่อไม่มีข้อมูล, เปิด 24 ชม., หรือตอนนี้ปิดอยู่แล้ว (ไม่ใช่กรณีที่ต้องเตือน)
 */
export function minutesUntilClose(
  hours: GoogleOpeningHours | null | undefined,
  dateISO: string,
  nowMinutes: number
): number | null {
  if (!hours?.periods?.length) return null;
  if (hours.periods.every((p) => !p.close)) return null; // เปิด 24 ชม. ไม่มีวันปิดให้เตือน

  const windows = buildOpenWindows(hours.periods, dateISO);
  const openNow = windows.filter((w) => nowMinutes >= w.start && nowMinutes < w.end);
  if (openNow.length === 0) return null;

  return Math.min(...openNow.map((w) => w.end)) - nowMinutes;
}
