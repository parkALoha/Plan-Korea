-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ `assert_cache_lockdown()` ข้อ ⑥ — ทุกแถวในแคชต้องมีคีย์ที่อยู่ในคลัง       ║
-- ║ P1 · 3 ก.ย. 2026 · **ข้อที่ `E3-AC6` ยังขาด: ด่านที่บังคับ *ต่อเนื่อง***    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ## ทำไม
-- `E3-AC6` บอกว่า *"แคชเฉพาะสิ่งที่พิสูจน์ได้ว่าเป็นของสาธารณะ"* · วันนี้มีสามชั้นแล้ว:
-- ```
-- ประตูฝั่งอ่าน   catalogPublicMapsQueries()     กรองตอนอ่าน — **แถวเสียยังอยู่ในตาราง**
-- ประตูฝั่งเขียน  cacheWarmWrite ตรวจซ้ำ         กันของใหม่ — **ไม่ย้อนดูของเก่า**
-- purge          20260902160000                 ล้างครั้งเดียว — **migration รันครั้งเดียวตลอดกาล**
-- ```
-- 🔴 **ไม่มีชั้นไหนตอบว่า *"ตอนนี้ในตารางมีแถวที่คีย์ไม่ใช่ของคลังไหม"*** — และนั่นคือคำถามของ `AC6` ตรง ๆ
-- 🎯 **ตามกติกา `§3.4`: เกณฑ์ที่เป็นข้อห้ามปิดได้เมื่อมีด่านที่ *แดงจริงเมื่อละเมิด*** — ก่อนไฟล์นี้ยังไม่มี
--
-- ## ⚠️ ทิศที่มันจะแดงโดยไม่มีใครทำผิด — เขียนไว้เพื่อไม่ให้ถูกลบทั้งใบ
-- ถ้ามีคน **ลบสถานที่ออกจากคลัง** แถวแคชของมันจะกลายเป็น "คีย์ไม่ใช่ของคลัง" ทันที
-- · 🔴 **นั่นคือการละเมิดจริง ไม่ใช่แดงปลอม** — แคชถือข้อมูลของสถานที่ที่ไม่ได้สาธารณะแล้ว
-- · ✅ **ทางแก้คือลบแถวแคชนั้น ไม่ใช่ลบด่าน** — ข้อความ error เขียนบอกไว้ตรง ๆ
--
-- 📌 วัดก่อนลง: ทั้งสามตาราง **0 แถวหลุด** (หลัง purge ของ `20260902160000`) — ด่านนี้จึงเขียวตั้งแต่วันแรก
--    **และนั่นคือเหตุผลที่ต้องยิงทิศแดงพิสูจน์ ไม่ใช่ดูว่ามันเขียว**

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์ — ต้องเป็น plan-korea-platform/pmvxwcimjebogjfimzqy/dev'; end if;
end $guard$;

create or replace function app.assert_cache_keys_in_catalog() returns void
language plpgsql security invoker set search_path = '' as $fn$
declare n int; sample text;
begin
  -- ① place_details_cache · place_photo_cache — คีย์มีสองรูป ต้องรับทั้งคู่
  --    (บั๊ก 3 ก.ย. 2026: ประตูฝั่งอ่านกับ purge ต่างเทียบรูปเดียว → คีย์ `place_id:` ถูกกันทิ้ง/ถูกลบ)
  select count(*), min(d.maps_query) into n, sample from public.place_details_cache d
   where not exists (select 1 from public.catalog_places c where c.maps_query = d.maps_query)
     and not (d.maps_query like 'place_id:%' and exists (
       select 1 from public.catalog_places c where c.google_place_id = substring(d.maps_query from 10)));
  if n > 0 then
    raise exception 'place_details_cache มี % แถวที่คีย์ไม่ใช่ของคลัง (เช่น %) — '
      'ลบแถวนั้น ไม่ใช่ลบด่าน · ถ้าสถานที่ถูกถอนออกจากคลัง แคชของมันต้องถูกถอนด้วย', n, sample;
  end if;

  select count(*), min(p.maps_query) into n, sample from public.place_photo_cache p
   where not exists (select 1 from public.catalog_places c where c.maps_query = p.maps_query)
     and not (p.maps_query like 'place_id:%' and exists (
       select 1 from public.catalog_places c where c.google_place_id = substring(p.maps_query from 10)));
  if n > 0 then
    raise exception 'place_photo_cache มี % แถวที่คีย์ไม่ใช่ของคลัง (เช่น %) — ลบแถวนั้น ไม่ใช่ลบด่าน', n, sample;
  end if;

  -- ② travel_time_cache คีย์ด้วย `legacy_slug` สองฝั่ง — ต้องเป็นของคลังทั้งคู่
  select count(*), min(t.from_place_id || ' → ' || t.to_place_id) into n, sample
    from public.travel_time_cache t
   where not exists (select 1 from public.catalog_places c where c.legacy_slug = t.from_place_id)
      or not exists (select 1 from public.catalog_places c where c.legacy_slug = t.to_place_id);
  if n > 0 then
    raise exception 'travel_time_cache มี % แถวที่ปลายทางไม่ใช่ของคลัง (เช่น %) — ลบแถวนั้น ไม่ใช่ลบด่าน', n, sample;
  end if;

  -- 🔴 ③ ทิศบวก — กันเคสที่ผ่านเพราะ *ไม่มีอะไรให้ตรวจ*
  --    คลังว่าง → เงื่อนไขข้างบนจะเป็นจริงกับทุกแถว **แต่ถ้าแคชก็ว่างด้วย มันจะเขียวเงียบ ๆ**
  if not exists (select 1 from public.catalog_places where maps_query is not null or legacy_slug is not null) then
    raise exception 'catalog_places ไม่มีคีย์เลยสักแถว — ด่านนี้ผ่านเพราะไม่มีอะไรให้เทียบ ไม่ใช่เพราะสะอาด';
  end if;
end $fn$;

revoke all on function app.assert_cache_keys_in_catalog() from public;

-- ต่อเข้าตัวหลัก เพื่อให้ cron ที่เรียก `assert_cache_lockdown()` ได้ข้อนี้ไปด้วยโดยไม่ต้องรู้จักมัน
create or replace function app.assert_cache_lockdown() returns void
language plpgsql security invoker set search_path = '' as $fn$
declare
  locked     text[] := array['travel_time_cache','place_details_local_cache'];
  readable   text[] := array['place_details_cache','place_photo_cache'];
  all_caches text[] := array['travel_time_cache','place_details_local_cache',
                             'place_details_cache','place_photo_cache'];
  n int; r record; t text;
begin
  for r in
    select w.who, 'public.' || c.tbl as tbl
      from unnest(array['authenticated','anon']) w(who)
      cross join unnest(all_caches) c(tbl)
  loop
    if has_table_privilege(r.who, r.tbl, 'INSERT')
    or has_table_privilege(r.who, r.tbl, 'UPDATE')
    or has_table_privilege(r.who, r.tbl, 'DELETE')
    or has_table_privilege(r.who, r.tbl, 'TRUNCATE') then
      raise exception '🔴 % ได้สิทธิ์เขียนบน % — ก้าวที่ 1 ห้ามมีการเขียนฝั่งไคลเอนต์เลย', r.who, r.tbl;
    end if;
  end loop;

  foreach t in array locked loop
    if has_table_privilege('authenticated', 'public.' || t, 'SELECT')
    or has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception '🔴 % อ่านได้จากฝั่งไคลเอนต์ — ไฟล์ก่อนหน้าประกาศว่าไม่แตะใบนี้', t;
    end if;
  end loop;

  foreach t in array readable loop
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception '🔴 authenticated อ่าน % ไม่ได้ — route จะอ่านแคชไม่ได้เลย', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception '🔴 anon อ่าน % ได้ — ประตูเปิดกว้างกว่าที่ประกาศ', t;
    end if;
  end loop;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = any(all_caches);
  if n <> array_length(readable, 1) then
    raise exception 'คาด policy % ใบ (เท่าจำนวนใบที่เปิดอ่าน) ได้ % — grant กับ policy ต้องตรงกัน',
      array_length(readable, 1), n;
  end if;

  if exists (select 1 from public.place_details_cache)
     and exists (select 1 from public.catalog_places where google_place_id is not null) then
    select count(*) into n from public.catalog_places c
     where c.google_place_id is not null
       and exists (select 1 from public.place_details_cache d
                    where d.maps_query = 'place_id:' || c.google_place_id);
    if n = 0 then
      raise exception
        '🔴 แคชมีข้อมูล · คลังมี google_place_id · แต่ไม่เหลือแถวรูป place_id: ที่จับคู่ได้เลย — '
        'เงื่อนไขลบน่าจะกินคีย์รูปที่สองทิ้ง';
    end if;
  end if;

  -- 🔴 ⑥ **ใหม่** — ทุกแถวในแคชต้องมีคีย์ที่อยู่ในคลัง (`E3-AC6` ตรง ๆ)
  perform app.assert_cache_keys_in_catalog();

  raise notice 'cache lockdown: ผ่านครบ 6 ข้อ';
end $fn$;

revoke all on function app.assert_cache_lockdown() from public;
grant execute on function app.assert_cache_lockdown() to service_role;

do $run$ begin perform app.assert_cache_lockdown(); end $run$;

commit;
