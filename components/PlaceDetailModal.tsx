"use client";

import { CATEGORY_EMOJI, CATEGORY_LABEL, Place } from "@/data/places";
import { Modal } from "./Modal";
import { useTravelTime } from "@/hooks/useTravelTime";
import { useHotelDistance } from "@/hooks/useHotelDistance";
import { usePlaceDetails } from "@/hooks/usePlaceDetails";
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
  const details = usePlaceDetails(place.mapsQuery);

  return (
    <Modal
      onClose={onClose}
      eyebrow={`${CATEGORY_EMOJI[place.category]} ${CATEGORY_LABEL[place.category]}`}
      title={place.nameTh}
      subtitle={place.nameEn}
      bodyClassName="pb-5"
      footer={
        onConfirm ? (
          <button
            onClick={onConfirm}
            className="w-full rounded-xl bg-maple py-3 font-semibold text-white hover:bg-maple-dark"
          >
            ยืนยันเลือกที่นี่
          </button>
        ) : undefined
      }
    >
    <div className="mb-3 flex flex-wrap gap-2">
      <p className="inline-block rounded-full bg-pine-soft px-3 py-1 text-xs text-pine-dark">
        {travelLabel}
      </p>
      {hotelLabel && (
        <p className="inline-block rounded-full bg-maple-soft px-3 py-1 text-xs text-maple-dark">
          {hotelLabel}
        </p>
      )}
      {details?.rating != null && (
        <p className="inline-block rounded-full bg-gold/20 px-3 py-1 text-xs font-medium text-maple-dark">
          ⭐ {details.rating.toFixed(1)}
          {details.userRatingCount != null && ` (${details.userRatingCount} รีวิว)`}
        </p>
      )}
      {details?.primaryType && (
        <p className="inline-block rounded-full bg-cream-soft px-3 py-1 text-xs text-ink-soft">
          {details.primaryType}
        </p>
      )}
    </div>
    <p className="mb-4 text-sm text-ink">{place.descriptionTh}</p>

    {details?.openingHours?.weekdayDescriptions &&
      details.openingHours.weekdayDescriptions.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1.5 text-sm font-semibold text-ink">เวลาเปิด-ปิด</h3>
          <ul className="space-y-0.5 text-xs text-ink-soft">
            {details.openingHours.weekdayDescriptions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    {details && !details.openingHours && (
      <p className="mb-4 text-xs text-ink-soft">ไม่มีข้อมูลเวลาเปิด-ปิดจาก Google</p>
    )}

    {details?.reviews && details.reviews.length > 0 && (
      <div className="mb-4">
        <h3 className="mb-1.5 text-sm font-semibold text-ink">รีวิว</h3>
        <div className="space-y-2">
          {details.reviews.map((review, i) => (
            <div key={i} className="rounded-lg bg-cream-soft/60 p-2 text-xs">
              <div className="mb-0.5 flex items-center gap-1.5 text-ink">
                <span className="font-medium">
                  {review.authorAttribution?.displayName ?? "ผู้ใช้ Google"}
                </span>
                {review.rating != null && <span>⭐ {review.rating}</span>}
              </div>
              {review.text?.text && (
                <p className="line-clamp-3 text-ink-soft">{review.text.text}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    <h3 className="mb-2 text-sm font-semibold text-ink">รูปสถานที่</h3>
    <PhotoGallery query={place.mapsQuery} />

    <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">แผนที่</h3>
    <GoogleMapEmbed query={place.mapsQuery} />

    <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">คลิปวิดีโอ</h3>
    <YouTubeEmbed query={place.youtubeQuery} />
    </Modal>
  );
}
