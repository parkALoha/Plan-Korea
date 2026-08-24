-- ═══════════════════════════════════════════════════════════════════════════
-- P-26 ทางแก้จริง — `public.create_trip()` แทนการ insert ตรงแล้วหวังให้ RETURNING ผ่าน RLS
-- เจ้าของ: P1-Lead · P4-QA/Sec รีวิวและวางข้อบังคับ 6 ข้อ · 24 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🎯 **ทำไมทางนี้ ทั้งที่ยังไม่รู้ว่า `P-27` ถูกหรือผิด**
--   P4 เป็นคนชี้ และเป็นเหตุผลที่ดีกว่าของเดิม: ไม่ต้องรู้คำตอบก็เลือกได้
--
--   | ถ้าใครถูก | `BEFORE INSERT` (`pending-review/`) | RPC ตัวนี้ |
--   |---|---|---|
--   | P1 ถูก (`P-27` snapshot มองไม่เห็น) | ❌ error เดิม + ทิ้ง FK deferrable ไว้ฟรี | ✅ ไม่มี RETURNING ให้ผ่าน RLS |
--   | P4 ถูก (แถวมองเห็น)                 | ⚠️ แก้อาการได้ **แต่เปิด `P-29`** | ✅ ปิด `P-29` ไปในตัว |
--
--   🔴 **`BEFORE INSERT` แพ้ทั้งสองกรณี · RPC ชนะทั้งสองกรณี** → ข้อโต้แย้งที่ตัดสินไม่ได้
--   กลายเป็นข้อที่ **ไม่ต้องตัดสิน** · และเราตัดสินไม่ได้จริงๆ จนกว่าจะ push ซึ่งคือสิ่งที่พยายามไม่เสียเปล่า
--
-- 📌 `P-29` (P4 พบ) คือเหตุผลอิสระข้อที่สอง: `upsert(…, {ignoreDuplicates:true})` → `on conflict do nothing`
--    **BEFORE trigger ยิงก่อนตรวจ conflict** · `bootstrap_trip_owner` เป็น definer → ข้าม RLS
--    → เขียนแถว `(ทริปเหยื่อ, ผู้โจมตี, 'owner')` โดยแถว `trips` ถูกข้ามและ **ไม่มี error**
--    🟢 **`AFTER INSERT` ไม่มีช่องนี้** (trigger ไม่ยิงกับแถวที่ถูกข้าม) — migration นี้จึง **ไม่แตะ trigger เลย**
--       trigger ยังเป็น `AFTER INSERT` ตามที่ `0001` สร้างไว้ · **การไม่ทำอะไรคือส่วนหนึ่งของทางแก้**
--
-- ── ข้อบังคับ 6 ข้อของ P4 · ที่ไหนในไฟล์นี้ทำตาม ──────────────────────────────
--   ① `set search_path = ''` + ชื่อเต็มทุกตัว        → บรรทัด `set search_path` ด้านล่าง
--   ② ห้ามรับ `created_by`                            → อ่านจาก `auth.uid()` ข้างในเท่านั้น
--   ③ ห้ามรับ `id`                                    → ปล่อยให้ `gen_random_uuid()` ของตาราง
--   ④ `auth.uid() is null` ต้อง raise เอง             → บล็อกแรกของ body
--   ⑤ revoke จาก public แล้ว grant ให้ authenticated  → ท้ายไฟล์ · **ข้อที่ร้ายที่สุดถ้าลืม**
--   ⑥ คืนเฉพาะแถวที่เพิ่งสร้าง ห้าม `setof`           → `returns public.trips`
--
-- ⚠️ **สิ่งที่ migration นี้ *ไม่* ทำ และตั้งใจไม่ทำ:**
--   ไม่ปิด policy `trips_insert` · ยังสร้างทริปด้วย insert ตรงได้อยู่ (แค่ยังเจอ `P-26` ถ้าใส่ `.select()`)
--   การบังคับให้ RPC เป็น**ทางเดียว**เป็นงานของ `E2` ตอน DAL ลง — ปิดตอนนี้จะทำให้เคสด้านลบของ
--   เมทริกซ์ที่ยิง insert ตรง เปลี่ยนความหมายไปทั้งชุดโดยที่ยังไม่มีใครรันมันได้สักครั้ง
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop function if exists public.create_trip(text, date, date, text);
--   🟢 ถอยได้สะอาด — ไม่มีตาราง ไม่มี policy ไม่มี trigger ถูกแตะในไฟล์นี้
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · allowlist ตาม D48 · fail closed ──────────────────
-- 🔴 ไม่มี marker = **ล้ม** ไม่ใช่ผ่าน (P4 ย้ำ) — ถ้าเขียนว่า "ไม่มี marker = ข้าม"
--    เราจะได้ denylist กลับมาในชุดใหม่ และฐานที่ไม่รู้จักจะเดินผ่านได้อีกรอบ
do $guard$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ฐานนี้ไม่ใช่ engine-dev ของแพลตฟอร์ม';
  end if;

  if not exists (
    select 1 from app.project_identity where name = 'plan-korea-platform'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ของ plan-korea-platform';
  end if;
end $guard$;

-- ───────────────────────────────────────────────────────────────────────────
create function public.create_trip(
  p_title         text,
  p_start_date    date,
  p_end_date      date,
  p_base_timezone text default 'Asia/Bangkok'
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
  -- ④ ไม่พึ่ง NOT NULL ให้ล้มเอง — ข้อความจะอ่านไม่ออกและเป็นการพึ่งผลข้างเคียง
  if v_uid is null then
    raise exception 'ต้องล็อกอินก่อนสร้างทริป' using errcode = '42501';
  end if;

  -- ② `created_by` มาจาก auth.uid() ข้างในเท่านั้น · ③ `id` มาจาก default ของตาราง
  -- ข้อจำกัดความยาว title และ end_date >= start_date บังคับด้วย CHECK ของตารางอยู่แล้ว
  insert into public.trips (created_by, title, start_date, end_date, base_timezone)
  values (
    v_uid,
    p_title,
    p_start_date,
    p_end_date,
    coalesce(nullif(trim(p_base_timezone), ''), 'Asia/Bangkok')
  )
  returning * into v_trip;

  -- 🔴 ตรงนี้คือทั้งหมดที่ `P-26` เป็น: `returning` ข้างบนอยู่**ในฟังก์ชัน definer**
  --    จึงไม่ถูก policy ฝั่งอ่านของ `trips` ตรวจ · ไม่มี snapshot ไหนต้องมองเห็นอะไรทัน
  --
  -- trigger `trips_bootstrap_owner` (AFTER INSERT) สร้างแถวนี้ให้แล้วตอน insert ข้างบนจบ
  -- บรรทัดล่างจึงเป็น no-op ในทางปฏิบัติ — **จงใจเก็บไว้** เพื่อให้ฟังก์ชันนี้ยังถูกต้อง
  -- ด้วยตัวเองถ้าวันหนึ่งมีคนถอด trigger ออก · `on conflict` ทำให้มันปลอดภัยที่จะซ้ำ
  insert into public.trip_members (trip_id, user_id, role, invited_by)
  values (v_trip.id, v_uid, 'owner', v_uid)
  on conflict (trip_id, user_id) do nothing;

  -- ⑥ คืนแถวเดียวที่เพิ่งสร้าง — ไม่รับเงื่อนไขจากผู้เรียก จึงเป็นช่องอ่านทริปอื่นไม่ได้
  return v_trip;
end;
$$;

-- ⑤ 🔴 ข้อที่ร้ายที่สุดถ้าลืม — ฟังก์ชันนี้ข้าม RLS โดยนิยาม
--    `public` รวม `anon` ด้วย · ปล่อยไว้ = คนไม่ล็อกอินเรียกฟังก์ชันที่ข้าม RLS ได้
--    (④ จะปฏิเสธเขาอยู่ดีเพราะ auth.uid() เป็น null — แต่ **ไม่พึ่งด่านชั้นเดียว**)
revoke execute on function public.create_trip(text, date, date, text) from public;
grant  execute on function public.create_trip(text, date, date, text) to authenticated;

commit;
