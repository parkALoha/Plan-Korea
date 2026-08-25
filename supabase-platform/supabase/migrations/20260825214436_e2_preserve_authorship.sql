-- ═══════════════════════════════════════════════════════════════════════════
-- `P-55` / `D78` ข้อ 2 — ประวัติว่าใครเพิ่มอะไร ต้องรอดตอนบัญชีหายไป
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · **ปิด `Q4`** (ผู้ใช้ตัดสิน)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่ยิงจริงแล้วเจอ (`P-55`) ────────────────────────────────────────────
--   B (editor) เพิ่ม `checklist_items` 1 แถว → `added_by_user` = B · `legacy_added_by` = null
--   ลบบัญชี B → **แถวยังอยู่ · ทั้งสองคอลัมน์เป็น `null`**
--   🔴 **ไม่มีอะไรบอกได้อีกเลยว่าใครเพิ่ม · ไม่มี error ไม่มีคำเตือน ไม่มีร่องรอย**
--   `on delete set null` ทำงานถูกต้องตามที่เขียนไว้ทุกตัวอักษร
--
-- 🎯 **ความย้อนแย้งที่เป็นหัวใจ:** `column-map.md` เขียนเหตุผลของ `legacy_added_by` ไว้เองว่า
--    *"สตริงเดิมเป็นข้อมูลเดียวที่บอกได้ว่าใครเพิ่มอะไรในทริปจริง **ห้ามทิ้ง**"*
--    → เราออกแบบให้ประวัติ**รอดสำหรับแถวที่ย้ายมา** และ**ตายสำหรับแถวที่เกิดใหม่**
--    **สลับข้างกับสัญชาตญาณพอดี**
--
-- ── `Q4` — ผู้ใช้ตัดสินแล้ว: **เก็บ `display_name`** ────────────────────────
-- ทางเลือกที่ยกให้ผู้ใช้: `display_name` · ข้อความไม่ระบุตัวตน · หรือยอมให้ประวัติหาย
-- 🔴 **ยกให้ผู้ใช้เพราะมันไม่ใช่คำถามวิศวกรรม** — *"ลบบัญชี" กับ "ชื่อยังอยู่" อยู่ด้วยกันได้แค่ไหน*
--    เป็นการตัดสินใจที่มี**ทิศทางเดียว**: เขียนไปแล้วถอนกลับไม่ได้สำหรับคนที่ลบบัญชีไประหว่างนั้น
-- · สอดคล้องกับสิ่งที่ `column-map.md` ตัดสินไปแล้วสำหรับข้อมูลที่ย้ายมา — ข้อนี้แค่ทำให้**สม่ำเสมอ**
--
-- ── ทำไมเป็น catalog-driven ไม่ใช่ `update` 8 บรรทัดที่พิมพ์ชื่อตารางไว้ ────
-- 🔴 **ถ้าพิมพ์ชื่อตารางไว้ตายตัว: ตารางที่เกิดใหม่ใน `E3`/`E5` ที่มี `added_by_user`
--    จะเสียประวัติเงียบ ๆ แบบเดิมเป๊ะ — และไม่มีอะไรส่งเสียง**
--    = สร้าง `P-55` ตัวที่สองด้วยมือของคนที่เพิ่งแก้ `P-55` ตัวแรก
-- → `public.authorship_columns()` ถามฐานว่า *ตอนนี้มีคู่คอลัมน์อะไรบ้าง* แล้ว trigger เดินตามนั้น
--   · คู่ = `<x>_by_user` (uuid) ที่มี `legacy_<x>_by` (text) อยู่ในตารางเดียวกัน
--   · **แยกเป็นฟังก์ชันของตัวเอง ไม่ฝังใน trigger** เพื่อให้เทสต์ *เห็น* ว่ามันครอบอะไร
--     — กลไกที่ครอบอัตโนมัติแบบมองไม่เห็น คือกลไกที่ไม่มีใครรู้ว่าเลิกครอบเมื่อไหร่
--
-- ── 🔴 `updated_by_user` **ไม่ได้ครอบ และนั่นคือการตัดสินใจ ไม่ใช่การหลงลืม** ──
-- มันไม่มี `legacy_updated_by` อยู่เลยสักตาราง → ตัวเลือกคู่คอลัมน์ข้างบนจึงข้ามมันเอง
-- **และผมเลือกไม่เพิ่มคอลัมน์นั้น:** `updated_by_user` แปลว่า *"คนล่าสุดที่แก้"* ซึ่งถูกเขียนทับ
-- ทุกครั้งที่มีคนแก้ต่ออยู่แล้ว · การแช่มันเป็นข้อความ = **แช่ค่าที่กำลังจะถูกทับอยู่ดี**
-- ต่างจาก `added_by` ที่เป็น *ข้อเท็จจริงที่เกิดครั้งเดียวและไม่เปลี่ยนอีก*
-- 📌 ถ้าวันหนึ่งมีคนเห็นต่าง **เพิ่ม `legacy_updated_by` แล้วตัวนี้จะครอบให้เองทันที ไม่ต้องแก้ไฟล์นี้**
--
-- ── ราคาที่ยอมรับ ─────────────────────────────────────────────────────────
-- ลบ 1 บัญชี = `update` ไล่ทุกตารางที่มีคู่คอลัมน์ (วันนี้ 8 คู่ใน 7 ตาราง) โดยไม่มี index บน
-- `added_by_user` → seq scan · **การลบบัญชีเป็นเหตุการณ์ที่นาน ๆ ครั้ง จึงรับได้**
-- ⚠️ **ห้ามเติม index 8 ตัวเพื่อกันปัญหาที่ยังไม่เกิด** — วัดก่อนถ้ามันช้าจริง
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop trigger if exists profiles_preserve_authorship on public.profiles;
--   drop function if exists app.preserve_authorship();
--   drop function if exists public.authorship_columns();
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
-- 1. ถามฐานว่ามีคู่คอลัมน์ประวัติอะไรบ้าง
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.authorship_columns()
returns table (table_name text, user_column text, legacy_column text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.relname::text, a.attname::text, l.attname::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_catalog.pg_attribute a
      on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     and a.atttypid = 'uuid'::regtype
     and a.attname like '%\_by\_user'
    join pg_catalog.pg_attribute l
      on l.attrelid = c.oid and l.attnum > 0 and not l.attisdropped
     and l.atttypid = 'text'::regtype
     -- `added_by_user` → ตัด `_user` (5 ตัว) → `added_by` → `legacy_added_by`
     and l.attname = 'legacy_' || left(a.attname, length(a.attname) - 5)
   where c.relkind = 'r'
   order by 1, 2
$$;

comment on function public.authorship_columns() is
  'คู่คอลัมน์ประวัติที่ app.preserve_authorship() จะเดินตาม — <x>_by_user (uuid) ที่มี legacy_<x>_by (text) คู่กัน '
  'แยกออกมาเป็นฟังก์ชันเพื่อให้เทสต์เห็นขอบเขตจริง · กลไกที่ครอบอัตโนมัติแบบมองไม่เห็น '
  'คือกลไกที่ไม่มีใครรู้ว่ามันเลิกครอบเมื่อไหร่ · updated_by_user ไม่เข้าเกณฑ์โดยตั้งใจ (P-55/D78)';

revoke all on function public.authorship_columns() from public, anon, authenticated;
grant execute on function public.authorship_columns() to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. trigger — เขียนชื่อลงก่อน FK จะ `set null`
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.preserve_authorship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in select * from public.authorship_columns() loop
    -- 🔴 `and %I is null` — **ห้ามทับสตริงเดิมที่ย้ายมาจากทริปเก่าเด็ดขาด**
    --    ค่าที่ `E7` ย้ายมาคือของจริงที่ผู้ใช้พิมพ์เอง · `display_name` เป็นแค่ของสำรอง
    -- 🔴 **ไม่กรอง `deleted_at`** โดยตั้งใจ — แถวที่ถูก soft delete ก็ยังต้องรู้ว่าใครเพิ่ม
    --    (`E7` นับแถวรวม tombstone · และ `D76` ให้ "ใครลบ" มาจาก `updated_by_user` คนละเรื่องกัน)
    execute format(
      'update public.%I set %I = $1 where %I = $2 and %I is null',
      r.table_name, r.legacy_column, r.user_column, r.legacy_column
    ) using old.display_name, old.id;
  end loop;
  return old;
end;
$$;

comment on function app.preserve_authorship() is
  'P-55/D78/Q4 — ก่อนลบ profiles เขียน display_name ลง legacy_<x>_by ของทุกแถวที่คนนั้นเคยเพิ่ม/ติ๊ก/ซ่อน '
  'ไม่ทับค่าที่มีอยู่แล้ว (ของ E7 สำคัญกว่า) · ไม่กรอง deleted_at (tombstone ก็ต้องมีเจ้าของ) '
  'ห้ามเปลี่ยนเป็น SECURITY INVOKER: คนที่ลบบัญชีไม่ได้มีสิทธิ์เขียนตารางของทริปที่เขาไม่ได้อยู่แล้ว';

revoke execute on function app.preserve_authorship() from public, anon, authenticated;

-- `before` ไม่ใช่ `after` — `after` จะทำงาน**หลัง** FK `set null` ไปแล้ว
-- ตอนนั้น `added_by_user = old.id` ไม่ match แถวไหนอีกเลย → update 0 แถว **และเงียบสนิท**
create trigger profiles_preserve_authorship
  before delete on public.profiles
  for each row execute function app.preserve_authorship();

commit;
