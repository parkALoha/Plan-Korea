"use client";

import { googleMapsPlaceUrl } from "@/lib/mapLinks";
import { parsePlaceIdKey } from "@/lib/placeQuery";

/** `query` รับได้ทั้งข้อความค้นหา, พิกัด "lat,lng" และคีย์ `place_id:ChIJ...` (ดู lib/placeQuery.ts)
 *  ทั้งสามแบบเป็นรูปแบบที่ Embed API รับตรงๆ อยู่แล้ว — แบบ place_id เป็นแบบเดียวที่การันตีว่าได้ร้านที่ตั้งใจ */
export function GoogleMapEmbed({ query }: { query: string }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

  if (!key) {
    return (
      <a
        href={googleMapsPlaceUrl(query, parsePlaceIdKey(query))}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-56 w-full items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500 hover:bg-gray-200"
      >
        เปิดใน Google Maps ↗
      </a>
    );
  }

  return (
    <iframe
      className="h-56 w-full rounded-lg border-0"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${encodeURIComponent(query)}`}
      allowFullScreen
    />
  );
}
