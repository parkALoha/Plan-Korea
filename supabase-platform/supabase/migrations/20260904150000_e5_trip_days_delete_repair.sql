-- ════════════════════════════════════════════════════════════════════════════
-- E5 — ซ่อม: `trip_days_delete` + `grant delete` ที่ `20260904120000` ควรให้ แต่ฐานไม่มี
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026
-- ════════════════════════════════════════════════════════════════════════════
-- ## 🔴 อาการที่วัดได้ — ยิงผ่านเส้นทางจริงบน dev DB
-- ```
-- PATCH /api/engine/trips/<id> ช่วงวันเดิม   → 200  ok           ⇒ grant update (start_date,end_date) **มีผล**
-- PATCH ย่อ 7 วัน → 6 วัน                     → 502  code 42501   ⇒ ลบวันไม่ได้
--                                              จำนวนวัน 7 → 7
-- ```
-- **ทั้งสองสิทธิ์อยู่ในไฟล์ `20260904120000` ก้อน `begin`/`commit` เดียวกัน**
-- ⇒ *ครึ่งลงครึ่งไม่ลง เป็นไปไม่ได้ ถ้าฐานรันไฟล์ที่อยู่บนดิสก์ตอนนี้*
--
-- ## 🔴 ทำไมต้องเป็น **ไฟล์ใหม่เลขใหม่** ไม่ใช่แก้ `…120000` แล้ว push ซ้ำ (P4 ชี้)
-- Supabase จำ migration ที่รันแล้วด้วย **เลขเวอร์ชันหน้าไฟล์** ⇒ ถ้า `20260904120000` ถูกบันทึกไปแล้ว
-- **`db push` รอบหน้าจะข้ามมันถาวร** · บรรทัดที่เติมทีหลังในไฟล์นั้น **จะไม่มีวันรัน**
-- 🎯 ***และอาการจะอ่านเหมือน "ยังไม่ได้ push" ทั้งที่ push แล้ว — คนจะกด `db push` ซ้ำแล้วเชื่อว่าแก้แล้ว***
--    รูปเดียวกับที่ `TEAM.md §3.3` เตือนไว้เอง (*"ด่านฟ้องว่าฐานกับทรีไม่ตรง ซึ่งอ่านเหมือน
--    ยังไม่ได้ push ฐาน ซึ่งเป็นทิศตรงข้าม"*)
--
-- ## ✅ ไฟล์นี้ปลอดภัยไม่ว่าคำตอบจะเป็นอะไร — **ตั้งใจให้ idempotent ทุกบรรทัด**
-- · `…120000` ถูกบันทึกแล้ว → ไฟล์นี้เติมส่วนที่ขาด
-- · `…120000` ยังไม่เคยรัน  → มันจะรันก่อน แล้วไฟล์นี้ `drop … if exists` + `create` ทับของเดิม (ผลเท่ากัน)
-- · รันไฟล์นี้ซ้ำสองรอบ      → ผลเหมือนเดิม
-- 🔴 **ไม่แก้ `…120000` เลยสักตัวอักษร** — ประวัติที่มีรอยแก้ ดีกว่าประวัติที่สะอาดเพราะมีคนลบรอย (`§3.1`)
--
-- ## ⚠️ สิ่งที่ไฟล์นี้ **ไม่** ตอบ และยังต้องมีคนไปดู
-- **ทำไมฐานถึงมีครึ่งเดียว** — ผมกับ P4 มีสมมติฐาน (ฐานรันไฟล์เวอร์ชันเก่ากว่าที่อยู่บนดิสก์)
-- **แต่ไม่มีใครยืนยัน** เพราะไฟล์ `…120000` ยัง `untracked` ⇒ **ไม่มีประวัติให้เทียบตามนิยาม**
-- 🔴 **บทเรียนที่ต้องอยู่ตรงนี้: `§3.3` สั่งให้ commit ไฟล์ migration *ก่อน* `db push` เสมอ**
--    ถ้าทำตาม เราจะเห็นทันทีว่าเวอร์ชันบนดิสก์ต่างจากตอนที่รัน · **ข้อนั้นมีอยู่แล้วและถูกข้าม**
--
-- ── ถอนคืน ────────────────────────────────────────────────────────────────
--   drop policy if exists trip_days_delete on public.trip_days;
--   revoke delete on public.trip_days from authenticated;
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
