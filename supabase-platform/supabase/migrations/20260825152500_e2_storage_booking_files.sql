-- ═══════════════════════════════════════════════════════════════════════════
-- E2-AC5 — ปิดรูรั่ว Storage (`D12`) · bucket private + policy ผูกสมาชิกทริป
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── `D12` — รูรั่วที่ยอมรับไว้ตั้งแต่ 17 ส.ค. และถึงคิวปิดแล้ว ──────────────
-- `0019_bookings_file.sql:1,7` ตั้ง bucket เป็น **public โดยตั้งใจ** และ policy ทั้ง 4 ตัว
-- gate แค่ `bucket_id` เฉย ๆ → **ต่อกับ B2/B3 เป็นลูกโซ่ได้:**
--   anon key ในบันเดิล → `select file_url from bookings` ทั้งตาราง → **ดึงไฟล์ตั๋วทุกใบ
--   ไม่ต้องเดา URL ด้วยซ้ำ** · ตั๋วเครื่องบิน = ชื่อเต็ม เลขที่นั่ง เลขยืนยัน วันเดินทาง
--
-- ⚠️ สำหรับ**เว็บทริป** P1 ตัดสินแล้วว่า **ไม่ต้องแก้ก่อนบิน** (ชั้นเดียวกับ B2/B3 ที่รับความเสี่ยงไว้)
--    ไฟล์นี้อยู่บน `platform` ยิงใส่ engine-dev เท่านั้น **ไม่แตะฐานทริปจริงสักบรรทัด**
--
-- ── สองข้อที่ต้องแยกจากกันให้ขาด — `E2-AC13` (P8) ───────────────────────────
--   ① *"เอา URL ไปเปิดในหน้าต่างที่ไม่ล็อกอิน ต้องไม่ได้ไฟล์"* → **ไฟล์นี้ปิดข้อนี้**
--   ② *"หลังปิด bucket ต้องเปิดไฟล์ตั๋วของแถวเดิมได้จริงจากในเว็บ"* → **ไฟล์นี้ปิดไม่ได้**
--      มันคือฝั่งโค้ด (เซ็น URL ตอนใช้) + `E7` (ย้ายค่าเดิม) · `bookings.file_path`
--      ลงไปแล้วใน `20260825145043_e2_bookings.sql` **ก่อน**ไฟล์นี้ ตามลำดับที่ `E2-AC13` สั่ง
--      🔴 กลับลำดับเมื่อไหร่ = **AC5 เขียวในวินาทีที่ทุกแถวเดิมชี้ไป URL ที่ตายแล้ว**
--
-- ── รูปทรงของ path คือด่าน ไม่ใช่แค่ระเบียบการตั้งชื่อ ─────────────────────
--   `booking-files/{trip_id}/<อะไรก็ได้>`
--   · **segment แรกเท่านั้นที่มีความหมายกับ policy** — ที่เหลือปล่อยอิสระโดยตั้งใจ
--     เพราะตอนอัปโหลดจริง ใบจองอาจ**ยังไม่มีแถว** (`BookingEditModal.tsx:85` ใช้ `"new"`)
--     แต่ `trip_id` รู้แน่นอนเสมอ → บังคับ `booking_id` เมื่อไหร่ flow อัปโหลดพัง
--   · ของเดิมวางไฟล์ที่**รากบัคเก็ต** ไม่มีโฟลเดอร์เลย → `storage.foldername()` คืน `{}`
--     → `app.booking_file_trip()` คืน `null` → `app.can_read_trip(null)` = false
--     🎯 **ไฟล์เก่าทุกใบถูกปฏิเสธโดยอัตโนมัติ ไม่ต้องมีกฎแยก** — และนั่นคือของที่ `E7` ต้องย้าย
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop policy if exists booking_files_select on storage.objects;
--   drop policy if exists booking_files_insert on storage.objects;
--   drop policy if exists booking_files_update on storage.objects;
--   drop policy if exists booking_files_delete on storage.objects;
--   drop function if exists app.booking_file_trip(text);
--   delete from storage.buckets where id = 'booking-files';
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
     where name = 'plan-korea-platform'
       and ref  = 'pmvxwcimjebogjfimzqy'
       and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;
end $guard$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. bucket — **private** + เพดานขนาด + allowlist ชนิดไฟล์
-- ───────────────────────────────────────────────────────────────────────────
-- 10MB ตรงกับ `MAX_FILE_BYTES` ที่ `BookingEditModal.tsx:33` บังคับฝั่ง client อยู่แล้ว
-- 🔴 **แต่ฝั่ง client เป็นคำแนะนำ ฝั่งนี้เป็นการบังคับ** — ด่านที่แก้ได้ด้วย devtools ไม่ใช่ด่าน
-- `allowed_mime_types` ตรงกับ `accept="image/*,application/pdf"` (`:366`) ด้วยเหตุผลเดียวกัน
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-files',
  'booking-files',
  false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'application/pdf']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. helper — อ่าน `trip_id` จาก path แบบไม่ระเบิด
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **ห้าม cast ตรง ๆ** — `'ของเก่า.pdf'::uuid` โยน exception และมันโยนใน policy
--    ซึ่งแปลว่า **object เก่าใบเดียวทำให้ query ทั้งชุดพัง** ไม่ใช่แค่แถวนั้นถูกปฏิเสธ
--    → ตรวจรูปแบบก่อน แล้วคืน `null` ถ้าไม่ใช่ uuid · `can_read_trip(null)` = false อยู่แล้ว
--    (`app.trip_role(null)` ไม่คืนแถว → `is not null` = false — ตรวจกับนิยามใน `20260824043822`)
--
-- `stable` ไม่ใช่ `immutable`: `storage.foldername()` เป็นของ Supabase เราไม่ได้ประกาศ volatility ของมันเอง
create or replace function app.booking_file_trip(object_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce((storage.foldername(object_name))[1], '') ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[1])::uuid
  end
$$;

comment on function app.booking_file_trip(text) is
  'E2-AC5 — segment แรกของ path คือ trip_id · คืน null ถ้าไม่ใช่ uuid (ไฟล์เก่าที่วางไว้รากบัคเก็ต) '
  'ห้ามเปลี่ยนเป็น cast ตรง: exception ใน policy ทำให้ทั้ง query พัง ไม่ใช่แค่แถวนั้นถูกปฏิเสธ';

revoke all on function app.booking_file_trip(text) from public, anon;
grant execute on function app.booking_file_trip(text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. policy — ผูกสมาชิกทริป ไม่ใช่ผูก `bucket_id`
-- ───────────────────────────────────────────────────────────────────────────
-- 🎯 **ความต่างทั้งหมดจาก `0019` อยู่ตรงนี้:** ของเดิมเงื่อนไขคือ `bucket_id = 'booking-files'`
--    ซึ่งเป็นจริงสำหรับทุกคนที่ถือ anon key · ของใหม่ต้องเป็นสมาชิกทริปที่ path ชี้ไป
-- · อ่าน = `can_read_trip` (viewer อ่านตั๋วได้) · เขียน/ลบ = `can_write_trip` (`D61`/`P-46`)
-- · `to authenticated` ทุกตัว — **`anon` ไม่มี policy สักตัวบนบัคเก็ตนี้ จึงไม่มีทางเข้าเลย**
drop policy if exists "anyone can read booking-files"   on storage.objects;
drop policy if exists "anyone can upload booking-files" on storage.objects;
drop policy if exists "anyone can update booking-files" on storage.objects;
drop policy if exists "anyone can delete booking-files" on storage.objects;

create policy booking_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booking-files'
    and app.can_read_trip(app.booking_file_trip(name))
  );

create policy booking_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booking-files'
    and app.can_write_trip(app.booking_file_trip(name))
  );

create policy booking_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'booking-files'
    and app.can_write_trip(app.booking_file_trip(name))
  )
  with check (
    bucket_id = 'booking-files'
    and app.can_write_trip(app.booking_file_trip(name))
  );

create policy booking_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'booking-files'
    and app.can_write_trip(app.booking_file_trip(name))
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 4. ตรวจในทรานแซกชันเดียวกัน — เกณฑ์ของ `E2-AC5` ฝั่งที่ SQL วัดได้
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 ไม่ได้แทนเกณฑ์จริง (*"เปิด URL ในหน้าต่างที่ไม่ล็อกอิน"*) — อันนั้นวัดจากข้างนอกเท่านั้น
--    ตัวนี้กันแค่ *"ลงไปแล้วแต่ยังเป็น public เพราะ `on conflict` ไม่ทำงานตามที่คิด"*
do $verify$
declare v_public boolean;
begin
  select public into v_public from storage.buckets where id = 'booking-files';
  if v_public is null then
    raise exception 'E2-AC5 ล้มเหลว: ไม่มี bucket booking-files หลังรัน insert';
  end if;
  if v_public then
    raise exception 'E2-AC5 ล้มเหลว: bucket booking-files ยังเป็น public';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and 'anon' = any (roles) and qual like '%booking-files%'
  ) then
    raise exception 'E2-AC5 ล้มเหลว: ยังมี policy ที่ให้ anon แตะ booking-files';
  end if;
end $verify$;

commit;
