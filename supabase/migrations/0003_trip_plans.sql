-- ระบบแผน (plan) หลายเวอร์ชัน ตั้งชื่อ/สลับ/บันทึกได้ เช่น "แผน A", "แผน B"
create table if not exists public.trip_plans (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- แถวเดียว เก็บว่าตอนนี้กำลังดู/แก้แผนไหนอยู่ (ทั้ง 2 คนเห็นแผนเดียวกัน)
create table if not exists public.trip_meta (
  id int primary key default 1,
  active_plan_id text references public.trip_plans(id),
  constraint trip_meta_single_row check (id = 1)
);

alter table public.trip_plans enable row level security;
alter table public.trip_meta enable row level security;

-- แอปนี้ใช้กันแค่ 2 คนที่ไว้ใจกัน ไม่มีระบบล็อกอิน เลยเปิดอ่าน/เขียนแบบสาธารณะ
create policy "anyone can read plans"
  on public.trip_plans for select
  using (true);
create policy "anyone can insert plans"
  on public.trip_plans for insert
  with check (true);
create policy "anyone can update plans"
  on public.trip_plans for update
  using (true);
create policy "anyone can delete plans"
  on public.trip_plans for delete
  using (true);

create policy "anyone can read meta"
  on public.trip_meta for select
  using (true);
create policy "anyone can insert meta"
  on public.trip_meta for insert
  with check (true);
create policy "anyone can update meta"
  on public.trip_meta for update
  using (true);

-- เปิด realtime ให้ 2 ตารางนี้ เพื่อ sync การสลับ/สร้างแผนระหว่าง 2 คนแบบสด
alter publication supabase_realtime add table public.trip_plans;
alter publication supabase_realtime add table public.trip_meta;
