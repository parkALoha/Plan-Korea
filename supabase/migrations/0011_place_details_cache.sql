-- แคชเวลาเปิด-ปิดจาก Google Places API (New) แบบถาวร (เหมือน place_photo_cache/travel_time_cache)
-- resolve แต่ละสถานที่เป็น Google place ID + regularOpeningHours ครั้งเดียว ไม่ต้องยิง Google ซ้ำ
create table if not exists public.place_details_cache (
  maps_query text primary key,
  google_place_id text,
  opening_hours jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.place_details_cache enable row level security;

create policy "anyone can read place details cache"
  on public.place_details_cache for select
  using (true);
create policy "anyone can insert place details cache"
  on public.place_details_cache for insert
  with check (true);
create policy "anyone can update place details cache"
  on public.place_details_cache for update
  using (true);
