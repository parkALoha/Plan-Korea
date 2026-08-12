-- เก็บ Google place id ของสถานที่ที่เพิ่มเอง — แก้บั๊ก "ร้านชื่อซ้ำคนละประเทศ"
--
-- อาการที่เจอจริง: "Cup & Cup" ที่กวางอัลลี ปูซาน (custom_places เก็บพิกัด 35.15046,129.11582 ถูกต้อง)
-- แต่ทุกเส้นทางที่คุยกับ Google ใช้ maps_query = "Cup & Cup" ซึ่งเป็นชื่อดิบล้วนๆ ไม่มีชื่อเมืองต่อท้าย
-- แบบที่ data/places.ts ทำ ("Jagalchi Market Busan") ผลคือ:
--   · place_details_cache ไปเก็บเวลาเปิด-ปิด/เรทติ้ง/รีวิว ของร้านชานมชื่อเดียวกันที่ Plano, Texas
--   · แผนที่ที่ฝังในหน้ารายละเอียด + ลิงก์ Google Maps โชว์ร้านชื่อเดียวกันในไทย (Google เดาจาก
--     ตำแหน่งของคนที่เปิดเว็บ) — ปุ่มนำทางใน /today ไม่โดนเพราะใช้ lat/lng ตรงๆ
--
-- ต่อไปเก็บ place id ที่ Google คืนมาตอนกดเพิ่ม แล้วยิง Place Details ด้วย id นั้นแทนการค้นด้วยชื่อ
-- (ดู lib/placeQuery.ts + lookupPlace ใน lib/googlePlaces.ts) · แถวเก่าเติมย้อนหลังด้วย
-- scripts/backfill-place-ids.mjs ซึ่งค้นจากพิกัดที่บันทึกไว้ จึงได้ร้านที่ถูกต้องแน่นอน
alter table public.custom_places
  add column if not exists google_place_id text;

-- ล้างแคชที่ resolve ผิดร้านทิ้ง — คีย์ใหม่ของสถานที่ที่มี place id จะเป็น "place_id:ChIJ..." อยู่แล้ว
-- แถวเก่าที่คีย์เป็นชื่อดิบจึงกลายเป็นขยะที่ไม่มีใครอ่าน (แต่ค่าที่ผิดจะยังค้างอยู่ถ้าไม่ลบ)
delete from public.place_details_cache where maps_query = 'Cup & Cup';
delete from public.place_photo_cache where maps_query = 'Cup & Cup';

-- ─────────────────────────────────────────────────────────────────────────────
-- ตัวเลือก (ไม่เกี่ยวกับบั๊กด้านบน) — ลบการ์ดซ้ำในคลังสถานที่
-- ตอนไล่บั๊กเจอว่ามีแถวซ้ำอยู่หลายชุด: Cup & Cup 6 แถว · Kungkungtta / Mun Dining /
-- Quán Café Maison De Hanoi / Gamcheon / ตลาดปลาจากัลชิ อย่างละ 2 (ชื่อ+พิกัดตรงกันเป๊ะ)
-- น่าจะกด "ลงคลัง" รัวก่อนปุ่มจะ disable
--
-- คำสั่งข้างล่างเก็บแถวที่ "มีจุดแวะในแผนอ้างถึงอยู่" ไว้ก่อนเสมอ ถ้าไม่มีใครอ้างเลยก็เก็บแถวที่เก่าที่สุด
-- ดูก่อนว่าจะโดนลบแถวไหนบ้าง ให้เปลี่ยน `delete` เป็น `select *` แล้วรันดูก่อน
--
-- delete from public.custom_places cp
--  where not exists (select 1 from public.trip_stops s where s.place_id = cp.id)
--    and exists (
--      select 1 from public.custom_places twin
--       where twin.id <> cp.id
--         and twin.name_th = cp.name_th and twin.lat = cp.lat and twin.lng = cp.lng
--         and (exists (select 1 from public.trip_stops s2 where s2.place_id = twin.id)
--              or twin.created_at < cp.created_at)
--    );
