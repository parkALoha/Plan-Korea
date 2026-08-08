"use client";

import { useEffect, useState } from "react";
import type { GoogleOpeningHours, GoogleReview } from "@/lib/googlePlaces";

export type PlaceDetails = {
  openingHours: GoogleOpeningHours | null;
  rating: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  reviews: GoogleReview[] | null;
};

const EMPTY_DETAILS: PlaceDetails = {
  openingHours: null,
  rating: null,
  userRatingCount: null,
  primaryType: null,
  reviews: null,
};

// แคชในหน่วยความจำแท็บ (L1) — export ให้ useDayOpeningHours ใช้ร่วมกัน (บั๊ก 9.2: เดิมสองฮุคนี้ยิง
// /api/place-details endpoint เดียวกันแต่คนละ Map แยกกัน สถานที่เดียวกันเลยถูกยิงซ้ำจากสองจุด)
// แคชถาวรจริงๆ (L2, ข้าม reload/คนละคน) อยู่ที่ตาราง place_details_cache ฝั่ง Supabase
export const placeDetailsCache = new Map<string, PlaceDetails>();
const inFlight = new Map<string, Promise<PlaceDetails>>();

/** ยิงขอ/อ่านจากแคช query เดียว dedupe ทั้งใน cache (เสร็จแล้ว) และ inFlight (กำลังโหลดอยู่) กันยิงซ้ำ
 *  ตอนการ์ดหลายใบ mount พร้อมกัน (บั๊ก 9.2 — เดิม usePlaceDetails ไม่มี inFlight เลย ต่างจาก useDayTravelTimes) */
export function fetchPlaceDetails(query: string): Promise<PlaceDetails> {
  const cached = placeDetailsCache.get(query);
  if (cached) return Promise.resolve(cached);
  const existing = inFlight.get(query);
  if (existing) return existing;

  const promise = fetch(`/api/place-details?query=${encodeURIComponent(query)}`)
    .then((r) => r.json())
    .then(
      (d): PlaceDetails => ({
        openingHours: d.openingHours ?? null,
        rating: d.rating ?? null,
        userRatingCount: d.userRatingCount ?? null,
        primaryType: d.primaryType ?? null,
        reviews: d.reviews ?? null,
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
