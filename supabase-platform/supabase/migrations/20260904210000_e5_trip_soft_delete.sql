-- ═══════════════════════════════════════════════════════════════════════════
-- ลบทริปแบบกู้คืนได้ — `trips.deleted_at` + RPC ลบ/กู้/ดูถังขยะ
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้สั่งเอง ("ทำเลย" — เปลี่ยนชื่อ + ลบทริป)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 🔴 ทำไมเป็น soft delete — **ทีมตัดสินไว้แล้วตั้งแต่วันแรก ไฟล์นี้แค่ไปทำตาม**
--   `20260824043822:273` เขียนไว้ตรง ๆ ว่า:
--     *"ไม่มี policy DELETE — ลบทริปคือลบจุดแวะทั้งทริปแบบย้อนไม่ได้
--       ต้องผ่านทางที่ตั้งใจ (E2 soft delete) ไม่ใช่ DELETE ตรงจาก client"*
--   ⇒ ไฟล์นี้ **ไม่เปิด policy DELETE ให้ใครเพิ่ม** · `trips` ยังไม่มี policy DELETE เหมือนเดิมทุกประการ
--
-- ## 🔴 ทำไมไม่ใช้ `status = 'archived'` ที่มีอยู่แล้ว
--   `archived` = *สถานะที่ผู้ใช้ตั้งใจเลือก* ("ทริปจบแล้ว เก็บเข้าลิ้นชัก") — **ยังต้องเห็นได้**
--   `deleted_at` = *เจตนาจะทิ้ง* — **ต้องหายจากทุกที่**
--   🎯 ***สองคอลัมน์เพราะเป็นสองคำถาม*** · ยุบรวมเมื่อไหร่ ต้องเลือกอย่างใดอย่างหนึ่ง:
--      ทริปที่ archive ไว้หายเงียบ **หรือ** ทริปที่ลบแล้วโผล่ในลิ้นชัก
--
-- ## 🔴 หัวใจของไฟล์: ปิดที่ `app.can_read_trip` **ที่เดียว** ไม่ใช่ไล่เติม policy ทีละใบ
--   ```
--   ก่อน   app.can_read_trip(t) = app.trip_role(t) is not null    ← อ่าน `trip_members` **ไม่แตะ `trips` เลย**
--   ```
--   ⇒ เติม `deleted_at is null` แค่ที่ `trips_select` **ตัวทริปหาย แต่ลูกทุกใบยังอ่านได้**
--     (`trip_days` · `trip_stops` · `bookings` · `checklist_items` · `trip_hotels` · `place_notes` …
--      policy ทุกใบเขียน `using (app.can_read_trip(trip_id))` ซึ่งไม่รู้จัก `trips.deleted_at`)
--   ⇒ คนที่ถือ URL เก่ายิง `/api/engine/trips/<id>/stops` ได้เนื้อครบ ทั้งที่ทริป "ถูกลบแล้ว"
--   🎯 ***เติมที่ funnel ใบเดียว = ทุก policy ที่ผ่านมันได้ผลพร้อมกัน และไม่มีใบไหนที่ต้องมีคนไปตามเติม***
--   · ⚠️ **blast radius กว้างโดยตั้งใจ** — `can_read_trip` ถูกเรียกจาก policy หลายสิบใบ
--     ราคา: lookup `trips` ด้วย PK เพิ่มหนึ่งครั้งต่อการตรวจ · ฟังก์ชัน `stable` → planner cache ได้ในคำสั่งเดียว
--
-- ## 🔴 `security definer` ไม่ผ่าน funnel นั้น — `§3.4` จดไว้แล้ว
--   *definer ข้าม RLS ⇒ ข้าม policy ⇒ ข้ามเงื่อนไขที่ policy เติมให้*
--   ไฟล์นี้จัดการ definer ที่อ่าน `trips` เป็นเนื้อ **ด้วยสองทางที่ต่างกัน และเหตุผลต่างกัน:**
--
--   ① `list_trip_templates()` → **เติม `deleted_at is null` มือ** (25 บรรทัด ประกาศใหม่ทั้งใบ)
--      เพราะ `anon` เรียกได้ (ทะเบียนข้อ 9) — ***ลืมแล้วทริปที่ลบไปโชว์ให้คนทั้งอินเทอร์เน็ต***
--
--   ② `copy_trip_template()` → **ไม่แตะเลย** และมันปลอดภัยด้วย *ข้อเท็จจริงอื่น* ไม่ใช่ด้วยตัวมันเอง:
--      `soft_delete_trip` ข้างล่าง **ล้าง `published_template_at` ทิ้ง** ⇒ ด่านเดิมของมัน
--      (`where … and published_template_at is not null`) ปิดเองโดยไม่ต้องมีใครแก้
--      🔴 **เหตุผลที่ไม่ประกาศใหม่: ตัวมันยาว 200 บรรทัด** ⇒ ก๊อปมาที่นี่ = **สำเนาที่ต้องมีคนซิงก์**
--         ซึ่งเป็นรูปที่ `§3.3`/`§3.5` เตือนซ้ำ ๆ ว่าจะล้าเสมอ · แลกบั๊กที่ยังไม่มี กับบั๊กที่มาแน่ — ไม่คุ้ม
--      ⚠️ **และนี่คือ "ปลอดภัยเพราะข้อเท็จจริงที่ไม่เกี่ยวกับตัวมันเอง"** ซึ่ง `§3.4` สั่งให้เขียนให้ชัด
--         ⇒ **วันที่มีคนทำให้ `soft_delete_trip` เลิกล้างธง ช่องนี้เปิดกลับทันทีโดยไม่มีอะไรส่งเสียง**
--         ⇒ assert ข้อ 6 ท้ายไฟล์ผูกสองอย่างนี้เข้าด้วยกัน **ให้มันแดงถ้าใครถอด**
--
--   ✅ definer ที่ *ไม่* ต้องแก้ และเหตุผล (เขียนไว้เพราะคนถัดไปจะถามแน่):
--     · `app.trip_role(t)` อ่าน `trip_members` ล้วน — **ตั้งใจไม่แตะ**: มันตอบว่า *"บทบาทฉันคืออะไร"*
--       ซึ่งยังจริงหลังลบ · และ `soft_delete_trip`/`restore_trip` ต้องเรียกมันตอนทริปถูกลบไปแล้ว
--     · `public.duplicate_trip_plan` อ่าน `trip_plans` ไม่ได้อ่าน `trips`
--     · `public.set_trip_pinned` เขียน `trip_members` · ทริปที่ลบแล้วไม่โผล่ในรายการอยู่แล้ว
--
-- ## ✅ ขอบเขตของ assert ในไฟล์นี้ — **บอกตรง ๆ ว่าอันไหนพิสูจน์ที่ไหน**
--   assert ที่นี่ตรวจได้เฉพาะ **ข้อเท็จจริงเรื่องสิทธิ์/โครงสร้าง** เพราะมันไม่ต้องมีผู้ใช้จริง
--   🔴 ***พฤติกรรม* (ลบแล้วลูกหายจริงไหม · กู้แล้วกลับมาครบไหม) พิสูจน์ที่นี่ไม่ได้** —
--      ต้องมี `auth.users` + `trip_members` จริง ⇒ อยู่ที่ `lib/__tests__/rlsMatrix.test.ts` ซึ่งมี fixture
--      **อย่าอ่านว่า assert ที่นี่ครอบพฤติกรรมแล้ว**
--
-- ## rollback
--   `update public.trips set deleted_at = null;` แล้วถอย `can_read_trip` กลับเป็นบรรทัดเดียว
--   · **ข้อมูลไม่หายเลยตามนิยามของ soft delete** — นี่คือเหตุผลทั้งหมดที่เลือกทางนี้
--   · ⚠️ `published_template_at` ที่ถูกล้างตอนลบ **ถอยคืนไม่ได้** — ต้องประกาศทริปแนะนำใหม่
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform'
       and ref  = 'pmvxwcimjebogjfimzqy'
       and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;
end $guard$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. คอลัมน์
-- ───────────────────────────────────────────────────────────────────────────
alter table public.trips
  add column if not exists deleted_at timestamptz;

comment on column public.trips.deleted_at is
  'เวลาที่เจ้าของกดลบ · null = ยังอยู่ · คนละเรื่องกับ status=archived (archived ยังต้องเห็นได้) · เขียนผ่าน RPC เท่านั้น';

-- 🔴 **ไม่ `grant update (deleted_at)` ให้ `authenticated` โดยตั้งใจ**
--    `…122247:75` revoke `insert, update` ระดับตารางไปแล้ว ⇒ คอลัมน์ใหม่ **ไม่มีสิทธิ์ติดมาเอง**
--    ⇒ ไคลเอนต์ตั้ง/ล้าง `deleted_at` ตรง ๆ ไม่ได้ · ทางเดียวคือ RPC ข้างล่างซึ่งตรวจ owner ก่อน
--    ⚠️ นี่คือ "ปลอดภัยเพราะของเดิมถูกปิดไว้" ไม่ใช่ "ปลอดภัยเพราะมีด่าน" ⇒ assert บังคับทั้งสองทิศ

-- ───────────────────────────────────────────────────────────────────────────
-- 2. funnel: `app.can_read_trip` รู้จัก `deleted_at`
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 อ่านคอมเมนต์หัวไฟล์ก่อนแก้ — policy หลายสิบใบพึ่งฟังก์ชันนี้อยู่
create or replace function app.can_read_trip(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.trip_role(t) is not null
     and exists (select 1 from public.trips where id = t and deleted_at is null)
$$;

-- 🔴 `trips_select` **ไม่ต้องแก้** — มันเรียก `app.can_read_trip(id)` อยู่แล้ว
--    เติมซ้ำที่นั่น = สองที่ที่ต้องตรงกันตลอดไป (`20260825142949:110` เตือนรูปนี้ไว้แล้ว)

-- ── `trips_update`: ทริปที่ถูกลบต้องแก้ไม่ได้ ──────────────────────────────
-- 🔴 ที่นี่เทียบคอลัมน์ตรง ๆ ไม่เรียก `can_read_trip` — ตั้งใจ
--    `using` ของ UPDATE เห็นแถวอยู่แล้ว การเรียกฟังก์ชันคือ lookup ซ้ำโดยไม่ได้อะไรเพิ่ม
-- 🔴 `with check (deleted_at is null)` = **ตั้ง `deleted_at` ผ่าน UPDATE ไม่ได้อีกชั้นหนึ่ง**
--    ชั้นแรกคือไม่มี column grant · ถ้าวันหนึ่งมีคนเผลอ grant คอลัมน์นี้ ชั้นนี้ยังกันอยู่
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
  for update to authenticated
  using      (app.trip_role(id) = 'owner' and deleted_at is null)
  with check (app.trip_role(id) = 'owner' and deleted_at is null);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. definer ที่ `anon` เรียกได้ — เติมมือ (เหตุผลอยู่หัวไฟล์ ข้อ ①)
-- ───────────────────────────────────────────────────────────────────────────
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
    and t.deleted_at is null
  order by t.published_template_at desc;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RPC: ลบ · กู้คืน · ถังขยะ
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 ทั้งสามใบเป็น `security definer` ⇒ **`where`/`if` ข้างในคือด่านทั้งหมด** ไม่มี policy มาช่วย
--    รูปเดียวกับ `set_trip_pinned` และ `copy_trip_template` — แก้บรรทัดตรวจสิทธิ์ต้องอ่านบรรทัดนี้ก่อน

create or replace function public.soft_delete_trip(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days     int;
  v_stops    int;
  v_was_tpl  boolean;
begin
  -- 🔴 **owner เท่านั้น** — ไม่ใช่ `can_write_trip` (editor เขียนจุดแวะได้ แต่ทิ้งทริปทั้งใบไม่ได้)
  --    🎯 *"แก้เนื้อในทริป" กับ "ทำให้ทริปหายไป" เป็นคนละระดับสิทธิ์ ต่อให้อยู่ตารางเดียวกัน*
  if app.trip_role(p_trip_id) is distinct from 'owner' then
    -- ⚠️ `P0002` เหมือน `set_trip_pinned` — **ไม่ยืนยันว่าทริปนี้มีอยู่จริงให้คนนอกรู้**
    raise exception 'ไม่พบทริปนี้ หรือคุณไม่ใช่เจ้าของ' using errcode = 'P0002';
  end if;

  -- 🔴 ลบซ้ำต้องไม่เงียบ — ไม่งั้น `deleted_at` ถูกเลื่อนเวลาทุกครั้งที่กดซ้ำ
  --    และ "ลบสำเร็จ" ครั้งที่สองจะอ่านเหมือนครั้งแรกทั้งที่ไม่มีอะไรเกิดขึ้น
  if not exists (select 1 from public.trips where id = p_trip_id and deleted_at is null) then
    raise exception 'ทริปนี้ถูกลบไปแล้ว' using errcode = 'P0002';
  end if;

  -- 🔴 นับ **ก่อน** อัปเดต — หลังอัปเดตแล้ว `can_read_trip` เป็น false ไปแล้ว
  --    (นับที่นี่ไม่ผ่าน RLS เพราะเป็น definer แต่ลำดับยังสำคัญเพื่อความหมายของตัวเลข)
  select count(*)::int into v_days
    from public.trip_days where trip_id = p_trip_id;
  select count(*)::int into v_stops
    from public.trip_stops where trip_id = p_trip_id and deleted_at is null;

  -- 🔴 **อ่านธงก่อน `update` — `returning` คืนค่า *ใหม่* ไม่ใช่ค่าเดิม**
  --    (ร่างแรกของไฟล์นี้เขียน `returning (published_template_at is null)` ซึ่ง **เป็น true เสมอ**
  --     `tsc`/`lint` ไม่เห็น · เทสต์ที่ไม่ได้ตั้งธงก็ไม่เห็น — รูปเดียวกับ `§3.4` *assert ที่ล้มไม่ได้*)
  select (published_template_at is not null) into v_was_tpl
    from public.trips where id = p_trip_id;

  -- 🔴 ล้างธงทริปแนะนำ — **นี่คือสิ่งที่ทำให้ `copy_trip_template` ปลอดภัยโดยไม่ต้องแก้มัน**
  --    (เหตุผลเต็มอยู่หัวไฟล์ ข้อ ② · assert ข้อ 6 ผูกไว้ให้แดงถ้ามีคนถอดบรรทัดนี้)
  update public.trips
     set deleted_at            = now(),
         published_template_at = null
   where id = p_trip_id;

  return jsonb_build_object(
    'dayCount',   v_days,
    'stopCount',  v_stops,
    'wasTemplate', v_was_tpl
  );
end;
$$;

create or replace function public.restore_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.trip_role(p_trip_id) is distinct from 'owner' then
    raise exception 'ไม่พบทริปนี้ หรือคุณไม่ใช่เจ้าของ' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.trips where id = p_trip_id and deleted_at is not null) then
    raise exception 'ทริปนี้ไม่ได้ถูกลบอยู่' using errcode = 'P0002';
  end if;

  -- 🔴 **ไม่คืน `published_template_at`** — ทริปแนะนำที่ถูกลบไปแล้ว ต้องมีคนตั้งใจประกาศใหม่
  --    (และไคลเอนต์ตั้งเองไม่ได้อยู่แล้ว — ทะเบียนข้อ 8 ให้เฉพาะ `service_role`)
  update public.trips set deleted_at = null where id = p_trip_id;
end;
$$;

-- 🔴 ถังขยะต้องเป็น definer เพราะ `trips_select` ซ่อนแถวพวกนี้ไปแล้ว
--    ⇒ ***ถ้าไม่มีฟังก์ชันนี้ คำว่า "กู้คืนได้" เป็นจริงเฉพาะกับคนที่รัน SQL เองได้***
create or replace function public.list_deleted_trips()
returns table (
  id         uuid,
  title      text,
  start_date date,
  end_date   date,
  deleted_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select t.id, t.title, t.start_date, t.end_date, t.deleted_at
    from public.trips t
   where t.deleted_at is not null
     and app.trip_role(t.id) = 'owner'
   order by t.deleted_at desc
   limit 100;
$$;

revoke all on function public.soft_delete_trip(uuid) from public, anon, authenticated;
revoke all on function public.restore_trip(uuid)     from public, anon, authenticated;
revoke all on function public.list_deleted_trips()   from public, anon, authenticated;
grant execute on function public.soft_delete_trip(uuid) to authenticated;
grant execute on function public.restore_trip(uuid)     to authenticated;
grant execute on function public.list_deleted_trips()   to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. assert — สิทธิ์และโครงสร้าง (ขอบเขตอยู่หัวไฟล์: **ไม่ครอบพฤติกรรม**)
-- ───────────────────────────────────────────────────────────────────────────
do $assert$
declare
  v_soft text;
  v_copy text;
begin
  -- ① คอลัมน์มีจริง
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trips' and column_name = 'deleted_at'
  ) then
    raise exception 'assert ล้ม: ไม่มีคอลัมน์ trips.deleted_at';
  end if;

  -- ② ไคลเอนต์ตั้ง/ล้าง `deleted_at` เองไม่ได้ — ทั้งสองเมธอด
  if has_column_privilege('authenticated', 'public.trips', 'deleted_at', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated update trips.deleted_at ได้ — ลบทริปคนอื่น/ปลุกทริปที่ลบแล้วได้โดยไม่ผ่าน RPC';
  end if;
  if has_column_privilege('authenticated', 'public.trips', 'deleted_at', 'INSERT') then
    raise exception 'assert ล้ม: authenticated ใส่ trips.deleted_at ตอน insert ได้';
  end if;

  -- ③ 🔴 **เคสควบคุมฝั่งบวก** — ถ้าไม่มีข้อนี้ `revoke update on public.trips` ทั้งตาราง
  --    (ซึ่งจะทำให้ทั้งเว็บแก้ทริปไม่ได้เลย) **ผ่าน assert ② ข้างบนเหมือนกันเป๊ะ**
  if not has_column_privilege('authenticated', 'public.trips', 'title', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated แก้ trips.title ไม่ได้แล้ว — สิทธิ์ถูกปิดกว้างเกินไป';
  end if;
  if not has_column_privilege('authenticated', 'public.trips', 'start_date', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated แก้ trips.start_date ไม่ได้แล้ว — สิทธิ์ถูกปิดกว้างเกินไป';
  end if;

  -- ④ RPC เรียกได้จริงจากฝั่งที่ควรเรียก และเรียกไม่ได้จากฝั่งที่ไม่ควร
  if not has_function_privilege('authenticated', 'public.soft_delete_trip(uuid)', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก soft_delete_trip ไม่ได้ — ลบทริปไม่ได้เลย';
  end if;
  if not has_function_privilege('authenticated', 'public.restore_trip(uuid)', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก restore_trip ไม่ได้ — "กู้คืนได้" เป็นเท็จ';
  end if;
  if not has_function_privilege('authenticated', 'public.list_deleted_trips()', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก list_deleted_trips ไม่ได้ — ไม่มีทางหาทริปที่ลบไปเจอ';
  end if;
  -- 🔴 ทั้งสามใบแตะทริปของผู้ใช้ ⇒ `anon` ต้องเรียกไม่ได้สักใบ (ต่างจากทะเบียนข้อ 9 ที่เป็นคลังสาธารณะ)
  if has_function_privilege('anon', 'public.soft_delete_trip(uuid)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก soft_delete_trip ได้ — คนไม่ล็อกอินลบทริปคนอื่นได้';
  end if;
  if has_function_privilege('anon', 'public.restore_trip(uuid)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก restore_trip ได้';
  end if;
  if has_function_privilege('anon', 'public.list_deleted_trips()', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก list_deleted_trips ได้';
  end if;

  -- ⑤ ยังไม่มี policy DELETE บน `trips` — ไฟล์นี้ต้องไม่เปิดทางนั้นโดยบังเอิญ
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'trips' and cmd = 'DELETE'
  ) then
    raise exception 'assert ล้ม: มี policy DELETE บน trips แล้ว — ขัดกับ 20260824043822:273';
  end if;

  -- ⑥ 🔴 **ข้อผูกที่หัวไฟล์สัญญาไว้** — `copy_trip_template` ปลอดภัยด้วยข้อเท็จจริงที่ไม่ใช่ของตัวเอง
  --    ⇒ อย่างน้อยหนึ่งในสองอย่างนี้ต้องจริง **เสมอ**:
  --      ก) `copy_trip_template` กรอง `deleted_at` เอง   (คนถัดไปแก้ให้ตรงไปตรงมา)
  --      ข) `soft_delete_trip` ล้าง `published_template_at` (ทางที่ใช้อยู่วันนี้)
  --    🎯 ***เขียนเป็น "อย่างน้อยหนึ่ง" ไม่ใช่ "ต้องเป็น ข)" — ไม่งั้นด่านนี้จะแดงใส่คนที่มาแก้ให้ดีขึ้น***
  --       ซึ่ง `§3.4` บอกว่าเป็นด่านที่จะถูกลบทั้งใบ แล้วของที่มันกันไว้ก็หายไปด้วย
  --    ⚠️ **ขอบเขต: นี่คือการอ่าน *ข้อความ* ของฟังก์ชัน ไม่ใช่การรันมัน** — จับ "มีคนถอดบรรทัดออก" ได้
  --       **จับไม่ได้** ถ้ามีคนเปลี่ยนชื่อคอลัมน์ หรือเขียนเงื่อนไขให้เป็นเท็จเสมอโดยที่คำยังอยู่
  select pg_get_functiondef('public.soft_delete_trip(uuid)'::regprocedure) into v_soft;
  select pg_get_functiondef('public.copy_trip_template(uuid, date, text)'::regprocedure) into v_copy;
  if v_copy not like '%deleted_at%' and v_soft not like '%published_template_at%' then
    raise exception 'assert ล้ม: copy_trip_template ไม่กรอง deleted_at และ soft_delete_trip ไม่ล้าง published_template_at ⇒ ก๊อปทริปแนะนำที่ถูกลบไปแล้วได้';
  end if;
end $assert$;

commit;
