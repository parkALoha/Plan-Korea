-- ═══════════════════════════════════════════════════════════════════════════
-- `Q6` ปิด — คำบรรยายสถานที่แยกตามภาษา · **ผู้ใช้ตัดสิน: แยกตั้งแต่แรก** (26 ส.ค. 2026)
-- เจ้าของ: P1-Lead
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── คำถามที่ถูกถาม ──────────────────────────────────────────────────────────
-- ชื่อสถานที่แยกภาษาไปแล้ว (`catalog_place_names` · `custom_place_names` มี `locale`)
-- **แต่คำบรรยายยังเป็นคอลัมน์เดียวช่องเดียว** → แพลตฟอร์มหลายประเทศรับได้ไหม
-- **ผู้ใช้ตอบ: แยกตั้งแต่แรก** — ตอนนี้ถูกที่สุดเพราะยังไม่มีคลังจริงให้ย้าย
--
-- ── 🔴 ทำไมไม่มี `priority` ทั้งที่ตารางชื่อมี ────────────────────────────────
-- `catalog_place_names` มี `priority` เพราะ **สถานที่หนึ่งมีหลายชื่อในภาษาเดียวกันได้จริง**
-- (ชื่อทางการ · ชื่อที่คนเรียก · ชื่อย่อ) → ต้องมีลำดับว่าจะโชว์อันไหน
-- 🎯 **คำบรรยายไม่ใช่แบบนั้น — หนึ่งภาษา หนึ่งคำบรรยาย** → `primary key (place_id, locale)`
--    **ได้ข้อบังคับที่แข็งกว่ามาฟรี** · ถ้าใส่ `priority` ตามตารางพี่น้องไปเฉย ๆ
--    เราจะอนุญาตให้มีคำบรรยาย 2 อันในภาษาเดียวกันโดยไม่มีใครตั้งใจ
-- ⚠️ **และห้าม "ทำให้เหมือนกัน" ทีหลัง** — ความต่างนี้มีเหตุผล ไม่ใช่ความไม่สม่ำเสมอ
--
-- ── 🔴 ไม่ denormalize `city_id` เข้ามา ทั้งที่ตารางชื่อทำ ──────────────────
-- `catalog_place_names.city_id` มีไว้ให้ **ค้นทั้งคลังแล้วกรองเมืองในคิวรีเดียว** (P5 · `§11`)
-- **คำบรรยายไม่ถูกค้นด้วย trigram เลยสักที่** → ใส่ `city_id` = denormalize ที่ไม่มีผู้ใช้
-- 🎯 **และราคาของมันคือ "ย้ายสถานที่ข้ามเมืองต้องอัปเดต 2 ตาราง" ซึ่งจ่ายฟรีไม่ได้**
--
-- ── 🔴 `custom_places.description` — สร้างตารางใหม่ **แต่ยังไม่ drop คอลัมน์เดิม** ──
-- `hooks/useCustomPlaces.tsx:81` ทำ `insert(newPlace)` โดย `newPlace: CustomPlace`
-- ซึ่ง type มี `description` อยู่ → **drop คอลัมน์ = insert พังทันที**
-- · ต่างจาก `catalog_places.description` ที่ **ไม่มีโค้ดที่เสิร์ฟผู้ใช้อ่านเลยสักจุด** จึง drop ได้เลย
--
-- ⚠️ **"เดี๋ยวค่อย drop" คือ `D73` ตัวถัดไปถ้าไม่มีเงื่อนไขกำกับ** → เงื่อนไขคือ:
--    **drop วันที่ `E3` ย้าย `useCustomPlaces` เข้า `lib/engine/` — ในคอมมิตเดียวกัน**
-- 🔴 **และผมไม่ฝากไว้กับคำสัญญา** — `lib/__tests__/descriptionSplit.test.ts` จะแดง
--    ถ้าสถานที่ไหนมีคำบรรยาย*ทั้งสองที่* · **สองแหล่งความจริงสะสมเงียบ ๆ ไม่ได้ ต้องดังตั้งแต่แถวแรก**
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- ── คลังกลาง ────────────────────────────────────────────────────────────────
create table public.catalog_place_descriptions (
  place_id    uuid not null references public.catalog_places(id) on delete cascade,
  locale      text not null check (locale ~ '^[a-z]{2}$'),
  description text not null check (length(trim(description)) between 1 and 4000),
  source      text not null default 'curated' check (source in ('curated', 'google', 'user')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 🔴 หนึ่งภาษา หนึ่งคำบรรยาย — ดูหัวไฟล์ว่าทำไมไม่มี `priority`
  primary key (place_id, locale)
);

create index catalog_place_descriptions_locale_idx
  on public.catalog_place_descriptions (locale);

-- ── คลังของทริป ─────────────────────────────────────────────────────────────
create table public.custom_place_descriptions (
  -- `D70` — ถือ `trip_id` เพื่อให้ policy ผูกกับทริปได้โดยไม่ต้อง join
  trip_id     uuid not null,
  place_id    uuid not null,
  locale      text not null check (locale ~ '^[a-z]{2}$'),
  description text not null check (length(trim(description)) between 1 and 4000),
  source      text not null default 'user' check (source in ('user', 'google')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (place_id, locale),
  constraint cpd_custom_place_fk foreign key (trip_id, place_id)
    references public.custom_places(trip_id, id) on delete cascade
);

-- ── ย้ายค่าเดิมของคลังกลางเข้าตารางใหม่ ก่อน drop ───────────────────────────
-- 🔴 ค่าเดิมมาจาก `data/places.ts` → `descriptionTh` **จึงเป็น `th` ไม่ใช่ `en`**
--    เดาผิดข้างที่นี่ = คำบรรยายไทยถูกป้ายว่าเป็นอังกฤษ **แล้วไม่มีอะไรฟ้องเลย**
insert into public.catalog_place_descriptions (place_id, locale, description, source)
select id, 'th', description, 'curated'
  from public.catalog_places
 where description is not null and length(trim(description)) > 0;

alter table public.catalog_places drop column description;

-- ── RLS ─────────────────────────────────────────────────────────────────────
revoke all on public.catalog_place_descriptions from anon;
revoke all on public.custom_place_descriptions  from anon;

alter table public.catalog_place_descriptions enable row level security;
alter table public.custom_place_descriptions  enable row level security;

-- คลังกลางเป็นข้อมูลสาธารณะ — อ่านได้ทุกคนที่ล็อกอิน · เขียนไม่ได้จากฝั่งไคลเอนต์
create policy catalog_place_descriptions_select on public.catalog_place_descriptions
  for select to authenticated using (true);
grant select on public.catalog_place_descriptions to authenticated;
grant select, insert, update, delete on public.catalog_place_descriptions to service_role;

create policy custom_place_descriptions_select on public.custom_place_descriptions
  for select to authenticated using (app.can_read_trip(trip_id));
create policy custom_place_descriptions_insert on public.custom_place_descriptions
  for insert to authenticated with check (app.can_write_trip(trip_id));
create policy custom_place_descriptions_update on public.custom_place_descriptions
  for update to authenticated
  using (app.can_write_trip(trip_id)) with check (app.can_write_trip(trip_id));
create policy custom_place_descriptions_delete on public.custom_place_descriptions
  for delete to authenticated using (app.can_write_trip(trip_id));

grant select, delete on public.custom_place_descriptions to authenticated;
grant insert (trip_id, place_id, locale, description, source)
  on public.custom_place_descriptions to authenticated;
grant update (locale, description, source)
  on public.custom_place_descriptions to authenticated;

create trigger catalog_place_descriptions_touch before update on public.catalog_place_descriptions
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at_only();
create trigger custom_place_descriptions_touch before update on public.custom_place_descriptions
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at_only();

-- ── ตรวจในทรานแซกชันเดียวกัน ────────────────────────────────────────────────
do $verify$
declare
  n int;
begin
  -- ① `catalog_places.description` ต้องหายไปแล้วจริง — ไม่ใช่แค่ "ตารางใหม่เกิดแล้ว"
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'catalog_places' and column_name = 'description'
  ) then
    raise exception 'Q6: catalog_places.description ยังอยู่ — สองแหล่งความจริงพร้อมกัน';
  end if;

  -- ② PK ต้องเป็น (place_id, locale) ไม่ใช่ (place_id, locale, priority)
  --    🔴 ถ้าใครก๊อปนิยามจากตารางชื่อมา ข้อบังคับ "หนึ่งภาษา หนึ่งคำบรรยาย" จะหายเงียบ ๆ
  select count(*) into n
    from information_schema.key_column_usage
   where table_schema = 'public' and table_name = 'catalog_place_descriptions'
     and constraint_name = 'catalog_place_descriptions_pkey';
  if n <> 2 then
    raise exception 'Q6: PK ของ catalog_place_descriptions ต้องมี 2 คอลัมน์ (ได้ %)', n;
  end if;

  -- ③ ไคลเอนต์เขียนคลังกลางไม่ได้ — ไม่มี policy ฝั่งเขียน และไม่มี grant
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'catalog_place_descriptions' and cmd <> 'SELECT'
  ) then
    raise exception 'Q6: คลังกลางต้องไม่มี policy ฝั่งเขียน';
  end if;
end $verify$;

commit;
