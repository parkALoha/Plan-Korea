-- ตารางเก็บว่าแต่ละ leg ของทริป (ช่วงที่นอนเมืองเดียวกันติดกัน) พักโรงแรมไหน
create table if not exists public.trip_hotels (
  leg_id text primary key,
  city text not null,
  hotel_name text not null,
  formatted_address text,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.trip_hotels enable row level security;

-- แอปนี้ใช้กันแค่ 2 คนที่ไว้ใจกัน ไม่มีระบบล็อกอิน เลยเปิดอ่าน/เขียนแบบสาธารณะ (เหมือน trip_selections)
create policy "anyone can read hotels"
  on public.trip_hotels for select
  using (true);

create policy "anyone can insert hotels"
  on public.trip_hotels for insert
  with check (true);

create policy "anyone can update hotels"
  on public.trip_hotels for update
  using (true);

create policy "anyone can delete hotels"
  on public.trip_hotels for delete
  using (true);

-- เปิด realtime ให้ตารางนี้ เพื่อ sync ที่พักระหว่าง 2 คนแบบสด
alter publication supabase_realtime add table public.trip_hotels;
