-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — ชั้นแผน: `trip_plans` + `trip_day_plan_settings`
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · เกณฑ์: `D52` · `D69` · `D70` · `E2-AC3`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมตารางที่สองถึงมีอยู่ (`D69` · `P-51`) ──────────────────────────────
-- `column-map.md` สั่งให้ยุบ `trip_day_settings` เข้า `trip_days` **และในตารางเดียวกันนั้น
-- บอกว่า `plan_id` "คงเดิม"** ส่วน ERD ให้ `trip_days` ห้อยกับ *ทริป* — สามข้อนี้อยู่ด้วยกันไม่ได้
-- ยืนยันกับของจริงแล้ว: `0006_trip_stops.sql:16-21` PK คือ `(plan_id, day_id)` ·
-- `hooks/usePlans.ts:104` **ก๊อปตั้งค่ารายวันตอนก๊อปแผน** = ตั้งค่าต่างกันได้ต่อแผนจริงวันนี้
-- → ยุบตามที่เขียน = แผน A ตั้งออก 08:00 แผน B ตั้ง 09:00 **เหลือค่าเดียว โดยไม่มีอะไรล้ม**
--
-- ── ทำไมมี `trip_id` ในตารางลูกทั้งที่แบบเดิมห้าม (`D70`) ────────────────────
-- ตารางนี้มีพ่อสองคนที่**ต้องเป็นทริปเดียวกัน** (`plan_id` · `trip_day_id`)
-- แบบเดิมเกาะพ่อคนเดียว → แถวที่จับคู่ *แผนของทริป X กับวันของทริป Y* เขียนลงไปได้ทั้ง ๆ ที่
-- policy เขียวหมด · 🔴 **และ `on delete cascade` ของแผน X จะลบแถวที่นั่งอยู่ในทริป Y — RLS ไม่มีผลกับ cascade**
-- ทางแก้: ถือ `trip_id` **แล้วบังคับให้ตรงกับพ่อทั้งสองด้วย FK ประกอบ**
-- → ความไม่ตรงกัน **เขียนลงไปไม่ได้** ไม่ใช่แค่ "ไม่มีเคสไหนทำ"
--
-- ── สิ่งที่ไฟล์นี้ *ไม่* ทำ ────────────────────────────────────────────────
--   ① **ไม่มี `deleted_at`** (`E2-AC12` ยังไม่ตัดสิน · ส่ง P7 แล้วเรื่อง tombstone)
--      ลบแผน = ลบจริง + cascade เหมือนพฤติกรรมวันนี้ (`usePlans.ts:157`) **ตั้งใจให้เท่าเดิมก่อน**
--      เพื่อให้ `E7` เป็นการย้ายข้อมูล ไม่ใช่การเปลี่ยนความหมายของการลบไปพร้อมกัน
--   ② **`trip_day_plan_settings` ไม่มี policy DELETE** — วันนี้โค้ดใช้ `.upsert()` อย่างเดียว
--      (`hooks/useDaySettings.ts:135,165`) · แถวหายเองตอนลบแผน/ลบวันด้วย cascade
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists public.trip_day_plan_settings;
--   drop table if exists public.trip_plans;
--   drop function if exists app.assert_trip_has_plan();
--   alter table public.trip_days drop constraint if exists trip_days_trip_id_id_key;
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
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

-- ───────────────────────────────────────────────────────────────────────────
-- 1. `trip_days` เปิดคีย์คู่ให้ลูกอ้าง (`D70`)
-- ───────────────────────────────────────────────────────────────────────────
-- ซ้ำซ้อนกับ PK ในทางตรรกะ (`id` unique อยู่แล้ว) — มีไว้เพื่อให้ **FK ประกอบอ้างได้**
-- Postgres บังคับว่าปลายทางของ FK ต้องมี unique constraint ที่ตรงคอลัมน์เป๊ะ
alter table public.trip_days
  add constraint trip_days_trip_id_id_key unique (trip_id, id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. `trip_plans` — แผน A/B ต่อทริป
-- ───────────────────────────────────────────────────────────────────────────
-- วันนี้ `id` เป็น `text` และตารางเป็นของทั้งระบบ (ไม่มี `trip_id`) เพราะมีทริปใบเดียว
create table public.trip_plans (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),

  -- 🔴 `D52` — **ไม่มี `trips.active_plan_id`** · ตัดวงจร FK ทิ้งทั้งวง
  -- FK วนบังคับให้ต้องมีตัวใดตัวหนึ่ง nullable หรือ `deferrable` ซึ่งเราเพิ่งปฏิเสธไปใน `P-27`
  -- ด้วยเหตุผลว่ามันย้ายความผิดพลาดไปโผล่ตอน commit · และลบแผนแล้วไม่มีอะไรค้างชี้ไปหาของที่ไม่มี
  is_active  boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- `D70`: เปิดคีย์คู่ให้ `trip_day_plan_settings` อ้าง
  constraint trip_plans_trip_id_id_key unique (trip_id, id)
);

-- `D52`: หนึ่งทริปมีแผนที่ใช้อยู่ได้ไม่เกินหนึ่ง — บังคับที่ฐาน ไม่ใช่ที่โค้ด
create unique index trip_plans_one_active on public.trip_plans (trip_id) where is_active;

create index trip_plans_trip_idx on public.trip_plans (trip_id);

revoke all on public.trip_plans from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. `trip_day_plan_settings` — ตั้งค่ารายวัน **ที่ต่างกันได้ต่อแผน** (`D69`)
-- ───────────────────────────────────────────────────────────────────────────
-- คีย์สะท้อน PK วันนี้ `(plan_id, day_id)` ตรงตัว → `E7` เป็นการเปลี่ยนชนิดคอลัมน์
-- `day_id text` → `trip_day_id uuid` **ไม่ใช่การตัดสินใจว่าจะทิ้งข้อมูลของใคร**
create table public.trip_day_plan_settings (
  -- `D70`: ถือ `trip_id` และมันถูกผูกกับพ่อทั้งสองด้วย FK ประกอบข้างล่าง
  -- ไม่ใช่ค่าอิสระ จึงไม่ใช่ "tenant ปลอม" แบบที่ rls-policies.sql กลัว — พิมพ์ผิดแล้ว insert ไม่ผ่าน
  trip_id            uuid not null,
  plan_id            uuid not null,
  trip_day_id        uuid not null,

  -- `0006` ตั้ง default '07:00' · เพิ่ม check ที่ของเดิมไม่มี — คอลัมน์นี้ถูกอ่านไปคำนวณ timeline
  -- ค่าที่พิมพ์ผิดจะไม่พังตอนเขียน แต่ไปพังตอนคำนวณเวลาทั้งวัน ซึ่งหาต้นเหตุยากกว่ามาก
  start_time         text not null default '07:00'
                     check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  return_travel_mode text,                                  -- `0015`
  is_locked          boolean not null default false,        -- `0021`

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  primary key (plan_id, trip_day_id),

  -- 🔴 `D70` — หัวใจของไฟล์นี้ · `trip_id` **ตัวเดียวกัน** ถูกใช้ในทั้งสอง FK
  --    → แผนของทริป X + วันของทริป Y **เขียนลงไปไม่ได้** ฐานปฏิเสธตั้งแต่ insert
  constraint tdps_plan_fk foreign key (trip_id, plan_id)
    references public.trip_plans(trip_id, id) on delete cascade,
  constraint tdps_day_fk  foreign key (trip_id, trip_day_id)
    references public.trip_days(trip_id, id)  on delete cascade
);

revoke all on public.trip_day_plan_settings from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.trip_plans             enable row level security;
alter table public.trip_day_plan_settings enable row level security;

-- ── trip_plans ────────────────────────────────────────────────────────────
create policy trip_plans_select on public.trip_plans
  for select to authenticated
  using (app.can_read_trip(trip_id));

create policy trip_plans_insert on public.trip_plans
  for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy trip_plans_update on public.trip_plans
  for update to authenticated
  using      (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));

-- 🔴 ตารางแรกของ `E2` ที่มี policy DELETE — และเป็นการตัดสินใจ ไม่ใช่การคัดลอก
--    ลบแผนคือสิ่งที่ผู้ใช้ทำจริงวันนี้ (`usePlans.ts:157`) ต่างจาก `trip_days` ที่ตามช่วงวันของทริป
--    ให้ `editor` ลบได้ เพราะมันคือการแก้เนื้อหาทริป ไม่ใช่การจัดการทีมหรือลบทริป
--    ⚠️ **แต่ลบแผนสุดท้ายไม่ได้** — บังคับด้วย trigger ข้างล่าง RLS นับ "คนสุดท้าย" ไม่ได้
create policy trip_plans_delete on public.trip_plans
  for delete to authenticated
  using (app.can_write_trip(trip_id));

-- ── trip_day_plan_settings ────────────────────────────────────────────────
-- เกาะ `trip_id` ตรง ๆ ได้เพราะ `D70` บังคับให้มันตรงกับพ่อทั้งสองแล้ว
-- (ถ้าไม่มี FK ประกอบ บรรทัดพวกนี้จะกลายเป็นด่านที่เชื่อค่าที่ client พิมพ์มา)
create policy tdps_select on public.trip_day_plan_settings
  for select to authenticated
  using (app.can_read_trip(trip_id));

create policy tdps_insert on public.trip_day_plan_settings
  for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy tdps_update on public.trip_day_plan_settings
  for update to authenticated
  using      (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));

-- ───────────────────────────────────────────────────────────────────────────
-- 5. grant
-- ───────────────────────────────────────────────────────────────────────────
-- `delete` ให้เฉพาะ `trip_plans` ให้ตรงกับการที่มี policy DELETE เฉพาะตัวนั้น — สองชั้นพูดตรงกัน
grant select, insert, update, delete on public.trip_plans             to authenticated;
grant select, insert, update         on public.trip_day_plan_settings to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. ทริปต้องมีแผนเหลืออย่างน้อย 1 เสมอ
-- ───────────────────────────────────────────────────────────────────────────
-- รูปแบบเดียวกับ `app.assert_trip_has_owner()` ของ `E1` (`P-19`) และด้วยเหตุผลเดียวกัน:
-- **RLS ตัดสินได้ทีละแถว มันนับไม่ได้ว่าเหลือกี่แถว** → ต้องเป็น constraint trigger
--
-- 🔴 **แก้คอมเมนต์ 25 ส.ค. บ่าย (P7 เจอ) — ฉบับแรกบรรยายกลไกที่ไฟล์นี้ไม่ได้ใช้**
--    เขียนไว้ว่า *"`when (pg_trigger_depth() = 0)` โดยตั้งใจ"* **แต่ trigger ข้างล่างไม่มี `when` เลยสักตัว**
--    ของจริงกันด้วยเงื่อนไข *"ทริปยังอยู่ไหม"* ในตัวฟังก์ชันแทน — **ซึ่งได้ผลถูกต้องสำหรับโจทย์นี้**
--    (ลบทริปทั้งใบ → แถวใน `trips` หายไปแล้ว → `exists(...)` เป็นเท็จ → ไม่ raise)
--    ⚠️ **พฤติกรรมไม่เคยมีปัญหา · ปัญหาคือคำอธิบายชี้ไปที่กลไกที่ไม่ได้อยู่ตรงนี้**
--    และมันอันตรายเพราะ **`trip_stops` จะต้องใช้ `when (pg_trigger_depth() = 0)` ของจริง**
--    → คนที่ก๊อปคำอธิบายนี้ไปจะได้คำอธิบายที่ถูก คู่กับโค้ดที่ไม่มีกลไกนั้น
--
-- ด่านนี้มีไว้กัน **ผู้ใช้ลบแผนสุดท้ายทิ้งเอง** · ลบทริปทั้งใบยังลบแผนได้ตามปกติ
create or replace function app.assert_trip_has_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.trips where id = old.trip_id)
     and not exists (select 1 from public.trip_plans where trip_id = old.trip_id) then
    raise exception 'ทริปต้องมีแผนอย่างน้อย 1 แผน — ลบแผนสุดท้ายไม่ได้';
  end if;
  return null;
end;
$$;

create constraint trigger trip_plans_keep_one
  after delete on public.trip_plans
  deferrable initially deferred
  for each row execute function app.assert_trip_has_plan();

-- ───────────────────────────────────────────────────────────────────────────
-- 7. `updated_at` — เซิร์ฟเวอร์เขียนเท่านั้น (`D7` · `E2-AC9`)
-- ───────────────────────────────────────────────────────────────────────────
create trigger trip_plans_touch
  before update on public.trip_plans
  for each row execute function app.touch_updated_at();

create trigger tdps_touch
  before update on public.trip_day_plan_settings
  for each row execute function app.touch_updated_at();

commit;
