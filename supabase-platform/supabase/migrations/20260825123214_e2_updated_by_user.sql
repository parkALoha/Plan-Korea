-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `updated_by_user`: คอลัมน์เดียวใน `E2` ที่ *เพิ่มทีหลังแล้ว backfill ไม่ได้*
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · P7 พบ (`mobile-arch.md §11.4`) · `D7` + `D38`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมต้องเป็นตอนนี้ ไม่ใช่ตอนที่ต้องใช้ ─────────────────────────────────
-- P7 แยกสองอย่างที่ผมปนกันไว้ และแยกถูก:
--   · **คอลัมน์** เพิ่มทีหลังถูกมาก — `alter table` เฉย ๆ
--   · **ประวัติของแถวที่ถูกแก้ไปแล้วก่อนคอลัมน์มีอยู่** = `NULL` ตลอดกาล **ไม่มีแหล่งให้ backfill**
-- 🎯 นี่คือของที่เข้าเงื่อนไข *"เพิ่มทีหลังแล้วเจ็บ"* จริง — ไม่ใช่ `client_edited_at` ที่ผมกลัวไว้
--   (`D56`/P5: เจ็บก็ต่อเมื่อ **ค่าหาไม่ได้อีกแล้วตอนที่เพิ่ม** · event ที่ผ่านไปแล้วไม่มีใครบันทึก)
--
-- ⚠️ **และมันไม่ใช่เรื่องของ mobile เลย** — วันนี้บนเว็บ 2 คนแก้พร้อมกันผ่าน Realtime อยู่แล้ว
--   `mobile-arch §3.3` เขียน AC ไว้เองว่าคนที่แพ้ conflict ต้องเห็น *"ถูกทับโดย ‹ชื่อ›"*
--   **ซึ่งทำไม่ได้เลย ไม่มีคอลัมน์ให้อ่านชื่อ** · `grep updated_by` ทั้ง `architecture.md`+`README.md` = 0
--   → รูปแบบเดียวกับ `D44`: **บรรทัดที่ไม่เคยถูกเขียน**
--
-- ── ของแถมที่ P7 ชี้ และเป็นเหตุผลว่าทำไมไม่ต้องมี `deleted_by_user` ────────
-- soft delete (`E2-AC12`) คือ `UPDATE` → **ได้ "ใครลบ" ฟรีจากคอลัมน์เดียวกัน**
--
-- ── สิ่งที่ *ไม่* ต้องทำ เพราะ `…122247_e2_freeze_row_times` ทำไปแล้ว ────────
-- 🎯 **ไม่ต้อง `revoke` อะไรเพิ่มเลย** — migration นั้นให้ `grant insert/update (<ระบุชื่อคอลัมน์>)`
--   คอลัมน์ใหม่จึง **ไม่มีสิทธิ์โดยอัตโนมัติ** · `authenticated` เขียน `updated_by_user` ไม่ได้ตั้งแต่วินาทีที่มันเกิด
--   · นี่คือ deny-by-default ที่จ่ายค่ามันไปแล้วเมื่อชั่วโมงก่อน **และนี่คือครั้งแรกที่มันคืนทุน**
--   · `D38`: ค่านี้ต้องมาจาก `auth.uid()` ฝั่งเซิร์ฟเวอร์เท่านั้น **ห้ามรับจากไคลเอนต์** — และตอนนี้รับไม่ได้จริง ๆ
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   alter table public.profiles               drop column if exists updated_by_user;
--   alter table public.trips                  drop column if exists updated_by_user;
--   alter table public.trip_days              drop column if exists updated_by_user;
--   alter table public.trip_plans             drop column if exists updated_by_user;
--   alter table public.trip_day_plan_settings drop column if exists updated_by_user;
--   -- แล้วคืน app.touch_updated_at() เป็นฉบับที่เขียนแค่ updated_at
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
-- 1. คอลัมน์ — ทุกตารางที่มี `updated_at` ต้องมีคู่กัน
-- ───────────────────────────────────────────────────────────────────────────
-- `on delete set null` ไม่ใช่ `cascade`: คนออกจากระบบแล้ว **แถวที่เขาแก้ไว้ต้องไม่หายตามไป**
-- (เหตุผลเดียวกับที่ `trips.created_by` เป็น `restrict` — ข้อมูลของทริปไม่ใช่ของคนคนเดียว)
alter table public.profiles               add column updated_by_user uuid references public.profiles(id) on delete set null;
alter table public.trips                  add column updated_by_user uuid references public.profiles(id) on delete set null;
alter table public.trip_days              add column updated_by_user uuid references public.profiles(id) on delete set null;
alter table public.trip_plans             add column updated_by_user uuid references public.profiles(id) on delete set null;
alter table public.trip_day_plan_settings add column updated_by_user uuid references public.profiles(id) on delete set null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. trigger — เขียนทั้ง `updated_at` และ `updated_by_user` ที่เดียว
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 แทนที่ `app.touch_updated_at()` ตัวเดิม **ไม่สร้างตัวที่สอง**
--    สองฟังก์ชันที่ต้องตรงกันคือรูปแบบที่ `_helpers.ts` ถูกรวมเพื่อเลี่ยงมาแล้ว 3 รอบ
--    ⚠️ ผลข้างเคียงที่ตั้งใจ: trigger ทุกตัวที่ชี้ฟังก์ชันนี้ **ต้องมีคอลัมน์ทั้งสอง** ไม่งั้นพังตอน runtime
--       ตอนนี้มี 5 ตารางและได้คอลัมน์ครบทั้ง 5 ในข้อ 1 แล้ว
--
-- `auth.uid()` คืน `null` เมื่อคนเรียกเป็น `service_role` — **ตั้งใจให้เป็น `null` ไม่ใช่คงค่าเดิม**
-- เพราะ *"แก้ล่าสุดโดย ‹คนเมื่อวาน›"* ทั้งที่สคริปต์เป็นคนแก้ **คือคำโกหกที่อ่านไม่ออกว่าโกหก**
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at      := now();
  new.updated_by_user := auth.uid();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. `when (old.* is distinct from new.*)` — P7 `§11.2`
-- ───────────────────────────────────────────────────────────────────────────
-- `UPDATE` ที่ไม่ได้เปลี่ยนอะไรเลย ไม่ควรนับเป็นการแก้
-- ⚠️ **retry เกิดจริงในโปรเจกต์นี้** — `hooks/useOnlineStatus.ts:12-17` เขียนไว้เองว่า
--    `navigator.onLine` เชื่อไม่ได้ (บอก `true` ทั้งที่ต่อ Wi-Fi ที่ออกเน็ตไม่ได้)
--    → คำขอเดิมถูกส่งซ้ำได้ · ถ้าไม่มี `when` แถวจะเปลี่ยน "ผู้แก้ล่าสุด" ทุกครั้งที่ใครรีเฟรช
--
-- 🔴 ประเมินเทียบ `old.*`/`new.*` **ก่อน** trigger รัน = เทียบสิ่งที่ไคลเอนต์ส่งมากับของเดิม
--    ซึ่งเป็นสิ่งที่เราต้องการพอดี (ไม่ใช่เทียบหลังจากที่ trigger เพิ่งเขียน `now()` ลงไปเอง)
drop trigger if exists profiles_touch on public.profiles;
drop trigger if exists trips_touch    on public.trips;
drop trigger if exists trip_days_touch on public.trip_days;
drop trigger if exists trip_plans_touch on public.trip_plans;
drop trigger if exists tdps_touch on public.trip_day_plan_settings;

create trigger profiles_touch  before update on public.profiles
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();
create trigger trips_touch     before update on public.trips
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();
create trigger trip_days_touch before update on public.trip_days
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();
create trigger trip_plans_touch before update on public.trip_plans
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();
create trigger tdps_touch      before update on public.trip_day_plan_settings
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();

commit;
