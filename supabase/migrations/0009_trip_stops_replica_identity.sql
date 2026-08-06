-- แก้บั๊ก: ลบจุดแวะ (trip_stops) สำเร็จในฐานข้อมูลจริง แต่ realtime ไม่ส่ง DELETE event กลับมาให้ client อื่น
-- (ต้อง reload หน้าถึงจะเห็นว่าลบไปแล้ว) — สาเหตุคือ subscription กรองด้วย filter: plan_id=eq.xxx
-- แต่ REPLICA IDENTITY เริ่มต้นของ Postgres ใส่มาแค่ primary key (id) ใน DELETE payload ไม่มี plan_id
-- ให้ evaluate filter เลยไม่ผ่าน event เลยหายไปเงียบๆ ต้องสั่งให้ log ทั้งแถวตอนก่อนลบด้วยถึงจะกรองได้ถูก
alter table public.trip_stops replica identity full;
