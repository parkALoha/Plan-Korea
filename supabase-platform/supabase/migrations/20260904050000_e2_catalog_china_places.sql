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
values
  -- ══ จีน · 98 แห่ง ══
  -- เซี่ยงไฮ้ · 14 แห่ง
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-274', 'culture', 31.240261099999998, 121.49057699999999, 'place_id:ChIJYUiHi1dwsjURZK_REO37Vk0', 'ChIJYUiHi1dwsjURZK_REO37Vk0', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-276', 'sight', 31.239688899999997, 121.49975529999999, 'place_id:ChIJ29SwJftwsjURZYXg4jufPhY', 'ChIJ29SwJftwsjURZYXg4jufPhY', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-275', 'nature', 31.227235500000003, 121.49209399999998, 'place_id:ChIJidPZMUGHrTUR29eIuHbpoIQ', 'ChIJidPZMUGHrTUR29eIuHbpoIQ', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'shanghai-new-international-expo-center', 'sight', 31.208903999999997, 121.564912, 'place_id:ChIJre3bilR3sjURreIi1JbwJ1M', 'ChIJre3bilR3sjURreIi1JbwJ1M', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-277', 'sight', 31.233518000000004, 121.505618, 'place_id:ChIJcT52JmpwsjURKKp8uyIQKjU', 'ChIJcT52JmpwsjURKKp8uyIQKjU', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'nanjing-road-pedestrian-street', 'sight', 31.234720999999993, 121.47489800000001, 'place_id:ChIJ443NM0NwsjURrWjV1_GoGSU', 'ChIJ443NM0NwsjURrWjV1_GoGSU', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'tianzifang', 'sight', 31.208811999999995, 121.468898, 'place_id:ChIJ2-UI76F6sjURj_HAeG5PMhE', 'ChIJ2-UI76F6sjURj_HAeG5PMhE', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'jing-an-temple', 'culture', 31.223518799999997, 121.445284, 'place_id:ChIJVV1KHv5vsjURQgiHHZfGW3o', 'ChIJVV1KHv5vsjURQgiHHZfGW3o', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'shanghai-museum', 'culture', 31.228330699999994, 121.47552780000001, 'place_id:ChIJPWUSbWlwsjURbNvIw3tOTE0', 'ChIJPWUSbWlwsjURbNvIw3tOTE0', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'place-278', 'culture', 31.241346499999995, 121.44512060000001, 'place_id:ChIJY2v3jN9vsjURmJotCOxoanY', 'ChIJY2v3jN9vsjURmJotCOxoanY', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'yuyuan-old-street', 'sight', 31.227392, 121.49139100000001, 'place_id:ChIJP5OCAWBwsjURfYtYWcmjxXU', 'ChIJP5OCAWBwsjURfYtYWcmjxXU', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'super-brand-mall', 'shopping', 31.236859, 121.499172, 'place_id:ChIJXeVKn-ZwsjUR8pePzpUtIxo', 'ChIJXeVKn-ZwsjUR8pePzpUtIxo', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'shanghai-old-street', 'sight', 31.225319, 121.4969443, 'place_id:ChIJV5LAV4twsjURVTbWYnxGe8M', 'ChIJV5LAV4twsjURVTbWYnxGe8M', 'google'),
  ('38c2d46c-b642-4bbb-a6df-9132bc807c55', 'wukang-mansion', 'sight', 31.204479999999997, 121.438326, 'place_id:ChIJFezOP0llsjURgZUzT-yILHw', 'ChIJFezOP0llsjURgZUzT-yILHw', 'google'),
  -- ปักกิ่ง · 14 แห่ง
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-258', 'culture', 39.9054895, 116.39763169999999, 'place_id:ChIJ2XRD3Jh2YzYRE1lUrcku6io', 'ChIJ2XRD3Jh2YzYRE1lUrcku6io', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-259', 'sight', 39.8821803, 116.40660559999998, 'place_id:ChIJ65H_GWBN8DURag4RO0UVLDc', 'ChIJ65H_GWBN8DURag4RO0UVLDc', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-257', 'sight', 39.9168038, 116.39716209999999, 'place_id:ChIJPdQVRelS8DURnwfTTb3idAY', 'ChIJPdQVRelS8DURnwfTTb3idAY', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'beijing-zoo', 'nature', 39.938863999999995, 116.33954999999999, 'place_id:ChIJPRYRTDJS8DUR5fFsHhL_tW4', 'ChIJPRYRTDJS8DUR5fFsHhL_tW4', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'tiananmen', 'culture', 39.9087202, 116.3974799, 'place_id:ChIJ2XRD3Jh2YzYRmjlIoYPLKGk', 'ChIJ2XRD3Jh2YzYRmjlIoYPLKGk', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-262', 'nature', 39.925447399999996, 116.38926389999997, 'place_id:ChIJWWErs-ZS8DURdcUOnciALOI', 'ChIJWWErs-ZS8DURdcUOnciALOI', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-261', 'sight', 39.9913336, 116.39038509999997, 'place_id:ChIJh4wAB8RU8DURtofj9dfJNe4', 'ChIJh4wAB8RU8DURtofj9dfJNe4', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'jingshan-park', 'nature', 39.9250988, 116.39684329999999, 'place_id:ChIJiaRNz-BS8DURW2N_nAufVJU', 'ChIJiaRNz-BS8DURW2N_nAufVJU', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'lama-temple', 'culture', 39.947671199999995, 116.4172902, 'place_id:ChIJxUzg_TRT8DUR0MslZbKzbF4', 'ChIJxUzg_TRT8DUR0MslZbKzbF4', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'wangfujing-pedestrian-street', 'sight', 39.910959, 116.411341, 'place_id:ChIJpaF2MslS8DURRskvKooTIKk', 'ChIJpaF2MslS8DURRskvKooTIKk', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'hongqiao-market', 'market', 39.886072, 116.42057899999999, 'place_id:ChIJYzZvXkNN8DUR4h25sg3jCFM', 'ChIJYzZvXkNN8DUR4h25sg3jCFM', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'place-260', 'shopping', 39.9094346, 116.44962450000001, 'place_id:ChIJp4O4NRqt8TUREe0QXNrcQXY', 'ChIJp4O4NRqt8TUREe0QXNrcQXY', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'apm', 'shopping', 39.914252, 116.41169199999999, 'place_id:ChIJlS_99c5S8DURQRmKikn28_8', 'ChIJlS_99c5S8DURQRmKikn28_8', 'google'),
  ('c0ef2a14-97cf-49fd-93a0-ae1677036df5', 'zhengyangmen', 'sight', 39.900558, 116.39784599999999, 'place_id:ChIJDQalMb1S8DURGw8FVrmExEk', 'ChIJDQalMb1S8DURGw8FVrmExEk', 'google'),
  -- เฉิงตู · 14 แห่ง
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'kuan-alley-and-zhai-alley', 'sight', 30.663611099999997, 104.0525, 'place_id:ChIJRxJWE9jE7zYRZVJ_scoyS4M', 'ChIJRxJWE9jE7zYRZVJ_scoyS4M', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'chengdu-wu-hou-shrine', 'culture', 30.645802, 104.04942899999999, 'place_id:ChIJHSK0oePE7zYRKcnSiomj91k', 'ChIJHSK0oePE7zYRKcnSiomj91k', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'people-s-park', 'nature', 30.657131999999997, 104.05724599999999, 'place_id:ChIJlZD4VSHF7zYRv59cxjF5vPY', 'ChIJlZD4VSHF7zYRv59cxjF5vPY', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'wenshu-yuan-monastery', 'culture', 30.674771, 104.07194799999999, 'place_id:ChIJvTWARcva7zYRPk9kGPy5G1E', 'ChIJvTWARcva7zYRPk9kGPy5G1E', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-263', 'sight', 30.644858999999997, 104.04997399999999, 'place_id:ChIJIT0ZCOPE7zYR30Zs5J35lxY', 'ChIJIT0ZCOPE7zYR30Zs5J35lxY', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-264', 'culture', 30.65949, 104.026538, 'place_id:ChIJB-sN9r7E7zYRpO3Fn32G9dk', 'ChIJB-sN9r7E7zYRpO3Fn32G9dk', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'anshun-bridge', 'sight', 30.642067499999996, 104.0860563, 'place_id:ChIJW5DuBG_F7zYRlraGfPiu5uI', 'ChIJW5DuBG_F7zYRlraGfPiu5uI', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-265', 'culture', 30.660031000000004, 104.06573999999999, 'place_id:ChIJcbd50jrF7zYRnytgUX55Sio', 'ChIJcbd50jrF7zYRnytgUX55Sio', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'qingyang-palace-west-gate', 'sight', 30.660051, 104.04105299999999, 'place_id:ChIJSYPbWsPE7zYRb1nuq26aGM4', 'ChIJSYPbWsPE7zYRb1nuq26aGM4', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'chunxi-road-pedestrian-street', 'shopping', 30.65785, 104.0785, 'place_id:ChIJk6nPP0fF7zYR85th6s5lXXE', 'ChIJk6nPP0fF7zYR85th6s5lXXE', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'chengdu-museum', 'culture', 30.663751999999995, 104.04461800000001, 'place_id:ChIJkXHY-drE7zYRZYCcyqwKM8o', 'ChIJkXHY-drE7zYRZYCcyqwKM8o', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-266', 'sight', 30.662391000000003, 104.094461, 'place_id:ChIJORlPI1fF7zYRsYvyKa-y8xo', 'ChIJORlPI1fF7zYRsYvyKa-y8xo', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'shufengya-yun', 'sight', 30.660004999999995, 104.045986, 'place_id:ChIJBRtZYNzE7zYRGP9RzBx9ohA', 'ChIJBRtZYNzE7zYRGP9RzBx9ohA', 'google'),
  ('078fc096-2298-4d0a-b0b5-33c8eda698a1', 'place-267', 'sight', 30.630328000000002, 104.093729, 'place_id:ChIJu5JZMHnF7zYRYKShQOKGgnY', 'ChIJu5JZMHnF7zYRYKShQOKGgnY', 'google'),
  -- ชิงเต่า · 14 แห่ง
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-268', 'sight', 36.0620325, 120.3847568, 'place_id:ChIJdzmp_mgQljUR5UIziIYzMpk', 'ChIJdzmp_mgQljUR5UIziIYzMpk', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'tsingtao-brewery-museum', 'culture', 36.079119999999996, 120.346834, 'place_id:ChIJV5aYKSYQljURyzPaSLnejW0', 'ChIJV5aYKSYQljURyzPaSLnejW0', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'zhanqiao-pier', 'sight', 36.058454, 120.320491, 'place_id:ChIJa3aYWYsPljURmWfiJ9p_T1Y', 'ChIJa3aYWYsPljURmWfiJ9p_T1Y', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-270', 'sight', 36.058192999999996, 120.33642700000001, 'place_id:ChIJNcIU7PsPljURGNMnpNzO5uo', 'ChIJNcIU7PsPljURGNMnpNzO5uo', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'signal-mountain-park', 'nature', 36.06604, 120.33202599999998, 'place_id:ChIJUWXepO8PljURMNNqVfvS4tk', 'ChIJUWXepO8PljURMNNqVfvS4tk', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'st-michael-s-cathedral-qingdao', 'sight', 36.067299999999996, 120.32063400000001, 'place_id:ChIJsTdUTO0PljURG6nD34Y7r9U', 'ChIJsTdUTO0PljURG6nD34Y7r9U', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-269', 'shopping', 36.066973, 120.37786100000001, 'place_id:ChIJkQtRRVsQljURYcnAzjOtRcc', 'ChIJkQtRRVsQljURYcnAzjOtRcc', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'taidong-commercial-pedestrain-street', 'sight', 36.083461, 120.354222, 'place_id:ChIJl2V7jC0QljURNHR7qYflrGg', 'ChIJl2V7jC0QljURNHR7qYflrGg', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-272', 'sight', 36.0614217, 120.3852867, 'place_id:ChIJp7O9jF4QljURcVj3flbcayc', 'ChIJp7O9jF4QljURcVj3flbcayc', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'qingdao-zhongshan-park', 'sight', 36.065131, 120.355922, 'place_id:ChIJCVixkRcQljURh3doJOfp5iw', 'ChIJCVixkRcQljURh3doJOfp5iw', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'zhanshan-temple', 'culture', 36.064890999999996, 120.36394200000001, 'place_id:ChIJa0Hu0D8QljURnNHipeUkA_M', 'ChIJa0Hu0D8QljURnNHipeUkA_M', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'lu-xun-park', 'nature', 36.054989, 120.33236699999999, 'place_id:ChIJlXKoJfgPljUR4ewIwT1XJWw', 'ChIJlXKoJfgPljUR4ewIwT1XJWw', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-271', 'shopping', 36.061029, 120.39582700000001, 'place_id:ChIJOcvAVfEQljURDsJzaFMC9jE', 'ChIJOcvAVfEQljURDsJzaFMC9jE', 'google'),
  ('4b22bf96-97f4-41be-ac04-e4a4f6911ae9', 'place-273', 'sight', 36.06179600000001, 120.31917800000001, 'place_id:ChIJT-i6XYsPljURUREsjfBW90M', 'ChIJT-i6XYsPljURUREsjfBW90M', 'google'),
  -- จางเจียเจี้ย · 14 แห่ง
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'tianmenshan-cableway', 'sight', 29.111576, 110.483385, 'place_id:ChIJrz0FK8-vmzYRPYoPH6VDRxY', 'ChIJrz0FK8-vmzYRPYoPH6VDRxY', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'tianmen-fairy-mountain-north-gate', 'sight', 29.067324000000003, 110.47568799999999, 'place_id:ChIJ_9hklEywmzYRuu-jsIT8WAQ', 'ChIJ_9hklEywmzYRuu-jsIT8WAQ', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'tujia-folk-customs-park', 'nature', 29.124723999999997, 110.463872, 'place_id:ChIJi9s8wkiumzYR8mjJ5GAsMtA', 'ChIJi9s8wkiumzYR8mjJ5GAsMtA', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'place-283', 'sight', 29.046812199999998, 110.4820463, 'place_id:ChIJywl-EvmwmzYR8jNUqwT9E9c', 'ChIJywl-EvmwmzYR8jNUqwT9E9c', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'place-284', 'sight', 29.057169000000002, 110.465572, 'place_id:ChIJeSA_GqmxmzYR5xFIRIRUJbQ', 'ChIJeSA_GqmxmzYR5xFIRIRUJbQ', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'zhangjiajie-junsheng-painting-institute', 'culture', 29.1321449, 110.49157819999999, 'place_id:ChIJ2bx0B6SvmzYR-lhFAqOKy38', 'ChIJ2bx0B6SvmzYR-lhFAqOKy38', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'dayong-town', 'sight', 29.127659, 110.48456999999999, 'place_id:ChIJq8dZiLCvmzYRargmKNL0m-U', 'ChIJq8dZiLCvmzYRargmKNL0m-U', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'zhangjiajie-museum', 'culture', 29.131803999999995, 110.456006, 'place_id:ChIJBTiqWEOumzYRuhuYLNe1BqQ', 'ChIJBTiqWEOumzYRuhuYLNe1BqQ', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'place-285', 'nature', 29.117376999999998, 110.54484199999999, 'place_id:ChIJeQnMSW2lmzYRq5d5edcZwAs', 'ChIJeQnMSW2lmzYRq5d5edcZwAs', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'better-life-mall', 'shopping', 29.121945, 110.48796499999999, 'place_id:ChIJNeqWiLmvmzYR4aJ4GxKmptw', 'ChIJNeqWiLmvmzYR4aJ4GxKmptw', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'people-s-square', 'sight', 29.1237, 110.487051, 'place_id:ChIJK-LRFLqvmzYR5ST39iZV47o', 'ChIJK-LRFLqvmzYR5ST39iZV47o', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'zhongshang-plaza', 'shopping', 29.124982999999997, 110.48445699999999, 'place_id:ChIJCXsEjbCvmzYRkL5Kp3n0xiQ', 'ChIJCXsEjbCvmzYRkL5Kp3n0xiQ', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'wuling-commercial-building', 'shopping', 29.1241363, 110.4914855, 'place_id:ChIJXXe_gLuvmzYR3QhEs3uXlAo', 'ChIJXXe_gLuvmzYR3QhEs3uXlAo', 'google'),
  ('b2dd42e5-3cb1-4630-805f-e8f6ef53c77c', 'puguang-temple', 'sight', 29.124771, 110.48801100000001, 'place_id:ChIJX56O1KSvmzYRUb-usOJiOjU', 'ChIJX56O1KSvmzYRUb-usOJiOjU', 'google'),
  -- ซีอาน · 14 แห่ง
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'place-279', 'culture', 34.263177, 108.9390603, 'place_id:ChIJJfnIs2d6YzYRORg_bY2UO9M', 'ChIJJfnIs2d6YzYRORg_bY2UO9M', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'giant-wild-goose-pagoda', 'sight', 34.2182433, 108.9641518, 'place_id:ChIJ2Z1H3-c24BQRane6QKG7BEg', 'ChIJ2Z1H3-c24BQRane6QKG7BEg', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'place-280', 'sight', 34.276795, 108.94724099999999, 'place_id:ChIJodN_-FZ6YzYRhtqcQ2dSq7k', 'ChIJodN_-FZ6YzYRhtqcQ2dSq7k', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'place-281', 'culture', 34.22352, 108.955298, 'place_id:ChIJd1pQT2FwYzYR-Bcdx8lqHg0', 'ChIJd1pQT2FwYzYR-Bcdx8lqHg0', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'small-wild-goose-pagoda', 'sight', 34.239196, 108.941998, 'place_id:ChIJp0glH4JwYzYRvOVRiZHBRT8', 'ChIJp0glH4JwYzYRvOVRiZHBRT8', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'ancient-city-wall', 'sight', 34.252061, 108.95029699999999, 'place_id:ChIJkbIeAoh6YzYR1Ej2JoWm1EA', 'ChIJkbIeAoh6YzYR1Ej2JoWm1EA', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'place-282', 'culture', 34.252459, 108.952809, 'place_id:ChIJh0jQqIF6YzYRhpNkKbDSkLA', 'ChIJh0jQqIF6YzYRhpNkKbDSkLA', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'datang-everbright-city', 'sight', 34.2150944, 108.9645654, 'place_id:ChIJuSEw-0JwYzYReiy44KGrBAM', 'ChIJuSEw-0JwYzYReiy44KGrBAM', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'tang-paradise', 'sight', 34.2123098, 108.9747383, 'place_id:ChIJG4KcOUFwYzYRxKgvrcAbPBI', 'ChIJG4KcOUFwYzYRxKgvrcAbPBI', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'xi-an-wall-yongningmen-north-gate', 'nature', 34.252013, 108.946896, 'place_id:ChIJ3Th01Hx6YzYRQI-0r_IB7pQ', 'ChIJ3Th01Hx6YzYRQI-0r_IB7pQ', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'xi-an-museum', 'culture', 34.237311999999996, 108.94024999999999, 'place_id:ChIJXVVWnIRwYzYR6dmS_KAYg2U', 'ChIJXVVWnIRwYzYR6dmS_KAYg2U', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'yongxingfang', 'sight', 34.2648479, 108.97012670000001, 'place_id:ChIJL078Yul6YzYR2ycYo3U1k5E', 'ChIJL078Yul6YzYR2ycYo3U1k5E', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'kaiyuan-shopping-mall', 'shopping', 34.259187, 108.94860899999999, 'place_id:ChIJ-Q0OuWF6YzYRauGPlSwmT80', 'ChIJ-Q0OuWF6YzYRauGPlSwmT80', 'google'),
  ('57c13ef8-c37b-4709-a1c9-da7ebc1385d5', 'xiaonanmen', 'sight', 34.251768999999996, 108.9361433, 'place_id:ChIJ4aT4WnB6YzYRGVUTca_H7pQ', 'ChIJ4aT4WnB6YzYRGVUTca_H7pQ', 'google'),
  -- กุ้ยหลิน · 14 แห่ง
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'guilin-rongshanhu-scenic-area', 'nature', 25.275040999999998, 110.28936999999999, 'place_id:ChIJjdb1Vsn1pDYRoVkw2FLpdOk', 'ChIJjdb1Vsn1pDYRoVkw2FLpdOk', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'elephant-trunk-hill', 'sight', 25.266947, 110.293263, 'place_id:ChIJBx8lic71pDYRDs9lO3l8Q0w', 'ChIJBx8lic71pDYRDs9lO3l8Q0w', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'reed-flute-cave', 'sight', 25.304409, 110.273614, 'place_id:ChIJs8zoz1f0pDYRWhx3YnA2xV0', 'ChIJs8zoz1f0pDYRWhx3YnA2xV0', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'jingjiang-princes-palace', 'nature', 25.282194, 110.299522, 'place_id:ChIJpyFnGLn1pDYRY0iyxiXLaHQ', 'ChIJpyFnGLn1pDYRY0iyxiXLaHQ', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'riyue-shuangta-cultural-park', 'nature', 25.271983, 110.29503, 'place_id:ChIJA3npd8_1pDYRWQkQmslvtlI', 'ChIJA3npd8_1pDYRWQkQmslvtlI', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'guilin-central-square', 'sight', 25.275011000000003, 110.296056, 'place_id:ChIJaY9NFsb1pDYR1PGKwv-5b1g', 'ChIJaY9NFsb1pDYR1PGKwv-5b1g', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'seven-star-park', 'sight', 25.268791, 110.31212199999999, 'place_id:ChIJe9G-Zez1pDYRb3WjgPmtUT0', 'ChIJe9G-Zez1pDYRb3WjgPmtUT0', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'niko-niko-do-plaza-guilin', 'shopping', 25.27824, 110.29507699999999, 'place_id:ChIJTYNlCsj1pDYRewe5YYwESkA', 'ChIJTYNlCsj1pDYRewe5YYwESkA', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'guilin-two-rivers-four-lakes-scenic-area', 'sight', 25.267797899999998, 110.29517489999999, 'place_id:ChIJg3u3pHv2pDYRXpZXY7qsCLQ', 'ChIJg3u3pHv2pDYRXpZXY7qsCLQ', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'xiangshan-scenic-area', 'nature', 25.266910000000003, 110.29604099999999, 'place_id:ChIJYe99u9r1pDYRMIumXxTQ9VA', 'ChIJYe99u9r1pDYRMIumXxTQ9VA', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'solitary-beauty-peak-prince-city-scenic', 'nature', 25.281238, 110.29920999999999, 'place_id:ChIJo93VZrn1pDYRzt4Wn6l4wZE', 'ChIJo93VZrn1pDYRzt4Wn6l4wZE', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'guilin-yaoshan-scenic-attraction', 'nature', 25.292355999999998, 110.369827, 'place_id:ChIJI15czKlfpDYRto76jgV9_0o', 'ChIJI15czKlfpDYRto76jgV9_0o', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'chuanshan-park', 'nature', 25.2525387, 110.30296539999999, 'place_id:ChIJWbwUTHT2pDYRlH_HuYe7KOQ', 'ChIJWbwUTHT2pDYRlH_HuYe7KOQ', 'google'),
  ('6fd11af5-f65f-4cdd-8aea-81316fa4fea7', 'wanda-plaza', 'shopping', 25.242597999999997, 110.321107, 'place_id:ChIJj4LgOgX2pDYR6PaLYipZoEU', 'ChIJj4LgOgX2pDYR6PaLYipZoEU', 'google'),
  -- ══ ฮ่องกง · 12 แห่ง ══
  -- ฮ่องกง · 12 แห่ง
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'temple-street-night-market', 'market', 22.3065185, 114.1699805, 'place_id:ChIJzcAL8-oABDQRpDOEry9D3bc', 'ChIJzcAL8-oABDQRpDOEry9D3bc', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'harbour-city', 'shopping', 22.2974784, 114.1687395, 'place_id:ChIJlypEmvIDBDQRVuQ8fH13Aqc', 'ChIJlypEmvIDBDQRVuQ8fH13Aqc', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'avenue-of-stars-hk', 'sight', 22.293004600000003, 114.1741517, 'place_id:ChIJsyIrnPEABDQRzjValbVWEJo', 'ChIJsyIrnPEABDQRzjValbVWEJo', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'times-square', 'shopping', 22.278150999999998, 114.1821136, 'place_id:ChIJ_bAR11AABDQRGxsNeGwaZYM', 'ChIJ_bAR11AABDQRGxsNeGwaZYM', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'ladies-market', 'sight', 22.317608999999997, 114.1709284, 'place_id:ChIJbYMkZMgABDQRryWJe8ooWP0', 'ChIJbYMkZMgABDQRryWJe8ooWP0', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'moko', 'shopping', 22.323193699999997, 114.17231939999999, 'place_id:ChIJC_lPIskABDQRxerRNtoOV9o', 'ChIJC_lPIskABDQRxerRNtoOV9o', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'k11-art-mall', 'shopping', 22.297525, 114.1736355, 'place_id:ChIJ_yMf_u0ABDQRFUSKts8Cq0U', 'ChIJ_yMf_u0ABDQRFUSKts8Cq0U', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'megabox', 'shopping', 22.3199795, 114.2084331, 'place_id:ChIJgzPq5DMBBDQR8zgaWx6Z2I0', 'ChIJgzPq5DMBBDQR8zgaWx6Z2I0', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'k11-musea', 'shopping', 22.294214999999998, 114.1748686, 'place_id:ChIJJaeB3_MBBDQRMuGmb2yQxGE', 'ChIJJaeB3_MBBDQRMuGmb2yQxGE', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'new-town-plaza-phase-1', 'shopping', 22.3817578, 114.18863719999999, 'place_id:ChIJFTcnqK0HBDQRdC7jGqw4Cd4', 'ChIJFTcnqK0HBDQRdC7jGqw4Cd4', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'langham-place', 'shopping', 22.318211599999998, 114.16867429999999, 'place_id:ChIJSUsQeMcABDQRUladiJq44qw', 'ChIJSUsQeMcABDQRUladiJq44qw', 'google'),
  ('f5876fcc-122c-4f72-b92e-31306d3faacf', 'airside', 'shopping', 22.331322, 114.19814199999999, 'place_id:ChIJb5q1HOsBBDQR5iVDN8d2hMY', 'ChIJb5q1HOsBBDQR5iVDN8d2hMY', 'google'),
  -- ══ มาเก๊า · 9 แห่ง ══
  -- มาเก๊า · 9 แห่ง
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'senado-square', 'culture', 22.193533400000003, 113.5397593, 'place_id:ChIJhSGVke96ATQR91vVZIEul-0', 'ChIJhSGVke96ATQR91vVZIEul-0', 'google'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'the-londoner-macao', 'shopping', 22.1458478, 113.5653752, 'place_id:ChIJF7EmygRwATQR2MtkpinomWc', 'ChIJF7EmygRwATQR2MtkpinomWc', 'google'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'city-of-dreams', 'shopping', 22.149227399999997, 113.5666788, 'place_id:ChIJU0ChiwNwATQRtIix8P2TBCg', 'ChIJU0ChiwNwATQRtIix8P2TBCg', 'google'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'venetian-macao-casino', 'sight', 22.1484129, 113.5602018, 'place_id:ChIJZ1XUeA9wATQRoiyAPglfzq4', 'ChIJZ1XUeA9wATQRoiyAPglfzq4', 'google'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'macao-giant-panda-pavilion', 'sight', 22.126634, 113.558979, 'place_id:ChIJC1y24zpwATQRIfTrLsOn88I', 'ChIJC1y24zpwATQRIfTrLsOn88I', 'google'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'st-dominic-s-church', 'culture', 22.1945917, 113.5404004, 'place_id:ChIJ0Vtsg-V6ATQR6a8XQDuJQJ0', 'ChIJ0Vtsg-V6ATQR6a8XQDuJQJ0', 'google'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'shoppes-at-venetian', 'shopping', 22.147206699999998, 113.5598223, 'place_id:ChIJR0zShQ9wATQReVRBNmYAXk0', 'ChIJR0zShQ9wATQReVRBNmYAXk0', 'google'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'rua-do-cunha', 'sight', 22.1535358, 113.5569969, 'place_id:ChIJHX64T6xxATQRxbVykc5Tswk', 'ChIJHX64T6xxATQRxbVykc5Tswk', 'google'),
  ('8e6af2dd-4f7c-454d-8998-d59f332ce704', 'galaxy-arena', 'sight', 22.143102700000004, 113.556327, 'place_id:ChIJO96bqXNxATQR-Ynae0jy_OY', 'ChIJO96bqXNxATQR-Ynae0jy_OY', 'google'),
  -- ══ ไทย · 36 แห่ง ══
  -- กระบี่ · 6 แห่ง
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-290', 'culture', 8.1239259, 98.92513100000001, 'place_id:ChIJO2O10qqWUTAREYioi4E8t1Q', 'ChIJO2O10qqWUTAREYioi4E8t1Q', 'google'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-291', 'market', 8.066535499999999, 98.91319969999999, 'place_id:ChIJB8_hhZCUUTARiYqMLFM-oFM', 'ChIJB8_hhZCUUTARiYqMLFM-oFM', 'google'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-293', 'culture', 8.0352438, 98.83103539999999, 'place_id:ChIJBaMRMAHAUTARWW-8BvqMU8M', 'ChIJBaMRMAHAUTARWW-8BvqMU8M', 'google'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'diamond-cave-phra-nang-nai-cave', 'sight', 8.0136407, 98.84214209999999, 'place_id:ChIJhdeVO5nqUTARXEDrwb-WhIw', 'ChIJhdeVO5nqUTARXEDrwb-WhIw', 'google'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'east-railay-bay-beach', 'sight', 8.0103213, 98.84127439999999, 'place_id:ChIJH8sfYpzqUTARPpOV_oWSVOY', 'ChIJH8sfYpzqUTARPpOV_oWSVOY', 'google'),
  ('8a2d6617-1b91-4565-9700-dc78ec272cf4', 'place-292', 'sight', 8.0081971, 98.8365202, 'place_id:ChIJ1bKjXBDrUTARuUbkBPy5k6U', 'ChIJ1bKjXBDrUTARuUbkBPy5k6U', 'google'),
  -- ภูเก็ต · 6 แห่ง
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-304', 'sight', 7.8423143, 98.3568128, 'place_id:ChIJ33J1DVIuUDARPeLYBVDFRC8', 'ChIJ33J1DVIuUDARPeLYBVDFRC8', 'google'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-301', 'market', 7.882640899999999, 98.2931814, 'place_id:ChIJCVYWcbE6UDARt7lWAulfnaY', 'ChIJCVYWcbE6UDARt7lWAulfnaY', 'google'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-300', 'market', 7.827596799999999, 98.2995643, 'place_id:ChIJkYV5pYUlUDARc0NspvlQPkY', 'ChIJkYV5pYUlUDARc0NspvlQPkY', 'google'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-303', 'sight', 7.896741699999999, 98.3949957, 'place_id:ChIJl2G9wYoxUDARTQpdJDE2lsI', 'ChIJl2G9wYoxUDARTQpdJDE2lsI', 'google'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-305', 'sight', 7.8208931, 98.3443255, 'place_id:ChIJ34WfFNcvUDARDABnP_g6Ne4', 'ChIJ34WfFNcvUDARDABnP_g6Ne4', 'google'),
  ('8a52a63e-0523-4ab2-9efa-36a6d6498e14', 'place-302', 'shopping', 7.8465836, 98.35071130000001, 'place_id:ChIJPZFcvF0vUDARX3GFK8rlf1Q', 'ChIJPZFcvF0vUDARX3GFK8rlf1Q', 'google'),
  -- อุดรธานี · 6 แห่ง
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-316', 'sight', 17.3990818, 102.80708059999999, 'place_id:ChIJ2VahvtV3IzER1Xo0NKPNC2U', 'ChIJ2VahvtV3IzER1Xo0NKPNC2U', 'google'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-312', 'sight', 17.403960599999998, 102.7902128, 'place_id:ChIJjWLm1KudIzER12kuCq3F6lA', 'ChIJjWLm1KudIzER12kuCq3F6lA', 'google'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-315', 'culture', 17.4116593, 102.7818381, 'place_id:ChIJPy7AJBOdIzER8b-pIzBsNY8', 'ChIJPy7AJBOdIzER8b-pIzBsNY8', 'google'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-314', 'market', 17.4165962, 102.79115929999999, 'place_id:ChIJV87ZZmidIzERqapCw1q1WY0', 'ChIJV87ZZmidIzERqapCw1q1WY0', 'google'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-311', 'sight', 17.4403961, 102.7142682, 'place_id:ChIJs1YZmqmcIzERiW2l3hfeHNU', 'ChIJs1YZmqmcIzERiW2l3hfeHNU', 'google'),
  ('9bb439bf-5fbe-4680-b5ea-a3bca0f111df', 'place-313', 'shopping', 17.404739, 102.765519, 'place_id:ChIJSRVyCwSdIzERwA9xrTDnEm4', 'ChIJSRVyCwSdIzERwA9xrTDnEm4', 'google'),
  -- กาญจนบุรี · 5 แห่ง
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'kanchanaburi-night-market', 'market', 14.0212001, 99.53296259999999, 'place_id:ChIJ7fSQJLF14zARQwZe_-joSDw', 'ChIJ7fSQJLF14zARQwZe_-joSDw', 'google'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-289', 'market', 14.0235673, 99.5291194, 'place_id:ChIJz2agOLl04zAR06tMDPb9rB0', 'ChIJz2agOLl04zAR06tMDPb9rB0', 'google'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-287', 'market', 14.020158799999999, 99.5295544, 'place_id:ChIJmeEUl7t04zAR6FlwO1C8lVQ', 'ChIJmeEUl7t04zAR6FlwO1C8lVQ', 'google'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-286', 'culture', 13.9994182, 99.51959490000002, 'place_id:ChIJo1pb9WBz4zARsN7Vq934BNo', 'ChIJo1pb9WBz4zARsN7Vq934BNo', 'google'),
  ('9c766a40-dddd-4f6e-9ae4-b6b30b731fe0', 'place-288', 'sight', 13.9689754, 99.5772148, 'place_id:ChIJCdiP9O8M4zARvD8dUDXrTkg', 'ChIJCdiP9O8M4zARvD8dUDXrTkg', 'google'),
  -- สุโขทัย · 6 แห่ง
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-306', 'market', 17.008765, 99.8195392, 'place_id:ChIJ7RBkvdNV3jAREgUkcgpSNQ4', 'ChIJ7RBkvdNV3jAREgUkcgpSNQ4', 'google'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-309', 'market', 17.0369861, 99.8834158, 'place_id:ChIJNWnzSoFV3jAR_kjR__QzmNg', 'ChIJNWnzSoFV3jAR_kjR__QzmNg', 'google'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'sukhojai-street-art', 'sight', 17.008289599999998, 99.817415, 'place_id:ChIJFXOwtsBV3jARS1DaUXWpyqM', 'ChIJFXOwtsBV3jARS1DaUXWpyqM', 'google'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-307', 'shopping', 17.045212499999998, 99.8155451, 'place_id:ChIJFYYbXT9V3jARJBnvq3wOU8o', 'ChIJFYYbXT9V3jARJBnvq3wOU8o', 'google'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-308', 'shopping', 17.0099759, 99.8314319, 'place_id:ChIJ52fGmFRV3jARU6VXgtZoZ10', 'ChIJ52fGmFRV3jARU6VXgtZoZ10', 'google'),
  ('e3a63722-cc8d-4e8c-a7aa-02405c26ec19', 'place-310', 'shopping', 17.010279999999998, 99.82128499999999, 'place_id:ChIJIZgbaZtV3jARv3JBmaitP7I', 'ChIJIZgbaZtV3jARv3JBmaitP7I', 'google'),
  -- น่าน · 6 แห่ง
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-294', 'market', 18.7775282, 100.7759226, 'place_id:ChIJo0mwHnWOJzERLcehJdnkzjc', 'ChIJo0mwHnWOJzERLcehJdnkzjc', 'google'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-295', 'market', 18.7849957, 100.7445095, 'place_id:ChIJX2BKjyiMJzER2f_nIZO07E4', 'ChIJX2BKjyiMJzER2f_nIZO07E4', 'google'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-297', 'nature', 18.8544464, 100.7364965, 'place_id:ChIJb1Tlu8GMJzERbnDrGGm1tnY', 'ChIJb1Tlu8GMJzERbnDrGGm1tnY', 'google'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-296', 'shopping', 18.774819, 100.770118, 'place_id:ChIJlUr1JG6PJzER_NT4ez9SqbA', 'ChIJlUr1JG6PJzER_NT4ez9SqbA', 'google'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-298', 'sight', 18.755601, 100.7050053, 'place_id:ChIJ_5XvQ-iJJzERWmEE9_VfJBc', 'ChIJ_5XvQ-iJJzERWmEE9_VfJBc', 'google'),
  ('547db4dc-978d-44c3-861a-9416f623f732', 'place-299', 'sight', 18.7178574, 100.7525711, 'place_id:ChIJcbq3mwmPJzERAEQFbefBcHU', 'ChIJcbq3mwmPJzERAEQFbefBcHU', 'google'),
  -- เชียงราย · 1 แห่ง
  ('1a94a103-33a0-48cd-82ee-ff4006798c65', 'saturday-night-market', 'market', 19.908664899999998, 99.83077820000001, 'place_id:ChIJ_9iGyWYG1zARyAlGL3WvwhQ', 'ChIJ_9iGyWYG1zARyAlGL3WvwhQ', 'google'),
  -- ══ เกาหลีใต้ · 9 แห่ง ══
  -- โซล · 2 แห่ง
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'seoul-forest-park', 'nature', 37.544387799999996, 127.03744239999999, 'place_id:ChIJK_b0UX2jfDURmkYPvmWYm90', 'ChIJK_b0UX2jfDURmkYPvmWYm90', 'google'),
  ('82cd945c-821b-4b49-ba0a-1ee3d3b21e1a', 'goto-mall', 'shopping', 37.506163, 127.0049887, 'place_id:ChIJRUFcjpGhfDURGWGECbYHg3s', 'ChIJRUFcjpGhfDURGWGECbYHg3s', 'google'),
  -- ปูซาน · 6 แห่ง
  ('97456683-e619-4881-be68-04b2c7e576e6', 'cheongsapo-daritdol-skywalk', 'viewpoint', 35.1640365, 129.1967173, 'place_id:ChIJUQsDVhuNaDURJo5GeByloeQ', 'ChIJUQsDVhuNaDURJo5GeByloeQ', 'google'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'haeundae-blueline-park-songjeong-station', 'sight', 35.1808823, 129.2002747, 'place_id:ChIJfUm6iJONaDURJ1HpAxq9z1o', 'ChIJfUm6iJONaDURJ1HpAxq9z1o', 'google'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'seomyeon-mall-seomyeon-underground-shopp', 'shopping', 35.1562986, 129.059155, 'place_id:ChIJS2MRDG_raDUR0VNDeM8rmC0', 'ChIJS2MRDG_raDUR0VNDeM8rmC0', 'google'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'arte-museum-busan', 'culture', 35.0870682, 129.076373, 'place_id:ChIJvX_SQwDvaDURS28S4RX5ZVM', 'ChIJvX_SQwDvaDURS28S4RX5ZVM', 'google'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'seomyeon-market', 'market', 35.1557374, 129.0581664, 'place_id:ChIJG7Fv02_raDUROnWS49QEK1o', 'ChIJG7Fv02_raDUROnWS49QEK1o', 'google'),
  ('97456683-e619-4881-be68-04b2c7e576e6', 'jeonpo-cafe-street', 'sight', 35.155398999999996, 129.0673266, 'place_id:ChIJYeuKwGTraDUR-U5PAfT2Uoo', 'ChIJYeuKwGTraDUR-U5PAfT2Uoo', 'google'),
  -- คังนึง · 1 แห่ง
  ('a0724555-061c-4182-a008-86ea5cff3a3a', 'daegwallyeong-natural-recreation-forest', 'nature', 37.7128841, 128.7881783, 'place_id:ChIJ1TXNSC_yYTURIrPhyOZ3Y90', 'ChIJ1TXNSC_yYTURIrPhyOZ3Y90', 'google'),
  -- ══ เวียดนาม · 12 แห่ง ══
  -- โฮจิมินห์ · 6 แห่ง
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'dam-sen-water-park', 'nature', 10.7678911, 106.6359914, 'place_id:ChIJa2jyR5cudTERy2ySbqgJudk', 'ChIJa2jyR5cudTERy2ySbqgJudk', 'google'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'ho-chi-minh-city-opera-house', 'sight', 10.776612799999999, 106.7031715, 'place_id:ChIJKcrnSUYvdTERO64MErYx9VU', 'ChIJKcrnSUYvdTERO64MErYx9VU', 'google'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'saigon-book-street', 'sight', 10.780963, 106.7000734, 'place_id:ChIJS8Yv1zcvdTERUI2V47UxkPw', 'ChIJS8Yv1zcvdTERUI2V47UxkPw', 'google'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'vincom-plaza-phan-van-tri', 'shopping', 10.826937599999999, 106.68908569999999, 'place_id:ChIJdeicufAodTERg6AmstkG-AE', 'ChIJdeicufAodTERg6AmstkG-AE', 'google'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'hoc-mon-market', 'market', 10.888904499999999, 106.5966826, 'place_id:ChIJvcyZPY_VdDER_oeDI55DEl4', 'ChIJvcyZPY_VdDER_oeDI55DEl4', 'google'),
  ('c93f6dbd-8dc8-410c-ab3a-3a7c07899852', 'thiso-mall-sala', 'shopping', 10.7719776, 106.7210607, 'place_id:ChIJuxFVtwUvdTERl6qgtn6TcPg', 'ChIJuxFVtwUvdTERl6qgtn6TcPg', 'google'),
  -- ฮานอย · 6 แห่ง
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'thang-long-water-puppet-theatre', 'sight', 21.0316826, 105.8533466, 'place_id:ChIJiUJFE8CrNTERHK060qWnXk4', 'ChIJiUJFE8CrNTERHK060qWnXk4', 'google'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'hanoi-zoo', 'nature', 21.031078600000004, 105.8037432, 'place_id:ChIJi3PpbWqrNTERcL7DLQFRKNw', 'ChIJi3PpbWqrNTERcL7DLQFRKNw', 'google'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'aeon-mall-ha-ong', 'shopping', 20.989562499999998, 105.7513125, 'place_id:ChIJV3ef7nurNTERrsROws-Mv04', 'ChIJV3ef7nurNTERrsROws-Mv04', 'google'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'cho-nha-xanh', 'market', 21.0371049, 105.7860054, 'place_id:ChIJTb2PlDWrNTERMHOrOplO8vc', 'ChIJTb2PlDWrNTERMHOrOplO8vc', 'google'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'bai-a-song-hong', 'nature', 21.078522, 105.8352668, 'place_id:ChIJwYrhVWeqNTERWKke9kRAasc', 'ChIJwYrhVWeqNTERWKke9kRAasc', 'google'),
  ('703b6276-a35b-45d6-b9fe-debffd027aa7', 'vincom-center-metropolis', 'shopping', 21.0313057, 105.81473590000002, 'place_id:ChIJcfr-SqurNTERprSgnJ4BVT4', 'ChIJcfr-SqurNTERprSgnJ4BVT4', 'google')
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
