-- ═══════════════════════════════════════════════════════════════════════════
-- E5 — จุดหมายของทริป (`trip_destinations`) + รูปปก (`trips.cover_image_url`)
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · เกณฑ์: หน้า Home (ผู้ใช้สั่งเอง พร้อม mockup)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมต้องมี ───────────────────────────────────────────────────────────────
-- หน้า Home ที่ผู้ใช้ขอ แสดงการ์ดทริปพร้อม *"จุดหมาย: ฮานอย, เวียดนาม"* และรูปปกเมือง
-- วันนี้ `trips` ไม่มีคอลัมน์ไหนเก็บสองอย่างนี้เลย และ `trip_days` ก็ยังไม่มี `city_id`
--
-- ── 🔴 ทำไมไม่เก็บ `country_id` ซ้ำใน `trips` ───────────────────────────────
-- `catalog_cities.country_id` บอกประเทศอยู่แล้ว · เก็บซ้ำ = สองแหล่งความจริงที่ drift ได้
-- (ทริปเปลี่ยนเมืองแล้วลืมแก้ประเทศ = การ์ดโกหกโดยไม่มีอะไรแดง) → การ์ดแสดงประเทศด้วยการ
-- join เมืองลำดับแรก → `catalog_countries` · ฟอร์มสร้างทริปยังให้เลือกประเทศก่อนได้ตามปกติ
-- **ประเทศเป็นตัวกรองของ UI ไม่ใช่ข้อมูลของทริป**
--
-- ── สิ่งที่ไฟล์นี้ *ไม่* ทำ · จดเพราะของที่ไม่มีอยู่ไม่ปรากฏในการรีวิว (`D44`) ──
--   ① **ไม่ใช่ตัวแทนของ `trip_days.city_id` ที่ `20260825110903` เขียนค้างไว้**
--      สองอย่างนี้ตอบคนละคำถาม และต้องมีทั้งคู่:
--        `trip_destinations` = *"ทริปนี้ประกาศว่าจะไปไหน"* — ผู้ใช้กรอกตอนสร้าง · มีค่าทันทีที่ทริปเกิด
--        `trip_days.city_id`  = *"วันนี้อยู่เมืองไหนจริง"*  — ปลายทางของ `get_capabilities`
--                               (`day → city → country → provider registry` · P5 ข้อ 5)
--      🔴 **ห้ามยุบสองอันนี้เข้าหากันทีหลังด้วยความหวังดี** — ทริปที่เพิ่งสร้างมีจุดหมายแต่ยังไม่มี
--         แผนรายวัน · ถ้าการ์ดอ่านจากวัน มันจะว่างเปล่าตรงวินาทีที่ผู้ใช้เพิ่งกรอกจุดหมายไปเอง
--      · ข้อจำกัดที่ `20260825110903` อ้าง (*"catalog ยังไม่ถูกเขียน"*) **หมดไปแล้ว** ตั้งแต่
--        `20260825133252_e2_catalog…` → `trip_days.city_id` ทำได้แล้ววันนี้ แต่เป็นงานของ `E3`
--   ② **ไม่มีตัวอัปโหลดรูปปก** — `cover_image_url` รับ URL เฉย ๆ · **ห้ามเพิ่ม Storage bucket
--      ใหม่ตอนนี้** ขณะที่ `D12` ฝั่งโค้ดยังเปิดอยู่ (`backlog.md:851`) จะเป็นการถอยหลัง
--   ③ **ไม่มี `rank` แบบ fractional text แบบ `trip_stops`** — ดูเหตุผลตรงคอลัมน์
--
-- ── 🔴 เรื่องที่ใหญ่กว่าตารางนี้ และไฟล์นี้เจอตอนเขียน ─────────────────────────
-- `zz_read_only_guard` ถูกติดด้วย **ลูปครั้งเดียว** ใน `20260826194500` ซึ่งเขียนคอมเมนต์ไว้ว่า
-- *"ตารางใหม่จะได้ trigger เองตอนรันไฟล์นี้ซ้ำ"* — **จริงตามตัวอักษร แต่ไม่มีใครรัน migration ซ้ำ**
-- (`db push` ตัดสินจาก `supabase_migrations.schema_migrations`) และ **ไม่มี event trigger ในโปรเจกต์นี้เลย**
-- → **ตารางที่เกิดหลังลูปครั้งสุดท้าย (`20260826220000`) จะไม่มีด่าน read-only** และไม่มีอะไรจับได้:
--   `read_only_selftest()` ทดสอบ *ตรรกะ* ของ `app.write_is_blocked()` ไม่ได้ตรวจว่าตารางไหน *ติด trigger*
--   → เขียนได้ตอนโหมดเปิด · เทสต์เขียวทุกตัว · `guards.sh` เขียว
--   ✅ **ตรวจแล้ว: วันนี้ยังไม่มีตารางไหนหลุด** — ไล่ migration ทุกไฟล์หลัง `20260826220000` แล้ว
--      `create table public.*` มีอยู่ไฟล์เดียวคือไฟล์นี้เอง → **ตารางของไฟล์นี้คือใบแรกที่จะเป็นเหยื่อ**
--      🎯 จดแบบนี้เพราะ *"ช่องเปิดอยู่"* กับ *"มีคนตกไปแล้ว"* เป็นคนละเรื่อง และเขียนรวมกันเมื่อไหร่
--         คนอ่านรอบหน้าจะไปไล่หาความเสียหายที่ไม่มี แล้วสรุปว่าคำเตือนนี้เกินจริง
-- ไฟล์นี้จึงติด trigger ให้ตัวเอง (ข้อ 6) **และเพิ่ม `app.read_only_uncovered_tables()` ไว้ให้ตรวจได้**
-- ⚠️ ตัวตรวจนั้นยังไม่มีเคสเรียกใช้ — เป็นงานที่ส่งต่อ P4 ไม่ใช่ของที่ปิดแล้วในไฟล์นี้
--
--
-- ── 🔴 ไฟล์นี้ *รันซ้ำได้* โดยตั้งใจ (แก้ 27 ส.ค. 2026) ─────────────────────
--   ผู้ใช้รันมันจาก SQL Editor **ก่อน** ที่ไฟล์จะกลับเข้ารีโป → `supabase_migrations.schema_migrations`
--   จะไม่มีบรรทัดของมัน → วันที่ผมเอาไฟล์กลับลงหัวแล้วมีคนรัน `db push` **มันจะถูกรันอีกครั้ง**
--   · `create table` เปล่า ๆ จะล้มด้วย "already exists" แล้วทั้ง migration ตาย
--   → ทุกคำสั่งที่สร้างของเป็น `if not exists` / `drop … if exists` แล้ว `create` ใหม่
--   ⚠️ **`drop policy` แล้วสร้างใหม่ ไม่ใช่ `if not exists`** — policy ที่ *มีอยู่แต่เนื้อต่าง* ต้องถูกเขียนทับ
--      ไม่ใช่ถูกข้าม · `if not exists` จะทำให้ policy เก่าที่ผิดอยู่รอดมาแบบเงียบ ๆ
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists public.trip_destinations;
--   alter table public.trips drop column if exists cover_image_url;
--   drop function if exists app.read_only_uncovered_tables();
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
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

-- ───────────────────────────────────────────────────────────────────────────
-- 1. ตาราง `trip_destinations`
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.trip_destinations (
  -- `E2-AC3`: ตารางเนื้อหาทุกตัวมี `trip_id` เป็น FK จริง · cascade เพราะจุดหมายของทริปที่ถูกลบ
  -- ไม่มีความหมายเหลืออยู่ (รูปเดียวกับ `trip_days`)
  trip_id uuid not null references public.trips(id) on delete cascade,

  -- `restrict` ไม่ใช่ cascade — คลังเป็นของสาธารณะที่ใช้ร่วมกันทุกทริป
  -- ลบเมืองออกจากคลังแล้วจุดหมายของคนอื่นหายตามไปเงียบ ๆ คือสิ่งที่ต้องกัน
  city_id uuid not null references public.catalog_cities(id) on delete restrict,

  -- 🔴 **`int` ธรรมดา ไม่ใช่ fractional text แบบ `trip_stops.rank`** — และไม่ unique
  --    `trip_stops` ต้องใช้คีย์ text เพราะโจทย์คือ *แทรกระหว่างสองจุดจากสองเครื่องพร้อมกัน*
  --    โดยไม่ต้องเขียนทับทั้งวัน · **จุดหมายไม่มีโจทย์นั้น**: มันถูกกรอกตอนสร้างทริปในคำขอเดียว
  --    และตอนแก้คือ *แทนที่ทั้งรายการ* ไม่ใช่แทรกทีละใบ
  --    ⚠️ ถ้าวันหนึ่งจุดหมายกลายเป็นของที่ลากจัดลำดับได้แบบ real-time **ตอนนั้นค่อยย้ายไปใช้
  --    `lib/engine/rank.ts` ตัวเดียวกัน** อย่าสร้างกลไกลำดับตัวที่สามขึ้นมา
  --    · ไม่ unique ด้วยเหตุผลเดียวกับ `trip_stops.rank` — ลำดับที่นิ่งมาจาก tie-break `(rank, city_id)`
  rank int not null,

  primary key (trip_id, city_id)
);

comment on table public.trip_destinations is
  'จุดหมายที่ทริป *ประกาศ* ไว้ (ผู้ใช้กรอกตอนสร้าง) — คนละเรื่องกับ trip_days.city_id '
  'ที่บอกว่าแต่ละวันอยู่เมืองไหนจริง · ห้ามยุบเข้าหากัน ดูหัวไฟล์ข้อ ①';

-- 🔴 `P-18`: revoke แบบระบุชื่อ แก้ของที่ **มีอยู่แล้ว** · ADP ใน `E1` กันของ **ใหม่** — ต้องมีทั้งคู่
revoke all on public.trip_destinations from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.trip_destinations enable row level security;

-- อ่าน: สมาชิกบทบาทใดก็ได้ รวม `viewer` (`P-44`)
drop policy if exists trip_destinations_select on public.trip_destinations;
create policy trip_destinations_select on public.trip_destinations
  for select to authenticated
  using (app.can_read_trip(trip_id));

drop policy if exists trip_destinations_insert on public.trip_destinations;
create policy trip_destinations_insert on public.trip_destinations
  for insert to authenticated
  with check (app.can_write_trip(trip_id));

-- `using` กันแก้แถวของทริปที่เราไม่ได้เป็นสมาชิก · `with check` กันย้ายแถวข้ามทริป
-- (เหตุผลเดียวกับ `trip_days_update` — ตัด `with check` ออกแล้วรูใหญ่กว่าที่ตาเห็น)
drop policy if exists trip_destinations_update on public.trip_destinations;
create policy trip_destinations_update on public.trip_destinations
  for update to authenticated
  using      (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));

-- 🔴 **มี policy DELETE ต่างจาก `trip_days`** — และนั่นถูกต้อง ไม่ใช่ความไม่สม่ำเสมอ:
--    วันของทริปถูกสร้าง/ลบตามช่วงวัน ผู้ใช้ไม่ได้ลบทีละใบ (`D18`) แต่ **จุดหมายเป็นของที่ผู้ใช้
--    เพิ่มและเอาออกเองโดยตรง** · ไม่มี soft delete เพราะไม่มีอะไรให้กู้ (แถวมีแค่คีย์กับลำดับ)
drop policy if exists trip_destinations_delete on public.trip_destinations;
create policy trip_destinations_delete on public.trip_destinations
  for delete to authenticated
  using (app.can_write_trip(trip_id));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. grant — ต้องเขียนเอง ("Automatically expose new tables" = ปิด)
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 ระบุคอลัมน์ฝั่งเขียนตั้งแต่แรก ไม่ต้องรอไฟล์ freeze มาตามเก็บทีหลังแบบ `E2`
--    (`revoke` ระดับตารางต้องมาก่อน column grant เสมอ — column grant ลบสิทธิ์ระดับตารางไม่ได้)
grant select on public.trip_destinations to authenticated;
grant insert (trip_id, city_id, rank) on public.trip_destinations to authenticated;
grant update (city_id, rank)          on public.trip_destinations to authenticated;
grant delete on public.trip_destinations to authenticated;
-- `trip_id` ไม่อยู่ฝั่ง update — ไม่มีเหตุผลใดที่ client ต้องย้ายจุดหมายข้ามทริป
-- (policy `with check` กันอยู่แล้ว · สองชั้นตอบคนละคำถาม: grant = "ส่งมาได้ไหม" · policy = "ค่าใหม่ถูกไหม")

-- ───────────────────────────────────────────────────────────────────────────
-- 4. รูปปก
-- ───────────────────────────────────────────────────────────────────────────
alter table public.trips add column if not exists cover_image_url text
  check (cover_image_url is null or length(trim(cover_image_url)) between 1 and 2048);

-- 🔴 คอลัมน์ใหม่บน `trips` **ไม่ได้สิทธิ์เขียนอัตโนมัติ** — `20260825122247_e2_freeze_row_times`
--    `revoke insert, update on public.trips from authenticated` แล้ว grant ทีละคอลัมน์
--    → ลืมสองบรรทัดนี้ = คอลัมน์ที่เขียนไม่ได้เลย และอาการคือ "บันทึกแล้วไม่เปลี่ยน" ไม่ใช่ error
grant insert (cover_image_url) on public.trips to authenticated;
grant update (cover_image_url) on public.trips to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. ตัวตรวจว่าตารางไหน *ไม่มี* ด่าน read-only — ดูหัวไฟล์
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.read_only_uncovered_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.relname::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not exists (
       select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = c.oid
          and t.tgname  = 'zz_read_only_guard'
          and not t.tgisinternal
     )
   order by c.relname
$$;

comment on function app.read_only_uncovered_tables() is
  'ตารางใน public ที่ไม่มี trigger zz_read_only_guard = เขียนได้ตอนโหมด read-only เปิด '
  'ต้องคืนศูนย์แถวเสมอ · ลูปที่ติด trigger รันครั้งเดียวใน 20260826194500 และไม่มี event trigger '
  'ตารางใหม่ทุกใบจึงต้องติดเองในไฟล์ของตัวเอง (ข้อ 6) — ตัวนี้คือสิ่งที่ทำให้ "ลืม" ดังขึ้นมา';

revoke all on function app.read_only_uncovered_tables() from public;
-- ไม่ grant ให้ `authenticated` — เป็นเครื่องมือของชุดทดสอบ/ปฏิบัติการ ไม่ใช่ของไคลเอนต์

-- ───────────────────────────────────────────────────────────────────────────
-- 6. ติด `zz_read_only_guard` ให้ตารางใหม่ของไฟล์นี้
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **ต้องอยู่ทุกไฟล์ที่สร้างตารางใหม่ตั้งแต่ 26 ส.ค. เป็นต้นไป** — ไม่มีอะไรทำให้อัตโนมัติ
drop trigger if exists zz_read_only_guard on public.trip_destinations;
create trigger zz_read_only_guard
  before insert or update or delete on public.trip_destinations
  for each row execute function app.deny_write_when_read_only();

commit;
