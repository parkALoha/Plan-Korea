-- ═══════════════════════════════════════════════════════════════════════════
-- `function_exposure` เพิ่มคอลัมน์ `kind` — ตอบว่า "เรียกตรงได้ไหม" **โดยไม่ต้องเรียกมัน**
-- เจ้าของ: P1-Lead · 5 ก.ย. 2026 · **P4 ขอ หลังเจอฟังก์ชันที่เขาไม่กล้ายิง**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 🔴 ที่มา — P4 ชนเพดานของวิธีเดิมภายในการวัดครั้งแรก
--   การวัดครั้งแรกบน engine-dev เจอ `public.rls_auto_enable` ที่ **`PUBLIC` มี `EXECUTE`**
--   และ **ไม่มีใน migration ของเราสักไฟล์** (`grep` = 0 · ไม่มีในประวัติ git ของทั้งสองทรี)
--
--   🔴 **P4 หยุด ไม่ยิงมัน — และนั่นคือการตัดสินใจที่ถูก:**
--   ชื่อมันบอกว่า *"เปิด RLS อัตโนมัติ"* ⇒ ถ้าทำงานจริงมัน **แก้สภาพของตาราง**
--   · เปิด RLS บนตารางที่ไม่มี policy = **ไม่มีใครอ่านตารางนั้นได้อีกเลย**
--   🎯 ***สำหรับฟังก์ชันที่เขียนฐาน "ทดสอบว่าเรียกได้ไหม" กับ "เรียกมัน" เป็นสิ่งเดียวกัน — ไม่มี dry run***
--
--   · 📌 ผมเคยตอบคำถามนี้กับ `app.*` 10 ตัวด้วยการ **ลองเรียกดู** (ได้ `trigger functions can only
--     be called as triggers`) — **ได้ผลเพราะบังเอิญมันเป็น trigger**
--     🔴 ***ถ้าใบไหนไม่ใช่ trigger ผมจะได้รู้ด้วยการรันมัน*** ⇒ วิธีนั้นมีเพดาน และเราชนแล้ว
--
-- ## สิ่งที่เพิ่ม: คอลัมน์ `kind` — มาจาก `prokind` + ชนิดค่าส่งกลับ
--   ```
--   'trigger'        ฟังก์ชันของ trigger        → **เรียกตรงไม่ได้** (Postgres ปฏิเสธเอง)
--   'event_trigger'  ฟังก์ชันของ event trigger  → **เรียกตรงไม่ได้**
--   'aggregate' · 'window' · 'procedure'        → เรียกแบบฟังก์ชันธรรมดาไม่ได้
--   'normal'         ฟังก์ชันปกติ               → **เรียกได้ ถ้ามีสิทธิ์ + USAGE**
--   ```
--   ⇒ ***ตอบ "ตัวนี้เรียกตรงไม่ได้อยู่แล้ว" ได้โดยไม่ต้องมีใครเสี่ยงเรียกมัน***
--   · 🔴 **`kind` ไม่ได้แปลว่าปลอดภัย** — `normal` ที่ไม่มีใครควรเรียก ก็ยังเป็นปัญหา
--     มันแค่ทำให้ **แยกใบที่ต้องสืบต่อ ออกจากใบที่ปิดคดีได้ทันที**
--
-- ## ⚠️ ทำไมต้องเป็นไฟล์ใหม่ ไม่แก้ `20260905000000`
--   ใบนั้น **ลงฐานไปแล้ว** ⇒ แก้เนื้อจะไม่มีวันรัน (บทเรียน `base_timezone` 4 ก.ย.)
--   · และ `create or replace` **เปลี่ยนชนิดค่าส่งกลับไม่ได้** ⇒ ต้อง `drop` ก่อน
--     🔴 `drop` แล้ว `grant` หายไปด้วย — **ต้อง grant ใหม่ในไฟล์นี้** (assert ท้ายไฟล์บังคับ)
--
-- ## rollback
--   ถอยกลับไปใช้ฉบับ 5 คอลัมน์ของ `20260905000000` — ผู้เรียกที่อ่านด้วยชื่อคอลัมน์ไม่พัง
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่ใช่ engine-dev';
  end if;
end $guard$;

drop function if exists public.function_exposure(text[]);

create or replace function public.function_exposure(p_schemas text[])
returns table (
  schema_name   text,
  function_name text,
  args          text,
  kind          text,
  grantee       text,
  privilege     text
)
language sql
stable
security definer
set search_path = ''
as $$
  with ns as (
    select n.oid, n.nspname::text as sch, n.nspowner, n.nspacl
      from pg_catalog.pg_namespace n
     where n.nspname = any(p_schemas)
  ),
  f as (
    select p.oid, n.sch, p.proname::text as fn,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
           p.proowner, p.proacl,
           -- 🔴 ลำดับสำคัญ: เช็คชนิดค่าส่งกลับ **ก่อน** `prokind`
           --    ฟังก์ชันของ trigger มี `prokind = 'f'` เหมือนฟังก์ชันปกติ — แยกได้ที่ค่าส่งกลับเท่านั้น
           --    ⇒ สลับลำดับเมื่อไหร่ trigger จะถูกรายงานว่า `normal` = **คำตอบผิดในทิศที่อันตราย**
           case
             when p.prorettype = 'pg_catalog.trigger'::regtype       then 'trigger'
             when p.prorettype = 'pg_catalog.event_trigger'::regtype then 'event_trigger'
             when p.prokind = 'a' then 'aggregate'
             when p.prokind = 'w' then 'window'
             when p.prokind = 'p' then 'procedure'
             else 'normal'
           end as kind
      from pg_catalog.pg_proc p
      join ns n on n.oid = p.pronamespace
  ),
  d_missing as (
    select q.name, null::text, null::text, null::text, ''::text,
           'ไม่มี schema ชื่อนี้ — พิมพ์ผิด/ยังไม่ลง'::text
      from unnest(p_schemas) as q(name)
     where not exists (select 1 from ns where ns.sch = q.name)
  ),
  -- แถวระดับ schema — `USAGE` · ไม่มี `kind` เพราะไม่ใช่ฟังก์ชัน
  d_usage as (
    select ns.sch, null::text, null::text, null::text,
           case when a.grantee = 0 then 'PUBLIC'
                else pg_catalog.pg_get_userbyid(a.grantee) end,
           a.privilege_type::text
      from ns
      cross join lateral aclexplode(
        coalesce(ns.nspacl, pg_catalog.acldefault('n', ns.nspowner))) a
     where a.privilege_type = 'USAGE'
       and (a.grantee = 0 or a.grantee <> ns.nspowner)
  ),
  d_grant as (
    select f.sch, f.fn, f.args, f.kind,
           case when a.grantee = 0 then 'PUBLIC'
                else pg_catalog.pg_get_userbyid(a.grantee) end,
           a.privilege_type::text
      from f
      cross join lateral aclexplode(
        coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) a
     where a.grantee = 0 or a.grantee <> f.proowner
  )
  select * from d_missing
  union all
  select * from d_usage
  union all
  select * from d_grant
  order by 1, 2 nulls first, 3, 5, 6;
$$;

-- 🔴 `drop` ทำให้ grant หายไปด้วย — ต้องตั้งใหม่ทั้งชุด
revoke all on function public.function_exposure(text[]) from public, anon, authenticated;
grant execute on function public.function_exposure(text[]) to service_role;

do $assert$
declare n int;
begin
  -- ① สิทธิ์กลับมาครบหลัง drop (เคสควบคุมทั้งสองทิศ)
  if not has_function_privilege('service_role', 'public.function_exposure(text[])', 'EXECUTE') then
    raise exception 'assert ล้ม: service_role เรียกไม่ได้หลัง drop — ลืม grant ใหม่';
  end if;
  if has_function_privilege('anon', 'public.function_exposure(text[])', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียกได้หลัง drop — revoke ไม่ครบ';
  end if;

  -- ② 🔴 **ทิศบวกของคอลัมน์ใหม่** — ต้องแยก trigger ออกจาก normal ได้จริง
  --    `app.touch_updated_at` เป็นฟังก์ชันของ trigger ที่เรารู้จักดี
  select count(*) into n from public.function_exposure(array['app'])
   where function_name = 'touch_updated_at' and kind = 'trigger';
  if n = 0 then
    raise exception 'assert ล้ม: ไม่รู้จัก trigger — `kind` จะรายงาน trigger ว่า normal (ผิดในทิศอันตราย)';
  end if;

  -- ③ และต้องมี `normal` อยู่จริงด้วย — ไม่งั้น `kind` อาจตอบ 'trigger' ให้ทุกใบ
  select count(*) into n from public.function_exposure(array['public'])
   where function_name = 'function_exposure' and kind = 'normal';
  if n = 0 then
    raise exception 'assert ล้ม: `kind` ไม่รายงาน normal — ตัวมันเองก็เป็น normal';
  end if;

  -- ④ แถว USAGE ยังอยู่ (ไม่หายไปตอนเพิ่มคอลัมน์)
  select count(*) into n from public.function_exposure(array['public'])
   where function_name is null and privilege = 'USAGE';
  if n = 0 then
    raise exception 'assert ล้ม: แถว USAGE หายไปหลังเพิ่มคอลัมน์';
  end if;
end $assert$;

commit;
