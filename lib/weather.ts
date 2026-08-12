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

/** ฝนแรงพอที่จะทำให้แผนกลางแจ้งพัง (ซอรัคซาน `d5` คือวันที่เจ็บสุดถ้าเจอ) */
export function isWetDay(w: DayWeather): boolean {
  return (w.rainChance ?? 0) >= 60 || (w.code != null && w.code >= 61 && w.code <= 99);
}
