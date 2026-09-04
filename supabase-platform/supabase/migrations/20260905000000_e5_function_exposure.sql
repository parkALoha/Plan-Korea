-- ═══════════════════════════════════════════════════════════════════════════
-- `function_exposure` — ถามฐานว่า **ฟังก์ชันไหนถูก grant ให้ใคร**
-- เจ้าของ: P1-Lead · 5 ก.ย. 2026 · **P4 ขอ** (เขาเจอว่าทะเบียนไม่มีอะไรเทียบ แล้วเสนอทางแก้เป็นสองใบ)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 🔴 ทำไมต้องมี — ทะเบียน `service_role` ใน `TEAM.md §3.5` **ไม่มีอะไรเทียบกับความจริงเลย**
--   `§3.5` เขียนเองว่า *"`service_role` มี **BYPASSRLS** ⇒ `grant` คือด่านสุดท้ายที่เหลือ"*
--   แต่ 9 ข้อในทะเบียนนั้น **ไม่มีเคสไหนเทียบกับ ACL จริงสักใบ** (P4 ไล่แล้ว)
--   🎯 ***ทะเบียนที่ไม่มีอะไรเทียบกับความจริงได้ ไม่ใช่ทะเบียน — มันคือแหล่งความจริงใบที่สอง***
--      และนี่คือทะเบียนของ role ที่ **ข้าม RLS** ⇒ เป็นใบที่ควรถูกเฝ้าที่สุดในบรรดาทั้งหมด
--
--   · `table_exposure` ครอบ **ตาราง** (`pg_class.relacl`) — ครึ่งหนึ่งของทะเบียนเป็น `grant execute`
--     บน **ฟังก์ชัน** (~25 ใบ) ซึ่ง **ไม่มีเส้นทาง introspection เลย** ⇒ ทดสอบจากฝั่ง JS ไม่ได้
--   · 🔴 **และวัดจากไฟล์แทนไม่ได้**: `grep 'grant … service_role'` ได้ **55 คำสั่ง** ซึ่งรวม
--     *string literal ใน `raise exception`* ⇒ **สตริงไม่ใช่สัญลักษณ์** (`§3.4`)
--
-- ## 🔴 คุณสมบัติที่สำคัญที่สุดของใบนี้: **`proacl = NULL` แปลว่า PUBLIC เรียกได้**
--   Postgres ให้ `EXECUTE` แก่ `PUBLIC` เป็นค่าเริ่มต้นของฟังก์ชัน — **ต่างจากตารางที่ปิดโดยปริยาย**
--   ⇒ ฟังก์ชันที่ *ลืม* `revoke all … from public` **เปิดให้ทุกคนรวม `anon` โดยไม่มีบรรทัดไหนพูดถึงมันเลย**
--   🎯 ***บรรทัดที่หายไป ไม่ปรากฏใน `git diff` — นี่คือรูปที่ `grep` มองไม่เห็นตามนิยาม***
--   · ⇒ ใช้ `acldefault('f', proowner)` เมื่อ `proacl` เป็น null **จึงจำเป็น ไม่ใช่ความละเอียด**
--     ไม่งั้นฟังก์ชันที่เปิดกว้างที่สุดในระบบ จะเป็นฟังก์ชันที่ตัวตรวจนี้ **ไม่รายงานเลย**
--
-- ## ขอบเขต — ตัวนี้ **รายงาน** ไม่ได้ **บังคับ**
--   คืนเมตาดาต้าอย่างเดียว · ไม่มี DML · ไม่แตะข้อมูลผู้ใช้สักไบต์ · ไม่ได้เปิดประตูบานไหนให้ใคร
--   · ด่านที่ใช้ผลของมันเป็นงานของ P4 (ใบที่สอง) — **ใบนี้แค่ทำให้เขาวัดได้**
--   · 🔴 **ห้ามเขียนด่านที่ครอบแค่ตาราง แล้วเรียกว่าเฝ้าทะเบียนทั้งใบ** (P4 ยืนยันข้อนี้เอง)
--     ***ด่านที่ครอบครึ่งเดียวของทะเบียน อ่านเหมือนทะเบียนถูกเฝ้าทั้งใบ — แย่กว่าไม่มีด่าน***
--
-- ## rollback
--   `drop function public.function_exposure(text[]);` — ไม่มีอะไรอ้างถึงมันนอกจากเคสทดสอบ
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
           p.proowner, p.proacl
      from pg_catalog.pg_proc p
      join ns n on n.oid = p.pronamespace
  ),
  -- 🔴 ชื่อ schema ที่ resolve ไม่ได้ **ต้องส่งเสียง** — รูปเดียวกับแถว `MISSING` ของ `table_exposure`
  --    ไม่งั้นพิมพ์ schema ผิด → ได้ผลว่าง → **อ่านเป็น "ไม่มีอะไรเปิด"**
  -- ⚠️ **แก้ 5 ก.ย. 2026**: ฉบับแรกเช็คจาก `f` (ตารางฟังก์ชัน) ⇒ ***schema ที่มีอยู่จริงแต่ไม่มีฟังก์ชันเลย
  --    จะถูกรายงานว่า `MISSING`*** ซึ่งเป็นคำโกหกคนละแบบกับที่ตั้งใจกัน · เช็คจาก `ns` แทน
  d_missing as (
    select q.name, null::text, null::text, ''::text,
           'ไม่มี schema ชื่อนี้ — พิมพ์ผิด/ยังไม่ลง'::text
      from unnest(p_schemas) as q(name)
     where not exists (select 1 from ns where ns.sch = q.name)
  ),
  /**
   * 🔴 **สิทธิ์ `USAGE` ของ schema — P4 ขอ และเขาถูก**
   * ผมเขียนถึงเขาเองว่า *"`PUBLIC execute` ไม่มีผลถ้าไม่มี `USAGE` บน schema — ต้องตรวจคู่กันเสมอ"*
   * **แล้วส่งเครื่องมือที่พูดถึง `USAGE` ไม่ได้เลยให้เขาไปใช้**
   * 🎯 ***ระบุการจับคู่ได้ถูกต้อง แล้วสร้างเครื่องมือที่ตอบได้ครึ่งเดียวของการจับคู่นั้น***
   *
   * 🔴 **ผลถ้าไม่มีแถวนี้**: ด่านที่สร้างบนมันจะแดงใส่ `app.*` ~10 ตัวที่ `PUBLIC | EXECUTE`
   *    ทั้งที่ **ไม่มี `USAGE` บน `app` ⇒ เรียกไม่ได้อยู่แล้ว** ⇒ ***แดงใส่ของที่ทำถูก***
   *    และ `§3.4` บอกว่ากลไกแบบนั้น **จะถูกลบทั้งใบ พร้อมของที่มันเคยกันไว้**
   * · ⚠️ ทางที่ผิดคือให้ผู้เรียกยกเว้น `app.*` ทิ้ง — **นั่นคือตัดคำถามออกเพื่อให้เขียว**
   *   และมันจะกลืน *ฟังก์ชันใน `app` ที่วันหนึ่งเข้าถึงได้จริง* ไปด้วย
   *
   * รูปแถว: `function_name` และ `args` เป็น `null` · `privilege = 'USAGE'`
   * ⇒ ผู้เรียกคำนวณเองได้: ***เรียกได้ ก็ต่อเมื่อ (มี EXECUTE) **และ** (มี USAGE บน schema นั้น)***
   * · 🔴 `acldefault('n', nspowner)` สำคัญเท่ากับฝั่งฟังก์ชัน — `coalesce(nspacl,'{}')` เมื่อไหร่
   *   **จะได้ปัญหาเดียวกันที่ย้ายมาอีกชั้น** (P4 ชี้)
   */
  d_usage as (
    select ns.sch, null::text, null::text,
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
    select f.sch, f.fn, f.args,
           case when a.grantee = 0 then 'PUBLIC'
                else pg_catalog.pg_get_userbyid(a.grantee) end,
           a.privilege_type::text
      from f
      -- 🔴 `acldefault('f', …)` เมื่อ `proacl` เป็น null — **ค่าเริ่มต้นของฟังก์ชันคือ `EXECUTE` ให้ `PUBLIC`**
      --    ⇒ ฟังก์ชันที่ลืม `revoke all … from public` จะโผล่ที่นี่เป็น `PUBLIC | EXECUTE`
      --    **ถ้าใช้ `coalesce(proacl, '{}')` แทน ฟังก์ชันที่เปิดกว้างที่สุดจะหายไปเงียบ ๆ**
      cross join lateral aclexplode(
        coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) a
      -- เจ้าของเรียกฟังก์ชันตัวเองได้เป็นเรื่องปกติ — ไม่ใช่ "ประตู" · แต่ `PUBLIC` (grantee = 0) ต้องรายงานเสมอ
     where a.grantee = 0 or a.grantee <> f.proowner
  )
  select * from d_missing
  union all
  select * from d_usage
  union all
  select * from d_grant
  order by 1, 2 nulls first, 3, 4, 5;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- สิทธิ์ — `service_role` เท่านั้น (รูปเดียวกับ `table_exposure`)
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 `revoke from public` **ก่อน** grant — ไม่ใช่พิธีกรรม: ค่าเริ่มต้นของฟังก์ชันคือ `PUBLIC` เรียกได้
--    ⇒ ***ฟังก์ชันที่ตรวจว่าใครเรียกอะไรได้ ถ้าลืมบรรทัดนี้ จะเป็นตัวอย่างของสิ่งที่มันตรวจเอง***
revoke all on function public.function_exposure(text[]) from public, anon, authenticated;
grant execute on function public.function_exposure(text[]) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- assert
-- ───────────────────────────────────────────────────────────────────────────
do $assert$
declare n int;
begin
  -- ① ไคลเอนต์เรียกไม่ได้ทั้งสอง role (ตัวนี้อ่าน ACL ของทั้งระบบ — ไม่ใช่ของที่ไคลเอนต์ควรเห็น)
  if has_function_privilege('anon', 'public.function_exposure(text[])', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก function_exposure ได้';
  end if;
  if has_function_privilege('authenticated', 'public.function_exposure(text[])', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก function_exposure ได้';
  end if;

  -- ② เคสควบคุมฝั่งบวก — ไม่มีข้อนี้ การ revoke ทุกอย่างทิ้งจะผ่าน ① เหมือนกันเป๊ะ
  if not has_function_privilege('service_role', 'public.function_exposure(text[])', 'EXECUTE') then
    raise exception 'assert ล้ม: service_role เรียกไม่ได้ — ตัวตรวจใช้ไม่ได้เลย';
  end if;

  -- ③ 🔴 **ทิศบวกของตัวมันเอง — มันต้องเห็นของจริง ไม่ใช่คืนว่าง**
  --    `list_public_destinations` เปิดให้ `anon` (ทะเบียนข้อ 9) ⇒ ต้องโผล่ในผลลัพธ์
  --    ถ้าไม่โผล่ = ตัวตรวจนี้มองไม่เห็นสิ่งที่มันมีหน้าที่มอง ⇒ **ผลว่างจะถูกอ่านผิดตลอดไป**
  select count(*) into n
    from public.function_exposure(array['public'])
   where function_name = 'list_public_destinations' and grantee = 'anon' and privilege = 'EXECUTE';
  if n = 0 then
    raise exception 'assert ล้ม: function_exposure มองไม่เห็น grant ที่รู้ว่ามีอยู่ (list_public_destinations → anon)';
  end if;

  -- ④ 🔴 **และต้องเห็น `PUBLIC` ที่มาจากค่าเริ่มต้น ไม่ใช่เฉพาะที่มีคน `grant` มือ**
  --    ฟังก์ชันในตัว Postgres แทบทุกตัวมี `proacl = null` ⇒ ต้องมีอย่างน้อยหนึ่งแถว `PUBLIC`
  --    ⚠️ ถ้าข้อนี้ล้ม แปลว่าใช้ `coalesce(proacl,'{}')` ไปแล้ว ⇒ **ของที่เปิดกว้างที่สุดจะหายเงียบ**
  select count(*) into n
    from public.function_exposure(array['pg_catalog'])
   where grantee = 'PUBLIC' and privilege = 'EXECUTE';
  if n = 0 then
    raise exception 'assert ล้ม: function_exposure ไม่รายงาน PUBLIC ที่มาจาก acldefault — ของที่เปิดกว้างที่สุดจะหายเงียบ';
  end if;

  -- ⑤ schema ที่ไม่มีจริง ต้องได้แถว MISSING ไม่ใช่ผลว่าง
  select count(*) into n
    from public.function_exposure(array['schema_ที่ไม่มีอยู่จริง'])
   where privilege like 'ไม่มี schema%';
  if n <> 1 then
    raise exception 'assert ล้ม: schema ที่ไม่มีจริงไม่ได้แถว MISSING — ผลว่างจะอ่านเป็น "ไม่มีอะไรเปิด"';
  end if;

  -- ⑥ 🔴 **ทิศบวกของแถวชนิดใหม่ (`USAGE`)** — P4 ขอ และเหตุผลของเขาคือรูปเดียวกับ ③④
  --    วันที่ query ส่วน `d_usage` พัง **ผลจะว่าง** ⇒ ด่านที่ใช้มันจะอ่านว่า
  --    *"ไม่มีใครมี USAGE เลย ⇒ ทุกอย่างเรียกไม่ได้"* ⇒ **เขียวสนิททั้งแผง**
  --    🎯 ***ตัววัดที่พังเงียบ ให้คำตอบที่ปลอดภัยที่สุดเสมอ — และนั่นคือสิ่งที่ทำให้ไม่มีใครสงสัย***
  select count(*) into n
    from public.function_exposure(array['public'])
   where function_name is null and privilege = 'USAGE';
  if n = 0 then
    raise exception 'assert ล้ม: function_exposure ไม่คืนแถว USAGE ของ schema — ด่านที่ใช้มันจะเขียวสนิทโดยไม่ได้ตรวจอะไร';
  end if;

  -- ⑦ schema ที่มีอยู่จริงแต่ **ไม่มีฟังก์ชันเลย** ต้องไม่ถูกรายงานว่า MISSING
  --    (ฉบับแรกเช็คจากตารางฟังก์ชัน ⇒ schema ว่างจะกลายเป็น "ไม่มี schema นี้" ซึ่งเป็นคำโกหกคนละแบบ)
  select count(*) into n
    from public.function_exposure(array['information_schema'])
   where privilege like 'ไม่มี schema%';
  if n <> 0 then
    raise exception 'assert ล้ม: schema ที่มีอยู่จริงถูกรายงานว่า MISSING';
  end if;
end $assert$;

commit;
