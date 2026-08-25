-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — ปิดครึ่งที่ trigger ไม่ครอบ: `created_at` / `updated_at` ที่ไคลเอนต์ตั้งเองได้
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · เกณฑ์: `E2-AC9` · `D7` · P7 พบ (`mobile-arch.md §11.10`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── รูที่ P7 เจอ และผมเป็นคนสร้างมันเอง ────────────────────────────────────
-- `app.touch_updated_at()` เป็น **`before update`** → **ไม่ยิงตอน `INSERT`**
-- และ `default now()` มีผลก็ต่อเมื่อไคลเอนต์ **ไม่ส่ง** คอลัมน์นั้นมา
-- `grant insert on <table>` เป็นสิทธิ์ระดับ**ตาราง** = ครอบทุกคอลัมน์รวม `created_at`/`updated_at`
-- → 🔴 **แถวที่เกิดจากเครื่องนาฬิกาผิด เกิดมาพร้อมเวลาที่ผิด และชนะ LWW ตั้งแต่วินาทีแรก**
--   ถ้ามีคนแก้แถวนั้นทีหลัง trigger จะซ่อมให้ · **ถ้าไม่มีใครแก้ มันผิดตลอดไป**
-- และ `created_at` **ไม่มีอะไรซ่อมเลยสักชั้น** ทั้งตอน insert และตอน update
--   (`useChecklist.ts:14` เรียงด้วยค่านี้ — ลำดับที่ผู้ใช้เห็นขึ้นกับค่าที่ไคลเอนต์พิมพ์มาได้)
--
-- ⚠️ **เคสสดที่ผมรันยืนยันไว้ เป็นเคส `UPDATE` — ด้านที่ trigger ครอบอยู่แล้ว**
--    ด้าน `INSERT` ไม่มีใครลอง · เป็นรูปแบบเดิมของทีมนี้: ผ่านเพราะทดสอบด้านที่มันครอบ
--
-- ── ทำไมใช้ column grant ไม่ใช่ trigger `before insert` ────────────────────
-- ทางเลือกคือเพิ่ม trigger `before insert` ที่เขียนทับทั้งสองคอลัมน์ · **ไม่เลือกเพราะ `E7`**
--   `E7` ต้องย้ายข้อมูลทริปจริงเข้ามา **พร้อมเวลาเดิมของมัน** — trigger จะทับทิ้งทุกแถว
--   และ trigger ที่ยกเว้นตาม role คือด่านที่เชื่อว่าคนเรียกเป็นใคร ซึ่งเปราะกว่าสิทธิ์
-- 🎯 **column grant ให้ผลตรงข้ามพอดี:** `authenticated` แตะไม่ได้ · `service_role` (ที่ `E7` ใช้) ยังตั้งได้
--    → กติกาเดียวกันแยกสองเส้นทางได้โดยไม่ต้องมีเงื่อนไข `if` สักบรรทัด
--
-- ⚠️ **ราคาที่จ่ายและต้องรู้ว่าจ่าย:** `grant insert (…)` เป็นการ**ระบุชื่อคอลัมน์**
--    → **คอลัมน์ใหม่จะไม่มีสิทธิ์โดยอัตโนมัติ** ต้องเติมชื่อลง grant ทุกครั้งที่ `alter table add column`
--    · เป็นทั้งข้อดี (deny-by-default) และกับดัก (ลืมแล้วฟีเจอร์พังเงียบ)
--    · **จึงมีเคสสดคู่กันในชุดเทสต์: ทั้งด้านที่ต้องเขียนได้ และด้านที่ต้องถูกปฏิเสธ**
--
-- **ขอบเขต: แตะเฉพาะ 2 คอลัมน์เวลา** — ไม่แตะ `id`/`created_by`/`trip_id` ที่มี trigger + policy
-- ของตัวเองอยู่แล้ว (`app.freeze_created_by`) เพื่อไม่ให้เคสที่มีอยู่เปลี่ยนเหตุผลที่มันแดง/เขียว
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   grant insert, update on public.profiles               to authenticated;
--   grant insert, update on public.trips                  to authenticated;
--   grant insert, update on public.trip_members           to authenticated;
--   grant insert, update on public.trip_days              to authenticated;
--   grant insert, update on public.trip_plans             to authenticated;
--   grant insert, update on public.trip_day_plan_settings to authenticated;
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

-- 🔴 ต้อง `revoke` ระดับตารางก่อน — **column grant ลบสิทธิ์ระดับตารางไม่ได้**
--    `revoke insert (created_at) …` บนตารางที่ให้ `grant insert` ไว้ **ไม่มีผลอะไรเลย**
--    (Postgres: สิทธิ์ระดับตารางครอบทุกคอลัมน์ และ column-level revoke ไม่หักล้างมัน)
--    → เขียนผิดลำดับ = migration ผ่านเรียบร้อย แต่ไม่ได้ปิดอะไรเลยสักคอลัมน์

-- ── profiles ──────────────────────────────────────────────────────────────
revoke insert, update on public.profiles from authenticated;
grant  insert (id, display_name, locale, home_country) on public.profiles to authenticated;
grant  update (display_name, locale, home_country)     on public.profiles to authenticated;
-- `id` ให้ตอน insert ได้ (policy บังคับ `= auth.uid()` อยู่แล้ว) แต่ **ห้ามแก้ตอน update**

-- ── trips ─────────────────────────────────────────────────────────────────
revoke insert, update on public.trips from authenticated;
grant  insert (id, created_by, title, start_date, end_date, base_timezone, status)
       on public.trips to authenticated;
grant  update (title, start_date, end_date, base_timezone, status)
       on public.trips to authenticated;
-- `created_by` ไม่อยู่ในฝั่ง update — `app.freeze_created_by()` ยังอยู่และยังเป็นด่านของมันเอง
-- **สองชั้นนี้ตอบคนละคำถาม**: grant ตอบว่า "ส่งมาได้ไหม" · trigger ตอบว่า "ค่าเปลี่ยนได้ไหม"

-- ── trip_members ──────────────────────────────────────────────────────────
-- ไม่มี `updated_at` มีแต่ `created_at`
revoke insert, update on public.trip_members from authenticated;
grant  insert (trip_id, user_id, role, invited_by) on public.trip_members to authenticated;
grant  update (role)                              on public.trip_members to authenticated;
-- ⚠️ ฝั่ง update ให้แค่ `role` — `trip_id`/`user_id` เป็นคีย์ · policy `with check` กัน
--    "ย้ายแถวตัวเองไปทริปอื่น" อยู่แล้ว **แต่ไม่มีเหตุผลใดเลยที่ client ต้องส่งสองคอลัมน์นั้นมาแก้**

-- ── trip_days ─────────────────────────────────────────────────────────────
revoke insert, update on public.trip_days from authenticated;
grant  insert (id, trip_id, date, timezone) on public.trip_days to authenticated;
grant  update (trip_id, date, timezone)     on public.trip_days to authenticated;
-- `trip_id` ยังอยู่ฝั่ง update โดยตั้งใจ — เคส `with check` ของ `D70`/`trip_days_update`
-- (ย้ายวันข้ามทริปต้องถูกปฏิเสธ **โดย policy** ไม่ใช่โดยสิทธิ์) ยังต้องเดินเส้นทางเดิมได้

-- ── trip_plans ────────────────────────────────────────────────────────────
revoke insert, update on public.trip_plans from authenticated;
grant  insert (id, trip_id, name, is_active) on public.trip_plans to authenticated;
grant  update (trip_id, name, is_active)     on public.trip_plans to authenticated;

-- ── trip_day_plan_settings ────────────────────────────────────────────────
revoke insert, update on public.trip_day_plan_settings from authenticated;
grant  insert (trip_id, plan_id, trip_day_id, start_time, return_travel_mode, is_locked)
       on public.trip_day_plan_settings to authenticated;
grant  update (trip_id, plan_id, trip_day_id, start_time, return_travel_mode, is_locked)
       on public.trip_day_plan_settings to authenticated;

commit;
