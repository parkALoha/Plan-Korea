-- ═══════════════════════════════════════════════════════════════════════════
-- E1 — Identity + แกนสิทธิ์ขั้นต่ำ  ·  เจ้าของ: P1-Lead  ·  24 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
-- ที่มา: docs/engine/schema/0001_identity.sql (แบบ · แหล่งความจริงของการออกแบบ)
--        ไฟล์นี้คือ "ของที่รันจริง" · ต่างจากแบบ 3 อย่างและตั้งใจทั้งสามข้อ:
--          ① เพิ่มบล็อก assert ปลายทางไว้ใต้ begin; ก่อน DDL ทุกบรรทัด
--          ② ตัดหัวข้อ 7–8 (self-check) ออก → ย้ายไป 0001_identity_selfcheck.sql
--             เพราะมันเป็น SELECT ที่ต้อง "อ่านผล" ไม่ใช่ DDL ที่ push แล้วจบ
--          ③ เติมบล็อก rollback ด้านล่างตาม supabase-platform/migration-template.sql
--
-- 🔴 ปลายทางเดียวที่อนุญาต: engine-dev (org Plan-trip-app)
--    รันด้วย: supabase db push --workdir supabase-platform
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop table if exists public.trip_members;
--   drop table if exists public.trips;
--   drop table if exists public.profiles;
--   drop schema if exists app cascade;
--   -- ⚠️ ข้อนี้ "ไม่" อยู่ในการถอยอัตโนมัติ และตั้งใจไม่ใส่:
--   --    alter default privileges in schema public grant all on tables to anon, authenticated;
--   --    คือการคืนค่าเริ่มต้นของ Supabase ซึ่ง "เปิดโล่งให้ anon กับตารางใหม่ทุกตัว"
--   --    = เปิดรูที่ migration นี้ตั้งใจปิด · รันข้อนี้ต่อเมื่อจะทิ้งโปรเจกต์ทั้งใบเท่านั้น
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
-- ไม่มี ref ไม่มีความลับในบล็อกนี้ · อ้างสิ่งที่มีอยู่ใน schema อยู่แล้ว
-- ทำงานตอนคนพลาด ไม่ใช่ตอนคนอ่านเอกสารล่วงหน้า · raise exception = rollback ทั้ง transaction
--
-- 🔴🔴 **แก้ 24 ส.ค. 2026 หลัง `P-30` (P4) — ไฟล์นี้คือตัวที่อันตราย ไม่ใช่ตัวถัดๆ ไป**
--   `db push` ใส่โปรเจกต์ที่ไม่เคยรัน migration ของเรา จะรัน**ไฟล์นี้เป็นตัวแรก**
--   แล้วด่าน allowlist ของไฟล์ถัดไปจะผ่านเสมอ **เพราะไฟล์นี้เพิ่งสร้างเงื่อนไขที่มันตรวจให้**
--   → ด่านของไฟล์นี้จึงเป็นด่าน**เดียว**ที่ยืนระหว่างเรากับฐานของคนอื่น
--
--   ⚠️ **ไฟล์นี้ถูกแก้หลังจากถูก apply ลง `engine-dev` ไปแล้ว** — ปลอดภัยเพราะ
--   `db push` ตัดสินว่าจะรันอะไรจาก**เวอร์ชันใน `supabase_migrations.schema_migrations`**
--   `20260824043822` ถูกบันทึกว่ารันแล้ว **จึงไม่ถูกรันซ้ำและเนื้อไฟล์ไม่ถูกตรวจอีก**
--   · การแก้ทั้งหมดอยู่ใน**บล็อกด่านเท่านั้น** ไม่มี DDL บรรทัดไหนถูกแตะ
do $guard$
declare existing text;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trip_meta'
  ) then
    raise exception 'ผิดโปรเจกต์: ฐานนี้มีตาราง trip_meta = นี่คือ DB ทริปจริง ไม่ใช่ engine-dev';
  end if;

  -- 🔴 `P-30` — ด่านจริงของไฟล์นี้: **ฐานนี้ต้องเป็นโปรเจกต์ใหม่ที่ยังไม่มีอะไรใน `public`**
  --   นี่คือสิ่งเดียวที่ `0001` ตรวจได้แล้ว `0001` เองสร้างขึ้นมาไม่ได้ —
  --   ทุกอย่างอื่นที่มันตรวจได้ มันก็สร้างเองได้ จึงกันอะไรไม่ได้เลย (ปัญหาไก่กับไข่ของ `P-30`)
  --   · `a-gleam` = production ของร้าน **มีตารางเต็มไปหมด → ตายตรงนี้**
  --   · DB ทริปจริง → ตายที่ด่านข้างบนอยู่แล้ว
  --   · โปรเจกต์ใหม่เอี่ยม → ผ่าน ซึ่งถูกต้อง เพราะนั่นคือสภาพของ `engine-dev` ตอนรันจริง
  --   ⚠️ **ถ้าข้อนี้ล้มบนฐานที่คุณแน่ใจว่าใหม่จริง** แปลว่า Supabase เปลี่ยนของตั้งต้น
  --      **อย่าลบด่าน — ไล่ดูรายชื่อในข้อความ error แล้วค่อยตัดสิน** (ชื่อถูกพิมพ์มาให้แล้ว)
  select string_agg(table_name, ', ' order by table_name) into existing
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE';

  if existing is not null then
    raise exception 'ผิดโปรเจกต์: public ของฐานนี้มีตารางอยู่แล้ว (%) — migration ชุดนี้รันได้เฉพาะโปรเจกต์ใหม่เท่านั้น', existing;
  end if;
end $guard$;


-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 P-18 (P4): ต้องอยู่**บนสุด** ก่อน create table ทุกตัว
-- `alter default privileges` มีผลกับ object ที่สร้าง **หลัง** มันเท่านั้น ไม่ย้อนหลัง
-- ฉบับแรกวางไว้บรรทัด 161 = ตาราง 3 ตัวถูกสร้างไปแล้วภายใต้ default ของโปรเจกต์
-- ซึ่ง Supabase bootstrap คือ `grant all on tables to anon, authenticated, service_role`
-- → คอมเมนต์ที่ผมเขียนว่า "anon ไม่ได้อะไรเลย" **อาจไม่จริง** และ AC4 จะผ่านด้วย RLS ชั้นเดียว
-- 🎯 ปัญหาที่แท้จริงไม่ใช่ลำดับ แต่คือ **ไฟล์ไปพึ่งค่าที่มองไม่เห็น**
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 P-24 (P1 · 24 ส.ค. 2026) — `create schema app` ต้องมาก่อน ADP ของ schema app
-- P-18 ย้ายบล็อก ADP ขึ้นมาบนสุดถูกแล้ว แต่ย้ายมาไว้ **เหนือ `create schema app`**
-- → `alter default privileges in schema app` บนฐานที่ยังไม่มี schema app
--   ล้มทันทีด้วย `ERROR: schema "app" does not exist` = migration ตายที่คำสั่งที่ 2
-- 🎯 เหตุผลของ P-18 คือ "ADP ต้องมาก่อน create table/function ทุกตัว" ซึ่งยังจริงทุกตัวอักษร
--    `create schema` ไม่ได้สร้างตารางหรือฟังก์ชัน ย้ายขึ้นมาก่อนจึงไม่ลบล้าง P-18 เลย
-- ⚠️ ชนิดของความพลาด: กติกาที่เขียนถูก แต่ **ขอบเขตของคำว่า "บนสุด" ไม่ถูกระบุ**
--    อ่านไฟล์แล้วดูถูกทุกบรรทัด · เจอได้ด้วยการไล่ลำดับการรันเท่านั้น
create schema if not exists app;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema app    revoke execute on functions from public;

-- ───────────────────────────────────────────────────────────────────────────
-- 0. schema app — ที่อยู่ของ helper
-- ───────────────────────────────────────────────────────────────────────────
-- ทำไมไม่วางใน public: PostgREST เปิด schema public เป็น REST อัตโนมัติ
-- ฟังก์ชันใน public จะโผล่เป็น /rest/v1/rpc/<ชื่อ> ให้ยิงได้ตรงๆ
-- = กลายเป็นเครื่องมือถามว่า "ทริป id นี้มีอยู่ไหม / ฉันเป็นสมาชิกไหม" ทีละใบ
-- (สร้างไปแล้วด้านบนตาม P-24 — คงบรรทัดนี้ไว้เป็น no-op ที่อ่านออกว่าตั้งใจ)
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
  created_by     uuid not null references public.profiles(id) on delete restrict,
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

-- 🔴 P-15 (P4): เดิมชื่อ `owner_id` แล้ว policy ครึ่งหนึ่งเชื่อคอลัมน์นี้ อีกครึ่งเชื่อ `trip_members.role`
-- สองแหล่งไม่มีอะไรบังคับให้ตรงกัน → พอโอน owner ผ่าน trip_members คนใหม่จะแก้ทริปไม่ได้
-- แก้ที่ต้นเหตุ: เปลี่ยนชื่อเป็น `created_by` ให้ชัดว่า **ไม่ใช่แหล่งสิทธิ์**
-- 🎯 แหล่งความจริงของสิทธิ์คือ `trip_members` ที่เดียว ตลอดทั้งไฟล์
-- restrict ไม่ใช่ cascade: ลบ profile แล้วทริปหายทั้งใบ = ข้อมูลสมาชิกคนอื่นหายด้วย

create table public.trip_members (
  trip_id    uuid not null references public.trips(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('owner','editor','viewer')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_members_user_idx on public.trip_members(user_id);

-- 🔴 P-18: revoke แบบระบุชื่อ — แก้ของที่ **มีอยู่แล้ว** ส่วน ADP ข้างบนกันของ **ใหม่**
-- ต้องมีทั้งคู่ · อย่างใดอย่างหนึ่งไม่พอ
revoke all on public.profiles     from anon;
revoke all on public.trips        from anon;
revoke all on public.trip_members from anon;

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
set search_path = ''
as $$
  select role from public.trip_members
   where trip_id = t and user_id = (select auth.uid())
$$;

create or replace function app.can_read_trip(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.trip_role(t) is not null
$$;

-- P4 P-17: policy ต้องผ่าน app.* **ทุกที่** ไม่ใช่เฉพาะ trip_members
-- ถ้า profiles_select ยิง trip_members ตรงๆ มันจะไปพึ่ง RLS ของอีกตารางอีกชั้น = policy ผูกกัน
create or replace function app.shares_trip_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.trip_members me
      join public.trip_members them on them.trip_id = me.trip_id
     where me.user_id = (select auth.uid()) and them.user_id = other
  )
$$;

-- P4 P-14: ต้องนับ owner ได้ ถึงจะให้คนลาออกเองได้โดยไม่ทำให้ทริปกำพร้า
create or replace function app.trip_owner_count(t uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.trip_members
   where trip_id = t and role = 'owner'
$$;

-- grant ทีละตัวพร้อมลายเซ็น ห้าม "grant execute on all functions in schema app"
-- (กฎร่วมข้อ 5 — P4 เจอว่า grant แบบเหมาลบล้าง revoke ของคนอื่นตามลำดับการรัน)
revoke all on function app.trip_role(uuid)        from public;
revoke all on function app.shares_trip_with(uuid) from public;
revoke all on function app.trip_owner_count(uuid) from public;
revoke all on function app.can_read_trip(uuid) from public;

grant execute on function app.trip_role(uuid)         to authenticated;
grant execute on function app.shares_trip_with(uuid)  to authenticated;
grant execute on function app.trip_owner_count(uuid)  to authenticated;
-- 🔴 P4: `can_write_trip` ถอดออกแล้ว — E1 ยังไม่มี policy ไหนเรียกใช้
-- "อย่า grant สิ่งที่ยังไม่ต้องใช้" · จะกลับมาใน E2 ตอนมีตารางเนื้อหาที่ editor เขียนจริง
grant execute on function app.can_read_trip(uuid)  to authenticated;


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
    or app.shares_trip_with(id)          -- P-17: ผ่าน app.* ไม่ยิงตารางอื่นตรงๆ
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
  with check (created_by = (select auth.uid()));

-- P-15: ทั้งสองครึ่งเชื่อ trip_members เหมือนกัน ไม่มีแหล่งที่สอง
create policy trips_update on public.trips
  for update to authenticated
  using      (app.trip_role(id) = 'owner')
  with check (app.trip_role(id) = 'owner');

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

-- P4 P-14: ฉบับเดิมทำให้ viewer/editor **ติดอยู่ในทริปถาวร** ออกเองไม่ได้เลย
create policy trip_members_delete on public.trip_members
  for delete to authenticated
  using (
    -- owner ถอดคนอื่นออก
    (app.trip_role(trip_id) = 'owner' and user_id <> (select auth.uid()))
    -- หรือใครก็ได้ลาออกเอง · owner ลาออกได้ต่อเมื่อยังมี owner คนอื่นเหลือ
    or (
      user_id = (select auth.uid())
      and (role <> 'owner' or app.trip_owner_count(trip_id) > 1)
    )
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
set search_path = ''
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
-- 5.5 🔴 สร้างแถว owner ทันทีที่สร้างทริป — P-13 (P4 จับได้ · เป็นตัวบล็อก)
-- ───────────────────────────────────────────────────────────────────────────
-- ถ้าไม่มี trigger นี้ ลำดับที่เกิดจริงคือ:
--   1. insert into trips ผ่าน (trips_insert ตรวจแค่ created_by = auth.uid())
--   2. ไม่มีใครสร้างแถวใน trip_members → app.trip_role(id) คืน null
--   3. trips_select = can_read_trip = "role is not null" → เท็จ → **อ่านทริปที่เพิ่งสร้างไม่เห็น**
--   4. จะเติมเองก็ไม่ได้ — trip_members_insert ต้องการ role = 'owner' ซึ่งยังว่าง
--      และ null = 'owner' คืน null ไม่ใช่ true → ถูกปฏิเสธ
-- 🔴 ผลคือ **ทุกทริปที่สร้างจากเว็บกลายเป็นทริปกำพร้าที่มองไม่เห็น กู้จากฝั่ง client ไม่ได้เลย**
--
-- ⚠️ ห้ามแก้ด้วยการเปิด trip_members_insert ให้กว้างขึ้น (P4 เตือน)
--    นั่นคือช่อง self-join — ใครก็เขียนแถวตัวเองเข้าทริปคนแปลกหน้าได้
--    ซึ่งเป็นช่องที่ร้ายที่สุดของตารางนี้ · ต้องแก้ด้วย definer ฝั่งเซิร์ฟเวอร์เท่านั้น

create or replace function app.bootstrap_trip_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, user_id, role, invited_by)
  values (new.id, new.created_by, 'owner', new.created_by)
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

create trigger trips_bootstrap_owner
  after insert on public.trips
  for each row execute function app.bootstrap_trip_owner();

-- ───────────────────────────────────────────────────────────────────────────
-- 5.6 created_by แก้ไม่ได้ — กันไม่ให้มีแหล่งความจริงที่สองย้อนกลับมา (P-15)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.freeze_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by แก้ไม่ได้ — สิทธิ์มาจาก trip_members เท่านั้น (D38/P-15)';
  end if;
  return new;
end;
$$;

create trigger trips_freeze_created_by
  before update on public.trips
  for each row execute function app.freeze_created_by();

-- ───────────────────────────────────────────────────────────────────────────
-- 5.7 🔴 P-19 (P4): หลักประกันว่าทริปมี owner เสมอ — ต้องตรวจตอน commit ไม่ใช่ตอนตัดสินใจ
-- ───────────────────────────────────────────────────────────────────────────
-- `app.trip_owner_count` ใน RLS predicate **แพ้ race**:
--   Tx1 อ่านได้ 2 → ผ่าน → ลบ A     Tx2 อ่านได้ 2 (snapshot เดิม) → ผ่าน → ลบ B
--   ทั้งคู่ commit → owner เหลือ 0 → 🔴 ทริปกำพร้าถาวร กู้จาก client ไม่ได้
--   (ไม่มี policy DELETE บน trips · เพิ่มสมาชิกก็ไม่ได้เพราะต้องมี owner อยู่ก่อน)
-- RLS predicate ไม่ล็อกแถว และ stable function อ่าน snapshot → สองฝั่งเห็นเลขเดียวกัน
-- 🎯 "ตรวจตอนตัดสินใจ" กับ "ตรวจตอน commit" ต่างกันเฉพาะตอนมีคนสองคน
-- helper ยังอยู่เพื่อบอกผู้ใช้ล่วงหน้าว่าออกไม่ได้ (UX) — แต่**หลักประกันคือ trigger ตัวนี้**

create or replace function app.assert_trip_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  -- ทริปถูกลบทั้งใบ → cascade ลบสมาชิกหมด → ไม่ต้องบ่น
  if not exists (select 1 from public.trips where id = old.trip_id) then
    return null;
  end if;
  -- 🔴 P-23 (P4): deferred อย่างเดียวยังไม่สนิท
  -- owner 2 คนลาออก **คนละแถว** → ไม่ชนล็อกกัน → ตอน commit ต่างฝ่ายต่างยังเห็นอีกคนอยู่ → นับได้ 1 ทั้งคู่
  -- หน้าต่างแคบลงมาก (จาก "ทั้งทรานแซกชัน" เหลือ "ระหว่าง commit") **แต่ไม่ใช่ศูนย์**
  -- ล็อกแถว trips ก่อนนับ = บังคับให้ทุกการเปลี่ยนสมาชิกของทริปเดียวกันเข้าคิว
  perform 1 from public.trips where id = old.trip_id for update;

  select count(*) into n
    from public.trip_members
   where trip_id = old.trip_id and role = 'owner';
  if n = 0 then
    raise exception 'ทริปต้องมี owner อย่างน้อย 1 คนเสมอ (P-19)';
  end if;
  return null;
end;
$$;

create constraint trigger trip_members_keep_owner
  after delete or update on public.trip_members
  deferrable initially deferred
  for each row execute function app.assert_trip_has_owner();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. updated_at ให้เซิร์ฟเวอร์เขียน (D7 — ห้ามเชื่อนาฬิกาเครื่อง client)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
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
