-- ═══════════════════════════════════════════════════════════════════════════
-- `E2-AC9` — ตารางเดียวที่รอดจากตัว freeze: `hidden_places`
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · ต่อจาก `20260825122247_e2_freeze_row_times.sql`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่เจอ และวิธีที่เจอ ────────────────────────────────────────────────
-- `…122247` เขียนคำเตือนของตัวเองไว้ว่า:
--   > *"migration ไฟล์ไหนก็ตามในอนาคตที่เขียน `grant insert/update on <t> to authenticated`
--   >   ระดับตาราง จะเปิดรูกลับทันทีเงียบ ๆ"*
-- 🎯 **มันเกิดขึ้นจริงในอีก 3 ชั่วโมงถัดมา** — `…145708_e2_trip_content.sql` สร้าง `hidden_places`
--    พร้อม `grant select, insert, delete on public.hidden_places to authenticated;` **ระดับตาราง**
--
-- ── 🔴 แล้วทำไมด่านสดถึงไม่จับ ทั้งที่ด่านนั้นถามฐานไม่ใช่อ่านไฟล์ ───────────
-- `client_writable_timestamps()` ถามฐานจริง **แต่ค่าเริ่มต้นของมันคือรายชื่อคอลัมน์ 3 ตัว:**
-- `created_at` · `updated_at` · `updated_by_user` — และตารางนี้ตั้งชื่อคอลัมน์ว่า
-- **`hidden_at`** กับ **`hidden_by_user`**
-- > **ด่านทนต่อ *ไฟล์ที่ยังไม่ถูกเขียน* ได้ แต่ไม่ทนต่อ *ชื่อคอลัมน์ที่ยังไม่ถูกตั้ง***
-- · เทียบกับ `authorship_columns()` ที่ค้นด้วยแพตเทิร์น `%\_by\_user` **จึงเห็น `hidden_by_user`
--   มาตลอด** — ฟังก์ชันสองตัวในฐานเดียวกัน ตัวหนึ่งเห็น ตัวหนึ่งไม่เห็น เพราะวิธีค้นต่างกัน
-- · แจ้ง P4 แล้วให้ตัดสินเรื่องขยายด่าน — **ไม่แก้ให้เอง** เพราะเจ้าของด่านต้องคนละคนกับ
--   เจ้าของของที่ถูกตรวจ (`P-72`)
--
-- ── ผลกระทบจริง: บอกให้ครบทั้งสองด้าน ───────────────────────────────────────
-- ① `hidden_at` — **ไม่มีใครอ่านและไม่มีใครเรียงด้วยมันเลยทั้งรีโป** (ตรวจแล้ว)
--    → วันนี้ตั้งผิดก็ไม่มีอะไรพัง · เป็นเรื่องของ *สิทธิ์ที่เปิดค้าง* ไม่ใช่ *ของที่กำลังรั่ว*
-- ② `hidden_by_user` — **ตัวนี้หนักกว่า** ไคลเอนต์ตั้งเป็น `id` ของคนอื่นได้ (FK บังคับแค่ว่า
--    ต้องเป็นโปรไฟล์ที่มีจริง) → **ปลอมได้ว่าใครเป็นคนซ่อนสถานที่**
--    · และตารางนี้ **ไม่มี trigger สักตัว** ต่างจากทุกตารางพี่น้องที่มี `stamp_added_by`
--    · วันนี้ยังไม่มีใครโดน เพราะ DAL ส่งแค่ 3 คอลัมน์ — **แต่ "โค้ดเราไม่ส่ง" ไม่ใช่ด่าน**
--
-- ── ท่าที่ใช้: ตามแบบของตารางพี่น้องเป๊ะ ไม่คิดท่าใหม่ ──────────────────────
-- `revoke` เฉพาะ `INSERT` — `select`/`delete` ต้องอยู่ครบ (`unhidePlace` ใช้ `delete` จริง)
-- แล้ว `grant insert (…)` ระบุชื่อ + trigger เติม `hidden_by_user` จาก `auth.uid()`
-- 🎯 **grant คือ*ตัวกัน* · trigger คือ*ตัวเติม*** — คนละคำถาม ต้องมีทั้งคู่ (คำของ `…140057`)
-- · `E7` ไม่กระทบ: ของที่ย้ายมาลง `legacy_hidden_by` ไม่ใช่ `hidden_by_user`
--   และ `service_role` ไม่ได้ถูก revoke อะไรเลยในไฟล์นี้
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- ── ① สิทธิ์ ────────────────────────────────────────────────────────────────
revoke insert on public.hidden_places from authenticated;
grant insert (trip_id, catalog_place_id, legacy_hidden_by)
  on public.hidden_places to authenticated;

-- ── ② ตัวเติมค่า ───────────────────────────────────────────────────────────
-- ชื่อคอลัมน์ไม่ใช่ `added_by_user` จึงใช้ `app.stamp_added_by()` ซ้ำไม่ได้
create or replace function app.stamp_hidden_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.hidden_by_user := auth.uid();
  return new;
end;
$$;

revoke execute on function app.stamp_hidden_by() from public, anon, authenticated;

drop trigger if exists hidden_places_stamp_hidden_by on public.hidden_places;
create trigger hidden_places_stamp_hidden_by
  before insert on public.hidden_places
  for each row execute function app.stamp_hidden_by();

-- ── ③ ยืนยันด้วย *ชื่อ* ไม่ใช่ *จำนวน* (`P-63`) ────────────────────────────
do $verify$
declare
  got  text[];
  want text[];
begin
  select array_agg(column_name order by column_name) into got
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'hidden_places'
     and grantee = 'authenticated' and privilege_type = 'INSERT';
  want := array['catalog_place_id','legacy_hidden_by','trip_id'];
  if got is distinct from want then
    raise exception 'hidden_places INSERT ไม่ตรง · ได้ % · ต้องการ %', got, want;
  end if;

  -- `select`/`delete` ต้องรอด — `revoke insert` พลาดเป็น `revoke all` เมื่อไหร่ ฟีเจอร์ซ่อน/เลิกซ่อนพังเงียบ
  if not exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'hidden_places'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception 'hidden_places: `select` ของ authenticated หายไปด้วย';
  end if;

  if not exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'hidden_places'
       and grantee = 'authenticated' and privilege_type = 'DELETE'
  ) then
    raise exception 'hidden_places: `delete` ของ authenticated หายไปด้วย — `unhidePlace` จะพัง';
  end if;

  -- trigger ต้องมีอยู่จริง · ชื่อคอลัมน์ที่มันเขียนต้องมีอยู่จริงด้วย
  if not exists (
    select 1 from pg_catalog.pg_trigger
     where tgrelid = 'public.hidden_places'::regclass
       and tgname = 'hidden_places_stamp_hidden_by'
       and not tgisinternal
  ) then
    raise exception 'ไม่มี trigger hidden_places_stamp_hidden_by';
  end if;
end $verify$;

commit;
