-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · hidden_places ต้องรับ custom place ได้ — วันนี้รับไม่ได้ และมีของจริงรออยู่ │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ทำไม: สำเนาแช่แข็งมี hidden_places 39 แถว · **21 แถว (54%) ชี้ไป custom place**
--       ตารางปลายทางมีแค่ catalog_place_id (not null) → 21 แถวนั้นไม่มีที่ลง
--       ถ้า E7 รันโดยไม่แก้ **การซ่อนสถานที่ของผู้ใช้หายไปครึ่งหนึ่งโดยไม่มีสัญญาณใด ๆ**
--
-- 🔴 ต้นเรื่องอยู่ใน column-map.md:117 เอง และเป็น *เงื่อนไขที่ไม่มีใครปิด*:
--       `place_id` → `catalog_place_id` *(และ `custom_place_id` **ถ้าตารางนั้นรับของทริป**)*
--    "ถ้า…" ตัวนั้นไม่เคยถูกตอบ · DDL ลงไปโดยมีแค่ catalog_place_id · ไม่มีด่านไหนสะดุด
--
-- แบบแผนที่ยืมมา: trip_stops มีสองคอลัมน์คู่กัน บังคับด้วย trip_stops_place_by_kind (XOR)
--                 ตารางนี้แค่ไม่ได้รับมันมา — ไม่ได้ออกแบบใหม่
--
-- rollback:
--   alter table public.hidden_places drop constraint hidden_places_exactly_one_place;
--   drop index if exists hidden_places_uniq_catalog;
--   drop index if exists hidden_places_uniq_custom;
--   delete from public.hidden_places where custom_place_id is not null;   -- 🔴 ทำลายข้อมูล
--   alter table public.hidden_places drop column custom_place_id;
--   alter table public.hidden_places drop column id;
--   alter table public.hidden_places alter column catalog_place_id set not null;
--   alter table public.hidden_places add primary key (trip_id, catalog_place_id);

do $guard$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ฐานนี้ไม่ใช่ engine-dev ของแพลตฟอร์ม';
  end if;
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform'
       and ref  = 'pmvxwcimjebogjfimzqy'
       and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;
end $guard$;

-- ── DDL ────────────────────────────────────────────────────────────────────
begin;

alter table public.hidden_places
  drop constraint hidden_places_pkey,
  add column id uuid not null default gen_random_uuid(),
  add column custom_place_id uuid references public.custom_places(id) on delete cascade,
  alter column catalog_place_id drop not null;

alter table public.hidden_places add primary key (id);

-- 🔴 XOR — ยืมรูปจาก trip_stops_place_by_kind · ซ่อน "ที่ไหนสักแห่ง" ไม่ได้ ต้องระบุว่าที่ไหน
alter table public.hidden_places
  add constraint hidden_places_exactly_one_place
  check (num_nonnulls(catalog_place_id, custom_place_id) = 1);

-- unique เดิมเป็นส่วนหนึ่งของ PK · แตกเป็นสองใบเพราะคอลัมน์เป็น null ได้แล้ว
create unique index hidden_places_uniq_catalog
  on public.hidden_places (trip_id, catalog_place_id) where catalog_place_id is not null;
create unique index hidden_places_uniq_custom
  on public.hidden_places (trip_id, custom_place_id)  where custom_place_id  is not null;

commit;

-- ── พิสูจน์ว่าด่านทำงาน — ไม่ใช่แค่ "ไม่มี error" ────────────────────────────
-- 🔴 ทั้งทิศลบและทิศบวก · ด่านที่ปฏิเสธทุกอย่างจะดูเหมือนทำงานถูกถ้าไม่มีทิศบวก
do $verify$
declare v_trip uuid; v_cat uuid; v_cus uuid; hit boolean;
begin
  select t.id into v_trip from public.trips t limit 1;
  if v_trip is null then
    raise exception 'ไม่มีทริปสักใบ — ทดสอบด่านไม่ได้ และ "ไม่มีอะไรให้ทดสอบ" ไม่ใช่ "ผ่าน"';
  end if;
  select id into v_cat from public.catalog_places limit 1;
  if v_cat is null then
    raise exception 'ไม่มี catalog_places สักแถว — ทดสอบด่านไม่ได้';
  end if;

  -- ทิศลบ ① ไม่ระบุที่ไหนเลย → ต้องถูกปฏิเสธ
  hit := false;
  begin
    insert into public.hidden_places(trip_id) values (v_trip);
  exception when check_violation then hit := true;
  end;
  if not hit then raise exception 'ด่านไม่ทำงาน: ซ่อนโดยไม่ระบุสถานที่ได้'; end if;

  -- ทิศลบ ② ระบุทั้งสองทาง → ต้องถูกปฏิเสธ
  insert into public.custom_places(trip_id, city_id, category, lat, lng)
    values (v_trip, (select city_id from public.trip_days where trip_id = v_trip limit 1), 'attraction', 0, 0)
    returning id into v_cus;
  hit := false;
  begin
    insert into public.hidden_places(trip_id, catalog_place_id, custom_place_id)
      values (v_trip, v_cat, v_cus);
  exception when check_violation then hit := true;
  end;
  if not hit then raise exception 'ด่านไม่ทำงาน: ระบุสองทางพร้อมกันได้'; end if;

  -- 🔴 ทิศบวก — ของที่ migration นี้มีไว้ทำให้เป็นไปได้ ต้องทำได้จริง
  insert into public.hidden_places(trip_id, custom_place_id) values (v_trip, v_cus);
  if not exists (select 1 from public.hidden_places where custom_place_id = v_cus) then
    raise exception 'ทิศบวกล้ม: ซ่อน custom place แล้วไม่มีแถว';
  end if;

  -- เก็บกวาดของที่ใช้ทดสอบ
  delete from public.hidden_places where custom_place_id = v_cus;
  delete from public.custom_places where id = v_cus;
end $verify$;
