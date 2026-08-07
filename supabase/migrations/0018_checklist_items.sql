-- checklist ของที่ต้องเตรียมก่อนทริป — trip-wide ไม่แยกตามแผน A/B เหมือน bookings
create table if not exists public.checklist_items (
  id text primary key,
  text text not null,
  is_checked boolean not null default false,
  checked_by text,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.checklist_items enable row level security;

-- แอปนี้ใช้กันแค่ 2 คนที่ไว้ใจกัน ไม่มีระบบล็อกอิน เลยเปิดอ่าน/เขียนแบบสาธารณะ
create policy "anyone can read checklist_items"
  on public.checklist_items for select
  using (true);
create policy "anyone can insert checklist_items"
  on public.checklist_items for insert
  with check (true);
create policy "anyone can update checklist_items"
  on public.checklist_items for update
  using (true);
create policy "anyone can delete checklist_items"
  on public.checklist_items for delete
  using (true);

alter publication supabase_realtime add table public.checklist_items;
