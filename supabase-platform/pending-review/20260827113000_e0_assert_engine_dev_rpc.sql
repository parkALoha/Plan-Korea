-- ═══════════════════════════════════════════════════════════════════════════
-- `E0` — `public.assert_engine_dev()` · ชั้น B ของ fixture reaper
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · P4 ขอ (reaper ของ `lib/__tests__/fixtureReaper.ts`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## ทำไมต้องมี
-- reaper ลบ fixture ออกจากฐานได้ **โดยไม่มีใครพิมพ์คำสั่งลบ** — มันรันเป็นผลข้างเคียงของ `npm test`
-- 🔴 **มันจึงเป็นสิ่งเดียวในโปรเจกต์นี้ที่ทำลายข้อมูลได้โดยที่ไม่มีมนุษย์อยู่ในลูป**
-- → เงื่อนไขข้อ 1 ที่ P1 ตั้งไว้ตอนอนุมัติ: **ต้องยืนยันว่าเป็น `engine-dev` ก่อนลบอะไรทั้งสิ้น**
--
-- ## ทำไมต้องเป็น RPC ไม่ใช่ `select` ตรง ๆ
-- `app.project_identity` อยู่ใน schema `app` ซึ่ง **PostgREST มองไม่เห็น** (`api-config` guard บังคับไว้)
-- และ `E1` เขียนไว้ว่า `revoke all on schema app from public` + `grant usage … to authenticated` เท่านั้น
-- → **`service_role` ไม่มี `usage` บน schema `app`** จึงอ่านตารางนั้นตรง ๆ ไม่ได้แม้จะ BYPASSRLS
-- ⚠️ นี่คือเหตุผลเดียวกับที่ `app.assert_trip_has_plan()` ต้องเป็น `definer` (`20260825141033`)
--
-- ## 🔴 ขอบเขตที่ฟังก์ชันนี้ **พิสูจน์ไม่ได้** — ต้องอ่านก่อนเชื่อมัน
-- `app.project_identity` คือ **คำประกาศของฐานเกี่ยวกับตัวเอง** ไม่ใช่ข้อเท็จจริงที่ตรวจสอบจากภายนอก
-- ใครก็ตามที่ `insert` แถวนี้ลงฐานอื่นได้ **จะทำให้ฐานนั้นผ่านด่านนี้ทันที**
-- 🎯 **สิ่งที่ผูกคำประกาศเข้ากับ *ฐานที่ต่ออยู่จริง* คือชั้น A ฝั่งเทสต์** (URL ต้องมี ref อยู่ในนั้น)
--    **สองชั้นนี้ต้องอยู่ด้วยกันเสมอ ชั้นเดียวไม่พอ** — ชั้น A บอกว่า "ต่อไปที่ไหน" · ชั้น B บอกว่า "ที่นั่นคืออะไร"
--    · รูปเดียวกับ `P-30`: allowlist เดี่ยว ๆ กัน `a-gleam` ไม่ได้ ต้องมีด่าน "public ต้องว่าง" คู่กัน
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

create or replace function public.assert_engine_dev()
returns table (name text, ref text, environment text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_name text;
  v_ref  text;
  v_env  text;
  v_rows int;
begin
  -- ① ตารางต้องมีอยู่ — ฐานที่ไม่เคยรัน `20260824220618` ไม่ใช่ฐานของเรา
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ไม่มี app.project_identity → ไม่ใช่ engine-dev';
  end if;

  -- ② 🔴 ต้องมี **แถวเดียว** — ฐานที่ประกาศตัวตนสองอันคือฐานที่ตอบไม่ได้ว่ามันคืออะไร
  --    ⚠️ ข้อนี้ไม่ได้กันคนที่ตั้งใจ insert ตัวตนปลอม (เขาจะ insert แถวเดียวให้ถูก)
  --       มันกัน *อุบัติเหตุ* เช่นก๊อป seed ข้ามฐาน แล้วเหลือของเดิมค้างอยู่ด้วย
  select count(*) into v_rows from app.project_identity;
  if v_rows <> 1 then
    raise exception 'app.project_identity มี % แถว (ต้องมี 1) → ตัวตนของฐานนี้กำกวม', v_rows;
  end if;

  -- ③ ตัวตนต้องตรงครบ 3 ช่อง — `name` อย่างเดียวแยก dev ออกจาก prod ไม่ได้ (`P-31`)
  select p.name, p.ref, p.environment into v_name, v_ref, v_env
    from app.project_identity p
   where p.name = 'plan-korea-platform'
     and p.ref = 'pmvxwcimjebogjfimzqy'
     and p.environment = 'dev';

  if not found then
    raise exception 'app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;

  -- 🔴 คืนแถว **หลัง** ตรวจครบทุกข้อ ไม่ใช่ระหว่างตรวจ
  --    `return query` แล้วค่อย raise ทีหลัง = มีช่วงที่ฟังก์ชันปล่อยแถวออกไปแล้วยังไม่ผ่านด่าน
  --    ที่นี่ไม่มีช่วงนั้นเลย · ผู้เรียกได้แถวก็ต่อเมื่อผ่านครบสามข้อ
  return query select v_name, v_ref, v_env;
end
$fn$;

-- 🔴 `service_role` เท่านั้น — `authenticated` เรียกได้เมื่อไหร่ = ref ของโปรเจกต์รั่วออกไปฝั่งไคลเอนต์
revoke all on function public.assert_engine_dev() from public, anon, authenticated;
grant execute on function public.assert_engine_dev() to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- ด่านยืนยัน — **เรียกของจริง ไม่ใช่ตรวจว่ามีฟังก์ชัน**
-- ───────────────────────────────────────────────────────────────────────────
-- 🎯 ต่างจากด่านใน `promote_plan_on_delete` ตรงที่**ตัวนี้ทดสอบพฤติกรรมได้จริงในไฟล์เดียว**
--    เพราะมันเป็นฟังก์ชันอ่านอย่างเดียว ไม่ต้องมี fixture ไม่ต้องมีผู้ใช้ ไม่ทิ้งอะไรไว้
do $verify$
declare
  v record;
  v_secdef boolean;
begin
  select * into v from public.assert_engine_dev();
  if v.ref <> 'pmvxwcimjebogjfimzqy' then
    raise exception 'ยืนยันล้ม: assert_engine_dev() คืน ref = %', v.ref;
  end if;

  select p.prosecdef into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'assert_engine_dev';
  if not coalesce(v_secdef, false) then
    raise exception 'ยืนยันล้ม: ต้องเป็น security definer ไม่งั้น service_role อ่าน schema app ไม่ได้';
  end if;

  -- 🔴 `authenticated` ต้องเรียกไม่ได้ — ตรวจสิทธิ์ ไม่ใช่เชื่อว่า revoke ข้างบนทำงาน
  if has_function_privilege('authenticated', 'public.assert_engine_dev()', 'execute') then
    raise exception 'ยืนยันล้ม: authenticated ยังเรียก assert_engine_dev() ได้';
  end if;
  if not has_function_privilege('service_role', 'public.assert_engine_dev()', 'execute') then
    raise exception 'ยืนยันล้ม: service_role เรียกไม่ได้ → reaper จะ fail-close ตลอดกาล';
  end if;
end $verify$;

commit;
