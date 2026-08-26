import type { CustomPlace } from "../supabase";

/** แถวดิบจากสคีมาใหม่ พร้อมลูกที่ join มา */
export type CustomPlaceRow = {
  id: string;
  city_id: string;
  category: string;
  lat: number;
  lng: number;
  maps_query: string;
  description: string | null;
  google_place_id: string | null;
  legacy_added_by: string | null;
  created_at: string;
  catalog_cities: { legacy_slug: string | null } | null;
  custom_place_names: { locale: string; name: string; priority: number }[] | null;
};

/**
 * ชื่อในภาษาที่ขอ — **ตัวที่ `priority` น้อยที่สุด ไม่ใช่ตัวแรกที่ฐานคืนมา**
 *
 * 🔴 `custom_place_names` PK เป็น `(place_id, locale, priority)` → **หนึ่งภาษามีหลายชื่อได้จริง**
 * (ชื่อทางการ · ชื่อที่คนเรียก) · `priority` มีอยู่เพื่อตอบว่าจะโชว์อันไหน
 * **หยิบตัวแรกที่เจอ = ให้ลำดับที่ฐานคืนมาเป็นคนตัดสิน ซึ่งคือสิ่งที่ `D55` ห้ามไว้ทั้งข้อ**
 */
function pickName(names: CustomPlaceRow["custom_place_names"], locale: string): string | null {
  const matches = (names ?? []).filter((n) => n.locale === locale);
  if (matches.length === 0) return null;
  return matches.reduce((best, n) => (n.priority < best.priority ? n : best)).name;
}

export function toCustomPlace(row: CustomPlaceRow): CustomPlace {
  const nameTh = pickName(row.custom_place_names, "th");
  return {
    id: row.id,
    // 🔴 `added_by` ของ UI เป็น *ข้อความ* → มาจาก `legacy_added_by` ไม่ใช่ `added_by_user` (uuid)
    //    `D19` เก็บสตริงเดิมไว้ก็เพื่อข้อนี้ · `E7-AC5` เป็นคนผูกกลับเข้าบัญชีจริง
    added_by: row.legacy_added_by,
    // ⚠️ เมืองที่ไม่มี `legacy_slug` = เมืองที่เกิดบนแพลตฟอร์ม ไม่เคยอยู่ในเว็บเดิม
    //    คืนสตริงว่างจะทำให้ UI จัดกลุ่มมันรวมกันมั่ว → คืน `city_id` ไปตรง ๆ ให้เห็นว่าต่าง
    city: row.catalog_cities?.legacy_slug ?? row.city_id,
    // `name_th` เป็น `not null` ในรูปเดิม — ถ้าไม่มีชื่อไทยจริง ๆ ให้ใช้ภาษาอื่นแทนการโชว์ค่าว่าง
    name_th: nameTh ?? pickName(row.custom_place_names, "en") ?? pickName(row.custom_place_names, "ko") ?? "",
    name_en: pickName(row.custom_place_names, "en"),
    name_ko: pickName(row.custom_place_names, "ko"),
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    maps_query: row.maps_query,
    google_place_id: row.google_place_id,
    description: row.description,
    created_at: row.created_at,
  };
}

