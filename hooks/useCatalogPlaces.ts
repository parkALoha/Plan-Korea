"use client";

import { useEffect, useState } from "react";
import type { Category, Place } from "@/data/places";

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
    id: row.id,
    nameTh: row.nameTh,
    nameEn: row.nameEn,
    nameLocal: row.nameLocal ?? undefined,
    addressLocal: row.addressLocal ?? undefined,
    city: (row.citySlug ?? "") as Place["city"],
    category: row.category as Category,
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

  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    fetch(`/api/engine/places?cityId=${encodeURIComponent(cityId)}&limit=100`)
      .then((r) => {
        if (!r.ok) throw new Error(`places ${r.status}`);
        return r.json() as Promise<CatalogPlaceRow[]>;
      })
      .then((rows) => {
        if (!cancelled) {
          setResult({ forCityId: cityId, state: { status: "ready", places: rows.map(toPlace) } });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ forCityId: cityId, state: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  if (!cityId) return { status: "ready", places: [] };
  return result?.forCityId === cityId ? result.state : { status: "loading" };
}
