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
