/**
 * ตารางชื่อ/ไอคอนของเมือง — **แยกไฟล์ออกจาก `data/itinerary.ts` เมื่อ 30 ส.ค. 2026 (`E6-AC1` · P3)**
 *
 * 🔴 **แก้เหตุผลย้อนหลัง 30 ส.ค. 2026 — เหตุผลที่ผมเขียนไว้ตอนแยกไฟล์ *ผิด* และผมวัดพิสูจน์เอง**
 * ตอนแยกผมอ้างว่า *"`ITINERARY` ยังอยู่ในบันเดิล เพราะตารางพวกนี้อยู่ไฟล์เดียวกับมัน"*
 * · หลักฐานที่ผมใช้คือ `grep VN610` ในบันเดิล — **และ `VN610` ไม่ได้มีเฉพาะใน `data/itinerary.ts`**
 *   (`data/transferPoints.ts` · `TripPlanScreen.tsx` · `BookingEditModal.tsx` ก็มี) → **มาร์กเกอร์ไม่ผูกขาด
 *   จึงพิสูจน์อะไรไม่ได้เลย**
 * · วัดใหม่ด้วยสตริงที่มีเฉพาะในไฟล์นั้นจริง ๆ **ก่อนแยก 0 chunk · หลังแยก 0 chunk** →
 *   **`B6` เอา `ITINERARY` ออกจากบันเดิลไปแล้วตั้งแต่ `c7aca6d` · การแยกไฟล์นี้ไม่ได้เปลี่ยนอะไรเลย**
 *
 * ✅ **ทำไมยังเก็บการแยกไว้ ทั้งที่เหตุผลเดิมเป็นเท็จ:** ตารางพวกนี้ถูก import แบบ value จาก 3 ไฟล์
 * ขณะที่ `data/itinerary.ts` ไม่มีผู้ import แบบ value เหลือเลย — **แยกไว้ทำให้สภาพนั้นพังยากขึ้น**
 * ถ้าวันหนึ่ง tree-shaking ทำงานไม่ได้ (side effect ในไฟล์ · เปลี่ยน bundler) ขอบของโมดูลจะเป็นตัวกัน
 * 🔴 **แต่นี่คือเหตุผลเชิงป้องกัน ไม่ใช่ตัวเลขที่วัดได้** — ห้ามอ้างไฟล์นี้ว่า "ลดบันเดิลไป N KB"
 * 🎯 **บทเรียนที่แพงกว่าตัวไฟล์: มาร์กเกอร์ที่ไม่ได้พิสูจน์ความผูกขาด ให้ผลที่หน้าตาเหมือนการวัดจริงทุกประการ**
 *
 * ⚠️ `import type` จาก `@/data/itinerary` ที่นี่ **ไม่ลากอะไรมา** — ชนิดถูกลบทิ้งตอนคอมไพล์
 */
import type { Day } from "@/data/itinerary";
import type { KnownPlaceCity } from "@/data/places";

export const CITY_NAME_TH: Record<Day["city"], string> = {
  hanoi: "ฮานอย",
  busan: "ปูซาน",
  sokcho: "ซกโช",
  gangneung: "คังนึง",
  seoul: "โซล",
  suwon: "ซูวอน",
};

export const CITY_NAME_EN: Record<Day["city"], string> = {
  hanoi: "Hanoi",
  busan: "Busan",
  sokcho: "Sokcho",
  gangneung: "Gangneung",
  seoul: "Seoul",
  suwon: "Suwon",
};

/**
 * ชื่อไทยของ**ทุกเมืองที่สถานที่หนึ่งอาจอยู่ได้** — กว้างกว่า `CITY_NAME_TH` ที่เป็นเมืองของทริปเท่านั้น
 *
 * แยกกันสองตัวโดยตั้งใจ: `lib/citySegments.ts` ใช้ `Object.keys(CITY_NAME_TH)` เป็นรายชื่อเมือง
 * ของทริปไปหาว่าพิกัดหนึ่งอยู่เมืองไหน — เติมกรุงเทพ/โฮจิมินห์เข้าไปในนั้นจะทำให้ช่วงเมืองบนแผนที่
 * รายวันเพี้ยน ส่วนตัวนี้ใช้เฉพาะตอนต้องเอ่ยชื่อเมืองของ `Place` ที่อาจเป็นสนามบินนอกเกาหลี
 */
export const PLACE_CITY_NAME_TH: Record<KnownPlaceCity, string> = {
  ...CITY_NAME_TH,
  bangkok: "กรุงเทพ",
  hcmc: "โฮจิมินห์",
};

export const CITY_META: Record<
  Day["city"],
  { icon: string; color: string; colorDark: string }
> = {
  hanoi: { icon: "🛫", color: "#a8552f", colorDark: "#843f21" },
  busan: { icon: "🌊", color: "#2f6690", colorDark: "#234d6e" },
  sokcho: { icon: "🍁", color: "#3f7d5c", colorDark: "#2e5d44" },
  gangneung: { icon: "☕", color: "#2e7d82", colorDark: "#215d61" },
  seoul: { icon: "🏯", color: "#6b4c7a", colorDark: "#523a5e" },
  suwon: { icon: "🏰", color: "#b8862e", colorDark: "#946b23" },
};
