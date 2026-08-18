-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ แม่แบบ migration ของแพลตฟอร์ม — คัดลอกไปตั้งชื่อใหม่ใน migrations/         │
-- │ ⚠️ ไฟล์นี้อยู่ "นอก" migrations/ โดยตั้งใจ จะได้ไม่ถูก CLI หยิบไปรัน        │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- rollback:
--   (เขียนคำสั่งย้อนกลับของ migration นี้ไว้ตรงนี้ตั้งแต่วันที่เขียน)
--   drop table if exists public.<ตารางที่สร้าง>;
--
-- 🔴 ห้ามปล่อยช่อง rollback ว่าง — migration ที่ไม่มีทางถอย แก้ได้ทางเดียวคือเขียน SQL สดหน้างาน

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
-- ไม่มี ref ไม่มีความลับในบล็อกนี้ · อ้างสิ่งที่มีอยู่ใน schema อยู่แล้ว
-- ทำงานตอนคนพลาด ไม่ใช่ตอนคนอ่านเอกสารล่วงหน้า · raise exception = rollback ทั้ง transaction
do $$
begin
  -- migration แรกสุดของแพลตฟอร์ม: เปลี่ยนเงื่อนไขเป็น "ต้องยังไม่มี trip_meta"
  -- เพื่อกันไม่ให้รันใส่ DB ทริปโดยพลาด (DB ทริปมี trip_meta อยู่แล้ว)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trip_meta'
  ) then
    raise exception 'ผิดโปรเจกต์: ฐานนี้มีตาราง trip_meta = นี่คือ DB ทริปจริง ไม่ใช่ engine-dev';
  end if;

  -- migration ตัวที่ 2 เป็นต้นไป: เปลี่ยนมา assert ตาราง _project_identity แทน
  -- (ชัดกว่าและไม่ผูกกับ schema ที่จะเปลี่ยนไปเรื่อยๆ)
  -- if not exists (select 1 from public._project_identity where name = 'plan-korea-platform') then
  --   raise exception 'ผิดโปรเจกต์: ฐานนี้ไม่ใช่ engine-dev ของแพลตฟอร์ม';
  -- end if;
end $$;

-- ── DDL ของจริงเริ่มตรงนี้ ────────────────────────────────────────────────────
