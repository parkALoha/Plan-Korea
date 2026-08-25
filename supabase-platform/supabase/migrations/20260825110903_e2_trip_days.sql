-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — ตารางแรกของเนื้อหา: `trip_days` · และบรรทัดที่ทำให้ `editor` ≠ `viewer` เป็นครั้งแรก
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · เกณฑ์: `E2-AC4` · `E2-AC3` · `P-46`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมสองเรื่องนี้ต้องอยู่ไฟล์เดียวกัน ────────────────────────────────────
-- `P-46` (`D61` วัดไว้): ใน `E1` `editor` กับ `viewer` **มีสิทธิ์เท่ากันทุกประการ**
-- ซึ่ง **เป็นความจริงที่ถูกต้องของ `E1`** ไม่ใช่บั๊ก — `E1` ไม่มีตารางเนื้อหาสักตัว
-- policy ที่เขียนอะไรได้ทั้งหมดจึงเป็น `owner` ล้วน และไม่มีที่ให้ความต่างปรากฏ
--
-- 🔴 มันกลายเป็นบั๊กในวินาทีที่ตารางเนื้อหาตัวแรกเกิดขึ้น — คือไฟล์นี้
--    ถ้า `trip_days` เขียน policy ว่า `app.can_read_trip(trip_id)` ฝั่งเขียนด้วย
--    **`viewer` จะแก้แผนได้ทั้งทริป** และจะไม่มีอะไรแดง เพราะยังไม่เคยมีเคสไหนถาม
--    → `app.can_write_trip()` เกิดที่นี่ **พร้อมกับ** ตารางแรกที่ต้องใช้มัน
--    (`E1` เขียนไว้เองที่บรรทัด 226 ว่า *"อย่า grant สิ่งที่ยังไม่ต้องใช้ · จะกลับมาใน E2
--     ตอนมีตารางเนื้อหาที่ editor เขียนจริง"* — ไฟล์นี้คือ "ตอน" นั้น)
--
-- ⚠️ **ไม่เพิ่ม `app.is_trip_owner()` ในไฟล์นี้** ทั้งที่แบบใน `schema/rls-policies.sql` มี
--    เพราะยังไม่มีตารางไหนในไฟล์นี้ต้องใช้ · policy ของ `E1` อ้าง `app.trip_role(id) = 'owner'`
--    ตรง ๆ อยู่แล้วและ **ห้ามแก้ในไฟล์นี้** — การเปลี่ยนเนื้อ policy เดิมเพื่อความสวยงาม
--    จะทำให้ fingerprint ของ `P-35` แดงด้วยเหตุผลที่ไม่เกี่ยวกับสิทธิ์ ซึ่งเป็นวิธีฆ่าด่านนั้น (`P-48`)
--
-- ── สิ่งที่ไฟล์นี้ *ไม่* ทำ · จดไว้เพราะของที่ไม่มีอยู่ไม่ปรากฏในการรีวิว (`D44`) ────
--   ① **ไม่มีคอลัมน์ `city_id`** — ปลายทางของ `trip_meta.overnight_overrides` (`B6`)
--      ต้องเป็น FK ไป `catalog.cities` ซึ่ง **ยังไม่ถูกเขียน** (รูปตารางตัดสินแล้วที่ `D53`/`D54`)
--      🔴 **แก้ข้อความ 25 ส.ค. บ่าย (`D71`)** — ฉบับแรกเขียนว่า *"`column-map.md` ข้อ 2 ที่ยังเปิดอยู่"*
--         ซึ่ง **ค้างเป็นเท็จมาตั้งแต่ 24 ส.ค.**: คำถามถูกตอบไปแล้ว แต่กล่อง "ของที่ยังไม่มีคำตอบ"
--         ไม่ถูกปิด · ผมอ่านกล่องนั้นแล้วเชื่อ แล้วสถานะที่ค้างก็เดินทางมาถึงไฟล์ที่ push แล้ว
--         **แก้เฉพาะคอมเมนต์ ไม่มี DDL บรรทัดไหนถูกแตะ** — ไฟล์นี้ถูก apply ไปแล้วและจะไม่ถูกรันซ้ำ
--         (`db push` ตัดสินจาก `supabase_migrations.schema_migrations` ไม่ได้อ่านเนื้อไฟล์อีก)
--      🔴 ใส่เป็น `uuid` เปล่าที่ไม่มี FK ไว้ก่อน = คอลัมน์ที่ไม่มีอะไรบังคับความถูกต้อง
--         ซึ่งเป็นชนิดเดียวกับ `P-42` ที่ทีมนี้เพิ่งจ่ายราคาไปแล้ว → **รอ catalog migration**
--   ② **ไม่มี trigger บังคับว่า `date` ต้องอยู่ในช่วง `trips.start_date … end_date`**
--      `check` ข้ามตารางไม่ได้ ต้องเป็น trigger · แยกไฟล์เพราะมันมีเคส 2 ทิศของตัวเอง
--   ③ **ไม่มี `deleted_at`** (`E2-AC12`) — และไม่มี policy `DELETE` ด้วย (`D18`: ไม่มี policy
--      = เข้าไม่ถึงจาก client เลย) · วันถูกสร้าง/ลบตามช่วงวันของทริป ไม่ใช่ของที่ผู้ใช้ลบทีละใบ
--      → soft delete ของตารางนี้ต้องตัดสินพร้อม `E3` ที่เขียนตัวปรับช่วงวัน **ไม่ใช่ตอนนี้**
--   ④ **ไม่มีตั้งค่ารายวันต่อแผน** (`start_time` · `return_travel_mode` · `is_locked`)
--      🔴 **นี่คือ `P-51`/`D69` — `column-map.md` สั่งให้ยุบ `trip_day_settings` เข้าตารางนี้
--         ซึ่งจะทำมิติ "ต่อแผน" หายไปเงียบ ๆ** · ดูเหตุผลเต็มใน `docs/engine/README.md`
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists public.trip_days;
--   drop function if exists app.can_write_trip(uuid);
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
-- 1. helper — `editor` เขียนได้ · `viewer` เขียนไม่ได้
-- ───────────────────────────────────────────────────────────────────────────
-- ทำไมต้องเป็น SECURITY DEFINER เหมือน `app.trip_role`: มันเรียก `app.trip_role` ต่อ
-- ซึ่งอ่าน `public.trip_members` · ถ้าตัวนี้เป็น invoker การอ่านนั้นจะตกใต้ RLS ของ
-- `trip_members` อีกชั้น = ผูก policy สองตารางเข้าด้วยกัน (`P-17`)
--
-- `stable` + ไม่มี `(select auth.uid())` ตรงนี้ — `auth.uid()` ถูกเรียกใน `app.trip_role`
-- ที่ห่อ subquery ไว้แล้ว การห่อซ้ำไม่ได้อะไรเพิ่ม
create or replace function app.can_write_trip(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.trip_role(t) in ('owner', 'editor')
$$;

comment on function app.can_write_trip(uuid) is
  'เขียนเนื้อหาในทริปได้ไหม — owner หรือ editor เท่านั้น · viewer อ่านอย่างเดียว (P-46/D61) '
  'ห้ามเปลี่ยนเป็น SECURITY INVOKER: มันอ่าน trip_members ต่อผ่าน app.trip_role';

-- 🔴 grant ทีละตัวพร้อมลายเซ็น ห้าม "grant execute on all functions in schema app"
--    (กฎร่วมข้อ 5 — grant แบบเหมาลบล้าง revoke ของคนอื่นตามลำดับการรัน)
revoke all on function app.can_write_trip(uuid) from public;
grant execute on function app.can_write_trip(uuid) to authenticated;
-- anon ไม่ได้ `usage` บน schema app ตั้งแต่ `E1` อยู่แล้ว — บรรทัดนี้จึงไม่ใช่ด่านเดียว

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ตาราง `trip_days` — `E2-AC4`
-- ───────────────────────────────────────────────────────────────────────────
-- เกณฑ์ที่ต้องผ่าน: *"`day_id` ไม่ใช่สตริง `d0`–`d10` อีกต่อไป · มีตาราง `trip_days`
-- ที่ผูกวันที่จริง · **สร้างทริป 3 วันที่ไม่มีอะไรเกี่ยวกับเกาหลีได้โดยไม่แก้โค้ด**"*
--
-- วันนี้ `d0`–`d10` ถูกฝังใน `data/itinerary.ts` = ทริปเกาหลี 11 วันใบเดียวเท่านั้นที่มีอยู่ได้
create table public.trip_days (
  id         uuid primary key default gen_random_uuid(),

  -- `E2-AC3`: ตารางเนื้อหาทุกตัวต้องมี `trip_id` และต้องเป็น FK จริง — ปิด `B4`/`B5`
  -- cascade ถูกต้องที่นี่ (ต่างจาก `trips.created_by` ที่เป็น restrict):
  -- ทริปหาย = วันของทริปนั้นหมดความหมาย ไม่ใช่ข้อมูลของคนอื่นที่ต้องรักษา
  trip_id    uuid not null references public.trips(id) on delete cascade,

  date       date not null,

  -- `D37` — โซนเวลารายวัน · null = ใช้ `trips.base_timezone`
  -- ทริปข้ามประเทศวันหนึ่งอยู่คนละโซนกับทริป · เก็บเวลาเป็น "HH:MM" local เหมือนเดิม
  -- ใช้โซนเฉพาะตอนตัดสินว่า "วันนี้คือวันไหน" กับตอนเตือนเรื่องเวลา
  timezone   text check (timezone is null or length(trim(timezone)) between 1 and 64),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- วันเดียวกันซ้ำสองแถวในทริปเดียว = `trip_stops.day_id` ชี้ได้สองที่โดยไม่มีอะไรผิดกฎ
  -- ซึ่งเป็นสภาพที่เจอตอน "จุดแวะหายไปครึ่งวัน" แล้วหาสาเหตุไม่เจอ
  constraint trip_days_unique_date unique (trip_id, date)
);

-- ดัชนีของทางที่โค้ดเดินจริง: "ขอวันทั้งหมดของทริปนี้ เรียงตามวันที่"
-- (unique ข้างบนคือ `(trip_id, date)` อยู่แล้ว จึงครอบ query นี้ — ไม่สร้างซ้ำ)

-- 🔴 `P-18`: revoke แบบระบุชื่อ แก้ของที่ **มีอยู่แล้ว** · ADP ใน `E1` กันของ **ใหม่**
--    ต้องมีทั้งคู่ · อย่างใดอย่างหนึ่งไม่พอ
revoke all on public.trip_days from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.trip_days enable row level security;

-- อ่าน: สมาชิกบทบาทใดก็ได้ รวม `viewer` — คนที่ถูกเชิญมาดูแผนต้องเห็นแผน (`P-44`)
create policy trip_days_select on public.trip_days
  for select to authenticated
  using (app.can_read_trip(trip_id));

-- เขียน: `owner` + `editor` เท่านั้น — **บรรทัดแรกในประวัติโปรเจกต์ที่ `viewer` แพ้ `editor`**
create policy trip_days_insert on public.trip_days
  for insert to authenticated
  with check (app.can_write_trip(trip_id));

-- 🔴 ต้องมีทั้ง `using` และ `with check` และเหตุผลของสองตัวไม่เหมือนกัน:
--   `using`      — กันแก้แถวของทริปที่เราไม่ได้เป็นสมาชิก
--   `with check` — กัน **ย้ายวันข้ามทริป** ด้วยการเขียน `trip_id` ทับเป็นทริปของคนอื่น
--                  ซึ่งจะลากจุดแวะทั้งวันตามไปด้วย เพราะ `trip_stops` จะผูกกับ `day_id`
--   ตัด `with check` ออกแล้วรูใหญ่กว่าที่ตาเห็นมาก และเคสที่จับได้มีทิศเดียว
create policy trip_days_update on public.trip_days
  for update to authenticated
  using      (app.can_write_trip(trip_id))
  with check (app.can_write_trip(trip_id));

-- 🔴 ไม่มี policy DELETE โดยตั้งใจ (`D18`) — ดูข้อ ③ ในหัวข้อ "สิ่งที่ไฟล์นี้ไม่ทำ"

-- ───────────────────────────────────────────────────────────────────────────
-- 4. grant — ต้องเขียนเอง เพราะโปรเจกต์ตั้ง "Automatically expose new tables" = ปิด
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 จุดพลาดง่ายที่สุด: RLS ครบแต่ลืม grant = อ่านไม่ได้เลยทั้งที่ policy ถูก
--    หรือ grant เกินกว่าที่ policy อนุญาต = policy กลายเป็นด่านเดียวที่เหลือ
--    `delete` **ไม่อยู่ในนี้** ให้ตรงกับการที่ไม่มี policy DELETE — สองชั้นพูดตรงกัน
grant select, insert, update on public.trip_days to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. `updated_at` เขียนโดยเซิร์ฟเวอร์เท่านั้น — `D7` · `E2-AC9`
-- ───────────────────────────────────────────────────────────────────────────
-- วันนี้ client เขียน `updated_at` เอง ทับ `default now()` → **เครื่องที่ตั้งนาฬิกาผิด
-- ชนะ last-write-wins ตลอดกาลอย่างเงียบ ๆ** และเกิดจริงได้ (`lib/localDate.ts` บันทึกเอง
-- ว่าเจอมือถือค้างเวลาไทยระหว่างอยู่เกาหลี)
-- ใช้ `app.touch_updated_at()` ตัวเดิมจาก `E1` — ไม่สร้างตัวใหม่ให้มีสองฉบับที่ต้องตรงกัน
create trigger trip_days_touch
  before update on public.trip_days
  for each row execute function app.touch_updated_at();

commit;
