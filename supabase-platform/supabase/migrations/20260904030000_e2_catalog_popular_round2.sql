-- ════════════════════════════════════════════════════════════════════════════
-- E2 — สถานที่แนะนำรอบสอง: เกาหลี · ไทย · เวียดนาม + ญี่ปุ่นที่กฎเดิมมองข้าม
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ต่อจาก `20260904020000`
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 ทำไมถึงมีรอบสอง — กฎแจกเมืองรอบแรกยังแคบเกิน ───────────────────
-- รอบแรกใช้ `locality` + `admin1` เทียบกับ **`name_en` อย่างเดียว** · ผลรอบแรก:
--     ไทย **3 แห่ง** จาก 156 ที่เจอ · เวียดนาม **2 แห่ง** จาก 18
-- วัดแล้วพบว่า **ไทยกับเวียดนามไม่มี `locality` เลยสักรายการ**
-- และ `administrative_area_level_1` เป็น **ชื่อท้องถิ่น**:
--     กรุงเทพฯ  loc=—  admin1=กรุงเทพมหานคร    คลังเก็บ name_en='Bangkok'
--     ฮานอย     loc=—  admin1=Hà Nội           คลังเก็บ name_en='Hanoi'
--     โซล       loc=—  admin1=Seoul            ตรง จึงผ่านมาแต่แรก
--
-- 🎯 ***ผลลบที่มาจากกฎแคบเกิน ไม่ใช่จากข้อมูล*** — ใบที่สองของวันเดียวกัน
--    (ใบแรก: โตเกียวได้ 0 เพราะ Google บอก locality เป็นชื่อเขต)
--    🔴 **ทั้งสองใบ "ทำงานสำเร็จ" และให้ตัวเลขที่ดูสมเหตุสมผล** — ไม่มี error ไม่มีอะไรแดง
--       ถ้าไม่สงสัยว่า "ทำไมไทยได้แค่ 3" ก็จะลงไปแค่นั้นแล้วจบ
--
-- ✅ แก้โดยเทียบกับ **ชื่อทุกแบบที่คลังเรามีอยู่แล้ว** (`name_en` · `name_local` · `name_th`)
--    `catalog_cities.name_local` เก็บ `กรุงเทพมหานคร` / `Hà Nội` ตรงกับที่ Google คืนมาเป๊ะ
--    🎯 **ใช้ข้อมูลของเราเอง — ไม่สร้างตารางแปลชื่อขึ้นมาใหม่ให้ล้า**
--
-- ── ผลหลังแก้ ─────────────────────────────────────────────────────────
--     ไทย 3 → 112  ·  เวียดนาม 2 → 21  ·  เกาหลี 56 → 57
--     ญี่ปุ่น **+60** ที่กฎเดิมมองข้าม (293 ที่ลงไปแล้วถูกกันซ้ำถูกต้อง)
--     รวมไฟล์นี้ **250 แห่ง**
--
-- ── ⚠️ สิ่งที่ไฟล์นี้ไม่ได้ทำ ──────────────────────────────────────────
-- · ไม่แตะแถวเดิมเลย — กันซ้ำด้วย `google_place_id` และ `legacy_slug` ทั้งข้ามรอบและข้ามประเทศ
-- · ไม่ตัดแถวที่รีวิวน้อยออก — เกณฑ์ตายตัวจะตัดของจริงของเมืองเล็กทิ้งไปด้วย
-- · ไม่มีชื่อในไฟล์นี้ — `catalog_places` ไม่มีคอลัมน์ชื่อ (`D77` แยกไป `catalog_place_names`)
-- ════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์ — ต้องเป็น plan-korea-platform/pmvxwcimjebogjfimzqy/dev';
  end if;
  -- 🔴 รอบแรกต้องลงก่อน ไม่งั้นตัวเลข assert ข้างล่างจะเทียบกับฐานที่ผิด
  if (select count(*) from public.catalog_places where source = 'google') < 293 then
    raise exception 'ต้องรัน 20260904020000 (ญี่ปุ่นรอบแรก) ก่อน';
  end if;
end $guard$;

insert into public.catalog_places
  (city_id, legacy_slug, category, lat, lng, maps_query, google_place_id, source)
-- 🔴 `maps_query` **สร้างจาก `gpid` ตรงนี้ ไม่พิมพ์ซ้ำในทุกแถว**
--    เดิมเขียน `'place_id:X', 'X'` ติดกัน → `gitleaks` จับเป็น `generic-api-key`
--    (รูป `key, value` ที่ค่าซ้ำกัน) · **ตัวข้อมูลไม่ใช่ความลับ — Google Place ID เป็นตัวระบุสาธารณะ**
--    🎯 แก้ที่ *รากของความซ้ำ* ไม่ใช่สอน scanner ให้มองข้าม —
--       ผลพลอยได้: `maps_query` ไม่มีทางดริฟต์จาก `google_place_id` ได้อีก
-- ⚠️ ต้อง cast ให้ชัด — ผ่าน `values` ตรง ๆ Postgres อนุมานชนิดจากคอลัมน์ปลายทางให้เอง
--    แต่ผ่าน `select` มันเป็น `text`/`numeric` ตามที่เขียน → `42804` (city_id uuid vs text)
select v.city_id::uuid, v.slug, v.cat, v.lat::double precision, v.lng::double precision,
       'place_id:' || v.gpid, v.gpid, 'google'
  from (values
  -- ══ เกาหลีใต้ (kr) · 57 แห่ง · 5 เมือง ══
  -- โซล · 14 แห่ง
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'place-149', 'sight', 37.5511694, 126.98822659999999, 'ChIJqWqOqFeifDURpYJ5LnxX-Fw'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'place-148', 'culture', 37.579617, 126.977041, 'ChIJod7tSseifDUR9hXHLFNGMIs'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'gwangjang-market', 'market', 37.570038499999995, 126.99960379999997, 'ChIJm3V0fu2ifDURRJ8IMUijVtY'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'place-153', 'culture', 37.523850599999996, 126.98047020000001, 'ChIJN2x0fu2ifDUR51BupseGYmE'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'place-152', 'market', 37.559277, 126.9777029, 'ChIJfYjlFvWifDURYSDsoxYbN80'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'myeongdong-shopping-street', 'market', 37.5637699, 126.9844765, 'ChIJXz2vx_GifDURImd3aTJZ1VA'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'starfield-coex-mall', 'shopping', 37.5118346, 127.05978710000001, 'ChIJIRVdC6pFezUR02aa2I7i57A'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'place-150', 'culture', 37.5814696, 126.9849519, 'ChIJT8H4r9qifDURmuXJ_6m6vM0'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'yeouido-hangang-park', 'nature', 37.5267106, 126.9347112, 'ChIJ77fEAzuffDURLEWNv56G2KQ'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'hongdae-shopping-street', 'sight', 37.5541906, 126.92248319999999, 'ChIJY1TpNNuYfDUR2uoHfH8zI8c'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'place-151', 'sight', 37.5561973, 126.9250341, 'ChIJ68AiKsWYfDUROpTctLKtxtU'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'mangwon-market', 'market', 37.5559018, 126.90628539999997, 'ChIJA6gxryiZfDURJvmbeBvdz_Y'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'myeongdong-night-market', 'market', 37.561668499999996, 126.9858438, 'ChIJqb-ne_CifDURR-yH8a3sjXM'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'starfield-library', 'sight', 37.5100586, 127.0601188, 'ChIJu5Gg2hWkfDURl7NN7FpFnis'),
  -- ปูซาน · 14 แห่ง
  ('97456683-e619-4881-be68-04b2c7e576e6', 'gamcheon-culture-village', 'sight', 35.097393499999995, 129.0105921, 'ChIJUToRo7fpaDURo_ZMItcBfpc'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'place-142', 'market', 35.0966339, 129.0307965, 'ChIJudkrFArpaDURbbCzajeQs0c'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'biff-square', 'sight', 35.098243, 129.029212, 'ChIJL1scg6DpaDURxXQZg1kWGZ4'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'bupyeong-kkangtong-market', 'market', 35.101853999999996, 129.0258719, 'ChIJ21pR1aHpaDUR_usy_ELBCvk'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'gukje-market', 'market', 35.1013575, 129.0281978, 'ChIJfYLMelSTaDURFlCRfk5W1PA'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'oryukdo-skywalk', 'nature', 35.1006767, 129.12440089999998, 'ChIJVRLdCsjtaDURcdummQTLnRk'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'busan-tower', 'viewpoint', 35.101191299999996, 129.0323697, 'ChIJq0OD23TpaDURTv9SBp0VWtI'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'haeundae-blueline-park-mipo-station', 'sight', 35.158284, 129.17276719999998, 'ChIJfdIYWwuNaDURDx-eqtUjCkg'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'huinnyeoul-culture-village', 'sight', 35.0782798, 129.0453198, 'ChIJseGsfh7paDURigYilgTVojA'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'haeundae-blueline-park-cheongsapo-statio', 'sight', 35.1613733, 129.1918758, 'ChIJswP7EdKNaDURw-a1ZgZ_-Uk'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'place-143', 'culture', 35.2839899, 129.0687639, 'ChIJsQ63-9KWaDURQmHr0J6VF_4'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'haeundae-traditional-market', 'market', 35.161453699999996, 129.16224889999998, 'ChIJCXner12NaDURvTHbPe3S9tU'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'busan-x-the-sky', 'viewpoint', 35.1594845, 129.1701682, 'ChIJnbg-nA2NaDUR3DK_vogcxaI'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'shinsegae-department-store-centum-city', 'shopping', 35.1689218, 129.1296311, 'ChIJSSw7slWTaDURjMs-oU61YYc'),
  -- คังนึง · 14 แห่ง
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'place-144', 'market', 37.7539884, 128.8986105, 'ChIJ5-y4g_vlYTURGd4LueRcB1E'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'ojukheon', 'culture', 37.779235299999996, 128.8775226, 'ChIJKQ8jYrnlYTURKf8PKysmjgA'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'heo-gyun-heo-nanseolheon-memorial-park', 'nature', 37.7910146, 128.9095207, 'ChIJ62xT8ZvmYTURIBBCJSBpY6Q'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'arte-museum-valley-gangneung', 'culture', 37.7917805, 128.90718999999999, 'ChIJoUu3n2LnYTURY4nBu-SE2qg'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'seongyojang-house', 'culture', 37.7865369, 128.88512129999998, 'ChIJn5peWMrlYTURS0SwuW8GLpQ'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'gyeongpo-aquarium', 'sight', 37.7908652, 128.9061409, 'ChIJHRZlz5zmYTUR75KB7tEiCvw'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'gyeongpo-lake-plaza', 'nature', 37.797876099999996, 128.9085807, 'ChIJp2L24qHmYTURpCVBqWSZzlY'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'aranabi-zipline', 'viewpoint', 37.7671373, 128.9513612, 'ChIJBcdorAbnYTURnDhxpP3RiZk'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'daegwanryung-baby-animal-farm', 'sight', 37.797852, 128.8296851, 'ChIJUR-DwDDlYTURupW6hVYKHOc'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'ojukheon-house-ojukheon-municipal-museum', 'culture', 37.7791837, 128.8794575, 'ChIJs8tjDbnlYTURo2DEXDegOGw'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'gyeongpo-lake', 'sight', 37.796698299999996, 128.9020548, 'ChIJeX0RpiXkYTUResqZFyoPnhU'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'place-145', 'nature', 37.7534233, 128.900185, 'ChIJO6JD0_rlYTURmj0SHRXXzFo'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'place-147', 'culture', 37.7604241, 128.89084119999998, 'ChIJXS5qu-vlYTURu8RBOetWsQQ'),
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'place-146', 'sight', 37.7922738, 128.9226354, 'ChIJA66cAuPnYTURu9uyGYTTwRc'),
  -- ซูวอน · 14 แห่ง
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'hwaseong-haenggung', 'culture', 37.2819666, 127.01372699999999, 'ChIJZ3YTCjRDezUROWCZyAEmL2k'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'lotte-mall-suwon', 'shopping', 37.2640396, 126.99708389999999, 'ChIJ6wpkWR1DezURy7WoLrzgmJM'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'place-155', 'culture', 37.2871202, 127.01193789999999, 'ChIJuy6oD8pcezURQRbto2vkJhM'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'gwanggyo-lake-park', 'nature', 37.2830911, 127.0659215, 'ChIJAZZYbz5bezURpK5_V17-nRU'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'paldalmun-gate', 'culture', 37.2775525, 127.01673480000001, 'ChIJCRJLTDZDezUR5HNU9y_TFg8'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'banghwasuryujeong-pavilion', 'nature', 37.2875289, 127.0180362, 'ChIJgcIxDMpcezURPiQ5d54tMT4'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'starfield-suwon', 'shopping', 37.2873665, 126.99120749999999, 'ChIJV-ZOvmdDezURVYEkKRoAi4o'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'janganmun-gate', 'culture', 37.2888038, 127.01420549999999, 'ChIJcUTH68tcezUR42J8u60v1Dk'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'suwon-hwaseong-museum', 'culture', 37.2825914, 127.01936060000001, 'ChIJ6fcrokpDezUR2NXh6LlMHAk'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'mr-toilet-house', 'culture', 37.3191026, 126.9779385, 'ChIJRcwUAhVdezURPRvXcFlV4hg'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'hwaseomun-gate', 'culture', 37.285556, 127.00966410000001, 'ChIJ7x8A6TJDezURMDF2cdNg7G8'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'paldalmun-traditional-market', 'market', 37.276756899999995, 127.0176413, 'ChIJuzvNITZDezURQi0owDfD8r8'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'suwon-chicken-street', 'market', 37.2793262, 127.01771970000001, 'ChIJ5YUoO19DezURc2kIfrscUzA'),
  ('e5818824-01c7-4df7-a392-ae0e3de7435f', 'suwon-rodeo-street', 'sight', 37.2674782, 127.00148109999999, 'ChIJPwJ3NcZDezURIdylc3IZXJ4'),
  -- ซกโช · 1 แห่ง
  ('503dba27-b1e0-42a2-9d85-4dc8953f8123', 'place-154', 'culture', 38.2005142, 128.5395484, 'ChIJCx5GQe-82F8RJPIU8El5Kk8'),
  -- ══ ไทย (th) · 112 แห่ง · 9 เมือง ══
  -- กรุงเทพฯ · 3 แห่ง
  ('4d0bc9f9-918f-45e5-a02b-91d7bc932e5d', 'siam-paragon', 'shopping', 13.7461302, 100.53477919999999, 'ChIJIeWu482e4jARYymvLJqTQ58'),
  ('4d0bc9f9-918f-45e5-a02b-91d7bc932e5d', '9', 'shopping', 13.758595399999999, 100.5661774, 'ChIJt4AYHY2e4jARP0jJFXncXCE'),
  ('4d0bc9f9-918f-45e5-a02b-91d7bc932e5d', '21-2', 'shopping', 13.7379635, 100.5604058, 'ChIJuWuZbh6f4jAReZMEm2xxgzM'),
  -- ภูเก็ต · 14 แห่ง
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-221', 'culture', 7.8275763, 98.3128423, 'ChIJOSmXz2AvUDARXCxlBBs7y38'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-220', 'shopping', 7.8924737999999985, 98.29861489999999, 'ChIJezyyaqM6UDARyh5o4-SHqkw'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-219', 'shopping', 7.8915987, 98.36776160000001, 'ChIJRZ0Fp8YxUDARkWRjR4GpCeM'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'tiger-kingdom', 'sight', 7.907038200000001, 98.3300115, 'ChIJ0xtyOmgwUDARKUcz6kOyiEQ'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-224', 'market', 7.8911311, 98.30188550000001, 'ChIJ_4N2NqQ6UDARpQJNzqo-uOw'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-223', 'market', 7.880704799999999, 98.36572869999999, 'ChIJ02EC1NsxUDAR9ou27HphtVM'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-222', 'market', 7.907042099999999, 98.3732872, 'ChIJbQQ1Rr0xUDARwb-3w3Va9FY'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-230', 'market', 7.8934569, 98.2978693, 'ChIJ1UWzVKM6UDARf1Hufv8vum0'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'patong-beach-bangla-walking-street', 'sight', 7.894037699999999, 98.2953325, 'ChIJuW5aobw6UDAR-PxGrDUw6O4'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-227', 'nature', 7.8615359, 98.4006072, 'ChIJYUobZuMtUDARo9bj1N4gsFs'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-228', 'shopping', 7.9208746, 98.39483469999999, 'ChIJ87EbSn4xUDAR7RLglJsw0Xw'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-225', 'shopping', 7.980832899999999, 98.3622201, 'ChIJjxHhcm83UDARo22yzWwUTOk'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-229', 'sight', 7.8858768999999995, 98.39054589999999, 'ChIJwQNkeNkxUDAR8qOAaNNJz6Y'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-226', 'sight', 7.8835986999999985, 98.3907407, 'ChIJqz35rNwxUDARX5pwBUKnTuE'),
  -- เชียงใหม่ · 11 แห่ง
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-159', 'market', 18.7852244, 99.0002986, 'ChIJW0qnDKY62jARHbAmfwD1Lgs'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-158', 'culture', 18.7869693, 98.9865804, 'ChIJFRQRM5k62jARuqhLBJpw91w'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-157', 'shopping', 18.7682663, 98.9758056, 'ChIJN16-o2Qw2jARYD2lMk7tI48'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-161', 'shopping', 18.800276699999998, 98.96763729999999, 'ChIJ8QdNKPU72jARtz_iHmA6_zk'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-162', 'market', 18.8062295, 98.995325, 'ChIJzfxey8A62jARBouRzNKxv58'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-163', 'sight', 18.7423503, 98.9173241, 'ChIJvzLCOik32jARGvij4r7Ar8o'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-166', 'culture', 18.7960243, 98.9825675, 'ChIJdQDDAJE62jARAEom00EUJDc'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-165', 'nature', 18.8065843, 98.9517827, 'ChIJAcZ9kDg72jARBFb2ttUgIFg'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-156', 'market', 18.7901454, 99.0007242, 'ChIJUXF8Lzo72jARQGy1_Bh_wCQ'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-160', 'sight', 18.7763256, 98.9487285, 'ChIJdxPPqzUx2jARn86GcuRsD1s'),
  ('a2a0f711-cc72-45e6-b6c3-3de6c75fc16a', 'place-164', 'sight', 18.777065699999998, 98.9955681, 'ChIJJ9zZWLQ72jARL2kwVhxFiSk'),
  -- เชียงราย · 14 แห่ง
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-167', 'culture', 19.923395199999998, 99.84187349999999, 'ChIJERD0pfEG1zARLAVNEwcKLOc'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-169', 'culture', 19.949199399999998, 99.8067097, 'ChIJE7rdqpsG1zAR64zTj5CGWiw'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-170', 'market', 19.9053883, 99.834141, 'ChIJI1KFhmcG1zARx6hSmnczoCI'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-171', 'culture', 19.992037, 99.8607523, 'ChIJAQAAAFAA1zARlrvp9yTMeoE'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-172', 'sight', 19.9071489, 99.8309632, 'ChIJMWn662YG1zARY4ZUtHVhxu4'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-168', 'shopping', 19.8864083, 99.834704, 'ChIJvzTBwxUG1zAR5OLFPMIdPWY'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-175', 'culture', 19.9117551, 99.82770219999999, 'ChIJM0ZotmMG1zAR8gOSR5FZZWM'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-173', 'market', 19.9085863, 99.8356773, 'ChIJB58or2YG1zARIqCoOjtpJH0'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-179', 'market', 19.9670102, 99.85589089999999, 'ChIJlcIM8ykB1zARdJkZrhXTF6w'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', '75', 'nature', 19.9081308, 99.83462720000001, 'ChIJoWZIq2AG1zARVVfkAo45EKM'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-177', 'sight', 19.9776185, 99.8327446, 'ChIJaREWakAB1zARq7440oCtjEM'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-178', 'market', 19.9098392, 99.82955439999999, 'ChIJI9JxXGEG1zARy4oKANlANzw'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-174', 'nature', 19.916804799999998, 99.79475070000001, 'ChIJ_UBWxTQE1zAREHHg6nw3fww'),
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'place-176', 'sight', 19.929312499999998, 99.78818749999999, 'ChIJB96FSwAF1zAR2SZwLKJA2oI'),
  -- กาญจนบุรี · 14 แห่ง
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-181', 'culture', 13.953917299999999, 99.6051342, 'ChIJTd23d7MN4zARea8isCHcnMs'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-180', 'culture', 14.0419974, 99.50424000000001, 'ChIJO5Nl1fl04zARnXj8n_p1Kio'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-184', 'sight', 13.9552362, 99.5270323, 'ChIJ063o6t5y4zARUutCnSm9jOw'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-182', 'sight', 14.0211276, 99.52717489999999, 'ChIJGbfq2Y914zARu_5Blh3JRKc'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-183', 'shopping', 14.022572499999999, 99.5532237, 'ChIJo8gZ9EgL4zARp5isIDoDi9E'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-186', 'market', 14.0336491, 99.52453930000001, 'ChIJ6WTDi8F04zARXvyd6SiXK90'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-185', 'culture', 13.9707624, 99.5789295, 'ChIJWxZOwkxz4zARnbE5cfNaIdk'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-188', 'culture', 14.032244599999999, 99.5248622, 'ChIJ2zG9vcF04zAR9c5Y7ZIGuwk'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-189', 'culture', 14.026777099999999, 99.5263239, 'ChIJ-RRFFL904zAR0T_8S-KxZmI'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-191', 'shopping', 14.050984, 99.50518149999999, 'ChIJUyN_4Nl14zARINJQNxTiJrU'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-187', 'sight', 14.031636, 99.5255602, 'ChIJ_SfFB8F04zAR5RZtEfU-JQ4'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-192', 'market', 14.023945200000002, 99.52650899999999, 'ChIJpXFZn2J14zARnnfxNpx58LI'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-190', 'shopping', 14.035690599999999, 99.57168, 'ChIJZzXZ6O0L4zAREy1JwQQDEMQ'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-193', 'sight', 13.9978252, 99.5065491, 'ChIJWbxLv5dz4zAR5P7TywBAG2A'),
  -- อุดรธานี · 14 แห่ง
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-243', 'shopping', 17.405905999999998, 102.8000848, 'ChIJdWqro3ydIzERqUeNzYy418s'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-253', 'nature', 17.41921, 102.78038769999999, 'ChIJd7JhQWudIzERrQoe5K6cdeg'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-244', 'shopping', 17.398968399999998, 102.80461389999999, 'ChIJidTKkH2dIzERRVqH_kDLrtA'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-252', 'shopping', 17.4087094, 102.7921806, 'ChIJ_wTe6m-dIzERrnuqDCoOgsg'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-246', 'shopping', 17.4306399, 102.7868139, 'ChIJLWEFpkidIzERnpHDPXBCFWk'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-247', 'sight', 17.411872799999998, 102.7863548, 'ChIJkZTNOmydIzERM1XeWTtZE_s'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-255', 'culture', 17.4136964, 102.7784902, 'ChIJPUCNdhOdIzEREmgWNAZbMK8'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-245', 'market', 17.385842699999998, 102.8198101, 'ChIJFz6qbRt3IzERCdY5Du6F0Gk'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-251', 'sight', 17.4134115, 102.7876412, 'ChIJrStJBmydIzERmt8pPMpSZlw'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-248', 'shopping', 17.424980599999998, 102.8125906, 'ChIJ__aAB-V3IzERjcmnC0q76Po'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-256', 'market', 17.4143334, 102.7761008, 'ChIJ9wrKUhGdIzERiUwJTpwjxA0'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-254', 'shopping', 17.3542536, 102.8232946, 'ChIJE4IbIQx2IzERBltdx_kbuqA'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-249', 'market', 17.4063656, 102.8043773, 'ChIJSUkmRH2dIzERlnRFAgEGgP4'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-250', 'market', 17.4146975, 102.7863204, 'ChIJzW3dPO6dIzERhFPba6lHivo'),
  -- กระบี่ · 14 แห่ง
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-195', 'market', 8.064136, 98.9162686, 'ChIJsY7cDZuUUTAReC0SG3DDiSQ'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-194', 'market', 8.0425716, 98.8115002, 'ChIJITt06ge_UTARoxsq267h2SA'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-202', 'sight', 8.0046094, 98.8402551, 'ChIJf2k-CoPqUTARdDu7bnB2sQw'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-198', 'sight', 8.067209, 98.91713530000001, 'ChIJ91fdA5OVUTAR_iCoamJIf3o'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', '75-2', 'sight', 8.0228576, 98.8837435, 'ChIJk1i25ybrUTARzTR9LMrCbCI'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'night-market-place-krabi', 'market', 8.0371013, 98.8188157, 'ChIJm62CtMDBUTARMF_Bl3_bjMk'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-200', 'shopping', 8.064364099999999, 98.91546600000001, 'ChIJFavPJZqUUTAR6wKSuEjcNGQ'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-197', 'sight', 8.0295626, 98.86265639999999, 'ChIJTwjJ2sjqUTARBuFo0wcWcPI'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-199', 'sight', 8.0312944, 98.8216633, 'ChIJ5S2NTL3BUTARcYtz75iKsXk'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-196', 'shopping', 8.1007497, 98.8923906, 'ChIJa8ePA7mVUTARAx1dPnnLALM'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-201', 'market', 8.0652521, 98.9162911, 'ChIJg1unTJmUUTARFdJqeHHih1U'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-204', 'sight', 8.0047014, 98.84246300000001, 'ChIJx5EZu4TqUTARW0WKfKazY2k'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-203', 'sight', 8.0774014, 98.92063669999999, 'ChIJdxGKmLqVUTARYt_dicLeoE0'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'krabi-town', 'sight', 8.0630875, 98.9161924, 'ChIJ8xcSagCVUTAR6aUSLGqRW4w'),
  -- น่าน · 14 แห่ง
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-205', 'culture', 18.7745748, 100.7716394, 'ChIJ5wbUHHSOJzERdmgoTxUKx5c'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-206', 'culture', 18.758260699999997, 100.7917114, 'ChIJC6p82WuOJzERtn8wP4KwThk'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-208', 'culture', 18.769884299999998, 100.750627, 'ChIJxxizrgCPJzER4MSPjGOh8qM'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-212', 'culture', 18.7758508, 100.7657368, 'ChIJOwTMSeSNJzERoSfeW1dzZts'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-210', 'culture', 18.774646500000003, 100.7691162, 'ChIJj8rf1naOJzERxnNHu-hBjS4'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-207', 'market', 18.774904499999998, 100.771892, 'ChIJdzNBoHaOJzERqBdDVVlz5WU'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-209', 'culture', 18.7762417, 100.770759, 'ChIJH-rAm3aOJzERG8kulFTAMVA'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-214', 'culture', 18.7841953, 100.77387879999999, 'ChIJC6RVfeiNJzERLXHs-7ZwemU'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-211', 'market', 18.7819592, 100.77264219999999, 'ChIJk8UcOd-NJzER2M8pUt9viRs'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-218', 'culture', 18.7896076, 100.7856035, 'ChIJe4YbouWNJzERAouub2mRHIg'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-215', 'shopping', 18.7838574, 100.7805353, 'ChIJ2dKYyOaNJzERI-yn9ca9Og8'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-213', 'market', 18.7753205, 100.77156579999999, 'ChIJI3pKpnaOJzERWGVJGt0gu44'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-217', 'market', 18.777916500000003, 100.7766865, 'ChIJVQiYSNOPJzERyfxbX5u_6Fw'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-216', 'market', 18.781084399999997, 100.7712284, 'ChIJB6ShpdiNJzER73ShQbNNNhA'),
  -- สุโขทัย · 14 แห่ง
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-231', 'nature', 17.050496499999998, 99.7929755, 'ChIJCZNR9h5W3jARjzkvxkAmw9g'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-232', 'sight', 17.0052211, 99.82563499999999, 'ChIJY2aZMc1V3jARPiqCpUeTPR8'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'baan-ma-kwid-sukhothai', 'sight', 17.0197291, 99.72512569999999, 'ChIJpV-8uIdX3jARqQjw1fdvmEs'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-233', 'culture', 17.0200224, 99.7196616, 'ChIJ19JBwovd3jARrsUjUJu6oMU'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'sukhothai-night-market', 'market', 17.008125, 99.8192445, 'ChIJt7PxvdJV3jARJT8edmslu8U'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-234', 'market', 17.0374943, 99.8854143, 'ChIJ16S9UFtV3jARF1DLz91aULo'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-240', 'sight', 17.0056395, 99.8258986, 'ChIJ5ySyJc1V3jARgPJAS37jkLU'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-237', 'market', 17.0091915, 99.8152465, 'ChIJMXNMyNVV3jARwUY0GH2Zf6s'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-236', 'sight', 17.013677599999998, 99.80656409999999, 'ChIJXyteaHlW3jAREjt9YXtHfTY'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-239', 'market', 17.0172676, 99.71436560000001, 'ChIJt7l4XS5Y3jARTr4OekNilyQ'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-238', 'market', 16.9974161, 99.8375152, 'ChIJd_ChnUlU3jARWnVmfj17Vgg'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-235', 'sight', 17.005557, 99.826371, 'ChIJ2yWedjdV3jARIhEy4VfVWxo'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-242', 'shopping', 17.0092031, 99.8189315, 'ChIJC3fukdNV3jAR52LyclgdAGs'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-241', 'shopping', 17.060837499999998, 99.8763638, 'ChIJ_____6-q3zARFdoqMuHOv7E'),
  -- ══ เวียดนาม (vn) · 21 แห่ง · 2 เมือง ══
  -- โฮจิมินห์ · 12 แห่ง
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'aeon-shopping-mall-tan-phu', 'shopping', 10.801581899999999, 106.61744329999999, 'ChIJmQa2NZUrdTERWx3Ui77zN0c'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'independence-palace-2', 'culture', 10.776994199999999, 106.69530209999999, 'ChIJL0dwVTgvdTERao3t8B1Jhxc'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'saigon-zoo-botanical-gardens', 'sight', 10.787334399999999, 106.70505659999999, 'ChIJx7wwM0svdTERjuH2a9dkuU0'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'aeon-mall-binhtan', 'shopping', 10.7427497, 106.61193089999999, 'ChIJ21B7zs4tdTERMUUTqUN2P_U'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'notre-dame-cathedral-of-saigon', 'culture', 10.779785500000001, 106.6990189, 'ChIJUSTY5jcvdTERRVvtbJNZT-g'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'bui-vien-walking-street', 'sight', 10.767351000000001, 106.69388359999999, 'ChIJCdzLBRYvdTERpsMyNScNwPE'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'landmark-81-2', 'sight', 10.795115299999999, 106.72210020000001, 'ChIJEQnz-MIndTERzRrJ-HNQrDY'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'trung-tam-thuong-mai-van-hanh', 'shopping', 10.7705748, 106.6699228, 'ChIJv46B290udTER2KNHXwQFjPw'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'saigon-centre', 'shopping', 10.7731031, 106.70105, 'ChIJPY9kQ0cvdTERNEixjJGVzhY'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'vincom-center-dong-khoi', 'shopping', 10.7779043, 106.7022087, 'ChIJm5rCdkgvdTERQiGNZ2iXx9I'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'gigamall-shopping-center', 'shopping', 10.827854199999999, 106.721396, 'ChIJ951RcRopdTERn8dxXCbA7ss'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'thu-duc-agricultural-product-market', 'market', 10.868741499999999, 106.72870719999999, 'ChIJ_5YuXPkndTERE8cDps_LAhs'),
  -- ฮานอย · 9 แห่ง
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'hoa-lo-prison-relic', 'culture', 21.0253297, 105.8464781, 'ChIJld5RqparNTERVK8x7gvhAZc'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'aeon-mall-long-bien', 'shopping', 21.0260523, 105.8992395, 'ChIJNz9FhWqpNTEROakgr0rjnAM'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'vincom-center-ba-trieu', 'shopping', 21.0108794, 105.84957969999999, 'ChIJrY2_Mw-sNTERn0V6wwnp0DE'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'cho-phung-khoang', 'market', 20.9861757, 105.793617, 'ChIJu73oKMasNTER7vEqWnRc2Xc'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'hanoi-old-quarter-2', 'culture', 21.034059, 105.8506368, 'ChIJp0o4Er6rNTERjlTif_IXU1k'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'vincom-center-tran-duy-hung', 'shopping', 21.0068834, 105.7958149, 'ChIJazy26bGtNTER-hhtBIyWrcc'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'phu-tay-ho', 'sight', 21.0551012, 105.8197288, 'ChIJuerTwf2qNTERnvjmhZRDyik'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'vincom-mega-mall-smart-city', 'shopping', 21.005567199999998, 105.75442029999999, 'ChIJYwi0Xj-tNTERWwalADGv0Nw'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'trang-tien-plaza', 'shopping', 21.0248168, 105.8532846, 'ChIJH7MdsoWrNTER_Nl9HDXPekk'),
  -- ══ ญี่ปุ่น (jp) · 60 แห่ง · 15 เมือง ══
  -- โอซากะ · 4 แห่ง
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'abeno-harukas', 'viewpoint', 34.6460706, 135.5134771, 'ChIJed3mI_DdAGARJyFcpACSbwc'),
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'hep-five', 'shopping', 34.7040897, 135.50046319999998, 'ChIJkfagoZPmAGARIcaEGF7Vd2U'),
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'don-quijote-umeda-main-store', 'market', 34.7032174, 135.5009133, 'ChIJjcj6Z5PmAGARU90PonEJIls'),
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'lucua-osaka', 'shopping', 34.7028866, 135.4953236, 'ChIJ_W6qxY3mAGARSV21ZIJAEmM'),
  -- โตเกียว · 5 แห่ง
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'shibuya-crossing-2', 'sight', 35.659482, 139.7005596, 'ChIJK9EM68qLGGARacmu4KJj5SA'),
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'tokyo-midtown', 'shopping', 35.6659803, 139.7308747, 'ChIJU2MukniLGGAR1qSN4ds5Pus'),
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'ameyoko-market', 'market', 35.7090028, 139.7746259, 'ChIJh7eDrwCPGGARCs9fpCkKS2U'),
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', '109', 'shopping', 35.6595771, 139.698728, 'ChIJhxxszamMGGARcuAXpFunolU'),
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'don-quijote-ginza-honkan', 'market', 35.667122, 139.7618936, 'ChIJE1wGD-iLGGARyisyYKXJcV8'),
  -- เกียวโต · 1 แห่ง
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'senbon-torii-thousand-torii-gates', 'culture', 34.967042899999996, 135.77465949999998, 'ChIJGVpMOBQPAWARF96_WA-XIl0'),
  -- ซัปโปโร · 4 แห่ง
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'sapporo-hitsujigaoka-observation-hill', 'sight', 42.999068199999996, 141.3945073, 'ChIJx2WCDKMqC18RnEw-r64NwtY'),
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'sapporo-stellar-place', 'shopping', 43.0681096, 141.3518039, 'ChIJa_KH3HQpC18RuO2-tNVySg0'),
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'aeon-sapporo-naebo', 'shopping', 43.0797445, 141.4047881, 'ChIJFxCPUU0pC18R3Eku-fgqzJM'),
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'cocono-susukino', 'shopping', 43.0551326, 141.352701, 'ChIJD1Ej2J0pC18RLYj6SwBbIvc'),
  -- โกเบ · 6 แห่ง
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'kobe-oji-zoo', 'sight', 34.709351, 135.2152279, 'ChIJDTB81pmOAGARLfmjrTRbPys'),
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'rokko-garden-terrace', 'viewpoint', 34.764431699999996, 135.2476096, 'ChIJlQY4YL6LAGAR4UVwBYhDgbo'),
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'kobe-harborland-umie-mosaic', 'shopping', 34.6799788, 135.1846182, 'ChIJf0p386qPAGARkwSdWbx_tS8'),
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'aeon-mall-kobe-minami', 'shopping', 34.6662172, 135.1752287, 'ChIJGSb_PbuPAGARSOEfTBLeKkw'),
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'suma-seaside-park', 'nature', 34.6434567, 135.12494809999998, 'ChIJuzqLzRGFAGARjtNr9RsfM2M'),
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'be-kobe-monument-meriken-park', 'culture', 34.6812785, 135.1892455, 'ChIJWYqicFWOAGARrCzbeb2pHyc'),
  -- โยโกฮามะ · 4 แห่ง
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'yokohama-bay-quarter', 'shopping', 35.4666247, 139.6266006, 'ChIJyzzcGz9cGGAR7anmbF14KmQ'),
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'nogeyama-zoo', 'sight', 35.4473882, 139.62254629999998, 'ChIJ_5_yqmNcGGARoy_xCj62YNA'),
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'yokohama-vivre', 'shopping', 35.464950699999996, 139.6182514, 'ChIJVYCXxg1cGGARK3wU2Y2m0K4'),
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'yokohama-air-cabin-sakuragicho-station', 'sight', 35.4514291, 139.63142639999998, 'ChIJL0DZFkRdGGAR4U5d2jq-CIA'),
  -- ฟุกุโอกะ · 4 แห่ง
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'acros-fukuoka', 'sight', 33.591590499999995, 130.4023522, 'ChIJyapPiJGRQTURiUqCGjPcUF0'),
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'youme-town-hakata', 'shopping', 33.6117163, 130.411996, 'ChIJcwyHFCCOQTURuzNm9R7SzvA'),
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'fukuoka-anpanman-children-s-museum-in-ma', 'culture', 33.595104899999995, 130.4058425, 'ChIJ8wPpVeuRQTURV9A2YODh9Qo'),
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'mina-tenjin', 'shopping', 33.5927599, 130.3985129, 'ChIJtSPre46RQTURJjCpXi0cUPo'),
  -- ฮิโรชิมะ · 6 แห่ง
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'alpark-east', 'shopping', 34.3735029, 132.3945716, 'ChIJjSO0OzWjWjURjWcPiW9HZ6o'),
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'fuji-grand-hiroshima', 'shopping', 34.386023, 132.46433199999998, 'ChIJ7S4e9xqiWjURGyyaSgXiKHE'),
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'ujina-natural-hot-spring-honoyu', 'sight', 34.3652802, 132.47426400000003, 'ChIJveu70IehWjUR7EKHWFDOfZM'),
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'hiroshima-prefectural-art-museum', 'culture', 34.399833199999996, 132.4662606, 'ChIJI-WaP6mYWjURbd8H0XTZ7e0'),
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'mega-don-quijote-2', 'market', 34.363150999999995, 132.458441, 'ChIJl3qZyzOiWjURZ-v-iUpVE20'),
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'minamoa-hiroshima', 'shopping', 34.3974123, 132.47458419999998, 'ChIJ1VvVWQCfWjURKCyvSsKRhmc'),
  -- นางาซากิ · 6 แห่ง
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'nagasaki-seaside-park', 'nature', 32.7411926, 129.86915109999998, 'ChIJd2yFxBBTFTURJLRcXL4Jkww'),
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'peace-statue', 'nature', 32.7769208, 129.86396349999998, 'ChIJjfkXDtqsajUREPBd4TF3KzQ'),
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'nagasaki-museum-of-history-culture', 'culture', 32.7529073, 129.8794878, 'ChIJP8JmPkhTFTURklPosviwOHw'),
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'gunkanjima-digital-museum', 'culture', 32.7360433, 129.86920899999998, 'ChIJ0bEx5A9TFTURb5bmnNGWMio'),
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'urakami-cathedral', 'culture', 32.776154999999996, 129.86838699999998, 'ChIJ_RF5NMWsajURrqo2SzCj1Ug'),
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'fuchi-shrine-station-nagasaki-ropeway', 'sight', 32.7579681, 129.8597484, 'ChIJETs4xidTFTUR6QTXNThOTQs'),
  -- โอตารุ · 6 แห่ง
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'tenguyama-observation-deck', 'viewpoint', 43.17199300000001, 140.9721621, 'ChIJyRFbvMbgCl8Rkb7_i8WykM0'),
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'nantaru-market', 'market', 43.1824428, 141.0100951, 'ChIJu0NocGDgCl8Rfodgh88qD7I'),
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'otaru-city-general-museum', 'culture', 43.211269300000005, 141.001277, 'ChIJ25Wx28fhCl8Rhmk8jN3Y-Tc'),
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'former-japanese-national-railways-temiya', 'culture', 43.199064199999995, 140.9987363, 'ChIJWeXyqVLgCl8R-gfEYqF70j0'),
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'yunohana-otaru-onsen', 'sight', 43.2122222, 141.0086111, 'ChIJUcCiPs_hCl8RUmPyM0Wz4y8'),
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'blue-cave', 'sight', 43.2264833, 140.92771370000003, 'ChIJOVEQOszjCl8RUlCv_IuaabQ'),
  -- คานาซาวะ · 4 แห่ง
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'd-t-suzuki-museum', 'culture', 36.5576632, 136.66091260000002, 'ChIJBRk3CXg0-F8RYaKpk9GoiiE'),
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'aeon-town-kanazawa-shimeno', 'shopping', 36.5808319, 136.6167984, 'ChIJNxmInao0-F8RF3Hs5PSmJJU'),
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'kazuemachi-chaya-district', 'culture', 36.5722715, 136.66374009999998, 'ChIJR-yGmXMz-F8Rf07-P4u1PUM'),
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'apita-kanazawa', 'shopping', 36.559535, 136.6427439, 'ChIJ94W0rYc0-F8RCxCyJ7Fg9UA'),
  -- ฮาโกดาเตะ · 3 แห่ง
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'hakodate-hachimangu', 'culture', 41.7538677, 140.7098647, 'ChIJsUFEhvzynl8RFPK9IvNnRPc'),
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'aeon-yunokawa-shop', 'shopping', 41.777668999999996, 140.7940587, 'ChIJqyaP1Or0nl8R0ADYbuYviLc'),
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'kanemori-red-brick-warehouse-bay-hakodat', 'shopping', 41.7667363, 140.7173381, 'ChIJu-TpzKfznl8RwAIexh1OYoA'),
  -- ทาคายามะ · 4 แห่ง
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'takayama-matsuri-yatai-kaikan', 'culture', 36.148341699999996, 137.2601188, 'ChIJed--1dO6AmARuwJ13BoczRE'),
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'luvit-town-takayama', 'shopping', 36.1493817, 137.2470644, 'ChIJ47gY4ZalAmARC6l_8ELwZSI'),
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'shiroyama-park', 'nature', 36.1400419, 137.263259, 'ChIJaTYqu8K6AmARgF9gtVFrRRQ'),
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'takayama-sky-park', 'nature', 36.146239699999995, 137.2396645, 'ChIJoRs_ZsykAmARhmGytR1a6QI'),
  -- นิกโก้ · 2 แห่ง
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'nikko-toshogu-homotsukan-museum', 'culture', 36.7559542, 139.6002334, 'ChIJC8PLlNqmH2AR_ZYLSAtjPaU'),
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'omurotakao-shrine', 'culture', 36.7308566, 139.7562587, 'ChIJJYuqwjl0H2ARGaWtC9wlluI'),
  -- นารา · 1 แห่ง
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'deer-park', 'nature', 34.6810292, 135.8430668, 'ChIJxekQupQ5AWARjo473d_7U3Y')
  ) as v(city_id, slug, cat, lat, lng, gpid)
on conflict do nothing;

-- 🔴 "ผมลงแล้ว" กับ "มันอยู่ในฐานแล้ว" เป็นคนละประโยค
do $verify$
declare n int;
begin
  select count(*) into n from public.catalog_places where source = 'google';
  if n < 543 then
    raise exception 'คาดว่า source=google อย่างน้อย % แถว แต่มี %', 543, n;
  end if;

  -- ทุกแถวใหม่ต้องผูกกับเมืองที่มีอยู่จริง (ไม่มีแถวกำพร้า)
  select count(*) into n from public.catalog_places p
   where p.source = 'google'
     and not exists (select 1 from public.catalog_cities c where c.id = p.city_id);
  if n > 0 then raise exception 'มีแถว source=google % แถวที่ city_id ไม่มีในคลังเมือง', n; end if;

  -- 🔴 ทิศบวก: ทั้งสี่ประเทศต้องได้ของเพิ่มจริง ไม่ใช่ผ่านเพราะไม่มีอะไรให้ตรวจ
  select count(*) into n from (
    select c.country_id from public.catalog_places p
      join public.catalog_cities c on c.id = p.city_id
     where p.source = 'google' group by c.country_id) t;
  if n < 4 then raise exception 'ควรมีของ source=google ครบ 4 ประเทศ แต่มี %', n; end if;
end $verify$;
