-- ═══════════════════════════════════════════════════════════════════════════
-- E2 (ตกหล่น · ต่อจาก `20260827170000`) — seed จุดเปลี่ยนเส้นทาง: สนามบิน/สถานี 15 แห่ง
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมต้องมีไฟล์ที่สอง ──────────────────────────────────────────────────
-- `20260827170000` seed `data/places.ts` (72 แห่ง) และ **จดไว้เองในหัวไฟล์ว่าไม่ครอบ
-- `data/transferPoints.ts`** เพราะมันเป็นก้อนของตัวเองและมีเมืองที่คลังยังไม่มี
--
-- 🔴 **P2 ชนกำแพงนั้นภายในชั่วโมงเดียวกัน** — `TransferEditModal` ("✈️ ไปสนามบิน/สถานี")
--    ส่ง `airport-pus` แล้วได้ `400 PLACE_NOT_IN_CATALOG` · **3 ใน 4 โมดัลผ่าน ตัวนี้ตัวเดียวที่ไม่ผ่าน**
-- 🎯 **ข้อจำกัดที่จดไว้ ไม่ได้แปลว่าไม่มีใครเจอ — มันแปลว่าคนที่เจอจะอ่านเข้าใจว่าทำไม**
--    ข้อความ error บอกตรง ๆ ว่าคลังยังไม่ถูก seed → P2 รายงานถูกจุดทันที ไม่ต้องเดา ไม่ต้องไล่โค้ด
--
-- ── ⚠️ ข้อความใน error ของ `stops/route.ts` ล้าสมัยแล้วหลังไฟล์นี้ ──────────
--    มันเขียนว่า *"คลังในฐานยังไม่ถูก seed — E7"* · ทั้งสองส่วนผิดตอนนี้: คลัง seed แล้ว
--    และมันไม่เคยเป็นงานของ `E7` (ดู `P-75`) · **แก้ข้อความนั้นแยกคอมมิต ไม่ปนกับ migration**
--
-- ── สิ่งที่ต่างจากไฟล์แรก ─────────────────────────────────────────────────
--   ① **`source = 'transfer'` ไม่ใช่ `'curated'`** — และ `transfer_kind` เขียนได้เฉพาะเมื่อ source
--      เป็น `'transfer'` (`catalog_places_transfer_kind_only_for_transfer`)
--   ② **`picker_hidden`** — สนามบิน/สถานีไม่ใช่ที่เที่ยว ไม่ควรโผล่ในลิสต์ให้เลือกเพิ่มลงวัน
--      `data/transferPoints.ts:28` เขียนเหตุผลนี้ไว้เอง · **แต่ต้อง resolve ได้** (จุดแวะชนิด transfer
--      ชี้มาที่แถวนี้จริง) → `catalogPlaceById()` ไม่กรอง `picker_hidden` โดยตั้งใจ
--      🔴 มีแค่ 2 ใน 15 แห่งที่ `pickerHidden` (สนามบินต้นทาง/ต่อเครื่อง) ที่เหลือ `false` ตามไฟล์ต้นทาง
--   ③ **เมืองใหม่ 2 + ประเทศใหม่ 1** — `bangkok` (ไทย) · `hcmc` (เวียดนาม) มีเฉพาะใน transfer points
--      (`Day["city"]` ยังเป็น 6 เมืองเดิม ไม่มีวันไหนอยู่สองเมืองนี้)
--   ④ **`priority` ถูกใช้จริงเป็นครั้งแรก** — สนามบินสุวรรณภูมิมีทั้ง `nameTh` และ `nameLocal`
--      ที่เป็นภาษาไทยทั้งคู่ ("สนามบินสุวรรณภูมิ (BKK)" · "ท่าอากาศยานสุวรรณภูมิ")
--      → ชนคีย์ `(place_id, locale, priority)` ถ้าใส่ priority 1 ทั้งคู่ · ตัวที่สองเป็น **priority 2**
--      **ไม่ใช่ทิ้ง** — ชื่อทางการใช้ค้นในแอปนำทางได้ดีกว่าชื่อเรียกสั้น
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   🔴 **ห้ามลบด้วย `where source = 'transfer'` ถ้าวันหนึ่งมี transfer จากที่อื่น** — วันนี้ปลอดภัย
--      เพราะไฟล์นี้เป็นที่เดียวที่เขียน `'transfer'` แต่ให้ตรวจก่อนเสมอ (บทเรียนจาก `'curated'`)
--   delete from public.catalog_place_names cn using public.catalog_places p
--    where cn.place_id = p.id and p.source = 'transfer';
--   delete from public.catalog_places where source = 'transfer';
--   delete from public.catalog_cities where legacy_slug in ('bangkok','hcmc');
--   delete from public.catalog_countries where id = 'th';
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

-- ── ประเทศ/เมืองที่ยังไม่มี ────────────────────────────────────────────────
insert into public.catalog_countries (id, name_th, name_en) values
    ('th', 'ไทย', 'Thailand')
on conflict (id) do nothing;

insert into public.catalog_cities (country_id, legacy_slug, name_th, name_en, name_local, lat, lng, timezone) values
    ('th', 'bangkok', 'กรุงเทพฯ',   'Bangkok',           'กรุงเทพมหานคร',            13.7563, 100.5018, 'Asia/Bangkok'),
    ('vn', 'hcmc',    'โฮจิมินห์', 'Ho Chi Minh City',  'Thành phố Hồ Chí Minh',   10.8231, 106.6297, 'Asia/Ho_Chi_Minh')
on conflict (legacy_slug) do nothing;

-- ── รายการที่ตั้งใจ seed — พักไว้ก่อน แล้วนับด้วยการ join (บทเรียนจาก 20260827170000) ──
create temporary table _tp (
  slug text primary key, city_slug text not null, category text not null,
  transfer_kind text not null, picker_hidden boolean not null,
  lat double precision not null, lng double precision not null, address_local text
) on commit drop;

insert into _tp (slug, city_slug, category, transfer_kind, picker_hidden, lat, lng, address_local) values
    ('airport-bkk', 'bangkok', 'transport', 'airport', true, 13.6818969, 100.7468694, '999 หมู่ที่ 1 หนองปรือ อำเภอบางพลี สมุทรปราการ 10540'),
    ('airport-sgn', 'hcmc', 'transport', 'airport', true, 10.8169828, 106.6565808, 'Trường Sơn, Tân Sơn Hòa, Hồ Chí Minh 705000'),
    ('airport-han', 'hanoi', 'transport', 'airport', false, 21.2212, 105.8072, 'Phú Minh, Sóc Sơn, Hà Nội, Việt Nam'),
    ('airport-pus', 'busan', 'transport', 'airport', false, 35.1795, 128.9382, '부산광역시 강서구 공항진입로 108'),
    ('airport-icn', 'seoul', 'transport', 'airport', false, 37.4491, 126.4506, '인천광역시 중구 공항로 272'),
    ('station-busan-nopo-bus', 'busan', 'transport', 'station', false, 35.2847494, 129.0953841, '부산광역시 금정구 노포동 133'),
    ('station-sokcho-express-bus', 'sokcho', 'transport', 'station', false, 38.1905088, 128.5987419, '강원특별자치도 속초시 동해대로 3988'),
    ('station-sokcho-intercity-bus', 'sokcho', 'transport', 'station', false, 38.2109611, 128.591111, '강원특별자치도 속초시 장안로 16'),
    ('station-gangneung-bus', 'gangneung', 'transport', 'station', false, 37.754515, 128.879615, '강원특별자치도 강릉시 하슬라로 15'),
    ('station-gangneung', 'gangneung', 'transport', 'station', false, 37.7644776, 128.8995536, '강원특별자치도 강릉시 용지로 176'),
    ('station-seoul', 'seoul', 'transport', 'station', false, 37.555946, 126.9723117, '서울특별시 중구 소공동 세종대로18길 2'),
    ('station-cheongnyangni', 'seoul', 'transport', 'station', false, 37.581381, 127.048958, '서울특별시 동대문구 왕산로 214'),
    ('station-suwon', 'suwon', 'transport', 'station', false, 37.26644, 126.999408, '대한민국 경기도 수원시 팔달구 덕영대로 924'),
    ('station-hwaseo', 'suwon', 'transport', 'station', false, 37.28399, 126.989581, '대한민국 경기도 수원시 팔달구 화서동 460-14'),
    ('station-east-seoul-bus', 'seoul', 'transport', 'station', false, 37.5333713, 127.0933675, '서울특별시 광진구 구의제3동 강변역로 50');

create temporary table _tpn (
  slug text not null, locale text not null, priority int not null, name text not null,
  primary key (slug, locale, priority)
) on commit drop;

insert into _tpn (slug, locale, priority, name) values
    ('airport-bkk', 'th', 1, 'สนามบินสุวรรณภูมิ (BKK)'),
    ('airport-bkk', 'en', 1, 'Suvarnabhumi Airport'),
    ('airport-bkk', 'th', 2, 'ท่าอากาศยานสุวรรณภูมิ'),
    ('airport-sgn', 'th', 1, 'สนามบินเตินเซินเญิ้ต (SGN)'),
    ('airport-sgn', 'en', 1, 'Tan Son Nhat International Airport'),
    ('airport-sgn', 'vi', 1, 'Cảng hàng không quốc tế Tân Sơn Nhất'),
    ('airport-han', 'th', 1, 'สนามบินโหน่ยบ่าย (HAN)'),
    ('airport-han', 'en', 1, 'Noi Bai International Airport'),
    ('airport-han', 'vi', 1, 'Sân bay quốc tế Nội Bài'),
    ('airport-pus', 'th', 1, 'สนามบินกิมแฮ (PUS)'),
    ('airport-pus', 'en', 1, 'Gimhae International Airport'),
    ('airport-pus', 'ko', 1, '김해국제공항'),
    ('airport-icn', 'th', 1, 'สนามบินอินชอน (ICN)'),
    ('airport-icn', 'en', 1, 'Incheon International Airport'),
    ('airport-icn', 'ko', 1, '인천국제공항'),
    ('station-busan-nopo-bus', 'th', 1, 'สถานีขนส่งปูซาน (โนโพ)'),
    ('station-busan-nopo-bus', 'en', 1, 'Busan Central Bus Terminal'),
    ('station-busan-nopo-bus', 'ko', 1, '부산종합버스터미널'),
    ('station-sokcho-express-bus', 'th', 1, 'สถานีขนส่งด่วนซกโช'),
    ('station-sokcho-express-bus', 'en', 1, 'Sokcho Express Bus Terminal'),
    ('station-sokcho-express-bus', 'ko', 1, '속초고속버스터미널'),
    ('station-sokcho-intercity-bus', 'th', 1, 'สถานีขนส่งระหว่างเมืองซกโช'),
    ('station-sokcho-intercity-bus', 'en', 1, 'Sokcho Intercity Bus Terminal'),
    ('station-sokcho-intercity-bus', 'ko', 1, '속초시외버스터미널'),
    ('station-gangneung-bus', 'th', 1, 'สถานีขนส่งคังนึง'),
    ('station-gangneung-bus', 'en', 1, 'Gangneung Bus Terminal'),
    ('station-gangneung-bus', 'ko', 1, '강릉고속버스터미널'),
    ('station-gangneung', 'th', 1, 'สถานีรถไฟคังนึง (KTX)'),
    ('station-gangneung', 'en', 1, 'Gangneung Station'),
    ('station-gangneung', 'ko', 1, '강릉역'),
    ('station-seoul', 'th', 1, 'สถานีโซล (KTX)'),
    ('station-seoul', 'en', 1, 'Seoul Station'),
    ('station-seoul', 'ko', 1, '서울역'),
    ('station-cheongnyangni', 'th', 1, 'สถานีชองรยังนี'),
    ('station-cheongnyangni', 'en', 1, 'Cheongnyangni Station'),
    ('station-cheongnyangni', 'ko', 1, '청량리역'),
    ('station-suwon', 'th', 1, 'สถานีซูวอน'),
    ('station-suwon', 'en', 1, 'Suwon Station'),
    ('station-suwon', 'ko', 1, '수원역'),
    ('station-hwaseo', 'th', 1, 'สถานีฮวาซอ (ติด Starfield)'),
    ('station-hwaseo', 'en', 1, 'Hwaseo Station'),
    ('station-hwaseo', 'ko', 1, '화서역'),
    ('station-east-seoul-bus', 'th', 1, 'สถานีขนส่งตงโซล'),
    ('station-east-seoul-bus', 'en', 1, 'East Seoul Bus Terminal'),
    ('station-east-seoul-bus', 'ko', 1, '동서울종합터미널');

-- ── ลงคลังจริง ────────────────────────────────────────────────────────────
insert into public.catalog_places
  (city_id, legacy_slug, category, source, transfer_kind, picker_hidden, lat, lng, address_local)
select c.id, t.slug, t.category, 'transfer', t.transfer_kind, t.picker_hidden, t.lat, t.lng, t.address_local
  from _tp t
  join public.catalog_cities c on c.legacy_slug = t.city_slug
on conflict (legacy_slug) do nothing;

insert into public.catalog_place_names (place_id, city_id, locale, name, priority, source)
select p.id, p.city_id, n.locale, n.name, n.priority, 'curated'
  from _tpn n
  join public.catalog_places p on p.legacy_slug = n.slug
on conflict (place_id, locale, priority) do nothing;

-- ── ยืนยัน — นับเฉพาะของที่ไฟล์นี้ตั้งใจลง ────────────────────────────────
do $verify$
declare n_city int; n_place int; n_name int; n_orphan int; n_kind int;
begin
  select count(*) into n_city from public.catalog_cities where legacy_slug in ('bangkok','hcmc');
  select count(*) into n_place from public.catalog_places p join _tp t on p.legacy_slug = t.slug;
  select count(*) into n_name
    from public.catalog_place_names cn
    join public.catalog_places p on p.id = cn.place_id
    join _tpn n on n.slug = p.legacy_slug and n.locale = cn.locale and n.priority = cn.priority;

  if n_city  <> 2  then raise exception 'เมืองใหม่ลงไม่ครบ: % ไม่ใช่ 2', n_city; end if;
  if n_place <> 15 then raise exception 'จุดเปลี่ยนเส้นทางลงไม่ครบ: % ไม่ใช่ 15', n_place; end if;
  if n_name  <> 45 then raise exception 'ชื่อลงไม่ครบ: % ไม่ใช่ 45', n_name; end if;

  -- 🔴 ทุกแถวต้องมี `transfer_kind` จริง — ถ้า null แปลว่า constraint ปล่อยผ่านหรือ insert ตกคอลัมน์
  select count(*) into n_kind
    from public.catalog_places p join _tp t on p.legacy_slug = t.slug
   where p.transfer_kind is null or p.source <> 'transfer';
  if n_kind <> 0 then raise exception 'มี % แถวที่ transfer_kind/source ไม่ถูกตั้ง', n_kind; end if;

  select count(*) into n_orphan
    from public.catalog_places p join _tp t on p.legacy_slug = t.slug
   where not exists (select 1 from public.catalog_place_names cn
                      where cn.place_id = p.id and cn.locale = 'th');
  if n_orphan <> 0 then raise exception 'มี % แถวที่ไม่มีชื่อภาษาไทย — join ผิด', n_orphan; end if;
end $verify$;

commit;
