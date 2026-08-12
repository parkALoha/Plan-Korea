-- เก็บชื่อเกาหลีของสถานที่ที่เพิ่มเอง (custom_places) เพิ่มจาก name_th/name_en เดิม
--
-- ชื่อเกาหลีมีประโยชน์จริงตอนโชว์คนขับแท็กซี่/ค้นใน Naver-Kakao ซึ่งชื่อไทยหรืออังกฤษใช้ไม่ได้
-- (รูปแบบเดียวกับ trip_hotels.name_local ที่เก็บไว้ตั้งแต่ migration 0026) — ดึงมาตอนกดค้นหา/เพิ่ม
-- เข้าคลังใน NearbyPlacesModal พร้อม th/en เลย ไม่ต้องมาตามขอทีหลัง
alter table public.custom_places
  add column if not exists name_ko text;
