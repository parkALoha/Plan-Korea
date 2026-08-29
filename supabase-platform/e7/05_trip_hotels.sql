-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 5: trip_hotels — 4 แถว · **`check_in`/`check_out` ต้องคำนวณ**  │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ต้องรัน `01` ก่อน (ต้องมีวันครบ 11 วันพร้อม `overnight_kind`/`overnight_city_id`)
--
-- 🔴 **ตารางเดิมไม่มีวันที่เลยสักคอลัมน์** — มีแค่ `leg_id` (`d1`·`d4`·`d5`·`d6`)
--    ระบบเก่าคำนวณช่วงวันสด ๆ ทุกครั้งที่เรนเดอร์ ด้วย `deriveHotelLegs()` (`lib/hotelLegs.ts:65`)
--    ปลายทางเก็บ `check_in`/`check_out` เป็นคอลัมน์จริง → **ต้องคำนวณตอนย้าย ครั้งเดียว ถาวร**
--
-- ── กฎที่ยกมาจากซอร์ส ไม่ใช่จากความจำ ──────────────────────────────────────
--   `hotelLegs.ts:69`  `if (day.noHotel) continue`        → วันบิน ไม่มีคืนให้จอง
--   `hotelLegs.ts:70`  `day.overnightCity ?? day.city`    → เมืองที่นอนของวันนั้น
--   `hotelLegs.ts:73`  วันติดกันเมืองเดียวกัน = leg เดียว
--   `hotelLegs.ts:78`  `endDate = addDays(วันสุดท้าย, 1)` → **`check_out` = คืนสุดท้าย + 1**
--
--   บนสคีมาใหม่กฎสองข้อแรกอ่านได้จาก `trip_days` ตรง ๆ:
--     `overnight_kind = 'none'`  ≡ `noHotel`
--     `overnight_city_id`        ≡ `overnightCity ?? city`   (ก้อน `01` เขียนไว้ครบทุกวันแล้ว)
--   → **ไม่ต้องอ่าน `data/itinerary.ts` ตอนรัน** · SQL ล้วนจากสิ่งที่ย้ายมาแล้ว
--
-- ── ผลที่ควรได้ · ตรวจสองทางแล้ว ───────────────────────────────────────────
--   leg  เมือง        check_in     check_out    คืน
--   d1   busan        2026-10-12   2026-10-15    3
--   d4   sokcho       2026-10-15   2026-10-16    1
--   d5   gangneung    2026-10-16   2026-10-17    1
--   d6   seoul        2026-10-17   2026-10-21    4
--                                               ── 9 คืน (ทริป 10 คืน − 1 คืนบนเครื่อง)
--
-- 🎯 **`leg_id` ที่คำนวณได้ ตรงกับ `legacy.trip_hotels.leg_id` ทั้ง 4 ค่า** —
--    เป็นสองเส้นทางที่เป็นอิสระต่อกัน (ค่าที่เก็บไว้ในสำเนาแช่แข็ง กับการรีเพลย์ฟังก์ชันบนข้อมูลต้นทาง)
--    บล็อกด้านล่างบังคับให้ตรงกัน — **ถ้าวันหลุด leg จะเลื่อนแล้วเคสนี้แดงทันที**

begin;

create or replace function pg_temp.lid(kind text, id text) returns uuid
  language sql immutable as $$ select md5(kind || ':' || id)::uuid $$;

do $e7$
declare
  v_owner uuid := nullif(current_setting('e7.owner_uuid', true), '')::uuid;
  v_trip  uuid := pg_temp.lid('trip', 'korea-2026-10');
  n int; expected int;
begin
  if v_owner is null then raise exception 'ต้องตั้ง e7.owner_uuid ก่อน'; end if;

  -- ด่านก่อนคำนวณ: ก้อน 01 ต้องเขียน overnight ครบทุกวันแล้ว
  -- 🔴 ถ้ายัง null อยู่ leg จะขาดตรงกลางแล้ว **แตกเป็น leg ย่อยโดยไม่มีอะไรฟ้อง**
  select count(*) into n from public.trip_days where trip_id = v_trip and overnight_kind is null;
  if n > 0 then
    raise exception '% วันยังไม่มี overnight_kind — รัน 01 ฉบับใหม่ก่อน (ฉบับเก่ายก null มาตรง ๆ)', n;
  end if;

  -- ── คำนวณ leg ด้วย gaps-and-islands ─────────────────────────────────────
  with นอน as (
    select d.date, d.overnight_city_id as city_id,
           row_number() over (order by d.date) as rn
    from public.trip_days d
    where d.trip_id = v_trip and d.overnight_kind = 'city'      -- ≡ `if (day.noHotel) continue`
  ),
  เกาะ as (
    select *, rn - row_number() over (partition by city_id order by date) as grp from นอน
  ),
  leg as (
    select city_id,
           min(date)              as check_in,
           max(date) + 1          as check_out,     -- ≡ `addDays(วันสุดท้าย, 1)`
           count(*)               as nights
    from เกาะ group by city_id, grp
  )
  insert into public.trip_hotels (
    id, trip_id, city_id, hotel_name, formatted_address,
    name_local, address_local, name_en, address_en, phone,
    lat, lng, check_in, check_out, added_by_user, updated_at
  )
  select
    pg_temp.lid('hotel', h.leg_id), v_trip, l.city_id,
    h.hotel_name, h.formatted_address,
    h.name_local, h.address_local, h.name_en, h.address_en, h.phone,
    h.lat, h.lng, l.check_in, l.check_out,
    v_owner, h.updated_at
  from legacy.trip_hotels h
  join public.catalog_cities c on c.legacy_slug = h.city
  join leg l on l.city_id = c.id;

  -- ── ตรวจ ────────────────────────────────────────────────────────────────
  select count(*) into expected from legacy.trip_hotels;
  select count(*) into n from public.trip_hotels where trip_id = v_trip;
  if n <> expected then raise exception 'trip_hotels ต้องได้ % แถว ได้ %', expected, n; end if;

  -- 🔴 **เคสที่ผูกสองเส้นทางเข้าหากัน** — `leg_id` ที่ระบบเก่าเก็บไว้ ต้องตรงกับวันที่เราคำนวณ
  --    `leg_id` คือ *วันแรกของ leg* → `trip_days.date` ของวันนั้นต้องเท่ากับ `check_in` เป๊ะ
  --    ถ้าตารางวันใน `01` เลื่อนไปวันเดียว เคสนี้แดงทันที · ยอดรวม 4 แถวไม่รู้เรื่องเลย
  select count(*) into n
  from legacy.trip_hotels h
  join public.trip_hotels p on p.id = pg_temp.lid('hotel', h.leg_id)
  join public.trip_days   d on d.id = pg_temp.lid('day', h.leg_id)
  where d.date <> p.check_in;
  if n > 0 then
    raise exception '% แถว check_in ไม่ตรงกับวันของ leg_id — ตารางวันหรือช่วง leg เพี้ยน', n;
  end if;

  -- ทุกคืนต้องมีที่นอน: จำนวนคืนรวมของโรงแรม = จำนวนวันที่ overnight_kind='city'
  select (select coalesce(sum(check_out - check_in), 0) from public.trip_hotels where trip_id = v_trip)
       - (select count(*) from public.trip_days where trip_id = v_trip and overnight_kind = 'city')
    into n;
  if n <> 0 then raise exception 'คืนที่มีโรงแรม ต่างจากคืนที่ต้องนอน % คืน', n; end if;

  -- เมืองต้องตรงกับที่ระบบเก่าบันทึกไว้ ไม่ใช่แค่ "หา leg เจอ"
  select count(*) into n
  from legacy.trip_hotels h
  join public.trip_hotels p on p.id = pg_temp.lid('hotel', h.leg_id)
  join public.catalog_cities c on c.id = p.city_id
  where c.legacy_slug <> h.city;
  if n > 0 then raise exception '% แถวเมืองเพี้ยนจากเดิม', n; end if;

  raise notice 'E7 · trip_hotels % แถว · รวม % คืน · check_in ตรงกับ leg_id ทุกแถว',
    expected,
    (select sum(check_out - check_in) from public.trip_hotels where trip_id = v_trip);
end $e7$;

commit;
