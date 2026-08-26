/**
 * แคชข้อมูลจาก Supabase ลง localStorage เพื่อให้หน้าขึ้นทันทีตอนเปิด — และยังอ่านได้ตอนเน็ตหลุด (เฟส 18)
 *
 * ทำไมไม่ให้ service worker แคช response ของ Supabase แทน: เว็บนี้คุยกับ Supabase ผ่าน `supabase-js`
 * (REST + realtime websocket) แคชระดับ HTTP จะได้ก้อน JSON ที่ผูกกับสตริง query เป๊ะๆ ซึ่งเปลี่ยนบ่อย
 * และเสี่ยงเสิร์ฟของเก่าทับตอนกำลัง "เขียน" อยู่ · เก็บเป็น state ของแอปตรงๆ ควบคุมง่ายกว่าและ
 * ตรงกับขอบเขต "offline อ่านอย่างเดียว" ที่ตกลงกันไว้ — ข้อมูลที่แคชนี้ไม่เคยถูกใช้ตัดสินใจตอนเขียน
 */

/**
 * 🔴 **เลขเวอร์ชันของ *รูปข้อมูล* ไม่ใช่ของโค้ด — ขึ้นเมื่อรูปแถวเปลี่ยน** (P7 เจอ · P1 ลง · 26 ส.ค. 2026)
 *
 * ฉบับแรกคีย์เป็น `"trip-cache:"` เปล่า ๆ **ไม่มีอะไรบอกว่าของข้างในเป็นรูปไหน**
 * และแอป **hydrate จากแคชก่อน fetch เสมอ** (`useStops.ts:60`) → เฟรมแรกที่ผู้ใช้เห็นมาจาก localStorage
 *
 * 🎯 **วินาทีที่สคีมาเปลี่ยน (`E7`) เฟรมแรกนั้นคือข้อมูลรูปเก่า:**
 * ```
 * order_index → rank      · sortStops เทียบ a.order_index - b.order_index กับ undefined → NaN → ลำดับมั่ว
 * day_id      → trip_day_id
 * file_url    → file_path
 * ไม่มี deleted_at
 * ```
 * 🔴 **และมันไม่หายเองจนกว่าผู้ใช้จะล้าง site data ซึ่งไม่มีใครทำ**
 *
 * ⚠️ **แก้ *ก่อน* cutover ราคาเกือบศูนย์ · แก้ *หลัง* = ทุกคนแบกแคชพิษข้ามเส้นไปแล้ว**
 * — เส้นตายคือ `E7` ไม่ใช่ `E6` แม้งานจะอยู่ใน `E6`/`D17` (P7 · รูปเดียวกับ `E3`-ก่อน-`E7`)
 *
 * 📌 **ขึ้นเลขนี้เมื่อไหร่: วันที่รูปแถวที่แคชไว้เปลี่ยน ไม่ใช่ทุกครั้งที่แก้โค้ด**
 */
const CACHE_VERSION = 2;
const PREFIX = `trip-cache:v${CACHE_VERSION}:`;

/** คีย์รุ่นเก่าทั้งหมดที่เคยใช้ — กวาดทิ้ง ไม่ใช่แค่เลิกอ่าน */
const LEGACY_PREFIX = "trip-cache:";

let swept = false;

/**
 * ทิ้งแคชรุ่นเก่า **ครั้งเดียวต่อการโหลดหน้า**
 *
 * 🔴 **แค่เปลี่ยน prefix ไม่พอ** — ของเก่ายังกินโควตา 5 MB ค้างอยู่ตลอดกาล
 * และ `writeCache` กลืน quota error เงียบ ๆ โดยตั้งใจ → **แคชใหม่จะเขียนไม่ลงโดยไม่มีใครรู้**
 * · เรียกแบบ lazy ตอนใช้ครั้งแรก จึงไม่ต้องมี boot hook ให้ใครลืมต่อ
 */
function sweepLegacyCaches() {
  if (swept) return;
  swept = true;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LEGACY_PREFIX) && !k.startsWith(PREFIX)) doomed.push(k);
    }
    for (const k of doomed) window.localStorage.removeItem(k);
  } catch {
    // localStorage ถูกปิด — ไม่มีอะไรให้กวาด และไม่ใช่ error ที่ผู้ใช้ต้องเห็น
  }
}

export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  sweepLegacyCaches();
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
  sweepLegacyCaches();
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // เต็มโควตา (รูป base64 ของคนอื่นกินไปหมด ฯลฯ) — ข้ามไป ยังใช้งานออนไลน์ได้ปกติ
  }
}

/** 🔴 เปิดให้เทสต์เท่านั้น — ด่านที่ไม่มีเคสด้านบวก คือด่านที่ไม่มีใครรู้ว่ายังทำงานอยู่ไหม */
export const __cachePrefixForTests = PREFIX;
