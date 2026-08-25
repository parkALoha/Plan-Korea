-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `custom_places` + `custom_place_names`: คลัง**ของผู้เช่า** · `D53` · `D70` · `D75`
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · `E1-AC5` (ครึ่งสคีมา · ย้ายมาจาก `D58`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── `D75` — ทำไมชื่ออยู่ตารางแยกจาก `catalog_place_names` ──────────────────
-- รูปทรงเหมือนกันเป๊ะ **แต่พ่อสองตัวมีโมเดลความปลอดภัยตรงข้ามกัน**
--   `catalog_places` = สาธารณะ · policy `using (true)`
--   `custom_places`  = ของผู้เช่า · policy ผูก `trip_members`
-- 🔴 ตารางเดียว = policy เดียวต้องรับใช้ทั้งสองด้วย `or` ที่ครึ่งหนึ่งเป็น `true`
--    **บั๊กใน `or` นั้นครั้งเดียว = ชื่อสถานที่ในทริปคนอื่นรั่ว** และรั่วผ่านครึ่งที่ไม่มีใครเพ่ง
--
-- ── `E1-AC5` ครึ่งสคีมา — `added_by` ──────────────────────────────────────
-- `legacy_added_by text` เก็บสตริงเดิมไว้ครบ **ห้ามทิ้ง** — มันเป็นข้อมูลเดียวที่บอกได้ว่า
-- ใครเพิ่มอะไรในทริปจริง ก่อนที่ระบบจะมี identity (`D19`)
-- `added_by_user` เขียนโดย trigger จาก `auth.uid()` **ไคลเอนต์ตั้งเองไม่ได้** (`D38`)
--
-- ── สิ่งที่ไฟล์นี้ *ไม่* ทำ ────────────────────────────────────────────────
--   **ไม่มี `deleted_at`** — `E2-AC12` ยังไม่ตัดสินทั้งตระกูล · ให้ policy `DELETE` ตรง ๆ ไปก่อน
--   ตรงกับพฤติกรรมวันนี้ (ผู้ใช้ลบสถานที่ที่ตัวเองเพิ่ม) · **และ `trip_stops.custom_place_id`
--   จะเป็น `on delete restrict`** → ลบสถานที่ที่ยังอยู่ในแผนไม่ได้ ต้องเอาออกจากแผนก่อน
--   🔴 กันเคสเดียวกับที่ P7 เจอกับ `trip_days` — **แต่กันด้วย FK ไม่ใช่ด้วยเคสที่แดงทีหลัง**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists public.custom_place_names;
--   drop table if exists public.custom_places;
--   drop function if exists app.stamp_added_by();
-- ═══════════════════════════════════════════════════════════════════════════

begin;

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

create table public.custom_places (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,

  -- `restrict` ไม่ใช่ `cascade`: ลบเมืองออกจากคลังกลาง **ต้องไม่ลบสถานที่ในทริปของผู้ใช้**
  city_id      uuid not null references public.catalog_cities(id) on delete restrict,

  category     text not null check (length(trim(category)) between 1 and 40),
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),

  maps_query   text,
  description  text,
  google_place_id text,

  -- `E1-AC5` / `D19`
  added_by_user uuid references public.profiles(id) on delete set null,
  legacy_added_by text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by_user uuid references public.profiles(id) on delete set null,

  -- `D70` — เปิดคีย์คู่ให้ `custom_place_names` และ `trip_stops` อ้าง
  constraint custom_places_trip_id_id_key unique (trip_id, id)
);

create index custom_places_trip_idx on public.custom_places (trip_id);

create table public.custom_place_names (
  trip_id  uuid not null,
  place_id uuid not null,
  locale   text not null check (locale ~ '^[a-z]{2}$'),
  name     text not null check (length(trim(name)) between 1 and 200),

  -- `priority` ไม่ใช่ `is_primary` — เหตุผลเต็มอยู่ใน `catalog_place_names` (`D55`)
  -- สรุป: partial unique บังคับ `≤ 1` **แต่ไม่บังคับ `≥ 1`** · `priority` ได้ `≥ 1` จากโครงสร้าง
  priority int not null default 1 check (priority >= 1),
  source   text not null default 'user' check (source in ('user', 'google')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (place_id, locale, priority),

  -- `D70` — `trip_id` ตัวเดียวกันผูกกับพ่อ → ติดป้ายชื่อข้ามทริปไม่ได้
  constraint cpn_custom_place_fk foreign key (trip_id, place_id)
    references public.custom_places(trip_id, id) on delete cascade
);

create index custom_place_names_trgm_idx
  on public.custom_place_names using gin (name extensions.gin_trgm_ops);

revoke all on public.custom_places      from anon;
revoke all on public.custom_place_names from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.custom_places      enable row level security;
alter table public.custom_place_names enable row level security;

create policy custom_places_select on public.custom_places
  for select to authenticated using (app.can_read_trip(trip_id));
create policy custom_places_insert on public.custom_places
  for insert to authenticated with check (app.can_write_trip(trip_id));
create policy custom_places_update on public.custom_places
  for update to authenticated
  using (app.can_write_trip(trip_id)) with check (app.can_write_trip(trip_id));
create policy custom_places_delete on public.custom_places
  for delete to authenticated using (app.can_write_trip(trip_id));

create policy custom_place_names_select on public.custom_place_names
  for select to authenticated using (app.can_read_trip(trip_id));
create policy custom_place_names_insert on public.custom_place_names
  for insert to authenticated with check (app.can_write_trip(trip_id));
create policy custom_place_names_update on public.custom_place_names
  for update to authenticated
  using (app.can_write_trip(trip_id)) with check (app.can_write_trip(trip_id));
create policy custom_place_names_delete on public.custom_place_names
  for delete to authenticated using (app.can_write_trip(trip_id));

-- ───────────────────────────────────────────────────────────────────────────
-- grant — ระบุชื่อคอลัมน์ · คอลัมน์เวลา/ผู้แก้/ผู้เพิ่ม **ไม่อยู่ในลิสต์**
-- ───────────────────────────────────────────────────────────────────────────
grant select, delete on public.custom_places to authenticated;
grant insert (trip_id, city_id, category, lat, lng, maps_query, description, google_place_id, legacy_added_by)
  on public.custom_places to authenticated;
-- 🔴 `trip_id` ไม่อยู่ในฝั่ง update — op ที่เขียน `trip_id` เดี่ยว ๆ คือ **ย้ายสถานที่ข้ามทริป** (P7)
grant update (city_id, category, lat, lng, maps_query, description, google_place_id)
  on public.custom_places to authenticated;

grant select, delete on public.custom_place_names to authenticated;
grant insert (trip_id, place_id, locale, name, priority, source)
  on public.custom_place_names to authenticated;
grant update (locale, name, priority, source)
  on public.custom_place_names to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- trigger
-- ───────────────────────────────────────────────────────────────────────────
-- `added_by_user` เขียนฝั่งเซิร์ฟเวอร์เท่านั้น — ไคลเอนต์ไม่มีสิทธิ์คอลัมน์นี้อยู่แล้ว (deny-by-default)
-- trigger จึงเป็น**ตัวเติมค่า** ไม่ใช่**ตัวกัน** · สองอย่างนี้ตอบคนละคำถามและต้องมีทั้งคู่
create or replace function app.stamp_added_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.added_by_user := auth.uid();
  return new;
end;
$$;

create trigger custom_places_stamp_added_by
  before insert on public.custom_places
  for each row execute function app.stamp_added_by();

create trigger custom_places_touch before update on public.custom_places
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();
create trigger custom_place_names_touch before update on public.custom_place_names
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at_only();

commit;
