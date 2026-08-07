"use client";

import { usePlacePhotos } from "@/hooks/usePlacePhotos";

export function PhotoGallery({ query }: { query: string }) {
  const photos = usePlacePhotos(query);

  if (photos === null) {
    return (
      <div className="grid animate-pulse grid-cols-3 gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 w-full rounded-md bg-cream-soft" />
        ))}
      </div>
    );
  }
  if (photos.length === 0) {
    return (
      <div className="text-sm text-ink-soft">
        ยังไม่มีรูป (ต้องตั้งค่า Google API key ก่อน)
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          className="h-24 w-full rounded-md object-cover"
        />
      ))}
    </div>
  );
}
