-- ไฟล์แนบตั๋ว (รูป/PDF) ต่อ booking — ไฟล์จริงเก็บใน Storage bucket "booking-files" (ตั้งสาธารณะ)
-- ตารางนี้เก็บแค่ URL/ชื่อไฟล์เพื่ออ้างอิงกลับมาแสดง/เปิด/ลบ
alter table public.bookings
  add column if not exists file_url text,
  add column if not exists file_name text;

-- bucket "booking-files" ต้องสร้างเองใน Supabase Dashboard → Storage ก่อน (ตั้งเป็น Public)
-- ตั้ง Public แค่เปิดอ่านผ่าน URL แต่การอัปโหลดยังต้องมี policy เพิ่มให้ anon key เขียนได้ เหมือนตารางอื่นในโปรเจกต์นี้
create policy "anyone can read booking-files"
  on storage.objects for select
  using (bucket_id = 'booking-files');
create policy "anyone can upload booking-files"
  on storage.objects for insert
  with check (bucket_id = 'booking-files');
create policy "anyone can update booking-files"
  on storage.objects for update
  using (bucket_id = 'booking-files');
create policy "anyone can delete booking-files"
  on storage.objects for delete
  using (bucket_id = 'booking-files');
