"use client";

import { useEffect, useState } from "react";
import { photoCache } from "@/lib/photoCache";

const inFlight = new Map<string, Promise<string[]>>();

/** ยิง/อ่านจากแคช query เดียว dedupe ทั้ง cache (เสร็จแล้ว) และ inFlight (กำลังโหลดอยู่)
 *  กันการ์ดหลายใบของสถานที่เดียวกัน mount พร้อมกันแล้วยิงซ้ำ (บั๊ก 9.2) */
function fetchPlacePhotos(query: string): Promise<string[]> {
  const cached = photoCache.get(query);
  if (cached) return Promise.resolve(cached);
  const existing = inFlight.get(query);
  if (existing) return existing;

  const promise = fetch(`/api/place-photos?query=${encodeURIComponent(query)}`)
    .then((r) => r.json())
    .then((d) => (d.photos ?? []) as string[])
    .catch(() => [] as string[])
    .then((photos) => {
      photoCache.set(query, photos);
      inFlight.delete(query);
      return photos;
    });

  inFlight.set(query, promise);
  return promise;
}

/** photos === null คือกำลังโหลด, [] คือโหลดเสร็จแต่ไม่มีรูป, string[] คือ URL รูปที่ใช้ได้ */
export function usePlacePhotos(query: string): string[] | null {
  const [result, setResult] = useState<{ query: string; photos: string[] } | null>(
    () => (photoCache.has(query) ? { query, photos: photoCache.get(query)! } : null)
  );

  useEffect(() => {
    if (photoCache.has(query)) return;
    let cancelled = false;
    fetchPlacePhotos(query).then((photos) => {
      if (!cancelled) setResult({ query, photos });
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return result?.query === query ? result.photos : null;
}
