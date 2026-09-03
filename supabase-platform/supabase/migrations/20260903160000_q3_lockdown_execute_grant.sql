-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ข้อยกเว้นที่ 7 — `grant execute on app.assert_cache_lockdown() to service_role` ║
-- ║ P6 เจอ · P1 อนุมัติ · 3 ก.ย. 2026                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ## ทำไม
-- `20260903120000` สร้าง `app.assert_cache_lockdown()` แล้ว `revoke all … from public`
-- **โดยไม่มี `grant execute` คู่กัน** → วัดแล้ว `has_function_privilege('service_role', …) = false`
-- ⇒ **ไม่มีใครนอกจากเจ้าของเรียกได้เลย** · cron ของ `Q3` ก้าวที่ 2 (ถือ `service_role`) จะใช้เป็น post-check ไม่ได้
--
-- 🔴 **นี่คือความผิดพลาดซ้ำรอยที่ `TEAM.md` จดไว้เอง (ข้อยกเว้นที่ 6 · `P-50`):**
--    *"ฟังก์ชันที่ไม่มีใครเรียกได้ ไม่ใช่ด่าน มันคือโค้ดที่ตายแล้ว"*
--    · ข้อยกเว้นที่ 6 เกิดกับ `app.read_only_uncovered_tables()` ด้วยเหตุผลเดียวกันเป๊ะ
--    · 🎯 **P1 เขียนบทเรียนนั้นลงกติกาเอง แล้วทำซ้ำในไฟล์ถัดมาไม่ถึงวัน**
--
-- ⚠️ **เหตุผลที่ P6 ให้ไม่ตรงทั้งหมด และจดไว้เพื่อไม่ให้ยกไปใช้ผิด:**
--    เขาบอกว่า *"ฟังก์ชันอื่นทุกตัวในแพทเทิร์นเดียวกันมี grant คู่กันเสมอ"* — **วัดแล้วไม่จริง**
--    `deny_write_when_read_only` · `mode_is_active` · `read_only_uncovered_tables` · `write_is_blocked`
--    ทั้งหมด `service_role=false` · ตัวที่ `true` ส่วนใหญ่เป็น **trigger function** ซึ่งคนละหน้าที่
--    🎯 **ข้อสรุปเขาถูก (เรียกไม่ได้จริง) แต่เหตุผลผิด** — ถ้ารับเหตุผลไปด้วยจะได้กฎที่ผิด
--
-- ## ขอบเขต — แคบที่สุดเท่าที่เป็นไปได้
-- ให้สิทธิ์ **เรียกฟังก์ชันตัวเดียว** ที่:
--   · ไม่รับพารามิเตอร์  · `security invoker`  · ไม่แตะข้อมูลผู้ใช้สักแถว
--   · อ่านเฉพาะ `pg_policies` + `has_table_privilege()` + นับแถวใน `catalog_places`/`place_details_cache`
--   · **ไม่คืนค่าอะไรเลย** — มีแต่ `raise exception` เมื่อพบการละเมิด
-- 🔴 **ไม่ให้สิทธิ์บนตารางใด ๆ เพิ่มสักตัว** — รูปเดียวกับข้อยกเว้นที่ 6 ทุกประการ
--
-- ⚠️ `service_role` มี `BYPASSRLS` อยู่แล้ว → ข้อนี้ **ไม่ได้เปิดอะไรที่มันเข้าไม่ถึงอยู่แล้ว**
--    **แต่ "ไม่เพิ่มความเสี่ยง" ไม่ใช่เหตุผลที่จะไม่จด** — จดเพื่อให้นับได้ว่าวันนี้ `service_role` ทำอะไรได้บ้าง

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์ — ต้องเป็น plan-korea-platform/pmvxwcimjebogjfimzqy/dev'; end if;
end $guard$;

grant execute on function app.assert_cache_lockdown() to service_role;

do $verify$
begin
  -- ทิศบวก: ต้องเรียกได้จริงหลัง grant
  if not has_function_privilege('service_role', 'app.assert_cache_lockdown()', 'EXECUTE') then
    raise exception '🔴 grant ไม่ติด — service_role ยังเรียก assert_cache_lockdown() ไม่ได้';
  end if;
  -- 🔴 ทิศลบ: ห้ามเผลอเปิดให้ฝั่งไคลเอนต์ไปด้วย
  if has_function_privilege('authenticated', 'app.assert_cache_lockdown()', 'EXECUTE')
  or has_function_privilege('anon', 'app.assert_cache_lockdown()', 'EXECUTE') then
    raise exception '🔴 ไคลเอนต์เรียก assert_cache_lockdown() ได้ — ข้อยกเว้นที่ 7 ให้เฉพาะ service_role';
  end if;
  raise notice 'ข้อยกเว้นที่ 7: service_role เรียกได้ · ไคลเอนต์เรียกไม่ได้';
end $verify$;

commit;
