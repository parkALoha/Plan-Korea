-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `trip_stops`: ตารางที่เป็นทั้งทริป · `D6` · `D36` · `D53` · `D70` · `D73`
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · `E2-AC8` (rank key) · `E2-AC3`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 **ตารางนี้คือทั้งทริป** — ไปไหน กี่โมง ค้างที่ไหน · `visited_at` = เวลาที่อยู่จุดนั้นจริง
-- `transfer_target_label` มีเลขไฟลต์จริง · วันนี้บนฐานเก่าเป็น `using (true)` =
-- **ไล่ดูได้ว่าเจ้าของทริปอยู่ตรงไหนตอนไหนย้อนหลังได้ทั้งทริป**
--
-- ── `D6`/`E2-AC8` — rank key · และ 4 ข้อของ P7 ที่ต้องมาพร้อมกัน ───────────
-- เกณฑ์: ลากจุดแวะ 1 จุดต้องเขียน DB **แถวเดียว** ไม่ใช่ n แถว
-- 🔴 **`rank` ต้องไม่ unique โดยเจตนา** — 2 เครื่องแทรกตำแหน่งเดียวกันย่อมคำนวณได้ค่าเท่ากัน
--    และนั่น **ถูกกฎหมาย** · ใส่ `unique (trip_day_id, plan_id, rank)` เมื่อไหร่
--    **คนแทรกทีหลังจะได้ error แทนที่จะได้จุดของตัวเอง = แถวหาย** ซึ่งแย่กว่าลำดับสลับ
--    ⚠️ **จะมีคนมาเติม unique ทีหลังด้วยความหวังดี — และคนนั้นอาจเป็นผมเอง**
-- 🎯 ลำดับที่นิ่งมาจาก **tie-break `(rank, id)`** ไม่ใช่จากการห้ามชน · `id` นิ่งและเหมือนกันทุกเครื่อง
--    (วันนี้ `useStops.ts:13-17` ไม่มี tie-break เลย = บั๊ก 8.1 ที่ยังเปิดอยู่)
-- · ขอบเขต rank/rebalance = **`(trip_day_id, plan_id)`** ไม่ใช่ `trip_day_id` (`D36`)
-- · index **ไม่ partial** — กฎ merge ต้องอ่าน tombstone ได้ (P7 แก้ `§7` ข้อ 5 ของตัวเอง)
-- · `rank text COLLATE "C"` — ไม่งั้น JS กับ PG เรียงไม่ตรงกันเงียบ ๆ
--
-- ── `D53` — `kind` เป็นตัวแยกว่าต้องมีสถานที่กี่แหล่ง ──────────────────────
-- ⚠️ **`<= 1` เฉย ๆ ไม่เอา** (P4 ค้าน) — มันทำให้แถว `kind='place'` ที่ไม่มีสถานที่กลายเป็นของถูกกฎ
--    **ซึ่งเป็นบั๊กที่เงียบที่สุดที่เป็นไปได้ในตารางนี้**
-- · `kind='intercity'` ต้องเป็น 0 จริง — `useStops.ts:223` เขียน `place_id: ""` โดยตั้งใจ
--   → ผูกกับ `kind` ได้ทั้งความเข้มและความถูกต้อง
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop trigger if exists trip_days_no_orphan_stops on public.trip_days;
--   drop function if exists app.assert_day_has_no_stops();
--   drop table if exists public.trip_stops;
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

create table public.trip_stops (
  id          uuid primary key default gen_random_uuid(),

  -- `D70` — `trip_id` ตัวเดียวกันถูกใช้ในทั้งสอง FK ข้างล่าง
  trip_id     uuid not null,
  plan_id     uuid not null,
  trip_day_id uuid not null,

  -- `D53` — ชี้คลังกลาง **หรือ** คลังของทริป อย่างใดอย่างหนึ่ง (ดู check ข้างล่าง)
  -- `restrict` ทั้งคู่: ลบสถานที่ที่ยังอยู่ในแผนไม่ได้ · ต้องเอาออกจากแผนก่อน
  catalog_place_id uuid references public.catalog_places(id) on delete restrict,
  custom_place_id  uuid,

  kind        text not null default 'place'
              check (kind in ('place', 'hotel', 'intercity', 'transfer')),

  -- `D6`/`E2-AC8` · `COLLATE "C"` ให้ PG เรียงตรงกับ JS
  rank        text collate "C" not null check (length(rank) between 1 and 64),

  dwell_minutes int check (dwell_minutes is null or dwell_minutes between 0 and 1440),
  travel_mode   text,
  note          text,

  intercity_from text,
  intercity_to   text,
  intercity_mode text,

  visited_at   timestamptz,

  -- 🔴 **เปลี่ยนความหมายเป็น *path* ไม่ใช่ URL** (`E2-AC5`)
  --    `getPublicUrl()` เก็บผลลงคอลัมน์ได้เพราะ bucket เป็น public · **signed URL หมดอายุ เก็บไม่ได้**
  photo_path   text,

  transfer_target_time  text
               check (transfer_target_time is null or transfer_target_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  transfer_target_label text,

  added_by_user   uuid references public.profiles(id) on delete set null,
  legacy_added_by text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by_user uuid references public.profiles(id) on delete set null,

  -- 🔴 `D53` + คำค้านของ P4 — ผูกจำนวนสถานที่กับ `kind`
  constraint trip_stops_place_by_kind check (
    case kind
      when 'intercity' then num_nonnulls(catalog_place_id, custom_place_id) = 0
      when 'hotel'     then num_nonnulls(catalog_place_id, custom_place_id) = 0
      else                  num_nonnulls(catalog_place_id, custom_place_id) = 1
    end
  ),

  -- `D70` — วันกับแผนต้องเป็นทริปเดียวกับแถวนี้ · บังคับที่ฐาน ไม่ใช่ที่ policy
  constraint trip_stops_day_fk foreign key (trip_id, trip_day_id)
    references public.trip_days(trip_id, id) on delete cascade,
  constraint trip_stops_plan_fk foreign key (trip_id, plan_id)
    references public.trip_plans(trip_id, id) on delete cascade,
  -- สถานที่ของทริปตัวเองเท่านั้น
  constraint trip_stops_custom_place_fk foreign key (trip_id, custom_place_id)
    references public.custom_places(trip_id, id) on delete restrict
);

-- ทางที่โค้ดเดินจริง: "จุดแวะของวันนี้ในแผนนี้ เรียงตามลำดับ"
-- 🔴 **ไม่ partial** — กฎ merge ต้องอ่าน tombstone ได้ (`E2-AC12` ที่ยังไม่ตัดสิน)
create index trip_stops_day_plan_rank_idx
  on public.trip_stops (trip_day_id, plan_id, rank);

create index trip_stops_trip_idx on public.trip_stops (trip_id);

revoke all on public.trip_stops from anon;

alter table public.trip_stops enable row level security;

create policy trip_stops_select on public.trip_stops
  for select to authenticated using (app.can_read_trip(trip_id));
create policy trip_stops_insert on public.trip_stops
  for insert to authenticated with check (app.can_write_trip(trip_id));
create policy trip_stops_update on public.trip_stops
  for update to authenticated
  using (app.can_write_trip(trip_id)) with check (app.can_write_trip(trip_id));
create policy trip_stops_delete on public.trip_stops
  for delete to authenticated using (app.can_write_trip(trip_id));

grant select, delete on public.trip_stops to authenticated;
grant insert (trip_id, plan_id, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
              dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
              visited_at, photo_path, transfer_target_time, transfer_target_label, legacy_added_by)
  on public.trip_stops to authenticated;
-- 🔴 `trip_id` **ไม่อยู่ในฝั่ง update** (P7) — op ที่เขียน `trip_id` เดี่ยว ๆ คือย้ายแถวข้ามทริป
--    ส่วน `trip_day_id`/`plan_id` อยู่ เพราะ **ลากจุดแวะข้ามวัน/ข้ามแผนคือฟีเจอร์**
--    และ `D70` บังคับอยู่แล้วว่าปลายทางต้องเป็นทริปเดียวกัน
grant update (plan_id, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
              dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
              visited_at, photo_path, transfer_target_time, transfer_target_label)
  on public.trip_stops to authenticated;

create trigger trip_stops_stamp_added_by
  before insert on public.trip_stops
  for each row execute function app.stamp_added_by();
create trigger trip_stops_touch before update on public.trip_stops
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- `D73` — ลบวันที่ยังมีจุดแวะอยู่ไม่ได้ (P7 · แก้ฉบับตัวเองมาแล้ว 1 รอบ)
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **`before` ไม่ใช่ `after`** — นี่คือสิ่งที่ทำให้มันต่างจาก `app.assert_trip_has_plan()`
--    `after delete` จะทำงาน **หลัง cascade ลบจุดแวะไปหมดแล้ว** → `exists(...)` เป็นเท็จเสมอ
--    → **ด่านที่หน้าตาถูกทุกอย่างและไม่เคยจับอะไรได้ตลอดกาล**
-- 🔴 **`when (pg_trigger_depth() = 0)`** — ลบทริปทั้งใบเดินผ่าน cascade (depth ≥ 1) **ต้องไม่ถูกขวาง**
--    ลบวันตรง ๆ (depth 0) ต้องถูกขวาง
-- 🎯 **trigger ไม่ถูก BYPASSRLS ข้าม** → `service_role` · RPC `security definer` · migration ติดหมด
--    ต่างจากด่านฉบับแรกของ P1 ที่ดูแค่ว่ามี policy `DELETE` ไหม **ซึ่งเฝ้าประตูฝั่งไคลเอนต์
--    ขณะที่ตัวปรับช่วงวันของ `E3` จะเดินเข้าประตูฝั่งเซิร์ฟเวอร์**
--
-- ⚠️ **ทุกครั้งที่มีตารางใหม่ห้อยกับ `trip_days` ด่านนี้ต้องโตตาม** — ไม่งั้นมันครอบไม่ครบเงียบ ๆ
--    🔴 ตัวถัดไปที่รู้แล้วว่าต้องเพิ่ม: **`bookings.day_id`** — เพิ่มเงื่อนไขในไฟล์ที่สร้าง `bookings`
--       **และให้เทสต์ของ `bookings` พิสูจน์ว่ามันยิง** ไม่งั้นบรรทัดนั้นจะไม่มีวันถูกเพิ่ม
create or replace function app.assert_day_has_no_stops()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.trip_stops where trip_day_id = old.id) then
    raise exception 'ลบวันที่ยังมีจุดแวะอยู่ไม่ได้ — ย้ายหรือลบจุดแวะก่อน (cascade จะลบทิ้งเงียบ ๆ)';
  end if;
  return old;
end;
$$;

create trigger trip_days_no_orphan_stops
  before delete on public.trip_days
  for each row when (pg_trigger_depth() = 0)
  execute function app.assert_day_has_no_stops();

commit;
