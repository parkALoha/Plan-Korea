-- ════════════════════════════════════════════════════════════════════════════
-- E5 — ทริปแนะนำ (`โตเกียว 5 วัน 4 คืน`) — ทะเบียน + อ่านสรุป + ก๊อปไปเป็นทริปของตัวเอง
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้สั่งเอง
-- ════════════════════════════════════════════════════════════════════════════
-- > *"2 แบบเขาเที่ยว ตามแพลน ที่เราแนะนำ และจัดมาให้เลย ซึ่งเราจัดไว้ให้ x วัน x คืน"*
--
-- ## 🔴 รูปที่เลือก: **ทริปแนะนำ = ทริปจริงที่ทีมจัดเอง** ไม่ใช่ตารางเนื้อหาใบใหม่
-- เราจัดแผนด้วยหน้าเว็บของเราเอง แล้วติดธง ⇒ ไม่มีหน้าแอดมิน · ไม่มีสคีมาเนื้อหาให้ซิงก์
-- 🎯 ***และเราจะเจอบั๊กของเครื่องมือวางแผนก่อนผู้ใช้ เพราะเราต้องใช้มันทำงานจริง***
--
-- ## 🔴 สิ่งที่ไฟล์นี้ **ไม่** ทำ — และเป็นแกนของการออกแบบ ไม่ใช่ข้อจำกัดที่ตกหล่น
-- ❌ **ไม่เพิ่ม policy ให้ใครอ่าน `trips` ของคนอื่น** แม้แต่ใบที่เป็น template
--    เนื้อของแผนออกได้ทางเดียวคือ `copy_trip_template()` ซึ่ง **เขียนลงทริปของผู้เรียกเอง**
--    ⇒ ไม่มีเส้นทางไหนที่ *อ่าน* จุดแวะของ template ออกมาเป็นข้อมูลได้เลย
-- 🎯 ***ถ้าเปิด policy อ่าน เราจะได้ประตูอ่านทริป ที่มีเงื่อนไขเป็นคอลัมน์ที่เราตั้งเอง
--    — วันที่ธงถูกติดผิดใบ ทริปจริงของคนหนึ่งจะกลายเป็นของสาธารณะเงียบ ๆ***
--    ทางนี้ทำให้ "ติดธงผิดใบ" มีราคาแค่ *มีคนก๊อปแผนที่ไม่ได้ตั้งใจเผยแพร่* ไม่ใช่ *ข้อมูลรั่ว*
--
-- ## ⚠️ ความเสี่ยงที่รับไว้โดยรู้ตัว — **สำเนาทวีคูณของ `custom_places`** (P4 ชี้ · P1 รับ)
-- `custom_places` ผูกกับ *ทริป* (ดีไซน์เดิมตั้งแต่ `20260825140057`) ⇒ ทุกคนที่ก๊อป template
-- ได้สถานที่ชุดใหม่ทั้งชุด + ชื่อของมัน · template 30 สถานที่ · คนก๊อป 500 คน = **15,000 แถว**
-- 🔴 **รับไว้เพราะทางเลือกแย่กว่า** — ให้ทริปหลายใบใช้ `custom_place` แถวเดียวกัน = คนหนึ่งแก้
--    แล้วแผนของคนอื่นเปลี่ยนตาม ซึ่งผิดความคาดหมายของคนที่ก๊อปแผนไปเป็น *ของตัวเอง*
-- 🎯 ***จดไว้เพราะมันจะไม่มีใครเห็นจนกว่าจะมีผู้ใช้จริง และตอนนั้นแก้แพงกว่าตอนนี้มาก***
--    · ตัวชี้ที่ควรเฝ้า: จำนวนแถว `custom_places` ต่อจำนวนทริป — ไม่ใช่จำนวนแถวเปล่า ๆ

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
-- 1. ทะเบียน — ทริปไหนเป็นทริปแนะนำ
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **ไม่มี `grant` ให้ `authenticated` บนคอลัมน์นี้ และนั่นคือเจตนา ไม่ใช่การตกหล่น**
--    `20260825122247:78` ให้สิทธิ์ `update` แบบ **ระบุชื่อคอลัมน์** ⇒ คอลัมน์ใหม่ **ไม่ได้สิทธิ์เอง**
--    (ไฟล์นั้นเขียนราคาข้อนี้ไว้เองที่บรรทัด 25-26 ว่าเป็นราคาที่ต้องรู้ว่าจ่าย —
--     ที่นี่มันกลายเป็นของฟรีพอดี เพราะเราต้องการให้ปิด)
--    ⇒ **ไคลเอนต์ประกาศทริปตัวเองเป็นทริปแนะนำไม่ได้** · ทีมติดธงด้วย SQL ตอนแผนพร้อม
--    ✅ assert ข้างล่างเป็นตัวยืนยัน ไม่ใช่คอมเมนต์นี้
alter table public.trips
  add column if not exists published_template_at timestamptz;

comment on column public.trips.published_template_at is
  'ไม่ null = ทริปนี้เผยแพร่เป็น "ทริปแนะนำ" · ตั้งโดยทีมเท่านั้น (ไม่มี column grant ให้ authenticated)';

-- อ่านบ่อย · แถวน้อยมาก ⇒ partial index พอ
create index if not exists trips_published_template_idx
  on public.trips (published_template_at desc)
  where published_template_at is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. อ่านสรุป — สิ่งที่การ์ดบนหน้าแรกต้องใช้ **และไม่มีอย่างอื่น**
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ คืน `day_count`/`night_count` จากฐาน ไม่ให้ UI คำนวณเอง —
--    "5 วัน 4 คืน" เป็นถ้อยคำที่ผู้ใช้พูดเอง ⇒ ต้องมาจากที่เดียว ไม่ใช่สองที่ที่อาจไม่ตรงกัน
create or replace function public.list_trip_templates()
returns table (
  id           uuid,
  title        text,
  day_count    int,
  night_count  int,
  cities       jsonb
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    t.id,
    t.title,
    (t.end_date - t.start_date + 1)::int                                as day_count,
    greatest((t.end_date - t.start_date)::int, 0)                       as night_count,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'nameTh', c.name_th, 'slug', c.legacy_slug)
                        order by td.rank)
         from public.trip_destinations td
         join public.catalog_cities c on c.id = td.city_id
        where td.trip_id = t.id),
      '[]'::jsonb)                                                      as cities
  from public.trips t
  where t.published_template_at is not null
  order by t.published_template_at desc;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. ก๊อปไปเป็นทริปของผู้เรียก
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **`security definer` ทำให้ `where` เป็นด่านเดียวที่เหลือ** (P4 ชี้ · รูปเดียวกับ `set_trip_pinned`)
--    ⇒ `published_template_at is not null` ในบรรทัด `select … into v_tpl` **คือด่านทั้งหมดของฟังก์ชันนี้**
--       ถอดออกเมื่อไหร่ = ก๊อปทริปของใครก็ได้ · **แก้บรรทัดนั้นต้องอ่านคอมเมนต์นี้ก่อน**
--
-- 🔴 **`created_by` เป็นผู้เรียก ไม่ใช่เจ้าของ template** (P4 ถาม) —
--    ไม่งั้นผู้ใช้จะได้ทริปที่ตัวเองแก้ไม่ได้ เพราะ `trips_update` เป็นของ `owner`
create or replace function public.copy_trip_template(
  p_template_id uuid,
  p_start_date  date,
  p_title       text default null
)
returns public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_tpl      public.trips;
  v_new      public.trips;
  v_shift    int;
  v_src_plan uuid;
  v_new_plan uuid;
  v_cp_map   jsonb;
begin
  if v_uid is null then
    raise exception 'ต้องล็อกอินก่อนใช้แผนนี้' using errcode = '42501';
  end if;

  -- 🔴 `p_start_date` เป็น null → `v_shift` เป็น null → `date + null` = null → ชนกับ `not null`
  --    **ข้อความที่ได้จะพูดถึงคอลัมน์ `trip_days.date` ซึ่งไม่ใช่สิ่งที่ผู้เรียกทำผิด**
  --    ⇒ จับที่นี่ ให้ข้อความตอบคำถามที่ผู้เรียกถามได้จริง
  if p_start_date is null then
    raise exception 'ต้องระบุวันเริ่มทริป' using errcode = '22023';
  end if;

  -- 🔴 ด่านเดียวของฟังก์ชันนี้ — อ่านคอมเมนต์เหนือ `create function` ก่อนแก้บรรทัดนี้
  select * into v_tpl
    from public.trips
   where id = p_template_id
     and published_template_at is not null;
  if not found then
    -- ⚠️ `P0002` เหมือน `set_trip_pinned` — **ไม่ยืนยันว่าทริปนี้มีอยู่จริงให้คนนอกรู้**
    raise exception 'ไม่พบทริปแนะนำนี้' using errcode = 'P0002';
  end if;

  v_shift := p_start_date - v_tpl.start_date;

  insert into public.trips (created_by, title, start_date, end_date, base_timezone)
  values (
    v_uid,
    coalesce(nullif(trim(p_title), ''), v_tpl.title),
    p_start_date,
    v_tpl.end_date + v_shift,
    v_tpl.base_timezone
  )
  returning * into v_new;

  insert into public.trip_members (trip_id, user_id, role, invited_by)
  values (v_new.id, v_uid, 'owner', v_uid)
  on conflict (trip_id, user_id) do nothing;

  insert into public.trip_destinations (trip_id, city_id, rank)
  select v_new.id, d.city_id, d.rank
    from public.trip_destinations d
   where d.trip_id = v_tpl.id;

  -- วัน: เลื่อนวันที่ทั้งชุด · คงเมือง/เมืองค้างคืน/timezone ไว้ตามแผนต้นฉบับ
  insert into public.trip_days (trip_id, date, city_id, overnight_city_id, overnight_kind, timezone)
  select v_new.id, od.date + v_shift, od.city_id, od.overnight_city_id, od.overnight_kind, od.timezone
    from public.trip_days od
   where od.trip_id = v_tpl.id;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 🔴 สถานที่ที่ทีมเพิ่มเอง — **ต้องก๊อปก่อน `trip_stops` เพราะ FK เป็นคีย์คู่**
  -- ─────────────────────────────────────────────────────────────────────────
  -- `trip_stops_custom_place_fk (trip_id, custom_place_id) → custom_places(trip_id, id)`
  -- (`20260825140656:114-115`) ⇒ ก๊อป `custom_place_id` ไปดื้อ ๆ = คู่ `(ทริปใหม่, id เก่า)`
  -- ไม่มีอยู่จริง → `23503` → **rollback ทั้งใบ ผู้ใช้ไม่ได้ทริปเลย** (P4 จับ · ผมพลาด)
  --
  -- 🎯 ***และรูปของมันคือรูปที่แย่ที่สุด: มันผ่านกับ template ที่มีแต่ของจากคลัง
  --    แล้วล้มกับ template ที่จัดมาดี — เพราะแผนที่ดีคือแผนที่มีร้านที่เราอยากแนะนำแต่ไม่มีในคลัง***
  --    ⇒ ***ใบทดสอบผ่าน ใบจริงล้ม*** · ถ้าไม่มี P4 อ่าน FK ให้ เราจะรู้ตอนผู้ใช้กด
  --
  -- ⚠️ **ใช้ id ใหม่ ไม่ใช่ id เดิม** — `custom_places.id` เป็น `primary key` ระดับตาราง
  --    (`20260825140057:52`) ⇒ ใช้ซ้ำชนกับแถวต้นฉบับ · คีย์คู่ `(trip_id, id)` เป็น
  --    `unique` **เพิ่มเติม** สำหรับให้ FK อ้าง ไม่ได้แทน PK
  --    ⇒ **ไม่มีทางลัดแบบ "ใช้ id เดิมแล้วไม่ต้อง remap"** · ต้องถือ mapping จริง
  --
  -- 📌 `ins` เป็น data-modifying CTE ที่ไม่มีใครอ้างถึง — **Postgres รันมันจนจบเสมอ**
  --    ("executed exactly once, and always to completion, independently of whether the
  --     primary query reads any of their output") ⇒ ไม่ต้องบังคับให้ถูกอ้าง
  -- 🔴 **`as materialized` ไม่ใช่การแต่งตัว — `src` ถูกอ้างสองที่ (`ins` และ `select … into v_cp_map`)
  --    และทั้งสองต้องเห็น `new_id` **ชุดเดียวกัน** ไม่งั้น `custom_places` ได้ id ชุดหนึ่ง
  --    แต่ `v_cp_map` ถืออีกชุด ⇒ FK ระเบิดทุกใบ**
  --    วันนี้ PG ไม่ inline อยู่แล้ว (ถูกอ้าง > 1 ครั้ง · มี `gen_random_uuid()` ซึ่ง volatile)
  --    🎯 ***แต่นั่นเป็นคุณสมบัติของกฎ optimizer ไม่ใช่ของไฟล์นี้ — ไม่มีบรรทัดไหนบังคับมัน***
  --    ⇒ หนึ่งคำ ย้ายการรับประกันจากหัวคนอ่าน มาไว้ในไฟล์ (P4 เสนอ)
  with src as materialized (
    select cp.id as old_id, gen_random_uuid() as new_id,
           cp.city_id, cp.category, cp.lat, cp.lng,
           cp.maps_query, cp.description, cp.google_place_id
      from public.custom_places cp
     where cp.trip_id = v_tpl.id
       -- 🔴 **`deleted_at is null` ต้องเขียนที่นี่ ทั้งที่ไม่มี query ไหนในโปรเจกต์เขียนมัน**
       --    `20260825142639:17` ตั้งกติกาไว้ว่า *"อ่าน = policy เติม `and deleted_at is null`
       --    — บังคับที่ policy ไม่ใช่ที่ query"* ⇒ ทั้งรีโปจึงเลิกเขียนเงื่อนไขนี้โดยถูกต้อง
       --    🎯 ***แต่ฟังก์ชันนี้เป็น `security definer` — มันข้าม RLS ทั้งหมด รวม policy ที่เติมเงื่อนไขให้***
       --    ⇒ **กติกาที่ทั้งทีมพึ่งอยู่ ใช้ไม่ได้ตรงนี้ที่เดียว และไม่มีอะไรบอก**
       --    · ไม่กรอง = สถานที่ที่คนจัด template ลบทิ้งแล้ว ฟื้นเป็นแถว **ที่ยังไม่ถูกลบ**
       --      ในทริปของผู้ใช้ · ไม่อยู่ในแผนสักจุด (stop ถูกกรองไปแล้ว) ⇒ **ของแปลกที่ไม่มีที่มา**
       --    · 🔴 และ `P0003` ข้างล่างจับไม่ได้ตามนิยาม — มันถามว่า *"ก๊อปไม่ครบไหม"* ของชนิดนี้คือ *"ก๊อปเกิน"*
       --    📌 P4 จับ · ผมจำ `D76` ได้ตอนก๊อป `trip_stops` (3 จุด) แต่ไม่ได้จำตอนก๊อปตารางนี้
       and cp.deleted_at is null
  ),
  ins as (
    insert into public.custom_places
      (id, trip_id, city_id, category, lat, lng, maps_query, description, google_place_id, added_by_user)
    select s.new_id, v_new.id, s.city_id, s.category, s.lat, s.lng,
           s.maps_query, s.description, s.google_place_id, v_uid
      from src s
    returning id
  )
  select coalesce(jsonb_object_agg(s.old_id::text, s.new_id::text), '{}'::jsonb)
    into v_cp_map
    from src s;
  -- 🔴 `added_by_user = v_uid` ไม่ใช่คนที่จัด template — เหตุผลเดียวกับ `created_by`:
  --    มันเป็นสถานที่ในทริป *ของผู้เรียก* แล้ว · และ `D19` ผูก `added_by_user` กับการแสดงผลในทริป

  -- ชื่อของสถานที่พวกนั้น — ไม่ก๊อป = ได้สถานที่ที่ไม่มีชื่อ ซึ่งอ่านเหมือนของเสีย
  if v_cp_map <> '{}'::jsonb then
    insert into public.custom_place_names (trip_id, place_id, locale, name, priority, source)
    select v_new.id, (v_cp_map ->> n.place_id::text)::uuid, n.locale, n.name, n.priority, n.source
      from public.custom_place_names n
     where n.trip_id = v_tpl.id
       and v_cp_map ? n.place_id::text;
  end if;

  insert into public.trip_plans (trip_id, name, is_active)
  values (v_new.id, 'แผน A', true)
  returning id into v_new_plan;

  -- แผนที่ใช้เป็นต้นฉบับ = แผนที่ active ของ template · ไม่มี active ⇒ ใบแรกที่เจอ
  select p.id into v_src_plan
    from public.trip_plans p
   where p.trip_id = v_tpl.id
   order by p.is_active desc, p.created_at asc
   limit 1;

  if v_src_plan is not null then
    -- 🔴 **จับคู่วันด้วย `date` ไม่ใช่ด้วย id** — `trip_days_unique_date unique (trip_id, date)`
    --    (`20260825110903:125`) ทำให้คู่นี้เป็นหนึ่งต่อหนึ่งเสมอ ⇒ ไม่ต้องถือ mapping ในตัวแปร
    -- 🔴 `s.deleted_at is null` — tombstone ไม่ตามไปแผนใหม่ (`D76` · กติกาเดียวกับ `duplicate_trip_plan`)
    -- 🔴 ด่านที่ทำให้ "ก๊อปไม่ครบ" ดัง แทนที่จะเงียบเป็น `custom_place_id = null`
    --    ถ้า mapping ขาด `case` ข้างล่างจะให้ `null` ⇒ ไปชนกับ check constraint ของ `trip_stops`
    --    ด้วยข้อความที่พูดถึงคอลัมน์ **ซึ่งไม่ใช่สิ่งที่ผิดจริง** ⇒ คนอ่านจะไล่ผิดทาง
    if exists (
      select 1 from public.trip_stops s
       where s.trip_id = v_tpl.id and s.plan_id = v_src_plan and s.deleted_at is null
         and s.custom_place_id is not null
         and not (v_cp_map ? s.custom_place_id::text)
    ) then
      raise exception 'ก๊อปไม่ครบ: จุดแวะอ้าง custom place ที่ไม่ได้ถูกก๊อป (template %)', v_tpl.id
        using errcode = 'P0003';
    end if;

    insert into public.trip_stops
      (trip_id, plan_id, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
       dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
       photo_path, transfer_target_time, transfer_target_label,
       event_kind, schedule_bound, fixed_start_time, fixed_end_time, day_offset,
       title, title_en, icon, is_alert, time_is_flexible,
       flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
       layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change, place_ref)
    select
       v_new.id, v_new_plan, nd.id, s.catalog_place_id,
       case when s.custom_place_id is null then null
            else (v_cp_map ->> s.custom_place_id::text)::uuid end,
       s.kind, s.rank,
       s.dwell_minutes, s.travel_mode, s.note, s.intercity_from, s.intercity_to, s.intercity_mode,
       s.photo_path, s.transfer_target_time, s.transfer_target_label,
       s.event_kind, s.schedule_bound, s.fixed_start_time, s.fixed_end_time, s.day_offset,
       s.title, s.title_en, s.icon, s.is_alert, s.time_is_flexible,
       s.flight_no, s.flight_from_code, s.flight_to_code, s.flight_from_en, s.flight_to_en,
       s.layover_baggage, s.layover_immigration, s.layover_leaves_airport, s.layover_terminal_change,
       s.place_ref
      from public.trip_stops s
      join public.trip_days od on od.id = s.trip_day_id
      join public.trip_days nd on nd.trip_id = v_new.id and nd.date = od.date + v_shift
     where s.trip_id = v_tpl.id
       and s.plan_id = v_src_plan
       and s.deleted_at is null;
    -- 🔴 **`visited_at` และ `legacy_added_by` ไม่ถูกก๊อปโดยตั้งใจ** —
    --    "เคยไปมาแล้ว" เป็นข้อเท็จจริงของคนที่จัดแผน ไม่ใช่ของคนที่เพิ่งก๊อป
    --    ⇒ ก๊อปมา = ทริปใหม่ที่ยังไม่ได้ไปไหนเลย ซึ่งเป็นความจริงเสมอ

    insert into public.trip_day_plan_settings
      (trip_id, plan_id, trip_day_id, start_time, return_travel_mode, is_locked, note)
    select v_new.id, v_new_plan, nd.id, ds.start_time, ds.return_travel_mode, ds.is_locked, ds.note
      from public.trip_day_plan_settings ds
      join public.trip_days od on od.id = ds.trip_day_id
      join public.trip_days nd on nd.trip_id = v_new.id and nd.date = od.date + v_shift
     where ds.trip_id = v_tpl.id
       and ds.plan_id = v_src_plan;
  end if;

  return v_new;
end;
$$;

revoke all on function public.list_trip_templates()                    from public, anon, authenticated;
revoke all on function public.copy_trip_template(uuid, date, text)     from public, anon, authenticated;
grant execute on function public.list_trip_templates()                 to authenticated;
grant execute on function public.copy_trip_template(uuid, date, text)  to authenticated;
-- ⚠️ **ยังไม่ให้ `anon`** — หน้าแรกวันนี้ต้องล็อกอินก่อนถึงจะเห็น
--    วันที่มีหน้า landing สำหรับคนยังไม่ล็อกอิน ให้เพิ่ม `anon` เฉพาะ `list_…` ตัวเดียว
--    🔴 **`copy_…` ห้ามให้ `anon` เด็ดขาด** — มันเขียน และ `auth.uid()` จะเป็น null

-- ───────────────────────────────────────────────────────────────────────────
-- 4. assert — ต้องแดงถ้าไฟล์นี้ไม่ได้ผล
-- ───────────────────────────────────────────────────────────────────────────
do $assert$
begin
  if to_regclass('public.trips') is null then
    raise exception 'assert ล้ม: ไม่มีตาราง trips';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trips'
       and column_name = 'published_template_at'
  ) then
    raise exception 'assert ล้ม: ไม่มีคอลัมน์ trips.published_template_at';
  end if;

  -- 🔴 **เคสควบคุม — หัวใจของไฟล์นี้**
  --    ถ้าวันหนึ่งมีคนเพิ่ม `published_template_at` เข้า `grant update (…)` ของ `trips`
  --    ไคลเอนต์จะประกาศทริปตัวเองเป็นทริปแนะนำได้ **โดยไม่มีอะไรส่งเสียง**
  --    ⇒ ผูกข้อห้ามไว้กับของที่รันได้ ไม่ใช่กับคอมเมนต์ที่หมดอายุเงียบ
  if has_column_privilege('authenticated', 'public.trips', 'published_template_at', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated ตั้ง trips.published_template_at ได้ — ไคลเอนต์ประกาศทริปแนะนำเองได้';
  end if;
  if has_column_privilege('authenticated', 'public.trips', 'published_template_at', 'INSERT') then
    raise exception 'assert ล้ม: authenticated ใส่ trips.published_template_at ตอน insert ได้';
  end if;

  -- ✅ ฝั่งบวก — ถ้าไม่มีข้อนี้ การ revoke ทั้งตารางก็ผ่านเคสควบคุมข้างบนครบเหมือนกันเป๊ะ
  if not has_function_privilege('authenticated', 'public.list_trip_templates()', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก list_trip_templates ไม่ได้';
  end if;
  if not has_function_privilege('authenticated', 'public.copy_trip_template(uuid, date, text)', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก copy_trip_template ไม่ได้';
  end if;

  -- ทั้งสองตัวต้องเป็น definer — ไม่งั้นอ่าน template ของคนอื่นไม่ออกตั้งแต่แรก และจะเงียบ (คืนศูนย์แถว)
  if not (select p.prosecdef from pg_proc p
           where p.oid = 'public.list_trip_templates()'::regprocedure) then
    raise exception 'assert ล้ม: list_trip_templates ต้องเป็น security definer';
  end if;
  if not (select p.prosecdef from pg_proc p
           where p.oid = 'public.copy_trip_template(uuid, date, text)'::regprocedure) then
    raise exception 'assert ล้ม: copy_trip_template ต้องเป็น security definer';
  end if;

  -- 🔴 ยังไม่มีทริปแนะนำสักใบ ณ ตอนไฟล์นี้รัน — **และนั่นถูกต้อง**
  --    ⇒ ไม่ assert ว่ามีข้อมูล · assert ว่า *กลไก* พร้อม (`§3.4`: ด่านที่ยังไม่มีของให้ตรวจ ต้องแดง
  --      — ที่นี่ "ของให้ตรวจ" คือฟังก์ชันกับสิทธิ์ ซึ่งมีแล้ว ไม่ใช่แถวข้อมูล)
end $assert$;

commit;
