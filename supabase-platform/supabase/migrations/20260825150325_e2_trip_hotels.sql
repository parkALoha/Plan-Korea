-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `trip_hotels`: `D51` ที่รอ `D76` มาตั้งแต่ต้น
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── `D51` — `leg_id` หายไป · ที่พักผูกกับช่วงวันของตัวเอง ──────────────────
-- วันนี้ `leg_id` เป็น **PK ที่เป็นค่าคำนวณ** จากการมัดวันที่นอนเมืองเดียวกันติดกัน
-- → **แก้แผนแล้วใบจองขยับตามอย่างเงียบ ๆ** · ใบจองคือของที่จ่ายเงินไปแล้ว มันต้องไม่ขยับเอง
-- → เก็บ `check_in` / `check_out` ของตัวเอง · *"คืนนี้นอนที่ไหน"* = `check_in <= วันนั้น < check_out`
--
-- ── exclusion constraint — และเหตุผลที่มันบังคับให้ `D76` ตัดสินก่อน ───────
-- `D51` เขียนไว้เองว่าต้องกันช่วงวันซ้อนกัน **และต้องเป็น `where (deleted_at is null)`**
-- 🔴 **เขียนไม่ได้เลยจนกว่าตระกูลนี้จะมี `deleted_at`** — นี่คือของที่ชนกันจริง ไม่ใช่โมเดล sync
--    (P7 เป็นคนชี้ · `D76` ถูกตัดสินเพราะข้อนี้)
--
-- 🎯 **`daterange(check_in, check_out, '[)')` — ครึ่งเปิดข้างขวา และมันสำคัญมาก**
--    เช็คเอาต์วันที่ 14 กับเช็คอินวันที่ 14 **ไม่ใช่การซ้อนกัน มันคือการย้ายโรงแรม**
--    ใช้ `[]` เมื่อไหร่ **ทุกทริปที่ย้ายที่พักจะชนตัวเองทันที** ซึ่งเป็นเรื่องปกติของทุกทริป
--
-- ⚠️ ต้องมี `btree_gist` เพราะ exclusion ผสม `uuid` (`=`) กับ `daterange` (`&&`)
--    — `gist` ธรรมดาไม่รู้จัก `=` บน `uuid`
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop function if exists public.soft_delete_trip_hotel(uuid);
--   drop table if exists public.trip_hotels;
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

create extension if not exists btree_gist with schema extensions;

create table public.trip_hotels (
  id       uuid primary key default gen_random_uuid(),
  trip_id  uuid not null references public.trips(id) on delete cascade,
  city_id  uuid not null references public.catalog_cities(id) on delete restrict,

  hotel_name        text not null check (length(trim(hotel_name)) between 1 and 200),
  formatted_address text,
  name_local        text,
  address_local     text,
  name_en           text,
  address_en        text,
  phone             text,

  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),

  -- `D51` — ช่วงวันของตัวเอง ไม่ใช่ `leg_id` ที่คำนวณมา
  check_in  date not null,
  check_out date not null,

  added_by_user   uuid references public.profiles(id) on delete set null,
  legacy_added_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,

  constraint trip_hotels_dates_ordered check (check_out > check_in),

  -- 🔴 `D51` — คืนเดียวกันนอนได้ที่เดียว · `[)` ครึ่งเปิดข้างขวา (ดูหัวไฟล์)
  --    `where (deleted_at is null)` — **ที่พักที่ถูกลบแล้วต้องไม่กันช่วงวัน**
  --    ไม่งั้นผู้ใช้จองคืนเดิมใหม่ไม่ได้ตลอดกาล โดยหน้าจอไม่มีอะไรอยู่ตรงนั้นให้เห็น
  constraint trip_hotels_no_overlap exclude using gist (
    trip_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (deleted_at is null)
);

create index trip_hotels_trip_idx on public.trip_hotels (trip_id);

revoke all on public.trip_hotels from anon;
alter table public.trip_hotels enable row level security;

create policy trip_hotels_select on public.trip_hotels
  for select to authenticated using (app.can_read_trip(trip_id) and deleted_at is null);
create policy trip_hotels_insert on public.trip_hotels
  for insert to authenticated with check (app.can_write_trip(trip_id));
create policy trip_hotels_update on public.trip_hotels
  for update to authenticated
  using (app.can_write_trip(trip_id)) with check (app.can_write_trip(trip_id));

grant select on public.trip_hotels to authenticated;
grant insert (trip_id, city_id, hotel_name, formatted_address, name_local, address_local,
              name_en, address_en, phone, lat, lng, check_in, check_out, legacy_added_by)
  on public.trip_hotels to authenticated;
grant update (city_id, hotel_name, formatted_address, name_local, address_local,
              name_en, address_en, phone, lat, lng, check_in, check_out)
  on public.trip_hotels to authenticated;
grant select, delete on public.trip_hotels to service_role;

create trigger trip_hotels_stamp_added_by
  before insert on public.trip_hotels
  for each row execute function app.stamp_added_by();
create trigger trip_hotels_touch before update on public.trip_hotels
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();

create or replace function public.soft_delete_trip_hotel(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.trip_hotels where id = p_id and deleted_at is null;
  if v_trip is null then raise exception 'ไม่พบที่พักนี้ หรือถูกลบไปแล้ว'; end if;
  if not app.can_write_trip(v_trip) then raise exception 'ไม่มีสิทธิ์แก้ทริปนี้'; end if;
  update public.trip_hotels set deleted_at = now() where id = p_id;
end;
$$;

revoke all on function public.soft_delete_trip_hotel(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_trip_hotel(uuid) to authenticated;

commit;
