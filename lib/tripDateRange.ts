export const MONTHS_TH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/** ชื่อเดือนเต็ม — ใช้บนหัวปฏิทินของ `DateField` ("มกราคม 2027") */
export const MONTHS_TH_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** หัวคอลัมน์ปฏิทิน เรียงตาม `Date.getDay()` (0 = อาทิตย์) */
export const WEEKDAYS_TH_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/**
 * วันเดียวแบบสั้น เช่น "10 ม.ค. 2027" — ใช้โชว์ค่าที่เลือกไว้บนปุ่มของ `DateField`
 * 🔴 ปี ค.ศ. เหมือน `tripDateRangeLabel` (เหตุผลเดียวกันเป๊ะ — ดูคำเตือนเรื่อง `th-TH` ด้านล่าง)
 */
export function formatIsoDateTh(iso: string): string {
  const { y, m, d } = parseIsoParts(iso);
  return `${d} ${MONTHS_TH_SHORT[m - 1]} ${y}`;
}

const MONTHS_EN_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseIsoParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/**
 * ช่วงวันของทริป เช่น "11 – 21 ต.ค. 2026" — ใช้แทนที่ `tripDates`/`t("tripDates")` เดิมที่ฝัง
 * "11 – 21 ต.ค. 2026" ตายตัว (P1 27 ส.ค. 2026: ทริปที่สองแสดงวันที่ของทริปแรก)
 *
 * 🔴 ไม่ใช้ `new Date(iso).toLocaleDateString("th-TH", {year: "numeric"})` — locale `th-TH` ใส่ปี
 * พุทธศักราชให้อัตโนมัติ (เช่น 2569) ทั้งที่ต้นฉบับที่แทนที่เป็นปี ค.ศ. ตรงๆ ("2026") จึงพาร์สปี/เดือน/วัน
 * จากสตริง ISO เองแล้วประกอบข้อความมือ ควบคุมได้ตรงว่าจะได้ปีระบบไหนแน่ๆ
 */
export function tripDateRangeLabel(startIso: string, endIso: string, lang: "th" | "en" = "th"): string {
  const months = lang === "en" ? MONTHS_EN_SHORT : MONTHS_TH_SHORT;
  const e = parseIsoParts(endIso);
  const endLabel = `${e.d} ${months[e.m - 1]} ${e.y}`;
  if (startIso === endIso) return endLabel;

  const s = parseIsoParts(startIso);
  const sameMonth = s.y === e.y && s.m === e.m;
  const startLabel = sameMonth
    ? `${s.d}`
    : `${s.d} ${months[s.m - 1]}${s.y !== e.y ? ` ${s.y}` : ""}`;
  return `${startLabel} – ${endLabel}`;
}
