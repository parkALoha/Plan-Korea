-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ `assert_cache_lockdown()` — ยุบรายชื่อตารางให้เหลือ *แหล่งเดียว* ในฟังก์ชัน ║
-- ║ P6 ชี้ · P1 แก้ · 3 ก.ย. 2026 · **ไม่เปลี่ยนพฤติกรรมสักข้อ**                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ## ปัญหาที่ P6 เจอตอนจะเขียนด่านเทียบ
-- ฉบับ `20260903140000` มีรายชื่อ **4 ตารางซ้ำกันเองสองจุดในไฟล์เดียว**:
-- ```
-- ข้อ ①  array['public.place_details_cache', … 4 ใบ]      ← มี prefix `public.`
-- ข้อ ④  tablename in ('place_details_cache', … 4 ใบ)     ← ไม่มี prefix · **คนละสำเนา**
-- ```
-- 🎯 **สองสำเนานี้ดริฟต์จากกันได้** — เพิ่มตารางแคชใบที่ห้าแล้วแก้จุดเดียว
--    → ข้อ ① กันการเขียนได้ · ข้อ ④ นับ policy ไม่ครบ **แล้วไม่มีอะไรบอก**
-- · ⚠️ **นี่คือทะเบียนสองใบในไฟล์เดียว** — รูปเดียวกับที่ทีมไล่ปิดกันทั้งวัน แค่เล็กกว่าและอยู่ในโค้ดของผมเอง
-- · 📌 P6 เจอตอนหาเป้าให้ regex ของด่านเทียบ — **เขาไม่ได้ตั้งใจหาบั๊กนี้ มันโผล่มาเพราะเขาต้องอ่านฟังก์ชันจริง**
--
-- ## สิ่งที่ทำ
-- ประกาศ `locked` / `readable` ครั้งเดียวที่หัวฟังก์ชัน แล้วใช้ทุกที่ · `all_caches := locked || readable`
-- 🔴 **ไม่เปลี่ยนเกณฑ์ข้อไหนเลย** — ทั้ง 5 ข้อถามคำถามเดิมทุกตัวอักษร · พิสูจน์ด้วยการยิงสองทิศหลังลง
-- · ✅ **ผลพลอยได้ที่ P6 ต้องการ: เป้าของ regex เหลือ *สองบรรทัด* ที่ตั้งชื่อชัด** แทนที่จะกระจายสี่จุด

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
declare
  -- 🔴 **แหล่งเดียวของรายชื่อตาราง — ทุกข้อข้างล่างอ่านจากสองบรรทัดนี้เท่านั้น**
  --    (`.github/no-policy-tables` และ `.github/cache-client-privileges` ถือรายชื่อเดียวกันฝั่งไฟล์
  --     · ด่านเทียบของ P6 จะยืนยันว่าสองฝั่งพูดตรงกัน — ไม่มีใครประกาศค่าใหม่)
  locked     text[] := array['travel_time_cache','place_details_local_cache'];
  readable   text[] := array['place_details_cache','place_photo_cache'];
  all_caches text[] := array['travel_time_cache','place_details_local_cache',
                             'place_details_cache','place_photo_cache'];
  n int; r record; t text;
begin
  -- ① ฝั่งไคลเอนต์ห้ามมีสิทธิ์เขียนบนแคชใบไหนเลย
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

  -- ② ใบที่ประกาศว่า "ไม่แตะ" ต้องอ่านไม่ได้เลย
  foreach t in array locked loop
    if has_table_privilege('authenticated', 'public.' || t, 'SELECT')
    or has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception '🔴 % อ่านได้จากฝั่งไคลเอนต์ — ไฟล์ก่อนหน้าประกาศว่าไม่แตะใบนี้', t;
    end if;
  end loop;

  -- ③ ใบที่เปิดอ่าน ต้องเปิดให้ `authenticated` เท่านั้น ไม่ใช่ `anon`
  foreach t in array readable loop
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception '🔴 authenticated อ่าน % ไม่ได้ — route จะอ่านแคชไม่ได้เลย', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception '🔴 anon อ่าน % ได้ — ประตูเปิดกว้างกว่าที่ประกาศ', t;
    end if;
  end loop;

  -- ④ policy ต้องมีเท่าจำนวนใบที่เปิดอ่าน — **นับจาก `readable` ไม่ใช่เลขที่พิมพ์ไว้**
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = any(all_caches);
  if n <> array_length(readable, 1) then
    raise exception 'คาด policy % ใบ (เท่าจำนวนใบที่เปิดอ่าน) ได้ % — grant กับ policy ต้องตรงกัน',
      array_length(readable, 1), n;
  end if;

  -- ⑤ ตัวควบคุมฝั่งบวก — บังคับเฉพาะเมื่อแคชมีข้อมูลอยู่จริง (เหตุผลเต็มใน 20260903140000)
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
grant execute on function app.assert_cache_lockdown() to service_role;   -- ข้อยกเว้นที่ 7

do $run$ begin perform app.assert_cache_lockdown(); end $run$;

commit;
