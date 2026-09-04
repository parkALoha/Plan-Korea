"use client";

import { usePlacePhotos } from "@/hooks/usePlacePhotos";
import { PhotoImg } from "@/components/PhotoImg";
import { photoUrlAtWidth } from "@/lib/photoUrl";

export function PhotoGallery({ query }: { query: string }) {
  const photos = usePlacePhotos(query);

  if (photos === null) {
    return (
      <div className="grid animate-pulse grid-cols-3 gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 w-full rounded-md bg-surface-soft" />
        ))}
      </div>
    );
  }
  if (photos.length === 0) {
    return (
      <div className="text-sm text-content-soft">
        ยังไม่มีรูป (ต้องตั้งค่า Google API key ก่อน)
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((src) => (
        <PhotoImg
          key={src}
          src={photoUrlAtWidth(src, 400)}
          className="h-24 w-full rounded-md object-cover"
          // 🔴 ที่นี่ไม่มีหมวดให้ใช้สี — ใช้ช่องว่างที่ *กินที่เท่ากัน* เพื่อไม่ให้กริดขยับ
          //    (ต่างจาก PlaceThumb/PlaceCard ที่มีอิโมจิหมวดให้แสดง)
          fallback={<div className="h-24 w-full rounded-md bg-surface-soft" />}
        />
      ))}
    </div>
  );
}
