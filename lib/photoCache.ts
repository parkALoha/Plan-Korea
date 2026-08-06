// แคชรูปสถานที่ไว้ในหน่วยความจำของแท็บ (L1) กันไม่ให้ยิง /api/place-photos ซ้ำทุกครั้งที่
// การ์ด/โมดัลเดิมถูก render ใหม่ในหน้าเดียวกัน — ตัวแคชถาวรจริงๆ (L2, ข้าม reload/คนละคน)
// อยู่ที่ตาราง place_photo_cache ฝั่ง Supabase ซึ่ง /api/place-photos เช็คก่อนยิง Google เสมอ
export const photoCache = new Map<string, string[]>();
