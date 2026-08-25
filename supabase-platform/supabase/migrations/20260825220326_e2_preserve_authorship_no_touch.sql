-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 บั๊กใน `app.preserve_authorship()` ที่ P7 พบ (`mobile-arch.md §11.18`)
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · **ผมเป็นคนเขียนตัวที่พัง**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── กลไก ──────────────────────────────────────────────────────────────────
-- `preserve_authorship` เขียน `legacy_<x>_by` ด้วย `update` → แถวเปลี่ยนจริง
-- → `when (old.* is distinct from new.*)` เป็นจริง → **`app.touch_updated_at()` ยิงตาม**
-- → `new.updated_by_user := auth.uid()` ซึ่งตอนลบผ่าน admin API เป็น **`null`**
--
-- ── 🔴 เคสที่พัง — **ยิงจริงบน engine-dev แล้ว ก่อนแก้** ─────────────────────
--   ① A สร้างรายการ · ② **B (ยังอยู่ ไม่ได้ลาออก)** แก้ → `updated_by_user = B` ✅
--   ③ **A** ลบบัญชี → `legacy_added_by = 'A'` ถูกเขียน (ถูกต้อง)
--   ④ 🔴 **`updated_by_user` ของ B กลายเป็น `null`** · `updated_at` กระโดดมาเป็นเวลาที่ลบบัญชี
--      ```
--      ❌ updated_by_user ต้องยังเป็น B — ได้ null
--      ❌ updated_at ต้องไม่กระโดด — …57.651037 → …58.119488
--      ```
--
-- 🎯 **trigger ที่เขียนขึ้นเพื่อ*รักษา*ความเป็นเจ้าของ ไป*ทำลาย*บันทึกความเป็นเจ้าของ
--    อีกชนิดหนึ่ง ของคนที่ไม่ได้ลาออก** — และเป็นคอลัมน์ที่เราเพิ่งสรุปกันว่า **backfill ไม่ได้**
--    (ไม่มี `legacy_updated_by` ทั้งสคีมา · `D78` ครอบไม่ถึงโดยนิยาม)
--
-- **ผลข้างเคียงที่สอง (P7 ชี้ และสำคัญไม่แพ้กัน):** `updated_at` ของ*ทุกแถว*ที่คนนั้นเคยสร้าง
-- กระโดดพร้อมกัน → **delta sync เห็นเป็น "หลายร้อยแถวเพิ่งเปลี่ยน"** และแถวโกหกว่าเพิ่งถูกแก้
--
-- ── ทางที่เลือก และทำไมไม่ใช่อีก 2 ทางที่ P7 เสนอ ────────────────────────────
--   (ก) `when` ของ touch เทียบเฉพาะคอลัมน์ที่ไคลเอนต์เขียนได้ — **ตรงความหมายที่สุด**
--       ❌ แต่ `when` เขียน *"ทุกคอลัมน์ยกเว้น X"* ไม่ได้ ต้องไล่พิมพ์ชื่อคอลัมน์ทุกใบ 6 ตาราง
--       → **รายการที่ต้องดูแลตามทุกครั้งที่เพิ่มคอลัมน์** และตกหล่นแล้วเงียบ
--   (ข) `pg_trigger_depth() = 1` — สั้นที่สุด
--       ❌ P7 เตือนเองว่า **กว้างกว่าที่ตั้งใจ**: ข้าม touch ที่มาจาก trigger *ตัวอื่น* ด้วยทุกตัว
--       วันนี้ไม่มีตัวอื่น **แต่เป็นกฎเรื่อง*กลไก* ไม่ใช่เรื่อง*เจตนา*** — วันที่มี trigger ที่ควร touch
--       มันจะถูกข้ามเงียบ ๆ
--   ✅ **(ค) ธงที่บอกเจตนาตรง ๆ:** `app.preserving_authorship` — ตั้งเฉพาะในลูปของ `preserve_authorship`
--       · **ระบุว่า "ทำไม" ไม่ใช่ "จากไหน"** → trigger ตัวใหม่ที่ควร touch ยังทำงานปกติ
--       · `is_local = true` → คืนค่าเองเมื่อจบทรานแซกชัน **และผมล้างเองหลังลูปด้วย ไม่พึ่งอย่างเดียว**
--       · ⚠️ **ไคลเอนต์ตั้งธงนี้ไม่ได้** — PostgREST ส่งเข้ามาได้แค่ GUC ตระกูล `request.*`
--         และเราไม่ได้เปิด RPC ตัวไหนที่เรียก `set_config` · **ถ้าวันหนึ่งมีคนเปิด นี่จะกลายเป็นช่อง**
--
-- ✅ ใส่ธงใน **`touch_updated_at_only()` ด้วย** ทั้งที่วันนี้ `preserve_authorship` ไม่แตะตารางที่ใช้มัน
--    — `updated_at` ที่กระโดดโดยไม่มีใครแก้ เป็นบั๊กเดียวกันคนละใบ **กันตอนที่ยังไม่มีใครเจ็บถูกกว่า**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   คืน 2 ฟังก์ชันเป็นฉบับที่ไม่มีเงื่อนไขธง (20260825123214 · 20260825132854)
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
  -- 🔴 P7 `§11.18` — `preserve_authorship` เขียน `legacy_*_by` ตอนลบบัญชี
  --    ถ้าปล่อยให้ touch ยิง มันจะทับ `updated_by_user` **ของคนที่ยังอยู่** ด้วย `null`
  --    และดัน `updated_at` ของทุกแถวพร้อมกัน = delta sync เห็นเป็นการแก้ครั้งใหญ่ที่ไม่มีใครทำ
  if coalesce(current_setting('app.preserving_authorship', true), '') = 'on' then
    return new;
  end if;
  new.updated_at      := now();
  new.updated_by_user := auth.uid();
  return new;
end;
$$;

create or replace function app.touch_updated_at_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.preserving_authorship', true), '') = 'on' then
    return new;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app.preserve_authorship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  -- 🔴 ต้องตั้ง**ก่อน**ลูป และล้าง**หลัง**ลูป — ไม่พึ่ง `is_local` อย่างเดียว
  --    เพราะทรานแซกชันเดียวกันอาจมี cascade อื่นตามมาที่ *ควร* touch จริง
  perform set_config('app.preserving_authorship', 'on', true);

  for r in select * from public.authorship_columns() loop
    -- `and %I is null` — ห้ามทับสตริงเดิมที่ `E7` ย้ายมา
    -- ไม่กรอง `deleted_at` — tombstone ก็ต้องรู้ว่าใครเพิ่ม
    execute format(
      'update public.%I set %I = $1 where %I = $2 and %I is null',
      r.table_name, r.legacy_column, r.user_column, r.legacy_column
    ) using old.display_name, old.id;
  end loop;

  perform set_config('app.preserving_authorship', 'off', true);
  return old;
end;
$$;

comment on function app.preserve_authorship() is
  'P-55/D78/Q4 — ก่อนลบ profiles เขียน display_name ลง legacy_<x>_by ของทุกแถวที่คนนั้นเคยเพิ่ม/ติ๊ก/ซ่อน '
  'ไม่ทับค่าที่มีอยู่แล้ว · ไม่กรอง deleted_at '
  '🔴 ตั้งธง app.preserving_authorship ให้ touch_updated_at ข้าม (P7 §11.18) — ไม่งั้นจะลบ '
  'updated_by_user ของคนที่ยังอยู่ และดัน updated_at ของทุกแถวพร้อมกัน '
  'ห้ามเปลี่ยนเป็น SECURITY INVOKER: คนที่ลบบัญชีไม่มีสิทธิ์เขียนตารางของทริปที่เขาไม่ได้อยู่';

commit;
