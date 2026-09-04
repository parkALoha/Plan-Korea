-- ════════════════════════════════════════════════════════════════════════════
-- E2 — เมืองเพิ่ม: เกาหลีใต้ 10 เมือง + เซนได (ญี่ปุ่น)
-- เจ้าของ: P5 · ผู้ใช้สั่งโดยตรง · ต่อจาก `20260904060000`
-- ════════════════════════════════════════════════════════════════════════════
-- ── ทำไมเป็นเมืองพวกนี้ ────────────────────────────────────────────────────
-- เกณฑ์เดียวกับ `20260827233000` (ญี่ปุ่น): **เมืองที่คนไทยวางแผนไปจริง**
-- ไม่ใช่ "เมืองใหญ่ที่สุด N อันดับ" — คาพย็อง/อันดงเล็กกว่าอีกหลายเมืองที่ไม่ได้ใส่
-- แต่เป็นปลายทางจริงของทัวร์ไทย (เกาะนามิ / หมู่บ้านฮาโฮเว)
--
-- 🔴 **5 เมืองเกาหลีเดิม (โซล · ปูซาน · ซูวอน · คังนึง · ซกโช) ไม่อยู่ในไฟล์นี้**
--    มีอยู่แล้วตั้งแต่ `20260827170000` พร้อมสถานที่ 67 แห่ง — ไฟล์นี้ไม่แตะของเดิม
--
-- ── ที่มาของตัวเลขทุกตัวในไฟล์นี้ ──────────────────────────────────────────
-- ✅ `lat`/`lng` และ `name_local` **ดึงจาก Google Places API (New) `places:searchText`**
--    (ตัวเดียวกับที่ `scripts/catalog-suggest.py` ใช้) ไม่ได้พิมพ์จากความจำ
-- ⚠️ **สิ่งเดียวที่แก้จากผลดิบ: ตัดคำต่อท้ายหน่วยปกครองออก** — Google คืน `제주시` `대구광역시`
--    `仙台市` · ตัดเหลือ `제주` `대구` `仙台` **เพื่อให้ตรงรูปกับแถวเดิมของประเทศเดียวกัน**
--    (`서울` `부산` `속초` · `東京` `大阪` — ไม่มีคำต่อท้ายสักแถว)
--    🔴 หมายเหตุความไม่สม่ำเสมอที่มีอยู่ก่อนแล้ว: แถวจีนใน `20260904040000` **เก็บคำต่อท้ายไว้**
--    (`北京市` `上海市`) — ไฟล์นี้ไม่แก้ของเขา แค่ไม่สร้างความต่างเพิ่มในกลุ่ม kr/jp
-- ⚠️ `name_th` เป็นคำทับศัพท์ที่ใช้กันทั่วไปในไทย — **ไม่มีแหล่งอ้างอิงเชิงเครื่อง**
--    ถ้าผู้ใช้อยากได้คำสะกดอื่น แก้ที่นี่ได้เลย ไม่กระทบคีย์หรือ FK
--
-- ── ถอนคืน ────────────────────────────────────────────────────────────────
--   delete from public.catalog_cities where legacy_slug in
--     ('jeju','gyeongju','jeonju','gapyeong','chuncheon','daegu','incheon','yeosu','andong','pohang','sendai');
--   ⚠️ ถ้าลบไม่ออกเพราะ `on delete restrict` = มีสถานที่เกาะอยู่แล้ว **อย่าบังคับลบ**
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL/DML ทุกบรรทัด ──────
do $guard$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity — ฐานนี้ไม่ใช่ engine-dev';
  end if;
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- ประเทศทั้งสองมีอยู่แล้ว (`kr` จาก `20260827170000` · `jp` จาก `20260827233000`)
-- เขียนซ้ำไว้เพื่อให้ไฟล์นี้รันเดี่ยวได้ ไม่ได้ตั้งใจแก้ชื่อ
insert into public.catalog_countries (id, name_th, name_en) values
    ('kr', 'เกาหลีใต้', 'South Korea'),
    ('jp', 'ญี่ปุ่น',   'Japan')
on conflict (id) do nothing;

insert into public.catalog_cities (country_id, legacy_slug, name_th, name_en, name_local, lat, lng, timezone)
values
    -- เกาะเชจู — บินตรงจากกรุงเทพฯ · ปลายทางเดี่ยวได้ทั้งทริป
    ('kr', 'jeju',      'เชจู',    'Jeju',      '제주', 33.5043, 126.5198, 'Asia/Seoul'),
    -- เมืองประวัติศาสตร์ · เที่ยวคู่กับปูซานเป็นวันเดย์ทริป
    ('kr', 'gyeongju',  'คยองจู',  'Gyeongju',  '경주', 35.8447, 129.2070, 'Asia/Seoul'),
    -- หมู่บ้านฮันอกช็อนจู · อาหารพื้นเมือง
    ('kr', 'jeonju',    'ช็อนจู',  'Jeonju',    '전주', 35.8397, 127.1293, 'Asia/Seoul'),
    -- เกาะนามิ + ปิติต์ฟร็องส์ · เดย์ทริปจากโซลที่ทัวร์ไทยไปมากที่สุด
    ('kr', 'gapyeong',  'คาพย็อง', 'Gapyeong',  '가평', 37.8313, 127.5106, 'Asia/Seoul'),
    -- ชุนช็อน — ต้นทางรถไฟสายเกาะนามิ · ทัคคาลบี
    ('kr', 'chuncheon', 'ชุนช็อน', 'Chuncheon', '춘천', 37.8805, 127.7278, 'Asia/Seoul'),
    -- แทกู — เมืองใหญ่อันดับ 4 · มีบินตรงจากไทย
    ('kr', 'daegu',     'แทกู',    'Daegu',     '대구', 35.8501, 128.5206, 'Asia/Seoul'),
    -- อินช็อน — ไม่ใช่แค่สนามบิน (ไชนาทาวน์ · ซงโด) · ควรแยกจากแถวสนามบิน
    ('kr', 'incheon',   'อินช็อน', 'Incheon',   '인천', 37.4752, 126.6313, 'Asia/Seoul'),
    -- ยอซู — เมืองชายทะเลใต้ · กระเช้าข้ามทะเล
    ('kr', 'yeosu',     'ยอซู',    'Yeosu',     '여수', 34.7610, 127.6629, 'Asia/Seoul'),
    -- อันดง — หมู่บ้านฮาโฮเว (มรดกโลก)
    ('kr', 'andong',    'อันดง',   'Andong',    '안동', 36.5667, 128.7289, 'Asia/Seoul'),
    -- โพฮัง — ปลายทางรถไฟสายตะวันออก · จุดชมพระอาทิตย์ขึ้น
    ('kr', 'pohang',    'โพฮัง',   'Pohang',    '포항', 36.0178, 129.3609, 'Asia/Seoul'),

    -- ── ญี่ปุ่น ────────────────────────────────────────────────────────────
    -- เซนได — ประตูสู่โทโฮคุ · ผู้ใช้สั่งเพิ่มโดยตรง 3 ก.ย. 2026
    ('jp', 'sendai',    'เซนได',   'Sendai',    '仙台', 38.2682, 140.8694, 'Asia/Tokyo')
on conflict (legacy_slug) do nothing;

-- ── ตรวจว่าลงจริงครบ — ไม่ใช่เชื่อว่า insert ไม่ error แปลว่าลงแล้ว ────────
-- 🔴 `on conflict do nothing` **กลืนทุกกรณีที่ชนคีย์** → "รันผ่าน" ไม่ได้แปลว่า "มีแถว"
do $verify$
declare n int;
begin
  select count(*) into n from public.catalog_cities where legacy_slug in
    ('jeju','gyeongju','jeonju','gapyeong','chuncheon','daegu','incheon','yeosu','andong','pohang');
  if n <> 10 then raise exception 'ควรมีเมืองเกาหลีใหม่ 10 เมือง แต่มี %', n; end if;

  select count(*) into n from public.catalog_cities where legacy_slug = 'sendai';
  if n <> 1 then raise exception 'ควรมีเซนได 1 แถว แต่มี %', n; end if;

  -- 🔴 ไม่มีชื่อไหนมีอักขระ Private Use Area (U+E000–U+F8FF) — P1 เจอจริงกับ `'เซี่ยงไฮ'`
  --    **มองด้วยตาไม่ออก** แต่แสดงผลเพี้ยนบนเครื่องผู้ใช้ · ชื่อในไฟล์นี้มาจาก Google เหมือนกัน
  --    ⇒ ความเสี่ยงเดียวกันเป๊ะ · สแกนไฟล์ก่อน commit ได้ 0 **แต่ด่านต้องอยู่ในฐาน ไม่ใช่ในหัวผม**
  select count(*) into n from public.catalog_cities
   where legacy_slug in ('jeju','gyeongju','jeonju','gapyeong','chuncheon','daegu','incheon','yeosu','andong','pohang','sendai')
     and (name_th ~ '[\uE000-\uF8FF]' or name_en ~ '[\uE000-\uF8FF]'
          or coalesce(name_local,'') ~ '[\uE000-\uF8FF]');
  if n > 0 then raise exception 'มีชื่อเมือง % แถวที่มีอักขระ Private Use Area', n; end if;

  -- 5 เมืองเดิมต้องไม่ถูกแตะ
  select count(*) into n from public.catalog_cities
   where legacy_slug in ('seoul','busan','suwon','gangneung','sokcho');
  if n <> 5 then raise exception 'เมืองเกาหลีเดิมควรมี 5 แต่มี % — ไฟล์นี้ไม่ควรแตะของเดิม', n; end if;
end $verify$;

commit;
