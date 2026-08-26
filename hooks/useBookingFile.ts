import { guardedUpload, guardedRemove } from "@/lib/engine/guardedStorage";
import { forgetSignedFile } from "@/lib/engine/files";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function randomSuffix() {
  return Math.random().toString(36).slice(2);
}

/**
 * choke point ของ `BookingEditModal.tsx` สำหรับไฟล์แนบตั๋ว (`E3-AC4`) — เรียกผ่าน
 * `lib/engine/guardedStorage.ts` เท่านั้น (ที่เดียวในโปรเจกต์ที่แตะ `supabase.storage.*` เพื่อเขียนได้)
 * ไม่เรียก `supabase.storage` ตรงจากที่นี่อีกต่อไป — `guardedStorage.ts` ห่อ `writeGuard` ให้ในตัวเอง
 * ผู้เรียกข้ามไม่ได้ (ต่างจากรุ่นก่อนที่ห่อ `writeGuard` เองตรงนี้ แล้วมีช่องให้คนถัดไปลืมห่อ)
 *
 * 🔴 **`allowNoRows` ตัดสินแยกทีละจุด ไม่ลอกจากจุดข้างเคียง แม้ `guardedRemove` จะรับหลาย path พร้อมกันได้**
 * — `removePendingBookingFile` กับ `removeSavedBookingFile` ต้อง**ไม่รวมเป็นการเรียกเดียว** เพราะ
 * `allowNoRows` ของสองฟังก์ชันต่างกันจริง (เหตุผลอยู่ในคอมเมนต์ของแต่ละฟังก์ชันด้านล่าง) รวมกันจะทำให้
 * ตัวหนึ่งได้ค่า `allowNoRows` ของอีกตัว
 */
export function useBookingFile() {
  /**
   * อัปโหลดไฟล์ใหม่ — คืน path (ไม่ใช่ URL, bucket เป็น private แล้ว) หรือข้อความ error ที่แสดงได้เลย
   *
   * `allowNoRows` ของ `guardedUpload` ไม่มีให้ระบุเลย เพราะไม่มีผลกับรูปนี้อยู่แล้วโดยธรรมชาติของ API
   * (`.upload()` คืน `data` เป็น object ไม่ใช่ array — ดูเหตุผลเต็มที่ `guardedStorage.ts`)
   */
  async function uploadBookingFile(
    file: File,
    existingId: string | null
  ): Promise<{ path: string } | { error: string }> {
    if (file.size > MAX_FILE_BYTES) {
      return { error: "ไฟล์ใหญ่เกิน 10MB กรุณาเลือกไฟล์อื่น" };
    }
    const path = `${existingId ?? "new"}-${Date.now()}-${randomSuffix()}-${file.name}`;
    const ok = await guardedUpload("แนบไฟล์", path, file);
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
    const ok = await guardedRemove("ลบไฟล์ที่อัปโหลดค้างไว้", [path], { allowNoRows: false });
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
    const ok = await guardedRemove("ลบไฟล์แนบ", [path], { allowNoRows: true });
    if (ok) forgetSignedFile(path);
    return ok;
  }

  return { uploadBookingFile, removePendingBookingFile, removeSavedBookingFile };
}
