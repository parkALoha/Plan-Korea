-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — คลังภูมิศาสตร์: `catalog_countries` + `catalog_cities` · ปิด `B6` ครึ่งแรก
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · `D54` · `D74` · `B6`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมอยู่ใน `public` ไม่ใช่ schema `catalog` — `D74` ────────────────────
-- `config.toml:13` → `schemas = ["public", "graphql_public"]`
-- 🔴 schema `catalog` จะเข้าถึงผ่าน PostgREST ไม่ได้จนกว่ามีคนไปกดเปิดในแดชบอร์ด
--    = **ความถูกต้องขึ้นกับสวิตช์ที่ไม่มีไฟล์ไหนบันทึก** · migration ผ่านหมด ตารางมีจริง แล้วแอปอ่านไม่ได้
--    โดยไม่มีอะไรผิดให้เห็น · และโปรเจกต์ใหม่ทุกใบจะต้องมีคนจำได้
-- → คำนำหน้า `catalog_` แทน · **และมันซื้อของเพิ่ม**: ทุกตารางอื่นใน `public` เป็นข้อมูลผู้เช่าที่มี RLS
--   ผูกกับ `trip_members` · **คลังเป็นข้อมูลสาธารณะที่ผู้ใช้เขียนไม่ได้เลย** → อ่านออกจากชื่อ
--
-- ── `B6` คืออะไร และทำไมสองตารางนี้ปิดครึ่งแรกของมัน ───────────────────────
-- วันนี้ `data/places.ts:29` เขียนประเทศ/เมืองเป็น **TS union type**:
--   `city: "hanoi" | "busan" | "sokcho" | "gangneung" | "seoul" | "suwon" | "bangkok" | "hcmc"`
-- → **เพิ่มเมือง = แก้โค้ด + build ใหม่** · แพลตฟอร์มหลายประเทศทำแบบนี้ไม่ได้
--
-- ── `D54` — `cities` ถือ `lat`/`lng` ของตัวเอง **ห้ามเฉลี่ยจากลูก** ────────
-- `cityCenter()` วันนี้เฉลี่ยพิกัดของสถานที่ในเมืองนั้น (P5 พบ · เป็นบั๊กที่มีอยู่แล้ว)
-- → เมืองที่มีสถานที่ 1 ที่ ได้ "ศูนย์กลางเมือง" = ที่นั้นพอดี · เมืองที่มี 0 ที่ ได้ค่าไร้ความหมาย
-- 🔴 **และมันเจ็บแบบเงียบ**: แผนที่ซูมผิด · ระยะข้ามเมืองผิด · **Copilot รายงานตัวเลขนั้นออกมาอย่างมั่นใจ**
--
-- ── สิ่งที่ไฟล์นี้ *ไม่* ทำ ────────────────────────────────────────────────
--   ① **ไม่มี `catalog_places` / `catalog_place_names`** — คนละไฟล์ · `places` ต้องมี `cities` ก่อน
--   ② **ไม่มี `pg_trgm` / `unaccent`** (`D56`) — มาพร้อม `place_names` ซึ่งเป็นตัวที่ใช้มันจริง
--      **ไม่ลงล่วงหน้าโดยไม่มีใครใช้** ตามกฎเดียวกับที่ `E1` ไม่ grant `can_write_trip` ก่อนมีตารางเนื้อหา
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists public.catalog_cities;
--   drop table if exists public.catalog_countries;
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
-- 1. `catalog_countries`
-- ───────────────────────────────────────────────────────────────────────────
-- `id` เป็น ISO 3166-1 alpha-2 ตัวพิมพ์เล็ก — ไม่ใช่ uuid โดยตั้งใจ:
-- มันเป็นคีย์ที่**โลกภายนอกกำหนดให้แล้ว** และเสถียรกว่าอะไรที่เราออกเอง
-- · อ่านออกตอน debug · join กับข้อมูลภายนอกได้โดยไม่ต้องมีตารางแปลง
-- ⚠️ ข้อแลก: ประเทศที่เปลี่ยนรหัส (เกิดจริงแต่นานมาก) ต้องย้ายด้วยมือ — รับได้
create table public.catalog_countries (
  id         text primary key check (id ~ '^[a-z]{2}$'),
  name_th    text not null check (length(trim(name_th)) between 1 and 80),
  name_en    text not null check (length(trim(name_en)) between 1 and 80),

  -- `get_capabilities` ต้องเดิน `day → city → country → provider registry` ให้จบ (P5 ข้อ 5)
  -- คอลัมน์นี้คือปลายทางของคำถาม *"วันนี้อยู่ประเทศไหน ใช้ Naver ได้ไหม"*
  -- 🔴 เก็บเป็น **รายชื่อ provider ที่ใช้ได้** ไม่ใช่ boolean `has_naver` — เพิ่ม provider ใหม่
  --    ต้องเป็น `update` ไม่ใช่ `alter table` (เหตุผลเดียวกับที่ `place_names` แยกตาราง · `B6`)
  nav_providers text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. `catalog_cities` — `D54`
-- ───────────────────────────────────────────────────────────────────────────
create table public.catalog_cities (
  id         uuid primary key default gen_random_uuid(),
  country_id text not null references public.catalog_countries(id) on delete restrict,

  -- คีย์ที่โค้ดวันนี้ใช้เป็น union type (`"busan"` · `"sokcho"` …)
  -- 🔴 **`E7` join ด้วยคอลัมน์นี้** — ซ้ำได้เมื่อไหร่ = join ผิดแถวเงียบ ๆ → unique ทั้งระบบ
  --    (เหตุผลเดียวกับ `legacy_slug` ของ `catalog_places` ที่ P5 ชี้)
  legacy_slug text unique check (legacy_slug ~ '^[a-z0-9-]{1,40}$'),

  name_th    text not null check (length(trim(name_th)) between 1 and 80),
  name_en    text not null check (length(trim(name_en)) between 1 and 80),
  name_local text check (name_local is null or length(trim(name_local)) between 1 and 80),

  -- 🔴 `D54` — พิกัดของเมืองเป็น **ข้อมูล** ไม่ใช่ค่าที่คำนวณจากลูก
  --    `not null` โดยตั้งใจ: เมืองที่ไม่มีพิกัดคือเมืองที่ทำให้ `cityCenter()` กลับไปเดา
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),

  timezone   text not null check (length(trim(timezone)) between 1 and 64),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- `D70` — เปิดคีย์คู่ให้ลูก (`catalog_places`) อ้าง เพื่อบังคับ "เมืองของสถานที่ต้องอยู่ประเทศเดียวกัน"
  constraint catalog_cities_country_id_id_key unique (country_id, id)
);

create index catalog_cities_country_idx on public.catalog_cities (country_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS — อ่านได้ทุกคนที่ล็อกอิน · เขียนไม่ได้เลยจากไคลเอนต์
-- ───────────────────────────────────────────────────────────────────────────
alter table public.catalog_countries enable row level security;
alter table public.catalog_cities    enable row level security;

-- 🔴 **`using (true)` โดยตั้งใจ และเป็นข้อยกเว้นที่ต้องถูกระบุชื่อ ไม่ใช่ถูกซ่อน**
--    `E2-AC2` เขียนว่า `grep -c 'using (true)'` ในไฟล์ใหม่ = 0
--    แต่ `security-review.md` เขียนเองว่า *"ไม่มีตัวไหนเป็น true ยกเว้น 5 ตัวใน catalog"* — **สองข้อนี้อยู่ด้วยกันไม่ได้**
--    ⚠️ **ทางที่ปฏิเสธ: เขียนเงื่อนไขที่เป็นจริงเสมอในรูปอื่นเพื่อเลี่ยงคำว่า `using (true)`**
--       นั่นคือการหลบตัววัด ไม่ใช่การผ่านมัน · และมันจะทำให้คนอ่าน policy ไม่รู้ว่าคลังเปิดอ่านทั้งใบ
--    → เขียนตรง ๆ · ส่ง P8 ให้แก้ถ้อยคำของ `E2-AC2` เป็น *"= 0 นอกตารางคลัง และคลังต้องระบุชื่อครบ"*
create policy catalog_countries_select on public.catalog_countries
  for select to authenticated
  using (true);

create policy catalog_cities_select on public.catalog_cities
  for select to authenticated
  using (true);

-- 🔴 ไม่มี policy INSERT/UPDATE/DELETE เลยสักตัว (`D18`) — คลังถูกเขียนโดย migration/seed เท่านั้น
--    `service_role` เขียนได้เพราะ BYPASSRLS ซึ่งเป็นทางที่ตั้งใจให้ใช้

revoke all on public.catalog_countries from anon;
revoke all on public.catalog_cities    from anon;

-- grant `select` อย่างเดียว — สองชั้นพูดตรงกันกับการที่ไม่มี policy ฝั่งเขียน
grant select on public.catalog_countries to authenticated;
grant select on public.catalog_cities    to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. `updated_at` — `D7` · `E2-AC9`
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ `app.touch_updated_at()` เขียน `updated_by_user` ด้วย ซึ่งตารางคลังไม่มีและไม่ควรมี
--    (ไม่มีผู้ใช้คนไหนแก้คลังได้ตามนิยาม) → ใช้ฟังก์ชันแยกที่เขียนแค่ `updated_at`
create or replace function app.touch_updated_at_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.touch_updated_at_only() is
  'สำหรับตารางที่ไม่มี updated_by_user (ตารางคลัง) — แยกจาก app.touch_updated_at() '
  'เพราะตัวนั้นเขียน updated_by_user ซึ่งคลังไม่มีคอลัมน์นั้นและไม่ควรมี';

create trigger catalog_countries_touch before update on public.catalog_countries
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at_only();
create trigger catalog_cities_touch    before update on public.catalog_cities
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at_only();

commit;
