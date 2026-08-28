/**
 * Service Worker — offline แบบ "อ่านอย่างเดียว" (เฟส 18)
 *
 * ขอบเขตที่ตกลงกันไว้: เปิด /today และ /summary ดูแผนที่โหลดไว้แล้วได้ตอนเน็ตหลุด
 * (อุโมงค์รถไฟใต้ดินโซล/ปูซาน และเขาซอรัคซาน) **ไม่ทำ offline editing** เพราะเว็บนี้ sync สด 2 คน
 *
 * เขียนเองไม่ใช้ Workbox — กฎที่ต้องการมีแค่ 3 ข้อ (ด้านล่าง) ไม่คุ้มกับการเพิ่ม dependency
 * และ Next เวอร์ชันนี้ไม่ได้ให้ SW สำหรับ offline caching มาให้ (คู่มือ PWA ของมันพูดถึงแค่ push
 * notification ส่วนคู่มือ offline-support ระบุเองว่า full offline load ต้องเขียน service worker เอง)
 */

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;
const ALL_CACHES = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE];

/** API ที่ผลลัพธ์นิ่ง (รูป/รายละเอียดสถานที่/เวลาเดินทางที่แคชใน Supabase อยู่แล้ว) — เสิร์ฟจากแคชก่อนได้ */
const CACHEABLE_API = [
  "/api/place-photo",
  "/api/place-photos",
  "/api/place-details",
  "/api/travel-time",
  "/api/weather",
];

const OFFLINE_HTML = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ออฟไลน์</title>
<style>body{font-family:system-ui,sans-serif;background:#fdf6ec;color:#2b241f;display:flex;
min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
div{max-width:22rem}h1{font-size:1.1rem;margin:0 0 .5rem}p{color:#6b6058;font-size:.9rem;line-height:1.6}</style>
</head><body><div><h1>📴 ยังไม่เคยเปิดหน้านี้ตอนมีเน็ต</h1>
<p>หน้านี้ยังไม่ได้ถูกเก็บไว้ในเครื่อง ลองกลับไปหน้า “วันนี้” หรือ “สรุปแผน” ที่เคยเปิดไว้แล้ว
แล้วค่อยกลับมาใหม่ตอนเน็ตกลับมา</p></div></body></html>`;

/**
 * 🔴 **`E6-AC3` ตัดสินแล้ว: ยังไม่ precache HTML — แต่ด้วยเหตุผลใหม่ทั้งชุด** (P3 · 28 ส.ค. 2026)
 *
 * ## เหตุผลเดิมหมดอายุจริง — บันทึกไว้ ไม่ได้ลบทิ้ง
 * ของเดิมห้าม precache เพราะ **ด่าน PIN (เฟส 13.5) ตอบ 307 ไป `/unlock`** → เก็บหน้า redirect ทับหน้าจริง
 * · PIN ถูกถอดออกจากทรีนี้แล้ว (`E1-AC6`) **เหตุผลนั้นจึงใช้ไม่ได้อีก**
 * · ⚠️ **แต่ "ข้อห้ามเดิมหายไป" ไม่เท่ากับ "ตอนนี้ควรทำ"** (`D35`) — ข้างล่างคือการตัดสินใหม่จากหลักฐาน
 *   ไม่ใช่การปล่อยผ่านเพราะไม่มีใครห้ามแล้ว
 *
 * ## ① ข้อกังวลเรื่อง "precache แล้วเสิร์ฟ HTML ของคนอื่น" — **วัดแล้วไม่ใช่ปัญหา**
 * ```
 * / · /today · /summary · /login  →  ○ (Static) ใน build output = Next เสิร์ฟ HTML ก้อนเดียวให้ทุกคน
 * today.html 10,985B · summary.html 11,006B · index.html 9,992B
 *   ค้น weekdayTh · อาทิตย์ · gangneung · hanoi-hoan-kiem  =  **0 ทุกไฟล์**
 * ```
 * **ไม่มี HTML ต่อผู้ใช้ให้รั่วตั้งแต่ต้น** — เนื้อหาทั้งหมดมาฝั่ง client หลัง hydrate
 * · `/auth/callback` เป็นข้อยกเว้นที่ **ถูกกันออกจาก SW ทั้งเส้นแล้ว** (`E6-AC8` · `D42`) และมีด่านล็อก
 *
 * ## 🔴 ② แต่ precache HTML อย่างเดียว **ไม่ได้ประโยชน์ที่คนคาดหวังเลย** — วัดจาก build จริง
 * ```
 * today.html ฝัง URL ของ chunk แบบ content-hash ไว้ในตัว  =  14 ไฟล์
 * ```
 * chunk พวกนั้น **ไม่ได้ถูก precache** (เข้าแคชตอนถูกโหลดจริงเท่านั้น) → เปิดแอปครั้งแรกตอนออฟไลน์จะได้
 * HTML ที่โหลดมาแล้วยิง 14 คำขอที่ล้มทั้งหมด = **หน้าขาว ไม่ใช่แอปที่ใช้ได้**
 * 🎯 เป้าหมายเดียวที่ precache มีไว้ตอบ (*เปิดครั้งแรกตอนออฟไลน์*) **จึงไม่เกิดขึ้นจริง**
 *
 * ## 🔴 ③ และมันแย่กว่าไม่ทำ เพราะ hash เปลี่ยนทุก deploy — วัดเช่นกัน
 * เทียบ build ที่ `683f37e` กับ `5d17c15` (ห่างกันไม่กี่คอมมิต): ชื่อ chunk ที่สุ่มมา 6 ตัว → **หาย 4 เหลือ 2**
 * → HTML ที่ precache ไว้ตอน install **ชี้ไป chunk ที่ไม่มีอยู่แล้วหลัง deploy ถัดไป → พังทั้งหน้า**
 * · วันนี้ไม่โดนเพราะ navigate ใช้ `networkFirst` = ออนไลน์ได้ HTML สดเสมอ
 *   **precache แล้วเสิร์ฟของเก่าคือวิธีมาตรฐานที่ทำให้ได้หน้าขาวหลังปล่อยเวอร์ชันใหม่**
 *
 * ## ถ้าวันหนึ่งจะเอาจริง ต้องทำทั้งชุด
 * precache **chunk manifest ของ build นั้นทั้งก้อน** + ผูกชื่อแคชกับเวอร์ชัน build ทุกครั้ง —
 * คนละขนาดกับการเติมรายชื่อ HTML ลง `install` · **ไม่ใช่งานที่ทำครึ่งเดียวแล้วได้ครึ่งผล**
 *
 * ## สิ่งที่ตอบเป้าหมายจริงอยู่แล้ววันนี้
 * `networkFirst` เก็บหน้าที่ **เคยเปิดจริง** ลง `SHELL_CACHE` → *"เปิด `/today` ที่เคยเปิดแล้ว ตอนเน็ตหลุด
 * ในอุโมงค์รถไฟ"* ซึ่งเป็นขอบเขตที่ตกลงกันไว้ตั้งแต่เฟส 18 **ทำงานอยู่แล้วโดยไม่ต้อง precache**
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !ALL_CACHES.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

/** เก็บได้ไหม — ต้องเป็น 200 ธรรมดา และ **ต้องไม่ใช่ผลของ redirect** (กันเก็บหน้า /unlock ทับหน้าจริง) */
function isStorable(response) {
  return response && response.status === 200 && !response.redirected && response.type === "basic";
}

async function networkFirst(request, cacheName, fallbackHtml) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (isStorable(response)) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackHtml) {
      return new Response(fallbackHtml, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    throw new Error("offline and not cached");
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // อัปเดตเบื้องหลังไว้ให้ครั้งหน้า (stale-while-revalidate) — ล้มเหลวก็ช่างมัน เรามีของเก่าให้แล้ว
    fetch(request)
      .then((response) => {
        if (isStorable(response)) cache.put(request, response.clone());
      })
      .catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (isStorable(response)) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // ข้ามทุกอย่างที่ไม่ใช่โดเมนตัวเอง — Supabase ต้องสดเสมอ (เขียนข้อมูลจริง) ส่วน tile ของ Google
  // มีแคชของเบราว์เซอร์เองอยู่แล้ว · ข้อมูลสำหรับดูออฟไลน์เก็บผ่าน localStorage แทน (lib/localCache.ts)
  if (url.origin !== self.location.origin) return;
  // ห้ามแตะด่าน PIN เด็ดขาด — ต้องคุยกับเซิร์ฟเวอร์จริงเสมอ
  if (url.pathname.startsWith("/api/unlock") || url.pathname === "/unlock") return;
  // E6-AC8: /auth/callback เป็น one-shot redirect ที่เขียนคุกกี้ session (app/auth/callback/route.ts)
  // — `isStorable()` ที่กัน response.redirected อยู่แล้วน่าจะกันไม่ให้ถูกแคชทับได้อยู่แล้ว แต่ตัวมันเอง
  // ยังเสี่ยงบั๊กคนละแบบที่ SW เจอกับ redirect เสมอ: `fetch(request)` ตาม redirect ในตัวเองจนจบแล้วส่ง
  // response ปลายทางกลับไปที่ URL เดิม (URL bar ค้างที่ /auth/callback แต่เนื้อหาเป็นหน้าอื่น) — ปัญหา
  // ชนิดเดียวกับที่ /unlock ถูกยกเว้นไว้ตั้งแต่แรก จึงยกเว้นเหมือนกัน ไม่ใช่เพิ่งคิดขึ้นใหม่
  if (url.pathname.startsWith("/auth/callback")) return;
  // ของ dev server (HMR/RSC payload) ปล่อยผ่านทั้งหมด
  if (url.pathname.startsWith("/_next/hmr") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, OFFLINE_HTML));
    return;
  }

  if (CACHEABLE_API.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // API อื่นๆ (place-search, place-nearby, geocode, place-autocomplete) เป็นการค้นหาสดๆ
  // ไม่มีความหมายตอนออฟไลน์ ปล่อยให้ fail ไปตามปกติ
});
