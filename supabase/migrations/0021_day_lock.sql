-- ล็อกวันที่ลงตัวแล้ว — กันเผลอลาก/แก้จุดแวะตอนเลื่อนดูบนมือถือ
-- false = แก้ได้ตามปกติ (ค่าเริ่มต้นของทุกวัน รวมวันเก่าที่มีแถวอยู่แล้ว)
alter table public.trip_day_settings
  add column if not exists is_locked boolean not null default false;
