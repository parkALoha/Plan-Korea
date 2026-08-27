-- ═══════════════════════════════════════════════════════════════════════════
-- E2 (ขยายขอบเขต · ปิดเมืองทางตันใบสุดท้าย) — seed สถานที่โฮจิมินห์ 8 แห่ง
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมไฟล์เล็ก ๆ นี้ถึงจำเป็น ───────────────────────────────────────────
-- P8 มินท์ `E4-AC7` โดยเสนอเกณฑ์ว่า **ทั้ง 4 ประเทศต้องมีสถานที่พอสร้างทริปทดสอบได้จริง**
-- ผมเอาเกณฑ์นั้นไปวัดกับฐานจริงทั้ง 4 ประเทศแทนที่จะดูแค่ญี่ปุ่นที่เป็นต้นเรื่อง:
--   TH  เมือง  1 · ทางตัน  1 → bangkok            (ปิดโดย `20260827235500`)
--   JP  เมือง 22 · ทางตัน 22 → ทุกเมือง            (ปิดโดย `20260827234500`)
--   KR  เมือง  5 · ทางตัน  0 ✅
--   VN  เมือง  2 · ทางตัน  1 → **hcmc**            ← ไม่มีใครเห็นตัวนี้
--
-- 🎯 **`hcmc` คือตัวที่ซ่อนอยู่หลังตัวเลขรวม** — เวียดนามมีสถานที่ 10 แห่ง ซึ่ง "ดูมีของ"
--    แต่ **ทั้ง 10 อยู่ที่ฮานอยหมด** · ถ้าถามว่า *"เวียดนามมีสถานที่ไหม"* คำตอบคือมี
--    ถ้าถามว่า *"เมืองไหนกดเข้าไปแล้วว่าง"* คำตอบคือโฮจิมินห์ — **คนละคำถาม คนละคำตอบ**
--    · ตระกูลเดียวกับ 766 แถวที่เคยหลอกผม: **ตัวเลขรวมที่ไม่เป็นศูนย์ ไม่ได้แปลว่าไม่มีรู**
--    · และ `hcmc` เข้าคลังมาด้วยเหตุผลเดียวกับกรุงเทพฯ เป๊ะ — เป็นเมืองสังกัดของ `airport-sgn`
--      (จุดต่อเครื่องขากลับ) **ไม่เคยถูกใส่ในฐานะปลายทาง**
--
-- ── ตามแบบเดียวกับชุดญี่ปุ่น/ไทย ─────────────────────────────────────────
--   · `address_local` ว่าง (`D55` — ที่อยู่ผิดแย่กว่าไม่มี) · lat/lng พอสำหรับนำทาง
--   · `weather_sensitivity` เฉพาะที่รู้จริง — `culture` ในชุดนี้กระจายทั้งสามค่าอีกเช่นกัน:
--     พิพิธภัณฑ์สงคราม `indoor` · มหาวิหารนอเทรอดาม `outdoor` · ทำเนียบเอกราช `mixed`
--   · locale ท้องถิ่น = **`vi`** (ไม่ใช่ `ja`/`ko` — เกือบพลาดรูปนี้ตอน `20260827170000`)
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   🔴 ห้ามลบด้วย `source` — `'curated'` เป็น DEFAULT · ลบด้วย slug ของไฟล์นี้เท่านั้น
--   delete from public.catalog_place_names cn using public.catalog_places p
--    where cn.place_id = p.id and p.legacy_slug in ('ben-thanh-market','war-remnants-museum',
--      'notre-dame-saigon','saigon-central-post-office','bui-vien-street','independence-palace',
--      'cu-chi-tunnels','landmark-81');
--   delete from public.catalog_places where legacy_slug in (<slug ชุดเดียวกันข้างบน>);
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

create temporary table _vp (
  slug text primary key, category text not null, weather text,
  lat double precision not null, lng double precision not null
) on commit drop;

insert into _vp (slug, category, weather, lat, lng) values
    ('ben-thanh-market',          'market',    'mixed',   10.7725, 106.6980),
    ('war-remnants-museum',       'culture',   'indoor',  10.7797, 106.6922),
    ('notre-dame-saigon',         'culture',   'outdoor', 10.7797, 106.6990),
    ('saigon-central-post-office','culture',   'indoor',  10.7799, 106.6999),
    ('bui-vien-street',           'nightlife', 'outdoor', 10.7674, 106.6928),
    ('independence-palace',       'culture',   'mixed',   10.7772, 106.6958),
    ('cu-chi-tunnels',            'culture',   'outdoor', 11.1436, 106.4638),
    ('landmark-81',               'viewpoint', 'indoor',  10.7950, 106.7218);

create temporary table _vn2 (
  slug text not null, locale text not null, priority int not null, name text not null,
  primary key (slug, locale, priority)
) on commit drop;

insert into _vn2 (slug, locale, priority, name) values
    ('ben-thanh-market',          'th', 1, 'ตลาดเบ๊นถั่ญ'),
    ('ben-thanh-market',          'en', 1, 'Bến Thành Market'),
    ('ben-thanh-market',          'vi', 1, 'Chợ Bến Thành'),
    ('war-remnants-museum',       'th', 1, 'พิพิธภัณฑ์ร่องรอยสงคราม'),
    ('war-remnants-museum',       'en', 1, 'War Remnants Museum'),
    ('war-remnants-museum',       'vi', 1, 'Bảo tàng Chứng tích Chiến tranh'),
    ('notre-dame-saigon',         'th', 1, 'มหาวิหารนอเทรอดาม ไซ่ง่อน'),
    ('notre-dame-saigon',         'en', 1, 'Saigon Notre-Dame Basilica'),
    ('notre-dame-saigon',         'vi', 1, 'Nhà thờ Đức Bà Sài Gòn'),
    ('saigon-central-post-office','th', 1, 'ที่ทำการไปรษณีย์กลางไซ่ง่อน'),
    ('saigon-central-post-office','en', 1, 'Saigon Central Post Office'),
    ('saigon-central-post-office','vi', 1, 'Bưu điện Trung tâm Sài Gòn'),
    ('bui-vien-street',           'th', 1, 'ถนนบุ่ยเวียน'),
    ('bui-vien-street',           'en', 1, 'Bui Vien Walking Street'),
    ('bui-vien-street',           'vi', 1, 'Phố đi bộ Bùi Viện'),
    ('independence-palace',       'th', 1, 'ทำเนียบเอกราช'),
    ('independence-palace',       'en', 1, 'Independence Palace'),
    ('independence-palace',       'vi', 1, 'Dinh Độc Lập'),
    ('cu-chi-tunnels',            'th', 1, 'อุโมงค์กู๋จี'),
    ('cu-chi-tunnels',            'en', 1, 'Củ Chi Tunnels'),
    ('cu-chi-tunnels',            'vi', 1, 'Địa đạo Củ Chi'),
    ('landmark-81',               'th', 1, 'แลนด์มาร์ก 81'),
    ('landmark-81',               'en', 1, 'Landmark 81 SkyView'),
    ('landmark-81',               'vi', 1, 'Landmark 81');

insert into public.catalog_places
  (city_id, legacy_slug, category, source, weather_sensitivity, lat, lng)
select c.id, v.slug, v.category, 'curated', v.weather, v.lat, v.lng
  from _vp v
  cross join (select id from public.catalog_cities
               where legacy_slug = 'hcmc' and country_id = 'vn') c
on conflict (legacy_slug) do nothing;

insert into public.catalog_place_names (place_id, city_id, locale, name, priority, source)
select p.id, p.city_id, n.locale, n.name, n.priority, 'curated'
  from _vn2 n
  join public.catalog_places p on p.legacy_slug = n.slug
on conflict (place_id, locale, priority) do nothing;

do $verify$
declare n_place int; n_name int; n_orphan int; n_empty int;
begin
  select count(*) into n_place from public.catalog_places p join _vp v on p.legacy_slug = v.slug;
  select count(*) into n_name
    from public.catalog_place_names cn
    join public.catalog_places p on p.id = cn.place_id
    join _vn2 n on n.slug = p.legacy_slug and n.locale = cn.locale and n.priority = cn.priority;

  -- 🔴 `cross join` ข้างบนคืน 0 แถวถ้าหาเมือง `hcmc` ไม่เจอ — **เงียบสนิท ไม่ error**
  --    เคสนี้คือสิ่งเดียวที่จะบอก · เขียน `cross join` แทน `join` ตั้งใจ เพราะทุกแถวไปเมืองเดียวกัน
  if n_place <> 8  then raise exception 'สถานที่ลงไม่ครบ: % ไม่ใช่ 8 (ถ้าเป็น 0 = หาเมือง hcmc ไม่เจอ)', n_place; end if;
  if n_name  <> 24 then raise exception 'ชื่อลงไม่ครบ: % ไม่ใช่ 24', n_name; end if;

  select count(*) into n_orphan
    from public.catalog_places p join _vp v on p.legacy_slug = v.slug
   where not exists (select 1 from public.catalog_place_names cn
                      where cn.place_id = p.id and cn.locale = 'th');
  if n_orphan <> 0 then raise exception 'มี % แห่งที่ไม่มีชื่อภาษาไทย', n_orphan; end if;

  select count(*) into n_empty
    from public.catalog_cities c
   where c.country_id = 'vn'
     and not exists (select 1 from public.catalog_places p
                      where p.city_id = c.id and p.source <> 'transfer');
  if n_empty <> 0 then raise exception 'มี % เมืองเวียดนามที่ยังกดเข้าไปว่าง', n_empty; end if;
end $verify$;

commit;
