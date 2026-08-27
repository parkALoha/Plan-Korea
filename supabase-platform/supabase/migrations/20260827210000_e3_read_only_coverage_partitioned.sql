-- ═══════════════════════════════════════════════════════════════════════════
-- E3 — ปิดจุดบอดของตัวตรวจด่าน read-only: ตาราง partitioned ถูกข้ามเงียบ
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · P4 ยืนยันว่า control ที่มีอยู่ดักข้อนี้ไม่ได้
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ปัญหา ─────────────────────────────────────────────────────────────────
-- `app.read_only_uncovered_tables()` กรอง `c.relkind = 'r'` (ตารางธรรมดา)
-- **ตาราง partitioned มี `relkind = 'p'`** → ถูกข้ามไปเลย ไม่ถูกนับว่า "ไม่มี guard" ด้วยซ้ำ
-- → ถ้าวันหนึ่งมีตาราง partitioned ใน `public` ที่ไม่ติด `zz_read_only_guard`
--   ฟังก์ชันจะคืน `[]` เหมือนเดิมทุกประการ · **เขียนได้ตอนโหมด read-only เปิด โดยไม่มีใครรู้**
--
-- 🎯 **นี่คือรูปเดียวกับตัวปัญหาที่ฟังก์ชันนี้ถูกสร้างมาจับ** — ตอนนั้นคือ "ตารางใหม่ไม่ได้ trigger
--    เพราะลูปรันครั้งเดียว" · ตอนนี้คือ "ตารางบางชนิดไม่เคยอยู่ในสายตาตัวตรวจเลย"
--    **ทั้งคู่จบที่ `[]` ที่อ่านว่าปลอดภัย**
--
-- ── ทำไมแก้ตอนนี้ ไม่ใช่จดรอ `E7` ────────────────────────────────────────
-- P4 เสนอให้จดเป็น flag ไว้ในเทสต์ว่า *"ถ้า `E7` พา partitioned เข้ามา ต้องกลับมาแก้"*
-- 🔴 **แต่ของที่รอให้คนกลับมาแก้ คือของที่ `P-75` เพิ่งสอนเราว่าไม่มีใครกลับมา** —
--    งานที่ไม่มี AC ไหนวัด ไม่ใช่งานที่ถูกลืม มันคืองานที่ไม่เคยอยู่ในรายการของใคร
--    · การแก้ที่นี่คือ **หนึ่งบรรทัด** · การจดไว้รอคือ **หนี้ที่ต้องมีคนจำได้ในอีกหลายสัปดาห์**
--    · และ `E7` เป็นเฟสที่ *"เงื่อนไขเดียวที่อนุญาตให้ merge เข้า `main`"* — เฟสที่แย่ที่สุดที่จะไปเจอเซอร์ไพรส์
--
-- ── สิ่งที่เปลี่ยน: หนึ่งเงื่อนไข ────────────────────────────────────────────
--   `relkind = 'r'`  →  `relkind in ('r', 'p')`
--
-- ⚠️ **ไม่เปลี่ยนรูปที่คืน** — ยังเป็น `table (table_name text)` เหมือนเดิม
--    เคส `readOnlyCoverage.test.ts` ของ P4 (`44088f8`) **ไม่ต้องแก้สักบรรทัด และยังต้องเขียวเหมือนเดิม**
--    (วันนี้ไม่มีตาราง partitioned ในฐาน → ผลลัพธ์เท่าเดิมเป๊ะ · การเปลี่ยนนี้เป็น *ขอบเขต* ไม่ใช่ *ผลลัพธ์*)
--
-- 📌 **partition ลูกไม่ต้องกังวล** — trigger แบบ `for each row` บนตาราง partitioned
--    ถูก clone ลงทุก partition โดย Postgres เอง · ลูกเป็น `relkind='r'` อยู่แล้วและจะเห็นว่ามี guard
--
-- 🔴 **สิ่งที่ยังไม่ปิด และต้องไม่ถูกอ่านว่าปิดแล้ว:**
--    `[]` ยังแยกไม่ออกระหว่าง *"ครอบครบ"* กับ *"ตัวไล่ตารางเองพัง"* — control ของ P4
--    (`table_exposure` เห็น public table > 20) ยืนยันได้แค่ว่า **จักรวาลไม่ว่าง**
--    ตัวที่ airtight จริงต้องมีตารางที่ *จงใจ* ไม่ติด guard ให้ฟังก์ชันเจอ **ซึ่งแปลว่าต้องมีรูจริง
--    ค้างไว้ในฐานถาวรเพื่อทดสอบว่าเราหารูเจอ** — ยังไม่คุ้ม และเราตัดสินร่วมกันแล้วว่ายังไม่ทำ
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   คืนเงื่อนไขเป็น `c.relkind = 'r'` (ดู `20260827180000` สำหรับฉบับเดิม)
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

create or replace function app.read_only_uncovered_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.relname::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     -- 🔴 `'p'` = partitioned · ฉบับแรกกรองแต่ `'r'` → ตาราง partitioned ที่ไม่ติด guard
     --    จะไม่โผล่ในผลลัพธ์เลย และ `[]` จะอ่านว่าปลอดภัย
     and c.relkind in ('r', 'p')
     and not exists (
       select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = c.oid
          and t.tgname  = 'zz_read_only_guard'
          and not t.tgisinternal
     )
   order by c.relname
$$;

comment on function app.read_only_uncovered_tables() is
  'ตารางใน public ที่ไม่มี trigger zz_read_only_guard = เขียนได้ตอนโหมด read-only เปิด '
  'ต้องคืนศูนย์แถวเสมอ · ครอบทั้ง relkind r (ตารางธรรมดา) และ p (partitioned) '
  'ตารางใหม่ทุกใบต้องติด guard ในไฟล์ migration ของตัวเอง (ลูปติด guard รันครั้งเดียว ไม่มี event trigger)';

commit;
