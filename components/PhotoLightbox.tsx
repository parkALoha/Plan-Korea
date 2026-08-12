"use client";

import { useRef } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useDismissable } from "@/hooks/useDismissable";

/**
 * ดูรูปขนาดเต็มจอ (เฟส 23)
 *
 * เดิมโค้ดก้อนนี้เขียนอยู่ใน `PlaceDetailModal` ไฟล์เดียว รูปที่เหลือทั้งเว็บ (รูปในแถวจุดแวะ,
 * รูปใน /today, ไฟล์แนบของตั๋ว) จึงกดดูไม่ได้เลย · แยกออกมาแล้วต่อให้ครบทุกที่
 *
 * `z-[60]` เพราะเปิดซ้อนบน `Modal` (z-50) ได้จริง — เช่นกดรูปที่อยู่ในโมดัลรายละเอียดสถานที่
 */
export function PhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock();
  // ได้ Esc / ล็อกโฟกัส / คืนโฟกัสให้ปุ่มที่เปิดมันมา ชุดเดียวกับ Modal
  // (ของเดิมมีแค่ onKeyDown บน div ซึ่งทำงานเฉพาะตอนโฟกัสบังเอิญอยู่ที่ div นั้นพอดี)
  useDismissable(panelRef, onClose);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      tabIndex={-1}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 outline-none"
    >
      <button
        onClick={onClose}
        aria-label="ปิด"
        className="absolute right-3 top-3 rounded-full bg-white/15 p-2 text-lg leading-none text-white hover:bg-white/25"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- รูปมาจาก Supabase Storage สาธารณะ ไม่ใช่ static asset */}
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain" />
    </div>
  );
}
