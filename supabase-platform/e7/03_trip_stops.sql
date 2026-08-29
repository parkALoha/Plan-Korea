-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 2: trip_stops — 71 แถว · แมป place_id 4 กลุ่ม                  │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ต้องรัน `01_trip_skeleton.sql` **และ `02_custom_places.sql`** ก่อน
--   01 = trip · plans · days · 02 = custom_places ที่ `trip_stops_custom_place_fk` ชี้ไป
--   ⚠️ หัวไฟล์เดิมเขียนแค่ 01 ขณะที่ `RUN.md` เขียน `01 · 02` ถูกอยู่แล้ว (P3 รีวิวเจอ)
--
-- 🔴 การแมป — วัดจากข้อมูลจริงทั้ง 71 แถว ไม่มีเศษเหลือ (29 ส.ค. 2026):
--   legacy kind   รูปแบบ place_id     n    ปลายทาง
--   place         สแลกคลัง            51   catalog_place_id  (จับด้วย catalog_places.legacy_slug)
--   place         custom-*             8   custom_place_id
--   transfer      สแลกคลัง             4   catalog_place_id
--   hotel         hotel@lat,lng        5   **ไม่มี place ref** — constraint บังคับให้เป็น 0
--   intercity     ว่าง                 3   **ไม่มี place ref**
--                                     ──
--                                     71
-- ⚠️ `hotel@lat,lng` เป็นคีย์ที่ระบบเก่าสังเคราะห์ขึ้น ไม่ใช่ที่อยู่จริง —
--    ข้อมูลโรงแรมตัวจริงอยู่ใน legacy.trip_hotels (ก้อนถัดไป) จึงไม่เสียอะไรตรงนี้
--
-- rank: `lpad(order_index,4,'0') || 'V'`
--   · ต้องผ่าน `trip_stops_rank_shape` = `^[0-9A-Za-z]+$` **และห้ามลงท้ายด้วย `0`**
--   · ความกว้างคงที่ → เรียงตามพจนานุกรมตรงกับ order_index (0–7 · ไม่ซ้ำใน (plan,day))
--   · แทรกทีหลังได้ปกติ: `0001V` < `0001V5` < `0002V` (rankBetween ฝั่งแอปยังใช้ได้)
--   🔴 ไม่ใช่ตัวสร้าง rank ทั่วไป — เป็นการหว่านค่าเริ่มต้นที่รักษาลำดับเท่านั้น

begin;

create or replace function pg_temp.lid(kind text, id text) returns uuid
  language sql immutable as $$ select md5(kind || ':' || id)::uuid $$;

do $e7$
declare
  v_owner uuid;                              -- อ่านจาก trips.created_by (ก้อน 01 เป็นคนตั้ง)
  v_trip  uuid := pg_temp.lid('trip', 'korea-2026-10');
  n int; expected int;
begin
  -- 🔴 **เจ้าของอ่านจากฐาน ไม่ใช่จากตัวแปรเซสชัน** — ก้อน 01 เป็นที่เดียวที่รับค่าจากคน
  --    เหตุ ①: SQL editor ของ Supabase ใช้คอนเนกชันแบบพูล → `set` อาจไม่อยู่ข้ามการกด Run
  --            ถ้าทุกก้อนพึ่ง GUC ผู้ใช้จะเจอ 'ต้องตั้ง e7.owner_uuid' ซ้ำ 7 รอบ
  --    เหตุ ② **สำคัญกว่า**: ตั้ง uuid ผิดในก้อนหลัง → แถวจะมีเจ้าของคนละคนกับก้อน 01
  --            **โดยไม่มี error ใด ๆ** · อ่านจากฐานทำให้ค่านั้นเป็นค่าเดียวเสมอตามนิยาม
  select t.created_by into v_owner from public.trips t where t.id = v_trip;
  if v_owner is null then
    raise exception 'ยังไม่มีทริป (หรือทริปไม่มีเจ้าของ) — รัน 01_trip_skeleton.sql ก่อน';
  end if;
  if not exists (select 1 from public.trips where id = v_trip) then
    raise exception 'ยังไม่มีทริป — รัน 01_trip_skeleton.sql ก่อน';
  end if;

  insert into public.trip_stops (
    id, trip_id, plan_id, trip_day_id, rank, kind,
    catalog_place_id, custom_place_id,
    dwell_minutes, travel_mode, note, photo_path,
    intercity_from, intercity_to, intercity_mode,
    visited_at, transfer_target_time, transfer_target_label,
    added_by_user, legacy_added_by, updated_at
  )
  select
    pg_temp.lid('stop', s.id), v_trip,
    pg_temp.lid('plan', s.plan_id),
    pg_temp.lid('day',  s.day_id),
    lpad(s.order_index::text, 4, '0') || 'V',
    s.kind,
    -- 🔴 XOR บังคับโดย trip_stops_place_by_kind — hotel/intercity ต้องเป็น NULL ทั้งคู่
    -- 🔴 **`custom-` ไม่ใช่นิยามของ "เป็น custom place"** — นิยามคือ *มีแถวใน `custom_places`*
    --    36 ใน 37 แถวบังเอิญมี prefix · แถวที่ 37 คือ `home-base` (ที่อยู่จริงของเจ้าของทริป
    --    ตั้งใจไม่ขึ้น git — `transferPoints.ts:21-23`) · **ทดสอบสมาชิกภาพ ไม่ใช่ทดสอบชื่อ**
    case when s.kind in ('place','transfer')
           and not exists (select 1 from legacy.custom_places cp where cp.id = s.place_id)
         then (select c.id from public.catalog_places c where c.legacy_slug = s.place_id) end,
    case when s.kind in ('place','transfer')
           and exists (select 1 from legacy.custom_places cp where cp.id = s.place_id)
         then pg_temp.lid('custom_place', s.place_id) end,
    s.dwell_minutes, s.travel_mode, s.note,
    -- 🔴 `photo_url` → `photo_path` **เปลี่ยนทั้งชื่อและความหมาย** (`column-map.md:293` · E2-AC5)
    --    ค่าเดิมคือผลของ `getPublicUrl()` = URL เต็ม · ปลายทางต้องเป็น *path ของ object*
    --    และ **segment แรกต้องเป็น trip_id** เพราะ policy อ่าน trip จากตรงนั้น
    --    (`app.booking_file_trip()` · `20260825152500:89` — คืน null ถ้า segment แรกไม่ใช่ uuid
    --     ซึ่งคอมเมนต์ของมันเรียกว่า "ไฟล์เก่าที่วางไว้รากบัคเก็ต" = แถวนี้เป๊ะ)
    case when s.photo_url is not null
         then v_trip::text || '/' || regexp_replace(s.photo_url, '^.*/', '') end,
    s.intercity_from, s.intercity_to, s.intercity_mode,
    s.visited_at, s.transfer_target_time, s.transfer_target_label,
    -- `E7-AC5` — ทุกชื่อเข้าบัญชีเดียว · สตริงเดิมเก็บครบ ห้ามทิ้ง (`D19`)
    case when s.added_by is not null then v_owner end,
    s.added_by,
    s.updated_at
  from legacy.trip_stops s;

  -- ── ตรวจทันที ────────────────────────────────────────────────────────────
  select count(*) into expected from legacy.trip_stops;
  select count(*) into n from public.trip_stops where trip_id = v_trip;
  if n <> expected then raise exception 'trip_stops ต้องได้ % แถว ได้ %', expected, n; end if;

  -- 🔴 กลุ่มที่ *ต้องมี* place ref แล้วไม่มี = สแลกหาในคลังไม่เจอ · เงียบไม่ได้
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and kind in ('place','transfer')
     and catalog_place_id is null and custom_place_id is null;
  if n > 0 then raise exception '% แถวหาสถานที่ในคลังไม่เจอ — legacy_slug ไม่ตรง', n; end if;

  -- ทิศกลับ: กลุ่มที่ *ห้ามมี* แล้วดันมี
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and kind in ('hotel','intercity')
     and (catalog_place_id is not null or custom_place_id is not null);
  if n > 0 then raise exception '% แถว kind=hotel/intercity ไม่ควรมี place ref', n; end if;

  -- ลำดับต้องรักษาไว้: เรียงด้วย rank แล้วต้องได้ order_index เดิมเรียงขึ้น
  select count(*) into n from (
    select s.day_id, s.plan_id,
           s.order_index,
           row_number() over (partition by s.plan_id, s.day_id order by t.rank) - 1 as pos
    from legacy.trip_stops s
    join public.trip_stops t on t.id = pg_temp.lid('stop', s.id)
  ) x where x.order_index <> x.pos;
  if n > 0 then raise exception 'ลำดับเพี้ยน % แถว — rank ไม่ตรงกับ order_index เดิม', n; end if;

  -- 🔴 `photo_path` **ไม่มี check constraint สักตัว** → ถ้าไม่ยิงเองก็ไม่มีอะไรจับ
  --    (ฉบับแรกของก้อนนี้ยัด URL เต็มลงไปแล้วผ่านทุกด่าน — เจอตอนไล่ทีละคอลัมน์ ไม่ใช่ตอนรัน)
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and photo_path like '%://%';
  if n > 0 then raise exception '% แถว photo_path ยังเป็น URL — ปลายทางคือ path', n; end if;

  select count(*) into n from public.trip_stops
   where trip_id = v_trip and photo_path is not null
     and split_part(photo_path, '/', 1) <> v_trip::text;
  if n > 0 then raise exception '% แถว photo_path ขึ้นต้นไม่ใช่ trip_id — policy จะอ่านไม่เจอ', n; end if;

  -- 🔴 path ที่ *รูปร่างถูก* ยังชี้ผิดไฟล์ได้ — `regexp_replace(url,'^.*/','')` เก็บ query string
  --    และ %-encode ที่ติดมากับ URL ไว้ทั้งดุ้น → รูปหายตอนผู้ใช้เปิด ไม่ใช่ตอนรัน (P3)
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and (photo_path like '%?%' or photo_path like '%\%%');
  if n > 0 then raise exception '% แถว photo_path มี query string หรือ %%-encode ค้างอยู่', n; end if;

  -- 🔴 พิมพ์เฉพาะค่าที่เพิ่งวัด · **ห้ามมีคำคุณศัพท์คงที่** — ฉบับเดิมพิมพ์ "ลำดับตรงทุกแถว"
  --    ซึ่งเป็นข้อความตายตัวที่ออกเสมอ · ถูกวันนี้เพราะเช็คข้างบน raise ไปแล้ว
  --    **แต่ความถูกนั้นมาจากตำแหน่งของบรรทัดอื่น ไม่ใช่จากตัวข้อความ** (P3 · เทียบ `echo tsc-clean` ของเขาเอง)
  raise notice 'E7 · trip_stops ปลายทาง % แถว · ลำดับที่ไม่ตรง % แถว',
    (select count(*) from public.trip_stops where trip_id = v_trip and kind <> 'event'),
    n;
end $e7$;

commit;
