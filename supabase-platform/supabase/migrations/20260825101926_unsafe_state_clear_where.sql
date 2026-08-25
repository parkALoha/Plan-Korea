-- ═══════════════════════════════════════════════════════════════════════════
-- `unsafe_state_clear()` ลบไม่ได้จริง — Supabase บล็อก DELETE ที่ไม่มี WHERE
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 **อาการ:** เรียก RPC สำเร็จ ไม่มี error ในสายตาคนเรียกทั่วไป **แต่ไม่ลบอะไรเลย**
--   ```
--   admin.rpc("unsafe_state_clear")
--     → 21000  "DELETE requires a WHERE clause"   (HTTP 400)
--   ```
--   Supabase เปิด **`safeupdate`** ไว้กับ role ของ PostgREST → `delete`/`update` ที่ไม่มี `where` ถูกปฏิเสธ
--
-- 🎯 **และนี่คือครั้งที่สามของวันนี้ที่ของถูกเขียน · ถูก push · แล้วไม่ทำงานในเส้นทางที่ใช้จริง**
--   ① `app.unsafe_state` อ่านจาก harness ไม่ได้ (`P-50` · P4 จับ)
--   ② `grant insert, delete` ที่ไม่ช่วยอะไรเพราะปัญหาไม่ใช่เรื่องสิทธิ์ (`P-37` · P1 จับเอง)
--   ③ ข้อนี้ — `delete` ที่ไม่มี `where`
--   🔴 **ต่างกันตรงที่ครั้งนี้จับได้ก่อนส่งให้ P4 เพราะยืนยันปลายทางจริงก่อน ไม่ใช่เพราะอ่านซ้ำ**
--      **ทั้งสามครั้ง การอ่านโค้ดซ้ำจะไม่เจอสักครั้งเดียว**
--
-- ⚠️ **จุดที่หลอกที่สุด:** `unsafe_state_set` **ทำงานได้ปกติ** → เห็นว่าเขียนได้ก็เชื่อว่าลบได้
--   **ครึ่งที่ทำงาน ทำให้ครึ่งที่ไม่ทำงานดูเหมือนทำงาน**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   ไม่ต้องถอย — ไฟล์นี้แก้ฟังก์ชันให้ทำงานได้ตามที่ตั้งใจตั้งแต่แรกเท่านั้น
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
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ฐานนี้ไม่ใช่ engine-dev';
end $guard$;

create or replace function public.unsafe_state_clear()
returns void
language sql
security definer
set search_path = ''
as $$
  -- `where singleton` เป็นจริงกับทุกแถวที่มีอยู่ได้ (คอลัมน์มี check ว่าต้องเป็น true)
  -- ใส่ไว้เพราะ `safeupdate` ไม่ใช่เพราะต้องกรอง — ตารางนี้มีแถวเดียวเสมอ
  delete from app.unsafe_state where singleton;
$$;

commit;
