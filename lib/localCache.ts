import { noteCacheFailure } from "@/lib/engine/cacheGuard";
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

/**
 * 🔴 **`E6-AC7` ครึ่งฝั่งนักพัฒนา — ที่นี่เคยเงียบสนิท ทั้งที่ backlog ติ๊กว่าปิดแล้ว** (P1 · 2 ก.ย. 2026)
 *
 * `backlog` เขียนว่าครึ่งนี้ปิดโดย `cacheGuard.test.ts` · **แต่ไฟล์นั้นทดสอบ `noteCacheFailure`
 * *ในฐานะฟังก์ชัน* — ไม่ได้ทดสอบว่ามีใครเรียกมันตรงจุดที่สำคัญ** และ `localCache.ts`
 * **ไม่เคยอยู่ในรายชื่อผู้เรียกเลย** (ผู้เรียกจริงคือ route แคช + hooks ของแพลตฟอร์ม)
 * 🎯 ***ด่านที่ทดสอบเครื่องมือ ไม่ได้ทดสอบการใช้เครื่องมือ*** — และแคชในเครื่องคือที่ที่โควตาเต็มจริง
 *
 * ## ทำไมความเงียบตรงนี้แพงกว่าที่อื่น
 * `localStorage` เต็ม → `setItem` โยน → เดิมกลืนทิ้ง → **ผู้ใช้เปิดออฟไลน์แล้วข้อมูลไม่ครบ
 * โดยไม่มีอะไรบอกสาเหตุ** · และมันไม่หายเอง (`D17` — เพดาน ~5 MB ไม่มีทางออกแบบ native อีกแล้ว)
 *
 * 📌 **ยังไม่ใช่ครึ่งฝั่งผู้ใช้** — `onCacheFull` ข้างล่างคือ *ตะขอ* ให้ UI มาเกาะ · ตัว UI เป็นโซน P2
 */
type CacheFullListener = (key: string) => void;
const cacheFullListeners = new Set<CacheFullListener>();

/**
 * บอกเมื่อเขียนแคชไม่ลงเพราะที่เก็บเต็ม · คืนฟังก์ชันถอนการสมัคร
 * 🔴 **มีไว้ให้ UI บอกผู้ใช้ — ไม่ใช่ให้ log** · `console.error` ครอบเฉพาะฝั่งนักพัฒนา
 */
export function onCacheFull(listener: CacheFullListener): () => void {
  cacheFullListeners.add(listener);
  return () => void cacheFullListeners.delete(listener);
}

/** เคยเขียนไม่ลงเพราะเต็มไหม — สำหรับ UI ที่ mount ทีหลังกว่าตอนที่มันเกิด */
let cacheEverFull = false;
export function hasCacheEverBeenFull(): boolean {
  return cacheEverFull;
}

/** สำหรับเทสต์ — คืนสภาพให้เคสถัดไปเริ่มจากศูนย์ */
export function resetCacheFullState(): void {
  cacheEverFull = false;
  cacheFullListeners.clear();
}

export function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  sweepLegacyCaches();
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    // 🔴 **ไม่กลืนเงียบอีกต่อไป** — ฝั่งนักพัฒนาได้ยินผ่าน `noteCacheFailure`
    //    (ดังครั้งเดียวต่อจุด ไม่ใช่ทุกคำขอ) · ฝั่งผู้ใช้ได้ยินผ่าน `onCacheFull`
    noteCacheFailure("localStorage/write", {
      code: (err as { name?: string } | null)?.name,
      message: (err as { message?: string } | null)?.message,
    });
    cacheEverFull = true;
    for (const l of cacheFullListeners) l(key);
  }
}

/** ลบคีย์เดียวทิ้ง — ใช้ตอนค่าที่แคชไว้ใช้ไม่ได้แล้ว (เช่น `lastTripId` ที่ถูกถอนสิทธิ์) ไม่ใช่แค่ "ยังไม่มี" */
export function clearCache(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // localStorage ถูกปิด — ไม่มีอะไรให้ลบ
  }
}

/**
 * 🔴 **คีย์ที่ผูกกับทริป — ต้องผ่านทางนี้เท่านั้น** (P3 วัดเจอ · P1 ลง · 28 ส.ค. 2026)
 *
 * ## ของที่รั่วจริง และมันไม่ใช่แคชค้างเฉย ๆ
 * `hotels` · `bookings` · `customPlaces` · `overnightOverrides` · `plans` **คีย์ไม่มี `tripId`**
 * และ hook พวกนี้ `setState(cached)` **แล้ว** `setLoaded(true)` ทันที (เช่น `useHotels.tsx:89-92`)
 * → สลับทริป A → B **ผู้ใช้เห็นที่พัก/ตั๋ว/สถานที่/แผนของ A โผล่เป็นของ B** จนกว่า fetch จะกลับมาทับ
 * 🔴 **ตอนออฟไลน์ไม่มีอะไรมาทับ = เห็นของผิดทริปค้างถาวร**
 *
 * ## 🎯 `E6-AC6` เขียนว่าเป็นเรื่องของ service worker — **ชี้ผิดใบ** (P3 วัดทั้ง 3 cache แล้ว)
 * `DATA_CACHE` เป็นข้อมูลอ้างอิงสาธารณะ (place/พิกัด/วันที่ ไม่มี `tripId`) · `ASSET_CACHE` เป็น build asset
 * · `SHELL_CACHE` คีย์ด้วย URL ซึ่ง `/trip/A` กับ `/trip/B` แยกกันอยู่แล้ว
 * → **ใส่ `tripId` ลงชื่อ cache ของ SW ได้ความซับซ้อนเพิ่มโดยไม่ปิดอะไรเลย**
 *
 * ## กติกาของคีย์ในไฟล์นี้ — สามชนิด แยกกันจริง
 * ```
 * ผูกทริป   ต้องใช้ readTripCache/writeTripCache        hotels · bookings · customPlaces · overnightOverrides · plans
 * ผูกแผน    `xxx:{planId}` — planId เป็น uuid ไม่ซ้ำข้ามทริป  stops · daySettings · placeNotes
 * global    ตั้งใจให้ข้ามทริป                              lastTripId · ดัชนีไฟล์ที่แคชไว้
 * ```
 * ⚠️ **ชนิดที่สามต้องเขียนเหตุผลไว้ทุกครั้ง** — ไม่งั้นคีย์ที่ลืมใส่ scope จะแยกไม่ออกจากคีย์ที่ตั้งใจ global
 */
export function tripCacheKey(tripId: string, name: string): string {
  return `trip:${tripId}:${name}`;
}

export function readTripCache<T>(tripId: string, name: string): T | null {
  return readCache<T>(tripCacheKey(tripId, name));
}

export function writeTripCache(tripId: string, name: string, value: unknown): void {
  writeCache(tripCacheKey(tripId, name), value);
}

export function clearTripCache(tripId: string, name: string): void {
  clearCache(tripCacheKey(tripId, name));
}

/**
 * 🔴 **กวาดแคชทั้งหมดของแอป — ใช้ตอน *ออกจากระบบ* เท่านั้น** (P2 เจอ · P1 ลง · 28 ส.ค. 2026)
 *
 * ## ช่องที่มีไว้ปิด
 * `signOut()` เดิมเรียกแค่ `auth.signOut()` → **แคชของผู้ใช้คนก่อนยังอยู่บนเครื่องทุกคีย์**
 * และแอป **hydrate จากแคชก่อน fetch เสมอ** (`useStops.ts` เขียนไว้เอง)
 * → **คนถัดไปที่เปิดเครื่องนั้นเห็นเฟรมแรกเป็นข้อมูลของคนก่อน** · ออฟไลน์จะเห็นค้างไปเลย
 * · ของที่ค้าง: `hotels` `bookings` `customPlaces` `overnightOverrides` `plans` `days`
 *   `catalogCities` `daySettings:*` `stops:*` `placeNotes:*` `lastTripId`
 *
 * ## ⚠️ ต่างจาก `sweepLegacyCaches()` ตรงที่อันนั้นกวาดเฉพาะ **คีย์รุ่นเก่า**
 * (`trip-cache:` ที่ไม่ใช่ `v2`) — **คีย์ปัจจุบันไม่เคยถูกกวาดเลย** จนถึงวันนี้
 *
 * 🔴 **กวาด `LEGACY_PREFIX` ด้วย ไม่ใช่แค่ `PREFIX`** — ถ้ากวาดแค่รุ่นปัจจุบัน
 *    ของรุ่นเก่าที่ `sweepLegacyCaches` ยังไม่ได้เก็บ (เพราะยังไม่มีใครเรียก `readCache`) จะรอดข้ามบัญชี
 */
export function clearAllCaches(): void {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LEGACY_PREFIX)) doomed.push(k);
    }
    for (const k of doomed) window.localStorage.removeItem(k);
  } catch {
    // localStorage ถูกปิด — ไม่มีอะไรให้กวาด
  }
}

/** 🔴 เปิดให้เทสต์เท่านั้น — ด่านที่ไม่มีเคสด้านบวก คือด่านที่ไม่มีใครรู้ว่ายังทำงานอยู่ไหม */
export const __cachePrefixForTests = PREFIX;
