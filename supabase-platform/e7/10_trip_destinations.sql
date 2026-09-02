-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 10: trip_destinations — ช่องที่ E7 ทิ้งไว้ (P1 · 30 ส.ค. 2026)  │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ต้องรัน `01` ก่อน (ต้องมี `trip_days` พร้อม `city_id`)
--
-- ## 🔴 ทำไมก้อนนี้เพิ่งมี — และทำไมมันไม่ใช่ของเสริม
-- `E7` ย้ายทริปเกาหลีมาครบ (วัน · จุดแวะ · ที่พัก · ตั๋ว · เหตุการณ์) **แต่ไม่ได้ตั้ง
-- `trip_destinations` สักแถว** — ตารางนั้นเกิดทีหลัง (`E5` · 27 ส.ค.) และไม่มีใครกลับมาเติม
--
-- ผลที่ผู้ใช้เห็น (P2 เจอ 30 ส.ค. ตอนพยายามตรวจงานตัวเองด้วยตา):
--   `components/TripPlanScreen.tsx:136`
--     const isPlatformTrip = tripCatalogCities.status === "ready" && cities.length > 0;
--   → ทริปที่ไม่มีจุดหมาย = **ไม่ใช่ทริปแพลตฟอร์ม** → `dayPlanSource.kind = "unsupported"`
--   → **หน้าแผนขึ้นแบนเนอร์ "แผนรายวันของทริปนี้ยังแสดงผลไม่ได้"** ทั้งที่วันอยู่ในฐานครบ 11 วัน
--
-- 🎯 **และนี่อธิบายเรื่องที่ขัดกันมาทั้งวัน:** `/summary` กับ `/today` แสดงวันได้ (ใช้
--    `usePlatformItinerary` ตรง ๆ) · **หน้าแผนมีด่านเพิ่มอีกชั้นที่ผูกกับจุดหมาย**
--    · ไม่มีใครเห็นความต่างนี้จนกว่าจะมีคนเปิดทั้งสามหน้าด้วยทริปเดียวกัน
--
-- ## 🔴 จุดหมาย **อนุมานจากวันของทริปเอง** ไม่ได้พิมพ์มือ
-- เหตุผล: รายการที่พิมพ์มือคือแหล่งความจริงใบที่สองที่ drift จาก `trip_days` ได้เงียบ ๆ
-- · วัดของจริงก่อนเขียน (30 ส.ค. · ยิง `/api/engine/trips/<id>/days`):
--     11 วัน · **ทุกวันมี `city_id` ไม่มี null สักวัน** · 6 เมืองไม่ซ้ำ
--     hanoi(11 ต.ค.) · busan(12–14) · sokcho(15–16) · gangneung(17) · seoul(18,19,21) · suwon(20)
-- · ⚠️ **`hanoi` นับเป็นจุดหมายด้วยโดยตั้งใจ** — วันที่ 11 ต.ค. มีจุดแวะจริง 6 จุดในเมืองเก่า
--   ไม่ใช่แค่ต่อเครื่อง · **ถ้าผู้ใช้ไม่เห็นด้วย เขาแก้ชิปจุดหมายใน UI ได้** — เราไม่ตัดสินแทน
--
-- ## 🔴 ห้ามวางไฟล์นี้ใน `supabase/migrations/` (`TEAM.md §3.5`)
--    มันจะถูกรันใส่ DB ทริปจริงได้ · ก้อน `E7` ทุกใบรันด้วยมือบน `engine-dev` เท่านั้น

begin;

create or replace function pg_temp.lid(kind text, id text) returns uuid
  language sql immutable as $$ select md5(kind || ':' || id)::uuid $$;

do $e7$
declare
  v_trip uuid := pg_temp.lid('trip', 'korea-2026-10');
  n      int;
  n_days int;
  n_city int;
begin
  -- ① ต้องมีวันก่อน — ถ้าไม่มี แปลว่ายังไม่ได้รันก้อน 01 · **หยุด อย่าเติมรายการว่าง**
  select count(*) into n_days from public.trip_days where trip_id = v_trip;
  if n_days = 0 then
    raise exception 'ไม่มี trip_days สำหรับทริปนี้เลย — รันก้อน 01 ก่อน';
  end if;

  -- ② 🔴 วันที่ไม่มีเมือง = อนุมานจุดหมายจากมันไม่ได้ · ดังไว้ดีกว่าเงียบแล้วได้รายการไม่ครบ
  select count(*) into n from public.trip_days where trip_id = v_trip and city_id is null;
  if n > 0 then
    raise exception '% วันไม่มี city_id — จุดหมายที่อนุมานได้จะไม่ครบ ตรวจก้อน 01 ก่อน', n;
  end if;

  -- ③ แทรกจุดหมาย = เมืองไม่ซ้ำของวัน เรียงตาม *วันแรกที่ไปถึงเมืองนั้น*
  --    `rank` เริ่มที่ 0 ต่อเนื่อง — schema บอกว่าไม่ unique และ tie-break คือ (rank, city_id)
  --    ⚠️ `on conflict … do update` เพื่อให้รันซ้ำแล้วลำดับถูกเสมอ ไม่ใช่ปล่อยลำดับเก่าค้าง
  insert into public.trip_destinations (trip_id, city_id, rank)
  select v_trip, x.city_id, (row_number() over (order by x.first_date) - 1)::int
  from (
    select city_id, min(date) as first_date
    from public.trip_days
    where trip_id = v_trip and city_id is not null
    group by city_id
  ) x
  on conflict (trip_id, city_id) do update set rank = excluded.rank;

  -- ④ จำนวนต้องเท่ากับเมืองไม่ซ้ำของวัน — ไม่ใช่แค่ "insert ผ่าน"
  select count(distinct city_id) into n_city
    from public.trip_days where trip_id = v_trip and city_id is not null;
  select count(*) into n from public.trip_destinations where trip_id = v_trip;
  if n <> n_city then
    raise exception 'จุดหมาย % แถว แต่เมืองไม่ซ้ำของวันมี % — ไม่ตรงกัน', n, n_city;
  end if;

  -- ⑤ 🔴 ทุกจุดหมายต้องมีวันรองรับจริง — กันรายการที่หลงเหลือจากการรันก่อนหน้า
  --    (เช่นถ้ามีคนแก้เมืองของวันแล้วรันซ้ำ เมืองเก่าจะค้างอยู่โดยไม่มีวันไหนอยู่ที่นั่น)
  select count(*) into n
  from public.trip_destinations d
  where d.trip_id = v_trip
    and not exists (
      select 1 from public.trip_days t
       where t.trip_id = v_trip and t.city_id = d.city_id
    );
  if n > 0 then
    raise exception '% จุดหมายไม่มีวันไหนอยู่ในเมืองนั้นเลย — ค้างจากรอบก่อน ให้ลบทิ้งก่อนรันซ้ำ', n;
  end if;

  -- ⑥ ลำดับต้องต่อเนื่องจาก 0 — ถ้ามีช่องว่างแปลว่า row_number ไม่ได้ทำงานตามที่คิด
  select count(*) into n from (
    select rank, row_number() over (order by rank) - 1 as expected
    from public.trip_destinations where trip_id = v_trip
  ) y where y.rank <> y.expected;
  if n > 0 then raise exception 'ลำดับจุดหมายไม่ต่อเนื่อง % แถว', n; end if;

  -- ⑦ 🎯 เกณฑ์เชิงพฤติกรรม — ข้อที่ก้อนนี้มีอยู่เพื่อมัน
  --    `isPlatformTrip` = `cities.length > 0` → ต้อง > 0 ไม่งั้นหน้าแผนยังขึ้นแบนเนอร์เหมือนเดิม
  --    **นี่คือข้อที่ทำให้ก้อนนี้ "เสร็จ" ไม่ใช่ข้อ ④ ที่แค่นับแถว**
  if n_city = 0 then
    raise exception 'ไม่มีจุดหมายสักเมือง — หน้าแผนจะยังถือว่าไม่ใช่ทริปแพลตฟอร์ม';
  end if;

  raise notice 'E7 · trip_destinations % แถว จาก % วัน — เมือง: %',
    n_city, n_days,
    (select string_agg(c.legacy_slug, ' → ' order by d.rank)
       from public.trip_destinations d
       join public.catalog_cities c on c.id = d.city_id
      where d.trip_id = v_trip);
end $e7$;

commit;
