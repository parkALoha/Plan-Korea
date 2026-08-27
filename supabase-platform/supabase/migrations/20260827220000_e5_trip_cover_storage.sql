-- ═══════════════════════════════════════════════════════════════════════════
-- E5 — รูปปกทริป: บัคเก็ตส่วนตัว + policy ผูกสมาชิกทริป + แก้ชื่อคอลัมน์ให้ตรงรูป
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · ผู้ใช้ตัดสิน: **ต้องมีตัวอัปโหลดจริงถึงนับว่าเสร็จ** (`E5-AC8`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 ผมเคยปฏิเสธงานนี้เอง และเหตุผลที่ผมให้ไว้ไม่หนักแน่น ─────────────────
-- `20260827180000` เขียนไว้ว่า *"ห้ามเพิ่ม Storage bucket ใหม่ตอนนี้ ขณะที่ `D12` ฝั่งโค้ดยังเปิดอยู่
-- (จะเป็นการถอยหลัง)"* — **ผมเอาสองเรื่องมาปนกัน:**
--   · ของที่ค้างใน `D12` คือ **แถวตั๋วเก่าที่ยังชี้ URL สาธารณะ + UI ที่ยังไม่เซ็นตอนแสดง**
--   · การเพิ่มบัคเก็ต **ส่วนตัว** ใบใหม่ **ไม่แตะสองอย่างนั้นเลย** และใช้รูปที่เป็น *คำตอบ* ของ `D12` อยู่แล้ว
-- 🎯 **"มีของค้างเรื่อง Storage" ไม่เท่ากับ "ห้ามแตะ Storage"** — ถ้าเหตุผลนั้นถูก เราจะแก้ `D12` เองไม่ได้ด้วยซ้ำ
--    · สิ่งที่ห้ามจริงคือ **บัคเก็ต public** ซึ่งคือความผิดของ `0019` ที่ `D12` บันทึกไว้ · ไฟล์นี้ไม่ทำแบบนั้น
--
-- ── 🔴 และคอลัมน์ที่ผมตั้งชื่อไว้ ผิดรูปตั้งแต่แรก ────────────────────────────
-- `20260827180000` เพิ่ม **`trips.cover_image_url`** · **ผิด** — บัคเก็ตส่วนตัวไม่มี URL ถาวรให้เก็บ
-- URL ที่ใช้ได้ต้อง **เซ็นตอนอ่าน และหมดอายุ** · เก็บ URL ลงคอลัมน์ = เก็บค่าที่ตายเมื่อไหร่ก็ได้
-- 🎯 **นี่คือบทเรียนเดียวกับ `E2-AC13` เป๊ะ** (`bookings.file_url` → `file_path`) และผมทำซ้ำภายในวันเดียวกัน
--    → เปลี่ยนเป็น **`cover_image_path`** · ชั้น API ยังคืนชื่อ `coverImageUrl` เพราะสิ่งที่ส่งให้ UI **คือ URL จริง
--      ที่เซ็นแล้ว** — ชื่อต่างกันเพราะ **ของต่างกัน ไม่ใช่เพราะไม่สม่ำเสมอ**
-- ✅ **ปลอดภัยที่จะเปลี่ยนชื่อตอนนี้: ยังไม่มีแถวไหนมีค่าในคอลัมน์นั้นเลย** (ยังไม่เคยมีตัวอัปโหลด)
--
-- ── ทางที่ปฏิเสธ: ใช้ `app.booking_file_trip()` ซ้ำ ──────────────────────────
-- ตรรกะเหมือนกันเป๊ะ (segment แรกของ path = `trip_id`) แต่**ชื่อผูกกับตั๋ว**
-- · ทางที่ดูสะอาดกว่าคือให้ตัวเดิม delegate มาที่ตัวใหม่ — **ปฏิเสธ** เพราะมันแก้ body ของฟังก์ชัน
--   ที่ policy ของไฟล์ตั๋ว *ทริปจริง* พึ่งอยู่ **เพื่อความสวยงามล้วน ๆ** (`P-48`: P4 เคยสร้างช่องขึ้นมาเอง
--   ด้วยการ "ย้ายไปทางที่ปลอดภัยกว่า")
-- ⚠️ **ราคาที่จ่าย: ตรรกะเดียวกันอยู่ 2 ที่** — ถ้าข้อตกลงเรื่อง path เปลี่ยน **ต้องแก้ทั้งคู่**
--    เขียนอ้างถึงกันไว้ในคอมเมนต์ของทั้งสองฝั่งแล้ว
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop policy if exists trip_covers_select on storage.objects;  (…insert/update/delete)
--   delete from storage.buckets where id = 'trip-covers';
--   drop function if exists app.trip_cover_trip(text);
--   alter table public.trips rename column cover_image_path to cover_image_url;
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

-- ── 1. คอลัมน์: เก็บ *path* ไม่ใช่ *url* ────────────────────────────────────
-- 🔴 ล้มดังถ้ามีค่าอยู่แล้ว — การเปลี่ยนชื่อจะปลอดภัยก็ต่อเมื่อยังไม่มีใครเขียนค่าลงไป
do $precheck$
declare n int;
begin
  select count(*) into n from public.trips where cover_image_url is not null;
  if n <> 0 then
    raise exception 'มี % แถวที่ cover_image_url มีค่าแล้ว — ค่าเหล่านั้นเป็น URL ไม่ใช่ path ต้องย้ายก่อน', n;
  end if;
end $precheck$;

alter table public.trips rename column cover_image_url to cover_image_path;

comment on column public.trips.cover_image_path is
  'path ในบัคเก็ต trip-covers (รูป <trip_id>/<ชื่อไฟล์>) — **ไม่ใช่ URL** '
  'บัคเก็ตเป็น private · URL ต้องเซ็นตอนอ่านและหมดอายุ (บทเรียนเดียวกับ bookings.file_path · E2-AC13)';

-- ── 2. บัคเก็ต — **private** + เพดานขนาด + allowlist ชนิดไฟล์ ────────────────
-- 5MB (เล็กกว่าไฟล์ตั๋ว 10MB) — รูปปกไม่ต้องใหญ่ · ไม่รับ PDF เพราะมันคือรูปปก ไม่ใช่เอกสาร
-- 🔴 ฝั่ง client บังคับซ้ำได้ **แต่ด่านจริงอยู่ที่นี่** — ด่านที่แก้ได้ด้วย devtools ไม่ใช่ด่าน
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-covers', 'trip-covers', false, 5 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 3. helper — อ่าน trip_id จาก path แบบไม่ระเบิด ──────────────────────────
-- 🔴 **ห้าม cast ตรง ๆ** — `'ของเก่า.jpg'::uuid` โยน exception **ในตัว policy**
--    = object ใบเดียวทำให้ query ทั้งชุดพัง ไม่ใช่แค่แถวนั้นถูกปฏิเสธ
-- 📌 ตรรกะเดียวกับ `app.booking_file_trip()` — **ถ้าข้อตกลงเรื่อง path เปลี่ยน ต้องแก้ทั้งสองตัว**
--    (ไม่รวมเป็นตัวเดียวโดยตั้งใจ · เหตุผลอยู่ในหัวไฟล์)
create or replace function app.trip_cover_trip(object_name text)
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

comment on function app.trip_cover_trip(text) is
  'E5-AC8 — segment แรกของ path คือ trip_id · คืน null ถ้าไม่ใช่ uuid '
  'คู่แฝดของ app.booking_file_trip() คนละบัคเก็ต — แก้ข้อตกลง path เมื่อไหร่ ต้องแก้ทั้งคู่ '
  'ห้ามเปลี่ยนเป็น cast ตรง: exception ใน policy ทำให้ทั้ง query พัง';

revoke all on function app.trip_cover_trip(text) from public, anon;
grant execute on function app.trip_cover_trip(text) to authenticated;

-- ── 4. policy — ผูกสมาชิกทริป ไม่ใช่ผูก bucket_id ───────────────────────────
-- 🎯 `bucket_id` เป็นจริงสำหรับทุกคนที่ถือคีย์ฝั่งไคลเอนต์ — **นั่นคือความผิดของ `0019` ที่ `D12` บันทึกไว้**
-- · อ่าน = `can_read_trip` (viewer เห็นรูปปกได้) · เขียน/ลบ = `can_write_trip` (`D61`/`P-46`)
-- · `to authenticated` ทุกตัว — **`anon` ไม่มี policy สักตัวบนบัคเก็ตนี้ จึงไม่มีทางเข้าเลย**
create policy trip_covers_select on storage.objects
  for select to authenticated
  using (bucket_id = 'trip-covers' and app.can_read_trip(app.trip_cover_trip(name)));

create policy trip_covers_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trip-covers' and app.can_write_trip(app.trip_cover_trip(name)));

create policy trip_covers_update on storage.objects
  for update to authenticated
  using      (bucket_id = 'trip-covers' and app.can_write_trip(app.trip_cover_trip(name)))
  with check (bucket_id = 'trip-covers' and app.can_write_trip(app.trip_cover_trip(name)));

create policy trip_covers_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'trip-covers' and app.can_write_trip(app.trip_cover_trip(name)));

-- ── 5. ยืนยันในทรานแซกชันเดียวกัน ──────────────────────────────────────────
-- 🔴 ไม่ได้แทนเกณฑ์จริง (*"เปิด URL ในหน้าต่างที่ไม่ล็อกอินแล้วต้องไม่ได้"*) — อันนั้นวัดจากข้างนอก
--    ตัวนี้กันแค่ "ลงแล้วแต่ยัง public เพราะ `on conflict` ไม่ทำงานตามที่คิด" (รูปเดียวกับ `20260825152500`)
do $verify$
declare v_public boolean; n_policy int;
begin
  select public into v_public from storage.buckets where id = 'trip-covers';
  if v_public is null then raise exception 'ไม่มีบัคเก็ต trip-covers หลัง insert'; end if;
  if v_public then raise exception 'บัคเก็ต trip-covers ยังเป็น public — on conflict ไม่ได้บังคับ'; end if;

  select count(*) into n_policy from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'trip_covers_%';
  if n_policy <> 4 then raise exception 'policy ของ trip-covers มี % ตัว ไม่ใช่ 4', n_policy; end if;
end $verify$;

commit;
