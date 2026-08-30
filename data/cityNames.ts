/**
 * ตารางชื่อ/ไอคอนของเมือง — **แยกไฟล์ออกจาก `data/itinerary.ts` เมื่อ 30 ส.ค. 2026 (`E6-AC1` · P3)**
 *
 * 🔴 **เหตุผลคือ *ขนาดบันเดิล* ไม่ใช่ความสะอาด และมันเป็นช่องที่ทีมเข้าใจผิดกันทั้งทีม**
 * `B6` ทำให้ **ไม่มีไฟล์ไหนใน `app`/`components`/`hooks`/`lib` import `ITINERARY` แบบ value อีกเลย**
 * → ทุกคน (รวมผมเอง) คาดว่า `data/itinerary.ts` จะหลุดจากบันเดิล · **วัดจริงแล้วมันยังอยู่ทั้งก้อน**
 * 🎯 เพราะตารางสี่ใบข้างล่างเคยอยู่ *ไฟล์เดียวกับ* `ITINERARY` — ใครขอ `CITY_META` (6 บรรทัด)
 *    **ลากโมดูลทั้งไฟล์ 38 KB มาด้วย**
 * · 🔴 ***"ไม่มีผู้เรียกแล้ว" ไม่เท่ากับ "ไม่อยู่ในบันเดิล"*** — สองอย่างนี้ต่างกันตรงที่ *ขอบของโมดูล*
 *   ไม่ใช่ตรงที่ผู้เรียก · **ห้ามย้ายตารางพวกนี้กลับเข้าไฟล์ที่มีข้อมูลก้อนใหญ่อีก**
 *
 * ⚠️ `import type` จาก `@/data/itinerary` ที่นี่ **ไม่ลากอะไรมา** — ชนิดถูกลบทิ้งตอนคอมไพล์
 */
import type { Day } from "@/data/itinerary";
import type { Place } from "@/data/places";

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
export const PLACE_CITY_NAME_TH: Record<Place["city"], string> = {
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
