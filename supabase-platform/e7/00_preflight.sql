-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 0: ตรวจก่อนรัน — **อ่านอย่างเดียว ไม่เขียนอะไรเลยสักแถว**      │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- รันก้อนนี้ก่อนเสมอ · ปลอดภัยที่จะรันซ้ำกี่ครั้งก็ได้ · **ไม่มี insert/update/delete/alter**
--
-- 🔴 **ที่มา: `RUN.md` ฉบับแรกลืมเงื่อนไขที่สำคัญที่สุด** — ทั้ง 9 ก้อนอ่าน `legacy.*`
--    แต่ไม่มีเอกสารไหนบอกว่า schema นั้นขึ้นไปอยู่บน `engine-dev` ได้ยังไง
--    · สนามซ้อมในเครื่องสร้างมันด้วย `alter schema public rename to legacy` หลัง restore dump
--    · `e7-ac8-restore-runbook.md` ครอบ restore ลง **เครื่อง** (5A) กับ **โปรเจกต์ที่ 2** (5B)
--      **ไม่ครอบ `engine-dev`** ซึ่งเป็นที่ที่ E7 ต้องรันจริง
--    🎯 ผมเขียน `RUN.md` จากลำดับที่ผม *รัน* มา ซึ่งเริ่มหลัง `legacy` มีอยู่แล้ว
--       — **ขั้นที่ผมไม่เคยต้องทำเอง คือขั้นที่ผมมองไม่เห็นว่าขาด**
--
-- ผลลัพธ์เป็นตาราง อ่านคอลัมน์ `ok` — **ต้องเป็น `✅` ทุกแถวก่อนรันก้อน 1**

-- 🔴 **ฉบับแรกของไฟล์นี้พังในเคสที่มันถูกเขียนขึ้นมาเพื่อจับ**
--    CTE อ้าง `legacy.trip_stops` ตรง ๆ · Postgres แปลชื่อตาราง **ตอน parse**
--    → ไม่มี schema `legacy` = **ทั้งคิวรีพังตั้งแต่ยังไม่ทันรัน** ต่อให้มีเงื่อนไขกรองไว้แล้วก็ตาม
--    🎯 *ด่านที่มองไม่เห็นสิ่งที่มันมีไว้เพื่อมอง* — จับได้เพราะยิงทิศแดงจริง ไม่ใช่เพราะอ่านทวน
--    ✅ ท่าที่ใช้: เก็บสแลกที่ต้องการลงตารางชั่วคราวด้วย dynamic SQL ที่ยามด้วย `to_regclass`
--       แล้ว `select` ตอนท้าย **ไม่แตะชื่อ `legacy` เลยสักที่**

do $preflight$
begin
  drop table if exists pf_slug;
  create temp table pf_slug (slug text);
  if to_regclass('legacy.trip_stops') is not null then
    execute $q$
      insert into pf_slug
      select distinct s from (
        select place_id from legacy.trip_stops
         where kind in ('place','transfer')
           and not exists (select 1 from legacy.custom_places c where c.id = place_id)
        union select place_id from legacy.hidden_places
         where not exists (select 1 from legacy.custom_places c where c.id = place_id)
        union select place_id from legacy.place_notes
         where not exists (select 1 from legacy.custom_places c where c.id = place_id)
      ) t(s)
    $q$;
  end if;

  -- 🔴 **ยอดต่อตาราง — ด่านที่อนุมานเกณฑ์จากต้นทาง จะเขียวเสมอเมื่อต้นทางว่าง** (P3 · 29 ส.ค. 2026)
  --    `req_place` สร้างชุด "สแลกที่ต้องมี" *จาก `legacy.trip_stops` เอง* → legacy ว่าง =
  --    "0 สแลกที่ต้องมี · ขาด 0" = ✅ · **ยิงทิศแดงพิสูจน์แล้ว: 14 ตาราง 0 แถว → preflight เขียวหมด**
  --    และทั้ง pipeline ก็เขียวตาม (ก้อน 6 เดลตา 0 = expected 0 · ก้อน 9 missing: 0 ·
  --    `trip_days`/`events` มาจากค่าคงที่กับ `ITINERARY` ไม่ได้มาจาก legacy)
  --
  --    🎯 **นี่คือที่เดียวในชุดนี้ที่ตัวเลขตายตัวเป็นสิ่งที่ *ถูก*** — ทุกที่อื่นเราถอนเลขตายตัวออก
  --       เพราะมันสร้างแหล่งความจริงใบที่สอง · **แต่คำถาม "ต้นทางครบไหม" ต้องมีค่าที่รู้มาก่อน
  --       ไม่งั้นถามไม่ได้เลย** · ต้นทางเปลี่ยน = preflight แดง = **ต้องมีคนมาตัดสินใหม่** ซึ่งถูก
  --       (`E7-AC6` บังคับ restore ใหม่ทุกรอบอยู่แล้ว)
  drop table if exists pf_rows;
  create temp table pf_rows (tbl text, want int, got int);
  insert into pf_rows (tbl, want) values
    ('bookings',8), ('checklist_items',8), ('custom_places',37), ('hidden_places',39),
    ('place_details_cache',140), ('place_notes',2), ('place_photo_cache',142),
    ('travel_time_cache',185), ('trip_day_settings',18), ('trip_hotels',4),
    ('trip_meta',1), ('trip_plans',2), ('trip_selections',13), ('trip_stops',71);
  if to_regclass('legacy.trip_stops') is not null then
    update pf_rows r set got = (
      select (xpath('/row/c/text()',
        query_to_xml(format('select count(*) c from legacy.%I', r.tbl), false, true, '')))[1]::text::int);
  end if;
end $preflight$;

with
schema_ok as (
  select to_regclass('legacy.trip_stops') is not null as v
),
req_place as (select slug from pf_slug),
req_city as (
  select unnest(array['hanoi','busan','sokcho','gangneung','seoul','suwon']) as slug
),
checks as (
  -- ① schema legacy — ถ้าข้อนี้ตก ที่เหลือไม่มีความหมาย
  select 1 ord, 'สำเนาแช่แข็ง `legacy.*`' as รายการ,
         case when (select v from schema_ok) then '✅' else '🔴' end as ok,
         case when (select v from schema_ok)
              then (select count(*)::text from information_schema.tables where table_schema='legacy') || ' ตาราง (ต้อง 14)'
              else 'ไม่มี schema legacy — **ยังไม่มีใครเขียนขั้นตอนนำขึ้น engine-dev** ดู waiting-on-user §1.7'
         end as รายละเอียด

  -- ② migration ที่ต้องลงก่อน
  union all select 2, 'migration `20260829020000` (hidden_places รับ custom)',
    case when exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='hidden_places'
                         and column_name='custom_place_id') then '✅' else '🔴' end,
    'ถ้าขาด → หาย 21 จาก 39 แถว'
  union all select 3, 'migration `20260829040000` (bookings.status)',
    case when exists (select 1 from pg_constraint
                       where conrelid='public.bookings'::regclass and conname='bookings_status_check'
                         and pg_get_constraintdef(oid) like '%walk_up%') then '✅' else '🔴' end,
    'ถ้าขาด → ใส่ไม่ได้เลยสักแถวจาก 8'

  -- ③ คลังต้องมีสแลกที่ E7 อ้างถึงครบ
  union all select 4, 'สแลกสถานที่ในคลัง',
    -- 🔴 เซตว่างต้องอ่านเป็น "ข้าม" ไม่ใช่ "ขาด 0" — ไม่มี legacy = ไม่มีสแลกให้ตรวจ **ไม่ใช่ผ่าน**
    -- 🔴 เซตว่างต้องอ่านเป็น "ข้าม" ไม่ใช่ "ขาด 0" — สองทาง: ไม่มี legacy **หรือ legacy ว่าง**
    --    ทางที่สองคือรูที่ P3 เจอ · แถว "จำนวนแถว" ข้างล่างจับได้แล้ว **แต่แถวนี้ก็ต้องไม่โกหก**
    case when not (select v from schema_ok) then '⏸'
         when (select count(*) from req_place) = 0 then '⏸'
         when (select count(*) from req_place r
                where not exists (select 1 from public.catalog_places c where c.legacy_slug = r.slug)) = 0
         then '✅' else '🔴' end,
    case when not (select v from schema_ok) then 'ข้าม — ไม่มี legacy'
         when (select count(*) from req_place) = 0 then 'ข้าม — legacy ไม่มีแถวให้ตรวจ (ดูแถวจำนวนแถว)'
    else (select count(*)::text from req_place) || ' สแลกที่ต้องมี · ขาด ' ||
         (select count(*)::text from req_place r
           where not exists (select 1 from public.catalog_places c where c.legacy_slug = r.slug)) ||
         coalesce(' → ' || (select string_agg(r.slug, ', ' order by r.slug) from req_place r
           where not exists (select 1 from public.catalog_places c where c.legacy_slug = r.slug)), '') end
  union all select 5, 'สแลกเมืองในคลัง',
    case when (select count(*) from req_city r
                where not exists (select 1 from public.catalog_cities c where c.legacy_slug = r.slug)) = 0
         then '✅' else '🔴' end,
    '6 เมืองที่ก้อน 01 ต้องหาให้เจอ · ขาด ' ||
    (select count(*)::text from req_city r
      where not exists (select 1 from public.catalog_cities c where c.legacy_slug = r.slug)) ||
    coalesce(' → ' || (select string_agg(r.slug, ', ' order by r.slug) from req_city r
      where not exists (select 1 from public.catalog_cities c where c.legacy_slug = r.slug)), '')

  -- ④ ทริปต้องยังไม่มี — ถ้ามีแล้วก้อน 01 จะชน PK
  union all select 6, 'ทริปปลายทางต้องยังไม่มี',
    case when not exists (select 1 from public.trips where id = md5('trip:korea-2026-10')::uuid)
         then '✅' else '🔴' end,
    case when exists (select 1 from public.trips where id = md5('trip:korea-2026-10')::uuid)
         then 'มีอยู่แล้ว — ถอนก่อนด้วย delete ใน RUN.md ถ้าจะรันซ้ำ' else 'ว่าง พร้อมรัน' end

  -- ④.๕ ยอดแถวต่อตาราง — **ตัวเดียวที่จับ "restore มาแล้วแต่ข้อมูลไม่เข้า" ได้**
  union all select 6.5, 'จำนวนแถวในสำเนาแช่แข็ง (รวม 670)',
    case when not (select v from schema_ok) then '⏸'
         when (select count(*) from pf_rows where got is distinct from want) = 0 then '✅' else '🔴' end,
    case when not (select v from schema_ok) then 'ข้าม — ไม่มี legacy'
    else coalesce((select 'ไม่ตรง ' || count(*)::text || ' ตาราง → ' ||
                     string_agg(tbl || ' ' || coalesce(got::text,'?') || '/' || want::text, ', ' order by tbl)
                   from pf_rows where got is distinct from want),
                  'ครบทั้ง 14 ตาราง · รวม ' || (select sum(got)::text from pf_rows)) end

  -- ⑤ role ที่รันต้องข้าม RLS ได้ (ก้อน 6 บังคับ)
  union all select 7, 'role ที่รันข้าม RLS ได้ (ก้อน 6)',
    case when exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
         then '✅' else '🔴' end,
    'ปัจจุบัน = ' || current_user
)
select ok, รายการ, รายละเอียด from checks order by ord;
