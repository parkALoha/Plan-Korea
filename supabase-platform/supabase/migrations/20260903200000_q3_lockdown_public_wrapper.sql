-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ข้อยกเว้นที่ 7 (ต่อ) — ทางเรียกใน `public` ให้ `assert_cache_lockdown()`   ║
-- ║ P6 เจอ · P1 แก้ · 3 ก.ย. 2026                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ## 🔴 `grant execute` อย่างเดียวไม่พอ — และผมทำผิดซ้ำรอยที่ตัวเองเพิ่งจดไปเมื่อไม่กี่ชั่วโมง
-- `20260903160000` ให้ `grant execute on function app.assert_cache_lockdown() to service_role`
-- **สิทธิ์นั้นถูกต้องและมีผลจริงในระดับ SQL** — แต่ P6 ยิงจาก CI แล้วได้:
-- ```
-- Could not find the function public.assert_cache_lockdown … in the schema cache
-- ```
-- 🎯 **`app` ไม่ถูก expose ผ่าน PostgREST โดยตั้งใจ** (`guards.sh` ยืนยันข้อนี้เองอยู่แล้ว)
--    ⇒ **`grant` เปิดชั้น *สิทธิ์* · ไม่ได้เปิดชั้น *เส้นทาง* — คนละชั้นกัน**
--
-- 🔴 **และข้อยกเว้นที่ 6 แก้ปัญหานี้ไปแล้วด้วยรูปเดียวกันเป๊ะ**
-- (`20260827200000_e3_read_only_coverage_rpc.sql:68-80`) — สร้าง wrapper ใน `public`
-- ที่เรียก `app.…()` ต่อ แล้ว `revoke all` + `grant execute to service_role`
-- · ⚠️ **ผมเขียน `20260903160000` โดยอ้างข้อยกเว้นที่ 6 เป็นแบบอย่าง แล้วลอกมาครึ่งเดียว**
--   — ลอก `grant` มา **แต่ไม่ได้ลอก wrapper ซึ่งเป็นครึ่งที่ทำให้มันเรียกได้จริง**
-- 🎯 ***"ฟังก์ชันที่ไม่มีใครเรียกได้ ไม่ใช่ด่าน มันคือโค้ดที่ตายแล้ว" — ผมจดประโยคนี้เองใน
--    `20260903160000` แล้วส่งมอบของที่ยังเรียกไม่ได้ในไฟล์เดียวกัน***
--   · **ตัวที่จับได้คือ P6 ยิงจริงจาก CI** ไม่ใช่ผมอ่านซ้ำ · **ไม่มีด่านใบไหนถามว่า "เรียกได้ไหม"**
--
-- ## ขอบเขต — ไม่ขยายสิทธิ์เกินข้อยกเว้นที่ 7 เดิมแม้แต่นิดเดียว
-- · wrapper **ไม่รับพารามิเตอร์ · ไม่คืนค่า · เรียกต่อฟังก์ชันเดิมตัวเดียว**
-- · `revoke all from public, anon, authenticated` ก่อน แล้ว `grant execute to service_role` เท่านั้น
-- · 🔴 **ไม่แตะสิทธิ์บนตารางใด ๆ** · `security invoker` ⇒ ผู้เรียกยังต้องมีสิทธิ์ของตัวเอง

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์ — ต้องเป็น plan-korea-platform/pmvxwcimjebogjfimzqy/dev'; end if;
end $guard$;

create or replace function public.assert_cache_lockdown() returns void
language sql security invoker set search_path = '' as $$
  select app.assert_cache_lockdown();
$$;

comment on function public.assert_cache_lockdown() is
  'ทางเรียกของ app.assert_cache_lockdown() สำหรับ cron ของ Q3 ก้าวที่ 2 (PostgREST expose แต่ public) '
  'ไม่คืนค่า — โยน exception เมื่อสิทธิ์บนแคชเกินที่ประกาศไว้ '
  'ข้อยกเว้น service_role ที่ 7 ใน TEAM.md · ไม่รับ input · ไม่แตะข้อมูลผู้ใช้';

-- 🔴 ลำดับสำคัญ: `revoke` ก่อน `grant` เสมอ · ระบุ role ทีละตัว ไม่เหมา
revoke all on function public.assert_cache_lockdown() from public, anon, authenticated;
grant execute on function public.assert_cache_lockdown() to service_role;

do $verify$
begin
  if not has_function_privilege('service_role', 'public.assert_cache_lockdown()', 'EXECUTE') then
    raise exception '🔴 service_role เรียก wrapper ไม่ได้';
  end if;
  if has_function_privilege('authenticated', 'public.assert_cache_lockdown()', 'EXECUTE')
  or has_function_privilege('anon', 'public.assert_cache_lockdown()', 'EXECUTE') then
    raise exception '🔴 ไคลเอนต์เรียก wrapper ได้ — ข้อยกเว้นที่ 7 ให้เฉพาะ service_role';
  end if;
  -- ทิศบวก: เรียกผ่าน wrapper แล้วต้องทำงานจริง (ไม่ใช่แค่มีอยู่)
  perform public.assert_cache_lockdown();
  raise notice 'ข้อยกเว้นที่ 7 (ต่อ): wrapper ใน public เรียกได้ · ไคลเอนต์เรียกไม่ได้';
end $verify$;

commit;
