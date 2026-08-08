"use client";

import { useEffect, useState } from "react";
import type { GoogleOpeningHours } from "@/lib/googlePlaces";
import { fetchPlaceDetails, placeDetailsCache } from "@/hooks/usePlaceDetails";

/**
 * ยิงขอเวลาเปิด-ปิดของทุกจุดแวะในวันนั้นพร้อมกัน คืน map query -> hours ให้ผู้เรียกใช้เช็ก timeline
 * ใช้แคช/inFlight เดียวกับ usePlaceDetails (บั๊ก 9.2 — เดิมมี Map แยกต่างหากทั้งที่ยิง endpoint
 * /api/place-details เส้นเดียวกัน ทำให้สถานที่เดียวกันถูกยิงซ้ำจากทั้งสองจุด)
 */
export function useDayOpeningHours(mapsQueries: string[]) {
  const depsKey = mapsQueries.join("|");
  const [, setVersion] = useState(0);

  useEffect(() => {
    mapsQueries.forEach((query) => {
      if (placeDetailsCache.has(query)) return;
      fetchPlaceDetails(query).then(() => {
        // ห้ามเช็ก cancelled ตรงนี้ (บั๊ก 7.6 เดิม) — ผลที่มาถึงหลัง effect ถูก cleanup ไปแล้วต้อง re-render ได้
        // เพราะค่าถูกเขียนลง cache ไปแล้ว รอบใหม่จะเจอ cache แล้วไม่ยิงซ้ำ = ข้อมูลหายเงียบๆ ถ้าข้าม setVersion
        setVersion((v) => v + 1);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  const result = new Map<string, GoogleOpeningHours | null>();
  mapsQueries.forEach((query) => {
    const details = placeDetailsCache.get(query);
    if (details) result.set(query, details.openingHours);
  });
  return result;
}
