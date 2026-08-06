-- แคชเวลาเดินทางจริงจาก Google Routes API แบบถาวร (เหมือน place_photo_cache)
-- คู่จุด+โหมดในทริปคงที่ ยิง Google ครั้งเดียวพอ ประหยัด quota และเร็วขึ้นมากตอนโหลดหน้า
create table if not exists public.travel_time_cache (
  from_place_id text not null,
  to_place_id text not null,
  travel_mode text not null,
  duration_minutes integer not null,
  distance_meters integer,
  fetched_at timestamptz not null default now(),
  primary key (from_place_id, to_place_id, travel_mode)
);

alter table public.travel_time_cache enable row level security;

create policy "anyone can read travel time cache"
  on public.travel_time_cache for select
  using (true);
create policy "anyone can insert travel time cache"
  on public.travel_time_cache for insert
  with check (true);
