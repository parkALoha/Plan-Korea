"use client";

import { CATEGORY_EMOJI } from "@/data/places";
import type { Place } from "@/data/places";
import type { PlaceNote } from "@/lib/supabase";
import { usePlacePhotos } from "@/hooks/usePlacePhotos";
import { photoUrlAtWidth } from "@/lib/photoUrl";
import { usePlaceDetails } from "@/hooks/usePlaceDetails";
import { weekdayHoursLabel } from "@/lib/openingHours";
import { placeQueryKey } from "@/lib/placeQuery";
import { noteFirstLine } from "./NoteBody";

export function PlaceCard({
  place,
  isCustom,
  distanceLabel,
  /** ใช้หาว่าวันนั้นในทริปตรงกับวันในสัปดาห์ไหน จะได้โชว์เวลาเปิด-ปิดของวันนั้นเป๊ะๆ */
  dayDate,
  stashedNote,
  onClick,
  onHide,
  onAdd,
}: {
  place: Place;
  isCustom?: boolean;
  distanceLabel?: string | null;
  dayDate?: string;
  /** โน้ต/รูปที่ติดมากับสถานที่นี้ตอนถูกลากกลับคลัง (เฟส 22) — ลากลงวันอีกครั้งแล้วมันจะกลับไปอยู่บนจุดแวะเอง */
  stashedNote?: PlaceNote | null;
  onClick: () => void;
  onHide?: () => void;
  /** เพิ่มลงวันที่โฟกัสอยู่ตรงๆ โดยไม่ต้องเปิดโมดัลรายละเอียดก่อน */
  onAdd?: () => void;
}) {
  const queryKey = placeQueryKey(place);
  const photos = usePlacePhotos(queryKey);
  // รูปที่เราอัปโหลดเองมาก่อนรูปจาก Google เสมอ — ลากกลับคลังแล้วยังจำได้ว่าที่นี่คือที่ไหน
  // (คนละ URL คนละที่มา: ของเราอยู่ Supabase Storage ตรงๆ · ของ Google ผ่าน /api/place-photo ที่รับ ?w=)
  const googlePhoto = photos?.[0];
  const photoSrc = stashedNote?.photo_url ?? (googlePhoto ? photoUrlAtWidth(googlePhoto, 400) : null);
  const details = usePlaceDetails(queryKey);
  const hoursLabel = dayDate ? weekdayHoursLabel(details?.openingHours, dayDate) : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface-raised shadow-sm shadow-ink/5 hover:border-maple/40">
      <button onClick={onClick} className="flex flex-col text-left">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-surface-soft">
          {photoSrc ? (
            // การ์ดในคลังกว้างจริง ~130px (2 คอลัมน์ในไซด์บาร์) — 400px พอสำหรับจอ 3x (เฟส 19)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-3xl">{CATEGORY_EMOJI[place.category]}</span>
          )}
          {isCustom && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-pine px-2 py-0.5 text-2xs font-medium text-cream">
              เพิ่มเอง
            </span>
          )}
          {stashedNote?.photo_url && (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ink/60 px-2 py-0.5 text-2xs font-medium text-cream">
              📷 รูปของเรา
            </span>
          )}
        </div>
        <div className="px-2.5 py-2">
          <div className="truncate text-sm font-semibold text-content">{place.nameTh}</div>
          <div className="truncate text-xs text-content-soft">{place.nameEn}</div>
          {distanceLabel && (
            <div className="mt-0.5 truncate text-2xs text-pine-dark">📍 {distanceLabel}</div>
          )}
          {details?.rating != null && (
            <div className="mt-0.5 truncate text-2xs text-maple-dark">
              ⭐ {details.rating.toFixed(1)}
              {details.userRatingCount != null && ` (${details.userRatingCount})`}
              {details.primaryType && ` · ${details.primaryType}`}
            </div>
          )}
          {hoursLabel && (
            <div className="mt-0.5 truncate text-2xs text-content-soft">🕐 {hoursLabel}</div>
          )}
          {/* โน้ตที่ติดมาตอนลากกลับคลัง — ขึ้นให้เห็นตรงนี้ ไม่งั้นไม่มีทางรู้เลยว่าเคยจดอะไรไว้ */}
          {stashedNote?.note && (
            <div className="mt-0.5 truncate text-2xs italic text-pine-dark">
              📝 {noteFirstLine(stashedNote.note)}
            </div>
          )}
        </div>
      </button>
      {onHide && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
          aria-label="ซ่อนสถานที่นี้"
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-xs text-white hover:bg-black/60"
        >
          ✕
        </button>
      )}
      {onAdd && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="flex items-center justify-center gap-1 border-t border-line bg-maple-soft/50 py-1.5 text-xs font-semibold text-maple-dark hover:bg-maple-soft"
        >
          + เพิ่มลงวันนี้
        </button>
      )}
    </div>
  );
}
