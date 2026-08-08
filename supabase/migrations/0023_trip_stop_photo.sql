-- รูปหน้างานต่อจุดแวะ ต่อยอดจากโน้ตที่มีอยู่แล้ว (migration 0013) — ใช้ bucket booking-files เดิม
alter table public.trip_stops
  add column if not exists photo_url text;
