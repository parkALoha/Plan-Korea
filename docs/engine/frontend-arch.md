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
- `public/sw.js` เขียนมือ ไม่ใช้ Workbox, ไม่ precache HTML — เหตุผลเดิม (ด่าน PIN ตอบ 307) หมดอายุแล้ว
  หลังถอด PIN ออกจากทรีนี้ (`E1-AC6`) ยังไม่ตัดสินใหม่จนกว่า `E6-AC3` (`D35` — ดู [sw.js:37-42](../../public/sw.js))
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
- ⚠️ **แก้ตามหลัง PIN ถูกถอด (`E1-AC6`):** ประโยคเดิมตรงนี้เขียนว่า "ห้าม precache HTML เพราะด่าน PIN"
  ซึ่งหมดอายุแล้ว — ยังคง**ไม่ precache HTML อยู่ดี** แต่ตอนนี้ด้วยเหตุผลใหม่ (`D35`, ดูหัวข้อ 9.4/§10):
  ยังไม่ตัดสินใหม่จนกว่า `E6-AC3` และมีเงื่อนไขเพิ่มจาก session auth ที่ไม่มีตอนเขียนข้อห้ามเดิม (หน้าที่
  ต้องล็อกอิน precache ไว้อาจเสิร์ฟ HTML ของคนอื่นข้ามทริป/ข้ามคนได้) — ใช้กับทุกทริปเหมือนเดิม
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

---

## 9. ตอบ P1 — `catalog.places` (คำถามที่เหลือใน `column-map.md` ก่อนเขียน DDL ของ `E2`)

**วัดจริงบน production build (`next build` + `next start` พอร์ต 3101), ไม่ใช่ตัวเลขประเมิน**

### 9.1 `data/places.ts` (71,149 B source) อยู่ในบันเดิลจริงไหม — วัดแล้ว: **ใช่**

- ไล่ import ทั้งต้นไม้: `data/places.ts` ถูก import ตรงจาก `app/page.tsx` และ `app/today/page.tsx`
  ซึ่งทั้งคู่มี `"use client"` บรรทัดแรก — และ import ต่อผ่าน component/hook/lib อีก ~20 ไฟล์ที่ก็เป็น
  client boundary เหมือนกัน (`PlaceSidebar` `DayStopsSection` `PlaceCard` ฯลฯ) ไม่มี server-only
  isolation จุดไหนเลยระหว่างทาง — ข้อมูลทั้งก้อนจึงไหลลงบันเดิล client ตรงๆ ไม่ผ่าน server component
- ยืนยันด้วยไฟล์ที่ build จริง: chunk ที่มีข้อมูล places (ชื่อ `0106pf5up_xvz.js`) = **164,524 B ดิบ /
  47,229 B gzip** และปรากฏใน `page_client-reference-manifest.js` ของ **ทั้ง `/` และ `/today`**
  (เช็คจาก `.next/server/app/{,today/}page_client-reference-manifest.js` ตรงๆ) · หน้า `/` ยังโหลด
  chunk ที่สองที่มีข้อมูลเดียวกันปนอยู่ (`0rtf66tx4ha7c.js`, 208,874 B ดิบ / 61,322 B gzip — น่าจะรวมกับ
  โค้ด map/place-UI ไม่ใช่ isolate ล้วน)
- **สรุป:** ทุกคนที่เปิด `/` หรือ `/today` ดาวน์โหลดคลังทั้งก้อนเป็น JS ก่อน parse ได้ ไม่ว่าจะใช้กี่จุด
  ในทริปนั้นจริงๆ — ยิ่งคลังโตหลายประเทศ (เป้าหมายของ `E2`) เลขนี้ยิ่งแย่ลงเป็นเส้นตรง

**อัปเดต 25 ส.ค. — วัดซ้ำบนทรี `platform` หลัง `7f985e3` (PIN ถอดแล้ว, session auth เข้ามา) รวม
`data/transferPoints.ts` ที่ P1 ถามเพิ่ม:** `transferPoints.ts` (16,860 B source) ถูก import ผ่าน
`data/places.ts` เอง (และตรงจาก `TransferEditModal`/`IntercityEditModal` ที่เป็น `"use client"`) จึง
**อยู่ใน chunk เดียวกับ places** ไม่แยกกัน — วัดจาก `next build` สดบน `platform`: chunk รวม (แทนที่
`0106pf5up_xvz.js` เดิม) = **165,913 B ดิบ / 47,609 B gzip** ปรากฏใน client-reference-manifest ของ
**`/`, `/today`, `/summary` ทั้ง 3 หน้า** (ตัวเลขขยับขึ้นเล็กน้อยจากตอนวัดบน `main` เพราะ schema/route
เปลี่ยนไปตาม `trip_days`/auth ไม่ใช่เพราะ transferPoints เพิ่งถูกนับ — มันถูกนับรวมอยู่แล้วตั้งแต่แรก
เพราะ import จาก places.ts ตรงๆ)

### 9.2 รูปแบบการดึงที่ควรเป็น — schema ต้องรองรับอะไรตั้งแต่ `E2`

คลังเป็นข้อมูลอ่านอย่างเดียว/เหมือนกันทุกผู้ใช้ → **`use cache` (public, ไม่ใช่ `private`)** ต่างจาก
`trip_stops` ที่ต้อง `use cache: private` ตาม D11 (หัวข้อ 7) เพราะคลังไม่ผ่าน RLS รายทริป

**ยืนยันตามที่ P1 ขอ — `use cache` ยังใช้ได้จริงกับ Next เวอร์ชันนี้ (16.3.0):**
เช็คจาก `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md` ตรงๆ ตามกติกา
`AGENTS.md` — ยังมีอยู่ ยังทำงานตามที่ §2 อธิบายไว้ แต่มีเงื่อนไขที่ต้องพูดตรงๆ: **`use cache` ต้องเปิด
`cacheComponents: true` ใน `next.config.ts` ก่อนถึงจะทำงาน** (ระบุไว้ในหัวข้อ Usage ของ doc เอง) และ
`next.config.ts` วันนี้บน `platform` **ยังไม่ได้เปิด** (เช็คแล้ว ไฟล์มีแค่ config ว่างเปล่า) — ไม่ใช่บั๊ก
เป็นไปตามแผนที่เขียนไว้แล้วในหัวข้อ 2 ว่าให้เปิดพร้อม `E3` ไม่ใช่ตอนนี้ (เพราะยังไม่มี server component
จริงจังที่จะได้ประโยชน์) **สรุป: schema เขียนรองรับได้ตั้งแต่ `E2` เลย แต่ตัว cache จะยังไม่ทำงานจริงจน
กว่า `E3` จะเปิด flag — ไม่ใช่ตัวบล็อก DDL แค่ต้องรู้ว่ายังพิสูจน์ไม่ได้ตอนนี้**

🔴 **สิ่งที่ต้องมีใน DDL ของ `E2` ก่อนเขียน ไม่งั้นต้องตาม migration ทีหลัง:**
1. `updated_at timestamptz` ต่อแถวใน `catalog.places` (และ `catalog.place_names` — แยกตารางจริงตามที่
   P5 เสนอใน `copilot-spec.md` §9.3 ดูข้อ 9.3 ด้านล่าง) สำหรับ debug ว่าแถวไหนเปลี่ยนล่าสุด แต่ **ไม่ใช้
   เป็น cache key โดยตรง** เพราะ scan `max(updated_at)` ทั้งตารางแพงขึ้นเรื่อยๆ ตามจำนวนแถวและไม่ให้ tag
   ที่ invalidate ได้ตรงจุด
2. ตารางเวอร์ชันคลังแยกต่างหาก 1 แถว เช่น `catalog.catalog_meta (id, version bigint, updated_at)` —
   bump `version` ทุกครั้งที่เขียนคลัง (trigger หรือ service action) แล้วใช้ `revalidateTag('catalog:places')`
   ตอนเขียน ไม่ต้องพึ่ง `updated_at` เพื่อ invalidate เลย — เก็บ `updated_at` ไว้เป็น metadata สำหรับคนอ่านเท่านั้น

### 9.3 N+1 — ต้องเป็น query เดียวสำหรับ 1 วัน (แก้ตามของ P5: `place_names` แยกตารางจริง)

⚠️ **แก้ตัวเองรอบนี้** — ร่างแรกของหัวข้อนี้เสนอ `jsonb name_i18n` คอลัมน์เดียวแทนตาราง `place_names`
แยก โดยให้เหตุผลแค่ "ภาษามีไม่กี่ภาษา ไม่คุ้มแยก" แต่ **ไม่ได้ชั่งกับความต้องการค้นหา** — พอเทียบกับ
`copilot-spec.md` §9.3 (P5) แล้วข้อเสนอ `jsonb` แพ้ชัด 2 จุดที่งานนี้ต้องการจริง:

1. **ค้นชื่อแบบ fuzzy ต้องมี `pg_trgm` index บนคอลัมน์ `text` เดียว** — เคส 6 ของ copilot ("ผู้ใช้พิมพ์ชื่อ
   เกาหลีที่ก๊อปมาจาก IG") ต้องการ trigram match ข้ามภาษา ซึ่งทำบน `jsonb` ได้ไม่ตรงและช้ากว่ามาก
   เทียบกับ index เดียวบน `place_names.name` ตามที่ P5 เสนอ
2. **หลายชื่อต่อภาษาเดียวกัน** (ชื่อทางการ/ชื่อที่คนเรียกจริง/ชื่อป้าย) เก็บใน `jsonb` แบบ 1 key ต่อ
   locale ไม่ได้เลย ต้องมีแถวแยกกันจริง — ตรงกับที่ P5 ระบุว่าโครงสร้างคอลัมน์ตายตัวเก็บข้อนี้ไม่ได้

**ยอมรับ: `catalog.place_names(place_id, locale, name, is_primary, source)` แยกตารางตามที่ P5 เสนอ**
ความเสี่ยง N+1 ที่เหลือจึงไม่ใช่เรื่อง "แยกตารางกี่ตาราง" (ยังแยกอยู่) แต่อยู่ที่ **ยิง query กี่ครั้ง**
ต่อการ resolve stop 1 วัน — โค้ดปัจจุบันเสี่ยงเพราะ `resolvePlace.ts` lookup ทีละ id จาก object ใน
หน่วยความจำ ถ้าย้ายไปฐานแล้วยังทำ `SELECT ... WHERE id = ?` วนลูปต่อ stop จะกลายเป็น N query ต่อวันทันที

**แนะนำ:** batch stop ids ของ 1 วันก่อน แล้ว query เดียว —
```sql
select p.*, jsonb_agg(jsonb_build_object('locale', pn.locale, 'name', pn.name, 'is_primary', pn.is_primary))
from catalog.places p
left join catalog.place_names pn on pn.place_id = p.id
where p.id = any($ids)
group by p.id
```
รวมชื่อทุกภาษาต่อ place มาในแถวเดียวด้วย `jsonb_agg` ฝั่ง SQL — ยังเป็น **query เดียว** สำหรับทั้งวัน
แม้ตารางจะแยกจริง เพราะ N+1 เกิดจากจำนวนรอบ query ไม่ใช่จำนวนตารางที่ join

### 9.4 PWA/offline — 🔴 ข้อที่ P1 บอกว่าสำคัญที่สุด: **ย้ายลงฐานจะทำให้ `/today` ใช้ offline ไม่ได้ถ้าไม่ทำอะไรเพิ่ม**

เช็ค `public/sw.js` แล้ว: วันนี้คลัง**ไม่ได้ถูกแคชเพราะเป็น "ข้อมูล"** แต่ได้ offline มา**ฟรีเป็นผลพลอยได้**
จากข้อ 9.1 — มันฝังอยู่ใน JS chunk ซึ่งตรง `cacheFirst` (sw.js:117-119, แคชทุกอย่างใต้ `/_next/static/`)
พอย้ายคลังออกจากบันเดิลไปเป็น DB fetch เอฟเฟกต์ฟรีนี้หายทันที ไม่มี fallback อัตโนมัติ

- หน้า HTML เองก็ไม่ได้ precache (sw.js:38 คอมเมนต์ไว้ตรงๆ ว่าตั้งใจไม่ทำ เพราะด่าน PIN ตอบ 307) —
  ใช้ `networkFirst` ที่แคชเฉพาะตอนเปิดจริงตอนมีเน็ต (sw.js:107-109) ดังนั้นถ้าคลังไหลมาทาง **server
  component ที่ render ฝังใน HTML** ของหน้าที่เคยเปิดออนไลน์แล้ว ก็ยัง offline ได้เหมือนเดิมตามสัญญา
  เดิมของเฟส 18 ("เปิดหน้าที่เคยดูตอนมีเน็ตแล้ว") — **แต่ถ้าคลังไหลมาทาง client-side fetch หลัง mount
  (เช่นยิง `/api/catalog/places` ใน `useEffect`)** จะไม่ผ่านทั้ง `networkFirst` (ไม่ใช่ navigate) และไม่ผ่าน
  `cacheFirst` ของ static asset (ไม่ใช่ `/_next/static/`) — หลุดช่องว่างตรงกลาง ต้อง fail เงียบๆ ตอนไม่มีเน็ต
- **ข้อเสนอ 2 ทาง เลือกทางเดียว อย่าทำครึ่งๆ:**
  1. ให้ catalog data เดินทางผ่าน server component/RSC payload ที่ฝังมากับ HTML ของ `/today`/`/summary`
     เหมือนเดิม (ไม่ fetch แยกฝั่ง client) — offline ยังทำงานฟรีผ่าน `networkFirst` เดิม ไม่ต้องแก้ sw.js
  2. ถ้าจำเป็นต้อง fetch แยก (เช่นเพราะ `use cache` ทำงานง่ายกว่าผ่าน route handler) ต้องเพิ่ม path นั้น
     เข้า `CACHEABLE_API` ใน sw.js (ตอนนี้มีแค่ photo/details/travel-time/weather) แล้วใช้ `cacheFirst`
     เหมือนกลุ่มนั้น — เป็นงานบรรทัดเดียวใน sw.js แต่**ต้องเป็นการตัดสินใจตอนออกแบบ ไม่ใช่ค้นพบทีหลังตอน
     มีคนบ่นว่า `/today` ในอุโมงค์ไม่ขึ้นสถานที่**
- **ไม่กระทบ DDL ของ `E2`** — ข้อนี้เป็นเรื่อง data-fetching pattern (fetch ฝั่งไหน) ไม่ใช่โครงสร้างตาราง
  ตอบเพื่อให้ทีมตัดสินใจตอนเขียนโค้ดจริงใน E3 ไม่ใช่ตัวบล็อก DDL ของ E2

#### 🔴 เกณฑ์ผ่านของ `E2`/`E3` สำหรับข้อนี้ (ตามที่ P1 ขอ — ประโยคเดียว วัดได้)

> **เปิด `/today` ตอนมีเน็ตอย่างน้อย 1 ครั้งหลังย้ายคลังลงฐานแล้ว จากนั้นปิดเน็ต (DevTools offline หรือ
> โหมดเครื่องบิน) แล้วโหลด `/today` ซ้ำ — ชื่อ/รูป/พิกัดของทุกจุดแวะที่เคยแสดงตอนออนไลน์ต้องขึ้นครบ
> เหมือนเดิม ไม่มีจุดไหนว่างหรือค้าง "กำลังโหลด" ค้างตลอดไป**

เทียบเท่าพฤติกรรมวันนี้ก่อนย้าย (ซึ่งผ่านเกณฑ์นี้อยู่แล้วโดยบังเอิญเพราะข้อ 9.1) — ใช้เป็น regression
test ก่อน/หลัง `E3` ได้ตรงๆ ไม่ต้องเขียนเกณฑ์ใหม่ แค่ทำให้ยังผ่านต่อหลังย้าย เพิ่มเป็น manual QA step
ใน `backlog.md` ได้เลย (อัตโนมัติเป็น Playwright + `context.setOffline(true)` ได้ในเฟสถัดไปถ้า P4 ต้องการ)

---

## 10. รายงาน (ยังไม่แก้) — cache key ฝั่ง client ที่ไม่มี user/session ผูกอยู่ (ตอบ P1 ข้อ ②)

ไล่ทุกจุดที่เรียก `readCache`/`writeCache` จาก `lib/localCache.ts` (localStorage, ตาม comment ในไฟล์
เอง — เก็บไว้ให้ offline อ่านได้ตามเฟส 18) พบ **8 hook** ทั้งหมดคีย์ด้วย `planId` เป็นอย่างมาก **ไม่มีจุด
ไหนใส่ user/session id เข้าไปในคีย์เลยสักจุด**:

| hook | key ที่ใช้จริง | ผูก planId ไหม | ผูก user ไหม |
|---|---|---|---|
| `useStops.ts` | `` `stops:${planId}` `` | ✅ | ❌ |
| `useDaySettings.ts` | `` `daySettings:${planId}` `` | ✅ | ❌ |
| `usePlaceNotes.ts` | `` `placeNotes:${planId}` `` | ✅ | ❌ |
| `usePlans.ts` | `"plans"` | ❌ | ❌ |
| `useOvernightOverrides.ts` | `"overnightOverrides"` | ❌ | ❌ |
| `useBookings.tsx` | `"bookings"` | ❌ | ❌ |
| `useHotels.tsx` | `"hotels"` | ❌ | ❌ |
| `useCustomPlaces.tsx` | `"customPlaces"` | ❌ | ❌ |

**อ่านผลตรงๆ:** 3 hook ผูก planId แล้ว (เสี่ยงน้อยกว่า — ต้องสลับ user ที่เห็นทริปเดียวกันถึงจะชน) แต่
**5 hook ไม่ผูกอะไรเลยแม้แต่ planId** — เครื่องเดียวกันเปิดคนละทริปยังชนกันได้อยู่แล้ววันนี้ ก่อน RLS
จะเข้ามาอีก พอ RLS จริงเปิด (คนละ user เห็นคนละชุดทริป/ข้อมูล) ทั้ง 8 จุดนี้เสี่ยงเหมือนกันหมดในความหมาย
ที่ P1 พูดถึง: สลับบัญชีบนเครื่องเดียวกัน (หรือ 2 คนใช้เครื่องเดียวกันคนละช่วงเวลา) แล้วอ่านของคนก่อนหน้า
จาก localStorage ทันที เพราะไม่มี field ไหนให้เช็คว่า "แคชนี้เป็นของ user คนนี้จริงไหม"

**นอกขอบเขตของปัญหานี้ — พบระหว่างไล่แต่ไม่ใช่ประเภทเดียวกัน:** `hooks/usePlaceNamesEn.ts` มีแคชของ
ตัวเอง (module-level `Map`, ไม่ผ่าน `localCache.ts`, ไม่ persist ข้าม reload) คีย์ด้วย place-name query
string — ข้อมูลนี้คือชื่ออังกฤษของสถานที่จาก Google (ข้อมูลสาธารณะ ไม่ผ่าน RLS ไม่ใช่ของรายคน) จึงไม่ใช่
ความเสี่ยงชนิดเดียวกับตารางด้านบน ไม่ต้องรวมในการนับ

**ยังไม่แก้ตามที่ P1 สั่ง** — รอดูว่า P1 อยากแก้แบบไหน (เติม `userId`/`sessionId` เข้าคีย์ทุกจุด vs.
ล้างแคชทั้งหมดตอน sign-out/sign-in vs. ย้ายไปพึ่ง `use cache: private` แทนทั้งหมดตาม §2 เมื่อถึง `E3`)
ก่อนลงมือแก้จริง

---

## 11. ตัดสิน — offline cache ของไฟล์ตั๋ว (`booking-files`) หลัง signed URL เป็นของจริง (`E2-AC13` ③)

⚠️ **แก้ 25 ส.ค. 2026 — พิกัดที่ P1 ส่งมารอบแรกผิด, P7 ไล่โค้ดแล้วเจอ (`mobile-arch.md §11.15` ·
`b639eae`):** `sw.js:112-119` (`CACHEABLE_API` + `/_next/static//icon`) **ไม่แตะไฟล์ตั๋วเลย** และ
`b.file_url` วันนี้ยิงตรงไป origin ของ Supabase bucket ซึ่งโดน `if (url.origin !== self.location.origin)
return;` (`sw.js:103`) กันไว้ตั้งแต่ต้นทาง — ตกท้าย fetch handler โดยไม่มี `respondWith` เลย **SW ไม่เคย
แคชไฟล์ตั๋วมาตั้งแต่แรก** ไม่ใช่ regression ที่เพิ่งเกิด แต่เป็นฟีเจอร์ที่ไม่เคยมีอยู่ — ตอนที่ผมเขียนหัวข้อ
นี้รอบแรกผมเชื่อพิกัดที่ P1 ส่งมาโดยไม่ได้เปิด `sw.js` เทียบเองว่าโค้ดจริงตรงกับคำอธิบายไหม **เป็นความผิด
ของผมด้วยเหมือนกัน ไม่ใช่แค่ P1** — บทเรียน: อ้างเลขบรรทัดจากข้อความคนอื่นได้ แต่ต้องเปิดไฟล์ยืนยันเองก่อน
เขียนเป็นข้อสรุปเสมอ ไม่ใช่แค่ตอนอ่านโค้ดของตัวเอง

**สิ่งที่ยังจริงและยังมีค่า — งานออกแบบข้างล่างนี้ทั้งหมดยังใช้ได้ แค่เปลี่ยนกรอบเวลา:** ไม่ใช่ "แก้บั๊กตอนนี้"
แต่เป็น "ออกแบบไว้ล่วงหน้าก่อนย้าย `file_url` → signed URL จริงตอน `E7`" เหตุผลเดิมยังตรง: **ตอนย้ายจริง**
`createSignedUrl()` คืนลายเซ็นใหม่ทุกครั้ง → ถ้าใครเผลอคีย์แคชด้วย URL เต็มตอนนั้น จะไม่มีวัน hit เหมือนเดิม
ทุกประการ — งานนี้คือการวางกันไว้ล่วงหน้า ไม่ใช่การแก้ของที่พังอยู่

**🔴 P7 ยกกฎที่แรงกว่าเหตุผลเดิมของผม และผมรับเป็นข้อบังคับ — ไม่ใช่แค่ "match ไม่ติด" แต่คือ security:**
> **signed URL คือ bearer credential** — ใครถือสตริงนั้นเปิดไฟล์ได้โดยไม่ต้องล็อกอิน ไม่ผ่าน policy สักตัว
> (P1 พิสูจน์เอง: `createSignedUrl(path, 60)` → `fetch()` ไม่ล็อกอิน → HTTP 200)

**ดังนั้นทางแก้ต้องไม่ใช่แค่ "คีย์แคชให้ตรง" แต่ต้อง "ไม่มี signed URL string ไปอยู่ในแคชเลยแม้แต่ตัวเดียว"**
— ตัดตัวเลือก "เซ็นอายุยาวแล้วแคช URL" ทิ้งทันที (P7/P1 ห้ามเด็ดขาด, ตรงกับที่ผมก็จะไม่เสนออยู่แล้วเพราะ
design ข้างล่างไม่เคยให้ signed URL หลุดออกมาถึง browser/SW เลยสักจุด — ตรวจซ้ำแล้วว่ายังจริง)

**🔴 ตัดสิน: ห้ามคีย์แคชด้วย signed URL ตรง ๆ เด็ดขาด — ต้องมี stable path คั่นกลาง**

เหตุผลที่ตัดตัวเลือกอื่นออก:
- **เก็บ blob เองใน IndexedDB** ทำได้แต่ทิ้ง infra `cacheFirst`/`networkFirst` ที่มีอยู่แล้วทั้งหมด ต้อง
  เขียน storage layer คู่ขนานใหม่ทั้งชุด (list/evict/quota) สำหรับปัญหาที่จริง ๆ แก้ด้วยแคช URL ปกติได้
  ถ้า URL เป็น stable string — ไม่คุ้มความซับซ้อนที่เพิ่ม
- **ยอมรับว่าออฟไลน์เปิดตั๋วไม่ได้** ทิ้งของที่เฟส 18 ลงทุนไว้ทั้งหมดโดยไม่จำเป็น เพราะปัญหาแก้ได้จริง

**แนวที่เลือก: proxy route คงที่ต่อ booking, เซิร์ฟเวอร์เซ็น URL สดทุกครั้งที่ถูกเรียก**
```
GET /api/booking-file/{tripId}/{bookingId}   ← path นี้เองที่ SW แคช ไม่ใช่ signed URL ที่มันไปเรียกข้างใน
```
- ⚠️ **แก้จากรอบก่อน:** path เดิมที่เสนอคือ `/api/booking-file/{bookingId}` เฉย ๆ — เติม `{tripId}` นำหน้า
  เข้าไปตอนนี้ เพราะ **SW ต้อง parse tripId จาก URL path ได้เองตรง ๆ ไม่งั้นต่อ `E6-AC6` ไม่ได้** (SW ไม่มี
  ทาง query DB ว่า bookingId นี้เป็นของทริปไหน) เขียน path ให้ถูกตั้งแต่แรกจะได้ไม่ต้องเปลี่ยน shape ทีหลัง
- Route handler (`app/api/booking-file/[tripId]/[bookingId]/route.ts` — **อยู่ใน `app/api/` โซนของ P1**)
  เรียก `createSignedUrl()` **ข้างในเซิร์ฟเวอร์** แล้ว **stream ไฟล์กลับมาเป็น
  body ของ response นี้เอง — ห้าม `redirect()` ไปยัง signed URL ตรง ๆ** เพราะ `isStorable()` ใน `sw.js`
  (บรรทัด `!response.redirected`) ที่กันไม่ให้แคช `/unlock`/`/auth/callback` ทับ จะกันเส้นนี้ไม่ให้ถูกแคช
  ด้วยเหตุผลเดียวกันถ้าเป็น redirect — ต้อง stream เนื้อไฟล์ตรง ๆ ถึงจะแคชได้
- **TTL 60 วินาทีของ signed URL ไม่ใช่ปัญหาอีกต่อไป** เพราะ TTL นั้นอยู่ "ข้างใน" การเรียกของ route
  handler เท่านั้น — ฝั่ง browser/SW ไม่เคยเห็น signed URL เลย เห็นแค่ path คงที่ที่ไม่มีวันหมดอายุ

### สัญญาของ route ที่ P1 ขอ — ให้เขียนตามได้โดยไม่ต้องถามกลับ

**Method / path:** `GET /api/booking-file/{tripId}/{bookingId}` เท่านั้น (SW กรองแค่ `GET` อยู่แล้ว —
`sw.js:98`) · ไม่มี query string ใด ๆ ในเส้นทางนี้ — ถ้ามีพารามิเตอร์เพิ่มในอนาคต (เช่น thumbnail size)
ให้เป็น path segment ไม่ใช่ query เพราะ query string ต่างกันจะกลายเป็นคีย์แคชคนละอันโดยไม่ตั้งใจ

**สิทธิ์ — ต้องเช็คก่อนเรียก `createSignedUrl()` เสมอ ไม่ใช่ปล่อยให้ signed URL เป็นด่านเดียว:**
route ต้องยืนยันจาก session cookie ของผู้เรียกเองว่า user คนนี้เป็นสมาชิกของ `tripId` และ `bookingId`
เป็นของทริปนั้นจริง **ก่อน** เรียกเซ็น — มิฉะนั้น path คงที่นี้เองจะกลายเป็นทางเลี่ยง RLS ของ bucket private
ทั้งบัคเก็ต (ใครเดา `tripId`/`bookingId` ถูกก็ขอไฟล์ได้โดยไม่ต้องมีสิทธิ์จริง) — นี่คือเหตุผลที่ต้องรอ `E3`
มี DAL/session จริงตามที่ P1 ว่า ไม่ใช่แค่เรื่องฐานข้อมูลผิด

**Header ที่ response ต้องมี (200 เท่านั้น):**
| header | ค่า | เหตุผล |
|---|---|---|
| `Content-Type` | ชนิดไฟล์จริงจาก storage object (เช่น `image/jpeg`, `application/pdf`) | ต้องส่งต่อจาก signed URL response ตรง ๆ ไม่ hardcode — `isImageAttachment()` (`lib/url.ts`) ที่ใช้อยู่แล้วต้องแยกรูปกับ PDF ให้ถูก |
| `Content-Disposition` | `inline; filename="<file_name จาก booking>"` | `inline` ให้เปิดในหน้าเว็บ/viewer เหมือนพฤติกรรม `<img src>`/`<a href>` วันนี้ ไม่ force-download |
| `Cache-Control` | `private, no-store` | **สำคัญ:** กัน HTTP cache ของ browser/proxy เก็บไฟล์ที่มีสิทธิ์เฉพาะคนไว้เอง — ไม่ขัดกับที่ `sw.js` จะแคชผ่าน `cache.put()` เพราะ Cache Storage API **ไม่อ่าน `Cache-Control` เลย** เป็นคนละกลไกกัน — ตั้งใจให้ SW เป็นเจ้าของการแคชเพียงชั้นเดียว ไม่ใช่ให้ HTTP cache ปกติแอบเก็บซ้ำ |
| `Content-Length` | ถ้ารู้ขนาดจริงจาก storage metadata | ไม่บังคับ แต่ช่วย progress/UX ถ้ามีข้อมูลอยู่แล้ว |

**403/404/401 — ห้าม SW แคชคำตอบ error เด็ดขาด:**
ไม่ต้องเขียนโค้ดกันเพิ่มฝั่ง `sw.js` เลย **ถ้า route คืน HTTP status code จริง** (`403`/`404`/`401`)
แทนที่จะคืน `200` พร้อม body `{ error: "..." }` — `isStorable()` ที่มีอยู่แล้ว (`sw.js:56-58`) เช็ค
`response.status === 200` อยู่แล้ว จึงกรอง error ออกจากการแคชโดยอัตโนมัติไม่ต้องแก้อะไรเพิ่ม **ข้อแม้
เดียวคือ route ต้องไม่ใจดีคืน 200 ให้กรณี error เพื่อความง่ายฝั่ง client** — ถ้าทำแบบนั้นจะหลุด guard ทันที
· แนะนำ (ไม่ใช่บังคับ เป็นเรื่อง auth design ของ P1): คืน `404` ทั้งกรณี "ไม่มีไฟล์นี้" และ "มีแต่ไม่มีสิทธิ์"
เพื่อไม่ให้รู้ได้ว่า resource มีอยู่จริงไหมจากรหัสตอบ — เป็นข้อเสนอ ไม่ใช่สัญญาที่ SW ต้องพึ่ง

**Cache name — scope เมื่อ `E6-AC6` มาถึง:** ตอนนี้ (ก่อน `E6-AC6`) ใช้ cache แบบ flat ไปก่อนได้
(`booking-files-v1` เข้ากลุ่ม `ALL_CACHES` เดิม) — พอ `E6-AC6` ลง SW จะ parse `tripId` จาก **path segment
แรกหลัง `/api/booking-file/`** ตรง ๆ (ไม่ต้องแก้ route หรือ header ใด ๆ เพิ่ม เพราะ tripId อยู่ใน URL แล้ว
ตามสัญญานี้) มาประกอบเป็น `booking-files-${tripId}-v1` — เป็นเหตุผลที่ path ต้องมี tripId ตั้งแต่วันแรก

**เมื่อ route มีจริง:** ผมเพิ่ม path นี้เข้ากลุ่มที่ผ่าน `cacheFirst` ใน `sw.js` ทันที (แพทเทิร์นเดียวกับ
`CACHEABLE_API` ปัจจุบัน) — ฝั่งผมพร้อมเสมอ รอแค่ route ตามสัญญานี้เท่านั้น

**สรุปสั้น:** เปลี่ยนจาก "คีย์ด้วย URL" เป็น "คีย์ด้วย path คงที่ที่เซิร์ฟเวอร์เซ็น URL สดให้ทุกครั้ง"
— ใช้ infra เดิม (`cacheFirst`) ได้ทั้งหมดและไม่มี signed URL หลุดไปถึง browser เลยสักจุด (ตรงกับกฎของ
P7 ข้างบน) **ของที่ขอจาก P1: ใครสร้าง route handler นี้** ผมรับผิดชอบส่วน `sw.js` ต่อเมื่อ route พร้อม

### ตอบข้อเสนอของ P7 — "เตรียมไว้ใช้ตอนไม่มีเน็ต" แบบ explicit ต่อทริป

**เห็นด้วยกับหลักการเต็มที่** — เหตุผลของ P7 (*"มีตั๋วออฟไลน์ก็ต่อเมื่อบังเอิญเคยกดดู = รู้ว่าไม่มีตอนอยู่
หน้าเคาน์เตอร์แล้ว"*) ตรงประเด็นกว่าการพึ่ง lazy caching ล้วน ๆ จริง — `cacheFirst` แบบเดิมของ `sw.js`
เป็น "เผื่อไว้เฉย ๆ" ไม่ใช่ "รับประกัน" ระดับที่ของสำคัญแบบตั๋วต้องการ

**แย้งเฉพาะเรื่อง IndexedDB — เสนอทางที่ใช้ของเดิมมากกว่า ไม่ใช่เพราะ IndexedDB ผิด แต่เพราะไม่มีเหตุผล
ที่ต้องมี storage 2 ระบบคู่ขนานสำหรับปัญหานี้:**
- ปุ่ม "เตรียมไว้ใช้ตอนไม่มีเน็ต" ทำเป็น **eager warm-up** ได้เลย: ไล่ยิง `GET /api/booking-file/{id}`
  (หัวข้อบน) ทุก booking ของทริปนั้น ให้ `cacheFirst` ที่มีอยู่แล้วเก็บลง `Cache Storage` ตามปกติ — ได้
  พฤติกรรม "รับประกันว่าพร้อม" แบบเดียวกับที่ P7 ต้องการ โดยไม่ต้องเขียน storage layer ใหม่ (list/evict/
  quota) คู่ขนานกับที่ `cacheFirst`/`ALL_CACHES` มีอยู่แล้ว
- `Cache Storage` กับ `IndexedDB` **ใช้ quota เดียวกันของ origin และโดน evict ตามนโยบายเดียวกัน** —
  ไม่มีข้อได้เปรียบด้าน durability ที่ทำให้ต้องเลือก IndexedDB เพื่อ "กันหาย" โดยเฉพาะ (ทั้งคู่ต้องพึ่ง
  `navigator.storage.persist()` เหมือนกันถ้าอยากกันเบราว์เซอร์ evict ตอนพื้นที่ตึง) — เรียก `persist()`
  ตอนผู้ใช้กดปุ่มนี้ครั้งแรกก็พอ ไม่ต้องเปลี่ยน storage backend เพื่อเหตุผลนี้
- **จุดที่ IndexedDB ยังมีประโยชน์จริง (ไม่ขัดกับข้างบน):** เก็บ **manifest เล็ก ๆ** (`bookingId` →
  `preparedAt`/ขนาดไฟล์) แยกจากตัวไฟล์เอง สำหรับ**แสดงสถานะในหน้า UI** ("เตรียมแล้ว 4/5 ตั๋ว" เป็นต้น) —
  `Cache Storage` ไม่มี API สำหรับ query metadata แบบนี้สะดวก แต่ manifest นี้เล็กมาก (ไม่ใช่ตัวไฟล์)
  ใช้ `localStorage`/`readCache`-`writeCache` เดิม (§10) ก็พอ ไม่จำเป็นต้องเป็น IndexedDB เต็มรูปแบบ
- **สรุปที่เสนอกลับ:** ปุ่มของ P7 + proxy path ของผม ทำงานร่วมกันได้ตรง ๆ ไม่ต้องเลือกอย่างใดอย่างหนึ่ง —
  ต่างกันแค่ "ตัวไฟล์เก็บที่ไหน" (`Cache Storage` ผ่าน `cacheFirst` เดิม ไม่ใช่ IndexedDB) ส่วน UX ที่ P7
  ต้องการ (explicit, รู้สถานะ, ไม่ใช่ lazy) ได้เต็มเหมือนกันทั้งสองแบบ

### สถานะ `E6-AC6`/`E6-AC8` ที่ P1 ถาม

- **`E6-AC6` (แคชแยกรายทริป):** ยังไม่ได้ทำ — แผนอยู่ใน §5 อยู่แล้ว (เขียนไว้ก่อนหน้านี้) รวมกับดัก
  `ALL_CACHES` ที่ P1 เพิ่งเตือนซ้ำ — เขียนไว้ตรงกันแล้ว ไม่ใช่เรื่องใหม่ ยังไม่ลงมือเพราะไม่มี tripId
  ให้ SW รู้จักจริงจนกว่า routing `/trip/[tripId]/...` (หัวข้อ 3) จะมาก่อน — ทำตอนนั้นเป็นก้อนเดียวกัน
  สมเหตุสมผลกว่าทำ 2 รอบ
- **`E6-AC8` (route ที่ SW ห้ามแคชเด็ดขาด):** แก้บางส่วนแล้ววันนี้ (`platform`, ยังไม่ commit ตอนเขียน
  บรรทัดนี้) — เพิ่ม `/auth/callback` เข้าเส้นทางที่ SW ข้ามทั้งหมดใน `sw.js` (แพทเทิร์นเดียวกับ `/unlock`)
  เหตุผล: มันเป็น one-shot redirect ที่เขียนคุกกี้ session — `isStorable()`'s `!response.redirected`
  น่าจะกันไม่ให้ถูกแคชทับอยู่แล้ว แต่ตัวมันเองเสี่ยงบั๊กคนละแบบที่ SW เจอกับทุก redirect เสมอ (URL bar
  ค้างที่ URL เดิมแต่เนื้อหาเป็นปลายทาง) จึงยกเว้นทั้งเส้นแทนที่จะพึ่งแค่ guard เดิม — **ยังไม่ได้ทดสอบ
  จริงกับ OAuth/magic-link flow เต็ม** (ต้องมี session จริงกับ engine-dev) รายงานตามที่ทำได้ตอนนี้:
  syntax ผ่าน ตรรกะตรงกับแพทเทิร์น `/unlock` ที่มีอยู่แล้ว แต่ยังไม่ใช่ end-to-end verified

---

## 12. `storageKeyOf` ของ P1 — รับตัว utility แต่ไม่รับจุดที่เสนอให้ต่อ (`sw.js` โซนผม, ตัดสินตามที่เชิญ)

`lib/engine/storageKey.ts` (`storageKeyOf`, ไม่ import อะไรเลยตามที่ P1 ตั้งใจ) แก้ปัญหาจริงและแก้ถูก:
คีย์ด้วย **ตัวตนของไฟล์ (path)** แทน URL ที่เปลี่ยนทุกครั้งที่เซ็น — ตรงกับบั๊ก 9.1 ที่ P7 เจอใน
`hotelLegs.ts` เป๊ะ (คีย์ด้วยแถว/เวลาแทนตัวตนที่แท้จริง) เห็นด้วยว่าเป็น utility ที่ควรมี

**แต่ท่าที่เสนอ — `cacheFirst` intercept signed URL โดยตรงใน `sw.js` แล้วคีย์ด้วย `storageKeyOf(url)` —
ผมไม่รับ** ด้วยเหตุผล 2 ข้อที่เป็นเรื่องของโซนนี้โดยตรง ไม่ใช่แค่ความชอบ:

1. **`<img src>`/`<a href>` ชี้ตรงไป signed URL วันนี้ (ยืนยันแล้ว ไม่มีจุดไหนตั้ง `crossOrigin` เลย —
   `grep crossOrigin` ทั้งทรี = 0 ผลลัพธ์) → browser ยิงเป็น request โหมด `no-cors` โดยอัตโนมัติ** ถ้า
   `sw.js` แคะ request นี้มาเอง response ที่ได้จะเป็น **`opaque`** เสมอ ไม่ว่า Supabase จะตั้ง CORS header
   ถูกหรือไม่ — opaque response **อ่าน `status`/`ok` ไม่ได้เลย** แปลว่าแยกไม่ออกว่า fetch สำเร็จจริงหรือ
   ได้ 403/404 กลับมา ถ้าแคชแบบนี้ **ความล้มเหลวชั่วคราวจะถูกแคชถาวรเหมือนความสำเร็จ โดยไม่มีทางรู้เลย** —
   นี่คนละชนิดกับ URL-mismatch ที่ `storageKeyOf` แก้ ต่อให้คีย์ถูกแล้วก็ยังพังจากข้อนี้อยู่ดี
2. **ต้องเจาะ cross-origin exception เข้า `sw.js:103`** (`url.origin !== self.location.origin` ที่กัน
   Supabase/Google ทั้งหมดไว้ตั้งใจ — คอมเมนต์บรรทัด 101-102 บอกเหตุผลไว้แล้ว) เฉพาะสำหรับ path นี้ —
   เปิดช่องที่เคยเป็นเส้นแบ่งชัดเจน (same-origin = SW จัดการได้ / cross-origin = ไม่แตะ) ให้เริ่มมีข้อยกเว้น

**โปรเจกต์นี้มีคำตอบของปัญหานี้อยู่แล้ว และเป็นแบบเดียวกับที่ผมเสนอใน §11 พอดี:** `/api/place-photo`
(`app/api/place-photo/route.ts`) คือรูปแบบมาตรฐานที่มีอยู่แล้วสำหรับ "ทรัพยากรภายนอกที่ต้องแคชได้" —
สตรีมผ่าน route ของแอปเอง (same-origin) คืน `Content-Type`/`Cache-Control` เอง คืน `NextResponse.json`
สถานะ error ไม่ใช่ 200 — เมื่อเป็น same-origin แล้ว response type คือ `"basic"` เสมอ อ่าน `status` ได้ตรง
`isStorable()` เดิมทำงานถูกต้องโดยไม่ต้องแก้อะไรเพิ่ม `booking-file` proxy ใน §11 เดินตามแพทเทิร์นเดียวกัน
นี้อยู่แล้ว — ไม่ต้องเจาะ cross-origin exception เลยสักจุด

**สรุปการตัดสิน:** เก็บ `storageKeyOf` ไว้ใช้ — แต่ใช้ **ฝั่งเซิร์ฟเวอร์ในตัว route `/api/booking-file/…`
เอง** (แก้ปัญหา "คอลัมน์เดียวกันถือ URL เก่า/path ใหม่ปนกัน" ตอนต้องรู้ว่าจะเซ็น path ไหน — ตรงกับที่ P1
ออกแบบไว้แต่แรก) **ไม่ใช่เอามาคีย์แคชใน `sw.js` โดยตรง** เพราะ path คงที่ของ proxy เองก็ทำหน้าที่เป็นคีย์
แคชที่เสถียรอยู่แล้วโดยไม่ต้องพึ่ง `storageKeyOf` เลยที่ชั้นนี้ — ไม่มีอะไรใน `sw.js` ต้องแก้เพิ่มจากที่ตกลง
ไว้ใน §11 · ไม่ copy ฟังก์ชันเข้า `sw.js` ตามที่เสนอ

⚠️ **นอกเรื่องที่เจอระหว่างอ่าน `lib/__tests__/signedFiles.test.ts`:** เคสสุดท้าย ("URL ที่มี query string
ต่อท้าย") คอมเมนต์เขียนว่า *"path ที่ได้ต้องไม่กลายเป็น 'a.png?w=400'"* แต่ assertion ข้างล่างคือ
`toBe("a.png?w=400")` — คอมเมนต์กับโค้ดขัดกันเอง ไม่แน่ใจว่าตั้งใจตรึงพฤติกรรมปัจจุบันไว้เตือนล่วงหน้า
หรือพิมพ์ผิด ไม่ใช่ไฟล์ของผม ไม่แตะ แค่รายงานให้ P1 ดู

---

## 13. ตัดสิน — สิทธิ์ที่ถูกถอดหลังไฟล์ถูกแคชแล้ว (`/api/booking-file/[...path]` พร้อมใช้จริงแล้ว, `3bcd9b8`)

P1 สร้าง route ตามสัญญาใน §11 ครบ (path เป็น `[...path]` catch-all แทนที่จะเป็น `{tripId}/{bookingId}`
2 segment ตรง ๆ ตามที่ผมเขียนไว้ — เทียบกันแล้ว **ตรงตามเจตนา** เพราะ storage key ที่แท้จริงคือ
`{trip_id}/<ไฟล์>` อยู่แล้ว segment แรกของ `[...path]` ก็คือ tripId เหมือนเดิม SW parse ได้แบบเดียวกัน
ไม่ต้องแก้อะไรจากแผนเดิม) และยกคำถามกลับมา 2 ข้อที่เป็นของโซนนี้จริง ๆ

**① `cache.put()` ไม่สนใจ `Cache-Control: private, max-age=60` — นโยบายเก็บนานแค่ไหนเป็นของ `sw.js` เอง:**

🔴 **ตัดสิน: ใช้ `networkFirst` กับ path นี้ ไม่ใช่ `cacheFirst`** — ต่างจากที่คุยกันไว้ก่อนหน้า (§11 บอก
"เพิ่มเข้ากลุ่มที่ผ่าน `cacheFirst`") แก้ตรงนี้เพราะเพิ่งเห็นผลจริงของความต่างระหว่างสองฟังก์ชัน:

- `cacheFirst` (ที่ `CACHEABLE_API`/asset ใช้อยู่) ตอบจากแคชก่อนเสมอแล้วค่อย revalidate เบื้องหลัง —
  เหมาะกับข้อมูล**สาธารณะ/แทบไม่เปลี่ยน** (รูปสถานที่, เวลาเดินทาง) ที่ "ตอบช้าไปหน่อยเพราะกำลัง
  revalidate" ไม่ใช่ปัญหา แต่ **ไฟล์ตั๋วเป็นข้อมูลรายคนที่สิทธิ์เปลี่ยนได้** (ถูกถอดจากทริป) — ใช้
  `cacheFirst` แปลว่า **ผู้ใช้ที่ถูกถอดสิทธิ์แล้วยังเปิดตั๋วเดิมได้ต่อไปแม้ตอนออนไลน์อยู่** เพราะ SW ตอบ
  จากแคชก่อนเช็คกับเซิร์ฟเวอร์เสมอ — นี่ไม่ใช่แค่ "offline ช้ากว่าปกติ" แต่เป็นช่องที่สิทธิ์ไม่ถูกบังคับใช้
  จริงระหว่างที่มีเน็ตอยู่
- `networkFirst` (ที่ `SHELL_CACHE`/navigate ใช้อยู่แล้ว) ยิง fetch จริงก่อนเสมอ — **`fetch()` ที่ได้ 404
  กลับมาไม่ throw** (`sw.js`'s `networkFirst` เช็ค `catch` เฉพาะตอน fetch ล้มเหลวจริง ๆ เช่นไม่มีเน็ต) →
  ตอนออนไลน์ ผู้ใช้ที่ถูกถอดสิทธิ์จะได้ **404 จริงจากเซิร์ฟเวอร์ตรง ๆ** ไม่ใช่ตั๋วเก่าจากแคช เพราะ
  `isStorable()` ปฏิเสธ status ≠ 200 อยู่แล้ว โค้ดเดิมไม่ต้องแก้อะไรเพิ่มเพื่อให้พฤติกรรมนี้เกิด — แค่
  เรียก `networkFirst` แทน `cacheFirst` สำหรับ path นี้เท่านั้น
- **residual risk ที่ยอมรับ (เขียนไว้ให้ชัดตามที่ P1 ขอ ไม่ให้เป็นของค้นพบทีหลัง):** ถ้าผู้ใช้**ออฟไลน์
  จริง**ตอนที่สิทธิ์เพิ่งถูกถอด `networkFirst` จะ fallback ไปเสิร์ฟตั๋วเก่าจากแคชเหมือนเดิม (เพราะ
  `fetch()` throw จริงตอนไม่มีเน็ต) — **ยอมรับความเสี่ยงนี้โดยตั้งใจ** เพราะไม่มีระบบออฟไลน์ไหนเช็ค
  revocation ได้โดยไม่มีเน็ต (Signal/WhatsApp ก็เก็บข้อความที่เคยเห็นก่อนถูกเตะออกจากกลุ่มไว้แบบเดียวกัน)
  และตรงกับขอบเขต "offline อ่านอย่างเดียว" ที่ทั้งไฟล์ประกาศไว้ตั้งแต่บรรทัด 2 อยู่แล้ว — ต่างจากปัญหา
  ข้อ ① ตรงที่ข้อนั้นเกิด**แม้มีเน็ต** ซึ่งไม่มีเหตุผลให้ยอมรับ ส่วนข้อนี้เกิดเฉพาะตอนไม่มีเน็ตซึ่งเป็น
  ข้อจำกัดพื้นฐานที่หลีกเลี่ยงไม่ได้จริง ๆ

**② 404 ที่แยก "ไฟล์หาย" กับ "หมดสิทธิ์" ไม่ได้ — ตัดสิน: เคลียร์แคชได้ปลอดภัยทั้งสองความหมาย ไม่ต้องแยก:**

P1 เขียนไว้ถูกว่าที่ชั้น `sw.js` แยกสองความหมายของ 404 นี้ไม่ได้ — แต่ **ไม่จำเป็นต้องแยก** เพราะทั้งสอง
ความหมายให้ผลลัพธ์เดียวกันสำหรับคำถาม "ควรลบแคชไหม": ไฟล์หายไปแล้ว → ลบถูก · หมดสิทธิ์แล้ว → ก็ควรลบ
เหมือนกัน (ผู้ใช้ไม่ควรมีสิทธิ์เปิดออฟไลน์ต่อไปหลังหมดสิทธิ์แล้วเช่นกัน) **ไม่มีกรณีไหนที่ 404 แปลว่า
"ควรเก็บแคชไว้ต่อ"** จึงเคลียร์ได้ตรง ๆ โดยไม่ต้องรู้ความหมายที่แท้จริง — 🔴 **ข้อแม้เดียว:** ต้องเป็น 404
ที่มาจาก `networkFirst`'s try block (คือตอน**ออนไลน์**และเซิร์ฟเวอร์ตอบจริง) เท่านั้น ถ้าเป็น 404 ที่ถูก
คืนจาก fallback ตอนออฟไลน์ (`cache.match()` คืนของเก่า) ไม่ต้องทำอะไรเพิ่ม เพราะนั่นไม่ใช่คำตอบใหม่จาก
เซิร์ฟเวอร์ — implementation: ใน `try` block ของ `networkFirst` เพิ่มเงื่อนไข "ถ้า `response.status===404`
ให้ `cache.delete(request)` ก่อน return" แยกจาก `isStorable()` เดิม (ซึ่งคุม แค่ "ควร put เพิ่มไหม" ไม่ใช่
"ควร delete ของเก่าไหม" เป็นคนละคำถามกัน)

**สรุปที่ต้องทำตอน `E3` (ไม่ใช่ตอนนี้ — ตรงกับที่ P1 บอกว่ายังไม่มีอะไรต้องทำตอนนี้):**
1. path `/api/booking-file/` เข้ากลุ่ม **`networkFirst`** ไม่ใช่ `cacheFirst` (แก้จากแผนเดิมใน §11)
2. เพิ่มการ `cache.delete()` เมื่อ response จาก network จริงคือ 404 (เฉพาะใน `networkFirst`'s try block)
3. cache name ยังตาม §11 เดิม (flat ก่อน `E6-AC6`, ค่อย scope ด้วย tripId จาก path segment แรกทีหลัง)

### ⚠️ แก้ตาม (`f2c54e4`) — HTTP cache ของ browser เปิดช่องเดียวกันซ้ำจากอีกชั้น

P1 ตรวจ `sw.js` จริงแล้วยืนยันว่า `networkFirst`/`isStorable()` ทำงานถูกทุกบรรทัดตามที่ตัดสินไว้ — แต่
`Cache-Control: private, max-age=60` ที่ตั้งไว้ตอนแรกใน route เปิดช่องเดียวกัน (สิทธิ์ถูกถอดแต่ยังได้ 200
ตอนออนไลน์) ซ้ำอีกทีจาก**ชั้น HTTP cache ของ browser เอง** ซึ่งอยู่ **ก่อน** ที่ `fetch()` ของ `networkFirst`
จะไปถึง route ด้วยซ้ำ — ไม่มีใครเขียนผิด แค่ไม่มีใครเห็นทั้งสองฝั่งพร้อมกันตอนตัดสิน (P1 เรียกว่า `D46` อีกตัว)
แก้เป็น `private, no-store` แล้ว — ปิดเฉพาะ HTTP cache ไม่กระทบ `cache.put()` ของ SW เลย (Cache Storage
ไม่อ่าน `Cache-Control`)

**ตอบคำถามที่ P1 ทิ้งไว้ — `no-store` แพงเกินไปไหมสำหรับ `networkFirst`:** ไม่ ยืนยันเก็บ `no-store` ไว้
ไม่ลดทอนด้วย microcache สั้น ๆ เหตุผล: (1) ตั๋วเป็นทรัพยากรที่เปิดไม่บ่อยต่อทริป ไม่ใช่ hot path แบบรูป
สถานที่ที่เปิดเป็นร้อยครั้ง/เซสชัน — `rate limit` ที่ P1 ตั้งไว้ต่ำกว่า `place-photo` (120 vs 400) ก็สะท้อน
ความคาดหวังนี้อยู่แล้ว (2) จุดประสงค์ทั้งหมดของการเลือก `networkFirst` เหนือ `cacheFirst` คือให้ทุกครั้งที่
ออนไลน์เช็คสิทธิ์ใหม่จริง — เติม microcache สั้น ๆ กลับเข้าไปคือเปิดหน้าต่างเดิมที่เพิ่งปิดไปคืนนี้ซ้ำอีก
รอบ แค่แคบลง ไม่ใช่ปิดจริง ไม่คุ้มกับการประหยัด request ที่ไม่บ่อยอยู่แล้ว

---

## 14. รูปของ route ที่ `E3-AC1` ต้องใช้ (ตอบก่อน P1 ลงมือ `useCustomPlaces` ตัวแรก)

**บริบท:** `E3-AC1` ไม่ใช่แค่ย้ายที่รัน — สคีมาใหม่ (`custom_places.city_id`/`custom_place_names` ฯลฯ)
คนละรูปกับ type ที่แอปทั้ง 15+ ไฟล์ใช้อยู่ (`city`/`name_th`/`name_en` ฝังในแถวเดียว) P1 เสนอ route
handler เป็นตัวแปลงรูป (`เก่า ⇄ ใหม่`) ที่จุดเดียว ไม่แก้ 15 ไฟล์ — เห็นด้วยกับแนวทางนี้เต็มที่ ตรงกับ
"แอปใช้ได้ตลอด" ที่ผู้ใช้สั่ง ตอบ 3 ข้อที่เป็นของโซนนี้ตามที่ P1 ขอ

### ① Path convention — แยกตาม scope ไม่ใช่ path เดียวสำหรับทุก resource

**Trip-scoped resources (ส่วนใหญ่ — `custom_places`/`stops`/`hotels`/`bookings`/`checklist_items`/…):**
```
app/api/engine/trips/[tripId]/<resource>/route.ts
```
ไม่ใช่ `app/api/engine/<resource>/route.ts` เฉย ๆ ตามที่ร่างไว้ — เหตุผล: `E3-AC6` บังคับว่า **การเช็ค
สมาชิกภาพต้องเกิดนอกและก่อน**ฟังก์ชันที่ถูกแคช/DAL — route จึงต้องรู้ `tripId` จาก **path** เพื่อเช็คก่อน
เรียก `lib/engine/db.ts` เสมอ (แบบเดียวกับที่ `/api/booking-file/{tripId}/…` ทำอยู่แล้ว — ใช้ pattern
เดียวกันทั้งระบบ ไม่ใช่คิดใหม่) ไม่ใช่ query param ซึ่งเผลอลืม validate ง่ายกว่า path segment ที่บังคับ
โดยโครง Next routing เอง — และ path นี้จะสะท้อนโครง `/trip/[tripId]/...` ของหน้าเว็บเองพอดี (หัวข้อ 3)

**Account-scoped resources (ไม่มี tripId เดียวให้ยึด — มีแค่ `usePlans.ts`):**
```
app/api/engine/plans/route.ts
```
ไม่ซ้อน `trips/[tripId]` เพราะ resource นี้ **คือรายการทริปที่ผู้ใช้เห็น** — ยังไม่รู้ tripId ก่อนเรียก

**Method ต่อ resource เดียวกัน ไม่ใช่ route แยกตาม operation:** `E3-AC1` นับรวม**ทั้งอ่านและเขียน** (67
บรรทัดรวม `.insert()`/`.update()` เช่น `addCustomPlace` ด้วย ไม่ใช่แค่ `.select()`) — 1 ไฟล์ route ต่อ
resource จัดการทุก method (`GET` อ่าน, `POST` insert, `PATCH`/`DELETE` ตามที่ hook เดิมมี) แทนที่จะแยก
`route.ts` ต่อ operation — ตรงกับ REST convention ปกติของ Next App Router อยู่แล้ว ไม่ต้องคิดโครงใหม่

### ② Realtime — ปัญหาจริงไม่ใช่ "สองเส้นทาง" แต่คือ "สองเส้นทางแปลงรูปคนละที่"

`E3-AC3` อนุญาต anon key ฝั่ง realtime ไว้แล้ว (พร้อมเหตุผลกำกับ) — **ไม่ต้องย้าย subscribe เข้า route**
เพราะ Supabase Realtime บังคับ RLS ผ่าน JWT ของผู้ใช้เองอยู่แล้วที่ชั้น DB ปัญหาจริงที่ P1 ชี้ไม่ใช่เรื่อง
สิทธิ์ (RLS คุมอยู่แล้วทั้งสองเส้นทาง) แต่คือ **รูปข้อมูล**: initial fetch ผ่าน route ได้รูป**เก่า**ที่ route
แปลงให้แล้ว แต่ `postgres_changes` payload (`payload.new`/`payload.old`) เป็นแถวดิบจากสคีมา**ใหม่**ตรง ๆ
ไม่ผ่านการแปลงเลย — โค้ด merge เดิม (`hooks/useCustomPlaces.tsx` บรรทัด "const row = payload.new as
CustomPlace") จะพังทันทีเพราะ cast ผิดรูป ไม่ใช่แค่ type error แต่เป็นรูปข้อมูลจริงที่ต่างกัน

**ทางแก้: แยกฟังก์ชันแปลงรูป (`เก่า ⇄ ใหม่`) ออกมาเป็นโมดูลกลาง ไม่ผูกกับ server-only import เดียวกับ
`lib/engine/storageKey.ts`** — เพราะต้องถูกเรียกจาก**สองที่**: ฝั่งเซิร์ฟเวอร์ (`lib/engine/db.ts` ตอน
ประกอบ response ของ route) และฝั่ง**client** (ใน handler ของ `postgres_changes` เดิมในแต่ละ hook ตอน
รับ `payload.new`/`payload.old` ดิบ) — ถ้าฝั่งไหนพึ่ง `supabase-js`/`next/headers`/อะไรที่รันฝั่งเดียว
ได้จะใช้ร่วมกันไม่ได้ทันที (บทเรียนเดียวกับที่ `storageKeyOf` เจอตอนแรกทุกประการ — `Node.js detected but
native WebSocket not found`) เขียน adapter (เช่น `lib/engine/adapters/customPlace.ts`) เป็น pure
function ไม่ import อะไรที่ผูก environment แล้วให้ทั้ง route และ realtime handler ของ hook import ตัว
เดียวกัน — รับประกันว่าไม่ว่าข้อมูลจะมาทางไหน (initial fetch ผ่าน route หรือ delta ผ่าน realtime ตรง)
ก็ผ่านการแปลงรูปเดียวกันเป๊ะ ไม่มีจุดที่สองเส้นทางเห็นข้อมูลคนละรูป

### ③ แคช — `no-store` ทั้งหมด ไม่มีข้อยกเว้น

ตรงกับที่ตัดสินไว้แล้วสำหรับ `/api/booking-file/…` (§13) แต่เหตุผลหนักกว่า: ข้อมูลกลุ่มนี้ (`trip_stops`
`trip_hotels` `bookings` ฯลฯ) **sync สดระหว่างคน 2 คนพร้อมกัน** (`PLAN.md:57`) เปลี่ยนบ่อยกว่าไฟล์ตั๋วมาก
— HTTP cache แม้สั้นแค่ไหนก็เสี่ยงเห็นข้อมูลเก่าระหว่างที่อีกคนกำลังแก้ ตรงข้ามกับสิ่งที่ realtime ทั้งระบบ
พยายามป้องกันอยู่แล้ว **ไม่ต้องชั่งน้ำหนักเรื่องต้นทุน request แบบ booking-file** เพราะข้อมูลกลุ่มนี้ไม่ได้
"เปิดไม่บ่อย" เหมือนตั๋ว — เปิดทุกครั้งที่ใช้แอป แต่ route handler เอง**ใช้ `'use cache'`/`'use cache: private'`
ไม่ได้อยู่แล้วตามข้อจำกัดที่เขียนไว้ในหัวข้อ 2** (`use cache` ใช้ได้เฉพาะ Server Component/Action ไม่ใช่
Route Handler) จึงไม่มีทางเลือกอื่นนอกจาก `Cache-Control: private, no-store` ทุก route ในกลุ่มนี้ตั้งแต่
ตัวแรก — `'use cache: private'` ตาม `D11`/`E3-AC6` เป็นคนละชั้น (Server Component ที่**อ่าน DAL ตรง**
ไม่ผ่าน Route Handler) ซึ่งเป็นทางเลือกสถาปัตยกรรมของ `E5`/หลังจากนี้ ไม่ใช่สิ่งที่ต้องตัดสินตอนนี้

---

## 15. `payload.old` ตอน `DELETE` — ปลอดภัย · แต่เจอกับดักที่ใหญ่กว่าที่ถามระหว่างตรวจโค้ดจริง

**ตอบคำถามที่ถามตรง ๆ ก่อน: `payload.old.id` ตอน `DELETE` ใช้ต่อได้ ไม่มีกับดัก** — Postgres ส่ง `OLD`
ของ `DELETE` มาแค่คอลัมน์ replica identity (ปกติคือ PK) เว้นแต่ตั้ง `REPLICA IDENTITY FULL` ไว้ · โค้ด
เดิมไม่เคยเรียก `toCustomPlace(payload.old)` เลย ใช้แค่ `.id` กรองออกจาก state ตรง ๆ — **ถูกทางแล้ว
เพราะ DELETE ไม่ต้องรู้รูปข้อมูล ต้องรู้แค่ตัวตนที่จะเอาออก** กฎที่ควรตรึงไว้: **ห้ามเรียก `toCustomPlace`
(หรือ adapter อื่นในตระกูลเดียวกัน) กับ `payload.old` เด็ดขาดไม่ว่ากรณีไหน** เพราะไม่รู้ล่วงหน้าว่า
replica identity ของตารางไหนตั้งไว้ยังไง ปลอดภัยที่สุดคือไม่พึ่งเลย

**🔴 แต่ระหว่างเปิด `db.ts`/`customPlaceShape.ts` เพื่อตอบข้อนี้ เจอกับดักที่ใหญ่กว่าที่ถูกถามและยังไม่มี
ใครถาม — INSERT/UPDATE ก็พังเหมือนกัน ไม่ใช่แค่ DELETE:**

`customPlaceRowsOfTrip()` (`db.ts`) ทำ **join** ผ่าน PostgREST embedded resource
(`catalog_cities(legacy_slug)`, `custom_place_names(locale, name, priority)`) — นี่คือของที่ `toCustomPlace`
ต้องมีถึงจะได้ชื่อ/เมืองที่ถูกต้อง **`postgres_changes` ไม่มีทาง join ได้เลยไม่ว่ากรณีไหน** (ส่งมาจาก WAL
เป็นแถวดิบของ**ตารางเดียว** ที่เปลี่ยน ไม่ใช่ผลของคิวรี) → `payload.new` ตอน INSERT/UPDATE บน `custom_places`
**ไม่มีคีย์ `catalog_cities`/`custom_place_names` อยู่เลย** (ไม่ใช่ `null` — ไม่มีคีย์นั้นในอ็อบเจกต์เลย)

**ผลที่เกิดถ้าเรียก `toCustomPlace(payload.new)` ตรง ๆ (ตามที่ท่าที่วางแผนไว้ตอนแรกจะทำ):**
- `pickName(undefined, locale)` → `(undefined ?? [])` = `[]` → คืน `null` ทุกภาษา
- `name_th` ตกไปที่ fallback ว่าง (`?? ""`) → **สถานที่ที่เพิ่ง insert/update ผ่าน realtime จะโชว์ชื่อว่าง**
- `city` ตกไปที่ `row.city_id` (uuid ดิบ) เหมือนเคส "เมืองไม่มี legacy_slug" ที่ตั้งใจรองรับไว้อยู่แล้ว
  แต่คราวนี้เกิดกับ**ทุกแถว** ไม่ใช่แค่เมืองใหม่บนแพลตฟอร์ม
- **หน้าตา:** component render สำเร็จ ไม่มี error, ไม่มี type error (เพราะ cast ผ่าน `as`/type assertion
  ปกติของ payload) — ดูเหมือนใช้งานได้ แค่ชื่อหาย ตรงกับรูปแบบ "เขียวแต่ไม่ถูก" ที่ทีมนี้ไล่จับมาทั้งสัปดาห์
  (`P-64`, `D46`) เพียงแต่รอบนี้เกิดจากข้อจำกัดของ Realtime เอง ไม่ใช่ comment/assertion ขัดกัน

**🔴 ตัดสิน: INSERT/UPDATE ทาง realtime ต้องไม่ transform payload เอง — ต้อง refetch ผ่าน route แทน**

เหตุผลที่เลือกทางนี้แทนการ subscribe เพิ่มตาราง `custom_place_names`/`catalog_cities` แล้ว merge เอง
ฝั่ง client: ต้องคง**การ join ไว้ที่จุดเดียว** (`db.ts`) ไม่งั้นกลายเป็นเขียน join logic คู่ขนานฝั่ง client
อีกชุด (เสี่ยง drift กับฝั่งเซิร์ฟเวอร์แบบเดียวกับที่ `storageKeyOf` หลีกเลี่ยงไว้ทั้งหมด) และคลังสถานที่
ของทริปหนึ่งมีแค่ "หลายสิบแถว" (comment ใน `db.ts` เอง) ไม่ใช่ resource ที่เปลี่ยนถี่แบบ `trip_stops` —
ต้นทุนการ refetch ทั้งลิสต์ต่ำกว่าความเสี่ยงของ join สองที่มาก

**รูปที่เสนอสำหรับ `useCustomPlaces` (และ resource อื่นที่ adapter พึ่ง join ข้ามตาราง — ต้องเช็คเป็นรายตัว
ไม่ใช่ทุก resource เป็นแบบนี้):**
- `eventType === "DELETE"` → ใช้ `payload.old.id` กรองออกจาก state ตรง ๆ เหมือนเดิมทุกประการ ไม่มี
  adapter เกี่ยวข้อง
- `eventType === "INSERT" | "UPDATE"` → **ไม่แตะ `payload.new` เลย** ใช้เป็นแค่สัญญาณ "มีอะไรเปลี่ยน"
  แล้วยิง `fetch()` ไปที่ `GET /api/engine/trips/[tripId]/custom-places` ซ้ำ (debounce สั้น ๆ ถ้าหลาย
  event เข้ามาติดกัน) แทนที่ optimistic local merge — ได้รูปที่ถูกต้อง 100% เพราะผ่าน join จริงเสมอ
  ราคาที่จ่าย: latency เพิ่มขึ้นเล็กน้อยต่อการเปลี่ยนแปลง (ยอมรับได้ เพราะไม่ใช่ resource ที่แก้ถี่)

⚠️ **ไม่ใช่ท่าที่ใช้ได้กับทุก resource ใน `E3-AC1`:** resource ที่ adapter ไม่ต้อง join ข้ามตาราง (แถวเดียว
พอ) น่าจะยังเรียก adapter กับ `payload.new` ตรง ๆ ได้ปลอดภัย — ต้องเช็คทีละ resource ตอนถึงคิวว่า adapter
ของมันพึ่ง embedded resource ใน `db.ts` หรือไม่ ก่อนตัดสินว่าจะ merge locally ได้หรือต้อง refetch แบบนี้
