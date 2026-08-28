import { readCache, writeCache } from "@/lib/localCache";

/**
 * ค่าส่วนบุคคลที่เก็บบนเครื่อง — **ต้องอยู่ใต้ `trip-cache:` เพื่อให้ `clearAllCaches()` กวาดได้**
 *
 * ## 🔴 ทำไมถึงมีไฟล์นี้ (P2 · 28 ส.ค. 2026 · P3 เจอ)
 * `signOut()` เรียก `clearAllCaches()` แล้ว (`3922389`) **แต่มันกวาดเฉพาะคีย์ที่ขึ้นต้น `trip-cache:`**
 * · ค่าที่เขียนด้วย `localStorage.setItem("trip-…")` ตรง ๆ **รอดทุกครั้ง**
 * · ของที่รอดจริงตอนที่เจอ: **ชื่อในพาสปอร์ต** (`trip-passport-names` — ใช้ทำเอกสาร ตม./K-ETA)
 *   และชื่อผู้ใช้ (`trip-who`) → **คนถัดไปบนเครื่องเดียวกันเปิดหน้า ตม. เห็นชื่อพาสปอร์ตของคนก่อน**
 *
 * 🎯 **`clearAllCaches()` ที่กวาดตาม prefix แปลว่า "ปลอดภัยโดยต้องจำ" — คีย์ใหม่ที่ใครเพิ่มจะรอดอัตโนมัติ
 * และคนเพิ่มไม่มีทางรู้ว่าต้องมาแก้ที่ไหน** · ตัวช่วยนี้ทำให้ *ทางที่สะดวกที่สุด* เป็นทางที่ถูกด้วย
 * · P3 เสนอกับ P1 ให้กลับทิศ default (ล้างทุกอย่าง **ยกเว้น** รายการค่าตั้งค่า UI) ซึ่งแก้ที่รากกว่านี้ —
 *   **ตัวนี้ไม่ใช่ตัวแทนของข้อนั้น** · ถ้าข้อนั้นลง ตัวนี้ก็ยังถูกอยู่ ไม่ต้องถอด
 *
 * ## ⚠️ ค่าตั้งค่า UI ไม่ต้องใช้ตัวนี้
 * `trip-prep-open` · ธีม · ภาษา — ไม่ใช่ข้อมูลส่วนบุคคล และการล้างตอน sign out จะทำให้ผู้ใช้
 * ต้องตั้งค่าใหม่ทุกครั้งโดยไม่มีเหตุผล
 */

/**
 * อ่านค่า พร้อม**ย้ายของเดิมจากคีย์ดิบมาให้ครั้งเดียว แล้วลบคีย์ดิบทิ้ง**
 *
 * 🔴 **การลบคีย์เก่าคือครึ่งหนึ่งของงาน ไม่ใช่ของแถม** — ถ้าย้ายอย่างเดียวไม่ลบ ข้อมูลเดิมยังนอนอยู่
 * นอก prefix เหมือนเดิม และเครื่องที่เคยใช้มาก่อนจะไม่มีวันสะอาด
 * · ค่าเดิมเป็น **สตริงดิบ ไม่ใช่ JSON** จึงอ่านด้วย `localStorage.getItem` ตรง ๆ ไม่ใช่ `readCache`
 */
export function readPersonalValue(cacheKey: string, legacyRawKey: string): string {
  if (typeof window === "undefined") return "";
  const current = readCache<string>(cacheKey);
  if (typeof current === "string") return current;
  try {
    const legacy = window.localStorage.getItem(legacyRawKey);
    if (legacy === null) return "";
    writeCache(cacheKey, legacy);
    window.localStorage.removeItem(legacyRawKey);
    return legacy;
  } catch {
    // localStorage ถูกปิด — ไม่มีอะไรให้ย้าย และไม่ใช่ error ที่ผู้ใช้ต้องเห็น
    return "";
  }
}

export function writePersonalValue(cacheKey: string, value: string): void {
  writeCache(cacheKey, value);
}
