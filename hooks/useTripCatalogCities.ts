"use client";

import { useEffect, useState } from "react";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { hydrateThenFetch } from "@/lib/engine/hydrateThenFetch";
import { get as storeGet, tripKey } from "@/lib/engine/offlineStore";
import { writeHandoff } from "@/lib/engine/cacheHandoff";

export type CatalogCity = {
  /** `catalog_cities.id` (uuid) — คีย์ที่ `/api/engine/places?cityId=` ใช้ */
  id: string;
  nameTh: string;
  /** `legacy_slug` — คีย์ของรูปประจำเมือง (`/covers/city-<slug>.svg`) */
  slug: string | null;
  /**
   * พิกัดที่ **เมืองถือเอง** (`catalog_cities.lat/lng`) — `E2-AC16` · 2 ก.ย. 2026
   * 🔴 **ไม่ใช่ค่าเฉลี่ยจากสถานที่ลูก** · ตัวเก่า (`cityCenter()` ใน `data/places.ts`) หารด้วยจำนวน
   * สถานที่ → เมืองที่มี 0 แห่งได้ `NaN` เงียบ ๆ ซึ่งเป็นสภาพของ**ทุกเมืองในประเทศใหม่**
   *
   * ⚠️ **อ่านผ่าน `cityCenterOf()` เสมอ ห้ามอ่าน `.lat` ตรง ๆ** — ดูเหตุผลเรื่องแคชรูปเก่าที่หัว hook
   */
  lat: number;
  lng: number;
};

/**
 * เมืองปลายทางของทริป (จาก `trip_destinations`) — `B6` เฟส 1
 *
 * ## 🔴 ทำไมต้องมี: ไซด์บาร์คลังสถานที่ผูกกับ 6 เมืองเกาหลีในไฟล์สถิต
 * `PlaceSidebar` เดิมได้รายชื่อเมืองจาก `itinerary` ซึ่งมาจาก `ITINERARY` ใน `data/itinerary.ts`
 * (ค่าคงที่ · `City` เป็น union 6 ค่าตายตัว) → **เลือกโตเกียวเป็นจุดหมายได้ แต่โตเกียวไม่มีทางโผล่ใน
 * ไซด์บาร์** เพราะมันไม่ได้อยู่ในไฟล์นั้น
 *
 * ## 🎯 สัญญาณที่ใช้แยกทาง — **"ทริปนี้มีเมืองปลายทางไหม" ไม่ใช่ "วันที่ตรงกับไฟล์เดิมไหม"**
 * วัดจากของจริง (28 ส.ค. 2026): ทริปเกาหลีเดิมคืน `destinations: []` เพราะสร้างก่อนมีตัวเลือกจุดหมาย
 * ส่วนทริปที่สร้างบนแพลตฟอร์มมีครบทุกใบ
 * · ⚠️ **เคยคิดจะเทียบวันที่กับ `ITINERARY` แทน — ทิ้งไปเพราะมันพังเงียบ:** ถ้าผู้ใช้สร้างทริปใหม่ที่บังเอิญ
 *   ตรงกับ 11–21 ต.ค. พอดี มันจะถูกตัดสินว่าเป็นทริปเกาหลีเดิม แล้วเนื้อหาที่ไม่ใช่ของเขาจะโผล่มา
 *   **โดยไม่มีอะไรฟ้อง** · สัญญาณจากข้อมูลของทริปเองไม่มีปัญหานี้
 *
 * 🔴 **ลิสต์ว่าง = "ทริปนี้ไม่มีจุดหมาย" ไม่ใช่ "อ่านไม่ได้"** — สองอย่างนี้ต้องแยกกัน ผู้เรียกจะได้ไม่
 * เผลอตกไปทางเดิมตอนที่แค่เน็ตสะดุด (รูปเดียวกับที่ `HomeScreen` แยกไว้)
 */
export type TripCitiesState =
  | { status: "loading" }
  | { status: "ready"; cities: CatalogCity[] }
  | { status: "error" };

type TripRow = {
  id: string;
  destinations?: { cityId: string; nameTh: string; slug: string | null; lat: number; lng: number }[];
};

export function useTripCatalogCities(tripId: string): TripCitiesState {
  // เก็บผลคู่กับ tripId ที่ผลนั้นเป็นของ แล้ว derive ตอน render — กัน react-hooks/set-state-in-effect
  // และกันเมืองของทริปเก่าโผล่เป็นของทริปใหม่ระหว่างรอโหลด (แพทเทิร์นเดียวกับ `useTripMembers`)
  const [result, setResult] = useState<{ forTripId: string; state: TripCitiesState } | null>(null);

  /**
   * ## 🔴 `E6-AC4` — hook นี้คือ *ประตู* ของทั้งเส้นทางออฟไลน์ ไม่ใช่แค่ผู้ใช้แคชอีกราย
   *
   * `TripPlanScreen:148` ตัดสินว่าเป็นทริปแพลตฟอร์มไหมจาก **`status === "ready" && cities.length > 0`**
   * → ออฟไลน์ fetch ล้ม → `status: "error"` → `isPlatformTrip = false` →
   *   ① `usePlatformItinerary(enabled: false)` **ไม่เคยอ่านแคชของตัวเองเลย** (P1 วัดได้: คำขอ `/days` ที่ถูกบล็อก = **0**)
   *   ② `itinerary` ตกไปที่ `legacyItinerary` = **ตารางของทริปเกาหลี 11 วัน แสดงบนทริปโตเกียว 4 วัน**
   *
   * 🎯 **หนักกว่า "ว่างเปล่า" — มันคือ *ไม่ว่าง และหน้าตาเหมือนข้อมูลจริง*** (P1 เดินเทสต์เจอ 28 ส.ค. 2026)
   * · แคชของ `usePlatformItinerary`/`useCatalogPlaces` ถูกต้องแต่ **เอื้อมไม่ถึง** เพราะประตูปิดก่อน
   *
   * ## 🔴 **แคชรูปเก่าไม่มี `lat`/`lng` — และผมเลือก *ไม่* ขึ้นเวอร์ชันคีย์** (`E2-AC16` · 2 ก.ย. 2026)
 * เครื่องที่เคยเปิดแอปมี `trip:<id>:catalogCities` ที่เก็บไว้ **ก่อน** ฟิลด์พิกัดจะมี → อ่านได้ `undefined`
 * ```
 * ขึ้นเวอร์ชันคีย์  →  แคชเก่าถูกทิ้งทั้งก้อน  →  ออฟไลน์ = ไม่มีรายชื่อเมืองเลย
 *                     →  **ประตู `isPlatformTrip` ปิด → หน้าแผนตกไปที่ `ITINERARY` ของทริปเกาหลี**
 *                        ซึ่งเป็นบั๊กที่แคชใบนี้ถูกสร้างขึ้นมาแก้ตั้งแต่แรก
 * คงคีย์เดิม        →  ได้รายชื่อเมืองครบ · ขาดแค่พิกัด → `cityCenterOf()` คืน `null` → ผู้เรียก fail closed
 *                     →  ซ่อนฟีเจอร์ที่ต้องใช้พิกัด · **หายเองรอบที่ออนไลน์ครั้งถัดไป**
 * ```
 * 🎯 **ทิ้งของหลักเพื่อกันของรอง คือการแลกที่ผิดทาง** — และ `cityCenterOf` มี `Number.isFinite` อยู่แล้ว
 * (`lib/engine/cityCenter.ts:44`) ซึ่ง **`undefined` ก็ไม่ finite** จึงครอบเคสนี้โดยไม่ต้องเพิ่มอะไร
 * · ⚠️ **ข้อแลกที่ยอมรับ:** เครื่องที่ออฟไลน์ยาวจะไม่เห็นฟีเจอร์ที่ต้องใช้พิกัดจนกว่าจะออนไลน์ครั้งหนึ่ง
 *   **ไม่ใช่พัง แต่ต้องรู้ว่ายอมอะไร**
 * · 🔴 **ห้ามอ่าน `.lat`/`.lng` ตรง ๆ จากค่าที่มาจากแคช** — ชนิดบอกว่า `number` แต่แคชเก่าให้ `undefined`
 *   **`tsc` จับไม่ได้ตามนิยาม** (นี่คือคลาสเดียวกับ `Record` ที่คีย์เป็น union ซึ่งทีมไล่ปิดกันมาทั้งสัปดาห์)
 *
 * ⚠️ **สิ่งที่แคชนี้แก้ และสิ่งที่มันแก้ไม่ได้:**
   * · แก้: เครื่องที่เคยเปิดทริปนี้ตอนออนไลน์ → ออฟไลน์แล้วยังรู้ว่าเป็นทริปแพลตฟอร์ม → ประตูเปิด แคชอื่นถูกใช้
   * · 🔴 **แก้ไม่ได้: เปิดทริปนี้ครั้งแรกตอนออฟไลน์** — ไม่มีอะไรในเครื่องให้ตอบ · `status` จะเป็น `error`
   *   และ `TripPlanScreen` **ยังตกไปที่ `ITINERARY` เหมือนเดิม** เพราะมันยุบ *"ไม่มีเมือง"* กับ *"ถามไม่ได้"*
   *   เข้าเป็นค่าเดียว → **นั่นเป็นของที่ต้องแก้ที่ `components/` (โซน P2) ไม่ใช่ที่นี่**
   */
  useEffect(() => {
    let cancelled = false;

    // `async function` ครอบ — `setState` ตรง ๆ ในตัว effect ผิด `react-hooks/set-state-in-effect`
    async function load() {
      const key = tripKey(tripId, "catalogCities");
      await hydrateThenFetch<CatalogCity[]>({
        readCache: () => storeGet<CatalogCity[]>(key),
        fetchFresh: async () => {
          const r = await fetch("/api/engine/trips");
          if (!r.ok) throw new Error(`trips ${r.status}`);
          const rows = (await r.json()) as TripRow[];
          const trip = rows.find((t) => t.id === tripId);
          // 🔴 เก็บ *เมืองที่ derive แล้ว* ไม่ใช่ `rows` ทั้งก้อน — `rows` คือรายการทริป **ทุกใบของผู้ใช้**
          return (trip?.destinations ?? []).map((d) => ({
            id: d.cityId,
            nameTh: d.nameTh,
            slug: d.slug ?? null,
            lat: d.lat,
            lng: d.lng,
          }));
        },
        /**
         * 🔴 **ใช้ `writeHandoff` ไม่ใช่ `set()` ของ offlineStore — เพื่อ *เก็บฝาแฝด* ไม่ใช่เพื่ออ่านมัน**
         * (`E6-AC7` · P7 · 5 ก.ย. 2026) · คีย์นี้เคยอยู่ `localStorage` ด้วย **สตริงเดียวกันเป๊ะ**
         * แล้วย้ายมา IndexedDB ที่ `4096687` (28 ส.ค.) ซึ่ง **ก่อน `lib/engine/cacheHandoff.ts` เกิด 6 วัน**
         * ⇒ ไม่มีใครลบของเก่าเลย · ฝาแฝดค้างกินโควตา ~5 MB ตลอดกาลในโปรไฟล์ที่เคยรันรุ่นก่อนหน้า
         * ซึ่งคือสิ่งที่ `D17` มีไว้ลด
         * 🎯 ***"ย้ายแล้วไม่เก็บของเก่า = เพิ่มที่เก็บใบที่สองโดยที่ใบแรกยังเต็มเท่าเดิม"*** (`§15.19`)
         * · ⚠️ **`readCache` ข้างบนจงใจยังเป็น `storeGet` ไม่ใช่ `readHandoff`** — รูปของค่าที่เก็บ
         *   เปลี่ยนไปแล้วหลัง `4096687` ⇒ ฝาแฝดที่รอดมาเป็นของ *รุ่นเก่าคนละรูป*
         *   **เขี่ยทิ้ง ไม่ใช่ปลุกขึ้นมาใช้** · (`useTripCatalogCities` ชัดที่สุด: `lat`/`lng` เพิ่ม 2 ก.ย.)
         */
        writeCache: (cities) => writeHandoff(key, cities),
        onWriteFailed: () => noteCacheFailure("offlineStore/catalogCities/write", { code: "idb" }),
        applyCache: (cities) => setResult({ forTripId: tripId, state: { status: "ready", cities } }),
        applyFresh: (cities) => setResult({ forTripId: tripId, state: { status: "ready", cities } }),
        applyError: () => setResult({ forTripId: tripId, state: { status: "error" } }),
        isCancelled: () => cancelled,
      });
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return result?.forTripId === tripId ? result.state : { status: "loading" };
}
