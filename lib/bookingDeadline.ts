import { localDateIso } from "@/lib/localDate";

/** ช่วงที่ยอมรับของ "จองล่วงหน้ากี่วัน" — 10 ปีพอเหลือเฟือสำหรับตั๋วทุกชนิด
 *  ต้องมีเพดานเพราะค่านี้มาจาก `<input type="number">` ที่ผู้ใช้พิมพ์อะไรก็ได้ (`min={0}` กันแค่ปุ่มลูกศร)
 *  เกินช่วงที่ Date รับไหวแล้ว `toISOString()` จะ **โยน RangeError กลางการ render** = โมดัลตั๋วพังทั้งใบ
 *  (ค่ากลางๆ อย่าง 1e7 ยิ่งร้ายกว่า: ไม่โยน แต่คืนสตริงปีขยาย เช่น "-025353-09" ออกมาโชว์เฉยๆ) */
const MAX_DAYS_BEFORE = 3650;

function addDaysIso(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** วันที่ควรจองภายใน คำนวณจากวันที่ต้องใช้ตั๋วลบด้วยจำนวนวันที่ต้องจองล่วงหน้า
 *  คืน null ถ้าข้อมูลไม่ครบ (ยังไม่ผูกวันที่ใช้ตั๋ว หรือยังไม่ได้ระบุจำนวนวันล่วงหน้า) หรือค่าที่ให้มาใช้ไม่ได้ */
export function bookByDate(date: string | null, daysBefore: number | null): string | null {
  if (!date || daysBefore == null) return null;
  if (!Number.isFinite(daysBefore)) return null;
  const clamped = Math.min(Math.max(Math.trunc(daysBefore), 0), MAX_DAYS_BEFORE);
  return addDaysIso(date, -clamped);
}

/** จำนวนวันนับจากวันนี้ถึง `iso` — ติดลบ = เลยมาแล้ว
 *  เทียบ "วันปฏิทิน" ไม่ใช่ "24 ชม." ทั้งสองฝั่งจึงถูกตรึงไว้ที่เที่ยงคืน UTC เท่ากันก่อนลบ */
export function daysUntil(iso: string, today: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${localDateIso(today)}T00:00:00Z`)) / msPerDay
  );
}
