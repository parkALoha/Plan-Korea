-- ═══════════════════════════════════════════════════════════════════════════
-- E2 (ขยายขอบเขต · ต่อจาก `20260827233000`) — seed สถานที่ญี่ปุ่น 57 แห่ง
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ช่องว่างที่ไฟล์นี้ปิด ─────────────────────────────────────────────────
-- `20260827233000` ลงเมืองญี่ปุ่น 22 + สนามบิน 7 แล้ว **แต่ไม่มีสถานที่เที่ยวสักแห่ง**
-- สำรวจฐานหลัง push วันนี้:
--   TH  เมือง  1 · สถานที่   1  {transfer:1}          ← เที่ยว 0
--   JP  เมือง 22 · สถานที่   7  {transfer:7}          ← เที่ยว 0
--   KR  เมือง  5 · สถานที่  74  {เที่ยว/กิน:62, transfer:12}
--   VN  เมือง  2 · สถานที่  12  {เที่ยว/กิน:10, transfer:2}
--
-- 🎯 **สภาพนั้นไม่ใช่ "ข้อมูลน้อย" — มันคือฟีเจอร์ที่กดแล้วว่าง** สร้างทริปโตเกียวได้
--    เลือกวันได้ ใส่สนามบินได้ แล้วกด "เพิ่มสถานที่" เจอลิสต์เปล่า โดยไม่มีอะไรบอกว่าทำไม
--    (P8 มินท์ `E4-AC7` ให้เรื่องนี้แล้วใน `d2d5eed`) · ไฟล์นี้ปิดฝั่งญี่ปุ่น · **ไทยยังเหลือ ทำแยกไฟล์**
--
-- ── สิ่งที่เลือก และเหตุผลของการเลือก ────────────────────────────────────
--   ① **ทั้ง 22 เมืองต้องมีอย่างน้อย 1 แห่ง** — บล็อกยืนยันข้างล่างบังคับข้อนี้
--      เมืองที่เลือกได้ในฟอร์มสร้างทริป แต่กดเข้าไปแล้วว่าง **แย่กว่าไม่มีเมืองนั้นให้เลือก**
--   ② เลือกจากที่คนไทยไปจริง ไม่ใช่ "อันดับความดัง" — โตเกียว 12 · เกียวโต 8 · โอซากะ 7
--      แล้วเมืองรองเมืองละ 1–4 · ไม่ถ่วงให้เท่ากันเพราะการเดินทางจริงไม่เท่ากัน
--   ③ **`weather_sensitivity` ใส่เฉพาะที่รู้จริง** — ไฟล์ `20260825134043` เขียนเตือนไว้เองว่า
--      *"ห้ามเดาจากหมวด — `culture` เป็นได้ทั้งสามค่า"* · จริงในชุดนี้: วัดโทไดจิ/ปราสาทโอซากะ
--      เป็น `mixed` (เดินกลางแจ้งแล้วเข้าอาคาร) แต่ศาลเจ้าฟูชิมิอินาริเป็น `outdoor` ล้วน
--      **หมวดเดียวกัน ค่าต่างกัน** · teamLab Planets เป็น `indoor` ทั้งที่หมวด `sight`
--   ④ **`address_local` ปล่อยว่างทั้งชุด** — ต่างจากชุดเกาหลี/สนามบินที่มีที่อยู่จริง
--      🔴 **ที่อยู่ที่ผิด แย่กว่าไม่มีที่อยู่** โดยเฉพาะที่ที่มันถูกออกแบบมาให้ใช้ (`D55`:
--      *"บนแท็กซี่ ที่อยู่ใช้ได้ดีกว่าชื่อร้าน"*) — ที่อยู่ผิดบนแท็กซี่คือพาไปผิดที่
--      · lat/lng ถูกต้องพอสำหรับนำทาง · เติมที่อยู่ทีหลังได้ **แต่ต้องเติมจากแหล่งจริง ไม่ใช่จากความจำ**
--   ⑤ locale ท้องถิ่น = **`ja`** ไม่ใช่ `ko` (เกือบพลาดรูปนี้ตอน `20260827170000`)
--
-- ── ⚠️ ไม่มีร้านอาหารสักร้าน ────────────────────────────────────────────
--   ชุดเกาหลีมี `restaurant` 13 แห่ง ชุดนี้ 0 · **ตั้งใจ** — ร้านอาหารเปลี่ยน/ปิดเร็วที่สุดในคลัง
--   และเป็นของที่ผู้ใช้อยากเพิ่มเองมากที่สุด (เส้น custom place · `AC10`) · ไม่ใช่ของที่ลืม
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   🔴 **ห้ามลบด้วย `where source = 'curated'`** — `'curated'` เป็นค่า DEFAULT ของคอลัมน์
--      fixture ทุกแถวที่ตกค้างก็เป็น `'curated'` เหมือนกันหมด (ฐาน dev มี ~700 แถว)
--      ลบด้วย slug ที่ไฟล์นี้เป็นคนเขียนเท่านั้น:
--   delete from public.catalog_place_names cn using public.catalog_places p
--    where cn.place_id = p.id and p.legacy_slug in (<slug ทั้ง 57 ตัวข้างล่าง>);
--   delete from public.catalog_places where legacy_slug in (<slug ทั้ง 57 ตัวข้างล่าง>);
-- ═══════════════════════════════════════════════════════════════════════════

begin;

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
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- ── รายการที่ตั้งใจ seed — พักไว้ก่อน แล้วนับด้วยการ join ──────────────────
create temporary table _jp (
  slug text primary key, city_slug text not null, category text not null,
  weather text, lat double precision not null, lng double precision not null
) on commit drop;

insert into _jp (slug, city_slug, category, weather, lat, lng) values
    ('sensoji', 'tokyo', 'culture', 'outdoor', 35.7148, 139.7967),
    ('shibuya-crossing', 'tokyo', 'sight', 'outdoor', 35.6595, 139.7005),
    ('tokyo-skytree', 'tokyo', 'viewpoint', 'indoor', 35.7101, 139.8107),
    ('shinjuku-gyoen', 'tokyo', 'nature', 'outdoor', 35.6852, 139.71),
    ('meiji-jingu', 'tokyo', 'culture', 'outdoor', 35.6764, 139.6993),
    ('tsukiji-outer-market', 'tokyo', 'market', 'mixed', 35.6654, 139.7707),
    ('akihabara', 'tokyo', 'shopping', 'mixed', 35.6984, 139.7731),
    ('ueno-park', 'tokyo', 'nature', 'outdoor', 35.7148, 139.7737),
    ('tokyo-tower', 'tokyo', 'viewpoint', 'indoor', 35.6586, 139.7454),
    ('teamlab-planets', 'tokyo', 'sight', 'indoor', 35.6497, 139.7906),
    ('shibuya-sky', 'tokyo', 'viewpoint', 'mixed', 35.658, 139.7016),
    ('takeshita-street', 'tokyo', 'shopping', 'outdoor', 35.6712, 139.7065),
    ('fushimi-inari', 'kyoto', 'culture', 'outdoor', 34.9671, 135.7727),
    ('kiyomizu-dera', 'kyoto', 'culture', 'outdoor', 34.9949, 135.785),
    ('kinkaku-ji', 'kyoto', 'culture', 'outdoor', 35.0394, 135.7292),
    ('arashiyama-bamboo', 'kyoto', 'nature', 'outdoor', 35.017, 135.6716),
    ('gion', 'kyoto', 'sight', 'outdoor', 35.0036, 135.7752),
    ('nishiki-market', 'kyoto', 'market', 'mixed', 35.005, 135.7649),
    ('ginkaku-ji', 'kyoto', 'culture', 'outdoor', 35.027, 135.7982),
    ('philosophers-path', 'kyoto', 'nature', 'outdoor', 35.027, 135.7947),
    ('dotonbori', 'osaka', 'nightlife', 'outdoor', 34.6687, 135.5013),
    ('osaka-castle', 'osaka', 'culture', 'mixed', 34.6873, 135.5262),
    ('universal-studios-japan', 'osaka', 'sight', 'outdoor', 34.6654, 135.4323),
    ('shinsaibashi', 'osaka', 'shopping', 'mixed', 34.6723, 135.501),
    ('kuromon-market', 'osaka', 'market', 'mixed', 34.6653, 135.506),
    ('umeda-sky', 'osaka', 'viewpoint', 'mixed', 34.7052, 135.4901),
    ('tsutenkaku', 'osaka', 'viewpoint', 'indoor', 34.6524, 135.5063),
    ('nara-park', 'nara', 'nature', 'outdoor', 34.6851, 135.843),
    ('todai-ji', 'nara', 'culture', 'mixed', 34.6889, 135.8398),
    ('odori-park', 'sapporo', 'nature', 'outdoor', 43.059, 141.3506),
    ('susukino', 'sapporo', 'nightlife', 'mixed', 43.0554, 141.3529),
    ('nijo-market', 'sapporo', 'market', 'mixed', 43.0578, 141.355),
    ('shiroi-koibito-park', 'sapporo', 'sight', 'mixed', 43.0896, 141.2707),
    ('otaru-canal', 'otaru', 'sight', 'outdoor', 43.1988, 140.9946),
    ('sakaimachi-street', 'otaru', 'shopping', 'outdoor', 43.193, 140.9977),
    ('owakudani', 'hakone', 'nature', 'outdoor', 35.2447, 139.0197),
    ('hakone-shrine', 'hakone', 'culture', 'outdoor', 35.2048, 139.0257),
    ('canal-city-hakata', 'fukuoka', 'shopping', 'indoor', 33.5897, 130.4113),
    ('ohori-park', 'fukuoka', 'nature', 'outdoor', 33.586, 130.3789),
    ('dazaifu-tenmangu', 'fukuoka', 'culture', 'outdoor', 33.5215, 130.5348),
    ('nagoya-castle', 'nagoya', 'culture', 'mixed', 35.1856, 136.8997),
    ('osu-shopping', 'nagoya', 'shopping', 'mixed', 35.1595, 136.9006),
    ('hiroshima-peace-park', 'hiroshima', 'culture', 'outdoor', 34.3955, 132.4536),
    ('itsukushima-shrine', 'hiroshima', 'culture', 'outdoor', 34.2959, 132.3197),
    ('kenrokuen', 'kanazawa', 'nature', 'outdoor', 36.562, 136.6626),
    ('higashi-chaya', 'kanazawa', 'sight', 'outdoor', 36.572, 136.6668),
    ('takayama-old-town', 'takayama', 'sight', 'outdoor', 36.1416, 137.261),
    ('shirakawago-village', 'shirakawago', 'sight', 'outdoor', 36.2578, 136.9063),
    ('beppu-jigoku', 'beppu', 'nature', 'outdoor', 33.3181, 131.4747),
    ('nikko-toshogu', 'nikko', 'culture', 'outdoor', 36.7581, 139.5989),
    ('kotoku-in', 'kamakura', 'culture', 'outdoor', 35.3167, 139.5361),
    ('kokusai-dori', 'naha', 'shopping', 'outdoor', 26.2148, 127.687),
    ('kobe-harborland', 'kobe', 'sight', 'outdoor', 34.6795, 135.181),
    ('farm-tomita', 'furano', 'nature', 'outdoor', 43.4181, 142.4093),
    ('mount-hakodate', 'hakodate', 'viewpoint', 'outdoor', 41.7594, 140.704),
    ('glover-garden', 'nagasaki', 'sight', 'outdoor', 32.734, 129.8703),
    ('minato-mirai', 'yokohama', 'sight', 'outdoor', 35.4573, 139.6317);

create temporary table _jpn (
  slug text not null, locale text not null, priority int not null, name text not null,
  primary key (slug, locale, priority)
) on commit drop;

insert into _jpn (slug, locale, priority, name) values
    ('sensoji', 'th', 1, 'วัดอาซากุสะ (เซนโซจิ)'),
    ('sensoji', 'en', 1, 'Sensō-ji'),
    ('sensoji', 'ja', 1, '浅草寺'),
    ('shibuya-crossing', 'th', 1, 'สี่แยกชิบูย่า'),
    ('shibuya-crossing', 'en', 1, 'Shibuya Scramble Crossing'),
    ('shibuya-crossing', 'ja', 1, '渋谷スクランブル交差点'),
    ('tokyo-skytree', 'th', 1, 'โตเกียวสกายทรี'),
    ('tokyo-skytree', 'en', 1, 'Tokyo Skytree'),
    ('tokyo-skytree', 'ja', 1, '東京スカイツリー'),
    ('shinjuku-gyoen', 'th', 1, 'สวนชินจูกุเกียวเอ็น'),
    ('shinjuku-gyoen', 'en', 1, 'Shinjuku Gyoen'),
    ('shinjuku-gyoen', 'ja', 1, '新宿御苑'),
    ('meiji-jingu', 'th', 1, 'ศาลเจ้าเมจิ'),
    ('meiji-jingu', 'en', 1, 'Meiji Jingu'),
    ('meiji-jingu', 'ja', 1, '明治神宮'),
    ('tsukiji-outer-market', 'th', 1, 'ตลาดนอกสึกิจิ'),
    ('tsukiji-outer-market', 'en', 1, 'Tsukiji Outer Market'),
    ('tsukiji-outer-market', 'ja', 1, '築地場外市場'),
    ('akihabara', 'th', 1, 'อากิฮาบาระ'),
    ('akihabara', 'en', 1, 'Akihabara'),
    ('akihabara', 'ja', 1, '秋葉原'),
    ('ueno-park', 'th', 1, 'สวนอุเอโนะ'),
    ('ueno-park', 'en', 1, 'Ueno Park'),
    ('ueno-park', 'ja', 1, '上野公園'),
    ('tokyo-tower', 'th', 1, 'โตเกียวทาวเวอร์'),
    ('tokyo-tower', 'en', 1, 'Tokyo Tower'),
    ('tokyo-tower', 'ja', 1, '東京タワー'),
    ('teamlab-planets', 'th', 1, 'teamLab Planets'),
    ('teamlab-planets', 'en', 1, 'teamLab Planets'),
    ('teamlab-planets', 'ja', 1, 'チームラボプラネッツ'),
    ('shibuya-sky', 'th', 1, 'ชิบูย่าสกาย'),
    ('shibuya-sky', 'en', 1, 'Shibuya Sky'),
    ('shibuya-sky', 'ja', 1, '渋谷スカイ'),
    ('takeshita-street', 'th', 1, 'ถนนทาเคชิตะ (ฮาราจูกุ)'),
    ('takeshita-street', 'en', 1, 'Takeshita Street'),
    ('takeshita-street', 'ja', 1, '竹下通り'),
    ('fushimi-inari', 'th', 1, 'ศาลเจ้าฟูชิมิอินาริ'),
    ('fushimi-inari', 'en', 1, 'Fushimi Inari Taisha'),
    ('fushimi-inari', 'ja', 1, '伏見稲荷大社'),
    ('kiyomizu-dera', 'th', 1, 'วัดคิโยมิสึ'),
    ('kiyomizu-dera', 'en', 1, 'Kiyomizu-dera'),
    ('kiyomizu-dera', 'ja', 1, '清水寺'),
    ('kinkaku-ji', 'th', 1, 'วัดทอง (คินคะคุจิ)'),
    ('kinkaku-ji', 'en', 1, 'Kinkaku-ji'),
    ('kinkaku-ji', 'ja', 1, '金閣寺'),
    ('arashiyama-bamboo', 'th', 1, 'ป่าไผ่อาราชิยามะ'),
    ('arashiyama-bamboo', 'en', 1, 'Arashiyama Bamboo Grove'),
    ('arashiyama-bamboo', 'ja', 1, '嵐山竹林の小径'),
    ('gion', 'th', 1, 'ย่านกิออน'),
    ('gion', 'en', 1, 'Gion'),
    ('gion', 'ja', 1, '祇園'),
    ('nishiki-market', 'th', 1, 'ตลาดนิชิกิ'),
    ('nishiki-market', 'en', 1, 'Nishiki Market'),
    ('nishiki-market', 'ja', 1, '錦市場'),
    ('ginkaku-ji', 'th', 1, 'วัดเงิน (กินคะคุจิ)'),
    ('ginkaku-ji', 'en', 1, 'Ginkaku-ji'),
    ('ginkaku-ji', 'ja', 1, '銀閣寺'),
    ('philosophers-path', 'th', 1, 'ทางเดินนักปรัชญา'),
    ('philosophers-path', 'en', 1, 'Philosopher''s Path'),
    ('philosophers-path', 'ja', 1, '哲学の道'),
    ('dotonbori', 'th', 1, 'โดทงโบริ'),
    ('dotonbori', 'en', 1, 'Dotonbori'),
    ('dotonbori', 'ja', 1, '道頓堀'),
    ('osaka-castle', 'th', 1, 'ปราสาทโอซากะ'),
    ('osaka-castle', 'en', 1, 'Osaka Castle'),
    ('osaka-castle', 'ja', 1, '大阪城'),
    ('universal-studios-japan', 'th', 1, 'ยูนิเวอร์แซลสตูดิโอเจแปน'),
    ('universal-studios-japan', 'en', 1, 'Universal Studios Japan'),
    ('universal-studios-japan', 'ja', 1, 'ユニバーサル・スタジオ・ジャパン'),
    ('shinsaibashi', 'th', 1, 'ชินไซบาชิ'),
    ('shinsaibashi', 'en', 1, 'Shinsaibashi'),
    ('shinsaibashi', 'ja', 1, '心斎橋'),
    ('kuromon-market', 'th', 1, 'ตลาดคุโรมง'),
    ('kuromon-market', 'en', 1, 'Kuromon Ichiba Market'),
    ('kuromon-market', 'ja', 1, '黒門市場'),
    ('umeda-sky', 'th', 1, 'ตึกอุเมดะสกาย'),
    ('umeda-sky', 'en', 1, 'Umeda Sky Building'),
    ('umeda-sky', 'ja', 1, '梅田スカイビル'),
    ('tsutenkaku', 'th', 1, 'หอคอยสึเทนคาคุ'),
    ('tsutenkaku', 'en', 1, 'Tsutenkaku'),
    ('tsutenkaku', 'ja', 1, '通天閣'),
    ('nara-park', 'th', 1, 'สวนกวางนารา'),
    ('nara-park', 'en', 1, 'Nara Park'),
    ('nara-park', 'ja', 1, '奈良公園'),
    ('todai-ji', 'th', 1, 'วัดโทไดจิ'),
    ('todai-ji', 'en', 1, 'Tōdai-ji'),
    ('todai-ji', 'ja', 1, '東大寺'),
    ('odori-park', 'th', 1, 'สวนโอโดริ'),
    ('odori-park', 'en', 1, 'Odori Park'),
    ('odori-park', 'ja', 1, '大通公園'),
    ('susukino', 'th', 1, 'ซูซูกิโนะ'),
    ('susukino', 'en', 1, 'Susukino'),
    ('susukino', 'ja', 1, 'すすきの'),
    ('nijo-market', 'th', 1, 'ตลาดนิโจ'),
    ('nijo-market', 'en', 1, 'Nijo Market'),
    ('nijo-market', 'ja', 1, '二条市場'),
    ('shiroi-koibito-park', 'th', 1, 'สวนชิโรอิโคอิบิโตะ'),
    ('shiroi-koibito-park', 'en', 1, 'Shiroi Koibito Park'),
    ('shiroi-koibito-park', 'ja', 1, '白い恋人パーク'),
    ('otaru-canal', 'th', 1, 'คลองโอตารุ'),
    ('otaru-canal', 'en', 1, 'Otaru Canal'),
    ('otaru-canal', 'ja', 1, '小樽運河'),
    ('sakaimachi-street', 'th', 1, 'ถนนซาไกมาจิ'),
    ('sakaimachi-street', 'en', 1, 'Sakaimachi Street'),
    ('sakaimachi-street', 'ja', 1, '堺町通り'),
    ('owakudani', 'th', 1, 'โอวาคุดานิ'),
    ('owakudani', 'en', 1, 'Owakudani'),
    ('owakudani', 'ja', 1, '大涌谷'),
    ('hakone-shrine', 'th', 1, 'ศาลเจ้าฮาโกเน่'),
    ('hakone-shrine', 'en', 1, 'Hakone Shrine'),
    ('hakone-shrine', 'ja', 1, '箱根神社'),
    ('canal-city-hakata', 'th', 1, 'คาแนลซิตี้ ฮากาตะ'),
    ('canal-city-hakata', 'en', 1, 'Canal City Hakata'),
    ('canal-city-hakata', 'ja', 1, 'キャナルシティ博多'),
    ('ohori-park', 'th', 1, 'สวนโอโฮริ'),
    ('ohori-park', 'en', 1, 'Ohori Park'),
    ('ohori-park', 'ja', 1, '大濠公園'),
    ('dazaifu-tenmangu', 'th', 1, 'ศาลเจ้าดาไซฟุเท็นมังกู'),
    ('dazaifu-tenmangu', 'en', 1, 'Dazaifu Tenmangū'),
    ('dazaifu-tenmangu', 'ja', 1, '太宰府天満宮'),
    ('nagoya-castle', 'th', 1, 'ปราสาทนาโกย่า'),
    ('nagoya-castle', 'en', 1, 'Nagoya Castle'),
    ('nagoya-castle', 'ja', 1, '名古屋城'),
    ('osu-shopping', 'th', 1, 'ย่านช้อปปิ้งโอสึ'),
    ('osu-shopping', 'en', 1, 'Osu Shopping District'),
    ('osu-shopping', 'ja', 1, '大須商店街'),
    ('hiroshima-peace-park', 'th', 1, 'สวนสันติภาพฮิโรชิมะ'),
    ('hiroshima-peace-park', 'en', 1, 'Hiroshima Peace Memorial Park'),
    ('hiroshima-peace-park', 'ja', 1, '広島平和記念公園'),
    ('itsukushima-shrine', 'th', 1, 'ศาลเจ้าอิสึกุชิมะ (มิยาจิมะ)'),
    ('itsukushima-shrine', 'en', 1, 'Itsukushima Shrine'),
    ('itsukushima-shrine', 'ja', 1, '厳島神社'),
    ('kenrokuen', 'th', 1, 'สวนเคนโรคุเอ็น'),
    ('kenrokuen', 'en', 1, 'Kenroku-en'),
    ('kenrokuen', 'ja', 1, '兼六園'),
    ('higashi-chaya', 'th', 1, 'ย่านฮิงาชิชายะ'),
    ('higashi-chaya', 'en', 1, 'Higashi Chaya District'),
    ('higashi-chaya', 'ja', 1, 'ひがし茶屋街'),
    ('takayama-old-town', 'th', 1, 'เมืองเก่าทาคายามะ'),
    ('takayama-old-town', 'en', 1, 'Takayama Old Town'),
    ('takayama-old-town', 'ja', 1, '高山古い町並み'),
    ('shirakawago-village', 'th', 1, 'หมู่บ้านชิราคาวาโกะ'),
    ('shirakawago-village', 'en', 1, 'Shirakawa-gō Historic Village'),
    ('shirakawago-village', 'ja', 1, '白川郷合掌造り集落'),
    ('beppu-jigoku', 'th', 1, 'บ่อนรกเบปปุ'),
    ('beppu-jigoku', 'en', 1, 'Beppu Hells'),
    ('beppu-jigoku', 'ja', 1, '別府地獄めぐり'),
    ('nikko-toshogu', 'th', 1, 'ศาลเจ้านิกโกโทโชกู'),
    ('nikko-toshogu', 'en', 1, 'Nikkō Tōshō-gū'),
    ('nikko-toshogu', 'ja', 1, '日光東照宮'),
    ('kotoku-in', 'th', 1, 'พระใหญ่คามาคุระ (วัดโคโตกุอิน)'),
    ('kotoku-in', 'en', 1, 'Kōtoku-in Great Buddha'),
    ('kotoku-in', 'ja', 1, '高徳院'),
    ('kokusai-dori', 'th', 1, 'ถนนโคคุไซ'),
    ('kokusai-dori', 'en', 1, 'Kokusai Dori'),
    ('kokusai-dori', 'ja', 1, '国際通り'),
    ('kobe-harborland', 'th', 1, 'โกเบฮาร์เบอร์แลนด์'),
    ('kobe-harborland', 'en', 1, 'Kobe Harborland'),
    ('kobe-harborland', 'ja', 1, '神戸ハーバーランド'),
    ('farm-tomita', 'th', 1, 'ฟาร์มโทมิตะ'),
    ('farm-tomita', 'en', 1, 'Farm Tomita'),
    ('farm-tomita', 'ja', 1, 'ファーム富田'),
    ('mount-hakodate', 'th', 1, 'ภูเขาฮาโกดาเตะ'),
    ('mount-hakodate', 'en', 1, 'Mt. Hakodate'),
    ('mount-hakodate', 'ja', 1, '函館山'),
    ('glover-garden', 'th', 1, 'สวนกลอเวอร์'),
    ('glover-garden', 'en', 1, 'Glover Garden'),
    ('glover-garden', 'ja', 1, 'グラバー園'),
    ('minato-mirai', 'th', 1, 'มินาโตะมิไร'),
    ('minato-mirai', 'en', 1, 'Minato Mirai'),
    ('minato-mirai', 'ja', 1, 'みなとみらい');

-- ── ลงคลังจริง ────────────────────────────────────────────────────────────
insert into public.catalog_places
  (city_id, legacy_slug, category, source, weather_sensitivity, lat, lng)
select c.id, j.slug, j.category, 'curated', j.weather, j.lat, j.lng
  from _jp j
  join public.catalog_cities c on c.legacy_slug = j.city_slug and c.country_id = 'jp'
on conflict (legacy_slug) do nothing;

insert into public.catalog_place_names (place_id, city_id, locale, name, priority, source)
select p.id, p.city_id, n.locale, n.name, n.priority, 'curated'
  from _jpn n
  join public.catalog_places p on p.legacy_slug = n.slug
on conflict (place_id, locale, priority) do nothing;

-- ── ยืนยัน ────────────────────────────────────────────────────────────────
do $verify$
declare n_place int; n_name int; n_orphan int; n_wrongcity int; n_empty int;
begin
  select count(*) into n_place from public.catalog_places p join _jp j on p.legacy_slug = j.slug;
  select count(*) into n_name
    from public.catalog_place_names cn
    join public.catalog_places p on p.id = cn.place_id
    join _jpn n on n.slug = p.legacy_slug and n.locale = cn.locale and n.priority = cn.priority;

  if n_place <> 57  then raise exception 'สถานที่ลงไม่ครบ: % ไม่ใช่ 57', n_place; end if;
  if n_name  <> 171 then raise exception 'ชื่อลงไม่ครบ: % ไม่ใช่ 171', n_name; end if;

  -- 🔴 `join … and c.country_id = 'jp'` ข้างบนกันเมืองผิดประเทศไว้แล้ว **แต่มันกันแบบเงียบ**
  --    (join ไม่ match = แถวหายไปเฉย ๆ) · เคสนับ 57 จะจับได้ แต่จะไม่บอกว่า *ทำไม* → เคสนี้บอก
  select count(*) into n_wrongcity
    from public.catalog_places p
    join _jp j on p.legacy_slug = j.slug
    join public.catalog_cities c on c.id = p.city_id
   where c.country_id <> 'jp';
  if n_wrongcity <> 0 then raise exception 'มี % แห่งผูกกับเมืองนอกประเทศ jp', n_wrongcity; end if;

  select count(*) into n_orphan
    from public.catalog_places p join _jp j on p.legacy_slug = j.slug
   where not exists (select 1 from public.catalog_place_names cn
                      where cn.place_id = p.id and cn.locale = 'th');
  if n_orphan <> 0 then raise exception 'มี % แห่งที่ไม่มีชื่อภาษาไทย — join ผิด', n_orphan; end if;

  -- 🔴 **เกณฑ์ที่สำคัญที่สุดของไฟล์นี้ และเป็นเกณฑ์เดียวที่วัด *ประสบการณ์ผู้ใช้* ไม่ใช่จำนวนแถว**
  --    เมืองที่เลือกได้ในฟอร์มสร้างทริป แต่เปิดเข้าไปแล้วไม่มีอะไรให้เพิ่มเลย = ทางตัน
  --    ⚠️ นับเฉพาะสถานที่ที่ **ไม่ใช่ transfer** — สนามบินไม่ใช่ที่เที่ยว ถ้านับด้วยจะผ่านฟรีทั้ง 22 เมือง
  --       (7 เมืองมีสนามบินอยู่แล้วจาก `20260827233000` — เกณฑ์ที่นับมันด้วยจะบอกว่า "ไม่ว่าง" ทั้งที่ว่าง)
  select count(*) into n_empty
    from public.catalog_cities c
   where c.country_id = 'jp'
     and not exists (select 1 from public.catalog_places p
                      where p.city_id = c.id and p.source <> 'transfer');
  if n_empty <> 0 then raise exception 'มี % เมืองญี่ปุ่นที่ไม่มีสถานที่เที่ยวเลย — เลือกได้แต่กดเข้าไปว่าง', n_empty; end if;
end $verify$;

commit;
