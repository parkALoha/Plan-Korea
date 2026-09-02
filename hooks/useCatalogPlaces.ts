"use client";

import { useEffect, useState } from "react";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { hydrateThenFetch } from "@/lib/engine/hydrateThenFetch";
import { get as storeGet, set as storeSet } from "@/lib/engine/offlineStore";
import type { Place } from "@/data/places";
import { catalogPlaceToPlace, type CatalogPlaceRow } from "@/lib/engine/catalogPlace";

export type CatalogPlacesState =
  | { status: "loading" }
  | { status: "ready"; places: Place[] }
  | { status: "error" };

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
        // เก็บ *แถวดิบ* ไม่ใช่ผลของ `catalogPlaceToPlace()` — แปลงตอนอ่าน ให้โค้ดรุ่นหน้าอ่านของเดิมได้
        writeCache: (rows) => storeSet(key, rows),
        onWriteFailed: () => noteCacheFailure("offlineStore/places/write", { code: "idb" }),
        applyCache: (rows) =>
          setResult({ forCityId: id, state: { status: "ready", places: rows.map(catalogPlaceToPlace) } }),
        applyFresh: (rows) =>
          setResult({ forCityId: id, state: { status: "ready", places: rows.map(catalogPlaceToPlace) } }),
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
