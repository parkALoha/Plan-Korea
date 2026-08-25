/**
 * ตัวตนของไฟล์ใน Storage ที่ **ไม่ขึ้นกับลายเซ็น** — `E2-AC13` ② · ③
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## 🔴 ทำไมมันต้องแยกจาก `files.ts` — เหตุผลไม่ใช่ความสวยงาม
 *
 * ฉบับแรกผมเขียนรวมไว้ในไฟล์เดียว **แล้วเทสต์ล้มทั้งชุดตั้งแต่ import**:
 * ```
 * Error: Node.js detected but native WebSocket not found.
 *   ❯ new RealtimeClient …  ❯ createClient …  ❯ lib/supabase.ts:10
 * ```
 * 🎯 **และมันชี้ของที่ใหญ่กว่าเทสต์: `sw.js` ก็ import `supabase-js` ไม่ได้เหมือนกัน**
 * แต่ `E2-AC13` ③ ต้องใช้ฟังก์ชันนี้ **ในตัว service worker** เพื่อคีย์แคชด้วย path แทน URL
 * · ถ้ามันลากไคลเอนต์มาด้วย **ผู้ใช้ที่แท้จริงของมันเรียกใช้ไม่ได้เลย**
 *
 * · ⚠️ **การ import ที่ล้มคือของขวัญ** — มันบอกว่าโมดูลนี้พึ่งของที่มันไม่ควรพึ่ง
 *   ตั้งแต่ก่อนมีใครเอาไปใช้ผิดที่ · ไฟล์นี้จึงไม่ import อะไรเลยโดยตั้งใจ **ห้ามเพิ่ม import**
 */

/** Supabase Storage bucket ของไฟล์แนบตั๋ว/รูปจุดแวะ — **แหล่งเดียวของชื่อนี้** */
export const BOOKING_FILES_BUCKET = "booking-files";

/** marker ของ public URL แบบเดิม — แถวก่อน `E7` ยังเก็บ URL เต็มไว้ทั้งสตริง */
const PUBLIC_MARKER = `/storage/v1/object/public/${BOOKING_FILES_BUCKET}/`;

/**
 * คืน **path ใน bucket** จากค่าที่เก็บอยู่ในคอลัมน์ · `null` = ไม่ใช่ไฟล์ของ bucket นี้
 *
 * ระหว่างทางจาก public URL ไป path **คอลัมน์เดียวกันถือของสองแบบพร้อมกัน**
 * (แถวเก่า = URL เต็ม · แถวใหม่ = path · `E7` ค่อยย้ายค่าจริง)
 * → จุดอ่านทั้ง ~20 จุดจึงไม่ต้องรู้ว่าแถวไหนเป็นแบบไหน
 *
 * 🔴 **ค่าที่เป็น URL ของโดเมนอื่นต้องได้ `null` ไม่ใช่ถูกเดาว่าเป็น path**
 * เคสจริงคือรูปจาก Google Places ที่เคยลงช่องเดียวกัน — เดาผิดแล้วจะไปเซ็นไฟล์ชื่อ
 * `"https://…"` ใน bucket เรา ซึ่งไม่มีวันมี **และ error ที่ได้จะอ่านไม่ออกว่าเพราะอะไร**
 */
export function storageKeyOf(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const idx = stored.indexOf(PUBLIC_MARKER);
  if (idx !== -1) return decodeURIComponent(stored.slice(idx + PUBLIC_MARKER.length));
  if (/^https?:\/\//i.test(stored)) return null;
  return stored;
}
