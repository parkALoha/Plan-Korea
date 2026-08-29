-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 9: ด่านความครบถ้วน — รันหลัง 01–08 ทุกครั้ง                    │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- 🔴 **ก้อนนี้ไม่ย้ายอะไรเลย** — มันตอบคำถามเดียว: *"ตาราง legacy ใบไหนยังไม่มีใครรับ"*
--
-- ที่มา: ผมเช็คความครบด้วย `grep 'legacy\.<ตาราง>' e7/*.sql` แล้วรายงานว่าครบ
--   · ตอบถูกรอบนั้น **แต่มันตอบคำถาม *"มีสคริปต์ไหนพิมพ์ชื่อตารางนี้ไหม"***
--   · ซึ่งไม่ใช่คำถามเดียวกับ *"ข้อมูลของตารางนี้ไปถึงปลายทางหรือยัง"*
--   🎯 **สคริปต์ที่อ้างถึงตารางแล้ว insert 0 แถว ผ่าน `grep` ทุกครั้ง**
--
-- ── ทะเบียนสองใบ · และทั้งคู่ *ผิดได้* ซึ่งเป็นเงื่อนไขที่ทำให้มันไม่กลายเป็นแหล่งความจริงใบที่สอง ──
--   ① `MIGRATED` — ตาราง legacy → ปลายทาง + จำนวนที่ต้องได้
--   ② `DROPPED`  — ตารางที่ **จงใจไม่ย้าย** พร้อมเหตุผลและเลขมติ
--   ทิศที่บังคับ:
--     · ตารางใน `legacy` ที่ไม่อยู่ในทะเบียนใดเลย  → 🔴 แดง (ของใหม่โผล่มาแล้วไม่มีใครตัดสิน)
--     · ตารางในทะเบียนที่ไม่มีอยู่ใน `legacy` แล้ว  → 🔴 แดง (ทะเบียนล้า)
--     · จำนวนไม่ตรง                                → 🔴 แดง
--   **ทั้งสามทิศคือสิ่งที่ทำให้ทะเบียนนี้ตรวจได้ ไม่ใช่แค่ประกาศ**

\set ON_ERROR_STOP on

begin;

do $e7$
declare
  v_trip uuid := md5('trip:korea-2026-10')::uuid;
  r record; got bigint; n_unknown int; n_stale int; missing text;
begin
  -- ── ① ตาราง legacy ที่ไม่มีใครตัดสิน ────────────────────────────────────
  select count(*), string_agg(t.table_name, ', ' order by t.table_name)
    into n_unknown, missing
  from information_schema.tables t
  where t.table_schema = 'legacy'
    and t.table_name not in (
      'bookings','checklist_items','custom_places','hidden_places','place_details_cache',
      'place_notes','place_photo_cache','travel_time_cache','trip_day_settings','trip_hotels',
      'trip_meta','trip_plans','trip_stops',            -- ← MIGRATED
      'trip_selections'                                  -- ← DROPPED
    );
  if n_unknown > 0 then
    raise exception 'ตาราง legacy % ใบยังไม่มีใครตัดสินว่าจะย้ายหรือทิ้ง: %', n_unknown, missing;
  end if;

  -- ── ② ทะเบียนต้องผิดได้: ทุกชื่อในทะเบียนต้องยังมีอยู่จริง ───────────────
  select count(*), string_agg(x.t, ', ' order by x.t) into n_stale, missing
  from unnest(array[
    'bookings','checklist_items','custom_places','hidden_places','place_details_cache',
    'place_notes','place_photo_cache','travel_time_cache','trip_day_settings','trip_hotels',
    'trip_meta','trip_plans','trip_stops','trip_selections'
  ]) as x(t)
  where not exists (
    select 1 from information_schema.tables
     where table_schema = 'legacy' and table_name = x.t
  );
  if n_stale > 0 then
    raise exception 'ทะเบียนอ้างถึงตารางที่ไม่มีใน legacy แล้ว % ใบ: % — ทะเบียนล้า', n_stale, missing;
  end if;

  -- ── ③ จำนวนต่อตาราง — เทียบ *ต้นทางกับปลายทาง* ไม่ใช่เทียบกับเลขที่ผมพิมพ์ไว้ ──
  for r in
    select * from (values
      ('trip_plans',          'public.trip_plans',            'trip_id'),
      ('custom_places',       'public.custom_places',         'trip_id'),
      ('trip_stops',          'public.trip_stops',            'kind<>event'),
      ('bookings',            'public.bookings',              'trip_id'),
      ('checklist_items',     'public.checklist_items',       'trip_id'),
      ('hidden_places',       'public.hidden_places',         'trip_id'),
      ('place_notes',         'public.place_notes',           'trip_id'),
      ('trip_hotels',         'public.trip_hotels',           'trip_id'),
      ('trip_day_settings',   'public.trip_day_plan_settings','trip_id'),
      ('place_details_cache', 'public.place_details_cache',   'all'),
      ('place_photo_cache',   'public.place_photo_cache',     'all'),
      ('travel_time_cache',   'public.travel_time_cache',     'all')
    ) as v(src, dst, scope)
  loop
    execute format('select count(*) from legacy.%I', r.src) into got;
    declare want bigint := got;
    begin
      execute case r.scope
        when 'all'          then format('select count(*) from %s', r.dst)
        when 'kind<>event'  then format('select count(*) from %s where trip_id = %L and kind <> ''event''', r.dst, v_trip)
        else                     format('select count(*) from %s where trip_id = %L', r.dst, v_trip)
      end into got;
      if got <> want then
        raise exception 'legacy.% มี % แถว แต่ % ได้ % แถว', r.src, want, r.dst, got;
      end if;
    end;
  end loop;

  -- ── ④ ปลายทางที่ *ไม่มี* ต้นทางเป็นตาราง — ต้องตรวจแยก ไม่งั้นหลุดจากลูปข้างบน ──
  -- 🔴 สามใบนี้คือที่ที่ `grep` มองไม่เห็นที่สุด เพราะไม่มีชื่อตาราง legacy ให้ค้น
  if (select count(*) from public.trips where id = v_trip) <> 1 then
    raise exception 'ไม่มีทริป — trip_meta ไม่ได้ถูกแปลงเป็น trips';
  end if;
  if (select count(*) from public.trip_days where trip_id = v_trip) <> 11 then
    raise exception 'trip_days ต้องได้ 11 วัน (เขียนตายในก้อน 01 · ไม่มีตาราง legacy)';
  end if;
  if (select count(*) from public.trip_stops where trip_id = v_trip and kind = 'event') <> 36 then
    raise exception 'events ต้องได้ 36 แถว (18 × 2 แผน · ต้นทางเป็น TypeScript ไม่ใช่ตาราง)';
  end if;
  if (select count(*) from public.place_details_local_cache)
     <> (select count(*) from legacy.place_details_cache where locale is not null) then
    raise exception 'place_details_local_cache ไม่ตรงกับแถวที่มี locale';
  end if;

  -- ── ⑤ `trip_selections` จงใจทิ้ง — แต่ต้องพิสูจน์ว่าทิ้งได้จริง ไม่ใช่แค่ประกาศ ────
  -- `E2-AC7` · `README.md:129` — ตายตั้งแต่ `0006` ถูกแทนด้วย `trip_stops`
  -- 🔴 เงื่อนไขที่ทำให้ "ทิ้งได้" เป็นจริง: **ทุก (day_id, place_id) ในนั้นต้องมีตัวแทนใน trip_stops แล้ว**
  --    ถ้าวันหนึ่งมีแถวที่ไม่มีตัวแทน แปลว่าข้อสันนิษฐานตาย → แดง ไม่ใช่เงียบ
  -- 🔴 **เหตุผลที่ `E2-AC7` ให้ไว้ ไม่ใช่เหตุผลที่ทำให้มันทิ้งได้** (P1 เจอตอนเขียนด่านนี้)
  --    `README.md:129` เขียนว่า *"ไม่มีใครอ้างถึงทั้ง repo ถูกแทนด้วย trip_stops ตั้งแต่ 0006"*
  --    → นั่นคือข้อโต้แย้งเรื่อง **โค้ด** · คำถามของ `E7` คือเรื่อง **ข้อมูล** — คนละคำถาม
  --    **โค้ดเลิกอ่านตารางแล้ว ไม่ได้แปลว่าเนื้อในตารางถูกเก็บไว้ที่อื่น**
  --
  --    ฉบับแรกของด่านนี้เทียบแบบ `(day_id, place_id)` ตรงกัน → **แดง 10 จาก 13 แถว**
  --    ไล่ต่อแล้วพบว่า *ข้อสรุปของ `E2-AC7` ถูก แต่ด้วยเหตุผลอื่น*:
  --      3  ตรงวันเป๊ะ
  --      9  สถานที่เดียวกันอยู่ใน `trip_stops` **แต่คนละวัน** (ผู้ใช้ย้ายหลังเลือก)
  --      1  ไม่อยู่ใน `trip_stops` เลย **แต่อยู่ใน `hidden_places`** (ผู้ใช้ซ่อนทิ้ง)
  --     ── 13 ครบ · ไม่มีแถวไหนเป็นข้อมูลที่หายไป
  --
  --    🎯 **เงื่อนไขที่ถูกจึงไม่ใช่ "ตรงวัน" แต่เป็น "ยังมีร่องรอยการตัดสินใจของผู้ใช้อยู่"**
  --       `slot_id` เป็นภาพนิ่งของแผนตอน 5–6 ส.ค. · แผนเดินหน้าต่อ · แถวไม่ได้ตามไปด้วย
  if exists (
    select 1 from legacy.trip_selections s
    where not exists (select 1 from legacy.trip_stops   st where st.place_id = s.place_id)
      and not exists (select 1 from legacy.hidden_places h  where h.place_id = s.place_id)
  ) then
    raise exception
      'trip_selections มีสถานที่ที่ไม่อยู่ทั้งใน trip_stops และ hidden_places — E2-AC7 ทิ้งไม่ได้แล้ว';
  end if;

  raise notice 'E7 · ครบถ้วน: 13 ตารางย้ายแล้ว · 1 ตารางทิ้งโดยพิสูจน์แล้ว · ไม่มีใบไหนไม่มีคนตัดสิน';
end $e7$;

commit;
