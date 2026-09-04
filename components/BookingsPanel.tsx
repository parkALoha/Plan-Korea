"use client";

import { useState } from "react";
import type { BookingCategory, TripBooking } from "@/lib/supabase";
import type { NewBooking } from "@/hooks/useBookings";
import { BookingEditModal } from "./BookingEditModal";
import { ConfirmModal } from "./Modal";
import {
  BOOKING_BADGE_CLASS,
  bookingBadge,
  bookingCounts,
  sortBookingsByUrgency,
} from "@/lib/bookingStatus";
import { isImageAttachment, safeHttpUrl } from "@/lib/url";
import { PhotoLightbox } from "./PhotoLightbox";

export const BOOKING_CATEGORY_LABEL: Record<BookingCategory, string> = {
  flight: "เที่ยวบิน",
  hotel: "ที่พัก",
  ktx: "KTX",
  bus: "รถบัส",
  ticket: "ตั๋วเข้าชม",
  other: "อื่นๆ",
};

/** คู่ภาษาอังกฤษของ BOOKING_CATEGORY_LABEL — ใช้บนหน้า /summary?lang=en (เฟส 16) */
export const BOOKING_CATEGORY_LABEL_EN: Record<BookingCategory, string> = {
  flight: "Flight",
  hotel: "Hotel",
  ktx: "KTX",
  bus: "Bus",
  ticket: "Ticket",
  other: "Other",
};

export const BOOKING_CATEGORY_ICON: Record<BookingCategory, string> = {
  flight: "✈️",
  hotel: "🏨",
  ktx: "🚄",
  bus: "🚌",
  ticket: "🎫",
  other: "📌",
};

function dateLabel(booking: TripBooking) {
  if (!booking.date) return null;
  const d = new Date(booking.date);
  if (Number.isNaN(d.getTime())) return booking.date;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export function BookingsPanel({
  bookings,
  onAdd,
  onUpdate,
  onRemove,
  who,
}: {
  bookings: TripBooking[];
  onAdd: (input: NewBooking) => void;
  onUpdate: (bookingId: string, patch: NewBooking) => void;
  onRemove: (bookingId: string) => void;
  who?: string;
}) {
  const [editing, setEditing] = useState<TripBooking | "new" | null>(null);
  // ตั๋วที่กำลังจะลบ — ยืนยันก่อนเสมอ ต่างจากการลบอย่างอื่นในเว็บที่ใช้ toast + เลิกทำ
  // เพราะไฟล์ที่อัปโหลดแนบไว้เอากลับมาจากในเว็บไม่ได้ (เฟส 20.2)
  const [deleting, setDeleting] = useState<TripBooking | null>(null);
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const counts = bookingCounts(bookings);
  // เรียงใหม่ทุกครั้งที่ render — อันดับขึ้นกับ "วันนี้" จึงขยับเองเมื่อเวลาผ่านไปโดยไม่ต้องแก้ข้อมูล
  const sorted = sortBookingsByUrgency(bookings);

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-content-soft">
          🎫 ตั๋ว/booking
          {/* สามตัวเลขแยกกัน ไม่ใช่ป้าย "รอจอง N" อันเดียว — อันเดียวไม่บอกว่าที่เหลืออีกกี่ใบคืออะไร */}
          {counts.toBook > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-2xs font-semibold normal-case text-amber-800">
              ต้องจอง {counts.toBook}
            </span>
          )}
          {counts.booked > 0 && (
            <span className="ml-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-semibold normal-case text-emerald-700">
              จองแล้ว {counts.booked}
            </span>
          )}
          {counts.walkUp > 0 && (
            <span className="ml-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-2xs font-semibold normal-case text-sky-700">
              ซื้อหน้างาน {counts.walkUp}
            </span>
          )}
        </h2>
        <button
          onClick={() => setEditing("new")}
          className="rounded-lg px-2 py-1 text-xs font-medium text-pine hover:bg-surface-soft"
        >
          + เพิ่ม
        </button>
      </div>

      {bookings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-xs text-content-soft">
          ยังไม่มีตั๋ว/booking เก็บไว้
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sorted.map((booking) => {
            const badge = bookingBadge(booking);
            const link = safeHttpUrl(booking.link);
            // รูปตั๋วโชว์เป็นรูปย่อบนการ์ดเลย ไม่ใช่ไอคอน 📎 — เห็นปุ๊บรู้ว่าใบไหนคือใบไหน (เฟส 23)
            // PDF ยังเป็น 📎 ต่อท้ายชื่อเหมือนเดิม เพราะ render เป็นรูปไม่ได้
            const thumb = isImageAttachment(booking.file_name, booking.file_url)
              ? booking.file_url
              : null;
            return (
              // ปุ่มการ์ดกับปุ่มรูปเป็นพี่น้องกัน ไม่ใช่ปุ่มซ้อนปุ่ม (HTML ห้าม และกดแล้วยิงสองเด้ง)
              <div
                key={booking.id}
                className="flex items-stretch rounded-xl border border-line bg-surface-raised shadow-sm shadow-ink/5 hover:border-maple/40"
              >
                <div className="min-w-0 flex-1">
                <button
                  onClick={() => setEditing(booking)}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-sm">
                    {BOOKING_CATEGORY_ICON[booking.category]}
                  </span>
                  <div className="min-w-0">
                    {/* ป้ายสถานะอยู่บรรทัดบนสุดของทุกใบ ตำแหน่งเดียวกันเสมอ — กวาดตาลงมาทีเดียว
                        เห็นครบว่าใบไหนต้องรีบ ใบไหนจบแล้ว (ของเดิมอยู่ล่างสุดและมีเฉพาะบางใบ) */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-content-soft">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ring-1 ring-inset ${BOOKING_BADGE_CLASS[badge.tone]}`}
                      >
                        {badge.label}
                      </span>
                      <span>
                        {BOOKING_CATEGORY_LABEL[booking.category]}
                        {dateLabel(booking) ? ` · ${dateLabel(booking)}` : ""}
                        {booking.time ? ` ${booking.time}` : ""}
                      </span>
                    </div>
                    <div className="truncate text-sm font-medium text-content">
                      {booking.title}
                      {booking.file_url && !thumb ? " 📎" : ""}
                    </div>
                    {booking.note && (
                      <div className="line-clamp-2 text-xs text-content-soft">{booking.note}</div>
                    )}
                  </div>
                </button>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate border-t border-line px-3 py-1.5 text-xs text-pine hover:underline"
                  >
                    🔗 เปิดลิงก์จอง
                  </a>
                )}
                </div>
                {thumb && (
                  <button
                    onClick={() => setZoomed({ src: thumb, alt: `รูปตั๋วที่แนบไว้กับ “${booking.title}”` })}
                    aria-label={`ดูรูปตั๋วของ ${booking.title} ขนาดเต็ม`}
                    className="shrink-0 self-center p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- รูปมาจาก Supabase Storage สาธารณะ ไม่ใช่ static asset */}
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <BookingEditModal
          existing={editing === "new" ? null : editing}
          who={who}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            if (editing === "new") {
              onAdd(input);
            } else {
              onUpdate(editing.id, input);
            }
            setEditing(null);
          }}
          onDelete={editing !== "new" ? () => setDeleting(editing) : undefined}
        />
      )}

      {deleting && (
        <ConfirmModal
          title="ลบตั๋ว/booking นี้"
          confirmLabel="ลบเลย"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            onRemove(deleting.id);
            setDeleting(null);
            setEditing(null);
          }}
        >
          <p className="text-sm text-content">
            ลบ <span className="font-semibold">“{deleting.title}”</span> ทิ้งเลยไหม
          </p>
          <p className="rounded-lg bg-maple-soft/50 px-3 py-2 text-xs text-maple-dark">
            {deleting.file_url
              ? "⚠️ ไฟล์ที่แนบไว้จะเปิดจากในเว็บไม่ได้อีก และกดเลิกทำไม่ได้"
              : "⚠️ กดเลิกทำไม่ได้"}
          </p>
        </ConfirmModal>
      )}

      {zoomed && (
        <PhotoLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} />
      )}
    </section>
  );
}
