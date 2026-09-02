# สถาปัตยกรรมเป้าหมาย — Dynamic Travel Platform Engine

> เจ้าของ: **P1-Lead** · เขียน 17 ส.ค. 2026 · สถานะ: **ร่างระยะออกแบบ ยังไม่ลงมือ**
> อ่าน `docs/engine/README.md` ก่อน — มีกติกาเหล็ก 5 ข้อและข้อเท็จจริงพื้นฐาน

---

## 0. คำถามหลักที่เอกสารนี้ตอบ

> "ทำยังไงให้เว็บที่ออกแบบมาเพื่อทริปเดียว 11 วัน 2 คน รับทริปประเทศไหนก็ได้ กี่คนก็ได้
> โดยไม่เขียนใหม่ทั้งหมด และไม่พังของที่กำลังจะถูกใช้จริงในอีก 55 วัน"

คำตอบสั้น: **เปลี่ยนแกนของโมเดลข้อมูล + ใส่ identity + ย้ายจุดตัดสินใจเรื่องประเทศจาก type ไปเป็นข้อมูล**
โดยเก็บ domain logic ที่มีเทสต์คุมอยู่แล้วทั้งก้อน

---

## 1. เปลี่ยนแกน: จาก "แผน" เป็น "ทริป"

### 1.1 แกนวันนี้

```
trip_meta (แถวเดียว id=1) ──> active_plan_id ──> trip_plans
                                                     │
                                    trip_stops ───────┤ plan_id
                                    trip_day_settings ┤ plan_id
                                    place_notes ──────┘ plan_id

trip_hotels · bookings · checklist_items · hidden_places   ← ลอย ไม่มี scope อะไรเลย
```

`day_id` เป็นสตริงตายตัว `"d0"`…`"d10"` ที่ผูกกับ `ITINERARY` ใน `data/itinerary.ts`
ซึ่งฝังวันที่ `2026-10-11` … `2026-10-21` ไว้ตรงๆ · **ไม่มีคอลัมน์ `trip_id` ที่ไหนเลยใน 14 ตาราง**

### 1.2 แกนใหม่

```
auth.users ──> profiles
                  │
                  ├──< trip_members >──┐
                  │                    │
               trips ──────────────────┘
                  ├──< trip_countries          (ทริปเดียวหลายประเทศ)
                  ├──< trip_plans              (แผน A/B ยังอยู่ แต่อยู่ใต้ trip)
                  ├──< trip_days ──< trip_stops
                  ├──< trip_hotels
                  ├──< bookings
                  └──< checklist_items
```

**สิ่งที่เปลี่ยนจริง 6 อย่าง**
1. `trips` เป็น root ของทุกอย่าง — `trip_meta` แถวเดียวถูกกลืนเข้ามา
2. `trip_days` เป็นตารางจริงที่มี `date` + `timezone` — เลิกใช้ `day_id` สตริงตายตัว
3. `trip_members` เป็น**แหล่งความจริงเดียวของสิทธิ์** ทุก RLS policy ยึดจากตารางนี้ตัวเดียว
4. ทุกตารางข้อมูลผู้ใช้ได้ `trip_id` — ปิดช่อง B5 (วันนี้ 4 ตารางลอยไม่มี scope)
5. 🔴 **`order_index` integer → rank key เรียงได้** (ดู D6 ใน README · P7 เสนอ ผมรับ)
   **ข้อบังคับระดับ DDL 3 ข้อ — พลาดข้อ ① แล้วบั๊กหายากกว่าเดิม:**
   - ① **คอลัมน์ rank ต้องเป็น `text COLLATE "C"`** ไม่ใช่ `text` เฉยๆ
     Postgres เรียง `text` ตาม collation ของ DB (ปกติ `en_US.UTF-8`) ซึ่ง**ไม่ใช่ลำดับ byte** →
     ได้ `'a0' < 'A1'` · แต่ JS เทียบ code unit ล้วน (`a`=0x61 · `A`=0x41) → ได้ `'A1' < 'a0'`
     **เซิร์ฟเวอร์กับเบราว์เซอร์เรียงกลับด้านกันอย่างเงียบๆ = บั๊ก 8.1 ในรูปที่หายากกว่าเดิม**
     ต้องกำหนดที่ **คอลัมน์** ห้ามหวังพึ่ง collation ของ database
   - ② **เรียงด้วย `(rank, id)` เสมอ ห้ามเรียงด้วย `rank` เดี่ยว** — คีย์ชนกันเมื่อไหร่ต้องยังได้ลำดับเดียวกันทุกเครื่อง
   - ③ index `(trip_day_id, rank)`
   วันนี้ `hooks/useStops.ts:413-419` ลาก 1 จุดแล้ว**เขียนทับทุกแถวทั้งวันแยกคำขอ** และ
   `sortStops` (`:13-17`) **ไม่มี tie-break** → เลขซ้ำเมื่อไหร่ 2 เครื่องเห็นลำดับไม่ตรงกัน (บั๊ก 8.1)
   rank key ทำให้ลาก 1 จุด = เขียน **1 แถว** และปิดหน้าต่างบั๊กนั้นแม้ตอนออนไลน์
6. 🔴 **`updated_at` ให้ DB trigger เขียน ไม่ใช่ client** (ดู D7) — วันนี้ client ส่งเวลาเครื่องตัวเอง
   **20+ จุดใน 6 hook** ทับ `default now()` · นาฬิกาเครื่องที่ตั้งผิดจะชนะ LWW อย่างเงียบๆ
   · เพิ่ม soft delete ทุกตารางผู้ใช้ไปพร้อมกัน

### 1.3 ตาราง catalog — ย้ายจากไฟล์ TS มาเป็นข้อมูล

| ตารางใหม่ | แทนที่ | หมายเหตุ |
|---|---|---|
| `countries` | `EMERGENCY_BY_COUNTRY` key + `countryOfCity()` | `code` ISO-3166-1 alpha-2 · `default_locale` · `map_provider` |
| `cities` | `City` union + `CITY_NAME_TH/EN` + `CITY_LOCALE` | FK `country_code` · `center_lat/lng` (แทน `cityCenter()` ที่เฉลี่ยพิกัดจาก `PLACES`) |
| `places` | `data/places.ts` (1,207 บรรทัด ~71 KB · **วัดแล้ว: 164,524 B / 47,229 B gzip ถึง client จริง** — P3) | → `catalog.places` · 🔴 **ไม่ยุบรวมกับ `custom_places`** (`D53` กลับคำ §1.4) |
| `transfer_points` | `data/transferPoints.ts` | `transfer_kind: airport\|station` |
| `emergency_contacts` | `data/emergency.ts` | FK `country_code` |
| `airport_access_options` | `data/airportAccess.ts` | FK `transfer_point_id` |

**เหตุผลที่ต้องย้าย** ไม่ใช่แค่ความสวยงาม: ทุกไฟล์พวกนี้ถูก import จากทุกหน้า (เพราะทุกหน้าเป็น client component)
และ**เพิ่มประเทศต้อง deploy ใหม่ทุกครั้ง = ไม่ใช่ engine** ซึ่งเป็นเหตุผลที่ยืนได้โดยไม่ต้องอ้างตัวเลขขนาดเลย
⚠️ `data/places.ts` = **1,207 บรรทัด / 71,149 bytes ของซอร์ส** — **ไม่ใช่ขนาดที่ขึ้น bundle**
ยังไม่ผ่าน minify/tree-shake/gzip · **ห้ามเอาไปอ้างเป็นตัวเลข bundle** ตัวเลขที่ใช้ตัดสิน E6 ต้องมาจาก analyzer

### 1.4 ~~`places` กับ `custom_places` ต้องยุบเป็นตารางเดียว~~ 🔴 **กลับคำแล้ว 24 ส.ค. 2026 → `D53`**

> 🔴 **ห้ามอ้างหัวข้อนี้เป็นข้อสรุป — ข้อเสนอในนี้ถูกปฏิเสธแล้ว** (`README.md` หัวข้อ `D53`)
> **ตัดสินว่า: แยกตารางเหมือนเดิม** · เหตุผลที่ชี้ขาดคือ**การแคช** ซึ่งตอนเขียนหัวข้อนี้ยังไม่มีใครวัด:
> คลังต้องแคชแบบ public (`use cache` + `catalog_meta(version)`) · `custom_places` sync สดและห้ามหลุดเข้าแคชสาธารณะ
> **ตารางเดียวมี cache policy สองแบบไม่ได้** · และ RLS จะมี 2 รูปทรงในตารางเดียว ซึ่งเป็นรูปแบบที่ทีมเจ็บมาแล้ว
> ⚠️ **ปัญหาที่หัวข้อนี้ชี้ (`resolvePlace` ไล่หา 4 ชั้น) ยังจริงอยู่** — แก้ด้วย `placeRef = {source, id}` ที่ `copilot-spec §2.3` มีอยู่แล้ว **ไม่ใช่ด้วยการยุบตาราง**
> 📌 **P5 เป็นคนจับได้ว่าหัวข้อนี้ขัดกับ `column-map.md`** · ผมเขียนทั้งสองไฟล์เอง และไม่เห็นความขัดแย้งจนมีคนที่ต้องเขียนโค้ดตามทั้งสองไฟล์มาชี้

<details><summary>ข้อเสนอเดิม (เก็บไว้เพราะปัญหาที่มันชี้ยังจริง)</summary>


วันนี้แยกกัน 2 ที่ และ `lib/resolvePlace.ts` ต้องไล่หา 4 ชั้น (`PLACES` → `TRANSFER_POINTS`
→ `hotel@lat,lng` → `custom_places`) เพราะแหล่งข้อมูลกระจาย

**เสนอ:** ตาราง `places` เดียว มีคอลัมน์ `source: curated | user | transfer`
· `owner_trip_id` (null = catalog สาธารณะ, มีค่า = ของทริปนั้น)

</details>
→ `resolvePlace()` เหลือ query เดียว และคลังสถานที่ต่อประเทศโตได้โดยไม่แตะโค้ด

⚠️ **`hotel@lat,lng` เป็น place id สังเคราะห์** (`lib/hotelLegs.ts` `hotelAnchorId()`) ที่ฝังพิกัดไว้ในตัว id
มีเทสต์คุมอยู่ (`hotelAnchorId.test.ts` — เปลี่ยนโรงแรมแล้วต้องได้ cache key ใหม่ ไม่งั้นเป็นบั๊ก 9.1)
ตอนย้ายต้องรักษาพฤติกรรมนี้ไว้ หรือแทนด้วย FK จริงไปที่ `trip_hotels` แล้วอัปเดตเทสต์

---

## 2. Identity & Tenancy

### 2.1 ปัญหาที่ต้องแก้พร้อมกันทีเดียว

`added_by` / `checked_by` / `hidden_by` วันนี้เป็น **ข้อความที่ผู้ใช้พิมพ์เอง** เก็บใน `localStorage["trip-who"]`
เป็นป้าย "ใครเลือก" ไม่ใช่ identity · ต้องเปลี่ยนเป็น FK `→ profiles.id`

### 2.2 โครง

- **Supabase Auth** — email OTP เป็นหลัก (ผู้ใช้ 2 คนเดิมไม่ต้องจำรหัสใหม่) + OAuth เป็นทางเลือก
- `profiles` — `id → auth.users`, `display_name`, `locale`, `home_country`
- `trip_members` — `(trip_id, user_id, role)` · role = `owner | editor | viewer`

### 2.3 RLS — รูปแบบเดียวใช้ซ้ำทุกตาราง

🔴 **P4 เป็นคนเขียน policy จริงทั้งชุด** (`docs/engine/rls-policies.sql`) — คนออกแบบ schema ไม่ควรตรวจงานตัวเอง
ตรงนี้เขียนไว้แค่รูปแบบที่ตกลงกัน:

```sql
-- ต้องเป็น SECURITY DEFINER เพราะ trip_members ต้องอ่านตัวเองเพื่อตัดสินสิทธิ์ตัวเอง
-- ถ้าเขียนเป็น subquery ตรงๆ ใน policy จะเกิด infinite recursion
create function app.can_read_trip(t uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from trip_members
                   where trip_id = t and user_id = auth.uid())
  $$;

create policy trip_stops_rw on public.trip_stops
  using      (app.can_read_trip(trip_id))
  with check (app.can_write_trip(trip_id));
```

🔴 **ชื่อ helper ตัดสินแล้ว: `app.can_read_trip` / `app.can_write_trip`** (ผมเคยเขียน `public.can_access_trip` — **ผิด**)
**เหตุผลเป็นเรื่องความปลอดภัย ไม่ใช่ความสวยงามของชื่อ:** helper ที่อยู่ใน schema `public`
**PostgREST สร้าง `rpc/can_access_trip` ให้อัตโนมัติ** = เป็น **oracle ให้คนยิง uuid มั่วๆ ถามว่าทริปนี้มีอยู่ไหม**
· schema `app` ไม่ถูก expose จึงไม่มีพื้นผิวนี้เลย

⚠️ **ห้าม `force row level security` บน `trip_members`** — จะทำให้ SECURITY DEFINER helper ตกอยู่ใต้ RLS
แล้ว recursion กลับมา และ **error จะโผล่ตอน runtime ไม่ใช่ตอน migrate**

### 2.3.1 🔴 กฎที่พลาดกันบ่อยที่สุด: Server Action **ไม่ใช่** สิทธิ์พิเศษ

**Server Action ที่ใช้ session ของผู้ใช้ ก็รันเป็น role `authenticated` เหมือน browser — RLS ไม่สนว่าคำขอมาจากไหน**

> 🎯 **"ฝั่งเซิร์ฟเวอร์" เป็นคุณสมบัติด้าน*สถานที่* ไม่ใช่คุณสมบัติด้าน*สิทธิ์*** (P5 วินิจฉัยตัวเองหลังชนข้อนี้)
> และเหตุผลผิดที่พาไปหาข้อนี้ — *"เขียนจากเซิร์ฟเวอร์ = ควบคุมได้ = ปลอดภัยกว่า"* —
> **ฟังดูดีพอที่จะผ่านการรีวิวตัวเองได้** ซึ่งเป็นเหตุผลเดียวกับที่จะพาคนเดินไปหา service role ตอน E3
>
> 🎯 **ประโยคเดียวกันใช้กับแคชด้วย** (P5 ต่อยอด) — `'use cache'` ก็ **"อยู่ฝั่งเซิร์ฟเวอร์"** เหมือนกัน
> **แต่ไม่ได้แปลว่าข้อมูลในนั้นผ่านการตรวจสิทธิ์ของคนที่กำลังอ่าน**
> → **§2.3.1 กับ D11/D16 คือเรื่องเดียวกัน**: ทั้งคู่คือการเข้าใจผิดว่า *ที่ตั้ง* = *สิทธิ์*

→ การออกแบบแบบ *"ไม่เปิด UPDATE policy ให้ client แล้วให้ Server Action เขียนแทน"* **ใช้ไม่ได้ พังทุกครั้ง ไม่ใช่บางครั้ง**
(ต่างจากบั๊ก `travel_time_cache` ที่พังเฉพาะตอน race — อันนี้พังทั้งเส้นทาง)
**และ 2 ทางออกที่ดูชัดเจน ผิดทั้งคู่:** เพิ่ม UPDATE policy = เปิดช่องที่ตั้งใจปิดพอดี
· ใช้ service role = ข้าม RLS ทั้งระบบ **ซึ่งเป็นทางที่คนจะเดินเข้าไปด้วยเหตุผลว่า "ก็ตรวจสิทธิ์แล้วนี่"**

✅ **ทางที่ถูก: `SECURITY DEFINER` function ที่ถือทั้งการตรวจสิทธิ์และการเขียนไว้ในทรานแซกชันเดียว**
⚠️ ต้อง**ตรวจสมาชิกเองข้างในทุกครั้ง** เพราะ definer ข้าม RLS ไปแล้ว · ใช้ `for update` ถ้ามีโอกาส 2 คนกดพร้อมกัน

**ตาราง catalog** (`countries`, `cities`, `places` ที่ `owner_trip_id is null`, …) อ่านสาธารณะได้
เขียนได้เฉพาะ service-role — เป็นข้อมูลอ้างอิง ไม่ใช่ข้อมูลผู้ใช้

### 2.4 ต้องแยก Supabase client เป็น 3 ตัว

วันนี้มีตัวเดียว: browser client ด้วย anon key — และ **3 API route ก็ใช้ตัวเดียวกันนี้**
(`app/api/place-details`, `place-photos`, `travel-time` เขียนตาราง cache) **พอเปิด RLS จริงจะพังทันที**

| client | ใช้ที่ไหน | key |
|---|---|---|
| browser | component ที่ต้อง realtime | anon + session ของผู้ใช้ |
| server | Server Component / Server Action | anon + session จาก cookie |
| service-role | เขียน cache สาธารณะ · งาน cron · migration script | `SUPABASE_SERVICE_ROLE_KEY` (**ยังไม่มีในโปรเจกต์**) |

🔴 **service-role key ต้องอยู่ใน `lib/dal/` เท่านั้น** และ `lib/dal/*` ต้องมี `import 'server-only'` ทุกไฟล์

---

## 3. API — จาก client-direct ไป Data Access Layer

### 3.1 ทำไมต้องเปลี่ยน

`node_modules/next/dist/docs/01-app/02-guides/data-security.md` แบ่งวิธีดึงข้อมูลเป็น 3 ชั้น
และระบุว่า **component-level เหมาะกับ prototype และการเรียนรู้เท่านั้น** — ซึ่งคือชั้นที่โปรเจกต์นี้อยู่:
แตะตาราง Supabase **67 จุดใน 13 ไฟล์** ยิงจาก browser **ไม่มีจุดไหนเลยที่ยัด authorization check ได้**
🎯 **แต่กระจุกไม่กระจาย — 10 hooks ถือ 60 จาก 67 (90%) · API route 7 · component ศูนย์** (ดู D10)
→ **E3 คือ "เขียน 10 hooks ใหม่" ไม่ใช่ "ไล่แก้ 67 จุด"** · และ `hooks/` ไม่อยู่ในโซน P2/P3 จึงทำคนเดียวได้ไม่ชนใคร

### 3.2 โครงเป้าหมาย

```
lib/dal/          ← 'server-only' · ที่เดียวในโปรเจกต์ที่แตะ process.env และ service-role key
  auth.ts         export const getCurrentUser = cache(...)   ← React cache() ต่อ request
  trips.ts        getTripDTO() / listTripsDTO()              ← คืน DTO ที่ตัดฟิลด์ลับแล้ว
  stops.ts · places.ts · bookings.ts · hotels.ts
```

- **อ่าน:** Server Component เรียก DAL ตรง
- **เขียน:** Server Actions (Next 16 มี CSRF protection ในตัว)
- **realtime:** ยังยิงจาก browser — แต่อยู่ใต้ RLS จริงแล้ว จึงปลอดภัย

### 3.3 จุดที่ทำให้งานนี้ถูกกว่าที่คิด

🎯 **`lib/writeGuard.ts` เป็น choke point ของการเขียน "ตาราง" — แต่ไม่ใช่ของทุกการเขียน**
ทุก hook (10/10) เขียนผ่าน `writeGuard(label, run)` เพื่อให้ "พังแล้วมีเสียง" (เฟส 20.2)
→ **แปลง `writeGuard` เป็นตัวเรียก Server Action ได้ โดยไม่ต้องไล่แก้ 60 จุดทีละจุด**
ส่วน signature ที่ hook เรียกยังเหมือนเดิม = optimistic update + toast + `reload()` ยังทำงานเหมือนเดิม

🔴 **ข้อยกเว้นที่ผมเขียนผิดไว้ตอนแรก (P4 จับได้ · ยืนยันด้วย grep แล้ว): Storage ไม่ผ่าน `writeGuard` เลยสักจุด**
| | ตาราง (67) | Storage (9) |
|---|---|---|
| `hooks/` | 60 | 0 |
| `components/BookingEditModal.tsx` | 0 | **5 ← โซน P2** |
| `lib/stopPhoto.ts` | 0 | 4 |
| ผ่าน `writeGuard` | ✅ 10/10 hooks | 🔴 **0/9** |

→ **E3 ต้องนับงาน Storage แยกต่างหาก ไม่มี choke point ให้แปลงทีเดียว**
→ **E3 ชนโซน P2 แน่นอน** (ตรงข้ามกับที่ผมเคยบอกว่าไม่ชนใคร)
→ และเส้นทางที่ถือของอ่อนไหวที่สุดในระบบ (ไฟล์ตั๋ว) คือเส้นเดียวที่ไม่มีทั้ง choke point และ RLS จริง

### 3.4 `'use cache: private'` — ตรงกับโจทย์ tenant isolation พอดี

Next 16 มี `'use cache: private'` (ต้องเปิด `cacheComponents: true`) ซึ่ง:
- เข้าถึง `cookies()` / `headers()` / `searchParams` ได้ ต่างจาก `'use cache'` ปกติ
- **ไม่เก็บฝั่งเซิร์ฟเวอร์เลย แคชในหน่วยความจำเบราว์เซอร์เท่านั้น ไม่ข้าม reload**
- เอกสารระบุเองว่าเหมาะกับกรณี *"compliance requirements prevent storing certain data on the server"*

→ ใช้กับข้อมูลรายทริป/รายผู้ใช้ · ส่วนข้อมูล catalog (สถานที่ เมือง ประเทศ) ใช้ `'use cache'` ปกติได้
⚠️ **ใช้ใน Route Handler ไม่ได้** — อีกเหตุผลที่ต้องย้ายการอ่านไป Server Component
⚠️ `stale` ต้อง ≥ 30 วินาทีถึงจะได้ runtime prefetch และ ≥ 5 นาทีถึงจะติดใน App Shell

**กฎ 2 ข้อที่รับมาจาก P3 (17 ส.ค. 2026) — ผูกพันทุกคน:**
1. ฟังก์ชันที่แตะ `cookies()`/`headers()`/session **ต้องเป็น `'use cache: private'` เท่านั้น**
   ห้ามเป็น `'use cache'` ธรรมดา (Next จะ error ให้เองตอน build ซึ่งเป็นตาข่ายชั้นสุดท้าย ไม่ใช่ชั้นแรก)
2. **ทุก `'use cache'` ที่คืนข้อมูลของทริปต้องรับ `tripId` เป็น argument ตรงๆ ไม่ใช่อ่านจาก closure**
   เพราะ argument ที่ serialize ได้จะกลายเป็นส่วนหนึ่งของ cache key อัตโนมัติ — อ่านจาก closure
   แปลว่า cache key ไม่มี tripId = ทริปหนึ่งเห็นข้อมูลอีกทริป
3. 🔴 **ห้ามใส่ข้อมูลที่สิทธิ์การเข้าถึงขึ้นกับผู้ใช้ ลงใน `'use cache'` ธรรมดาเด็ดขาด — ต้องเป็น `'use cache: private'`**
   **cache key ที่ถูกต้องไม่ได้แปลว่าปลอดภัย** เพราะแคชฝั่งเซิร์ฟเวอร์แชร์ข้ามผู้ใช้ และการ hit แคช
   คือการ**ข้าม DB ทั้งก้อน ซึ่งแปลว่าข้าม RLS ไปด้วย**:
   ```
   A (สมาชิกทริป X) เปิดหน้า → miss → DAL ยิง DB ด้วย session ของ A → RLS ผ่าน → เก็บใต้คีย์ ("X")
   B (ไม่ใช่สมาชิก)  เปิด /trip/X → HIT  → ได้ข้อมูลของ A ทันที โดยไม่แตะ DB → RLS ไม่เคยทำงาน
   ```
   → **RLS กันได้แค่ query ที่วิ่งถึง DB จริง** · ชั้นแคชจึงต้องกันเอง
   **กติกา:** ตรวจสมาชิก (`app.can_read_trip`) ต้องเกิด **นอกและก่อน** ฟังก์ชันที่ถูกแคชเสมอ
   · ข้อมูลรายทริป/รายผู้ใช้ → `'use cache: private'` (ไม่เก็บฝั่งเซิร์ฟเวอร์เลย จึงไม่มีอะไรให้รั่ว)
   · `'use cache'` ธรรมดาใช้ได้เฉพาะ **catalog สาธารณะ** (`countries` · `cities` · `places` ที่ `owner_trip_id is null`)
     ซึ่งใครอ่านก็ได้อยู่แล้ว จึงไม่มีขอบเขตสิทธิ์ให้ข้าม

4. 🔴 **ข้อมูลรายทริป/รายผู้ใช้ ห้าม `'use cache: remote'` เด็ดขาด ไม่ว่าตัวเลข perf จะออกมาอย่างไร** (P4 เสนอ · รับ)
   `remote` เป็นแคช **durable แชร์ทุก instance ทุก region ข้าม restart** → ถ้าลืมตรวจสมาชิก **รั่วถาวรกับทุกคน**
   ต่างจาก `use cache` ธรรมดาที่รั่วเป็นช่วงๆ ตาม instance (ทำซ้ำยาก) และต่างจาก `private` ที่รั่วไม่ได้เชิงโครงสร้าง
   ⚠️ **กับดัก:** เอกสาร Next เองแนะนำให้อัปเป็น `remote` เมื่อรู้สึกว่า "DB ถูกยิงบ่อยกว่าที่ควร" ซึ่งเป็นความรู้สึกที่จะเกิดใน E6 พอดี
   **กฎนี้ไม่ต้องแลกอะไรเลย** — เอกสารระบุเองว่าถ้า cache key มีค่าเฉพาะตัวต่อผู้ใช้ **cache utilization เกือบเป็นศูนย์**
   → ข้อมูลรายทริปคือกรณีที่ remote **อันตรายที่สุดและได้ประโยชน์น้อยที่สุดพร้อมกัน**
   ⚠️ **เทสต์ผลลบพิสูจน์อะไรไม่ได้** — `use cache` เก็บ in-memory ต่อ instance "B ไม่เห็นข้อมูล A" อาจเพราะ B ตกคนละ instance
   → ต้องเป็น **static lint เป็นตัวหลัก** (ไฟล์ที่มี `'use cache'` แล้วแตะตารางที่มี `trip_id` = error) · runtime test ต้องบังคับ single-instance

รายละเอียดชั้นแคชทั้งหมดเป็นของ **P3** (`docs/engine/frontend-arch.md`)

---

## 4. Provider Abstraction — หัวใจของ "หลายประเทศ"

### 4.1 หลักฐานว่านี่ไม่ใช่ over-engineering

Google **ไม่คืนเส้นทาง DRIVE/WALK ในเกาหลีใต้** (กฎหมายห้ามส่งออกข้อมูลแผนที่ละเอียด) คืนได้แค่ TRANSIT
— ยืนยันด้วยการทดสอบจริง 6 ส.ค. 2026 · แต่ที่ฮานอย Google ใช้ได้ดีที่สุด

**ความสามารถของผู้ให้บริการต่างกันรายประเทศจริง** และวันนี้ความรู้นี้กระจายอยู่หลายที่ในรูป predicate ตายตัว:
`isKoreanCity()` ใน `data/places.ts` · `countryOfCity()` ใน `data/emergency.ts` · `ALLOWED_LOCALES = ["ko","vi"]`
ใน `app/api/place-details/route.ts` · Naver/Kakao deep link ใน `lib/mapLinks.ts`

### 4.2 รูปแบบ

```ts
// lib/providers/route.ts
export type RouteProvider = {
  id: string;
  supports(country: string, mode: TravelMode): boolean;
  fetch(o: LatLng, d: LatLng, mode: TravelMode): Promise<RealTravelTime | null>;
};
```

`lib/travelProvider.ts` วันนี้เป็นฟังก์ชันเดียว `fetchRealTravelTime()` ที่ห่อ Routes API ครบ
และ**คืน `null` เมื่อไม่มีเส้นทางอยู่แล้ว** — เป็น seam ที่ถูกที่สุดในโปรเจกต์ ยกเป็น provider ตัวแรกได้ทันที
โดยผู้เรียกไม่ต้องเปลี่ยน signature

### 4.3 อีก 4 จุดที่ต้องทำแบบเดียวกัน

| จุด | วันนี้ | เป็นข้อมูลใน |
|---|---|---|
| ลิงก์นำทาง | `lib/mapLinks.ts` — Naver/Kakao hardcode | `countries.map_provider` |
| เบอร์ฉุกเฉิน | `EMERGENCY_BY_COUNTRY: Record<"kr"\|"vn",…>` | `emergency_contacts` |
| ทางไปสนามบิน | `AIRPORT_ACCESS["airport-icn"]` | `airport_access_options` |
| ภาษาที่ขอจาก Google | `languageCode` default `"th"` ตายตัวใน `lib/googlePlaces.ts` | `countries.default_locale` + locale ผู้ใช้ |

⚠️ `PLAN.md §2` ตัดสินแล้วว่า **ไม่เพิ่ม ODsay/Kakao/Naver API** (สมัครยาก ต้องยืนยันตัวตนแบบเกาหลี)
— ออกแบบให้เสียบเพิ่มได้ทีหลัง แต่ **อย่าเสนอให้ทำตอนนี้โดยไม่คุยกับผู้ใช้ก่อน**

---

## 5. Timezone — เรื่องที่วันนี้ยังไม่มีคำตอบเลย

**ไม่มี timezone handling ที่ไหนเลยทั้งโปรเจกต์** — ไม่มีการส่ง `timeZone` เข้า `Intl`/`toLocale*` สักจุด

- `lib/localDate.ts` ประกอบ `YYYY-MM-DD` จาก `getFullYear/Month/Date` ของ **เครื่องผู้ใช้**
  และเขียนกำกับเองว่า: ถ้ามือถือค้างเวลาไทยตอนอยู่เกาหลี `/today` จะโชว์วันก่อนหน้าอยู่ 2 ชั่วโมงแรกหลังเที่ยงคืนเกาหลี
- เวลาทั้งหมดเป็นสตริง `"HH:MM"` แบบไม่มีโซน · `lib/schedule.ts` คำนวณเป็นนาทีนับจากเที่ยงคืน
- ไฟลต์ข้ามเที่ยงคืนใช้ `DayEvent.dayOffset` ไม่ใช่ timezone

**สำหรับทริปเดียวประเทศเดียวนี่คือทางเลือกที่ถูกต้อง** (เรียบง่าย ไม่มีบั๊ก off-by-one จาก UTC)
แต่แพลตฟอร์มที่มีทริปข้ามหลายโซนพร้อมกันต้องตอบให้ได้ว่า:
- "วันนี้" ของผู้ใช้ = โซนไหน — เครื่อง · ประเทศที่กำลังอยู่ · หรือ `trips.base_timezone`
- ทริปที่ข้ามหลายประเทศ วันหนึ่งควรใช้โซนของเมืองไหน → เสนอเก็บ `trip_days.timezone` รายวัน

**ข้อเสนอ:** เก็บ `trips.base_timezone` + `trip_days.timezone` · เวลายังเป็น `"HH:MM"` local เหมือนเดิม
(อย่าเปลี่ยนเป็น UTC — จะทำให้ `lib/schedule.ts` และเทสต์ทั้งชุดพัง โดยไม่ได้อะไรกลับมา)
แล้วใช้ timezone เฉพาะตอนตัดสินว่า "วันนี้คือวันไหน" กับตอนเตือนเรื่องเวลาเท่านั้น

---

## 6. ลำดับการลงมือ (ระยะ 2) และเหตุผลที่ห้ามสลับ

| เฟส | ทำอะไร | ทำไมอยู่ตรงนี้ |
|---|---|---|
| **E0** | branch `engine/main` · Supabase local (Docker) · CI | ต้องมีที่ทดลองที่ไม่ใช่ DB ทริปจริงก่อน |
| **E1** | **Identity + แกนสิทธิ์ขั้นต่ำ** (`profiles`/`trips`/`trip_members` + RLS จริงบน 3 ตารางนี้) + แยก client 3 ตัว | 67 จุดอ่าน/เขียนตรงจาก browser **พังพร้อมกันหมดวินาทีที่ RLS จริงถูกเปิด** ใครทำอย่างอื่นก่อนได้เขียนทิ้ง |
| **E2** | Schema ที่เหลือ + `trip_id` ครบทุกตาราง + RLS ครบ + catalog TS → DB | ต้องมี `trip_id` ก่อน RLS ถึงจะเขียน policy ที่หมายถึงอะไรได้ · **เกณฑ์ 104 เคสอยู่ที่นี่ ไม่ใช่ E1** (D13) |
| **E3** | DAL + Server Actions | ต้องมี identity ก่อน ถึงจะมีอะไรให้ตรวจสิทธิ์ |
| **E4** | Provider registry | ขนานกับ E3 ได้ ไม่ชนกัน |
| **E5** | UI | ต้องรู้ว่าข้อมูลมาจากไหนก่อน |
| **E6** | Perf | ปรับแคชหลังโครงนิ่ง ไม่งั้นปรับซ้ำ |
| **E7** | **ซ้อม migrate ข้อมูลจริง 2 รอบ (บน local)** | เงื่อนไขเดียวที่อนุญาตให้ merge เข้า `main` |
| ~~**E8**~~ | ~~AI Copilot · Mobile~~ | 🔴 **ยกเลิกทั้งเฟส** — ดูใต้ตาราง |

🔴 **`E8` ถูกยกเลิกทั้งเฟส (ผู้ใช้ตัดสิน 2 ก.ย. 2026 · ผ่านเซสชัน P5)** — คำของเขา: ***"ตัดออก เว็บเราจะไม่มี ai"***
· โค้ดถูกลบแล้ว (`lib/copilot/` · P5 · `9260f05`) · **สเปกเก็บไว้เป็นบันทึก ไม่ใช่แผน** (`copilot-spec.md` · `copilot-evals.md` ติดหัวยกเลิกแล้ว)
· ครึ่ง *Mobile* ของแถวนี้ตกไปก่อนหน้าแล้วตั้งแต่ `D14` — **แถวนี้จึงไม่เหลืออะไรเลยทั้งสองครึ่ง**
· ⚠️ **เก็บแถวไว้แบบขีดฆ่า ไม่ลบทิ้ง** — เหตุผลเดียวกับที่ `D14` ทำ: **กันคนย้อนมาเสนอใหม่โดยไม่รู้ว่าคุยจบแล้ว**
· 📌 **เอกสารอื่นยังอ้าง `E8` อยู่อีกหลายไฟล์** (`backlog.md` · `README.md` · `security-review.md` · `mobile-arch.md` · `devops.md` · `frontend-arch.md` · `column-map.md`)
  — **เป็นโซนของเจ้าของแต่ละไฟล์ · แจ้งแล้ว ยังไม่ได้แก้** · อย่าอ่านการที่ยังมีอยู่ว่าเฟสยังไม่ถูกยกเลิก

### 6.1 E7 — เส้นทางย้ายข้อมูลของผู้ใช้เดิม

ทริปเกาหลีวันนี้**ไม่มี user เลย** ตอน migrate ต้อง:
1. สร้าง `profiles` ให้ผู้ใช้ (และคู่เดินทางอีก 1 คน)
2. สร้าง `trips` 1 แถวจาก `data/itinerary.ts` (11–21 ต.ค. 2026) + `trip_members` 2 แถว
3. สร้าง `trip_days` 11 แถวจากวันที่จริง แล้ว map `d0`…`d10` → `trip_days.id`
4. เติม `trip_id` ให้ทั้ง 14 ตาราง · แปลง `added_by` จากข้อความเป็น FK (จับคู่จากค่าที่มีอยู่จริงใน DB)
5. ย้าย `data/places.ts` + `custom_places` เข้า `places` ตารางเดียว
6. **เทียบจำนวนแถวทุกตารางก่อน/หลัง** และเปิด `/summary` เทียบทีละวันกับของเดิม

🔴 **ซ้อมบน Supabase local อย่างน้อย 2 รอบ** — รอบแรกหาสิ่งที่ลืม รอบสองพิสูจน์ว่าสคริปต์ทำซ้ำได้

---

## 6.2 งานหนึ่งของ E2: ไล่คอมเมนต์ที่ "หมดอายุ" เพราะโจทย์เปลี่ยนเป็นแพลตฟอร์ม

โปรเจกต์นี้เขียนเหตุผลกำกับการตัดสินใจไว้ดีผิดปกติ — **ซึ่งแปลว่าตรวจได้จริง ไม่ต้องเดา**
แต่คอมเมนต์ประเภท *"ตัดสินใจไม่ทำ X เพราะ Y"* **มีวันหมดอายุผูกกับ Y** และไม่มีใครกลับมาอ่าน

**เกณฑ์ที่ใช้ (P7 เสนอจากประสบการณ์ตอนแย้ง `PLAN.md §1` จนได้ D6):**
> 🎯 **ถามว่า "สมมติฐานยังจริงไหม" ไม่ใช่ "การตัดสินใจนั้นยังถูกไหม"**
> `PLAN.md §1` ไม่ได้ผิด — มันเขียนเงื่อนไขของตัวเองไว้ชัดว่า *"ไม่คุ้มกับทริป 11 วัน"*
> พอเงื่อนไขเปลี่ยนเป็นแพลตฟอร์ม ข้อสรุปเปิดใหม่ได้**โดยไม่ต้องบอกว่าใครเขียนผิด**

🔴 **กลุ่มที่อันตรายกว่าคือคอมเมนต์ที่ไม่เขียนสมมติฐานกำกับไว้เลย** — รื้อไม่ได้แม้จะหมดอายุแล้ว
เพราะไม่มีอะไรให้เทียบว่าเงื่อนไขเปลี่ยนไปหรือยัง → **ต้องแยกออกมาเป็นรายการต่างหาก ไม่ใช่ข้ามไป**

**ตัวอย่างที่รู้แล้ว 3 จุด:** `PLAN.md §1` offline editing (ถูกสำหรับ 11 วัน · D6 แย้งใหม่แล้ว)
· `public/sw.js:99-101` ตัด cross-origin (ถูกตอนมีทริปเดียว) · `lib/localCache.ts` กลืน quota error เงียบ
(ถูกตอน 5 MB เหลือเฟือ · D17) — **ทั้งสามเป็นการตัดสินใจที่ถูก + เหตุผลที่บันทึกดี + สมมติฐานที่เปลี่ยนไปเงียบๆ**

---

## 7. สิ่งที่ตัดออกจากขอบเขต (อย่าย้อนกลับมาทำเองโดยไม่คุย)

| เรื่อง | สถานะ |
|---|---|
| **งบประมาณ/ค่าใช้จ่าย** | `PLAN.md §1` ตัดออก · **ผู้ใช้ยืนยันซ้ำ 17 ส.ค. 2026 ว่าคงไว้** · ในระบบไม่มีฟิลด์ราคาสักช่อง |
| **offline editing** | ตัดเพราะเปิดปัญหา conflict resolution ทั้งกอง · P7 กำลังทบทวนบนโจทย์ใหม่ |
| **ODsay/Kakao/Naver API** | `PLAN.md §2` ห้ามเพิ่มเองโดยไม่คุย |
| **`google.maps.Marker` deprecated** | หนี้ที่ตัดสินแล้วว่าไม่แก้ก่อนทริป (ต้องใส่ `mapId` ซึ่งเปลี่ยนสไตล์แผนที่ทั้งใบ) · ทบทวนได้ในระยะ 2 |

---

## 8. คำถามที่ยังไม่มีคำตอบ (รอผลจากทีม)

1. **P4** — RLS ทั้ง 53 policy เขียนใหม่แล้วมีตารางไหนอุดไม่ได้ด้วย `trip_members` ตัวเดียวไหม
2. **P3** — `cacheComponents: true` คุ้มไหมกับ dev velocity ที่เสียไป · PPR ใช้ได้จริงบน Vercel Hobby หรือไม่
3. **P6** — Supabase local (Docker) ทดสอบ **Realtime** ได้ครบไหม (แพลตฟอร์มนี้พึ่ง Realtime หนัก — 10 hooks เปิด channel)
4. **P7** — native คุ้มกว่า PWA ที่ผู้ใช้ทดสอบ airplane mode ผ่านแล้วตรงไหน
5. **P5** — ต้องใช้ LLM ตัวไหน ราคาเท่าไร (ยังไม่มี API key ของ LLM ในโปรเจกต์นี้เลย)
6. **P2** — ไล่ภาษาไทยออกจาก JSX 25 ไฟล์ ทำเป็นขั้นยังไงไม่ให้พังกลางทาง
