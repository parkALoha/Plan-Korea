import { BOOKING_FILES_BUCKET, supabase } from "@/lib/supabase";
import { writeGuard } from "@/lib/writeGuard";
import { forgetSignedFile } from "@/lib/engine/files";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function randomSuffix() {
  return Math.random().toString(36).slice(2);
}

/**
 * choke point เดียวของการเขียน Supabase Storage สำหรับไฟล์แนบตั๋ว (`E3-AC4`)
 *
 * เดิม `BookingEditModal.tsx` ยิง `supabase.storage.from(...)` ตรงจาก component 4 จุด
 * (upload, ลบตัวที่เพิ่งอัปโหลดซ้ำ, ลบไฟล์ที่บันทึกแล้ว, ลบไฟล์ค้างตอนปิดโมดัลไม่บันทึก) —
 * ไม่ต่างจาก 67 จุดเดิมที่ตารางเจอมาก่อน `writeGuard` ห่อให้ ดึงออกมาเป็น hook เดียวกับอีก 10 hook
 * ของตาราง ไม่ใช่ข้อยกเว้นให้ Storage
 *
 * 🔴 **`allowNoRows` ตัดสินแยกทีละจุด ไม่ลอกจากจุดข้างเคียง** (ตามที่ `writeGuard.ts` เขียนกำกับไว้เอง
 * ว่า "ต้องระบุที่จุดเรียก") — ดูเหตุผลของแต่ละจุดในคอมเมนต์ตรงนั้น
 */
export function useBookingFile() {
  /**
   * อัปโหลดไฟล์ใหม่ — คืน path (ไม่ใช่ URL, bucket เป็น private แล้ว) หรือข้อความ error ที่แสดงได้เลย
   *
   * 🔴 **`.upload()` คืน `{ data: { path, id, fullPath }, error }` — `data` เป็น object ไม่ใช่ array**
   * ต่างจาก `.remove()` ที่คืน array ตรงๆ — ที่นี่ตั้งใจส่งแค่ `{ error }` เข้า `writeGuard` (ไม่ส่ง `data`)
   * เพราะการเช็ค "0 แถว" ของ `writeGuard` ใช้กับรูปนี้ไม่ได้อยู่แล้วโดยธรรมชาติของ API
   * (`Array.isArray(object)` เป็น `false` เสมอ) — **ถูกต้องแล้วที่มันไม่มีผล ไม่ใช่ช่องโหว่ที่พลาด**
   * ไม่มี `error` ก็แปลว่าไฟล์ขึ้นจริง ไม่ต้องพึ่งการนับแถวเพิ่ม
   *
   * `allowNoRows: false` (ค่าจริงที่ตั้งใจ แม้จะไม่มีผลตามข้อข้างบน) — อัปโหลดใหม่ไม่มีเหตุผลอะไรที่
   * "ปกติ" จะเจอ 0 แถว การเขียนอย่างตั้งใจดีกว่าเดาว่าอาจไม่ต้องคิด
   */
  async function uploadBookingFile(
    file: File,
    existingId: string | null
  ): Promise<{ path: string } | { error: string }> {
    if (file.size > MAX_FILE_BYTES) {
      return { error: "ไฟล์ใหญ่เกิน 10MB กรุณาเลือกไฟล์อื่น" };
    }
    const path = `${existingId ?? "new"}-${Date.now()}-${randomSuffix()}-${file.name}`;
    const ok = await writeGuard(
      "แนบไฟล์",
      async () => {
        const { error } = await supabase.storage.from(BOOKING_FILES_BUCKET).upload(path, file);
        return { error };
      },
      { allowNoRows: false }
    );
    if (!ok) return { error: "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" };
    return { path };
  }

  /**
   * ลบไฟล์ที่เพิ่งอัปโหลดในเซสชันนี้แต่ยังไม่บันทึก (แทนที่ด้วยไฟล์ใหม่ หรือปิดโมดัลไม่บันทึก)
   *
   * `allowNoRows: false` — path ที่ลบตรงนี้เพิ่งถูกสร้างโดยเซสชันนี้เองไม่กี่ร้อยมิลลิวินาทีก่อนหน้า
   * ไม่เคยถูกบันทึกลง DB จึงไม่มีใคร (อีกเครื่อง/อีกคน) รู้จักพอที่จะไปลบซ้ำได้ — เจอ 0 แถวตรงนี้คือ
   * สัญญาณว่ามีอะไรผิดปกติจริง (เช่น upload ที่ผ่านมาไม่ได้ persist แม้ไม่มี error) ไม่ใช่ race ที่คาดไว้
   */
  async function removePendingBookingFile(path: string): Promise<boolean> {
    const ok = await writeGuard(
      "ลบไฟล์ที่อัปโหลดค้างไว้",
      () => supabase.storage.from(BOOKING_FILES_BUCKET).remove([path]),
      { allowNoRows: false }
    );
    if (ok) forgetSignedFile(path);
    return ok;
  }

  /**
   * ลบไฟล์แนบของ booking ที่บันทึกแล้ว (ผู้ใช้กด "ลบไฟล์" บนใบที่มีอยู่)
   *
   * `allowNoRows: true` — path นี้มาจากแถวที่บันทึกไว้แล้ว อีกเครื่อง/อีกคนอาจแก้ booking เดียวกัน
   * แล้วลบไฟล์ไปก่อนหน้านี้ได้จริง (สถานการณ์ที่ P1 ยกตัวอย่างไว้ตรงๆ) เจอ 0 แถวตรงนี้คือ "ไฟล์หายไป
   * แล้วอยู่แล้ว" ซึ่งเป็นผลลัพธ์ที่ผู้ใช้ต้องการอยู่ดี ไม่ใช่ความล้มเหลว
   */
  async function removeSavedBookingFile(path: string): Promise<boolean> {
    const ok = await writeGuard(
      "ลบไฟล์แนบ",
      () => supabase.storage.from(BOOKING_FILES_BUCKET).remove([path]),
      { allowNoRows: true }
    );
    if (ok) forgetSignedFile(path);
    return ok;
  }

  return { uploadBookingFile, removePendingBookingFile, removeSavedBookingFile };
}
