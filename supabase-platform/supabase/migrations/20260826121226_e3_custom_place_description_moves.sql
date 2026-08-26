-- ═══════════════════════════════════════════════════════════════════════════
-- `Q6` ปิดครึ่งที่ค้าง — `custom_places.description` ย้ายเข้า `custom_place_descriptions`
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── 🎯 เงื่อนไขที่ตั้งไว้เมื่อเช้า **ยิงเองตรงเวลา** ────────────────────────
-- `20260826082858` เขียนไว้ว่า drop ไม่ได้เพราะ `hooks/useCustomPlaces.tsx` ทำ `insert(newPlace)`
-- ส่งทั้งอ็อบเจกต์ซึ่งมี `description` · **และผูกเงื่อนไขไว้กับเคสที่รันได้ ไม่ใช่คำสัญญา**
--
-- วันนี้ hook ถูกแปลงเป็น `fetch()` ตาม `E3` → **เคส `descriptionSplit.test.ts` แดงทันที**
-- พร้อมข้อความ *"🟢 hook เลิกส่ง `description` แล้ว → ถึงเวลา drop"*
-- 🔴 **นี่คือความต่างระหว่างข้อยกเว้นที่มีวันหมดอายุ กับ `D73`** — ไม่มีใครต้องจำ มันมาบอกเอง
--
-- ── ย้ายอะไรไปไหน ──────────────────────────────────────────────────────────
-- `custom_places.description`  →  `custom_place_descriptions(place_id, 'th', description)`
-- · locale เป็น `th` เพราะช่องเดียวในเว็บเดิมคือคำบรรยายภาษาไทย (เหตุผลเดียวกับคลังกลาง)
-- · **ย้ายค่าก่อน drop** · คาดว่า 0 แถวบน dev แต่เขียนไว้เพราะ *"คาดว่าว่าง" ≠ "ว่างจริง"*
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

insert into public.custom_place_descriptions (trip_id, place_id, locale, description, source)
select p.trip_id, p.id, 'th', p.description, 'user'
  from public.custom_places p
 where p.description is not null and length(trim(p.description)) > 0
on conflict (place_id, locale) do nothing;

-- RPC เขียนคำบรรยายลงตารางใหม่แทน
create or replace function public.create_custom_place(
  p_trip_id uuid, p_city_slug text, p_category text,
  p_lat double precision, p_lng double precision, p_maps_query text,
  p_name_th text, p_name_en text default null, p_name_ko text default null,
  p_description text default null, p_google_place_id text default null,
  p_legacy_added_by text default null
)
returns uuid
language plpgsql
set search_path = ''
as $fn$
declare
  v_city_id uuid;
  v_id      uuid;
begin
  select id into v_city_id from public.catalog_cities where legacy_slug = p_city_slug;
  if v_city_id is null then
    raise exception 'ไม่รู้จักเมือง % — ต้องมีอยู่ใน catalog_cities.legacy_slug ก่อน', p_city_slug
      using errcode = '23503';
  end if;

  insert into public.custom_places
    (trip_id, city_id, category, lat, lng, maps_query, google_place_id, legacy_added_by)
  values
    (p_trip_id, v_city_id, p_category, p_lat, p_lng, p_maps_query, p_google_place_id, p_legacy_added_by)
  returning id into v_id;

  insert into public.custom_place_names (trip_id, place_id, locale, name, priority, source)
  select p_trip_id, v_id, l.locale, l.name, 1, 'user'
    from (values ('th', nullif(trim(p_name_th), '')),
                 ('en', nullif(trim(p_name_en), '')),
                 ('ko', nullif(trim(p_name_ko), ''))) as l(locale, name)
   where l.name is not null;

  -- 🔴 คำบรรยายไปตารางของมันเอง (`Q6`) · ช่องว่างไม่ใช่คำบรรยาย จึงข้ามไปเลย
  if nullif(trim(p_description), '') is not null then
    insert into public.custom_place_descriptions (trip_id, place_id, locale, description, source)
    values (p_trip_id, v_id, 'th', trim(p_description), 'user');
  end if;

  return v_id;
end
$fn$;

alter table public.custom_places drop column description;

-- 🔴 `grant (คอลัมน์)` เป็นลิสต์ทั้งอัน (`P-63`) — พิมพ์ที่เหลือให้ครบ **ลบ `description` ออกตัวเดียว**
revoke insert, update on public.custom_places from authenticated;
grant insert (trip_id, city_id, category, lat, lng, maps_query, google_place_id, legacy_added_by)
  on public.custom_places to authenticated;
grant update (city_id, category, lat, lng, maps_query, google_place_id, deleted_at)
  on public.custom_places to authenticated;

do $verify$
declare got text[]; want text[];
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='custom_places' and column_name='description') then
    raise exception 'Q6: custom_places.description ยังอยู่';
  end if;

  -- เทียบ **ชื่อ** ไม่ใช่จำนวน (บทเรียนจาก P-63 รอบสอง)
  select array_agg(column_name order by column_name) into got
    from information_schema.column_privileges
   where table_schema='public' and table_name='custom_places'
     and grantee='authenticated' and privilege_type='INSERT';
  want := array['category','city_id','google_place_id','lat','legacy_added_by','lng','maps_query','trip_id'];
  if got is distinct from want then
    raise exception 'custom_places INSERT ไม่ตรง · ได้ % · ต้องการ %', got, want;
  end if;

  select array_agg(column_name order by column_name) into got
    from information_schema.column_privileges
   where table_schema='public' and table_name='custom_places'
     and grantee='authenticated' and privilege_type='UPDATE';
  want := array['category','city_id','deleted_at','google_place_id','lat','lng','maps_query'];
  if got is distinct from want then
    raise exception 'custom_places UPDATE ไม่ตรง · ได้ % · ต้องการ %', got, want;
  end if;
end $verify$;

commit;
