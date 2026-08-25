-- ═══════════════════════════════════════════════════════════════════════════
-- แก้ 2 ช่องใน `table_exposure()` ที่ P4 ยิงพิสูจน์ + ลูกกุญแจของประตู definer ที่ P7 หาเจอ
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 ช่อง ① ที่ P4 ยิงจริง — **"ไม่มีตาราง" กับ "ปิดสนิท" ให้ผลตัวเดียวกันเป๊ะ** ──
--   `place_photo_cachee` (พิมพ์ผิด 1 ตัว) → **0 แถว**
--   ชื่อมั่วล้วน · อาร์เรย์ว่าง         → **0 แถว**
--   แคชจริง 4 ใบ                        → **0 แถว**
--   🎯 คอมเมนต์ในฉบับแรกเขียนว่า *"0 แถว = ปิดสนิท"* — **ประโยคนั้นไม่จริง**
--      มันแปลว่า *"ไม่เจอประตูในบรรดาชื่อที่ resolve ได้"*
--   🔴 **เคสที่กัดจริงที่สุดคือ rename:** วันที่มีคนเปลี่ยนชื่อแคช ด่านจะ**เขียวชั่วนิรันดร์ที่ 0 แถว**
--      ขณะตารางจริงเปิดโล่งอยู่ข้าง ๆ — **`P-21` เป๊ะ ๆ ในเครื่องมือที่เขียนมาเพื่อแก้ `P-21`**
--   → **แก้: ชื่อที่ resolve ไม่ได้คืนแถว `door = 'MISSING'`** · ความเงียบกลายเป็นแถว
--   → **และ `relkind` ครอบ `p` (partitioned) · `f` (foreign) ด้วย** ไม่ใช่แค่ `r`
--     (P7 ชี้ `f` · P4 ชี้ `p` — คนละคนคนละรอบ ช่องเดียวกัน)
--
-- ── 🔴 ช่อง ② ที่ P4 ยิงจริง — **ตรวจแค่ role ที่เรานึกออก** ────────────────
--   `service_role` มี grant จริงบนแคช (ข้อยกเว้นที่ 5) · ฉบับแรกรายงาน **0 แถว**
--   เพราะ `d_grant`/`d_colgrant`/`d_view` เขียน `values ('anon'), ('authenticated')` ไว้ตายตัว
--   🔴 **role ที่เกิดใหม่มองไม่เห็น 100%** — และ role ที่กำลังจะเกิดชื่อ **`cache_writer`** (`Q3`)
--      → วันที่ `Q3` ปิด ตัวตรวจจะบอก *"0 แถว = ปิดสนิท"* ให้ตารางที่เพิ่งเปิดให้ role ใหม่เขียน
--   🎯 **P4 สรุปกฎที่ผมรับทั้งข้อ: นับจาก*โลก* แล้วเทียบกับ*ความคาดหวัง*
--      ห้ามนับจาก*ความคาดหวัง*แล้วไปมองโลก** · นับจากความคาดหวัง → ของที่ไม่รู้จัก = **เขียว**
--   → **แก้: `aclexplode()` บน `relacl`/`attacl`** — ACL บอกเองว่าใครได้อะไร
--     **ไม่มีรายชื่อ role ในไฟล์นี้เลยสักตัว** · role ใหม่โผล่มาเป็นแถวโดยอัตโนมัติ
--   → เพิ่มคอลัมน์ **`grantee`** ให้ผู้เรียก assert ได้ตรง ๆ แทนการนับแถวรวม
--     **เปลี่ยนความหมายของ "0 แถว":** แคชจะมีแถวของ `service_role` โผล่มา (ซึ่ง*ควร*โผล่)
--     เกณฑ์ที่ถูกจึงเป็น *"ไม่มีแถวที่ `grantee` เป็น anon/authenticated/PUBLIC"* ไม่ใช่ *"0 แถว"*
--
-- ── 🔴 ลูกกุญแจของ P7 — `force row level security` ────────────────────────
--   รากของประตู definer **ไม่ใช่เรื่อง grant เลย**: `security definer` รันด้วยสิทธิ์เจ้าของฟังก์ชัน
--   ซึ่งมักเป็น role เดียวกับเจ้าของตาราง · **เจ้าของตารางไม่ถูก RLS บังคับ** เว้นแต่ตั้ง `force`
--   → definer function อ่านแคชได้ **แม้แคชมี 0 policy และ `revoke all` ครบทุก role**
--     **`revoke` ไม่เกี่ยวเลยแม้แต่นิดเดียว** · ตรวจแล้วทั้งโปรเจกต์ไม่มี `force` สักบรรทัด
--   ✅ `service_role` ยังทำงานเหมือนเดิมเพราะมี **BYPASSRLS** ซึ่ง `force` ไม่แตะ
--   🎯 **และมันดีกว่าการปิดประตูเฉย ๆ: ถ้า `force` ทำอะไรพัง สิ่งที่พังคือประตูนั้นเอง**
--   ⚠️ **ขอบเขตที่ P7 เขียนกำกับ ห้ามเชื่อเกิน:** `force` ปิดเฉพาะเมื่อเจ้าของฟังก์ชัน**ไม่มี BYPASSRLS**
--      → กติกาคู่กัน: **`security definer` ห้ามมีเจ้าของเป็น role ที่มี BYPASSRLS**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   alter table public.place_details_cache no force row level security;  -- และอีก 3 ใบ
--   -- แล้วคืน table_exposure ฉบับ 20260825155423
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

-- ───────────────────────────────────────────────────────────────────────────
-- 1. `force row level security` — ลูกกุญแจของประตู definer (P7)
-- ───────────────────────────────────────────────────────────────────────────
alter table public.place_details_cache       force row level security;
alter table public.place_details_local_cache force row level security;
alter table public.place_photo_cache         force row level security;
alter table public.travel_time_cache         force row level security;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. `table_exposure` ฉบับ 2
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.table_exposure(text[]);

create or replace function public.table_exposure(p_tables text[])
returns table (table_name text, door text, grantee text, detail text)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select c.oid, c.relname::text as name, c.relowner, c.relacl
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       -- `r` ธรรมดา · `p` partitioned (P4) · `f` foreign (P7)
       and c.relkind in ('r', 'p', 'f')
       and c.relname = any(p_tables)
  ),
  -- ⓪ 🔴 ชื่อที่ resolve ไม่ได้ **ต้องส่งเสียง** ไม่ใช่หายไปเงียบ ๆ (P4 ช่อง ①)
  d_missing as (
    select q.name, 'MISSING'::text, ''::text,
           'ไม่มีตารางชื่อนี้ใน public — พิมพ์ผิด/ถูก rename/ยังไม่ลง'::text
      from unnest(p_tables) as q(name)
     where not exists (select 1 from t where t.name = q.name)
  ),
  -- ① policy
  d_policy as (
    select t.name, 'policy'::text,
           coalesce((select string_agg(r.rolname::text, ',' order by r.rolname)
                       from pg_catalog.pg_roles r where r.oid = any(p.polroles)), 'PUBLIC'),
           p.polname::text
      from t join pg_catalog.pg_policy p on p.polrelid = t.oid
  ),
  -- ② สิทธิ์ระดับตาราง — **จาก ACL ไม่ใช่จากรายชื่อ role ที่เรานึกออก** (P4 ช่อง ②)
  d_grant as (
    select t.name, 'grant'::text,
           case when a.grantee = 0 then 'PUBLIC'
                else pg_catalog.pg_get_userbyid(a.grantee) end,
           a.privilege_type::text
      from t
      cross join lateral aclexplode(
        coalesce(t.relacl, pg_catalog.acldefault('r', t.relowner))) a
     where a.grantee = 0 or a.grantee <> t.relowner
  ),
  -- ③ สิทธิ์ระดับคอลัมน์ — `has_table_privilege` มองไม่เห็น และเป็นรูปที่ `E2` ใช้จริงทุกใบ
  d_colgrant as (
    select t.name, 'column-grant'::text,
           case when a.grantee = 0 then 'PUBLIC'
                else pg_catalog.pg_get_userbyid(a.grantee) end,
           a.privilege_type::text || ' (' || att.attname::text || ')'
      from t
      join pg_catalog.pg_attribute att
        on att.attrelid = t.oid and att.attnum > 0 and not att.attisdropped
       and att.attacl is not null
      cross join lateral aclexplode(att.attacl) a
     where a.grantee = 0 or a.grantee <> t.relowner
  ),
  -- ④ publication — ประตูที่ dashboard เปิดได้โดยไม่ผ่านไฟล์ (P7)
  d_pub as (
    select t.name, 'publication'::text, ''::text, pt.pubname::text
      from t join pg_catalog.pg_publication_tables pt
        on pt.schemaname = 'public' and pt.tablename = t.name
  ),
  -- ⑤ view / matview / foreign table ที่ฐานแตะตารางนี้ (P7)
  --   `v` ที่ไม่มี `security_invoker=true` = รันด้วยสิทธิ์เจ้าของ → ข้าม revoke
  --   `m` **ไม่มี RLS เลยตามนิยาม** จึงเป็นประตูเสมอ ตั้ง `security_invoker` ไม่ได้ด้วยซ้ำ
  d_view as (
    select distinct t.name, 'view'::text,
           case when a.grantee = 0 then 'PUBLIC'
                else pg_catalog.pg_get_userbyid(a.grantee) end,
           v.relname::text || ' (' || v.relkind::text || ')'
      from t
      join pg_catalog.pg_depend dep
        on dep.refobjid = t.oid and dep.classid = 'pg_rewrite'::regclass
      join pg_catalog.pg_rewrite rw on rw.oid = dep.objid
      join pg_catalog.pg_class v on v.oid = rw.ev_class and v.relkind in ('v', 'm', 'f')
      cross join lateral aclexplode(
        coalesce(v.relacl, pg_catalog.acldefault('r', v.relowner))) a
     where v.oid <> t.oid
       and (a.grantee = 0 or a.grantee <> v.relowner)
       and (
         v.relkind <> 'v'
         or not exists (
           select 1 from unnest(coalesce(v.reloptions, '{}')) o
            where o ilike 'security_invoker=%' and split_part(o, '=', 2) in ('true','on','1')
         )
       )
  )
  select * from d_missing
  union all select * from d_policy
  union all select * from d_grant
  union all select * from d_colgrant
  union all select * from d_pub
  union all select * from d_view
  order by 1, 2, 3, 4
$$;

comment on function public.table_exposure(text[]) is
  'ทุกทางที่ role ใด ๆ เข้าถึงตารางที่ระบุได้ ณ สภาพปลายทาง — 1 แถว = 1 ประตู · grantee บอกว่าใคร '
  '🔴 "0 แถว" ไม่ได้แปลว่าปิดสนิท: ชื่อที่ resolve ไม่ได้จะคืน door=MISSING (P4 ช่อง ①) '
  'เกณฑ์ที่ถูกคือ ไม่มีแถวที่ grantee เป็น anon/authenticated/PUBLIC และไม่มีแถว MISSING '
  'role อ่านจาก aclexplode ไม่ใช่จากรายชื่อในไฟล์ — role ใหม่โผล่เองโดยอัตโนมัติ (P4 ช่อง ②)';

revoke all on function public.table_exposure(text[]) from public, anon, authenticated;
grant execute on function public.table_exposure(text[]) to service_role;

commit;
