// 🔴 **ทำไมไฟล์นี้มีอยู่ — `travel_time_cache` เคยถือพิกัดที่พักเป็นข้อความล้วน** (P1 · 2 ก.ย. 2026 · `E3-AC6`)
//
// `hotelAnchorId()` คืน `hotel@<lat>,<lng>` และค่านั้นไหลจาก `PlaceDetailModal`
// → `/api/travel-time?originPlaceId=…` → เขียนลงคอลัมน์คีย์ของตารางที่ **ใช้ร่วมกันทั้งระบบ**
// · `lib/__tests__/hotelAnchorId.test.ts` ยืนยันเองว่า **อ่านพิกัดกลับจาก id ได้** — เป็นคุณสมบัติที่ตั้งใจ
// · `custom_places.id` (UUID ผูกทริป) ก็ไหลเข้าทางเดียวกันผ่าน `resolvePlace`
//
// วันนี้ยังไม่รั่วเพราะตารางถูก `revoke all` จาก client — **แต่ `D87` กำลังจะเปิดสิทธิ์อ่านให้ผู้ใช้ทุกคน**
// 🎯 ด่านที่มีอยู่ผ่านหมดและทุกใบถูก: `cache-lockdown` ถาม *"สิทธิ์เกินที่ประกาศไหม"* ·
//    ด่านสคีมาของ `AC6` ถาม *"มีคอลัมน์ชื่อ trip หรือ FK ไหม"* · **`hotel@…` ไม่เข้าข่ายสักใบ**
//
// ## ทำไม hash *ทุกคีย์* ไม่ใช่เฉพาะคีย์ที่ดู "ส่วนตัว"
// เพราะทางเลือกนั้นต้องมี **รายการว่าอะไรส่วนตัว** ซึ่งจะผิดวันที่มีรูปแบบ id ใหม่โผล่มา
// และมันจะผิดแบบ *เงียบ* · **hash ทุกตัว = ไม่มีคำถามให้ตอบผิด** และตรวจด้วยตาได้ว่าไม่มีทางลัด
//
// ⚠️ **ข้อจำกัดที่ต้องรู้ — ปิดได้เฉพาะ `travel_time_cache`**
//    ตารางนั้นตัวแถวไม่มีอะไรระบุตัวตนเลย (โหมด · นาที · เมตร) → hash คีย์แล้วปิดสนิท
//    🔴 **`place_details_cache` ปิดไม่ได้ด้วยวิธีนี้** — ตัวแถวถือชื่อ/ที่อยู่ที่ Google ตอบกลับมา
//       ซึ่งบอกได้เองว่าเป็นที่ไหน **ต่อให้คีย์เป็น hash แล้วก็ตาม** ต้องตัดสินแยก
import "server-only";
import { createHash } from "node:crypto";

/** ยาวพอกัน collision (128 บิต) · สั้นพอให้อ่าน log ได้ · คอลัมน์รับได้ถึง 500 */
const KEY_HEX_LEN = 32;
const MIN_SALT_LEN = 16;

function salt(): string | null {
  const s = process.env.TRAVEL_CACHE_KEY_SALT;
  return s && s.length >= MIN_SALT_LEN ? s : null;
}

/**
 * ตั้ง salt ไว้หรือยัง — **ผู้เรียกต้องเช็คก่อนแล้วข้ามการแคชถ้ายัง**
 * 🔴 จงใจไม่มีทางถอยไปเป็น "hash แบบไม่มี salt" — ถ้าถอยได้ วันที่ลืมตั้ง env
 *    ระบบจะเขียนคีย์ที่เดาย้อนได้ลงตารางเดิม **โดยไม่มีอะไรฟ้อง**
 *    (คนละกรณีกับการหยุดแคช ซึ่งสังเกตได้จากบิล Google ที่โตขึ้น)
 */
export function cacheKeySaltConfigured(): boolean {
  return salt() !== null;
}

/**
 * แปลง place id เป็นคีย์แคชที่ย้อนกลับไม่ได้
 * @throws ถ้ายังไม่ได้ตั้ง salt — **ตั้งใจให้ดัง** ผู้เรียกต้องกัน `cacheKeySaltConfigured()` ไว้ก่อน
 */
export function hashPlaceKey(placeId: string): string {
  const s = salt();
  if (s === null) {
    throw new Error(
      "TRAVEL_CACHE_KEY_SALT ยังไม่ได้ตั้ง (หรือสั้นกว่า 16 ตัว) — " +
        "เรียก cacheKeySaltConfigured() กันไว้ก่อน แล้วข้ามการแคชแทนที่จะเขียนคีย์ดิบ"
    );
  }
  // คั่นด้วยช่องว่างเพื่อไม่ให้ (salt+a, b) ชนกับ (salt, a+b)
  return createHash("sha256").update(s).update(" ").update(placeId).digest("hex").slice(0, KEY_HEX_LEN);
}
