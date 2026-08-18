-- ═══════════════════════════════════════════════════════════════════════════
-- E1 — Identity + แกนสิทธิ์ขั้นต่ำ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 รันบน engine-dev เท่านั้น: https://supabase.com/dashboard/project/pmvxwcimjebogjfimzqy/sql/new
--    ห้ามรันบน ejzibhgqhxdzkovsnpds (DB ทริปจริง) ทุกกรณี — กติกาเหล็กข้อ 2
--
-- เกณฑ์ที่ไฟล์นี้ต้องผ่าน (backlog E1):
--   AC2  มี profiles · trips · trip_members และ RLS อ้าง auth.uid() จริง
--   AC3  C ยิง GET /rest/v1/trips ด้วย JWT ตัวเอง ต้องได้ []
--   AC4  D (ไม่มี JWT) ยิงทั้ง 3 ตาราง ต้องได้ 401 หรือ []
--
-- ⚠️ ขอบเขตของไฟล์นี้ — เขียนไว้เพราะ D29 ชนิดที่ 3 (เหตุผลที่แคบกว่าที่ข้อความบอก):
--   ครอบ:     สิทธิ์ระดับแถวของ 3 ตารางนี้เท่านั้น
--   ไม่ครอบ:  ตารางทริปเดิม 14 ตัว (E2) · Storage (E2) · แคช (E3) · การย้ายข้อมูลจริง (E7)
--   ไฟล์นี้ตอบว่า "ใครอ่าน/เขียนแถวไหนได้" ไม่ได้ตอบว่า "ข้อมูลเดิมย้ายมายังไง"
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 0. schema app — ที่อยู่ของ helper
-- ───────────────────────────────────────────────────────────────────────────
-- ทำไมไม่วางใน public: PostgREST เปิด schema public เป็น REST อัตโนมัติ
-- ฟังก์ชันใน public จะโผล่เป็น /rest/v1/rpc/<ชื่อ> ให้ยิงได้ตรงๆ
-- = กลายเป็นเครื่องมือถามว่า "ทริป id นี้มีอยู่ไหม / ฉันเป็นสมาชิกไหม" ทีละใบ
create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to authenticated;
-- 🔴 anon ไม่ได้ usage เลย — ไม่มีเหตุผลที่คนไม่ล็อกอินต้องเรียก helper สิทธิ์

-- ───────────────────────────────────────────────────────────────────────────
-- 1. ตาราง
-- ───────────────────────────────────────────────────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (length(trim(display_name)) between 1 and 60),
  locale        text not null default 'th' check (locale in ('th','en')),
  home_country  text check (home_country ~ '^[a-z]{2}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.trips (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete restrict,
  title          text not null check (length(trim(title)) between 1 and 120),
  start_date     date not null,
  end_date       date not null,
  base_timezone  text not null default 'Asia/Bangkok',   -- D37
  status         text not null default 'planning'
                 check (status in ('planning','active','done','archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint trips_dates_ordered check (end_date >= start_date)
);

-- owner_id เป็น restrict ไม่ใช่ cascade โดยตั้งใจ:
-- ลบ profile แล้วทริปหายทั้งใบ = ข้อมูลของสมาชิกคนอื่นหายไปด้วย
-- ต้องบังคับให้ย้าย owner ก่อน ไม่ใช่ปล่อยให้หายเงียบ

create table public.trip_members (
  trip_id    uuid not null references public.trips(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('owner','editor','viewer')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_members_user_idx on public.trip_members(user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. helper — SECURITY DEFINER เพื่อ "ตัดวงจร" ไม่ใช่เพื่อ "ได้สิทธิ์เพิ่ม"
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 D38: อยู่ฝั่งเซิร์ฟเวอร์ ≠ มีสิทธิ์มากกว่า
-- เหตุผลเดียวที่ใช้ definer ที่นี่คือ: policy ของ trip_members ที่ query trip_members
-- จะ recursive ไม่รู้จบ · definer รันด้วยสิทธิ์ owner ซึ่ง RLS ไม่บังคับ = วงจรขาด
-- ไม่ได้ใช้เพื่อข้ามการตรวจสิทธิ์ — ตัวฟังก์ชันยังถาม auth.uid() ของคนเรียกอยู่ดี

create or replace function app.trip_role(t uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.trip_members
   where trip_id = t and user_id = (select auth.uid())
$$;

create or replace function app.can_read_trip(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.trip_role(t) is not null
$$;

create or replace function app.can_write_trip(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.trip_role(t) in ('owner','editor')
$$;

-- grant ทีละตัวพร้อมลายเซ็น ห้าม "grant execute on all functions in schema app"
-- (กฎร่วมข้อ 5 — P4 เจอว่า grant แบบเหมาลบล้าง revoke ของคนอื่นตามลำดับการรัน)
revoke all on function app.trip_role(uuid)     from public;
revoke all on function app.can_read_trip(uuid) from public;
revoke all on function app.can_write_trip(uuid) from public;

grant execute on function app.trip_role(uuid)      to authenticated;
grant execute on function app.can_read_trip(uuid)  to authenticated;
grant execute on function app.can_write_trip(uuid) to authenticated;

-- ห้ามให้ตารางใหม่ในอนาคตได้สิทธิ์อัตโนมัติ
alter default privileges in schema app  revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;

-- ── profiles ──────────────────────────────────────────────────────────────
-- อ่านได้เฉพาะตัวเอง + คนที่อยู่ทริปเดียวกัน (ไม่งั้นหน้า "ใครเพิ่มจุดนี้" ว่างเปล่า)
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
        from public.trip_members me
        join public.trip_members them on them.trip_id = me.trip_id
       where me.user_id = (select auth.uid())
         and them.user_id = profiles.id
    )
  );

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 🔴 ไม่มี policy DELETE โดยตั้งใจ — ลบบัญชีทำผ่าน auth.users แล้ว cascade ลงมา
--    (D18: ไม่มี policy = เข้าไม่ถึงจาก client เลย ไม่ใช่แค่ซ่อนปุ่ม)

-- ── trips ─────────────────────────────────────────────────────────────────
create policy trips_select on public.trips
  for select to authenticated
  using (app.can_read_trip(id));

create policy trips_insert on public.trips
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy trips_update on public.trips
  for update to authenticated
  using      (app.trip_role(id) = 'owner')
  with check (owner_id = (select auth.uid()));

-- 🔴 ไม่มี policy DELETE — ลบทริปคือลบจุดแวะทั้งทริปแบบย้อนไม่ได้
--    ต้องผ่านทางที่ตั้งใจ (E2 soft delete) ไม่ใช่ DELETE ตรงจาก client

-- ── trip_members ──────────────────────────────────────────────────────────
-- ⚠️ policy ทุกตัวที่นี่ต้องผ่าน app.* เท่านั้น
--    ถ้าเขียน exists(select 1 from trip_members ...) ตรงๆ จะ recursive ไม่รู้จบ
create policy trip_members_select on public.trip_members
  for select to authenticated
  using (app.can_read_trip(trip_id));

create policy trip_members_insert on public.trip_members
  for insert to authenticated
  with check (app.trip_role(trip_id) = 'owner');

create policy trip_members_update on public.trip_members
  for update to authenticated
  using      (app.trip_role(trip_id) = 'owner')
  with check (app.trip_role(trip_id) = 'owner');

create policy trip_members_delete on public.trip_members
  for delete to authenticated
  using (
    app.trip_role(trip_id) = 'owner'
    and user_id <> (select auth.uid())   -- owner ถอดตัวเองไม่ได้ → ทริปไร้เจ้าของ
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 4. grant — ต้องเขียนเอง เพราะโปรเจกต์ตั้ง "Automatically expose new tables" = ปิด
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 จุดที่พลาดง่ายที่สุดของไฟล์นี้: RLS ครบแต่ลืม grant = แอปพังทั้งหมด
--    หรือ grant เกินที่ policy อนุญาต = policy กลายเป็นด่านเดียวที่เหลือ
grant select, insert, update         on public.profiles     to authenticated;
grant select, insert, update         on public.trips        to authenticated;
grant select, insert, update, delete on public.trip_members to authenticated;
-- 🔴 anon ไม่ได้อะไรเลยสักตาราง — นี่คือสิ่งที่ทำให้ AC4 ผ่าน

-- ───────────────────────────────────────────────────────────────────────────
-- 5. สร้าง profile อัตโนมัติเมื่อสมัคร
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. updated_at ให้เซิร์ฟเวอร์เขียน (D7 — ห้ามเชื่อนาฬิกาเครื่อง client)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();
create trigger trips_touch    before update on public.trips
  for each row execute function app.touch_updated_at();

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. self-check — รันหลัง commit แล้วต้องได้ผลตามที่เขียนไว้
-- ═══════════════════════════════════════════════════════════════════════════

-- 7.1 ต้องได้ 0 แถว — ตารางที่เปิด RLS แต่ไม่มี policy สักตัว
select c.relname as table_without_policy
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

-- 7.2 ต้องได้ 0 แถว — policy ที่ปล่อยผ่านทุกกรณี (บั๊ก B2 ของเว็บเดิม)
select polrelid::regclass as tbl, polname
  from pg_policy
 where polrelid in ('public.profiles'::regclass,'public.trips'::regclass,'public.trip_members'::regclass)
   and coalesce(pg_get_expr(polqual, polrelid), 'true') = 'true'
   and coalesce(pg_get_expr(polwithcheck, polrelid), 'true') = 'true';

-- 7.3 ต้องได้ 0 แถว — สิทธิ์ที่หลุดไปถึง anon
select table_name, privilege_type
  from information_schema.role_table_grants
 where grantee = 'anon' and table_schema = 'public'
   and table_name in ('profiles','trips','trip_members');

-- 7.4 ต้อง > 0 — E1-AC2 วัดว่ามี auth.uid() จริงในนโยบาย
select count(*) as policies_using_auth_uid
  from pg_policy
 where pg_get_expr(polqual, polrelid) like '%auth.uid%'
    or pg_get_expr(polwithcheck, polrelid) like '%auth.uid%';
