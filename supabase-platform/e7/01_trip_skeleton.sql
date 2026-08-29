-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · สคริปต์ย้ายข้อมูล — ก้อนที่ 1: โครงทริป (trips · trip_plans · trip_days) │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- 🔴 **ไฟล์นี้อยู่นอก `migrations/` โดยตั้งใจ** — CLI จะได้ไม่หยิบไปรันเอง
--    `E7` เป็นการ *ย้ายข้อมูล* ครั้งเดียว ไม่ใช่การเปลี่ยนสคีมา
--
-- ต้องตั้งก่อนรัน:
--   set e7.owner_uuid = '<uuid ของเจ้าของทริปใน profiles>';
--
-- ค่าคงที่ที่เขียนตายในไฟล์นี้โดยตั้งใจ (`E7-AC3`):
--   d0–d10 → 2026-10-11 … 2026-10-21  · **ห้ามคำนวณสด** คำนวณพลาด = ทั้งทริปเลื่อนวัน
--   ผู้ใช้ยืนยันด้วยตาแล้ว 29 ส.ค. 2026 · หลักฐาน 3 ชั้น: bookings 7 วัน · d7 ถูกบีบ
--   ระหว่าง d6/d8 · weekday ตรงปฏิทินครบ 11 วัน (จับเลื่อน 1–6 วันได้ · 7 วันไม่ได้)
--
-- `E7-AC5` — มติผู้ใช้: `claude`(57) · `P1`(1) · `Park`(4) → บัญชีเดียวกันทั้งหมด
--   `legacy_*` เก็บสตริงเดิมครบทุกแถว **ห้ามทิ้ง** (`D19`)
--
-- `E7-AC9` — ตัวระบุ: **ไม่เพิ่มคอลัมน์** · สคริปต์นี้พิมพ์ `trips.id` ที่สร้างออกมา
--   ให้จดลงบันทึกของ `E7` · เป็นข้อเท็จจริงก้อนเดียวของเหตุการณ์ครั้งเดียว
--   (ถ้าวันหนึ่ง `E7` ย้ายมากกว่า 1 ทริป → บันทึกกลายเป็นรายการ ตอนนั้นคอลัมน์คือคำตอบที่ถูก)

begin;

-- ── id ที่คำนวณซ้ำได้ ────────────────────────────────────────────────────────
-- 🔴 ไม่ใช้ gen_random_uuid() เพราะ `E7-AC6` บังคับซ้อม **2 รอบจากสำเนาใหม่ทุกรอบ**
--    id ที่สุ่มทำให้เทียบสองรอบไม่ได้ · md5 ของคีย์เดิม → รอบ 2 ได้ id เดิมเป๊ะ
create or replace function pg_temp.lid(kind text, id text) returns uuid
  language sql immutable as $$ select md5(kind || ':' || id)::uuid $$;

do $e7$
declare
  v_owner uuid := nullif(current_setting('e7.owner_uuid', true), '')::uuid;
  v_trip  uuid;
  n int;
begin
  if v_owner is null then
    raise exception 'ต้องตั้ง e7.owner_uuid ก่อน — set e7.owner_uuid = ''<uuid>'';';
  end if;
  if not exists (select 1 from public.profiles where id = v_owner) then
    raise exception 'e7.owner_uuid = % ไม่มีใน profiles — ผิดบัญชีหรือผิดฐาน', v_owner;
  end if;

  -- ── trips ────────────────────────────────────────────────────────────────
  v_trip := pg_temp.lid('trip', 'korea-2026-10');
  insert into public.trips (id, created_by, title, start_date, end_date, base_timezone, status)
  values (v_trip, v_owner, 'เกาหลี ต.ค. 2026', date '2026-10-11', date '2026-10-21', 'Asia/Seoul', 'active');

  -- ── trip_plans — id เดิมเป็น text · is_active แทน trips.active_plan_id (`D52`) ──
  insert into public.trip_plans (id, trip_id, name, is_active, created_at)
  select pg_temp.lid('plan', p.id), v_trip, p.name,
         (p.id = (select active_plan_id from legacy.trip_meta limit 1)),
         p.created_at
  from legacy.trip_plans p;

  -- ── trip_days — วันที่เขียนตาย · เมืองจับด้วย catalog_cities.legacy_slug ──────
  insert into public.trip_days (id, trip_id, date, timezone, city_id, overnight_kind, overnight_city_id)
  select pg_temp.lid('day', d.day_key), v_trip, d.the_date, 'Asia/Seoul',
         (select id from public.catalog_cities where legacy_slug = d.city),
         d.ov_kind,
         case when d.ov_city is null then null
              else (select id from public.catalog_cities where legacy_slug = d.ov_city) end
  from (values
    -- 🔴 `overnight_kind` — **`null` ที่นี่ไม่ได้แปลว่า "นอนเมืองเดิม"**
    --    `20260825232458:40` นิยามไว้เอง: `overnight_kind is null` = **"ยังไม่ตัดสิน"**
    --    ระบบเก่านิยามคนละอย่าง (`lib/hotelLegs.ts:70`): `day.overnightCity ?? day.city`
    --    → **`null` ฝั่งเก่าแปลว่า "นอนเมืองของวันนั้น" ซึ่งเป็นการตัดสินแล้ว**
    --    ฉบับแรกของก้อนนี้ยก `null` ข้ามมาตรง ๆ → 7 ใน 11 วันของทริปที่จองโรงแรมครบ 4 ใบ
    --    กลายเป็น "ยังไม่มีใครตัดสินว่านอนไหน" · **ไม่มี constraint ไหนขัด เพราะทั้งสองฝั่ง `null` ถูกต้อง**
    --    · `'none'` = `day.noHotel` ของเดิม (`hotelLegs.ts:69` ข้ามวันพวกนี้ก่อนจัด leg)
    --    · `city` ที่นอน = `overnightCity ?? city` — อ่านจาก `data/itinerary.ts` ไม่ใช่จำเอา
    ('d0',  date '2026-10-11', 'hanoi',     'none', null),        -- noHotel · นอนบนเครื่อง
    ('d1',  date '2026-10-12', 'busan',     'city', 'busan'),
    ('d2',  date '2026-10-13', 'busan',     'city', 'busan'),
    ('d3',  date '2026-10-14', 'busan',     'city', 'busan'),
    ('d4',  date '2026-10-15', 'sokcho',    'city', 'sokcho'),
    ('d5',  date '2026-10-16', 'sokcho',    'city', 'gangneung'),  -- override ใน trip_meta
    ('d6',  date '2026-10-17', 'gangneung', 'city', 'seoul'),
    ('d7',  date '2026-10-18', 'seoul',     'city', 'seoul'),
    ('d8',  date '2026-10-19', 'seoul',     'city', 'seoul'),
    ('d9',  date '2026-10-20', 'suwon',     'city', 'seoul'),
    ('d10', date '2026-10-21', 'seoul',     'none', null)         -- noHotel · บินกลับ
  ) as d(day_key, the_date, city, ov_kind, ov_city);

  -- ── ตรวจทันที ไม่ใช่ตอนจบ — ผิดตรงไหนต้องรู้ตรงนั้น ────────────────────────
  -- 🔴 ทริปนี้ทุกคืนตัดสินแล้ว — `null` แม้แถวเดียวแปลว่ายกความหมายผิดมา ไม่ใช่ข้อมูลขาด
  select count(*) into n from public.trip_days
   where trip_id = v_trip and overnight_kind is null;
  if n > 0 then raise exception '% วันได้ overnight_kind = null = "ยังไม่ตัดสิน" ทั้งที่จองครบแล้ว', n; end if;

  select count(*) into n from public.trip_days where trip_id = v_trip;
  if n <> 11 then raise exception 'trip_days ต้องได้ 11 แถว ได้ %', n; end if;

  select count(*) into n from public.trip_days where trip_id = v_trip and city_id is null;
  if n > 0 then raise exception '% วันหาเมืองในคลังไม่เจอ — legacy_slug ไม่ตรง', n; end if;

  select count(*) into n from public.trip_plans where trip_id = v_trip and is_active;
  if n <> 1 then raise exception 'ต้องมีแผน active ตัวเดียว ได้ %', n; end if;

  -- 🔴 `E7-AC9` — จดเลขนี้ลงบันทึกของ E7 · ไม่มีคอลัมน์ให้เก็บโดยตั้งใจ
  raise notice 'E7 · trips.id = %', v_trip;
end $e7$;

commit;
