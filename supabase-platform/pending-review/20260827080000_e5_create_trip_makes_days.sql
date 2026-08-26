-- ═══════════════════════════════════════════════════════════════════════════
-- `E5` — `create_trip` ต้องสร้าง **วัน** ด้วย ไม่ใช่แค่ทริปกับแผน
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · P3-FE/Perf พิสูจน์ด้วยข้อมูลจริง
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 🔴 ข้อเท็จจริงที่ P3 วัดจาก engine-dev
-- ทริปที่ P2 สร้างผ่าน `POST /api/engine/trips` → **`trip_days` = 0 แถว**
-- `buildDayBridge` ได้ `matched = 0` · `unmatchedLegacy = 11` (เท่าจำนวนวันทั้งหมด)
--
-- **ไม่ใช่ "มีวันแต่จับคู่ไม่ได้" — ไม่มีวันเลยสักวัน**
-- → ทริปที่สร้างใหม่ **ใช้งานไม่ได้ทั้งใบ** · เพิ่มจุดแวะไม่ได้ด้วยซ้ำ (`trip_stops` FK ไป `trip_days`)
--
-- ## 🎯 และเหตุผลที่ไฟล์เดิมเขียนไว้เอง ใช้กับข้อนี้ตรงเป๊ะ (`P-54`)
-- > *"แผนตั้งต้น — **ต้องอยู่ในฟังก์ชันเดียวกัน ไม่ใช่ให้ไคลเอนต์เรียกต่อ**
-- >  ถ้าให้ไคลเอนต์เรียกต่อ: เน็ตหลุดระหว่างสองคำขอ = **ทริปที่ invariant เป็นเท็จ ค้างถาวร**"*
--
-- **"ทริปมีวันครบตามช่วงวันที่ของมัน" เป็น invariant ชนิดเดียวกันเป๊ะ** — และวันนี้มันเป็นเท็จกับทุกทริปใหม่
-- · ที่เขียนแผนไว้แล้วไม่เขียนวัน ไม่ใช่การตัดสินใจ — **เป็นของที่ตกหล่น**
--
-- ## ⚠️ เพดานช่วงวันที่ — และเหตุผลที่ต้องมี
-- `trips_dates_ordered` บังคับแค่ `end >= start` **ไม่มีเพดาน**
-- → พิมพ์ปีผิด (`2036` แทน `2026`) = **3,653 แถวในทรานแซกชันเดียว โดยที่ผู้ใช้ไม่ได้ตั้งใจ**
-- 🔴 **366 ไม่ใช่ตัวเลขที่สวย มันคือ "ปีหนึ่งรวมปีอธิกสุรทิน"** — ทริปที่ยาวกว่านั้นแทบแน่นอนว่าพิมพ์ผิด
--    · ถ้าวันหนึ่งมีคนต้องการจริง **ให้แก้เพดานโดยตั้งใจ** ไม่ใช่ค้นพบว่าไม่มีเพดานตอนฐานบวม
--
-- ## 📌 คำถามที่ยังเปิด — **จงใจไม่ตอบในไฟล์นี้**
-- **แก้ `start_date`/`end_date` ของทริปที่มีอยู่แล้ว ควรเพิ่ม/ลบวันตามไหม**
-- วันนี้ไม่มีอะไรทำให้เลย · การเพิ่มตรงนี้จะเป็นการตัดสินใจที่ซ่อนอยู่ในไฟล์ที่ชื่อว่า "สร้างทริป"
-- → **แยกเป็นงานของตัวเอง** · ลบวันที่มีจุดแวะอยู่ไม่ได้อยู่แล้ว (`D73`) ซึ่งทำให้มันเป็นเรื่องที่ต้องออกแบบจริง
-- ═══════════════════════════════════════════════════════════════════════════

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

create or replace function public.create_trip(
  p_title text,
  p_start_date date,
  p_end_date date,
  p_base_timezone text default null
)
returns public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_trip public.trips;
  v_days int  := (p_end_date - p_start_date) + 1;
begin
  if v_uid is null then
    raise exception 'ต้องล็อกอินก่อนสร้างทริป' using errcode = '42501';
  end if;

  -- 🔴 ตรวจ **ก่อน** เขียนอะไรเลย · `errcode` ให้ route แปลงเป็น `400` ได้โดยไม่ต้องอ่านข้อความ
  if v_days > 366 then
    raise exception 'ช่วงวันที่ยาวเกินไป (% วัน) — สูงสุด 366 วัน', v_days
      using errcode = '22023';
  end if;

  insert into public.trips (created_by, title, start_date, end_date, base_timezone)
  values (
    v_uid,
    p_title,
    p_start_date,
    p_end_date,
    coalesce(nullif(trim(p_base_timezone), ''), 'Asia/Bangkok')
  )
  returning * into v_trip;

  insert into public.trip_members (trip_id, user_id, role, invited_by)
  values (v_trip.id, v_uid, 'owner', v_uid)
  on conflict (trip_id, user_id) do nothing;

  -- `P-54` — แผนตั้งต้นอยู่ในทรานแซกชันเดียวกัน (เหตุผลเต็มอยู่ใน `20260825143958`)
  insert into public.trip_plans (trip_id, name, is_active)
  values (v_trip.id, 'แผน A', true);

  -- 🔴 **วันของทริป — เหตุผลเดียวกับแผน** · หนึ่งแถวต่อหนึ่งวันในช่วง
  --    `timezone` เป็น `null` โดยตั้งใจ = ใช้ `trips.base_timezone` (`D37`)
  --    `city_id` เป็น `null` = ยังไม่รู้ว่าวันนั้นอยู่เมืองไหน — ผู้ใช้เป็นคนตั้ง
  insert into public.trip_days (trip_id, date)
  select v_trip.id, d::date
    from generate_series(p_start_date, p_end_date, interval '1 day') as d;

  return v_trip;
end;
$$;

revoke all on function public.create_trip(text, date, date, text) from public, anon, authenticated;
grant execute on function public.create_trip(text, date, date, text) to authenticated;

-- ── เก็บกวาดทริปที่สร้างไปแล้วตอนฟังก์ชันยังไม่สร้างวัน ────────────────────────
--
-- ⚠️ **แตะข้อมูลที่มีอยู่ — จงใจ และแคบที่สุดเท่าที่ทำได้**
-- เฉพาะทริปที่ **ไม่มีวันเลยสักวัน** · ทริปที่มีวันอยู่แล้วไม่ถูกแตะแม้แต่แถวเดียว
-- 🔴 ไม่ใช่ "ซ่อมให้สวย" — **ทริปพวกนั้นเพิ่มจุดแวะไม่ได้เลย** (`trip_stops` FK ไป `trip_days`)
--    ปล่อยไว้ = ผู้ใช้มีทริปที่เปิดได้แต่ทำอะไรไม่ได้ และไม่มีทางแก้จากฝั่งเขา
insert into public.trip_days (trip_id, date)
select t.id, d::date
  from public.trips t
 cross join lateral generate_series(t.start_date, t.end_date, interval '1 day') as d
 where not exists (select 1 from public.trip_days td where td.trip_id = t.id)
   and (t.end_date - t.start_date) + 1 <= 366;

-- ── ด่านยืนยัน — **สภาพปลายทาง ไม่ใช่ข้อความใน migration** ────────────────────
do $verify$
declare
  bad int;
begin
  -- ทุกทริปต้องมีวันครบตามช่วงของมัน
  select count(*) into bad
    from public.trips t
   where (t.end_date - t.start_date) + 1 <= 366
     and (select count(*) from public.trip_days td where td.trip_id = t.id)
         <> (t.end_date - t.start_date) + 1;
  if bad > 0 then
    raise exception 'ยังมี % ทริปที่จำนวนวันไม่ตรงกับช่วงวันที่', bad;
  end if;

  -- 🔴 และต้องไม่มีวันซ้ำในทริปเดียวกัน — backfill ที่รันสองรอบจะสร้างของซ้ำ
  --    (ไม่มี unique constraint บน `(trip_id, date)` วันนี้ · เคสนี้คือสิ่งที่จับได้แทน)
  select count(*) into bad
    from (select trip_id, date from public.trip_days group by trip_id, date having count(*) > 1) x;
  if bad > 0 then
    raise exception 'มีวันซ้ำในทริปเดียวกัน % คู่ — backfill รันซ้ำหรือ?', bad;
  end if;
end $verify$;

commit;
