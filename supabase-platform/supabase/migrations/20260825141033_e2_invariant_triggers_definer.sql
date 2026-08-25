-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — trigger ที่ยืนยัน **ค่าคงที่ของฐาน** ต้องทำงานได้ไม่ว่าใครเป็นคนสั่ง
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · `D38`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── อาการที่เจอตอนรัน ─────────────────────────────────────────────────────
-- ลบทริปทั้งใบด้วย `service_role` → `permission denied for table trip_plans`
-- ไม่ใช่ RLS · ไม่ใช่ตัว cascade · **เป็น `app.assert_trip_has_plan()` เอง**
-- มันรันเป็น `security invoker` → อ่าน `public.trip_plans` ด้วยสิทธิ์ของคนสั่ง
-- ซึ่ง `service_role` ไม่มี grant บนตารางนั้น
--
-- 🎯 **ข้อผิดพลาดเชิงชนิด ไม่ใช่เชิงสิทธิ์: trigger พวกนี้ยืนยัน *ค่าคงที่ของฐาน*
--    ไม่ได้บังคับ *สิทธิ์ของผู้ใช้*** — มันต้องให้คำตอบเดียวกันไม่ว่าใครเป็นคนสั่งลบ
--    · invoker แปลว่า **ค่าคงที่จะถูกบังคับกับบางคน และเงียบกับบางคน**
--    · และคนที่มันเงียบด้วย คือคนที่มีสิทธิ์มากที่สุด **ซึ่งกลับด้านกับสิ่งที่ควรเป็น**
--
-- ⚠️ **นี่คือ `D38` ในทิศที่ยังไม่เคยเขียน**: `D38` ห้ามใช้ definer เพื่อ *ได้สิทธิ์เพิ่ม*
--    ข้อนี้ใช้ definer เพื่อให้ *ด่านไม่หายไปเมื่อคนสั่งมีสิทธิ์น้อยกว่าที่ด่านต้องใช้*
--    · ฟังก์ชันทั้งสองตัว **ไม่คืนข้อมูลออกไปเลยสักไบต์** — คืน `null`/`old` แล้ว `raise` เท่านั้น
--    · `set search_path = ''` ครบทั้งคู่ (กันช่องยกระดับสิทธิ์แบบคลาสสิกของ definer)
--
-- 🔴 **จะทำให้ทะเบียน `security definer` ของ P4 แดง — ซึ่งถูกต้อง** · เพิ่มขึ้น 2 ตัว
--    ข้อความตอนแดงถามว่า *"ฟังก์ชันใหม่รับคอลัมน์ที่ column grant ห้ามไว้หรือเปล่า"*
--    → คำตอบสำหรับสองตัวนี้คือ **ไม่รับพารามิเตอร์อะไรเลย** (เป็น trigger function)
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   คืนทั้งสองฟังก์ชันเป็น security invoker (ค่าเริ่มต้น — ตัด `security definer` ออก)
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

create or replace function app.assert_trip_has_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.trips where id = old.trip_id)
     and not exists (select 1 from public.trip_plans where trip_id = old.trip_id) then
    raise exception 'ทริปต้องมีแผนอย่างน้อย 1 แผน — ลบแผนสุดท้ายไม่ได้';
  end if;
  return null;
end;
$$;

create or replace function app.assert_day_has_no_stops()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.trip_stops where trip_day_id = old.id) then
    raise exception 'ลบวันที่ยังมีจุดแวะอยู่ไม่ได้ — ย้ายหรือลบจุดแวะก่อน (cascade จะลบทิ้งเงียบ ๆ)';
  end if;
  return old;
end;
$$;

commit;
