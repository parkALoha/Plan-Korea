"use client";

import { useEffect, useState } from "react";
import type { GoogleOpeningHours } from "@/lib/googlePlaces";

// แคชข้ามคอมโพเนนต์/reload หน้าเดียวกัน เหมือน useDayTravelTimes — L2 ถาวรอยู่ที่ place_details_cache
const cache = new Map<string, GoogleOpeningHours | null>();
const inFlight = new Set<string>();

/**
 * ยิงขอเวลาเปิด-ปิดของทุกจุดแวะในวันนั้นพร้อมกัน คืน map query -> hours ให้ผู้เรียกใช้เช็ก timeline
 * คู่ไหนยังไม่มีในแคช/inFlight จะยิงพร้อมกันทั้งหมด ไม่บล็อกกัน
 */
export function useDayOpeningHours(mapsQueries: string[]) {
  const depsKey = mapsQueries.join("|");
  const [, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    mapsQueries.forEach((query) => {
      if (cache.has(query) || inFlight.has(query)) return;
      inFlight.add(query);

      fetch(`/api/place-details?query=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => {
          cache.set(query, d.openingHours ?? null);
        })
        .catch(() => {
          cache.set(query, null);
        })
        .finally(() => {
          inFlight.delete(query);
          if (!cancelled) setVersion((v) => v + 1);
        });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  const result = new Map<string, GoogleOpeningHours | null>();
  mapsQueries.forEach((query) => {
    if (cache.has(query)) result.set(query, cache.get(query)!);
  });
  return result;
}
