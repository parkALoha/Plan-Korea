-- E6-AC13 · เติม `youtube_query` ให้ 72 สถานที่เดิม — เจ้าของ: P1-Lead · 2 ก.ย. 2026
--
-- ## ทำไมต้องมีก่อนสลับลำดับ resolve
-- `E6-AC13` จะย้าย `PLACES` (สถิตย์) ไป *ท้ายสุด* ของลำดับ resolve เพื่อให้ side-map จากคลังถูกใช้จริง
-- 🔴 **แต่ `youtube_query` ในคลังเป็น null ทุกแถว** — วัดจากไฟล์: ไม่มี migration ใบไหนเขียนค่านี้เลย
--    (`grep -lE "(set|insert into public.catalog_places).*youtube_query"` → **0 ไฟล์**)
-- → สลับตอนนี้ = `cardToPlace` ตกไป `?? nameEn` → **`PlaceDetailModal:268` ฝังวิดีโอด้วยชื่อเปล่า**
--
-- ## 🎯 วัดแล้วว่ามันเสียจริง ไม่ใช่กังวลลอย ๆ — **71 จาก 72 ต่างจาก `nameEn`**
--     nameEn "Hoan Kiem Lake"     →  yt "Hoan Kiem Lake Hanoi walking"
--     nameEn "Hanoi Old Quarter"  →  yt "Hanoi Old Quarter street food walk"
--     nameEn "Hanoi Train Street" →  yt "Hanoi train street 2025"
--   คำค้นพวกนี้ปรับมือ (ใส่ชื่อเมือง · บริบท · ปี) · ตกไป `nameEn` = คนละคุณภาพ **และไม่มีอะไรฟ้อง**
--
-- ## ⚠️ ต่างจาก `20260828120000` (maps_query) ตรงที่ปั้นเองไม่ได้
-- `maps_query` ประกอบจาก *ชื่อ + เมือง* ซึ่งคลังมีครบ → migration นั้นสร้างค่าเองได้
-- **`youtube_query` เป็นของที่คนเขียนด้วยมือ ไม่มีสูตร** → ก้อนนี้จึงเป็น *การย้ายข้อมูล* ไม่ใช่ *การอนุมาน*
-- · ค่าทั้ง 72 ดึงจาก `data/places.ts` ด้วยสคริปต์ **ไม่ได้พิมพ์มือสักตัว** (assert 72 คู่ · slug ไม่ซ้ำ · ไม่มีค่าว่าง)
--
-- ## ขอบเขต
-- · **ไม่แตะแถวที่มี `youtube_query` อยู่แล้ว** → รันซ้ำได้ ไม่ทับของที่ใครตั้งมือ
-- · แถวคลังที่ไม่ได้อยู่ใน 72 นี้ (ญี่ปุ่น/ไทย/เมืองอื่น) **ยังเป็น null ต่อไปโดยตั้งใจ** — ไม่มีค่าที่เขียนมือไว้ให้ย้าย
--   → `cardToPlace` จะตกไป `?? nameEn` ให้กลุ่มนั้น ซึ่ง **ตรงกับที่ custom place ทำอยู่แล้ววันนี้**
--   (`PlaceSidebar.tsx:77` ใช้ `cp.name_th` · `NearbyPlacesModal.tsx:80` ใช้ `r.name`)
--   🎯 **กลุ่มที่เสียคือกลุ่มที่ *เคยมีของดีอยู่แล้ว* เท่านั้น — ก้อนนี้จึงกู้ของเดิม ไม่ได้ยกระดับใคร**

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · คัดลอกทั้งก้อนจาก `20260828120000` ไม่แก้อะไร ────────
do $guard$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ฐานนี้ไม่ใช่ engine-dev ของแพลตฟอร์ม';
  end if;

  -- 🔴 `P-31`: ต้องเช็ค `ref` + `environment` ด้วย · `name` อย่างเดียวแยก dev ออกจาก prod ไม่ได้
  --    วันที่มี prod มันจะชื่อ `plan-korea-platform` เหมือนกันเป๊ะ
  --    ⚠️ **เปลี่ยน ref ตรงนี้ = เจตนาเล็งไปฐานอื่น** ต้องเป็นการตัดสินใจ ไม่ใช่การคัดลอก
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform'
       and ref  = 'pmvxwcimjebogjfimzqy'
       and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;
end $guard$;

do $yt$
declare
  n_before int;
  n_after  int;
  n_target int;
begin
  create temp table _yt(slug text primary key, q text) on commit drop;
  insert into _yt(slug, q) values
    ('hanoi-hoan-kiem', 'Hoan Kiem Lake Hanoi walking'),
    ('hanoi-old-quarter', 'Hanoi Old Quarter street food walk'),
    ('hanoi-ta-hien', 'Ta Hien beer street Hanoi night'),
    ('hanoi-train-street', 'Hanoi train street 2025'),
    ('hanoi-giang-cafe', 'Giang Cafe Hanoi egg coffee'),
    ('hanoi-dong-xuan-night-market', 'Dong Xuan night market Hanoi weekend'),
    ('hanoi-st-joseph', 'St Joseph Cathedral Hanoi'),
    ('hanoi-pho-10', 'Pho 10 Ly Quoc Su Hanoi'),
    ('hanoi-bun-cha-dac-kim', 'Bun Cha Dac Kim Hang Manh Hanoi'),
    ('hanoi-banh-mi-25', 'Banh Mi 25 Hanoi'),
    ('busan-gamcheon', 'Gamcheon Culture Village Busan vlog'),
    ('busan-jagalchi', 'Jagalchi Fish Market Busan vlog'),
    ('busan-bupyeong-biff', 'Bupyeong Kkangtong Market BIFF Square Busan street food'),
    ('busan-jeonpo', 'Jeonpo Cafe Street Busan'),
    ('busan-oryukdo', 'Oryukdo Skywalk Busan'),
    ('busan-gwangalli', 'Gwangalli Beach Busan night'),
    ('busan-blueline-mipo', 'Haeundae Blueline Park Sky Capsule Busan'),
    ('busan-cheongsapo', 'Cheongsapo Daritdol Skywalk Busan Slam Dunk'),
    ('busan-haeundae-beach', 'Haeundae Beach Busan'),
    ('busan-bay101', 'The Bay 101 Busan night view'),
    ('busan-huinnyeoul', 'Huinnyeoul Culture Village Busan'),
    ('busan-yongdusan', 'Busan Tower Yongdusan Park'),
    ('busan-haedong-yonggungsa', 'Haedong Yonggungsa Temple Busan'),
    ('busan-songjeong-beach', 'Songjeong Beach Busan'),
    ('busan-igidae', 'Igidae Coastal Walk Busan'),
    ('busan-seomyeon', '서면 부산 맛집'),
    ('busan-choryang-milmyeon', '초량밀면 부산'),
    ('busan-nampodong', '남포동 광복로 부산'),
    ('busan-hwangnyeongsan', '황령산 전망대 부산 야경'),
    ('busan-cup-and-cup', '컵앤컵 광안리 카페'),
    ('busan-lee-jae-mo-pizza', '이재모피자 부산'),
    ('busan-haeundae-gaya-milmyeon', '해운대 가야밀면'),
    ('busan-tarako-soba', '타라코소바 해운대'),
    ('sokcho-beach', '속초해수욕장 산책'),
    ('sokcho-eye', 'Sokcho Eye Ferris Wheel Korea'),
    ('sokcho-market', 'Sokcho Tourist Fishery Market food'),
    ('sokcho-seoraksan', 'Seoraksan National Park autumn foliage cable car'),
    ('sokcho-abai-village', 'Abai Village Sokcho ferry sundae'),
    ('sokcho-osaek', 'Osaek Seoraksan waterfall trail'),
    ('gangneung-bts-bus-stop', 'BTS bus stop Gangneung Korea'),
    ('gangneung-jumunjin', 'Jumunjin Beach Gangneung'),
    ('gangneung-goblin-breakwater', '주문진 방사제 도깨비 촬영지'),
    ('gangneung-anmok', 'Anmok Coffee Street Gangneung'),
    ('gangneung-jungang-market', '강릉중앙시장 먹거리'),
    ('gangneung-gyeongpo', 'Gyeongpo Beach Gangneung'),
    ('gangneung-ojukheon', 'Ojukheon Gangneung'),
    ('seoul-gyeongbokgung', 'Gyeongbokgung Palace hanbok Seoul'),
    ('seoul-bukchon', 'Bukchon Hanok Village Seoul'),
    ('seoul-hongdae', 'Hongdae Seoul night street performance'),
    ('seoul-yeonnamdong', 'Yeonnam-dong Seoul cafe'),
    ('seoul-myeongdong', 'Myeongdong street food Seoul'),
    ('seoul-myeongdong-kyoja', '명동교자 칼국수'),
    ('seoul-jd-bbq-itaewon', '정든집 이태원 고기집'),
    ('seoul-saemaul-hongdae', '새마을식당 열탄불백 7분김치찌개'),
    ('seoul-yoojung-sikdang', '유정식당 방탄유쌈 BTS'),
    ('seoul-seongsudong', 'Seongsu-dong Seoul cafe district'),
    ('seoul-n-tower', 'N Seoul Tower Namsan night view cable car'),
    ('seoul-insadong', 'Insadong Seoul walking tour'),
    ('seoul-ikseondong', 'Ikseondong Seoul cafe alley'),
    ('seoul-hanboknam', '한복남 경복궁 한복대여'),
    ('seoul-tosokchon', '토속촌 삼계탕 경복궁'),
    ('seoul-the-hyundai', '더현대 서울 사운즈포레스트'),
    ('seoul-yeouido-hangang', '여의도한강공원 라면 돗자리'),
    ('seoul-olive-young-myeongdong', '올리브영 명동타운 쇼핑'),
    ('seoul-dongdaemun-ddp', 'Dongdaemun Design Plaza DDP night'),
    ('suwon-hwaseong', 'Hwaseong Fortress Suwon UNESCO'),
    ('suwon-haenglidan', 'Haenglidan-gil Suwon cafe street'),
    ('suwon-starfield-library', 'Starfield Library Suwon'),
    ('suwon-hwahongmun', 'Hwahongmun Gate Suwon Hwaseong'),
    ('suwon-changnyongmun', '플라잉수원 창룡문 열기구'),
    ('suwon-haenggung', '화성행궁 수원 무예24기'),
    ('suwon-tongdak-street', '수원 통닭거리 진미통닭 용성통닭');

  select count(*) into n_target
    from public.catalog_places p join _yt y on y.slug = p.legacy_slug;

  -- 🔴 ดังถ้าคลังไม่มี slug ที่คาด — **`0 rows updated` เงียบ ๆ อ่านเหมือนสำเร็จ**
  if n_target = 0 then
    raise exception 'ไม่พบ legacy_slug ที่ตรงกับ data/places.ts เลยสักแถว — ฐานนี้ใช่ engine-dev หรือเปล่า';
  end if;

  select count(*) into n_before
    from public.catalog_places p join _yt y on y.slug = p.legacy_slug
   where p.youtube_query is not null;

  update public.catalog_places p
     set youtube_query = y.q, updated_at = now()
    from _yt y
   where y.slug = p.legacy_slug and p.youtube_query is null;

  select count(*) into n_after
    from public.catalog_places p join _yt y on y.slug = p.legacy_slug
   where p.youtube_query is not null;

  raise notice 'youtube_query: ก่อน % · หลัง % · เป้าหมาย %', n_before, n_after, n_target;

  -- 🔴 เกณฑ์เชิงผลลัพธ์ ไม่ใช่ "update ผ่าน" — ทุกแถวที่มี slug ตรงต้องมีค่าครบ
  if n_after <> n_target then
    raise exception 'เหลือ % แถวที่ยังไม่มี youtube_query — ไม่ครบตามเป้า', n_target - n_after;
  end if;
end $yt$;

commit;
