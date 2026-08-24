-- ═══════════════════════════════════════════════════════════════════════════
-- D48 — ด่านกันรันผิดโปรเจกต์ เปลี่ยนจาก denylist เป็น allowlist
-- เจ้าของ: P1-Lead · แก้ตาม `P-30` + `P-31` ที่ P4 ตีกลับ · 24 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴🔴 **อ่านก่อน: ด่านในไฟล์นี้ กัน `a-gleam` ไม่ได้ และไม่เคยกันได้ (`P-30` · P4)**
--   `supabase db push` ใส่โปรเจกต์ที่ไม่เคยรัน migration ของเรา จะรัน**ทุกไฟล์ตามลำดับ**:
--     ① `20260824043822_identity.sql` → ด่านมันเช็คแค่ `trip_meta` → `a-gleam` ผ่าน
--        **แล้วมันสร้าง schema `app` + ตาราง + trigger ให้เลย**
--     ② ไฟล์นี้ → เช็คว่ามี `app.project_identity` ไหม → **มีแล้ว เพราะ ① เพิ่งสร้างให้**
--   🎯 **เงื่อนไขที่ด่านนี้ตรวจ ถูกสร้างโดย migration ที่วิ่งก่อนมัน** → ผ่านเสมอ
--
--   **ความเสียหายที่ ① ทำกับ production ของร้าน ไม่ใช่ "ไม่มีอะไรพัง" อย่างที่ผมเคยเขียน:**
--   · `alter default privileges … revoke all on tables from anon, authenticated`
--     → **ทุกตารางที่ร้านสร้างหลังจากนั้น `anon`/`authenticated` เข้าไม่ได้** พังทีละนิดในอนาคต
--       โดยไม่มีใครโยงกลับมาถึงวันนี้ได้
--   · `create trigger on_auth_user_created after insert on auth.users`
--     → **แทรกตัวเองเข้าไปในเส้นทางสมัครสมาชิกของร้าน**
--
--   → **ด่านในไฟล์นี้กันได้เฉพาะ migration ตัวที่ 3 เป็นต้นไป** · ตัวที่ 1 คือตัวที่ทำลาย
--     ทางกันของตัวที่ 1 อยู่ **นอก SQL**: `supabase-platform/db-push.sh` (และด่านใน `0001` เอง)
--     🔴 **ห้ามอ่านไฟล์นี้แล้วสรุปว่าเรื่องนี้ถูกปิดแล้ว**
--
-- 📌 `P-31` (P4): marker เดิมเก็บแค่ `name` = บอก**ผลิตภัณฑ์** ไม่ได้บอก**สภาพแวดล้อม**
--   วันที่แพลตฟอร์มขึ้น prod ฐาน prod ก็ชื่อ `plan-korea-platform` เหมือนกัน → allowlist รับทั้งคู่
--   **คู่ dev/prod อันตรายกว่า `a-gleam` ด้วยซ้ำ เพราะสองใบนั้นจะหน้าตาเหมือนกันทุกอย่าง**
--   → เก็บ `ref` และ `environment` ด้วย · ref ของ `engine-dev` เขียนลงไฟล์ได้
--     (`.github/allowed-project-ref` ถือค่าเดียวกันอยู่แล้ว · ที่ `guards.sh` ห้ามคือ ref ของ DB ทริป)
--
-- 📌 ของชิ้นนี้เคยถูกเขียนไว้แล้วใน `migration-template.sql` ตั้งแต่ `E0` — **เป็นคอมเมนต์**
--    แล้ว migration ตัวที่ 2 ก็คัดลอกบล็อกที่ทำงานอยู่ไปแทน ซึ่งถูกต้องที่จะทำ
--    🔴 **แผนที่ถูกทิ้งไว้เป็นคอมเมนต์ ไม่ใช่แผน**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists app.project_identity;
--   🔴 ถอยแล้วทุก migration ที่ assert ตารางนี้จะล้มทันที — ถอยพร้อมกันทั้งชุดเท่านั้น
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่าน · ตัวนี้ยังต้องใช้ denylist เพราะตารางที่จะ assert ยังไม่มีในฐานไหนเลย ──────
do $guard$
declare n int;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trip_meta'
  ) then
    raise exception 'ผิดโปรเจกต์: ฐานนี้มีตาราง trip_meta = นี่คือ DB ทริปจริง ไม่ใช่ engine-dev';
  end if;

  -- ฐานนี้ต้องเคยรัน `0001_identity` มาแล้ว
  -- ⚠️ ข้อนี้ **ไม่ได้** กัน `a-gleam` (ดู `P-30` ข้างบน) — `0001` สร้างเงื่อนไขนี้ให้เอง
  --    เก็บไว้เพราะมันยังกัน "รันไฟล์นี้เดี่ยวๆ ใส่ฐานที่ไม่เกี่ยวข้อง" ได้ **แค่นั้น**
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trip_members'
  ) then
    raise exception 'ผิดลำดับ: ไม่มี public.trip_members → 0001_identity ยังไม่เคยรันที่ฐานนี้';
  end if;

  select count(*) into n from app.project_identity;
  if n > 0 then
    raise exception 'ฐานนี้มี app.project_identity อยู่แล้ว — ไฟล์นี้ไม่ควรรันซ้ำ';
  end if;
exception
  when undefined_table then null;   -- ยังไม่มีตาราง = ปกติ นี่คือไฟล์ที่สร้างมัน
end $guard$;

-- ───────────────────────────────────────────────────────────────────────────
-- marker — อยู่ใน schema `app` ไม่ใช่ `public`
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 ต่างจากที่ template ร่างไว้ (`public._project_identity`) โดยตั้งใจ ด้วยเหตุผลเดียวกับ
--    ที่ helper ทุกตัวอยู่ใน `app`: **PostgREST เปิด `public` เป็น REST อัตโนมัติ**
--    ตารางนี้ใน `public` = ปลายทางให้ยิงถามจากข้างนอกว่า "ฐานนี้คือฐานอะไร"
create table app.project_identity (
  name        text primary key,
  ref         text not null,
  environment text not null check (environment in ('dev','staging','prod')),
  created_at  timestamptz not null default now()
);

-- 🔴 `ref` + `environment` คือ `P-31` — `name` อย่างเดียวแยก dev ออกจาก prod ไม่ได้
insert into app.project_identity (name, ref, environment)
values ('plan-korea-platform', 'pmvxwcimjebogjfimzqy', 'dev');

-- ไม่มี policy โดยตั้งใจ (`D18`: ไม่มี policy = เข้าไม่ถึงจาก client เลย ไม่ใช่แค่ซ่อน)
alter table app.project_identity enable row level security;

-- ADP ของ `0001` ครอบ `public` ไม่ได้ครอบ `app` — revoke ตรงนี้จึงไม่ใช่ของซ้ำซ้อน
revoke all on app.project_identity from anon, authenticated;

commit;
