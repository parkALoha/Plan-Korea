/**
 * "คีย์ระบุตัวสถานที่" ที่ส่งเข้า Google — ใช้แทน mapsQuery ดิบทุกจุดที่คุยกับ Google/แคช
 *
 * เดิมทุกเส้นทางส่ง `mapsQuery` (ข้อความล้วน) เข้า searchText ซึ่งเดาผิดได้ง่ายเมื่อชื่อร้านซ้ำกันทั้งโลก
 * เคสจริง: "Cup & Cup" ที่กวางอัลลี ปูซาน → place_details_cache ไปเก็บเวลาเปิด-ปิด/เรทติ้ง/รีวิว
 * ของร้านชานมชื่อเดียวกันที่ Plano, Texas ส่วนแผนที่ที่ฝังในหน้ารายละเอียดโชว์ร้านชื่อเดียวกันในไทย
 * เพราะ Google เดาจากตำแหน่งของคนที่เปิดเว็บ
 *
 * ที่คัดไว้เองใน data/places.ts เลี่ยงปัญหานี้ด้วยการต่อท้ายชื่อเมืองเสมอ ("Jagalchi Market Busan")
 * แต่สถานที่ที่เพิ่มเองระหว่างทางเก็บชื่อดิบที่ Google คืนมาตรงๆ จึงต้องระบุด้วย place id แทน
 * (custom_places.google_place_id — migration 0027)
 */

/** ขึ้นต้นด้วยคำนี้ = เป็น place id ไม่ใช่ข้อความค้นหา · รูปแบบเดียวกับที่ Google Maps Embed/URLs รับ (`q=place_id:ChIJ...`) */
export const PLACE_ID_PREFIX = "place_id:";

/** คีย์ที่ใช้ยิง /api/place-details, /api/place-photos และเป็น key ของ place_details_cache/place_photo_cache
 *  ไม่มี place id (ที่คัดไว้เองใน PLACES) → ตกไปใช้ข้อความค้นหาเหมือนเดิม ซึ่งมีชื่อเมืองต่อท้ายอยู่แล้ว */
export function placeQueryKey(place: { googlePlaceId?: string | null; mapsQuery: string }): string {
  return place.googlePlaceId ? PLACE_ID_PREFIX + place.googlePlaceId : place.mapsQuery;
}

/** คืน place id ถ้าคีย์นี้เป็นแบบ place_id: · คืน null ถ้าเป็นข้อความค้นหาธรรมดา */
export function parsePlaceIdKey(key: string): string | null {
  return key.startsWith(PLACE_ID_PREFIX) ? key.slice(PLACE_ID_PREFIX.length) : null;
}
