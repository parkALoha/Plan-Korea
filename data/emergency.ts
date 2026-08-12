import type { City } from "@/data/itinerary";

export type EmergencyContact = {
  icon: string;
  label: string;
  /** เบอร์ที่กดโทรได้เลย (ใส่รูปแบบสากลเมื่อโทรจากซิมไทย/eSIM ต่างประเทศ) */
  tel?: string;
  /** เบอร์ที่กดจากในประเทศนั้นตรงๆ (สั้น ไม่มีรหัสประเทศ) */
  local?: string;
  detail?: string;
  url?: string;
};

/**
 * เบอร์ฉุกเฉินแยกตาม "ประเทศที่กำลังอยู่" — ทริปนี้มี 2 ประเทศ (เกาหลี + ฮานอยตอนพักเครื่อง)
 *
 * ⚠️ เบอร์สถานทูตเป็นข้อมูลที่เปลี่ยนได้ **ตรวจซ้ำจากหน้าเว็บทางการก่อนเดินทางเสมอ** (มีลิงก์ให้แล้ว)
 * ส่วนเบอร์ฉุกเฉินหลักของแต่ละประเทศ (119/112 เกาหลี · 113/115 เวียดนาม) เป็นเลขมาตรฐานที่ไม่เปลี่ยน
 */
export const EMERGENCY_BY_COUNTRY: Record<"kr" | "vn", EmergencyContact[]> = {
  kr: [
    {
      icon: "🚑",
      label: "รถพยาบาล / ดับเพลิง",
      local: "119",
      detail: "กดจากในเกาหลีได้เลย มีล่ามภาษาอังกฤษ",
    },
    { icon: "🚓", label: "ตำรวจ", local: "112", detail: "กดจากในเกาหลีได้เลย" },
    {
      icon: "🧭",
      label: "สายด่วนท่องเที่ยวเกาหลี 1330",
      local: "1330",
      tel: "+8221330",
      detail: "24 ชม. · มีล่ามหลายภาษา · ถามทาง/แปลให้คนขับแท็กซี่ได้ด้วย",
    },
    {
      icon: "🇹🇭",
      label: "สถานเอกอัครราชทูตไทย ณ กรุงโซล",
      tel: "+82227953098",
      detail: "42 Daesagwan-ro, Yongsan-gu, Seoul · เช็คเบอร์ฉุกเฉินนอกเวลาทำการที่หน้าเว็บ",
      url: "https://seoul.thaiembassy.org/",
    },
  ],
  vn: [
    { icon: "🚓", label: "ตำรวจ", local: "113", detail: "กดจากในเวียดนามได้เลย" },
    { icon: "🚑", label: "รถพยาบาล", local: "115", detail: "กดจากในเวียดนามได้เลย" },
    {
      icon: "🇹🇭",
      label: "สถานเอกอัครราชทูตไทย ณ กรุงฮานอย",
      tel: "+842438235092",
      detail: "63-65 Hoang Dieu, Ba Dinh, Hanoi · เช็คเบอร์ฉุกเฉินนอกเวลาทำการที่หน้าเว็บ",
      url: "https://hanoi.thaiembassy.org/",
    },
  ],
};

/** เมืองไหนอยู่ประเทศไหน — ฮานอยเป็นเวียดนาม ที่เหลือเกาหลี */
export function countryOfCity(city: City): "kr" | "vn" {
  return city === "hanoi" ? "vn" : "kr";
}
