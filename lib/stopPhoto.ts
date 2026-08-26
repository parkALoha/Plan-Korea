import { supabase } from "@/lib/supabase";
import { writeGuard } from "@/lib/writeGuard";
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

  // 🔴 `allowNoRows` ไม่ระบุ (= `false`) และ **มันไม่มีผลกับรูปนี้ ซึ่งถูกต้อง**
  //    `.upload()` คืน `data` เป็น **object** (`{ path, id, fullPath }`) ไม่ใช่ array
  //    → `Array.isArray(data)` เป็น `false` เสมอ → ข้อ "0 แถว" ของ `writeGuard` ไม่ทำงานกับมันเลย
  //    **ถูกโดยธรรมชาติของ API ไม่ใช่ช่องที่พลาด** — แต่ต้องเขียนไว้ ไม่งั้นคนถัดไปจะอ่านว่า
  //    `writeGuard` ตรวจครบทุกมิติให้แล้ว
  // ⚠️ ผู้ใช้ยังต้องได้ข้อความในบริบทของหน้าจอด้วย (`{ error }` ที่คืนไป) — toast ของ guard
  //    บอกว่า *อะไร*ล้ม · ตัวที่คืนบอกว่า*ตอนนี้ทำอะไรต่อได้* · คนละหน้าที่ ไม่ใช่ซ้ำกัน
  // 🎯 **ตัวชนิดพูดข้อเดียวกันนี้เองก่อนที่ผมจะเขียนคอมเมนต์เสร็จ:**
  //    `WriteResult.data` เป็น `unknown[] | null` · `.upload()` คืน object → `tsc` ปฏิเสธ
  //    ทางที่ง่ายคือขยาย `WriteResult.data` เป็น `unknown` **ซึ่งจะทำให้ชนิดเลิกบอกว่า "data คือแถว"**
  //    → เลือกทิ้ง `data` ตรงนี้แทน **ให้ความไม่เข้ากันปรากฏที่จุดเรียก ไม่ใช่ถูกกลบที่นิยาม**
  const uploaded = await writeGuard("อัปโหลดรูปจุดแวะ", async () => {
    const { error } = await supabase.storage.from(BOOKING_FILES_BUCKET).upload(path, file);
    return { error };
  });
  if (!uploaded) return { error: "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" };

  // 🔴 `allowNoRows: true` — รูปเก่ามาจากแถวที่มีอยู่จริง · อีกเครื่องอาจเปลี่ยนรูปเดียวกันไปก่อน
  //    "ไม่มีไฟล์ให้ลบ" = ผลที่เราต้องการอยู่แล้ว ไม่ใช่ความล้มเหลว
  // ⚠️ **ไม่บล็อกผลลัพธ์ของการอัปโหลด** — ลบของเก่าไม่สำเร็จไม่ได้แปลว่ารูปใหม่ใช้ไม่ได้
  //    ที่แย่ที่สุดคือไฟล์กำพร้าค้างใน bucket ซึ่งดังผ่าน toast แล้ว
  const oldPath = storageKeyOf(existingPhotoUrl);
  if (oldPath) {
    await writeGuard(
      "ลบรูปเดิมของจุดแวะ",
      () => supabase.storage.from(BOOKING_FILES_BUCKET).remove([oldPath]),
      { allowNoRows: true }
    );
  }

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

/**
 * ลบรูปจุดแวะออกจาก Supabase Storage
 *
 * 🔴 `allowNoRows: true` ด้วยเหตุผลเดียวกับการลบรูปเก่าตอนอัปโหลด — ผู้ใช้กดลบรูปที่
 * อีกเครื่องลบไปแล้ว **ได้ผลที่เขาต้องการ** · ถ้าเถียงว่าเป็นความล้มเหลว toast จะดังในกรณีที่
 * ไม่มีอะไรผิด และ toast ที่ดังตอนไม่มีอะไรผิด คือ toast ที่คนจะเลิกอ่าน
 */
export async function removeStopPhoto(photoUrl: string | null | undefined): Promise<void> {
  const path = storageKeyOf(photoUrl);
  if (!path) return;
  await writeGuard(
    "ลบรูปจุดแวะ",
    () => supabase.storage.from(BOOKING_FILES_BUCKET).remove([path]),
    { allowNoRows: true }
  );
}
