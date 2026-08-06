-- สถานที่ (ทั้งคัดสรรเองใน data/places.ts และ custom_places) ที่ผู้ใช้กด "ซ่อน" ทิ้งจาก list ด้านขวา
-- เก็บแค่ id ไว้เทียบ ไม่ผูกกับ plan ใดพลาน หนึ่งเดียว ใช้ร่วมกันทั้งทริป เหมือน custom_places
create table if not exists public.hidden_places (
  place_id text primary key,
  hidden_by text,
  hidden_at timestamptz not null default now()
);

alter table public.hidden_places enable row level security;

create policy "anyone can read hidden places"
  on public.hidden_places for select
  using (true);
create policy "anyone can insert hidden places"
  on public.hidden_places for insert
  with check (true);
create policy "anyone can delete hidden places"
  on public.hidden_places for delete
  using (true);

alter publication supabase_realtime add table public.hidden_places;
