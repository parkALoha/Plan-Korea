-- เพิ่มข้อมูลร้าน/สถานที่ให้ละเอียดขึ้น (เฟส 2 ส่วนเสริม): เรทติ้ง, จำนวนรีวิว, ประเภท, รีวิวตัวอย่าง
-- เก็บในตารางเดิม place_details_cache (migration 0011) ไม่ต้องสร้างตารางใหม่
alter table public.place_details_cache
  add column if not exists rating numeric,
  add column if not exists user_rating_count integer,
  add column if not exists primary_type text,
  add column if not exists reviews jsonb;
