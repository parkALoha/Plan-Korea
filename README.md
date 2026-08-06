# แพลนเที่ยวเกาหลี

เว็บสำหรับวางแพลนทริปเกาหลี ให้ 2 คนเลือกสถานที่/ร้านอาหาร จัดลำดับแต่ละวัน ดูรูป/คลิปประกอบ
sync กันแบบเรียลไทม์ผ่าน Supabase แล้วใช้เว็บเดียวกันนี้เปิดดูระหว่างเที่ยวจริงในเกาหลีด้วย

**สถานะและแผนงานฉบับเต็มอยู่ที่ [`PLAN.md`](./PLAN.md) — อ่านไฟล์นั้นก่อนเริ่มงานใหม่ทุกครั้ง**
(ไฟล์นี้เก็บแค่ข้อมูลตั้งต้นสำหรับรันโปรเจกต์)

## รันโปรเจกต์

```bash
npm run dev     # เปิดเว็บที่ localhost:3000
npm run lint    # ตรวจ ESLint ก่อน commit/ก่อนบอกว่าเสร็จเสมอ
```

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Supabase (ฐานข้อมูล + realtime sync, ไม่มีระบบล็อกอิน)
+ Google Places API (New) สำหรับค้นหาสถานที่/รูป/พิกัด + dnd-kit สำหรับลากจัดลำดับ

## โครงสร้างไฟล์หลัก

- `app/page.tsx` — หน้าเว็บหลัก (แสดงทุกวันของทริป + คลังสถานที่ + จัดการแผน)
- `app/api/*` — API routes ฝั่งเซิร์ฟเวอร์ที่คุย Google Places (เก็บ `GOOGLE_MAPS_API_KEY` ไม่ให้หลุดไป browser)
- `components/` — UI (DayStopsSection, PlaceSidebar, HotelLegsPanel, modal ต่างๆ)
- `hooks/` — state ที่ sync กับ Supabase (useStops, usePlans, useHotels, useDaySettings ฯลฯ)
- `lib/` — โค้ดช่วยฝั่งเซิร์ฟเวอร์/ทั้งคู่ (`googlePlaces.ts`, `schedule.ts`, `hotelLegs.ts`, `supabase.ts`)
- `data/places.ts`, `data/itinerary.ts` — ข้อมูลตั้งต้นของทริป (สถานที่คัดสรร + วัน/เมือง)
- `supabase/migrations/*.sql` — ต้อง copy-paste รันเองใน Supabase Dashboard → SQL Editor เรียงเลขไฟล์
  (ต้องยืนยันกับผู้ใช้ทุกครั้งว่ารันแล้วหรือยัง — ห้ามเดาจากชื่อไฟล์ ดูสถานะจริงใน `PLAN.md`)

## ข้อจำกัดสำคัญที่ต้องรู้ก่อนแก้โค้ด

- **ห้ามเรียก Google Maps API ตระกูล legacy** (`maps.googleapis.com/maps/api/*`) — คีย์โปรเจกต์นี้เปิดใช้เฉพาะ
  ตระกูลใหม่ (`places.googleapis.com`, และ `routes.googleapis.com` เมื่อเปิดใช้) เรียกผ่าน `lib/googlePlaces.ts`
- Google **ไม่ให้เส้นทางขับรถ/เดินในเกาหลีใต้** (กฎหมายส่งออกข้อมูลแผนที่) ได้แค่ขนส่งสาธารณะ — ดูรายละเอียด
  และแผนรับมือใน `PLAN.md`
- Next.js เวอร์ชันนี้มี breaking change จากที่เคยรู้จัก — อ่าน `node_modules/next/dist/docs/` ก่อนใช้ API ที่ไม่แน่ใจ
