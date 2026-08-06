-- โหมดเดินทางมาจุดแวะนี้จากจุดก่อนหน้าในวันเดียวกัน ("walk" | "transit" | "drive")
-- null = ยังไม่ได้เลือก ให้ UI ประมาณเวลาแบบเหมารวมไปก่อน (ดู lib/schedule.ts)
alter table public.trip_stops add column if not exists travel_mode text;
