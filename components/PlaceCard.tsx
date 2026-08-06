"use client";

import { CATEGORY_EMOJI } from "@/data/places";
import type { Place } from "@/data/places";
import { usePlacePhotos } from "@/hooks/usePlacePhotos";
import { usePlaceDetails } from "@/hooks/usePlaceDetails";
import { weekdayHoursLabel } from "@/lib/openingHours";

export function PlaceCard({
  place,
  isCustom,
  distanceLabel,
  /** ใช้หาว่าวันนั้นในทริปตรงกับวันในสัปดาห์ไหน จะได้โชว์เวลาเปิด-ปิดของวันนั้นเป๊ะๆ */
  dayDate,
  onClick,
  onHide,
  onAdd,
}: {
  place: Place;
  isCustom?: boolean;
  distanceLabel?: string | null;
  dayDate?: string;
  onClick: () => void;
  onHide?: () => void;
  /** เพิ่มลงวันที่โฟกัสอยู่ตรงๆ โดยไม่ต้องเปิดโมดัลรายละเอียดก่อน */
  onAdd?: () => void;
}) {
  const photos = usePlacePhotos(place.mapsQuery);
  const photo = photos?.[0];
  const details = usePlaceDetails(place.mapsQuery);
  const hoursLabel = dayDate ? weekdayHoursLabel(details?.openingHours, dayDate) : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-cream-soft bg-white shadow-sm shadow-ink/5 hover:border-maple/40">
      <button onClick={onClick} className="flex flex-col text-left">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-cream-soft">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl">{CATEGORY_EMOJI[place.category]}</span>
          )}
          {isCustom && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-pine px-2 py-0.5 text-[10px] font-medium text-cream">
              เพิ่มเอง
            </span>
          )}
        </div>
        <div className="px-2.5 py-2">
          <div className="truncate text-sm font-semibold text-ink">{place.nameTh}</div>
          <div className="truncate text-xs text-ink-soft">{place.nameEn}</div>
          {distanceLabel && (
            <div className="mt-0.5 truncate text-[11px] text-pine-dark">📍 {distanceLabel}</div>
          )}
          {details?.rating != null && (
            <div className="mt-0.5 truncate text-[11px] text-maple-dark">
              ⭐ {details.rating.toFixed(1)}
              {details.userRatingCount != null && ` (${details.userRatingCount})`}
              {details.primaryType && ` · ${details.primaryType}`}
            </div>
          )}
          {hoursLabel && (
            <div className="mt-0.5 truncate text-[11px] text-ink-soft">🕐 {hoursLabel}</div>
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
          className="flex items-center justify-center gap-1 border-t border-cream-soft bg-maple-soft/50 py-1.5 text-xs font-semibold text-maple-dark hover:bg-maple-soft"
        >
          + เพิ่มลงวันนี้
        </button>
      )}
    </div>
  );
}
