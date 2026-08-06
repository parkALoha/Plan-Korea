"use client";

import { useEffect, useState } from "react";
import { photoCache } from "@/lib/photoCache";

/** photos === null คือกำลังโหลด, [] คือโหลดเสร็จแต่ไม่มีรูป, string[] คือ URL รูปที่ใช้ได้ */
export function usePlacePhotos(query: string): string[] | null {
  const [result, setResult] = useState<{ query: string; photos: string[] } | null>(
    () => (photoCache.has(query) ? { query, photos: photoCache.get(query)! } : null)
  );

  useEffect(() => {
    if (photoCache.has(query)) return;
    let cancelled = false;
    fetch(`/api/place-photos?query=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => {
        const photos: string[] = d.photos ?? [];
        photoCache.set(query, photos);
        if (!cancelled) setResult({ query, photos });
      })
      .catch(() => {
        if (!cancelled) setResult({ query, photos: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return result?.query === query ? result.photos : null;
}
