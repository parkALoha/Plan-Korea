-- ตารางเก็บว่า slot ไหนของวันไหน เลือกสถานที่อะไรไว้
create table if not exists public.trip_selections (
  slot_id text primary key,
  day_id text not null,
  place_id text not null,
  selected_by text,
  updated_at timestamptz not null default now()
);

alter table public.trip_selections enable row level security;

-- แอปนี้ใช้กันแค่ 2 คนที่ไว้ใจกัน ไม่มีระบบล็อกอิน เลยเปิดอ่าน/เขียนแบบสาธารณะ
create policy "anyone can read selections"
  on public.trip_selections for select
  using (true);

create policy "anyone can insert selections"
  on public.trip_selections for insert
  with check (true);

create policy "anyone can update selections"
  on public.trip_selections for update
  using (true);

create policy "anyone can delete selections"
  on public.trip_selections for delete
  using (true);

-- เปิด realtime ให้ตารางนี้ เพื่อ sync การเลือกระหว่าง 2 คนแบบสด
alter publication supabase_realtime add table public.trip_selections;
