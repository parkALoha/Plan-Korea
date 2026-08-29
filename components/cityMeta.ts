import { CITY_META, CITY_NAME_EN, CITY_NAME_TH, type Day } from "@/data/itinerary";

export type CityMeta = { icon: string; color: string; colorDark: string };

/**
 * หน้าตาของเมืองที่ **ไม่มีใน `CITY_META`** — วันที่ยังไม่ระบุเมือง หรือเมืองนอกไฟล์เดิม (โตเกียว ฯลฯ)
 * ใช้โทเคนกลางแทนสีประจำเมือง เพราะยังไม่มีสีของเมืองนั้น และหยิบสีเมืองอื่นมาใช้จะสื่อผิด
 */
export const UNSET_CITY_META: CityMeta = {
  icon: "📍",
  color: "var(--content-soft)",
  colorDark: "var(--content-soft)",
};

export const UNSET_CITY_NAME_TH = "ยังไม่ระบุเมือง";

/**
 * 🔴 **ใช้ตัวนี้แทน `CITY_META[city]` ตรง ๆ เสมอ**
 *
 * `CITY_META` เป็น `Record<Day["city"], …>` ที่มี **แค่ 6 เมืองเกาหลี** — แต่ตั้งแต่ `B6` เป็นต้นไป
 * `Day` สร้างจากฐานได้ด้วย ซึ่งมี **42 เมือง** และ **วันที่ยังไม่ระบุเมืองเป็นสภาพตั้งต้น**
 * (ผู้ใช้เลือกเอง 28 ส.ค. 2026: *"ไม่ต้องเดา ให้ว่างไว้แล้วผมเลือกเอง"*)
 *
 * 🎯 **อาการเวลาพลาด: `CITY_META[x]` เป็น `undefined` → อ่าน `.icon` ต่อ → ทั้งหน้าไม่ขึ้นเลย**
 * ไม่ใช่แค่ไอคอนหาย · เกิดจริงแล้วครั้งหนึ่ง 28 ส.ค. 2026 (`DayJumpBar`) — **`tsc` จับไม่ได้**
 * เพราะ index ของ `Record` ที่คีย์เป็น union ถือว่า "มีเสมอ" ตามชนิด ทั้งที่ค่าจริงถูก cast เข้ามา
 */
export function cityMetaOf(city: Day["city"] | null | undefined): CityMeta {
  return (city && CITY_META[city]) || UNSET_CITY_META;
}

/** ชื่อไทยของเมือง — คู่กับ `cityMetaOf` ด้วยเหตุผลเดียวกัน */
export function cityNameThOf(city: Day["city"] | null | undefined): string {
  return (city && CITY_NAME_TH[city]) || UNSET_CITY_NAME_TH;
}

/** ชื่ออังกฤษของเมือง — เติม 29 ส.ค. 2026 (P3) ตอนแก้ `app/summary` ให้เลิก index ตรง
 *  ข้อความ fallback ตรงกับ `UNSET_CITY_EN` ใน `hooks/usePlatformItinerary.ts` โดยตั้งใจ */
export const UNSET_CITY_NAME_EN = "No city yet";

export function cityNameEnOf(city: Day["city"] | null | undefined): string {
  return (city && CITY_NAME_EN[city]) || UNSET_CITY_NAME_EN;
}
