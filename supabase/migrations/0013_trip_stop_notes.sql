-- โน้ตสั้นๆ ต่อจุดแวะ เช่น "ร้านนี้อร่อย รีบไป" หรือจดร้านค้าที่อยากแวะในโซนกว้างๆ
alter table public.trip_stops
  add column if not exists note text;
