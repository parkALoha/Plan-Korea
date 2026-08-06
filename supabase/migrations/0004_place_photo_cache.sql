-- แคชผลลัพธ์รูปสถานที่จาก Google Places แบบถาวร (ไม่ใช่แค่ 30 วันเหมือน HTTP cache เดิม)
-- กันไม่ให้ต้องยิง Google ซ้ำทุกครั้งที่มีคนเปิดดู sidebar ที่โชว์รูปหลายสถานที่พร้อมกัน
create table if not exists public.place_photo_cache (
  maps_query text primary key,
  photo_names text[] not null default '{}',
  fetched_at timestamptz not null default now()
);

alter table public.place_photo_cache enable row level security;

create policy "anyone can read photo cache"
  on public.place_photo_cache for select
  using (true);
create policy "anyone can insert photo cache"
  on public.place_photo_cache for insert
  with check (true);
create policy "anyone can update photo cache"
  on public.place_photo_cache for update
  using (true);
