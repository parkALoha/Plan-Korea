import { CITY_LOCALE } from "@/data/places";
import type { KnownPlaceCity } from "@/data/places";
import { PLACE_CITY_NAME_TH } from "@/data/cityNames";
import { UNSET_CITY_NAME_TH } from "@/components/cityMeta";

/**
 * accessor ของแมปที่คีย์เป็น **เมืองของ `Place`** — คู่ขนานกับ `cityMetaOf`/`cityNameThOf`
 * ที่ `components/cityMeta.ts` ทำให้ `Day["city"]` ไว้แล้วเมื่อ 28 ส.ค. 2026
 *
 * 🔴 **ทำไมต้องมี (`E6-AC12` · 2 ก.ย. 2026)**
 * `Place["city"]` เลิกเป็นยูเนียนปิดแล้ว — คลังมี 42 เมือง และค่าจากฐานเป็น `string` เปล่า ๆ
 * `CITY_LOCALE[place.city]` จึงคืน `undefined` ได้จริง **ขณะที่ `tsc` รับรองว่ามีเสมอ**
 * · เกิดจริงมาแล้วกับตระกูลเดียวกัน: `DayJumpBar` 28 ส.ค. — `CITY_META[x]` เป็น `undefined`
 *   → อ่าน `.icon` ต่อ → **ทั้งหน้าไม่ขึ้น** ไม่ใช่แค่ไอคอนหาย
 *
 * 🎯 `Object.hasOwn` ไม่ใช่ของประดับ — index ตรง ๆ จะคืนของจาก **prototype** เมื่อคีย์เป็น
 * `"constructor"`/`"__proto__"` (ได้ค่า truthy → `?? fallback` ไม่ช่วยเลย) · รูปเดียวกับ
 * `categoryMetaOf()` และ `countryOfCitySlug()`
 */
export function cityLocaleOf(city: string | null | undefined): "ko" | "vi" | "th" | null {
  if (!city || !Object.hasOwn(CITY_LOCALE, city)) return null;
  return CITY_LOCALE[city as KnownPlaceCity];
}

/**
 * ชื่อไทยของเมืองที่สถานที่หนึ่งอยู่ · เมืองที่ไม่รู้จัก → `UNSET_CITY_NAME_TH` (*"ยังไม่ระบุเมือง"*)
 * 🔴 **ห้าม fallback เป็นชื่อเมืองอื่น** — ข้อความที่ใช้ค่านี้เป็นคำเตือนว่า *"สถานที่นี้อยู่คนละเมืองกับวันนี้"*
 * เมืองที่เดาขึ้นมาจะทำให้คำเตือนนั้นชี้ผิดเมือง ซึ่งแย่กว่าไม่บอกเมือง
 */
export function placeCityNameThOf(city: string | null | undefined): string {
  if (!city || !Object.hasOwn(PLACE_CITY_NAME_TH, city)) return UNSET_CITY_NAME_TH;
  return PLACE_CITY_NAME_TH[city as KnownPlaceCity];
}
