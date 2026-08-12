-- โน้ต/รูปที่ "ติดอยู่กับสถานที่" ไม่ใช่กับจุดแวะ — ใช้ตอนลากจุดแวะจากวันกลับไปเก็บในคลัง
--
-- เดิมโน้ต (migration 0013) กับรูป (0023) อยู่บนแถว trip_stops ล้วนๆ พอลากการ์ดกลับคลัง
-- (= ลบแถวนั้นทิ้ง ดู handleDragEnd ใน hooks/useTripDnd.ts) โน้ตที่จดไว้ก็หายไปกับแถว
-- ปุ่ม "เลิกทำ" บน toast กู้คืนได้แค่ช่วงสั้นๆ พอกด undo ไม่ทันหรือรีโหลดหน้า = หายถาวร
-- ทั้งที่ในหัวผู้ใช้ "เก็บกลับคลัง" คือ **พักไว้ก่อน** ไม่ใช่ทิ้ง
--
-- ตารางนี้เป็นที่พักของโน้ต/รูประหว่างที่สถานที่นั้นไม่ได้อยู่ในวันไหนเลย:
--   ลากออกจากวัน  → เขียนโน้ต+รูปของแถวนั้นลงที่นี่ แล้วค่อยลบแถว
--   ลากกลับเข้าวัน → จุดแวะใหม่ได้โน้ต+รูปกลับไปเต็มๆ แล้วลบแถวนี้ทิ้ง
--
-- แยกตามแผน (plan_id) เหมือน trip_stops เพราะโน้ตเป็นของ "แผนนี้" ไม่ใช่ของทริปทั้งก้อน
-- ต่างจาก hidden_places/custom_places ที่ใช้ร่วมกันทุกแผน
create table if not exists public.place_notes (
  plan_id text not null,
  place_id text not null,
  note text,
  photo_url text,
  updated_at timestamptz not null default now(),
  primary key (plan_id, place_id)
);

alter table public.place_notes enable row level security;

-- แอปนี้ใช้กันแค่ 2 คนที่ไว้ใจกัน ไม่มีระบบล็อกอิน เลยเปิดอ่าน/เขียนแบบสาธารณะ (เหมือนตารางอื่นทั้งหมด)
create policy "anyone can read place_notes"
  on public.place_notes for select
  using (true);
create policy "anyone can insert place_notes"
  on public.place_notes for insert
  with check (true);
create policy "anyone can update place_notes"
  on public.place_notes for update
  using (true);
create policy "anyone can delete place_notes"
  on public.place_notes for delete
  using (true);

-- เหตุผลเดียวกับ migration 0009 ของ trip_stops: subscription กรองด้วย plan_id=eq.xxx
-- แต่ REPLICA IDENTITY เริ่มต้นส่งมาแค่ primary key ตอน DELETE — ที่นี่ PK มี plan_id อยู่ในตัวแล้ว
-- จึงกรองผ่านโดยไม่ต้อง `replica identity full` (ต่างจาก trip_stops ที่ PK เป็น id เดี่ยว)
alter publication supabase_realtime add table public.place_notes;
