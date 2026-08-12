"use client";

import { useEffect, useState } from "react";
import type { GoogleOpeningHours, GoogleReview } from "@/lib/googlePlaces";

export type PlaceDetails = {
  openingHours: GoogleOpeningHours | null;
  rating: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  reviews: GoogleReview[] | null;
  /** ชื่อ/ที่อยู่ภาษาท้องถิ่น (เฟส 14) — สำหรับสถานที่ที่ผู้ใช้เพิ่มเอง ซึ่งไม่มี nameLocal ฝังใน data/places.ts */
  nameLocal: string | null;
  addressLocal: string | null;
};

const EMPTY_DETAILS: PlaceDetails = {
  openingHours: null,
  rating: null,
  userRatingCount: null,
  primaryType: null,
  reviews: null,
  nameLocal: null,
  addressLocal: null,
};

// แคชในหน่วยความจำแท็บ (L1) — export ให้ useDayOpeningHours ใช้ร่วมกัน (บั๊ก 9.2: เดิมสองฮุคนี้ยิง
// /api/place-details endpoint เดียวกันแต่คนละ Map แยกกัน สถานที่เดียวกันเลยถูกยิงซ้ำจากสองจุด)
// แคชถาวรจริงๆ (L2, ข้าม reload/คนละคน) อยู่ที่ตาราง place_details_cache ฝั่ง Supabase
export const placeDetailsCache = new Map<string, PlaceDetails>();
const inFlight = new Map<string, Promise<PlaceDetails>>();

/** ยิงขอ/อ่านจากแคช query เดียว dedupe ทั้งใน cache (เสร็จแล้ว) และ inFlight (กำลังโหลดอยู่) กันยิงซ้ำ
 *  ตอนการ์ดหลายใบ mount พร้อมกัน (บั๊ก 9.2 — เดิม usePlaceDetails ไม่มี inFlight เลย ต่างจาก useDayTravelTimes) */
export function fetchPlaceDetails(query: string, locale?: "ko" | "vi" | null): Promise<PlaceDetails> {
  const cached = placeDetailsCache.get(query);
  // มีในแคชแล้วแต่ยังไม่มีชื่อท้องถิ่น ทั้งที่รอบนี้ขอมาพร้อม locale → ต้องยิงใหม่ ไม่งั้นแคชรอบก่อน
  // (ที่ยิงโดยไม่ส่ง locale เช่นจาก useDayOpeningHours) จะบังไม่ให้ได้ nameLocal เลยตลอดทั้ง session
  if (cached && (!locale || cached.nameLocal !== null)) return Promise.resolve(cached);
  const existing = inFlight.get(query);
  if (existing) return existing;

  const localeParam = locale ? `&locale=${locale}` : "";
  const promise = fetch(`/api/place-details?query=${encodeURIComponent(query)}${localeParam}`)
    .then((r) => r.json())
    .then(
      (d): PlaceDetails => ({
        openingHours: d.openingHours ?? null,
        rating: d.rating ?? null,
        userRatingCount: d.userRatingCount ?? null,
        primaryType: d.primaryType ?? null,
        reviews: d.reviews ?? null,
        nameLocal: d.nameLocal ?? null,
        addressLocal: d.addressLocal ?? null,
      })
    )
    .catch(() => EMPTY_DETAILS)
    .then((details) => {
      placeDetailsCache.set(query, details);
      inFlight.delete(query);
      return details;
    });

  inFlight.set(query, promise);
  return promise;
}

/** details === undefined คือกำลังโหลด — เวลาเปิด-ปิด/เรทติ้ง/รีวิว/ประเภทร้านของสถานที่นี้ (เฟส 2) */
export function usePlaceDetails(query: string): PlaceDetails | undefined {
  const [result, setResult] = useState<{ query: string; details: PlaceDetails } | undefined>(
    () => (placeDetailsCache.has(query) ? { query, details: placeDetailsCache.get(query)! } : undefined)
  );

  useEffect(() => {
    if (placeDetailsCache.has(query)) return;
    let cancelled = false;
    fetchPlaceDetails(query).then((details) => {
      if (!cancelled) setResult({ query, details });
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return result?.query === query ? result.details : undefined;
}
