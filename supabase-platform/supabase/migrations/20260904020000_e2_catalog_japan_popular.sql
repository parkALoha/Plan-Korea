-- ════════════════════════════════════════════════════════════════════════════
-- E2 — เติมสถานที่แนะนำของญี่ปุ่นจากความนิยมจริง (293 แห่ง · 22 เมือง)
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้อนุมัติหลังดูรายการทั้งชุด
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมถึงมีไฟล์นี้ ────────────────────────────────────────────────────
-- ผู้ใช้: *"สถานที่ท่องเที่ยวแนะนำแต่ละประเทศแต่ละเมือง เราอยากจะมีแนะนำเลย
--   ช่วยไปหาข้อมูลมาหน่อยว่าคนที่เขาไปกันหน่ะ ไปไหนบ้าง"*
-- สภาพก่อนไฟล์นี้: ญี่ปุ่น 22 เมือง แต่มีสถานที่รวม **64 แห่ง** (~3 ต่อเมือง)
--   หลายเมืองมีแห่งเดียว — โยโกฮามะ · โกเบ · คามาคุระ · นางาซากิ · นิกโก้ · ทาคายามะ
--
-- ── 🔴 ที่มาของข้อมูล — และทำไมไม่เขียนรายชื่อเอง ──────────────────────
-- ดึงจาก **Google Places API** `searchNearby` · `rankPreference: POPULARITY`
--   ⇒ ทุกแถวมี `google_place_id` + จำนวนรีวิว **รันซ้ำแล้วเทียบผลกันได้**
-- 🎯 รายชื่อที่คนเขียนจากความจำ **ตรวจไม่ได้และล้าเงียบ** — ไม่มีใครรู้ว่าอันไหนหมดสมัย
-- · เครื่องมือ: `scripts/catalog-suggest.py` (โหมดเริ่มต้น `--dry` ไม่แตะฐาน)
-- · `rankPreference` ต้องเป็น POPULARITY ไม่ใช่ DISTANCE — บทเรียนเดิมของโปรเจกต์
--   (DISTANCE เคยทำให้คลินิกศัลยกรรมเกาหลีขึ้นมาแทนโรงพยาบาลจริง)
--
-- ── 🔴 สองบั๊กที่เจอตอนทำ และแก้ก่อนไฟล์นี้เกิด ─────────────────────────
-- ① **แจกเมืองด้วยระยะทาง = ผิด** วัดจริง: Hakkeijima อยู่ใน *โยโกฮามะ*
--    แต่ใกล้คามาคุระกว่า (9.1 กับ 11.9 กม.) ⇒ "เมืองใกล้สุดชนะ" จะแจกผิดเมือง
--    **และทำให้แถวเดียวโผล่สองเมือง**
--    ✅ แจกด้วย `addressComponents` ของ Google แทน
-- ② **ใช้ `locality` อย่างเดียวก็ยังไม่พอ** — โตเกียวได้ **0 แห่ง** และชิราคาวาโกะได้ **0**
--    เพราะ Google บอก `locality` ของโตเกียวเป็น *ชื่อเขต* (Minato City · Shibuya)
--    และเรียกชิราคาวาโกะว่า *"Shirakawa"*
--    🎯 **ผลลบที่มาจากกฎแคบเกิน ไม่ใช่จากข้อมูล** — ถ้าไม่ตรวจก่อนลง จะเสีย 28 แห่งของสองเมืองนี้ไปเงียบ ๆ
--    ✅ แก้เป็นสามชั้น: locality เป๊ะ → ตัดคำต่อท้าย → จังหวัดที่ชื่อเดียวกับเมือง
--       (ชั้นล่างห้ามแย่งของเมืองที่ locality ตรงกว่า ไม่งั้นโตเกียวจะกวาดของเมืองข้างเคียง)
--
-- ── ⚠️ สิ่งที่ไฟล์นี้ **ไม่** ได้ทำ ────────────────────────────────────
-- · **ไม่แตะ 64 แถวเดิมเลย** — กันซ้ำด้วย `google_place_id` และชื่อตอนสร้างไฟล์
-- · **ไม่ตัดแถวที่รีวิวน้อยออก** — มี 17 แถวที่ < 500 รีวิว
--   (Furano 8 · Shirakawa-go 6 · Otaru 2 · Nagasaki 1)
--   🔴 เกณฑ์จำนวนรีวิวตายตัว **จะตัดของจริงของเมืองเล็กทิ้งไปด้วย**
--   (ซกโช: น้ำตกบีรยอง ⭐4.5 แต่ 242 รีวิว — ของจริง แค่คนไปน้อย)
--   ⇒ ผู้ใช้ดูรายการทั้งชุดแล้วรับ **ไม่ใช่ปล่อยผ่านเพราะไม่มีใครดู**
-- · **ไม่มีชื่อไทย/ชื่อท้องถิ่นในไฟล์นี้** — `catalog_places` ไม่มีคอลัมน์ชื่อ
--   (`D77` แยกไป `catalog_place_names`) · ชื่อที่เห็นในคอมเมนต์คือของ Google ตอนดึง
--
-- ── หลังรันไฟล์นี้ ────────────────────────────────────────────────────
-- ญี่ปุ่น: 64 → 357 แห่ง · คลังรวม: 202 → 495
-- ════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์ — ต้องเป็น plan-korea-platform/pmvxwcimjebogjfimzqy/dev';
  end if;

  -- 🔴 ด่านที่สอง: ญี่ปุ่นต้องมีเมืองครบก่อน ไม่งั้น `city_id` ข้างล่างชี้ไปที่ไม่มีอยู่
  --    (ไฟล์นี้ฝัง uuid ของเมืองไว้ตรง ๆ — อ่านมาจากฐาน dev ตอนสร้างไฟล์)
  if (select count(*) from public.catalog_cities where country_id = 'jp') < 22 then
    raise exception 'ญี่ปุ่นมีเมืองไม่ครบ 22 — รัน seed ญี่ปุ่นก่อน';
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
  -- ฟุกุโอกะ (Fukuoka) · 14 แห่ง · อันดับหนึ่ง 55,317 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'place-6', 'shopping', 33.5896305, 130.41094780000003, 'ChIJYcOBiZWRQTUR0Rl0ehe67eA'),   -- คาแนลซิตีฮากาตะ · 55,317 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'place-8', 'viewpoint', 33.5932846, 130.35151, 'ChIJAQAEI6qTQTURLZF6YTY7dPk'),   -- ฟูกูโอกะทาวเวอร์ · 23,317 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'place-7', 'culture', 33.5953942, 130.36212319999998, 'ChIJS7bmAk2SQTURwlTt0njZnLc'),   -- ฟุกุโอะกะโดม · 19,505 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'place-9', 'nature', 33.586206499999996, 130.3764646, 'ChIJx6TbjMyTQTURmPdN7915780'),   -- สวนโอโฮริ · 15,440 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'place-10', 'sight', 33.660851, 130.36341299999998, 'ChIJR4tIGrGNQTURRMLEZ9kNOr8'),   -- พิพิธภัณฑ์สัตว์น้ำอุมิโนะนากามิจิ · 13,738 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'lala-port-fukuoka', 'shopping', 33.565167599999995, 130.4409414, 'ChIJEdlnmueRQTURANHkHiY3d-U'),   -- LaLa Port Fukuoka · 9,331 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'fukuoka-parco', 'shopping', 33.5907445, 130.39866519999998, 'ChIJVVUVAI-RQTUR4O0-0xXxi0Y'),   -- Fukuoka PARCO · 8,021 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'aeon-mall-fukuoka', 'shopping', 33.5970724, 130.480909, 'ChIJMxWvJGmFQTURz-Ov_O4UQZs'),   -- Aeon Mall Fukuoka · 7,772 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'don-quijote-nakasu', 'market', 33.5939851, 130.4058456, 'ChIJU6_Qh5SRQTURhTacOuDrmZo'),   -- Don Quijote Nakasu · 7,658 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'don-quijote', 'market', 33.5863485, 130.39801989999998, 'ChIJj9iUqoWRQTURWnFERWGSVHg'),   -- Don Quijote · 7,241 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'tenjin-underground-mall', 'shopping', 33.589571899999996, 130.3997484, 'ChIJ970Xo46RQTURm6GUmUJcn6Y'),   -- Tenjin Underground Mall · 7,107 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'momochi-seaside-park', 'nature', 33.5945933, 130.3512594, 'ChIJVySQW6qTQTUR1FtUfzDxrNA'),   -- Momochi Seaside Park · 6,927 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'mark-is-fukuoka-momochi', 'shopping', 33.592234, 130.3645564, 'ChIJx0YIukySQTURTcj52BPDl3c'),   -- MARK IS Fukuoka Momochi · 6,401 รีวิว
  ('e3605bdb-e068-4c3e-a262-4c2c3f935071', 'nakasu-food-stalls-street', 'sight', 33.5903962, 130.4083, 'ChIJRbuyypWRQTURbITjwMeuLnM'),   -- Nakasu Food Stalls Street · 5,615 รีวิว
  -- ฟุราโนะ (Furano) · 14 แห่ง · อันดับหนึ่ง 8,651 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'place-11', 'sight', 43.3233257, 142.3558861, 'ChIJPbaM-V5Sc18RLOjzIysMtac'),   -- นิงเกิ้ลเทอเรส · 8,651 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'furano-marche', 'shopping', 43.3422273, 142.38713909999998, 'ChIJy47IT2RNc18Rj9fZvT1syUM'),   -- Furano Marche · 3,965 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'place-12', 'sight', 43.3249606, 142.3532411, 'ChIJPbaM-V5Sc18RSyNjT7_uIJA'),   -- ฟุราโนะสกีรีสอร์ต · 1,032 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'torinuma-park', 'nature', 43.340795299999996, 142.4361563, 'ChIJbUJIO69Nc18Rgboh6KuTrsw'),   -- Torinuma Park · 637 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'furano-marche-2', 'shopping', 43.342686, 142.387609, 'ChIJI0IpTWRNc18RC6jkzl1R8bI'),   -- Furano Marche 2 · 577 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'place-13', 'sight', 43.3585597, 142.3736882, 'ChIJq6oa8k5Nc18RdswsqfkY4dE'),   -- โรงกลั่นเหล้าองุ่นฟุราโนะ · 554 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'asahigaoka-park', 'nature', 43.3382885, 142.37267699999998, 'ChIJkf_-J5hSc18RyKebUhctkF0'),   -- Asahigaoka Park · 394 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'kitanomine-zone', 'sight', 43.342588, 142.3575535, 'ChIJbZHWeqNSc18RaEeiZoUE7kI'),   -- Kitanomine Zone · 380 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'furano-shrine', 'culture', 43.3439222, 142.3816971, 'ChIJwbGotmZNc18Rkw0yN3iDge4'),   -- Furano Shrine · 378 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'leisure-guide-asobiya', 'sight', 43.3475973, 142.3618804, 'ChIJJ7evBadSc18RMg6a9gUbLX4'),   -- Leisure Guide Asobiya · 253 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'place-14', 'market', 43.264293599999995, 142.38349, 'ChIJWYmJ8ERRc18RstkifWeKxz4'),   -- 中田農園 · 232 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'one-cherry-tree-of-kamigoryo', 'sight', 43.2969845, 142.363095, 'ChIJJ-uW98pTc18ROtsZDAcPC04'),   -- One Cherry Tree of Kamigoryo · 126 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'place-15', 'sight', 43.3583999, 142.3737095, 'ChIJJ--GMhOzDF8RVpyzACLJTWE'),   -- ふらのワイナリー（ふらのワイン） · 120 รีวิว
  ('a2006ae6-14a1-462a-9eb2-922e467c2ade', 'furano-kan-kan-mura', 'sight', 43.323616699999995, 142.3556749, 'ChIJG3O_BvtTc18RXPaiJlu26-M'),   -- Furano Kan Kan Mura · 20 รีวิว
  -- ฮาโกดาเตะ (Hakodate) · 14 แห่ง · อันดับหนึ่ง 17,596 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'place-16', 'viewpoint', 41.794669899999995, 140.75402, 'ChIJsw48tWv0nl8RnqjxKCD49XU'),   -- โกะเรียวคากุทาวเวอร์ · 17,596 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'kanemori-red-brick-warehouse', 'shopping', 41.76649270000001, 140.71637769999998, 'ChIJo1BfeKjznl8R-KEsd6JreQ4'),   -- Kanemori Red Brick Warehouse · 16,643 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'goryokaku-park', 'nature', 41.7968814, 140.75611379999998, 'ChIJwZJjumv0nl8R5Rw0x1boBmw'),   -- Goryokaku Park · 12,009 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'place-17', 'culture', 41.796924499999996, 140.7567838, 'ChIJJVWNy2v0nl8RAtXEli295Kk'),   -- โกเรียวคาคุ · 11,626 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'place-18', 'sight', 41.7639012, 140.71180429999998, 'ChIJT_xUJ6rznl8RXrmIZ5nBJjY'),   -- เนินฮาจิมัง-ซากะ · 3,801 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'hakodate-tropical-botanical-garden', 'nature', 41.774009299999996, 140.7895005, 'ChIJgxZMBJb0nl8RT88YARt3RXI'),   -- สวนพฤษศาสตร์เขตร้อนฮาโกดาเตะ Hakod · 3,784 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'place-19', 'sight', 41.7450354, 140.7212027, 'ChIJ_aCLl93ynl8R9uvq5Ye3yU8'),   -- แหลมทาจิมาจิ · 3,456 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'our-lady-of-the-angels-trappistine-abbey', 'culture', 41.7879845, 140.8226181, 'ChIJpU7UQx_1nl8ReDXs6hV34c0'),   -- Our Lady of the Angels Trappistine · 3,325 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'mega-don-quijote-hakodate', 'market', 41.813546699999996, 140.7562236, 'ChIJqb7VCi_0nl8RSY9euTavEgM'),   -- MEGA Don Quijote Hakodate · 2,988 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'old-public-hall-of-hakodate-ward', 'sight', 41.7650219, 140.70893479999998, 'ChIJRw_H56vznl8RMNpSnxrOimg'),   -- Old Public Hall of Hakodate Ward · 2,620 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'place-20', 'culture', 41.7822064, 140.79104239999998, 'ChIJMQw0B-30nl8RvNXmL1kA7F4'),   -- ศาลเจ้ายูคุระ · 2,441 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'hakodate-morning-market-ekini-market', 'market', 41.7724585, 140.7256912, 'ChIJ9Th38KHznl8RlR8a2ny1fuQ'),   -- Hakodate Morning Market Ekini Mark · 1,894 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'share-star-hakodate', 'shopping', 41.7896187, 140.7519576, 'ChIJ2560b3D0nl8R0nCbVsNc-3M'),   -- Share Star Hakodate · 1,454 รีวิว
  ('680670ac-b018-4a9a-b061-affd356f81c5', 'hakodate-morning-market-square', 'market', 41.7722914, 140.7251981, 'ChIJ__8_-aHznl8RZ3sWVLjqLr8'),   -- Hakodate Morning Market Square · 839 รีวิว
  -- ฮิโรชิมะ (Hiroshima) · 14 แห่ง · อันดับหนึ่ง 34,390 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'place-28', 'sight', 34.395483, 132.453592, 'ChIJqYAn2wyiWjURlsDG4Hpn5jQ'),   -- อนุสรณ์สันติภาพฮิโระชิมะ · 34,390 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'place-30', 'nature', 34.3926867, 132.4522012, 'ChIJgzAzVG2iWjURZRZ1udXOKeE'),   -- อนุสรณ์สถานสันติภาพฮิโรชิมะ · 30,512 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'hiroshima-peace-memorial-museum', 'culture', 34.3915027, 132.45315779999999, 'ChIJtyvayxKiWjURgIGSanFnMPE'),   -- Hiroshima Peace Memorial Museum · 29,905 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'place-29', 'culture', 34.402745599999996, 132.4591055, 'ChIJw-f36qaYWjURMpYztSzpe_U'),   -- ปราสาทฮิโรชิมะ · 18,169 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'okonomimura', 'sight', 34.3914342, 132.4619014, 'ChIJ8wsenQ-iWjUR1opIxHCTeBM'),   -- Okonomimura · 8,936 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'aeon-mall-hiroshima-fuchu', 'shopping', 34.3943796, 132.4993651, 'ChIJf6pRZ26fWjURcQb8ZmQrYCI'),   -- AEON MALL Hiroshima Fuchu · 8,926 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'place-31', 'nature', 34.4004834, 132.4677207, 'ChIJAfBmWKmYWjUR42FdSpYghNc'),   -- สวนชุกเกเอ็ง · 8,860 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'the-outlets-hiroshima', 'shopping', 34.4098818, 132.3978328, 'ChIJFf4MyrWiWjURSjnCDinNH_Q'),   -- THE OUTLETS HIROSHIMA · 7,898 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'lect', 'shopping', 34.3728775, 132.4067253, 'ChIJUaWGPzqjWjURLEvPnsvPwmA'),   -- Lect · 6,644 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'youme-town-hiroshima', 'shopping', 34.37607270000001, 132.463913, 'ChIJxVHUPSOiWjURlvAk_NPBH9o'),   -- youme Town Hiroshima · 5,329 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'youme-town-hatsukaichi', 'shopping', 34.346032199999996, 132.3355638, 'ChIJMYC8jrW7WjURaM_odv4bUKg'),   -- youme Town Hatsukaichi · 5,319 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'aeon-mall-hiroshima-gion', 'shopping', 34.4438649, 132.46145429999999, 'ChIJKf9oSiWZWjURLqDHu-YmgXg'),   -- AEON MALL Hiroshima Gion · 4,382 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'don-quijote-hiroshima-hacchobori', 'market', 34.3911739, 132.4623201, 'ChIJQ4cLgg-iWjURzARrjEKBd94'),   -- Don Quijote Hiroshima Hacchobori · 4,115 รีวิว
  ('8032fa4c-098f-4427-853a-dd4498378a41', 'hiroshima-parco', 'shopping', 34.3921942, 132.4619845, 'ChIJf19ybw-iWjURVJoVxhaS5fg'),   -- Hiroshima PARCO · 4,058 รีวิว
  -- คานาซาวะ (Kanazawa) · 14 แห่ง · อันดับหนึ่ง 37,838 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'kenroku-en', 'nature', 36.5621278, 136.66265149999998, 'ChIJBVmy-YMz-F8R5PID8D17Cpc'),   -- Kenroku-en · 37,838 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'place-40', 'culture', 36.572582499999996, 136.6665601, 'ChIJsfC6oXQz-F8RdA1qXiF6jLs'),   -- ฮิกาชิ ชายะ · 23,594 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'omicho-market', 'market', 36.5717335, 136.6558651, 'ChIJ0xPT93Az-F8RpTSlbHwo9L8'),   -- Omicho Market · 19,323 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'place-41', 'nature', 36.5659458, 136.6588451, 'ChIJlUfxPYIz-F8RSh7ml54YJ6g'),   -- ปราสาทคานาซาว่า · 12,011 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'nagamachi-samurai-district', 'culture', 36.5637517, 136.6510146, 'ChIJhycOJtYz-F8RO54LaTG6_p0'),   -- Nagamachi Samurai District · 5,170 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'kanazawa-forus', 'shopping', 36.5791483, 136.64975429999998, 'ChIJZXfN0UEz-F8RTW-OF6xGbvE'),   -- Kanazawa Forus · 4,940 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'nomura-ke-samurai-heritage-residence', 'culture', 36.564205799999996, 136.6500324, 'ChIJF_AqPH4z-F8Rmtm1IKiShVQ'),   -- Nomura-ke Samurai Heritage Residen · 4,814 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'place-42', 'culture', 36.5553843, 136.64899739999998, 'ChIJuYLrXHs0-F8RGY1Ld3voBB4'),   -- วัดเมียวยูจิ (วัดนินจา) · 4,649 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'kanazawa-port-ikiiki-fish-market', 'market', 36.609740099999996, 136.6101158, 'ChIJDeiHxfDM-V8RxuHMhqXudFE'),   -- Kanazawa Port Ikiiki Fish Market · 2,939 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'mega-don-quijote-kanazawa', 'market', 36.5506379, 136.6318241, 'ChIJFXlKpl80-F8R5F22PLN18U4'),   -- MEGA Don Quijote Kanazawa · 2,734 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'place-43', 'culture', 36.556967199999995, 136.6474386, 'ChIJD5ZW73w0-F8RZelpmCV1f3A'),   -- เขตนิชิชายะ · 2,496 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'al-plaza-kanazawa', 'shopping', 36.5912217, 136.64354179999998, 'ChIJ31UPmjMz-F8R8juH7wLTzYs'),   -- AL PLAZA Kanazawa · 1,979 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'round1-stadium-kanazawa', 'sight', 36.542020799999996, 136.6260648, 'ChIJG3X5F1I0-F8R3ROL9sP6lzk'),   -- ROUND1 Stadium Kanazawa · 1,466 รีวิว
  ('7a2b2df0-30ad-4658-b10b-575aa8d79d2c', 'hondanomori-hokuden-hall', 'sight', 36.55844450000001, 136.6650297, 'ChIJByDxgogz-F8RxBKy54J5fU8'),   -- Hondanomori Hokuden Hall · 1,167 รีวิว
  -- โกเบ (Kobe) · 14 แห่ง · อันดับหนึ่ง 24,347 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'chinatown-kobe', 'sight', 34.6882142, 135.1881104, 'ChIJkaqwvf2OAGARARl_1gEYbx0'),   -- Chinatown Kobe · 24,347 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'kobe-harborland-umie', 'shopping', 34.680067, 135.183254, 'ChIJuzTLRwePAGARTAkpdj5blxU'),   -- Kobe Harborland umie · 19,446 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'kobe-animal-kingdom', 'sight', 34.6546416, 135.2225468, 'ChIJm-YWI_iRAGARxENoWS1l6gg'),   -- Kobe Animal Kingdom · 17,281 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'place-45', 'culture', 34.6947159, 135.1907243, 'ChIJweCflOOOAGARSAhXB35rPCY'),   -- ศาลเจ้าอิกูตะ · 12,420 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'place-47', 'sight', 34.6800711, 135.18351429999998, 'ChIJD5fHbgePAGARpXshMiA87rA'),   -- ฮาร์เบอร์แลนด์ · 12,012 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'place-44', 'viewpoint', 34.6826316, 135.1867244, 'ChIJweTiKACPAGARgqyoB9hC7rc'),   -- โกเบ พอร์ท ทาวเวอร์ · 11,816 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'kobe-anpanman-children-s-museum-mall', 'culture', 34.6785235, 135.1848484, 'ChIJZ__NhgCPAGARDaZrej2pwOs'),   -- Kobe Anpanman Children's Museum &  · 8,090 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'nunobiki-herb-garden', 'nature', 34.70442750000001, 135.1938755, 'ChIJWapiVtGOAGARVY9nvX-kXII'),   -- Nunobiki Herb Garden · 6,921 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'place-48', 'culture', 34.6992495, 135.2182515, 'ChIJZ7BukIaOAGAR4keLi5dZh4I'),   -- พิพิธภัณฑ์ศิลปะเฮียวโงะ · 6,749 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'place-46', 'culture', 34.7007283, 135.19079059999999, 'ChIJT6cViuCOAGARegX_ORkvbs0'),   -- คิตาโนะ อิจินคัง-ไก · 5,767 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'atoa', 'sight', 34.683222199999996, 135.1936194, 'ChIJwaevoL2PAGAR1MG37BLpfo8'),   -- átoa · 5,194 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'place-50', 'nature', 34.734241499999996, 135.2063283, 'ChIJK9Er5z6JAGAR6-_inZvie2o'),   -- คิคุเซได · 4,633 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'place-49', 'sight', 34.7515873, 135.2090028, 'ChIJqYzyt22JAGARCIV7nbl82Vc'),   -- ทุ่งเลี้ยงสัตว์ร็อกโกะซัน · 3,584 รีวิว
  ('1bfc2870-a307-4787-ae5b-5a7ffcee402d', 'kobe-city-museum', 'culture', 34.6872567, 135.19318339999998, 'ChIJTcIyavmOAGARAUlKgKzyqPE'),   -- Kobe City Museum · 3,309 รีวิว
  -- เกียวโต (Kyoto) · 14 แห่ง · อันดับหนึ่ง 90,989 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-52', 'culture', 34.9676945, 135.7791876, 'ChIJIW0uPRUPAWAR6eI6dRzKGns'),   -- ศาลเจ้าฟูชิมิอินาริ · 90,989 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-51', 'culture', 34.9946662, 135.784661, 'ChIJB_vchdMIAWARujTEUIZlr2I'),   -- วัดคิโยะมิซุ · 72,108 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-53', 'culture', 35.03937, 135.7292431, 'ChIJvUbrwCCoAWARX2QiHCsn5A4'),   -- วัดคิงกะกุ · 70,049 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-56', 'culture', 35.0140379, 135.7484258, 'ChIJC5srCtQHAWARLy9qkFmHaxA'),   -- ปราสาทนิโจ · 42,809 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-55', 'culture', 35.0036559, 135.7785534, 'ChIJqewQoHkIAWAR6RokWp3Iesc'),   -- ศาลเจ้ายาซากะ · 33,660 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-54', 'nature', 35.0168187, 135.67130129999998, 'ChIJrYtcv-urAWAR3XzWvXv8n_s'),   -- ป่าไผ่อาราชิยามะ · 24,653 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-59', 'culture', 34.9803395, 135.7476935, 'ChIJTar7hQQGAWAREHkXsNkt7tM'),   -- วัดโทจิ · 19,881 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-58', 'culture', 35.0270213, 135.7982058, 'ChIJ4W9CCwUJAWARyauI6BzKiiU'),   -- วัดกิงกะกุ · 17,779 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-61', 'culture', 34.9966644, 135.78100799999999, 'ChIJr_gZonkIAWARB1xyACZNUKM'),   -- ย่านซันเนซากะ · 16,915 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-60', 'culture', 35.0311737, 135.7351227, 'ChIJbeDwe-0HAWARGu4ubMH-Jls'),   -- ศาลเจ้าคิตาโนะ เท็มมากุ · 16,852 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-62', 'culture', 35.0159823, 135.7824263, 'ChIJjch8GOUIAWART0WX2JLZvnU'),   -- ศาลเจ้าเฮอัง · 16,249 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'aeon-mall-kyoto', 'shopping', 34.9827278, 135.75445539999998, 'ChIJ8Uuuf6kIAWARFFrpsu-HJHQ'),   -- AEON MALL KYOTO · 15,868 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-63', 'culture', 35.0114138, 135.7944841, 'ChIJ_fuXcyEJAWARTQDnx6Q5szg'),   -- วัดนันเซนจิ · 12,598 รีวิว
  ('c997d0a6-128d-45eb-b1c7-81b81677c43f', 'place-57', 'sight', 35.009449, 135.666773, 'ChIJ49PvUVQHAWARTAF7WU_Wqqs'),   -- อาราชิยาม่า · 7,503 รีวิว
  -- นางาซากิ (Nagasaki) · 14 แห่ง · อันดับหนึ่ง 12,755 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'glover-garden-2', 'nature', 32.734331399999995, 129.8691886, 'ChIJ34BEgoRTFTURm9sPe3FbyOs'),   -- Glover Garden · 12,755 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'place-65', 'viewpoint', 32.7526235, 129.8495163, 'ChIJG5CoZThTFTURn9E9mHqF_EY'),   -- หอดูดาวภูเขาอินาซายามะ · 12,623 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'nagasaki-atomic-bomb-museum', 'culture', 32.772796299999996, 129.8643625, 'ChIJCa-tFdGsajUR9eUQucc9fMA'),   -- Nagasaki Atomic Bomb Museum · 11,099 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'place-64', 'culture', 32.747144399999996, 129.8800952, 'ChIJSfofOkdTFTURXov-p4VbjtQ'),   -- สะพานเมงาเนบาชิ · 10,516 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'peace-park-nagasaki', 'nature', 32.7763968, 129.8636495, 'ChIJ4acabdqsajURNnu2TKq8nKQ'),   -- Peace Park Nagasaki · 9,630 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'nagasaki-shinchi-chinatown', 'sight', 32.741458699999995, 129.8752789, 'ChIJK3MfoRVTFTURFhFVj6JIlxE'),   -- Nagasaki Shinchi Chinatown · 9,367 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'amu-plaza-nagasaki', 'shopping', 32.751690599999996, 129.87088, 'ChIJJX4JpztTFTUR5sSOi9PKcrY'),   -- Amu Plaza Nagasaki · 5,794 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'youme-town-yumesaito', 'shopping', 32.7462626, 129.8702534, 'ChIJdQFxbz1TFTURuFLYCFTUB2Q'),   -- Youme Town Yumesaito · 4,298 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'nagasaki-penguin-aquarium', 'sight', 32.7581537, 129.9467149, 'ChIJk2sjlOaqajURPi5soRvA8HU'),   -- Nagasaki Penguin Aquarium · 4,140 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'mirai-nagasaki-cocowalk', 'shopping', 32.7622501, 129.8648232, 'ChIJu1aFPCxTFTURLTN1dIT5gy8'),   -- MIRAI NAGASAKI COCOWALK · 4,002 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'place-67', 'culture', 32.754303199999995, 129.8819114, 'ChIJ_xNbbElTFTURl4L1nlktGPc'),   -- ศาลเจ้าซูวะ · 3,196 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'nagasaki-prefectural-art-museum', 'culture', 32.741910499999996, 129.8703177, 'ChIJzavJ4BZTFTURqqRlxgoZfaI'),   -- Nagasaki Prefectural Art Museum · 2,520 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'oura-cathedral', 'culture', 32.7341535, 129.8701372, 'ChIJwd-Grw9TFTURJg1yCFQf8PU'),   -- Ōura Cathedral · 1,702 รีวิว
  ('11ef4633-8f55-4676-93fd-cf3b4869fbc9', 'place-66', 'sight', 32.7411655, 129.8758167, 'ChIJqVlfqhVTFTURO4HoqKoVE34'),   -- 長崎新地中華街 · 147 รีวิว
  -- นาโกย่า (Nagoya) · 14 แห่ง · อันดับหนึ่ง 45,260 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'place-68', 'culture', 35.184750099999995, 136.89968829999998, 'ChIJse-wx8t2A2ARd6Z1knjp07k'),   -- ปราสาทนะโงะยะ · 45,260 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'place-69', 'sight', 35.090508799999995, 136.8784377, 'ChIJsyTJ06B5A2ARvt6FJ9xiqaE'),   -- พิพิธภัณฑ์สัตว์น้ำท่าเรือนาโกย่า · 23,772 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'place-70', 'culture', 35.1273579, 136.9086948, 'ChIJ3abhnht6A2ARu-Y4yDEWlao'),   -- ศาลเจ้าอัตสึตะ · 23,360 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'place-71', 'culture', 35.1650768, 136.89970259999998, 'ChIJNfP0RCx3A2ARE9dwKx_ZRzk'),   -- พิพิธภัณฑ์วิทยาศาสตร์นาโกย่า · 13,846 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', '21', 'shopping', 35.1711148, 136.9094757, 'ChIJT5niKdRwA2AR1oO7t2LlvlQ'),   -- โอเอซิส 21 · 12,709 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'mozo-wonder-city', 'shopping', 35.2249675, 136.8840617, 'ChIJGc7cLmh0A2ARzLxLh-4ZE5U'),   -- mozo Wonder City · 10,442 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'aeon-mall-nagoya-dome-mae', 'shopping', 35.1871751, 136.9440943, 'ChIJbfRbSlRwA2ARKE-YBjHo-v0'),   -- AEON MALL NAGOYA DOME MAE · 9,243 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'place-73', 'nature', 35.1550781, 136.9200817, 'ChIJR2Eikr1wA2ARiMo_xE7eXlA'),   -- สวนสึรุมะ · 8,467 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'noritake-garden', 'nature', 35.1791153, 136.8812176, 'ChIJkVqv3Op2A2AR0laSdx5UWOA'),   -- Noritake Garden · 8,058 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'place-72', 'shopping', 35.1363408, 136.9095078, 'ChIJldCn4wZ6A2ARbC5QFunDF5g'),   -- อิออนมอลล์ อัตสึตะ · 8,030 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'lalaport-nagoya-minato-aquls', 'shopping', 35.1092578, 136.8827588, 'ChIJfXvoVD55A2AR1Ewv9iSCRAY'),   -- LaLaport Nagoya Minato AQULS · 7,618 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'aeon-mall-nagoya-chaya', 'shopping', 35.1036419, 136.82482969999998, 'ChIJl42CY1WdA2AR2OHBVumHn1I'),   -- AEON MALL Nagoya Chaya · 7,322 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'nagoya-parco', 'shopping', 35.1633932, 136.9076145, 'ChIJe7YO2c1wA2ARcRKYiy-HcIY'),   -- Nagoya PARCO · 7,183 รีวิว
  ('af75d6bc-6389-46f3-b9d9-39415beaa60f', 'aeon-mall-nagoya-noritake-garden', 'shopping', 35.179865899999996, 136.8799137, 'ChIJRfCWc-p3A2AR4olIdF_c4V4'),   -- AEON MALL Nagoya Noritake Garden · 7,152 รีวิว
  -- นารา (Nara) · 14 แห่ง · อันดับหนึ่ง 31,878 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'place-76', 'culture', 34.6889851, 135.8398158, 'ChIJ3XYIepA5AWARjzzVnT-skPg'),   -- วัดโทได · 31,878 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'place-77', 'culture', 34.6815454, 135.8484719, 'ChIJ1Wqwa8A5AWARlpXjgoPnl0w'),   -- ศาลเจ้าคะซุงะ · 15,393 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'place-79', 'culture', 34.6832311, 135.8311589, 'ChIJs-w9sog5AWARk0WDN0cPgxE'),   -- วัดโคฟุคุจิ · 12,999 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'horyu-ji', 'culture', 34.614723399999995, 135.7341813, 'ChIJT4_DYfUvAWAR_NviFfadTOk'),   -- Hōryū-ji · 7,802 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'aeon-mall-yamato-koriyama', 'shopping', 34.6511572, 135.8022085, 'ChIJFd07sHE6AWARxsINjpGAnlY'),   -- Aeon Mall Yamato-Koriyama · 6,963 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'place-80', 'culture', 34.668586999999995, 135.7843007, 'ChIJn3rdOfw6AWARJwWCcfoiD4c'),   -- วัดยาคุชิจิ · 5,924 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'place-82', 'nature', 34.686507899999995, 135.7942516, 'ChIJFZVuxKM7AWARd4rzIg38E70'),   -- ซากพระราชวังเฮย์โจ · 5,850 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'place-81', 'culture', 34.675561, 135.7848334, 'ChIJ6fd4BwQ7AWARLtqlT3g4xlc'),   -- วัดโทโช ไดจิ · 4,744 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'place-78', 'sight', 34.6792181, 135.6791714, 'ChIJM3sSNdkjAWAR4F-Aqbf3h3M'),   -- สวนสนุกอิโกมะซันโจ · 4,458 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'nara-family', 'shopping', 34.6953125, 135.78523479999998, 'ChIJ0RW5ynY7AWARbRMLtShKA1M'),   -- Nara Family · 4,370 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'isonokami-jingu-shrine', 'culture', 34.5976873, 135.8520589, 'ChIJq4PdIZw2AWARTC8mgdDjfrE'),   -- Isonokami Jingu Shrine · 4,257 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'mi-nara', 'shopping', 34.6850297, 135.8025176, 'ChIJqSusDrE7AWARsOD6zR73MTY'),   -- Mi Nara · 4,179 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'nara-kenko-land', 'sight', 34.5921592, 135.7962614, 'ChIJe7W0hA4xAWARAcO3jYl6Lqo'),   -- Nara Kenko Land · 3,718 รีวิว
  ('e97859c3-757a-4bc8-8da0-90db9cf85967', 'roadside-station-cross-way-nakamachi', 'market', 34.669185000000006, 135.75422, 'ChIJYUMxPwA7AWAR3kmk0Kh_o10'),   -- Roadside Station Cross Way Nakamac · 939 รีวิว
  -- นิกโก้ (Nikko) · 14 แห่ง · อันดับหนึ่ง 34,218 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'place-83', 'culture', 36.7580878, 139.5987466, 'ChIJNSAhU8WmH2ARlA7wenFbUKs'),   -- ศาลเจ้านิกโกโทโช · 34,218 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'place-86', 'culture', 36.75337, 139.60400339999998, 'ChIJI0JCh9amH2AR5y9YEeyfKjk'),   -- สะพานชินเคียว · 10,310 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'place-85', 'sight', 36.80804, 139.71113350000002, 'ChIJWwX5UmufH2AR785TMlSTRLQ'),   -- โทบุเวิลด์สแควร์ · 9,630 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'place-84', 'sight', 36.7908146, 139.6973346, 'ChIJZWyJwnifH2ARoJVAqbtWNBg'),   -- เอโดะ วันเดอร์แลนด์ นิกโก เอโดะมุร · 6,820 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'place-87', 'culture', 36.7584491, 139.5964386, 'ChIJF0MR5MSmH2ARto0YlyRPpLU'),   -- ศาลเจ้านิกโกฟุตะระซัง · 4,886 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'nikko-tamozawa-imperial-villa-memorial-p', 'nature', 36.7525307, 139.59114209999998, 'ChIJCzJYqt2mH2ARUD_73pkGbCM'),   -- Nikko Tamozawa Imperial Villa Memo · 2,439 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'nikko-wanoshiro-onsen-yashio-no-yu', 'sight', 36.7432051, 139.5744239, 'ChIJ1aE1D_ymH2ARNOIVsK2w9iU'),   -- Nikko Wanoshiro Onsen Yashio-no-yu · 2,259 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'nikko-daiyagawa-park', 'nature', 36.7353549, 139.663008, 'ChIJoWPDdZwKH2ARZIhC2I-gPqo'),   -- Nikko Daiyagawa Park · 1,807 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'trick-artopia-nikko', 'culture', 36.7890314, 139.7017086, 'ChIJ3cRxLp2fH2AR8NXC1_Mi_5Q'),   -- Trick Artopia Nikko · 1,494 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'place-88', 'sight', 36.749174499999995, 139.58959869999998, 'ChIJFfI0Q1enH2ARMTHALzNWE4Y'),   -- คันมังงาฟุจิ · 1,174 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'place-90', 'culture', 36.758302799999996, 139.5956096, 'ChIJJUq5YsOmH2ARDWfKwpesiUE'),   -- สุสานไทยูอิน (สุสานโทกูงาวะ อิเอมิ · 1,131 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'place-91', 'sight', 36.788892, 139.6975955, 'ChIJI2ijC4KfH2ARMKxo0sE2q9I'),   -- 巨大迷路パラディアム · 831 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'grill-steak-myogetsubo', 'sight', 36.754094099999996, 139.6038227, 'ChIJrxL9Ps2nH2ARCSFdh50ZVgM'),   -- Grill & Steak Myōgetsubō · 755 รีวิว
  ('6ef83e46-fa5a-43d8-972a-f5bd2f9fc819', 'place-89', 'sight', 36.7801222, 139.62375839999999, 'ChIJi06f8DihH2ARWT_BzVcfG3I'),   -- น้ำตกคิริฟูริ · 607 รีวิว
  -- โอซากะ (Osaka) · 14 แห่ง · อันดับหนึ่ง 155,729 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-92', 'sight', 34.6656768, 135.4323185, 'ChIJXeLVg9DgAGARqlIyMCX-BTY'),   -- ยูนิเวอร์ซัล สตูดิโอส์ เจแปน · 155,729 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-93', 'culture', 34.6872571, 135.5258546, 'ChIJ_TooXM3gAGARQR6hXH3QAQ8'),   -- ปราสาทโอซะกะ · 99,313 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-94', 'sight', 34.6687234, 135.5012971, 'ChIJ_fmKgRPnAGARkKWLtCYTu7g'),   -- โดทงโบะริ · 85,750 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-95', 'sight', 34.6545182, 135.4289645, 'ChIJzakNjPToAGARzCwIriDFg28'),   -- พิพิธภัณฑ์สัตว์น้ำไคยูกัง · 61,112 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-100', 'nature', 34.6864797, 135.5262114, 'ChIJVVVld8ngAGARi9mE-a6e9mc'),   -- สวนปราสาทโอซาก้า · 51,712 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-96', 'viewpoint', 34.6524992, 135.50630580000004, 'ChIJ_0Lgd2DnAGARV0X03lbPy-U'),   -- หอคอยสึเต็งกากุ · 43,325 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-97', 'viewpoint', 34.7052872, 135.4896527, 'ChIJbyd0kIjmAGAR_crecCbjwlc'),   -- ตึกอุเมดะสกาย · 43,252 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'hankyu-umeda-main-store', 'shopping', 34.7028186, 135.4985323, 'ChIJ67mcWJLmAGARrUf0FlFtm7w'),   -- Hankyu Umeda Main Store · 37,478 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-99', 'market', 34.665351099999995, 135.5062417, 'ChIJXSJB5UHnAGARQcEjvngsHaw'),   -- ตลาดคุโรมอนอิจิบะ · 20,936 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-98', 'culture', 34.661559200000006, 135.4967039, 'ChIJQVW9eXLnAGARn-pUdRl0w4A'),   -- ศาลเจ้านัมบะ ยาซากะ · 16,594 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'place-101', 'shopping', 34.6616083, 135.50193489999998, 'ChIJ9RFkRWnnAGARZh-hyWjBhtg'),   -- นัมบะพาร์ค · 15,935 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'don-quijote-dotonbori-store', 'market', 34.6692979, 135.5026443, 'ChIJzTcpYBTnAGARRj0CBKJJsSY'),   -- Don Quijote Dotonbori Store · 10,467 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'shinsaibashi-parco', 'shopping', 34.6738473, 135.5009574, 'ChIJHZ9qxhDnAGARS3udWVQdvD0'),   -- Shinsaibashi PARCO · 4,924 รีวิว
  ('10061625-e3ea-4bf2-91aa-29a283c61c5d', 'lalaport-kadoma-mitsui-outlet-park-osaka', 'shopping', 34.732043, 135.584663, 'ChIJKd-I_i3hAGAR-_k7_4bZJUI'),   -- LaLaport Kadoma / Mitsui Outlet Pa · 4,853 รีวิว
  -- โอตารุ (Otaru) · 14 แห่ง · อันดับหนึ่ง 7,738 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'otaru-aquarium', 'sight', 43.2369305, 141.0119143, 'ChIJhSqlPAUeC18RURQ2LaIFswE'),   -- Otaru Aquarium · 7,738 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'sankaku-market', 'market', 43.199035599999995, 140.99392699999999, 'ChIJ52td3KzhCl8RckhF7-d8tv0'),   -- Sankaku Market · 7,402 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'kamaei-factory-outlet', 'sight', 43.195797999999996, 141.00486899999999, 'ChIJQTIcG07gCl8RMM5h8GKfzuo'),   -- Kamaei Factory Outlet · 7,342 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'otaru-canal-2', 'sight', 43.199041, 141.0021176, 'ChIJ0UxVV2ThCl8RIZdpda0H7gQ'),   -- Otaru Canal · 7,079 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'wing-bay-otaru', 'shopping', 43.183853899999995, 141.0231256, 'ChIJI6m0im_gCl8RcxmXR0M85Ik'),   -- Wing Bay Otaru · 4,952 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'otaru-canal-cruise', 'sight', 43.1999813, 141.0018151, 'ChIJb13VJ03gCl8RCOA9gDK-cUA'),   -- Otaru Canal Cruise · 3,071 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'place-102', 'shopping', 43.1843918, 141.0217126, 'ChIJf58CKWbgCl8R8HE5o2V8RKs'),   -- イオン小樽店 · 2,214 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'tenguyama-ropeway-base-station', 'sight', 43.1776081, 140.9752401, 'ChIJNZSPr8LgCl8R_ro2ttgpg7U'),   -- Tenguyama Ropeway Base Station · 2,098 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'sumiyoshi-shrine', 'culture', 43.182586799999996, 141.0024133, 'ChIJUVD6p_XgCl8RmTD60WTWh3U'),   -- Sumiyoshi Shrine · 1,662 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'otaru-shukutsu-panorama-observation-deck', 'viewpoint', 43.238147399999995, 141.0094517, 'ChIJH4UTrAUeC18RaYdpCXDX98g'),   -- Otaru Shukutsu Panorama Observatio · 1,456 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'otaru-steam-clock', 'sight', 43.1906621, 141.00766579999998, 'ChIJDzxM9lrgCl8RdtyExnqrEUM'),   -- Otaru Steam Clock · 1,199 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'asarigawaonsen-ski-resort', 'sight', 43.143507299999996, 141.0367359, 'ChIJT6GUDkPeCl8R-1OeGk3SGdM'),   -- Asarigawaonsen Ski Resort · 740 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'sakaimachi-street-2', 'sight', 43.191522899999995, 141.0068248, 'ChIJ6XWWhVrgCl8Rf9vktzxsHI0'),   -- Sakaimachi Street · 426 รีวิว
  ('d8efb194-0b19-4cda-b278-9c8e61b5efe5', 'funamizaka', 'sight', 43.1985868, 140.9908862, 'ChIJA_bfiKzhCl8R7xyXduiDFc0'),   -- Funamizaka · 390 รีวิว
  -- ซัปโปโร (Sapporo) · 14 แห่ง · อันดับหนึ่ง 24,896 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'shiroi-koibito-park-2', 'sight', 43.088875099999996, 141.2717042, 'ChIJU8vHZBIoC18RkQEK1Lg8HsI'),   -- Shiroi Koibito Park · 24,896 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'place-104', 'culture', 43.0714671, 141.3689124, 'ChIJ0fYsL4QpC18Ry-fF7_rGYBM'),   -- พิพิธภัณฑ์เบียร์ซัปโปโร · 18,394 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'tanukikoji-shopping-street', 'sight', 43.0572386, 141.352677, 'ChIJyWjcFIMpC18RoRfh7HqDCT4'),   -- Tanukikoji Shopping Street · 17,923 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'place-105', 'culture', 43.062576799999995, 141.3534927, 'ChIJR3JQJ3YpC18R680ES0qomxs'),   -- หอนาฬิกาซัปโปโระ · 17,686 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'place-106', 'viewpoint', 43.06110470000001, 141.3564246, 'ChIJjWSHX50pC18RMSAiw3gaBOI'),   -- ซัปโปโรทีวีทาวเวอร์ · 17,117 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'place-103', 'culture', 43.054333, 141.3077928, 'ChIJk6jwxNwpC18RCNdmWzXijew'),   -- ฮอกไกโด จิงกู · 16,330 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'nijo-market-2', 'market', 43.058299, 141.358446, 'ChIJCb2qW4IpC18R93EsGNFraJI'),   -- Nijo Market · 13,502 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'place-108', 'sight', 43.0515126, 141.3078572, 'ChIJIbbLfcMpC18RJo93WEZMsnQ'),   -- สวนสัตว์มะรุยะมะ ซัปโปโระ · 9,674 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'sapporo-factory', 'shopping', 43.0654276, 141.3624496, 'ChIJr19pU3cpC18RmPBxL9R03GY'),   -- Sapporo Factory · 8,773 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'mega-don-quijote-sapporo-tanukikoji-hont', 'market', 43.0569601, 141.3525636, 'ChIJYasDYuApC18RKhUT7I_KxDY'),   -- MEGA Don Quijote Sapporo Tanukikoj · 8,110 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'place-107', 'shopping', 43.0711702, 141.3702553, 'ChIJf8acrG4pC18RwZ2bF1j9ChA'),   -- อาริโอ ซัปโปโร · 7,682 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'aeon-mall-sapporo-hassamu', 'shopping', 43.0960621, 141.2775757, 'ChIJN85n33AoC18RhEt9DPc6lDs'),   -- AEON MALL Sapporo-Hassamu · 5,830 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'sapporo-parco', 'shopping', 43.058766999999996, 141.353181, 'ChIJyTQqSYMpC18RC-3nJ2LhC5k'),   -- Sapporo PARCO · 4,094 รีวิว
  ('8b80ca6b-a44c-430f-b5f5-565d23a86605', 'mount-moiwa-ropeway-entrance', 'sight', 43.0316221, 141.33309789999998, 'ChIJG4fqNwYqC18Rd5EvgpNdRQ8'),   -- Mount Moiwa Ropeway Entrance · 2,960 รีวิว
  -- ชิราคาวาโกะ (Shirakawa-go) · 14 แห่ง · อันดับหนึ่ง 43,254 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'place-109', 'nature', 36.2577967, 136.9061975, 'ChIJ5yW_trBx-F8R-AVYnbtRxcw'),   -- หมู่บ้านประวัติศาสตร์แห่งชิระงะวะโ · 43,254 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'place-113', 'viewpoint', 36.2630027, 136.90855779999998, 'ChIJ4xHe8r9x-F8RybxsbX5Rr-o'),   -- หอดูดาวเทนชูคาคุ · 5,199 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'place-110', 'viewpoint', 36.2630895, 136.907568, 'ChIJDxg-fLpx-F8RyVt3XGVO1BQ'),   -- จุดชมวิวปราสาทโอกิมาจิ · 4,235 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'place-114', 'culture', 36.259904999999996, 136.907635, 'ChIJdRv_s75x-F8R94Uw560g-iM'),   -- วาดะ เฮาส์ · 3,937 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'place-111', 'culture', 36.2550982, 136.9022991, 'ChIJZS8K5LBx-F8R3iMSHZ_7Tis'),   -- กัสโช-ซึคุริ มินคะเอ็น · 1,852 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'place-112', 'sight', 36.2533788, 136.9018053, 'ChIJ7TqNMLJx-F8RfJRjqtvra6U'),   -- บ้านสามหลังชิราคาวาโกะ · 1,664 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'roadside-station-hida-hakusan', 'sight', 36.174151699999996, 136.9015366, 'ChIJwbfNYgB5-F8Rr3yZiVcCSEE'),   -- Roadside Station Hida Hakusan · 1,512 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'place-115', 'culture', 36.2578216, 136.90705459999998, 'ChIJOZbTy7tx-F8RVTadbZ_7tfg'),   -- คันดะ เฮาส์ · 1,022 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'shirakawa-town-gassho-village', 'sight', 36.2561448, 136.90612249999998, 'ChIJwYiIHQBx-F8RZXxj_PGoXo0'),   -- Shirakawa Town Gassho Village · 473 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'place-116', 'culture', 36.2558125, 136.9066875, 'ChIJ9SgIkbpx-F8RldT2VCFP5aA'),   -- วัดเมียวเซ็นจิ · 403 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'nagase-house', 'sight', 36.257360299999995, 136.9076648, 'ChIJVfFL-wxx-F8RhXRq1bEVAJU'),   -- Nagase House · 244 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'old-toyama-family-residence', 'sight', 36.1553969, 136.9066276, 'ChIJL9GPI5V4-F8RRuGxQwBOuMI'),   -- Old Toyama Family Residence · 188 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'place-117', 'sight', 36.25950770000001, 136.9063472, 'ChIJw1bmZgBx-F8RcuVX-pBiXCE'),   -- 白川郷 · 55 รีวิว
  ('72bfc57c-aa86-4168-9b03-c560d871b62f', 'hakusan-mountain-range-viewing-point', 'sight', 36.2697255, 136.9440447, 'ChIJn05sFztz-F8RhtZm6cNgqL4'),   -- Hakusan Mountain Range Viewing Poi · 49 รีวิว
  -- ทาคายามะ (Takayama) · 14 แห่ง · อันดับหนึ่ง 10,553 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-118', 'market', 36.144704, 137.2579466, 'ChIJE-ywz9a6AmAR1uD5rAwvJkw'),   -- ตลาดเช้ามิยากาวะ · 10,553 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-120', 'culture', 36.1396312, 137.25760449999999, 'ChIJj29EXtm6AmAR4ZH1chH39Zg'),   -- อาคารทากายามะ จินยะ · 9,087 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-119', 'culture', 36.1324902, 137.2350898, 'ChIJmWTYrzm7AmARRPwmwmCypNY'),   -- หมู่บ้านพื้นเมืองฮิดะ · 6,881 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-121', 'culture', 36.1418055, 137.2594747, 'ChIJtTHoaSq7AmARaF-DmjTB2qo'),   -- เขตอนุรักษ์บ้านประวัติศาสตร์ซันมาจ · 5,838 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-126', 'culture', 36.143974799999995, 137.2599215, 'ChIJAQCsnNC6AmARQM58I5hTRj4'),   -- พิพิธภัณฑ์ทาคายามะโชวะคัง · 2,201 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-128', 'culture', 36.1434743, 137.253864, 'ChIJ1Z0MLNa6AmARmuicvjYnotY'),   -- วัดฮิดะโคคุบุงจิ · 2,112 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-125', 'culture', 36.148182399999996, 137.2602971, 'ChIJed--1dO6AmAR6Ca1xs77IPI'),   -- ศาลเจ้าซากุระยามะ ฮาจิมังกู · 1,985 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-124', 'culture', 36.133178799999996, 137.2613871, 'ChIJSTI4s-e6AmARbK7IZM-mgDQ'),   -- ศาลเจ้าฮิเอะ · 1,432 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-122', 'culture', 36.1391025, 137.2598451, 'ChIJg5TjDKO7AmARi_2VPbxE2xE'),   -- พิพิธภัณฑ์ย้อนยุคฮิดาทาคายามะ · 1,422 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-123', 'culture', 36.1413161, 137.2596227, 'ChIJczG1tNu6AmARjrgU-Yh3zH8'),   -- ซันมาจิ ซูจิ · 1,312 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-129', 'sight', 36.140741, 137.2597061, 'ChIJn1cKutu6AmARJa9jdUnCmtI'),   -- โรงกลั่นสาเกฟุนาซากะ · 1,215 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'place-127', 'culture', 36.1561725, 137.2344541, 'ChIJyW0UYb-kAmAR61qcwFCFu60'),   -- พิพิธภัณฑ์ฮิคารุ · 1,190 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'squirrel-forest-hidayama-wild-grass-natu', 'sight', 36.116528699999996, 137.22156139999998, 'ChIJ2_N1Cme7AmARPNG1iUZ1Kcs'),   -- Squirrel Forest Hidayama Wild Gras · 1,112 รีวิว
  ('6fcd2f38-8a0f-4957-bb56-60fca686bf86', 'jinya-mae-morning-markets', 'market', 36.1396447, 137.2582195, 'ChIJj29EXtm6AmARNsKdHGWF8I0'),   -- Jinya-mae Morning Markets · 1,044 รีวิว
  -- โตเกียว (Tokyo) · 14 แห่ง · อันดับหนึ่ง 100,056 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'place-130', 'shopping', 35.6585805, 139.7454329, 'ChIJCewJkL2LGGAR3Qmk0vCTGkg'),   -- โตเกียวทาวเวอร์ · 100,056 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'place-132', 'culture', 35.6763976, 139.6993259, 'ChIJ5SZMmreMGGARcz8QSTiJyo8'),   -- ศาลเจ้าเมจิ · 52,632 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'place-131', 'sight', 35.7056396, 139.75189129999998, 'ChIJ89TugkeMGGARDmSeJIiyWFA'),   -- โตเกียวโดม · 51,144 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'place-136', 'nature', 35.685176299999995, 139.7100517, 'ChIJPyOTG8KMGGARh_IXobWxHmo'),   -- อุทยานแห่งชาติชินจูกุเกียวเอน · 45,609 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'place-134', 'shopping', 35.7289709, 139.7195415, 'ChIJU9ZPE2-NGGARwiJyx0Id61E'),   -- ซันชายน์ซิตี · 35,024 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'place-135', 'nature', 35.685175, 139.75279949999998, 'ChIJTQbYAg2MGGARt22eNwtfGtE'),   -- พระราชวังอิมพีเรียล · 31,535 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'place-137', 'nature', 35.6700649, 139.6949656, 'ChIJMwpiebSMGGARPr_454zHvDQ'),   -- สวนโยโยงิ · 27,481 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'place-133', 'viewpoint', 35.6586719, 139.7019848, 'ChIJ4Rr2JWiLGGARcyRSHuZ-9G8'),   -- ตึกชิบูย่า สกาย · 26,599 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'ginza-six', 'shopping', 35.6697688, 139.76417619999998, 'ChIJAQAsR--LGGAR_AmB8WMDy88'),   -- GINZA SIX · 23,673 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'mega-don-quijote', 'shopping', 35.6603873, 139.6978172, 'ChIJr4J6pKmMGGARdQLOgrzToH4'),   -- MEGA Don Quijote · 22,399 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'place-138', 'culture', 35.696238, 139.5704317, 'ChIJLYwD5TTuGGARBZKEP5BV4U0'),   -- พิพิธภัณฑ์จิบลิ · 19,824 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'the-making-of-harry-potter-warner-bros-s', 'sight', 35.745183, 139.6460909, 'ChIJZzjXkvLtGGARm2YFfi26zoU'),   -- The Making of Harry Potter - Warne · 18,089 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'shibuya-parco', 'shopping', 35.6620484, 139.6987767, 'ChIJcyH-4qiMGGARGzk4lZCx2xo'),   -- Shibuya Parco · 8,309 รีวิว
  ('3ee7f55b-2401-473b-9a0a-c0aa1c807a6a', 'azabudai-hills', 'shopping', 35.6615447, 139.7408302, 'ChIJJSI0QC6LGGARwWmKE3MWmj8'),   -- Azabudai Hills · 7,719 รีวิว
  -- โยโกฮามะ (Yokohama) · 14 แห่ง · อันดับหนึ่ง 49,243 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'place-139', 'sight', 35.4430883, 139.64410010000003, 'ChIJ__-Le-9cGGARNY-CTSHwq5A'),   -- โยโกฮาม่า ไชน่าทาวน์ · 49,243 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'place-140', 'shopping', 35.452632099999995, 139.6428944, 'ChIJSXGAhfhcGGARcz3MKth9lJQ'),   -- โกดังอิฐแดงโยโกฮามะ · 43,751 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'place-141', 'shopping', 35.45495400000001, 139.6313859, 'ChIJEaFmc11cGGARx8g0NQrvYTY'),   -- โยะโกะฮะมะแลนด์มาร์กทาวเวอร์ · 30,730 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'yamashita-park', 'nature', 35.4457655, 139.6497793, 'ChIJt1e7seJcGGARbDdyYvFJuuM'),   -- Yamashita Park · 25,175 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'cup-noodles-museum', 'culture', 35.4554755, 139.63886689999998, 'ChIJ3ZNhe1dcGGARvjq5QHdmaHM'),   -- Cup Noodles Museum · 20,400 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'yokohama-hakkeijima-sea-paradise', 'sight', 35.336458, 139.6452299, 'ChIJTRC2enlBGGARR82PUNymZUE'),   -- Yokohama Hakkeijima Sea Paradise · 19,551 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'shin-yokohama-ramen-museum', 'culture', 35.5099291, 139.61462559999998, 'ChIJNSoA_dNeGGARjAJl8smPb4w'),   -- Shin-Yokohama Ramen Museum · 17,019 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'yokohama-world-porters', 'shopping', 35.453991099999996, 139.6389486, 'ChIJ-fqqvllcGGARA266GZ-xatU'),   -- Yokohama World Porters · 16,762 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'mark-is-minatomirai', 'shopping', 35.4577445, 139.63178399999998, 'ChIJ29nqzUJcGGAR65wFxPgS4dE'),   -- MARK IS Minatomirai · 14,210 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'lalaport-yokohama', 'shopping', 35.517466999999996, 139.5665435, 'ChIJ17i8xGFYGGARkwN0OQiH00g'),   -- LaLaport Yokohama · 13,583 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'zoorasia-yokohama-zoological-gardens', 'nature', 35.4943431, 139.5267465, 'ChIJIaAjG4pXGGARDxUR1zO6CtE'),   -- Zoorasia Yokohama Zoological Garde · 9,866 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'tressa-yokohama', 'shopping', 35.5254349, 139.64578319999998, 'ChIJHc7qhP5eGGAR7covup6QCrA'),   -- TRESSA YOKOHAMA · 8,730 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'mitsui-outlet-park-yokohama-bayside', 'shopping', 35.3798991, 139.6464076, 'ChIJG3bGCKpDGGARfz9tmtdh7mQ'),   -- Mitsui Outlet Park Yokohama Baysid · 8,077 รีวิว
  ('03e25cb2-67f4-4608-a072-e3d2aba6557d', 'yokohama-buntai', 'sight', 35.4410445, 139.6365452, 'ChIJe8wXmEVdGGARDTPn6-o_JQk'),   -- Yokohama Buntai · 1,071 รีวิว
  -- ฮาโกเน่ (Hakone) · 13 แห่ง · อันดับหนึ่ง 19,913 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'place-21', 'culture', 35.2048263, 139.0253782, 'ChIJtcIqzYuYGWARmuDHR2ij5Ko'),   -- ศาลเจ้าฮะโกะเนะ · 19,913 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'place-22', 'culture', 35.2451601, 139.0507271, 'ChIJMfOWowSiGWARX2wK6ac5jlg'),   -- พิพิธภัณฑ์กลางแจ้งฮาโกเนะ · 15,920 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'place-23', 'culture', 35.2662046, 139.0177385, 'ChIJqUsQTwyfGWARsMAxhOkaqAs'),   -- พิพิธภัณฑ์ศิลปะแก้วฮาโกะแนะ เวเนเช · 9,448 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'place-24', 'culture', 35.1923709, 139.02623459999998, 'ChIJ8xdp8WSYGWARRaUVLnalZyM'),   -- ด่านฮาโกเนะ เซกิโชะ · 7,733 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'hakone-sightseeing-cruise', 'sight', 35.189992499999995, 139.0245259, 'ChIJuSzGc2mYGWARcHDoWGHTLws'),   -- Hakone Sightseeing Cruise · 7,469 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'owakudani-2', 'sight', 35.242978099999995, 139.0216292, 'ChIJ15_HHo-fGWARM8GIZNQ6SdA'),   -- Owakudani · 6,821 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'hakone-gora-park', 'nature', 35.2486604, 139.0451918, 'ChIJVVVltv-hGWARRGEjZVZEtqs'),   -- Hakone Gora Park · 5,548 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'place-27', 'sight', 35.2128264, 139.0095977, 'ChIJl1lnt-eYGWARiBLFhuRpi-c'),   -- ฮาโกเนะ-เอ็น · 4,602 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'place-25', 'culture', 35.202783, 139.02574189999999, 'ChIJqwXxBoqYGWAROtwVhyhQS28'),   -- ประตูโทริอิเฮวะ โนะ · 3,643 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'owakudani-kurotamagokan', 'sight', 35.243632, 139.01953609999998, 'ChIJ-czqDkefGWARm7s297P3EIU'),   -- Owakudani Kurotamagokan · 2,935 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'sengokuhara-susuki-grass-fields', 'sight', 35.2592974, 139.00318579999998, 'ChIJE85AbxWfGWARxiYyohXf_lo'),   -- Sengokuhara Susuki Grass Fields · 2,430 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'hakone-ropeway-owakudani-station', 'sight', 35.2444656, 139.0198459, 'ChIJkcetZP-hGWARx7Dm4QUUzO0'),   -- Hakone Ropeway Ōwakudani Station · 1,956 รีวิว
  ('fde1d868-6dfc-4e9e-b643-7790c3e93cb1', 'place-26', 'culture', 35.223847299999996, 138.9995576, 'ChIJ__8vMmOYGWARvBpiPC0j0V8'),   -- ศาลเจ้าคุซึริว ฮองงู · 1,618 รีวิว
  -- เบปปุ (Beppu) · 10 แห่ง · อันดับหนึ่ง 12,459 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'place', 'sight', 33.3168115, 131.4687384, 'ChIJq4-fiLynRjURj0PbI_2JcAw'),   -- อูมิ จิโกกุ · 12,459 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'place-4', 'sight', 33.3163896, 131.4723907, 'ChIJiVukIaOnRjURqERRv0ixdK8'),   -- คามาโดะ จิโกกุ · 11,308 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'place-2', 'sight', 33.32717340000001, 131.4781731, 'ChIJJYAEBIOnRjUR9AeooEwd1ck'),   -- ชิโนอิเกะ จิโกคุ · 11,303 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'beppu-jigoku-hells-of-beppu', 'sight', 33.315883299999996, 131.4696745, 'ChIJOaW8YLmnRjUR8hDZNS3N3Is'),   -- Beppu Jigoku (Hells of Beppu) · 10,590 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'place-3', 'sight', 33.277901199999995, 131.4487593, 'ChIJVVUlMwSmRjURs23KONRTvcg'),   -- กระเช้าลอยฟ้า เบปปุ · 4,682 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'youme-town-beppu', 'shopping', 33.2762149, 131.5075326, 'ChIJQVa2y8SmRjURC98hniCqPZM'),   -- YouMe Town Beppu · 4,416 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'jigokumushikobo-kannawa', 'sight', 33.3154852, 131.4762201, 'ChIJD-MRi6GnRjURhoBsDb8vCX0'),   -- Jigokumushikobo Kannawa · 3,895 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'place-5', 'viewpoint', 33.281771299999996, 131.5059174, 'ChIJi8ZDy_qmRjURqeez0EVPWKw'),   -- เบปปุ ทาวเวอร์ · 2,926 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'beppu-cable-rakutenchi', 'sight', 33.274941, 131.4855361, 'ChIJzwbueIqmRjURoE1bhksVDWU'),   -- Beppu Cable Rakutenchi · 1,997 รีวิว
  ('34f6383c-1587-4ff8-8783-f564ff273ac9', 'global-tower', 'viewpoint', 33.2831944, 131.4861111, 'ChIJlTJlK_emRjURJYjQpSEdaVk'),   -- Global Tower · 1,116 รีวิว
  -- นาฮะ (Naha) · 10 แห่ง · อันดับหนึ่ง 33,890 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'place-74', 'culture', 26.217044899999998, 127.71948330000001, 'ChIJZ9v0bP5r5TQRi0-esrqficA'),   -- ปราสาทชุริ · 33,890 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'naha-kokusai-dori-shopping-street', 'sight', 26.2161467, 127.6880666, 'ChIJ-w8fcHdp5TQR_PlKZmQhehM'),   -- Naha Kokusai Dori Shopping Street · 22,513 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'place-75', 'culture', 26.220736900000002, 127.6711012, 'ChIJdT8KUYVp5TQRrCRV4eFRanc'),   -- ศาลเจ้านามิโนะอุเอะ · 16,250 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'don-quijote-kokusai-dori', 'market', 26.2158634, 127.6878077, 'ChIJNcZYDXpp5TQR022qR4dmEnw'),   -- Don Quijote Kokusai-dori · 11,930 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'tomari-iyumachi-fish-market', 'market', 26.230066299999997, 127.6802558, 'ChIJVVUV2ipq5TQRokk51vsSwDc'),   -- Tomari Iyumachi Fish Market · 9,255 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'san-a-naha-main-place', 'shopping', 26.2252975, 127.69485689999999, 'ChIJFewVGNpr5TQRWa4uFVWLhxk'),   -- San-A Naha Main Place · 8,644 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'dfs', 'shopping', 26.2230667, 127.69726659999999, 'ChIJM39Jsthr5TQRv8Bcs2MMgaQ'),   -- DFS 沖縄 那覇店 · 6,269 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'aeon-naha', 'shopping', 26.1969565, 127.6657676, 'ChIJnyJKV7Fp5TQRHWdGau5JmQk'),   -- AEON Naha · 5,135 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'makishi-public-market', 'market', 26.214592699999997, 127.68830129999999, 'ChIJy1Zdsr9p5TQR2ET-2o69ZKg'),   -- Makishi Public Market · 3,146 รีวิว
  ('df0b1b25-907c-4d6b-a78b-fec55bc255ff', 'kokusai-street-food-village', 'market', 26.216702599999998, 127.690478, 'ChIJp_frzRdp5TQRM21nQKlERjg'),   -- Kokusai Street Food Village · 2,123 รีวิว
  -- คามาคุระ (Kamakura) · 8 แห่ง · อันดับหนึ่ง 32,570 รีวิว
  ('e459340d-bfec-4bbb-967a-4a46b8155a69', 'place-32', 'culture', 35.3168145, 139.53574419999998, 'ChIJBbxJ3_JFGGARTO9rLbCTwx4'),   -- วัดโคโตกูอิง · 32,570 รีวิว
  ('e459340d-bfec-4bbb-967a-4a46b8155a69', 'place-33', 'culture', 35.325985599999996, 139.5563462, 'ChIJiaqQeLhFGGARtTZQEBCtZ6g'),   -- ศาลเจ้าสึรุงะโอะกะ ฮะจิมัง · 29,270 รีวิว
  ('e459340d-bfec-4bbb-967a-4a46b8155a69', 'place-34', 'culture', 35.3124791, 139.5331106, 'ChIJ1SdxB_RFGGAR0a33ulBh61c'),   -- วัดฮาเซเดระ · 17,141 รีวิว
  ('e459340d-bfec-4bbb-967a-4a46b8155a69', 'place-35', 'culture', 35.3256988, 139.5422058, 'ChIJGzWRQZFFGGARFWcKYj7tVK0'),   -- ศาลเจ้าเซเนียรัย เบนเต็น · 7,771 รีวิว
  ('e459340d-bfec-4bbb-967a-4a46b8155a69', 'place-36', 'culture', 35.3199921, 139.5692379, 'ChIJp_fLKC1EGGAR9y7DSRFtdHI'),   -- วัดโฮโคะคุจิ · 5,555 รีวิว
  ('e459340d-bfec-4bbb-967a-4a46b8155a69', 'place-37', 'culture', 35.3349158, 139.551539, 'ChIJQ_5CGqNFGGARbBd_UWNvEkQ'),   -- วัดเมเกซึอิน · 5,251 รีวิว
  ('e459340d-bfec-4bbb-967a-4a46b8155a69', 'place-38', 'culture', 35.331454099999995, 139.5549354, 'ChIJKzB8urtFGGARch6Z2HEqsAo'),   -- วัดเคนโชจิ · 4,756 รีวิว
  ('e459340d-bfec-4bbb-967a-4a46b8155a69', 'place-39', 'culture', 35.324343999999996, 139.53894409999998, 'ChIJUatr75FFGGAR9XHCzJcwZDc')    -- ศาลเจ้าซาสึเกะ อินาริ · 2,432 รีวิว
  ) as v(city_id, slug, cat, lat, lng, gpid)
on conflict do nothing;

-- 🔴 "ผมลงแล้ว" กับ "มันอยู่ในฐานแล้ว" เป็นคนละประโยค — assert ในไฟล์เดียวกัน
do $verify$
declare n int;
begin
  select count(*) into n from public.catalog_places where source = 'google';
  if n < 293 then
    raise exception 'คาดว่าจะมีแถว source=google อย่างน้อย % แถว แต่มี %', 293, n;
  end if;

  -- 🔴 **ถอดเกณฑ์ข้อนี้ออก 4 ก.ย. 2026 — มันผูกกับสภาพ ณ วินาทีที่ไฟล์นี้เป็นไฟล์เดียว**
  --    เดิม: *"ทุกแถว `source=google` ต้องอยู่ในเมืองญี่ปุ่น"* — จริงตอนนั้น
  --    แต่ `…030000`/`…050000` เพิ่มไทย/เกาหลี/เวียดนาม/จีน แล้ว ⇒ **รันซ้ำจะแดงทั้งที่ไม่มีอะไรผิด**
  --    🎯 *เกณฑ์ที่พูดถึงสภาพ **ทั้งระบบ** แทนที่จะพูดถึง **สิ่งที่ไฟล์นี้ทำ***
  --
  -- ⚠️ **ฉบับแก้แรกของผมแย่กว่าเดิม** — ผมเขียนเป็น
  --    `google_place_id in (select gpid from (values ('__none__')) …)` เพื่อจำกัดขอบเขต
  --    ซึ่ง **ไม่มีวันแมตช์อะไรเลย ⇒ เป็น 0 เสมอ ⇒ ด่านที่แดงไม่ได้**
  --    🔴 ***ด่านที่แดงไม่ได้ แย่กว่าไม่มีด่าน — เพราะมันนับเป็นหลักฐานได้***
  --    ⇒ **ถอดทิ้งดีกว่าเก็บของที่หลอกคนอ่าน** · เกณฑ์ข้างล่าง (ญี่ปุ่นต้องมี ≥ N แห่ง)
  --      ยังวัดสิ่งที่ไฟล์นี้ทำได้จริง และแดงเป็นเมื่อ insert ไม่ครบ

  -- ทิศบวกที่ยังใช้ได้: ญี่ปุ่นต้องมีของครบตามที่ไฟล์นี้ใส่ (ดูเกณฑ์ข้างล่าง)

  -- 🔴 ทิศบวก: กันเคสที่ผ่านเพราะ *ไม่มีอะไรให้ตรวจ*
  select count(*) into n from public.catalog_places p
    join public.catalog_cities c on c.id = p.city_id
   where c.country_id = 'jp';
  if n < 357 then
    raise exception 'ญี่ปุ่นควรมีอย่างน้อย % แห่งหลังไฟล์นี้ แต่มี %', 357, n;
  end if;
end $verify$;
