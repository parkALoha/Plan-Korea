import { supabase } from "@/lib/supabase";
import { BOOKING_FILES_BUCKET, storageKeyOf } from "@/lib/engine/storageKey";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// 🔴 เคยมี `storagePathFromPublicUrl()` ของตัวเองตรงนี้ — **ถอดทิ้ง 27 ส.ค. 2026**
//    มันเข้าใจ *เฉพาะ* public URL แบบเก่า · พอ `uploadStopPhoto()` เริ่มคืน path
//    มันจะคืน `null` ให้ค่ารูปแบบใหม่ → **รูปเก่าไม่เคยถูกลบ ไฟล์ค้างสะสมเงียบ ๆ**
// 🎯 ผมเกือบปล่อยข้อนี้ไปพร้อมกับการแก้ที่ตั้งใจ — ตัวแปลงสองตัวที่เข้าใจคนละชุดของค่า
//    คือรูปเดียวกับ "สองแหล่งความจริง" ที่ทีมนี้ไล่ปิดกันทั้งวัน
// · `storageKeyOf()` (`lib/engine/storageKey.ts`) รับทั้งสองรูปแบบและคืน `null` ให้โดเมนอื่น

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
  const oldPath = storageKeyOf(existingPhotoUrl);
  if (oldPath) await supabase.storage.from(BOOKING_FILES_BUCKET).remove([oldPath]);

  // 🔴 คืน **path** ไม่ใช่ public URL — แก้ 27 ส.ค. 2026
  //    `getPublicUrl()` บน bucket ที่ปิดไปแล้ว (`E2-AC13` ①) คืน URL ที่เปิดไม่ได้
  //    มันยัง "ทำงาน" อยู่ได้เพราะ `storageKeyOf()` ถอด path ออกจาก URL ให้ทุกจุดอ่าน
  //    → **URL ถูกใช้เป็นซองใส่ path ไม่ใช่ที่อยู่ที่เปิดได้จริง**
  // 🎯 แต่ผลข้างเคียงคือ **การอัปโหลดใหม่ทุกครั้งเขียนค่ารูปแบบเก่าลงคอลัมน์**
  //    ซึ่งเป็นรูปแบบที่ `E7` มีหน้าที่ย้ายทิ้ง → `E7` จะย้ายเสร็จแล้วมีของเก่าเกิดใหม่ทันที
  //    ตระกูล `D73`: ชั้นความเข้ากันได้ที่ยังผลิตของที่มันมีไว้เพื่อเลิกผลิต
  // · ปลอดภัยเพราะ `storageKeyOf()` รับทั้งสองรูปแบบอยู่แล้ว (แถวเก่ายังเป็น URL)
  return { url: path };
}

/** ลบรูปจุดแวะออกจาก Supabase Storage */
export async function removeStopPhoto(photoUrl: string | null | undefined): Promise<void> {
  const path = storageKeyOf(photoUrl);
  if (path) await supabase.storage.from(BOOKING_FILES_BUCKET).remove([path]);
}
