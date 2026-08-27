-- ═══════════════════════════════════════════════════════════════════════════
-- E3 — ทางเรียก `read_only_uncovered_tables()` จากชุดทดสอบ
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · ต้นเรื่อง: P4 วัดแล้วพบว่าเรียกไม่ได้ (`PGRST202`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ปัญหา ─────────────────────────────────────────────────────────────────
-- `20260827180000` เพิ่ม `app.read_only_uncovered_tables()` ไว้ให้ตรวจว่าตารางไหน
-- ไม่มี `zz_read_only_guard` · **แล้วไม่ grant ให้ใครเลย และอยู่ใน schema `app` ที่ไม่ถูก expose**
-- → ชุดทดสอบเรียกไม่ได้ (`PGRST202`) · **ฟังก์ชันที่ไม่มีใครเรียกได้ ไม่ใช่ด่าน มันคือโค้ดที่ตายแล้ว**
--
-- 🎯 **ผมทำซ้ำรูปที่โปรเจกต์นี้ตั้งชื่อไว้เองแล้ว: `P-50` — "ธงที่อ่านไม่ได้ ไม่ใช่ธง"**
--    ตอนนั้น P7 ตั้งข้อนี้กับธงโหมด read-only · ผมเขียนตัวตรวจของด่านเดียวกันนั้นให้อ่านไม่ได้อีกตัว
--
-- ── ทางที่ปฏิเสธ และเหตุผล ────────────────────────────────────────────────
-- 🔴 **เติมแถวที่ 5 เข้า `public.read_only_selftest()` แทนการสร้างฟังก์ชันใหม่**
--    น่าสนใจมากเพราะ **ไม่ต้อง grant อะไรเพิ่มเลย** — ตัวนั้น `grant execute … to service_role` อยู่แล้ว
--    และสองเรื่องนี้ก็เป็น "สองครึ่งของคำถามเดียว" (ตรรกะทำงานไหม · ติดครบไหม)
--
--    **แต่คอลัมน์ที่มันคืนชื่อ `blocked`** — แปลว่า *"การเขียนถูกบล็อกไหม"*
--    แถวความครอบคลุมจะทำให้ `true` แปลว่า *"ติดครบ"* → **คอลัมน์เดียวความหมายต่างกันตามแถว**
--    🎯 **นั่นคือโหมดพังที่โปรเจกต์นี้ไล่ปิดกันมาทั้งวัน: สัญญาณที่ถูกอ่านว่าแปลว่าอย่างอื่น**
--    · การเลี่ยงงานเอกสาร (จดข้อยกเว้น) ด้วยการยัดความหมายที่สองลงคอลัมน์เดิม **แพงกว่าเอกสารมาก**
--
-- ── ทำไมต้องมี wrapper ใน `public` ────────────────────────────────────────
-- PostgREST expose เฉพาะ `public` (`guards.sh` มีด่าน `api-config` บังคับว่า `app` ต้องไม่ถูก expose)
-- → ฟังก์ชันใน `app` เรียกผ่าน RPC ไม่ได้ **ไม่ว่าจะ grant ยังไงก็ตาม** · wrapper จึงไม่ใช่ทางเลือก
--
-- 🔴 **wrapper เป็น `security definer` โดยจำเป็น ไม่ใช่โดยเผลอ** — ตัวข้างในถูก `revoke all from public`
--    ถ้า wrapper เป็น invoker มันจะเรียกตัวข้างในไม่ได้ · definer ทำให้ **สิทธิ์ execute ของตัวข้างใน
--    ยังปิดอยู่เหมือนเดิม** ไม่ต้องเปิดเพิ่มอีกจุด
--
-- ── ⚠️ นี่คือ `grant execute … to service_role` — ข้อยกเว้นที่ 6 ใน `TEAM.md` ────
--    **จดแล้วพร้อมกับไฟล์นี้** ตามกติกา ("ข้อยกเว้นที่ไม่ได้จด จะหายไปจากความจำของคนที่อนุมัติมันเอง")
--    ขอบเขต: **อ่านอย่างเดียว · ไม่รับพารามิเตอร์ · แตะเฉพาะ `pg_catalog` · ไม่แตะข้อมูลผู้ใช้สักแถว**
--    · ต่างจากข้อยกเว้นที่ 2–5 ตรงที่ **ไม่ได้ให้สิทธิ์บน *ตาราง* ใด ๆ** — ให้สิทธิ์เรียกฟังก์ชันตัวเดียว
--    · `service_role` มี `BYPASSRLS` อยู่แล้ว → ฟังก์ชันนี้ **ไม่ได้เปิดอะไรที่มันเข้าไม่ถึงอยู่แล้ว**
--      🔴 **แต่ "ไม่เพิ่มความเสี่ยง" ไม่ใช่เหตุผลที่จะไม่จด** — เหตุผลที่ต้องจดคือให้ *นับได้*
--         ว่าวันนี้ `service_role` ทำอะไรได้บ้าง โดยไม่ต้องไล่อ่าน migration ทุกไฟล์
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop function if exists public.read_only_uncovered_tables();
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
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev';
  end if;
end $guard$;

create or replace function public.read_only_uncovered_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.read_only_uncovered_tables()
$$;

comment on function public.read_only_uncovered_tables() is
  'ทางเรียกของ app.read_only_uncovered_tables() สำหรับชุดทดสอบ (PostgREST expose แต่ public) '
  'ต้องคืนศูนย์แถวเสมอ — แถวที่คืนมาคือตารางที่เขียนได้ตอนโหมด read-only เปิด '
  'ข้อยกเว้น service_role ที่ 6 ใน TEAM.md · อ่านอย่างเดียว ไม่รับ input ไม่แตะข้อมูลผู้ใช้';

-- 🔴 ลำดับสำคัญ: `revoke` ก่อน `grant` เสมอ · และระบุ role ทีละตัว ไม่เหมาเข่ง
revoke all on function public.read_only_uncovered_tables() from public, anon, authenticated;
grant execute on function public.read_only_uncovered_tables() to service_role;

commit;
