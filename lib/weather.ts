export type DayWeather = {
  date: string;
  /** WMO weather code จาก Open-Meteo — null เมื่อ API ไม่ได้คืนค่าของวันนั้น */
  code: number | null;
  tempMax: number | null;
  tempMin: number | null;
  /** โอกาสฝนสูงสุดของวัน (%) */
  rainChance: number | null;
};

/**
 * WMO weather code → อีโมจิ + คำอธิบายไทย (ตารางมาตรฐานของ Open-Meteo)
 * จับเป็นช่วงแทนที่จะแมปครบทุกรหัส เพราะบนหัวการ์ดวันมีที่แค่ไม่กี่ตัวอักษร — ต้องอ่านจบด้วยตาเดียว
 */
export function weatherLabel(code: number | null): { icon: string; text: string } {
  if (code == null) return { icon: "❔", text: "ไม่มีข้อมูล" };
  if (code === 0) return { icon: "☀️", text: "แดดจัด" };
  if (code <= 2) return { icon: "🌤️", text: "แดดสลับเมฆ" };
  if (code === 3) return { icon: "☁️", text: "เมฆมาก" };
  if (code <= 48) return { icon: "🌫️", text: "หมอก" };
  if (code <= 57) return { icon: "🌦️", text: "ฝนละออง" };
  if (code <= 67) return { icon: "🌧️", text: "ฝน" };
  if (code <= 77) return { icon: "🌨️", text: "หิมะ" };
  if (code <= 82) return { icon: "🌧️", text: "ฝนซู่" };
  if (code <= 86) return { icon: "🌨️", text: "หิมะซู่" };
  return { icon: "⛈️", text: "พายุฝนฟ้าคะนอง" };
}

/**
 * ฝนแรงพอที่จะทำให้แผนกลางแจ้งพัง (ซอรัคซาน `d5` คือวันที่เจ็บสุดถ้าเจอ)
 *
 * 🔴 **`>= 58` ไม่ใช่ `>= 61` — แก้ 27 ส.ค. 2026 หลังเทสต์จับความขัดแย้ง (P1)**
 * `weatherLabel()` ใช้ `code <= 67` → **รหัส 58/59/60 ได้ป้ายว่า "ฝน"**
 * แต่ `isWetDay()` เดิมเริ่มที่ 61 → **ป้ายบอกฝน ระบบบอกไม่เปียก บนหน้าจอเดียวกัน**
 *
 * ⚠️ **วันนี้ยังไม่กัด เพราะ Open-Meteo ไม่เคยส่ง 58–60 ออกมาเลย**
 * (ชุดที่มันใช้จริงคือ 0–3, 45/48, 51/53/55, 56/57, 61/63/65, 66/67, 71/73/75/77, 80–82, 85/86, 95/96/99)
 * 🎯 **แต่ "ผู้ให้บริการปัจจุบันไม่ส่งค่านี้" ไม่ใช่คุณสมบัติของโค้ดเรา — มันคือคุณสมบัติของเขา**
 * แพลตฟอร์มจะรับหลายประเทศ และวันที่เปลี่ยนแหล่งข้อมูล ความขัดแย้งนี้จะตื่นขึ้นมาเงียบ ๆ
 * · WMO 4677 นิยาม 58/59 ว่า *"ละอองปนฝน"* → **นับเป็นวันเปียกถูกต้องกว่าอยู่แล้ว**
 * · ละอองล้วน (51–57) ยัง**ไม่นับ**เหมือนเดิม — ถ้านับ ป้ายเตือนจะขึ้นบ่อยจนไม่มีใครอ่าน
 */
export function isWetDay(w: DayWeather): boolean {
  return (w.rainChance ?? 0) >= 60 || (w.code != null && w.code >= 58 && w.code <= 99);
}
