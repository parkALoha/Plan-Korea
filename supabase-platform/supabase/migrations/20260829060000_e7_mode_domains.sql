-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ โดเมนของ `travel_mode` · `intercity_mode` · `return_travel_mode`           │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- 🔴 **โดเมนเดียวกัน สองตาราง ใบหนึ่งมีด่าน อีกใบไม่มี** (P3 ถาม · P1 วัด · 29 ส.ค. 2026)
--
-- ```
-- travel_time_cache.travel_mode              ✅ check in ('walk','transit','drive')
-- trip_stops.travel_mode                     ❌ ไม่มีอะไรเลย   ← ที่ที่ผู้ใช้เขียนจริง
-- trip_stops.intercity_mode                  ❌ ไม่มีอะไรเลย
-- trip_day_plan_settings.return_travel_mode  ❌ ไม่มีอะไรเลย
-- ```
-- ใบที่มีด่านคือ **แคช** ซึ่งไม่มีใครเขียนจากฝั่งไคลเอนต์ · ใบที่ไม่มีด่านคือใบที่**ผู้ใช้เขียนได้**
--
-- 🎯 **และผลของช่องนี้ไม่ได้อยู่ที่ฐาน มันอยู่ที่โค้ด** (P3 เรียกมันว่า "รูป ③/④"):
--    `lib/schedule.ts:4` ประกาศ `type TravelMode = "walk" | "transit" | "drive"`
--    แล้วโค้ด index ตาราง `Record<TravelMode, …>` ด้วยค่าที่อ่านมาจากคอลัมน์นี้ **12 จุด**
--    → **โค้ดเชื่อว่าฐานกัน · ฐานไม่ได้กัน · ไม่มีใครเคยเทียบสองอย่างนี้**
--    `tsc` ไม่ได้แค่จับไม่ได้ — มัน *รับรอง* ว่าปลอดภัย เพราะเราบอกมันเองว่าคอลัมน์เป็น union
--
-- ── 🔴 สิ่งที่ migration นี้ **จงใจไม่แตะ** ─────────────────────────────────
--   `bookings.category` · `catalog_places.category` · `custom_places.category`
--   ทั้งสามมีแค่ `length 1..40` **และควรเป็นแบบนั้นต่อไป** — บนแพลตฟอร์มหลายประเทศ
--   หมวดหมู่ต้องเพิ่มได้โดยไม่ต้อง migrate · **การใส่ enum ตรงนั้นคือการแก้ผิดฝั่ง**
--   → ฝั่งที่ผิดคือ *โค้ด* ที่ประกาศมันเป็น union แล้ว index ตรง (30 จุด)
--   → แก้ด้วยชนิด (`Partial<Record<K,V>>` ที่ P3 เสนอ) **ไม่ใช่ด้วย constraint**
--   🎯 **โดเมนปิดใส่ constraint · โดเมนเปิดแก้ที่โค้ด — สองอย่างนี้ห้ามสลับกัน**
--
-- ⚠️ ข้อจำกัดที่อาจฆ่าข้อเสนอนี้เอง:
--   ① ถ้าวันหลังมี travel mode ใหม่ (`bike`?) ต้อง migrate — **รับได้** เพราะ Google Routes API
--      รองรับ 4 โหมดและเราแมปเหลือ 3 มาตั้งแต่ต้น การเพิ่มโหมดเป็นการตัดสินใจอยู่แล้ว
--   ② `intercity_mode` มี `'other'` ซึ่งเป็นถังขยะ — ถ้าโดเมนจริงเปิด `'other'` ก็ไร้ความหมาย
--      **แต่มันมีอยู่ใน `IntercityEditModal.tsx:9` วันนี้แล้ว** และเป็น 1 ใน 3 ตัวเลือกที่ UI ให้เลือก
--      → constraint นี้สะท้อนสิ่งที่ UI ทำได้จริง ไม่ได้เพิ่มหรือลด

begin;

-- ── ด่านก่อน `alter` — อ่านอย่างเดียว · ให้ข้อความที่ใช้ทำงานต่อได้ ────────────
-- 🔴 `add constraint check` **ตรวจแถวที่มีอยู่ทันที** (ไม่ได้ใส่ `not valid`)
--    ถ้ามีค่านอกโดเมนแม้แถวเดียว → `ALTER` ล้มด้วย constraint error ดิบ ซึ่ง**ไม่บอกว่าค่าไหน**
--    ✅ บอกชื่อค่าที่ผิดพร้อมจำนวนแถว → ผู้ใช้เห็น *"เจอ walking 3 แถว"* แทน error ที่ต้องไปไล่เอง
--    (P3 เสนอ 29 ส.ค. 2026 · *"แดงที่มีคำอธิบายผิดจะถูกเชื่อ · แดงที่ไม่มีคำอธิบายจะถูกไล่หาสาเหตุ"*
--     — อันนี้คือทางที่สาม: **แดงที่บอกสาเหตุจริง**)
do $precheck$
declare r record; bad text := '';
begin
  for r in
    select * from (values
      ('trip_stops',             'travel_mode',        array['walk','transit','drive']),
      ('trip_stops',             'intercity_mode',     array['bus','ktx','other']),
      ('trip_day_plan_settings', 'return_travel_mode', array['walk','transit','drive'])
    ) as v(tbl, col, allowed)
  loop
    declare found text;
    begin
      execute format(
        'select string_agg(v || '' ('' || n || '' แถว)'', '', '' order by v) from ('
        || 'select %I v, count(*) n from public.%I where %I is not null and not (%I = any($1)) group by 1) x',
        r.col, r.tbl, r.col, r.col) into found using r.allowed;
      if found is not null then
        bad := bad || format(E'\n  · %s.%s → %s', r.tbl, r.col, found);
      end if;
    end;
  end loop;
  if bad <> '' then
    raise exception 'มีค่านอกโดเมนอยู่ในฐานแล้ว — ต้องแก้ข้อมูลก่อนใส่ constraint:%', bad;
  end if;
  raise notice 'ด่านก่อน alter: ไม่มีค่านอกโดเมนในทั้ง 3 คอลัมน์';
end $precheck$;

alter table public.trip_stops
  add constraint trip_stops_travel_mode_check
  check (travel_mode is null or travel_mode in ('walk', 'transit', 'drive'));

alter table public.trip_stops
  add constraint trip_stops_intercity_mode_check
  check (intercity_mode is null or intercity_mode in ('bus', 'ktx', 'other'));

alter table public.trip_day_plan_settings
  add constraint tdps_return_travel_mode_check
  check (return_travel_mode is null or return_travel_mode in ('walk', 'transit', 'drive'));

comment on column public.trip_stops.travel_mode is
  'lib/schedule.ts:4 TravelMode. โดเมนเดียวกับ travel_time_cache.travel_mode — '
  'ต้องขยับพร้อมกันทั้งสองใบเสมอ ไม่งั้นแคชกับแถวจริงจะรับค่าไม่เท่ากันอีก.';

do $verify$
declare
  r record; predicate text; colname text; i int := 0;
  ok_good boolean; ok_bad boolean; dom_stops text; dom_cache text;
begin
  -- 🔴 **ยิงกับ *predicate ที่ฐานเก็บไว้จริง* ไม่ใช่กับสำเนาที่ผมพิมพ์ซ้ำ**
  --
  --    ฉบับแรกของบล็อกนี้ `insert` ใส่ `trip_stops` ตรง ๆ แล้ว **ทิศ ① แดงทันที**
  --    เพราะไปโดน `trip_stops_place_by_kind` (kind='place' ต้องมี place ref อยู่ 1 ตัว)
  --    ซึ่งเป็น `check_violation` **ชนิดเดียวกับที่ตัวจับรอ** → รายงานว่า *"walk ถูกปฏิเสธ"*
  --    ทั้งที่ด่านของ walk ไม่ได้ยิงเลยสักครั้ง
  --    🎯 **โพรบที่แยกไม่ออกว่าด่านไหนยิง ไม่ได้ให้ข้อมูลน้อย มันให้ข้อมูลผิด**
  --
  --    และท่าที่ตรงกว่า (update แถวจริงแล้ว rollback) **ใช้ไม่ได้บนฐานว่าง** —
  --    0 แถวถูกแตะ · ไม่มี error · **อ่านเป็นผ่าน** ซึ่งแย่กว่าเดิมอีกขั้น
  --
  --    ✅ ท่าที่ใช้: ก๊อป predicate จาก `pg_constraint` ไปแปะบนตารางชั่วคราวที่ไม่มีด่านอื่นเลย
  --       · ไม่มีอะไรให้ชนนอกจากด่านที่กำลังทดสอบ
  --       · ไม่ต้องมีข้อมูลอยู่ก่อน จึงได้ผลเหมือนกันทั้งฐานว่างและฐานที่มีของ
  --       · ทดสอบ **ข้อความที่ฐานเก็บ** ไม่ใช่ข้อความที่ผมเชื่อว่าฐานเก็บ
  for r in
    select * from (values
      ('public.trip_stops',             'trip_stops_travel_mode_check',    'walk',    'teleport'),
      ('public.trip_stops',             'trip_stops_intercity_mode_check', 'ktx',     'boat'),
      ('public.trip_day_plan_settings', 'tdps_return_travel_mode_check',   'transit', 'helicopter')
    ) as v(tbl, con, good, bad)
  loop
    select pg_get_constraintdef(c.oid), a.attname into predicate, colname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.conrelid = r.tbl::regclass and c.conname = r.con;
    if predicate is null then raise exception 'ไม่พบ constraint % บน %', r.con, r.tbl; end if;

    -- `on commit drop` — SQL editor ใช้คอนเนกชันแบบพูล · ตารางค้างข้ามการกด Run ได้
    --    (`00_preflight` ใช้ `drop table if exists` ด้วยเหตุผลเดียวกัน · ใบนี้ควรสม่ำเสมอกับมัน)
    execute format('create temp table probe_%s (%I text) on commit drop', i, colname);
    execute format('alter table probe_%s add %s', i, predicate);

    begin
      execute format('insert into probe_%s values (%L)', i, r.good);
      ok_good := true;
    exception when check_violation then ok_good := false;
    end;
    if not ok_good then raise exception '% ปฏิเสธค่าที่ถูกต้อง (%)', r.con, r.good; end if;

    begin
      execute format('insert into probe_%s values (%L)', i, r.bad);
      ok_bad := false;
    exception when check_violation then ok_bad := true;
    end;
    if not ok_bad then raise exception '% รับค่ามั่ว (%) — ด่านไม่มีฟัน', r.con, r.bad; end if;

    execute format('insert into probe_%s values (null)', i);   -- null ต้องผ่าน (nullable โดยตั้งใจ)
    i := i + 1;
  end loop;

  if i <> 3 then raise exception 'ตรวจได้ % ด่าน ต้องเป็น 3', i; end if;

  -- 🔴 โดเมนสองใบต้องเท่ากันจริง — **นี่คือช่องที่ migration นี้มาปิด**
  --    ถ้าวันหลังมีคนเติมโหมดใบเดียว เคสนี้แดง แทนที่จะเงียบแล้วแคชกับแถวจริงรับค่าไม่เท่ากันอีก
  select pg_get_constraintdef(oid) into dom_stops from pg_constraint
   where conrelid = 'public.trip_stops'::regclass and conname = 'trip_stops_travel_mode_check';
  -- 🔴 ต้องกรอง `contype='c'` — **PK ของตารางนี้คือ `(from_place_id, to_place_id, travel_mode)`**
  --    ซึ่ง `pg_get_constraintdef` ก็มีคำว่า `travel_mode` อยู่ด้วย แต่ไม่มี `walk`
  --    ฉบับแรกไม่ได้กรอง → คว้า PK มาเทียบ → **แดงโดยที่โดเมนไม่ได้ผิดอะไรเลย** (false red)
  select pg_get_constraintdef(oid) into dom_cache from pg_constraint
   where conrelid = 'public.travel_time_cache'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%travel_mode%';
  if dom_cache is null then
    raise exception 'ไม่พบ check ของ travel_time_cache.travel_mode — เทียบโดเมนไม่ได้ อย่าเงียบ';
  end if;
  -- 🔴 **ฉบับแรกของบล็อกนี้จับ drift ที่มันมีไว้จับไม่ได้** (P3 รีวิวเจอ 29 ส.ค. 2026)
  --    เขียนว่า `(A and B and C) is distinct from (A' and B' and C')` — **สองข้างยุบเหลือบูลีนเดียว
  --    = "มีครบสามค่าไหม"** · เติม `'bike'` ให้ `trip_stops` ใบเดียว → ซ้าย true · ขวา true → ผ่าน
  --    ยิงพิสูจน์แล้ว: `is distinct from` = **false** · **superset ผ่านเสมอ**
  --    ⚠️ และคอมเมนต์เหนือมันเขียนว่า *"มีคนเติมโหมดใบเดียว เคสนี้แดง"* — **ด่านที่ครอบแคบกว่าถ้อยคำของตัวเอง**
  --    ✅ เทียบ *เซตของค่า* ที่สกัดจาก predicate จริงทั้งสองฝั่ง เรียงแล้วเทียบตรง ๆ
  declare
    set_stops text[] := (select array(select unnest(x) order by 1)
      from (select array(select (regexp_matches(dom_stops, '''([a-z_]+)''', 'g'))[1]) x) t);
    set_cache text[] := (select array(select unnest(x) order by 1)
      from (select array(select (regexp_matches(dom_cache, '''([a-z_]+)''', 'g'))[1]) x) t);
  begin
    if set_stops is distinct from set_cache then
      raise exception 'โดเมน travel_mode ไม่ตรงกัน — trip_stops=% · travel_time_cache=%',
        set_stops, set_cache;
    end if;
    if array_length(set_stops, 1) is null or array_length(set_stops, 1) = 0 then
      raise exception 'สกัดค่าจาก predicate ไม่ได้เลย — ตัวเทียบไม่มีอำนาจ อย่าอ่านว่าผ่าน';
    end if;
  end;

  raise notice 'โดเมนโหมดเดินทาง: 3 ด่าน × (ถูก/มั่ว/null) ผ่าน · ตรงกับ travel_time_cache';
end $verify$;

commit;
