import { CATEGORY_COLOR, CATEGORY_COLOR_DARK, CATEGORY_EMOJI, CATEGORY_LABEL } from "@/data/places";
import type { Category } from "@/data/places";

export type CategoryMeta = { emoji: string; color: string; colorDark: string; label: string };

/**
 * หน้าตาของหมวดที่ **ไม่มีใน `CATEGORY_*`** — คู่ขนานกับ `UNSET_CITY_META` ใน `components/cityMeta.ts`
 *
 * 🔴 **ทำไมสีเป็นเลขฐานสิบหกตรง ๆ ไม่ใช่โทเคน `var(--…)` แบบที่ `UNSET_CITY_META` ใช้**
 * ค่าสีของหมวด **ไม่ได้ถูกใช้เป็น CSS อย่างเดียว**:
 * · `PlaceThumb.tsx` ต่อสตริงเป็น `` `${CATEGORY_COLOR[c]}22` `` เพื่อทำสีโปร่ง — `var(--x)22` เป็นขยะ
 * · `DayMapPanel.tsx` ส่งเข้า `fillColor`/`strokeColor` ของสัญลักษณ์ Google Maps ซึ่ง **ไม่ผ่านเครื่องมือ
 *   CSS ของเบราว์เซอร์** จึงแปลค่า custom property ไม่ได้
 * → **โทเคนใช้ไม่ได้ที่นี่ตามข้อจำกัดของผู้บริโภค ไม่ใช่เพราะเราไม่อยากใช้** (ต่างจากสีเมืองซึ่งเป็น CSS ล้วน)
 * · เลือกโทนเทาอุ่นให้เข้ากับจานสีครีม/เมเปิลของเว็บ และ **ไม่ชนกับสีหมวดใดที่มีอยู่** — อ่านเป็น "ยังไม่จัดหมวด"
 *   ไม่ใช่ "เป็นหมวดนั้น"
 */
export const UNSET_CATEGORY_META: CategoryMeta = {
  emoji: "📍",
  color: "#78716c",
  colorDark: "#57534e",
  label: "อื่น ๆ",
};

/**
 * 🔴 **ใช้ตัวนี้แทน `CATEGORY_*[category]` ตรง ๆ เมื่อค่ามาจากฐาน**
 *
 * `CATEGORY_*` เป็น `Record<Category, …>` ที่มี 10 หมวด — แต่ `catalog_places.category` และ
 * `custom_places.category` ในฐานเป็นแค่ `length 1..40` **ไม่ใช่ enum** (P1 วัดฐานเอง 29 ส.ค. 2026)
 * → ค่านอก 10 หมวดเข้ามาได้ทุกเมื่อ และ `useCatalogPlaces.ts` ก็ `cast` เป็น `Category` อยู่แล้ววันนี้
 *
 * ⚠️ **`tsc` ไม่ได้แค่จับไม่ได้ — มัน *รับรอง* ว่าปลอดภัย** เพราะเราบอกมันเองว่าคอลัมน์เป็น union
 *
 * 📌 **ไม่ใช่ทุกจุดที่ต้องใช้ตัวนี้** — จุดที่คีย์มาจาก *ตัว union เอง* (วนลิสต์หมวดเพื่อทำตัวกรอง ฯลฯ)
 * ปลอดภัยโดยโครงสร้าง · ใช้ตัวนี้สิ้นเปลืองเปล่า และทำให้อ่านไม่ออกว่าจุดไหนคือจุดที่รับค่าจากภายนอกจริง
 *
 * 🎯 `Object.hasOwn` ไม่ใช่ของประดับ — `in` หรือ index ตรง ๆ จะคืนของจาก **prototype** เมื่อคีย์เป็น
 * `"constructor"` / `"__proto__"` (ค่าที่ได้เป็น truthy → `?? fallback` ไม่ช่วยเลย) · รูปเดียวกับที่
 * `countryOfCitySlug()` และ `lib/engine/countries.ts` ใช้อยู่แล้ว
 */
export function categoryMetaOf(category: string | null | undefined): CategoryMeta {
  if (!category || !Object.hasOwn(CATEGORY_EMOJI, category)) return UNSET_CATEGORY_META;
  const c = category as Category;
  return {
    emoji: CATEGORY_EMOJI[c],
    color: CATEGORY_COLOR[c],
    colorDark: CATEGORY_COLOR_DARK[c],
    label: CATEGORY_LABEL[c],
  };
}
