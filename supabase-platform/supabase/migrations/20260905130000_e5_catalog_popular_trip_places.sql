-- ═══════════════════════════════════════════════════════════════════════════
-- E5 — สถานที่ที่ "ทริปแนะนำ" ต้องใช้ แต่คลังยังไม่มี  (เมือง 1 · สถานที่ 8 · ชื่อ 24)
-- เจ้าของ: P1-Lead · 5 ก.ย. 2026 · ผู้ใช้สั่งเอง
-- ═══════════════════════════════════════════════════════════════════════════
-- > *"ฝากพัฒนาอันนี้ด้วยนะ ลองทำ เมืองยอดฮิตก่อน เช่น ทริปยอดฮิต osaka kyoto nara
-- >  universal / tokyo fuji disney / …"*  · และ *"ลองเอาข้อมูลจากการถาม gemini มาร่วมวิเคราะห์"*
--
-- ── 🔴 ไฟล์นี้ **ไม่ใช่** การขยายคลังทั่วไป — มันปิดช่องที่วัดได้ก่อนเขียนบรรทัดแรก ──────
-- ไล่แผนของ Gemini ทีละจุดแล้วเทียบกับคลังจริง (นับจาก `catalog_place_names` locale `th`):
--   โอซาก้า 7 · เกียวโต 8 · นารา 2 · โตเกียว 12   **มีชื่อไทยครบทุกแห่ง** ⇒ เส้นทางที่ 1 พร้อม
--   ที่ **ไม่มี** และแผนต้องใช้: ฟูจิ/คาวากูจิโกะ (ทั้งเมือง) · โตเกียวดิสนีย์ · กินซ่า · ไคยูคัง
-- 🎯 ***ทริปแนะนำที่ชี้ไปยังสถานที่ที่คลังไม่มี = การ์ดที่กดแล้วได้แผนซึ่งมีวันว่าง —
--    แย่กว่าไม่มีทริปแนะนำใบนั้น*** ⇒ ต้องลงก่อน migration ที่สร้างตัวแผน
--
-- ── ⚠️ ขอบเขต: **เฉพาะญี่ปุ่น** และนั่นคือข้อจำกัดที่รู้ตัว ไม่ใช่การเลือก ──────────────
-- ผู้ใช้ขอ 8 เส้น (เกาหลี · สิงคโปร์ · จีน · เวียดนาม ด้วย) · เมืองพวกนั้น **มีในคลังครบ**
-- แต่สถานที่ในเมืองพวกนั้นมาจาก seed ชุด `20260904*` ซึ่ง **ไม่ได้ใส่ `catalog_place_names`
-- สักแถวเดียว** (ตรวจแล้ว 5 ไฟล์: `020000` `030000` `050000` `080000` `100000` → 0 insert)
-- 🔴 **ยังไม่ได้ยืนยันกับฐาน** — `/api/engine/places` ต้องล็อกอิน ผมยิงจากที่นี่ไม่ได้
--    ⇒ ส่งคำถามให้ P5 (เจ้าของ `scripts/catalog-backfill-names.py`) แล้ว · **ไฟล์นี้ไม่รอคำตอบนั้น**
--    เพราะสิ่งที่มันเพิ่มไม่ทับกับงานนั้น (ของใหม่ล้วน · `on conflict do nothing` ทั้งสองตาราง)
--
-- ── ที่มาของแต่ละแถว ─────────────────────────────────────────────────────────
--   ① ลำดับ/การจับกลุ่ม มาจาก Gemini (Flash-Lite · 5 ก.ย. 2026 · ผ่าน Chrome ของผู้ใช้เอง)
--   ② 🔴 **พิกัดไม่ได้มาจาก Gemini** — Gemini ไม่ได้ให้พิกัด และเราไม่รับพิกัดจากโมเดล
--      `20260827234500` เขียนกติกาข้อนี้ไว้แล้วในรูปของที่อยู่ (*"ที่อยู่ที่ผิด แย่กว่าไม่มีที่อยู่"*)
--      ⇒ พิกัดคือของที่ **ผิดแล้วพาคนไปผิดที่** · ค่าที่ลงเป็นพิกัดแลนด์มาร์กที่ตรวจได้จากแผนที่
--   ③ `weather_sensitivity` ใส่เฉพาะที่รู้จริง ตามกติกาเดิม — **ห้ามเดาจากหมวด**
--      ในชุดนี้: ดิสนีย์ทั้งสองสวนเป็น `mixed` (เครื่องเล่นในร่ม+กลางแจ้ง) · ไคยูคัง `indoor` ล้วน
--      · เจดีย์ชูเรโตะ `outdoor` (ขึ้นบันได 398 ขั้นกลางแจ้ง) · กระเช้า `mixed`
--   ④ 🔴 `category` ของสวนสนุกใช้ `'sight'` **ตามที่ `universal-studios-japan` ใช้อยู่แล้ว**
--      (`20260827234500:93`) — ไม่ใช่เพราะมันถูกที่สุด แต่เพราะ ***หมวดที่ไม่ตรงกันภายในชนิดเดียวกัน
--      แย่กว่าหมวดที่ไม่เพอร์เฟกต์*** · `lib/placeCategory.ts` แม็ป `amusement_park → viewpoint`
--      ซึ่งไม่ตรงกับทั้งสองอัน — **นั่นเป็นงานคนละใบ (แผนข้อ 3.6) อย่าซ่อมที่นี่**
--
-- ── ⚠️ ความเสี่ยงที่รับไว้: สถานที่ซ้ำ ────────────────────────────────────────
-- `20260904020000` ลง JP อีก 293 แห่งจาก Google โดยไม่มีชื่อ ⇒ บางแห่งในไฟล์นี้อาจ
-- **มีอยู่แล้วใต้ slug ที่เจนจาก `google_place_id`** · `on conflict (legacy_slug)` จับไม่ได้
-- 🔴 รับไว้เพราะทางเลือกคือเทียบด้วยพิกัด ซึ่งต้องตั้งเกณฑ์ระยะที่ไม่มีใครมีเหตุผลให้
--    · ตัวชี้ที่ควรเฝ้า: แผนข้อ 10 (ล้างของซ้ำ) หลังชื่อกลับมาครบแล้วค่อยดูว่าซ้ำจริงกี่ใบ
--
-- ── rollback ────────────────────────────────────────────────────────────────
--   🔴 **ห้ามลบด้วย `source = 'curated'`** — เป็นค่า DEFAULT ของคอลัมน์ จะกวาด fixture ไปด้วย
--   ลบด้วย slug ที่ไฟล์นี้เขียนเท่านั้น (ดูรายการใน `_p` ข้างล่าง) แล้วค่อยลบเมือง `fuji-kawaguchiko`
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL/DML ทุกบรรทัด ──────
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
-- 1. เมืองใหม่ — ฟูจิ/คาวากูจิโกะ
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **ชื่อไทยเป็น "ฟูจิ (คาวากูจิโกะ)" ไม่ใช่ "คาวากูจิโกะ" เฉย ๆ** — คนไทยค้นคำว่า *ฟูจิ*
--    ไม่ได้ค้นชื่อเมือง · และแถวนี้ครอบพื้นที่รอบทะเลสาบทั้งย่าน ไม่ใช่เขตปกครองเป๊ะ ๆ
-- ⚠️ **เจดีย์ชูเรโตะอยู่ในเขตฟูจิโยชิดะจริง ๆ ไม่ใช่ฟูจิคาวากูจิโกะ** — ผูกมาที่นี่โดยรู้ตัว
--    เพราะผู้ใช้เดินทางเป็น *ย่าน* ไม่ใช่เป็น *เขตปกครอง* · จดไว้ให้คนที่มาเจอทีหลังไม่คิดว่าเป็นบั๊ก
insert into public.catalog_cities (country_id, legacy_slug, name_th, name_en, name_local, lat, lng, timezone)
values ('jp', 'fuji-kawaguchiko', 'ฟูจิ (คาวากูจิโกะ)', 'Fujikawaguchiko', '富士河口湖',
        35.4972, 138.7546, 'Asia/Tokyo')
on conflict (legacy_slug) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. สถานที่ + ชื่อ — พักไว้ก่อน แล้วนับด้วยการ join (รูปเดียวกับ `20260827234500`)
-- ───────────────────────────────────────────────────────────────────────────
create temporary table _p (
  slug text primary key, city_slug text not null, category text not null,
  weather text, lat double precision not null, lng double precision not null
) on commit drop;

insert into _p (slug, city_slug, category, weather, lat, lng) values
    -- ฟูจิ/คาวากูจิโกะ — วันที่ 2 ของเส้นทาง "โตเกียว-ฟูจิ-ดิสนีย์"
    ('lake-kawaguchiko',    'fuji-kawaguchiko', 'nature',   'outdoor', 35.5171, 138.7519),
    ('chureito-pagoda',     'fuji-kawaguchiko', 'culture',  'outdoor', 35.4004, 138.8003),
    ('oishi-park',          'fuji-kawaguchiko', 'nature',   'outdoor', 35.5219, 138.7357),
    ('kachi-kachi-ropeway', 'fuji-kawaguchiko', 'viewpoint','mixed',   35.5045, 138.7620),
    -- โตเกียว — สวนสนุกสองใบ + ย่านช้อปที่แผนใช้ แต่คลังยังไม่มี
    ('tokyo-disneyland',    'tokyo', 'sight',    'mixed',  35.6329, 139.8804),
    ('tokyo-disneysea',     'tokyo', 'sight',    'mixed',  35.6267, 139.8850),
    ('ginza',               'tokyo', 'shopping', 'mixed',  35.6717, 139.7650),
    -- โอซาก้า — ปลายทางย่านเทมโปซังของวันสุดท้าย (Gemini เสนอ "ท่าเรือ/เทมโปซัง" กว้างไป
    -- ⇒ ลงเป็นแลนด์มาร์กที่ระบุตัวได้จริงแทน ตามข้อกำหนด *"เฉพาะแลนด์มาร์กที่คนรู้จัก"*)
    ('osaka-aquarium-kaiyukan', 'osaka', 'sight', 'indoor', 34.6545, 135.4289);

create temporary table _pn (
  slug text not null, locale text not null, priority int not null, name text not null,
  primary key (slug, locale, priority)
) on commit drop;

insert into _pn (slug, locale, priority, name) values
    ('lake-kawaguchiko',    'th', 1, 'ทะเลสาบคาวากูจิโกะ'),
    ('lake-kawaguchiko',    'en', 1, 'Lake Kawaguchiko'),
    ('lake-kawaguchiko',    'ja', 1, '河口湖'),
    ('chureito-pagoda',     'th', 1, 'เจดีย์ชูเรโตะ'),
    ('chureito-pagoda',     'en', 1, 'Chureito Pagoda'),
    ('chureito-pagoda',     'ja', 1, '新倉山浅間公園（忠霊塔）'),
    ('oishi-park',          'th', 1, 'สวนโออิชิ'),
    ('oishi-park',          'en', 1, 'Oishi Park'),
    ('oishi-park',          'ja', 1, '大石公園'),
    ('kachi-kachi-ropeway', 'th', 1, 'กระเช้าคาชิคาชิยามะ'),
    ('kachi-kachi-ropeway', 'en', 1, 'Mt. Kachi Kachi Ropeway'),
    ('kachi-kachi-ropeway', 'ja', 1, 'カチカチ山ロープウェイ'),
    ('tokyo-disneyland',    'th', 1, 'โตเกียวดิสนีย์แลนด์'),
    ('tokyo-disneyland',    'en', 1, 'Tokyo Disneyland'),
    ('tokyo-disneyland',    'ja', 1, '東京ディズニーランド'),
    ('tokyo-disneysea',     'th', 1, 'โตเกียวดิสนีย์ซี'),
    ('tokyo-disneysea',     'en', 1, 'Tokyo DisneySea'),
    ('tokyo-disneysea',     'ja', 1, '東京ディズニーシー'),
    ('ginza',               'th', 1, 'ย่านกินซ่า'),
    ('ginza',               'en', 1, 'Ginza'),
    ('ginza',               'ja', 1, '銀座'),
    ('osaka-aquarium-kaiyukan', 'th', 1, 'พิพิธภัณฑ์สัตว์น้ำไคยูคัง'),
    ('osaka-aquarium-kaiyukan', 'en', 1, 'Osaka Aquarium Kaiyukan'),
    ('osaka-aquarium-kaiyukan', 'ja', 1, '海遊館');

insert into public.catalog_places
  (city_id, legacy_slug, category, source, weather_sensitivity, lat, lng)
select c.id, p.slug, p.category, 'curated', p.weather, p.lat, p.lng
  from _p p
  join public.catalog_cities c on c.legacy_slug = p.city_slug and c.country_id = 'jp'
on conflict (legacy_slug) do nothing;

insert into public.catalog_place_names (place_id, city_id, locale, name, priority, source)
select pl.id, pl.city_id, n.locale, n.name, n.priority, 'curated'
  from _pn n
  join public.catalog_places pl on pl.legacy_slug = n.slug
on conflict (place_id, locale, priority) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. ยืนยัน — ทุกเคสต้องล้มได้จริง ไม่ใช่คำบรรยาย
-- ───────────────────────────────────────────────────────────────────────────
do $verify$
declare n_city int; n_place int; n_name int; n_orphan int; n_wrongcity int; n_empty int;
begin
  select count(*) into n_city
    from public.catalog_cities where country_id = 'jp' and legacy_slug = 'fuji-kawaguchiko';
  if n_city <> 1 then raise exception 'เมืองฟูจิ/คาวากูจิโกะลงไม่สำเร็จ: % ไม่ใช่ 1', n_city; end if;

  select count(*) into n_place from public.catalog_places pl join _p p on pl.legacy_slug = p.slug;
  if n_place <> 8 then raise exception 'สถานที่ลงไม่ครบ: % ไม่ใช่ 8', n_place; end if;

  select count(*) into n_name
    from public.catalog_place_names cn
    join public.catalog_places pl on pl.id = cn.place_id
    join _pn n on n.slug = pl.legacy_slug and n.locale = cn.locale and n.priority = cn.priority;
  if n_name <> 24 then raise exception 'ชื่อลงไม่ครบ: % ไม่ใช่ 24', n_name; end if;

  -- 🔴 `join … and c.country_id = 'jp'` ข้างบนกันเมืองผิดประเทศไว้แล้ว **แต่มันกันแบบเงียบ**
  --    (join ไม่ match = แถวหายไปเฉย ๆ) · เคสนับ 8 จับได้ว่าพลาด แต่ไม่บอกว่าทำไม → เคสนี้บอก
  select count(*) into n_wrongcity
    from public.catalog_places pl
    join _p p on pl.legacy_slug = p.slug
    join public.catalog_cities c on c.id = pl.city_id
   where c.country_id <> 'jp';
  if n_wrongcity <> 0 then raise exception 'มี % แห่งผูกกับเมืองนอกประเทศ jp', n_wrongcity; end if;

  select count(*) into n_orphan
    from public.catalog_places pl join _p p on pl.legacy_slug = p.slug
   where not exists (select 1 from public.catalog_place_names cn
                      where cn.place_id = pl.id and cn.locale = 'th');
  if n_orphan <> 0 then raise exception 'มี % แห่งที่ไม่มีชื่อภาษาไทย — join ผิด', n_orphan; end if;

  -- 🔴 **เกณฑ์เดียวในไฟล์นี้ที่วัด *สิ่งที่ผู้ใช้เห็น* ไม่ใช่จำนวนแถว** (ยกมาจาก `20260827234500`)
  --    เมืองใหม่ที่เลือกได้ในฟอร์ม แต่เปิดเข้าไปแล้วว่าง = ทางตันที่เราเพิ่งสร้างเอง
  --    ⚠️ นับเฉพาะที่ `source <> 'transfer'` — สนามบินไม่ใช่ที่เที่ยว นับด้วยจะผ่านฟรี
  select count(*) into n_empty
    from public.catalog_cities c
   where c.country_id = 'jp'
     and not exists (select 1 from public.catalog_places pl
                      where pl.city_id = c.id and pl.source <> 'transfer');
  if n_empty <> 0 then raise exception 'มี % เมืองญี่ปุ่นที่ไม่มีสถานที่เที่ยวเลย — เลือกได้แต่กดเข้าไปว่าง', n_empty; end if;
end $verify$;

commit;
