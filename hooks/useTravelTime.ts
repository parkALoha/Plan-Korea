"use client";

import { useEffect, useMemo, useState } from "react";
import { haversineKm } from "@/lib/geo";
import type { Place } from "@/data/places";

function pairKey(from: Place | null, to: Place) {
  return from ? `${from.id}->${to.id}` : `none->${to.id}`;
}

export function useTravelTime(from: Place | null, to: Place) {
  const fallbackLabel = useMemo(() => {
    if (!from) return "จุดแรกของวัน";
    return `~${haversineKm(from.lat, from.lng, to.lat, to.lng).toFixed(1)} กม. (เส้นตรง)`;
  }, [from, to]);

  const [fetched, setFetched] = useState<{ key: string; label: string } | null>(null);

  useEffect(() => {
    if (!from) return;
    let cancelled = false;
    const key = pairKey(from, to);
    // ใช้โหมดขนส่งสาธารณะเป็นค่าเริ่มต้นสำหรับ label นี้ — เป็นโหมดเดียวที่ Google รองรับครบในเกาหลีใต้
    const url =
      `/api/travel-time?originPlaceId=${encodeURIComponent(from.id)}` +
      `&destPlaceId=${encodeURIComponent(to.id)}` +
      `&originLat=${from.lat}&originLng=${from.lng}&destLat=${to.lat}&destLng=${to.lng}&mode=transit`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.durationMinutes != null) {
          setFetched({ key, label: `🚇 ${data.durationMinutes} นาที จากจุดก่อนหน้า` });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  if (fetched && fetched.key === pairKey(from, to)) return fetched.label;
  return fallbackLabel;
}
