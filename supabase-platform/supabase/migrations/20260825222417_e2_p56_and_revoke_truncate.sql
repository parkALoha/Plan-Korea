-- ═══════════════════════════════════════════════════════════════════════════
-- `P-56` (P4 ยิงพิสูจน์) + `TRUNCATE` ที่ทำให้ด่าน `D73` มีรู (P7 ชี้)
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · **ทั้งสองข้อเป็นผลจากงานของผมเองวันนี้**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ══ ① `P-56` — `legacy_checked_by` ไม่มีใครล้าง ═══════════════════════════
-- `D78` เขียน `legacy_checked_by` ตอนคนติ๊กลบบัญชี **แต่ไม่มีที่ไหนล้างมันเลย**
-- ยิงจริงบน engine-dev (P4):
-- ```
-- ① ผีติ๊ก        is_checked=true   checked_by_user=ผี    legacy_checked_by=null
-- ② ลบบัญชีผี      is_checked=true   checked_by_user=null  legacy_checked_by="ผี"   ✅
-- ③ เจ้าของติ๊กออก  is_checked=false  checked_by_user=null  legacy_checked_by="ผี"   🔴
-- ```
-- → **รายการที่ไม่ได้ถูกติ๊ก แต่มีชื่อคนติ๊กแปะอยู่** · `coalesce(profile(checked_by_user), legacy_checked_by)`
--   จะแสดง *"ติ๊กโดย ผี"* บนรายการที่ยังไม่ติ๊ก · **และฟื้นทุกครั้งที่มีคนติ๊กออก ไม่ใช่ครั้งเดียว**
--
-- 🎯 **มันคือบั๊กที่ `stamp_checked_by` มีอยู่เพื่อกัน — และคอมเมนต์ของผมเองเขียนเหตุผลไว้แล้ว:**
--    *"ติ๊กออกต้องล้าง — ไม่งั้นชื่อคนที่ไม่ได้ติ๊กแล้วจะค้างบนแถวและหน้าจอจะบอกว่าเขาติ๊ก"*
--    **`legacy_checked_by` พาบั๊กนั้นกลับมาเป๊ะ ๆ ผ่านประตูหลัง** · แก้: ล้างทั้งคู่พร้อมกัน
--    **ให้คอลัมน์สำรองเดินตามวงจรชีวิตของตัวที่มันสำรอง**
--
-- 🔴 **และ P4 แก้เหตุผลของผมด้วย ซึ่งสำคัญกว่าตัวบั๊ก:**
--    ผมตัด `updated_by_user` ออกด้วยเหตุผลว่า *"มันเขียนทับได้ ต่างจาก `added_by` ที่เกิดครั้งเดียว"*
--    → **เกณฑ์จริงที่ผมใช้คือ "เขียนทับได้หรือไม่"** · **แต่ `checked_by_user` ก็เขียนทับได้ และผมใส่มันเข้าลิสต์**
--    → กลไก catalog-driven ที่ผมชมว่า *"ครอบคู่ใหม่ได้เองโดยไม่ต้องแก้ไฟล์"*
--      **ไม่ใช่ข้อดี มันคือความเสี่ยง**: `and %I is null` ถูกสำหรับคอลัมน์ที่เขียนครั้งเดียว
--      **และผิดสำหรับคอลัมน์ที่เปลี่ยนค่าได้** → มันจะทำสิ่งที่ผิดอัตโนมัติเช่นกัน
--    ⚠️ **และคอมเมนต์ของ `authorship_columns()` เขียนว่า `updated_by_user` "ไม่เข้าเกณฑ์โดยตั้งใจ"
--       ทั้งที่ไม่มีเกณฑ์ไหนในฟังก์ชันตัดมันออกเลยสักบรรทัด** — มันไม่เข้าเพราะ `legacy_updated_by`
--       ยังไม่มีใครสร้าง · **ตระกูลเดียวกับป้าย "ข้อยกเว้นที่ 4": ข้อความอ้างกฎที่โค้ดไม่ได้บังคับ**
--       → แก้คอมเมนต์ให้พูดความจริง
--
-- ══ ② `TRUNCATE` — ด่าน `D73` มีรูที่ไม่มีใครเห็นมาก่อน (P7) ═══════════════
-- `table_exposure` ฉบับใหม่วัดได้ว่า `service_role` มี **`TRUNCATE` บน 18 ตาราง** รวม `trip_stops`
-- P7 ไล่ต่อแล้วพบว่ามันทำให้คำอ้างในเอกสารของเขาเองเป็นเท็จ:
--   · **`TRUNCATE` ไม่ยิง row-level trigger เลย** — ยิงเฉพาะ statement-level ซึ่งเราไม่มีสักตัว
--   · ข้าม RLS · ข้าม policy · **ข้าม `force row level security` ที่เพิ่งลงไปเมื่อชั่วโมงก่อน**
--   · ไม่เขียน `deleted_at` · **ไม่เหลือ tombstone**
-- 🔴 → **`truncate public.trip_days cascade` ลบจุดแวะทั้งฐาน โดยด่าน `D73` ไม่ทำงานสักครั้ง**
--
-- **ถอน `TRUNCATE` อย่างเดียว ไม่แตะ verb อื่น** — `REFERENCES`/`TRIGGER`/`MAINTAIN` ไม่มีเส้นทาง
-- ทำลายข้อมูลแบบเดียวกัน และการถอนพร้อมกันหมดคือการเปลี่ยนของที่ยังไม่รู้ว่ามีใครพึ่ง
-- · P4 ถามมาตรง ๆ ว่าจะเอายังไงกับ 18 ตาราง — **นี่คือคำตอบ: ถอนเฉพาะ `TRUNCATE` ทุกตาราง**
-- · ชุดทดสอบไม่มีที่ไหนเรียก `truncate` (ใช้ `delete`) → **ถอนแล้วไม่มีอะไรพัง และถ้าพังคือเจอของ**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   grant truncate on <ตารางที่ระบุ> to service_role;
--   คืน app.stamp_checked_by() ฉบับ 20260825145708
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

-- ── ① `P-56` ───────────────────────────────────────────────────────────────
create or replace function app.stamp_checked_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_checked is distinct from old.is_checked then
    new.checked_by_user := case when new.is_checked then auth.uid() else null end;
    -- 🔴 `P-56` — ล้างตัวสำรองพร้อมกัน ไม่งั้นชื่อคนที่ไม่ได้ติ๊กแล้วค้างบนแถวผ่านประตูหลัง
    --    (บั๊กเดิมที่บรรทัดบนมีอยู่เพื่อกัน · `legacy_checked_by` พามันกลับมา)
    if not new.is_checked then
      new.legacy_checked_by := null;
    end if;
  end if;
  return new;
end;
$$;

comment on function app.stamp_checked_by() is
  'ติ๊ก/ติ๊กออก → เขียน/ล้าง checked_by_user **และ legacy_checked_by พร้อมกัน** (P-56) '
  'คอลัมน์สำรองต้องเดินตามวงจรชีวิตของตัวที่มันสำรอง ไม่งั้นรายการที่ไม่ได้ติ๊กจะมีชื่อคนติ๊กค้างอยู่';

comment on function public.authorship_columns() is
  'คู่คอลัมน์ประวัติที่ app.preserve_authorship() เดินตาม — <x>_by_user (uuid) ที่มี legacy_<x>_by (text) คู่กัน '
  '🔴 เกณฑ์เดียวที่ฟังก์ชันนี้บังคับคือ "มีคอลัมน์คู่กันอยู่จริง" — ไม่มีเกณฑ์ไหนตัด updated_by_user ออก '
  'มันไม่เข้าเพราะยังไม่มีใครสร้าง legacy_updated_by เท่านั้น (P4 ชี้) '
  '⚠️ เพิ่มคู่ใหม่ = ฟังก์ชันครอบเองทันที · `and legacy is null` ถูกกับคอลัมน์ที่เขียนครั้งเดียว '
  'และ **ผิดกับคอลัมน์ที่เปลี่ยนค่าได้** (ดู P-56) → คู่ใหม่ต้องถูกถามข้อนี้ก่อนเสมอ';

-- ── ② ถอน `TRUNCATE` จาก `service_role` ทุกตารางใน public ────────────────
do $revoke$
declare r record;
begin
  for r in
    select c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where c.relkind in ('r', 'p')
     order by 1
  loop
    execute format('revoke truncate on public.%I from service_role', r.relname);
  end loop;
end $revoke$;

-- ตรวจในทรานแซกชันเดียวกัน — **ไม่มีตารางไหนเหลือ `TRUNCATE` ให้ `service_role`**
do $verify$
declare leftover text[];
begin
  select array_agg(c.relname::text order by c.relname) into leftover
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    cross join lateral aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
   where c.relkind in ('r', 'p')
     and a.privilege_type = 'TRUNCATE'
     and a.grantee = 'service_role'::regrole::oid;
  if leftover is not null then
    raise exception 'ยังเหลือ TRUNCATE ให้ service_role บน: %', leftover;
  end if;
end $verify$;

commit;
