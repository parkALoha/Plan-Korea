"use client";

import { useEffect, useState } from "react";
import { Place } from "@/data/places";
import { categoryMetaOf } from "@/components/categoryMeta";
import { Modal } from "./Modal";
import { useTravelTime } from "@/hooks/useTravelTime";
import { useHotelDistance } from "@/hooks/useHotelDistance";
import { usePlaceDetails } from "@/hooks/usePlaceDetails";
import type { TripHotel } from "@/lib/supabase";
import { placeQueryKey } from "@/lib/placeQuery";
import { uploadStopPhoto, removeStopPhoto } from "@/lib/stopPhoto";
import { signStoredFile } from "@/lib/engine/files";
import { useSystemMode } from "@/hooks/useSystemMode";
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
  // ปิดที่ทางเข้า (อัปโหลด/ลบรูป) ตอนอ่านสถานะ — จุดเดียวที่เขียนได้ในโมดัลนี้ (E3-AC7 §9)
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;

  // เซ็น signed URL สำหรับแสดงผล (E2-AC13 ②) — modal นี้โชว์รูปทีละใบ ไม่ใช่ลิสต์ จึงเซ็นเองในตัวได้
  // โดยไม่เจอปัญหา N request ที่ BookingsPanel/SortableStopRow ต้อง batch ที่ parent · userPhotoUrl (ดิบ)
  // ยังใช้กับ uploadStopPhoto/removeStopPhoto เหมือนเดิมทุกจุด — สองอย่างนี้เป็นคนละคำถามกัน
  const [signedResult, setSignedResult] = useState<{
    forUrl: string;
    url: string | null;
  } | null>(null);
  useEffect(() => {
    if (!userPhotoUrl) return;
    let cancelled = false;

    function run() {
      signStoredFile(userPhotoUrl!).then((url) => {
        if (!cancelled) setSignedResult({ forUrl: userPhotoUrl!, url });
      });
    }

    run();
    const timer = setInterval(run, 30_000); // ต่ออายุก่อน TTL 90 วินาทีหมด (§12.2/P-65)
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userPhotoUrl]);
  const signedPhotoUrl =
    signedResult && signedResult.forUrl === userPhotoUrl ? signedResult.url : undefined;

  async function handlePhotoChange(file: File | null) {
    if (!file || !stopId || !onUpdatePhoto || readOnly) return;
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
    if (!onUpdatePhoto || readOnly) return;
    await removeStopPhoto(userPhotoUrl);
    onUpdatePhoto(null);
  }

  return (
    <Modal
      onClose={onClose}
      eyebrow={`${categoryMetaOf(place.category).emoji} ${categoryMetaOf(place.category).label}`}
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
      <p className="inline-block rounded-full bg-panel-pine px-3 py-1 text-xs text-panel-pine-ink">
        {travelLabel}
      </p>
      {hotelLabel && (
        <p className="inline-block rounded-full bg-panel-maple px-3 py-1 text-xs text-panel-maple-ink">
          {hotelLabel}
        </p>
      )}
      {details?.rating != null && (
        <p className="inline-block rounded-full bg-panel-gold px-3 py-1 text-xs font-medium text-panel-gold-ink">
          ⭐ {details.rating.toFixed(1)}
          {details.userRatingCount != null && ` (${details.userRatingCount} รีวิว)`}
        </p>
      )}
      {details?.primaryType && (
        <p className="inline-block rounded-full bg-surface-soft px-3 py-1 text-xs text-content-soft">
          {details.primaryType}
        </p>
      )}
    </div>
    <p className="mb-4 text-sm text-content">{place.descriptionTh}</p>

    {/* ของที่เราใส่ไว้เอง มาก่อนข้อมูลจาก Google เสมอ — เปิดดูรายละเอียดแล้วต้องเจอโน้ต/รูปตัวเองทันที
        ไม่ต้องเลื่อนผ่านเวลาเปิด-ปิดกับรีวิวคนอื่นไปหา (เฟส 22)
        stopId + onUpdatePhoto มาด้วยกัน = เปิดปุ่มถ่าย/ลบรูปในตัว (ใช้ตอนเจอป้ายเวลาเปิด-ปิดหน้างาน) */}
    {(userNote || userPhotoUrl || (stopId && onUpdatePhoto)) && (
      <div className="mb-4 rounded-xl bg-panel-pine/40 p-3">
        <h3 className="mb-1.5 text-sm font-semibold text-panel-pine-ink">โน้ตของเรา</h3>
        {userNote && <NoteBody note={userNote} className="text-sm text-content" />}
        {/* signedPhotoUrl มี 3 สถานะ (E2-AC13 ②) — undefined กำลังเซ็น · null เซ็นไม่สำเร็จ (ต้องบอก
            ไม่ใช่กลืน) · string เปิดได้ — เช็ค userPhotoUrl (ดิบ) เพื่อรู้ว่า "มีรูป" ไหม แยกจากผลเซ็น */}
        {userPhotoUrl && signedPhotoUrl === undefined && (
          <div className={`h-32 w-full max-w-56 animate-pulse rounded-lg bg-surface-soft ${userNote ? "mt-2" : ""}`} />
        )}
        {userPhotoUrl && signedPhotoUrl === null && (
          <div
            className={`flex h-32 w-full max-w-56 items-center justify-center rounded-lg bg-surface-soft text-xs text-content-soft ${userNote ? "mt-2" : ""}`}
            title="เปิดรูปไม่ได้"
          >
            🖼️✕ เปิดรูปไม่ได้
          </div>
        )}
        {userPhotoUrl && typeof signedPhotoUrl === "string" && (
          <button
            type="button"
            onClick={() => setZoomedPhoto(true)}
            className={`block w-full max-w-56 ${userNote ? "mt-2" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL ของ Supabase Storage ไม่ใช่ static asset */}
            <img
              src={signedPhotoUrl}
              alt="รูปที่เพิ่มไว้เองสำหรับสถานที่นี้ — กดเพื่อดูขนาดเต็ม"
              className="w-full rounded-lg object-cover"
            />
            <span className="mt-1 block text-[11px] text-panel-pine-ink">แตะเพื่อดูขนาดเต็ม</span>
          </button>
        )}
        {stopId && onUpdatePhoto && !readOnly && (
          <div className="mt-2">
            {userPhotoUrl ? (
              <button
                onClick={handleRemovePhoto}
                className="rounded-lg px-2 py-1 text-xs text-panel-maple-ink hover:bg-panel-maple"
              >
                ลบรูป
              </button>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-surface-raised/70 px-3 py-1.5 text-xs font-medium text-panel-pine-ink hover:bg-surface-raised">
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

    {zoomedPhoto && typeof signedPhotoUrl === "string" && (
      <PhotoLightbox
        src={signedPhotoUrl}
        alt="รูปที่เพิ่มไว้เองสำหรับสถานที่นี้ ขนาดเต็ม"
        onClose={() => setZoomedPhoto(false)}
      />
    )}

    {details?.openingHours?.weekdayDescriptions &&
      details.openingHours.weekdayDescriptions.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1.5 text-sm font-semibold text-content">เวลาเปิด-ปิด</h3>
          <ul className="space-y-0.5 text-xs text-content-soft">
            {details.openingHours.weekdayDescriptions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    {details && !details.openingHours && (
      <p className="mb-4 text-xs text-content-soft">ไม่มีข้อมูลเวลาเปิด-ปิดจาก Google</p>
    )}

    {details?.reviews && details.reviews.length > 0 && (
      <div className="mb-4">
        <h3 className="mb-1.5 text-sm font-semibold text-content">รีวิว</h3>
        <div className="space-y-2">
          {details.reviews.map((review, i) => (
            <div key={i} className="rounded-lg bg-surface-soft/60 p-2 text-xs">
              <div className="mb-0.5 flex items-center gap-1.5 text-content">
                <span className="font-medium">
                  {review.authorAttribution?.displayName ?? "ผู้ใช้ Google"}
                </span>
                {review.rating != null && <span>⭐ {review.rating}</span>}
              </div>
              {review.text?.text && (
                <p className="line-clamp-3 text-content-soft">{review.text.text}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    <h3 className="mb-2 text-sm font-semibold text-content">รูปจาก Google</h3>
    <PhotoGallery query={queryKey} />

    <h3 className="mb-2 mt-4 text-sm font-semibold text-content">แผนที่</h3>
    <GoogleMapEmbed query={queryKey} />

    <h3 className="mb-2 mt-4 text-sm font-semibold text-content">คลิปวิดีโอ</h3>
    <YouTubeEmbed query={place.youtubeQuery} />
    </Modal>
  );
}
