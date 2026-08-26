/**
 * เซ็น URL ของไฟล์ใน `booking-files` **ตอนใช้** ไม่ใช่ตอนเก็บ — `E2-AC13` ② · ③
 * เจ้าของเดิม: P1-Lead · 26 ส.ค. 2026 · กลไก offline (26 ส.ค. 2026, รอบบ่าย): P3-FE/Perf
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
 * ## 🔴 `E2-AC13` ③ (offline) — ตอนนี้แก้ในนี้แล้ว ไม่ใช่ใน `sw.js`
 *
 * ฉบับก่อนหน้าของคอมเมนต์นี้เขียนว่า `sw.js:113,118` (`cacheFirst`/`ASSET_CACHE`) จะทำให้ไฟล์ตั๋ว
 * เปิดออฟไลน์ไม่ได้เพราะ signed URL เปลี่ยนลายเซ็นทุกครั้ง — **ยังจริงอยู่ถ้าแคชด้วย URL ตรง ๆ**
 * แต่ทางที่เลือกจริงคือ**ไม่ให้ signed URL ไปถึง `sw.js`/`<img src>` เลย**:
 *
 * 1. ฟังก์ชันนี้ **`fetch()` เอง** (ไม่ปล่อยให้ `<img src>`/`<a href>` ยิง) — `fetch()` ที่เรียกจากโค้ด
 *    มี `mode: "cors"` เป็นค่าเริ่มต้น (ต่างจาก `<img>`/`<a>` ที่เป็น `no-cors`) → response อ่าน
 *    `status`/`ok` ได้จริง ไม่ใช่ `opaque` — **วัดจริงแล้ว ไม่ใช่สมมติฐาน**: signed URL ของ bucket นี้
 *    ส่ง `Access-Control-Allow-Origin: *` มาจริง (probe ตรงกับ `engine-dev`, 26 ส.ค. 2026)
 * 2. เก็บ `blob` ที่ได้ลง **`Cache Storage`** คีย์ด้วย `storageKeyOf(stored)` — ตัวตนที่ไม่เปลี่ยนตามลายเซ็น
 * 3. คืน `URL.createObjectURL(blob)` ให้ผู้เรียกใช้เป็น `src`/`href` แทน — **สัญญาเดิมของฟังก์ชันนี้
 *    (`Promise<string | null>`) ไม่เปลี่ยน** ไม่มี consumer ไฟล์ไหนต้องแก้
 * 4. เซ็น/fetch ไม่สำเร็จ (ออฟไลน์ หรือหมดสิทธิ์) → ลองอ่านจาก Cache Storage ด้วยคีย์เดียวกันก่อนคืน `null`
 *
 * `sw.js` **ไม่ต้องรู้จักไฟล์ตั๋วเลย** — ไม่มีการเจาะ cross-origin exception เข้า `sw.js:103`
 * (เส้นแบ่ง same-origin/cross-origin ของมันยังอยู่ครบเหมือนเดิม) รายละเอียดเต็มอยู่ที่
 * `docs/engine/frontend-arch.md` §16 (โซน P3)
 *
 * 🔴 **ผลที่ตามมา — `blob:` URL ต้อง `revokeObjectURL()` เมื่อเลิกใช้** ต่างจาก signed URL string เดิม
 * ที่ปล่อยทิ้งได้เฉย ๆ — ดู `forgetSignedFile()`/`forgetAllSignedFiles()` ด้านล่าง
 */

import { supabase } from "../supabase";
import { readCache, writeCache } from "../localCache";
import { BOOKING_FILES_BUCKET, storageKeyOf } from "./storageKey";

export { storageKeyOf, BOOKING_FILES_BUCKET } from "./storageKey";

/**
 * 🔴 **TTL สั้น — มติที่ `ux-flows.md §12.2` บันทึกไว้ (P7 พิสูจน์ · P1 ยืนยัน) ยังใช้เหตุผลเดิม**
 *
 * > `createSignedUrl` **เปิดได้โดยไม่ต้องล็อกอิน ไม่ผ่าน policy เลย**
 * > → **signed URL คือ bearer credential · TTL ยาว = การเก็บ credential ไว้เฉย ๆ**
 *
 * ต่างจากรอบก่อนตรงที่ตอนนี้ signed URL **ไม่เคยหลุดออกจากฟังก์ชันนี้เลย** — ใช้ยิง `fetch()` ครั้งเดียว
 * แล้วทิ้ง ไม่ถูกเก็บ ไม่ถูกส่งต่อ ไม่ถูกใส่ใน `<img src>` ตรง ๆ อีกต่อไป → เหตุผลของ TTL สั้นยังเหมือนเดิม
 * (ยิ่งสั้นยิ่งดีเพราะยิ่งลดหน้าต่างที่ bearer credential นี้มีชีวิตอยู่) **ลดจาก 90s เหลือ 30s** ให้ตรงกับ
 * `INTERNAL_SIGN_SECONDS` ของ `/api/booking-file/[...path]/route.ts` (แม้ route นั้นจะไม่มีใครเรียกจาก UI
 * แล้วตาม §16 — ใช้เลขเดียวกันไว้เผื่อทั้งสองจุดถูกอ้างอิงเทียบกันในอนาคต)
 */
const SIGN_TTL_SECONDS = 30;

/** ชื่อ Cache Storage — flat ก่อน `E6-AC6` (ยังไม่มี tripId ให้ scope ตาม `docs/engine/frontend-arch.md` §11) */
const CACHE_NAME = "booking-files-v1";

/**
 * 🔴 **เพดานจำนวนไฟล์ที่แคชไว้ — กันโควตาเต็มก่อนที่มันจะเกิดตอนออฟไลน์ (P1 ขอ, จุด ③)**
 *
 * ไฟล์ตั๋ว/ใบเสร็จต่อทริปนับเป็นหลักหน่วยถึงหลักสิบ (ดู comment ใน `db.ts` เรื่อง custom_places
 * ขนาดใกล้เคียงกัน) · 40 ให้พื้นที่พอสำหรับหลายทริปพร้อมกันโดยไม่ปล่อยให้โตไม่มีขอบเขต
 * — เป็นตัวเลขที่เลือกจากลักษณะการใช้งาน ไม่ใช่ขีดจำกัดทางเทคนิคของ Cache Storage เอง
 */
const MAX_CACHED_FILES = 40;

/** LRU index ของไฟล์ที่แคชไว้ — เก็บใน localStorage (ผ่าน `lib/localCache.ts` เดิม) ไม่ใช่ IndexedDB ใหม่
 *  ตามที่ตัดสินไว้ใน `docs/engine/frontend-arch.md` §13 (Cache Storage/IndexedDB ไม่ต่างกันด้าน quota)
 *  — ไฟล์นี้เก็บแค่ metadata เล็ก ๆ (key + เวลาที่ใช้ล่าสุด) ไม่ใช่ตัวไฟล์ */
const CACHE_INDEX_KEY = "bookingFileCacheIndex";

type CacheIndexEntry = { key: string; lastUsed: number };

function loadCacheIndex(): CacheIndexEntry[] {
  return readCache<CacheIndexEntry[]>(CACHE_INDEX_KEY) ?? [];
}

function saveCacheIndex(entries: CacheIndexEntry[]): void {
  writeCache(CACHE_INDEX_KEY, entries);
}

/** ทำเครื่องหมายว่าคีย์นี้เพิ่งถูกใช้ แล้วเบียดของเก่าที่สุดออกถ้าเกินเพดาน */
async function touchCacheIndex(key: string, cache: Cache): Promise<void> {
  const entries = loadCacheIndex().filter((e) => e.key !== key);
  entries.unshift({ key, lastUsed: Date.now() });
  while (entries.length > MAX_CACHED_FILES) {
    const evicted = entries.pop();
    if (evicted) await cache.delete(cacheRequestFor(evicted.key));
  }
  saveCacheIndex(entries);
}

/** เบียดของเก่าที่สุดออก `count` ตัว — เรียกตอน `cache.put()` ชน `QuotaExceededError` */
async function evictOldest(cache: Cache, count: number): Promise<void> {
  const entries = loadCacheIndex();
  const toEvict = entries.slice(-count);
  for (const e of toEvict) await cache.delete(cacheRequestFor(e.key));
  saveCacheIndex(entries.slice(0, Math.max(0, entries.length - count)));
}

/** คีย์แคชสังเคราะห์ — ไม่ใช่ URL ที่ fetch ได้จริง มีไว้แค่เป็นคีย์ของ `Cache`/`caches.match()` */
function cacheRequestFor(key: string): Request {
  return new Request(`https://booking-files.local/${encodeURIComponent(key)}`);
}

/** อ่านจาก Cache Storage ด้วยคีย์ที่เสถียร — คืน object URL ถ้าเคยแคชไว้ ไม่งั้น `null` */
async function readFromCache(key: string): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheRequestFor(key));
  if (!cached) return null;
  return URL.createObjectURL(await cached.blob());
}

/**
 * ยิง `fetch()` เอง (ไม่ใช่ผ่าน `<img src>`) แล้วเก็บผลลง Cache Storage คีย์ด้วย `key` ที่เสถียร
 * คืน object URL เสมอถ้า fetch สำเร็จ — ไม่สำเร็จ (ออฟไลน์/หมดสิทธิ์) ให้ลอง Cache Storage เดิมก่อนคืน `null`
 */
async function fetchCacheAndGetObjectUrl(key: string, signedUrl: string): Promise<string | null> {
  let blob: Blob;
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`booking file fetch ${res.status}`);
    blob = await res.blob();
  } catch {
    return readFromCache(key);
  }

  if (typeof caches !== "undefined") {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.put(cacheRequestFor(key), new Response(blob, { headers: { "Content-Type": blob.type } }));
      await touchCacheIndex(key, cache);
    } catch {
      // 🔴 `QuotaExceededError` (P1 ขอให้กันไว้) — เบียดครึ่งเก่าที่สุดออกแล้วลองอีกครั้งเดียว
      try {
        await evictOldest(cache, Math.ceil(MAX_CACHED_FILES / 2));
        await cache.put(cacheRequestFor(key), new Response(blob, { headers: { "Content-Type": blob.type } }));
        await touchCacheIndex(key, cache);
      } catch {
        // ยังพังอยู่ — ปล่อยผ่าน ผู้ใช้ยังเห็นไฟล์ตอนนี้ได้ (คืน object URL ปกติด้านล่าง)
        // แค่ไม่มีสำเนาออฟไลน์รอบนี้ ดีกว่าทำให้การแสดงไฟล์ตอนออนไลน์พังไปด้วย
      }
    }
  }

  return URL.createObjectURL(blob);
}

/** `key` → object URL ที่ใช้อยู่ตอนนี้ในหน้านี้ — **ต้อง `revokeObjectURL` ก่อนแทนที่/ลบทุกครั้ง** */
const signed = new Map<string, string>();

/**
 * เซ็น URL ให้ไฟล์เดียว แล้วคืน **object URL** ที่ fetch แล้วแคชไว้แล้ว — คืน `null` เมื่อเปิดไม่ได้เลย
 * (ไม่มีสิทธิ์ · ไฟล์หาย · ค่าไม่ใช่ของ bucket นี้ · ออฟไลน์และไม่เคยแคชไว้)
 *
 * 🔴 **`null` ต้องถูกแสดงเป็น "เปิดไม่ได้" ไม่ใช่ถูกกลืนเงียบ ๆ**
 * ของเดิมกลืน error แล้วโชว์รูปแตก — ซึ่งอ่านไม่ออกว่าไฟล์หาย หรือแค่ยังไม่ได้ล็อกอิน
 */
export async function signStoredFile(
  stored: string | null | undefined,
  ttlSeconds: number = SIGN_TTL_SECONDS
): Promise<string | null> {
  const key = storageKeyOf(stored);
  if (!key) return null;

  // object URL ไม่หมดอายุแบบ signed URL — มีแล้วในหน้านี้ใช้ต่อได้เลย ไม่ต้องเซ็น/fetch ซ้ำ
  const hit = signed.get(key);
  if (hit) return hit;

  const { data, error } = await supabase.storage.from(BOOKING_FILES_BUCKET).createSignedUrl(key, ttlSeconds);
  if (error || !data?.signedUrl) {
    // เซ็นไม่ได้ (ออฟไลน์/ไม่มีสิทธิ์แล้ว/ไฟล์หาย) — ยังลองของที่เคยแคชไว้ตอนออนไลน์ก่อนยอมแพ้
    return readFromCache(key);
  }

  const objectUrl = await fetchCacheAndGetObjectUrl(key, data.signedUrl);
  if (objectUrl) signed.set(key, objectUrl);
  return objectUrl;
}

/**
 * เซ็นทีเดียวหลายไฟล์ — คืน map จาก **ค่าที่เก็บไว้เดิม** ไปยัง object URL
 *
 * คีย์เป็นค่าเดิม (ไม่ใช่ path) โดยตั้งใจ: จุดเรียกถือค่าจากคอลัมน์อยู่ในมือ
 * **ถ้าคีย์เป็น path มันต้องแปลงเองอีกรอบ — และนั่นคือจุดที่ครึ่งหนึ่งจะลืมแปลง**
 */
export async function signStoredFiles(
  storedValues: (string | null | undefined)[],
  ttlSeconds: number = SIGN_TTL_SECONDS
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byKey = new Map<string, string[]>();

  for (const stored of storedValues) {
    const key = storageKeyOf(stored);
    if (!key || !stored) continue;
    const hit = signed.get(key);
    if (hit) {
      out.set(stored, hit);
      continue;
    }
    const list = byKey.get(key);
    if (list) list.push(stored);
    else byKey.set(key, [stored]);
  }

  const keys = [...byKey.keys()];
  if (keys.length === 0) return out;

  const { data, error } = await supabase.storage.from(BOOKING_FILES_BUCKET).createSignedUrls(keys, ttlSeconds);
  if (error || !data) {
    // เซ็นทั้งชุดไม่ได้ (ออฟไลน์ตอนขอ) — ยังลองรายไฟล์จาก Cache Storage ก่อนปล่อยว่าง
    for (const [key, storedList] of byKey) {
      const cached = await readFromCache(key);
      if (!cached) continue;
      signed.set(key, cached);
      for (const stored of storedList) out.set(stored, cached);
    }
    return out;
  }

  for (const row of data) {
    // 🔴 `createSignedUrls` คืน error **รายแถว** — แถวที่พังไม่ทำให้ทั้งชุดพัง
    //    ถ้าไม่ไล่รายแถว ไฟล์ที่หายไปใบเดียวจะทำให้ทั้งหน้าดูเหมือนไม่มีไฟล์เลย
    const key = row.path ?? "";
    const storedList = byKey.get(key) ?? [];
    if (!row.signedUrl || row.error) {
      const cached = await readFromCache(key);
      if (cached) {
        signed.set(key, cached);
        for (const stored of storedList) out.set(stored, cached);
      }
      continue;
    }
    const objectUrl = await fetchCacheAndGetObjectUrl(key, row.signedUrl);
    if (!objectUrl) continue;
    signed.set(key, objectUrl);
    for (const stored of storedList) out.set(stored, objectUrl);
  }
  return out;
}

/**
 * ทิ้งลายเซ็นที่แคชไว้ — **ต้องเรียกหลังอัปโหลดทับหรือลบไฟล์**
 *
 * ⚠️ path ของเราฝัง `Date.now()` + สุ่ม จึงแทบไม่ซ้ำ · **แต่ "แทบ" ไม่ใช่ "ไม่"**
 * และเคสที่ซ้ำได้จริงคือ **ลบแล้วอัปโหลดใหม่ในคำสั่งเดียวกัน** ซึ่งเป็นสิ่งที่ `uploadStopPhoto` ทำอยู่
 *
 * 🔴 **ต้อง `revokeObjectURL()` ที่นี่ด้วย** — object URL ยึด blob ไว้ในหน่วยความจำจนกว่าจะถูก revoke
 * หรือปิดแท็บ ต่างจาก signed URL string เดิมที่ปล่อยทิ้งเฉย ๆ ได้ (P1 ชี้ไว้ก่อนอนุมัติ)
 */
export function forgetSignedFile(stored: string | null | undefined): void {
  const key = storageKeyOf(stored);
  if (!key) return;

  const url = signed.get(key);
  if (url) URL.revokeObjectURL(url);
  signed.delete(key);

  saveCacheIndex(loadCacheIndex().filter((e) => e.key !== key));
  if (typeof caches !== "undefined") {
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.delete(cacheRequestFor(key)))
      .catch(() => {});
  }
}

/**
 * ล้างทั้งหมด — ใช้ตอนสลับบัญชี ลายเซ็นผูกกับ session ของคนที่เซ็น
 *
 * ⚠️ **ล้างแค่ object URL ในหน่วยความจำของหน้านี้ ไม่ล้าง Cache Storage ทั้งก้อน** — ตั้งใจ:
 * Cache Storage เป็นของ origin ไม่ใช่ของ session (เหมือนที่ `docs/engine/frontend-arch.md` §10 ชี้ไว้
 * เรื่อง `localStorage` cache ที่ไม่ผูก user) แต่คีย์ที่นี่คือ path ที่มี `Date.now()` + สุ่มฝังอยู่
 * — ชนกันข้าม user ได้แค่ในทางทฤษฎี ไม่ใช่ในทางปฏิบัติ (ต้องเดา path เป๊ะทั้งเส้นถึงจะอ่านได้)
 * ต่างจาก §10 ที่ key เป็น `planId`/flat ซึ่งชนกันได้จริงและง่าย — ความเสี่ยงคนละระดับกัน จึงไม่ล้างทิ้ง
 */
export function forgetAllSignedFiles(): void {
  for (const url of signed.values()) URL.revokeObjectURL(url);
  signed.clear();
}
