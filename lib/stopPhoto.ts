import { BOOKING_FILES_BUCKET, supabase } from "@/lib/supabase";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BOOKING_FILES_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

/** อัปโหลดรูปจุดแวะขึ้น Supabase Storage แล้วลบรูปเก่าทิ้ง (ถ้ามี) — คืน public URL หรือข้อความ error
 *  ใช้ร่วมกันระหว่าง SortableStopRow (หน้าวางแผน) กับ PlaceDetailModal (หน้า /today) */
export async function uploadStopPhoto(
  stopId: string,
  file: File,
  existingPhotoUrl: string | null | undefined
): Promise<{ url: string } | { error: string }> {
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "ไฟล์ใหญ่เกิน 10MB กรุณาเลือกไฟล์อื่น" };
  }
  const path = `stop-photo-${stopId}-${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
  const { error } = await supabase.storage.from(BOOKING_FILES_BUCKET).upload(path, file);
  if (error) return { error: "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" };
  const oldPath = existingPhotoUrl ? storagePathFromPublicUrl(existingPhotoUrl) : null;
  if (oldPath) await supabase.storage.from(BOOKING_FILES_BUCKET).remove([oldPath]);
  const { data } = supabase.storage.from(BOOKING_FILES_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/** ลบรูปจุดแวะออกจาก Supabase Storage */
export async function removeStopPhoto(photoUrl: string | null | undefined): Promise<void> {
  const path = photoUrl ? storagePathFromPublicUrl(photoUrl) : null;
  if (path) await supabase.storage.from(BOOKING_FILES_BUCKET).remove([path]);
}
