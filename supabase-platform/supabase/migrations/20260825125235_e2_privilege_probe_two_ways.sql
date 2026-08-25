-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — ทำให้ด่านสภาพปลายทาง **พิสูจน์ได้ 2 ทิศ** ไม่ใช่เขียวอย่างเดียว
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · กฎ `E0` ข้อ 1–2
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `client_writable_timestamps()` ที่เพิ่งลง **เขียวตั้งแต่รอบแรกที่รัน**
-- 🔴 และนั่นคืออาการเดียวกับ `expect(true).toBe(true)` ที่ P4 เพิ่งถอนออกไปวันนี้:
--    ฟังก์ชันที่คืน 0 แถวเสมอ (เช่นเขียน `has_column_privilege` ผิดชื่อ role หรือผิด oid)
--    จะทำให้ด่านเขียวตลอดกาล **โดยไม่มีอะไรบอกว่ามันไม่ได้ตรวจอะไรเลย**
--
-- ทางแก้: ให้พารามิเตอร์รายชื่อคอลัมน์ได้ → เทสต์ยิงคอลัมน์ที่ **รู้ว่าเขียนได้** เข้าไป
-- ถ้ากลไกทำงานจริงมันต้องคืนแถว · **ด่านเดิมยังเป็นค่าตั้งต้น ไม่มีใครต้องจำอะไรเพิ่ม**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   คืนฉบับไม่มีพารามิเตอร์จาก `…125024_e2_narrow_key_grants.sql`
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

drop function if exists public.client_writable_timestamps();

create or replace function public.client_writable_timestamps(
  p_columns text[] default array['created_at', 'updated_at', 'updated_by_user']
)
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
     and a.attname = any(p_columns)
     and has_column_privilege('authenticated', c.oid, a.attnum, p.priv)
   order by 1, 2, 3
$$;

comment on function public.client_writable_timestamps(text[]) is
  'คอลัมน์ที่ role authenticated ยังเขียนได้ · ค่าตั้งต้น = คอลัมน์เวลา/ผู้แก้ ซึ่งต้องได้ 0 แถวเสมอ '
  '(D7 · E2-AC9) · รับรายชื่อคอลัมน์ได้เพื่อให้เทสต์พิสูจน์ได้ว่ากลไกยังตรวจอยู่จริง ไม่ใช่คืนว่างเสมอ';

revoke all on function public.client_writable_timestamps(text[]) from public, anon, authenticated;
grant execute on function public.client_writable_timestamps(text[]) to service_role;

commit;
