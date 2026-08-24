-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ 🔴 ไฟล์นี้ถูกย้ายออกจาก supabase/migrations/ เมื่อ 24 ส.ค. 2026 (P1)      ║
-- ║    `supabase db push` จะ **ไม่เห็น** ไฟล์นี้ และนั่นคือเจตนา              ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
--
-- เหตุผล: `P-27` — P1 เชื่อว่าทางแก้ข้างล่างนี้ **ยังไม่พอ** และการ push มันจะทิ้ง
-- FK `deferrable initially deferred` ไว้ถาวรโดยไม่ได้แก้อาการเลย
--   · `insert … returning` ประเมิน SELECT policy เป็น WITH CHECK **ในคำสั่งเดียวกัน**
--   · `app.can_read_trip` / `app.trip_role` เป็น `stable` → ใช้ snapshot ของคำสั่งที่เรียก
--     ซึ่ง `curcid` ถูกตรึงตั้งแต่ก่อน BEFORE trigger เขียนแถว → **แถวมีอยู่ แต่มองไม่เห็น**
--   · ย้าย trigger แก้ *ลำดับการทำงาน* · อาการเกิดจาก *การมองเห็นของ snapshot*
--
-- 🔴 **สถานะ: สมมติฐานของ P1 ที่ยังไม่ถูกพิสูจน์** (เครื่องนี้ไม่มี psql/docker · token 403)
--    ส่งให้ P4 หักล้างแล้ว · **ถ้า P4 หักล้างได้ ไฟล์นี้กลับไปที่เดิมได้ทันที**
--    ถ้าหักล้างไม่ได้ → ทางแทนคือ `public.create_trip()` แบบ `security definer`
--    ซึ่งไม่มี `RETURNING` ที่ต้องผ่าน RLS เลย และ **ไม่ต้องใช้ FK deferrable**
--
-- ⚠️ ก่อนย้ายกลับ: เปลี่ยนบล็อก `$guard$` ข้างล่างเป็น allowlist ตาม `migration-template.sql`
--    (ฉบับในไฟล์นี้ยังเป็น denylist ที่ `D48` เลิกใช้แล้ว)
--
-- ── เนื้อหาเดิมทั้งหมด ไม่ได้แก้อะไรสักบรรทัด ──────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- E1 แก้ P-26 — ทริปที่เพิ่งสร้าง มองไม่เห็นใน `returning` ของคำสั่งที่สร้างมันเอง
-- เจ้าของ: P1-Lead · 24 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 อาการ (ยืนยันด้วยการรันจริงบน engine-dev ไม่ใช่การอ่าน):
--     insert into trips (...) returning id;   → 42501 new row violates RLS policy for table "trips"
--     insert into trips (...);                → ✅ สำเร็จ
--   ทดสอบในฐานะ `authenticated` พร้อม `request.jwt.claims` ที่ถูกต้อง
--   และพิสูจน์แยกแล้วว่า `created_by = auth.uid()` เป็น **true** → `trips_insert` ผ่านตลอดมา
--
-- 🎯 กลไก: `returning` บังคับให้แถวที่เพิ่งสร้าง **ผ่าน policy ฝั่งอ่าน**
--   `trips_select` → `app.can_read_trip(id)` → หาใน `trip_members` → **ยังว่าง**
--   เพราะ `trips_bootstrap_owner` เป็น **AFTER INSERT** — ทำงาน**หลัง** RETURNING ถูกประเมินไปแล้ว
--
-- 📌 นี่คือ `P-13` ที่ P4 เตือนไว้เอง (*"ทริปกำพร้าที่มองไม่เห็น กู้จากฝั่ง client ไม่ได้"*)
--   **กลับมาในรูปที่ทางแก้ไม่ครอบ** — trigger ทำให้เห็นได้ใน *คำสั่งถัดไป*
--   แต่ไม่ได้ทำให้เห็นใน `returning` ของ *คำสั่งที่สร้างมันเอง*
--   🔴 และ `supabase-js` ใส่ `.select()` ต่อท้าย insert เป็นสำนวนปกติ
--      → ทุกคนที่สร้างทริปจากเว็บจะเจอ พร้อม error ที่ชี้ไปผิดตาราง
--      (ทีมใช้เวลากว่าชั่วโมงกว่าจะแยกออกว่าไม่ใช่ `trips_insert`)
--
-- ── ทางที่ปฏิเสธ และเหตุผล — เขียนไว้เพราะทางที่ง่ายที่สุดคือทางที่ผิด ──────────
--   ❌ เติม `created_by = auth.uid()` เข้า `trips_select`
--      ง่ายที่สุดและแก้อาการได้ทันที **แต่ทำลาย `P-15` ของ P4 โดยตรง**:
--      `created_by` จะกลายเป็น **แหล่งสิทธิ์ที่สอง** → คนสร้างจะอ่านทริปได้ตลอดกาล
--      **แม้ถูกถอดออกจาก `trip_members` แล้ว** · แหล่งความจริงของสิทธิ์ต้องมีที่เดียว
--   ❌ ให้ฝั่งแอปเลิกใช้ `.select()` ตอน insert
--      ผลักปัญหาไปให้ทุกคนที่เขียนโค้ดต่อจากนี้จำให้ได้ · พังใหม่ทุกครั้งที่มีคนลืม
--
-- ── ทางที่เลือก ────────────────────────────────────────────────────────────
--   ย้าย `trips_bootstrap_owner` เป็น **BEFORE INSERT** → แถวสมาชิกมีอยู่ก่อน RETURNING ประเมิน
--   ต้องทำให้ FK `trip_members.trip_id → trips.id` เป็น **deferrable initially deferred**
--   เพราะตอน BEFORE trigger ทำงาน **แถว `trips` ยังไม่มีอยู่จริง**
--   ✅ `trip_members` ยังเป็นแหล่งสิทธิ์เดียวเหมือนเดิม — `P-15` ไม่ถูกแตะเลยแม้แต่นิดเดียว
--
-- ⚠️ **ข้อแลกที่ต้องรู้ และเป็นชนิดที่ทีมนี้ไล่จับกันมาทั้งวัน:**
--   FK ที่ deferred จะฟ้อง **ตอน commit** ไม่ใช่ตอนคำสั่ง → **ความผิดพลาดย้ายไปโผล่ทีหลัง**
--   รับได้เพราะ FK นี้ผิดได้ทางเดียวคือ `trip_id` ชี้ทริปที่ไม่มีอยู่ ซึ่งเกิดได้เฉพาะถ้ามีคน
--   insert `trip_members` เองโดยไม่ผ่าน trigger — และ `trip_members_insert` ต้องการ role `owner`
--   ซึ่งไม่มีใครเป็นได้ในทริปที่ไม่มีอยู่ **ช่องนั้นจึงถูกปิดด้วย policy อยู่แล้ว**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop trigger if exists trips_bootstrap_owner on public.trips;
--   create trigger trips_bootstrap_owner after insert on public.trips
--     for each row execute function app.bootstrap_trip_owner();
--   -- แล้วคืน FK เป็นแบบไม่ deferrable (ใช้บล็อก do $fk$ ด้านล่างเป็นแบบอย่าง)
--   🔴 ถอยแล้วอาการเดิมกลับมาทันที — ถอยเฉพาะเมื่อมีทางแก้อื่นพร้อมแล้วเท่านั้น
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
do $guard$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trip_meta'
  ) then
    raise exception 'ผิดโปรเจกต์: ฐานนี้มีตาราง trip_meta = นี่คือ DB ทริปจริง ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. FK ของ trip_members → trips ต้อง deferrable
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 หาชื่อ constraint จาก catalog **ไม่เดาจากรูปแบบการตั้งชื่อ** —
--    ชื่ออัตโนมัติเปลี่ยนได้ตามวิธีประกาศ และเราไม่ได้ตั้งชื่อไว้เอง
--    เดาผิดแล้ว `drop constraint` จะล้มทั้ง migration ด้วยเหตุผลที่อ่านไม่ออก
do $fk$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.trip_members'::regclass
     and contype = 'f'
     and confrelid = 'public.trips'::regclass;

  if c is null then
    raise exception 'ไม่พบ FK จาก trip_members ไป trips — สคีมาไม่ใช่ที่คาดไว้ หยุด';
  end if;

  execute format('alter table public.trip_members drop constraint %I', c);
end $fk$;

alter table public.trip_members
  add constraint trip_members_trip_id_fkey
  foreign key (trip_id) references public.trips(id) on delete cascade
  deferrable initially deferred;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ย้าย trigger เป็น BEFORE INSERT
-- ───────────────────────────────────────────────────────────────────────────
-- ตัวฟังก์ชัน `app.bootstrap_trip_owner()` **ไม่ต้องแก้เลยสักบรรทัด** — มันใช้ `new.id`
-- กับ `new.created_by` ซึ่งมีค่าครบตั้งแต่ใน BEFORE INSERT (ค่า default ถูกเติมก่อน BEFORE trigger)
-- และมัน `return new` อยู่แล้ว ซึ่งเป็นสิ่งที่ BEFORE trigger ต้องการ
drop trigger if exists trips_bootstrap_owner on public.trips;

create trigger trips_bootstrap_owner
  before insert on public.trips
  for each row execute function app.bootstrap_trip_owner();

commit;
