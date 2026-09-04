"use client";

import { categoryMetaOf } from "@/components/categoryMeta";
import { usePlacePhotos } from "@/hooks/usePlacePhotos";
import { PhotoImg } from "@/components/PhotoImg";
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
  /** 🔴 `string` ไม่ใช่ `Category` — ค่าจากฐานเป็นอะไรก็ได้ (`E6-AC12`) · ข้างในใช้ `categoryMetaOf` อยู่แล้ว */
  category: string;
  className?: string;
  rounded?: string;
}) {
  const photos = usePlacePhotos(query);
  const base = `${rounded} overflow-hidden ${className ?? ""}`;

  if (photos === null) {
    return <div className={`${base} animate-pulse bg-surface-soft`} />;
  }

  /**
   * 🔴 **ไทล์สำรองใบเดียว ใช้ทั้งตอน "ไม่มีรูป" และตอน "รูปโหลดไม่ได้"**
   * ถ้าเขียนสองที่ วันหนึ่งจะมีคนแก้ที่เดียว แล้วสองสภาพจะดูต่างกันโดยไม่มีเหตุผล
   */
  const tile = (
    <div
      className={`${base} flex items-center justify-center text-sm`}
      // 🔴 ต่อสตริงเป็นสีโปร่ง `#rrggbb` + `22` — ค่า fallback จึงต้องเป็นเลขฐานสิบหก
      // ห้ามเป็นโทเคน `var(--…)` (ดูเหตุผลเต็มที่ `components/categoryMeta.ts`)
      style={{ backgroundColor: `${categoryMetaOf(category).color}22` }}
    >
      {categoryMetaOf(category).emoji}
    </div>
  );

  if (photos.length === 0) return tile;

  // ต้องครอบ img ด้วย div ที่ถือคลาสขนาด — ถ้าใส่ทั้ง h-10 w-10 และ h-full w-full บน img เดียวกัน
  // h-full/w-full จะชนะ แล้วรูปจะบานเต็มแถวจนชื่อสถานที่หายไป
  return (
    <div className={base}>
      {/* รูปย่อกว้างจริงไม่เกิน ~56px ขอแค่ 160px ก็คมพอแม้จอ 3x — เดิมโหลด 800px ทุกใบ (เฟส 19) */}
      <PhotoImg
        src={photoUrlAtWidth(photos[0], 160)}
        className="h-full w-full object-cover"
        fallback={tile}
      />
    </div>
  );
}
