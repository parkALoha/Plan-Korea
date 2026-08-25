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

self.addEventListener("install", (event) => {
  // ไม่ precache หน้า HTML ไว้ล่วงหน้า — เหตุผลเดิม (ด่าน PIN เฟส 13.5 ตอบ 307 ไป /unlock) หมดอายุแล้ว
  // หลังถอด PIN ออกจากทรีนี้ (E1-AC6) แต่ "เหตุผลห้ามเดิมหายไป" ไม่เท่ากับ "ตอนนี้ควร precache"
  // (D35) — ยังไม่ตัดสินใหม่ ต้องชั่งจากสภาพหลัง session auth ตอน E6-AC3 ก่อน (หน้าที่ต้องล็อกอิน
  // precache ไว้อาจเสิร์ฟ HTML ของคนอื่นจากแคช) ปล่อยให้หน้าเข้าแคชตอนเปิดจริงแทนเหมือนเดิมจนกว่านั้น
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
