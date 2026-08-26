import type { CustomPlace } from "../supabase";

/** แถวดิบจากสคีมาใหม่ พร้อมลูกที่ join มา */
export type CustomPlaceRow = {
  id: string;
  city_id: string;
  category: string;
  lat: number;
  lng: number;
  maps_query: string;
  google_place_id: string | null;
  legacy_added_by: string | null;
  created_at: string;
  // 🔴 **สองช่องนี้มาจาก embedded resource ของ PostgREST — `postgres_changes` ไม่มีทางมี**
  //    Realtime ส่งแถวดิบของ *ตารางเดียว* จาก WAL ไม่ใช่ผลของคิวรี → ไม่มี join ให้เลย (P3)
  //    `null` = join แล้วไม่เจอ (เมืองถูกลบ) · `undefined` = **ไม่ได้ join มาเลย** ← คนละเรื่อง
  catalog_cities: { legacy_slug: string | null } | null;
  custom_place_names: { locale: string; name: string; priority: number }[] | null;
  // `Q6` — คำบรรยายย้ายออกจาก `custom_places` มาเป็นตารางลูกแยกภาษา (26 ส.ค. 2026)
  custom_place_descriptions: { locale: string; description: string }[] | null;
};

/**
 * 🔴 **ถ้าแถวไม่ได้ผ่าน join มา ตัวแปลงต้อง *ล้ม* ไม่ใช่คืนชื่อว่าง** (P3 เจอ · P1 ลง · 26 ส.ค. 2026)
 *
 * P3 เปิดโค้ดนี้เพื่อตอบคำถามเรื่อง `DELETE` **แล้วเจอของที่ใหญ่กว่า:**
 * > `postgres_changes` ส่งแถวดิบของตารางเดียวจาก WAL — **`payload.new` จะไม่มีคีย์
 * > `catalog_cities`/`custom_place_names` เลย** · เรียก `toCustomPlace(payload.new)` ตรง ๆ
 * > → `pickName` ได้ `[]` ทุกครั้ง → **ชื่อว่างเปล่า + `city` เป็น uuid ดิบ ทุกแถวที่เปลี่ยนผ่าน realtime**
 * > **component render สำเร็จ ไม่มี error เลย ดูเหมือนใช้งานได้ แค่ชื่อหาย**
 *
 * 🎯 **ท่าที่ P3 ตัดสินคือ *อย่าแปลง `payload.new` เลย* ใช้เป็นสัญญาณแล้ว refetch**
 * — และนี่คือการทำให้ *ทำผิดไม่ได้* แทนที่จะ *จำว่าอย่าทำ*
 *
 * ⚠️ **ความต่างที่ทำให้มันทำงาน: คีย์ *ไม่มี* ≠ คีย์มีแต่เป็น `[]`**
 * · `[]` = สถานที่นี้ไม่มีชื่อจริง ๆ (เกิดได้) → ผ่าน
 * · **ไม่มีคีย์เลย = ไม่ได้ join มา = คนเรียกใช้ผิดที่** → โยน
 * · **ตระกูลเดียวกับ `data: null` vs `data: []` ที่ทีมนี้เดินเข้าไปมาแล้วสามรอบ**
 */
function assertJoined(row: CustomPlaceRow): void {
  if (
    !("custom_place_names" in row) ||
    !("catalog_cities" in row) ||
    !("custom_place_descriptions" in row)
  ) {
    throw new Error(
      "toCustomPlace: แถวนี้ไม่ได้ผ่าน join มา — ถ้ามาจาก `postgres_changes` ห้ามแปลง\n" +
        "  Realtime ส่งแถวดิบตารางเดียว ไม่มี `catalog_cities`/`custom_place_names`\n" +
        "  → ใช้ payload เป็นสัญญาณ \"มีอะไรเปลี่ยน\" แล้ว refetch ผ่าน GET route แทน (P3 · §15)"
    );
  }
}

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
  assertJoined(row);
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
    // `Q6` — ภาษาไทยคือช่องเดียวที่รูปเดิมมี · ไม่มีก็คือไม่มี ไม่ใช่ค่าว่าง
    description:
      (row.custom_place_descriptions ?? []).find((d) => d.locale === "th")?.description ?? null,
    created_at: row.created_at,
  };
}

