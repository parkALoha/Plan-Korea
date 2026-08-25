-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 `updated_by_user` ของ *คนที่ยังอยู่* ถูกลบตอนคนอื่นลบบัญชี
--    P7 พบอาการ (`mobile-arch.md §11.18`) · **P1 ยิงแล้วพบว่ากลไกเป็นคนละตัว และเก่ากว่าที่รายงาน**
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่ P7 รายงาน — **อาการถูกทุกตัวอักษร** ────────────────────────────
--   ① A สร้างรายการ · ② **B (ยังอยู่)** แก้ → `updated_by_user = B`
--   ③ **A** ลบบัญชี → ④ 🔴 `updated_by_user` ของ B กลายเป็น `null` · `updated_at` กระโดด
--   → ยืนยันด้วยการยิงจริง **ก่อน**แก้: `ได้ null` · `…57.651 → …58.119`
--
-- ── 🔬 แต่กลไกไม่ใช่ `preserve_authorship` — พิสูจน์ด้วยแถวควบคุม ────────────
-- P7 วิเคราะห์ว่า `preserve_authorship` `update` แถว → touch ยิงตาม · **สมเหตุสมผลมาก แต่ไม่ใช่**
--
-- **แถวควบคุม:** ตั้ง `legacy_added_by` ไว้ล่วงหน้า → ลูปของ `preserve_authorship` **ไม่แตะแถวนั้น**
-- (มี `and %I is null` กันอยู่ · ยืนยันแล้วว่าค่าเดิมไม่ถูกทับ) · แต่ FK ยัง null `added_by_user`
-- ```
-- ✅ แถวควบคุม: legacy เดิมไม่ถูกทับ — มีค่าอยู่แล้ว     ← trigger ผมไม่ได้แตะแถวนี้
-- ✅ แถวควบคุม: added_by_user ถูก FK ล้างเป็น null
-- ❌ แถวควบคุม: updated_by_user ยังเป็น B ไหม — ได้ null  ← **แต่ยังโดนลบ**
-- ```
--
-- 🎯 **ตัวยิง `touch` คือ `on delete set null` ของ FK เอง ไม่ใช่ trigger ตัวไหนของเรา**
--    → **บั๊กนี้มีมาตั้งแต่ `20260825123214` (วันที่ `updated_by_user` เกิด) และจะมีอยู่แม้ไม่มี `D78`**
--    → **มันกว้างกว่าที่รายงาน:** ทุกครั้งที่ใครสักคนลบบัญชี **ทุกแถวที่เขาเคยสร้าง**
--      จะลบบันทึก *"ใครแก้ล่าสุด"* ของ**คนอื่น**ทิ้ง และดัน `updated_at` พร้อมกันเป็นก้อน
--
-- ⚠️ **และนี่คือเหตุผลที่ธงที่ผมลองก่อนหน้า (`app.preserving_authorship`) แก้ไม่ได้** —
--    ธงครอบเฉพาะช่วงที่ลูปของผมรัน · **FK ยิงหลังจากนั้น ตอนแถว `profiles` ถูกลบจริง**
--    → ถอนธงออก **ไม่เก็บกลไกที่พิสูจน์แล้วว่าไม่ครอบ ไว้เป็นของประดับ**
--
-- ── ทางที่เลือก: `pg_trigger_depth()` — และรับคำเตือนของ P7 ตรง ๆ ────────────
-- P7 ค้านทางนี้ไว้ว่า **"กว้างกว่าที่ตั้งใจ · เป็นกฎเรื่อง*กลไก* ไม่ใช่*เจตนา*"** — **ข้อค้านนั้นถูก**
-- แต่หลักฐานข้างบนเปลี่ยนน้ำหนัก: **ของที่ต้องกันไม่ได้มาจาก trigger ของเราเลย มันมาจาก FK**
-- ซึ่งเป็นกลไกของ PostgreSQL ที่เรา**ไม่มีจุดให้ติดธงเจตนา** · ทางที่เหลือจึงต้องพูดภาษากลไก
--
-- 🎯 **และเมื่อเขียนเป็นความหมาย มันก็ตรงพอดี:**
--    *`updated_at`/`updated_by_user` บันทึก **การแก้ของคน** · การกระทำที่เกิดจากข้อบังคับ
--    ของฐาน (FK action) หรือจาก trigger ตัวอื่น **ไม่ใช่การแก้ของคน***
--    · `update` ตรงจากไคลเอนต์ → touch อยู่ที่ depth 1 → **stamp ปกติ**
--    · FK `set null` / trigger ตัวอื่นสั่ง → touch อยู่ที่ depth ≥ 2 → **ไม่ stamp**
--    · `soft_delete_*()` เป็น**ฟังก์ชัน ไม่ใช่ trigger** → depth 1 → **ยัง stamp เหมือนเดิม** (ตั้งใจ)
--
-- 🔴 **ราคาที่รับไว้ และต้องจดเพราะ P7 เตือนถูก:** วันที่มี trigger ตัวใหม่ที่ *ควร* stamp
--    มันจะถูกข้ามเงียบ ๆ → **กติกาคู่กัน: trigger ที่ต้องการ stamp ต้องเขียน `updated_by_user`
--    ลงไปเอง ห้ามหวังพึ่ง `touch_updated_at`**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   คืน 2 ฟังก์ชันเป็นฉบับ 20260825123214 / 20260825132854 (ไม่มีเงื่อนไข depth)
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

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 🔴 depth ≥ 2 = การแก้นี้เกิดจาก FK action หรือ trigger ตัวอื่น **ไม่ใช่คนแก้**
  --    (P7 §11.18 · P1 พิสูจน์ว่าตัวยิงคือ `on delete set null` ด้วยแถวควบคุม)
  --    ถ้าไม่กัน: ใครลบบัญชี → `updated_by_user` ของ **คนอื่นที่ยังอยู่** ถูกล้างทุกแถวที่เขาเคยสร้าง
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  new.updated_at      := now();
  new.updated_by_user := auth.uid();
  return new;
end;
$$;

comment on function app.touch_updated_at() is
  'stamp updated_at/updated_by_user เฉพาะการแก้ที่มาจากคน — depth >= 2 (FK on delete set null · '
  'trigger ตัวอื่น) ไม่ stamp เพราะไม่ใช่การแก้ของใคร (P7 §11.18 · พิสูจน์ด้วยแถวควบคุม) '
  '🔴 กติกาคู่กัน: trigger ที่ต้องการ stamp ต้องเขียน updated_by_user เอง ห้ามพึ่งตัวนี้';

create or replace function app.touch_updated_at_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ถอนธงที่พิสูจน์แล้วว่าไม่ครอบ — **ของประดับที่ดูเหมือนการป้องกัน อันตรายกว่าไม่มี**
create or replace function app.preserve_authorship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in select * from public.authorship_columns() loop
    execute format(
      'update public.%I set %I = $1 where %I = $2 and %I is null',
      r.table_name, r.legacy_column, r.user_column, r.legacy_column
    ) using old.display_name, old.id;
  end loop;
  return old;
end;
$$;

comment on function app.preserve_authorship() is
  'P-55/D78/Q4 — ก่อนลบ profiles เขียน display_name ลง legacy_<x>_by ของทุกแถวที่คนนั้นเคยเพิ่ม/ติ๊ก/ซ่อน '
  'ไม่ทับค่าที่มีอยู่แล้ว (ของ E7 สำคัญกว่า) · ไม่กรอง deleted_at (tombstone ก็ต้องมีเจ้าของ) '
  'การ update ในนี้ไม่ดัน updated_at เพราะ touch_updated_at กัน depth >= 2 ไว้แล้ว '
  'ห้ามเปลี่ยนเป็น SECURITY INVOKER: คนที่ลบบัญชีไม่มีสิทธิ์เขียนตารางของทริปที่เขาไม่ได้อยู่';

commit;
