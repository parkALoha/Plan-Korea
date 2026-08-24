-- ═══════════════════════════════════════════════════════════════════════════
-- E1 self-check — รัน "หลัง" migration ผ่านแล้ว แล้ว **อ่านผลทีละข้อ**
-- เจ้าของ: P1-Lead · แยกออกมาจาก docs/engine/schema/0001_identity.sql หัวข้อ 7–8 (24 ส.ค. 2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ทำไมต้องแยกไฟล์: หัวข้อ 7–8 เป็น SELECT ที่ต้อง **อ่านผล** ถึงจะมีความหมาย
--    ถ้าปล่อยไว้ในไฟล์ migration แล้ว push · CLI จะรันแล้วทิ้งผลลัพธ์
--    → ได้ ✅ เขียวโดยไม่มีใครเคยเห็นตัวเลข = ด่านที่ผ่านได้ด้วยการไม่เคยถูกอ่าน
--
-- วิธีรัน: วางทั้งไฟล์ใน SQL Editor ของ **engine-dev** แล้วไล่ดูผลทีละบล็อก
--         (หรือ psql เข้า engine-dev แล้ว \i ไฟล์นี้)
-- 🔴 ห้ามรันบน DB ทริปจริง — ไฟล์นี้อ่านอย่างเดียวก็จริง แต่ผลจะทำให้เข้าใจผิดว่าตรวจอะไรอยู่
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. self-check — รันหลัง commit แล้วต้องได้ผลตามที่เขียนไว้
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ ชุดนี้ P4 ตรวจแล้วและชี้ช่อง 5 จุด — แก้ครบทั้ง 5 · ที่มาอยู่ในคอมเมนต์แต่ละข้อ
-- 🔴 หลักที่ใช้: เช็คที่ยืนยันว่า "ไม่มีของผิด" เชื่อไม่ได้ ถ้าไม่มีเช็คที่ยืนยันว่า "ของที่ต้องมี มีอยู่"

-- 7.1 ต้องได้ 0 แถว — ตารางที่เปิด RLS แต่ไม่มี policy สักตัว
select c.relname as table_without_policy
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

-- 7.2 ต้องได้ 0 แถว — policy ที่เปิดโล่ง (บั๊ก B2 ของเว็บเดิม)
-- 🔴 P-20: ฉบับแรกใช้ `and` → policy ที่ using(true) แต่ with check เข้ม **หลุดเช็ค**
--    ทั้งที่ครึ่งอ่านเปิดโล่ง · ต้องเป็น `or` จับได้ทั้งกรณีที่ครึ่งใดครึ่งหนึ่งเป็น true
select polrelid::regclass as tbl, polname, polcmd
  from pg_policy
 where polrelid in ('public.profiles'::regclass,'public.trips'::regclass,'public.trip_members'::regclass)
   and ( coalesce(pg_get_expr(polqual, polrelid), 'true') = 'true'
      or coalesce(pg_get_expr(polwithcheck, polrelid), 'true') = 'true' );

-- 7.3 ต้องได้ 0 แถว — สิทธิ์ที่หลุดไปถึงคนไม่ล็อกอิน
-- 🔴 P4 (c): ฉบับแรกเช็คแค่ grantee='anon' → **grant ให้ PUBLIC ไม่โผล่** ทั้งที่ให้ผลถึง anon เหมือนกัน
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where grantee in ('anon','PUBLIC') and table_schema = 'public'
   and table_name in ('profiles','trips','trip_members');

-- 7.4 🔴 ต้องได้ 0 แถว — **ตารางที่มี policy แต่ลืม grant ให้ authenticated**
-- P4 (a) เรียกข้อนี้ว่าช่องที่แพงที่สุด และเหตุผลคือ:
--   `alter default privileges ... revoke` ที่เพิ่มเข้ามา ทำให้ "ลืม grant" กลายเป็น
--   **ค่าเริ่มต้นของทุกตารางใหม่ใน E2** ไม่ใช่อุบัติเหตุ
--   7.1 จับ "RLS เปิดแต่ไม่มี policy" · **ไม่จับ "มี policy แต่ลืม grant"** ซึ่งอาการคือแอปพังเงียบ
-- 🎯 ถ้าไม่มีข้อนี้ คนที่เจอ permission denied คนแรกคือผู้ใช้ ไม่ใช่ CI
select c.relname as has_policy_but_no_grant
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and exists (select 1 from pg_policy p where p.polrelid = c.oid)
   and not exists (
     select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name = c.relname
        and g.grantee = 'authenticated');

-- 7.5 ต้องได้ 0 แถว — `force row level security` ที่ไหนก็ตาม
-- P4 (d): ถ้ามีใครเปิดบน trip_members **กลไก definer พังทั้งชุด**
--         และ error จะโผล่ตอน runtime ไม่ใช่ตอน migrate
select c.relname as forced_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relforcerowsecurity;

-- 7.6 ต้องได้ 0 แถว — definer ที่ไม่ได้ตรึง search_path
-- P4 (e): ฟังก์ชันใหม่ใน E2 ที่ลืมตั้ง = ช่องยกระดับสิทธิ์ · ตรวจจาก pg_proc.proconfig ได้ตรงๆ
select p.proname as definer_without_search_path
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'app' and p.prosecdef
   and not exists (
     select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');

-- 7.7 🔴 ต้องได้ 1 แถว — trigger ที่กัน P-13 (ทริปกำพร้าตอนสร้าง)
select tgname from pg_trigger
 where tgrelid = 'public.trips'::regclass and tgname = 'trips_bootstrap_owner';

-- 7.8 🔴 ต้องได้ 1 แถว — trigger ที่กัน P-19 (ทริปกำพร้าตอน owner ออกพร้อมกัน)
select tgname from pg_trigger
 where tgrelid = 'public.trip_members'::regclass and tgname = 'trip_members_keep_owner';

-- 7.10 🔴🔴 ต้องได้ 0 แถว — **เขียน policy ครบ แต่ลืมเปิด RLS**
-- P-22 (P4): 7.1 จับ "RLS เปิด ไม่มี policy" · 7.4 จับ "RLS เปิด มี policy ไม่มี grant"
-- **ไม่มีข้อไหนจับรูตรงกลาง: RLS *ปิด* แต่มี policy**
--   → policy นอนอยู่เฉยๆ ไม่ทำงานสักตัว · grant มีครบ → **ตารางเปิดโล่งให้ทุกคนที่ล็อกอิน**
--   → และ 7.2 ก็ไม่จับ เพราะ policy ไม่ได้เป็น `true` — มันแค่ไม่เคยถูกเรียกใช้
-- 🔴 คือ B2 ของเว็บเดิมกลับมาในรูปใหม่ · **มีทุกอย่างยกเว้นสวิตช์** ซึ่งเป็น config ที่อันตรายที่สุดเท่าที่เป็นได้
select c.relname as policies_but_rls_off
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
   and exists (select 1 from pg_policy p where p.polrelid = c.oid);

-- 7.9 ต้อง > 0 — E1-AC2 วัดว่ามี auth.uid() จริงในนโยบาย
select count(*) as policies_using_auth_uid
  from pg_policy
 where pg_get_expr(polqual, polrelid) like '%auth.uid%'
    or pg_get_expr(polwithcheck, polrelid) like '%auth.uid%';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. 🔴 พิสูจน์ว่าชุดเช็คข้างบน "คืนแถวได้จริง" — P-21 (P4)
-- ═══════════════════════════════════════════════════════════════════════════
-- ทุกข้อใน 7.x เป็น "ต้องได้ 0 แถว" · **และไม่มีข้อไหนพิสูจน์ว่าตัวมันเองไม่ได้พังเงียบ**
-- query ที่เขียนผิดจนไม่ match อะไรเลย → 0 แถว → อ่านว่าผ่าน
-- 🎯 นี่คือหลักที่เขียนกำกับหัวข้อ 7 ไว้เอง **แต่ยังไม่ได้ใช้กับตัวชุดเช็คเอง**
--    (และเป็นหลักเดียวกับเคสด้านบวกของ P4 กับ P6 — คนละงาน วันเดียวกัน)

-- 8.1 ต้องได้ 3 — ถ้าได้ 0 แปลว่า filter ของ 7.4 พัง ไม่ใช่ว่า grant ครบ
select count(*) as tables_with_authenticated_grant
  from (select distinct table_name
          from information_schema.role_table_grants
         where table_schema = 'public' and grantee = 'authenticated'
           and table_name in ('profiles','trips','trip_members')) t;

-- 8.2 ต้องเท่ากับจำนวน definer ทั้งหมดใน app — ถ้าได้ 0 แปลว่าสมมติฐานรูปแบบ proconfig ผิด
--     ซึ่งจะทำให้ 7.6 เงียบตลอดกาล
select
  count(*) filter (where exists (
    select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%')) as with_search_path,
  count(*) as definers_total
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'app' and p.prosecdef;

-- 8.3 ต้องได้แถว — พิสูจน์ว่า view + filter ของ 7.3 ทำงาน (service_role ต้องมีสิทธิ์อยู่แล้ว)
select count(*) as service_role_grants
  from information_schema.role_table_grants
 where grantee = 'service_role' and table_schema = 'public'
   and table_name in ('profiles','trips','trip_members');

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. 🔴 E1-AC7 (ใหม่ · D42) — ล็อกอิน 2 ทางต้องได้ผู้ใช้ "คนเดียว" ไม่ใช่สองคน
-- ═══════════════════════════════════════════════════════════════════════════
-- ผู้ใช้เลือกเปิดทั้ง Google OAuth และ magic link (24 ส.ค. 2026)
-- คำถามที่ยังไม่มีใครตอบด้วยการวัด: A เข้าด้วย Google ครั้งหนึ่ง แล้วเข้าด้วย magic link
-- ด้วยอีเมลเดียวกัน → ได้ auth.users.id ตัวเดิม หรือได้แถวที่สอง?
--
-- 🔴 ถ้าได้แถวที่สอง: profiles 2 แถว · trip_members ไม่ตามมา → A เปิดเว็บแล้วทริปหายทั้งใบ
--    และอาการคือ "หน้าเปล่า" ไม่ใช่ error → คลาส R9 (ความพังที่ไม่ส่งเสียง)
--
-- ⚠️ ห้ามตอบจากความจำหรือจากเอกสาร — ต้องเข้าจริงทั้งสองทางก่อน แล้วค่อยรันบล็อกนี้

-- 9.1 ต้องได้ 1 แถวต่อ 1 อีเมล — ถ้าได้ 2 แถวอีเมลเดียวกัน คือเคสที่กลัว
select email, count(*) as user_rows, min(created_at) as first_seen, max(created_at) as last_seen
  from auth.users
 group by email
 having count(*) > 1;
-- 🔴 ต้องได้ 0 แถว

-- 9.2 ดูว่าผู้ใช้ 1 คนถือ identity กี่ provider — ที่ถูกคือ 1 แถว user + 2 แถว identity
select u.email,
       count(distinct u.id)      as user_rows,
       count(i.id)               as identity_rows,
       array_agg(distinct i.provider order by i.provider) as providers
  from auth.users u
  left join auth.identities i on i.user_id = u.id
 group by u.email
 order by u.email;
-- ✅ ที่ต้องการ: user_rows = 1 · identity_rows = 2 · providers = {email, google}

-- 9.3 ทุก auth.users ต้องมี profiles ตรงกัน 1:1 — พิสูจน์ว่า trigger handle_new_user ทำงาน
--     🔴 เคสด้านบวกคู่กับ 9.1: ถ้า 9.1 ได้ 0 เพราะยังไม่มีใครสมัครเลย ข้อนี้จะฟ้อง
select (select count(*) from auth.users)     as auth_users,
       (select count(*) from public.profiles) as profiles,
       (select count(*) from auth.users u
          where not exists (select 1 from public.profiles p where p.id = u.id)) as users_without_profile;
-- ✅ auth_users = profiles · users_without_profile = 0 · และ auth_users ต้อง > 0
