-- เฟส 14 — ชื่อ/ที่อยู่ภาษาท้องถิ่นของแต่ละสถานที่ (เกาหลี = ko, ฮานอย = vi)
-- เหตุผล: ปุ่มนำทางส่ง "ชื่อภาษาไทย" เข้า Naver/Kakao ตรงๆ ซึ่งค้นไม่เจอ
-- ที่มาของข้อมูล: Places API (New) ตัวเดิม แค่ขอ languageCode ต่างออกไป ไม่ต้องเปิด API เจ้าใหม่
-- เก็บในตารางเดิม place_details_cache (migration 0011) ไม่ต้องสร้างตารางใหม่
--
-- ตั้งชื่อเป็น "local" ไม่ใช่ "ko" เพราะทริปนี้มีฮานอยด้วย — locale เก็บไว้ด้วยเพื่อให้รู้ว่า
-- ค่าที่แคชไว้เป็นภาษาอะไร (เผลอ resolve ผิดภาษาแล้วจะได้ล้างเฉพาะแถวนั้นได้)
alter table public.place_details_cache
  add column if not exists name_local text,
  add column if not exists address_local text,
  add column if not exists locale text;
