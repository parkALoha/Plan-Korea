-- ปิดงานค้างของเฟส 14 + เตรียมข้อมูลให้หน้า ตม. ของเฟส 16
--
-- เฟส 14 ฝัง nameLocal/addressLocal ให้สถานที่ใน data/places.ts ครบแล้ว แต่ **ที่พักยังไม่มี**
-- (trip_hotels.hotel_name มาจาก Google ตอน languageCode:"th") ปุ่ม "นำทางกลับที่พัก" ใน /today
-- จึงยังส่งชื่อไทยเข้า Naver/Kakao ซึ่งค้นไม่เจอ — เหมือนบั๊กเดิมที่เฟส 14 แก้ให้จุดแวะไปแล้ว
--
-- name_en/phone เพิ่มมาเพื่อหน้า /summary?lang=en&for=immigration โดยเฉพาะ:
-- ช่อง "ที่พักในเกาหลี" ของ ตม./K-ETA ต้องกรอกชื่อ+ที่อยู่เป็นอังกฤษและมีเบอร์ติดต่อ
alter table public.trip_hotels
  add column if not exists name_local text,
  add column if not exists address_local text,
  add column if not exists name_en text,
  add column if not exists address_en text,
  add column if not exists phone text;
