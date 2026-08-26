import type { CustomPlace } from "../supabase";
import type { Db } from "./db";
import { customPlaceRowsOfTrip } from "./db";

/**
 * แปลงแถวของสคีมาใหม่ → รูป `CustomPlace` ที่ UI ใช้อยู่ — `E3`
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## 🔴 ทำไมต้องมีชั้นแปลงรูป ทั้งที่ `E3-AC1` อ่านเหมือนงานย้ายที่
 *
 * เกณฑ์เขียนว่า *"ย้าย 67 จุดเข้า DAL"* · **แต่สคีมาใหม่รูปไม่เหมือนเดิมเลย:**
 * ```
 * ใหม่ : city_id (uuid) · ไม่มี name_* (อยู่ใน custom_place_names) · legacy_added_by
 * เดิม : city (string) · name_th/name_en/name_ko ในตัว          · added_by (string)
 * ```
 * **แปลง hook ตรง ๆ = เปลี่ยนสัญญาข้อมูล ซึ่งลามไป 15 ไฟล์ — สำหรับ hook ที่เล็กที่สุด**
 * และ `lib/supabase.ts` มี type รูปนี้อีก 7 ตัว → **ทุกตัวจะเจอเรื่องเดียวกัน**
 *
 * 🎯 **ชั้นนี้ทำให้ `E3` กลับมาเป็นสิ่งที่ถ้อยคำของมันบอก: ย้าย *ที่รัน* ไม่ใช่เปลี่ยน *รูป***
 * · UI ไม่ต้องแตะสักไฟล์ · แอปใช้ได้ตลอดตามที่ผู้ใช้สั่ง
 * · **การแปลงรูปอยู่ที่เดียว ซึ่งเป็นที่ที่ `E7` ต้องใช้อยู่แล้วตอนย้ายข้อมูลจริง**
 *
 * ⚠️ **ราคาที่ผมไม่ซ่อน: ชั้นนี้มีโอกาสอยู่ถาวร**
 * ทางลด — **หนึ่งไฟล์ต่อหนึ่ง resource ติดป้ายชัด** และ `E5`/`E7` เป็นคนถอด ไม่ใช่ `E3`
 *
 * ## 📌 `legacy_slug` ไม่ใช่ของที่ผมประดิษฐ์ขึ้นเพื่อเลี่ยงงาน
 * `catalog_cities.legacy_slug` กับ `custom_places.legacy_added_by` **ถูกออกแบบมาเพื่อการแมปนี้ตั้งแต่ `E2`**
 * (`column-map.md` กฎร่วม · `D19`) — ชั้นนี้จึงใช้ทางที่วางไว้แล้ว ไม่ได้เปิดทางใหม่
 */

/** แถวดิบจากสคีมาใหม่ พร้อมลูกที่ join มา */
type Row = {
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
function pickName(names: Row["custom_place_names"], locale: string): string | null {
  const matches = (names ?? []).filter((n) => n.locale === locale);
  if (matches.length === 0) return null;
  return matches.reduce((best, n) => (n.priority < best.priority ? n : best)).name;
}

export function toCustomPlace(row: Row): CustomPlace {
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

/** อ่านคลังของทริป แล้วคืนรูปที่ UI ใช้ — **RLS เป็นคนกรองว่าเห็นทริปไหนได้** */
export async function customPlacesOfTrip(db: Db, tripId: string): Promise<CustomPlace[]> {
  const { data, error } = await customPlaceRowsOfTrip(db, tripId);
  if (error) throw new Error(`อ่านคลังสถานที่ไม่ได้: ${error.message}`);
  return (data as unknown as Row[] | null ?? []).map(toCustomPlace);
}
