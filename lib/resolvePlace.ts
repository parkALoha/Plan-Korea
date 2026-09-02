import { PLACES, Place } from "@/data/places";
import { findTransferPoint } from "@/data/transferPoints";
import type { CustomPlace } from "@/lib/supabase";

/**
 * แปลง id รูปแบบ `hotel@{lat},{lng}` (สร้างจาก `hotelAnchorId`) กลับเป็น Place
 * คืน null ถ้าไม่ใช่รูปแบบนี้หรือพิกัดเสีย — ให้ resolvePlace ไปลองทางอื่นต่อ
 */
function parseHotelPlaceId(placeId: string): Place | null {
  if (!placeId.startsWith("hotel@")) return null;
  const [lat, lng] = placeId.slice("hotel@".length).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    id: placeId,
    nameTh: "ที่พัก",
    nameEn: "Accommodation",
    /**
     * 🔴 `null` = **ไม่รู้** · เคยเป็น `"seoul"` พร้อมคอมเมนต์ว่า *"ไม่ได้ใช้จริง"* จนถึง 2 ก.ย. 2026
     * → **โรงแรมที่โตเกียวประกาศตัวว่าอยู่โซล** และคอมเมนต์นั้นตรวจไม่ได้ · หมดอายุได้เงียบ ๆ
     * 🎯 รูปเดียวกับ `noHotel` ที่ *"ไม่มีใครส่งมา"* แล้วมีคนอ่านจริงภายหลัง (นับวันบินเป็นคืนที่ต้องมีโรงแรม)
     * — **ค่าที่ใส่เพราะ type บังคับ คือค่าที่จะมีคนอ่านวันหนึ่ง** · `E6-AC12` เปิดชนิดให้พูดว่า "ไม่รู้" ได้
     */
    city: null,
    category: "transport",
    descriptionTh: "แวะที่พัก (เช็คอิน / ฝากกระเป๋า / พัก)",
    lat,
    lng,
    mapsQuery: `${lat},${lng}`,
    youtubeQuery: "",
  };
}

/**
 * แหล่งที่ `resolvePlace` ค้นได้ · **ก้อนเดียว ไม่ใช่พารามิเตอร์เรียงกัน** — `E6-AC13`
 *
 * 🔴 **ทำไมเป็นอ็อบเจกต์ ไม่ใช่ `(placeId, customPlaces, catalog)`**
 * แหล่งที่สี่จะมาแน่ (ที่พักจาก `trip_hotels` · จุดหมายจาก `E7`) · พารามิเตอร์เรียงกันทำให้
 * **ผู้เรียก 16 จุดต้องแก้ทุกครั้งที่เพิ่มแหล่ง** ส่วนอ็อบเจกต์เพิ่มคีย์ได้โดยไม่แตะใคร
 */
export type PlaceSources = {
  customPlaces: CustomPlace[];
  /**
   * side-map จาก `GET …/stops` (`E6-AC13`) — คีย์คือ `place_id` เดียวกับที่ `StopDto` ใช้
   * · `undefined`/`{}` = **ยังไม่มี ไม่ใช่ "ไม่มีสถานที่"** · route เสื่อมมาทางนี้เมื่อคิวรีคลังล้ม
   */
  catalog?: Record<string, Place>;
};

/**
 * ## ลำดับค้น: `catalog → transfer → hotel → custom → PLACES(สถิตย์)`
 * **สลับเมื่อ 2 ก.ย. 2026** (P1 ตัดสิน · P3 ทำ) — เดิมไฟล์สถิตย์อยู่บนสุด
 *
 * 🔴 **เหตุผลหลักคือ *เส้นทางล้มเหลว* ไม่ใช่ `AC1`**
 * สถิตย์อยู่ท้าย = ตาข่ายรับตอน `places: {}` ซึ่งเป็นสภาพที่ route เสื่อมลงมาพอดีเมื่อคิวรีคลังล้ม
 * → **ไม่มีทิศไหนแย่ลงกว่าพฤติกรรมเดิมเลย แม้คลังล่มทั้งใบ** · ส่วนข้อ `AC1` (ถอด `data/places.ts`
 * ออกจากบันเดิลได้เมื่อวัดได้) ถูกเหมือนกัน **แต่เป็นเหตุผลเรื่องการวัด ไม่ใช่เรื่องผู้ใช้**
 *
 * ## 🔴 เงื่อนไขที่ต้องเป็นจริงก่อนสลับ — **เป็นจริงแล้ว ไม่ใช่ข้อสันนิษฐาน**
 * `PLACES` 72 รายการมี `id` รูปเดียวกับ `catalog_places.legacy_slug` → ชนกันทั้ง 72 ตัว
 * **คลังต้องให้ของครบเท่าไฟล์ ไม่งั้นผู้ใช้เห็นการ์ดที่จนลงโดยไม่มีอะไรแดง**
 * ```
 * nameTh/En · nameLocal · addressLocal · descriptionTh · mapsQuery   ครบอยู่แล้ว (วัดจาก migration)
 * youtube_query · google_place_id                                    ขาด → เติมด้วย 20260902090000
 * ```
 * · ✅ ยืนยันสองชั้นก่อนสลับ: **P3 วัดจาก migration ว่าใส่อะไรลงไป** · **P1 อ่านค่ากลับจากฐานจริง**
 *   (72/72 มี `youtube_query` · 3/3 มี `google_place_id`) · **P2 เทียบชื่อจากหน้าจอจริง 53 slug → ต่างกัน 0**
 * · 🎯 **สามชั้นนี้ตอบคนละคำถาม** — *ใส่อะไร* · *ฐานมีอะไรตอนนี้* · *ผู้ใช้เห็นอะไร* · ตรงกันทั้งสาม
 */
export function resolvePlace(placeId: string, sources: PlaceSources): Place | null {
  const { customPlaces, catalog } = sources;

  // 🔴 `Object.hasOwn` ไม่ใช่ของประดับ — `catalog["constructor"]` คืนของจาก prototype ซึ่ง truthy
  //    (รูปเดียวกับ `categoryMetaOf` · `countryOfCitySlug`) · `place_id` มาจากฐาน ควบคุมค่าไม่ได้
  if (catalog && Object.hasOwn(catalog, placeId)) return catalog[placeId];

  // สนามบิน/สถานีของแถว kind="transfer" — อยู่นอก PLACES เพื่อไม่ให้โผล่ในคลังสถานที่
  // แต่ต้อง resolve ได้ ไม่งั้น computeSchedule ถือว่าแถวนั้นไม่มีพิกัด แล้วเวลาเดินทางหายไปทั้งช่วง
  const transferPoint = findTransferPoint(placeId);
  if (transferPoint) return transferPoint;

  // แถว "แวะที่พัก" (kind="hotel") — id ฝังพิกัดมาในตัวเอง (ดู hotelAnchorId ใน lib/hotelLegs.ts)
  // จึง resolve ได้โดยไม่ต้องส่งตาราง trip_hotels เข้ามาทุกจุดที่เรียก resolvePlace (12 จุดทั่วโปรเจกต์)
  // ชื่อที่คืนเป็นชื่อกลางๆ — แถวจริงใน SortableStopRow โชว์ชื่อโรงแรมจาก trip_hotels ทับอีกที
  // ซึ่งอัปเดตตามเมื่อผู้ใช้เปลี่ยนโรงแรม ต่างจากชื่อที่ฝังใน id ที่จะค้างเป็นของเก่า
  const hotelPoint = parseHotelPlaceId(placeId);
  if (hotelPoint) return hotelPoint;

  const custom = customPlaces.find((p) => p.id === placeId);
  if (!custom) {
    /**
     * 🔴 **ตาข่ายสุดท้าย: ไฟล์สถิตย์** — เดิมอยู่*บนสุด* ย้ายลงมาที่นี่ 2 ก.ย. 2026
     * ถึงบรรทัดนี้ได้แปลว่า **คลังไม่มีสถานที่นี้** ซึ่งเกิดได้สองทางและทั้งสองทางควรได้ของจากไฟล์:
     * ① `places: {}` เพราะคิวรีคลังฝั่งเซิร์ฟเวอร์ล้ม → **เสื่อมมาเป็นพฤติกรรมก่อนหน้านี้เป๊ะ**
     * ② เปิดออฟไลน์ตั้งแต่ยังไม่เคยโหลด side-map → ไม่มีอะไรในเครื่อง
     * 🎯 **นี่คือเหตุผลหลักที่เลือกลำดับนี้ ไม่ใช่เรื่อง `AC1`** — ไม่มีทิศไหนแย่ลงกว่าเดิมเลย
     *    แม้คลังล่มทั้งใบ · (เหตุผลเรื่อง `AC1` ถูกเหมือนกัน แต่มันเป็นเรื่อง *การวัดได้* ไม่ใช่เรื่องผู้ใช้)
     */
    return PLACES.find((p) => p.id === placeId) ?? null;
  }

  return {
    id: custom.id,
    nameTh: custom.name_th,
    nameEn: custom.name_en ?? custom.name_th,
    city: custom.city,
    category: custom.category,
    descriptionTh: custom.description ?? "",
    lat: custom.lat,
    lng: custom.lng,
    mapsQuery: custom.maps_query,
    googlePlaceId: custom.google_place_id ?? null,
    youtubeQuery: custom.name_th,
  };
}
