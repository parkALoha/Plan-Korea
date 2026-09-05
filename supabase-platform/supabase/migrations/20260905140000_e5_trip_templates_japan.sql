-- ═══════════════════════════════════════════════════════════════════════════
-- E5 — ทริปแนะนำใบจริง 2 ใบ (ญี่ปุ่น)  ·  โอซาก้า 5 วัน 4 คืน · โตเกียว 6 วัน 5 คืน
-- เจ้าของ: P1-Lead · 5 ก.ย. 2026 · ผู้ใช้สั่งเอง
-- ═══════════════════════════════════════════════════════════════════════════
-- > *"ลองทำ เมืองยอดฮิตก่อน เช่น ทริปยอดฮิต osaka kyoto nara universal / tokyo fuji disney / …"*
--
-- ## 🔴 ทำไมเป็น migration ทั้งที่ดีไซน์บอกว่า *"ทริปแนะนำ = ทริปจริงที่ทีมจัดผ่านหน้าเว็บ"*
-- `20260904180000` เลือกทางนั้นด้วยเหตุผลที่ยังถูกอยู่ (*"เราจะเจอบั๊กของเครื่องมือก่อนผู้ใช้"*)
-- **แต่วันนี้ในฐานมี template อยู่ 1 ใบ ซึ่ง `git log -S` หาไม่เจอในรีโปเลยแม้แต่คำเดียว**
-- 🎯 ***เนื้อหาที่มีอยู่แค่ในฐาน dev ใบเดียว ไม่ใช่เนื้อหาที่เรามี — มันคือเนื้อหาที่เรายืมมา***
--    ฐาน dev ไม่มี backup (แผนข้อ "Supabase free ไม่มี PITR") · และวันขึ้น prod มันคือฐานคนละใบ
-- ⇒ **ทำให้ *ซ้ำได้จากรีโป* คือข้อกำหนด ไม่ใช่รสนิยม** · ทางที่ยังรักษาเจตนาเดิมไว้คือ
--    ***จัดผ่านหน้าเว็บได้เหมือนเดิม แล้วใบนี้เป็นฉบับที่ commit ไว้*** — ไม่ได้ห้ามใครเปิดไปแก้ต่อ
--
-- ## 🔴 เจ้าของทริป — สิ่งที่ผมเลือก และราคาที่มันมี
-- `trips.created_by → profiles.id → auth.users.id` ⇒ **ทริปต้องมีบัญชีจริงเป็นเจ้าของ**
-- ทางที่มี 3 ทาง · ผมเลือกทางที่ ***ไม่เขียน `auth.users` และไม่ต้องให้ใครไปสมัครอะไรก่อน***:
--   ① สร้าง auth user ใหม่ในไฟล์นี้     → เขียน schema `auth` จาก migration · ยังไม่เคยทำในรีโปนี้
--                                        ⇒ พังแล้วผู้ใช้เป็นคนเจอตอนรัน `db:push` **ไม่เลือก**
--   ② ให้ผู้ใช้สมัครบัญชีเฉพาะไว้ก่อน   → ต้องรับอีเมลยืนยันที่กล่องซึ่งไม่มีอยู่จริง **ไม่เลือก**
--   ③ **ใช้เจ้าของ template ใบที่มีอยู่แล้ว** ← เลือกอันนี้
-- 🔴 **ราคาของ ③ ที่ต้องรู้: ถ้าเจ้าของนั้นคือบัญชีของผู้ใช้เอง ทริปแนะนำสองใบนี้จะโผล่ใน
--    หน้า "ทริปของฉัน" ของเขาด้วย** — `tripsForUser()` (`lib/engine/trip.ts:124`) **ไม่ได้กรอง
--    `published_template_at` ออก** · ผมตรวจแล้วและไม่แก้ที่นั่น เพราะ *ซ่อนมันจากเจ้าของ*
--    จะทำให้ทีมเปิดเข้าไปแก้แผนผ่านหน้าเว็บไม่ได้เลย ซึ่งขัดกับเจตนาของ `20260904180000` ตรง ๆ
--    ✅ **ย้ายเจ้าของทีหลังเป็น `update` แถวเดียว** — เลือกทางที่ถอนคืนถูกที่สุดไว้ก่อน
--
-- ## เนื้อของแผน — ที่มาและสิ่งที่ผม *ไม่ได้* ยกมาตามนั้น
-- ลำดับ/การจับกลุ่ม/เวลาโดยประมาณ มาจาก Gemini (5 ก.ย. 2026 · ผู้ใช้สั่งให้ถามผ่าน Chrome ของเขา)
-- 🔴 **สิ่งที่ผมเปลี่ยนจากของ Gemini และเหตุผล — เพราะสคีมาเราตอบคำถามที่แผนของมันไม่ได้ตอบ:**
--   Gemini ยัด *เกียวโต + นารา ไว้วันเดียวกัน* (4 จุด · 08:30–18:30 · ข้ามสองจังหวัด)
--   แต่ `trip_days.city_id` เก็บได้ **เมืองเดียวต่อวัน** ⇒ วันนั้นจะโกหกไม่ว่าจะเลือกเมืองไหน
--   ⇒ แยกเป็นเกียวโตหนึ่งวัน นาราหนึ่งวัน **โดยยังนอนโอซาก้าทั้ง 4 คืน** (ฐานเดียว ย้ายโรงแรม 0 ครั้ง)
--   🎯 ***ข้อจำกัดของสคีมาไม่ได้ทำให้แผนแย่ลง มันบังคับให้ตอบคำถามที่แผนเดิมเลี่ยงไว้***
--   · และ `overnight_city_id` เป็นตัวที่ทำให้ *"เที่ยวเมืองนี้ แต่นอนอีกเมือง"* เขียนลงไปได้ตรง ๆ
--     (`20260825232458` ออกแบบมาเพื่อเคสนี้พอดี) — ของ Gemini ไม่มีที่ให้เก็บข้อมูลนั้นเลย
--
-- ## ⚠️ วันที่ของ template ไม่มีความหมาย และนั่นตั้งใจ
-- `list_trip_templates()` คืนแค่ `day_count`/`night_count` · `copy_trip_template()` เลื่อนทั้งชุด
-- ตาม `p_start_date` ของผู้เรียก ⇒ **วันที่ในนี้เป็นแค่หมุดให้ระยะห่างถูก** ใช้ 2026-01-01 ทั้งสองใบ
--
-- ## rollback
--   delete from public.trips where published_template_at is not null and title in (…สองชื่อข้างล่าง…);
--   (`trip_days`/`trip_stops`/`trip_plans`/`trip_destinations` เป็น cascade ทั้งหมด)
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

-- ── แผนที่จะลง — พักไว้ก่อน แล้วนับด้วยการ join (รูปเดียวกับ seed คลัง) ─────────
create temporary table _t (
  code text primary key, title text not null, days int not null, base_tz text not null
) on commit drop;

insert into _t (code, title, days, base_tz) values
  ('osk', 'โอซาก้า เกียวโต นารา 5 วัน 4 คืน',  5, 'Asia/Tokyo'),
  ('tyo', 'โตเกียว ฟูจิ ดิสนีย์ 6 วัน 5 คืน',   6, 'Asia/Tokyo');

-- เมืองของทริป (ลำดับที่แสดงบนการ์ด)
create temporary table _td (
  code text not null, city_slug text not null, rank int not null,
  primary key (code, city_slug)
) on commit drop;

insert into _td (code, city_slug, rank) values
  ('osk', 'osaka', 1), ('osk', 'kyoto', 2), ('osk', 'nara', 3),
  ('tyo', 'tokyo', 1), ('tyo', 'fuji-kawaguchiko', 2);

-- วันของทริป · `ov_slug` = เมืองที่ *นอน* คืนนั้น · null = คืนสุดท้าย (บินกลับ)
create temporary table _tday (
  code text not null, d int not null, city_slug text not null, ov_slug text,
  primary key (code, d)
) on commit drop;

insert into _tday (code, d, city_slug, ov_slug) values
  -- 🔴 ฐานเดียวทั้งทริป: นอนโอซาก้า 4 คืน · ย้ายโรงแรม 0 ครั้ง แม้เที่ยว 3 จังหวัด
  ('osk', 1, 'osaka', 'osaka'),
  ('osk', 2, 'osaka', 'osaka'),
  ('osk', 3, 'kyoto', 'osaka'),
  ('osk', 4, 'nara',  'osaka'),
  ('osk', 5, 'osaka', null),
  -- โตเกียว: ออกไปนอนริมทะเลสาบ 1 คืน แล้วกลับเข้าเมือง
  ('tyo', 1, 'tokyo',            'tokyo'),
  ('tyo', 2, 'fuji-kawaguchiko', 'fuji-kawaguchiko'),
  ('tyo', 3, 'tokyo',            'tokyo'),
  ('tyo', 4, 'tokyo',            'tokyo'),
  ('tyo', 5, 'tokyo',            'tokyo'),
  ('tyo', 6, 'tokyo',            null);

-- จุดแวะ · `rank` ต้องผ่าน `trip_stops_rank_shape` (`^[0-9A-Za-z]+$` และห้ามลงท้าย `0`)
-- ⚠️ ใช้อักษรเดี่ยว `1`–`9` จากชุดของ `lib/engine/rank.ts` ⇒ แทรกระหว่างกลางทีหลังได้ (`1` → `1U` → `2`)
create temporary table _ts (
  code text not null, d int not null, rank text not null, place_slug text not null, dwell int not null,
  primary key (code, d, rank)
) on commit drop;

insert into _ts (code, d, rank, place_slug, dwell) values
  -- ── โอซาก้า 5 วัน ────────────────────────────────────────────────────────
  ('osk', 1, '1', 'dotonbori',               180),
  ('osk', 1, '2', 'shinsaibashi',            120),
  ('osk', 2, '1', 'universal-studios-japan', 480),
  ('osk', 2, '2', 'umeda-sky',               150),
  ('osk', 3, '1', 'fushimi-inari',           120),
  ('osk', 3, '2', 'kiyomizu-dera',           150),
  ('osk', 3, '3', 'gion',                    120),
  ('osk', 3, '4', 'nishiki-market',           90),
  ('osk', 4, '1', 'nara-park',               120),
  ('osk', 4, '2', 'todai-ji',                 90),
  ('osk', 5, '1', 'osaka-castle',            150),
  ('osk', 5, '2', 'kuromon-market',          120),
  ('osk', 5, '3', 'osaka-aquarium-kaiyukan', 150),
  -- ── โตเกียว 6 วัน ────────────────────────────────────────────────────────
  ('tyo', 1, '1', 'shibuya-crossing',        120),
  ('tyo', 1, '2', 'shibuya-sky',              90),
  ('tyo', 2, '1', 'chureito-pagoda',         120),
  ('tyo', 2, '2', 'oishi-park',              120),
  ('tyo', 2, '3', 'lake-kawaguchiko',         90),
  ('tyo', 2, '4', 'kachi-kachi-ropeway',      90),
  ('tyo', 3, '1', 'sensoji',                 150),
  ('tyo', 3, '2', 'tokyo-skytree',           120),
  ('tyo', 3, '3', 'akihabara',               150),
  ('tyo', 4, '1', 'tokyo-disneyland',        480),
  ('tyo', 5, '1', 'meiji-jingu',             120),
  ('tyo', 5, '2', 'takeshita-street',        150),
  ('tyo', 5, '3', 'ginza',                   120),
  ('tyo', 6, '1', 'ueno-park',               120),
  ('tyo', 6, '2', 'tsukiji-outer-market',     90);

-- ───────────────────────────────────────────────────────────────────────────
-- ลงจริง
-- ───────────────────────────────────────────────────────────────────────────
do $seed$
declare
  v_owner   uuid;
  v_anchor  date := date '2026-01-01';
  r         record;
  v_trip    uuid;
  v_plan    uuid;
begin
  -- 🔴 เจ้าของ = เจ้าของ template ใบแรกที่มีอยู่ (ดูเหตุผลข้อ ③ ที่หัวไฟล์)
  select t.created_by into v_owner
    from public.trips t
   where t.published_template_at is not null
   order by t.published_template_at asc
   limit 1;

  if v_owner is null then
    -- ⚠️ ข้อความนี้เขียนไว้สำหรับ *ฐานที่ยังไม่มี template สักใบ* (เช่นวันขึ้น prod)
    --    ไม่ใช่ข้อผิดพลาด — มันคือจุดที่ต้องมีคนตัดสินใจว่าใครเป็นเจ้าของเนื้อหาสาธารณะของเรา
    raise exception
      'ยังไม่มีทริปแนะนำใบไหนในฐานนี้ จึงไม่รู้ว่าใครควรเป็นเจ้าของ — '
      'ติดธง published_template_at ให้ทริปหนึ่งใบก่อน แล้วรันไฟล์นี้ใหม่'
      using errcode = 'P0002';
  end if;

  for r in select * from _t order by code loop
    -- กันรันซ้ำ: มีชื่อนี้เป็น template อยู่แล้ว = ข้ามทั้งใบ
    if exists (
      select 1 from public.trips
       where title = r.title and published_template_at is not null and deleted_at is null
    ) then
      continue;
    end if;

    insert into public.trips (created_by, title, start_date, end_date, base_timezone, published_template_at)
    values (v_owner, r.title, v_anchor, v_anchor + (r.days - 1), r.base_tz, now())
    returning id into v_trip;

    -- ⚠️ trigger `trips_bootstrap_owner` ใส่แถวนี้ให้แล้วตอน insert ข้างบน —
    --    เขียนซ้ำที่นี่ **ตามที่ `create_trip()` ทำ** (`20260827080000:76`) ไม่ใช่เพราะจำเป็น
    --    แต่เพื่อให้สองเส้นทางที่สร้างทริปได้ อ่านเหมือนกันเวลามีคนเทียบ
    insert into public.trip_members (trip_id, user_id, role, invited_by)
    values (v_trip, v_owner, 'owner', v_owner)
    on conflict (trip_id, user_id) do nothing;

    insert into public.trip_plans (trip_id, name, is_active)
    values (v_trip, 'แผน A', true)
    returning id into v_plan;

    insert into public.trip_destinations (trip_id, city_id, rank)
    select v_trip, c.id, td.rank
      from _td td
      join public.catalog_cities c on c.legacy_slug = td.city_slug
     where td.code = r.code;

    insert into public.trip_days (trip_id, date, city_id, overnight_city_id, overnight_kind, timezone)
    select v_trip,
           v_anchor + (td.d - 1),
           c.id,
           ov.id,
           case when td.ov_slug is null then 'none' else 'city' end,
           r.base_tz
      from _tday td
      join public.catalog_cities c on c.legacy_slug = td.city_slug
      left join public.catalog_cities ov on ov.legacy_slug = td.ov_slug
     where td.code = r.code;

    -- 🔴 **ไม่ส่ง `added_by_user` โดยตั้งใจ** — trigger `trip_stops_stamp_added_by`
    --    ทับด้วย `auth.uid()` ทุกแถวแบบไม่มีเงื่อนไข (`20260825140057:160`) และในไฟล์นี้
    --    `auth.uid()` เป็น `null` (ไม่มี JWT) ⇒ ส่งค่าไปก็ถูกทิ้ง **แต่โค้ดจะอ่านเหมือนได้ตั้งค่าแล้ว**
    --    🎯 ***บรรทัดที่ไม่มีผล แต่อ่านเหมือนมีผล คือคำอธิบายที่ผิดซึ่งฝังอยู่ในโค้ด***
    --    ⇒ `added_by_user = null` แปลว่า *"ไม่ได้มาจากการกดของใคร"* ซึ่งเป็นความจริงของแถวพวกนี้
    insert into public.trip_stops
      (trip_id, plan_id, trip_day_id, catalog_place_id, kind, rank, dwell_minutes)
    select v_trip, v_plan, day.id, pl.id, 'place', ts.rank, ts.dwell
      from _ts ts
      join public.catalog_places pl on pl.legacy_slug = ts.place_slug
      join public.trip_days day on day.trip_id = v_trip and day.date = v_anchor + (ts.d - 1)
     where ts.code = r.code;
  end loop;
end $seed$;

-- ───────────────────────────────────────────────────────────────────────────
-- ยืนยัน — ทุกเคสต้องล้มได้จริง
-- ───────────────────────────────────────────────────────────────────────────
do $verify$
declare
  n_missing_place int; n_trip int; n_day int; n_stop int; n_empty_day int; n_tpl int;
begin
  -- 🔴 เคสนี้ต้องมาก่อนทุกเคส: จุดแวะที่ join ไม่ติดจะ **หายไปเงียบ ๆ** (join ไม่ match = ไม่มีแถว)
  --    เคสนับ 28 ข้างล่างจับได้ว่าขาด แต่ไม่บอกว่า *slug ไหน* → เคสนี้บอกชื่อออกมาเลย
  select count(*) into n_missing_place
    from _ts ts
   where not exists (select 1 from public.catalog_places pl where pl.legacy_slug = ts.place_slug);
  if n_missing_place <> 0 then
    raise exception 'มี % จุดแวะที่ไม่มีสถานที่ในคลัง — ต้องรัน 20260905130000 ก่อน (slug แรก: %)',
      n_missing_place,
      (select ts.place_slug from _ts ts
        where not exists (select 1 from public.catalog_places pl where pl.legacy_slug = ts.place_slug)
        order by ts.place_slug limit 1);
  end if;

  select count(*) into n_trip
    from public.trips t join _t x on x.title = t.title
   where t.published_template_at is not null and t.deleted_at is null;
  if n_trip <> 2 then raise exception 'ทริปแนะนำลงไม่ครบ: % ไม่ใช่ 2', n_trip; end if;

  select count(*) into n_day
    from public.trip_days d
    join public.trips t on t.id = d.trip_id
    join _t x on x.title = t.title;
  if n_day <> 11 then raise exception 'วันลงไม่ครบ: % ไม่ใช่ 11', n_day; end if;

  select count(*) into n_stop
    from public.trip_stops s
    join public.trips t on t.id = s.trip_id
    join _t x on x.title = t.title
   where s.deleted_at is null;
  if n_stop <> 28 then raise exception 'จุดแวะลงไม่ครบ: % ไม่ใช่ 28', n_stop; end if;

  -- 🔴 **เกณฑ์เดียวที่วัดสิ่งที่ผู้ใช้เห็น** — วันว่างในทริปแนะนำคือสิ่งที่ทำให้คนเลิกเชื่อการ์ดนั้น
  --    (รูปเดียวกับเกณฑ์ *"เมืองที่กดเข้าไปแล้วว่าง"* ใน seed คลัง)
  select count(*) into n_empty_day
    from public.trip_days d
    join public.trips t on t.id = d.trip_id
    join _t x on x.title = t.title
   where not exists (select 1 from public.trip_stops s
                      where s.trip_day_id = d.id and s.deleted_at is null);
  if n_empty_day <> 0 then raise exception 'มี % วันในทริปแนะนำที่ไม่มีจุดแวะเลย', n_empty_day; end if;

  -- ทิศบวกของเส้นที่ผู้ใช้เห็นจริง — เรียก RPC ที่หน้าแรกเรียก ไม่ใช่ `select` จากตาราง
  -- 🎯 `§3.5`: *สิทธิ์ = true ไม่ได้แปลว่าเรียกได้ — ยืนยันด้วยเส้นทางที่ผู้เรียกจริงใช้*
  select count(*) into n_tpl from public.list_trip_templates();
  if n_tpl < 2 then raise exception 'list_trip_templates() คืน % ใบ — น้อยกว่าที่เพิ่งลง', n_tpl; end if;
end $verify$;

commit;
