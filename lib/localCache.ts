/**
 * แคชข้อมูลจาก Supabase ลง localStorage เพื่อให้หน้าขึ้นทันทีตอนเปิด — และยังอ่านได้ตอนเน็ตหลุด (เฟส 18)
 *
 * ทำไมไม่ให้ service worker แคช response ของ Supabase แทน: เว็บนี้คุยกับ Supabase ผ่าน `supabase-js`
 * (REST + realtime websocket) แคชระดับ HTTP จะได้ก้อน JSON ที่ผูกกับสตริง query เป๊ะๆ ซึ่งเปลี่ยนบ่อย
 * และเสี่ยงเสิร์ฟของเก่าทับตอนกำลัง "เขียน" อยู่ · เก็บเป็น state ของแอปตรงๆ ควบคุมง่ายกว่าและ
 * ตรงกับขอบเขต "offline อ่านอย่างเดียว" ที่ตกลงกันไว้ — ข้อมูลที่แคชนี้ไม่เคยถูกใช้ตัดสินใจตอนเขียน
 */

const PREFIX = "trip-cache:";

export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // JSON เสีย หรือ localStorage ถูกปิด — ถือว่าไม่มีแคช ไม่ใช่ error ที่ต้องแจ้งผู้ใช้
    return null;
  }
}

export function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // เต็มโควตา (รูป base64 ของคนอื่นกินไปหมด ฯลฯ) — ข้ามไป ยังใช้งานออนไลน์ได้ปกติ
  }
}
