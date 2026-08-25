-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — ไคลเอนต์เขียนคอลัมน์ที่เป็น *ตัวระบุตัวตนของแถว* ไม่ได้
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · P7 พบ (`mobile-arch.md §11.12`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `…122247_e2_freeze_row_times` ให้ `grant update (trip_id, plan_id, trip_day_id, …)`
-- บน `trip_day_plan_settings` — **คือการให้ไคลเอนต์เขียนคีย์ของแถวตัวเอง**
--
-- P7 ชี้ว่าทำไมมันสำคัญกว่าที่ดู และเหตุผลมาจากโมเดล sync ไม่ใช่จากความปลอดภัยล้วน:
-- > ทุก op ในโมเดลคือการเขียน**ฟิลด์เดียว** · op ที่เขียน `trip_id` เดี่ยว ๆ **ไม่ใช่ no-op
-- > แต่คือ "ย้ายแถวข้ามทริป"** — การกระทำที่ไม่มีที่ไหนในระบบตั้งใจให้มี
--
-- 🎯 **และมันฟรี** — deny-by-default ของ column grant แปลว่า *ไม่ใส่ชื่อลงลิสต์* ก็จบ
--    ไม่ต้องมี policy ใหม่ ไม่ต้องมี trigger ไม่ต้องมีเคสเพิ่มฝั่งแอป
--
-- ⚠️ **`trip_days.trip_id` ยังอยู่ในลิสต์ update ต่อไปโดยตั้งใจ** — เคส `trip_days_update`
--    (*"ย้ายวันข้ามทริปต้องถูกปฏิเสธ"*) ต้องถูกปฏิเสธ **โดย `with check` ของ policy**
--    ถ้าตัดสิทธิ์ที่ชั้น grant มันจะถูกปฏิเสธด้วยเหตุผลอื่น **แล้วเคสนั้นจะเลิกวัดสิ่งที่มันตั้งใจวัด**
--    · นี่คือความต่างระหว่าง *"ปิดให้หมดทุกทาง"* กับ *"ปิดโดยไม่ทำให้ด่านอื่นเลิกทำงาน"*
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   grant update (trip_id, plan_id, trip_day_id, start_time, return_travel_mode, is_locked)
--     on public.trip_day_plan_settings to authenticated;
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

-- `revoke` ระดับตารางก่อนเสมอ — column-level revoke ไม่หักล้างสิทธิ์ระดับตาราง
revoke update on public.trip_day_plan_settings from authenticated;
grant  update (start_time, return_travel_mode, is_locked)
       on public.trip_day_plan_settings to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ด่านยืนยัน **สภาพปลายทาง** ไม่ใช่ข้อความใน migration — P7 `§11.11`
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 ปัญหาที่มันแก้: ไฟล์ไหนก็ตามในอนาคตที่เขียน `grant insert/update on <t> to authenticated`
--    **ระดับตาราง** จะเปิดรูเวลากลับทันทีเงียบ ๆ · และมีไฟล์แบบนั้นอยู่แล้ว 1 ไฟล์
--    (`…120856_e2_trip_plans.sql:174-175`) **ซึ่งรอดเพราะบังเอิญรันก่อนตัว freeze เท่านั้น**
--    · อีก ~10 ตารางข้างหน้าจะมีบล็อก `grant` แบบนี้ทุกไฟล์
-- 🎯 grep ข้อความใน migration ทนต่อเวลาไม่ได้ — **ต้องถามฐานว่าตอนนี้สิทธิ์เป็นยังไง**
--
-- อยู่ใน `public` เพราะ PostgREST ต้องเรียกได้ (schema `app` ไม่ถูกเปิดให้ PostgREST โดยตั้งใจ)
-- · เปิดให้ `service_role` ตัวเดียว รูปแบบเดียวกับ `public.unsafe_state_reason()` (`P-32`)
create or replace function public.client_writable_timestamps()
returns table (table_name text, column_name text, priv text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.relname::text, a.attname::text, p.priv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join (values ('INSERT'), ('UPDATE')) as p(priv)
   where n.nspname = 'public'
     and c.relkind = 'r'
     and a.attname in ('created_at', 'updated_at', 'updated_by_user')
     and has_column_privilege('authenticated', c.oid, a.attnum, p.priv)
   order by 1, 2, 3
$$;

comment on function public.client_writable_timestamps() is
  'คืนคอลัมน์เวลา/ผู้แก้ ที่ role authenticated ยังเขียนได้ · ต้องได้ 0 แถวเสมอ (D7 · E2-AC9) '
  'ถามฐานโดยตรง ไม่ได้อ่าน migration — ด่านที่ทนต่อไฟล์ที่ยังไม่ถูกเขียน';

revoke all on function public.client_writable_timestamps() from public, anon, authenticated;
grant execute on function public.client_writable_timestamps() to service_role;

commit;
