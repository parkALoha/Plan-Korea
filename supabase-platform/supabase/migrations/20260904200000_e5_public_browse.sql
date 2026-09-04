-- ════════════════════════════════════════════════════════════════════════════
-- E5 — เปิดให้ **คนที่ยังไม่ล็อกอิน** ดูหน้าแรกได้ · ข้อยกเว้นที่ 9 (`anon`)
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้สั่งเอง · P4 ค้านร่างแรกและร่างนี้คือของเขา
-- ════════════════════════════════════════════════════════════════════════════
-- > *"คนที่ไม่ได้ล็อกอิน ควรจะเข้าหน้าแรกได้นะ มาดูหน้าตาเว็บก่อน ลองดู คลิกนู้นนี่
-- >  ดูทริปแนะนำได้ **แต่สร้างทริปไม่ได้** ถ้าจะสร้างทริป หรือช่วยเพื่อนทำ ค่อยต้องล็อกอิน"*
--
-- ## 🔴 ร่างแรกของผมคือ `grant select on catalog_countries, catalog_cities to anon` — **P4 ค้าน และถูก**
-- ```
-- anon key เป็น NEXT_PUBLIC_  ⇒ อยู่ใน JS bundle ⇒ ใครก็อ่านได้
-- ⇒ grant ตาราง ให้ anon = **ตารางนั้นอยู่บนอินเทอร์เน็ตสาธารณะ ยิงตรงผ่าน PostgREST ได้**
--    ไม่ผ่าน route ของเรา · ไม่ผ่าน `rateLimitGuard` · เลือกคอลัมน์เอง · ขอกี่แถวก็ได้
-- ```
-- 🎯 ***ผมคิดว่ากำลังตอบ "ใครเห็นหน้าเว็บได้" — ของจริงผมกำลังตอบ "ใครยิง PostgREST ได้"***
-- 🔴 **และมันยกเลิกเหตุผลที่เราปิดมันไว้แต่แรกพอดี** — ทะเบียนพื้นผิวของ P4 บันทึกไว้เองว่า
--    *"บังคับล็อกอิน **เพื่อไม่ให้คลังถูกดูดออกไปทั้งใบ** ไม่ใช่เพราะข้อมูลเป็นความลับ"*
--    ⇒ ผมยกครึ่งหลังมาใช้เป็นใบอนุญาต ทั้งที่ครึ่งแรกคือเหตุผลของมาตรการ
--
-- ## ✅ รูปที่ใช้แทน — **definer RPC ใบเดียว ไม่ใช่ `grant` ตาราง**
-- ```
-- ① คอลัมน์ตายตัว      คนนอกเลือกคอลัมน์เองไม่ได้
-- ② เพดานแถวอยู่ในตัวฟังก์ชัน  ไม่มี `offset`/`limit` อิสระให้ไล่ดูดทีละหน้า
-- ③ อยู่ในทะเบียน definer  ⇒ **ใบที่สองต้องผ่านสายตาเหมือนใบแรก** (`cda8131` ของ P4)
-- ```
-- 🎯 ***รูปเดียวกับที่ `…180000` เลือกไว้แล้วสำหรับ `trips` — ที่นั่นเราปฏิเสธ policy อ่าน
--    แล้วให้เนื้อออกทาง RPC · ที่นี่ใช้รูปเดิมกับคลัง***
-- · 🔴 **ผมเดินกลับไปทาง `grant` ตรงในข้อความเดียวกับที่ชมตัวเองว่าเลือก RPC ถูก** — P4 เป็นคนจับ
--
-- ## ⚠️ ราคาที่จ่ายและต้องรู้ว่าจ่าย
-- `security definer` + `grant execute to anon` ⇒ **ใครก็ตามบนอินเทอร์เน็ตเรียกได้ ไม่จำกัดจำนวนครั้ง**
-- (`rateLimitGuard` อยู่ใน route — คนที่ยิง PostgREST ตรงไม่ผ่านมัน)
-- ⇒ **ให้เฉพาะของที่เรายอมให้ถูกอ่านซ้ำไม่จำกัด** · ที่นี่คือ **ชื่อประเทศ 9 · ชื่อเมือง 78 · ตัวอย่าง 3 ชื่อ/ประเทศ**
-- 🔴 **`catalog_places` (2,396 แห่ง) ไม่อยู่ในนี้ และห้ามเพิ่มเข้ามาโดยไม่มีการตัดสินใจใหม่**

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
-- 1. ปลายทางสาธารณะ — ประเทศ + จำนวนเมือง + ชื่อเมืองตัวอย่าง
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **คืนชื่อเมืองตัวอย่างแค่ 3 ชื่อ ไม่ใช่ทั้งหมด — โดยตั้งใจ**
--    การ์ด "ไปไหนดี?" แสดง 3 ชื่อ ⇒ คืนมากกว่านั้น = ให้ของที่ไม่มีใครใช้ **แต่ถูกดูดได้**
-- ⚠️ `order by c.created_at` — คลัง seed เมืองหลักก่อน ⇒ 3 ชื่อแรกมัก *เป็น* เมืองหลัก
--    **โดยผลข้างเคียง ไม่ใช่โดยการวัด** · 🔴 ห้ามเรียกว่า "เมืองยอดนิยม" ที่ไหน เราไม่มีข้อมูลนั้น
create or replace function public.list_public_destinations()
returns table (
  id            text,
  name_th       text,
  name_en       text,
  city_count    int,
  sample_cities jsonb
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    co.id,
    co.name_th,
    co.name_en,
    (select count(*)::int from public.catalog_cities ci where ci.country_id = co.id) as city_count,
    coalesce(
      (select jsonb_agg(x.name_th order by x.created_at)
         from (select ci.name_th, ci.created_at
                 from public.catalog_cities ci
                where ci.country_id = co.id
                order by ci.created_at
                limit 3) x),
      '[]'::jsonb) as sample_cities
  from public.catalog_countries co
  where co.supported = true
  order by co.name_th;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. เมืองของประเทศเดียว — ขั้นที่สองของ "ไปไหนดี?"
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **เพดาน 100 อยู่ในตัวฟังก์ชัน ไม่ใช่พารามิเตอร์** — ผู้เรียกกำหนดเองไม่ได้
--    ⇒ ไม่มี `offset` ⇒ **ไล่ดูดทีละหน้าไม่ได้** · ประเทศที่มากสุดวันนี้คือญี่ปุ่น 23 เมือง
--    ⚠️ วันที่ประเทศไหนเกิน 100 **ของจะหายเงียบ** — ตัวเรียกต้องเทียบกับ `city_count` จากข้อ 1 แล้วบอกผู้ใช้
create or replace function public.list_public_cities(p_country_id text)
returns table (
  id      uuid,
  name_th text,
  name_en text,
  slug    text
)
language sql
security definer
stable
set search_path = ''
as $$
  select ci.id, ci.name_th, ci.name_en, ci.legacy_slug
    from public.catalog_cities ci
    join public.catalog_countries co on co.id = ci.country_id and co.supported = true
   where ci.country_id = p_country_id
   order by ci.created_at
   limit 100;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. สิทธิ์
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public.list_public_destinations()      from public, anon, authenticated;
revoke all on function public.list_public_cities(text)         from public, anon, authenticated;
grant execute on function public.list_public_destinations()    to anon, authenticated;
grant execute on function public.list_public_cities(text)      to anon, authenticated;

-- 🔴 **ทริปแนะนำ — เปิดให้ `anon` เห็น** ตามที่ผู้ใช้สั่ง (*"ดูทริปแนะนำได้"*)
--    `…180000` เขียนไว้เองว่า *"วันที่มีหน้า landing ให้เพิ่ม `anon` เฉพาะ `list_…` ตัวเดียว"* — วันนี้คือวันนั้น
--    🔴 **`copy_trip_template` ไม่ให้ `anon` เด็ดขาด** — มันเขียน และ `auth.uid()` จะเป็น null
grant execute on function public.list_trip_templates() to anon;

do $assert$
begin
  -- ✅ ฝั่งบวก
  if not has_function_privilege('anon', 'public.list_public_destinations()', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก list_public_destinations ไม่ได้';
  end if;
  if not has_function_privilege('anon', 'public.list_public_cities(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก list_public_cities ไม่ได้';
  end if;
  if not has_function_privilege('anon', 'public.list_trip_templates()', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก list_trip_templates ไม่ได้';
  end if;

  -- 🔴 เคสควบคุม ① — **`anon` ต้องยังเขียนอะไรไม่ได้เลย** (คำสั่งผู้ใช้: "สร้างทริปไม่ได้")
  if has_function_privilege('anon', 'public.copy_trip_template(uuid, date, text)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon ก๊อปทริปแนะนำได้ — ใบนี้ไปเปิดทางเขียนให้คนนอก';
  end if;
  if has_function_privilege('anon', 'public.create_trip(text, date, date, text)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon สร้างทริปได้';
  end if;

  -- 🔴 เคสควบคุม ② — **ห้ามเปิด *ตาราง* ให้ anon** · ทั้งใบนี้ต้องเป็น RPC ล้วน
  --    ไม่มีข้อนี้ `grant select on catalog_cities to anon` ก็ผ่าน assert ข้างบนครบเหมือนกันเป๊ะ
  --    🎯 และนั่นคือร่างแรกที่ P4 ค้าน — เคสนี้ทำให้ร่างนั้น *แดง* แทนที่จะ *ผ่าน*
  if has_table_privilege('anon', 'public.catalog_cities', 'SELECT')
     or has_table_privilege('anon', 'public.catalog_countries', 'SELECT')
     or has_table_privilege('anon', 'public.catalog_places', 'SELECT')
     or has_table_privilege('anon', 'public.trips', 'SELECT') then
    raise exception 'assert ล้ม: anon อ่านตารางตรงได้ — ใบนี้ต้องเปิดผ่าน RPC เท่านั้น';
  end if;
end $assert$;

commit;
