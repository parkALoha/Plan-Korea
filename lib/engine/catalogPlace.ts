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
    /**
     * 🔴 **ต่อชื่อเมืองท้ายเสมอ — ไม่ใช่ `?? nameEn` เปล่า ๆ** (P3 ชี้ · P1 ไล่ migration ยืนยัน · 2 ก.ย. 2026)
     * `"Bay 101"` เฉย ๆ ใน Google Maps พาไปผิดที่ได้ทั่วโลก · `PLACES` ที่เขียนมือใส่เมืองไว้เสมอ
     * (`mapsQuery: "Bay 101 Busan"`) — **ทางสำรองต้องได้รูปเดียวกัน ไม่งั้นการย้ายมาใช้คลังคือการถดถอย**
     *
     * ## 🎯 และของจริงแคบกว่าที่กลัว **แต่แคบมาโดนช่องที่เราเปิดไว้เองพอดี**
     * `20260828120000_e4_catalog_maps_query.sql` เติม `maps_query` ให้แล้วในรูป
     * `ชื่อ || ' ' || ชื่อเมือง` **พร้อม assert ว่าไม่เหลือแถวว่าง** (บรรทัด 107 · ไม่ครบ = rollback)
     * · 🔴 **แต่ขอบเขตของมันคือ `co.supported and p.source <> 'transfer'`**
     *   → **แถว `transfer` (สนามบิน/สถานี) ไม่ถูกเติม** และ `catalogPlacesByIds` **ไม่กรอง `transfer` ออกโดยตั้งใจ**
     *     (นี่คือ resolve ไม่ใช่ browse — สนามบินคือจุดแวะจริง)
     * 🎯 **ทางสำรองนี้จึงไม่ใช่ของเผื่อ — มันรับแถวกลุ่มที่ผมเลือกเองว่าจะไม่กรองทิ้ง**
     * · ⚠️ ใช้ `citySlug` (`busan`) ไม่ใช่ชื่อเมือง เพราะการ์ดไม่มีชื่อเมือง — Maps ค้นด้วย slug ได้อยู่แล้ว
     */
    mapsQuery: card.mapsQuery ?? [nameEn, card.citySlug].filter(Boolean).join(" "),
    googlePlaceId: card.googlePlaceId ?? null,
    youtubeQuery: card.youtubeQuery ?? nameEn,
  };
}
