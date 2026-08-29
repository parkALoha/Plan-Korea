-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 2: trip_stops — 71 แถว · แมป place_id 4 กลุ่ม                  │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ต้องรัน `01_trip_skeleton.sql` ก่อน (ต้องมี trip · plans · days อยู่แล้ว)
--
-- 🔴 การแมป — วัดจากข้อมูลจริงทั้ง 71 แถว ไม่มีเศษเหลือ (29 ส.ค. 2026):
--   legacy kind   รูปแบบ place_id     n    ปลายทาง
--   place         สแลกคลัง            51   catalog_place_id  (จับด้วย catalog_places.legacy_slug)
--   place         custom-*             8   custom_place_id
--   transfer      สแลกคลัง             4   catalog_place_id
--   hotel         hotel@lat,lng        5   **ไม่มี place ref** — constraint บังคับให้เป็น 0
--   intercity     ว่าง                 3   **ไม่มี place ref**
--                                     ──
--                                     71
-- ⚠️ `hotel@lat,lng` เป็นคีย์ที่ระบบเก่าสังเคราะห์ขึ้น ไม่ใช่ที่อยู่จริง —
--    ข้อมูลโรงแรมตัวจริงอยู่ใน legacy.trip_hotels (ก้อนถัดไป) จึงไม่เสียอะไรตรงนี้
--
-- rank: `lpad(order_index,4,'0') || 'V'`
--   · ต้องผ่าน `trip_stops_rank_shape` = `^[0-9A-Za-z]+$` **และห้ามลงท้ายด้วย `0`**
--   · ความกว้างคงที่ → เรียงตามพจนานุกรมตรงกับ order_index (0–7 · ไม่ซ้ำใน (plan,day))
--   · แทรกทีหลังได้ปกติ: `0001V` < `0001V5` < `0002V` (rankBetween ฝั่งแอปยังใช้ได้)
--   🔴 ไม่ใช่ตัวสร้าง rank ทั่วไป — เป็นการหว่านค่าเริ่มต้นที่รักษาลำดับเท่านั้น

\set ON_ERROR_STOP on

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
  if not exists (select 1 from public.trips where id = v_trip) then
    raise exception 'ยังไม่มีทริป — รัน 01_trip_skeleton.sql ก่อน';
  end if;

  insert into public.trip_stops (
    id, trip_id, plan_id, trip_day_id, rank, kind,
    catalog_place_id, custom_place_id,
    dwell_minutes, travel_mode, note, photo_path,
    intercity_from, intercity_to, intercity_mode,
    visited_at, transfer_target_time, transfer_target_label,
    added_by_user, legacy_added_by, updated_at
  )
  select
    pg_temp.lid('stop', s.id), v_trip,
    pg_temp.lid('plan', s.plan_id),
    pg_temp.lid('day',  s.day_id),
    lpad(s.order_index::text, 4, '0') || 'V',
    s.kind,
    -- 🔴 XOR บังคับโดย trip_stops_place_by_kind — hotel/intercity ต้องเป็น NULL ทั้งคู่
    case when s.kind in ('place','transfer') and s.place_id not like 'custom-%'
         then (select c.id from public.catalog_places c where c.legacy_slug = s.place_id) end,
    case when s.kind in ('place','transfer') and s.place_id like 'custom-%'
         then pg_temp.lid('custom_place', s.place_id) end,
    s.dwell_minutes, s.travel_mode, s.note, s.photo_url,
    s.intercity_from, s.intercity_to, s.intercity_mode,
    s.visited_at, s.transfer_target_time, s.transfer_target_label,
    -- `E7-AC5` — ทุกชื่อเข้าบัญชีเดียว · สตริงเดิมเก็บครบ ห้ามทิ้ง (`D19`)
    case when s.added_by is not null then v_owner end,
    s.added_by,
    s.updated_at
  from legacy.trip_stops s;

  -- ── ตรวจทันที ────────────────────────────────────────────────────────────
  select count(*) into expected from legacy.trip_stops;
  select count(*) into n from public.trip_stops where trip_id = v_trip;
  if n <> expected then raise exception 'trip_stops ต้องได้ % แถว ได้ %', expected, n; end if;

  -- 🔴 กลุ่มที่ *ต้องมี* place ref แล้วไม่มี = สแลกหาในคลังไม่เจอ · เงียบไม่ได้
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and kind in ('place','transfer')
     and catalog_place_id is null and custom_place_id is null;
  if n > 0 then raise exception '% แถวหาสถานที่ในคลังไม่เจอ — legacy_slug ไม่ตรง', n; end if;

  -- ทิศกลับ: กลุ่มที่ *ห้ามมี* แล้วดันมี
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and kind in ('hotel','intercity')
     and (catalog_place_id is not null or custom_place_id is not null);
  if n > 0 then raise exception '% แถว kind=hotel/intercity ไม่ควรมี place ref', n; end if;

  -- ลำดับต้องรักษาไว้: เรียงด้วย rank แล้วต้องได้ order_index เดิมเรียงขึ้น
  select count(*) into n from (
    select s.day_id, s.plan_id,
           s.order_index,
           row_number() over (partition by s.plan_id, s.day_id order by t.rank) - 1 as pos
    from legacy.trip_stops s
    join public.trip_stops t on t.id = pg_temp.lid('stop', s.id)
  ) x where x.order_index <> x.pos;
  if n > 0 then raise exception 'ลำดับเพี้ยน % แถว — rank ไม่ตรงกับ order_index เดิม', n; end if;

  raise notice 'E7 · trip_stops ย้ายแล้ว % แถว · ลำดับตรงทุกแถว', expected;
end $e7$;

commit;
