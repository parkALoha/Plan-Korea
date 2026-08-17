-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS ชุดเต็มของ Dynamic Travel Platform Engine — ร่างระยะออกแบบ
-- เจ้าของไฟล์: P4-QA/Sec · เขียน 17 ส.ค. 2026 · ทบทวนคู่กับ docs/engine/security-review.md
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ไฟล์นี้ไม่ใช่ migration และห้ามย้ายไป supabase/migrations/
--    ไฟล์ที่นั่งในโฟลเดอร์นั้นมีโอกาสถูก copy-paste รันใส่ Supabase ของทริปจริง
--    (ejzibhgqhxdzkovsnpds) ซึ่งจะ **ล็อกคน 2 คนออกจากเว็บทันที** เพราะทุก policy ข้างล่างนี้
--    เป็น `to authenticated` แต่เว็บทริปวันนี้ยังคุยกับ Supabase ด้วย anon key ล้วนๆ
--    → ปลายทางที่ถูกต้องคือ Supabase local (Docker) ของระยะ 2 เท่านั้น
--
-- ตำแหน่งในลำดับระยะ 2: ไฟล์นี้คือ **E1 (Identity)** ต้องลงก่อน E2/E3 ตาม docs/engine/README.md
--
-- สิ่งที่ไฟล์นี้แทนที่ (ตรวจของจริงแล้ว 17 ส.ค. 2026):
--   · 49 policy บน 14 ตารางใน public + 4 policy บน storage.objects = 53 ตัว
--   · ทั้ง 53 ตัวเป็น `using (true)` / `with check (true)` — ยกเว้น 4 ตัวของ Storage
--     ที่กรองแค่ `bucket_id = 'booking-files'`
--   · `grep -rniE "auth\.(uid|role|jwt)|current_setting|request\.jwt" supabase/migrations/`
--     คืน 0 บรรทัด → **ไม่มีการอ้าง identity สักที่เดียวทั้งสคีมา**
--   ผลคือ RLS "เปิดอยู่" ครบทุกตารางแต่ไม่ได้กันอะไรเลย ใครถือ anon key (ซึ่งฝังอยู่ใน
--   บันเดิล JS — lib/pinAuth.ts:7-11 เขียนกำกับไว้เอง) อ่าน/เขียน/ลบได้ทุกแถวทุกตาราง
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 0 — อ่านก่อน: RLS กันอะไรได้ กันอะไรไม่ได้
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- RLS เป็นตัวกรอง **ระดับแถว** วางทับบน GRANT ไม่ได้แทน GRANT
--   · ไม่มี policy ที่ match = ปฏิเสธ (default deny) — แต่ต้องมี `enable row level security` ก่อน
--   · RLS **ไม่กรองคอลัมน์** → ซ่อน bookings.confirmation_number จาก viewer ด้วย RLS ไม่ได้
--     ต้องใช้ column GRANT หรือแยกตาราง (ดูส่วนที่ 5.9 — เลือกแยกตาราง)
--   · RLS **เทียบ OLD/NEW ไม่ได้** → "ล็อกวันแล้วห้ามลากจุดแวะ แต่ยังติ๊กมาถึงได้"
--     เขียนเป็น policy ไม่ได้ ต้องใช้ trigger (ดูส่วนที่ 9)
--   · เจ้าของตาราง **ข้าม RLS โดยปริยาย** — นี่คือกลไกที่ทำให้ SECURITY DEFINER ใช้ได้ (ส่วนที่ 3)
--     และเป็นเหตุผลที่ห้ามสั่ง `force row level security` บน public.trip_members
--
-- 3 ชั้นที่ต้องครบ ขาดชั้นใดชั้นหนึ่งชั้นที่เหลือไร้ความหมาย:
--   ชั้น 1 GRANT/REVOKE  — ใครมีสิทธิ์แตะตารางนี้ได้บ้าง (ส่วนที่ 2)
--   ชั้น 2 RLS policy    — แตะได้แถวไหน (ส่วนที่ 4-8)
--   ชั้น 3 trigger        — เงื่อนไขที่ RLS เขียนไม่ได้ (ส่วนที่ 9)


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 1 — คำตอบข้อที่ P1 ถาม: catalog สาธารณะกับข้อมูลผู้ใช้ควรอยู่คนละ schema ไหม
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ตอบ: **ควร และควรเป็น 3 schema ไม่ใช่ 2** เหตุผลไม่ใช่ความเป็นระเบียบ แต่เพราะ
-- "schema ที่ไม่ถูก expose ให้ PostgREST ไม่มีพื้นที่โจมตีให้ต้องเขียน policy กัน"
-- ซึ่งเป็นหลักประกันที่แข็งกว่า policy ที่เขียนถูกทุกตัว
--
--   public   — ข้อมูลผู้ใช้/ทริปเท่านั้น · ทุกแถวมีเจ้าของ · ทุกตารางกันด้วย trip_members
--   catalog  — ข้อมูลอ้างอิงอ่านอย่างเดียว (countries · cities · places · transfer_points
--              · emergency_contacts) · เปิดอ่านสาธารณะ · **ไม่มี policy เขียนเลยแม้แต่ตัวเดียว**
--              เขียนได้ทางเดียวคือ migration/service role
--   cache    — แคช Google 3 ตาราง · **ไม่ใส่ใน `db.schemas` ของ Supabase**
--              → PostgREST มองไม่เห็น → browser เรียกไม่ได้ทั้งอ่านและเขียน
--              → ไม่ต้องมี policy สักตัว และไม่มีใครยิงเผาโควตา Google ได้
--
-- 3 ปัญหาที่หายไปเองเพราะแยก cache ออกมา:
--   ก. บั๊ก travel_time_cache ขาด UPDATE policy (ยืนยันแล้ว ดูส่วนที่ 7) **เป็นไปไม่ได้อีก**
--      เพราะ service role ไม่อยู่ใต้ RLS
--   ข. วันนี้ 3 route (place-details · place-photos · travel-time) เขียนแคชด้วย **anon client
--      ตัวเดียวกับ browser** (lib/supabase.ts:10) และในโปรเจกต์ **ไม่มี service-role key เลย**
--      (`grep -rn "SERVICE_ROLE" .` = 0 บรรทัด) → วินาทีที่ RLS จริงถูกเปิด 3 route นี้พังพร้อมกัน
--      การแยก schema บังคับให้ต้องมี service-role client ตั้งแต่วันแรก จึงไม่มีทางลืม
--   ค. แคชเป็นของกลางทุก tenant ไม่ใช่ข้อมูลใคร → ถ้าอยู่ใน public จะต้องเขียน policy
--      "ทุกคนอ่านได้" ซึ่งดูเหมือน `using (true)` ที่เรากำลังพยายามกำจัด และคนตรวจรุ่นหลัง
--      จะแยกไม่ออกว่าตัวไหนตั้งใจตัวไหนพลาด — แยก schema ทำให้ "ตั้งใจ" อ่านออกจากโครงสร้าง

create schema if not exists app;      -- helper function (ไม่ expose)
create schema if not exists catalog;  -- ข้อมูลอ้างอิง อ่านสาธารณะ
create schema if not exists cache;    -- แคช Google (ไม่ expose)

comment on schema app is
  'helper ของ RLS เท่านั้น — ห้ามใส่ใน db.schemas ของ Supabase '
  'ฟังก์ชันใน public จะกลายเป็น RPC endpoint ที่ browser เรียกได้ ซึ่ง app.* ต้องไม่เป็น';
comment on schema cache is
  'แคช Google — ห้ามใส่ใน db.schemas ของ Supabase '
  'แตะได้จาก server ด้วย service-role key ทางเดียว';


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 2 — ชั้น GRANT: ถอนสิทธิ์ anon ออกจากข้อมูลผู้ใช้ให้หมดก่อน
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ปิดช่อง: **B3 — anon key ฝังในบันเดิล ยิง REST ข้ามด่าน PIN ได้** (พิสูจน์ด้วย curl 11 ส.ค. 2026)
-- ด่าน PIN ใน proxy.ts กันได้แค่ request ที่วิ่งผ่าน Next ส่วน browser → Supabase ไม่ผ่าน Next เลย
-- ทางแก้ที่ได้ผลจริงคือ **ทำให้ anon key ไม่มีสิทธิ์อะไรกับข้อมูลทริปตั้งแต่ชั้น GRANT**
-- ไม่ใช่หวังให้ policy กรอง เพราะ policy ที่เขียนผิดพลาดตัวเดียวก็เปิดรูใหม่ได้ แต่ถ้าไม่มี GRANT
-- ต่อให้เผลอเขียน `using (true)` ทับก็ยังเข้าไม่ถึง — สองชั้นนี้ต้องพลาดพร้อมกันจึงจะหลุด
--
-- ⚠️ Supabase ตั้ง `grant all on all tables in schema public to anon, authenticated` ไว้เป็น
--    default privileges → ตารางที่สร้างใหม่ทีหลัง **ได้สิทธิ์ anon มาเองอัตโนมัติ**
--    ต้องแก้ default ด้วย ไม่ใช่ revoke เฉพาะตารางที่มีวันนี้ ไม่งั้นตารางของเฟสหน้ารูเปิดเงียบ

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;

-- ⚠️ 2 ข้อที่ต้องรู้ก่อนรัน 4 บรรทัดข้างบน (ไม่ใช่เหตุให้ไม่รัน แต่ต้องรู้ว่าจะเจออะไร):
--   ก. `revoke usage on schema public from anon` เป็นรูปแบบที่แข็งที่สุด — anon จะได้
--      `permission denied for schema public` **แทนที่จะได้ 404 หรือ array ว่าง**
--      ข้อดี: ปฏิเสธชัดเจนตั้งแต่ชั้นล่างสุด · ข้อเสีย: error message ต่างจากที่ policy
--      จะให้ ทำให้เทสต์ T-06 ต้องรับได้ทั้ง 2 รูปแบบ ไม่ใช่ผูกกับข้อความใดข้อความเดียว
--      ⚠️ ถ้าระยะ 2 ต้องมี RPC ที่ anon เรียกได้ (เช่น ตรวจว่า invite token ใช้ได้ไหม
--         ก่อนล็อกอิน) ห้าม revoke ทั้ง schema — ให้ grant usage คืนแล้ว grant execute
--         เฉพาะฟังก์ชันนั้นตัวเดียว **ห้าม grant กลับทั้ง schema เพื่อความสะดวก**
--   ข. `alter default privileges` มีผลกับ object ที่สร้างโดย **role ที่รันคำสั่งนี้** เท่านั้น
--      ถ้า migration ในเฟสหน้ารันด้วย role อื่น default เดิมจะกลับมา
--      → self-check §11.3 เป็นตัวจับ ไม่ใช่หวังว่าคำสั่งนี้ครอบทุกกรณี

-- authenticated ได้ GRANT ระดับตาราง แต่ยังต้องผ่าน RLS ทีละแถวอยู่ดี
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- catalog: อ่านได้ทุกคนรวม anon (หน้า landing/สาธารณะต้องโชว์ชื่อประเทศ/เมืองได้ก่อนล็อกอิน)
-- **ไม่ให้ insert/update/delete แม้แต่ authenticated** — ปิดช่อง "สมาชิกคนหนึ่งแก้ชื่อเมือง
-- แล้วทุก tenant ในระบบเห็นค่าที่ถูกแก้" ซึ่งเป็น cross-tenant write ที่มองไม่ออกว่าเป็น
-- cross-tenant เพราะตารางไม่มีคอลัมน์ tenant ให้เห็น
grant usage on schema catalog to anon, authenticated;
grant select on all tables in schema catalog to anon, authenticated;
alter default privileges in schema catalog grant select on tables to anon, authenticated;

-- cache: service role เท่านั้น · anon/authenticated ไม่ได้แม้แต่ usage บน schema
grant usage on schema cache to service_role;
grant select, insert, update, delete on all tables in schema cache to service_role;
alter default privileges in schema cache grant all on tables to service_role;

-- app: helper ถูกเรียกจาก policy ซึ่งรันในบริบทของผู้ใช้ → ต้องมี usage + execute
-- แต่ **ไม่ expose schema นี้ให้ PostgREST** จึงเรียกเป็น RPC จากภายนอกไม่ได้
grant usage on schema app to anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 3 — หัวใจ: SECURITY DEFINER helper กัน policy recursion
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ปัญหาที่ P1 ชี้มาถูกต้อง: `trip_members` เป็นแหล่งความจริงของสิทธิ์ แต่ตัวมันเองก็ต้องมี policy
-- ถ้า policy ของ trip_members เขียนว่า "อ่านได้ถ้าเป็นสมาชิกทริปนี้" → ต้อง select trip_members
-- เพื่อรู้ว่าเป็นสมาชิก → policy ทำงานอีกรอบ → Postgres โยน
--   ERROR: infinite recursion detected in policy for relation "trip_members" (42P17)
--
-- ทางออก: อ่าน trip_members ผ่าน SECURITY DEFINER function
--   · ฟังก์ชันรันด้วยสิทธิ์ **เจ้าของฟังก์ชัน** (postgres) ไม่ใช่ผู้เรียก
--   · เจ้าของตารางข้าม RLS โดยปริยาย → query ข้างในไม่ทำให้ policy ทำงานซ้ำ → ไม่ recurse
--
-- 🔴 3 ข้อที่ถ้าพลาดข้อใดข้อหนึ่งกลไกนี้พังทั้งชุด:
--   1. ฟังก์ชันต้องเป็นของ postgres (เจ้าของตาราง) — ถ้า owner เป็น role ที่ไม่ใช่เจ้าของตาราง
--      มันจะอยู่ใต้ RLS แล้ว recurse เหมือนเดิม
--   2. **ห้ามสั่ง `alter table public.trip_members force row level security`**
--      FORCE RLS บังคับให้เจ้าของตารางอยู่ใต้ RLS ด้วย → กลไกทั้งหมดนี้พังทันทีและ error
--      จะโผล่ตอน runtime ไม่ใช่ตอน migrate
--   3. `set search_path = ''` ทุกตัว + อ้างชื่อแบบ fully-qualified เสมอ
--      SECURITY DEFINER ที่ไม่ตั้ง search_path = ช่องยกระดับสิทธิ์คลาสสิก
--      (ผู้เรียกตั้ง search_path ชี้ไปตารางปลอมของตัวเอง แล้วฟังก์ชันไปอ่านตารางนั้นด้วยสิทธิ์ postgres)

create type app.trip_role as enum ('owner', 'editor', 'viewer');

-- ── บทบาทของผู้ใช้ที่ล็อกอินอยู่ ในทริปที่ระบุ · null = ไม่ได้เป็นสมาชิก ─────────────────
--
-- `stable` ไม่ใช่ `volatile` — บอก planner ว่าค่าคงที่ภายใน statement เดียว จึงเรียกซ้ำน้อยลงมาก
-- `(select auth.uid())` ห่อ subquery ไม่เขียน `auth.uid()` เปล่า — Postgres ยก subquery เป็น
-- InitPlan ประเมินครั้งเดียวต่อ statement ถ้าเขียนเปล่าจะประเมิน **ทุกแถว** ที่สแกน
-- (ตารางโตขึ้นแล้วต่างกันเป็นสิบเท่า และเป็นเหตุผลที่คนมักโทษว่า "RLS ทำให้ช้า")
create or replace function app.trip_role(p_trip_id uuid)
returns app.trip_role
language sql
stable
security definer
set search_path = ''
as $$
  select tm.role
  from public.trip_members tm
  where tm.trip_id = p_trip_id
    and tm.user_id = (select auth.uid())
$$;

comment on function app.trip_role(uuid) is
  'บทบาทในทริป · SECURITY DEFINER เพื่อกัน infinite recursion ตอน policy ของ trip_members '
  'ต้องอ่าน trip_members เอง — ห้ามเปลี่ยนเป็น SECURITY INVOKER';

-- อ่านได้: เป็นสมาชิกบทบาทใดก็ได้
create or replace function app.can_read_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.trip_role(p_trip_id) is not null
$$;

-- เขียนได้: owner หรือ editor เท่านั้น — **viewer เขียนไม่ได้**
-- ปิดช่อง: วันนี้ไม่มีแนวคิด read-only เลย ใครเปิดเว็บได้คือแก้ได้ทุกอย่างรวมลบทั้งแผน
create or replace function app.can_write_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.trip_role(p_trip_id) in ('owner', 'editor')
$$;

-- owner เท่านั้น — ใช้กับ การเชิญ/ถอดสมาชิก · เปลี่ยนบทบาท · ลบทริป
create or replace function app.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.trip_role(p_trip_id) = 'owner'
$$;

-- ── trip_id ของวัน · ใช้กับตารางที่ผูกทริปผ่าน trip_days ไม่ได้ถือ trip_id ตรงๆ ───────────
-- ปิดช่อง: ถ้าให้ trip_stops ถือ trip_id ซ้ำไว้เองเพื่อความสะดวกของ policy จะเกิดสภาพ
-- "trip_stops.trip_id ไม่ตรงกับ trip_days.trip_id ของ trip_day_id เดียวกัน" ได้
-- ซึ่งคือ tenant ปลอมที่ policy ตรวจไม่เจอ — ยอมจ่ายค่า join แล้วมีแหล่งความจริงเดียวดีกว่า
create or replace function app.trip_id_of_day(p_trip_day_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select td.trip_id from public.trip_days td where td.id = p_trip_day_id
$$;

create or replace function app.can_read_day(p_trip_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_read_trip(app.trip_id_of_day(p_trip_day_id))
$$;

create or replace function app.can_write_day(p_trip_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_write_trip(app.trip_id_of_day(p_trip_day_id))
$$;

-- ── trip_id ทั้งหมดที่ผู้ใช้นี้แตะได้ · ใช้กับ storage.objects ที่ทำ join ไม่ได้ ────────────
create or replace function app.my_trip_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.trip_id from public.trip_members tm where tm.user_id = (select auth.uid())
$$;

create or replace function app.my_writable_trip_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.trip_id
  from public.trip_members tm
  where tm.user_id = (select auth.uid())
    and tm.role in ('owner', 'editor')
$$;

-- ── มีทริปร่วมกันไหม · ใช้กับ profiles ───────────────────────────────────────────────
-- ปิดช่อง: UI ต้องโชว์ "เพิ่มโดย แอน" ได้ จึงต้องอ่าน display_name ของคนอื่น
-- แต่ต้องอ่านได้**เฉพาะคนที่อยู่ทริปเดียวกัน** ไม่ใช่ทุกคนในระบบ
-- (ถ้าเปิดหมด = ไดเรกทอรีผู้ใช้ทั้งแพลตฟอร์มให้ใครก็ดึงได้ = ข้อมูลส่วนบุคคลรั่วโดยไม่ต้องแฮ็ก)
create or replace function app.shares_trip_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  )
$$;

-- helper ทุกตัวต้องเรียกได้จาก policy ที่รันในบริบทผู้ใช้
grant execute on all functions in schema app to authenticated;
-- anon ไม่ต้องเรียกอะไรเลย — ทุก policy ข้อมูลผู้ใช้เป็น `to authenticated`
revoke execute on all functions in schema app from anon;


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 4 — ตารางแกนของ tenancy (ของใหม่ ยังไม่มีในวันนี้)
-- ═══════════════════════════════════════════════════════════════════════════════
-- DDL ข้างล่างเขียนแบบย่อเพื่อให้ policy อ่านรู้เรื่อง — DDL ตัวจริงเป็นของ P1 ใน
-- docs/engine/architecture.md + docs/engine/schema/ · ถ้าคอลัมน์ไม่ตรงกัน **ยึดของ P1**

-- ── 4.1 profiles ───────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- อ่าน: ตัวเอง + คนที่อยู่ทริปเดียวกัน
create policy "profiles: read self and co-members"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_trip_with(id));
-- ปิดช่อง: ดึงรายชื่อผู้ใช้ทั้งแพลตฟอร์ม (user enumeration) ด้วย GET /rest/v1/profiles
-- ซึ่งเป็นสิ่งที่ `using (true)` แบบวันนี้ยอมให้ทำได้ทันทีถ้าตารางนี้มีอยู่

create policy "profiles: insert self only"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
-- ปิดช่อง: สร้างโปรไฟล์สวมรอย uuid คนอื่นดักไว้ล่วงหน้า ก่อนที่เจ้าตัวจะสมัคร
-- (ถ้าแถวมีอยู่แล้ว เจ้าตัวจะสมัครแล้วได้โปรไฟล์ที่คนอื่นคุมชื่อ/ภาษาไว้)
-- หมายเหตุ: ทางที่แนะนำจริงคือ trigger on auth.users แล้วไม่เปิด insert ให้ client เลย (ส่วนที่ 9)

create policy "profiles: update self only"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- ปิดช่อง: แก้โปรไฟล์คนอื่น · `with check` เขียนซ้ำเพื่อกัน "แก้แถวตัวเองแต่เปลี่ยน id
-- เป็นของคนอื่น" = ยึดแถวข้ามผู้ใช้ (UPDATE ที่ไม่มี with check เปิดช่องนี้เสมอ)

-- ไม่มี DELETE policy — ลบบัญชีต้องผ่าน flow ที่จัดการทริปที่ตัวเองเป็น owner คนเดียวก่อน
-- ปล่อยให้ลบเองตรงๆ = ทริปกลายเป็นของกำพร้าที่ไม่มีใครเชิญคนเพิ่มได้อีกเลย

-- ── 4.2 trips ──────────────────────────────────────────────────────────────────────
alter table public.trips enable row level security;

create policy "trips: read if member"
  on public.trips for select to authenticated
  using (app.can_read_trip(id));
-- ปิดช่อง: **cross-tenant read** — หัวใจของงานนี้ · วันนี้ไม่มีตารางนี้ ทุกคนเห็นทริปเดียวกันหมด
-- พอเป็นแพลตฟอร์ม การไม่มีบรรทัดนี้ = GET /rest/v1/trips คืนทริปของทุกคนบนโลก

create policy "trips: create own only"
  on public.trips for insert to authenticated
  with check (owner_id = (select auth.uid()));
-- ปิดช่อง: สร้างทริปแล้วยัด owner_id เป็น uuid คนอื่น (ทริปโผล่ในบัญชีเหยื่อ + เหยื่อรับผิด
-- ต่อเนื้อหาที่เราใส่) · หมายเหตุ: แถว trip_members ของ owner สร้างด้วย trigger ไม่ใช่ client
-- เพราะจังหวะนี้ผู้สร้างยังไม่เป็นสมาชิก → policy ของ trip_members จะปฏิเสธ (ดูส่วนที่ 9)

create policy "trips: owner updates"
  on public.trips for update to authenticated
  using (app.is_trip_owner(id))
  with check (app.is_trip_owner(id));
-- ปิดช่อง: editor เปลี่ยนชื่อ/ช่วงวัน/สถานะทริป หรือ **โอนทริปให้ตัวเองด้วยการเขียน owner_id ทับ**
-- `with check` ประเมินหลังแก้ → คนที่เขียน owner_id เป็นของตัวเองจะทำให้ is_trip_owner(id)
-- เป็นเท็จในสายตาของ policy (เพราะยังตัดสินจาก trip_members ไม่ใช่จาก owner_id) จึงถูกปฏิเสธ
-- ⚠️ การโอนสิทธิ์ owner ต้องทำผ่าน trip_members + ฟังก์ชันเฉพาะ ไม่ใช่ UPDATE คอลัมน์นี้ (ส่วนที่ 9)

create policy "trips: owner deletes"
  on public.trips for delete to authenticated
  using (app.is_trip_owner(id));
-- ปิดช่อง: editor ลบทริปทั้งก้อน · วันนี้ใครก็ลบ trip_plans ได้ซึ่ง cascade ทิ้ง trip_stops ทั้งแผน

-- ── 4.3 trip_members — แหล่งความจริงเดียวของสิทธิ์ ─────────────────────────────────
alter table public.trip_members enable row level security;

-- 🔴 ห้ามเพิ่มบรรทัดนี้: alter table public.trip_members force row level security;
--    จะทำให้ helper ในส่วนที่ 3 ตกอยู่ใต้ RLS แล้ว recursion กลับมาทันที

create policy "trip_members: read roster of my trips"
  on public.trip_members for select to authenticated
  using (app.can_read_trip(trip_id));
-- ปิดช่อง: ไล่อ่านว่าใครอยู่ทริปไหนทั้งแพลตฟอร์ม (social graph รั่ว)
-- ใช้ helper ไม่ใช่ subquery ตรงๆ — เขียน `using (exists (select 1 from trip_members ...))`
-- ตรงนี้คือจุดที่ recursion เกิด

create policy "trip_members: owner invites"
  on public.trip_members for insert to authenticated
  with check (app.is_trip_owner(trip_id));
-- ปิดช่อง 2 อย่างพร้อมกัน:
--   ก. **self-join** — เขียนแถว (trip_id ของคนอื่น, user_id ตัวเอง, 'viewer') เพื่อแทรกตัวเอง
--      เข้าทริปคนแปลกหน้า · นี่คือช่องที่ร้ายที่สุดของตารางนี้เพราะได้สิทธิ์อ่านทุกอย่างต่อ
--   ข. editor ชวนคนนอกเข้ามาเอง

create policy "trip_members: owner changes roles"
  on public.trip_members for update to authenticated
  using (app.is_trip_owner(trip_id))
  with check (app.is_trip_owner(trip_id));
-- ปิดช่อง: **privilege escalation** — editor/viewer แก้ role ของแถวตัวเองเป็น 'owner'
-- ต้องมีทั้ง using และ with check: using กันแก้แถวที่ไม่ใช่ทริปเรา · with check กัน
-- "ย้ายแถวไปทริปอื่น" ด้วยการเขียน trip_id ทับ (เป็นสมาชิกทริป A แล้วโยกแถวตัวเองเข้าทริป B)

create policy "trip_members: owner removes, or member leaves"
  on public.trip_members for delete to authenticated
  using (app.is_trip_owner(trip_id) or user_id = (select auth.uid()));
-- ปิดช่อง: editor เตะสมาชิกคนอื่นออก (รวมเตะ owner ออกแล้วยึดทริป)
-- ส่วน `user_id = auth.uid()` คือสิทธิ์ "ออกจากทริปเอง" ซึ่งจำเป็นและไม่เป็นอันตราย
-- ⚠️ ต้องมี trigger กัน owner คนสุดท้ายออกจากทริป — RLS นับ "คนสุดท้าย" ไม่ได้ (ส่วนที่ 9)

-- ── 4.4 trip_days — แทน day_id "d0"–"d10" ที่ฝังใน data/itinerary.ts ─────────────────
alter table public.trip_days enable row level security;

create policy "trip_days: read if member"
  on public.trip_days for select to authenticated
  using (app.can_read_trip(trip_id));

create policy "trip_days: editor writes"
  on public.trip_days for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy "trip_days: editor updates"
  on public.trip_days for update to authenticated
  using (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));
-- ปิดช่อง: **ย้ายวันข้ามทริป** — แก้ trip_days.trip_id เป็นทริปที่เราไม่ได้เป็นสมาชิก
-- แล้วจุดแวะทั้งวันก็ไหลตามไปด้วย เพราะ trip_stops ผูกกับ trip_day_id ไม่ได้ผูก trip_id
-- `with check` เป็นบรรทัดเดียวที่กันเรื่องนี้ · ตัดออกแล้วรูใหญ่กว่าที่เห็น

create policy "trip_days: editor deletes"
  on public.trip_days for delete to authenticated
  using (app.can_write_trip(trip_id));

-- คอลัมน์ is_locked (มาจาก trip_day_settings.is_locked วันนี้) บังคับด้วย trigger ไม่ใช่ policy
-- เพราะต้องล็อกเฉพาะคอลัมน์เชิงโครงสร้าง แต่ยังให้ติ๊ก visited_at ได้ — ดูส่วนที่ 9


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 5 — 14 ตารางของวันนี้ แมปเข้าโมเดลใหม่ (ครบทุกตัว ไม่ตกสักตาราง)
--             ผลลัพธ์คือ **13 ตารางที่มี policy + 1 ตารางที่ถูก drop** ตรงกับเกณฑ์ 13 ตาราง
--             ของ D13 · ตัวที่ถูก drop คือ `trip_selections` (ดูส่วนที่ 5.1)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- สรุปการแมป (ตรวจของจริงจาก 31 migrations แล้ว):
--   #  ตารางวันนี้            policy วันนี้   ปลายทางระยะ 2
--   1  trip_selections        4 (S/I/U/D)   **DROP** — ตารางตาย ไม่มีใครอ้างทั้ง repo (ส่วนที่ 5.1)
--   2  trip_hotels            4             public.trip_hotels + trip_id
--   3  trip_plans             4             public.trip_plans + trip_id
--   4  trip_meta              3 (S/I/U)     ยุบเข้า public.trip_settings (1 แถว/ทริป)
--   5  place_photo_cache      3 (S/I/U)     → cache.place_photo (ส่วนที่ 7)
--   6  custom_places          4             public.trip_places + trip_id
--   7  trip_stops             4             public.trip_stops ผูกผ่าน trip_day_id
--   8  trip_day_settings      3 (S/I/U)     ยุบเป็นคอลัมน์ของ public.trip_days
--   9  hidden_places          3 (S/I/D)     public.trip_hidden_places + trip_id
--  10  travel_time_cache      2 (S/I) 🔴    → cache.travel_time (ส่วนที่ 7 — บั๊กอยู่ตรงนี้)
--  11  place_details_cache    3 (S/I/U)     → cache.place_details (ส่วนที่ 7)
--  12  bookings               4             public.bookings + trip_id · แยก secret ออก (ส่วนที่ 5.9)
--  13  checklist_items        4             public.checklist_items + trip_id
--  14  place_notes            4             public.place_notes + trip_id
--   +  storage.objects        4 (bucket_id) ส่วนที่ 8
--                            ─────
--                            53 ตัว ✓ ตรงกับที่ P1 นับ

-- ── 5.1 trip_selections — ตัดสินว่า DROP ไม่ใช่เขียน policy ให้ ────────────────────────
--
-- ยืนยันแล้วว่าตายจริง: `grep -rn "trip_selections" app/ lib/ hooks/ components/` = 0 บรรทัด
-- ถูกแทนด้วย trip_stops ตั้งแต่ migration 0006 แต่ยังอยู่ในตาราง **และยังอยู่ใน
-- publication supabase_realtime** ด้วย
--
-- เขียน policy ให้ตารางที่ไม่มีใครใช้ = พื้นที่โจมตีที่ไม่มีใครทดสอบและไม่มีใครดูแล
-- ระยะ 2 ให้ทิ้ง ไม่ต้องย้าย:
--   drop table if exists public.trip_selections;   -- ทำใน migration ของ E2 (P1)
-- ⚠️ อยู่ใน realtime publication → ต้องถอดออกก่อน drop ไม่ให้ publication ค้างอ้างตารางที่หายไป
--   alter publication supabase_realtime drop table public.trip_selections;
-- 🔴 ห้ามรันสองบรรทัดนี้กับ DB ทริปจริงระหว่าง freeze — ไม่มีอะไรเสียถ้าปล่อยไว้จนจบทริป

-- ── 5.2 trip_hotels — ที่พักต่อ leg ──────────────────────────────────────────────────
alter table public.trip_hotels enable row level security;

create policy "trip_hotels: read if member"
  on public.trip_hotels for select to authenticated
  using (app.can_read_trip(trip_id));
-- ปิดช่อง: **ที่พักคือข้อมูลว่าคนนี้นอนที่ไหน คืนไหน** · migration 0026 เพิ่ม name_en/address_en/phone
-- เข้ามาเพื่อกรอกแบบฟอร์ม ตม./K-ETA → แถวนี้คือที่อยู่จริงพร้อมเบอร์ติดต่อ
-- วันนี้ `using (true)` = ใครถือ anon key ก็รู้ว่าคน 2 คนนี้นอนโรงแรมไหนคืนไหนครบทั้งทริป
-- ในบริบทหลาย tenant นี่คือข้อมูลที่ใช้สะกดรอยได้ตรงๆ จัดเป็นความเสียหายสูงสุดร่วมกับ bookings

create policy "trip_hotels: editor writes"
  on public.trip_hotels for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy "trip_hotels: editor updates"
  on public.trip_hotels for update to authenticated
  using (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));
-- ปิดช่อง: viewer แก้ที่พัก · และ "ย้ายที่พักข้ามทริป" ด้วยการเขียน trip_id ทับ
-- (hooks/useHotels.tsx:129 ใช้ upsert → ต้องมี UPDATE policy ครบ ไม่ใช่แค่ INSERT
--  ดูบทเรียนจาก travel_time_cache ในส่วนที่ 7)

create policy "trip_hotels: editor deletes"
  on public.trip_hotels for delete to authenticated
  using (app.can_write_trip(trip_id));

-- ── 5.3 trip_plans — แผน A/B ต่อทริป ─────────────────────────────────────────────────
alter table public.trip_plans enable row level security;

create policy "trip_plans: read if member"
  on public.trip_plans for select to authenticated
  using (app.can_read_trip(trip_id));

create policy "trip_plans: editor writes"
  on public.trip_plans for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy "trip_plans: editor updates"
  on public.trip_plans for update to authenticated
  using (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));

create policy "trip_plans: editor deletes"
  on public.trip_plans for delete to authenticated
  using (app.can_write_trip(trip_id));
-- ปิดช่อง: วันนี้ DELETE เป็น `using (true)` และ trip_stops.plan_id เป็น
-- `references trip_plans(id) on delete cascade` (migration 0006:4)
-- → **ใครก็ลบแผนของใครก็ได้ แล้วจุดแวะทั้งแผนหายตามไปทั้งชุดในคำสั่งเดียว**
-- นี่คือช่องทำลายข้อมูลที่ถูกที่สุดในสคีมาวันนี้ ไม่ต้องรู้อะไรเลยนอกจาก plan id

-- ── 5.4 trip_settings — แทน trip_meta (แถวเดียว id=1 ทั้งระบบ) ────────────────────────
--
-- trip_meta วันนี้เป็น `id int primary key default 1` + `check (id = 1)` = **แถวเดียวทั้งฐานข้อมูล**
-- ซึ่งเป็นการเข้ารหัสสมมติฐาน "ทั้งระบบมีทริปเดียว" ลงไปใน constraint
-- ระยะ 2: 1 แถวต่อ 1 ทริป → PK เป็น trip_id · active_plan_id/overnight_overrides ตามมา
alter table public.trip_settings enable row level security;

create policy "trip_settings: read if member"
  on public.trip_settings for select to authenticated
  using (app.can_read_trip(trip_id));

create policy "trip_settings: editor writes"
  on public.trip_settings for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy "trip_settings: editor updates"
  on public.trip_settings for update to authenticated
  using (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));
-- ปิดช่อง: viewer สลับแผนที่ทุกคนกำลังดู (trip_meta.active_plan_id เป็นค่ากลางที่ทุก client
-- subscribe อยู่ → เปลี่ยนค่านี้คือเปลี่ยนหน้าจอของสมาชิกคนอื่นทุกคนแบบ realtime)
-- ต้องมี UPDATE policy: hooks/usePlans.ts:128,165,179 และ useOvernightOverrides.ts:74 ใช้ upsert

-- ไม่มี DELETE policy — แถว settings ตายไปกับทริปผ่าน on delete cascade ของ trip_id
-- เปิด DELETE ให้ client = ปุ่มลบค่าตั้งของทริปที่ไม่มี UI ไหนต้องใช้

-- ── 5.5 custom_places → trip_places ──────────────────────────────────────────────────
--
-- ตัดสิน: **ผูกกับทริป ไม่ใช่ผูกกับผู้ใช้** · เหตุผล: สถานที่ที่เพิ่มเองเกิดจากการวางแผนร่วมกัน
-- ถ้าผูกกับผู้ใช้ พอคนที่เพิ่มออกจากทริป จุดแวะที่อ้างสถานที่นั้นจะกลายเป็นแถวกำพร้าทันที
alter table public.trip_places enable row level security;

create policy "trip_places: read if member"
  on public.trip_places for select to authenticated
  using (app.can_read_trip(trip_id));

create policy "trip_places: editor writes"
  on public.trip_places for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy "trip_places: editor updates"
  on public.trip_places for update to authenticated
  using (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));

create policy "trip_places: editor deletes"
  on public.trip_places for delete to authenticated
  using (app.can_write_trip(trip_id));
-- ปิดช่อง: viewer ลบสถานที่ในคลังของทริปทิ้ง (destructive ไม่ย้อนกลับ ไม่มี soft delete)

-- ── 5.6 trip_stops — ผูกทริปผ่าน trip_day_id ─────────────────────────────────────────
alter table public.trip_stops enable row level security;

create policy "trip_stops: read if member"
  on public.trip_stops for select to authenticated
  using (app.can_read_day(trip_day_id));
-- ปิดช่อง: **ตารางนี้คือทั้งทริป** — ไปไหน กี่โมง ค้างที่ไหน (มี visited_at = เวลาที่อยู่จุดนั้นจริง
-- migration 0020) + transfer_target_label ที่มีเลขไฟลต์จริง (0025) เช่น 'VN409 อินชอน → โฮจิมินห์'
-- วันนี้ `using (true)` = ไล่ดูได้ว่าเจ้าของทริปอยู่ตรงไหนตอนไหนย้อนหลังได้ทั้งทริป

create policy "trip_stops: editor writes"
  on public.trip_stops for insert to authenticated
  with check (app.can_write_day(trip_day_id));

create policy "trip_stops: editor updates"
  on public.trip_stops for update to authenticated
  using (app.can_write_day(trip_day_id))
  with check (app.can_write_day(trip_day_id));
-- 🔴 `with check` สำคัญที่สุดในไฟล์นี้: ปิดช่อง **ย้ายจุดแวะเข้าทริปคนอื่น** ด้วยการเขียน
-- trip_day_id ทับเป็นวันของทริปที่เราไม่ได้เป็นสมาชิก · ถ้ามีแต่ `using` จะกันได้แค่ขาเข้า
-- (แก้แถวที่เห็น) แต่ไม่กันขาออก (ผลลัพธ์หลังแก้ไปโผล่ที่ไหน) — เป็นช่องที่ทีมส่วนใหญ่พลาด
-- เพราะ Postgres ใช้ `using` แทน `with check` ให้เองเมื่อไม่เขียน จึง "ดูเหมือนผ่าน" ในเทสต์
-- ที่ทดสอบแค่ขาอ่าน → ต้องมีเคสเทสต์ตรงๆ (security-review.md เคส T-07)

create policy "trip_stops: editor deletes"
  on public.trip_stops for delete to authenticated
  using (app.can_write_day(trip_day_id));

-- ── 5.7 hidden_places → trip_hidden_places ───────────────────────────────────────────
alter table public.trip_hidden_places enable row level security;

create policy "trip_hidden_places: read if member"
  on public.trip_hidden_places for select to authenticated
  using (app.can_read_trip(trip_id));

create policy "trip_hidden_places: editor writes"
  on public.trip_hidden_places for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy "trip_hidden_places: editor deletes"
  on public.trip_hidden_places for delete to authenticated
  using (app.can_write_trip(trip_id));

-- ไม่มี UPDATE policy — **ตั้งใจ และตรงกับโค้ด** · hooks/useHiddenPlaces.ts ใช้แค่
-- insert (บรรทัด 89) กับ delete (บรรทัด 100) ไม่มี update/upsert เลย
-- ตรวจแล้วว่าไม่ใช่กรณีเดียวกับ travel_time_cache (ส่วนที่ 7) ที่โค้ดเรียก upsert แต่ policy ขาด
-- 🔴 กติกาที่ควรถือ: **policy set ต้องตรงกับ verb ที่โค้ดใช้จริง** เกินไปคือพื้นที่โจมตี
--    ขาดไปคือบั๊กที่พังเงียบ — ทั้งสองอย่างต้องพิสูจน์ด้วย grep ไม่ใช่ด้วยความรู้สึก

-- ── 5.8 place_notes ──────────────────────────────────────────────────────────────────
alter table public.place_notes enable row level security;

create policy "place_notes: read if member"
  on public.place_notes for select to authenticated
  using (app.can_read_trip(trip_id));

create policy "place_notes: editor writes"
  on public.place_notes for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy "place_notes: editor updates"
  on public.place_notes for update to authenticated
  using (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));
-- ต้องมี UPDATE: hooks/usePlaceNotes.ts:113 ใช้ upsert

create policy "place_notes: editor deletes"
  on public.place_notes for delete to authenticated
  using (app.can_write_trip(trip_id));

-- ── 5.9 bookings — ตารางที่อ่อนไหวที่สุดในระบบ ────────────────────────────────────────
--
-- ข้อมูลที่อยู่ในนี้จริง (ดู lib/supabase.ts:128-148): confirmation_number · เลขไฟลต์ใน title
-- · วันเวลาเดินทาง · file_url ที่ชี้ไปรูปตั๋วซึ่งมี **ชื่อตามพาสปอร์ต** อยู่บนหน้าตั๋ว
-- ชุดนี้พอสำหรับโทรเข้า call center สายการบินแล้วอ้างเป็นเจ้าของการจอง = เปลี่ยน/ยกเลิกตั๋วคนอื่นได้
-- จึงจัดเป็น **ความเสียหายอันดับ 1** ในตารางจัดลำดับของ security-review.md
alter table public.bookings enable row level security;

create policy "bookings: read if member"
  on public.bookings for select to authenticated
  using (app.can_read_trip(trip_id));

create policy "bookings: editor writes"
  on public.bookings for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy "bookings: editor updates"
  on public.bookings for update to authenticated
  using (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));

create policy "bookings: editor deletes"
  on public.bookings for delete to authenticated
  using (app.can_write_trip(trip_id));

-- ── 5.9.1 ข้อจำกัดที่ต้องพูดตรงๆ: RLS ซ่อน confirmation_number จาก viewer ไม่ได้ ─────
--
-- RLS กรองแถว ไม่กรองคอลัมน์ · policy อ่านข้างบนให้ viewer เห็น **ทุกคอลัมน์** รวมเลขที่จอง
-- ถ้าโมเดล viewer หมายถึง "ให้เพื่อนดูแผนได้แต่ไม่ต้องเห็นเลขที่จอง" มี 2 ทาง:
--
--   ทาง ก. column GRANT — `revoke select (confirmation_number) ...`
--          ❌ ไม่ได้ผล: GRANT ผูกกับ **role** ของ Postgres (authenticated) ไม่ผูกกับบทบาทในทริป
--          คนเดียวกันเป็น owner ทริป A และ viewer ทริป B พร้อมกันได้ → แยกด้วย GRANT ไม่ได้เลย
--
--   ทาง ข. **แยกตาราง** (เลือกทางนี้) — ย้ายคอลัมน์อ่อนไหวไป bookings_secret(booking_id PK)
--          แล้วให้ policy ของตารางนั้นเป็น can_write_trip (= owner/editor) ไม่ใช่ can_read_trip
--          ได้ผลเพราะกลับไปเป็นการกรอง "แถว" ซึ่ง RLS ทำได้ และบทบาทมาจาก trip_members
--          ราคาที่จ่าย: 1 join เพิ่มในหน้าที่โชว์ตั๋ว — ถูกกว่าการอธิบายให้ผู้ใช้ฟังว่า
--          ทำไมเพื่อนที่เชิญมาดูแผนเห็นเลขที่จองตั๋วเครื่องบิน
alter table public.bookings_secret enable row level security;

create policy "bookings_secret: editor reads"
  on public.bookings_secret for select to authenticated
  using (app.can_write_trip((select b.trip_id from public.bookings b where b.id = booking_id)));
-- ปิดช่อง: viewer อ่านเลขที่จอง/ชื่อบนตั๋ว · สังเกตว่า **ใช้ can_write_trip เป็นเงื่อนไขของการ read**
-- โดยตั้งใจ — "อ่านความลับได้" ผูกกับสิทธิ์แก้ ไม่ใช่สิทธิ์ดู

create policy "bookings_secret: editor writes"
  on public.bookings_secret for insert to authenticated
  with check (app.can_write_trip((select b.trip_id from public.bookings b where b.id = booking_id)));

create policy "bookings_secret: editor updates"
  on public.bookings_secret for update to authenticated
  using (app.can_write_trip((select b.trip_id from public.bookings b where b.id = booking_id)))
  with check (app.can_write_trip((select b.trip_id from public.bookings b where b.id = booking_id)));

create policy "bookings_secret: editor deletes"
  on public.bookings_secret for delete to authenticated
  using (app.can_write_trip((select b.trip_id from public.bookings b where b.id = booking_id)));

-- ── 5.10 checklist_items ─────────────────────────────────────────────────────────────
alter table public.checklist_items enable row level security;

create policy "checklist_items: read if member"
  on public.checklist_items for select to authenticated
  using (app.can_read_trip(trip_id));

create policy "checklist_items: editor writes"
  on public.checklist_items for insert to authenticated
  with check (app.can_write_trip(trip_id));

create policy "checklist_items: editor updates"
  on public.checklist_items for update to authenticated
  using (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));

create policy "checklist_items: editor deletes"
  on public.checklist_items for delete to authenticated
  using (app.can_write_trip(trip_id));

-- ── 5.11 RESTRICTIVE: ทริปที่ปิดแล้วห้ามเขียน ─────────────────────────────────────────
--
-- `as restrictive` ต่างจาก policy ปกติ: policy ธรรมดาต่อกันด้วย OR (มีตัวใดผ่านก็ผ่าน)
-- ส่วน restrictive ต่อด้วย AND (ต้องผ่านทุกตัว) → ใช้เป็น "เงื่อนไขที่ลืมไม่ได้"
--
-- ทำไมไม่ยัดเงื่อนไขนี้เข้าไปใน can_write_trip ให้จบ: เพราะแยกไว้แล้ว **อ่านออกจาก
-- pg_policies ได้ว่ามีกฎนี้อยู่** และเวลาเพิ่มตารางใหม่ในเฟสหน้า การตกหล่นจะเห็นชัด
-- ตรงข้ามกับการซ่อนไว้ในฟังก์ชันซึ่งไม่มีใครรู้ว่ามีจนกว่าจะไปอ่านตัว body
create policy "bookings: no writes to archived trip"
  on public.bookings as restrictive for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.status <> 'archived'))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.status <> 'archived'));

create policy "trip_stops: no writes to archived trip"
  on public.trip_stops as restrictive for all to authenticated
  using (exists (
    select 1 from public.trips t
    where t.id = app.trip_id_of_day(trip_day_id) and t.status <> 'archived'
  ))
  with check (exists (
    select 1 from public.trips t
    where t.id = app.trip_id_of_day(trip_day_id) and t.status <> 'archived'
  ));
-- ⚠️ ต้องเติมคู่แบบนี้ให้ทุกตารางเนื้อหาที่เหลือตอน E2 · ที่ยกมา 2 ตัวคือรูปแบบตัวอย่าง
--    เคสเทสต์ T-12 ใน security-review.md ไล่เช็คว่าไม่มีตารางไหนตกหล่น


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 6 — catalog: อ่านสาธารณะ เขียนไม่ได้เลย
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 5 ตารางตามที่ P1 ออกแบบ · เปิด RLS **ทั้งที่เปิดอ่านให้ทุกคน** เพราะ RLS ที่เปิดอยู่
-- คือสิ่งที่ทำให้ "ไม่มี policy เขียน" มีผลเป็นการปฏิเสธ ถ้าไม่เปิด RLS ค่า GRANT
-- จะเป็นตัวตัดสินเพียงลำพัง ซึ่งเปราะกว่าและพลาดได้จาก default privileges ที่ลืมแก้

alter table catalog.countries          enable row level security;
alter table catalog.cities             enable row level security;
alter table catalog.places             enable row level security;
alter table catalog.transfer_points    enable row level security;
alter table catalog.emergency_contacts enable row level security;

create policy "countries: public read"
  on catalog.countries for select to anon, authenticated using (true);
create policy "cities: public read"
  on catalog.cities for select to anon, authenticated using (true);
create policy "places: public read"
  on catalog.places for select to anon, authenticated using (true);
create policy "transfer_points: public read"
  on catalog.transfer_points for select to anon, authenticated using (true);
create policy "emergency_contacts: public read"
  on catalog.emergency_contacts for select to anon, authenticated using (true);

-- 🔴 `using (true)` 5 ตัวนี้เป็นตัวเดียวในไฟล์ที่เป็น true อย่างตั้งใจ
--    เกณฑ์ที่ทำให้ยอมรับได้ และต้องตรวจก่อนเพิ่มตารางใหม่เข้า catalog:
--      1. ไม่มีแถวใดเป็นของผู้ใช้คนใด (ไม่มีคอลัมน์ที่ชี้กลับไปหา trip/user)
--      2. เนื้อหาเป็นข้อมูลที่เปิดเผยอยู่แล้วในโลกจริง (ชื่อเมือง เบอร์ฉุกเฉิน พิกัดสถานที่)
--      3. **ไม่มี policy เขียนเลย** — ถ้าจะเพิ่มสักตัว ต้องรีวิวใหม่ทั้งข้อ
--    ตารางไหนตอบไม่ครบ 3 ข้อ = ไม่ใช่ catalog ให้ไปอยู่ public แล้วกันด้วย trip_members
--
-- ⚠️ ข้อ 2 มีข้อยกเว้นที่ต้องระวังตอนย้ายข้อมูล: data/places.ts วันนี้เป็นสถานที่ที่ผู้ใช้
--    **คัดเลือกเอง** — ตัวสถานที่เปิดเผยอยู่แล้ว แต่ "รายการที่คัดไว้" บอกแผนเที่ยว
--    ตอนย้ายเข้า catalog.places ต้องย้ายเฉพาะข้อมูลสถานที่ ห้ามพารายการที่คัดไว้ไปด้วย
--    รายการที่คัดคือของทริป ต้องอยู่ public.trip_places (ส่วนที่ 5.5)


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 7 — cache: ไม่มี policy เพราะไม่มีพื้นที่โจมตี + ยืนยันบั๊กที่ P1 ให้ตรวจ
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 3 ตารางนี้ย้ายไป schema `cache` ซึ่ง **ไม่อยู่ใน db.schemas ของ Supabase**
-- → PostgREST ไม่ generate endpoint ให้ → browser เรียกไม่ได้เลย ไม่ต้องมี policy สักตัว
--   cache.place_photo    (จาก place_photo_cache)
--   cache.place_details  (จาก place_details_cache)
--   cache.travel_time    (จาก travel_time_cache)
--
-- ยังคง `enable row level security` ไว้เป็นตาข่ายชั้นสอง: ถ้าวันหนึ่งมีคนเผลอเพิ่ม `cache`
-- เข้า db.schemas ตารางจะยังปฏิเสธทุก request เพราะไม่มี policy — ไม่ใช่เปิดโล่งทันที
alter table cache.place_photo   enable row level security;
alter table cache.place_details enable row level security;
alter table cache.travel_time   enable row level security;
-- service_role ข้าม RLS อยู่แล้วโดยธรรมชาติ (มี BYPASSRLS) จึงเขียนได้ทั้งที่ไม่มี policy

-- ── 7.1 ยืนยันบั๊กที่ P1 ขอให้ตรวจ: travel_time_cache ขาด UPDATE policy ────────────────
--
-- ✅ **P1 อ่านถูก ยืนยันครบ 3 ชั้น** (ยืนยันจากไฟล์ SQL + โค้ด + ไลบรารีเท่านั้น ไม่ได้ยิง DB จริง)
--
--   ชั้น SQL   — supabase/migrations/0010_travel_time_cache.sql มี 2 policy: select (บรรทัด 15-17)
--                + insert (18-20) · **ไม่มี update** · เป็นตารางเดียวใน 14 ตารางที่มีแค่ 2 policy
--   ชั้นโค้ด   — app/api/travel-time/route.ts:61 เรียก `.upsert()` โดยไม่ส่ง option ใดเลย
--   ชั้นไลบรารี— node_modules/@supabase/postgrest-js/src/PostgrestQueryBuilder.ts:1372,1393
--                default `ignoreDuplicates = false` → ส่ง `Prefer: resolution=merge-duplicates`
--                → PostgREST แปลเป็น `INSERT ... ON CONFLICT DO UPDATE`
--
--   กลไกที่ทำให้พัง: Postgres ตรวจ `ON CONFLICT DO UPDATE` ด้วย **USING ของ UPDATE policy**
--   กับแถวที่มีอยู่ · ไม่มี UPDATE policy = ไม่มีแถวใดผ่าน = โยน error ไม่ใช่ข้ามเงียบ
--   (ต่างจาก UPDATE ธรรมดาที่แถวไม่ผ่าน using จะถูกข้ามเงียบๆ — ตรงนี้ Postgres โยน
--    `new row violates row-level security policy (USING expression)` / SQLSTATE 42501)
--   PostgREST คืน HTTP 403 · route ไม่รับ `{ error }` กลับมาดู (บรรทัด 61 ไม่ destructure) → เงียบ
--
-- ── ขอแก้ 2 จุดในบทวิเคราะห์ของ P1 ──────────────────────────────────────────────────
--
--   1. "เกิดเฉพาะตอน race" — **ถูก** และแคบกว่าที่คิดอีก · route เช็คแคชก่อนเสมอ (บรรทัด 32-47)
--      แล้ว return ทันทีเมื่อเจอ **โดยไม่ดู fetched_at เลย** → ไม่มี path ที่ตั้งใจเขียนทับแถวเก่า
--      ชนได้ทางเดียวคือ 2 request ขอคู่จุด+โหมดเดียวกันคาบเกี่ยวกันในช่วงเวลาระหว่าง
--      "เช็คแล้วไม่เจอ" ถึง "เขียน" ซึ่งเกิดจริงได้เพราะหน้าแผนยิง route นี้เป็นชุดตอนโหลด
--      และมีผู้ใช้ 2 คนเปิดพร้อมกัน
--
--   2. **ผลกระทบเป็นศูนย์ ไม่ใช่แค่ "ไม่กระทบทริป"** — และเหตุผลสำคัญกว่าข้อสรุป:
--      ใน race นั้น request ที่มาถึงก่อนเขียนสำเร็จด้วย INSERT ปกติ (ยังไม่ชน) แถวจึง
--      **มีอยู่จริงหลังจบเหตุการณ์** · ตัวที่ชนคือตัวที่มาทีหลัง ซึ่งได้ 403 เงียบแต่ค่าที่มันจะเขียน
--      เหมือนกับที่แถวมีอยู่แล้วอยู่ดี (คู่จุด+โหมดเดียวกัน) → ไม่มีข้อมูลหาย ไม่มีการยิง Google
--      ซ้ำรอบหน้า ไม่มีผลต่อโควตา · **ยืนยันว่าไม่ต้องแก้ระหว่าง freeze**
--
--   3. เพิ่มจากที่ P1 ไม่ได้พูด: ไล่ครบแล้วว่า **นี่เป็นตารางเดียวที่มีปัญหานี้**
--      `grep -rn "\.upsert(" app/ lib/ hooks/ components/` เจอ 12 จุด ทุกจุดยิงตารางที่มี
--      UPDATE policy ครบ (place_details_cache · place_photo_cache · trip_meta · place_notes
--      · trip_day_settings · trip_hotels) เหลือ travel_time_cache ตัวเดียวที่ขาด
--      → เป็นความพลาดครั้งเดียว ไม่ใช่รูปแบบที่ต้องกวาดทั้งสคีมา
--
-- บทเรียนที่เอาไปใช้กับ 49 policy ชุดใหม่: **ทุกตารางที่โค้ดเรียก upsert ต้องมี UPDATE policy**
-- ตรวจอัตโนมัติได้ ไม่ต้องพึ่งสายตา → เคส T-13 ใน security-review.md


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 8 — Storage bucket booking-files
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 🔴 นี่คือส่วนที่แย่ที่สุดของสถานะวันนี้ และแย่กว่าที่ B3 บรรยายไว้
--
-- ของจริงวันนี้ (migration 0019 + โค้ด):
--   ก. bucket ตั้งเป็น **Public** (0019:1,7 เขียนกำกับเอง · โค้ดใช้ `getPublicUrl`
--      ที่ lib/stopPhoto.ts:26 และ BookingEditModal.tsx:97)
--      → เส้นทาง `/storage/v1/object/public/booking-files/...` **ไม่ผ่าน RLS เลย**
--      policy 4 ตัวใน 0019 จึงไม่ได้กันการอ่านไฟล์แม้แต่น้อย ต่อให้เขียนดีแค่ไหน
--   ข. policy select เป็น `using (bucket_id = 'booking-files')` (0019:9-11)
--      → `POST /storage/v1/object/list/booking-files` **ไล่ชื่อไฟล์ทั้ง bucket ได้**
--   ก + ข ต่อกัน = ได้รายชื่อไฟล์ทั้งหมด แล้วเปิดอ่านทุกไฟล์ผ่าน public URL
--       ไฟล์ในนี้คือ **รูปตั๋วที่มีชื่อตามพาสปอร์ตกับเลขที่จอง**
--   ค. ชื่อไฟล์ **ไม่มี prefix ของทริปเลย** — flat ทั้ง bucket:
--        lib/stopPhoto.ts:21          `stop-photo-{stopId}-{ts}-{rand}-{ชื่อไฟล์เดิม}`
--        BookingEditModal.tsx:85      `{bookingId}-{ts}-{rand}-{ชื่อไฟล์เดิม}`
--      → เขียน policy แยก tenant ด้วย path **เป็นไปไม่ได้กับข้อมูลที่มีอยู่**
--        ต้อง rename ของเก่าตอนย้าย ไม่ใช่แค่เพิ่ม policy
--
-- 3 อย่างที่ต้องเปลี่ยนพร้อมกัน ขาดข้อใดข้อหนึ่งอีก 2 ข้อไร้ความหมาย:
--   1. bucket เป็น **private** + เข้าถึงด้วย signed URL อายุสั้น (ไม่ใช่ getPublicUrl)
--   2. path เป็น `{trip_id}/{kind}/{id}/{filename}` — segment แรกคือ tenant key
--   3. policy กรองด้วย segment แรก ไม่ใช่กรองด้วย bucket_id

-- ── 8.1 อ่าน: สมาชิกทริปนั้นเท่านั้น ──────────────────────────────────────────────────
create policy "booking-files: members read own trip folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'booking-files'
    and (storage.foldername(name))[1] in (select tid::text from app.my_trip_ids() as tid)
  );
-- ปิดช่อง: (ก) anon อ่าน/ไล่ชื่อไฟล์ — `to authenticated` ตัด anon ออกทั้งเส้น
--          (ข) tenant A ไล่ชื่อไฟล์ของ tenant B ผ่าน object/list — เงื่อนไข path กันไว้
-- เทียบเป็น text ไม่ cast `::uuid` โดยตั้งใจ: ถ้า cast แล้วเจอโฟลเดอร์ที่ชื่อไม่ใช่ uuid
-- (ไฟล์เก่าที่ยังไม่ rename) Postgres จะโยน invalid input syntax **กลางการประเมิน policy**
-- → list ทั้ง bucket พังทั้งหมดไม่ใช่แค่ไฟล์นั้น · การเทียบ text ให้ผลเป็น "ไม่ผ่าน" ซึ่งถูกต้อง

-- ── 8.2 อัปโหลด: editor เท่านั้น และลงได้แค่โฟลเดอร์ทริปตัวเอง ─────────────────────────
create policy "booking-files: editors upload to own trip folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'booking-files'
    and (storage.foldername(name))[1] in (select tid::text from app.my_writable_trip_ids() as tid)
  );
-- ปิดช่อง: (ก) anon อัปโหลดไฟล์อะไรก็ได้เข้า bucket ของคนอื่น = ที่ฝากไฟล์ฟรีบนบิลเจ้าของโปรเจกต์
--            (วันนี้ 0019:12-14 ยอมให้ทำได้ ต้องมีแค่ anon key)
--          (ข) viewer แนบไฟล์ · (ค) เขียนไฟล์ลงโฟลเดอร์ของทริปอื่น

create policy "booking-files: editors update own trip folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'booking-files'
    and (storage.foldername(name))[1] in (select tid::text from app.my_writable_trip_ids() as tid)
  )
  with check (
    bucket_id = 'booking-files'
    and (storage.foldername(name))[1] in (select tid::text from app.my_writable_trip_ids() as tid)
  );
-- ปิดช่อง: **ย้ายไฟล์ข้ามโฟลเดอร์ทริป** ด้วยการ move/rename (storage move = update ของ `name`)
-- ถ้ามีแต่ `using` จะย้ายไฟล์ตัวเองไปโผล่ในโฟลเดอร์ทริปคนอื่นได้ หรือดึงไฟล์เข้ามาหาตัวเอง

create policy "booking-files: editors delete own trip folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'booking-files'
    and (storage.foldername(name))[1] in (select tid::text from app.my_writable_trip_ids() as tid)
  );
-- ปิดช่อง: ลบไฟล์ตั๋วของทริปคนอื่นทิ้ง · วันนี้ `using (bucket_id = ...)` (0019:18-20)
-- = ใครถือ anon key ก็ **ลบรูปตั๋วทั้ง bucket ได้ในคำสั่งเดียว** โดยไม่ต้องรู้อะไรเลย
-- นี่คือช่องทำลายข้อมูลที่ร้ายที่สุดที่พบ เพราะไฟล์ตั๋วไม่มีที่สำรองในระบบ

-- ── 8.3 ที่ policy ทำแทนไม่ได้ ต้องตั้งที่ bucket ───────────────────────────────────
-- `storage.buckets`: public = false · file_size_limit = 10MB (ให้ตรงกับที่ client เช็คไว้แล้ว
--   ที่ lib/stopPhoto.ts:3 และ BookingEditModal.tsx:33 — วันนี้เพดานอยู่ **ฝั่ง client เท่านั้น**
--   ซึ่งข้ามได้ทันทีด้วยการยิง storage API ตรง) · allowed_mime_types = image/* + application/pdf
-- ⚠️ MIME ที่ client ส่งมาเชื่อไม่ได้ — จำกัดที่ bucket เป็นด่านแรก ไม่ใช่ด่านเดียว


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 9 — trigger: เงื่อนไขที่ RLS เขียนไม่ได้ (ห้ามข้าม ไม่ใช่ของเสริม)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 9.1 แถว owner ของทริปใหม่ — แก้ปัญหาไก่กับไข่ ────────────────────────────────────
-- ปัญหา: คนสร้างทริปยังไม่เป็นสมาชิก → app.is_trip_owner() เป็นเท็จ → policy
-- "trip_members: owner invites" ปฏิเสธการเขียนแถว owner ของตัวเอง → **สร้างทริปไม่ได้เลย**
-- นี่เป็นกับดักที่จะเจอตอนรัน E1 วันแรก ถ้าไม่ดักไว้ก่อนจะถูกแก้ผิดทางด้วยการเปิด
-- INSERT policy ให้กว้างขึ้น ซึ่งเปิดช่อง self-join กลับมาทันที (ส่วนที่ 4.3)
create or replace function app.tg_trip_add_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger trip_add_owner
  after insert on public.trips
  for each row execute function app.tg_trip_add_owner();

-- ── 9.2 owner คนสุดท้ายออกจากทริปไม่ได้ ──────────────────────────────────────────────
-- RLS ตัดสินได้ทีละแถว นับ "เหลือ owner กี่คน" ไม่ได้
-- ปิดช่อง: ทริปกำพร้าที่ไม่มีใครเชิญคนเพิ่ม/ลบ/เปลี่ยนบทบาทได้อีกเลย = ข้อมูลถูกขังถาวร
create or replace function app.tg_keep_one_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.trip_members
    where trip_id = old.trip_id and role = 'owner'
  ) then
    raise exception 'ทริปต้องมี owner อย่างน้อย 1 คน';
  end if;
  return null;
end;
$$;

create constraint trigger keep_one_owner
  after delete or update on public.trip_members
  deferrable initially deferred
  for each row execute function app.tg_keep_one_owner();
-- `constraint trigger` + `deferrable initially deferred` โดยตั้งใจ: การโอน owner ทำเป็น
-- 2 คำสั่งใน transaction เดียว (ตั้งคนใหม่เป็น owner แล้วลดคนเก่า) ถ้าตรวจทันทีทีละแถว
-- ลำดับใดลำดับหนึ่งจะถูกปฏิเสธทั้งที่ผลลัพธ์สุดท้ายถูกต้อง — เลื่อนไปตรวจตอน commit จึงถูก

-- ── 9.3 ล็อกวัน: บังคับที่ DB ไม่ใช่ที่ UI ────────────────────────────────────────────
--
-- 🔴 ข้อเท็จจริงที่ต้องบันทึก: `trip_day_settings.is_locked` (migration 0021) วันนี้
--    **ไม่ใช่มาตรการอะไรเลยในเชิงความปลอดภัย** — ไม่มี policy ตัวใดใน 53 ตัวอ้างคอลัมน์ไหนก็ตาม
--    (ทุกตัวเป็น `using (true)`) → การล็อกวันบังคับอยู่ในโค้ด client ล้วนๆ ยิง REST ตรงข้ามได้
--    เจตนาเดิม (กันเผลอลากบนมือถือ) สมเหตุสมผลและพอสำหรับคน 2 คนที่ไว้ใจกัน
--    แต่บนแพลตฟอร์มที่มี viewer/editor คนอื่น "ล็อกแล้ว" ต้องหมายความว่าล็อกจริง
--
-- ทำไมต้องเป็น trigger ไม่ใช่ policy: ต้องล็อกเฉพาะคอลัมน์เชิงโครงสร้าง (ลำดับ/สถานที่/วัน)
-- แต่ยังต้องให้ติ๊ก visited_at ได้ตอนอยู่หน้างาน (หน้า /today) — RLS เทียบ OLD กับ NEW ไม่ได้
-- จึงแยกไม่ออกว่า UPDATE นี้เป็นการลากจุดแวะหรือการติ๊กมาถึง
create or replace function app.tg_locked_day_structure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked boolean;
begin
  select td.is_locked into v_locked
  from public.trip_days td where td.id = new.trip_day_id;

  if coalesce(v_locked, false) and (
       new.trip_day_id  is distinct from old.trip_day_id
    or new.order_index  is distinct from old.order_index
    or new.place_id     is distinct from old.place_id
    or new.dwell_minutes is distinct from old.dwell_minutes
  ) then
    raise exception 'วันนี้ถูกล็อกไว้ — ปลดล็อกก่อนแก้ลำดับหรือสถานที่';
  end if;
  return new;
end;
$$;

create trigger locked_day_structure
  before update on public.trip_stops
  for each row execute function app.tg_locked_day_structure();

-- ── 9.4 added_by ต้องเป็น identity ไม่ใช่ข้อความที่พิมพ์เอง ────────────────────────────
--
-- วันนี้ added_by/checked_by/hidden_by มาจาก `localStorage["trip-who"]` (app/page.tsx:122,126)
-- = ข้อความอิสระที่ผู้ใช้พิมพ์เอง **เป็นป้ายตกแต่ง ไม่ใช่หลักฐาน** ใครก็พิมพ์ชื่อคนอื่นได้
-- ระยะ 2: created_by uuid references auth.users · default auth.uid() · แก้ไม่ได้หลังสร้าง
create or replace function app.tg_immutable_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by แก้ไม่ได้';
  end if;
  return new;
end;
$$;
-- ผูก trigger นี้กับทุกตารางเนื้อหาที่มี created_by ตอน E2
-- ปิดช่อง: **ปฏิเสธความรับผิด / โยนความผิด** — แก้ created_by ของแถวที่ตัวเองสร้าง
-- ให้เป็นชื่อสมาชิกคนอื่น · เป็นรากของ audit trail ทั้งระบบ ถ้าคอลัมน์นี้แก้ได้ log ทุกอย่าง
-- ที่อ้างมันก็เชื่อถือไม่ได้ตามไปด้วย (OWASP A08)


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 10 — Realtime: กับดักที่ทำให้ DELETE event หายเงียบเมื่อเปิด RLS จริง
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 11 ตารางอยู่ใน publication supabase_realtime วันนี้ (ทุกตารางยกเว้นแคช 3 ตัว)
--   trip_selections · trip_hotels · trip_plans · trip_meta · custom_places · trip_stops
--   · trip_day_settings · hidden_places · bookings · checklist_items · place_notes
--
-- 🔴 คำเตือนที่มาจากบั๊กจริงในโปรเจกต์นี้เอง: migration 0009 แก้อาการ "ลบจุดแวะแล้ว client
--    อื่นไม่เห็น" ด้วย `replica identity full` เพราะ DELETE payload ของ Postgres มีแค่คอลัมน์
--    ใน replica identity (ปกติ = PK) จึงไม่มี plan_id ให้ filter ฝั่ง client ประเมิน
--
--    **เปิด RLS แล้วปัญหาเดิมกลับมาในรูปแบบใหม่ กับทุกตาราง ไม่ใช่แค่ trip_stops**
--    เพราะ Realtime ต้องประเมิน policy ของผู้ subscribe กับแถวที่เปลี่ยน เพื่อตัดสินว่า
--    จะส่ง event ให้คนนี้ไหม · policy ทั้งหมดในไฟล์นี้อ้าง trip_id (หรือ trip_day_id)
--    ถ้า DELETE payload มีแค่ PK → ประเมิน policy ไม่ได้ → **event ถูกทิ้งเงียบ**
--    อาการปลายทางเหมือนบั๊ก 0009 เป๊ะ: ลบสำเร็จใน DB แต่จอคนอื่นยังโชว์ของที่ลบไปแล้ว
--    จนกดรีโหลด — และคราวนี้ filter ฝั่ง client ไม่ใช่ต้นเหตุ จะไล่หาผิดที่
--
--    → ทุกตารางที่ทั้ง (ก) อยู่ใน publication และ (ข) มี policy ที่อ้างคอลัมน์นอก PK
--      ต้องสั่ง `replica identity full` · trip_stops มีแล้ว (0009) ที่เหลือต้องเติม
--      ยกเว้น place_notes ที่ PK เป็น (plan_id, place_id) จึงมี tenant key อยู่ใน PK แล้ว
--      แต่ถ้า policy ใหม่อ้าง trip_id ซึ่งไม่ได้อยู่ใน PK ก็ต้องเติมด้วย
--
--    ราคาที่จ่าย: WAL โตขึ้นเพราะ log ทั้งแถวตอน update/delete — ตารางขนาดนี้ไม่มีนัยสำคัญ
--    ⚠️ ข้อนี้สรุปจากกลไก WAL + โค้ด migration 0009 **ยังไม่ได้ยิงยืนยันกับ Supabase local**
--       (ห้ามแตะ DB จริงระหว่าง freeze) → เป็นเคสเทสต์ T-14 ต้องพิสูจน์เป็นข้อแรกของ E1
--
-- ยังต้องทำ: ถอด trip_selections ออกจาก publication ตอน drop (ส่วนที่ 5.1)
--            และตัดสินว่าจะย้ายไป Realtime Authorization (realtime.messages + private channel)
--            ซึ่งเป็นทางที่ Supabase แนะนำสำหรับ multi-tenant — เรื่องนี้เป็นของ P1/P3 ตัดสิน


-- ═══════════════════════════════════════════════════════════════════════════════
-- ส่วนที่ 11 — self-check: query ที่จับความพลาดชุดนี้ได้ ถ้ามีตั้งแต่แรก
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ให้ P6 เอา 3 query นี้ไปเป็น step ใน CI (ดู docs/engine/devops.md)
-- ทั้งสามอ่าน catalog ของ Postgres ไม่ต้องมีข้อมูลทดสอบ จึงรันเร็วและไม่มี false negative
-- จากการที่ fixture ไม่ครอบ

-- 11.1 มี policy ไหนยัง true อยู่ · คาดหวัง: เฉพาะ 5 ตัวใน schema catalog เท่านั้น
--      🔴 query นี้ตัวเดียวจับ B2 ได้ทั้งข้อ ถ้ามีอยู่ใน CI ตั้งแต่ migration 0001
select schemaname, tablename, policyname, cmd
from pg_policies
where (qual = 'true' or with_check = 'true')
  and schemaname not in ('catalog')
order by schemaname, tablename;

-- 11.2 ตารางไหนเปิด RLS แต่ไม่มี policy เลย (= ตายสนิท เขียนอะไรก็ไม่ได้ พังเงียบตอน runtime)
--      หรือมีตารางไหนใน public ที่ลืมเปิด RLS (= เปิดโล่ง)
select c.relnamespace::regnamespace as schema, c.relname,
       c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p
         where p.schemaname = c.relnamespace::regnamespace::text
           and p.tablename = c.relname) as policy_count
from pg_class c
where c.relkind = 'r'
  and c.relnamespace::regnamespace::text in ('public', 'catalog', 'cache')
  and (c.relrowsecurity = false or not exists (
        select 1 from pg_policies p
        where p.schemaname = c.relnamespace::regnamespace::text
          and p.tablename = c.relname))
order by 1, 2;

-- 11.3 policy ไหนเปิดให้ anon แตะข้อมูลผู้ใช้ · คาดหวัง 0 แถว
--      (ปิดช่อง B3 แบบตรวจอัตโนมัติ: anon key หลุดแล้วต้องไม่ได้อะไรจาก schema public)
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and ('anon' = any(roles) or roles = '{public}')
order by tablename;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ของที่ไฟล์นี้ยัง**ไม่**ครอบ — บันทึกไว้ให้ชัดว่าไม่ใช่การลืม
-- ═══════════════════════════════════════════════════════════════════════════════
--   · ลิงก์แชร์แบบอ่านได้โดยไม่ต้องล็อกอิน — ต้องมีตาราง share_tokens + policy แยก
--     **ห้ามแก้ด้วยการเปิด `to anon` ให้ trips** ซึ่งเป็นทางที่ง่ายและผิด
--   · โครงองค์กร/ทีม (หลายทริปใต้บัญชีองค์กรเดียว) — trip_members พอสำหรับระยะ 2
--   · audit log — ต้องมีตารางแยก + trigger ไม่ใช่หน้าที่ของ RLS (ดู A09 ใน security-review.md)
--   · ตาราง rate limit ที่จะย้ายมาจาก in-memory — ออกแบบร่วมกับ P6 (ข้อ 5 ของ security-review.md)
