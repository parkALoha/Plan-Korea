-- โหมดเดินทางขากลับของแต่ละวัน: จุดแวะสุดท้าย → ที่พักคืนนั้น
-- ขาไป (ที่พัก → จุดแวะแรก) ไม่ต้องมีคอลัมน์ใหม่ เพราะใช้ trip_stops.travel_mode ของจุดแวะแรก
-- ซึ่งเดิมถูกทิ้งไม่ได้ใช้ (computeSchedule ข้าม i === 0)
alter table public.trip_day_settings
  add column if not exists return_travel_mode text;
