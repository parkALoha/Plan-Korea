-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · `bookings.status` — คืนโดเมนที่ `column-map.md:70` สั่งไว้ว่า "คงเดิม"  │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- 🔴 **นี่ไม่ใช่ช่องว่างของข้อมูล มันคือเอกสารกับสคีมาที่ขัดกัน และไม่มีใครเห็นมาสี่วัน**
--
--   column-map.md:70   `status`  →  **"คงเดิม"**
--   e2_bookings.sql:67 ของจริง   →  `check (status in ('todo','booked','cancelled'))`
--
--   โดเมนเดิม (`lib/supabase.ts:140` · `BookingStatus`)  =  `booked` · `pending` · `walk_up`
--   โดเมนที่ลงจริง                                        =  `todo`   · `booked` · `cancelled`
--   ทับกันแค่ `booked` — **`pending` ถูกเปลี่ยนชื่อเป็น `todo` และ `walk_up` หายไปทั้งค่า**
--
-- 🎯 **ทำไมไม่มีอะไรจับได้:** ยังไม่เคยมีข้อมูลจริงไหลผ่านการแมปนี้เลย
--    `column-map.md` มีข้อความแบบนี้ ~550 บรรทัด และ **E7 เป็นผู้บริโภครายแรกและรายเดียว**
--    → คำสั่งแมปคือ *คำกล่าวอ้างเรื่องการแปลง* · การรันข้อมูลผ่านมันคือสิ่งเดียวที่ทดสอบคำกล่าวอ้างนั้น
--
-- 🔴 `walk_up` ไม่ใช่ค่าขยะของระบบเก่า — มันมีความหมายที่ค่าอื่นแทนไม่ได้ และมีโค้ดอ่านมันอยู่ 3 ที่:
--    · `lib/supabase.ts:137` — "ซื้อหน้างาน ไม่ต้องจองล่วงหน้า · **ต่างจาก booked ที่แปลว่าทำแล้ว**"
--    · `lib/bookingStatus.ts:37,58` — badge tone `walkup` + ตัวนับ `walkUp` แยกต่างหาก
--    · `components/BookingEditModal.tsx:22` — ตัวเลือกในดรอปดาวน์
--    ยุบเข้า `todo` = "ยังไม่ได้ทำ" ซึ่งตรงข้ามกับความหมาย · ยุบเข้า `booked` = "จองแล้ว" ซึ่งก็ผิด
--    **ไม่มีค่าปลายทางที่ถูก → ต้องเพิ่มค่า ไม่ใช่เลือกค่าที่ผิดน้อยที่สุด**
--
-- ตัดสิน: **`column-map.md` เป็นฉบับที่ผูกพัน → คืนชื่อเดิม + เก็บ `cancelled` ที่แพลตฟอร์มเพิ่มมา**
--   `pending` · `booked` · `walk_up` · `cancelled`
--
-- · **ถอน `todo` ทิ้ง ไม่เก็บไว้เป็นคู่เหมือน** — `todo` ≡ `pending` ความหมายเดียวกันคนละชื่อ
--   เก็บทั้งคู่ = คอลัมน์เดียวสองชื่อสำหรับสถานะเดียว ซึ่งเป็นรูปที่ทีมปฏิเสธไปแล้วใน "ข้อยกเว้นที่ 6"
-- · **ปลอดภัยเพราะ `todo` ไม่มีผู้บริโภคเลยสักราย** — วัดแล้ว: อ้างถึง 2 ที่ในทรีทั้งทรี
--   คือบรรทัดนิยามของมันเอง · กับ `engineCrossUser.test.ts:659` ซึ่งเป็น `category` ของ
--   `checklist_items` **ไม่ใช่ `bookings.status`** (ชื่อพ้องกันเฉย ๆ)
-- · `default` ย้าย `'todo'` → `'pending'`
--
-- ⚠️ **ข้อจำกัดที่อาจฆ่าข้อเสนอนี้เอง** (ตาม §3.4):
--   ① ถ้ามีใครตั้งใจให้ `todo`/`cancelled` เป็นโดเมนใหม่ของแพลตฟอร์มโดยจงใจ
--      → **ยังไม่พบหลักฐานเลย**: ไม่มี `D` number · ไม่มีคอมเมนต์ใน `e2_bookings.sql`
--        อธิบายการเปลี่ยน · `column-map.md` ยังเขียนว่า "คงเดิม" อยู่จนถึงวันนี้
--   ② ถ้าแถว `bookings` บนฐาน dev มีค่า `todo` อยู่แล้ว migration นี้จะล้ม
--      → บล็อกด้านล่างจึงแปลง `todo` → `pending` **ก่อน** เปลี่ยน constraint
--   ③ `cancelled` ไม่มีในโดเมนเดิม — เก็บไว้เพราะ `E2` ตั้งใจเพิ่ม และไม่มีอะไรขัดกับ `column-map`
--      (แผนที่บอกว่า "คงเดิม" สำหรับสิ่งที่ *มีอยู่* ไม่ได้ห้ามเพิ่ม)

begin;

-- ① แถวเดิมที่เป็น `todo` ต้องกลายเป็น `pending` ก่อน ไม่งั้น constraint ใหม่จะล้ม
update public.bookings set status = 'pending' where status = 'todo';

alter table public.bookings alter column status set default 'pending';
alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'booked', 'walk_up', 'cancelled'));

comment on column public.bookings.status is
  'E7 · โดเมนเดิมจาก lib/supabase.ts:140 + cancelled ที่ E2 เพิ่ม. '
  'walk_up = ซื้อหน้างาน ไม่ต้องจองล่วงหน้า — ต่างจาก booked ที่แปลว่าทำแล้ว. '
  'ห้ามยุบ walk_up เข้าค่าอื่น: bookingStatus.ts อ่านมันเป็น tone/ตัวนับแยก.';

-- ── ยิงสามทิศทันที ต้องไม่มีทิศไหนเงียบ ────────────────────────────────────
do $verify$
declare ok boolean;
begin
  -- ทิศ ①: ค่าเดิมทั้งสามต้องรับได้
  begin
    insert into public.bookings (id, trip_id, category, title, status)
    values ('00000000-0000-0000-0000-00000000e701', '00000000-0000-0000-0000-00000000e7ff',
            'v', 'v', 'walk_up');
    raise exception 'ทิศ ① พัง: insert สำเร็จทั้งที่ trip_id ปลอม — FK หาย?';
  exception
    when foreign_key_violation then null;                       -- ✅ ผ่าน constraint ค่า แล้วไปตายที่ FK
    when check_violation then raise exception 'ทิศ ① พัง: walk_up ยังถูกปฏิเสธ';
  end;

  -- ทิศ ②: ค่าที่ไม่อยู่ในโดเมนต้องถูกปฏิเสธ (ด่านต้องยังมีฟัน)
  begin
    insert into public.bookings (id, trip_id, category, title, status)
    values ('00000000-0000-0000-0000-00000000e702', '00000000-0000-0000-0000-00000000e7ff',
            'v', 'v', 'ค่ามั่ว');
    raise exception 'ทิศ ② พัง: รับค่านอกโดเมน = constraint ไม่ทำงาน';
  exception
    when check_violation then null;                             -- ✅
    when foreign_key_violation then raise exception 'ทิศ ② พัง: ไปถึง FK ก่อน = check ไม่ยิง';
  end;

  -- ทิศ ③: `todo` ต้องตายแล้วจริง ไม่ใช่แค่ไม่มีใครใช้
  begin
    insert into public.bookings (id, trip_id, category, title, status)
    values ('00000000-0000-0000-0000-00000000e703', '00000000-0000-0000-0000-00000000e7ff',
            'v', 'v', 'todo');
    raise exception 'ทิศ ③ พัง: todo ยังรับได้ = ถอนไม่สำเร็จ';
  exception
    when check_violation then null;                             -- ✅
    when foreign_key_violation then raise exception 'ทิศ ③ พัง: ไปถึง FK ก่อน';
  end;

  -- ④ default ต้องขยับจริง — ไม่ใช่แค่ constraint
  select column_default like '%pending%' into ok
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bookings' and column_name = 'status';
  if not ok then raise exception 'ทิศ ④ พัง: default ยังไม่ใช่ pending'; end if;

  raise notice 'E7 · bookings.status: pending/booked/walk_up/cancelled — ยิงครบ 4 ทิศ';
end $verify$;

commit;
