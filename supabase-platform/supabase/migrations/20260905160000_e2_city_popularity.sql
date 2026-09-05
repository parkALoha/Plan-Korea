-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — เรียงเมืองตามความนิยมของคนไทย แทนการเรียงตามตัวอักษร
-- เจ้าของ: P1-Lead · 5 ก.ย. 2026 · ผู้ใช้สั่งเอง
-- ═══════════════════════════════════════════════════════════════════════════
-- > *"เมืองของแต่ละประเทศ ควรเรียงจากเมืองยอดฮิต ลองหาข้อมูลมา"*
--
-- ## 🔴 อาการที่ผู้ใช้เห็น และสิ่งที่มันเปิดเผยเกี่ยวกับโค้ดเรา
-- หน้า `/explore/kr` เรียงว่า **คยองจู · คังนึง · คาพย็อง · ช็อนจู · ชุนช็อน · เชจู · ซกโช · ซูวอน · โซล …**
-- ⇒ *โซล* อยู่อันดับ **9** · *ปูซาน* อันดับ **11** — เพราะเรียงตามพยัญชนะไทย
-- 🔴 **และมีตัวเรียงสองใบที่ตอบคำถามเดียวกันคนละคำตอบ** (เจอตอนไล่หาว่าเรียงที่ไหน):
-- ```
-- lib/engine/db.ts:529          .order("name_th")        ← ที่ผู้ใช้เห็น (route /api/engine/cities)
-- list_public_cities()          order by ci.created_at   ← เส้นของคนยังไม่ล็อกอิน
-- ```
-- 🎯 ***ไม่มีใบไหนตอบว่า "เมืองไหนคนไปมากกว่ากัน" — และทั้งสองใบก็ไม่ตรงกันเองด้วย***
--    ⇒ ใบนี้ทำให้มี **คำตอบเดียว เก็บที่เดียว** แล้วให้ทั้งสองเส้นอ่านจากที่เดียวกัน
--
-- ## 🔴 ที่มาของลำดับ — และข้อจำกัดที่ต้องอ่านก่อนเชื่อตัวเลข
-- ถาม Gemini (Flash-Lite · 5 ก.ย. 2026 · ผ่าน Chrome ของผู้ใช้เอง ตามที่เขาสั่ง)
-- โดยส่ง **รายชื่อ slug จริงทั้ง 78 เมืองไปให้เรียง** และห้ามเพิ่ม/ตัดเมือง
-- ✅ ตรวจแล้ว: คืนครบทุกประเทศ **ไม่มีเมืองเกิน ไม่มีเมืองขาด ไม่มีชื่อซ้ำ** (23/15/10/7/7/13)
--
-- 🔴 **แต่มันคือการประมาณของโมเดล ไม่ใช่ตัวเลขที่วัดมา** — Gemini อ้างว่าใช้
-- *"สถิติเที่ยวบินตรง · การค้นหาที่พักบน Agoda/Traveloka · เส้นทางทัวร์หลัก 2024-2026"*
-- **ผมตรวจสอบคำอ้างนั้นไม่ได้จากที่นั่งนี้ และไม่ได้แกล้งว่าตรวจแล้ว**
-- 🎯 ***จดไว้เพราะเลขที่อยู่ในตารางฐาน จะถูกอ่านเป็นข้อเท็จจริงในเดือนหน้า ถ้าไม่มีใครเขียนที่มาไว้***
-- · ⚠️ ที่ผมเห็นเองว่าน่าสงสัย และ **จงใจไม่แก้** เพราะจะกลายเป็นความเห็นผมทับความเห็นโมเดล
--   โดยไม่มีข้อมูลมาหนุนทั้งคู่: `shirakawago`/`takayama` มาก่อน `nara`/`yokohama` ·
--   `koh-samui` อยู่ท้ายกว่า `nan` · `gangneung` อันดับ 13 ทั้งที่เป็นเมืองซีรีส์
-- · ✅ **แก้ทีหลังถูกมาก** — เป็น `update` คอลัมน์เดียว ไม่ต้องแตะโค้ดสักบรรทัด
--   ⇒ เลือกเก็บเป็น *ข้อมูล* ไม่ใช่ *ลำดับที่ฝังในโค้ด* ด้วยเหตุผลนี้โดยตรง
--
-- ## รูปของค่า
-- `popularity` = **อันดับภายในประเทศ · 1 = นิยมที่สุด** · `null` = ยังไม่จัดอันดับ (ไปท้ายรายการ)
-- 🔴 **ไม่ใช้ "คะแนน" ที่มากกว่าคือดีกว่า** — อันดับอ่านแล้วเถียงได้ทันทีว่าใบไหนควรอยู่ตรงไหน
--    ส่วนคะแนนต้องมีคนตีความก่อนถึงจะเถียงได้ · และเราไม่มีอะไรมาตั้งคะแนนให้มีความหมาย
--
-- ## ⚠️ ใบนี้แก้ชื่อทริปแนะนำสองใบด้วย — และเป็นคนละเรื่องกับข้างบนโดยรู้ตัว
-- `20260905140000` ตั้งชื่อว่า *"โอซาก้า เกียวโต นารา 5 วัน 4 คืน"* แล้วการ์ดบนหน้าแรก
-- **แสดง `day_count`/`night_count` ของมันเองอยู่แล้ว** ⇒ ผู้ใช้เห็น *"5 วัน 4 คืน"* สองครั้งติดกัน
-- 🔴 รวมมาในใบนี้เพราะ **ทั้งสองเรื่องคือ "สิ่งที่ผู้ใช้เห็นบนหน้าเลือกเมือง/หน้าแรก"** และแก้แยกใบ
--    แปลว่าต้องขอให้ผู้ใช้กด `db:push` สองรอบสำหรับของที่เขาเห็นในหน้าจอเดียวกัน
--    ⚠️ **ถอนคืนแยกกันได้** — คนละ `update` คนละตาราง (`§3.35` ข้อ 2 ยังทำได้)
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

alter table public.catalog_cities
  add column if not exists popularity int check (popularity is null or popularity >= 1);

comment on column public.catalog_cities.popularity is
  'อันดับความนิยมของคนไทย *ภายในประเทศเดียวกัน* · 1 = นิยมที่สุด · null = ยังไม่จัดอันดับ (ไปท้าย) '
  '🔴 ที่มา: การประมาณของ Gemini 5 ก.ย. 2026 ไม่ใช่สถิติที่วัดเอง — ดู 20260905160000';

-- 🔴 **ไม่มี grant ให้ `authenticated`** และนั่นคือเจตนา —
--    `20260825*` ให้สิทธิ์เขียนคลังแบบระบุคอลัมน์ ⇒ คอลัมน์ใหม่ไม่ได้สิทธิ์เอง
--    ⇒ ไคลเอนต์จัดอันดับเมืองเองไม่ได้ · assert ข้างล่างบังคับข้อนี้

create temporary table _rank (slug text primary key, rank int not null) on commit drop;
insert into _rank (slug, rank) values
    ('tokyo', 1),
    ('osaka', 2),
    ('sapporo', 3),
    ('fukuoka', 4),
    ('kyoto', 5),
    ('nagoya', 6),
    ('shirakawago', 7),
    ('takayama', 8),
    ('otaru', 9),
    ('hakone', 10),
    ('nara', 11),
    ('kobe', 12),
    ('yokohama', 13),
    ('hakodate', 14),
    ('furano', 15),
    ('nikko', 16),
    ('kamakura', 17),
    ('beppu', 18),
    ('kanazawa', 19),
    ('sendai', 20),
    ('naha', 21),
    ('hiroshima', 22),
    ('nagasaki', 23),
    ('seoul', 1),
    ('busan', 2),
    ('jeju', 3),
    ('incheon', 4),
    ('gapyeong', 5),
    ('chuncheon', 6),
    ('suwon', 7),
    ('daegu', 8),
    ('gyeongju', 9),
    ('sokcho', 10),
    ('jeonju', 11),
    ('pohang', 12),
    ('gangneung', 13),
    ('yeosu', 14),
    ('andong', 15),
    ('da-nang', 1),
    ('hcmc', 2),
    ('hanoi', 3),
    ('sapa', 4),
    ('da-lat', 5),
    ('hoi-an', 6),
    ('ha-long', 7),
    ('phu-quoc', 8),
    ('nha-trang', 9),
    ('hue', 10),
    ('shanghai', 1),
    ('beijing', 2),
    ('chengdu', 3),
    ('zhangjiajie', 4),
    ('guilin', 5),
    ('xi-an', 6),
    ('qingdao', 7),
    ('taipei', 1),
    ('new-taipei', 2),
    ('taichung', 3),
    ('kaohsiung', 4),
    ('nantou', 5),
    ('hualien', 6),
    ('tainan', 7),
    ('bangkok', 1),
    ('chiang-mai', 2),
    ('pattaya', 3),
    ('hua-hin', 4),
    ('kanchanaburi', 5),
    ('ayutthaya', 6),
    ('phuket', 7),
    ('chiang-rai', 8),
    ('krabi', 9),
    ('nan', 10),
    ('udon-thani', 11),
    ('koh-samui', 12),
    ('sukhothai', 13),
    ('singapore', 1),
    ('macao', 1),
    ('hong-kong', 1);

update public.catalog_cities c
   set popularity = r.rank, updated_at = now()
  from _rank r
 where c.legacy_slug = r.slug;

-- ── เส้นของคนยังไม่ล็อกอิน ต้องเรียงแบบเดียวกับเส้นที่ล็อกอินแล้ว ─────────────
-- 🔴 ฉบับเดิม `order by ci.created_at` — *"เมือง seed ก่อน = เมืองหลัก"* ซึ่งจริงตอนเขียน
--    และเป็นเท็จทันทีที่มีคน seed เมืองเพิ่ม (`20260904070000` เพิ่มเกาหลี 7 เมืองรวด)
-- 🎯 ***คำสั่ง order by ที่พึ่งลำดับการ insert คือคำสั่งที่ถูกวันที่เขียน แล้วผิดเงียบตลอดไป***
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
   -- `nulls last` = เมืองที่ยังไม่จัดอันดับไปท้าย · แล้ว tie-break ด้วยชื่อให้ผลนิ่ง
   order by ci.popularity nulls last, ci.name_th
   limit 100;
$$;

-- ── ชื่อทริปแนะนำ: ตัด "N วัน N คืน" ออก เพราะการ์ดแสดงเองอยู่แล้ว ──────────
update public.trips
   set title = 'โอซาก้า เกียวโต นารา · ยูนิเวอร์แซล'
 where title = 'โอซาก้า เกียวโต นารา 5 วัน 4 คืน' and published_template_at is not null;
update public.trips
   set title = 'โตเกียว ฟูจิ ดิสนีย์แลนด์'
 where title = 'โตเกียว ฟูจิ ดิสนีย์ 6 วัน 5 คืน' and published_template_at is not null;

do $verify$
declare n_null int; n_dup int; n_seoul int; n_busan int; n_tokyo int; n_dup_title int;
begin
  -- ① ทุกเมืองต้องมีอันดับ — ตกไปแม้ใบเดียวแปลว่า slug ในไฟล์นี้ไม่ตรงกับคลัง
  select count(*) into n_null from public.catalog_cities where popularity is null;
  if n_null <> 0 then
    raise exception 'มี % เมืองที่ยังไม่มีอันดับ (slug แรก: %)', n_null,
      (select legacy_slug from public.catalog_cities where popularity is null order by legacy_slug limit 1);
  end if;

  -- ② อันดับต้องไม่ซ้ำ *ภายในประเทศเดียวกัน* — ซ้ำได้ = ลำดับที่ผู้ใช้เห็นจะสลับไปมาทุกครั้งที่คิวรี
  select count(*) into n_dup from (
    select country_id, popularity from public.catalog_cities
     group by country_id, popularity having count(*) > 1
  ) x;
  if n_dup <> 0 then raise exception 'มี % คู่ (ประเทศ, อันดับ) ที่ซ้ำกัน', n_dup; end if;

  -- 🔴 ③ **เกณฑ์เดียวที่วัดสิ่งที่ผู้ใช้บ่นจริง ๆ** — ไม่ใช่ "มีคอลัมน์แล้ว" แต่คือ *เมืองที่เขาหาอยู่มาก่อน*
  --    ⚠️ ผูกกับเมืองที่ไม่มีทางเถียงได้ว่าไม่ใช่อันดับหนึ่ง (โซล · โตเกียว) ไม่ใช่กับทั้งลำดับ
  --       ⇒ วันที่มีคนจัดอันดับใหม่ เคสนี้ **ไม่แดงมั่ว** แต่ยังจับกรณีลำดับพังทั้งชุด
  select popularity into n_seoul from public.catalog_cities where legacy_slug = 'seoul';
  select popularity into n_busan from public.catalog_cities where legacy_slug = 'busan';
  select popularity into n_tokyo from public.catalog_cities where legacy_slug = 'tokyo';
  if n_seoul <> 1 or n_tokyo <> 1 then
    raise exception 'โซล(%) หรือ โตเกียว(%) ไม่ได้อันดับ 1 — ลำดับเพี้ยนทั้งชุด', n_seoul, n_tokyo;
  end if;
  if n_busan > 3 then raise exception 'ปูซานอันดับ % — ไกลกว่าที่ควรมาก', n_busan; end if;

  -- 🔴 ④ **ไคลเอนต์ต้องจัดอันดับเองไม่ได้** (ทิศเดียวกับ `published_template_at`)
  if has_column_privilege('authenticated', 'public.catalog_cities', 'popularity', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated แก้ popularity ได้ — คอลัมน์นี้เป็นของทีมเท่านั้น';
  end if;

  -- ⑤ ชื่อทริปแนะนำต้องไม่มี "วัน…คืน" ซ้ำกับที่การ์ดแสดงเอง
  select count(*) into n_dup_title
    from public.trips
   where published_template_at is not null and deleted_at is null and title like '%วัน%คืน%';
  if n_dup_title <> 0 then
    raise exception 'มีทริปแนะนำ % ใบที่ยังมี "วัน…คืน" ในชื่อ — การ์ดจะแสดงซ้ำ', n_dup_title;
  end if;
end $verify$;

commit;
