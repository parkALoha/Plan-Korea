// กัน javascript:/data: URL ที่แอบพิมพ์ลงช่อง "ลิงก์" (RLS เปิดสาธารณะ ใครก็เขียนลงได้) ไม่ให้ใช้เป็น href ตรงๆ
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif)(\?|#|$)/i;

/**
 * ไฟล์แนบของตั๋วเป็นรูปหรือเปล่า — ช่องเดียวรับทั้ง `image/*` และ `application/pdf`
 * (ดู `BookingEditModal`) และตาราง bookings ไม่มีฟิลด์บอกชนิด จึงต้องเดาจากนามสกุล
 *
 * ดูชื่อไฟล์ก่อนเพราะเป็นชื่อจริงจากเครื่องผู้ใช้ · URL ของ Supabase Storage มีนามสกุลติดมาด้วย
 * (path เป็น `{id}-{ts}-{rand}-{ชื่อไฟล์เดิม}`) จึงใช้เป็นตัวสำรองได้ตอนแถวเก่าไม่มี file_name
 */
export function isImageAttachment(
  fileName: string | null | undefined,
  fileUrl: string | null | undefined
): boolean {
  if (fileName) return IMAGE_EXT.test(fileName);
  if (!fileUrl) return false;
  try {
    return IMAGE_EXT.test(new URL(fileUrl).pathname);
  } catch {
    return false;
  }
}
