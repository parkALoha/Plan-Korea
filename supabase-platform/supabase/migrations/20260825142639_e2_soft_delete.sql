-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — soft delete · `E2-AC12` / `D76` · ตัดสินครั้งเดียวทั้งตระกูล
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · P7 เป็นคนจับว่ามันถูกเลื่อนมา 5 ตารางติด
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมตอนนี้ ────────────────────────────────────────────────────────────
-- ใช้เกณฑ์ของ `D56` ที่ผมรับมาเองตัดสิน: *เพิ่มทีหลังเจ็บก็ต่อเมื่อ ① ค่าหาไม่ได้อีกแล้ว
-- หรือ ② มันเปลี่ยนสิ่งที่แถวเดิม **เป็นอยู่** (grain · policy · จังหวะการเปลี่ยนของค่า)*
-- 🎯 soft delete เข้า **②** เต็มตัว — `alter table add column` ถูกมาก
--    **`deleted_at is null` ที่ต้องไปอยู่ในทุก query ของ `E3` ที่ยังไม่ถูกเขียน คือของแพง**
--    → ตอนนี้คือจังหวะที่ถูกที่สุด เพราะ query พวกนั้นยังไม่มีอยู่
-- · และ `D51` ตัดสินไว้แล้วว่า `trip_hotels` ต้องมี `exclude … where (deleted_at is null)`
--   **เขียน DDL นั้นไม่ได้ถ้าตระกูลนี้ไม่มีคอลัมน์** → ต้องตัดสินก่อน `trip_hotels` ไม่ใช่หลัง
--
-- ── กติกาที่ลงพร้อมกัน (`D76`) ────────────────────────────────────────────
--   · ลบ = **`UPDATE` ตั้ง `deleted_at`** → policy `DELETE` + `grant delete` **ถูกถอดออก**
--   · อ่าน = policy เติม `and deleted_at is null` — **บังคับที่ policy ไม่ใช่ที่ query**
--     ลืมที่ query แล้ว**เห็นน้อยลง** ไม่ใช่เห็นมากขึ้น
--   · index **ไม่ partial** (P7) — ไว้ให้กฎ merge อ่าน tombstone ได้ถ้าวันหนึ่งมี
--   · **ไม่ purge** — ทุกนโยบาย purge ต้องมาคู่กับ *"เครื่องที่เก่ากว่า N ให้ล้างทั้งก้อน"* ไม่งั้นได้แถวผี
--   · ✅ **ได้ "ใครลบ" ฟรีจาก `updated_by_user`** เพราะ soft delete คือ `UPDATE`
--
-- ── ตารางที่ *ไม่* ได้ และเหตุผล ───────────────────────────────────────────
--   `trip_plans` — มีด่านแผนสุดท้ายอยู่แล้ว · ลบแผนคือการตั้งใจทำลายที่ผู้ใช้รู้ตัว
--   `trip_days`  — ตามช่วงวันของทริป ไม่ใช่ของที่ผู้ใช้ลบทีละใบ (`D73`)
--   คลัง · แคช   — ไม่ใช่ข้อมูลผู้ใช้
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   alter table public.trip_stops    drop column if exists deleted_at;
--   alter table public.custom_places drop column if exists deleted_at;
--   -- แล้วคืน policy DELETE + grant delete + select policy ฉบับไม่มีเงื่อนไข
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

alter table public.trip_stops    add column deleted_at timestamptz;
alter table public.custom_places add column deleted_at timestamptz;

-- ── อ่าน: กรอง tombstone ที่ policy ───────────────────────────────────────
drop policy if exists trip_stops_select on public.trip_stops;
create policy trip_stops_select on public.trip_stops
  for select to authenticated
  using (app.can_read_trip(trip_id) and deleted_at is null);

drop policy if exists custom_places_select on public.custom_places;
create policy custom_places_select on public.custom_places
  for select to authenticated
  using (app.can_read_trip(trip_id) and deleted_at is null);

-- ── ลบ: ถอดทางเดิมออกให้หมด ───────────────────────────────────────────────
-- 🔴 ถอด **ทั้ง policy และ grant** — เหลือทางเดียวคือ `UPDATE`
--    เหลือทางใดทางหนึ่งไว้ = soft delete จะถูกข้ามได้ทุกครั้งโดยไม่มีอะไรค้าน
drop policy if exists trip_stops_delete    on public.trip_stops;
drop policy if exists custom_places_delete on public.custom_places;
revoke delete on public.trip_stops    from authenticated;
revoke delete on public.custom_places from authenticated;

-- ── เขียน: เพิ่ม `deleted_at` เข้าลิสต์ `update` (ไม่ใช่ `insert`) ─────────
-- 🔴 **ไม่อยู่ในลิสต์ `insert` โดยตั้งใจ** — แถวที่เกิดมาพร้อมสถานะ "ถูกลบแล้ว" ไม่มีความหมาย
--    และเป็นทางที่ทำให้ของหายตั้งแต่วินาทีแรกโดยไม่มีใครเห็นมันเลยสักครั้ง
revoke update on public.trip_stops    from authenticated;
revoke update on public.custom_places from authenticated;
grant update (plan_id, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
              dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
              visited_at, photo_path, transfer_target_time, transfer_target_label, deleted_at)
  on public.trip_stops to authenticated;
grant update (city_id, category, lat, lng, maps_query, description, google_place_id, deleted_at)
  on public.custom_places to authenticated;

-- ── `D73` — ด่านต้องไม่นับ tombstone (P7 เจอกับดักในด่านของตัวเอง) ─────────
-- 🔴 ฉบับก่อนหน้า `where trip_day_id = old.id` **ถูกวันนี้เพราะไม่มี tombstone**
--    วินาทีที่ `deleted_at` เกิด มันจะนับ tombstone ด้วย →
--    **วันที่จุดแวะถูกลบไปหมดแล้ว จะลบไม่ได้ตลอดกาล** และ error บอกว่า *"ยังมีจุดแวะอยู่"*
--    ทั้งที่ผู้ใช้เห็นว่าว่างเปล่า · **ชนิดเดียวกับ `D73`: ด่านที่ถูกวันนี้ ผิดเงียบ ๆ วันที่ของรอบตัวมันเปลี่ยน**
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
  return old;
end;
$$;

revoke execute on function app.assert_day_has_no_stops() from public;
revoke execute on function app.assert_trip_has_plan()    from public;
-- 🟡 P7 เสนอ — วันนี้ไม่มีความเสี่ยงจริงเพราะ PG ปฏิเสธการเรียก trigger function ตรง ๆ อยู่แล้ว
--    **แต่ `D38` มีอยู่เพื่อไม่ให้เราพึ่ง "มันบังเอิญเรียกไม่ได้"**

-- ── สถานที่ที่ยังถูกใช้อยู่ ลบไม่ได้ — แม้จะเป็นการลบแบบ soft ──────────────
-- FK `restrict` กันการลบ**จริง**ได้ แต่ **ไม่รู้จัก `deleted_at`**
-- → ถ้าไม่มีด่านนี้ ผู้ใช้จะ soft delete สถานที่ที่ยังมีจุดแวะชี้อยู่ได้
--   **แล้วจุดแวะจะชี้ไปสถานที่ที่ตัวเองมองไม่เห็น** — ของหายจากหน้าจอโดยที่แถวยังถูกกฎทุกข้อ
create or replace function app.assert_place_not_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null
     and exists (
       select 1 from public.trip_stops
        where custom_place_id = old.id and deleted_at is null
     ) then
    raise exception 'ลบสถานที่ที่ยังมีจุดแวะใช้อยู่ไม่ได้ — เอาออกจากแผนก่อน';
  end if;
  return new;
end;
$$;

revoke execute on function app.assert_place_not_in_use() from public;

create trigger custom_places_not_in_use
  before update on public.custom_places
  for each row execute function app.assert_place_not_in_use();

commit;
