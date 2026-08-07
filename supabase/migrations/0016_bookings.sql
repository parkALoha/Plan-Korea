-- ตั๋ว/booking ทุกประเภท (เที่ยวบิน/ที่พัก/KTX/บัส/ตั๋วเข้าชม) เก็บรวมตารางเดียว
-- ไม่แยกตามแผน A/B เพราะของที่จองจริงมีชุดเดียว (เหมือน trip_hotels/trip_meta)
create table if not exists public.bookings (
  id text primary key,
  category text not null, -- 'flight' | 'hotel' | 'ktx' | 'bus' | 'ticket' | 'other'
  title text not null,
  day_id text, -- อ้างอิง Day.id ใน data/itinerary.ts ถ้าผูกกับวันไหนได้ (ไม่บังคับ)
  date text, -- ISO date เผื่อไม่ได้ผูกกับ day_id ตรงๆ
  time text,
  confirmation_number text,
  link text,
  note text,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_day_idx on public.bookings (day_id);

alter table public.bookings enable row level security;

-- แอปนี้ใช้กันแค่ 2 คนที่ไว้ใจกัน ไม่มีระบบล็อกอิน เลยเปิดอ่าน/เขียนแบบสาธารณะ
create policy "anyone can read bookings"
  on public.bookings for select
  using (true);
create policy "anyone can insert bookings"
  on public.bookings for insert
  with check (true);
create policy "anyone can update bookings"
  on public.bookings for update
  using (true);
create policy "anyone can delete bookings"
  on public.bookings for delete
  using (true);

alter publication supabase_realtime add table public.bookings;
