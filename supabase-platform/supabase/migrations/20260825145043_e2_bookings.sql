-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `bookings`: ของที่จ่ายเงินไปแล้ว · `D51` · `D70` · `D73` · `D76` · `E2-AC13`
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── `E2-AC13` — `file_url` → `file_path` ─────────────────────────────────
-- 🔴 ชื่อเดิม **จะโกหกทันทีที่ bucket เป็น private** · P8 ชี้ว่า `AC5` วัดด้วย
-- *"เอา URL ไปเปิดในหน้าต่างที่ไม่ล็อกอิน ต้องไม่ได้ไฟล์"* ซึ่ง**ผ่านทันทีที่กดปิด bucket**
-- **และวินาทีเดียวกันนั้น ทุกแถวเดิมชี้ไป URL ที่ตายแล้ว** → คอลัมน์ต้องเก็บ *path* ตั้งแต่ต้น
-- ⚠️ **ไม่มีคอลัมน์ `file_url` เลยแม้แต่เป็น alias** — มีเมื่อไหร่จะมีคนเขียนลงไป
--
-- ── `trip_day_id` เป็น nullable และนั่นตั้งใจ ─────────────────────────────
-- ตั๋วที่ยังไม่รู้วัน (จองไว้ก่อน) ต้องมีได้ · FK ประกอบที่มี `null` **ไม่ถูกบังคับ** (MATCH SIMPLE)
-- → ผูกวันเมื่อไหร่ `D70` บังคับทันทีว่าต้องเป็นวันของทริปเดียวกัน
--
-- ── `D73` — ด่านโตตามที่ P7 บอกไว้ล่วงหน้า ────────────────────────────────
-- 🔴 `app.assert_day_has_no_stops()` ตรวจแค่ `trip_stops` · **P7 เตือนตั้งแต่ก่อน `bookings` มี**
--    ว่าถ้าไม่โตตาม **ลบวันที่ไม่มีจุดแวะแต่มีใบจอง จะผ่านฉลุยและใบจองหายเงียบ**
--    · และ **ใบจองคือของที่จ่ายเงินไปแล้ว** — เหตุผลข้อเดียวกับ `D51`
--    · ⚠️ ต้องมี `and deleted_at is null` ทั้งสองเงื่อนไข ไม่งั้น tombstone จะขวางการลบวันตลอดกาล
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop function if exists public.soft_delete_booking(uuid);
--   drop table if exists public.bookings;
--   -- แล้วคืน app.assert_day_has_no_stops() ฉบับที่ตรวจแค่ trip_stops
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

create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null,
  trip_day_id uuid,

  category    text not null check (length(trim(category)) between 1 and 40),
  title       text not null check (length(trim(title)) between 1 and 200),
  date        date,
  time        text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  confirmation_number text,
  link        text,
  note        text,

  -- `E2-AC13` — **path ไม่ใช่ URL** · signed URL หมดอายุ เก็บลงคอลัมน์ไม่ได้
  file_path   text,
  file_name   text,

  status      text not null default 'todo' check (status in ('todo', 'booked', 'cancelled')),
  book_by_days_before int check (book_by_days_before is null or book_by_days_before between 0 and 365),

  added_by_user   uuid references public.profiles(id) on delete set null,
  legacy_added_by text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by_user uuid references public.profiles(id) on delete set null,
  deleted_at  timestamptz,

  constraint bookings_trip_fk foreign key (trip_id)
    references public.trips(id) on delete cascade,
  -- `D70` — ผูกวันเมื่อไหร่ ต้องเป็นวันของทริปเดียวกัน · `null` = ไม่ถูกบังคับ (MATCH SIMPLE)
  constraint bookings_day_fk foreign key (trip_id, trip_day_id)
    references public.trip_days(trip_id, id) on delete cascade
);

create index bookings_trip_idx on public.bookings (trip_id);
create index bookings_day_idx  on public.bookings (trip_day_id);

revoke all on public.bookings from anon;
alter table public.bookings enable row level security;

create policy bookings_select on public.bookings
  for select to authenticated
  using (app.can_read_trip(trip_id) and deleted_at is null);
create policy bookings_insert on public.bookings
  for insert to authenticated with check (app.can_write_trip(trip_id));
create policy bookings_update on public.bookings
  for update to authenticated
  using (app.can_write_trip(trip_id)) with check (app.can_write_trip(trip_id));
-- 🔴 ไม่มี policy DELETE — `D76` soft delete

grant select on public.bookings to authenticated;
grant insert (trip_id, trip_day_id, category, title, date, time, confirmation_number,
              link, note, file_path, file_name, status, book_by_days_before, legacy_added_by)
  on public.bookings to authenticated;
-- `trip_id` ไม่อยู่ในฝั่ง update — ย้ายใบจองข้ามทริปไม่ใช่การกระทำที่มีอยู่
-- `deleted_at` ไม่อยู่เช่นกัน — ลบผ่าน RPC เท่านั้น (`P-53`)
grant update (trip_day_id, category, title, date, time, confirmation_number,
              link, note, file_path, file_name, status, book_by_days_before)
  on public.bookings to authenticated;

grant select, delete on public.bookings to service_role;  -- ข้อยกเว้นที่ 4 · เก็บกวาด fixture

create trigger bookings_stamp_added_by
  before insert on public.bookings
  for each row execute function app.stamp_added_by();
create trigger bookings_touch before update on public.bookings
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- `D73` — ด่านโตตาม · **ตัวถัดไปที่ P7 บอกไว้ล่วงหน้าว่าต้องเพิ่ม**
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.assert_day_has_no_stops()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.trip_stops
     where trip_day_id = old.id and deleted_at is null
  ) then
    raise exception 'ลบวันที่ยังมีจุดแวะอยู่ไม่ได้ — ย้ายหรือลบจุดแวะก่อน (cascade จะลบทิ้งเงียบ ๆ)';
  end if;
  -- 🔴 ใบจองคือของที่จ่ายเงินไปแล้ว (`D51`) — cascade กินมันได้เหมือนจุดแวะทุกประการ
  if exists (
    select 1 from public.bookings
     where trip_day_id = old.id and deleted_at is null
  ) then
    raise exception 'ลบวันที่ยังมีใบจองผูกอยู่ไม่ได้ — ย้ายหรือลบใบจองก่อน (cascade จะลบทิ้งเงียบ ๆ)';
  end if;
  return old;
end;
$$;

revoke execute on function app.assert_day_has_no_stops() from public;

-- ───────────────────────────────────────────────────────────────────────────
-- `P-53` — soft delete ต้องผ่าน RPC
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.soft_delete_booking(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.bookings where id = p_id and deleted_at is null;
  if v_trip is null then
    raise exception 'ไม่พบใบจองนี้ หรือถูกลบไปแล้ว';
  end if;
  if not app.can_write_trip(v_trip) then
    raise exception 'ไม่มีสิทธิ์แก้ทริปนี้';
  end if;

  update public.bookings set deleted_at = now() where id = p_id;
end;
$$;

revoke all on function public.soft_delete_booking(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_booking(uuid) to authenticated;

commit;
