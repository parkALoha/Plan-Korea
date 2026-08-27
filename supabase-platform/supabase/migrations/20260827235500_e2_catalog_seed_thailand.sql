-- ═══════════════════════════════════════════════════════════════════════════
-- E2 (ขยายขอบเขต) — seed ประเทศไทย: 12 เมือง + 6 สนามบิน + 37 สถานที่
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ช่องว่างที่ไฟล์นี้ปิด ─────────────────────────────────────────────────
-- ไทยอยู่ในขอบเขตที่ผู้ใช้ประกาศ (ไทย · ญี่ปุ่น · เกาหลี · เวียดนาม) แต่ในคลังมี
-- **กรุงเทพฯ เมืองเดียว และสถานที่เที่ยว 0 แห่ง** — มีแค่สนามบินสุวรรณภูมิ
--
-- 🎯 **และเหตุผลที่มันบางขนาดนั้นบอกอะไรบางอย่าง:** กรุงเทพฯ เข้าคลังมาในฐานะ
--    *ต้นทาง* ของทริปเกาหลี (`20260827190000` — ใส่มาเพราะ `airport-bkk` ต้องมีเมืองสังกัด)
--    **ไม่เคยมีใครใส่มันในฐานะ *ปลายทาง*** · ประโยคของผู้ใช้ครอบทั้งสองอย่าง:
--    *"รองรับทริปท่องเที่ยว ไทย ญี่ปุ่น เกาหลี เวียดนาม"* — ไทยเป็นปลายทางด้วย ไม่ใช่แค่จุดออกเดินทาง
--
-- ── สิ่งที่เลือก ─────────────────────────────────────────────────────────
--   ① **ทุกเมืองต้องมีสถานที่เที่ยวอย่างน้อย 1 แห่ง** — บล็อกยืนยันบังคับ (รูปเดียวกับชุดญี่ปุ่น)
--      รวมกรุงเทพฯ ที่มีอยู่ก่อนแล้วด้วย → เกณฑ์ครอบ 13 เมือง ไม่ใช่แค่ 12 เมืองใหม่
--   ② `airport-dmk` เป็น **`picker_hidden = true`** เหมือน `airport-bkk` — สนามบินต้นทาง
--      ไม่ควรโผล่ในลิสต์ "เพิ่มสถานที่ลงวัน" · อีก 5 แห่งเป็น `false` เพราะเป็นปลายทางของทริปในประเทศ
--      🔴 **ทั้งที่ DMK เป็นปลายทางได้เหมือนกันถ้าบินจากเชียงใหม่เข้ากรุงเทพฯ** — เลือกให้ตรงกับ
--      `airport-bkk` ที่มีอยู่ก่อน เพราะสองสนามบินเดียวกันในเมืองเดียวกันควรทำตัวเหมือนกัน
--      ความไม่สมมาตรนี้เป็นของที่รู้ตัว ไม่ใช่ของที่เผลอ · แก้ทั้งคู่พร้อมกันถ้าจะแก้
--   ③ `weather_sensitivity` ใส่เฉพาะที่รู้จริง — ในชุดนี้ `culture` กระจายทั้งสามค่าอีกเช่นกัน:
--      วัดอรุณ `outdoor` · วัดโพธิ์ `mixed` (พระนอนอยู่ในวิหาร) · **หมวดเดียวกัน**
--   ④ **ที่อยู่ปล่อยว่าง** ด้วยเหตุผลเดียวกับชุดญี่ปุ่น — ที่อยู่ที่ผิดแย่กว่าไม่มี (`D55`)
--      ⚠️ **ข้อนี้ต่างจากชุดเกาหลีโดยตั้งใจ** ชุดเกาหลีมีที่อยู่จริงเพราะคัดมาจาก `data/places.ts`
--      ที่มีคนไปตรวจมาแล้ว · ชุดนี้ไม่มีแหล่งแบบนั้น
--   ⑤ locale = `th` และ `en` เท่านั้น — **ไม่มี locale ที่สามเหมือนญี่ปุ่น/เกาหลี**
--      เพราะภาษาท้องถิ่นของไทยคือภาษาไทย · `name_local` ของเมืองต่างจาก `name_th` แค่ที่
--      อยุธยา (`พระนครศรีอยุธยา` เทียบ `อยุธยา`) เหมือนที่กรุงเทพฯ ทำไว้แล้ว
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   🔴 ห้ามลบด้วย `source` — `'curated'` เป็นค่า DEFAULT (fixture ~700 แถวก็เป็น `'curated'`)
--      และ `'transfer'` จะกวาดสนามบินเกาหลี/ญี่ปุ่น/เวียดนามไปด้วย · ลบด้วย slug ของไฟล์นี้เท่านั้น
--   delete from public.catalog_place_names cn using public.catalog_places p
--    where cn.place_id = p.id and p.city_id in (select id from public.catalog_cities where country_id = 'th')
--      and p.legacy_slug <> 'airport-bkk';
--   delete from public.catalog_places p using public.catalog_cities c
--    where p.city_id = c.id and c.country_id = 'th' and p.legacy_slug <> 'airport-bkk';
--   delete from public.catalog_cities where country_id = 'th' and legacy_slug <> 'bangkok';
--   ⚠️ **`airport-bkk` และ `bangkok` เป็นของ `20260827190000` ห้ามลบ** — เขียนไว้ในคำสั่งแล้ว
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

-- ── เมือง ─────────────────────────────────────────────────────────────────
create temporary table _tc (
  slug text primary key, name_th text not null, name_en text not null, name_local text not null,
  lat double precision not null, lng double precision not null
) on commit drop;

insert into _tc (slug, name_th, name_en, name_local, lat, lng) values
    ('chiang-mai', 'เชียงใหม่', 'Chiang Mai', 'เชียงใหม่', 18.7883, 98.9853),
    ('chiang-rai', 'เชียงราย', 'Chiang Rai', 'เชียงราย', 19.9105, 99.8406),
    ('phuket', 'ภูเก็ต', 'Phuket', 'ภูเก็ต', 7.8804, 98.3923),
    ('krabi', 'กระบี่', 'Krabi', 'กระบี่', 8.0863, 98.9063),
    ('pattaya', 'พัทยา', 'Pattaya', 'พัทยา', 12.9236, 100.8825),
    ('hua-hin', 'หัวหิน', 'Hua Hin', 'หัวหิน', 12.5684, 99.9577),
    ('ayutthaya', 'อยุธยา', 'Ayutthaya', 'พระนครศรีอยุธยา', 14.3532, 100.5689),
    ('kanchanaburi', 'กาญจนบุรี', 'Kanchanaburi', 'กาญจนบุรี', 14.0227, 99.5328),
    ('koh-samui', 'เกาะสมุย', 'Koh Samui', 'เกาะสมุย', 9.512, 100.0136),
    ('sukhothai', 'สุโขทัย', 'Sukhothai', 'สุโขทัย', 17.0078, 99.8237),
    ('nan', 'น่าน', 'Nan', 'น่าน', 18.7756, 100.773),
    ('udon-thani', 'อุดรธานี', 'Udon Thani', 'อุดรธานี', 17.4138, 102.787);

insert into public.catalog_cities (country_id, legacy_slug, name_th, name_en, name_local, lat, lng, timezone)
select 'th', slug, name_th, name_en, name_local, lat, lng, 'Asia/Bangkok' from _tc
on conflict (legacy_slug) do nothing;

-- ── สนามบิน ───────────────────────────────────────────────────────────────
create temporary table _ta (
  slug text primary key, city_slug text not null, picker_hidden boolean not null,
  lat double precision not null, lng double precision not null
) on commit drop;

insert into _ta (slug, city_slug, picker_hidden, lat, lng) values
    ('airport-dmk', 'bangkok', true, 13.9126, 100.6068),
    ('airport-cnx', 'chiang-mai', false, 18.7669, 98.9626),
    ('airport-hkt', 'phuket', false, 8.1132, 98.3169),
    ('airport-kbv', 'krabi', false, 8.0992, 98.9862),
    ('airport-usm', 'koh-samui', false, 9.5478, 100.0623),
    ('airport-udn', 'udon-thani', false, 17.3864, 102.7883);

-- ── สถานที่ ───────────────────────────────────────────────────────────────
create temporary table _tp2 (
  slug text primary key, city_slug text not null, category text not null,
  weather text, lat double precision not null, lng double precision not null
) on commit drop;

insert into _tp2 (slug, city_slug, category, weather, lat, lng) values
    ('grand-palace', 'bangkok', 'culture', 'outdoor', 13.75, 100.4913),
    ('wat-pho', 'bangkok', 'culture', 'mixed', 13.7465, 100.4927),
    ('wat-arun', 'bangkok', 'culture', 'outdoor', 13.7437, 100.4889),
    ('chatuchak', 'bangkok', 'market', 'mixed', 13.7999, 100.5502),
    ('iconsiam', 'bangkok', 'shopping', 'indoor', 13.7264, 100.51),
    ('khaosan-road', 'bangkok', 'nightlife', 'outdoor', 13.759, 100.4977),
    ('jim-thompson-house', 'bangkok', 'culture', 'mixed', 13.7494, 100.5281),
    ('asiatique', 'bangkok', 'shopping', 'outdoor', 13.7047, 100.5033),
    ('doi-suthep', 'chiang-mai', 'culture', 'outdoor', 18.8048, 98.9217),
    ('chiang-mai-old-city', 'chiang-mai', 'sight', 'outdoor', 18.7883, 98.9853),
    ('nimman', 'chiang-mai', 'shopping', 'mixed', 18.7962, 98.9673),
    ('doi-inthanon', 'chiang-mai', 'nature', 'outdoor', 18.5885, 98.4867),
    ('wat-chedi-luang', 'chiang-mai', 'culture', 'outdoor', 18.787, 98.9865),
    ('wat-rong-khun', 'chiang-rai', 'culture', 'mixed', 19.8244, 99.7631),
    ('wat-rong-suea-ten', 'chiang-rai', 'culture', 'mixed', 19.9291, 99.8281),
    ('patong-beach', 'phuket', 'beach', 'outdoor', 7.8964, 98.296),
    ('phuket-big-buddha', 'phuket', 'culture', 'outdoor', 7.8277, 98.3125),
    ('phuket-old-town', 'phuket', 'sight', 'outdoor', 7.8845, 98.388),
    ('promthep-cape', 'phuket', 'viewpoint', 'outdoor', 7.762, 98.3049),
    ('railay-beach', 'krabi', 'beach', 'outdoor', 8.0114, 98.8378),
    ('ao-nang', 'krabi', 'beach', 'outdoor', 8.0324, 98.821),
    ('tiger-cave-temple', 'krabi', 'culture', 'outdoor', 8.1275, 98.9243),
    ('sanctuary-of-truth', 'pattaya', 'culture', 'mixed', 12.972, 100.889),
    ('nong-nooch', 'pattaya', 'nature', 'outdoor', 12.7683, 100.9327),
    ('hua-hin-beach', 'hua-hin', 'beach', 'outdoor', 12.568, 99.96),
    ('hua-hin-night-market', 'hua-hin', 'market', 'outdoor', 12.5698, 99.9576),
    ('wat-mahathat-ayutthaya', 'ayutthaya', 'culture', 'outdoor', 14.3569, 100.5679),
    ('wat-chaiwatthanaram', 'ayutthaya', 'culture', 'outdoor', 14.3419, 100.5457),
    ('bridge-river-kwai', 'kanchanaburi', 'sight', 'outdoor', 14.041, 99.5039),
    ('erawan-falls', 'kanchanaburi', 'nature', 'outdoor', 14.369, 99.144),
    ('chaweng-beach', 'koh-samui', 'beach', 'outdoor', 9.535, 100.062),
    ('samui-big-buddha', 'koh-samui', 'culture', 'outdoor', 9.5678, 100.0603),
    ('sukhothai-historical-park', 'sukhothai', 'culture', 'outdoor', 17.0207, 99.7036),
    ('wat-phumin', 'nan', 'culture', 'mixed', 18.7745, 100.7726),
    ('doi-samer-dao', 'nan', 'viewpoint', 'outdoor', 18.4067, 100.9364),
    ('red-lotus-sea', 'udon-thani', 'nature', 'outdoor', 17.1806, 103.1594),
    ('ban-chiang', 'udon-thani', 'culture', 'mixed', 17.4053, 103.2384);

create temporary table _tn2 (
  slug text not null, locale text not null, priority int not null, name text not null,
  primary key (slug, locale, priority)
) on commit drop;

insert into _tn2 (slug, locale, priority, name) values
    ('grand-palace', 'th', 1, 'พระบรมมหาราชวัง / วัดพระแก้ว'),
    ('grand-palace', 'en', 1, 'The Grand Palace & Wat Phra Kaew'),
    ('wat-pho', 'th', 1, 'วัดโพธิ์ (พระนอน)'),
    ('wat-pho', 'en', 1, 'Wat Pho'),
    ('wat-arun', 'th', 1, 'วัดอรุณ'),
    ('wat-arun', 'en', 1, 'Wat Arun'),
    ('chatuchak', 'th', 1, 'ตลาดนัดจตุจักร'),
    ('chatuchak', 'en', 1, 'Chatuchak Weekend Market'),
    ('iconsiam', 'th', 1, 'ไอคอนสยาม'),
    ('iconsiam', 'en', 1, 'ICONSIAM'),
    ('khaosan-road', 'th', 1, 'ถนนข้าวสาร'),
    ('khaosan-road', 'en', 1, 'Khaosan Road'),
    ('jim-thompson-house', 'th', 1, 'บ้านจิม ทอมป์สัน'),
    ('jim-thompson-house', 'en', 1, 'Jim Thompson House'),
    ('asiatique', 'th', 1, 'เอเชียทีค เดอะ ริเวอร์ฟรอนท์'),
    ('asiatique', 'en', 1, 'Asiatique The Riverfront'),
    ('doi-suthep', 'th', 1, 'วัดพระธาตุดอยสุเทพ'),
    ('doi-suthep', 'en', 1, 'Wat Phra That Doi Suthep'),
    ('chiang-mai-old-city', 'th', 1, 'เมืองเก่าเชียงใหม่'),
    ('chiang-mai-old-city', 'en', 1, 'Chiang Mai Old City'),
    ('nimman', 'th', 1, 'ย่านนิมมานเหมินท์'),
    ('nimman', 'en', 1, 'Nimmanhaemin'),
    ('doi-inthanon', 'th', 1, 'ดอยอินทนนท์'),
    ('doi-inthanon', 'en', 1, 'Doi Inthanon'),
    ('wat-chedi-luang', 'th', 1, 'วัดเจดีย์หลวง'),
    ('wat-chedi-luang', 'en', 1, 'Wat Chedi Luang'),
    ('wat-rong-khun', 'th', 1, 'วัดร่องขุ่น (วัดขาว)'),
    ('wat-rong-khun', 'en', 1, 'Wat Rong Khun (White Temple)'),
    ('wat-rong-suea-ten', 'th', 1, 'วัดร่องเสือเต้น (วัดสีน้ำเงิน)'),
    ('wat-rong-suea-ten', 'en', 1, 'Wat Rong Suea Ten (Blue Temple)'),
    ('patong-beach', 'th', 1, 'หาดป่าตอง'),
    ('patong-beach', 'en', 1, 'Patong Beach'),
    ('phuket-big-buddha', 'th', 1, 'พระใหญ่ภูเก็ต'),
    ('phuket-big-buddha', 'en', 1, 'Phuket Big Buddha'),
    ('phuket-old-town', 'th', 1, 'ย่านเมืองเก่าภูเก็ต'),
    ('phuket-old-town', 'en', 1, 'Phuket Old Town'),
    ('promthep-cape', 'th', 1, 'แหลมพรหมเทพ'),
    ('promthep-cape', 'en', 1, 'Promthep Cape'),
    ('railay-beach', 'th', 1, 'หาดไร่เลย์'),
    ('railay-beach', 'en', 1, 'Railay Beach'),
    ('ao-nang', 'th', 1, 'อ่าวนาง'),
    ('ao-nang', 'en', 1, 'Ao Nang'),
    ('tiger-cave-temple', 'th', 1, 'วัดถ้ำเสือ'),
    ('tiger-cave-temple', 'en', 1, 'Tiger Cave Temple'),
    ('sanctuary-of-truth', 'th', 1, 'ปราสาทสัจธรรม'),
    ('sanctuary-of-truth', 'en', 1, 'Sanctuary of Truth'),
    ('nong-nooch', 'th', 1, 'สวนนงนุช'),
    ('nong-nooch', 'en', 1, 'Nong Nooch Tropical Garden'),
    ('hua-hin-beach', 'th', 1, 'หาดหัวหิน'),
    ('hua-hin-beach', 'en', 1, 'Hua Hin Beach'),
    ('hua-hin-night-market', 'th', 1, 'ตลาดโต้รุ่งหัวหิน'),
    ('hua-hin-night-market', 'en', 1, 'Hua Hin Night Market'),
    ('wat-mahathat-ayutthaya', 'th', 1, 'วัดมหาธาตุ (เศียรพระในรากไม้)'),
    ('wat-mahathat-ayutthaya', 'en', 1, 'Wat Mahathat'),
    ('wat-chaiwatthanaram', 'th', 1, 'วัดไชยวัฒนาราม'),
    ('wat-chaiwatthanaram', 'en', 1, 'Wat Chaiwatthanaram'),
    ('bridge-river-kwai', 'th', 1, 'สะพานข้ามแม่น้ำแคว'),
    ('bridge-river-kwai', 'en', 1, 'Bridge over the River Kwai'),
    ('erawan-falls', 'th', 1, 'น้ำตกเอราวัณ'),
    ('erawan-falls', 'en', 1, 'Erawan Falls'),
    ('chaweng-beach', 'th', 1, 'หาดเฉวง'),
    ('chaweng-beach', 'en', 1, 'Chaweng Beach'),
    ('samui-big-buddha', 'th', 1, 'พระใหญ่เกาะสมุย (วัดพระใหญ่)'),
    ('samui-big-buddha', 'en', 1, 'Big Buddha (Wat Phra Yai)'),
    ('sukhothai-historical-park', 'th', 1, 'อุทยานประวัติศาสตร์สุโขทัย'),
    ('sukhothai-historical-park', 'en', 1, 'Sukhothai Historical Park'),
    ('wat-phumin', 'th', 1, 'วัดภูมินทร์'),
    ('wat-phumin', 'en', 1, 'Wat Phumin'),
    ('doi-samer-dao', 'th', 1, 'ดอยเสมอดาว'),
    ('doi-samer-dao', 'en', 1, 'Doi Samer Dao'),
    ('red-lotus-sea', 'th', 1, 'ทะเลบัวแดง'),
    ('red-lotus-sea', 'en', 1, 'Red Lotus Sea'),
    ('ban-chiang', 'th', 1, 'แหล่งโบราณคดีบ้านเชียง'),
    ('ban-chiang', 'en', 1, 'Ban Chiang Archaeological Site'),
    ('airport-dmk', 'th', 1, 'สนามบินดอนเมือง (DMK)'),
    ('airport-dmk', 'en', 1, 'Don Mueang International Airport'),
    ('airport-cnx', 'th', 1, 'สนามบินเชียงใหม่ (CNX)'),
    ('airport-cnx', 'en', 1, 'Chiang Mai International Airport'),
    ('airport-hkt', 'th', 1, 'สนามบินภูเก็ต (HKT)'),
    ('airport-hkt', 'en', 1, 'Phuket International Airport'),
    ('airport-kbv', 'th', 1, 'สนามบินกระบี่ (KBV)'),
    ('airport-kbv', 'en', 1, 'Krabi International Airport'),
    ('airport-usm', 'th', 1, 'สนามบินสมุย (USM)'),
    ('airport-usm', 'en', 1, 'Samui International Airport'),
    ('airport-udn', 'th', 1, 'สนามบินอุดรธานี (UDN)'),
    ('airport-udn', 'en', 1, 'Udon Thani International Airport');

-- ── ลงคลังจริง ────────────────────────────────────────────────────────────
insert into public.catalog_places
  (city_id, legacy_slug, category, source, transfer_kind, picker_hidden, lat, lng)
select c.id, a.slug, 'transport', 'transfer', 'airport', a.picker_hidden, a.lat, a.lng
  from _ta a
  join public.catalog_cities c on c.legacy_slug = a.city_slug and c.country_id = 'th'
on conflict (legacy_slug) do nothing;

insert into public.catalog_places
  (city_id, legacy_slug, category, source, weather_sensitivity, lat, lng)
select c.id, p.slug, p.category, 'curated', p.weather, p.lat, p.lng
  from _tp2 p
  join public.catalog_cities c on c.legacy_slug = p.city_slug and c.country_id = 'th'
on conflict (legacy_slug) do nothing;

insert into public.catalog_place_names (place_id, city_id, locale, name, priority, source)
select p.id, p.city_id, n.locale, n.name, n.priority, 'curated'
  from _tn2 n
  join public.catalog_places p on p.legacy_slug = n.slug
on conflict (place_id, locale, priority) do nothing;

-- ── ยืนยัน ────────────────────────────────────────────────────────────────
do $verify$
declare n_city int; n_ap int; n_place int; n_name int; n_orphan int; n_wrongcity int; n_empty int; n_hidden int;
begin
  select count(*) into n_city  from public.catalog_cities c join _tc t on c.legacy_slug = t.slug;
  select count(*) into n_ap    from public.catalog_places p join _ta a on p.legacy_slug = a.slug;
  select count(*) into n_place from public.catalog_places p join _tp2 t on p.legacy_slug = t.slug;
  select count(*) into n_name
    from public.catalog_place_names cn
    join public.catalog_places p on p.id = cn.place_id
    join _tn2 n on n.slug = p.legacy_slug and n.locale = cn.locale and n.priority = cn.priority;

  if n_city  <> 12 then raise exception 'เมืองไทยลงไม่ครบ: % ไม่ใช่ 12', n_city; end if;
  if n_ap    <> 6  then raise exception 'สนามบินลงไม่ครบ: % ไม่ใช่ 6', n_ap; end if;
  if n_place <> 37 then raise exception 'สถานที่ลงไม่ครบ: % ไม่ใช่ 37', n_place; end if;
  if n_name  <> 86 then raise exception 'ชื่อลงไม่ครบ: % ไม่ใช่ 86', n_name; end if;

  -- slug สั้นอย่าง `nan` · `phuket` · `krabi` ชนกับของเดิมได้ง่ายที่สุดในชุดนี้
  select count(*) into n_wrongcity
    from public.catalog_places p
    join public.catalog_cities c on c.id = p.city_id
   where p.legacy_slug in (select slug from _tp2 union all select slug from _ta)
     and c.country_id <> 'th';
  if n_wrongcity <> 0 then raise exception 'มี % แห่งผูกกับเมืองนอกประเทศ th', n_wrongcity; end if;

  select count(*) into n_orphan
    from public.catalog_places p
   where p.legacy_slug in (select slug from _tp2 union all select slug from _ta)
     and not exists (select 1 from public.catalog_place_names cn
                      where cn.place_id = p.id and cn.locale = 'th');
  if n_orphan <> 0 then raise exception 'มี % แห่งที่ไม่มีชื่อภาษาไทย — join ผิด', n_orphan; end if;

  -- 🔴 `airport-dmk` ต้องซ่อนเหมือน `airport-bkk` · อีก 5 แห่งต้องไม่ซ่อน
  select count(*) into n_hidden
    from public.catalog_places p join _ta a on p.legacy_slug = a.slug
   where p.picker_hidden <> a.picker_hidden;
  if n_hidden <> 0 then raise exception 'มี % สนามบินที่ picker_hidden ไม่ตรงที่ตั้งใจ', n_hidden; end if;

  -- 🔴 เกณฑ์ที่วัดประสบการณ์ ไม่ใช่จำนวนแถว — **ครอบ 13 เมืองรวมกรุงเทพฯ ที่มีอยู่ก่อน**
  --    ⚠️ ต้องกรอง `source <> 'transfer'` ไม่งั้นเมืองที่มีแต่สนามบินจะผ่านฟรี
  select count(*) into n_empty
    from public.catalog_cities c
   where c.country_id = 'th'
     and not exists (select 1 from public.catalog_places p
                      where p.city_id = c.id and p.source <> 'transfer');
  if n_empty <> 0 then raise exception 'มี % เมืองไทยที่ไม่มีสถานที่เที่ยวเลย — เลือกได้แต่กดเข้าไปว่าง', n_empty; end if;
end $verify$;

commit;
