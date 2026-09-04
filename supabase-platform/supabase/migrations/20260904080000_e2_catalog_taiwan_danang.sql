-- ════════════════════════════════════════════════════════════════════════════
-- E2 — ไต้หวัน (ประเทศใหม่) 7 เมือง + ดานัง (เวียดนาม)
-- เจ้าของ: P5 · ผู้ใช้สั่งโดยตรง · ต่อจาก `20260904070000`
-- ════════════════════════════════════════════════════════════════════════════
-- ── สถานะฐานก่อนไฟล์นี้ (อ่านจากฐาน dev จริง ไม่ใช่จากไฟล์ migration) ──────
--   jp 22 เมือง · kr 5 · th 13 · vn 2 (hanoi · hcmc) · cn 7 · hk 1 · mo 1 · **tw ไม่มี**
--   ✅ ที่ผู้ใช้สั่งให้เช็ค: `osaka` `nagoya` `sapporo` `fukuoka` **มีครบแล้วทั้ง 4**
--   ⚠️ `okinawa` — **ไม่มีเมืองชื่อนี้ แต่มี `naha` (นาฮะ) ซึ่งเป็นเมืองเอกของโอกินาว่า**
--      ไฟล์นี้**ไม่เพิ่มอะไรให้โอกินาว่า** เพราะยังไม่รู้ว่าผู้ใช้อยากได้เมืองย่อยเพิ่ม
--      (อิชิงากิ · มิยาโกจิมะ · อนนะ) หรือแค่ต้องการยืนยันว่าโอกินาว่ามีแล้ว — **รอคำตอบ**
--
-- ── 🔴 `supported` — สวิตช์ที่ลืมแล้วข้อมูลหายไปทั้งประเทศ ─────────────────
-- `catalog_countries.supported` เป็น `not null default false` → ประเทศใหม่**ไม่โผล่**
-- ให้ผู้ใช้จนกว่าจะเปิด · `20260904060000` เกิดขึ้นเพราะข้อนี้พลาดมาแล้วกับจีน/ฮ่องกง/มาเก๊า
-- (ข้อมูล 119 แห่งอยู่ในฐาน แต่ผู้ใช้มองไม่เห็นสักแห่ง)
--
-- 🔴 **ไฟล์นี้จงใจตั้ง `supported = false` ให้ไต้หวัน** — ตามเหตุผลที่ `20260904060000`
--    เขียนไว้เอง: *"ประเทศที่เพิ่งใส่ยังไม่ควรโผล่ จนกว่าจะมีเมือง/สถานที่พร้อม"*
--    ตอนนี้ไต้หวันมี**เมืองแต่ยังไม่มีสถานที่สักแห่ง** → เปิดตอนนี้ = ผู้ใช้เลือกไต้หวัน
--    แล้วเจอหน้าเปล่า · ✅ **เปิดในไฟล์ถัดไปที่ลงสถานที่ พร้อมยิง `/api/engine/countries` จริง**
--    ⚠️ **ห้ามปิดงานนี้ด้วยการนับแถวอย่างเดียว** — `20260904040000` assert ผ่านครบ 3 ข้อ
--       แล้วยังพลาด เพราะทุกข้อถามว่า *"แถวอยู่ในตารางไหม"* ไม่มีข้อไหนถามว่า *"ผู้ใช้เห็นไหม"*
--
-- ── ที่มาของตัวเลข ────────────────────────────────────────────────────────
-- ✅ `lat`/`lng` + `name_local` ดึงจาก **Google Places API (New) `places:searchText`**
--    (`languageCode: zh-TW` สำหรับไต้หวัน · `vi` สำหรับดานัง) ไม่ได้พิมพ์จากความจำ
-- ⚠️ `name_th` เป็นคำทับศัพท์ที่คนไทยใช้ทั่วไป — ไม่มีแหล่งอ้างอิงเชิงเครื่อง แก้ได้อิสระ
-- 📌 ชื่อท้องถิ่นเก็บ**ตามที่ Google คืนมา** (`臺北` ไม่ใช่ `台北`) — ทั้งสองรูปใช้จริง
--    แต่เก็บรูปที่มาจากแหล่ง ดีกว่ารูปที่เราเลือกเอง
--
-- ── ถอนคืน ────────────────────────────────────────────────────────────────
--   delete from public.catalog_cities where legacy_slug in
--     ('taipei','new-taipei','taichung','tainan','kaohsiung','hualien','nantou','da-nang');
--   delete from public.catalog_countries where id = 'tw';   -- ต้องลบหลังเมือง (FK restrict)
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity — ฐานนี้ไม่ใช่ engine-dev';
  end if;
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- ── ประเทศใหม่ · `supported` ปิดไว้ก่อนโดยตั้งใจ (ดูหัวไฟล์) ───────────────
insert into public.catalog_countries (id, name_th, name_en, supported) values
    ('tw', 'ไต้หวัน', 'Taiwan', false)
on conflict (id) do nothing;

insert into public.catalog_cities (country_id, legacy_slug, name_th, name_en, name_local, lat, lng, timezone)
values
    -- ไทเป — เมืองหลวง · ปลายทางหลักของคนไทย
    ('tw', 'taipei',     'ไทเป',      'Taipei',          '臺北',   25.0330, 121.5654, 'Asia/Taipei'),
    -- นิวไทเป — จิ่วเฟิ่น · สือเฟิน · หย่างหมิงซาน อยู่ในเขตนี้ ไม่ใช่ไทเป
    ('tw', 'new-taipei', 'นิวไทเป',   'New Taipei',      '新北市', 25.0170, 121.4628, 'Asia/Taipei'),
    -- ไถจง — ประตูสู่ทะเลสาบสุริยันจันทรา
    ('tw', 'taichung',   'ไถจง',      'Taichung',        '臺中',   24.1630, 120.6746, 'Asia/Taipei'),
    -- ไถหนาน — เมืองเก่า อาหารพื้นเมือง
    ('tw', 'tainan',     'ไถหนาน',    'Tainan',          '臺南市', 22.9999, 120.2269, 'Asia/Taipei'),
    -- เกาสง — เมืองใหญ่ทางใต้ · มีบินตรงจากไทย
    ('tw', 'kaohsiung',  'เกาสง',     'Kaohsiung',       '高雄市', 22.6273, 120.3014, 'Asia/Taipei'),
    -- ฮวาเหลียน — อุทยานทาโรโกะ
    ('tw', 'hualien',    'ฮวาเหลียน', 'Hualien',         '花蓮',   23.9871, 121.6014, 'Asia/Taipei'),
    -- หนานโถว — ทะเลสาบสุริยันจันทราอยู่ในเขตนี้ ไม่ใช่ไถจง
    ('tw', 'nantou',     'หนานโถว',   'Nantou',          '南投縣', 23.9610, 120.9719, 'Asia/Taipei'),

    -- ── เวียดนาม ──────────────────────────────────────────────────────────
    -- ดานัง — บินตรงจากกรุงเทพฯ · ประตูสู่ฮอยอัน/บานาฮิลล์
    ('vn', 'da-nang',    'ดานัง',     'Da Nang',         'Đà Nẵng', 16.0600, 108.2111, 'Asia/Ho_Chi_Minh')
on conflict (legacy_slug) do nothing;

do $verify$
declare n int;
begin
  select count(*) into n from public.catalog_cities where country_id = 'tw';
  if n <> 7 then raise exception 'ควรมีเมืองไต้หวัน 7 เมือง แต่มี %', n; end if;

  select count(*) into n from public.catalog_cities where legacy_slug = 'da-nang';
  if n <> 1 then raise exception 'ควรมีดานัง 1 แถว แต่มี %', n; end if;

  -- 🔴 ไม่มีชื่อไหนมีอักขระ Private Use Area (U+E000–U+F8FF) — P1 เจอจริงกับ `'เซี่ยงไฮ'`
  --    **มองด้วยตาไม่ออก** แต่แสดงผลเพี้ยนบนเครื่องผู้ใช้ · ชื่อในไฟล์นี้มาจาก Google เหมือนกัน
  --    ⇒ ความเสี่ยงเดียวกันเป๊ะ · สแกนไฟล์ก่อน commit ได้ 0 **แต่ด่านต้องอยู่ในฐาน ไม่ใช่ในหัวผม**
  select count(*) into n from public.catalog_cities
   where legacy_slug in ('taipei','new-taipei','taichung','tainan','kaohsiung','hualien','nantou','da-nang')
     and (name_th ~ '[\uE000-\uF8FF]' or name_en ~ '[\uE000-\uF8FF]'
          or coalesce(name_local,'') ~ '[\uE000-\uF8FF]');
  if n > 0 then raise exception 'มีชื่อเมือง % แถวที่มีอักขระ Private Use Area', n; end if;

  -- 🔴 ยืนยันว่าสวิตช์ยัง **ปิด** อยู่จริงตามที่ตั้งใจ — ไม่ใช่เผลอเปิด
  --    (ข้อนี้ตรวจ *เจตนา* ไม่ใช่ตรวจ *ความสำเร็จ* — เปิดตอนยังไม่มีสถานที่คือบั๊ก)
  if (select supported from public.catalog_countries where id = 'tw') is not false then
    raise exception 'tw.supported ต้องเป็น false จนกว่าจะมีสถานที่ — ดูเหตุผลที่หัวไฟล์';
  end if;

  -- เมืองเดิมของเวียดนามต้องยังอยู่ครบ
  select count(*) into n from public.catalog_cities where country_id = 'vn';
  if n <> 3 then raise exception 'เวียดนามควรมี 3 เมือง (hanoi hcmc da-nang) แต่มี %', n; end if;
end $verify$;

commit;
