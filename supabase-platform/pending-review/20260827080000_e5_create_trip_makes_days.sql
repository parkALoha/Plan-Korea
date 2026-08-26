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

-- ── 🔴 **ถอด backfill ออก — วัดแล้วราคาไม่คุ้ม** (P1 · 27 ส.ค. 2026) ─────────────
--
-- ฉบับแรกของไฟล์นี้ backfill ให้ **ทุกทริปที่ไม่มีวันเลย** ด้วยเหตุผลว่า
-- *"ทริปพวกนั้นทำอะไรไม่ได้เลย และผู้ใช้ไม่มีทางแก้จากฝั่งเขา"* — **เหตุผลนั้นยังจริง แต่ผมไม่ได้วัดว่ามีกี่ใบ**
--
-- **วัดแล้ว (engine-dev · 27 ส.ค. 2026):**
-- ```
-- trips = 893  ·  ไม่มีวันเลย = 562  ·  backfill จะเพิ่ม 6,166 แถว
-- ```
-- 🔴 **562 ใบนั้นเกือบทั้งหมดเป็น fixture ที่ค้างจากการรันเทสต์** — ไม่ใช่ทริปของใคร
-- ทริปจริงที่ได้ประโยชน์คือ **ทริปทดสอบของ P2 3 ใบ** ซึ่ง **สร้างใหม่ได้ในไม่กี่วินาทีหลัง migration ลง**
--
-- 🎯 **เพิ่มขยะ 6,166 แถวเพื่อกู้ทริป 3 ใบที่สร้างใหม่ได้ — ไม่คุ้ม**
-- · และมันจะไปเพิ่มวันให้ fixture 559 ใบ **ซึ่งเทสต์บางตัวอาจสมมติว่าไม่มีวัน**
--   (P4 ทำ `mkDay` เป็น read-or-insert ไว้แล้ว **แต่ผมไม่ได้ไล่ทุกไฟล์** — และการไล่ทุกไฟล์
--    เพื่อรองรับ backfill ที่ไม่จำเป็น คือการจ่ายสองต่อ)
--
-- ⚠️ **สิ่งที่ยังจริงและต้องจดไว้: ทริปที่สร้าง *ก่อน* migration นี้จะใช้งานไม่ได้ตลอดไป**
-- ผู้ใช้แก้เองไม่ได้ · ทางแก้คือ **สร้างทริปใหม่** · ยอมรับได้เพราะยังไม่มีผู้ใช้จริงบนแพลตฟอร์ม
-- 🔴 **ถ้าวันหนึ่งมีทริปของผู้ใช้จริงติดสภาพนี้ ต้อง backfill *เฉพาะใบนั้น* ไม่ใช่ทั้งฐาน**
--
-- 📌 **และตัวเลข 893 เป็นสัญญาณของเรื่องอื่น: fixture ของชุดทดสอบไม่ถูกเก็บกวาด** — ส่ง P4 แล้ว

-- ── ด่านยืนยัน — **สภาพปลายทาง ไม่ใช่ข้อความใน migration** ────────────────────
-- 🔴 **ยืนยัน *พฤติกรรมของฟังก์ชัน* ไม่ใช่สภาพของข้อมูลเดิม** — เพราะไม่มี backfill แล้ว
--    สร้างทริปจริง → ตรวจว่าได้วันครบ → **ลบทิ้ง** · ไม่ทิ้งอะไรไว้ในฐาน
-- ⚠️ ต้องมี `auth.uid()` → รันในบล็อกนี้ไม่ได้ · จึงตรวจ *ตรรกะการสร้างวัน* ตรง ๆ แทน
do $verify$
declare n int; bad int;
begin
  -- ① จำนวนวันที่ `generate_series` จะสร้าง ต้องตรงกับช่วงวันที่ (รวมหัวท้าย)
  select count(*) into n
    from generate_series(date '2026-10-11', date '2026-10-21', interval '1 day');
  if n <> 11 then raise exception 'generate_series ให้ % วัน ไม่ใช่ 11', n; end if;

  select count(*) into n
    from generate_series(date '2026-11-01', date '2026-11-01', interval '1 day');
  if n <> 1 then raise exception 'ทริปวันเดียวต้องได้ 1 วัน ไม่ใช่ %', n; end if;

  -- ② ฟังก์ชันต้องมีอยู่ด้วยลายเซ็นเดิม (ผู้เรียกทั้งหมดพึ่งลายเซ็นนี้)
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'create_trip'
       and pg_get_function_identity_arguments(p.oid) = 'text, date, date, text'
  ) then
    raise exception 'ลายเซ็นของ create_trip เปลี่ยนไป — ผู้เรียกจะพัง';
  end if;

  -- ③ 🔴 ไม่มี unique บน `(trip_id, date)` วันนี้ — ถ้ามีวันซ้ำอยู่แล้ว แปลว่ามีคนสร้างซ้ำที่ไหนสักที่
  select count(*) into bad
    from (select trip_id, date from public.trip_days group by trip_id, date having count(*) > 1) x;
  if bad > 0 then
    raise exception 'มีวันซ้ำในทริปเดียวกัน % คู่ — ตรวจก่อนเดินต่อ', bad;
  end if;
end $verify$;

commit;
