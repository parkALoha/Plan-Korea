-- ════════════════════════════════════════════════════════════════════════════
-- E5 — ตาข่ายรอง: `trip_days_delete` + `grant delete` เผื่อ `…120000` ถูกบันทึกไปแล้ว
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026
-- ════════════════════════════════════════════════════════════════════════════
-- ## 🔴 เหตุผลเดิมของไฟล์นี้ **ผิด** — เขียนใหม่ทั้งหัว หลังรู้ความจริง
-- ฉบับแรกอ้างว่า *"ฐานรัน `…120000` ไปแล้วในเวอร์ชันที่เก่ากว่าไฟล์บนดิสก์"*
-- โดยสรุปจากอาการ *"grant update มีผล · grant delete ไม่มีผล ⇒ ครึ่งลงครึ่งไม่ลง"*
--
-- **ความจริงคือ `…120000` ไม่เคยรันเลย** — และ `grant update (start_date, end_date)`
-- ที่ผมวัดว่า "มีผล" **มาจากไฟล์ของคนอื่นเมื่อ 25 ส.ค.**:
--   `20260825122247_e2_freeze_row_times.sql:78`
--   `grant  update (title, start_date, end_date, base_timezone, status) …`
--
-- 🎯 ***ผมเห็นสองข้อเท็จจริงที่ถูกทั้งคู่ แล้วสร้างคำอธิบายที่เชื่อมมันได้พอดี — และมันผิด***
--    P4 ตัดสมมติฐานอื่นทิ้งจนเหลืออันนี้อันเดียว ⇒ **"เหลืออันเดียว" ไม่ได้แปลว่า "ถูก"
--    มันแปลว่าเรานึกไม่ออกแล้วต่างหาก**
-- · 🔴 และตัวที่หลอกเราทั้งคู่คือ `grep` — บรรทัดนั้นเขียน `grant··update` **เว้นวรรคสองครั้ง**
--   ⇒ `grep "grant update"` ไม่ match · ***สตริงที่เราค้นหา ไม่ใช่ไวยากรณ์ที่ Postgres อ่าน***
--
-- ## ⇒ แล้วทำไมยังเก็บไฟล์นี้ไว้
-- เพราะเรา **ยังพิสูจน์ไม่ได้** ว่า `…120000` ถูกบันทึกใน `schema_migrations` หรือไม่
-- (รอบที่ผู้ใช้กด มันล้มที่ assert ⇒ *ไม่ควร* ถูกบันทึก แต่เราไม่ได้ไปดูของจริง)
-- · ถ้ามันถูกบันทึก → `db push` จะข้าม `…120000` ถาวร และไฟล์นี้คือทางเดียวที่ policy จะลง
-- · ถ้าไม่ถูกบันทึก → `…120000` รันก่อน แล้วไฟล์นี้ `drop … if exists` + `create` ทับ **ผลเท่ากัน**
-- 🎯 ***ราคาของการเก็บไว้คือไฟล์ซ้ำหนึ่งใบ · ราคาของการลบทิ้งคือ policy ที่อาจไม่มีวันลง***
--
-- ⚠️ ลบไฟล์นี้ได้เมื่อ `raise notice` ข้างล่างยืนยันว่า `…120000` ถูกบันทึกแล้วและ policy มีอยู่จริง
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
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
-- 1. 🔴 บันทึกสภาพ *ก่อนแก้* ให้เห็นในผลรัน — ตัวที่ตอบว่าใบนี้จำเป็นจริงไหม
-- ───────────────────────────────────────────────────────────────────────────
-- 🎯 ***ถ้าทั้งสองบรรทัดพิมพ์ `t` ออกมา แปลว่าไฟล์นี้ไม่จำเป็น และสมมติฐานของเราผิด***
--    — ให้เห็นตอนรัน ดีกว่าให้เดาทีหลัง · `notice` ไม่ทำให้ migration ล้ม
do $before$
begin
  raise notice 'ก่อนแก้ · grant delete on trip_days = %',
    has_table_privilege('authenticated', 'public.trip_days', 'DELETE');
  raise notice 'ก่อนแก้ · policy trip_days_delete   = %',
    exists (select 1 from pg_policies
             where schemaname='public' and tablename='trip_days' and policyname='trip_days_delete');
  raise notice 'ก่อนแก้ · 20260904120000 ถูกบันทึกไว้ = %',
    exists (select 1 from supabase_migrations.schema_migrations where version = '20260904120000');
end $before$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ของที่ควรลงตั้งแต่ `…120000` — เนื้อเดียวกันเป๊ะ
-- ───────────────────────────────────────────────────────────────────────────
-- `can_write_trip` ตัวเดียวกับ `trip_days_insert`/`_update` ⇒ **ไม่มีเกณฑ์สิทธิ์ใหม่ให้ดูแล**
-- editor ที่เพิ่มวันได้ ก็ถอนวันได้ (สมมาตร) · ส่วนการแก้ `trips.start_date` ยังเป็น `owner` เหมือนเดิม
drop policy if exists trip_days_delete on public.trip_days;
create policy trip_days_delete on public.trip_days
  for delete to authenticated
  using (app.can_write_trip(trip_id));

grant delete on public.trip_days to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. assert — ฝั่งบวก และฝั่งควบคุมที่ยืนยันว่าไม่ได้เปิดเกิน
-- ───────────────────────────────────────────────────────────────────────────
do $assert$
begin
  if not has_table_privilege('authenticated', 'public.trip_days', 'DELETE') then
    raise exception 'assert ล้ม: authenticated ยัง delete trip_days ไม่ได้';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='trip_days' and policyname='trip_days_delete') then
    raise exception 'assert ล้ม: ไม่มี policy trip_days_delete — grant อย่างเดียวลบไม่ได้เพราะ RLS เปิดอยู่';
  end if;

  -- 🔴 เคสควบคุมของมติเดิม — ไฟล์นี้ต้อง **ไม่** ทำให้ลบทริปได้ (`20260824043822:273`)
  if has_table_privilege('authenticated', 'public.trips', 'DELETE') then
    raise exception 'assert ล้ม: authenticated ลบ trips ได้ — ขัดมติที่ต้องเป็น soft delete';
  end if;

  -- ✅ และยืนยันว่าครึ่งที่ *ลงไปแล้ว* ยังอยู่ครบ — ใบนี้ต้องไม่ทำให้ของเดิมหาย
  if not has_column_privilege('authenticated', 'public.trips', 'start_date', 'UPDATE') then
    raise exception 'assert ล้ม: grant update (start_date) หายไป — ใบนี้ไม่ควรแตะมัน';
  end if;
end $assert$;

commit;
