-- ═══════════════════════════════════════════════════════════════════════════
-- E2 (ตกหล่น) — seed คลังจาก `data/*.ts` ลงฐาน: 2 ประเทศ · 6 เมือง · 72 สถานที่ · 216 ชื่อ
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · ผู้ใช้อนุมัติให้ทำเต็ม
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 ทำไมไฟล์นี้เพิ่งมี ทั้งที่ `E2` ปิดไปแล้ว ─────────────────────────────
-- `architecture.md:344` นิยาม `E2` ไว้เองว่ารวม **"catalog TS → DB"**
-- แต่ **ไม่มี AC ข้อไหนของ `E2` ที่วัดว่าข้อมูลถูกโหลดจริง** — AC วัดสคีมา · วัด RLS ·
-- วัด `trip_id` ครบ · วัดว่าสร้างทริปเยอรมนีได้ (ซึ่งใช้คลังที่ *fixture* ยัดเข้าไปเอง)
-- → **ตารางคลังถูกสร้างครบและถูกต้อง แต่ไม่เคยมีข้อมูลจริงสักแถว** และทุกเช็คบ็อกซ์ผ่านหมด
--
-- 🎯 **งานนี้ตกในช่องว่างระหว่าง "คำนิยามของเฟส" กับ "รายการ AC ของเฟส"**
--    ไม่มีใครลืม — มันไม่เคยอยู่ในรายการของใครตั้งแต่แรก
--    · พบเมื่อ 27 ส.ค. ตอน P2 กดปุ่มเพิ่มสถานที่จริงแล้วได้ error · **ไม่ใช่จากการรีวิว**
--
-- ⚠️ **นี่ไม่ใช่ `E7`** — `E7` คือย้าย *ข้อมูลทริปจริง* (จุดแวะ 19 · ตั๋ว 8 ใบ · ที่พัก · checklist)
--    ไฟล์นี้คือ *คลังอ้างอิงสาธารณะ* ซึ่งไม่มีข้อมูลของผู้ใช้เลยสักแถว
--
-- ── ที่มาของข้อมูล ────────────────────────────────────────────────────────
--   สถานที่ 72 แถว + ชื่อ 216 แถว: **สร้างจากโมดูล `data/places.ts` ด้วยสคริปต์ ไม่ได้พิมพ์มือ**
--   (import โมดูลจริงแล้ว escape ด้วยเครื่อง — กันพิมพ์ตกและกันอัญประกาศในข้อความไทย/เวียดนาม)
--   ประเทศ 2 + เมือง 6: เขียนมือ เพราะ `data/` ไม่มีตารางชื่อเมือง/พิกัดเมืองอยู่เลย
--
-- 🔴 **พิกัดเมืองเป็นพิกัดจริงของเมือง ไม่ใช่ค่าเฉลี่ยของสถานที่ในเมือง** — `D54` สั่งไว้ตรง ๆ ว่า
--    พิกัดเมืองเป็น *ข้อมูล* ไม่ใช่ค่าที่คำนวณจากลูก · `cityCenter()` ในโค้ดเดิมเฉลี่ยจากสถานที่
--    ซึ่งจะขยับทุกครั้งที่เพิ่ม/ลบสถานที่ **นั่นคือสิ่งที่ `D54` ปฏิเสธ**
--
-- 🔴 **`locale` ของชื่อท้องถิ่นตามประเทศ ไม่ใช่ `ko` ตายตัว** — ฮานอย 10 แถวเป็น `vi`
--    เกาหลี 62 แถวเป็น `ko` · `data/places.ts` เขียนไว้เองว่า "เกาหลี = 한국어, ฮานอย = tiếng Việt"
--    · ตรงกับ `D75` ที่ `E2-AC4` พิสูจน์ไว้แล้วว่าทริปเยอรมนีต้องไม่มี `ko` โผล่
--
-- ── สิ่งที่ไฟล์นี้ *ไม่* ทำ ────────────────────────────────────────────────
--   ① **ไม่ย้าย `descriptionTh` · `mapsQuery` · `youtubeQuery`** — คลังไม่มีคอลัมน์รับสามตัวนี้
--      **ยังไม่ตัดสินว่าจะเก็บที่ไหน** อย่าอ่านว่า "ย้ายครบแล้ว" · UI ที่ต้องใช้ยังอ่านจาก `data/` เหมือนเดิม
--   ② **ไม่แตะ transfer points** (สนามบิน/สถานี) — `source='transfer'` + `picker_hidden`
--      เป็นก้อนของตัวเอง และ `data/transferPoints.ts` มีเมือง `bangkok`/`hcmc` ที่ยังไม่มีในคลัง
--   ③ **`nav_providers` ปล่อยเป็นค่าว่าง** — เราไม่เรียก Naver/Kakao เลย (`guards.sh` มีด่าน `api-hosts` บังคับ)
--      ใส่ชื่อ provider ที่ไม่ได้ต่อจริง = ทะเบียนที่โกหก
--
-- ── idempotent ────────────────────────────────────────────────────────────
--   ทุก insert เป็น `on conflict do nothing` → รันซ้ำปลอดภัย · และมี **บล็อกยืนยันจำนวนท้ายไฟล์**
--   ที่ raise ถ้าลงไม่ครบ — **seed ที่ลงครึ่งเดียวต้องดัง ไม่ใช่เงียบ**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   delete from public.catalog_place_names where source = 'curated';
--   delete from public.catalog_places where source = 'curated';
--   delete from public.catalog_cities where legacy_slug in ('hanoi','busan','sokcho','gangneung','seoul','suwon');
--   delete from public.catalog_countries where id in ('kr','vn');
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL/DML ทุกบรรทัด ──────
do $guard$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ฐานนี้ไม่ใช่ engine-dev ของแพลตฟอร์ม';
  end if;

  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform'
       and ref  = 'pmvxwcimjebogjfimzqy'
       and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;
end $guard$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. ประเทศ
-- ───────────────────────────────────────────────────────────────────────────
insert into public.catalog_countries (id, name_th, name_en) values
    ('kr', 'เกาหลีใต้', 'South Korea'),
    ('vn', 'เวียดนาม', 'Vietnam')
on conflict (id) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. เมือง — พิกัดจริงของเมือง (D54) ไม่ใช่ค่าเฉลี่ยจากสถานที่
-- ───────────────────────────────────────────────────────────────────────────
insert into public.catalog_cities (country_id, legacy_slug, name_th, name_en, name_local, lat, lng, timezone) values
    ('vn', 'hanoi',     'ฮานอย',  'Hanoi',     'Hà Nội', 21.0278, 105.8342, 'Asia/Ho_Chi_Minh'),
    ('kr', 'busan',     'ปูซาน',  'Busan',     '부산',    35.1796, 129.0756, 'Asia/Seoul'),
    ('kr', 'sokcho',    'ซกโช',   'Sokcho',    '속초',    38.2070, 128.5918, 'Asia/Seoul'),
    ('kr', 'gangneung', 'คังนึง', 'Gangneung', '강릉',    37.7519, 128.8761, 'Asia/Seoul'),
    ('kr', 'seoul',     'โซล',    'Seoul',     '서울',    37.5665, 126.9780, 'Asia/Seoul'),
    ('kr', 'suwon',     'ซูวอน',  'Suwon',     '수원',    37.2636, 127.0286, 'Asia/Seoul')
on conflict (legacy_slug) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. สถานที่ 72 แถว — join เมืองด้วย legacy_slug ไม่ต้องรู้ uuid
-- ───────────────────────────────────────────────────────────────────────────
with src(slug, city_slug, category, lat, lng, address_local) as (
  values
    ('hanoi-hoan-kiem', 'hanoi', 'nature', 21.0287, 105.8524, 'Hồ Hoàn Kiếm, Hoàn Kiếm, Hà Nội, Việt Nam'),
    ('hanoi-old-quarter', 'hanoi', 'market', 21.0338, 105.8501, 'Phố cổ Hà Nội, Hoàn Kiếm, Hà Nội, Việt Nam'),
    ('hanoi-ta-hien', 'hanoi', 'nightlife', 21.0345, 105.8531, 'Tạ Hiện, Phố cổ Hà Nội, Hoàn Kiếm, Hà Nội, Việt Nam'),
    ('hanoi-train-street', 'hanoi', 'viewpoint', 21.0245, 105.8412, '62 P. Phùng Hưng, Hoàn Kiếm, Hà Nội, Việt Nam'),
    ('hanoi-giang-cafe', 'hanoi', 'cafe', 21.0329, 105.8524, '39 P. Nguyễn Hữu Huân, Phố cổ Hà Nội, Hoàn Kiếm, Hà Nội, Việt Nam'),
    ('hanoi-dong-xuan-night-market', 'hanoi', 'market', 21.0383, 105.8497, 'Chợ Đồng Xuân, 23 P. Cầu Đông, Phố cổ Hà Nội, Hoàn Kiếm, Hà Nội 100000, Việt Nam'),
    ('hanoi-st-joseph', 'hanoi', 'culture', 21.0288, 105.8489, '1 P. Nhà Thờ, Phường, Hoàn Kiếm, Hà Nội 100000, Việt Nam'),
    ('hanoi-pho-10', 'hanoi', 'restaurant', 21.0305, 105.8488, '10 P. Lý Quốc Sư, Hàng Trống, Hoàn Kiếm, Hà Nội, Việt Nam'),
    ('hanoi-bun-cha-dac-kim', 'hanoi', 'restaurant', 21.03, 105.8485, '1 Hàng Mành, Hàng Gai, Hoàn Kiếm, Hà Nội, Việt Nam'),
    ('hanoi-banh-mi-25', 'hanoi', 'restaurant', 21.0359, 105.8489, '25 P. Hàng Cá, Hàng Bồ, Hoàn Kiếm, Hà Nội, Việt Nam'),
    ('busan-gamcheon', 'busan', 'culture', 35.0975, 129.0107, '대한민국 부산광역시 사하구 감내2로 203'),
    ('busan-jagalchi', 'busan', 'market', 35.0968, 129.0306, '대한민국 부산광역시 중구 자갈치해안로 52'),
    ('busan-bupyeong-biff', 'busan', 'market', 35.1019, 129.0259, '대한민국 부산광역시 중구 부평1길 39'),
    ('busan-jeonpo', 'busan', 'cafe', 35.1554, 129.0673, '대한민국 부산광역시 부산진구 동천로 92'),
    ('busan-oryukdo', 'busan', 'viewpoint', 35.1007, 129.1244, '대한민국 부산광역시 남구 오륙도로 137'),
    ('busan-gwangalli', 'busan', 'beach', 35.1532, 129.1183, '대한민국 부산광역시 광안리해수욕장'),
    ('busan-blueline-mipo', 'busan', 'nature', 35.1583, 129.1728, '대한민국 부산광역시 해운대구 달맞이길62번길 13'),
    ('busan-cheongsapo', 'busan', 'viewpoint', 35.164, 129.1967, '대한민국 부산광역시 해운대구 중동 산3-9'),
    ('busan-haeundae-beach', 'busan', 'beach', 35.1587, 129.1604, '대한민국 해운대해수욕장'),
    ('busan-bay101', 'busan', 'viewpoint', 35.1566, 129.152, '대한민국 부산광역시 해운대구 동백로 52'),
    ('busan-huinnyeoul', 'busan', 'culture', 35.0783, 129.0453, '대한민국 부산광역시 영도구 영선동4가 1043'),
    ('busan-yongdusan', 'busan', 'viewpoint', 35.1005, 129.0324, '대한민국 부산광역시 중구 용두산길 37-55'),
    ('busan-haedong-yonggungsa', 'busan', 'culture', 35.1885, 129.2233, '대한민국 부산광역시 기장군 용궁길 86'),
    ('busan-songjeong-beach', 'busan', 'beach', 35.1785, 129.2003, '대한민국 송정해수욕장'),
    ('busan-igidae', 'busan', 'nature', 35.1181, 129.1279, '대한민국 부산광역시 남구 용호동 산 129-1'),
    ('busan-seomyeon', 'busan', 'shopping', 35.1578, 129.06, '대한민국 부산광역시 부산진구 중앙대로 지하 730'),
    ('busan-choryang-milmyeon', 'busan', 'restaurant', 35.1174, 129.0406, '대한민국 부산광역시 동구 중앙대로 225'),
    ('busan-nampodong', 'busan', 'shopping', 35.0993, 129.0314, '대한민국 부산광역시 중구 남포동5가 2-6'),
    ('busan-hwangnyeongsan', 'busan', 'viewpoint', 35.1583, 129.0826, '대한민국 부산광역시 남구 황령산로 391-39'),
    ('busan-cup-and-cup', 'busan', 'cafe', 35.1505, 129.1158, '대한민국 부산광역시 수영구 광안해변로 177 4층, 5층'),
    ('busan-lee-jae-mo-pizza', 'busan', 'restaurant', 35.1545, 129.0587, '대한민국 부산광역시 부산진구 중앙대로691번길 5'),
    ('busan-haeundae-gaya-milmyeon', 'busan', 'restaurant', 35.1689, 129.1663, '대한민국 부산광역시 해운대구 좌동순환로 27 가야밀면'),
    ('busan-tarako-soba', 'busan', 'restaurant', 35.1649, 129.1684, '대한민국 부산광역시 해운대구 해운대해변로359번길 27 승훈빌딩 1층'),
    ('sokcho-beach', 'sokcho', 'beach', 38.1905823, 128.603541, '대한민국 강원특별자치도 속초시 청호동 해오름로 186'),
    ('sokcho-eye', 'sokcho', 'viewpoint', 38.1907881, 128.6027924, '대한민국 강원특별자치도 속초시 청호해안길 2'),
    ('sokcho-market', 'sokcho', 'market', 38.2044495, 128.5901534, '대한민국 강원특별자치도 속초시 중앙로147번길 16'),
    ('sokcho-seoraksan', 'sokcho', 'nature', 38.1730998, 128.4890543, '대한민국 강원특별자치도 속초시 설악동 설악산로 1137'),
    ('sokcho-abai-village', 'sokcho', 'market', 38.201966, 128.5940591, '대한민국 속초시 청호동 550-14'),
    ('sokcho-osaek', 'sokcho', 'nature', 38.07775, 128.445645, '대한민국 강원특별자치도 양양군 서면 오색리 481-1'),
    ('gangneung-bts-bus-stop', 'gangneung', 'viewpoint', 37.9123383, 128.8170945, '대한민국 강원특별자치도 강릉시 주문진읍 향호리 8-55'),
    ('gangneung-jumunjin', 'gangneung', 'beach', 37.91, 128.8202778, '대한민국 강릉시 주문진해수욕장'),
    ('gangneung-goblin-breakwater', 'gangneung', 'viewpoint', 37.8798639, 128.8342207, '대한민국 강원특별자치도 강릉시 주문진읍 교항리 81-69'),
    ('gangneung-anmok', 'gangneung', 'cafe', 37.7723486, 128.9476577, '대한민국 강원특별자치도 강릉시 견소동'),
    ('gangneung-jungang-market', 'gangneung', 'market', 37.7539833, 128.8985663, '대한민국 강원특별자치도 강릉시 금성로 21'),
    ('gangneung-gyeongpo', 'gangneung', 'beach', 37.805486, 128.907831, '대한민국 강원특별자치도 강릉시 강문동 산1 경포해변'),
    ('gangneung-ojukheon', 'gangneung', 'culture', 37.7792353, 128.8775226, '대한민국 강원특별자치도 강릉시 율곡로3139번길 24'),
    ('seoul-gyeongbokgung', 'seoul', 'culture', 37.579, 126.977, '대한민국 서울특별시 종로구 사직로 161'),
    ('seoul-bukchon', 'seoul', 'culture', 37.5826, 126.9831, '대한민국 서울특별시 종로구 계동길'),
    ('seoul-hongdae', 'seoul', 'nightlife', 37.5563, 126.9236, '대한민국 서울특별시 마포구 서교동 347-20'),
    ('seoul-yeonnamdong', 'seoul', 'cafe', 37.5636, 126.9246, '대한민국 서울특별시 마포구 연남동'),
    ('seoul-myeongdong', 'seoul', 'shopping', 37.55998, 126.98583, '대한민국 서울특별시 중구 명동'),
    ('seoul-myeongdong-kyoja', 'seoul', 'restaurant', 37.5610151, 126.9860829, '대한민국 서울특별시 중구 퇴계로 129'),
    ('seoul-jd-bbq-itaewon', 'seoul', 'restaurant', 37.5349888, 126.9917697, '대한민국 서울특별시 용산구 이태원로19길 13'),
    ('seoul-saemaul-hongdae', 'seoul', 'restaurant', 37.5561608, 126.9258254, '대한민국 서울특별시 마포구 어울마당로 144'),
    ('seoul-yoojung-sikdang', 'seoul', 'restaurant', 37.5183879, 127.0280767, '대한민국 서울특별시 강남구 도산대로28길 14'),
    ('seoul-seongsudong', 'seoul', 'cafe', 37.5445, 127.0559, '대한민국 서울특별시 성동구 성수이로'),
    ('seoul-n-tower', 'seoul', 'viewpoint', 37.5512, 126.9882, '대한민국 서울특별시 용산구 남산공원길 105'),
    ('seoul-insadong', 'seoul', 'culture', 37.571717, 126.986073, '대한민국 서울특별시 종로구 인사동'),
    ('seoul-ikseondong', 'seoul', 'cafe', 37.5731, 126.9909, '대한민국 서울특별시 종로구 익선동'),
    ('seoul-hanboknam', 'seoul', 'culture', 37.576197, 126.973293, '대한민국 서울특별시 종로구 사직로 133-5'),
    ('seoul-tosokchon', 'seoul', 'restaurant', 37.577779, 126.971591, '대한민국 서울특별시 종로구 자하문로5길 5'),
    ('seoul-the-hyundai', 'seoul', 'shopping', 37.52605, 126.928296, '대한민국 서울특별시 영등포구 여의대로 108'),
    ('seoul-yeouido-hangang', 'seoul', 'nature', 37.526711, 126.934711, '대한민국 서울특별시 영등포구 여의동로 330'),
    ('seoul-olive-young-myeongdong', 'seoul', 'shopping', 37.563946, 126.985162, '대한민국 서울특별시 중구 명동길 53'),
    ('seoul-dongdaemun-ddp', 'seoul', 'nightlife', 37.5665, 127.0092, '대한민국 서울특별시 중구 을지로 281'),
    ('suwon-hwaseong', 'suwon', 'culture', 37.28712, 127.011938, '대한민국 경기도 수원시 장안구 영화동 320-2'),
    ('suwon-haenglidan', 'suwon', 'cafe', 37.285308, 127.012754, '대한민국 경기도 수원시 팔달구 장안동 290-2'),
    ('suwon-starfield-library', 'suwon', 'shopping', 37.287534, 126.991608, '대한민국 경기도 수원시 장안구 수성로 175'),
    ('suwon-hwahongmun', 'suwon', 'viewpoint', 37.2879, 127.0166, '대한민국 경기도 수원시 팔달구 북수동 33-4'),
    ('suwon-changnyongmun', 'suwon', 'viewpoint', 37.287802, 127.025149, '대한민국 경기도 수원시 팔달구 지동 경수대로 697'),
    ('suwon-haenggung', 'suwon', 'culture', 37.281967, 127.013727, '대한민국 경기도 수원시 팔달구 정조로 825'),
    ('suwon-tongdak-street', 'suwon', 'restaurant', 37.279326, 127.01772, '대한민국 경기도 수원시 팔달구 남수동 158-2')
)
insert into public.catalog_places (city_id, legacy_slug, category, source, lat, lng, address_local)
select c.id, s.slug, s.category, 'curated', s.lat, s.lng, s.address_local
  from src s
  join public.catalog_cities c on c.legacy_slug = s.city_slug
on conflict (legacy_slug) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. ชื่อ 216 แถว — city_id เอามาจากแถวพ่อเสมอ (D70 บังคับคีย์คู่)
-- ───────────────────────────────────────────────────────────────────────────
with src(slug, locale, name) as (
  values
    ('hanoi-hoan-kiem', 'th', 'ทะเลสาบฮว่านเกี๋ยม'),
    ('hanoi-hoan-kiem', 'en', 'Hoan Kiem Lake'),
    ('hanoi-hoan-kiem', 'vi', 'Hồ Hoàn Kiếm'),
    ('hanoi-old-quarter', 'th', 'ย่านเมืองเก่า 36 สาย'),
    ('hanoi-old-quarter', 'en', 'Hanoi Old Quarter'),
    ('hanoi-old-quarter', 'vi', 'Phố cổ Hà Nội'),
    ('hanoi-ta-hien', 'th', 'ถนนเบียร์สด ต่าเหี่ยน'),
    ('hanoi-ta-hien', 'en', 'Ta Hien Beer Street'),
    ('hanoi-ta-hien', 'vi', 'Phố Tạ Hiện'),
    ('hanoi-train-street', 'th', 'ถนนรถไฟฮานอย'),
    ('hanoi-train-street', 'en', 'Hanoi Train Street'),
    ('hanoi-train-street', 'vi', 'Cửa vào phố đường tàu'),
    ('hanoi-giang-cafe', 'th', 'กาแฟไข่ Giang Cafe'),
    ('hanoi-giang-cafe', 'en', 'Giang Cafe (Egg Coffee)'),
    ('hanoi-giang-cafe', 'vi', 'Café Giảng'),
    ('hanoi-dong-xuan-night-market', 'th', 'ตลาดกลางคืนด่งซวน'),
    ('hanoi-dong-xuan-night-market', 'en', 'Dong Xuan Night Market'),
    ('hanoi-dong-xuan-night-market', 'vi', 'Chợ Đồng Xuân'),
    ('hanoi-st-joseph', 'th', 'โบสถ์เซนต์โจเซฟ'),
    ('hanoi-st-joseph', 'en', 'St. Joseph''s Cathedral'),
    ('hanoi-st-joseph', 'vi', 'Nhà Thờ Lớn Hà Nội'),
    ('hanoi-pho-10', 'th', 'เฝอ 10 ลี้โก๊วะซือ'),
    ('hanoi-pho-10', 'en', 'Phở 10 Lý Quốc Sư'),
    ('hanoi-pho-10', 'vi', 'Phở 10 Lý Quốc Sư'),
    ('hanoi-bun-cha-dac-kim', 'th', 'บุ๋นจ่า ต่าเกิม'),
    ('hanoi-bun-cha-dac-kim', 'en', 'Bún Chả Đắc Kim'),
    ('hanoi-bun-cha-dac-kim', 'vi', 'Bún Chả Hàng Mành Đắc Kim'),
    ('hanoi-banh-mi-25', 'th', 'บั๋นหมี่ 25'),
    ('hanoi-banh-mi-25', 'en', 'Bánh Mì 25'),
    ('hanoi-banh-mi-25', 'vi', 'Bánh Mì 25'),
    ('busan-gamcheon', 'th', 'หมู่บ้านวัฒนธรรมคัมชอน'),
    ('busan-gamcheon', 'en', 'Gamcheon Culture Village'),
    ('busan-gamcheon', 'ko', '감천문화마을'),
    ('busan-jagalchi', 'th', 'ตลาดปลาจากัลชิ'),
    ('busan-jagalchi', 'en', 'Jagalchi Market'),
    ('busan-jagalchi', 'ko', '자갈치시장'),
    ('busan-bupyeong-biff', 'th', 'ตลาดโบราณปูพย็อง & ย่าน BIFF Square'),
    ('busan-bupyeong-biff', 'en', 'Bupyeong Kkangtong Market & BIFF Square'),
    ('busan-bupyeong-biff', 'ko', '부평깡통시장'),
    ('busan-jeonpo', 'th', 'ถนนสายคาเฟ่จอนโพ'),
    ('busan-jeonpo', 'en', 'Jeonpo Cafe Street'),
    ('busan-jeonpo', 'ko', '전포 카페거리'),
    ('busan-oryukdo', 'th', 'ออรยุกโด สกายวอล์ค'),
    ('busan-oryukdo', 'en', 'Oryukdo Skywalk'),
    ('busan-oryukdo', 'ko', '오륙도 스카이워크'),
    ('busan-gwangalli', 'th', 'หาดควังอัลลี'),
    ('busan-gwangalli', 'en', 'Gwangalli Beach'),
    ('busan-gwangalli', 'ko', '광안리해수욕장'),
    ('busan-blueline-mipo', 'th', 'แฮอึนแด บลูไลน์พาร์ค (สถานีมิโพ)'),
    ('busan-blueline-mipo', 'en', 'Haeundae Blueline Park - Mipo Station'),
    ('busan-blueline-mipo', 'ko', '해운대블루라인파크 미포정거장'),
    ('busan-cheongsapo', 'th', 'สะพานกระจกชองซาโพ'),
    ('busan-cheongsapo', 'en', 'Cheongsapo Daritdol Skywalk'),
    ('busan-cheongsapo', 'ko', '청사포 다릿돌전망대'),
    ('busan-haeundae-beach', 'th', 'หาดแฮอึนแด'),
    ('busan-haeundae-beach', 'en', 'Haeundae Beach'),
    ('busan-haeundae-beach', 'ko', '해운대해수욕장'),
    ('busan-bay101', 'th', 'เดอะเบย์ 101'),
    ('busan-bay101', 'en', 'The Bay 101'),
    ('busan-bay101', 'ko', '더베이101'),
    ('busan-huinnyeoul', 'th', 'หมู่บ้านวัฒนธรรมฮึนยอล'),
    ('busan-huinnyeoul', 'en', 'Huinnyeoul Culture Village'),
    ('busan-huinnyeoul', 'ko', '흰여울문화마을'),
    ('busan-yongdusan', 'th', 'สวนยงดูซาน & หอคอยปูซาน'),
    ('busan-yongdusan', 'en', 'Yongdusan Park & Busan Tower'),
    ('busan-yongdusan', 'ko', '용두산공원'),
    ('busan-haedong-yonggungsa', 'th', 'วัดแฮดงยงกุงซา'),
    ('busan-haedong-yonggungsa', 'en', 'Haedong Yonggungsa Temple'),
    ('busan-haedong-yonggungsa', 'ko', '해동용궁사'),
    ('busan-songjeong-beach', 'th', 'หาดซงจอง'),
    ('busan-songjeong-beach', 'en', 'Songjeong Beach'),
    ('busan-songjeong-beach', 'ko', '송정해수욕장'),
    ('busan-igidae', 'th', 'เส้นทางเดินชายฝั่งอีกีแด'),
    ('busan-igidae', 'en', 'Igidae Coastal Walk'),
    ('busan-igidae', 'ko', '이기대 해안산책로'),
    ('busan-seomyeon', 'th', 'ย่านซอมยอน'),
    ('busan-seomyeon', 'en', 'Seomyeon'),
    ('busan-seomyeon', 'ko', '서면'),
    ('busan-choryang-milmyeon', 'th', 'โชรยางมิลมยอน (บะหมี่เย็นปูซาน)'),
    ('busan-choryang-milmyeon', 'en', 'Choryang Milmyeon'),
    ('busan-choryang-milmyeon', 'ko', '초량밀면'),
    ('busan-nampodong', 'th', 'ย่านนัมโพดง & ถนนควังบกโร'),
    ('busan-nampodong', 'en', 'Nampo-dong & Gwangbok-ro Street'),
    ('busan-nampodong', 'ko', '광복로패션거리'),
    ('busan-hwangnyeongsan', 'th', 'จุดชมวิวฮวังรยองซาน'),
    ('busan-hwangnyeongsan', 'en', 'Hwangnyeongsan Observatory'),
    ('busan-hwangnyeongsan', 'ko', '황령산 관측소'),
    ('busan-cup-and-cup', 'th', 'คาเฟ่ Cup & Cup'),
    ('busan-cup-and-cup', 'en', 'Cup & Cup'),
    ('busan-cup-and-cup', 'ko', '컵앤컵커피'),
    ('busan-lee-jae-mo-pizza', 'th', 'พิซซ่าอีแจโม (สาขาซอมยอนจุงอัง)'),
    ('busan-lee-jae-mo-pizza', 'en', 'Lee Jae Mo Pizza (Seomyeon)'),
    ('busan-lee-jae-mo-pizza', 'ko', '이재모피자 서면중앙점'),
    ('busan-haeundae-gaya-milmyeon', 'th', 'แฮอุนแดกายามิลมยอน (บะหมี่เย็นปูซาน)'),
    ('busan-haeundae-gaya-milmyeon', 'en', 'Haeundae Gaya Milmyeon'),
    ('busan-haeundae-gaya-milmyeon', 'ko', '해운대 가야밀면'),
    ('busan-tarako-soba', 'th', 'ทาราโกะโซบะ (สาขาแฮอุนแด)'),
    ('busan-tarako-soba', 'en', 'Tarako Soba (Haeundae)'),
    ('busan-tarako-soba', 'ko', '타라코소바'),
    ('sokcho-beach', 'th', 'หาดซกโช'),
    ('sokcho-beach', 'en', 'Sokcho Beach'),
    ('sokcho-beach', 'ko', '속초해변'),
    ('sokcho-eye', 'th', 'ชิงช้าสวรรค์ซกโชอาย'),
    ('sokcho-eye', 'en', 'Sokcho Eye'),
    ('sokcho-eye', 'ko', '속초아이 대관람차'),
    ('sokcho-market', 'th', 'ตลาดซกโช (ตลาดนักท่องเที่ยว/ประมง)'),
    ('sokcho-market', 'en', 'Sokcho Tourist & Fishery Market'),
    ('sokcho-market', 'ko', '속초관광수산시장'),
    ('sokcho-seoraksan', 'th', 'อุทยานแห่งชาติซอรัคซาน (โซกงวอน)'),
    ('sokcho-seoraksan', 'en', 'Seoraksan National Park (Sogongwon)'),
    ('sokcho-seoraksan', 'ko', '설악산국립공원'),
    ('sokcho-abai-village', 'th', 'หมู่บ้านอาไบ'),
    ('sokcho-abai-village', 'en', 'Abai Village'),
    ('sokcho-abai-village', 'ko', '아바이마을'),
    ('sokcho-osaek', 'th', 'โอแซ็ก (บ่อน้ำแร่ & น้ำตกซอรัค)'),
    ('sokcho-osaek', 'en', 'Osaek Mineral Spring & Seorak Waterfall Trail'),
    ('sokcho-osaek', 'ko', '오색약수터'),
    ('gangneung-bts-bus-stop', 'th', 'ป้ายรถเมล์วง BTS (หาดฮยังโฮ)'),
    ('gangneung-bts-bus-stop', 'en', 'BTS Bus Stop (Hyanghori Beach)'),
    ('gangneung-bts-bus-stop', 'ko', 'BTS 버스정류장'),
    ('gangneung-jumunjin', 'th', 'หาดจูมุนจิน'),
    ('gangneung-jumunjin', 'en', 'Jumunjin Beach'),
    ('gangneung-jumunjin', 'ko', '주문진해수욕장'),
    ('gangneung-goblin-breakwater', 'th', 'เขื่อนกันคลื่นจูมุนจิน (จุดถ่ายซีรีส์ Goblin)'),
    ('gangneung-goblin-breakwater', 'en', 'Jumunjin Breakwater (Goblin filming location)'),
    ('gangneung-goblin-breakwater', 'ko', '주문진방사제 (도깨비 촬영지)'),
    ('gangneung-anmok', 'th', 'ถนนสายกาแฟหาดอันมก'),
    ('gangneung-anmok', 'en', 'Anmok Coffee Street'),
    ('gangneung-anmok', 'ko', '안목커피거리'),
    ('gangneung-jungang-market', 'th', 'ตลาดจุงอังคังนึง'),
    ('gangneung-jungang-market', 'en', 'Gangneung Jungang Market'),
    ('gangneung-jungang-market', 'ko', '강릉중앙시장'),
    ('gangneung-gyeongpo', 'th', 'หาดคยองโพ & ศาลาคยองโพแด'),
    ('gangneung-gyeongpo', 'en', 'Gyeongpo Beach & Gyeongpodae Pavilion'),
    ('gangneung-gyeongpo', 'ko', '경포해변'),
    ('gangneung-ojukheon', 'th', 'โอจุกฮอน'),
    ('gangneung-ojukheon', 'en', 'Ojukheon'),
    ('gangneung-ojukheon', 'ko', '오죽헌'),
    ('seoul-gyeongbokgung', 'th', 'พระราชวังเคียงบกกุง'),
    ('seoul-gyeongbokgung', 'en', 'Gyeongbokgung Palace'),
    ('seoul-gyeongbokgung', 'ko', '경복궁'),
    ('seoul-bukchon', 'th', 'หมู่บ้านฮันอกบุกชน'),
    ('seoul-bukchon', 'en', 'Bukchon Hanok Village'),
    ('seoul-bukchon', 'ko', '북촌 한옥마을'),
    ('seoul-hongdae', 'th', 'ย่านฮงแด'),
    ('seoul-hongdae', 'en', 'Hongdae'),
    ('seoul-hongdae', 'ko', '홍대거리'),
    ('seoul-yeonnamdong', 'th', 'ยอนนัมดง'),
    ('seoul-yeonnamdong', 'en', 'Yeonnam-dong'),
    ('seoul-yeonnamdong', 'ko', '연남동'),
    ('seoul-myeongdong', 'th', 'ย่านเมียงดง'),
    ('seoul-myeongdong', 'en', 'Myeongdong'),
    ('seoul-myeongdong', 'ko', '명동'),
    ('seoul-myeongdong-kyoja', 'th', 'เมียงดงคโยจา (ร้านคัลกุกซู)'),
    ('seoul-myeongdong-kyoja', 'en', 'Myeongdong Kyoja'),
    ('seoul-myeongdong-kyoja', 'ko', '명동교자 본점'),
    ('seoul-jd-bbq-itaewon', 'th', 'JD BBQ (จองดึนจิบ) — หมูย่างอิแทวอน'),
    ('seoul-jd-bbq-itaewon', 'en', 'JD BBQ'),
    ('seoul-jd-bbq-itaewon', 'ko', '정든집'),
    ('seoul-saemaul-hongdae', 'th', 'แซมาอึลชิกดัง สาขาฮงแดซอกโย (หมูย่าง+แกงกิมจิ 7 นาที)'),
    ('seoul-saemaul-hongdae', 'en', 'Saemaul Sikdang Hongdae Seogyo'),
    ('seoul-saemaul-hongdae', 'ko', '새마을식당 홍대서교점'),
    ('seoul-yoojung-sikdang', 'th', 'ยูจองชิกดัง (ร้านประจำ BTS ยุคเดบิวต์)'),
    ('seoul-yoojung-sikdang', 'en', 'Yoojung Sikdang'),
    ('seoul-yoojung-sikdang', 'ko', '유정식당'),
    ('seoul-seongsudong', 'th', 'ย่านซองซูดง'),
    ('seoul-seongsudong', 'en', 'Seongsu-dong'),
    ('seoul-seongsudong', 'ko', '성수동 카페거리'),
    ('seoul-n-tower', 'th', 'หอคอยเอ็นโซล'),
    ('seoul-n-tower', 'en', 'N Seoul Tower'),
    ('seoul-n-tower', 'ko', 'N서울타워'),
    ('seoul-insadong', 'th', 'อินซาดง'),
    ('seoul-insadong', 'en', 'Insadong'),
    ('seoul-insadong', 'ko', '인사동'),
    ('seoul-ikseondong', 'th', 'อิกซอนดง'),
    ('seoul-ikseondong', 'en', 'Ikseon-dong Hanok Alley'),
    ('seoul-ikseondong', 'ko', '익선동 한옥마을'),
    ('seoul-hanboknam', 'th', 'เช่าชุดฮันบก ฮันบกนัม (สาขาเคียงบกกุง)'),
    ('seoul-hanboknam', 'en', 'Hanboknam Hanbok Rental (Gyeongbokgung)'),
    ('seoul-hanboknam', 'ko', '한복남 경복궁점'),
    ('seoul-tosokchon', 'th', 'โทโซกชน ซัมกเยทัง (ไก่ตุ๋นโสม)'),
    ('seoul-tosokchon', 'en', 'Tosokchon Samgyetang'),
    ('seoul-tosokchon', 'ko', '토속촌 삼계탕'),
    ('seoul-the-hyundai', 'th', 'ห้าง The Hyundai Seoul (ยออีโด)'),
    ('seoul-the-hyundai', 'en', 'The Hyundai Seoul'),
    ('seoul-the-hyundai', 'ko', '더현대 서울'),
    ('seoul-yeouido-hangang', 'th', 'สวนริมแม่น้ำฮันยออีโด'),
    ('seoul-yeouido-hangang', 'en', 'Yeouido Hangang Park'),
    ('seoul-yeouido-hangang', 'ko', '여의도한강공원'),
    ('seoul-olive-young-myeongdong', 'th', 'Olive Young เมียงดงทาวน์ (สาขาแฟล็กชิป)'),
    ('seoul-olive-young-myeongdong', 'en', 'Olive Young Myeongdong Town'),
    ('seoul-olive-young-myeongdong', 'ko', '올리브영 명동 타운'),
    ('seoul-dongdaemun-ddp', 'th', 'ดงแดมุน ดีไซน์พลาซ่า (DDP)'),
    ('seoul-dongdaemun-ddp', 'en', 'Dongdaemun Design Plaza'),
    ('seoul-dongdaemun-ddp', 'ko', '동대문디자인플라자'),
    ('suwon-hwaseong', 'th', 'ป้อมฮวาซ็อง'),
    ('suwon-hwaseong', 'en', 'Hwaseong Fortress'),
    ('suwon-hwaseong', 'ko', '수원화성'),
    ('suwon-haenglidan', 'th', 'ย่านแฮงกุงดง (ถนนคาเฟ่แฮงลีดันกิล)'),
    ('suwon-haenglidan', 'en', 'Haenggung-dong / Haenglidan-gil'),
    ('suwon-haenglidan', 'ko', '행리단길'),
    ('suwon-starfield-library', 'th', 'ห้องสมุดในห้าง Starfield Suwon'),
    ('suwon-starfield-library', 'en', 'Starfield Library Suwon'),
    ('suwon-starfield-library', 'ko', '별마당 도서관 수원 스타필드'),
    ('suwon-hwahongmun', 'th', 'ประตูฮวาฮงมุน & ลำธาร'),
    ('suwon-hwahongmun', 'en', 'Hwahongmun Gate & Stream'),
    ('suwon-hwahongmun', 'ko', '화홍문'),
    ('suwon-changnyongmun', 'th', 'ประตูชางรยงมุน & บอลลูนฟลายอิงซูวอน'),
    ('suwon-changnyongmun', 'en', 'Changnyongmun Gate & Flying Suwon Balloon'),
    ('suwon-changnyongmun', 'ko', '창룡문'),
    ('suwon-haenggung', 'th', 'พระราชวังฮวาซองแฮงกุง'),
    ('suwon-haenggung', 'en', 'Hwaseong Haenggung Palace'),
    ('suwon-haenggung', 'ko', '화성행궁'),
    ('suwon-tongdak-street', 'th', 'ตรอกไก่ทอดซูวอน'),
    ('suwon-tongdak-street', 'en', 'Suwon Tongdak (Fried Chicken) Street'),
    ('suwon-tongdak-street', 'ko', '수원 통닭거리')
)
insert into public.catalog_place_names (place_id, city_id, locale, name, priority, source)
select p.id, p.city_id, s.locale, s.name, 1, 'curated'
  from src s
  join public.catalog_places p on p.legacy_slug = s.slug
on conflict (place_id, locale, priority) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. 🔴 ยืนยันจำนวน — seed ที่ลงไม่ครบต้องดัง ไม่ใช่เงียบ
-- ───────────────────────────────────────────────────────────────────────────
do $verify$
declare
  n_country int; n_city int; n_place int; n_name int; n_orphan int;
begin
  select count(*) into n_country from public.catalog_countries where id in ('kr','vn');
  select count(*) into n_city    from public.catalog_cities
   where legacy_slug in ('hanoi','busan','sokcho','gangneung','seoul','suwon');
  select count(*) into n_place   from public.catalog_places where source = 'curated';
  select count(*) into n_name    from public.catalog_place_names where source = 'curated';

  if n_country <> 2 then raise exception 'ประเทศลงไม่ครบ: % ไม่ใช่ 2', n_country; end if;
  if n_city    <> 6 then raise exception 'เมืองลงไม่ครบ: % ไม่ใช่ 6', n_city; end if;
  if n_place   <> 72 then raise exception 'สถานที่ลงไม่ครบ: % ไม่ใช่ 72', n_place; end if;
  if n_name    <> 216 then raise exception 'ชื่อลงไม่ครบ: % ไม่ใช่ 216', n_name; end if;

  -- 🔴 ตัวที่จับ "join พลาดเงียบ ๆ" — สถานที่ที่ไม่มีชื่อภาษาไทยเลยสักแถว
  select count(*) into n_orphan
    from public.catalog_places p
   where p.source = 'curated'
     and not exists (
       select 1 from public.catalog_place_names n
        where n.place_id = p.id and n.locale = 'th'
     );
  if n_orphan <> 0 then raise exception 'มีสถานที่ % แถวที่ไม่มีชื่อภาษาไทย — join ผิด', n_orphan; end if;
end $verify$;

commit;
