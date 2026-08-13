"use client";

import { CATEGORY_COLOR, CATEGORY_EMOJI, type Category } from "@/data/places";
import { usePlacePhotos } from "@/hooks/usePlacePhotos";
import { photoUrlAtWidth } from "@/lib/photoUrl";

/**
 * รูปย่อของสถานที่ — ใช้ทั้งในแถวจุดแวะและในป๊อปอัพบนแผนที่
 * ยิงผ่าน usePlacePhotos ที่มีแคชระดับโมดูล (lib/photoCache) อยู่แล้ว จึงใช้ซ้ำกับ PhotoGallery ได้โดยไม่ยิง API เพิ่ม
 */
export function PlaceThumb({
  query,
  category,
  className,
  rounded = "rounded-lg",
}: {
  query: string;
  category: Category;
  className?: string;
  rounded?: string;
}) {
  const photos = usePlacePhotos(query);
  const base = `${rounded} overflow-hidden ${className ?? ""}`;

  if (photos === null) {
    return <div className={`${base} animate-pulse bg-surface-soft`} />;
  }

  if (photos.length === 0) {
    return (
      <div
        className={`${base} flex items-center justify-center text-sm`}
        style={{ backgroundColor: `${CATEGORY_COLOR[category]}22` }}
      >
        {CATEGORY_EMOJI[category]}
      </div>
    );
  }

  // ต้องครอบ img ด้วย div ที่ถือคลาสขนาด — ถ้าใส่ทั้ง h-10 w-10 และ h-full w-full บน img เดียวกัน
  // h-full/w-full จะชนะ แล้วรูปจะบานเต็มแถวจนชื่อสถานที่หายไป
  return (
    <div className={base}>
      {/* รูปย่อกว้างจริงไม่เกิน ~56px ขอแค่ 160px ก็คมพอแม้จอ 3x — เดิมโหลด 800px ทุกใบ (เฟส 19) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrlAtWidth(photos[0], 160)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
