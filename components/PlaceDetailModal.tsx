"use client";

import { CATEGORY_EMOJI, CATEGORY_LABEL, Place } from "@/data/places";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useTravelTime } from "@/hooks/useTravelTime";
import { useHotelDistance } from "@/hooks/useHotelDistance";
import type { TripHotel } from "@/lib/supabase";
import { GoogleMapEmbed } from "./GoogleMapEmbed";
import { PhotoGallery } from "./PhotoGallery";
import { YouTubeEmbed } from "./YouTubeEmbed";

export function PlaceDetailModal({
  place,
  previousPlace,
  hotel,
  onConfirm,
  onClose,
}: {
  place: Place;
  previousPlace: Place | null;
  hotel: TripHotel | null;
  /** ไม่ใส่ = โหมดดูรายละเอียดอย่างเดียว (เช่น กดดูจุดแวะที่เลือกไว้แล้ว) ไม่โชว์ปุ่มยืนยันเลือก */
  onConfirm?: () => void;
  onClose: () => void;
}) {
  const travelLabel = useTravelTime(previousPlace, place);
  const hotelLabel = useHotelDistance(hotel, place);
  useBodyScrollLock();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <span className="text-xs text-ink-soft">
              {CATEGORY_EMOJI[place.category]} {CATEGORY_LABEL[place.category]}
            </span>
            <h2 className="text-xl font-bold text-ink">{place.nameTh}</h2>
            <p className="text-sm text-ink-soft">{place.nameEn}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-soft hover:bg-cream-soft"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <p className="inline-block rounded-full bg-pine-soft px-3 py-1 text-xs text-pine-dark">
            {travelLabel}
          </p>
          {hotelLabel && (
            <p className="inline-block rounded-full bg-maple-soft px-3 py-1 text-xs text-maple-dark">
              {hotelLabel}
            </p>
          )}
        </div>
        <p className="mb-4 text-sm text-ink">{place.descriptionTh}</p>

        <h3 className="mb-2 text-sm font-semibold text-ink">รูปสถานที่</h3>
        <PhotoGallery query={place.mapsQuery} />

        <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">แผนที่</h3>
        <GoogleMapEmbed query={place.mapsQuery} />

        <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">คลิปวิดีโอ</h3>
        <YouTubeEmbed query={place.youtubeQuery} />

        {onConfirm && (
          <button
            onClick={onConfirm}
            className="mt-5 w-full rounded-xl bg-maple py-3 font-semibold text-white hover:bg-maple-dark"
          >
            ยืนยันเลือกที่นี่
          </button>
        )}
      </div>
    </div>
  );
}
