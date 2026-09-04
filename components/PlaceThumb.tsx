"use client";

import { CATEGORY_COLOR, CATEGORY_EMOJI, type Category } from "@/data/places";
import { usePlacePhotos } from "@/hooks/usePlacePhotos";
import { photoUrlAtWidth } from "@/lib/photoUrl";

/**
 * รูปย่อของสถานที่ — ใช้ทั้งในแถวจุดแวะและในป๊อปอัพบนแผนที่
 * ยิงผ่าน usePlacePhotos ที่มีแคชระดับโมดูล (lib/photoCache) อยู่แล้ว จึงใช้ซ้ำกับ PhotoGallery ได้โดยไม่ยิง API เพิ่ม
 */
/**
 * ขนาดกล่อง **ผูกกับความละเอียดที่ขอ** ไว้ด้วยกันโดยตั้งใจ (4 ก.ย. 2026)
 *
 * 🔴 เดิมขนาดมาจาก `className` ที่ call site ส่งมา ส่วนความละเอียดฝังตายไว้ที่ 160
 *    ⇒ ใครขยายกล่องก็ได้รูปเบลอ **โดยไม่มีอะไรบอก** — ของสองอย่างที่ต้องขยับพร้อมกัน
 *      แต่ถูกเก็บคนละที่ (§3.4 "ข้อเท็จจริงที่ถูกเก็บไว้คนละที่กับสิ่งที่ทำให้มันจริง")
 *
 * ⚠️ `photoUrlAtWidth` รับได้แค่ `160 | 400 | 800` — ต้องตรงกับ allowlist ฝั่ง route
 *    ไม่งั้นจะตกไปใช้ค่าเริ่มต้น 800 เงียบ ๆ (ดู `lib/photoUrl.ts`)
 * 📌 160 ที่กล่อง 64px = 2.5× ⇒ คมบนจอ 2× · นุ่มลงเล็กน้อยบนจอ 3×
 *    เลือกไม่ขยับเป็น 400 เพราะแถวจุดแวะมีหลายสิบใบต่อหน้า และเฟส 19 ลดจาก 800 → 160
 *    ด้วยเหตุผลว่าวัดได้ 12.4 MB ต่อการเปิดหน้า · `xl` ที่มีไม่กี่ใบต่อหน้าถึงใช้ 400
 */
const SIZES = {
  sm: { box: "h-9 w-9", src: 160 },   // ลิสต์ "ถัดจากนี้" ใน /today
  md: { box: "h-12 w-12", src: 160 },
  lg: { box: "h-16 w-16", src: 160 }, // แถวจุดแวะ/ตารางเวลา — ผู้ใช้ขอให้ใหญ่ขึ้นมาก 4 ก.ย. 2026
  xl: { box: "h-20 w-20", src: 400 },
  /** 96px — รูปย่อของแถวจุดแวะ/ตารางเวลา (ผู้ใช้ปรับเอง 4 ก.ย. 2026)
   *
   *  ประวัติของตัวเลขนี้ เพราะมันถูกลองมาสามรอบ:
   *    40px  ของเดิม        ผู้ใช้: "เล็กไปนะ ควรจะใหญ่กว่านี้อีกเยอะ"
   *    64px  (1.6x)         ยังไม่พอ ผู้ใช้ขอ 2.5 เท่า
   *    160px (2.5x)         **ใหญ่เกินจริง** — และวัดได้ว่าพังบนมือถือด้วย: กิน 43% ของจอ 375px
   *                         ⇒ ช่องชื่อสถานที่เหลือ 57px ชื่อถูกตัดทุกอัน
   *    96px  (1.5x)         ← ที่ใช้อยู่ · บนจอ 375px กิน 26% เหลือ ~190px ให้ชื่อ
   *
   *  🔴 **ต้องใช้ 400 ไม่ใช่ 160** — ที่กล่อง 96px ความละเอียด 160 จะได้แค่ 1.67x
   *     ⇒ นุ่มบนจอ 2x และเบลอบนจอ 3x · ที่ 400 ได้ 4.17x/2.08x/1.39x คมทั้งสามแบบ */
  "2xl": { box: "h-24 w-24", src: 400 },
} as const;

export function PlaceThumb({
  query,
  category,
  size,
  className,
  rounded = "rounded-lg",
}: {
  query: string;
  category: Category;
  /** ใช้ `size` แทนการส่งคลาสขนาดมาทาง className — ได้ความละเอียดที่คู่กันมาด้วย */
  size?: keyof typeof SIZES;
  className?: string;
  rounded?: string;
}) {
  const photos = usePlacePhotos(query);
  const spec = size ? SIZES[size] : null;
  const base = `${rounded} overflow-hidden ${spec ? spec.box + " shrink-0 " : ""}${className ?? ""}`;

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
      {/* ความละเอียดมาจาก SIZES ข้างบน ไม่ใช่เลขตายตัว — ดูเหตุผลที่นั่น (เฟส 19 ลดจาก 800 → 160
          เพราะวัดได้ 12.4 MB ต่อการเปิดหน้า · ขนาดที่ไม่ระบุ `size` ยังใช้ 160 เหมือนเดิม) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrlAtWidth(photos[0], spec ? spec.src : 160)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
