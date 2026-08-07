-- ติ๊ก "มาถึงแล้ว" ในหน้า "วันนี้" (เฟส 6) — timestamp จริงที่มาถึงจุดแวะนี้ ใช้เทียบกับแผนเพื่อเลื่อน timeline ที่เหลือของวัน
-- null = ยังไม่ได้ติ๊ก (ค่าเริ่มต้นของจุดแวะทุกจุด รวมจุดเก่าที่มีอยู่แล้ว)
alter table public.trip_stops
  add column if not exists visited_at timestamptz;
