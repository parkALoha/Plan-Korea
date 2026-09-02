"use client";

import { useEffect, useState } from "react";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { hydrateThenFetch } from "@/lib/engine/hydrateThenFetch";
import { get as storeGet, set as storeSet } from "@/lib/engine/offlineStore";
import type { Place } from "@/data/places";

/** รูปที่ `GET /api/engine/places` คืนมา (P1 28 ส.ค. 2026, `25723c0`) */
type CatalogPlaceRow = {
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

export type CatalogPlacesState =
  | { status: "loading" }
  | { status: "ready"; places: Place[] }
  | { status: "error" };

/**
 * 🔴 **`city` ของ `Place` เป็น union 8 slug ตายตัว** (`hanoi|busan|…|hcmc`) — คลังในฐานมี 42 เมือง
 * จึง cast ตรงนี้ **จุดเดียว** แทนที่จะไปแก้ union (ซึ่งลาก `Record<City,…>` ใน `data/emergency.ts`
 * และอีก 37 จุดมาด้วย — วัดแล้ว 28 ส.ค. 2026)
 * · มีแบบอย่างอยู่แล้ว: `customPlaceToPlace()` ใน `PlaceSidebar` cast แบบเดียวกันมาก่อน
 * · ⚠️ **สิ่งที่ cast นี้ยอมแลก:** ฟังก์ชันที่ *สลับพฤติกรรมตาม `city`* (เช่น `cityCenter()`) จะไม่รู้จัก
 *   เมืองใหม่ · ไซด์บาร์ไม่เรียกพวกนั้น แต่**ถ้าจะส่ง `Place` ที่มาจากคลังไปให้โค้ดที่ตัดสินใจจาก `city`
 *   ต้องกลับมาดูตรงนี้ก่อน** — นี่คือหนี้ที่เฟส 2 ต้องจ่าย ไม่ใช่ของที่แก้แล้ว
 */
function toPlace(row: CatalogPlaceRow): Place {
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

/**
 * สถานที่ในคลังของเมืองหนึ่ง — `B6` เฟส 1
 *
 * 🔴 **`[]` = "เมืองนี้ยังไม่มีสถานที่ในคลัง" · `error` = "อ่านไม่ได้"** — route แยกให้แล้วตั้งแต่ต้นทาง
 * (`404` เมื่อไม่มีเมืองนั้นจริง ๆ · `200 []` เมื่อเมืองมีแต่ว่าง — P1 `3d5e88d`) ที่นี่จึงไม่ต้องเดา
 */
export function useCatalogPlaces(cityId: string | null): CatalogPlacesState {
  const [result, setResult] = useState<{ forCityId: string; state: CatalogPlacesState } | null>(null);

  /**
   * ## `E6-AC4` — คลังต้องอ่านได้ตอนไม่มีเน็ต
   * เดิม hook นี้ไม่แคชอะไรเลย → ทริปแพลตฟอร์มออฟไลน์ = ไม่มีสถานที่ให้เลือกเลย
   *
   * ## 🔴 คีย์เป็น `cityId` **ไม่ใช่ `tripId`** — และผมตั้งใจต่างจากที่ P1 สั่ง
   * P1 บอกว่าให้คีย์ด้วย `tripId` ทั้งสอง hook เพราะกลัวบั๊กแบบที่ P3 เจอ (ทริปหนึ่งเห็นของอีกทริป)
   * · **บั๊กนั้นต้องการให้ข้อมูล *ต่างกันตามทริป* ถึงจะเกิด** — คลังไม่ต่าง
   * · `column-map.md:90` แยกไว้เอง: `custom_places` = *"ต่อทริป **ไม่ใช่ catalog กลาง**"*
   *   → `catalog_places` เป็นข้อมูลอ้างอิงสาธารณะ **เมืองเดียวกันได้ของชุดเดียวกันทุกทริป**
   * 🎯 **คีย์ควรตรงกับสิ่งที่ข้อมูลแปรตาม** · คีย์ด้วย `tripId` จะเก็บของชุดเดิมซ้ำทุกทริป
   *   ซึ่งกินโควตาที่ `writeCache` ทิ้งเงียบเมื่อเต็ม (`D17` มีอยู่เพราะเพดาน 5 MB นั้นพอดี)
   *
   * ⚠️ `[]` เป็นคำตอบที่ถูกต้องได้จริงที่นี่ (*"เมืองนี้ยังไม่มีสถานที่ในคลัง"* — route แยก `404` กับ `200 []`
   * ให้แล้วตั้งแต่ต้นทาง) → **แคช `[]` ด้วย ไม่ถือว่าผิดปกติ**
   */
  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    // 🔴 ผูกค่าที่แคบแล้วไว้ใน `const` ก่อนสร้าง closure — TS ไม่พา narrowing ของพารามิเตอร์
    //    ข้ามเข้าไปในฟังก์ชันซ้อน (`string | null` จะกลับมาข้างใน)
    const id = cityId;
    const key = `catalog:places:${id}`;

    // `async function` ครอบ — เหตุผลเดียวกับ `usePlatformItinerary`
    async function load() {
      await hydrateThenFetch<CatalogPlaceRow[]>({
        readCache: () => storeGet<CatalogPlaceRow[]>(key),
        fetchFresh: async () => {
          const r = await fetch(`/api/engine/places?cityId=${encodeURIComponent(id)}&limit=100`);
          if (!r.ok) throw new Error(`places ${r.status}`);
          return (await r.json()) as CatalogPlaceRow[];
        },
        // เก็บ *แถวดิบ* ไม่ใช่ผลของ `toPlace()` — แปลงตอนอ่าน ให้โค้ดรุ่นหน้าอ่านของเดิมได้
        writeCache: (rows) => storeSet(key, rows),
        onWriteFailed: () => noteCacheFailure("offlineStore/places/write", { code: "idb" }),
        applyCache: (rows) =>
          setResult({ forCityId: id, state: { status: "ready", places: rows.map(toPlace) } }),
        applyFresh: (rows) =>
          setResult({ forCityId: id, state: { status: "ready", places: rows.map(toPlace) } }),
        applyError: () => setResult({ forCityId: id, state: { status: "error" } }),
        isCancelled: () => cancelled,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  if (!cityId) return { status: "ready", places: [] };
  return result?.forCityId === cityId ? result.state : { status: "loading" };
}
