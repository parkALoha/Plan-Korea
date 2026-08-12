"use client";

import { useRef, useState } from "react";
import {
  BOOKING_FILES_BUCKET,
  supabase,
  type BookingCategory,
  type BookingStatus,
  type TripBooking,
} from "@/lib/supabase";
import type { NewBooking } from "@/hooks/useBookings";
import { Modal } from "./Modal";
import { ITINERARY } from "@/data/itinerary";
import { BOOKING_CATEGORY_ICON, BOOKING_CATEGORY_LABEL } from "./BookingsPanel";
import { isImageAttachment, safeHttpUrl } from "@/lib/url";
import { bookByDate } from "@/lib/bookingDeadline";
import { PhotoLightbox } from "./PhotoLightbox";

const CATEGORIES: BookingCategory[] = ["flight", "hotel", "ktx", "bus", "ticket", "other"];

const STATUSES: { value: BookingStatus; label: string }[] = [
  { value: "booked", label: "✅ จองแล้ว" },
  { value: "pending", label: "⏳ รอจอง" },
];

function randomSuffix() {
  return Math.random().toString(36).slice(2);
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// public URL รูปแบบ `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` — ต้องแกะ path กลับมา
// เพื่อสั่งลบไฟล์จริงใน bucket (แค่ล้าง state ไม่พอ ไฟล์ยังค้างอยู่)
function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BOOKING_FILES_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
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
  const [zoomed, setZoomed] = useState(false);
  const [category, setCategory] = useState<BookingCategory>(existing?.category ?? "flight");
  const [status, setStatus] = useState<BookingStatus>(existing?.status ?? "booked");
  const [bookByDaysBefore, setBookByDaysBefore] = useState(
    existing?.book_by_days_before != null ? String(existing.book_by_days_before) : ""
  );
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
  const [linkError, setLinkError] = useState<string | null>(null);
  // path ของไฟล์ที่อัปโหลดในเซสชันนี้แต่ยังไม่ได้กดบันทึก — ถ้าปิด modal เฉยๆ ต้องลบทิ้งกันไฟล์ค้าง
  const pendingUploadPathRef = useRef<string | null>(null);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("ไฟล์ใหญ่เกิน 10MB กรุณาเลือกไฟล์อื่น");
      return;
    }
    setUploading(true);
    setUploadError(null);
    const path = `${existing?.id ?? "new"}-${Date.now()}-${randomSuffix()}-${file.name}`;
    const { error } = await supabase.storage.from(BOOKING_FILES_BUCKET).upload(path, file);
    if (error) {
      setUploadError("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
      setUploading(false);
      return;
    }
    // แทนที่ไฟล์เดิมที่เพิ่งอัปโหลดในเซสชันนี้ (ยังไม่บันทึก) ก็ลบตัวเก่าทิ้งไปเลย ไม่งั้นค้างซ้ำ
    if (pendingUploadPathRef.current) {
      await supabase.storage.from(BOOKING_FILES_BUCKET).remove([pendingUploadPathRef.current]);
    }
    pendingUploadPathRef.current = path;
    const { data } = supabase.storage.from(BOOKING_FILES_BUCKET).getPublicUrl(path);
    setFileUrl(data.publicUrl);
    setFileName(file.name);
    setUploading(false);
  }

  async function handleRemoveFile() {
    const path = pendingUploadPathRef.current ?? storagePathFromPublicUrl(fileUrl);
    if (path) {
      await supabase.storage.from(BOOKING_FILES_BUCKET).remove([path]);
    }
    pendingUploadPathRef.current = null;
    setFileUrl("");
    setFileName("");
  }

  function handleCloseAttempt() {
    if (pendingUploadPathRef.current) {
      const path = pendingUploadPathRef.current;
      pendingUploadPathRef.current = null;
      void supabase.storage.from(BOOKING_FILES_BUCKET).remove([path]);
    }
    onClose();
  }

  function handleDayChange(value: string) {
    setDayId(value);
    const day = ITINERARY.find((d) => d.id === value);
    if (day) setDate(day.date);
  }

  function handleSave() {
    if (!title.trim()) return;
    const trimmedLink = link.trim();
    if (trimmedLink && !safeHttpUrl(trimmedLink)) {
      setLinkError("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https:// เท่านั้น");
      return;
    }
    pendingUploadPathRef.current = null;
    onSave({
      category,
      title: title.trim(),
      dayId: dayId || null,
      date: date || null,
      time: time || null,
      confirmationNumber: confirmationNumber.trim() || null,
      link: trimmedLink || null,
      note: note.trim() || null,
      addedBy: existing?.added_by ?? who ?? null,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      status,
      bookByDaysBefore: bookByDaysBefore.trim() ? Number(bookByDaysBefore) : null,
    });
  }

  const deadline = bookByDate(date || null, bookByDaysBefore.trim() ? Number(bookByDaysBefore) : null);

  return (
    <Modal
      onClose={handleCloseAttempt}
      title={existing ? "แก้ไขตั๋ว/booking" : "เพิ่มตั๋ว/booking"}
      bodyClassName="space-y-3"
      footer={
        <>
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
        </>
      }
    >
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
        <label className="mb-1 block text-xs font-medium text-ink-soft">สถานะ</label>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                status === s.value
                  ? "border-maple bg-maple-soft text-maple-dark"
                  : "border-cream-soft text-ink-soft hover:bg-cream-soft"
              }`}
            >
              {s.label}
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
        <label className="mb-1 block text-xs font-medium text-ink-soft">
          ต้องจองล่วงหน้ากี่วัน (ไม่บังคับ)
        </label>
        <input
          type="number"
          min={0}
          value={bookByDaysBefore}
          onChange={(e) => setBookByDaysBefore(e.target.value)}
          placeholder="เช่น 30"
          className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
        />
        {deadline ? (
          <p className="mt-1 text-xs text-ink-soft">📅 ต้องจองภายใน {deadline}</p>
        ) : bookByDaysBefore.trim() && !date ? (
          <p className="mt-1 text-xs text-ink-soft">ยังคำนวณวันครบกำหนดไม่ได้ — ใส่วันที่ใช้ตั๋วก่อน</p>
        ) : null}
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
          onChange={(e) => {
            setLink(e.target.value);
            setLinkError(null);
          }}
          placeholder="https://..."
          className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
        />
        {linkError && <p className="mt-1 text-xs text-red-600">{linkError}</p>}
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
          <div className="rounded-lg border border-cream-soft px-3 py-2">
            {/* รูปตั๋วให้ดูได้ในแอปเลย ไม่ต้องเด้งออกแท็บใหม่ (บนมือถือที่ติดตั้งเป็น PWA = เสียบริบททั้งหมด)
                PDF ยังเป็นลิงก์เหมือนเดิม เพราะ render ในหน้าไม่ได้ */}
            {isImageAttachment(fileName, fileUrl) && (
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="mb-2 block w-full max-w-40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- รูปมาจาก Supabase Storage สาธารณะ ไม่ใช่ static asset */}
                <img src={fileUrl} alt="" className="w-full rounded-lg object-cover" />
                <span className="mt-1 block text-[11px] text-pine-dark">แตะเพื่อดูขนาดเต็ม</span>
              </button>
            )}
            <div className="flex items-center gap-2">
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-pine underline"
              >
                📎 {fileName || "เปิดไฟล์"}
              </a>
              <button
                onClick={handleRemoveFile}
                className="shrink-0 rounded-full p-1 text-ink-soft hover:bg-cream-soft"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-cream-soft px-3 py-3 text-xs text-ink-soft hover:bg-cream-soft">
            {uploading ? "กำลังอัปโหลด..." : "แตะเพื่อเลือกรูป/PDF (สูงสุด 10MB)"}
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

      {zoomed && fileUrl && (
        <PhotoLightbox
          src={fileUrl}
          alt={fileName || "รูปตั๋วที่แนบไว้"}
          onClose={() => setZoomed(false)}
        />
      )}
    </Modal>
  );
}
