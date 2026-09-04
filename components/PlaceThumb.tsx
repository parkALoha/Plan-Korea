"use client";

import { categoryMetaOf } from "@/components/categoryMeta";
import { usePlacePhotos } from "@/hooks/usePlacePhotos";
import { PhotoImg } from "@/components/PhotoImg";
import { photoUrlAtWidth } from "@/lib/photoUrl";

/**
 * ขนาดกล่อง **ผูกกับความละเอียดที่ขอ** ไว้ด้วยกันโดยตั้งใจ (ยกมาจากทรี `main` 4 ก.ย. 2026)
 *
 * 🔴 เดิมขนาดมาจาก `className` ที่ call site ส่งมา ส่วนความละเอียดฝังตายไว้ที่ 160
 *    ⇒ ใครขยายกล่องก็ได้รูปเบลอ **โดยไม่มีอะไรบอก** — ของสองอย่างที่ต้องขยับพร้อมกัน
 *      แต่ถูกเก็บคนละที่ (`TEAM.md §3.4` "ข้อเท็จจริงที่ถูกเก็บไว้คนละที่กับสิ่งที่ทำให้มันจริง")
 *
 * ⚠️ `photoUrlAtWidth` รับได้แค่ `160 | 400 | 800` — ต้องตรงกับ allowlist ฝั่ง route
 *    ไม่งั้นจะตกไปใช้ค่าเริ่มต้น 800 เงียบ ๆ (ดู `lib/photoUrl.ts`)
 */
const SIZES = {
  sm: { box: "h-9 w-9", src: 160 },
  md: { box: "h-12 w-12", src: 160 },
  lg: { box: "h-16 w-16", src: 160 },
  xl: { box: "h-20 w-20", src: 400 },
  /** 96px — รูปย่อของแถวจุดแวะ/ตารางเวลา · ผู้ใช้ลองมาสามรอบจนได้ตัวเลขนี้:
   *    40px ของเดิม ("เล็กไปนะ") → 64px (ยังไม่พอ) → 160px (**ใหญ่เกินจริง** กิน 43% ของจอ
   *    375px เหลือ 57px ให้ชื่อ) → **96px** กิน 26% เหลือ ~190px ให้ชื่อ
   *  🔴 ต้อง `400` ไม่ใช่ `160` — ที่กล่อง 96px ความละเอียด 160 ได้แค่ 1.67x ⇒ เบลอบนจอ 3x */
  "2xl": { box: "h-24 w-24", src: 400 },
} as const;

/**
 * รูปย่อของสถานที่ — ใช้ทั้งในแถวจุดแวะและในป๊อปอัพบนแผนที่
 * ยิงผ่าน usePlacePhotos ที่มีแคชระดับโมดูล (lib/photoCache) อยู่แล้ว จึงใช้ซ้ำกับ PhotoGallery ได้โดยไม่ยิง API เพิ่ม
 */
export function PlaceThumb({
  query,
  category,
  className,
  size,
  rounded = "rounded-lg",
}: {
  query: string;
  /** 🔴 `string` ไม่ใช่ `Category` — ค่าจากฐานเป็นอะไรก็ได้ (`E6-AC12`) · ข้างในใช้ `categoryMetaOf` อยู่แล้ว */
  category: string;
  className?: string;
  /** ใช้ `size` แทนการส่งคลาสขนาดมาทาง `className` — ได้ความละเอียดที่คู่กันมาด้วย */
  size?: keyof typeof SIZES;
  rounded?: string;
}) {
  const photos = usePlacePhotos(query);
  const spec = size ? SIZES[size] : null;
  const base = `${rounded} overflow-hidden ${spec ? `${spec.box} shrink-0 ` : ""}${className ?? ""}`;

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
        src={photoUrlAtWidth(photos[0], spec?.src ?? 160)}
        className="h-full w-full object-cover"
        fallback={tile}
      />
    </div>
  );
}
