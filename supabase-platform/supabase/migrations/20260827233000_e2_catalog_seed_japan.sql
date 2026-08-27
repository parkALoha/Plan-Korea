-- ═══════════════════════════════════════════════════════════════════════════
-- E2 (ขยายขอบเขต) — seed ประเทศญี่ปุ่น: 22 เมือง + 7 สนามบิน
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมถึงมีไฟล์นี้ ──────────────────────────────────────────────────────
-- ผู้ใช้ตัดสินขอบเขตผลิตภัณฑ์ 27 ส.ค. 2026: รองรับ **ไทย · ญี่ปุ่น · เกาหลี · เวียดนาม**
-- เท่านี้ก่อน — เหตุผลที่ให้มา: เป็นชุดที่ *"สถานที่ เมือง ไฟลต์บิน ที่คนเดินทางไปกลับจากไทย"*
-- มีจำนวนจำกัดพอจะดูแลให้ครบจริงได้
--
-- 🔴 **สำรวจแล้วพบว่าญี่ปุ่นไม่มีอยู่ในคลังเลยสักแถว** — ไม่มีทั้งประเทศ เมือง และสถานที่
--    สภาพคลังก่อนไฟล์นี้: `kr` 5 เมือง · `vn` 2 · `th` 1 · **`jp` 0**
--    → วันนี้ผู้ใช้สร้างทริปโตเกียวไม่ได้เลย ไม่ใช่ "ได้แต่ข้อมูลน้อย"
--
-- ── 🔴 สิ่งที่เจอตอนตรวจฐานก่อนเขียนไฟล์นี้ — และเป็นเหตุผลที่ต้องมีไฟล์นี้จริง ๆ ──
--    ฐาน dev **มี `jp` และเมือง `tokyo` อยู่แล้ว** (สร้าง 26 ส.ค. 2026 14:28 UTC)
--    และมันเป็น**ข้อมูลจริง ไม่ใช่ fixture** — ชื่อไทย/อังกฤษ/ญี่ปุ่นถูกต้อง พิกัดตรงกับที่ไฟล์นี้
--    กำลังจะลงเป๊ะทุกหลัก (35.6762, 139.6503) · มีคนใส่ด้วยมือเข้าฐานตรง ๆ
--
--    🎯 **แต่ไม่มี migration ไฟล์ไหนในทรีสร้างมันได้** → ฐานที่สร้างใหม่จากไฟล์ทั้งหมดจะ**ไม่มีญี่ปุ่นเลย**
--    ผมเกือบสรุปจากผลคิวรีว่า *"ญี่ปุ่นมีแล้ว ไม่ต้องทำ"* — ซึ่งจะผิด เพราะสิ่งที่ขาดไม่ใช่*แถว*
--    แต่คือ**วิธีสร้างแถวนั้นซ้ำได้** · `on conflict do nothing` ทำให้ไฟล์นี้ปลอดภัยกับแถวที่มีอยู่
--    ⚠️ ตระกูลเดียวกับ `E7` และกับ 766 แถวที่เคยนับเป็นของตัวเอง: **"มีข้อมูลอยู่" ตอบคนละคำถามกับ
--    "ข้อมูลนั้นมาจากไหน"** · ถ้าวันหนึ่งเจอแถวในฐานที่ไม่มีไฟล์ไหนอธิบายได้อีก ให้ถือเป็นสัญญาณเดียวกัน
--
-- ── ⚠️ สิ่งที่ไฟล์นี้ **ไม่** ได้ทำ และห้ามอ่านว่าทำแล้ว ──────────────────
--   ① **ไม่มีสถานที่ท่องเที่ยวญี่ปุ่นสักแห่ง** — มีแค่เมืองกับสนามบิน
--      แปลว่า *สร้างทริปโตเกียวได้ · เลือกวันได้ · ใส่สนามบินได้* แต่ **"เพิ่มสถานที่" จะว่างเปล่า**
--      🎯 จดไว้ตรงนี้เพราะคนที่ไปเจอจะได้รู้ทันทีว่าเป็นของที่ยังไม่ทำ ไม่ใช่ของที่พัง
--      (รูปเดียวกับที่ `20260827170000` จดว่าไม่ครอบ transfer points แล้ว P2 ชนภายในชั่วโมงเดียว
--       — ข้อจำกัดที่จดไว้ ไม่ได้แปลว่าไม่มีใครเจอ มันแปลว่าคนที่เจออ่านเข้าใจว่าทำไม)
--   ② **ไม่มีรูปปกระดับเมืองของญี่ปุ่นสักใบ** — มีแต่ `public/covers/country-jp.svg` (`e1e2f2f`)
--      ทุกทริปญี่ปุ่นจะได้รูปประเทศเหมือนกันหมด ซึ่งเป็นพฤติกรรมที่ตั้งใจ ไม่ใช่ของพัง
--   ③ **ไม่แตะความบางของ `th`/`vn`/`kr`** — ไทย 1 เมือง เวียดนาม 2 ก็บางเกินไปสำหรับประเทศ
--      ที่ประกาศว่ารองรับ **แต่นั่นเป็นคนละชนิดของช่องว่างกับญี่ปุ่น**: ญี่ปุ่น = 0 (ทำไม่ได้เลย)
--      · ไทย/เวียดนาม = น้อย (ทำได้ แต่ตัวเลือกไม่พอ) → migration แยก ไม่ปนกับไฟล์นี้
--
-- ── locale ────────────────────────────────────────────────────────────────
--   `ja` สำหรับชื่อท้องถิ่น — **ไม่ใช่ `ko`** · เคยพลาดรูปนี้ตอน `20260827170000`
--   (เกือบ seed ฮานอยเป็น `ko` ทั้งชุด เพราะเขียนสคริปต์จากไฟล์ที่มีแต่เกาหลี)
--
-- ── nav_providers ─────────────────────────────────────────────────────────
--   ปล่อยว่างเหมือนทุกประเทศ — เราไม่เรียก Naver/Kakao/ODsay เลย (`guards.sh` ด่าน `api-hosts` บังคับ)
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   🔴 **ห้ามลบด้วย `where source = 'transfer'`** — จะกวาดสนามบินไทย/เกาหลี/เวียดนามของไฟล์
--      `20260827190000` ไปด้วยทั้งหมด · ลบด้วย slug ที่ไฟล์นี้เป็นคนเขียนเท่านั้น
--      (บทเรียนจาก `'curated'` ที่เคยนับ fixture ของคนอื่น 694 แถวเป็นของตัวเอง)
--   delete from public.catalog_place_names cn using public.catalog_places p
--    where cn.place_id = p.id
--      and p.legacy_slug in ('airport-nrt','airport-hnd','airport-kix','airport-ngo',
--                            'airport-fuk','airport-cts','airport-oka');
--   delete from public.catalog_places where legacy_slug in ('airport-nrt','airport-hnd',
--     'airport-kix','airport-ngo','airport-fuk','airport-cts','airport-oka');
--   delete from public.catalog_cities where country_id = 'jp';
--   delete from public.catalog_countries where id = 'jp';
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
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- ── ประเทศ ────────────────────────────────────────────────────────────────
insert into public.catalog_countries (id, name_th, name_en) values
    ('jp', 'ญี่ปุ่น', 'Japan')
on conflict (id) do nothing;

-- ── เมือง ─────────────────────────────────────────────────────────────────
-- เลือกจาก **เส้นทางที่บินตรง/ต่อเครื่องจากไทยได้จริง + เมืองที่คนไทยวางแผนไปจริง**
-- ไม่ใช่ "เมืองใหญ่ที่สุด 22 อันดับ" — ฮาโกเน่/ชิราคาวาโกะเล็กกว่าอีกหลายเมืองที่ไม่ได้ใส่
create temporary table _jc (
  slug text primary key, name_th text not null, name_en text not null, name_local text not null,
  lat double precision not null, lng double precision not null
) on commit drop;

insert into _jc (slug, name_th, name_en, name_local, lat, lng) values
    ('tokyo',       'โตเกียว',      'Tokyo',        '東京',   35.6762, 139.6503),
    ('yokohama',    'โยโกฮามะ',     'Yokohama',     '横浜',   35.4437, 139.6380),
    ('hakone',      'ฮาโกเน่',      'Hakone',       '箱根',   35.2324, 139.1069),
    ('kamakura',    'คามาคุระ',     'Kamakura',     '鎌倉',   35.3192, 139.5467),
    ('nikko',       'นิกโก้',       'Nikko',        '日光',   36.7199, 139.6982),
    ('osaka',       'โอซากะ',       'Osaka',        '大阪',   34.6937, 135.5023),
    ('kyoto',       'เกียวโต',      'Kyoto',        '京都',   35.0116, 135.7681),
    ('nara',        'นารา',         'Nara',         '奈良',   34.6851, 135.8048),
    ('kobe',        'โกเบ',         'Kobe',         '神戸',   34.6901, 135.1955),
    ('nagoya',      'นาโกย่า',      'Nagoya',       '名古屋', 35.1815, 136.9066),
    ('takayama',    'ทาคายามะ',     'Takayama',     '高山',   36.1461, 137.2522),
    ('kanazawa',    'คานาซาวะ',     'Kanazawa',     '金沢',   36.5613, 136.6562),
    ('shirakawago', 'ชิราคาวาโกะ',  'Shirakawa-go', '白川郷', 36.2578, 136.9063),
    ('sapporo',     'ซัปโปโร',      'Sapporo',      '札幌',   43.0618, 141.3545),
    ('otaru',       'โอตารุ',       'Otaru',        '小樽',   43.1907, 140.9947),
    ('hakodate',    'ฮาโกดาเตะ',    'Hakodate',     '函館',   41.7688, 140.7288),
    ('furano',      'ฟุราโนะ',      'Furano',       '富良野', 43.3421, 142.3831),
    ('fukuoka',     'ฟุกุโอกะ',     'Fukuoka',      '福岡',   33.5904, 130.4017),
    ('beppu',       'เบปปุ',        'Beppu',        '別府',   33.2846, 131.4914),
    ('nagasaki',    'นางาซากิ',     'Nagasaki',     '長崎',   32.7503, 129.8779),
    ('hiroshima',   'ฮิโรชิมะ',     'Hiroshima',    '広島',   34.3853, 132.4553),
    ('naha',        'นาฮะ',         'Naha',         '那覇',   26.2124, 127.6809);

insert into public.catalog_cities (country_id, legacy_slug, name_th, name_en, name_local, lat, lng, timezone)
select 'jp', slug, name_th, name_en, name_local, lat, lng, 'Asia/Tokyo' from _jc
on conflict (legacy_slug) do nothing;

-- ── สนามบิน ───────────────────────────────────────────────────────────────
-- `picker_hidden = false` ทุกตัว — สนามบินญี่ปุ่นทั้งหมดเป็น**ปลายทาง**ของคนไทย ไม่ใช่ต้นทาง
-- (ต่างจาก `airport-bkk`/`airport-sgn` ใน `20260827190000` ที่ซ่อนเพราะเป็นต้นทาง/ต่อเครื่อง)
create temporary table _jp_ap (
  slug text primary key, city_slug text not null,
  lat double precision not null, lng double precision not null, address_local text not null
) on commit drop;

insert into _jp_ap (slug, city_slug, lat, lng, address_local) values
    ('airport-nrt', 'tokyo',   35.7720, 140.3929, '千葉県成田市成田国際空港'),
    ('airport-hnd', 'tokyo',   35.5494, 139.7798, '東京都大田区羽田空港'),
    ('airport-kix', 'osaka',   34.4342, 135.2325, '大阪府泉佐野市泉州空港北1'),
    ('airport-ngo', 'nagoya',  34.8584, 136.8055, '愛知県常滑市セントレア1丁目1'),
    ('airport-fuk', 'fukuoka', 33.5859, 130.4507, '福岡県福岡市博多区大字下臼井778-1'),
    ('airport-cts', 'sapporo', 42.7752, 141.6923, '北海道千歳市美々987-22'),
    ('airport-oka', 'naha',    26.1958, 127.6458, '沖縄県那覇市字鏡水150');

create temporary table _jp_apn (
  slug text not null, locale text not null, priority int not null, name text not null,
  primary key (slug, locale, priority)
) on commit drop;

insert into _jp_apn (slug, locale, priority, name) values
    ('airport-nrt', 'th', 1, 'สนามบินนาริตะ (NRT)'),
    ('airport-nrt', 'en', 1, 'Narita International Airport'),
    ('airport-nrt', 'ja', 1, '成田国際空港'),
    ('airport-hnd', 'th', 1, 'สนามบินฮาเนดะ (HND)'),
    ('airport-hnd', 'en', 1, 'Haneda Airport'),
    ('airport-hnd', 'ja', 1, '東京国際空港'),
    ('airport-kix', 'th', 1, 'สนามบินคันไซ (KIX)'),
    ('airport-kix', 'en', 1, 'Kansai International Airport'),
    ('airport-kix', 'ja', 1, '関西国際空港'),
    ('airport-ngo', 'th', 1, 'สนามบินชูบุเซ็นแทรร์ (NGO)'),
    ('airport-ngo', 'en', 1, 'Chubu Centrair International Airport'),
    ('airport-ngo', 'ja', 1, '中部国際空港'),
    ('airport-fuk', 'th', 1, 'สนามบินฟุกุโอกะ (FUK)'),
    ('airport-fuk', 'en', 1, 'Fukuoka Airport'),
    ('airport-fuk', 'ja', 1, '福岡空港'),
    ('airport-cts', 'th', 1, 'สนามบินชินชิโตเสะ (CTS)'),
    ('airport-cts', 'en', 1, 'New Chitose Airport'),
    ('airport-cts', 'ja', 1, '新千歳空港'),
    ('airport-oka', 'th', 1, 'สนามบินนาฮะ (OKA)'),
    ('airport-oka', 'en', 1, 'Naha Airport'),
    ('airport-oka', 'ja', 1, '那覇空港');

insert into public.catalog_places
  (city_id, legacy_slug, category, source, transfer_kind, picker_hidden, lat, lng, address_local)
select c.id, a.slug, 'transport', 'transfer', 'airport', false, a.lat, a.lng, a.address_local
  from _jp_ap a
  join public.catalog_cities c on c.legacy_slug = a.city_slug
on conflict (legacy_slug) do nothing;

insert into public.catalog_place_names (place_id, city_id, locale, name, priority, source)
select p.id, p.city_id, n.locale, n.name, n.priority, 'curated'
  from _jp_apn n
  join public.catalog_places p on p.legacy_slug = n.slug
on conflict (place_id, locale, priority) do nothing;

-- ── ยืนยัน — นับเฉพาะของที่ไฟล์นี้ตั้งใจลง ────────────────────────────────
-- 🔴 นับด้วยการ join กับตารางชั่วคราว **ไม่ใช่** `where country_id = 'jp'` หรือ `where source = 'transfer'`
--    ตัวนับที่นับของคนอื่นด้วย ไม่ได้ยืนยันอะไรเลย — มันแค่ล้มด้วยเหตุผลที่ถูกต้อง (บทเรียน `'curated'`)
do $verify$
declare n_country int; n_city int; n_ap int; n_name int; n_orphan int; n_tz int; n_kind int;
begin
  select count(*) into n_country from public.catalog_countries where id = 'jp';
  select count(*) into n_city from public.catalog_cities c join _jc j on c.legacy_slug = j.slug;
  select count(*) into n_ap   from public.catalog_places p join _jp_ap a on p.legacy_slug = a.slug;
  select count(*) into n_name
    from public.catalog_place_names cn
    join public.catalog_places p on p.id = cn.place_id
    join _jp_apn n on n.slug = p.legacy_slug and n.locale = cn.locale and n.priority = cn.priority;

  if n_country <> 1  then raise exception 'ประเทศ jp ลงไม่ได้: % ไม่ใช่ 1', n_country; end if;
  if n_city    <> 22 then raise exception 'เมืองญี่ปุ่นลงไม่ครบ: % ไม่ใช่ 22', n_city; end if;
  if n_ap      <> 7  then raise exception 'สนามบินลงไม่ครบ: % ไม่ใช่ 7', n_ap; end if;
  if n_name    <> 21 then raise exception 'ชื่อสนามบินลงไม่ครบ: % ไม่ใช่ 21', n_name; end if;

  -- 🔴 เมืองต้องผูกกับ `jp` จริง และเป็น Asia/Tokyo — ถ้า `on conflict do nothing` เงียบเพราะ
  --    slug ชนกับเมืองของประเทศอื่นที่มีอยู่ก่อน เคสข้างบนจะยังนับได้ครบ แต่แถวจะเป็นของประเทศอื่น
  --    🎯 `nara`/`kobe`/`otaru` เป็นคำสั้นที่ชนกับ slug ของที่อื่นได้ง่ายที่สุดในชุดนี้
  select count(*) into n_tz
    from public.catalog_cities c join _jc j on c.legacy_slug = j.slug
   where c.country_id <> 'jp' or c.timezone <> 'Asia/Tokyo';
  if n_tz <> 0 then raise exception 'มี % เมืองที่ไม่ได้ผูกกับ jp/Asia/Tokyo — slug ชนกับของเดิม', n_tz; end if;

  select count(*) into n_kind
    from public.catalog_places p join _jp_ap a on p.legacy_slug = a.slug
   where p.transfer_kind <> 'airport' or p.source <> 'transfer' or p.picker_hidden;
  if n_kind <> 0 then raise exception 'มี % สนามบินที่ตั้งค่าไม่ถูก', n_kind; end if;

  select count(*) into n_orphan
    from public.catalog_places p join _jp_ap a on p.legacy_slug = a.slug
   where not exists (select 1 from public.catalog_place_names cn
                      where cn.place_id = p.id and cn.locale = 'th');
  if n_orphan <> 0 then raise exception 'มี % สนามบินที่ไม่มีชื่อภาษาไทย — join ผิด', n_orphan; end if;
end $verify$;

commit;
