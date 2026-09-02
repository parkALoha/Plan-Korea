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
