-- สถานะที่สามของตั๋ว: "ซื้อหน้างาน" (walk_up) — ของที่ไม่ต้องจองล่วงหน้าเลย
--
-- ก่อนหน้านี้ status มีแค่ 'booked' | 'pending' ทำให้ของที่ซื้อหน้างานไม่มีที่อยู่ ต้องยัดเป็น
-- 'booked' (= โกหกว่าจองแล้ว) แล้วเขียนคำว่า "ซื้อหน้างาน — " นำหน้า title เอาเอง ผลคือ
-- ตัวเลข "จองแล้ว" บนหัวแผงนับของที่ยังไม่ได้จองรวมเข้าไปด้วย และกรอง/เรียงตามสถานะไม่ได้
--
-- walk_up ต่างจาก booked ตรงที่ "ไม่มีอะไรต้องทำล่วงหน้า" ส่วน booked คือ "ทำแล้ว" — คนละความหมาย
-- และต่างจาก pending ตรงที่ไม่ต้องมีวันครบกำหนดจอง (book_by_days_before ปล่อยว่างเสมอ)

alter table public.bookings drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check check (status in ('booked', 'pending', 'walk_up'));

-- ย้าย 3 แถวที่เคยยัดเป็น booked + เขียนนำหน้าใน title ให้มาอยู่สถานะที่ถูกต้อง
-- แล้วตัดคำนำหน้าออกจากชื่อ เพราะป้ายสถานะบนการ์ดบอกแทนแล้ว (ชื่อซ้ำกับป้ายอ่านรก)
update public.bookings
set status = 'walk_up',
    title = regexp_replace(title, '^ซื้อหน้างาน — ', ''),
    book_by_days_before = null,
    updated_at = now()
where title like 'ซื้อหน้างาน — %';
