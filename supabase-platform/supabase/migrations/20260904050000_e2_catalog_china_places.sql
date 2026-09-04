-- ════════════════════════════════════════════════════════════════════════════
-- E2 — สถานที่รอบสาม: จีน · ฮ่องกง · มาเก๊า + ของที่กฎเดิมยังมองข้าม (176 แห่ง)
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ต่อจาก `20260904040000` (เพิ่มเมือง)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 บั๊กคลาสเดียวกันรอบที่สาม — และรอบนี้ผมเลิกปะทีละประเทศ ──────────
-- ก่อนแก้:  **จีน 24 จาก 140 ที่เจอ · ฮ่องกง 0 · มาเก๊า 0**
-- ไล่ทั้งสามรอบที่ผ่านมา รูปเดียวกันหมด — *กฎแจกเมืองแคบเกิน ไม่ใช่ข้อมูลขาด*:
--     รอบ 1  โตเกียว 0        Google คืน `locality` เป็นชื่อเขต (Minato City)
--     รอบ 2  ไทย 3 · เวียดนาม 2  ไม่มี `locality` · `admin1` เป็นชื่อท้องถิ่น (กรุงเทพมหานคร)
--     รอบ 3  จีน/ฮ่องกง/มาเก๊า   ดูข้างล่าง
-- 🎯 ***ทุกรอบสคริปต์ "ทำงานสำเร็จ" และให้ตัวเลขที่ดูสมเหตุสมผล*** ไม่มี error ไม่มีอะไรแดง
--
-- ✅ **เลิกปะทีละใบ — ทำให้สคริปต์บอกเองว่าข้ามเพราะชื่ออะไร**
--    เดิมพิมพ์แค่ *"ข้ามเพราะอยู่เมืองนอกคลัง 116"* ⇒ บอกว่า *มีของหาย* แต่ไม่บอกว่า *เพราะอะไร*
--    ตอนนี้พิมพ์ชื่อ `locality / admin1` ที่ถูกข้ามบ่อยที่สุด → **วินิจฉัยได้ในบรรทัดเดียว**
--    🔴 นี่คือสิ่งที่ควรทำตั้งแต่รอบแรก — ผมเสียเวลาไปสามรอบกับการยิง API วินิจฉัยเอง
--
-- ── สิ่งที่กฎใหม่รองรับ (วัดจริงทั้งหมด) ──────────────────────────────
-- ① พินอินเว้นวรรค + คำต่อท้าย   `Cheng Du Shi` (成都市) ↔ `Chengdu`
--    → ตัดช่องว่าง ขีด เครื่องหมายวรรคตอน และคำต่อท้าย shi/sheng/qu/city/town/…
--    ⚠️ `Xi'an` ↔ `Xi An Shi` ต่างกันแค่อะพอสทรอฟี — ต้องตัดวรรคตอนด้วย
-- ② ฮ่องกงไม่มี `locality` และ `admin1` เป็น **เขต** ทั้งสาม
--    (Kowloon · Hong Kong Island · New Territories) → ตารางชื่ออื่นที่ประกาศตรง ๆ
-- ③ **มาเก๊าไม่มีทั้งสองระดับเลย** — Google คืนแค่ `country = "มาเก๊า"` ทั้ง 15 รายการ
--    → ชั้นนครรัฐ · **แคบโดยตั้งใจ: ใช้เฉพาะตอนไม่มีทั้ง locality และ admin1**
--    ถ้าประเทศใหญ่คืนแบบนี้ แปลว่ามีอย่างอื่นผิด ให้ไปดู ไม่ใช่กวาดเข้ามา
--
-- ── ผลหลังแก้ ────────────────────────────────────────────────────────
--     จีน 98 · ฮ่องกง 12 · มาเก๊า 9
--     และประเทศเดิมได้เพิ่มอีก — ไทย 36 · ญี่ปุ่น 0 · เกาหลี 9 · เวียดนาม 12
--     รวมไฟล์นี้ **176 แห่ง**
--
-- 🔴 **ยอดรีวิวของจีนแผ่นดินใหญ่เทียบข้ามประเทศไม่ได้** — Google ถูกบล็อกที่นั่น
--    พระราชวังต้องห้าม 16,784 · ปราสาทโอซะกะ 99,313 · **ไม่ได้แปลว่าคนไปน้อยกว่า**
--    ⇒ ใช้จัดอันดับ *ภายในเมืองเดียวกัน* ได้ · ห้ามใช้ตัดสินว่าเมืองไหนควรอยู่ในคลัง
-- ════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์'; end if;
  if (select count(*) from public.catalog_cities where country_id in ('cn','hk','mo')) < 9 then
    raise exception 'ต้องรัน 20260904040000 (เพิ่มเมืองจีน/ฮ่องกง/มาเก๊า) ก่อน';
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
  -- ══ จีน · 98 แห่ง ══
  -- เซี่ยงไฮ้ · 14 แห่ง
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-274', 'culture', 31.240261099999998, 121.49057699999999, 'ChIJYUiHi1dwsjURZK_REO37Vk0'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-276', 'sight', 31.239688899999997, 121.49975529999999, 'ChIJ29SwJftwsjURZYXg4jufPhY'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-275', 'nature', 31.227235500000003, 121.49209399999998, 'ChIJidPZMUGHrTUR29eIuHbpoIQ'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'shanghai-new-international-expo-center', 'sight', 31.208903999999997, 121.564912, 'ChIJre3bilR3sjURreIi1JbwJ1M'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-277', 'sight', 31.233518000000004, 121.505618, 'ChIJcT52JmpwsjURKKp8uyIQKjU'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'nanjing-road-pedestrian-street', 'sight', 31.234720999999993, 121.47489800000001, 'ChIJ443NM0NwsjURrWjV1_GoGSU'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'tianzifang', 'sight', 31.208811999999995, 121.468898, 'ChIJ2-UI76F6sjURj_HAeG5PMhE'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'jing-an-temple', 'culture', 31.223518799999997, 121.445284, 'ChIJVV1KHv5vsjURQgiHHZfGW3o'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'shanghai-museum', 'culture', 31.228330699999994, 121.47552780000001, 'ChIJPWUSbWlwsjURbNvIw3tOTE0'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-278', 'culture', 31.241346499999995, 121.44512060000001, 'ChIJY2v3jN9vsjURmJotCOxoanY'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'yuyuan-old-street', 'sight', 31.227392, 121.49139100000001, 'ChIJP5OCAWBwsjURfYtYWcmjxXU'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'super-brand-mall', 'shopping', 31.236859, 121.499172, 'ChIJXeVKn-ZwsjUR8pePzpUtIxo'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'shanghai-old-street', 'sight', 31.225319, 121.4969443, 'ChIJV5LAV4twsjURVTbWYnxGe8M'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'wukang-mansion', 'sight', 31.204479999999997, 121.438326, 'ChIJFezOP0llsjURgZUzT-yILHw'),
  -- ปักกิ่ง · 14 แห่ง
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-258', 'culture', 39.9054895, 116.39763169999999, 'ChIJ2XRD3Jh2YzYRE1lUrcku6io'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-259', 'sight', 39.8821803, 116.40660559999998, 'ChIJ65H_GWBN8DURag4RO0UVLDc'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-257', 'sight', 39.9168038, 116.39716209999999, 'ChIJPdQVRelS8DURnwfTTb3idAY'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'beijing-zoo', 'nature', 39.938863999999995, 116.33954999999999, 'ChIJPRYRTDJS8DUR5fFsHhL_tW4'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'tiananmen', 'culture', 39.9087202, 116.3974799, 'ChIJ2XRD3Jh2YzYRmjlIoYPLKGk'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-262', 'nature', 39.925447399999996, 116.38926389999997, 'ChIJWWErs-ZS8DURdcUOnciALOI'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-261', 'sight', 39.9913336, 116.39038509999997, 'ChIJh4wAB8RU8DURtofj9dfJNe4'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'jingshan-park', 'nature', 39.9250988, 116.39684329999999, 'ChIJiaRNz-BS8DURW2N_nAufVJU'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'lama-temple', 'culture', 39.947671199999995, 116.4172902, 'ChIJxUzg_TRT8DUR0MslZbKzbF4'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'wangfujing-pedestrian-street', 'sight', 39.910959, 116.411341, 'ChIJpaF2MslS8DURRskvKooTIKk'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'hongqiao-market', 'market', 39.886072, 116.42057899999999, 'ChIJYzZvXkNN8DUR4h25sg3jCFM'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-260', 'shopping', 39.9094346, 116.44962450000001, 'ChIJp4O4NRqt8TUREe0QXNrcQXY'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'apm', 'shopping', 39.914252, 116.41169199999999, 'ChIJlS_99c5S8DURQRmKikn28_8'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'zhengyangmen', 'sight', 39.900558, 116.39784599999999, 'ChIJDQalMb1S8DURGw8FVrmExEk'),
  -- เฉิงตู · 14 แห่ง
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'kuan-alley-and-zhai-alley', 'sight', 30.663611099999997, 104.0525, 'ChIJRxJWE9jE7zYRZVJ_scoyS4M'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'chengdu-wu-hou-shrine', 'culture', 30.645802, 104.04942899999999, 'ChIJHSK0oePE7zYRKcnSiomj91k'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'people-s-park', 'nature', 30.657131999999997, 104.05724599999999, 'ChIJlZD4VSHF7zYRv59cxjF5vPY'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'wenshu-yuan-monastery', 'culture', 30.674771, 104.07194799999999, 'ChIJvTWARcva7zYRPk9kGPy5G1E'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-263', 'sight', 30.644858999999997, 104.04997399999999, 'ChIJIT0ZCOPE7zYR30Zs5J35lxY'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-264', 'culture', 30.65949, 104.026538, 'ChIJB-sN9r7E7zYRpO3Fn32G9dk'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'anshun-bridge', 'sight', 30.642067499999996, 104.0860563, 'ChIJW5DuBG_F7zYRlraGfPiu5uI'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-265', 'culture', 30.660031000000004, 104.06573999999999, 'ChIJcbd50jrF7zYRnytgUX55Sio'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'qingyang-palace-west-gate', 'sight', 30.660051, 104.04105299999999, 'ChIJSYPbWsPE7zYRb1nuq26aGM4'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'chunxi-road-pedestrian-street', 'shopping', 30.65785, 104.0785, 'ChIJk6nPP0fF7zYR85th6s5lXXE'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'chengdu-museum', 'culture', 30.663751999999995, 104.04461800000001, 'ChIJkXHY-drE7zYRZYCcyqwKM8o'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-266', 'sight', 30.662391000000003, 104.094461, 'ChIJORlPI1fF7zYRsYvyKa-y8xo'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'shufengya-yun', 'sight', 30.660004999999995, 104.045986, 'ChIJBRtZYNzE7zYRGP9RzBx9ohA'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-267', 'sight', 30.630328000000002, 104.093729, 'ChIJu5JZMHnF7zYRYKShQOKGgnY'),
  -- ชิงเต่า · 14 แห่ง
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-268', 'sight', 36.0620325, 120.3847568, 'ChIJdzmp_mgQljUR5UIziIYzMpk'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'tsingtao-brewery-museum', 'culture', 36.079119999999996, 120.346834, 'ChIJV5aYKSYQljURyzPaSLnejW0'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'zhanqiao-pier', 'sight', 36.058454, 120.320491, 'ChIJa3aYWYsPljURmWfiJ9p_T1Y'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-270', 'sight', 36.058192999999996, 120.33642700000001, 'ChIJNcIU7PsPljURGNMnpNzO5uo'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'signal-mountain-park', 'nature', 36.06604, 120.33202599999998, 'ChIJUWXepO8PljURMNNqVfvS4tk'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'st-michael-s-cathedral-qingdao', 'sight', 36.067299999999996, 120.32063400000001, 'ChIJsTdUTO0PljURG6nD34Y7r9U'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-269', 'shopping', 36.066973, 120.37786100000001, 'ChIJkQtRRVsQljURYcnAzjOtRcc'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'taidong-commercial-pedestrain-street', 'sight', 36.083461, 120.354222, 'ChIJl2V7jC0QljURNHR7qYflrGg'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-272', 'sight', 36.0614217, 120.3852867, 'ChIJp7O9jF4QljURcVj3flbcayc'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'qingdao-zhongshan-park', 'sight', 36.065131, 120.355922, 'ChIJCVixkRcQljURh3doJOfp5iw'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'zhanshan-temple', 'culture', 36.064890999999996, 120.36394200000001, 'ChIJa0Hu0D8QljURnNHipeUkA_M'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'lu-xun-park', 'nature', 36.054989, 120.33236699999999, 'ChIJlXKoJfgPljUR4ewIwT1XJWw'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-271', 'shopping', 36.061029, 120.39582700000001, 'ChIJOcvAVfEQljURDsJzaFMC9jE'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-273', 'sight', 36.06179600000001, 120.31917800000001, 'ChIJT-i6XYsPljURUREsjfBW90M'),
  -- จางเจียเจี้ย · 14 แห่ง
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'tianmenshan-cableway', 'sight', 29.111576, 110.483385, 'ChIJrz0FK8-vmzYRPYoPH6VDRxY'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'tianmen-fairy-mountain-north-gate', 'sight', 29.067324000000003, 110.47568799999999, 'ChIJ_9hklEywmzYRuu-jsIT8WAQ'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'tujia-folk-customs-park', 'nature', 29.124723999999997, 110.463872, 'ChIJi9s8wkiumzYR8mjJ5GAsMtA'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'place-283', 'sight', 29.046812199999998, 110.4820463, 'ChIJywl-EvmwmzYR8jNUqwT9E9c'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'place-284', 'sight', 29.057169000000002, 110.465572, 'ChIJeSA_GqmxmzYR5xFIRIRUJbQ'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'zhangjiajie-junsheng-painting-institute', 'culture', 29.1321449, 110.49157819999999, 'ChIJ2bx0B6SvmzYR-lhFAqOKy38'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'dayong-town', 'sight', 29.127659, 110.48456999999999, 'ChIJq8dZiLCvmzYRargmKNL0m-U'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'zhangjiajie-museum', 'culture', 29.131803999999995, 110.456006, 'ChIJBTiqWEOumzYRuhuYLNe1BqQ'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'place-285', 'nature', 29.117376999999998, 110.54484199999999, 'ChIJeQnMSW2lmzYRq5d5edcZwAs'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'better-life-mall', 'shopping', 29.121945, 110.48796499999999, 'ChIJNeqWiLmvmzYR4aJ4GxKmptw'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'people-s-square', 'sight', 29.1237, 110.487051, 'ChIJK-LRFLqvmzYR5ST39iZV47o'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'zhongshang-plaza', 'shopping', 29.124982999999997, 110.48445699999999, 'ChIJCXsEjbCvmzYRkL5Kp3n0xiQ'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'wuling-commercial-building', 'shopping', 29.1241363, 110.4914855, 'ChIJXXe_gLuvmzYR3QhEs3uXlAo'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'puguang-temple', 'sight', 29.124771, 110.48801100000001, 'ChIJX56O1KSvmzYRUb-usOJiOjU'),
  -- ซีอาน · 14 แห่ง
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'place-279', 'culture', 34.263177, 108.9390603, 'ChIJJfnIs2d6YzYRORg_bY2UO9M'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'giant-wild-goose-pagoda', 'sight', 34.2182433, 108.9641518, 'ChIJ2Z1H3-c24BQRane6QKG7BEg'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'place-280', 'sight', 34.276795, 108.94724099999999, 'ChIJodN_-FZ6YzYRhtqcQ2dSq7k'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'place-281', 'culture', 34.22352, 108.955298, 'ChIJd1pQT2FwYzYR-Bcdx8lqHg0'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'small-wild-goose-pagoda', 'sight', 34.239196, 108.941998, 'ChIJp0glH4JwYzYRvOVRiZHBRT8'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'ancient-city-wall', 'sight', 34.252061, 108.95029699999999, 'ChIJkbIeAoh6YzYR1Ej2JoWm1EA'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'place-282', 'culture', 34.252459, 108.952809, 'ChIJh0jQqIF6YzYRhpNkKbDSkLA'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'datang-everbright-city', 'sight', 34.2150944, 108.9645654, 'ChIJuSEw-0JwYzYReiy44KGrBAM'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'tang-paradise', 'sight', 34.2123098, 108.9747383, 'ChIJG4KcOUFwYzYRxKgvrcAbPBI'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'xi-an-wall-yongningmen-north-gate', 'nature', 34.252013, 108.946896, 'ChIJ3Th01Hx6YzYRQI-0r_IB7pQ'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'xi-an-museum', 'culture', 34.237311999999996, 108.94024999999999, 'ChIJXVVWnIRwYzYR6dmS_KAYg2U'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'yongxingfang', 'sight', 34.2648479, 108.97012670000001, 'ChIJL078Yul6YzYR2ycYo3U1k5E'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'kaiyuan-shopping-mall', 'shopping', 34.259187, 108.94860899999999, 'ChIJ-Q0OuWF6YzYRauGPlSwmT80'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'xiaonanmen', 'sight', 34.251768999999996, 108.9361433, 'ChIJ4aT4WnB6YzYRGVUTca_H7pQ'),
  -- กุ้ยหลิน · 14 แห่ง
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'guilin-rongshanhu-scenic-area', 'nature', 25.275040999999998, 110.28936999999999, 'ChIJjdb1Vsn1pDYRoVkw2FLpdOk'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'elephant-trunk-hill', 'sight', 25.266947, 110.293263, 'ChIJBx8lic71pDYRDs9lO3l8Q0w'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'reed-flute-cave', 'sight', 25.304409, 110.273614, 'ChIJs8zoz1f0pDYRWhx3YnA2xV0'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'jingjiang-princes-palace', 'nature', 25.282194, 110.299522, 'ChIJpyFnGLn1pDYRY0iyxiXLaHQ'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'riyue-shuangta-cultural-park', 'nature', 25.271983, 110.29503, 'ChIJA3npd8_1pDYRWQkQmslvtlI'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'guilin-central-square', 'sight', 25.275011000000003, 110.296056, 'ChIJaY9NFsb1pDYR1PGKwv-5b1g'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'seven-star-park', 'sight', 25.268791, 110.31212199999999, 'ChIJe9G-Zez1pDYRb3WjgPmtUT0'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'niko-niko-do-plaza-guilin', 'shopping', 25.27824, 110.29507699999999, 'ChIJTYNlCsj1pDYRewe5YYwESkA'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'guilin-two-rivers-four-lakes-scenic-area', 'sight', 25.267797899999998, 110.29517489999999, 'ChIJg3u3pHv2pDYRXpZXY7qsCLQ'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'xiangshan-scenic-area', 'nature', 25.266910000000003, 110.29604099999999, 'ChIJYe99u9r1pDYRMIumXxTQ9VA'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'solitary-beauty-peak-prince-city-scenic', 'nature', 25.281238, 110.29920999999999, 'ChIJo93VZrn1pDYRzt4Wn6l4wZE'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'guilin-yaoshan-scenic-attraction', 'nature', 25.292355999999998, 110.369827, 'ChIJI15czKlfpDYRto76jgV9_0o'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'chuanshan-park', 'nature', 25.2525387, 110.30296539999999, 'ChIJWbwUTHT2pDYRlH_HuYe7KOQ'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'wanda-plaza', 'shopping', 25.242597999999997, 110.321107, 'ChIJj4LgOgX2pDYR6PaLYipZoEU'),
  -- ══ ฮ่องกง · 12 แห่ง ══
  -- ฮ่องกง · 12 แห่ง
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'temple-street-night-market', 'market', 22.3065185, 114.1699805, 'ChIJzcAL8-oABDQRpDOEry9D3bc'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'harbour-city', 'shopping', 22.2974784, 114.1687395, 'ChIJlypEmvIDBDQRVuQ8fH13Aqc'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'avenue-of-stars-hk', 'sight', 22.293004600000003, 114.1741517, 'ChIJsyIrnPEABDQRzjValbVWEJo'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'times-square', 'shopping', 22.278150999999998, 114.1821136, 'ChIJ_bAR11AABDQRGxsNeGwaZYM'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'ladies-market', 'sight', 22.317608999999997, 114.1709284, 'ChIJbYMkZMgABDQRryWJe8ooWP0'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'moko', 'shopping', 22.323193699999997, 114.17231939999999, 'ChIJC_lPIskABDQRxerRNtoOV9o'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'k11-art-mall', 'shopping', 22.297525, 114.1736355, 'ChIJ_yMf_u0ABDQRFUSKts8Cq0U'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'megabox', 'shopping', 22.3199795, 114.2084331, 'ChIJgzPq5DMBBDQR8zgaWx6Z2I0'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'k11-musea', 'shopping', 22.294214999999998, 114.1748686, 'ChIJJaeB3_MBBDQRMuGmb2yQxGE'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'new-town-plaza-phase-1', 'shopping', 22.3817578, 114.18863719999999, 'ChIJFTcnqK0HBDQRdC7jGqw4Cd4'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'langham-place', 'shopping', 22.318211599999998, 114.16867429999999, 'ChIJSUsQeMcABDQRUladiJq44qw'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'airside', 'shopping', 22.331322, 114.19814199999999, 'ChIJb5q1HOsBBDQR5iVDN8d2hMY'),
  -- ══ มาเก๊า · 9 แห่ง ══
  -- มาเก๊า · 9 แห่ง
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'senado-square', 'culture', 22.193533400000003, 113.5397593, 'ChIJhSGVke96ATQR91vVZIEul-0'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'the-londoner-macao', 'shopping', 22.1458478, 113.5653752, 'ChIJF7EmygRwATQR2MtkpinomWc'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'city-of-dreams', 'shopping', 22.149227399999997, 113.5666788, 'ChIJU0ChiwNwATQRtIix8P2TBCg'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'venetian-macao-casino', 'sight', 22.1484129, 113.5602018, 'ChIJZ1XUeA9wATQRoiyAPglfzq4'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'macao-giant-panda-pavilion', 'sight', 22.126634, 113.558979, 'ChIJC1y24zpwATQRIfTrLsOn88I'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'st-dominic-s-church', 'culture', 22.1945917, 113.5404004, 'ChIJ0Vtsg-V6ATQR6a8XQDuJQJ0'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'shoppes-at-venetian', 'shopping', 22.147206699999998, 113.5598223, 'ChIJR0zShQ9wATQReVRBNmYAXk0'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'rua-do-cunha', 'sight', 22.1535358, 113.5569969, 'ChIJHX64T6xxATQRxbVykc5Tswk'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'galaxy-arena', 'sight', 22.143102700000004, 113.556327, 'ChIJO96bqXNxATQR-Ynae0jy_OY'),
  -- ══ ไทย · 36 แห่ง ══
  -- กระบี่ · 6 แห่ง
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-290', 'culture', 8.1239259, 98.92513100000001, 'ChIJO2O10qqWUTAREYioi4E8t1Q'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-291', 'market', 8.066535499999999, 98.91319969999999, 'ChIJB8_hhZCUUTARiYqMLFM-oFM'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-293', 'culture', 8.0352438, 98.83103539999999, 'ChIJBaMRMAHAUTARWW-8BvqMU8M'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'diamond-cave-phra-nang-nai-cave', 'sight', 8.0136407, 98.84214209999999, 'ChIJhdeVO5nqUTARXEDrwb-WhIw'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'east-railay-bay-beach', 'sight', 8.0103213, 98.84127439999999, 'ChIJH8sfYpzqUTARPpOV_oWSVOY'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-292', 'sight', 8.0081971, 98.8365202, 'ChIJ1bKjXBDrUTARuUbkBPy5k6U'),
  -- ภูเก็ต · 6 แห่ง
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-304', 'sight', 7.8423143, 98.3568128, 'ChIJ33J1DVIuUDARPeLYBVDFRC8'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-301', 'market', 7.882640899999999, 98.2931814, 'ChIJCVYWcbE6UDARt7lWAulfnaY'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-300', 'market', 7.827596799999999, 98.2995643, 'ChIJkYV5pYUlUDARc0NspvlQPkY'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-303', 'sight', 7.896741699999999, 98.3949957, 'ChIJl2G9wYoxUDARTQpdJDE2lsI'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-305', 'sight', 7.8208931, 98.3443255, 'ChIJ34WfFNcvUDARDABnP_g6Ne4'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-302', 'shopping', 7.8465836, 98.35071130000001, 'ChIJPZFcvF0vUDARX3GFK8rlf1Q'),
  -- อุดรธานี · 6 แห่ง
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-316', 'sight', 17.3990818, 102.80708059999999, 'ChIJ2VahvtV3IzER1Xo0NKPNC2U'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-312', 'sight', 17.403960599999998, 102.7902128, 'ChIJjWLm1KudIzER12kuCq3F6lA'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-315', 'culture', 17.4116593, 102.7818381, 'ChIJPy7AJBOdIzER8b-pIzBsNY8'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-314', 'market', 17.4165962, 102.79115929999999, 'ChIJV87ZZmidIzERqapCw1q1WY0'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-311', 'sight', 17.4403961, 102.7142682, 'ChIJs1YZmqmcIzERiW2l3hfeHNU'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-313', 'shopping', 17.404739, 102.765519, 'ChIJSRVyCwSdIzERwA9xrTDnEm4'),
  -- กาญจนบุรี · 5 แห่ง
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'kanchanaburi-night-market', 'market', 14.0212001, 99.53296259999999, 'ChIJ7fSQJLF14zARQwZe_-joSDw'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-289', 'market', 14.0235673, 99.5291194, 'ChIJz2agOLl04zAR06tMDPb9rB0'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-287', 'market', 14.020158799999999, 99.5295544, 'ChIJmeEUl7t04zAR6FlwO1C8lVQ'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-286', 'culture', 13.9994182, 99.51959490000002, 'ChIJo1pb9WBz4zARsN7Vq934BNo'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-288', 'sight', 13.9689754, 99.5772148, 'ChIJCdiP9O8M4zARvD8dUDXrTkg'),
  -- สุโขทัย · 6 แห่ง
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-306', 'market', 17.008765, 99.8195392, 'ChIJ7RBkvdNV3jAREgUkcgpSNQ4'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-309', 'market', 17.0369861, 99.8834158, 'ChIJNWnzSoFV3jAR_kjR__QzmNg'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'sukhojai-street-art', 'sight', 17.008289599999998, 99.817415, 'ChIJFXOwtsBV3jARS1DaUXWpyqM'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-307', 'shopping', 17.045212499999998, 99.8155451, 'ChIJFYYbXT9V3jARJBnvq3wOU8o'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-308', 'shopping', 17.0099759, 99.8314319, 'ChIJ52fGmFRV3jARU6VXgtZoZ10'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-310', 'shopping', 17.010279999999998, 99.82128499999999, 'ChIJIZgbaZtV3jARv3JBmaitP7I'),
  -- น่าน · 6 แห่ง
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-294', 'market', 18.7775282, 100.7759226, 'ChIJo0mwHnWOJzERLcehJdnkzjc'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-295', 'market', 18.7849957, 100.7445095, 'ChIJX2BKjyiMJzER2f_nIZO07E4'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-297', 'nature', 18.8544464, 100.7364965, 'ChIJb1Tlu8GMJzERbnDrGGm1tnY'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-296', 'shopping', 18.774819, 100.770118, 'ChIJlUr1JG6PJzER_NT4ez9SqbA'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-298', 'sight', 18.755601, 100.7050053, 'ChIJ_5XvQ-iJJzERWmEE9_VfJBc'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-299', 'sight', 18.7178574, 100.7525711, 'ChIJcbq3mwmPJzERAEQFbefBcHU'),
  -- เชียงราย · 1 แห่ง
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'saturday-night-market', 'market', 19.908664899999998, 99.83077820000001, 'ChIJ_9iGyWYG1zARyAlGL3WvwhQ'),
  -- ══ เกาหลีใต้ · 9 แห่ง ══
  -- โซล · 2 แห่ง
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'seoul-forest-park', 'nature', 37.544387799999996, 127.03744239999999, 'ChIJK_b0UX2jfDURmkYPvmWYm90'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'goto-mall', 'shopping', 37.506163, 127.0049887, 'ChIJRUFcjpGhfDURGWGECbYHg3s'),
  -- ปูซาน · 6 แห่ง
  ('97456683-e619-4881-be68-04b2c7e576e6', 'cheongsapo-daritdol-skywalk', 'viewpoint', 35.1640365, 129.1967173, 'ChIJUQsDVhuNaDURJo5GeByloeQ'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'haeundae-blueline-park-songjeong-station', 'sight', 35.1808823, 129.2002747, 'ChIJfUm6iJONaDURJ1HpAxq9z1o'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'seomyeon-mall-seomyeon-underground-shopp', 'shopping', 35.1562986, 129.059155, 'ChIJS2MRDG_raDUR0VNDeM8rmC0'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'arte-museum-busan', 'culture', 35.0870682, 129.076373, 'ChIJvX_SQwDvaDURS28S4RX5ZVM'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'seomyeon-market', 'market', 35.1557374, 129.0581664, 'ChIJG7Fv02_raDUROnWS49QEK1o'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'jeonpo-cafe-street', 'sight', 35.155398999999996, 129.0673266, 'ChIJYeuKwGTraDUR-U5PAfT2Uoo'),
  -- คังนึง · 1 แห่ง
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'daegwallyeong-natural-recreation-forest', 'nature', 37.7128841, 128.7881783, 'ChIJ1TXNSC_yYTURIrPhyOZ3Y90'),
  -- ══ เวียดนาม · 12 แห่ง ══
  -- โฮจิมินห์ · 6 แห่ง
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'dam-sen-water-park', 'nature', 10.7678911, 106.6359914, 'ChIJa2jyR5cudTERy2ySbqgJudk'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'ho-chi-minh-city-opera-house', 'sight', 10.776612799999999, 106.7031715, 'ChIJKcrnSUYvdTERO64MErYx9VU'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'saigon-book-street', 'sight', 10.780963, 106.7000734, 'ChIJS8Yv1zcvdTERUI2V47UxkPw'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'vincom-plaza-phan-van-tri', 'shopping', 10.826937599999999, 106.68908569999999, 'ChIJdeicufAodTERg6AmstkG-AE'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'hoc-mon-market', 'market', 10.888904499999999, 106.5966826, 'ChIJvcyZPY_VdDER_oeDI55DEl4'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'thiso-mall-sala', 'shopping', 10.7719776, 106.7210607, 'ChIJuxFVtwUvdTERl6qgtn6TcPg'),
  -- ฮานอย · 6 แห่ง
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'thang-long-water-puppet-theatre', 'sight', 21.0316826, 105.8533466, 'ChIJiUJFE8CrNTERHK060qWnXk4'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'hanoi-zoo', 'nature', 21.031078600000004, 105.8037432, 'ChIJi3PpbWqrNTERcL7DLQFRKNw'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'aeon-mall-ha-ong', 'shopping', 20.989562499999998, 105.7513125, 'ChIJV3ef7nurNTERrsROws-Mv04'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'cho-nha-xanh', 'market', 21.0371049, 105.7860054, 'ChIJTb2PlDWrNTERMHOrOplO8vc'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'bai-a-song-hong', 'nature', 21.078522, 105.8352668, 'ChIJwYrhVWeqNTERWKke9kRAasc'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'vincom-center-metropolis', 'shopping', 21.0313057, 105.81473590000002, 'ChIJcfr-SqurNTERprSgnJ4BVT4')
  ) as v(city_id, slug, cat, lat, lng, gpid)
on conflict do nothing;

do $verify$
declare n int;
begin
  -- 🔴 **เกณฑ์มาจากการนับตอนสร้างไฟล์ ไม่ใช่ตัวเลขที่คนเดา**
  --    ฉบับแรกผมเขียน `มาเก๊า >= 10` จากจำนวน *ก่อน* กันซ้ำข้ามประเทศ (14)
  --    ของจริงหลังกันซ้ำคือ **9** → migration ทั้งก้อน rollback (ตรวจแล้ว: ไม่มีแถวค้าง)
  --    🎯 *เกณฑ์รับที่เขียนจากสภาพคนละจังหวะกับที่วัด* — รูปที่ทีมจดไว้เอง และผมเพิ่งเดินเข้าไป

  select count(*) into n from public.catalog_places p
    join public.catalog_cities c on c.id = p.city_id where c.country_id = 'cn';
  if n < 98 then raise exception 'จีนควรมีอย่างน้อย 98 แห่ง แต่มี %', n; end if;

  select count(*) into n from public.catalog_places p
    join public.catalog_cities c on c.id = p.city_id where c.country_id = 'hk';
  if n < 12 then raise exception 'ฮ่องกงควรมีอย่างน้อย 12 แห่ง แต่มี %', n; end if;

  select count(*) into n from public.catalog_places p
    join public.catalog_cities c on c.id = p.city_id where c.country_id = 'mo';
  if n < 9 then raise exception 'มาเก๊าควรมีอย่างน้อย 9 แห่ง แต่มี %', n; end if;

  -- ไม่มีแถวกำพร้า
  select count(*) into n from public.catalog_places p
   where p.source = 'google'
     and not exists (select 1 from public.catalog_cities c where c.id = p.city_id);
  if n > 0 then raise exception 'มีแถว source=google % แถวที่ city_id ไม่มีในคลังเมือง', n; end if;
end $verify$;
