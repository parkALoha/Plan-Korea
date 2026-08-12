function addDaysIso(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** วันที่ควรจองภายใน คำนวณจากวันที่ต้องใช้ตั๋วลบด้วยจำนวนวันที่ต้องจองล่วงหน้า
 *  คืน null ถ้าข้อมูลไม่ครบ (ยังไม่ผูกวันที่ใช้ตั๋ว หรือยังไม่ได้ระบุจำนวนวันล่วงหน้า) */
export function bookByDate(date: string | null, daysBefore: number | null): string | null {
  if (!date || daysBefore == null) return null;
  return addDaysIso(date, -daysBefore);
}

/** จำนวนวันนับจากวันนี้ถึง `iso` — ติดลบ = เลยมาแล้ว */
export function daysUntil(iso: string, today: Date = new Date()): number {
  const todayIso = today.toISOString().slice(0, 10);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / msPerDay);
}
