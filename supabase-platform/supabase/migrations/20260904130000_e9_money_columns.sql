-- ════════════════════════════════════════════════════════════════════════════
-- E9 — ช่องเก็บ "เงิน" ใบแรกของโปรเจกต์: ราคาที่พัก + ราคาตั๋ว/การจอง
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026
-- ════════════════════════════════════════════════════════════════════════════
-- ## ทำไม
-- ผู้ใช้สั่งเอง 4 ก.ย. 2026: *"ฉันอยากทำโปรเจ็คนี้เพื่อสร้างรายได้ … สามารถแนะนำโรงแรม
-- ให้ผู้ใช้งานได้ และเขาทราบราคา"* และเลือกขอบเขต **ทำช่องไว้ก่อน ยังไม่ต่อ API จริง**
--
-- 🔴 **ก่อนไฟล์นี้ ทั้งโปรเจกต์ไม่มีคอลัมน์เงินสักช่องเดียว** — ค้นครบทั้ง
-- `supabase-platform/supabase/migrations/` (34+ ไฟล์) · `supabase/migrations/` (31 ไฟล์)
-- และ `lib/engine/database.types.ts` ด้วยคำ price/cost/currency/amount/fee/budget/rate/deposit
-- ⇒ hit ทั้งหมดเป็น false positive (`optimizeRoute.costOf` = ต้นทุน*ระยะทาง* · `rateLimit` = โควตา)
--
-- ## ประโยชน์ที่ได้ทันที **ไม่ต้องรอ affiliate**
-- ผู้ใช้จองโรงแรมที่อื่นแล้วมาจดว่าจ่ายไปเท่าไหร่ ⇒ ได้ยอดรวมของทริป
-- 🎯 ***ช่องนี้มีค่าโดยไม่ต้องมีผู้ให้บริการราคา — และวันที่มีผู้ให้บริการ มันคือที่ที่ราคานั้นจะลง
--    ไม่ต้องย้ายข้อมูลหรือเพิ่มตารางใหม่***
--
-- ## 🔴 กับดักที่ไฟล์นี้ต้องเดินอ้อม — และมันเงียบสนิทถ้าพลาด
-- `trip_hotels` **grant `insert`/`update` แบบระบุคอลัมน์ทีละตัว** (`20260825150325:107-113`)
-- ⇒ เพิ่มคอลัมน์เฉย ๆ แล้ว `authenticated` **เขียนไม่ได้** และ PostgREST ตอบ `42501`
--    ที่อ่านเหมือนปัญหาสิทธิ์ของทั้งตาราง ไม่ใช่ของคอลัมน์เดียว
-- · `bookings` เป็นรูปเดียวกัน (`20260825145043`) — ตรวจแล้วทั้งสองใบ
--
-- ## ⚠️ สิ่งที่ไฟล์นี้ตั้งใจ **ไม่** ทำ
-- ① **ไม่มีตาราง `offers`/`providers`** — ยังไม่มีผู้ให้บริการสักเจ้า ตารางที่ไม่มีคนเขียนคือหนี้
-- ② **ไม่มี `profiles.plan`** (สมัครสมาชิกรายเดือน) — ผูกกับ *บัญชี* ไม่ใช่ *ทริป* คนละแกน ใบแยก
-- ③ **ไม่แปลงค่าเงิน** — เก็บสกุลที่ผู้ใช้กรอกตามจริง · การแปลงต้องมีอัตราและวันที่อ้างอิง
--    ซึ่งเป็นระบบของตัวเอง · **ยอดรวมข้ามสกุลจึงต้องแยกแสดงทีละสกุล ห้ามบวกกัน**
--
-- ── ถอนคืน ────────────────────────────────────────────────────────────────
--   alter table public.trip_hotels drop column if exists price_amount, drop column if exists price_currency, drop column if exists price_source;
--   alter table public.bookings    drop column if exists price_amount, drop column if exists price_currency;
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
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
-- 1. ราคาที่พัก
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **`numeric` ไม่ใช่ `float`** — เงินที่เก็บเป็นทศนิยมฐานสองจะเพี้ยนตอนบวก
--    และมันเพี้ยนทีละสตางค์ **ซึ่งไม่มีใครสังเกตจนกว่ายอดรวมจะไม่ตรง**
-- 🔴 **ไม่มี `default 0`** — `0` แปลว่า *"ฟรี"* ส่วน `null` แปลว่า *"ยังไม่รู้"* · คนละความหมาย
--    (รูปเดียวกับ `overnight_kind` ที่ `D80` แยก `none` ออกจาก `undecided` ไว้แล้ว)
alter table public.trip_hotels
  add column if not exists price_amount   numeric(12,2),
  add column if not exists price_currency text,
  -- ที่มาของตัวเลข: `manual` = ผู้ใช้กรอกเอง · ชื่อผู้ให้บริการ = มาจาก affiliate
  -- 🎯 **ผู้ใช้ต้องแยกออกว่าราคานี้ใครบอก** — ราคาที่ตัวเองจดกับราคาที่ระบบดึงมา
  --    เชื่อถือได้คนละระดับ และเมื่อมีทั้งสองแบบในหน้าเดียว การไม่แยกคือการทำให้เข้าใจผิด
  add column if not exists price_source   text;

alter table public.trip_hotels
  drop constraint if exists trip_hotels_price_sane;
alter table public.trip_hotels
  add constraint trip_hotels_price_sane check (
    -- ราคาติดลบไม่มีความหมาย · เพดานกันค่าที่พิมพ์พลาดจนทำให้ยอดรวมอ่านไม่ได้
    (price_amount is null or (price_amount >= 0 and price_amount <= 99999999))
    -- 🔴 มีตัวเลขต้องมีสกุลเสมอ — จำนวนเงินที่ไม่รู้สกุลคือตัวเลขที่แปลไม่ได้
    --    และมันจะถูกเอาไปบวกกับสกุลอื่นโดยไม่มีอะไรกัน
    and (price_amount is null or price_currency is not null)
    and (price_currency is null or price_currency ~ '^[A-Z]{3}$')
    and (price_source is null or length(trim(price_source)) between 1 and 40)
  );

-- 🔴 **ต้อง grant คอลัมน์ใหม่ทีละตัว** — ตารางนี้ถูก revoke ทั้งใบแล้ว grant ทีละคอลัมน์
--    (`20260825150325:107-113`) · ลืมบรรทัดนี้ = เขียนไม่ได้แบบเงียบ
grant insert (price_amount, price_currency, price_source) on public.trip_hotels to authenticated;
grant update (price_amount, price_currency, price_source) on public.trip_hotels to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ราคาตั๋ว/การจอง — ตั๋วเครื่องบิน · บัตรเข้าสถานที่ · ทัวร์
-- ───────────────────────────────────────────────────────────────────────────
-- 📌 `bookings.category` เป็น text อิสระอยู่แล้ว (`flight`/`hotel`/`activity`/…) จึงรับสามสาย
--    รายได้ที่ผู้ใช้เลือกไว้ได้ทั้งหมด **โดยไม่ต้องมีตารางใหม่**
alter table public.bookings
  add column if not exists price_amount   numeric(12,2),
  add column if not exists price_currency text;

alter table public.bookings
  drop constraint if exists bookings_price_sane;
alter table public.bookings
  add constraint bookings_price_sane check (
    (price_amount is null or (price_amount >= 0 and price_amount <= 99999999))
    and (price_amount is null or price_currency is not null)
    and (price_currency is null or price_currency ~ '^[A-Z]{3}$')
  );

grant insert (price_amount, price_currency) on public.bookings to authenticated;
grant update (price_amount, price_currency) on public.bookings to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. assert — ทั้งฝั่งบวกและฝั่งควบคุม
-- ───────────────────────────────────────────────────────────────────────────
do $assert$
declare
  v_trip uuid;
begin
  -- ① คอลัมน์มีจริง
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='trip_hotels' and column_name='price_amount') then
    raise exception 'assert ล้ม: ไม่มี trip_hotels.price_amount';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='bookings' and column_name='price_amount') then
    raise exception 'assert ล้ม: ไม่มี bookings.price_amount';
  end if;

  -- ② 🔴 สิทธิ์ — ข้อที่พลาดง่ายที่สุดและเงียบที่สุด
  if not has_column_privilege('authenticated', 'public.trip_hotels', 'price_amount', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated เขียน trip_hotels.price_amount ไม่ได้ (ลืม grant ทีละคอลัมน์)';
  end if;
  if not has_column_privilege('authenticated', 'public.bookings', 'price_amount', 'INSERT') then
    raise exception 'assert ล้ม: authenticated เขียน bookings.price_amount ไม่ได้';
  end if;

  -- ③ ✅ **ทิศแดงของจริง — ป้อนค่าที่ constraint ต้องปฏิเสธ แล้ว assert ว่ามันปฏิเสธ**
  --    ไม่มีข้อนี้ `check (true)` ก็ผ่าน assert ① และ ② ครบเหมือนกันเป๊ะ
  --    🎯 ถามว่า *"ด่านแดงเป็นไหม"* ไม่ใช่ *"ด่านถูกเขียนไว้ไหม"* (`TEAM.md §3.4`)
  select id into v_trip from public.trips limit 1;
  if v_trip is not null then
    begin
      insert into public.trip_hotels (trip_id, city_id, hotel_name, check_in, check_out, price_amount)
      select v_trip, c.id, '__assert_no_currency__', '2000-01-01'::date, '2000-01-02'::date, 100
        from public.catalog_cities c limit 1;
      raise exception 'assert ล้ม: ใส่ราคาโดยไม่มีสกุลเงินได้ — constraint ไม่ทำงาน';
    exception
      when check_violation then null;  -- ✅ ถูกต้อง: ถูกปฏิเสธตามที่ต้องการ
      when insufficient_privilege then null;  -- รันด้วย role ที่เขียนไม่ได้ — ข้ามข้อนี้ ไม่ใช่ความล้มเหลว
    end;
  else
    raise notice 'ข้ามทิศแดง: ยังไม่มีทริปในฐานให้ทดสอบ — รันซ้ำเมื่อมีข้อมูลจะได้ผลจริง';
  end if;
end $assert$;

commit;
