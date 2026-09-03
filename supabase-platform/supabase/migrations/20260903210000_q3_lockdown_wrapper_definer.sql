-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ข้อยกเว้นที่ 7 (ต่อ ②) — wrapper ต้องเป็น `security definer` ถึงจะข้าม schema ได้ ║
-- ║ P1 · 3 ก.ย. 2026 · **ชั้นที่สามของเรื่องเดียวกัน**                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ## สามชั้นที่ต้องผ่านพร้อมกัน — ผมแก้ทีละชั้นและคิดว่าจบทุกครั้ง
-- ```
-- ชั้น ① สิทธิ์เรียกฟังก์ชัน   grant execute on app.…            20260903160000  ← ผมคิดว่าจบ
-- ชั้น ② เส้นทาง REST         wrapper ใน public                  20260903200000  ← P6 ยิงแล้วเจอ PGRST202
-- ชั้น ③ ข้าม schema          security definer                   ไฟล์นี้         ← ยิงแล้วได้ 42501
--                            "permission denied for schema app"
-- ```
-- 🔴 **แต่ละชั้นแก้แล้วดูเหมือนจบ — และไม่มีชั้นไหนบอกว่ายังมีชั้นถัดไป**
-- 🎯 **ตัวที่พาไปถึงชั้นสุดท้ายคือ *การยิงจริงทุกครั้ง* ไม่ใช่การอ่านโค้ดให้ละเอียดขึ้น**
--    ชั้น ② เจอเพราะ P6 ยิงจาก CI · ชั้น ③ เจอเพราะผมยิง `curl` เป็น RPC จริงหลังลงชั้น ②
--    · ⚠️ ถ้าผมหยุดที่ *"migration ผ่าน + `has_function_privilege` = true"* **ผมจะส่งมอบของที่เรียกไม่ได้เป็นรอบที่สาม**
--
-- ## ทำไม `security definer` ปลอดภัยพอในรูปนี้ — และทำไมยังต้องระวัง
-- · เป็นรูปเดียวกับ **ข้อยกเว้นที่ 6** เป๊ะ (`20260827200000:62-70`) ซึ่งอนุมัติและใช้งานอยู่แล้ว
-- · ฟังก์ชัน **ไม่รับพารามิเตอร์** ⇒ ไม่มีอินพุตให้ใครใส่อะไรเข้ามา
-- · `set search_path = ''` ⇒ กัน search-path hijack
-- · `revoke all` แล้ว `grant execute to service_role` **ตัวเดียว** ⇒ ไคลเอนต์เรียกไม่ได้
-- · **ไม่คืนค่า** ⇒ ไม่มีข้อมูลรั่วออกทางค่าคืน · โยน exception อย่างเดียว
-- 🔴 **ที่ต้องระวัง: `security definer` รันด้วยสิทธิ์เจ้าของ — นั่นคือประตูที่ `E3` เขียนไว้เองว่ายังเปิดอยู่**
--    (ข้อยกเว้นที่ 4: *"ประตู `security definer` ยังเปิดอยู่ · trigger ยังจำเป็นทุกตัวอักษร"*)
--    ⇒ **ทุก `security definer` ต้องอยู่ในทะเบียนพินของ `schemaPins`** — แจ้ง P4 แล้ว

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์ — ต้องเป็น plan-korea-platform/pmvxwcimjebogjfimzqy/dev'; end if;
end $guard$;

create or replace function public.assert_cache_lockdown() returns void
language sql
security definer            -- 🔴 จำเป็น: `app` ไม่ได้ grant usage ให้ `service_role` (รูปเดียวกับข้อยกเว้นที่ 6)
set search_path = ''
as $$
  select app.assert_cache_lockdown();
$$;

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
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'assert_cache_lockdown' and p.prosecdef
  ) then
    raise exception '🔴 wrapper ไม่ใช่ security definer — จะข้าม schema app ไม่ได้';
  end if;
  perform public.assert_cache_lockdown();
  raise notice 'ข้อยกเว้นที่ 7 (ต่อ ②): wrapper เป็น security definer · เรียกผ่านได้จริง';
end $verify$;

commit;
