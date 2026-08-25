-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `public.table_exposure()`: ถามฐานว่า *ตอนนี้* ตารางเปิดทางไหนอยู่บ้าง
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · จากประตูบานที่ 3 และ 4 ที่ P7 ชี้
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมต้องมี ทั้งที่ P6 มีด่าน `cache-lockdown` แล้ว ────────────────────────
-- ด่านของ P6 อ่าน **ไฟล์ migration** — จับได้ทุกอย่างที่ถูกเขียนลงไฟล์ และนั่นคือขอบเขตของมัน
-- 🔴 **P7 ชี้ประตู 2 บานที่ไฟล์มองไม่เห็นตามนิยาม:**
--   ③ **view ที่ไม่ได้ตั้ง `security_invoker`** — view รันด้วยสิทธิ์ *เจ้าของ view* กับตารางฐาน
--      (ค่าเริ่มต้นคือไม่ตั้ง) → `grant select` ให้ `authenticated` แล้ว PostgREST เปิดให้อัตโนมัติ
--      = **`revoke all` ถูกข้ามทั้งชุด โดยไม่มีบรรทัดไหนหน้าตาเหมือนการขอสิทธิ์เพิ่ม**
--      🎯 P7 ชี้ว่าบานนี้มีโอกาสเกิด **สูงกว่า** `security definer` เพราะ definer ดูน่าสงสัยพอให้คนคิด
--         **แต่ view ดูเหมือนความสะดวก** — และ *"endpoint เดียวที่คืนสถานที่พร้อมรายละเอียดที่แคชไว้"*
--         คือของที่ `E3` อยากได้แน่ ๆ
--   ④ **สมาชิกภาพใน `supabase_realtime`** — เพิ่มตารางเข้า publication **จากหน้า dashboard ได้
--      โดยไม่ผ่านไฟล์สักไฟล์** → การรีวิว migration มองไม่เห็นตลอดกาล
--      · P7 เสนอท่าที่ถูก: **ไม่ต้องรู้ว่า Realtime กรอง RLS ถูกไหม — ยืนยันว่ามัน *ไม่อยู่* ใน publication เลย**
--        deny-by-default ถูกกว่าการไปตรวจว่าตัวกรองทำงานไหม
--
-- 🎯 **ไฟล์นี้ไม่ได้มาแทนด่านของ P6 — มันตอบคนละคำถาม**
--    ด่านของ P6: *"มีใครเขียนของผิดลงไฟล์ไหม"* (จับก่อน push · ไม่ต้องมี DB)
--    ตัวนี้: *"ฐาน ณ วินาทีนี้เปิดทางไหนอยู่"* (จับของที่ไม่เคยผ่านไฟล์ · ต้องมี creds)
--    · บรรทัดฐานเดียวกับ `client_writable_timestamps()` — **ถามสภาพปลายทาง ไม่ใช่ grep เจตนา**
--
-- ── รูปของผลลัพธ์: **1 แถว = 1 ประตูที่เปิดอยู่ · ศูนย์แถว = ปิดสนิท** ────────
-- 🔴 และมันรับรายชื่อตารางเป็นพารามิเตอร์**โดยตั้งใจ** — เพื่อให้เทสต์ยิงตารางที่ *ควร* เปิด
--    (เช่น `catalog_places`) แล้วเห็นแถวจริง **พิสูจน์ว่ามันยังตรวจอยู่ ไม่ใช่คืนว่างเสมอ**
--    (`P-21` ของ P4: *"สแกนแคบลง" กับ "สแกนความว่างเปล่า" ให้ผลเหมือนกันเป๊ะ*)
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop function if exists public.table_exposure(text[]);
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

drop function if exists public.table_exposure(text[]);

create or replace function public.table_exposure(p_tables text[])
returns table (table_name text, door text, detail text)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select c.oid, c.relname::text as name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname = any(p_tables)
  ),
  -- ① policy — ตารางที่ตั้งใจให้ปิดสนิทต้องไม่มีสักตัว
  d_policy as (
    select t.name, 'policy'::text as door,
           p.polname::text || ' → ' || coalesce(
             (select string_agg(r.rolname::text, ',' order by r.rolname)
                from pg_catalog.pg_roles r where r.oid = any(p.polroles)), 'PUBLIC') as detail
      from t join pg_catalog.pg_policy p on p.polrelid = t.oid
  ),
  -- ② สิทธิ์ระดับตาราง
  d_grant as (
    select t.name, 'grant'::text, g.role || ' ' || g.priv
      from t
      cross join (
        select r.role, p.priv from (values ('anon'), ('authenticated')) r(role)
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES')) p(priv)
      ) g
     where pg_catalog.has_table_privilege(g.role, t.oid, g.priv)
  ),
  -- ③ สิทธิ์ระดับ **คอลัมน์** — `has_table_privilege` มองไม่เห็น grant แบบระบุคอลัมน์
  --    ซึ่งเป็นรูปที่ตารางอื่นของ `E2` ใช้อยู่จริงทุกใบ จึงเป็นรูปที่คนจะเผลอลอกมาใส่แคช
  d_colgrant as (
    select distinct t.name, 'column-grant'::text, g.role || ' ' || g.priv || ' (' || a.attname::text || ')'
      from t
      join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
      cross join (
        select r.role, p.priv from (values ('anon'), ('authenticated')) r(role)
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(priv)
      ) g
     where pg_catalog.has_column_privilege(g.role, t.oid, a.attnum, g.priv)
  ),
  -- ④ publication — ประตูที่ dashboard เปิดได้โดยไม่ผ่านไฟล์ (P7 บานที่ 4)
  d_pub as (
    select t.name, 'publication'::text, pt.pubname::text
      from t join pg_catalog.pg_publication_tables pt
        on pt.schemaname = 'public' and pt.tablename = t.name
  ),
  -- ⑤ view / materialized view ที่ฐานแตะตารางนี้ (P7 บานที่ 3)
  --    · `v` ที่ไม่มี `security_invoker=true` = รันด้วยสิทธิ์เจ้าของ → ข้าม revoke
  --    · `m` (materialized) **ไม่มี RLS เลยตามนิยาม** จึงเป็นประตูเสมอ ไม่มีตัวเลือกให้ตั้ง
  d_view as (
    select distinct t.name, 'view'::text,
           v.relname::text || ' (' || v.relkind::text ||
           case when v.relkind = 'v' then ' · security_invoker='
                     || coalesce((select 'true' from unnest(coalesce(v.reloptions, '{}'))  o
                                   where o ilike 'security_invoker=%'
                                     and split_part(o, '=', 2) in ('true','on','1')), 'false')
                else ' · materialized view ไม่มี RLS' end || ')'
      from t
      join pg_catalog.pg_depend dep on dep.refobjid = t.oid and dep.classid = 'pg_rewrite'::regclass
      join pg_catalog.pg_rewrite rw on rw.oid = dep.objid
      join pg_catalog.pg_class v on v.oid = rw.ev_class and v.relkind in ('v', 'm')
     where v.oid <> t.oid
       and (
         v.relkind = 'm'
         or not exists (
           select 1 from unnest(coalesce(v.reloptions, '{}')) o
            where o ilike 'security_invoker=%' and split_part(o, '=', 2) in ('true','on','1')
         )
       )
       and (pg_catalog.has_table_privilege('anon', v.oid, 'SELECT')
         or pg_catalog.has_table_privilege('authenticated', v.oid, 'SELECT'))
  )
  select * from d_policy
  union all select * from d_grant
  union all select * from d_colgrant
  union all select * from d_pub
  union all select * from d_view
  order by 1, 2, 3
$$;

comment on function public.table_exposure(text[]) is
  'ทุกทางที่ anon/authenticated เข้าถึงตารางที่ระบุได้ ณ สภาพปลายทางจริง — 1 แถว = 1 ประตู · 0 แถว = ปิดสนิท '
  'ครอบ policy · grant ระดับตาราง · grant ระดับคอลัมน์ · publication (P7 บาน 4) · view ที่ไม่ security_invoker (P7 บาน 3) '
  'รับรายชื่อตารางเป็นพารามิเตอร์เพื่อให้เทสต์พิสูจน์ได้ว่ามันยังตรวจอยู่จริง ไม่ใช่คืนว่างเสมอ (P-21)';

revoke all on function public.table_exposure(text[]) from public, anon, authenticated;
grant execute on function public.table_exposure(text[]) to service_role;

commit;
