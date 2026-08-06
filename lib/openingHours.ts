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

function timeStrToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * เช็กว่าช่วง [arrival, departure) ของวันที่ dateISO อยู่ในเวลาเปิดของสถานที่ไหม
 * คืน true = อยู่ในเวลาเปิดเต็มช่วง, false = ตกนอกเวลาเปิดบางส่วนหรือทั้งหมด, null = ไม่มีข้อมูลให้เช็ก
 */
export function isOpenDuring(
  hours: GoogleOpeningHours | null | undefined,
  dateISO: string,
  arrivalHHMM: string,
  departureHHMM: string
): boolean | null {
  if (!hours?.periods?.length) return null;

  const weekday = isoDateToWeekday(dateISO);
  const arrival = timeStrToMinutes(arrivalHHMM);
  const departure = timeStrToMinutes(departureHHMM);

  // รวมช่วงเปิดของ "วันนี้" (weekday) และช่วงเปิดของเมื่อวานที่ค้างข้ามเที่ยงคืนมาถึงวันนี้
  const windows: Array<{ start: number; end: number }> = [];
  for (const period of hours.periods) {
    if (!period.close) continue; // เปิด 24 ชม. ไม่มี close — ถือว่าเปิดตลอด ไม่ต้องเช็ก
    const openMin = toMinutes(period.open.hour, period.open.minute);
    const closeMin = toMinutes(period.close.hour, period.close.minute);

    if (period.open.day === weekday) {
      const spansMidnight = period.close.day !== period.open.day;
      windows.push({ start: openMin, end: spansMidnight ? closeMin + 1440 : closeMin });
    }
    // ช่วงที่เปิดเมื่อวาน (weekday - 1) แล้วข้ามเที่ยงคืนมาถึงวันนี้
    if (period.open.day === (weekday + 6) % 7 && period.close.day === weekday) {
      windows.push({ start: openMin - 1440, end: closeMin });
    }
  }

  // เปิด 24 ชม. ทุกวัน (ไม่มี period ไหนมี close เลย)
  if (hours.periods.every((p) => !p.close)) return true;
  if (windows.length === 0) return false; // มีข้อมูล period แต่วันนี้ไม่มีช่วงเปิดเลย = ปิดทั้งวัน

  return windows.some((w) => arrival >= w.start && departure <= w.end);
}
