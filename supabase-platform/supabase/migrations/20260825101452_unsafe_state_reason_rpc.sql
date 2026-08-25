-- ═══════════════════════════════════════════════════════════════════════════
-- `P-50` — ทางอ่าน `app.unsafe_state` จาก harness · ธงที่อ่านไม่ได้ ไม่ใช่ธง
-- เจ้าของ: P1-Lead · P4 พบก่อนเขียนโค้ดรอบมัน · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 **ความพลาด: P1 สร้าง `app.unsafe_state` แล้ว push ลงฐาน โดยไม่เคยตรวจว่ามีใครอ่านมันได้**
--   P4 ยิงทดสอบก่อนเขียนโค้ดรอบมัน:
--     `admin.from("unsafe_state")`      → `PGRST205  Could not find the table 'public.unsafe_state'`
--     `admin.schema("app").from(...)`   → `PGRST106  Invalid schema: app`
--
--   🎯 **PostgREST ไม่เปิด schema `app` — ซึ่ง P1 เขียนเหตุผลนั้นไว้เองใน `0001`**
--      (*"ใน `app` PostgREST ไม่เห็น schema นี้ตั้งแต่แรก"*) · **เหตุผลนั้นถูก และเป็นสิ่งที่ทำให้ธงใช้ไม่ได้**
--   → SQL ที่ P1 ส่งให้ P4 (`select … from app.unsafe_state`) **ทำงานใน SQL Editor แต่ทำงานจาก harness ไม่ได้**
--     **และ harness คือที่เดียวที่ธงนี้ต้องถูกอ่าน**
--
--   🔴 **ชนิดเดียวกับที่ทีมไล่ปิดกันมาสองวัน: ด่านที่ลงฐานแล้ว เชื่อว่าทำงาน แต่ไม่มีใครรันมันสักครั้ง**
--      รอบนี้ไม่หลุด เพราะ P4 ทดสอบก่อนสร้างของรอบมัน **ไม่ใช่เพราะใครระวังตัวมากขึ้น**
--
-- ── 🛑 ทางที่ปฏิเสธ: เปิด schema `app` ให้ PostgREST (P4 ค้านแรง · P1 เห็นด้วยเต็มที่) ──
--   `app.trip_role` · `app.can_read_trip` · `app.shares_trip_with` เป็น **`security definer`**
--   และ **`grant execute … to authenticated`** อยู่แล้ว
--   → เปิด schema เมื่อไหร่ **ผู้ใช้ที่ล็อกอินแล้วเรียก `app.trip_role('<ทริปของคนอื่น>')` ได้ตรง ๆ**
--     = อ่านสถานะสมาชิกของทริปใดก็ได้ **โดยไม่ผ่าน RLS สักชั้น**
--   🔴 **แลกช่องโหว่จริง เพื่อความสะดวกของด่าน — ห้ามเด็ดขาด**
--
-- ── ทางที่เลือก: เปิดค่าเดียว ให้ role เดียว ────────────────────────────────
--   ตารางยังซ่อนใน `app` เหมือนเดิม · RPC ตัวเดียวใน `public` คืน `reason` อย่างเดียว
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop function if exists public.unsafe_state_reason();
--   ⚠️ ถอยแล้ว harness อ่านธงไม่ได้ = กลับไปสภาพ `P-50` — ถอยพร้อมฝั่ง harness เท่านั้น
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity ไม่ตรงกับ engine-dev';
  end if;
exception
  when undefined_table then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ฐานนี้ไม่ใช่ engine-dev ของแพลตฟอร์ม';
end $guard$;

create function public.unsafe_state_reason()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select reason from app.unsafe_state limit 1
$$;

-- 🔴 `P-32`: `revoke … from public` **อย่างเดียวไม่ถอนสิทธิ์ที่ให้ `anon`/`authenticated` ตามชื่อ**
--    ต้องระบุครบทั้งสาม · บทเรียนนี้เพิ่งจ่ายไปเมื่อวานกับ `create_trip`
revoke execute on function public.unsafe_state_reason() from public, anon, authenticated;
grant  execute on function public.unsafe_state_reason() to service_role;

commit;
