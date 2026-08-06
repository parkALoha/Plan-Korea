-- แทนที่ระบบ slot คงที่เดิม (data/itinerary.ts) ด้วยลิสต์จุดแวะที่ผู้ใช้สร้างเอง ต่อวัน ต่อแผน
create table if not exists public.trip_stops (
  id text primary key,
  plan_id text not null references public.trip_plans(id) on delete cascade,
  day_id text not null,
  place_id text not null,
  order_index int not null,
  dwell_minutes int,
  added_by text,
  updated_at timestamptz not null default now()
);

create index if not exists trip_stops_plan_day_idx on public.trip_stops (plan_id, day_id, order_index);

-- เวลาเริ่มออกเดินทางของแต่ละวัน ต่อแผน (default 07:00)
create table if not exists public.trip_day_settings (
  plan_id text not null references public.trip_plans(id) on delete cascade,
  day_id text not null,
  start_time text not null default '07:00',
  primary key (plan_id, day_id)
);

alter table public.trip_stops enable row level security;
alter table public.trip_day_settings enable row level security;

create policy "anyone can read stops"
  on public.trip_stops for select
  using (true);
create policy "anyone can insert stops"
  on public.trip_stops for insert
  with check (true);
create policy "anyone can update stops"
  on public.trip_stops for update
  using (true);
create policy "anyone can delete stops"
  on public.trip_stops for delete
  using (true);

create policy "anyone can read day settings"
  on public.trip_day_settings for select
  using (true);
create policy "anyone can insert day settings"
  on public.trip_day_settings for insert
  with check (true);
create policy "anyone can update day settings"
  on public.trip_day_settings for update
  using (true);

alter publication supabase_realtime add table public.trip_stops;
alter publication supabase_realtime add table public.trip_day_settings;
