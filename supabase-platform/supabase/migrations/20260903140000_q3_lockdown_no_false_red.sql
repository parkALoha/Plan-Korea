-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ `app.assert_cache_lockdown()` ข้อ ⑤ จะ **บล็อก `E9` ทั้งเฟส** — แก้ก่อนถึงตรงนั้น ║
-- ║ P1 · 3 ก.ย. 2026 · เจอตอนไปตรวจข้อทักของ P4 แล้วพบว่า *ข้อทักผิด แต่ปัญหาจริง* ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ## ลำดับบนโปรเจกต์ใหม่ (`E9`) — นี่คือสิ่งที่จะเกิดจริง
-- ```
-- 20260902090000  update catalog_places set google_place_id  →  คลังมี gid **3 แถว**
-- 20260902160000  purge แคช                                   →  แคชยังว่าง (0 migration ใส่ข้อมูลแคช)
-- 20260903120000  assert_cache_lockdown() ข้อ ⑤               →  🔴 **RAISE — แดงปลอม**
-- (ข้อมูลแคชมาทีหลัง จากสคริปต์ `e7/06_caches.sql` ซึ่งไม่ใช่ migration)
-- ```
-- 🎯 **ข้อ ⑤ ถามว่า *"คลังมี gid แต่แคชไม่มีคู่เลย = เงื่อนไขลบกินคีย์รูปที่สองทิ้ง"*
--    ซึ่งเป็นจริงตอนบั๊ก **และเป็นจริงตอนแคชว่างโดยชอบธรรมด้วย** — สองสภาพให้ผลเหมือนกัน**
--
-- ## ✅ ตัวแยกที่ขาดไป: **แคชต้องไม่ว่าง** ถึงจะบังคับข้อนี้ได้
-- ```
-- บั๊กเดิม        แคชเหลือแถวข้อความล้วน 30+ แถว · place_id: เหลือ 0   → ยัง RAISE ✅
-- โปรเจกต์ใหม่    แคชว่างทั้งตาราง                                     → ไม่ RAISE ✅
-- ```
-- 📌 **ยิงพิสูจน์ทั้งสองทิศในสนามซ้อมก่อนเขียนไฟล์นี้ ไม่ได้ให้เหตุผลลอย ๆ**
--
-- ## 🔴 ที่มาของการเจอ — จดไว้เพราะกลไกสำคัญกว่าตัวบั๊ก
-- P4 ทักว่าข้อ ⑤ อาจแดงปลอม แล้ว**ไปวัดเองแล้วถอนข้อทัก** โดยรายงานว่า
-- *"ไฟล์ seed ของ `catalog_places` 6 ไฟล์ · `google_place_id` = 0 ทุกไฟล์"*
-- · 🔴 **การวัดนั้นผิด** — `20260902090000` เติม gid ด้วย **`update`** ไม่ใช่ `insert`
--   เขาค้นเฉพาะไฟล์ที่ `insert into catalog_places` **รูปที่สองจึงหลุดทั้งใบ**
-- 🎯 ***ข้อทักที่ถูกถอนด้วยการวัดที่ผิด อันตรายกว่าข้อทักที่ไม่เคยถูกส่ง*** —
--    เพราะมันมาพร้อมหลักฐาน และอีกฝ่าย (ผม) เพิ่งได้รับคำชมในย่อหน้าเดียวกัน
-- · ✅ **สิ่งที่กันไว้: ผมวัดซ้ำเองแทนที่จะรับคำถอน** — ได้ `7 ไฟล์ · 1 ไฟล์แตะ gid` ไม่ตรงกับเขา แล้วจึงไล่ต่อ

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์ — ต้องเป็น plan-korea-platform/pmvxwcimjebogjfimzqy/dev'; end if;
end $guard$;

create or replace function app.assert_cache_lockdown() returns void
language plpgsql security invoker set search_path = '' as $fn$
declare n int; r record;
begin
  -- ① ฝั่งไคลเอนต์ห้ามมีสิทธิ์เขียนบนแคชใบไหนเลย
  for r in
    select w.who, t.tbl from unnest(array['authenticated','anon']) w(who)
    cross join unnest(array['public.place_details_cache','public.place_photo_cache',
                            'public.travel_time_cache','public.place_details_local_cache']) t(tbl)
  loop
    if has_table_privilege(r.who, r.tbl, 'INSERT')
    or has_table_privilege(r.who, r.tbl, 'UPDATE')
    or has_table_privilege(r.who, r.tbl, 'DELETE')
    or has_table_privilege(r.who, r.tbl, 'TRUNCATE') then
      raise exception '🔴 % ได้สิทธิ์เขียนบน % — ก้าวที่ 1 ห้ามมีการเขียนฝั่งไคลเอนต์เลย', r.who, r.tbl;
    end if;
  end loop;

  -- ② สองใบที่ประกาศว่า "ไม่แตะ" ต้องอ่านไม่ได้เลย
  if has_table_privilege('authenticated','public.travel_time_cache','SELECT')
  or has_table_privilege('anon','public.travel_time_cache','SELECT')
  or has_table_privilege('authenticated','public.place_details_local_cache','SELECT')
  or has_table_privilege('anon','public.place_details_local_cache','SELECT') then
    raise exception '🔴 travel_time_cache / place_details_local_cache อ่านได้จากฝั่งไคลเอนต์';
  end if;

  -- ③ สองใบที่เปิดอ่าน ต้องเปิดให้ `authenticated` เท่านั้น ไม่ใช่ `anon`
  if not has_table_privilege('authenticated','public.place_details_cache','SELECT')
  or not has_table_privilege('authenticated','public.place_photo_cache','SELECT') then
    raise exception '🔴 authenticated อ่านแคชไม่ได้ — route จะอ่านแคชไม่ได้เลย';
  end if;
  if has_table_privilege('anon','public.place_details_cache','SELECT')
  or has_table_privilege('anon','public.place_photo_cache','SELECT') then
    raise exception '🔴 anon อ่านแคชได้ — ประตูเปิดกว้างกว่าที่ประกาศ';
  end if;

  -- ④ policy ต้องมี 2 ใบ
  select count(*) into n from pg_policies where schemaname='public'
    and tablename in ('place_details_cache','place_photo_cache','travel_time_cache','place_details_local_cache');
  if n <> 2 then raise exception 'คาด policy 2 ใบ ได้ % — grant กับ policy ต้องตรงกัน', n; end if;

  -- 🔴 ⑤ ตัวควบคุมฝั่งบวก — **บังคับเฉพาะเมื่อแคชมีข้อมูลอยู่จริง**
  --    หัวไฟล์นี้อธิบายว่าทำไมเงื่อนไข "แคชต้องไม่ว่าง" เป็นตัวแยกที่ขาดไม่ได้
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
  raise notice 'cache lockdown: ผ่านครบ 5 ข้อ';
end $fn$;

revoke all on function app.assert_cache_lockdown() from public;

do $run$ begin perform app.assert_cache_lockdown(); end $run$;

commit;
