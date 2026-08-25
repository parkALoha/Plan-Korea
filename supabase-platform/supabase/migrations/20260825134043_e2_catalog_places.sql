-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — คลังสถานที่: `catalog_places` + `catalog_place_names` · ปิด `B6` ครึ่งหลัง
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · `D53` · `D55` · `D56` · `D70` · `D74`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่ตารางนี้ *ไม่* เก็บ และเหตุผลที่ต้องเขียนไว้ (`§9.4` ของ P5) ─────
-- 🔴 **ไม่มีเรตติ้ง · ไม่มีเวลาเปิด-ปิด · ไม่มีรูปภาพ** — ของพวกนี้ **เน่าได้ และแถวนี้ไม่มี `asOf`**
--    คลังเป็นตารางที่คนคิดว่า *"เขียนครั้งเดียวจบ"* จึงไม่มีใครนึกถึงการทำให้มันหมดอายุ
-- 🔴 **และไม่มี `jsonb` เลยสักคอลัมน์ โดยตั้งใจ** (P5 · `§11.3`)
--    *"`jsonb` จะกลายเป็นที่ที่เรตติ้งกับเวลาเปิด-ปิดแอบกลับเข้ามาโดยไม่ผ่านการรีวิวคอลัมน์"*
-- ⚠️ **จุดที่จะถูกกดดันให้แตกเป็นจุดแรก: "เรียงผลลัพธ์ด้วยเรตติ้ง"** (P5 ทำนายไว้)
--    → ตอบไว้ตรงนี้เลย: **ไม่มีคอลัมน์ให้เรียง เพราะค่านั้นต้องยิง Google สดทุกครั้งที่ถูกถาม**
--
-- ── `category` เป็นค่าเดียว — เป็นสิ่งที่ *เลือก* ไม่ใช่สิ่งที่ *เผลอ* ────────
-- ถ้าวันหนึ่งต้องหลายค่า **มันไม่ใช่ `alter table`** — เป็น *ตารางลูก + ย้ายข้อมูล + เปลี่ยน index หลัก*
-- ยอมรับความเสี่ยงนี้เพราะ `place_names` แก้ปัญหารูปแบบเดียวกันให้ *ชื่อ* ไปแล้ว
-- และรูปแบบเดียวกันใช้กับ *หมวด* ได้ทีหลัง (P5 ชี้ · P1 เลือกโดยรู้ตัว)
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists public.catalog_place_names;
--   drop table if exists public.catalog_places;
--   -- extension ไม่ถอย: มันไม่ผูกกับตารางนี้ตัวเดียว และถอนแล้ว index ของคนอื่นพังตาม
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

-- ───────────────────────────────────────────────────────────────────────────
-- 0. เก็บกวาดของที่ผมสร้างไว้แล้วไม่มีใครใช้ (`…132854`)
-- ───────────────────────────────────────────────────────────────────────────
-- ผมสร้าง `unique (country_id, id)` บน `catalog_cities` พร้อมคอมเมนต์ว่า
-- *"เปิดคีย์คู่ให้ลูก (`catalog_places`) อ้าง"* — **แล้วพอเขียน `catalog_places` จริง มันไม่ต้องใช้**
-- เพราะสถานที่ไม่ถือ `country_id` (เมืองเป็นตัวกำหนดประเทศอยู่แล้ว จึงไม่มีทางไม่ตรงกัน)
-- 🔴 **ปล่อยไว้ = index ที่ไม่มีใครใช้ คู่กับคำอธิบายที่เป็นเท็จ** — ซึ่งเป็นสิ่งที่ P7 เพิ่งจับผมได้
--    ในไฟล์ `trip_plans` เมื่อชั่วโมงก่อน · **ถูกกว่าที่จะลบตอนนี้ ตอนที่ยังไม่มีข้อมูลสักแถว**
alter table public.catalog_cities drop constraint catalog_cities_country_id_id_key;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. extension — `D56`
-- ───────────────────────────────────────────────────────────────────────────
-- **เอา `pg_trgm` + `unaccent` · ไม่เอา `pgvector`** · ลงตรงนี้เพราะ `place_names` คือตัวที่ใช้มันจริง
-- (ไม่ลงล่วงหน้าตอนไม่มีใครใช้ — กฎเดียวกับที่ `E1` ไม่ grant `can_write_trip` ก่อนมีตารางเนื้อหา)
-- คำถามที่มันตอบ: *"ผู้ใช้พิมพ์ว่า 'ตลาดกลางคืน' หมายถึงจุดไหนในแผน"* — **fuzzy text match ไม่ใช่ semantic search**
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. `catalog_places`
-- ───────────────────────────────────────────────────────────────────────────
create table public.catalog_places (
  id          uuid primary key default gen_random_uuid(),
  city_id     uuid not null references public.catalog_cities(id) on delete restrict,

  -- 🔴 `legacy_slug` — **คอลัมน์เดียวของคลังที่ P5 จัดเป็น "ต้องมีวันนี้"**
  -- `data/places.ts:138` → `id: "hanoi-hoan-kiem"` เป็น **slug ไม่ใช่ uuid**
  -- และ `trip_stops.place_id` ของแถวจริงวันนี้ถือสตริงนั้นอยู่ (`lib/resolvePlace.ts:29`)
  -- → ไม่เก็บไว้ = **`E7` ไม่มีคีย์ให้ join** · และพอ `data/places.ts` ถูกลบ (ซึ่งคือเป้าหมายของ `B6`)
  --   **ค่านั้นหาคืนไม่ได้อีกเลย** — เข้าเงื่อนไข *"ค่าหาไม่ได้อีกแล้วตอนที่เพิ่ม"* เต็มตัว
  -- ⚠️ `unique` จำเป็น ไม่ใช่ของแถม: **ซ้ำได้เมื่อไหร่ `E7` จะ join ผิดแถวเงียบ ๆ**
  legacy_slug text unique check (legacy_slug ~ '^[a-z0-9-]{1,60}$'),

  category    text not null check (length(trim(category)) between 1 and 40),

  -- `source='transfer'` → จุดเปลี่ยนถ่าย (สนามบิน/สถานี) ที่มาจาก `data/transferPoints.ts`
  -- 🔴 คำถามข้อ 7 ของ P5 พึ่งคอลัมน์นี้: *"จุดนี้เป็นสนามบิน/สถานีไม่ใช่ที่เที่ยวใช่ไหม"*
  --    Copilot ต้องรู้ **ก่อน** เสนอย้าย/ลบ ไม่ใช่ให้ DB ปฏิเสธทีหลัง
  source      text not null default 'curated'
              check (source in ('curated', 'transfer', 'google')),

  -- คอลัมน์ที่ P5 ตกไปใน `§9.1` แล้วคำถามของ P1 เปิดมันขึ้นมา (`§11.2`)
  -- **3 ค่า ไม่ใช่ boolean** — `mixed` = ตลาดมีหลังคา · วัดที่เดินกลางแจ้งระหว่างอาคาร
  -- 🔴 **ห้ามให้ Copilot เดาจากหมวด** — `culture` เป็นได้ทั้งสามค่า
  weather_sensitivity text check (weather_sensitivity in ('indoor', 'outdoor', 'mixed')),

  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),

  -- 🔴 **ที่อยู่ไม่ใช่ชื่อ — อยู่บนแถวนี้ ไม่ใช่ใน `place_names`** (`D55`)
  --    เหตุผลที่มันมีอยู่แต่แรก: **บนแท็กซี่เกาหลี ที่อยู่ใช้ได้ดีกว่าชื่อร้าน** (คนขับป้อนเข้านำทางได้ตรง)
  --    ยัดลง `place_names` แล้วมันจะโผล่ในผลค้นหา*ชื่อ*
  address_local text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- `D70` — เปิดคีย์คู่ให้ `catalog_place_names` อ้าง · **ตัวนี้ถูกใช้จริง ต่างจากตัวที่เพิ่งลบข้างบน**
  constraint catalog_places_city_id_id_key unique (city_id, id)
);

-- **index หลักของคลัง** (P5 · `§11.3`) — คำถาม *"เมืองนี้มีที่ไหนน่าไปอีกบ้าง"* ยิงบ่อยที่สุดรองจาก resolve
-- ⚠️ P5 ขอ index 2 ตัวที่ `E2` · ตัวที่ 3 คือ `unique (city_id, id)` ข้างบน ซึ่ง **ซื้อ constraint ไม่ใช่ความเร็ว**
create index catalog_places_city_category_idx on public.catalog_places (city_id, category);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. `catalog_place_names` — `D55`
-- ───────────────────────────────────────────────────────────────────────────
-- ทำไมแยกตาราง: **เพิ่มภาษาใหม่ต้องเป็น `insert` ไม่ใช่ `migration`** · ที่เดียวมีหลายชื่อในภาษาเดียวกันได้
-- (ชื่อทางการ · ชื่อที่คนเรียกจริง · ชื่อบนป้าย) · **index เดียวครอบทุกภาษา**
create table public.catalog_place_names (
  place_id uuid not null,

  -- 🔴 denormalize จาก `catalog_places` โดยตั้งใจ (P5 · `§11` ข้อ 2)
  -- เหตุผล: คลังหลายประเทศจะมี "ตลาดกลางคืน" ทุกประเทศ · **ค้นทั้งคลังแล้วค่อยกรองเมือง
  -- = ผู้ใช้ถามถึงปูซานแล้วได้ไทเปมาอันดับหนึ่ง ด้วยคะแนน similarity ที่สูงกว่าจริง ๆ**
  -- ⚠️ ราคาคือ "ย้ายสถานที่ข้ามเมืองต้องอัปเดต 2 ตาราง" — **และ `D70` บังคับให้ทำ ไม่ใช่ให้จำ**
  city_id  uuid not null,

  locale   text not null check (locale ~ '^[a-z]{2}$'),
  name     text not null check (length(trim(name)) between 1 and 200),

  -- 🔴 `priority` **ไม่ใช่ `is_primary`** — P5 แก้ข้อเสนอของตัวเอง และเหตุผลคือข้อที่ปิดเรื่อง:
  --    partial unique index บน `is_primary` บังคับ **`≤ 1`** · **มันไม่บังคับ `≥ 1`**
  --    → ลบชื่อที่ผิดออก แล้วแถวที่เหลือไม่ใช่ primary = **มีชื่ออยู่แต่ไม่รู้จะโชว์อันไหน**
  --      กลับไปขึ้นกับลำดับที่ DB คืนมา ซึ่งคือสิ่งที่ `D55` ห้ามไว้ทั้งข้อ
  --    · และนั่นคือ **การแก้ที่ธรรมดาที่สุดที่จะเกิดกับตารางชื่อ ไม่ใช่เคสประหลาด**
  -- 🎯 `priority` ได้ `≥ 1` มาจาก**โครงสร้าง**: เซตที่ไม่ว่างมีค่าน้อยสุดเสมอ → **ศูนย์กลไก**
  --    แทนที่จะเป็น index + trigger ที่ต้องถูกพร้อมกันสองตัว · และไม่ต้องใช้ `deferrable` (`P-27`)
  -- ⚠️ **ห้าม "ทำให้อ่านง่ายขึ้น" ด้วยการเปลี่ยนกลับเป็น `is_primary` ทีหลัง**
  --    อ่านง่ายกว่าจริง แต่ช่องจะกลับมาทั้งดุ้นโดยไม่มีใครรู้ว่าเคยมีเหตุผล
  priority int not null default 1 check (priority >= 1),

  -- ชื่อจาก Google กับชื่อที่เราคัดเอง **มี ToS คนละแบบ**
  -- ปนกันโดยไม่มีคอลัมน์บอก = **ลบเฉพาะของ Google ไม่ได้เมื่อจำเป็น**
  source   text not null default 'curated' check (source in ('curated', 'google', 'user')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (place_id, locale, priority),

  -- 🔴 `D70` — `city_id` **ตัวเดียวกัน** ผูกกับพ่อ → ชื่อของสถานที่ในเมือง X จะถูกติดป้ายเมือง Y ไม่ได้
  constraint cpn_place_fk foreign key (city_id, place_id)
    references public.catalog_places(city_id, id) on delete cascade
);

-- `pg_trgm` — คำถามข้อ 6 (*"'ตลาดกลางคืน' หมายถึงจุดไหน"*) · index เดียวครอบทุกภาษา
create index catalog_place_names_trgm_idx
  on public.catalog_place_names using gin (name extensions.gin_trgm_ops);

-- ค้นแบบจำกัดเมืองก่อนเสมอ (P5 ข้อ 2) — index นี้ทำให้ "จำกัดเมืองก่อน" ถูกกว่า "ค้นทั้งคลัง"
create index catalog_place_names_city_locale_idx
  on public.catalog_place_names (city_id, locale);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RLS · grant
-- ───────────────────────────────────────────────────────────────────────────
alter table public.catalog_places      enable row level security;
alter table public.catalog_place_names enable row level security;

-- `using (true)` โดยตั้งใจและระบุชื่อไว้ใน `E2-AC2` แล้ว (`D74`) — คลังเป็นข้อมูลสาธารณะ
create policy catalog_places_select on public.catalog_places
  for select to authenticated
  using (true);

create policy catalog_place_names_select on public.catalog_place_names
  for select to authenticated
  using (true);

revoke all on public.catalog_places      from anon;
revoke all on public.catalog_place_names from anon;

grant select on public.catalog_places      to authenticated;
grant select on public.catalog_place_names to authenticated;

-- ข้อยกเว้นที่ 3 ของ `D38` (จดใน `TEAM.md`) — ขยายให้ครบทั้ง 4 ตารางคลัง
grant select, insert, update, delete on public.catalog_places      to service_role;
grant select, insert, update, delete on public.catalog_place_names to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. `updated_at`
-- ───────────────────────────────────────────────────────────────────────────
create trigger catalog_places_touch before update on public.catalog_places
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at_only();
create trigger catalog_place_names_touch before update on public.catalog_place_names
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at_only();

commit;
