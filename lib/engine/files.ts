/**
 * เซ็น URL ของไฟล์ใน `booking-files` **ตอนใช้** ไม่ใช่ตอนเก็บ — `E2-AC13` ②
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## ปัญหาที่ไฟล์นี้มีไว้แก้ และทำไมมันไม่ใช่แค่ "เปลี่ยนฟังก์ชันที่เรียก"
 *
 * `getPublicUrl()` เป็น **synchronous และผลถูกเก็บลงคอลัมน์** (`lib/stopPhoto.ts:26` · `BookingEditModal.tsx:97`)
 * **signed URL เก็บลงคอลัมน์ไม่ได้ เพราะมันหมดอายุ** → คอลัมน์ต้องเป็น *path* และทุกจุดอ่านต้องเซ็นตอนใช้
 *
 * 🔴 **และวินาทีที่ bucket เป็น private ทุกแถวเดิมชี้ไปที่ URL ที่ตายแล้ว**
 * `E2-AC5` วัดด้วย *"เอา URL ไปเปิดในหน้าต่างที่ไม่ล็อกอิน ต้องไม่ได้ไฟล์"* — **ซึ่งผ่านทันทีที่กดปิด bucket**
 * · เกณฑ์นั้นเลยเขียวได้โดยที่ผู้ใช้เปิดไฟล์ตั๋วของตัวเองไม่ได้เลยสักใบ
 *
 * ## 🎯 สิ่งที่ทำให้การต่อสายเป็นงานกลไก ไม่ใช่งานตัดสิน
 *
 * ระหว่างทาง **คอลัมน์เดียวกันจะถือของสองแบบพร้อมกัน** — แถวเก่าเป็น public URL เต็ม
 * แถวใหม่เป็น path · (`E7` ค่อยย้ายค่าจริง)
 * → `signStoredFile()` **รับได้ทั้งสองแบบ** · จุดอ่านทั้ง ~20 จุดจึงไม่ต้องรู้ว่าแถวไหนเป็นแบบไหน
 * · **ถ้าไม่มีข้อนี้ คนต่อสายต้องตัดสินใจทีละจุด และนั่นคือที่ที่มันจะพลาด**
 *
 * ## 🔴 ของที่ไฟล์นี้ **ไม่** แก้ และห้ามอ่านว่าแก้แล้ว
 *
 * `E2-AC13` ③ — `public/sw.js:113,118` ใช้ `cacheFirst` กับ ASSET_CACHE
 * **signed URL เปลี่ยนลายเซ็นทุกครั้งที่เซ็น = URL ไม่ซ้ำเดิม = cache ไม่มีวัน match**
 * → ไฟล์ตั๋วที่เคยเปิดออฟไลน์ได้ **จะเปิดไม่ได้เงียบ ๆ** และจุดที่มันมีค่าที่สุดคือหน้าเคาน์เตอร์ที่ไม่มีสัญญาณ
 *
 * 🎯 **แต่ไฟล์นี้ให้ของที่ ③ ต้องใช้: `storageKeyOf()` — ตัวตนที่*ไม่*เปลี่ยนตามลายเซ็น**
 * · สาเหตุจริงของ ③ ไม่ใช่ *"signed URL แคชไม่ได้"* แต่คือ **cache ถูกคีย์ด้วย URL ทั้งที่ตัวตนคือ path**
 * · โซน `sw.js` เป็นของ P3 — ผมไม่แตะ ผมส่งคีย์ให้
 */

import { supabase } from "../supabase";
import { BOOKING_FILES_BUCKET, storageKeyOf } from "./storageKey";

export { storageKeyOf, BOOKING_FILES_BUCKET } from "./storageKey";

/**
 * 🔴 **TTL สั้นเท่ากันทุกเส้นทาง — มติที่ `ux-flows.md §12.2` บันทึกไว้ (P7 พิสูจน์ · P1 ยืนยัน)**
 *
 * ฉบับแรกผมเขียน `60 * 60` **โดยไม่ได้ไปอ่านมติที่ตัวเองเป็นคนขอให้บันทึก** · P2 จับได้ตอนต่อสาย
 * > `createSignedUrl` **เปิดได้โดยไม่ต้องล็อกอิน ไม่ผ่าน policy เลย**
 * > → **signed URL คือ bearer credential · TTL ยาว = การเก็บ credential ไว้เฉย ๆ**
 * > ไม่ว่าจะเก็บใน state / localStorage / cache
 *
 * 🎯 **1 ชั่วโมง ไม่ได้แปลว่า "หมดอายุใน 1 ชั่วโมง" — มันแปลว่า URL ที่หลุดออกไป
 *    เปิดไฟล์ตั๋วของผู้ใช้ได้อีก 1 ชั่วโมง จากเครื่องไหนก็ได้ ไม่ต้องล็อกอิน**
 * · และมันขัดกับงาน private bucket ทั้งก้อนที่เพิ่งปิดไปเมื่อวาน (`E2-AC5` · `D12`)
 *
 * ⚠️ ทางที่ **ไม่** เอา: ยืด TTL เพื่อให้แคชง่ายขึ้น · ทางที่ถูกคือ **ต่ออายุ** ไม่ใช่ **ยืด**
 */
const DEFAULT_TTL_SECONDS = 90;

/**
 * เซ็นใหม่ก่อนถึงเส้น ไม่ใช่ตอนพัง
 * 🔴 **ต้องน้อยกว่า `DEFAULT_TTL_SECONDS` อย่างมีนัย** ไม่งั้นทุกครั้งที่เรียกจะถือว่าหมดอายุแล้ว
 *    → เซ็นใหม่ทุกครั้ง (ปลอดภัย แต่ยิง `createSignedUrl` ทิ้งเปล่าทุกการ render)
 * · 90s TTL − 30s margin = **หน้าต่างใช้ซ้ำ 60 วินาที** ซึ่งยาวพอสำหรับหนึ่งหน้าจอ
 */
const RENEW_MARGIN_MS = 30_000;

const signed = new Map<string, { url: string; expiresAt: number }>();

/**
 * เซ็น URL ให้ไฟล์เดียว — คืน `null` เมื่อเซ็นไม่ได้ (ไม่มีสิทธิ์ · ไฟล์หาย · ค่าไม่ใช่ของ bucket นี้)
 *
 * 🔴 **`null` ต้องถูกแสดงเป็น "เปิดไม่ได้" ไม่ใช่ถูกกลืนเงียบ ๆ**
 * ของเดิมกลืน error แล้วโชว์รูปแตก — ซึ่งอ่านไม่ออกว่าไฟล์หาย หรือแค่ยังไม่ได้ล็อกอิน
 */
export async function signStoredFile(
  stored: string | null | undefined,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string | null> {
  const key = storageKeyOf(stored);
  if (!key) return null;

  const hit = signed.get(key);
  if (hit && hit.expiresAt - RENEW_MARGIN_MS > Date.now()) return hit.url;

  const { data, error } = await supabase.storage
    .from(BOOKING_FILES_BUCKET)
    .createSignedUrl(key, ttlSeconds);
  if (error || !data?.signedUrl) return null;

  signed.set(key, { url: data.signedUrl, expiresAt: Date.now() + ttlSeconds * 1000 });
  return data.signedUrl;
}

/**
 * เซ็นทีเดียวหลายไฟล์ — คืน map จาก **ค่าที่เก็บไว้เดิม** ไปยัง URL ที่เซ็นแล้ว
 *
 * คีย์เป็นค่าเดิม (ไม่ใช่ path) โดยตั้งใจ: จุดเรียกถือค่าจากคอลัมน์อยู่ในมือ
 * **ถ้าคีย์เป็น path มันต้องแปลงเองอีกรอบ — และนั่นคือจุดที่ครึ่งหนึ่งจะลืมแปลง**
 */
export async function signStoredFiles(
  storedValues: (string | null | undefined)[],
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byKey = new Map<string, string[]>();

  for (const stored of storedValues) {
    const key = storageKeyOf(stored);
    if (!key || !stored) continue;
    const hit = signed.get(key);
    if (hit && hit.expiresAt - RENEW_MARGIN_MS > Date.now()) {
      out.set(stored, hit.url);
      continue;
    }
    const list = byKey.get(key);
    if (list) list.push(stored);
    else byKey.set(key, [stored]);
  }

  const keys = [...byKey.keys()];
  if (keys.length === 0) return out;

  const { data, error } = await supabase.storage
    .from(BOOKING_FILES_BUCKET)
    .createSignedUrls(keys, ttlSeconds);
  if (error || !data) return out;

  const expiresAt = Date.now() + ttlSeconds * 1000;
  for (const row of data) {
    // 🔴 `createSignedUrls` คืน error **รายแถว** — แถวที่พังไม่ทำให้ทั้งชุดพัง
    //    ถ้าไม่ไล่รายแถว ไฟล์ที่หายไปใบเดียวจะทำให้ทั้งหน้าดูเหมือนไม่มีไฟล์เลย
    if (!row.signedUrl || row.error) continue;
    const key = row.path ?? "";
    signed.set(key, { url: row.signedUrl, expiresAt });
    for (const stored of byKey.get(key) ?? []) out.set(stored, row.signedUrl);
  }
  return out;
}

/**
 * ทิ้งลายเซ็นที่แคชไว้ — **ต้องเรียกหลังอัปโหลดทับหรือลบไฟล์**
 *
 * ⚠️ path ของเราฝัง `Date.now()` + สุ่ม จึงแทบไม่ซ้ำ · **แต่ "แทบ" ไม่ใช่ "ไม่"**
 * และเคสที่ซ้ำได้จริงคือ **ลบแล้วอัปโหลดใหม่ในคำสั่งเดียวกัน** ซึ่งเป็นสิ่งที่ `uploadStopPhoto` ทำอยู่
 */
export function forgetSignedFile(stored: string | null | undefined): void {
  const key = storageKeyOf(stored);
  if (key) signed.delete(key);
}

/** ล้างทั้งหมด — ใช้ตอนสลับบัญชี ลายเซ็นผูกกับ session ของคนที่เซ็น */
export function forgetAllSignedFiles(): void {
  signed.clear();
}
