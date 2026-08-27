-- ═══════════════════════════════════════════════════════════════════════════
-- E5 — ถอนรูปปกแบบอัปโหลด: bucket + policy + helper + คอลัมน์
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · **ถอนเพราะสโคปเปลี่ยนตามมติผู้ใช้ ไม่ใช่เพราะเคยผิด**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมถอน ───────────────────────────────────────────────────────────────
-- ผู้ใช้เปลี่ยนทิศ 27 ส.ค. หลังเห็นของจริงทำงาน:
--   *"รูปปกทริปจะไม่ได้อัปโหลดเอง แต่ควรแสดงตามทริป — เกาหลี/ญี่ปุ่น หรือแบ่งตามเมือง
--     **เราจะตั้งรูปในระบบเราอยู่แล้ว ป้องกันข้อมูลภาพเยอะเกิน**"*
--
-- 🎯 **ทิศใหม่ไม่ต้องการฐานเลยสักบรรทัด** — รูปเป็นไฟล์สถิตย์ใน `public/covers/`
--    UI คำนวณเองจาก `trip_destinations → catalog_cities → catalog_countries` ที่มีอยู่แล้ว
--    → bucket · policy · helper · คอลัมน์ **ไม่มีอะไรมาอ่านมันอีกแล้ว**
--
-- 🔴 **ของที่ไม่มีใครใช้แต่ยังอยู่ คือของที่ดูเหมือนใช้งานได้** — และ bucket ที่มี policy ฝั่งเขียน
--    ค้างไว้โดยไม่มีใครเรียก คือพื้นผิวที่ไม่มีใครเฝ้า · ถอนดีกว่าเก็บ
--
-- ── ลำดับ — ไฟล์นี้คือขั้นที่ 3 และต้องเป็นขั้นสุดท้ายเสมอ ──────────────────
--   ① `18ec695` ถอดโค้ดที่อ่านคอลัมน์ + ลบ route  ← ต้องมาก่อน
--   ② `9505bb9` P4 ถอน probe + ย้าย 6 เคสไป `booking-files` + SURFACE 11→10
--   ③ **ไฟล์นี้** — ถอนของจริงในฐาน
-- 🔴 **กลับลำดับเมื่อไหร่ = `502 column does not exist` ให้ทุกผู้ใช้** — เกิดมาแล้วจริงวันนี้ (`fad69d0`)
--
-- ── ⚠️ ของที่ **ไม่** ถอน และห้ามถอนตาม ────────────────────────────────────
--   · bucket `booking-files` + policy 4 ตัว + `app.booking_file_trip()` — **คนละบัคเก็ต**
--     คุ้มไฟล์ตั๋วของทริปที่จะบิน 11 ต.ค. · ไม่เกี่ยวกับรูปปกเลย
--   · 6 เคสที่ P4 ย้ายไปครอบ `booking-files` — **ข้อเท็จจริงที่มันพิสูจน์ยังจริงทุกข้อ**
--     โดยเฉพาะ `objects.update` ซึ่ง **ก่อนย้ายไม่มีเคสไหนในโปรเจกต์ยิงเลยสักครั้ง**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   ดู `20260827220000_e5_trip_cover_storage.sql` — สร้างกลับได้ทั้งชุด
--   ⚠️ **แต่คอลัมน์จะกลับมาว่าง** · ถ้าวันหนึ่งเปิดฟีเจอร์นี้ใหม่ ให้ทบทวนว่ายังต้องการจริงไหม
--      ก่อนก๊อปไฟล์เก่ากลับมา — ทิศที่เปลี่ยนวันนี้เปลี่ยนเพราะเหตุผลที่ยังใช้ได้อยู่
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

-- ── 1. เก็บกวาดไฟล์ที่ค้างในบัคเก็ตก่อนลบบัคเก็ต ────────────────────────────
-- 🔴 ลบ bucket ทั้งที่ยังมี object = FK ของ `storage.objects` ปฏิเสธ → migration ล้มกลางทาง
--    ที่นี่คาดว่าว่างอยู่แล้ว (ฟีเจอร์ยังไม่เคยถึงมือผู้ใช้จริง) แต่ **ไม่เดา — ลบให้ชัด**
delete from storage.objects where bucket_id = 'trip-covers';

-- ── 2. policy 4 ตัว ────────────────────────────────────────────────────────
drop policy if exists trip_covers_select on storage.objects;
drop policy if exists trip_covers_insert on storage.objects;
drop policy if exists trip_covers_update on storage.objects;
drop policy if exists trip_covers_delete on storage.objects;

-- ── 3. bucket ─────────────────────────────────────────────────────────────
delete from storage.buckets where id = 'trip-covers';

-- ── 4. helper ─────────────────────────────────────────────────────────────
-- ⚠️ **ตัวนี้เท่านั้น** — `app.booking_file_trip()` เป็นคู่แฝดคนละบัคเก็ต **ห้ามแตะ**
drop function if exists app.trip_cover_trip(text);

-- ── 5. คอลัมน์ ────────────────────────────────────────────────────────────
-- ไม่มีโค้ดไหนอ่านแล้ว (`18ec695`) · และไม่เคยมีแถวไหนมีค่า (ไม่เคยมีตัวอัปโหลดถึงมือผู้ใช้)
alter table public.trips drop column if exists cover_image_path;

-- ── 6. ยืนยันในทรานแซกชันเดียวกัน ──────────────────────────────────────────
do $verify$
declare n_policy int; n_bucket int; n_col int; n_fn int; n_booking int;
begin
  select count(*) into n_policy from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'trip_covers_%';
  select count(*) into n_bucket from storage.buckets where id = 'trip-covers';
  select count(*) into n_col from information_schema.columns
   where table_schema = 'public' and table_name = 'trips' and column_name = 'cover_image_path';
  select count(*) into n_fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'trip_cover_trip';

  if n_policy <> 0 then raise exception 'ยังเหลือ policy trip_covers_* % ตัว', n_policy; end if;
  if n_bucket <> 0 then raise exception 'ยังเหลือบัคเก็ต trip-covers'; end if;
  if n_col    <> 0 then raise exception 'ยังเหลือคอลัมน์ cover_image_path'; end if;
  if n_fn     <> 0 then raise exception 'ยังเหลือฟังก์ชัน app.trip_cover_trip'; end if;

  -- 🔴 ด่านที่สำคัญที่สุดของไฟล์นี้: **พิสูจน์ว่าไม่ได้ถอนของข้างบ้านไปด้วย**
  --    ถอนเกินหนึ่งบรรทัด = ไฟล์ตั๋วของทริปที่จะบิน 11 ต.ค. เปิดโล่ง และไม่มีอะไรฟ้อง
  select count(*) into n_booking from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'booking_files_%';
  if n_booking <> 4 then
    raise exception 'policy booking_files_* เหลือ % ตัว ไม่ใช่ 4 — ถอนโดนของข้างบ้าน', n_booking;
  end if;
  if not exists (select 1 from storage.buckets where id = 'booking-files') then
    raise exception 'บัคเก็ต booking-files หายไป — ถอนโดนของข้างบ้าน';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = 'booking_file_trip'
  ) then
    raise exception 'app.booking_file_trip() หายไป — ถอนโดนของข้างบ้าน';
  end if;
end $verify$;

commit;
