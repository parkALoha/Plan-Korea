-- ════════════════════════════════════════════════════════════════════════════
-- E2 — เวียดนาม +7 เมือง · สิงคโปร์ (ประเทศใหม่)
-- เจ้าของ: P5 · ผู้ใช้สั่งโดยตรง 3 ก.ย. 2026 · ต่อจาก `20260904090000`
-- ════════════════════════════════════════════════════════════════════════════
-- ── เวียดนามมี 2 เมือง (ฮานอย · โฮจิมินห์) ทั้งที่เป็นปลายทางอันดับ 3 ของคนไทย ──
-- ไฟล์ `20260904080000` เพิ่มดานังไปแล้ว · ไฟล์นี้เติมที่เหลือ
--
-- 🔴 **เกณฑ์ที่ใช้เลือก: "เมืองที่คนไทยไปจริง" ไม่ใช่ "มีบินตรงจากไทย"**
--    ผู้ใช้ถามถึงบินตรง — แต่ **ฮอยอัน/เว้/ฮาลอง/ซาปา ไม่มีสนามบินของตัวเอง**
--    (ฮอยอันต่อรถจากดานัง 45 นาที · ฮาลองต่อรถจากฮานอย · ซาปาต่อรถจากลาวไก)
--    ⇒ ถ้าใช้เกณฑ์บินตรง **จะตัดปลายทางที่คนไทยไปมากที่สุดออกไปครึ่งหนึ่ง**
--    · เกณฑ์นี้ตรงกับที่ `20260827233000` (ญี่ปุ่น) ใช้อยู่แล้ว: ฮาโกเน่/ชิราคาวาโกะ
--      ก็ไม่มีสนามบินเหมือนกัน
--
-- ── ที่มาของตัวเลข ────────────────────────────────────────────────────────
-- ✅ ทุกแถวดึงจาก **Google Places API (New) `places:searchText`** (`languageCode: vi`/`en`)
-- ⚠️ **ยกเว้นดาลัด — Google คืนสถานที่ท่องเที่ยวแทนตัวเมืองทุกคำค้นที่ลอง**
--    (`Dalat Flower Garden` · `Da Lat Night Market` · `Da Lat City People's Committee`)
--    → ใช้ **OpenStreetMap/Nominatim** ซึ่งคืน entity ชนิด `city` ตรง ๆ: `11.9402, 108.4376`
--    🔴 **จดไว้เพราะมันคือแหล่งที่ต่างจากแถวอื่นในไฟล์เดียวกัน** — ไม่ใช่ของที่ควรกลืนหายไป
-- ⚠️ `name_th` เป็นคำทับศัพท์ที่ผมเลือก — ไม่มีแหล่งอ้างอิงเชิงเครื่อง แก้ได้อิสระ
--
-- ── 🔴 `supported = false` ทั้งสิงคโปร์ (และไต้หวันในไฟล์ก่อน) ──────────────
-- เหตุผลเดียวกับ `20260904080000`: ประเทศใหม่ที่**ยังไม่มีสถานที่สักแห่ง**
-- เปิดแล้วผู้ใช้เลือกเข้าไปเจอหน้าเปล่า · เปิดพร้อมกันในไฟล์ที่ลงสถานที่
-- 📌 **เวียดนามเปิดอยู่แล้ว** เมืองใหม่จึงค้นเจอทันทีที่ลง (แต่ยังไม่มีสถานที่ข้างใน)
--
-- ── ถอนคืน ────────────────────────────────────────────────────────────────
--   delete from public.catalog_cities where legacy_slug in
--     ('hoi-an','hue','ha-long','sapa','nha-trang','phu-quoc','da-lat','singapore');
--   delete from public.catalog_countries where id = 'sg';   -- หลังเมืองเท่านั้น
-- ════════════════════════════════════════════════════════════════════════════

begin;

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

insert into public.catalog_countries (id, name_th, name_en, supported) values
    ('sg', 'สิงคโปร์', 'Singapore', false)
on conflict (id) do nothing;

insert into public.catalog_cities (country_id, legacy_slug, name_th, name_en, name_local, lat, lng, timezone)
values
    -- ฮอยอัน — เมืองเก่ามรดกโลก · ต่อรถจากดานัง 45 นาที
    ('vn', 'hoi-an',    'ฮอยอัน',  'Hoi An',    'Hội An',   15.8685, 108.3267, 'Asia/Ho_Chi_Minh'),
    -- เว้ — ราชธานีเก่า · พระราชวังเว้
    ('vn', 'hue',       'เว้',     'Hue',       'Huế',      16.3547, 107.4795, 'Asia/Ho_Chi_Minh'),
    -- ฮาลอง — อ่าวฮาลอง มรดกโลก · ต่อรถจากฮานอย
    ('vn', 'ha-long',   'ฮาลอง',   'Ha Long',   'Hạ Long',  20.9418, 107.1278, 'Asia/Ho_Chi_Minh'),
    -- ซาปา — นาขั้นบันได · ต่อรถจากลาวไก
    ('vn', 'sapa',      'ซาปา',    'Sa Pa',     'Sa Pa',    22.3405, 103.8564, 'Asia/Ho_Chi_Minh'),
    -- ญาจาง — ชายหาด · มีสนามบินกามซัญ
    ('vn', 'nha-trang', 'ญาจาง',   'Nha Trang', 'Nha Trang',12.2410, 109.1964, 'Asia/Ho_Chi_Minh'),
    -- ฟูก๊วก — เกาะ · มีสนามบินนานาชาติ
    ('vn', 'phu-quoc',  'ฟูก๊วก',  'Phu Quoc',  'Phú Quốc', 10.2899, 103.9840, 'Asia/Ho_Chi_Minh'),
    -- ดาลัด — เมืองบนภูเขา · 🔴 พิกัดจาก OpenStreetMap ไม่ใช่ Google (ดูหัวไฟล์)
    ('vn', 'da-lat',    'ดาลัด',   'Da Lat',    'Đà Lạt',   11.9402, 108.4376, 'Asia/Ho_Chi_Minh'),

    -- ── สิงคโปร์ — นครรัฐ เมืองเดียวเท่ากับทั้งประเทศ ────────────────────
    ('sg', 'singapore', 'สิงคโปร์', 'Singapore', 'Singapore', 1.3521, 103.8198, 'Asia/Singapore')
on conflict (legacy_slug) do nothing;

do $verify$
declare n int;
begin
  select count(*) into n from public.catalog_cities where country_id = 'vn';
  if n <> 10 then raise exception 'เวียดนามควรมี 10 เมือง (2 เดิม + ดานัง + 7 ใบนี้) แต่มี % — รัน 20260904080000 ก่อนหรือยัง', n; end if;

  select count(*) into n from public.catalog_cities where country_id = 'sg';
  if n <> 1 then raise exception 'สิงคโปร์ควรมี 1 เมือง แต่มี %', n; end if;

  -- 🔴 ไม่มีชื่อไหนมีอักขระ Private Use Area (U+E000–U+F8FF) — P1 เจอจริงกับ `'เซี่ยงไฮ'`
  --    **มองด้วยตาไม่ออก** แต่แสดงผลเพี้ยนบนเครื่องผู้ใช้ · ชื่อในไฟล์นี้มาจาก Google เหมือนกัน
  --    ⇒ ความเสี่ยงเดียวกันเป๊ะ · สแกนไฟล์ก่อน commit ได้ 0 **แต่ด่านต้องอยู่ในฐาน ไม่ใช่ในหัวผม**
  select count(*) into n from public.catalog_cities
   where legacy_slug in ('hoi-an','hue','ha-long','sapa','nha-trang','phu-quoc','da-lat','singapore')
     and (name_th ~ '[\uE000-\uF8FF]' or name_en ~ '[\uE000-\uF8FF]'
          or coalesce(name_local,'') ~ '[\uE000-\uF8FF]');
  if n > 0 then raise exception 'มีชื่อเมือง % แถวที่มีอักขระ Private Use Area', n; end if;

  -- สวิตช์ต้องยังปิด — เปิดตอนยังไม่มีสถานที่คือบั๊ก ไม่ใช่ความคืบหน้า
  if (select supported from public.catalog_countries where id = 'sg') is not false then
    raise exception 'sg.supported ต้องเป็น false จนกว่าจะมีสถานที่';
  end if;
end $verify$;

commit;
