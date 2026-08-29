-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 6: แคช 3 ใบเดิม → 4 ใบใหม่ · 467 แถวเข้า 555 แถวออก           │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- รันเมื่อไหร่ก็ได้ **ไม่ต้องมีทริป** — แคชทั้งหมด `ไม่มี trip_id โดยตั้งใจ`
-- (`column-map.md:123,180` — เป็นข้อมูลของ Google ต่อสถานที่ · ใช้ข้ามทริปได้และ**ควร**ใช้ซ้ำ)
--
-- ── การแมป ───────────────────────────────────────────────────────────────────
--   legacy.place_details_cache  140  →  place_details_cache        140   (8 คอลัมน์)
--                                   →  place_details_local_cache   88   (แถวที่มี locale)
--   legacy.place_photo_cache    142  →  place_photo_cache          142   คงเดิมทุกคอลัมน์
--   legacy.travel_time_cache    185  →  travel_time_cache          185   คงเดิมทุกคอลัมน์
--                               ───                               ───
--                               467                               555
--
-- 🔴 **`place_details_cache` แตกเป็น 2 ใบ (`D77`)** — ไม่ใช่การเปลี่ยนชื่อคอลัมน์
--    เหตุผลที่ `column-map.md:125-128` บันทึกไว้: ตารางเดิมตอบขัดกันเอง —
--    `locale` ถูกเขียนว่าเป็นคีย์ร่วม ส่วน `rating`/`reviews` เขียนว่าคงเดิม
--    → ถ้า PK เป็น `(maps_query, locale)` **เรทติ้งของที่เดียวกันจะต่างกันตามภาษาได้**
--      โดยไม่มีบรรทัดไหนผิด · และ `locale` วันนี้ nullable ซึ่งอยู่ใน PK ไม่ได้
--
-- ⚠️ **ยอดเข้ากับยอดออกไม่เท่ากันโดยตั้งใจ** (467 → 555) — 88 แถวถูกอ่านสองรอบ
--    ลงคนละใบ ไม่ใช่ซ้ำ · เคสด้านล่างจึงตรวจ *ต่อใบ* ไม่ใช่ยอดรวม
--    🎯 ยอดรวมที่ตรงในกรณีนี้จะแปลว่า **มีอะไรผิด** ไม่ใช่ว่าถูก

begin;

do $e7$
declare n int; expected int; n_local int;
begin
  -- 🔴 **ก้อนนี้ต้องรันด้วย role ที่ข้าม RLS ได้** — แคชทั้ง 4 ใบ `revoke all` จาก
  --    `anon`/`authenticated` และ **ไม่มี policy สักตัว โดยตั้งใจ** (`20260825152400_e2_caches.sql`)
  --    → ไม่มีทางอื่นเลยที่จะมีแถวอยู่จริงในตาราง (เหตุผลเดียวกับ "ข้อยกเว้นที่ 5" ใน `TEAM.md`)
  --    บน Supabase SQL editor รันเป็น `postgres` อยู่แล้ว จึงผ่าน · ที่อื่นต้อง `service_role`
  --    ⚠️ ถ้าไม่ดัก จะได้ `new row violates row-level security policy` ซึ่งอ่านเหมือน**บั๊กของ policy**
  --       ทั้งที่เป็นเรื่อง *ใครรัน* — เสียเวลาไล่ผิดทางแน่นอน (ผมเสียมาแล้วรอบหนึ่ง)
  if not exists (
    select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'ก้อน 6 ต้องรันด้วย role ที่ข้าม RLS (postgres หรือ service_role) — ตอนนี้เป็น %', current_user;
  end if;

  -- ① place_details_cache — ทิ้ง locale/name_local/address_local ไว้ให้ใบที่สอง
  insert into public.place_details_cache (
    maps_query, google_place_id, opening_hours, rating,
    user_rating_count, primary_type, reviews, fetched_at
  )
  select c.maps_query, c.google_place_id, c.opening_hours, c.rating,
         c.user_rating_count, c.primary_type, c.reviews, c.fetched_at
  from legacy.place_details_cache c;

  select count(*) into expected from legacy.place_details_cache;
  select count(*) into n from public.place_details_cache;
  if n <> expected then raise exception 'place_details_cache ต้องได้ % ได้ %', expected, n; end if;

  -- ② place_details_local_cache — **เฉพาะแถวที่มี locale** (`locale` อยู่ใน PK จึง null ไม่ได้)
  insert into public.place_details_local_cache (maps_query, locale, name_local, address_local, fetched_at)
  select c.maps_query, c.locale, c.name_local, c.address_local, c.fetched_at
  from legacy.place_details_cache c
  where c.locale is not null;

  select count(*) into expected from legacy.place_details_cache where locale is not null;
  select count(*) into n_local from public.place_details_local_cache;
  if n_local <> expected then raise exception 'place_details_local_cache ต้องได้ % ได้ %', expected, n_local; end if;

  -- 🔴 **ทิศที่ยอดรวมมองไม่เห็น: แถวที่ *มีชื่อท้องถิ่น* แต่ *ไม่มี locale* จะหายทั้งใบ**
  --    (140 = 88 + 52 · ยอดใบแรกยังตรงเป๊ะทั้งที่ข้อมูลหาย — ยอดรวมพิสูจน์ข้อนี้ไม่ได้เลย)
  select count(*) into n from legacy.place_details_cache
   where locale is null and (name_local is not null or address_local is not null);
  if n > 0 then
    raise exception '% แถวมีชื่อท้องถิ่นแต่ไม่มี locale — จะตกหล่นเพราะ locale อยู่ใน PK', n;
  end if;

  -- ทิศกลับ: ทุกแถวที่ย้ายไปใบที่สอง ต้องมีคู่ในใบแรก (ไม่มี FK บังคับให้)
  select count(*) into n from public.place_details_local_cache l
   where not exists (select 1 from public.place_details_cache d where d.maps_query = l.maps_query);
  if n > 0 then raise exception '% แถวในใบท้องถิ่นไม่มีคู่ในใบหลัก', n; end if;

  -- ③ place_photo_cache — คงเดิมทุกคอลัมน์
  insert into public.place_photo_cache (maps_query, photo_names, fetched_at)
  select p.maps_query, p.photo_names, p.fetched_at from legacy.place_photo_cache p;

  select count(*) into expected from legacy.place_photo_cache;
  select count(*) into n from public.place_photo_cache;
  if n <> expected then raise exception 'place_photo_cache ต้องได้ % ได้ %', expected, n; end if;

  -- ④ travel_time_cache — คงเดิม · คีย์ยังเป็น text (สแลกเดิม) ตาม `column-map.md:187`
  insert into public.travel_time_cache (
    from_place_id, to_place_id, travel_mode, duration_minutes, distance_meters, fetched_at
  )
  select t.from_place_id, t.to_place_id, t.travel_mode, t.duration_minutes, t.distance_meters, t.fetched_at
  from legacy.travel_time_cache t;

  select count(*) into expected from legacy.travel_time_cache;
  select count(*) into n from public.travel_time_cache;
  if n <> expected then raise exception 'travel_time_cache ต้องได้ % ได้ %', expected, n; end if;

  raise notice 'E7 · แคช · details % (+ท้องถิ่น %) · photo % · travel %',
    (select count(*) from public.place_details_cache),
    n_local,
    (select count(*) from public.place_photo_cache),
    (select count(*) from public.travel_time_cache);
end $e7$;

commit;
