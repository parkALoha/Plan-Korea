-- สถานะจองของแต่ละตั๋ว/booking + วันที่ต้องจองล่วงหน้ากี่วัน — ตอบคำถาม "อันไหนยังต้องไปจอง จองภายในวันไหน"
-- ที่ตั๋ว/booking เดิมตอบไม่ได้ (มีแต่ชื่อ+วันที่ใช้ ไม่มีสถานะ)
--
-- book_by_days_before เป็นจำนวนวันที่ต้องจองล่วงหน้าก่อนวันที่ใช้ตั๋ว (คอลัมน์ date เดิม) — ฝั่งแอปคำนวณ
-- วันครบกำหนดจองเอง (date - book_by_days_before) ไม่เก็บวันครบกำหนดตรงๆ เพราะถ้าย้ายวันเดินทางทีหลัง
-- (ผูกวันใหม่ผ่าน dayId) ค่าที่คำนวณสดจะตามไปเองโดยไม่ต้องแก้ 2 ที่
alter table public.bookings
  add column if not exists status text not null default 'booked' check (status in ('booked', 'pending'));

alter table public.bookings
  add column if not exists book_by_days_before integer;
