-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `P-54`: `create_trip()` สร้างแผนตั้งต้นให้ · invariant ต้องจริงตั้งแต่วินาทีแรก
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · P4 พบ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่ P4 ยิงจริงแล้วพบ ───────────────────────────────────────────────
--   `create_trip()` → ✅ สำเร็จ · **แผนของทริปนั้น = 0 แถว** (อ่านด้วย client ของเจ้าของเอง)
--
-- `app.assert_trip_has_plan()` เขียนว่า *"ทริปต้องมีแผนอย่างน้อย 1 แผน"*
-- 🔴 **แต่นั่นคือสภาพของทุกทริปที่สร้างผ่านทางที่ตั้งใจให้ใช้** — trigger กันแค่*ลบแผนใบสุดท้าย*
--    **ถ้าไม่เคยมีแผนเลย ไม่มีอะไรให้กัน** · **invariant ที่บังคับตอน *ออก* แต่ไม่บังคับตอน *เข้า***
--
-- 🎯 **และเคสของ P1 เขียวเพราะ fixture สร้างแผนให้เอง** — ทดสอบ invariant บนข้อมูลที่ถูกจัดฉาก
--    ให้ผ่าน invariant นั้นพอดี **ส่วนทางสร้างจริงไม่ผ่าน** · อ่านไม่ออกจากตัวเคสเลย
--
-- ── ทำไมเลือก "สร้างแผนให้" ไม่ใช่ "ยอมรับว่าทริปมี 0 แผนได้" ─────────────
-- `trip_stops.plan_id` เป็น `not null` → **ทริปที่ไม่มีแผน ใส่จุดแวะไม่ได้เลยสักจุด**
-- = ทริปที่เปิดมาแล้วทำอะไรไม่ได้ · และหน้าจอไม่มีแผนให้เลือกแสดง
-- → ถ้ายอมรับสภาพนี้ **ต้องถอดข้อความของ trigger ทิ้ง** เพราะมันจะเป็นคำโกหกที่อ่านเหมือนหลักประกัน
--
-- ⚠️ **ไม่แตะ `trip_days`** — ทริปที่มี 0 วันยังใช้ได้ (วันถูกสร้างตามช่วงวันโดยตัวปรับของ `E3`)
--    และ**ไม่มี invariant ไหนอ้างว่าทริปต้องมีวัน** → ไม่ใช่ปัญหาเดียวกัน **ห้ามเหมารวม**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   คืน `public.create_trip` ฉบับที่ไม่สร้างแผน (`20260824221550_create_trip_rpc.sql`)
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

create or replace function public.create_trip(
  p_title text,
  p_start_date date,
  p_end_date date,
  p_base_timezone text default null
)
returns public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_trip public.trips;
begin
  if v_uid is null then
    raise exception 'ต้องล็อกอินก่อนสร้างทริป' using errcode = '42501';
  end if;

  insert into public.trips (created_by, title, start_date, end_date, base_timezone)
  values (
    v_uid,
    p_title,
    p_start_date,
    p_end_date,
    coalesce(nullif(trim(p_base_timezone), ''), 'Asia/Bangkok')
  )
  returning * into v_trip;

  insert into public.trip_members (trip_id, user_id, role, invited_by)
  values (v_trip.id, v_uid, 'owner', v_uid)
  on conflict (trip_id, user_id) do nothing;

  -- 🔴 `P-54` — แผนตั้งต้น · **ต้องอยู่ในฟังก์ชันเดียวกัน ไม่ใช่ให้ไคลเอนต์เรียกต่อ**
  --    ถ้าให้ไคลเอนต์เรียกต่อ: เน็ตหลุดระหว่างสองคำขอ = ทริปที่ invariant เป็นเท็จ **ค้างถาวร**
  --    ทั้งก้อนอยู่ในทรานแซกชันเดียวของฟังก์ชันนี้ → มีทริปก็ต้องมีแผน หรือไม่มีทั้งคู่
  --
  -- `is_active = true` เพราะเป็นใบเดียว — `trip_plans_one_active` (`D52`) ยอมให้มีได้ 1
  -- ชื่อ `'แผน A'` ตรงกับที่ผู้ใช้เห็นอยู่ทุกวันนี้ · เปลี่ยนชื่อได้ทีหลังตามปกติ
  insert into public.trip_plans (trip_id, name, is_active)
  values (v_trip.id, 'แผน A', true);

  return v_trip;
end;
$$;

revoke all on function public.create_trip(text, date, date, text) from public, anon, authenticated;
grant execute on function public.create_trip(text, date, date, text) to authenticated;

commit;
