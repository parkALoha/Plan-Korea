-- ════════════════════════════════════════════════════════════════════════════
-- E5 — ปิด `update (base_timezone)` **ของจริง** · ใบซ่อมของ `20260904120000`
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026 · P4 จับได้จากการยิงฐานจริง
-- ════════════════════════════════════════════════════════════════════════════
-- ## 🔴 ทำไมต้องมีใบนี้ — ผมทำผิดแบบเดียวกับที่ `…150000` เกิดมาแก้ ในวันเดียวกัน
-- ```
-- เช้า   เขียน …120000 → db push ล้ม (assert ผิด) → **ยังไม่ถูกบันทึก**
-- สาย    แก้ assert → push ผ่าน → `20260904120000` **ถูกบันทึกลง schema_migrations แล้ว**
-- บ่าย   P4 ชี้ว่า base_timezone เปิดอยู่ → ผมเติม `revoke` **ลงไฟล์เดิมนั้น** (f61394a)
--        → supabase ข้ามไฟล์ที่บันทึกแล้ว **ถาวร** ⇒ revoke ไม่เคยรัน · assert ก็ไม่เคยรัน
-- ```
-- 🎯 ***และเพราะ assert อยู่ในไฟล์เดียวกับ revoke — ตัวที่ควรส่งเสียงว่า "revoke ไม่ได้ผล"
--    ก็ไม่ได้รันเหมือนกัน · เงียบสองชั้น ไม่ใช่ชั้นเดียว***
-- 🔴 **บทเรียนที่ต้องอยู่ในไฟล์ ไม่ใช่ในแชต:**
--    ***migration ที่ถูกบันทึกแล้ว = ไฟล์อ่านอย่างเดียวตลอดกาล · แก้แล้วไม่มีอะไรฟ้อง***
--    ⇒ ของใหม่ต้องเป็น **ไฟล์ใหม่เลขใหม่เสมอ** ไม่ว่าจะเล็กแค่ไหน
--
-- 🔴 **P4 วัดจากฐานจริง ไม่ใช่จากการอ่านไฟล์:**
-- ```
-- applied_migrations()      20260904120000 ✅ (บันทึกแล้ว)
-- table_exposure('trips')   column-grant authenticated **UPDATE (base_timezone)**  ← ยังอยู่
-- ```
-- 🎯 ***ผมเคยสรุปว่า "…120000 ผ่าน ⇒ assert ผ่านครบ ⇒ revoke ได้ผล" — การอนุมานจาก
--    *ลำดับการรัน* ซึ่งผมเองเรียกมันว่าไม่พอสำหรับข้อนี้ แล้วก็ใช้มันอยู่ดี***
--
-- ## เหตุผลของการ revoke (เหมือนเดิม ไม่เปลี่ยน) — วัดแล้วสามข้อ
--   ① `create_trip()` เป็น `security definer` (`20260827080000:44,52`) ⇒ ไม่ผ่าน grant ของ `authenticated`
--   ② ไม่มี `upsert` บน `trips` ในโค้ดแอป ⇒ ไม่มี payload ไหนพา `base_timezone` เข้า `update`
--   ③ ไม่มีโค้ดไหน *อ่าน* มันไปคำนวณ — ตัวที่ใช้จริงคือ `trip_days.timezone`
-- 🔴 **ข้อ ③ คือเหตุผลที่ต้องปิด ไม่ใช่เหตุผลที่ปล่อยได้** — "แก้เป็นค่าขยะแล้วไม่มีอะไรพัง"
--    คือนิยามของ *ปลอดภัยด้วยข้อเท็จจริงที่ไม่เกี่ยวกับตัวมันเอง* · วันที่ `D37` มีตัวอ่าน จะไม่มีอะไรส่งเสียง

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

-- ⚠️ `revoke` ระดับคอลัมน์ **ลบสิทธิ์ระดับตารางไม่ได้** (`20260825122247:64-67`)
--    ที่นี่ปลอดภัยเพราะ `…122247:75` ล้างสิทธิ์ระดับตารางไปแล้ว **เหลือแต่ column grant**
--    ⇒ assert ข้างล่างเป็นตัวยืนยัน ไม่ใช่คอมเมนต์บรรทัดนี้
revoke update (base_timezone) on public.trips from authenticated;

do $assert$
begin
  -- 🔴 หัวใจของไฟล์นี้
  if has_column_privilege('authenticated', 'public.trips', 'base_timezone', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated ยัง update trips.base_timezone ได้ — revoke ไม่มีผล (สงสัย grant ระดับตารางค้างอยู่)';
  end if;

  -- ✅ เคสควบคุมฝั่งบวก — ไฟล์นี้ต้อง **ไม่** ปิดของที่ยังต้องใช้
  --    ไม่มีข้อนี้ `revoke update on public.trips` ทั้งตารางก็ผ่าน assert ข้างบนเหมือนกันเป๊ะ
  if not has_column_privilege('authenticated', 'public.trips', 'start_date', 'UPDATE') then
    raise exception 'assert ล้ม: ปิดกว้างเกิน — authenticated update trips.start_date ไม่ได้แล้ว';
  end if;
  if not has_column_privilege('authenticated', 'public.trips', 'end_date', 'UPDATE') then
    raise exception 'assert ล้ม: ปิดกว้างเกิน — authenticated update trips.end_date ไม่ได้แล้ว';
  end if;
  if not has_column_privilege('authenticated', 'public.trips', 'title', 'UPDATE') then
    raise exception 'assert ล้ม: ปิดกว้างเกิน — authenticated update trips.title ไม่ได้แล้ว';
  end if;

  -- 📌 `insert (… base_timezone …)` **ไม่ถูกแตะ** — ใบนี้ปิดเฉพาะ `update`
  --    (ถึงจะไม่มีผู้เรียกเพราะ create_trip เป็น definer แต่การถอนมันเป็นคนละการตัดสินใจ)
  if not has_column_privilege('authenticated', 'public.trips', 'base_timezone', 'INSERT') then
    raise exception 'assert ล้ม: ใบนี้ไปปิด INSERT ของ base_timezone ด้วย — ไม่ใช่เจตนา';
  end if;
end $assert$;

commit;
