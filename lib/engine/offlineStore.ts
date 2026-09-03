/**
 * `offlineStore` — ที่เก็บออฟไลน์บน IndexedDB · `E6-AC7` (`D17`)
 * เจ้าของ: P7-Mobile · 28 ส.ค. 2026 · **P1 ถือ `lib/localCache.ts` · ไฟล์นี้ไม่แตะไฟล์นั้น**
 *
 * ## ทำไมต้องย้าย — สามข้อ ไม่ใช่ข้อเดียว
 * 1. **เพดาน ~5 MB ของ `localStorage`** — `D17` เกิดเพราะข้อนี้ · หลาย ๆ ทริปชนเพดานได้จริง
 * 2. 🔴 **`localStorage` เก็บไฟล์ไม่ได้เลย ไม่ใช่เก็บได้น้อย** — ตั๋วที่ต้องเปิดตอนไม่มีสัญญาณต้องเป็น
 *    `Blob` (`mobile-arch.md §11.15`) · เมื่อ bucket เป็น private แล้ว **signed URL หมดอายุ เก็บ URL ไม่ได้**
 *    → เก็บ *ไฟล์* ไม่ใช่ *ลิงก์* · IndexedDB เก็บ `Blob` ตรง ๆ ได้
 * 3. **sync/blocking** — `localStorage` บล็อก main thread ทุกครั้งที่อ่าน/เขียน
 *
 * ## 🔴 และข้อที่ตอบคำถามที่ P1 ถามตรง ๆ: `clearAllCaches` ควรเป็นแบบไหน
 * วันนี้มีสองทางและ **ทั้งคู่คือรายการที่ต้องมีคนดูแล**:
 * · *ล้างเฉพาะที่ขึ้นต้นด้วย `trip-cache:`* → **ของที่ลืมย้ายเข้า prefix จะรอด** (ชื่อพาสปอร์ต · `trip-who` เคยรอดมาแล้ว)
 * · *ล้างทุกอย่างยกเว้นรายการ* (P3 เสนอ · P1 ปฏิเสธ) → **ของที่ลืมใส่รายการจะถูกลบ** รวม `sb-*`
 *   → `auth.signOut()` เพิกถอน session ฝั่งเซิร์ฟเวอร์ไม่ได้ **และเงียบสนิท**
 *
 * 🎯 **ทางที่สาม: เลิกใช้รายการ — แยก *เนมสเปซ* แทน**
 * `localStorage` เป็นถังแบนใบเดียวที่ทุกคนใช้ร่วมกัน **นั่นคือสาเหตุที่ทั้งสองทางต้องมีรายการ**
 * IndexedDB มี **ฐานแยกที่ตั้งชื่อได้** → ข้อมูลของแอปอยู่ฐานเดียว → `clearAll()` = ลบทั้งฐาน
 * · **ไม่มีรายการให้ลืม ไม่มี prefix ให้พลาด**
 * · ✅ **`sb-*` ปลอดภัยโดยโครงสร้าง ไม่ใช่โดยกติกา** — `createClient` ของ `supabase-js` เก็บ session
 *   ไว้ใน `localStorage` ตามค่าเริ่มต้น (`lib/supabase.ts:10` ไม่ได้ตั้ง `storage` เอง)
 *   **`deleteDatabase()` เอื้อมไปไม่ถึงตามนิยาม**
 * · 🔴 **กติกาข้อเดียวที่เหลือ และตรวจได้:** *auth อยู่ `localStorage` · ข้อมูลเราอยู่ IndexedDB · ห้ามปน*
 *   — ถ้ามีใครตั้ง `storage` ของ `createClient` ให้ชี้มาที่นี่เมื่อไหร่ ข้อได้เปรียบนี้หายทันที
 * · 📌 และ `hooks/personalLocalValue.ts` (ชื่อพาสปอร์ต · P2) **ย้ายมาที่นี่แล้วกับดักปิดเอง** —
 *   ไม่ต้องจำว่าต้องอยู่ใต้ prefix ไหน เพราะมันอยู่ในฐานที่ถูกลบทั้งใบ
 *
 * ## 🔴 เวอร์ชันอยู่ใน *ชื่อฐาน* ไม่ใช่ในค่า
 * `mobile-arch.md §12.3` กำหนดว่าที่เก็บต้องประทับ *ที่มา* และ **ล้างก่อนอ่านครั้งแรก** ไม่ใช่หลัง
 * (ไม่งั้น hydrate จะวาดข้อมูลรูปเก่าออกมาก่อน) · **ใส่เวอร์ชันในชื่อฐานทำให้ข้อนั้นเป็นจริงโดยโครงสร้าง:**
 * ข้อมูลรูปเก่าอยู่คนละฐาน → **อ่านไม่เจอเพราะไม่เคยเปิดฐานนั้น** ไม่ใช่เพราะมีใครจำได้ว่าต้องล้าง
 *
 * ## ⚠️ สิ่งที่ไฟล์นี้ **ไม่** ทำตามแบบของเดิม: กลืน error เงียบ
 * `writeCache` ของ `localCache` กลืน quota error **โดยตั้งใจ** (เขียนกำกับไว้เอง) — ผลคือแคชเขียนไม่ลง
 * โดยไม่มีใครรู้ · `set()` ที่นี่ **คืน `false`** แล้วให้ผู้เรียกตัดสินว่าจะบอกผู้ใช้ไหม
 * 🎯 หลักเดียวกับ `writeGuard`: *พังแล้วต้องมีเสียง* — ต่างกันแค่ที่นี่เป็นฝั่งอ่าน/เขียนเครื่อง
 */

/** 🔴 ขึ้นเลขนี้ = ข้อมูลเก่าทั้งหมดถูกทิ้งโดยไม่ต้องเขียนโค้ดล้าง (อยู่คนละฐาน) */
const SCHEMA_VERSION = 1;
const DB_NAME = `plan-korea:v${SCHEMA_VERSION}`;
const STORE = "kv";

/**
 * `backend_id` — **ฐานไหนเป็นคนให้ข้อมูลชุดนี้มา** (`§12.3`)
 * ตอน `E7` ทยอยย้ายทีละกลุ่มเชื่อมโยง เครื่องหนึ่งข้ามเส้นตอนไหนก็ได้ **รวมทั้งตอนออฟไลน์**
 * → ของเก่าไม่ใช่ "เก่า" **มันคือของจากอีกระบบ** · ต่างเมื่อไหร่ = ล้างทิ้ง ห้าม merge
 */
const BACKEND_ID_KEY = "__backend_id";

type Stamped<T> = { v: T; at: number };

function idb(): IDBFactory | null {
  if (typeof indexedDB === "undefined") return null;
  return indexedDB;
}

let openPromise: Promise<IDBDatabase | null> | null = null;

/**
 * 🔴 **จำเฉพาะ *ความสำเร็จ* — ความล้มเหลวต้องลองใหม่รอบหน้า** (P3 ชี้ · 3 ก.ย. 2026)
 *
 * ของเดิมจำ `openPromise` ไว้ทุกกรณี ⇒ **ล้มครั้งเดียว = หน้านั้นไม่มีแคชตลอดกาล และเงียบ**
 * · 🎯 **จังหวะที่ล้มง่ายที่สุดคือจังหวะที่ *ตัวกู้* ทำงานพอดี** — `onblocked` เกิดเมื่อมีแท็บอื่นเปิดฐาน
 *   ที่เวอร์ชันเก่าค้างอยู่ **และนั่นคือเงื่อนไขเดียวกับที่พาให้ต้องกู้ตั้งแต่แรก** (แท็บค้าง · `deleteDatabase` ที่ถูก block)
 * · ⚠️ **อาการอ่านเหมือน "แคชว่าง" อีกครั้ง** — คลาสเดียวกับสองบั๊กก่อนหน้าในไฟล์นี้ **แค่มาจากทางที่สาม**
 * 🔴 **ที่แย่ที่สุด: สภาพชั่วคราวถูกทำให้ถาวร** — แท็บอื่นปิดไปแล้วก็ยังไม่กลับมา เพราะไม่มีใครลองใหม่
 *
 * ✅ ราคาที่จ่าย: เปิดฐานซ้ำทุกครั้งที่อ่านแล้วเปิดไม่ได้ · **ยอมรับได้เพราะทุกทางล้มเร็ว**
 * (`idb()` เป็น `null` → คืนทันที · `onerror`/`onblocked` → resolve ทันที ไม่ค้าง)
 * · 📌 **ระหว่างที่ยัง pending ยังแชร์ promise เดิม** — ผู้อ่านหลายตัวพร้อมกันจึงไม่ยิง open ซ้อนกัน
 */
function open(): Promise<IDBDatabase | null> {
  if (openPromise) return openPromise;
  const attempt: Promise<IDBDatabase | null> = new Promise((resolve) => {
    const factory = idb();
    // ⚠️ ไม่มี IndexedDB (SSR · โหมดส่วนตัวบางตัว · เบราว์เซอร์ปิดที่เก็บ) → คืน `null`
    //    **ผู้เรียกต้องยังทำงานได้ตอนออนไลน์** — ที่เก็บหายไม่ใช่เหตุให้แอปพัง
    if (!factory) return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      /**
       * 🔴 **เปิด *โดยไม่ระบุเวอร์ชัน* โดยตั้งใจ — และนี่คือบั๊กที่ตัวกู้ข้างล่างสร้างขึ้นเอง** (P7 · 3 ก.ย. 2026)
       *
       * เดิมเขียน `factory.open(DB_NAME, 1)` · พอตัวกู้ bump ฐานเป็น v2 แล้ว **รอบโหลดถัดไปขอ v1 กับฐาน v2**
       * → `VersionError` → `onerror` → `resolve(null)` ⇒ **`get()` คืน `null` ทุกคีย์ ทั้งที่ข้อมูลอยู่ครบ**
       * 🎯 **อาการเหมือน "แคชว่าง" เป๊ะ — คือสภาพเดียวกับบั๊กที่เราเพิ่งแก้ แค่มาจากคนละทาง**
       * · ⚠️ **จับได้เพราะยิงออฟไลน์จริงหลังแก้ ไม่ใช่เพราะรีวิว** — โหลดออนไลน์รอบแรกยังเขียวสนิท
       *   (ตัวกู้ทำงานในรอบนั้นเอง · ความพังโผล่ *รอบถัดไป*)
       * ✅ ไม่ระบุเวอร์ชัน = เปิดเวอร์ชันที่มีอยู่จริง · ฐานที่ยังไม่เคยมี → สร้างที่ v1 พร้อมยิง `onupgradeneeded`
       */
      req = factory.open(DB_NAME);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    /**
     * 🔴 **ฐานที่ *มีอยู่แล้ว* ที่เวอร์ชันเดียวกัน แต่ *ไม่มี object store* — กู้เองตรงนี้** (P3 เจอ · 3 ก.ย. 2026)
     *
     * `onupgradeneeded` ยิงเมื่อ **เวอร์ชันที่เก็บไว้ < เวอร์ชันที่ขอ** เท่านั้น
     * ⇒ ฐานที่ค้างที่ v1 โดยไม่มี `kv` จะเข้า `onsuccess` **แล้วเราคืน db ที่ใช้ไม่ได้**
     * → `tx()` โยน `NotFoundError` → ถูก `catch` → คืน `null`
     * 🎯 **ผู้เรียกอ่าน `null` ว่า *"แคชยังว่าง"* — แยกไม่ออกจากแคชว่างตามปกติ**
     * ⇒ **แคชออฟไลน์ตายถาวร เงียบสนิท และ *ไม่มีเส้นทางกลับในโค้ด***
     *
     * ## ไม่ใช่แค่เครื่องทดสอบ
     * ผู้ใช้จริงเข้าสภาพนี้ได้จาก upgrade ที่ถูกขัดกลางคัน · storage eviction ระหว่าง upgrade ·
     * หรือ `deleteDatabase` ที่ถูก block แล้วทำครึ่ง ๆ — **ทางหลังคือทางที่ P7 เข้ามาเองตอนยิงเคสควบคุมของ `E6-AC4`**
     *
     * ## ✅ ท่าที่ใช้: เปิดใหม่ที่ `version + 1` — **ไม่ลบข้อมูล**
     * `onupgradeneeded` รอบสองยิงแน่นอนเพราะเวอร์ชันสูงขึ้น แล้วสร้าง store ให้
     * · 🔴 **ไม่ใช้ `deleteDatabase`** — มันค้างเป็น `blocked` ได้เมื่อมีแท็บอื่นเปิดอยู่ **ซึ่งคือทางที่พาเรามาที่นี่ตั้งแต่แรก**
     * · ⚠️ รอบสองล้มก็คืน `null` เหมือนเดิม — **ไม่ทำให้แย่ลงกว่าเดิม**
     */
    req.onsuccess = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) return resolve(db);

      const bumped = db.version + 1;
      db.close();
      let retry: IDBOpenDBRequest;
      try {
        retry = factory.open(DB_NAME, bumped);
      } catch {
        return resolve(null);
      }
      retry.onupgradeneeded = () => {
        if (!retry.result.objectStoreNames.contains(STORE)) retry.result.createObjectStore(STORE);
      };
      retry.onsuccess = () => resolve(retry.result.objectStoreNames.contains(STORE) ? retry.result : null);
      retry.onerror = () => resolve(null);
      retry.onblocked = () => resolve(null);
    };
    req.onerror = () => resolve(null);
    // 🔴 `blocked` เกิดเมื่อมีแท็บอื่นเปิดฐานรุ่นเก่าค้างอยู่ — **ปล่อยค้างคือ promise ที่ไม่ resolve**
    //    ซึ่งจะกลายเป็นหน้าจอ "กำลังโหลด" ตลอดกาล · คืน `null` แล้วให้แอปเดินต่อแบบไม่มีแคช
    req.onblocked = () => resolve(null);
  });

  // 🔴 จำไว้ระหว่าง pending (กันเปิดซ้อน) · **แต่ทิ้งทันทีถ้าผลเป็น `null`** เพื่อให้รอบหน้าลองใหม่
  openPromise = attempt.then((db) => {
    if (db === null) openPromise = null;
    return db;
  });
  return openPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        let request: IDBRequest;
        try {
          request = run(db.transaction(STORE, mode).objectStore(STORE));
        } catch {
          return resolve(null);
        }
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => resolve(null);
      })
  );
}

/** อ่านค่า · `null` = ไม่มี **หรือ** อ่านไม่ได้ — ผู้เรียกที่ต้องแยกสองอย่างนี้ต้องถามด้วยวิธีอื่น */
export async function get<T>(key: string): Promise<T | null> {
  const row = await tx<Stamped<T>>("readonly", (s) => s.get(key));
  return row ? row.v : null;
}

/**
 * เขียนค่า · **คืน `false` เมื่อเขียนไม่ลง** (โควตาเต็ม · ที่เก็บถูกปิด · ฐานเปิดไม่ได้)
 * 🔴 **ผู้เรียกต้องดูค่าที่คืน** — ถ้าไม่ดู เราได้พฤติกรรมเดียวกับ `writeCache` ที่กลืนเงียบ
 */
export async function set(key: string, value: unknown): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    let request: IDBRequest;
    try {
      const stamped: Stamped<unknown> = { v: value, at: Date.now() };
      request = db.transaction(STORE, "readwrite").objectStore(STORE).put(stamped, key);
    } catch {
      return resolve(false);
    }
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

export async function del(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}

/**
 * ล้างทุกอย่างของแอป — **ลบทั้งฐาน ไม่ใช่ไล่ลบทีละคีย์**
 * · ไม่มีรายการให้ลืม · `sb-*` ใน `localStorage` ไม่ถูกแตะ **โดยโครงสร้าง**
 * 🔴 **ต้อง `await`** — `signOut()` ที่ไม่รอ จะเพิ่งเริ่มลบตอนผู้ใช้ถูกพาออกจากหน้าไปแล้ว
 */
export async function clearAll(): Promise<void> {
  // 🔴 **ล้าง object store ไม่ใช่ `deleteDatabase()`** — ฉบับแรกของผมใช้ `deleteDatabase` แล้วต้องเขียน
  //    ทางถอยให้ `onblocked` (แท็บอื่นเปิดฐานค้างอยู่ = คำขอลบค้าง แล้ว *ลบทีหลัง* ตอนแท็บนั้นปิด
  //    ซึ่งอาจไปลบข้อมูลที่เขียนใหม่ไปแล้ว) · **`clear()` เป็นทรานแซกชันธรรมดา ไม่มี `blocked`
  //    ไม่มีคำขอค้าง และทำงานได้แม้แท็บอื่นเปิดอยู่** — ได้ผลเดียวกันโดยไม่มีเคสขอบสักอัน
  // ✅ ข้อได้เปรียบหลักยังอยู่ครบ: **ล้างของเราทั้งหมดโดยไม่ต้องมีรายการ** และเอื้อมไม่ถึง `localStorage`
  //    → `sb-*` ของ `supabase-js` ปลอดภัยโดยโครงสร้างเหมือนเดิม
  await tx("readwrite", (s) => s.clear());
}

/**
 * ยืนยันว่าข้อมูลในเครื่องมาจากฐานเดียวกับที่กำลังคุยอยู่ · **ต่างเมื่อไหร่ = ล้างทิ้งทั้งใบ**
 * 🔴 **ต้องเรียกก่อนอ่านครั้งแรกเสมอ** — `§12.3`: ล้าง *ก่อน* อ่าน ไม่ใช่หลัง
 * ไม่งั้น hydrate จะวาดข้อมูลของอีกระบบออกมาก่อนแล้วค่อยหาย
 */
export async function assertBackend(backendId: string): Promise<void> {
  const seen = await get<string>(BACKEND_ID_KEY);
  if (seen === backendId) return;
  if (seen !== null) await clearAll();
  await set(BACKEND_ID_KEY, backendId);
}

/**
 * คีย์ของข้อมูลรายทริป — รูปเดียวกับ `localCache.tripCacheKey` โดยตั้งใจ
 * 🔴 **ระหว่างย้ายจะมีข้อมูลอยู่สองที่ชั่วคราว** · ใช้รูปคีย์เดียวกันทำให้เทียบกันได้ตอนไล่ปัญหา
 */
export function tripKey(tripId: string, name: string): string {
  return `trip:${tripId}:${name}`;
}

/** 🔴 เปิดให้เทสต์เท่านั้น — ด่านที่ไม่มีเคสด้านบวก คือด่านที่ไม่มีใครรู้ว่ายังทำงานอยู่ไหม */
export const __dbNameForTests = DB_NAME;
