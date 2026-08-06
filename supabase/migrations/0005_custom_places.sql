-- สถานที่ที่ผู้ใช้เพิ่มเอง (นอกเหนือจาก data/places.ts) รูปทรงเหมือน Place ทุกอย่าง
-- เพื่อให้ใช้ปนกับสถานที่คัดสรรได้เลยโดยไม่ต้อง special-case
create table if not exists public.custom_places (
  id text primary key,
  added_by text,
  city text not null,
  name_th text not null,
  name_en text,
  category text not null,
  lat double precision not null,
  lng double precision not null,
  maps_query text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.custom_places enable row level security;

create policy "anyone can read custom places"
  on public.custom_places for select
  using (true);
create policy "anyone can insert custom places"
  on public.custom_places for insert
  with check (true);
create policy "anyone can update custom places"
  on public.custom_places for update
  using (true);
create policy "anyone can delete custom places"
  on public.custom_places for delete
  using (true);

alter publication supabase_realtime add table public.custom_places;
