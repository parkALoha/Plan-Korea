-- คืนไหนที่ยังเลือกเมืองนอนได้ (เช่น คืน 16 ต.ค. — คังนึง หรือ ซกโช) เก็บตัวเลือกไว้ตรงนี้
-- รูปแบบ: { "d5": "sokcho" }  · key = day id ใน data/itinerary.ts, value = city
-- อยู่ใน trip_meta (แถวเดียว id=1) เพราะที่พักเป็นของทริป ไม่ได้แยกตามแผน A/B
alter table public.trip_meta
  add column if not exists overnight_overrides jsonb not null default '{}'::jsonb;
