-- แถวเดินทางระหว่างเมือง (บัส/KTX) แทรกกลางลิสต์จุดแวะของวันนั้นได้เลย ใช้ ordering/drag เดิมของ trip_stops ทั้งหมด
-- kind='intercity': place_id เป็นค่าว่าง, dwell_minutes เก็บ "ระยะเวลาเดินทาง" (กินเวลาใน timeline จริงๆ)
alter table public.trip_stops
  add column if not exists kind text not null default 'place',
  add column if not exists intercity_from text,
  add column if not exists intercity_to text,
  add column if not exists intercity_mode text; -- 'bus' | 'ktx' | 'other'
