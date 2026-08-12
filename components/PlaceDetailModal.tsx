"use client";

import { useState } from "react";
import { CATEGORY_EMOJI, CATEGORY_LABEL, Place } from "@/data/places";
import { Modal } from "./Modal";
import { useTravelTime } from "@/hooks/useTravelTime";
import { useHotelDistance } from "@/hooks/useHotelDistance";
import { usePlaceDetails } from "@/hooks/usePlaceDetails";
import type { TripHotel } from "@/lib/supabase";
import { placeQueryKey } from "@/lib/placeQuery";
import { uploadStopPhoto, removeStopPhoto } from "@/lib/stopPhoto";
import { GoogleMapEmbed } from "./GoogleMapEmbed";
import { PhotoGallery } from "./PhotoGallery";
import { PhotoLightbox } from "./PhotoLightbox";
import { YouTubeEmbed } from "./YouTubeEmbed";
import NoteBody from "./NoteBody";

export function PlaceDetailModal({
  place,
  previousPlace,
  hotel,
  userNote,
  userPhotoUrl,
  stopId,
  onUpdatePhoto,
  onConfirm,
  onClose,
  warningMessage,
}: {
  place: Place;
  previousPlace: Place | null;
  hotel: TripHotel | null;
  /** โน้ตที่จดไว้เองกับจุดแวะนี้ (หรือที่ฝากไว้กับสถานที่ในคลัง) — โชว์นำหน้าข้อมูลจาก Google */
  userNote?: string | null;
  /** ข้อความแจ้งเตือน (เช่น อาจไปไม่ทันเวลาปิด) โชว์เป็นแถบด้านบนโมดัล — มาจากไอคอน ⚠️ ในลิสต์ "ถัดจากนี้" */
  warningMessage?: string | null;
  /** รูปที่เราอัปโหลดเอง เก็บใน Supabase Storage — คนละชุดกับ PhotoGallery ที่เป็นรูปจาก Google */
  userPhotoUrl?: string | null;
  /** id ของ trip_stops แถวนี้ — ใส่คู่กับ onUpdatePhoto เพื่อเปิดปุ่มถ่าย/แนบรูปจากในโมดัลเอง
   *  (เช่น ถ่ายป้ายเวลาเปิด-ปิดหน้างานตอนอยู่ใน /today) ไม่ใส่ = โหมดดูรูปอย่างเดียว */
  stopId?: string;
  onUpdatePhoto?: (photoUrl: string | null) => void;
  /** ไม่ใส่ = โหมดดูรายละเอียดอย่างเดียว (เช่น กดดูจุดแวะที่เลือกไว้แล้ว) ไม่โชว์ปุ่มยืนยันเลือก */
  onConfirm?: () => void;
  onClose: () => void;
}) {
  const travelLabel = useTravelTime(previousPlace, place);
  const hotelLabel = useHotelDistance(hotel, place);
  const queryKey = placeQueryKey(place);
  const details = usePlaceDetails(queryKey);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState(false);

  async function handlePhotoChange(file: File | null) {
    if (!file || !stopId || !onUpdatePhoto) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    const result = await uploadStopPhoto(stopId, file, userPhotoUrl);
    if ("error" in result) {
      setPhotoError(result.error);
      setUploadingPhoto(false);
      return;
    }
    onUpdatePhoto(result.url);
    setUploadingPhoto(false);
  }

  async function handleRemovePhoto() {
    if (!onUpdatePhoto) return;
    await removeStopPhoto(userPhotoUrl);
    onUpdatePhoto(null);
  }

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
    {warningMessage && (
      <div className="mb-3 rounded-lg bg-panel-maple/70 px-3 py-2 text-xs text-panel-maple-ink">
        {warningMessage}
      </div>
    )}
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

    {/* ของที่เราใส่ไว้เอง มาก่อนข้อมูลจาก Google เสมอ — เปิดดูรายละเอียดแล้วต้องเจอโน้ต/รูปตัวเองทันที
        ไม่ต้องเลื่อนผ่านเวลาเปิด-ปิดกับรีวิวคนอื่นไปหา (เฟส 22)
        stopId + onUpdatePhoto มาด้วยกัน = เปิดปุ่มถ่าย/ลบรูปในตัว (ใช้ตอนเจอป้ายเวลาเปิด-ปิดหน้างาน) */}
    {(userNote || userPhotoUrl || (stopId && onUpdatePhoto)) && (
      <div className="mb-4 rounded-xl bg-pine-soft/40 p-3">
        <h3 className="mb-1.5 text-sm font-semibold text-pine-dark">โน้ตของเรา</h3>
        {userNote && <NoteBody note={userNote} className="text-sm text-ink" />}
        {userPhotoUrl && (
          <button
            type="button"
            onClick={() => setZoomedPhoto(true)}
            className={`block w-full max-w-56 ${userNote ? "mt-2" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- รูปมาจาก Supabase Storage สาธารณะ ไม่ใช่ static asset */}
            <img
              src={userPhotoUrl}
              alt="รูปที่เพิ่มไว้เองสำหรับสถานที่นี้ — กดเพื่อดูขนาดเต็ม"
              className="w-full rounded-lg object-cover"
            />
            <span className="mt-1 block text-[11px] text-pine-dark">แตะเพื่อดูขนาดเต็ม</span>
          </button>
        )}
        {stopId && onUpdatePhoto && (
          <div className="mt-2">
            {userPhotoUrl ? (
              <button
                onClick={handleRemovePhoto}
                className="rounded-lg px-2 py-1 text-xs text-maple-dark hover:bg-maple-soft"
              >
                ลบรูป
              </button>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium text-pine-dark hover:bg-white">
                {uploadingPhoto ? "กำลังอัปโหลด..." : "📷 ถ่าย/แนบรูปป้าย"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={uploadingPhoto}
                  onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            {photoError && <p className="mt-1 text-[11px] text-red-600">{photoError}</p>}
          </div>
        )}
      </div>
    )}

    {zoomedPhoto && userPhotoUrl && (
      <PhotoLightbox
        src={userPhotoUrl}
        alt="รูปที่เพิ่มไว้เองสำหรับสถานที่นี้ ขนาดเต็ม"
        onClose={() => setZoomedPhoto(false)}
      />
    )}

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

    <h3 className="mb-2 text-sm font-semibold text-ink">รูปจาก Google</h3>
    <PhotoGallery query={queryKey} />

    <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">แผนที่</h3>
    <GoogleMapEmbed query={queryKey} />

    <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">คลิปวิดีโอ</h3>
    <YouTubeEmbed query={place.youtubeQuery} />
    </Modal>
  );
}
