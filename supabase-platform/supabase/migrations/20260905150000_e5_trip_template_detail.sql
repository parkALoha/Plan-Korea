-- ═══════════════════════════════════════════════════════════════════════════
-- E5 — อ่าน "เนื้อ" ของทริปแนะนำได้ (หน้าพรีวิวก่อนกดสร้าง)
-- เจ้าของ: P1-Lead · 5 ก.ย. 2026 · ผู้ใช้ตัดสิน flow เอง
-- ═══════════════════════════════════════════════════════════════════════════
-- > *"เมื่อกดจะบอกรายละเอียดของทริปทั้งหมด **แต่ละวันไปไหนบ้าง** และมีปุ่มให้กดสร้างทริป"*
--
-- ## 🔴 ใบนี้กลับคำที่ `20260904180000` เขียนไว้ — พูดให้ตรง ไม่ใช่เลี่ยง
-- ไฟล์นั้นเขียนว่า ***"ไม่มีเส้นทางไหนที่ *อ่าน* จุดแวะของ template ออกมาเป็นข้อมูลได้เลย"***
-- และนั่นเป็นการตัดสินใจที่มีเหตุผลจริง ไม่ใช่ของที่ลืม · **วันนี้ผู้ใช้สั่ง flow ที่ต้องอ่าน**
-- 🎯 ***สิ่งที่ไฟล์นั้นกลัวคือ "ประตูอ่านทริป ที่มีเงื่อนไขเป็นคอลัมน์ที่เราตั้งเอง" — และข้อนั้นยังจริงอยู่***
--    ⇒ ใบนี้จึง **ไม่แก้สิ่งที่มันกลัว มันจ่ายราคานั้นอย่างเปิดเผยแทน** · สิ่งที่ *ไม่* เปลี่ยน:
--    ❌ **ไม่เพิ่ม policy ให้ใครอ่าน `trips` ของคนอื่นแม้แต่บรรทัดเดียว** — `trips_select` เหมือนเดิมทุกตัวอักษร
--    ❌ **ไม่ `grant select` บนตารางใดให้ `anon`/`authenticated` เพิ่ม**
--    ✅ เนื้อออกทาง definer ใบเดียว ที่มี `published_template_at is not null` เป็นด่านทั้งหมด
--
-- ## 🔴 ราคาที่เปลี่ยนไปจริง — ต้องเขียนไว้ ไม่ใช่ปล่อยให้คนอ่านทีหลังคิดว่าเท่าเดิม
-- ```
-- ก่อนใบนี้   ธงติดผิดใบ → มีคนก๊อปแผนที่ไม่ได้ตั้งใจเผยแพร่  (ต้องกดก๊อป · ได้ทริปในบัญชีตัวเอง)
-- หลังใบนี้   ธงติดผิดใบ → **อ่านแผนนั้นได้ทันทีโดยไม่ต้องกดอะไร และคนยังไม่ล็อกอินก็อ่านได้**
-- ```
-- ⇒ ***ราคาของการติดธงผิด เปลี่ยนจาก "มีคนก๊อป" เป็น "เห็นทั้งแผน" — คนละขนาด***
-- ✅ สิ่งที่ยังกันอยู่: ติดธงได้เฉพาะ `service_role` (`§3.5` ข้อ 8 · ไคลเอนต์ตั้งเองไม่ได้ · assert บังคับสองทิศ)
--    ⇒ **ไม่มีเส้นทางไหนที่ผู้ใช้ทำให้ทริปตัวเองหรือของคนอื่นกลายเป็น template ได้**
--
-- ## รูปที่คืน — **แบน ไม่ใช่ `jsonb` ซ้อน และนั่นเป็นการตัดสินใจเรื่องด่าน ไม่ใช่รสนิยม**
-- `schemaPins.test.ts` ปักหมุด **ชุดคอลัมน์ที่ไหลออกไปหา `anon`** จาก `returns table (…)`
-- และเขียนขอบเขตของตัวเองไว้ว่า *"ฟังก์ชันที่คืน `jsonb` ซึ่งประกอบจากทั้งแถว **จะรั่วโดยที่ชุดคอลัมน์ไม่ขยับเลย**"*
-- 🎯 ***คืน `jsonb` = เขียนฟังก์ชันที่เดินผ่านด่านที่เพิ่งสร้างมาเพื่อเรื่องนี้พอดี***
--    ⇒ เลือก `returns table` แบน (หนึ่งแถวต่อหนึ่งจุดแวะ) **ให้ด่านนั้นมองเห็นทุกคอลัมน์ที่ออกไป**
--    · ราคาที่จ่าย: หัวทริป (`title`/`day_count`/`night_count`) ซ้ำทุกแถว — ~28 แถว/ทริป **รับได้**
--    · วันที่แผนโตจนซ้ำแล้วแพง **ให้แยกเป็น RPC หัว + RPC แถว ไม่ใช่ยุบเป็น `jsonb`**
--
-- ## ⚠️ วันที่ของ template ไม่ถูกส่งออกไปเลย — ตั้งใจ
-- มันเป็นแค่หมุดให้ระยะห่างถูก (`20260905140000`) · ส่งออกไปจะมีคนเอาไปแสดง แล้วผู้ใช้จะเห็น
-- *"ทริปนี้เริ่ม 1 ม.ค. 2026"* ซึ่งไม่จริงสำหรับเขา ⇒ คืน **ลำดับวัน (`day_number`)** แทน
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
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;
end $guard$;

create or replace function public.get_trip_template(p_template_id uuid)
returns table (
  title                  text,
  day_count              int,
  night_count            int,
  day_number             int,
  day_city_slug          text,
  day_city_name_th       text,
  day_country_id         text,
  overnight_city_name_th text,
  stop_rank              text,
  place_slug             text,
  place_name_th          text,
  place_name_en          text,
  place_category         text,
  dwell_minutes          int
)
language sql
security definer
stable
set search_path = ''
as $$
  with tpl as (
    -- 🔴 **สามเงื่อนไขนี้คือด่านทั้งหมดของฟังก์ชันนี้** — `security definer` ข้าม RLS ทั้งหมด
    --    ถอดบรรทัดไหนออก = เปิดให้อ่านทริปของใครก็ได้ · **แก้ตรงนี้ต้องอ่านหัวไฟล์ก่อน**
    select t.id, t.title, t.start_date, t.end_date
      from public.trips t
     where t.id = p_template_id
       and t.published_template_at is not null
       and t.deleted_at is null
  ),
  d as (
    -- ⚠️ `row_number()` ไม่ใช่ `date - start_date` — ทริปที่ถูกแก้ผ่านหน้าเว็บอาจมีวันขาดหาย
    --    ลำดับที่ผู้ใช้เห็นควรเป็น 1,2,3,… ต่อเนื่องเสมอ ไม่ใช่ 1,2,4
    select td.id, td.city_id, td.overnight_city_id,
           (row_number() over (order by td.date))::int as day_number
      from public.trip_days td
      join tpl on tpl.id = td.trip_id
  )
  select
    tpl.title,
    (tpl.end_date - tpl.start_date + 1)::int,
    greatest((tpl.end_date - tpl.start_date)::int, 0),
    d.day_number,
    c.legacy_slug,
    c.name_th,
    c.country_id,
    ov.name_th,
    s.rank,
    p.legacy_slug,
    nm.th,
    nm.en,
    p.category,
    s.dwell_minutes
  from tpl
  join d on true
  left join public.catalog_cities c  on c.id = d.city_id
  left join public.catalog_cities ov on ov.id = d.overnight_city_id
  -- แผนที่ใช้ = แผนที่ active · ไม่มี active ⇒ ไม่มีจุดแวะออกไป (วันจะยังโผล่ แต่ว่าง)
  left join public.trip_plans pl on pl.trip_id = tpl.id and pl.is_active
  -- 🔴 `left join` ทั้งสาย: **วันที่ไม่มีจุดแวะต้องยังคืนออกไป** ไม่งั้นหน้าพรีวิวจะข้ามวันนั้นเงียบ ๆ
  --    แล้ว "5 วัน" ที่การ์ดบอก จะไม่ตรงกับจำนวนวันที่หน้าพรีวิวแสดง — ผู้ใช้เห็นสองตัวเลขที่ขัดกัน
  left join public.trip_stops s
         on s.trip_day_id = d.id and s.plan_id = pl.id and s.deleted_at is null
  left join public.catalog_places p on p.id = s.catalog_place_id
  left join lateral (
    -- ชื่อที่ผู้ใช้อ่าน — ไทยก่อน แล้วอังกฤษ · `priority` ต่ำสุดคือชื่อหลัก (`D77`)
    -- ⚠️ **ไม่ fallback ไปที่ `legacy_slug`** — `place_slug` ส่งแยกไปแล้ว ให้ฝั่งเรียกตัดสินเองว่า
    --    จะแสดงอะไรเมื่อชื่อว่าง · ยัดสลักลงช่องชื่อจะทำให้ *"ไม่มีชื่อ"* แยกไม่ออกจาก *"ชื่อคือสลัก"*
    select
      (select n.name from public.catalog_place_names n
        where n.place_id = p.id and n.locale = 'th' order by n.priority limit 1) as th,
      (select n.name from public.catalog_place_names n
        where n.place_id = p.id and n.locale = 'en' order by n.priority limit 1) as en
  ) nm on true
  order by d.day_number, s.rank
$$;

comment on function public.get_trip_template(uuid) is
  'เนื้อของทริปแนะนำใบหนึ่ง (หนึ่งแถวต่อหนึ่งจุดแวะ · วันว่างคืนแถวที่ stop เป็น null) '
  '🔴 ด่านทั้งหมดคือ where ใน CTE `tpl` — definer ข้าม RLS · ห้ามถอด published_template_at';

-- ── สิทธิ์ — `anon` ดูได้ (การ์ดอยู่บนหน้าแรกของคนยังไม่ล็อกอิน) · เขียนยังปิดเหมือนเดิม ──
revoke all on function public.get_trip_template(uuid) from public, anon, authenticated;
grant execute on function public.get_trip_template(uuid) to anon, authenticated;

do $assert$
declare v_bad uuid;
begin
  -- ✅ ฝั่งบวก
  if not has_function_privilege('anon', 'public.get_trip_template(uuid)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก get_trip_template ไม่ได้';
  end if;
  if not has_function_privilege('authenticated', 'public.get_trip_template(uuid)', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก get_trip_template ไม่ได้';
  end if;

  -- 🔴 เคสควบคุม ① — **ทริปที่ *ไม่ใช่* template ต้องคืน 0 แถว**
  --    นี่คือเคสที่ทำให้ `where` ในฟังก์ชันมีความหมาย · ถอดบรรทัดนั้นออกแล้วเคสนี้แดง
  --    ⚠️ ทิศบวกของเคสนี้: ต้องมีทริปที่ไม่ใช่ template อยู่จริงในฐาน ไม่งั้นมันผ่านฟรี
  --       ⇒ ไม่มี = `raise notice` ไม่ใช่ผ่านเงียบ (เคสที่ล้มไม่ได้ อ่านเหมือนเคสที่ผ่าน)
  select t.id into v_bad
    from public.trips t
   where t.published_template_at is null and t.deleted_at is null
   limit 1;
  if v_bad is null then
    raise notice 'ข้ามเคสควบคุม ①: ไม่มีทริปที่ไม่ใช่ template ในฐานนี้ ⇒ ยังไม่ได้พิสูจน์ว่า where ทำงาน';
  elsif exists (select 1 from public.get_trip_template(v_bad)) then
    raise exception 'assert ล้ม: อ่านทริปที่ไม่ใช่ทริปแนะนำได้ — where ในฟังก์ชันไม่ทำงาน';
  end if;

  -- 🔴 เคสควบคุม ② — **ห้ามเปิดตารางให้ `anon` เพิ่ม** · ใบนี้ต้องเป็น RPC ล้วน
  --    ไม่มีข้อนี้ `grant select on trips to anon` ก็ผ่าน assert ข้างบนครบเหมือนกันเป๊ะ
  if has_table_privilege('anon', 'public.trips', 'SELECT')
     or has_table_privilege('anon', 'public.trip_days', 'SELECT')
     or has_table_privilege('anon', 'public.trip_stops', 'SELECT') then
    raise exception 'assert ล้ม: anon อ่านตารางทริปตรงได้ — ใบนี้ต้องเปิดผ่าน RPC เท่านั้น';
  end if;

  -- 🔴 เคสควบคุม ③ — **ทิศกลับ: ของเดิมต้องไม่พัง**
  --    `authenticated` ต้องยังมี `select` บน `trips` (RLS เป็นตัวกรองแถว ไม่ใช่ grant)
  --    ⇒ ถ้าใบนี้เผลอไป `revoke` อะไรเกิน เคสนี้แดง · ไม่มีข้อนี้ = "ปลอดภัยขึ้น" แยกไม่ออกจาก "พัง"
  if not has_table_privilege('authenticated', 'public.trips', 'SELECT') then
    raise exception 'assert ล้ม: authenticated อ่าน trips ไม่ได้แล้ว — ใบนี้ไปถอนสิทธิ์ของเดิม';
  end if;

  -- 🔴 เคสควบคุม ④ — **`anon` ยังก๊อปไม่ได้** (ผู้ใช้สั่ง: *ดูได้ แต่สร้างทริปไม่ได้*)
  if has_function_privilege('anon', 'public.copy_trip_template(uuid, date, text)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon ก๊อปทริปแนะนำได้ — ใบนี้ไปเปิดทางเขียนให้คนนอก';
  end if;
end $assert$;

commit;
