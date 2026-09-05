-- E2 · รูปปกของประเทศและเมือง
--
-- ผู้ใช้สั่ง 5 ก.ย. 2026: *"ให้ไปหาภาพจริงมาใส่พวกประเทศและเมือง โดยใช้ภาพจริงจากเว็บที่เขาอนุญาต"*
-- แล้ว **เปลี่ยนทิศเองหลังได้ราคาครบ**: เขาจะ **เจนภาพด้วย AI เอง** (P5 ค้านและให้เหตุผลไปแล้ว
-- ว่ารูป AI ดูเหมือนรูปถ่าย ⇒ ผู้ใช้แยกไม่ออกว่าแลนด์มาร์กนั้นไม่มีจริง · ผู้ใช้รับทราบและตัดสินเอง)
--
-- ## 🔴 ทำไมต้องมี `image_origin` — และทำไมมันไม่ใช่คอลัมน์ประดับ  (P5 เสนอ · P1 รับ)
-- ```
-- ภาพ AI ที่ไม่มีเครดิต        image_author = null
-- ภาพ Commons ที่ **ลืม** ใส่เครดิต  image_author = null      ← เหมือนกันทุกประการ
-- ```
-- 🎯 ***ถ้าไม่มีคอลัมน์นี้ สองแถวนั้นแยกไม่ออก — และข้อหลังคือแถวที่วันหนึ่งต้องถอดออกทั้งหมด
--    เพราะพิสูจน์ไม่ได้ว่ามาจากไหน*** (ถ้อยคำ P5)
-- ⇒ **ที่มาเป็นสิ่งที่ต้อง *ประกาศ* ไม่ใช่สิ่งที่ *เว้นว่างได้***
-- · 📌 ของแถมที่ตามมา: หน้าเว็บติดป้าย "ภาพจำลอง" บนการ์ดที่ `image_origin = 'ai'` ได้
--   **คอลัมน์นี้คือสิ่งเดียวที่ทำให้ป้ายนั้นเป็นไปได้** — ไม่มีมันก็ติดป้ายตามความจริงไม่ได้
--
-- ## 🔴 `image_url` เก็บ **พาธในเว็บ** ไม่ใช่ URL ภายนอก
-- ไฟล์อยู่ใน `public/catalog/{countries,cities}/` ของรีโป (ไม่ใช่ Supabase Storage)
-- เหตุผล: ~87 ใบ · รีวิวได้ใน PR · ย้อนได้ · Vercel เสิร์ฟผ่าน CDN ให้ · **ไม่เพิ่มบริการที่ไม่มีใครรีวิว**
-- · 🔴 **เกณฑ์กลับทาง เขียนไว้เลยจะได้ไม่ต้องเถียงทีหลัง: เกิน ~100 ใบ หรือเริ่มมีหลายรูปต่อที่ → ย้ายไป Storage**
--   ⚠️ P5 วัดแล้วว่าเส้นนี้อยู่ใกล้: 9 ประเทศ + 78 เมือง = **87** ⇒ **ชนเกือบพอดีถ้าเจนครบ**
--
-- ## 🔴 ชื่อไฟล์ใช้ **slug/id ที่คนอ่านออก** ไม่ใช่ UUID  (P5 จับได้ · ข้อเสนอแรกของผมผิด)
-- ```
-- ผมเสนอ  public/catalog/cities/<city_id>.webp   ← city_id เป็น UUID
--         ⇒ ผู้ใช้ต้องเจน 78 ใบ แล้วตั้งชื่อเป็น `3e44e6fb-1ed3-…` ทีละใบด้วยมือ
-- ```
-- 🎯 ***ชื่อไฟล์ที่เครื่องอ่านง่าย แต่คนตั้งไม่ได้ — ในงานที่ *คน* เป็นคนตั้งชื่อ คือชื่อที่ผิด***
-- ✅ `catalog_cities.legacy_slug` มี `unique` อยู่แล้ว (`20260825132854:87`) ⇒ `gyeongju.webp`
--    `catalog_countries.id` เป็น `text` 2 ตัวอักษรอยู่แล้ว ⇒ `jp.webp` · **ไม่ต้องแตะ UUID เลยสักจุด**
--
-- ## 📌 ไม่ต้องแก้ทะเบียนสิทธิ์ `§3.5` — ตรวจแล้ว ไม่ได้เดา
-- `grant` ของสองตารางนี้เป็น **ระดับตาราง ไม่ระบุคอลัมน์**
--   `20260825132854:136-137`  select → authenticated
--   `20260825133252:49-50`    select, insert, update, delete → service_role
-- ⇒ คอลัมน์ใหม่ครอบอัตโนมัติ · **ถ้าวันหนึ่งมีใครเปลี่ยนเป็น column-level grant ข้อนี้จะเป็นเท็จเงียบ ๆ**

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่ใช่ engine-dev';
  end if;
end $guard$;

alter table public.catalog_countries
  add column image_url         text,
  add column image_origin      text,
  add column image_source_url  text,
  add column image_author      text,
  add column image_license     text,
  add column image_license_url text;

alter table public.catalog_cities
  add column image_url         text,
  add column image_origin      text,
  add column image_source_url  text,
  add column image_author      text,
  add column image_license     text,
  add column image_license_url text;

-- ── ที่มาต้องประกาศ · เครดิตต้องครบเมื่อที่มาต้องการมัน ────────────────────────
-- 🔴 **ทุกคอลัมน์ nullable โดยตั้งใจ** — เมืองส่วนใหญ่จะยังไม่มีรูปอีกนาน
--    และต้องตกกลับไปใช้ไล่สีเดิมได้ (`CityThumb`/`CountryThumb`) **โดยไม่มีอะไรแดง**
-- ⚠️ `image_license` ปล่อยอิสระในกิ่ง `ai` โดยตั้งใจ — เผื่อบันทึกเงื่อนไขของตัวสร้างภาพ
--    (กิ่งนั้นบังคับแค่ *ไม่มีผู้ถ่าย* และ *ไม่มีหน้าต้นทาง* ซึ่งเป็นสองอย่างที่ภาพ AI **ไม่มีจริง**)
do $$
declare t text;
begin
  foreach t in array array['catalog_countries', 'catalog_cities'] loop
    execute format($f$
      alter table public.%I
        add constraint %I check (image_origin is null or image_origin in ('ai','commons','own')),
        add constraint %I check (
          image_url is null
          or (image_origin = 'ai'
              and image_author is null and image_source_url is null)
          or (image_origin in ('commons','own')
              and image_source_url is not null and image_author is not null
              and image_license  is not null and image_license_url is not null)
        )
    $f$, t, t || '_image_origin_ck', t || '_image_credit_ck');
  end loop;
end $$;

-- ── ยืนยันด้วยการเขียนจริง ไม่ใช่ด้วยการอ่านนิยาม ─────────────────────────────
-- 🔴 **เคสควบคุมทิศบวกมาก่อน** — ถ้าแถวทดสอบไม่มีอยู่ ทิศลบข้างล่างจะผ่านฟรีโดยไม่ได้ตรวจอะไร
-- 🔴 **ไม่ใช้ `reset role`** และไม่สลับ role เลยในใบนี้ (ดู `20260905030000`)
-- 📌 ทุก probe คืนค่าเดิมในทรานแซกชันเดียวกัน ⇒ ไม่เหลือของค้างไม่ว่าจะ commit หรือ rollback
do $assert$
declare
  v_id  text;
  n     int;
begin
  select id into v_id from public.catalog_countries order by id limit 1;
  if v_id is null then
    raise exception 'assert ล้ม: ไม่มีแถวใน catalog_countries ให้ยิงเส้นทางจริง — เคสนี้ห้ามถูกข้าม';
  end if;

  -- ① ทิศบวก: ภาพ AI ไม่มีเครดิต **ต้องผ่าน** (นี่คือเคสที่ผู้ใช้จะใช้จริง)
  update public.catalog_countries
     set image_url = '/catalog/countries/__probe__.webp', image_origin = 'ai'
   where id = v_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'assert ล้ม: ทิศบวกไม่ได้แก้แถวไหนเลย (n=%)', n; end if;

  -- ② ทิศลบ: ภาพ AI ที่มีผู้ถ่าย **ต้องถูกปฏิเสธ** — ที่มาต้องไม่ขัดกับเครดิต
  begin
    update public.catalog_countries set image_author = 'ใครสักคน' where id = v_id;
    raise exception 'assert ล้ม: ภาพ ai ที่มี image_author ผ่าน constraint ไปได้';
  exception when check_violation then null;
  end;

  -- ③ ทิศลบ: ภาพ commons ที่ไม่มีสัญญา **ต้องถูกปฏิเสธ**
  begin
    update public.catalog_countries
       set image_origin = 'commons', image_source_url = 'https://example.invalid/x',
           image_author = 'ใครสักคน', image_license = null
     where id = v_id;
    raise exception 'assert ล้ม: ภาพ commons ที่ไม่มี image_license ผ่าน constraint ไปได้';
  exception when check_violation then null;
  end;

  -- ④ ทิศลบ: มีรูปแต่ไม่ประกาศที่มา **ต้องถูกปฏิเสธ** — หัวใจของคอลัมน์นี้ทั้งใบ
  begin
    update public.catalog_countries set image_origin = null where id = v_id;
    raise exception 'assert ล้ม: มี image_url โดยไม่มี image_origin ผ่าน constraint ไปได้';
  exception when check_violation then null;
  end;

  -- คืนสภาพเดิม
  update public.catalog_countries
     set image_url = null, image_origin = null, image_source_url = null,
         image_author = null, image_license = null, image_license_url = null
   where id = v_id;
end $assert$;

commit;
