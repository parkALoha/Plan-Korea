-- แยก checklist ของที่ต้องเตรียมเป็นหมวด (ของใส่กระเป๋า / ก่อนออกจากโรงแรม / ก่อนขึ้นเครื่อง / อื่นๆ)
-- ของเดิมทั้งหมดยังอยู่ครบ แค่ไม่มีหมวดจะเข้ากลุ่ม 'packing' (ค่า default) โดยอัตโนมัติ
alter table public.checklist_items
  add column if not exists category text not null default 'packing';
