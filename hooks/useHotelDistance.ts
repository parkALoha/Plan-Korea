"use client";

import { useEffect, useMemo, useState } from "react";
import { haversineKm } from "@/lib/geo";
import type { Place } from "@/data/places";
import type { TripHotel } from "@/lib/supabase";
import { hotelAnchorId } from "@/lib/hotelLegs";

function pairKey(hotel: TripHotel, to: Place) {
  return `${hotelAnchorId(hotel)}->${to.id}`;
}

/** ระยะทาง/เวลาเดินทางจากโรงแรมที่พักคืนนั้นไปสถานที่ที่กำลังดู — null ถ้ายังไม่ได้ตั้งโรงแรมของ leg นี้ */
export function useHotelDistance(hotel: TripHotel | null, to: Place) {
  const fallbackLabel = useMemo(() => {
    if (!hotel) return null;
    return `🏨 ~${haversineKm(hotel.lat, hotel.lng, to.lat, to.lng).toFixed(1)} กม. จากที่พัก (เส้นตรง)`;
  }, [hotel, to]);

  const [fetched, setFetched] = useState<{ key: string; label: string } | null>(null);

  useEffect(() => {
    if (!hotel) return;
    let cancelled = false;
    const key = pairKey(hotel, to);
    // ใช้โหมดขนส่งสาธารณะเป็นค่าเริ่มต้นสำหรับ label นี้ — เป็นโหมดเดียวที่ Google รองรับครบในเกาหลีใต้
    const url =
      `/api/travel-time?originPlaceId=${encodeURIComponent(hotelAnchorId(hotel))}` +
      `&destPlaceId=${encodeURIComponent(to.id)}` +
      `&originLat=${hotel.lat}&originLng=${hotel.lng}&destLat=${to.lat}&destLng=${to.lng}&mode=transit`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.durationMinutes != null) {
          setFetched({ key, label: `🏨 ${data.durationMinutes} นาที จากที่พัก` });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hotel, to]);

  if (!hotel) return null;
  if (fetched && fetched.key === pairKey(hotel, to)) return fetched.label;
  return fallbackLabel;
}
