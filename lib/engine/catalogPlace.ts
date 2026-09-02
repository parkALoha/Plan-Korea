import type { Place } from "@/data/places";

/**
 * `catalog_places` (รูปที่ API คืน) → `Place` — **ตัวแปลงใบเดียวของทั้งระบบ**
 * เจ้าของ: P3-FE/Perf · 2 ก.ย. 2026 · `E6-AC13` ก้าวที่ 1
 *
 * ## 🔴 ทำไมต้องยกออกมาจาก `hooks/useCatalogPlaces.ts` **ก่อน** แตะท่อ
 * `AC13` ให้ `/stops` ส่ง side-map `places` มาด้วย → **ฝั่งเซิร์ฟเวอร์ต้องประกอบ `Place` เป็น**
 * ถ้าปล่อยให้มันเขียนตัวแปลงของตัวเอง จะมี **เส้นทาง `catalog row → Place` สองใบ** ที่ต้องซิงก์กันตลอดไป
 * · 🎯 **รูปเดียวกับ `buildDayBridge` 4 ใบที่ `E6-AC11` เพิ่งยุบ** — P1 ชี้ข้อนี้ตอนตัดสินลำดับ `AC12 → AC13`
 * · ⚠️ **สองใบจะไม่แดงเวลาเพี้ยน** — ทั้งคู่คืน `Place` ที่ถูกต้องตามชนิด ต่างกันแค่*เนื้อ*
 *
 * 📌 ยกออกมาได้สะอาดเพราะ `AC12` ปิดไปก่อน — ตอนที่ `city`/`category` ยังเป็นยูเนียนปิด
 * ตัวแปลงนี้ต้อง `cast` และการ `cast` ในไฟล์ที่ *เซิร์ฟเวอร์ก็เรียก* คือการขยายพื้นที่ของบั๊ก ไม่ใช่ย้ายที่
 */

/**
 * รูปที่ `catalogPlaceCards()` (`lib/engine/trip.ts`) คืน — **ฟิลด์ที่ `cardToPlace` ใช้เท่านั้น**
 *
 * 🔴 **ประกาศเป็นโครงสร้าง ไม่ `import` จาก `lib/engine/trip.ts`** — `trip.ts` บรรทัดแรก
 * `import { tripsVisibleToMe } from "./db"` และ `db.ts` เป็น `server-only`
 * · `import type` ถูกลบตอนคอมไพล์จริง **แต่มันเป็นการผูกที่กลายเป็น import จริงได้ทันทีที่ใครลบคำว่า
 *   `type` ออก** — และไฟล์นี้ถูก `import` จาก `hooks/useCatalogPlaces.ts` ซึ่งอยู่ฝั่งไคลเอนต์
 * · 🎯 **เอาความเป็นไปได้ออก ดีกว่าเขียนคอมเมนต์เตือน** (P4 ไล่กราฟเจอเส้นนี้ 26 ส.ค. 2026)
 *
 * ⚠️ **ทุกฟิลด์เป็น nullable ตามที่ `catalogPlaceCards` คืนจริง** — ต่างจาก `CatalogPlaceRow`
 * ข้างล่างที่ประกาศ `nameTh: string` · ความต่างนั้นคือรอยต่อที่ P3 เจอ (2 ก.ย. 2026):
 * ทั้งสองฝั่งไม่เคยเจอกันเพราะคั่นด้วย JSON และ `as CatalogPlaceRow[]` ที่
 * `hooks/useCatalogPlaces.ts:54` **คือจุดที่ `null` กลายเป็น `string` โดยไม่มีใครถาม**
 */
export type CatalogNameCard = {
  slug: string | null;
  category: string;
  citySlug: string | null;
  lat: number;
  lng: number;
  nameTh: string | null;
  nameEn: string | null;
  nameLocal: string | null;
  description: string | null;
  addressLocal: string | null;
  mapsQuery: string | null;
  googlePlaceId: string | null;
  youtubeQuery: string | null;
};

/**
 * การ์ดคลัง → `Place` · **`null` = แถวนี้ไม่ควรอยู่ในแมปที่ค้นด้วยตัวระบุ**
 * เจ้าของ: P1-Lead · 2 ก.ย. 2026 · `E6-AC13`
 *
 * ## 🔴 ทำไมคืน `null` แทนที่จะแต่งค่าให้ครบ
 * `catalog_places.legacy_slug` **ไม่มี `not null`** (`20260825134043_e2_catalog_places.sql:78` —
 * `text unique check (…)` เท่านั้น) → แถวที่ยังไม่มี slug มีได้จริง
 * · `route.ts` เดิมยุบมันเป็น `place_id: … ?? ""` → **ถ้าใส่ `""` ลง side-map สถานที่ที่ไม่มี slug
 *   *ทุกใบ* จะทับกันที่คีย์เดียว** แล้วจุดแวะคนละที่ resolve เป็นสถานที่เดียวกัน
 * 🎯 **ผิดแบบดูเหมือนถูก ไม่ใช่ว่างเปล่า** — และคีย์ที่ชนกันแยกไม่ออกจากคีย์ที่ถูกต้องเมื่อดูจากผลลัพธ์
 * · (P3 ชี้ 2 ก.ย. 2026 · ตระกูลเดียวกับ `?? ""` ที่ทีมไล่ปิดกันทั้งสัปดาห์ **แต่ใบนี้เป็น *คีย์* ไม่ใช่ *ค่า***)
 *
 * ## 🔴 ลำดับชื่อสำรอง: `th → en → local → slug` — **`local` คือตัวที่ทุกข้อเสนอแรกลืม**
 * `catalogPlaceCards` ตั้ง `nameLocal` = *ชื่อแรกที่ locale ไม่ใช่ `th`/`en`* (อ่านจากข้อมูลจริง
 * ไม่ได้ map จากประเทศ — เหตุผลอยู่ที่ `trip.ts:193`) → **สถานที่ที่มีแต่ชื่อเกาหลีจะได้
 * `nameTh=null · nameEn=null · nameLocal="해운대"`**
 * · ตกไป `slug` ตรงนั้น = **ทิ้งชื่อที่เรามีอยู่ในมือ** แล้วโชว์ `busan-bay101` แทน `해운대`
 * · ⚠️ คำถามเดิมถูกตั้งว่า *"ไม่มีชื่อ ตกเป็นอะไร"* ซึ่ง**สมมติไปแล้วว่ามีสองภาษา · ของจริงมีสาม**
 *
 * 🔴 **ท้ายสุดตกที่ `slug` ไม่ใช่ `""`** — `""` คือค่าที่ *ดูเหมือนสภาพธรรมชาติ* (การ์ดไม่มีชื่อ)
 * ส่วน `slug` เสื่อมแบบ **เห็นได้และตามรอยได้**: ผู้ใช้เห็น `busan-bay101` → บอกเราได้ → หาเจอในคิวรีเดียว
 * · และ `slug` ไม่มีวันเป็น `""` ตรงนี้ เพราะแถวที่ไม่มี slug ถูกคัดออกไปแล้วด้านบน
 */
export function cardToPlace(card: CatalogNameCard): Place | null {
  const slug = card.slug;
  if (slug === null || slug === "") return null;
  const name = card.nameTh ?? card.nameEn ?? card.nameLocal ?? slug;
  const nameEn = card.nameEn ?? card.nameTh ?? card.nameLocal ?? slug;
  return {
    id: slug,
    nameTh: name,
    nameEn,
    nameLocal: card.nameLocal ?? undefined,
    addressLocal: card.addressLocal ?? undefined,
    city: card.citySlug,
    category: card.category,
    // 🔴 `""` ถูกต้องตรงนี้ ต่างจากกรณีชื่อ — `descriptionTh` ว่างคือ *สภาพปกติ* ที่ UI รองรับแล้ว
    //    (เกาหลี 62/62 มี · ญี่ปุ่น 0/57 · ไทย 0/37) ไม่ใช่ข้อมูลที่หายไป
    descriptionTh: card.description ?? "",
    lat: card.lat,
    lng: card.lng,
    // ⚠️ `mapsQuery` ว่าง = ลิงก์แผนที่พาไปหน้าเปล่า → ตกไปที่ชื่อ ซึ่งค้นได้จริง
    mapsQuery: card.mapsQuery ?? nameEn,
    googlePlaceId: card.googlePlaceId ?? null,
    youtubeQuery: card.youtubeQuery ?? nameEn,
  };
}

/** รูปที่ `GET /api/engine/places` คืนมา (P1 28 ส.ค. 2026, `25723c0`) */
export type CatalogPlaceRow = {
  id: string;
  slug: string;
  category: string;
  citySlug: string | null;
  countryId: string;
  lat: number;
  lng: number;
  nameTh: string;
  nameEn: string;
  nameLocal: string | null;
  description: string | null;
  addressLocal: string | null;
  mapsQuery: string;
  googlePlaceId: string | null;
  youtubeQuery: string | null;
};

/**
 * 🔴 **ไม่มี `cast` เหลือในฟังก์ชันนี้แล้ว — และนั่นคือความต่างทั้งหมดที่ `AC12` ซื้อมาให้**
 * เดิม (จนถึง 1 ก.ย. 2026) บรรทัด `city`/`category` เป็น
 * `(row.citySlug ?? "") as Place["city"]` และ `row.category as Category` เพราะยูเนียนปิด 8 เมือง
 * ขณะที่คลังมี 42 · ⚠️ **ตัวที่ร้ายกว่าคือ `?? ""`** — เมืองที่ *ไม่รู้* ถูกแปลงเป็นสตริงว่าง
 * แล้ว `cast` ให้ผ่าน · **มันไม่หน้าตาเหมือนค่าที่แต่งขึ้น จึงไม่มีใครสังเกตอยู่หลายเดือน**
 *
 * ⚠️ **หนี้เก่าที่ *ยัง* ค้างอยู่ ไม่ได้หายไปกับ `AC12`:** ฟังก์ชันที่ *สลับพฤติกรรมตาม `city`*
 * (เช่น `cityCenter()`) ยังไม่รู้จักเมืองนอกชุดเดิม — ต่างกันตรงที่ตอนนี้มันได้ค่าจริงหรือ `null`
 * ไปตัดสิน **แทนที่จะได้ `""` ที่หน้าตาเหมือนคำตอบ** · ยังต้องกลับมาดูตรงนี้ก่อนส่ง `Place` จากคลัง
 * เข้าโค้ดกลุ่มนั้น
 */
export function catalogPlaceToPlace(row: CatalogPlaceRow): Place {
  return {
    /**
     * 🔴 **`id` ของ `Place` ต้องเป็น `slug` ไม่ใช่ `uuid`** — และนี่ไม่ใช่เรื่องรสนิยม (P2 · 28 ส.ค. 2026)
     * `place_id` ที่ระบบจุดแวะใช้คือ **`catalog_places.legacy_slug`** ทั้งขาเขียนและขาอ่าน:
     * · เขียน: `POST …/stops { placeId }` → `catalogPlaceIdBySlug()` → `catalog_place_id`
     * · อ่าน:  `GET …/stops` คืน `place_id = catalog_places.legacy_slug`
     * 🎯 **ส่ง `uuid` ไปแทน = API หา slug ไม่เจอ → ตกกิ่ง `UUID.test()` → ลง `custom_place_id` ผิดคอลัมน์**
     *    → FK `23503` → `400 "ไม่รู้จักสถานที่"` (วัดจริง: กด "+ เพิ่มลงวันนี้" แล้วได้ 400 สองใบ)
     * · และถ้ารอดไปได้ ตัวกรอง "เพิ่มไปแล้ว" ก็จะเทียบ `uuid` กับ `slug` — **ไม่ตรงตลอดกาล อย่างเงียบ ๆ**
     * ⚠️ **ฟิลด์ที่ API เรียกว่า `slug` คือ `legacy_slug` ในฐาน** (`lib/engine/db.ts:158`) — อ่านจาก DAL
     *    ไม่ใช่เดาจากชื่อฟิลด์ · ค่าจริงหน้าตาอย่าง `busan-bay101` ตรงรูปเดียวกับ id ใน `data/places.ts`
     */
    id: row.slug,
    nameTh: row.nameTh,
    nameEn: row.nameEn,
    nameLocal: row.nameLocal ?? undefined,
    addressLocal: row.addressLocal ?? undefined,
    city: row.citySlug,
    category: row.category,
    // 🔴 `description` เป็น null ได้ และเป็นสภาพปกติ ไม่ใช่บั๊ก — วัดแล้ว: ปูซาน 23/23 มี · ญี่ปุ่น 0/57 ·
    //    ไทย 0/37 (P1 seed คำบรรยายไทยได้แค่เกาหลี+ฮานอย) · การ์ดต้องอ่านออกแม้ไม่มีคำบรรยาย
    descriptionTh: row.description ?? "",
    lat: row.lat,
    lng: row.lng,
    mapsQuery: row.mapsQuery,
    googlePlaceId: row.googlePlaceId ?? null,
    youtubeQuery: row.youtubeQuery ?? row.nameEn,
  };
}
