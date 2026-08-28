-- E4-AC8 · เติม `maps_query` ให้สถานที่ในคลัง — เจ้าของ: P1-Lead · 28 ส.ค. 2026
--
-- ## ปัญหา (P2 วัดจาก API จริง · P1 ยืนยันจากฐาน)
-- `catalog_places` **ไม่มี `maps_query` และ `google_place_id` เลยสักแถว** (มี `lat`/`lng` ครบ)
-- `placeQueryKey()` คืน `google_place_id` ถ้ามี ไม่งั้น `maps_query` → **ไม่มีทั้งคู่ = คืนสตริงว่าง**
-- → รูป · เวลาเปิด-ปิด · เรตติ้ง ของสถานที่ในคลัง **โหลดไม่ได้ตามนิยาม**
--   และหน้าเว็บยิง `/api/place-photos?queries=` เปล่า → `400` ทุกครั้งที่เปิด
-- 🔴 ตัวรวมคำขอมีด่าน `size === 0` อยู่แล้วและกันไม่ได้ — มันกัน *"ไม่มีรายการ"* ไม่ได้กัน *"มีรายการที่ว่าง"*
--
-- ## ทำไมปั้นเองได้ ไม่ต้องยิง Google สักครั้ง
-- `mapsQuery` ของเว็บเดิมเป็น **ข้อความค้นหาธรรมดา** ไม่ใช่ id: `data/places.ts` เก็บ `"Hoan Kiem Lake Hanoi"`
-- (คอมเมนต์ในไฟล์นั้นเขียนเองว่า *"mapsQuery ต่อท้ายด้วยชื่อเมืองอยู่แล้ว"*)
-- → ประกอบจาก **ชื่ออังกฤษของสถานที่ + ชื่ออังกฤษของเมือง** ซึ่งมีครบในคลังแล้ว
--
-- ## ขอบเขต — เฉพาะประเทศที่ประกาศรองรับ
-- 🔴 คลังมี **950 แถว แต่ของจริง 174** ที่เหลือ 776 เป็น fixture ค้างจากชุดทดสอบ (เมือง 1,885 · ของจริง 42)
--    วัดครั้งแรกโดยไม่แยก fixture ได้ *"ปั้นได้ 18%"* · แยกแล้วเป็น **174/174 = 100%**
--    🎯 **ตัวหารที่ปนขยะทำให้ข้อสรุปกลับด้าน** — เป็นรูปเดียวกับตอนคลัง "766 แถว" ที่ของจริง 72
-- · `where` จึงผูกกับ `catalog_countries.supported` **ไม่ใช่รหัสประเทศที่พิมพ์เอง** (`D48` — ห้าม allowlist ด้วยชื่อ)
-- · ⚠️ **ไม่แตะ `source = 'transfer'`** (สนามบิน/สถานีขนส่ง) — คนละชนิดของข้อมูล ไม่ได้ใช้ผ่านตัวค้นรูป
-- · ⚠️ **ไม่แตะแถวที่มี `maps_query` อยู่แล้ว** → รันซ้ำได้ ไม่ทับของที่ใครตั้งมือ

begin;

do $$
declare
  n_before int;
  n_after  int;
  n_target int;
begin
  select count(*) into n_before
    from public.catalog_places p
    join public.catalog_cities c    on c.id = p.city_id
    join public.catalog_countries co on co.id = c.country_id
   where co.supported and p.source <> 'transfer' and p.maps_query is not null;

  select count(*) into n_target
    from public.catalog_places p
    join public.catalog_cities c    on c.id = p.city_id
    join public.catalog_countries co on co.id = c.country_id
   where co.supported and p.source <> 'transfer';

  -- 🔴 ถ้าคลังของประเทศที่รองรับว่าง แปลว่ารันผิดฐาน — ล้มเสียงดังดีกว่าอัปเดต 0 แถวเงียบ ๆ
  if n_target = 0 then
    raise exception 'ไม่พบสถานที่ของประเทศที่รองรับเลย — ฐานนี้ใช่ engine-dev หรือเปล่า';
  end if;

  update public.catalog_places p
     set maps_query = n.name || ' ' || coalesce(c.name_en, c.name_th),
         updated_at = now()
    from public.catalog_cities c,
         public.catalog_countries co,
         public.catalog_place_names n
   where c.id  = p.city_id
     and co.id = c.country_id
     and co.supported
     and n.place_id = p.id
     and n.locale   = 'en'
     and p.source  <> 'transfer'
     and p.maps_query is null;

  select count(*) into n_after
    from public.catalog_places p
    join public.catalog_cities c    on c.id = p.city_id
    join public.catalog_countries co on co.id = c.country_id
   where co.supported and p.source <> 'transfer' and p.maps_query is not null;

  raise notice 'maps_query: ก่อน % · หลัง % · เป้าหมายทั้งหมด %', n_before, n_after, n_target;

  -- 🔴 ยืนยันว่าครอบครบ ไม่ใช่แค่ "ไม่ error" — ถ้าเหลือแถวว่าง แปลว่ามีของที่ไม่มีชื่ออังกฤษ
  --    ซึ่งต้อง seed ชื่อก่อน **ไม่ใช่ปล่อยผ่านแล้วให้รูปไม่ขึ้นเงียบ ๆ เหมือนเดิม**
  if n_after <> n_target then
    raise exception 'ยังเหลือ % แถวที่ไม่มี maps_query — น่าจะไม่มีชื่อ locale=en', n_target - n_after;
  end if;
end $$;

commit;
