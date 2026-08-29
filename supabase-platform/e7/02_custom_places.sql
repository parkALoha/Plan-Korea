-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 2: custom_places (+ ชื่อ · คำอธิบาย) — 37 แถว                 │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- 🔴 **ต้องมาก่อน `03_trip_stops.sql`** — `trip_stops.custom_place_id` มี FK มาที่นี่
--    (สนามซ้อมจับได้ตอนผมเรียงผิด: `trip_stops_custom_place_fk` ล้มทันที)
--
-- แตกเป็น 3 ตารางตามสคีมาใหม่:
--   custom_places              — พิกัด · หมวด · เมือง
--   custom_place_names         — ชื่อ 3 ภาษาแยกแถวละ locale (`th` `en` `ko`)
--   custom_place_descriptions  — คำอธิบาย (37/37 แถวมีค่า)
--
-- ⚠️ `city` เดิมเป็น text (`busan` 29 · `hanoi` 7 · `bangkok` 1) → `city_id`
--    ทั้งสามเมืองมีในคลังแล้ว (ตรวจ 29 ส.ค.)

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

  insert into public.custom_places (
    id, trip_id, city_id, category, lat, lng, maps_query, google_place_id,
    added_by_user, legacy_added_by, created_at
  )
  select pg_temp.lid('custom_place', c.id), v_trip,
         (select id from public.catalog_cities where legacy_slug = c.city),
         c.category, c.lat, c.lng, c.maps_query, c.google_place_id,
         case when c.added_by is not null then v_owner end, c.added_by, c.created_at
  from legacy.custom_places c;

  select count(*) into expected from legacy.custom_places;
  select count(*) into n from public.custom_places where trip_id = v_trip;
  if n <> expected then raise exception 'custom_places ต้องได้ % ได้ %', expected, n; end if;

  -- ── ชื่อ — แตกเป็นแถวละ locale · ทิ้งค่าว่างไม่ใช่ทิ้งข้อมูล ────────────────
  insert into public.custom_place_names (trip_id, place_id, locale, name, priority, source)
  select v_trip, pg_temp.lid('custom_place', c.id), x.locale, trim(x.nm), 1, 'user'
  from legacy.custom_places c
  cross join lateral (values ('th', c.name_th), ('en', c.name_en), ('ko', c.name_ko)) as x(locale, nm)
  where x.nm is not null and trim(x.nm) <> '';

  insert into public.custom_place_descriptions (trip_id, place_id, locale, description, source)
  select v_trip, pg_temp.lid('custom_place', c.id), 'th', trim(c.description), 'user'
  from legacy.custom_places c
  where c.description is not null and trim(c.description) <> '';

  -- 🔴 ทุกแถวต้องมีชื่ออย่างน้อยหนึ่งภาษา — สถานที่ไม่มีชื่อคือข้อมูลที่หายไปแล้ว
  select count(*) into n from public.custom_places p
   where p.trip_id = v_trip
     and not exists (select 1 from public.custom_place_names nm
                      where nm.place_id = p.id and nm.trip_id = v_trip);
  if n > 0 then raise exception '% สถานที่ไม่มีชื่อสักภาษา', n; end if;

  select count(*) into n from public.custom_places where trip_id = v_trip and city_id is null;
  if n > 0 then raise exception '% แถวหาเมืองไม่เจอ — city เดิมไม่ตรง legacy_slug', n; end if;

  select count(*) into n from public.custom_place_descriptions where trip_id = v_trip;
  select count(*) into expected from legacy.custom_places where description is not null and trim(description) <> '';
  if n <> expected then raise exception 'คำอธิบายต้องได้ % ได้ %', expected, n; end if;

  raise notice 'E7 · custom_places % แถว · ชื่อ % แถว · คำอธิบาย % แถว',
    (select count(*) from public.custom_places where trip_id = v_trip),
    (select count(*) from public.custom_place_names where trip_id = v_trip),
    n;
end $e7$;

commit;
