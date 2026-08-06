"use client";

import { useEffect, useState } from "react";
import type { TravelMode } from "@/lib/schedule";

export type TravelTimePair = {
  fromId: string;
  toId: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  mode: TravelMode;
};

export type TravelTimeEntry = { minutes: number | null; isReal: boolean };

function keyOf(fromId: string, toId: string, mode: TravelMode) {
  return `${fromId}|${toId}|${mode}`;
}

// แคชข้ามคอมโพเนนต์/reload หน้าเดียวกัน (L1 ในหน่วยความจำแท็บ) — แคชถาวรจริงๆ (L2, ข้ามคน/reload)
// อยู่ที่ตาราง travel_time_cache ฝั่ง Supabase ซึ่ง /api/travel-time เช็คก่อนยิง Google เสมอ
const cache = new Map<string, TravelTimeEntry>();
const inFlight = new Set<string>();

/**
 * ยิงขอเวลาเดินทางจริงของทุกคู่จุดที่เลือกโหมดแล้วในวันนั้น คืน map ให้ผู้เรียกใช้ประกอบ schedule
 * คู่ไหนยังไม่มีในแคช/inFlight จะยิงพร้อมกันทั้งหมด ไม่บล็อกกัน
 */
export function useDayTravelTimes(pairs: TravelTimePair[]) {
  const depsKey = pairs.map((p) => keyOf(p.fromId, p.toId, p.mode)).join(",");
  const [, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    pairs.forEach((p) => {
      const key = keyOf(p.fromId, p.toId, p.mode);
      if (cache.has(key) || inFlight.has(key)) return;
      inFlight.add(key);

      const url =
        `/api/travel-time?originPlaceId=${encodeURIComponent(p.fromId)}` +
        `&destPlaceId=${encodeURIComponent(p.toId)}` +
        `&originLat=${p.fromLat}&originLng=${p.fromLng}` +
        `&destLat=${p.toLat}&destLng=${p.toLng}&mode=${p.mode}`;

      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          cache.set(key, { minutes: data.durationMinutes ?? null, isReal: !!data.isReal });
        })
        .catch(() => {
          cache.set(key, { minutes: null, isReal: false });
        })
        .finally(() => {
          inFlight.delete(key);
          if (!cancelled) setVersion((v) => v + 1);
        });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  const result = new Map<string, TravelTimeEntry>();
  pairs.forEach((p) => {
    const key = keyOf(p.fromId, p.toId, p.mode);
    const entry = cache.get(key);
    if (entry) result.set(key, entry);
  });
  return result;
}
