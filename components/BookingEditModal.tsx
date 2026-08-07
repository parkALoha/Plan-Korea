"use client";

import { useState } from "react";
import { BOOKING_FILES_BUCKET, supabase, type BookingCategory, type TripBooking } from "@/lib/supabase";
import type { NewBooking } from "@/hooks/useBookings";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { ITINERARY } from "@/data/itinerary";
import { BOOKING_CATEGORY_ICON, BOOKING_CATEGORY_LABEL } from "./BookingsPanel";

const CATEGORIES: BookingCategory[] = ["flight", "hotel", "ktx", "bus", "ticket", "other"];

function randomSuffix() {
  return Math.random().toString(36).slice(2);
}

export function BookingEditModal({
  existing,
  who,
  onClose,
  onSave,
  onDelete,
}: {
  existing: TripBooking | null;
  who?: string;
  onClose: () => void;
  onSave: (input: NewBooking) => void;
  onDelete?: () => void;
}) {
  useBodyScrollLock();
  const [category, setCategory] = useState<BookingCategory>(existing?.category ?? "flight");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [dayId, setDayId] = useState(existing?.day_id ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [time, setTime] = useState(existing?.time ?? "");
  const [confirmationNumber, setConfirmationNumber] = useState(existing?.confirmation_number ?? "");
  const [link, setLink] = useState(existing?.link ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [fileUrl, setFileUrl] = useState(existing?.file_url ?? "");
  const [fileName, setFileName] = useState(existing?.file_name ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const path = `${existing?.id ?? "new"}-${Date.now()}-${randomSuffix()}-${file.name}`;
    const { error } = await supabase.storage.from(BOOKING_FILES_BUCKET).upload(path, file);
    if (error) {
      setUploadError("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from(BOOKING_FILES_BUCKET).getPublicUrl(path);
    setFileUrl(data.publicUrl);
    setFileName(file.name);
    setUploading(false);
  }

  function handleDayChange(value: string) {
    setDayId(value);
    const day = ITINERARY.find((d) => d.id === value);
    if (day) setDate(day.date);
  }

  function handleSave() {
    if (!title.trim()) return;
    onSave({
      category,
      title: title.trim(),
      dayId: dayId || null,
      date: date || null,
      time: time || null,
      confirmationNumber: confirmationNumber.trim() || null,
      link: link.trim() || null,
      note: note.trim() || null,
      addedBy: existing?.added_by ?? who ?? null,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="mb-3 flex items-start justify-between">
            <h2 className="text-lg font-bold text-ink">
              {existing ? "แก้ไขตั๋ว/booking" : "เพิ่มตั๋ว/booking"}
            </h2>
            <button onClick={onClose} className="rounded-full p-2 text-ink-soft hover:bg-cream-soft">
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">ประเภท</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium ${
                    category === c
                      ? "border-maple bg-maple-soft text-maple-dark"
                      : "border-cream-soft text-ink-soft hover:bg-cream-soft"
                  }`}
                >
                  <span>{BOOKING_CATEGORY_ICON[c]}</span>
                  <span>{BOOKING_CATEGORY_LABEL[c]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">ชื่อ/รายละเอียด</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น VN610 กรุงเทพ → ฮานอย"
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">ผูกกับวัน (ไม่บังคับ)</label>
            <select
              value={dayId}
              onChange={(e) => handleDayChange(e.target.value)}
              className="w-full rounded-lg border border-cream-soft bg-white px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            >
              <option value="">— ไม่ผูกวันไหน —</option>
              {ITINERARY.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.date} · {day.cityTh}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-soft">วันที่</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-soft">เวลา</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">เลขที่จอง</label>
            <input
              value={confirmationNumber}
              onChange={(e) => setConfirmationNumber(e.target.value)}
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">ลิงก์ (ไม่บังคับ)</label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">โน้ต</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">ไฟล์แนบ (รูป/PDF)</label>
            {fileUrl ? (
              <div className="flex items-center gap-2 rounded-lg border border-cream-soft px-3 py-2">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-pine underline"
                >
                  📎 {fileName || "เปิดไฟล์"}
                </a>
                <button
                  onClick={() => {
                    setFileUrl("");
                    setFileName("");
                  }}
                  className="shrink-0 rounded-full p-1 text-ink-soft hover:bg-cream-soft"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-cream-soft px-3 py-3 text-xs text-ink-soft hover:bg-cream-soft">
                {uploading ? "กำลังอัปโหลด..." : "แตะเพื่อเลือกรูป/PDF"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
          </div>
        </div>

        <div className="shrink-0 flex gap-2 px-5 pb-5 pt-3">
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-xl px-4 py-3 text-sm text-ink-soft hover:bg-cream-soft"
            >
              ลบ
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!title.trim() || uploading}
            className="flex-1 rounded-xl bg-maple py-3 font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
