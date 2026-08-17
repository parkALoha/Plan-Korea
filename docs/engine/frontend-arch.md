# frontend-arch.md — P3-FE/Perf

> **ระยะออกแบบเท่านั้น** เอกสารนี้ไม่มีโค้ดที่รันได้กับแอปจริง ดู `docs/engine/README.md` กติกาเหล็ก 5 ข้อ
> ก่อนอ่านต่อ ตรวจโค้ดจริง 17 ส.ค. 2026 ทุกจุดที่อ้างถึง

## สรุปสภาพปัจจุบัน (ยืนยันจากซอร์สเอง ไม่ใช่จากบรีฟ)

- `next.config.ts` ว่างจริง (stub `{}` จาก create-next-app) — [next.config.ts](../../next.config.ts)
- ไม่มี route segment config (`dynamic`/`revalidate`/`runtime`/`fetchCache`) ที่ไหนเลย
- `app/` มีแค่ 4 หน้าแบน (`page.tsx` `today/page.tsx` `summary/page.tsx` `unlock/page.tsx`) — ไม่มี `[param]`,
  ไม่มี `loading.tsx`/`error.tsx`, ไม่มี route group
- ทั้ง 4 หน้าและ 41/44 components มี `"use client"` — เหลือ 3 ที่เป็น server จริง คือ `DayCardSkeleton`,
  `LayoverBadges`, `WeatherBadge` (เช็คแล้ว: 3 ไฟล์นี้ไม่ยิง `supabase.from`/hook ตัวไหนเลย จึงบังเอิญเป็น
  server component โดยไม่มีใครตั้งใจ ไม่ใช่ผลของการออกแบบ)
- `app/layout.tsx:12` ห่อทุกหน้าใน `<TripDataProvider>` ซึ่งเป็น `"use client"`
  ([TripDataProvider.tsx](../../components/TripDataProvider.tsx)) — เปิด 3 realtime channel
  (`useHotels`/`useBookings`/`useCustomPlaces`) ตั้งแต่ root ทันทีที่ hydrate ไม่ว่าหน้าไหนต้องใช้จริงหรือไม่
- `lib/writeGuard.ts` เป็น choke point เดียวที่ทุกการเขียนผ่าน — ยืนยันแล้วว่า `"use client"` เพราะเรียก
  `showToast` ตรง ๆ แต่ตัว try/catch + normalize error เป็น pure logic แยกออกจาก toast ได้
- `proxy.ts` (ไม่ใช่ `middleware.ts` — Next 16 เปลี่ยนชื่อ, ดูคอมเมนต์ใน [proxy.ts:8-9](../../proxy.ts))
  ตัด `_next` ทั้งก้อนโดยตั้งใจ เพราะ RSC payload วิ่งผ่าน path เดิม + `?_rsc=`
- `public/sw.js` เขียนมือ ไม่ใช้ Workbox, จงใจไม่ precache HTML เพราะด่าน PIN ตอบ 307 ตอนล็อกอยู่
  (จะได้หน้า `/unlock` ติดแคชทับ `/today` ถาวร — ดู [sw.js:31-33](../../public/sw.js))
- `data/places.ts` 1,207 บรรทัด + `data/itinerary.ts` 657 บรรทัด รวม 1,864 บรรทัด literal ขึ้น client bundle
  ทุกหน้าที่ import (ทุกหน้าทำ เพราะเป็น client component ทั้งหมด)
- `vercel.json` มี cron เดียว `0 3 * * *` → `/api/keep-alive` (ขีดจำกัด Vercel Hobby: วันละ 1 ครั้ง)

ยืนยันตรงกับที่ P1 สรุปไว้ทุกข้อ (B7, B8, B9)

**[แก้ตาม D10]** ตัวเลข B8 ที่ผมอ้างไว้เดิม (47 จุด/17 ไฟล์) นับผิด — ที่ถูกคือ **67 จุด/13 ไฟล์**
(P1 ใช้ `grep 'supabase\.from('` ซึ่งพลาด method chain ที่ขึ้นบรรทัดใหม่ เช่น `hooks/useStops.ts` ที่มี
16 จุดหลุดไปคนเดียว) **แต่ที่กระทบแผน §1 ของผมโดยตรงคือการกระจาย ไม่ใช่ตัวเลข:** 10 hooks ถือ 60/67
(90%) · API route (server อยู่แล้ว) 7 · **component ยิง Supabase ตรง = ศูนย์** → แปลว่าขั้น 0 ("ทำ DAL
ก่อน") คือ **เขียน 10 hooks ใหม่** ไม่ใช่ไล่แก้ทั่ว repo และ `hooks/` ไม่อยู่ในโซน P2/P3 จึงไม่ชนใครเลย
เพิ่ม Storage อีก 9 จุดใน 2 ไฟล์ (คนละก้อนกับ 67, ดู D12 — ไม่ใช่ของ §1 แต่กระทบ §4 เรื่อง booking-files)

---

## 1. แผนพลิก `"use client"` → Server Component

**หลักการเรียงลำดับ:** พลิกจาก "ใบไม้ที่ไม่พึ่ง realtime/DnD" เข้าหา "ราก" — ห้ามพลิก provider ที่อยู่บนสุด
ก่อนพลิกลูกที่อ่านค่าจาก context ของมัน ไม่งั้นจะพังกลางทางเพราะ context หายระหว่างวิ่งไล่พลิก

### สิ่งที่ต้องคงเป็น client เสมอ (มีเหตุผลจากงานจริง ไม่ใช่ default)

| อะไร | ทำไมพลิกไม่ได้ |
|---|---|
| `hooks/useTripDnd.ts` + ทุก component ที่ใช้ `@dnd-kit` | DnD ต้องมี pointer event + mutable local state ระหว่างลาก |
| `MapsApiProvider` + `DayMapPanel` (ตัวเดียวที่ใช้ Google Maps JS SDK) | SDK เป็น browser-only, โหลดผ่าน `<APIProvider>` |
| `useHotels`/`useBookings`/`useCustomPlaces` (realtime channel) | Supabase Realtime เป็น WebSocket ฝั่ง browser |
| `ToastHost`, `OfflineBanner`, `ServiceWorkerRegistrar` | อ่าน `navigator.onLine`/`ServiceWorkerContainer`, ต้องมี event listener ฝั่ง client |
| ฟอร์มกรอก PIN ใน `app/unlock/page.tsx` | ต้องมี local input state ก่อน submit |

### สิ่งที่พลิกได้และควรพลิกก่อน (ความเสี่ยงต่ำ → สูง)

1. **`DayCardSkeleton` / `LayoverBadges` / `WeatherBadge`** — เป็น server component อยู่แล้วโดยบังเอิญ
   (ไม่มี `"use client"` แต่ยังอยู่ในโค้ดที่ import จาก client tree ทั้งก้อน จึงไม่ได้ผลจริงจนกว่าจะมี server
   parent) → ใช้เป็น proof-of-concept กลุ่มแรกตอนเริ่มระยะ 2
2. **layout metadata/shell** — `app/layout.tsx` ตัว `<html>/<body>` เองไม่จำเป็นต้องเป็น client
   ทุกวันนี้มันไม่ใช่ client อยู่แล้ว (ไม่มี `"use client"` ที่ตัวไฟล์) ปัญหาไม่ใช่ layout แต่คือ
   `TripDataProvider` ที่มันห่ออยู่ — **ต้องแก้ที่ B8 (server data fetching) ก่อน** ถึงจะย้าย
   provider ให้แคบลงเฉพาะหน้าที่ต้องใช้จริงได้ (เหมือนที่ `MapsApiProvider` ย้ายออกจาก layout ไปแล้ว
   ด้วยเหตุผลเดียวกัน — ดูคอมเมนต์ยาวใน [app/layout.tsx:31-36](../../app/layout.tsx))
3. **หน้า static ล้วน** (ไม่มีในปัจจุบัน แต่ E5 ควรมี เช่นหน้า landing เลือกทริป) — เขียนเป็น async
   server component ตั้งแต่ต้น อย่าตั้งต้นด้วย `"use client"` แล้วค่อยพลิกย้อนกลับ
4. **ข้อมูลอ่านอย่างเดียวที่ไม่ต้อง realtime** (รายชื่อสถานที่, itinerary ของวันที่ล็อกแล้ว) — ย้ายไป
   fetch ใน server component ได้ทันทีที่ B8/E3 (Server Action/DAL) เสร็จ เพราะตอนนี้ยังไม่มี DAL
   ฝั่ง server เลยสักจุด (`supabase.from()`/`.from("...")` ยิงจาก browser ทั้ง 67 จุด/13 ไฟล์ — แก้ตาม D10,
   ดูรายละเอียดการกระจายในหัวข้อ "สรุปสภาพปัจจุบัน")

### ลำดับที่ไม่พังกลางทาง

```
ขั้น 0  ทำ DAL ฝั่ง server (E3 ของ README) — ต้องมาก่อนพลิกอะไรทั้งสิ้น
        เพราะ 67 จุด/10 hooks ที่อ่าน/เขียนตรงจาก browser คือของที่ค้างอยู่ ถ้าพลิก UI ก่อนจะเขียนโค้ดซ้ำสองรอบ
ขั้น 1  พลิกหน้า/component ที่ "อ่านอย่างเดียว ไม่ realtime ไม่ DnD ไม่แผนที่" ทีละหน้า
        เริ่มจาก /summary (อ่านมากสุด เขียนน้อยสุดในทุกหน้า)
ขั้น 2  แคบ TripDataProvider ให้เหลือเฉพาะ context ที่หน้านั้นต้องใช้จริง (เลียนแบบที่ MapsApiProvider ทำแล้ว)
ขั้น 3  หน้า /today (เขียนบ่อยสุด, DnD, realtime) พลิกเฉพาะ "โครงหน้า" เป็น server แล้วฝัง client
        island เฉพาะส่วนที่ต้อง interactive — ไม่พลิกทั้งหน้า
```

ห้ามสลับขั้น 0 ไปทีหลัง — นี่คือเหตุผลเดียวกับที่ README บอกว่า E1 (Identity) ต้องมาก่อนทุกอย่าง:
วินาทีที่มี server-side data access จริง ของเก่าที่ยิงจาก browser ตรง ๆ จะชนกับ RLS ใหม่พร้อมกันหมด
แผนพลิก client→server ต้องเดินตาม E3 ไม่ใช่เดินคู่ขนาน

**⚠️ ลำดับกับ P2:** ขั้น 2 (แคบ `TripDataProvider`) แตะ `app/layout.tsx` ไฟล์เดียวกับที่ P2 ต้องแตะตอน
ออกแบบ trip switcher — ผมวางโครง `/trip/[tripId]` (หัวข้อ 3) เสร็จก่อน P2 ค่อยลงรายละเอียด `components/`
ของ switcher เพื่อไม่ให้ทั้งคู่ออกแบบ layout.tsx คนละแบบพร้อมกัน

---

## 2. `next.config.ts` ที่ควรเป็น

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true, // เปิดตอนเริ่ม E3 ไม่ใช่ตอนนี้ — ดูเงื่อนไขด้านล่าง

  images: {
    // next/image ไม่ถูกใช้เลยตอนนี้ (รูปวิ่งผ่าน /api/place-photo ของเราเองตั้งใจ กันคีย์หลุด client)
    // เมื่อย้ายไป next/image ต้องคง proxy เดิมไว้เป็น loader แบบ custom, ห้ามชี้ remotePatterns
    // ตรงไป Google Places Photo API เพราะจะพา API key รั่วไปที่ URL ฝั่ง client
    // ตัวอย่าง: loader: "custom", loaderFile: "./lib/imageLoader.ts" → เรียก /api/place-photo เดิม
  },

  // CSP ผ่าน header ใน proxy.ts (nonce ต่อ request) ไม่ใช่ตรงนี้ — ดูหัวข้อ CSP ด้านล่าง
};

export default nextConfig;
```

### `cacheComponents: true` — ได้อะไรเสียอะไร

**ได้:** แยกชัดเจนระหว่าง static shell (prerender ได้) กับ dynamic hole (ต้อง `<Suspense>`) บังคับด้วย
build error แทนที่จะเดา — ตรงกับปัญหาจริงของโปรเจกต์นี้ที่ไม่มี route segment config เลยสักตัว
คือไม่มีใครเคยตัดสินใจเรื่อง static/dynamic อย่างมีสติ

**เสีย/เงื่อนไข:**
- ทุก dynamic API (`cookies()`, `headers()`, `searchParams`, ตัว PIN gate ที่จะย้ายจาก proxy-only
  มาเช็คใน component) ต้องอยู่ใต้ `<Suspense>` มิฉะนั้น build fail — ต้องออกแบบ Suspense boundary
  รอบ ๆ ทุกจุดที่อ่านคุกกี้ PIN ถ้าจะเช็คซ้ำใน component (ปกติไม่ต้อง เพราะ proxy กันไว้ชั้นนอกแล้ว)
- ต้องมี DAL ก่อน (ขั้น 0 ของหัวข้อ 1) เพราะ `use cache`/`use cache: private` ใช้ได้เฉพาะ Server
  Component/Action ไม่ใช่ Route Handler — API route ทั้ง 13 ตัวใน `app/api/` (place-photo, weather ฯลฯ —
  ดู D5 ใน README, แก้จาก 12 ที่นับผิดในดราฟต์แรก) แคชแบบเดิมด้วย `Cache-Control` header เอง ไม่ใช้ directive นี้
- **เปิดตอนไหน:** เปิดพร้อม E3 (Server Action/DAL) ไม่ใช่ก่อนหน้านั้น — เปิดตอนที่ยังไม่มี server
  component จริงจังจะไม่ได้อะไรเลยนอกจากบังคับ error ที่ไม่มีทางแก้ได้ (เพราะทุกอย่างยังเป็น client)
- **⚠️ [กระทบ CI ของ P6]** P6 ตั้ง CI secret ให้ Google key เป็นค่าปลอมได้ (`next build` ไม่ต้องคีย์จริง)
  **ด้วยเหตุผลว่าทั้ง 4 หน้าเป็น `"use client"` วันนี้** — พอ §1 พลิกหน้าไหนเป็น server component ที่มี
  fetch จริงตอน build (เช่น `generateStaticParams`/`generateMetadata` ของ `/trip/[tripId]`) ข้อสมมติ
  นี้พังทันที เพราะ build จะยิง request จริงและได้ error/ข้อมูลปลอมจากคีย์ปลอม → **ต้องแจ้ง P6 ทุกครั้งที่
  หน้าไหนใน §1 ขั้น 1-4 ขยับจาก client เป็น server ที่มี build-time fetch** ไม่ใช่แจ้งครั้งเดียวตอนเริ่ม E3

### `'use cache: private'` — ตรงกับ tenant isolation ที่ B5 ต้องการพอดี

ข้อเท็จจริงจาก doc (`use-cache-private.md`): ผลลัพธ์ **ไม่เก็บฝั่งเซิร์ฟเวอร์เลย** แคชแค่ใน browser
memory เท่านั้น ไม่ persist ข้ามการโหลดหน้า — ตรงกับ "ข้อมูลรายผู้ใช้ห้ามไปโผล่ในแคชที่แชร์กัน" ของโจทย์
โดยไม่ต้องออกแบบ cache-key partitioning เอง (ไม่มีทาง user A เห็นของ user B ค้างในแคชเซิร์ฟเวอร์ เพราะ
ไม่มีแคชเซิร์ฟเวอร์ให้ค้าง)

**⚠️ ข้อจำกัดที่ต้องออกแบบรอบ:**
- ใช้ไม่ได้ใน Route Handler — ถ้าจะแคช per-trip data ที่อ่านคุกกี้/session ต้องทำใน Server
  Component/Action ไม่ใช่ `app/api/*/route.ts`
- ทุก request render ใหม่เสมอ (ไม่ได้ประโยชน์ static shell) — ใช้เฉพาะจุดที่ "ต้องมี runtime data
  (เช่น tripId จาก cookie/session ของ E1) และ compliance ห้าม cache ฝั่งเซิร์ฟเวอร์" เท่านั้น
  ข้อมูลที่ไม่ผูก user (รายชื่อสถานที่ทั่วไป, ข้อมูล provider registry) ใช้ `use cache` ธรรมดาแทน —
  เก็บฝั่งเซิร์ฟเวอร์ได้ เพราะไม่ใช่ของรายคน

### CSP ผ่าน `proxy.ts`

`proxy.ts` มีอยู่แล้วและทำ auth gate ให้ทั้งเว็บ (PIN) — เพิ่ม nonce + CSP header ในฟังก์ชันเดียวกันได้
โดยไม่ต้องเปิดไฟล์ใหม่ ตามแพทเทิร์นใน doc: generate nonce ต่อ request → ใส่ `Content-Security-Policy`
header → ทุกหน้าที่ผ่าน proxy (คือทุกหน้ายกเว้น `PUBLIC_PATHS`) ได้ nonce เดียวกับ policy เดียวกัน
ข้อแม้จาก doc: หน้าที่มี nonce **ต้อง dynamic render** — จะขัดกับ static shell ของ `cacheComponents`
ถ้าทำทั้งเว็บ จึงควรจำกัด CSP nonce เฉพาะหน้าที่มีฟอร์ม/input จริง คือ **`/unlock` แบบ global**
(ไม่ผูกทริป — ดู D1 ใน README: P1 ตัดสินให้ `/unlock` คงเป็น global เพราะ PIN เป็นกลไกชั่วคราวที่ E1
จะมาแทนทั้งหมด ไม่ใช่ของที่ควรลงแรงออกแบบต่อทริป) และหน้า auth อื่นที่จะเพิ่มหลัง E1 ส่วนหน้า static
ใช้ CSP แบบไม่มี nonce (`'self'` + allowlist โดเมน Supabase/Google) แทน

---

## 3. โครง routing ใหม่ `/trip/[tripId]/...`

อ้างอิง B4 (ไม่มี `trip_id` ในตารางไหนเลย) และ B6 (ประเทศอยู่ใน type) — routing ต้องรอ schema จาก
P1 (`architecture.md`) ก่อนเดินจริง นี่คือโครงที่ **หน้าตาไฟล์** ควรเป็น ไม่ใช่การตัดสินใจ schema

```
app/
  unlock/page.tsx          — คงเป็น global เหมือนเดิม (D1: P1 ตัดสินแล้ว) — ไม่ย้ายเข้า [tripId]
  trip/[tripId]/
    layout.tsx           — server, โหลด trip metadata (ชื่อ/ประเทศ/ช่วงวันที่) ด้วย generateMetadata
    page.tsx              — landing ของทริป (redirect ไป today หรือ summary)
    today/page.tsx         — เดิม /today — dynamic เสมอ (realtime, DnD, เขียนบ่อย)
    summary/page.tsx        — เดิม /summary — PPR ได้ (static ตัวโครงหน้า + dynamic hole ตรง booking)
```

### static / PPR / dynamic แยกตามหน้า

| หน้า | กลยุทธ์ | เหตุผล |
|---|---|---|
| `/trip/[tripId]/today` | **dynamic เต็ม** (ไม่มี PPR) | เขียนถี่สุด, realtime, DnD — static shell ไม่มีประโยชน์เพราะ almost ทุกอย่างในหน้าคือ dynamic hole อยู่แล้ว |
| `/trip/[tripId]/summary` | **PPR** | โครงหน้า (หัวข้อ, itinerary ที่ล็อกแล้ว) static ได้ ส่วน booking/checklist ที่แก้บ่อยเป็น dynamic hole เดียว |
| `/trip/[tripId]` (landing) | **static + `generateStaticParams`** เท่าที่รู้ tripId ล่วงหน้า (ทริปของ owner ที่ login ไว้) | อ่านอย่างเดียว ไม่มีข้อมูลรายผู้ใช้ในหน้านี้เอง |
| `/unlock` (global) | **dynamic** (ต้องอ่าน cookie ปัจจุบัน) | ฟอร์ม PIN ต้องมี CSP nonce ตามหัวข้อ 2 — คงอยู่จนกว่า E1 จะแทนที่ทั้งหน้าด้วย session auth (D1) |

`generateStaticParams` ใช้ได้จริงเฉพาะ landing — หน้า today/summary ผูกกับ session ของผู้ใช้คนนั้น
(ใครเห็นทริปไหนได้ตัดสินจาก identity ของ E1) จึง static ข้ามผู้ใช้ไม่ได้ ต้องรอ E1 เสร็จก่อนถึงจะรู้ว่า
"tripId ไหนที่ควร prerender ล่วงหน้า" มีความหมายจริงหรือเปล่า — ตอนนี้เขียนเป็นแผนไว้ก่อน ยังใช้งานไม่ได้

---

## 4. Caching strategy รายชั้น

```
CDN (Vercel edge)
  → static assets (/_next/static) — s-maxage=31536000 immutable (Next ตั้งให้อัตโนมัติ)
  → static/PPR shell ของ /trip/[tripId] และ /trip/[tripId]/summary — s-maxage ตาม cacheLife
  → ห้ามแคช /today เลย (private, no-cache — Next ตั้งอัตโนมัติสำหรับ route ที่ไม่มี PPR/static)
  ↓
`use cache` (เซิร์ฟเวอร์, ข้ามผู้ใช้ได้) — รายชื่อสถานที่/provider registry/ค่าคงที่ที่ไม่ผูก tripId
  ↓
`use cache: private` (browser memory เท่านั้น, ไม่เก็บเซิร์ฟเวอร์) — ข้อมูลที่อ่าน cookie/session
  เช่น trip metadata ของ tripId ที่ผู้ใช้คนนี้ล็อกอินอยู่
  ↓
Supabase table cache ที่มีอยู่แล้ว (travel_time_cache, place cache ตาม README "ของที่ต้องใช้ซ้ำ")
  — คนละชั้นกับ Next cache, คือแคชผลลัพธ์ภายนอก (Google API) ไม่ใช่แคชของ Next
  ↓
Service worker (browser, per-tripId — ดูหัวข้อ 5)
```

**กันข้อมูลรายผู้ใช้หลุดไปแคชที่แชร์กัน — 4 ชั้น (ข้อ 1 แก้ตาม D11):**
1. **🔴 [D11] สิทธิ์ต้องเช็คนอกและก่อนฟังก์ชันที่ถูกแคชเสมอ** — ที่ผมเขียนดราฟต์แรกว่า "ผู้ใช้จะเห็น
   initial value ของทริปอื่นแวบหนึ่ง" นั้นอ่อนไป P1 ไล่ตรรกะต่อแล้วพบว่าปัญหาไม่ใช่แค่ cache key ผิด
   แต่คือ **hit แคช = ข้าม DB = ข้าม RLS**: `A (สมาชิกทริป X) → miss → DAL ยิงด้วย session ของ A →
   RLS ผ่าน → เก็บใต้คีย์ "X"` แล้ว `B (ไม่ใช่สมาชิก) เปิด /trip/X → HIT → ได้ข้อมูลของ A โดยไม่แตะ DB
   เลย → RLS ไม่เคยทำงาน` — **ต่อให้ cache key ใส่ tripId ถูกเป๊ะตามข้อ 2 ด้านล่างก็ยังรั่ว** เพราะแคช
   ไม่รู้จักสิทธิ์ ไม่ใช่ "แวบหนึ่งแล้วหาย" แต่เป็นข้อมูลที่ไม่ควรถูกส่งออกไปตั้งแต่แรก · กฎที่ใช้จริง
   (เขียนไว้แล้วใน `architecture.md §3.4`): ข้อมูลรายทริป/รายผู้ใช้ต้องเป็น `'use cache: private'`
   เท่านั้น · `'use cache'` ธรรมดาใช้ได้เฉพาะ catalog สาธารณะที่ไม่ผูกสิทธิ์ใครเลย
2. **Cache key:** ทุก `use cache` ที่คืนข้อมูลของทริปต้องรับ `tripId` เป็น argument ตรง ๆ (ไม่ใช่อ่านจาก
   closure ของ cookie) เพื่อให้ cache key แยกตาม tripId ชัดเจน ตรงกับที่ doc บอกว่า serializable
   arguments กลายเป็นส่วนหนึ่งของ cache key อัตโนมัติ — **แต่ข้อนี้แก้แค่ "ข้อมูลปนกันข้ามทริป" ไม่ใช่
   "ข้อมูลรั่วให้คนที่ไม่มีสิทธิ์" ต้องทำคู่กับข้อ 1 เสมอ ทำข้อเดียวไม่พอ**
3. **CDN:** หน้า today/unlock ที่มีข้อมูล/ฟอร์มรายคน ต้องไม่ติด `s-maxage` เลย — ตรวจด้วย
   `Cache-Control: private, no-cache` ใน response header ตอน QA (มอบให้ P4 ตรวจใน E7)
4. **เทสต์:** ข้อ 1 ต้องมีเคสเทสต์จริงของ P4 (คู่กับ 104 เคส RLS ของ E2) ไม่ใช่แค่ code review — เพราะ
   บั๊กชนิดนี้ไม่ throw error ให้เห็น มัน "สำเร็จ" แต่ส่งข้อมูลผิดคนเงียบ ๆ

---

## 5. Service worker บนแพลตฟอร์มหลายทริป

ของเดิม ([sw.js](../../public/sw.js)) สมมติทริปเดียว: cache name ตายตัว (`shell-v1`, `assets-v1`,
`data-v1`) ไม่มี tripId ในคีย์เลย — ถ้าขึ้นแพลตฟอร์มตรง ๆ โดยไม่แก้ ทริป B จะเห็นข้อมูลแคชของทริป A
ค้างอยู่ (bug คนละชั้นกับ B5 แต่ผลเหมือนกัน: ข้อมูลข้ามทริปรั่ว)

**แผนแก้ (ยังไม่ใช่โค้ด แค่โครง):**
- Cache name ต้องรวม tripId: `data-${tripId}-v1` ไม่ใช่ `data-v1` เฉย ๆ
- `CACHEABLE_API` (`/api/place-photo`, `/api/travel-time`, `/api/weather` ฯลฯ) ต้องผูก tripId ใน
  URL หรือ query อยู่แล้วในตัว request (ไม่ใช่งานของ SW) — SW แค่ต้อง parse tripId จาก request URL
  มาประกอบชื่อ cache
- ⚠️ **`ALL_CACHES` เป็นลิสต์ตายตัว (`sw.js:14, 47`)** — `activate` ลบทุก cache ที่ไม่อยู่ใน `ALL_CACHES`
  ถ้าใส่ tripId เข้าไปในชื่อ cache (`data-${tripId}-v1`) โดยไม่แก้ `ALL_CACHES` ให้เป็นแบบ dynamic ด้วย
  **แคชจะถูกลบทิ้งทันทีทุกครั้งที่ SW activate** เพราะชื่อที่มี tripId จะไม่ตรงกับลิสต์ตายตัวเดิมสักตัว —
  นี่ไม่ใช่แค่เรื่อง "evict ทริปที่เลิกใช้แล้ว" แต่เป็นบั๊กที่ทำให้แคชใช้งานไม่ได้เลยตั้งแต่วันแรกถ้าลืมแก้จุดนี้
  ต้องเปลี่ยนเป็น pattern match (เช่น `n.startsWith("shell-") || n.startsWith("assets-") || n.startsWith("data-")`
  แล้วค่อยกรอง tripId ที่ยัง active อยู่ต่างหาก) ก่อน ไม่ใช่หลัง ใส่ tripId เข้าไปในชื่อ
- ข้อจำกัดเดิมยังอยู่: **ห้าม precache HTML** เพราะเหตุผลเดิม (ด่าน PIN ตอบ 307) ใช้ได้กับทุกทริป
  เหมือนเดิม ไม่ต้องแก้จุดนี้
- Next 16 ไม่มี built-in SW สำหรับ full offline (ยืนยันจากคอมเมนต์ใน sw.js เอง) — เขียนมือต่อไป
  ไม่แนะนำเปลี่ยนไป Workbox ตอนนี้ เพราะกฎยังเหลือแค่ 3-4 ข้อ ยังไม่คุ้ม dependency

---

## 6. Core Web Vitals

### Budget ที่เสนอ

| Metric | Budget | อ้างอิง |
|---|---|---|
| LCP | < 2.5s บน 4G จำลอง | Google "good" threshold, สำคัญเพราะ `/today` เปิดตอนโรมมิ่งเน็ตช้าจริง |
| CLS | < 0.1 | ผลกระทบตรงกับ DnD list ที่ reorder บ่อย ต้องกันไม่ให้ skeleton โหลดแล้วดันเลย์เอาต์ |
| INP | < 200ms | DnD interaction เป็นจุดเสี่ยงสุด — `useTripDnd` ต้องไม่ block main thread ตอนลาก |

### วิธีวัด

- **Lab:** `next build` + Lighthouse CI ใน GitHub Actions (ประสาน P6 — `docs/engine/devops.md`)
  รันทุก PR ที่แตะ `app/`/`components/` วัดที่ `/trip/[tripId]/today` และ `/summary` เป็นหลัก
  (สองหน้าที่เปิดบ่อยสุดตามที่ layout.tsx คอมเมนต์ไว้)
- **Field:** `next/web-vitals` ส่งเข้า analytics — ยังไม่มี analytics provider ตอนนี้ เสนอไว้เป็นของค้าง
  ระยะ 2 ไม่ใช่ตัดสินใจตอนนี้

### `data/places.ts` ย้ายลง DB ช่วยเท่าไร

**ประเมินแบบระบุสมมติฐานชัด (ไม่มีเลขวัดจริง เพราะยังไม่ได้ทำ):**

- ปัจจุบัน: 1,207 บรรทัด (`data/places.ts`) + 657 บรรทัด (`data/itinerary.ts`) = 1,864 บรรทัด
  literal object ที่ทุกหน้า import (เพราะทุกหน้าเป็น client component ทั้งก้อน จึงลากเข้า client bundle
  หมดไม่ว่าหน้านั้นใช้สถานที่กี่รายการจริง)
- ย้ายลง DB + fetch เฉพาะ server component (หลัง B8 แก้) จะตัดตัวเลขนี้ออกจาก **client bundle
  ทั้งหมด** เหลือแค่ข้อมูลที่หน้านั้นต้องใช้จริงถูกส่งผ่าน RSC payload (ปกติเล็กกว่ามาก เพราะ RSC
  payload ส่งเฉพาะ props ที่ render จริง ไม่ใช่ทั้ง module)
- ผลต่อ LCP: ตัด parse/execute JS ของ 71 KB literal ออกจาก main thread ตอน hydrate — ทิศทางถูกแน่นอน
  แต่ **ขนาดผลจริงต้องรอวัดหลังทำ** เพราะขึ้นกับว่า bundle เดิมมันถูก tree-shake/split ไปแค่ไหนอยู่แล้ว
  ไม่ควรอ้างตัวเลข % ที่ยังไม่ได้วัด — นี่คือของที่ E6 (Perf) ต้องวัดก่อน-หลังจริง ไม่ใช่ประเมินลอย ๆ ตอนนี้
- สิ่งที่ยืนยันได้แน่นอนตอนนี้โดยไม่ต้องวัด: การย้ายลง DB แก้ B6 (ประเทศอยู่ใน type) ไปพร้อมกันได้เลย
  เพราะข้อมูลประเทศจะกลายเป็นคอลัมน์ใน DB แทนสมการ `countryOfCity()` ที่ hardcode เป็น 2 ประเทศตายตัว

---

## 7. `cacheComponents` + Supabase Realtime อยู่ด้วยกันได้แค่ไหน (ตอบคำถาม P1)

**ตรวจแล้ว: 10 hooks เปิด `postgres_changes` จริง** — `useDaySettings` `useOvernightOverrides`
`usePlaceNotes` `usePlans` `useChecklist` `useCustomPlaces` `useBookings` `useHiddenPlaces` `useHotels`
`useStops` ทั้ง 10 ไฟล์เป็น `"use client"` ทั้งหมดอยู่แล้ว (เช็คแล้ว)

**คำตอบสั้น: อยู่ด้วยกันได้ดี เพราะเป็นคนละชั้นกันโดยธรรมชาติ ไม่ใช่ของที่ตีกันตรง ๆ**

`cacheComponents`/`use cache` ควบคุมว่า **การ render ครั้งแรก (server, ต่อ request)** อะไร static
อะไร dynamic เท่านั้น — มันไม่รู้จักและไม่แตะ WebSocket connection ที่เปิดขึ้นหลัง hydrate ฝั่ง browser
เลย เพราะ realtime channel ทั้ง 10 hook เป็น client-side subscription ที่เกิด**หลัง**จาก server ส่ง
response ไปแล้ว คนละ lifecycle กัน

**สิ่งที่ต้องระวังจริง ไม่ใช่ตัว realtime แต่คือ "ค่าตั้งต้นที่ hook อ่านตอน mount":**

1. **Initial value ต้องมาจาก server, ไม่ใช่ให้ hook fetch เองตอน mount เหมือนตอนนี้** — ทุก hook ใน
   10 ตัวนี้ตอนนี้ทำ pattern เดียวกัน: `useEffect` ยิง `supabase.from().select()` ตอน mount +
   เปิด `postgres_changes` ต่อ เพื่อรับ delta หลังจากนั้น พอพลิกมาเป็น server-first (E3) initial
   value ควรมาจาก server component/`use cache: private` แล้ว hook รับมาเป็น prop เริ่มต้น + เปิด
   channel ต่อจากตรงนั้นแทนที่จะ fetchซ้ำ — ลด round-trip แรกแต่ไม่กระทบความถูกต้องของ realtime
2. **`use cache`/`use cache: private` ไม่ได้ "แช่แข็ง" ข้อมูลจน realtime อัปเดตไม่ได้** — client
   component ที่รับ initial value จาก cache แล้วยังเปิด subscription เองต่อได้ตามปกติ เพราะ cache
   ควบคุมแค่ค่าที่ server ส่งมาตอน render ครั้งแรก ไม่ได้ควบคุม state บน client หลังจากนั้น
3. **จุดเดียวที่ต้องออกแบบจริงจัง — [แก้ตาม D11]:** ถ้า initial value มาจาก `use cache` (แชร์ข้ามผู้ใช้)
   แต่ตัวข้อมูลเป็นรายทริป/รายคน **ไม่ใช่แค่ "เห็นแวบเดียวก่อน realtime sync ทับ"** อย่างที่ผมเขียนไว้ตอน
   แรก — P1 ไล่ตรรกะต่อแล้วพบว่าแรงกว่านั้น: hit แคช = ข้าม DAL = ข้าม RLS ทั้งก้อน ผู้ใช้ที่ไม่มีสิทธิ์
   จะได้ข้อมูลเต็ม ไม่ใช่แวบเดียวแล้วหาย (รายละเอียดเต็มอยู่ในหัวข้อ 4 ข้อ 1) → กฎคือ `use cache: private`
   บังคับสำหรับข้อมูลรายทริป/รายคนทุกจุด ไม่มีข้อยกเว้น
4. **ไม่มีข้อขัดแย้งเชิงสถาปัตยกรรมที่ต้องแก้ก่อน E3** — จึงตอบ P1 ว่าไม่ต้องกังวลเรื่องนี้เป็นตัวบล็อก
   แผนพลิก client→server ในหัวข้อ 1 ดำเนินตามลำดับเดิมได้ แค่ต้องคุมกฎข้อ 3 ให้ตรงตอนพลิกแต่ละ hook

---

## 8. เป้าหมายจำนวน Realtime channel ต่อผู้ใช้ (ตอบคำถาม P1/P6)

**สภาพปัจจุบัน:** 10 hooks = 10 `postgres_changes` channel แยกกันต่อผู้ใช้ 1 คนที่เปิดเว็บ (ห่อรวมใน
`TripDataProvider` เพียง 3 — `useHotels`/`useBookings`/`useCustomPlaces` — ส่วนอีก 7 เปิดเฉพาะหน้าที่ใช้)
Supabase Realtime free tier ~200 connection พร้อมกันทั้งโปรเจกต์ (ตัวเลขจาก P6) → ที่ 10 channel/user
ชนเพดานที่ **~20 คนพร้อมกัน** เว็บทริป 2 คนตอนนี้ไม่มีทางชน แต่แพลตฟอร์มหลายทริปชนแน่ถ้าไม่ลด

**เป้าหมายที่เสนอ: รวมเหลือ 1 channel ต่อทริปต่อผู้ใช้ (ไม่ใช่ต่อตาราง)**

เหตุผลที่ทำได้จริง — Supabase Realtime รองรับหลาย `postgres_changes` filter ผูกกับ channel เดียวกันได้
(`channel.on('postgres_changes', {table: 'trip_stops', filter: `trip_id=eq.${tripId}`}, ...).on('postgres_changes', {table: 'trip_hotels', ...}, ...)`
เป็นต้น) — ของเดิมที่แยก 10 channel ไม่ได้มาจากข้อจำกัดของ Supabase แต่มาจากแต่ละ hook ถูกเขียนแยกกัน
โดยไม่มีจุดรวม (สอดคล้องกับ D10: 90% ของจุดเขียน DB กระจุกอยู่ใน 10 hooks พวกนี้ ซึ่งเป็นของที่ E3
ต้องเขียนใหม่เป็น DAL อยู่แล้ว — รวม channel คือส่วนขยายธรรมชาติของงานเดียวกัน ไม่ใช่งานเพิ่ม)

**แผนที่เสนอ:**
1. E3 เขียน `useTripRealtime(tripId)` ตัวเดียวแทน 10 hooks เดิม — เปิด **1 channel ต่อ tripId**
   subscribe ทุกตารางที่ต้อง realtime (`trip_stops` `trip_hotels` `bookings` `checklist_items` ฯลฯ)
   filter ด้วย `trip_id=eq.${tripId}` เดียวกันทั้งหมด แล้ว dispatch payload ตาม `table`/`eventType`
   ให้แต่ละ domain hook (`useStops`/`useHotels`/…) ใช้ต่อ — hook เดิมยังมี API หน้าตาเดิมสำหรับ component
   แค่ไม่เปิด channel ของตัวเองแล้ว
2. **ผลลัพธ์:** 10 channel/user → **1 channel/user/ทริปที่เปิดอยู่** (ปกติเปิดทริปเดียวต่อครั้ง) ยกเพดาน
   จาก ~20 คนพร้อมกัน → **~200 คนพร้อมกัน** บน free tier เดิม (คูณ 10) ไม่ต้องซื้อ Pro เพื่อรองรับขนาด
   ทีมทดสอบ/ครอบครัวเดียว แต่ยังเป็นของที่ต้องวัดจริงตอน E3 ไม่ใช่ตัวเลขคำนวณแล้วจบ
3. **ข้อจำกัดที่ต้องรู้ก่อนทำ:** `postgres_changes` ยังนับ "1 subscription ต่อ table+filter combination"
   ภายใน channel เดียวกันในการคิดโควตาฝั่ง Supabase บางแพลน (ต้องเช็คกับ P6/เอกสาร Supabase ตอน E3
   จริง ไม่ใช่ตัวเลข ~200 ด้านบนที่เป็นการประมาณจากจำนวน connection อย่างเดียว) — ใส่เป็นสมมติฐานที่ต้อง
   ยืนยันในหัวข้อวัดผลของ E3 ไม่ใช่ข้อเท็จจริงที่ปิดเคสแล้ว
