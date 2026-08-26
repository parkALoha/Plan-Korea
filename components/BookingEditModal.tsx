"use client";

import { useEffect, useRef, useState } from "react";
import { type BookingCategory, type BookingStatus, type TripBooking } from "@/lib/supabase";
import type { NewBooking } from "@/hooks/useBookings";
import { useBookingFile } from "@/hooks/useBookingFile";
import { Modal } from "./Modal";
import { ITINERARY } from "@/data/itinerary";
import { BOOKING_CATEGORY_ICON, BOOKING_CATEGORY_LABEL } from "./BookingsPanel";
import { isImageAttachment, safeHttpUrl } from "@/lib/url";
import { bookByDate } from "@/lib/bookingDeadline";
import { PhotoLightbox } from "./PhotoLightbox";
import { signStoredFile, storageKeyOf } from "@/lib/engine/files";

const CATEGORIES: BookingCategory[] = ["flight", "hotel", "ktx", "bus", "ticket", "other"];

const STATUSES: { value: BookingStatus; label: string }[] = [
  { value: "pending", label: "⏳ ต้องจอง" },
  { value: "booked", label: "✅ จองแล้ว" },
  // ของที่ไม่ต้องจองล่วงหน้าเลย (ซื้อตั๋วที่เคาน์เตอร์/แตะบัตรขึ้นได้) — เดิมไม่มีค่านี้ เลยต้องยัดเป็น
  // "จองแล้ว" แล้วเขียนบอกในชื่อเอา ทำให้ตัวเลขบนหัวแผงนับรวมกับของที่จองจริงจนแยกไม่ออก
  { value: "walk_up", label: "🎟️ ซื้อหน้างาน" },
];

// เดิมมี storagePathFromPublicUrl เขียนเอง — แทนที่ด้วย storageKeyOf จาก lib/engine/files (E2-AC13 ②)
// เพราะรู้จักทั้งรูปแบบ URL เก่าและ path ใหม่ และปฏิเสธ URL โดเมนอื่น (เช่นรูป Google Places ที่เคย
// ลงคอลัมน์เดียวกัน) แทนที่จะเดาว่าเป็น path ของ bucket นี้แล้วไปเซ็น/ลบผิดไฟล์
//
// การเขียน Storage จริง (upload/remove) ย้ายไป hooks/useBookingFile.ts ทั้งหมดแล้ว (E3-AC4) —
// component นี้ไม่เรียก supabase.storage ตรงอีกต่อไป เหมือนกับตารางอีก 10 hook ที่ผ่าน writeGuard

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
  const { uploadBookingFile, removePendingBookingFile, removeSavedBookingFile } = useBookingFile();
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
  const [openFileError, setOpenFileError] = useState<string | null>(null);
  const [openingFile, setOpeningFile] = useState(false);
  // path ของไฟล์ที่อัปโหลดในเซสชันนี้แต่ยังไม่ได้กดบันทึก — ถ้าปิด modal เฉยๆ ต้องลบทิ้งกันไฟล์ค้าง
  const pendingUploadPathRef = useRef<string | null>(null);

  // เซ็น signed URL สำหรับแสดงผล (E2-AC13 ②) — undefined = กำลังเซ็น · null = เซ็นไม่สำเร็จ (ต้องบอก
  // ไม่ใช่กลืน) · string = เปิดได้ · ทำงานได้กับทั้งค่าเก่า (public URL เต็ม) และค่าใหม่ (path) เพราะ
  // storageKeyOf ที่ signStoredFile ใช้ข้างในรู้จักทั้งสองแบบ ไม่ต้องรู้ว่าแถวนี้เป็นแบบไหน
  //
  // เก็บคู่กับ fileUrl ที่ผลนั้นเป็นของ แล้ว derive ตอน render (แพทเทิร์นเดียวกับ usePlacePhotos.ts)
  // แทนการ setState(undefined) ตรงๆ ในเอฟเฟกต์ตอน fileUrl เปลี่ยน — กัน react-hooks/set-state-in-effect
  // และผลข้างเคียงคือถูกอยู่แล้ว: ผลของ fileUrl เก่าไม่ควรโผล่เป็นค่าที่ใช้ได้ของ fileUrl ใหม่
  const [signedResult, setSignedResult] = useState<{ fileUrl: string; url: string | null } | null>(
    null
  );
  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;

    function run() {
      signStoredFile(fileUrl).then((url) => {
        if (!cancelled) setSignedResult({ fileUrl, url });
      });
    }

    run();
    // ต่ออายุเงียบๆ ก่อน TTL 90 วินาทีหมด (§12.2/P-65) — โมดัลนี้เปิดค้างระหว่างแก้ฟิลด์อื่นได้นานกว่านั้น
    // เคลียร์ตอน unmount ซึ่งครอบคลุมตอนปิดโมดัลด้วย เพราะ parent unmount component นี้ทันทีที่ onClose
    // (ไม่มีทางที่ onClose ถูกเรียกแล้ว component ยังค้างอยู่ต่อ)
    const timer = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fileUrl]);
  const signedFileUrl = signedResult?.fileUrl === fileUrl ? signedResult.url : undefined;

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const result = await uploadBookingFile(file, existing?.id ?? null);
    if ("error" in result) {
      setUploadError(result.error);
      setUploading(false);
      return;
    }
    // แทนที่ไฟล์เดิมที่เพิ่งอัปโหลดในเซสชันนี้ (ยังไม่บันทึก) ก็ลบตัวเก่าทิ้งไปเลย ไม่งั้นค้างซ้ำ
    if (pendingUploadPathRef.current) {
      await removePendingBookingFile(pendingUploadPathRef.current);
    }
    pendingUploadPathRef.current = result.path;
    // เก็บ path ตรงๆ ไม่ใช่ getPublicUrl() — bucket เป็น private แล้ว (E2-AC13 ①) URL นั้นเปิดไม่ได้จริง
    // มัน "ทำงาน" อยู่ได้ก่อนหน้านี้เพราะ storageKeyOf() แกะ path ออกจาก URL ให้ทุกจุดอ่าน แต่แปลว่า
    // ทุกอัปโหลดใหม่เขียนรูปแบบเก่า (ที่ E7 มีหน้าที่ย้ายทิ้ง) ลงคอลัมน์ซ้ำไปเรื่อยๆ — P1 พบระหว่าง E3-AC4
    setFileUrl(result.path);
    setFileName(file.name);
    setUploading(false);
  }

  async function handleRemoveFile() {
    // ไฟล์ที่ยังไม่บันทึก (เพิ่งอัปโหลดในเซสชันนี้) กับไฟล์ที่บันทึกไว้แล้ว ใช้ allowNoRows คนละค่า
    // (เหตุผลอยู่ที่ hooks/useBookingFile.ts) จึงต้องแยกสองทาง ไม่ใช้ path เดียวกันเรียกฟังก์ชันเดียว
    if (pendingUploadPathRef.current) {
      await removePendingBookingFile(pendingUploadPathRef.current);
    } else {
      const path = storageKeyOf(fileUrl);
      if (path) await removeSavedBookingFile(path);
    }
    pendingUploadPathRef.current = null;
    setFileUrl("");
    setFileName("");
  }

  // ปุ่ม "เปิดไฟล์" เซ็นใหม่ทุกครั้งตอนคลิก ไม่ใช้ signedFileUrl ที่เซ็นไว้ตอนโมดัลเปิด (§12.2 ux-flows.md)
  // — กันเคสโมดัลเปิดค้างไว้นานแล้วกด ได้ URL ที่หมดอายุไปแล้ว
  async function handleOpenFile() {
    if (!fileUrl || openingFile) return;
    setOpeningFile(true);
    setOpenFileError(null);
    const url = await signStoredFile(fileUrl);
    setOpeningFile(false);
    if (!url) {
      setOpenFileError("เปิดไฟล์ไม่สำเร็จ — ลองใหม่อีกครั้ง");
      return;
    }
    // เซ็นก่อนเปิดแท็บเสมอ ไม่เปิดแท็บด้วย URL เปล่าแล้วรอ fetch — ถ้าเซ็นพัง ต้องไม่มีแท็บใหม่โผล่เลย
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleCloseAttempt() {
    if (pendingUploadPathRef.current) {
      const path = pendingUploadPathRef.current;
      pendingUploadPathRef.current = null;
      void removePendingBookingFile(path);
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
      // เก็บวันครบกำหนดเฉพาะของที่ยังต้องจอง — ถ้าเปลี่ยนสถานะเป็นจองแล้ว/ซื้อหน้างานแล้วยังเก็บค่าไว้
      // พอสลับกลับมาเป็น "ต้องจอง" ทีหลังจะได้เดดไลน์เก่าที่ไม่มีใครตั้งใจโผล่มาเงียบๆ
      bookByDaysBefore:
        status === "pending" && bookByDaysBefore.trim() ? Number(bookByDaysBefore) : null,
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
              className="rounded-xl px-4 py-3 text-sm text-content-soft hover:bg-surface-soft"
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
        <label className="mb-1 block text-xs font-medium text-content-soft">ประเภท</label>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium ${
                category === c
                  ? "border-maple bg-maple-soft text-maple-dark"
                  : "border-line text-content-soft hover:bg-surface-soft"
              }`}
            >
              <span>{BOOKING_CATEGORY_ICON[c]}</span>
              <span>{BOOKING_CATEGORY_LABEL[c]}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">สถานะ</label>
        <div className="grid grid-cols-3 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                status === s.value
                  ? "border-maple bg-maple-soft text-maple-dark"
                  : "border-line text-content-soft hover:bg-surface-soft"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">ชื่อ/รายละเอียด</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="เช่น VN610 กรุงเทพ → ฮานอย"
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">ผูกกับวัน (ไม่บังคับ)</label>
        <select
          value={dayId}
          onChange={(e) => handleDayChange(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
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
          <label className="mb-1 block text-xs font-medium text-content-soft">วันที่</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-content-soft">เวลา</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
          />
        </div>
      </div>

      {/* วันครบกำหนดจองมีความหมายเฉพาะของที่ยังต้องไปจอง — จองแล้ว/ซื้อหน้างานไม่มีเดดไลน์ให้พลาด
          ซ่อนช่องนี้ไปเลยแทนที่จะปล่อยให้กรอกแล้วไม่มีผล (ค่าที่กรอกค้างไว้จะไม่ถูกเซฟด้วย ดู handleSave) */}
      {status === "pending" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-content-soft">
            ต้องจองล่วงหน้ากี่วัน (ไม่บังคับ)
          </label>
          <input
            type="number"
            min={0}
            value={bookByDaysBefore}
            onChange={(e) => setBookByDaysBefore(e.target.value)}
            placeholder="เช่น 30"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
          />
          {deadline ? (
            <p className="mt-1 text-xs text-content-soft">📅 ต้องจองภายใน {deadline}</p>
          ) : bookByDaysBefore.trim() && !date ? (
            <p className="mt-1 text-xs text-content-soft">
              ยังคำนวณวันครบกำหนดไม่ได้ — ใส่วันที่ใช้ตั๋วก่อน
            </p>
          ) : null}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">เลขที่จอง</label>
        <input
          value={confirmationNumber}
          onChange={(e) => setConfirmationNumber(e.target.value)}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">ลิงก์ (ไม่บังคับ)</label>
        <input
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setLinkError(null);
          }}
          placeholder="https://..."
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
        />
        {linkError && <p className="mt-1 text-xs text-red-600">{linkError}</p>}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">โน้ต</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">ไฟล์แนบ (รูป/PDF)</label>
        {fileUrl ? (
          <div className="rounded-lg border border-line px-3 py-2">
            {/* รูปตั๋วให้ดูได้ในแอปเลย ไม่ต้องเด้งออกแท็บใหม่ (บนมือถือที่ติดตั้งเป็น PWA = เสียบริบททั้งหมด)
                PDF ยังเป็นลิงก์เหมือนเดิม เพราะ render ในหน้าไม่ได้
                signedFileUrl มี 3 สถานะ (undefined กำลังเซ็น · null เซ็นไม่สำเร็จ · string เปิดได้)
                เซ็นตอน fileUrl เปลี่ยน ไม่ใช่ตอนคลิก — ต้องเห็นรูปทันทีไม่มีจังหวะคลิกก่อน (§12.2 ux-flows.md) */}
            {isImageAttachment(fileName, fileUrl) && signedFileUrl === undefined && (
              <div className="mb-2 h-24 w-full max-w-40 animate-pulse rounded-lg bg-surface-soft" />
            )}
            {isImageAttachment(fileName, fileUrl) && signedFileUrl === null && (
              <div
                className="mb-2 flex h-24 w-full max-w-40 items-center justify-center rounded-lg bg-surface-soft text-xs text-content-soft"
                title="เปิดรูปตั๋วไม่ได้"
              >
                🖼️✕ เปิดรูปไม่ได้
              </div>
            )}
            {isImageAttachment(fileName, fileUrl) && typeof signedFileUrl === "string" && (
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="mb-2 block w-full max-w-40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL ของ Supabase Storage ไม่ใช่ static asset */}
                <img src={signedFileUrl} alt="" className="w-full rounded-lg object-cover" />
                <span className="mt-1 block text-[11px] text-pine-dark">แตะเพื่อดูขนาดเต็ม</span>
              </button>
            )}
            <div className="flex items-center gap-2">
              {/* เดิมเป็น <a href={fileUrl}> ตรงๆ — ตอนนี้ต้องเซ็นใหม่ทุกครั้งตอนคลิก ไม่ใช้ signedFileUrl
                  ที่เซ็นไว้ตอนโมดัลเปิดซ้ำ กันเปิดโมดัลค้างไว้นานแล้วกดได้ลิงก์ที่หมดอายุไปแล้ว */}
              <button
                type="button"
                onClick={handleOpenFile}
                disabled={openingFile}
                className="min-w-0 flex-1 truncate text-left text-sm text-pine underline disabled:opacity-60"
              >
                {openingFile ? "กำลังเปิด..." : `📎 ${fileName || "เปิดไฟล์"}`}
              </button>
              <button
                onClick={handleRemoveFile}
                className="shrink-0 rounded-full p-1 text-content-soft hover:bg-surface-soft"
              >
                ✕
              </button>
            </div>
            {openFileError && <p className="mt-1 text-xs text-red-600">{openFileError}</p>}
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-line px-3 py-3 text-xs text-content-soft hover:bg-surface-soft">
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

      {zoomed && typeof signedFileUrl === "string" && (
        <PhotoLightbox
          src={signedFileUrl}
          alt={fileName || "รูปตั๋วที่แนบไว้"}
          onClose={() => setZoomed(false)}
        />
      )}
    </Modal>
  );
}
