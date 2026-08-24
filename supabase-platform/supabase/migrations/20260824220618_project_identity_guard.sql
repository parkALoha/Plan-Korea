-- ═══════════════════════════════════════════════════════════════════════════
-- D48 — ด่านกันรันผิดโปรเจกต์ เปลี่ยนจาก denylist เป็น allowlist
-- เจ้าของ: P1-Lead · 24 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 ทำไมต้องมี migration นี้ก่อนทุกตัวที่เหลือ:
--   ด่าน `$guard$` ที่เราใช้อยู่ล้มเมื่อ **เจอตาราง `trip_meta`** = รู้จักฐานเดียวที่ห้ามแตะ
--   ปลอดภัยเฉพาะกับฐานที่คนเขียนด่านนึกออก ณ วันที่เขียน
--
--   24 ส.ค. 2026 `supabase projects list` ด้วย token ที่เครื่องถืออยู่ คืนมา **2 โปรเจกต์**
--     · `Korea-Trip` = DB ทริปจริง               → ด่านเดิมจับได้ ✅
--     · `a-gleam`    = ฐาน production ของร้าน    → **ด่านเดิมจับไม่ได้** 🔴
--   และ **`engine-dev` ไม่อยู่ในลิสต์** — token ใหม่ scope ไม่ครอบ org `Plan-trip-app`
--   (ref ของแต่ละใบอยู่ที่ `docs/engine/README.md` หัวข้อ `D48` — ตั้งใจไม่เขียนลงไฟล์นี้
--    เพราะด่านของ `.github/guards.sh` ห้าม ref ของ DB ทริปอยู่ในไฟล์ที่เครื่องจักรอ่านแล้วทำตาม
--    🎯 ด่านนั้นจับไฟล์นี้ได้จริงตอนเขียนฉบับแรก — ซึ่งเป็นสิ่งที่มันควรทำเป๊ะ)
--
--   🎯 อันตรายที่เป็นรูปธรรม: ทางที่ดูเหมือนทางแก้ที่สุดคือ re-link ไปโปรเจกต์ที่ token *เห็น*
--      ซึ่งเหลือให้เลือกแค่ 2 ใบ และใบที่ด่านจับไม่ได้ คือฐาน production ของร้าน
--
-- 📌 **ของชิ้นนี้ถูกเขียนไว้แล้วใน `migration-template.sql` ตั้งแต่ `E0` — เป็นคอมเมนต์**
--    (*"migration ตัวที่ 2 เป็นต้นไป: เปลี่ยนมา assert ตาราง `_project_identity` แทน"*)
--    แล้ว migration ตัวที่ 2 จริง ๆ ก็ **คัดลอกบล็อกแรกไปแทน** · ไม่มีอะไรผิดพลาดเลยสักขั้น
--    🔴 **แผนที่ถูกทิ้งไว้เป็นคอมเมนต์ ไม่ใช่แผน** — migration นี้คือการทำให้มันมีอยู่จริง
--
-- ⚠️ **ขอบเขตที่ด่านนี้ทำไม่ได้ — เขียนไว้เพราะการเข้าใจว่ามันครอบกว้างกว่าจริง อันตรายกว่าไม่มีด่าน:**
--    มันแยก "ฐานที่มีของอื่นอยู่แล้ว" ออกจาก engine-dev ได้
--    **มันแยกฐานเปล่าใบหนึ่ง ออกจากฐานเปล่าอีกใบไม่ได้** — `db push` ใส่โปรเจกต์เปล่าใบใหม่
--    จะรัน `0001` (สร้าง schema `app`) แล้วผ่านด่านนี้ไปได้ · รับได้เพราะฐานเปล่าไม่มีอะไรให้พัง
--    🔴 แต่ **ห้ามอ้างด่านนี้เป็นเหตุผลว่า "ลิงก์ผิดก็ไม่เป็นไร"** · การตรวจ ref ก่อน push ยังต้องทำเหมือนเดิม
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists app.project_identity;
--   🔴 ถอยแล้วทุก migration ที่ assert ตารางนี้จะล้มทันที — ถอยพร้อมกันทั้งชุดเท่านั้น
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
-- ตัวนี้เป็น migration **ตัวสุดท้ายที่ยังใช้ denylist** เพราะตารางที่จะ assert
-- ยังไม่มีอยู่ในฐานไหนเลย · ตัวถัดไปเป็นต้นไปใช้บล็อก allowlist ใน template
do $guard$
begin
  -- ① เดิม — ฐานทริปจริงมี `trip_meta`
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trip_meta'
  ) then
    raise exception 'ผิดโปรเจกต์: ฐานนี้มีตาราง trip_meta = นี่คือ DB ทริปจริง ไม่ใช่ engine-dev';
  end if;

  -- ② ใหม่ — ข้อที่ `a-gleam` ตกม้าตาย · ฐานนี้ต้องเคยรัน `0001_identity` มาแล้ว
  if not exists (
    select 1 from information_schema.schemata where schema_name = 'app'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี schema app → 0001_identity ไม่เคยรันที่ฐานนี้ = ไม่ใช่ engine-dev';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trip_members'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี public.trip_members → ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- ───────────────────────────────────────────────────────────────────────────
-- marker — อยู่ใน schema `app` ไม่ใช่ `public`
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 ต่างจากที่ template ร่างไว้ (`public._project_identity`) โดยตั้งใจ ด้วยเหตุผลเดียวกับ
--    ที่ helper ทุกตัวอยู่ใน `app`: **PostgREST เปิด `public` เป็น REST อัตโนมัติ**
--    ตารางนี้ใน `public` = ปลายทางให้ยิงถามว่า "ฐานนี้คือฐานอะไร" ได้จากภายนอก
--    ใน `app` ไม่มี usage ให้ `anon` เลย และ PostgREST ไม่เห็น schema นี้ตั้งแต่แรก
create table app.project_identity (
  name       text primary key,
  created_at timestamptz not null default now()
);

insert into app.project_identity (name) values ('plan-korea-platform');

-- ไม่มี policy โดยตั้งใจ (`D18`: ไม่มี policy = เข้าไม่ถึงจาก client เลย ไม่ใช่แค่ซ่อน)
alter table app.project_identity enable row level security;

-- ADP ของ `0001` ครอบ `public` ไม่ได้ครอบ `app` — revoke ตรงนี้จึงไม่ใช่ของซ้ำซ้อน
revoke all on app.project_identity from anon, authenticated;

commit;
