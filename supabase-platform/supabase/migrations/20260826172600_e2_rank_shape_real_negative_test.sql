-- ═══════════════════════════════════════════════════════════════════════════
-- แก้ตัวเอง — `do $verify$` ของ `20260826171500` **ไม่ได้ทดสอบอะไรเลย**
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · พบเองหลังไฟล์นั้นลงไปแล้ว
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่ผมเขียนผิด ──────────────────────────────────────────────────────
-- ```
-- insert into public.trip_stops (id, rank) values (gen_random_uuid(), 'ก');
-- exception when check_violation then null; when others then null;   -- ← ตรงนี้
-- ```
-- `trip_stops` มี `trip_id` · `plan_id` · `trip_day_id` เป็น `not null`
-- → `insert` นั้นล้มด้วย **`not_null_violation`** ตั้งแต่ก่อนถึง `check` ด้วยซ้ำ
-- แล้ว `when others then null` ก็กลืนมันทิ้ง **บล็อกจึงผ่านโดยไม่เคยแตะด่านที่กำลังตรวจ**
--
-- 🎯 **นี่คือกับดักเดียวกับที่ทีมนี้ไล่ปิดกันมาทั้งวัน และผมเดินเข้าไปเอง**
-- > *"เขียวที่แปลว่า **ไม่ได้ตรวจ** ไม่ใช่ **ตรวจแล้วผ่าน**"*
-- · `db-push` ขึ้นสำเร็จ · ไม่มีอะไรแดง · **และหลักฐานที่ได้มามีค่าเท่ากับศูนย์**
-- · ตัวที่ทำให้มันเงียบสนิทคือ `when others then null` — **ตัวกลืน error แบบครอบจักรวาล
--   ในบล็อกที่มีหน้าที่พิสูจน์ว่า error เกิดขึ้น** · ห้ามเขียนอีกในไฟล์ไหนก็ตาม
--
-- ── ท่าที่ใช้ในไฟล์นี้: เขียนของจริงลงตารางจริง แล้ว rollback ────────────────
-- `update` แถวที่มีอยู่จริงภายใน `savepoint` — ผ่านด่านเดียวกับที่ผู้ใช้จะเจอทุกประการ
-- · จับเฉพาะ `check_violation` · **error ชนิดอื่น re-raise** ไม่กลืน
-- · 🔴 **ถ้าไม่มีแถวให้ทดสอบ = สรุปไม่ได้ ต้อง `raise` ไม่ใช่ผ่าน**
--   (ตารางว่าง = ไม่มีหลักฐาน · เป็นข้อเดียวกับที่ `rlsMatrix` เตือนตัวเองไว้)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่ใช่ engine-dev';
  end if;
end $guard$;

do $verify$
declare
  target uuid;
  keep   text;
  hit    boolean;
begin
  -- ① ด่านต้องมีอยู่จริง
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.trip_stops'::regclass
       and conname  = 'trip_stops_rank_shape'
       and contype  = 'c'
  ) then
    raise exception 'ไม่มี constraint trip_stops_rank_shape';
  end if;

  -- ② ต้องมีแถวจริงให้ยิงใส่ — ไม่มี = สรุปไม่ได้
  select id, rank into target, keep from public.trip_stops limit 1;
  if target is null then
    raise exception 'trip_stops ว่าง — ทดสอบด่านไม่ได้ และ "ไม่มีอะไรให้ทดสอบ" ไม่ใช่ "ผ่าน"';
  end if;

  -- ③ ทิศลบจริง: คีย์ลงท้ายด้วยตัวอักษรต่ำสุด
  hit := false;
  begin
    update public.trip_stops set rank = 'A0' where id = target;
  exception
    when check_violation then hit := true;
    -- 🔴 ไม่มี `when others` โดยเจตนา — error ชนิดอื่นต้องดังออกไป ไม่ใช่ถูกนับเป็นสำเร็จ
  end;
  if not hit then
    raise exception 'ด่านไม่ทำงาน: rank="A0" เขียนลงไปได้';
  end if;

  -- ④ ทิศลบจริง: อักขระนอกชุด (ทำให้ PG กับ JS เรียงคนละแบบ)
  hit := false;
  begin
    update public.trip_stops set rank = 'ก' where id = target;
  exception
    when check_violation then hit := true;
  end;
  if not hit then
    raise exception 'ด่านไม่ทำงาน: rank="ก" เขียนลงไปได้';
  end if;

  -- ⑤ 🔴 ทิศบวก — ด่านที่ปฏิเสธทุกอย่างจะดูเหมือนทำงานถูกถ้าไม่มีข้อนี้
  update public.trip_stops set rank = 'AU' where id = target;
  update public.trip_stops set rank = keep where id = target;   -- คืนค่าเดิม
end $verify$;

commit;
