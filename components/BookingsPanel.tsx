"use client";

import { useState } from "react";
import type { BookingCategory, TripBooking } from "@/lib/supabase";
import type { NewBooking } from "@/hooks/useBookings";
import { BookingEditModal } from "./BookingEditModal";
import { ConfirmModal } from "./Modal";
import { bookByDate, daysUntil } from "@/lib/bookingDeadline";
import { safeHttpUrl } from "@/lib/url";

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

/** ป้ายกำหนดจอง — โชว์เฉพาะรายการที่ยัง "รอจอง" (จองแล้วไม่ต้องเตือนซ้ำ) */
function deadlineBadge(booking: TripBooking): { text: string; overdue: boolean } | null {
  if (booking.status !== "pending") return null;
  const deadline = bookByDate(booking.date, booking.book_by_days_before);
  if (!deadline) return null;
  const daysLeft = daysUntil(deadline);
  if (daysLeft < 0) return { text: `⚠️ เลยกำหนดจอง ${Math.abs(daysLeft)} วัน`, overdue: true };
  if (daysLeft === 0) return { text: "⚠️ ต้องจองวันนี้", overdue: true };
  return { text: `จองภายใน ${daysLeft} วัน`, overdue: false };
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
  const pendingCount = bookings.filter((b) => b.status === "pending").length;

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          🎫 ตั๋ว/booking
          {pendingCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-amber-800">
              รอจอง {pendingCount}
            </span>
          )}
        </h2>
        <button
          onClick={() => setEditing("new")}
          className="rounded-lg px-2 py-1 text-xs font-medium text-pine hover:bg-cream-soft"
        >
          + เพิ่ม
        </button>
      </div>

      {bookings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-cream-soft px-3 py-3 text-center text-xs text-ink-soft">
          ยังไม่มีตั๋ว/booking เก็บไว้
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {bookings.map((booking) => {
            const badge = deadlineBadge(booking);
            const link = safeHttpUrl(booking.link);
            return (
              <div
                key={booking.id}
                className="rounded-xl border border-cream-soft bg-white shadow-sm shadow-ink/5 hover:border-maple/40"
              >
                <button
                  onClick={() => setEditing(booking)}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream-soft text-sm">
                    {BOOKING_CATEGORY_ICON[booking.category]}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs text-ink-soft">
                      {BOOKING_CATEGORY_LABEL[booking.category]}
                      {dateLabel(booking) ? ` · ${dateLabel(booking)}` : ""}
                      {booking.time ? ` ${booking.time}` : ""}
                    </div>
                    <div className="truncate text-sm font-medium text-ink">
                      {booking.title}
                      {booking.file_url ? " 📎" : ""}
                    </div>
                    {booking.note && (
                      <div className="line-clamp-2 text-xs text-ink-soft">{booking.note}</div>
                    )}
                    {badge && (
                      <div
                        className={`text-xs font-medium ${badge.overdue ? "text-red-600" : "text-amber-700"}`}
                      >
                        {badge.text}
                      </div>
                    )}
                  </div>
                </button>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate border-t border-cream-soft px-3 py-1.5 text-xs text-pine hover:underline"
                  >
                    🔗 เปิดลิงก์จอง
                  </a>
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
          <p className="text-sm text-ink">
            ลบ <span className="font-semibold">“{deleting.title}”</span> ทิ้งเลยไหม
          </p>
          <p className="rounded-lg bg-maple-soft/50 px-3 py-2 text-xs text-maple-dark">
            {deleting.file_url
              ? "⚠️ ไฟล์ที่แนบไว้จะเปิดจากในเว็บไม่ได้อีก และกดเลิกทำไม่ได้"
              : "⚠️ กดเลิกทำไม่ได้"}
          </p>
        </ConfirmModal>
      )}
    </section>
  );
}
