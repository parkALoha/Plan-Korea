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

// แคชในหน่วยความจำแท็บ (L1) เหมือน photoCache — แคชถาวรจริงๆ (L2) อยู่ที่ place_details_cache
const cache = new Map<string, PlaceDetails>();

/** details === undefined คือกำลังโหลด — เวลาเปิด-ปิด/เรทติ้ง/รีวิว/ประเภทร้านของสถานที่นี้ (เฟส 2) */
export function usePlaceDetails(query: string): PlaceDetails | undefined {
  const [result, setResult] = useState<{ query: string; details: PlaceDetails } | undefined>(
    () => (cache.has(query) ? { query, details: cache.get(query)! } : undefined)
  );

  useEffect(() => {
    if (cache.has(query)) return;
    let cancelled = false;
    fetch(`/api/place-details?query=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => {
        const details: PlaceDetails = {
          openingHours: d.openingHours ?? null,
          rating: d.rating ?? null,
          userRatingCount: d.userRatingCount ?? null,
          primaryType: d.primaryType ?? null,
          reviews: d.reviews ?? null,
        };
        cache.set(query, details);
        if (!cancelled) setResult({ query, details });
      })
      .catch(() => {
        const empty: PlaceDetails = {
          openingHours: null,
          rating: null,
          userRatingCount: null,
          primaryType: null,
          reviews: null,
        };
        if (!cancelled) setResult({ query, details: empty });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return result?.query === query ? result.details : undefined;
}
