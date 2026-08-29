-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 4: bookings 8 · checklist_items 8 · hidden_places 39 ·        │
-- │                place_notes 2                              = 57 แถว        │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ต้องรัน `01` · `02` ก่อน (ต้องมีทริป · แผน · วัน · custom_places อยู่แล้ว)
-- 🔴 ต้องรัน migration `20260829020000` (hidden_places รับ custom) และ
--    `20260829040000` (bookings.status คืนโดเมนเดิม) ก่อน — บล็อกด้านล่างเช็กเองทั้งคู่
--
-- ── การแมป · วัดจากข้อมูลจริงทั้ง 57 แถว ไม่มีเศษเหลือ (29 ส.ค. 2026) ────────
--
--   bookings         8   `day_id` d3..d10 → `trip_day_id` · `date` text → date
--                        🔴 `status`: pending 5 · walk_up 3 — **ทั้งสองค่าไม่มีในโดเมนที่ลงไว้**
--   checklist_items  8   ตรงไปตรงมา · `category` 3 ค่า ไม่มี constraint จำกัด
--   hidden_places   39   catalog 18 · custom 21  ← **21 แถวนี้คือรูที่ปิดไปเมื่อคืน**
--   place_notes      2   catalog ทั้งคู่ · แผนเดียวกัน · ไม่มี photo
--
-- 🔴 **`hidden_places` 21/39 เป็น custom** — ถ้าไม่มี migration `20260829020000`
--    คอลัมน์ `custom_place_id` จะไม่มีอยู่ และ **54% ของตารางนี้จะหายเงียบ ๆ**
--    (แถวจะถูกทิ้งเพราะ `catalog_place_id` เป็น null แล้วชน `exactly_one_place`
--     — ซึ่งจะ *ล้ม* ไม่ใช่หายเงียบ **ก็ต่อเมื่อมีคนเขียน insert ให้มันพยายามใส่**
--     ฉบับที่ทิ้ง `where place_id not like 'custom-%'` จะเขียวและหาย 21 แถว)

begin;

create or replace function pg_temp.lid(kind text, id text) returns uuid
  language sql immutable as $$ select md5(kind || ':' || id)::uuid $$;

do $e7$
declare
  v_owner uuid;                              -- อ่านจาก trips.created_by (ก้อน 01 เป็นคนตั้ง)
  v_trip  uuid := pg_temp.lid('trip', 'korea-2026-10');
  n int; expected int;
  v_domain text;
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

  -- ── ด่านก่อนแตะข้อมูล: สคีมาต้องรับของที่เรากำลังจะใส่ ─────────────────────
  -- 🎯 ทั้งสองอันนี้ *ต้องล้มดัง* ไม่ใช่ปล่อยให้ insert ไปตายทีหลังด้วยข้อความที่อ่านไม่ออก
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='hidden_places' and column_name='custom_place_id'
  ) then
    raise exception 'ยังไม่ได้รัน migration 20260829020000 — hidden_places จะหาย 21/39 แถว';
  end if;

  select pg_get_constraintdef(oid) into v_domain
    from pg_constraint where conrelid='public.bookings'::regclass and conname='bookings_status_check';
  if v_domain not like '%walk_up%' then
    raise exception 'ยังไม่ได้รัน migration 20260829040000 — bookings.status ยังไม่รับ walk_up (โดเมนตอนนี้: %)', v_domain;
  end if;

  -- ── ① bookings ────────────────────────────────────────────────────────────
  insert into public.bookings (
    id, trip_id, trip_day_id, category, title, date, time,
    confirmation_number, link, note, file_path, file_name,
    status, book_by_days_before, added_by_user, legacy_added_by, created_at, updated_at
  )
  select
    pg_temp.lid('booking', b.id), v_trip,
    case when b.day_id is not null then pg_temp.lid('day', b.day_id) end,
    b.category, b.title,
    nullif(b.date, '')::date,
    nullif(b.time, ''),
    b.confirmation_number, b.link, b.note,
    -- `file_url` → `file_path` เหมือน `photo_path` (`column-map.md:68`) — ทริปนี้ว่างทั้ง 8 แถว
    case when b.file_url is not null
         then v_trip::text || '/' || regexp_replace(b.file_url, '^.*/', '') end,
    b.file_name,
    b.status,                                   -- ไม่แปลงค่า — โดเมนปลายทางรับเดิมแล้ว
    b.book_by_days_before,
    case when b.added_by is not null then v_owner end, b.added_by,
    b.created_at, b.updated_at
  from legacy.bookings b;

  select count(*) into expected from legacy.bookings;
  select count(*) into n from public.bookings where trip_id = v_trip;
  if n <> expected then raise exception 'bookings ต้องได้ % แถว ได้ %', expected, n; end if;

  -- 🔴 ทุกแถวที่ *เคยมี* day_id ต้องยังมี — FK เงียบไม่ได้ แต่ `case` ที่เขียนผิดเงียบได้
  select count(*) into n from legacy.bookings b
   join public.bookings p on p.id = pg_temp.lid('booking', b.id)
   where b.day_id is not null and p.trip_day_id is null;
  if n > 0 then raise exception '% แถว bookings เสีย trip_day_id ระหว่างแมป', n; end if;

  -- 🔴 ทิศกลับ: ค่า status ต้องเท่าเดิมทุกแถว **ไม่ใช่แค่ "insert ผ่าน"**
  select count(*) into n from legacy.bookings b
   join public.bookings p on p.id = pg_temp.lid('booking', b.id)
   where p.status <> b.status;
  if n > 0 then raise exception '% แถว status เพี้ยนจากเดิม', n; end if;

  -- ── ② checklist_items ─────────────────────────────────────────────────────
  insert into public.checklist_items (
    id, trip_id, text, category, is_checked,
    checked_by_user, legacy_checked_by, added_by_user, legacy_added_by,
    created_at, updated_at
  )
  select
    pg_temp.lid('checklist', c.id), v_trip, c.text, c.category, c.is_checked,
    case when c.checked_by is not null then v_owner end, c.checked_by,
    case when c.added_by  is not null then v_owner end, c.added_by,
    c.created_at, c.updated_at
  from legacy.checklist_items c;

  select count(*) into expected from legacy.checklist_items;
  select count(*) into n from public.checklist_items where trip_id = v_trip;
  if n <> expected then raise exception 'checklist_items ต้องได้ % แถว ได้ %', expected, n; end if;

  -- ── ③ hidden_places — ตารางที่มีรู 21 แถว ──────────────────────────────────
  insert into public.hidden_places (
    id, trip_id, catalog_place_id, custom_place_id, hidden_by_user, legacy_hidden_by, hidden_at
  )
  select
    pg_temp.lid('hidden', h.place_id), v_trip,
    -- ทดสอบสมาชิกภาพ ไม่ใช่ prefix — ดูเหตุผลในก้อน 03
    case when not exists (select 1 from legacy.custom_places cp where cp.id = h.place_id)
         then (select c.id from public.catalog_places c where c.legacy_slug = h.place_id) end,
    case when exists (select 1 from legacy.custom_places cp where cp.id = h.place_id)
         then pg_temp.lid('custom_place', h.place_id) end,
    case when h.hidden_by is not null then v_owner end, h.hidden_by,
    h.hidden_at
  from legacy.hidden_places h;

  select count(*) into expected from legacy.hidden_places;
  select count(*) into n from public.hidden_places where trip_id = v_trip;
  if n <> expected then raise exception 'hidden_places ต้องได้ % แถว ได้ %', expected, n; end if;

  -- 🔴 **เคสที่กันรูเดิมโดยตรง** — สัดส่วนต้องตรงกับที่วัดไว้ ไม่ใช่แค่ยอดรวมตรง
  --    ยอดรวมอย่างเดียวผ่านได้ถ้ามีคนย้าย 21 แถว custom ไปเป็น catalog ที่ผิดตัว
  select count(*) into n from public.hidden_places
   where trip_id = v_trip and custom_place_id is not null;
  if n <> 21 then raise exception 'hidden_places ฝั่ง custom ต้องได้ 21 แถว ได้ %', n; end if;
  select count(*) into n from public.hidden_places
   where trip_id = v_trip and catalog_place_id is not null;
  if n <> 18 then raise exception 'hidden_places ฝั่ง catalog ต้องได้ 18 แถว ได้ %', n; end if;

  -- ── ④ place_notes ─────────────────────────────────────────────────────────
  insert into public.place_notes (
    id, trip_id, plan_id, catalog_place_id, custom_place_id,
    note, photo_path, added_by_user, updated_at
  )
  select
    -- PK เดิมคือ (plan_id, place_id) — ต้องรวมทั้งคู่ ไม่งั้นโน้ตคนละแผนชนกัน
    pg_temp.lid('place_note', p.plan_id || '/' || p.place_id), v_trip,
    pg_temp.lid('plan', p.plan_id),
    case when not exists (select 1 from legacy.custom_places cp where cp.id = p.place_id)
         then (select c.id from public.catalog_places c where c.legacy_slug = p.place_id) end,
    case when exists (select 1 from legacy.custom_places cp where cp.id = p.place_id)
         then pg_temp.lid('custom_place', p.place_id) end,
    p.note,
    case when p.photo_url is not null
         then v_trip::text || '/' || regexp_replace(p.photo_url, '^.*/', '') end,
    v_owner, p.updated_at
  from legacy.place_notes p;

  select count(*) into expected from legacy.place_notes;
  select count(*) into n from public.place_notes where trip_id = v_trip;
  if n <> expected then raise exception 'place_notes ต้องได้ % แถว ได้ %', expected, n; end if;

  -- ── ทิศที่ครอบทั้งก้อน: path ห้ามเป็น URL — ไม่มีคอลัมน์ไหนมี constraint กัน ──
  select (select count(*) from public.bookings    where trip_id=v_trip and file_path  like '%://%')
       + (select count(*) from public.place_notes where trip_id=v_trip and photo_path like '%://%')
    into n;
  if n > 0 then raise exception '% แถวเก็บ URL ไว้ในคอลัมน์ path', n; end if;

  raise notice 'E7 · ก้อน 4 · bookings % · checklist % · hidden % (custom 21) · notes %',
    (select count(*) from public.bookings        where trip_id=v_trip),
    (select count(*) from public.checklist_items where trip_id=v_trip),
    (select count(*) from public.hidden_places   where trip_id=v_trip),
    (select count(*) from public.place_notes     where trip_id=v_trip);
end $e7$;

commit;
