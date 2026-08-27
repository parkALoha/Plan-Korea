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
-- 🔴 **`delete from storage.objects` รันไม่ได้เลย — Supabase บล็อกที่ระดับฐาน** (เจอตอน push จริง)
--    `ERROR: Direct deletion from storage tables is not allowed. Use the Storage API instead.
--     (SQLSTATE 42501)` → ทั้ง migration rollback ไม่มีอะไรลงสักบรรทัด
--    ⚠️ **และมันพา `20260827233000` (คลังญี่ปุ่น) ล้มไปด้วย** เพราะ `db push` หยุดที่ไฟล์แรกที่ล้ม
--
--    🎯 **ฉบับแรกเขียนไว้เองว่า "ไม่เดา — ลบให้ชัด" ซึ่งเป็นหลักที่ถูก แต่ใช้ผิดที่:**
--    ที่นี่ *"ลบให้ชัด"* ไม่ได้แปลว่าแน่นอนกว่า — มันแปลว่า**เพิ่มคำสั่งที่รันไม่ได้** เข้าไปในทรานแซกชัน
--    ตัวที่ให้ความแน่นอนจริงคือ **การยืนยัน** ไม่ใช่การลบ · P4 ยิงเช็คแล้ววันนี้: `entries=[]` ว่างสนิท
--    (เขาเป็นคนอัปโหลด probe เข้าบัคเก็ตนี้เองทั้งวัน และ `afterAll` เก็บครบ)
--
--    ถ้าวันหนึ่งมันไม่ว่าง ด่านล่างนี้จะบอกตรง ๆ ว่าต้องทำอะไร แทนที่จะล้มด้วยข้อความ FK ที่อ่านไม่ออก
do $objects$
declare n_obj int;
begin
  select count(*) into n_obj from storage.objects where bucket_id = 'trip-covers';
  if n_obj <> 0 then
    raise exception 'บัคเก็ต trip-covers ยังมี % ไฟล์ — ลบผ่าน Storage API ก่อน (ลบด้วย SQL ไม่ได้) แล้วค่อย push ใหม่', n_obj;
  end if;
end $objects$;

-- ── 2. policy 4 ตัว ────────────────────────────────────────────────────────
drop policy if exists trip_covers_select on storage.objects;
drop policy if exists trip_covers_insert on storage.objects;
drop policy if exists trip_covers_update on storage.objects;
drop policy if exists trip_covers_delete on storage.objects;

-- ── 3. bucket — **ลบด้วย SQL ไม่ได้ ต้องลบผ่าน Storage API** ────────────────
-- 🔴 บล็อกเดียวกับ `storage.objects` เป๊ะ · push จริงล้มที่บรรทัดนี้เป็นรอบที่สอง:
--    `Direct deletion from storage tables is not allowed. Use the Storage API instead.`
--    → คำว่า "tables" พหูพจน์ในข้อความ **ครอบทั้ง `objects` และ `buckets`** ยืนยันด้วยการรันจริงแล้ว
--
-- 🎯 **ไฟล์นี้จึงลบบัคเก็ตไม่ได้เลย และไม่พยายาม** — มันตรวจว่าลบไปแล้วหรือยัง (ข้อ 6)
--    บัคเก็ต `trip-covers` ถูกลบผ่าน Storage API เมื่อ 27 ส.ค. 2026 (ตอบ 200 `Successfully deleted`
--    · ยืนยันว่าว่าง 0 ไฟล์ก่อนลบ · `booking-files` ไม่ถูกแตะ ยังเป็น private)
--
-- ⚠️ **ผลต่อการ replay บนฐานใหม่:** `20260827220000` สร้างบัคเก็ตนี้ด้วย `insert into storage.buckets`
--    (insert ไม่ถูกบล็อก · delete ถูกบล็อก — ไม่สมมาตรโดยตั้งใจของ Supabase)
--    → ฐานใหม่จะมีบัคเก็ตอยู่ แล้วไฟล์นี้จะ **ล้มพร้อมบอกวิธีแก้** ไม่ใช่ล้มเงียบ ๆ:
--    ```
--    curl -X DELETE "$SUPABASE_URL/storage/v1/bucket/trip-covers" \
--         -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY"
--    ```
--    🔴 **จงใจให้ล้ม ไม่ใช่ข้ามเงียบ** — ทางที่ปฏิเสธคือ "ถ้ายังมีบัคเก็ตก็ปล่อยผ่าน"
--    ซึ่งจะทำให้ฐานใหม่มีบัคเก็ตที่ไม่มี policy สักตัวค้างอยู่ตลอดกาลโดยไม่มีใครรู้ (ตระกูล `P-50`)

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
  -- 🔴 ข้อความต้องบอก *วิธีแก้* ไม่ใช่แค่ *อาการ* — บัคเก็ตลบด้วย SQL ไม่ได้ คนอ่านต้องรู้ทันที
  if n_bucket <> 0 then
    raise exception 'บัคเก็ต trip-covers ยังอยู่ — ลบด้วย SQL ไม่ได้ ต้องยิง DELETE <SUPABASE_URL>/storage/v1/bucket/trip-covers ด้วย service role key ก่อน แล้ว push ใหม่';
  end if;
  if n_col    <> 0 then raise exception 'ยังเหลือคอลัมน์ cover_image_path'; end if;
  if n_fn     <> 0 then raise exception 'ยังเหลือฟังก์ชัน app.trip_cover_trip'; end if;

  -- 🔴 ด่านที่สำคัญที่สุดของไฟล์นี้: **พิสูจน์ว่าไม่ได้ถอนของข้างบ้านไปด้วย**
  --    ถอนเกินหนึ่งบรรทัด = ไฟล์ตั๋วของทริปที่จะบิน 11 ต.ค. เปิดโล่ง และไม่มีอะไรฟ้อง
  select count(*) into n_booking from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'booking_files_%';
  if n_booking <> 4 then
    raise exception 'policy booking_files_* เหลือ % ตัว ไม่ใช่ 4 — ถอนโดนของข้างบ้าน', n_booking;
  end if;
  -- 🔴 **`public = false` ไม่ใช่ของแถม — มันคือเงื่อนไขทั้งหมด** (P4 ยิงจริงแล้วชี้ · 27 ส.ค. 2026)
  --    ฉบับแรกของบรรทัดนี้เช็คแค่ *"บัคเก็ตยังอยู่ไหม"* · แต่ **สถานะที่เสียหายที่สุดของ
  --    `booking-files` ไม่ใช่ "หายไป" — มันคือ "ยังอยู่แต่กลายเป็น public"**
  --    ซึ่งคือ `0019`/`D12` เป๊ะ: ใครถือลิงก์ก็เปิดใบเสร็จ/ตั๋วของทริป 11 ต.ค. ได้
  --    🎯 **และด่านฉบับแรกผ่านฉลุยในสถานะนั้น** — ด่านที่เขียวตอนของพัง แย่กว่าไม่มีด่าน
  if not exists (select 1 from storage.buckets where id = 'booking-files' and public = false) then
    raise exception 'booking-files หายไป หรือกลายเป็น public — ถอนโดนของข้างบ้าน';
  end if;

  -- 🔴 **`count = 4` พิสูจน์ว่า policy *ถูกลิสต์* ไม่ได้พิสูจน์ว่ามัน *ถูกบังคับใช้*** (P4)
  --    ปิด RLS บน `storage.objects` แล้ว policy ทั้ง 4 **ยังนับได้ 4 เต็ม** และไม่มีผลสักตัว
  --    → ด่านข้างบนเขียว ไฟล์เปิดโล่ง · รูปเดียวกับที่ทีมนี้เจอกันทั้งวัน: **นับชื่อ ≠ วัดพฤติกรรม**
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'RLS บน storage.objects ถูกปิด — policy ทั้ง 4 ยังนับได้ครบแต่ไม่มีผลสักตัว';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = 'booking_file_trip'
  ) then
    raise exception 'app.booking_file_trip() หายไป — ถอนโดนของข้างบ้าน';
  end if;
end $verify$;

commit;
