-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 8: day.events 18 → trip_stops kind='event' × 2 แผน = 36 แถว    │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- 🔴 **ไฟล์นี้ถูกสร้างด้วยเครื่อง ห้ามแก้ด้วยมือ** — แก้ที่ `supabase-platform/e7/gen/gen_08_events.mts` แล้วสร้างใหม่
--    ต้นทาง: `/Users/park/plan-korea/data/itinerary.ts` (branch `main`)
--    **git blob `09e85095b35951afb5732431639d4900c85c8e06`**
--    ตรวจ: `git -C /Users/park/plan-korea hash-object data/itinerary.ts` ต้องได้ค่าเดียวกัน
--    🔴 **ต้องใส่ `-C` ให้ตรงทรี** — ไฟล์ชื่อเดียวกันมีอยู่ทั้งสองทรีและ blob ไม่เท่ากัน
--    🎯 หมุดนี้ทำให้ *"SQL ที่ generate แล้วล้าสมัย"* ตรวจได้ด้วยคำสั่งเดียว แทนที่จะต้องเชื่อ
--
-- ต้องรัน `01` (วัน+แผน) และ `02` (custom_places — `home-base`) ก่อน
--
-- ── เหตุการณ์ 18 รายการ · แยกตาม kind ──
--   checkin      2
--   deadline     2
--   flight       5
--   layover      2
--   transfer     5
--   (ไม่มี kind) 2
--   🔴 `transfer` → `move` (`column-map.md:410` — ชนกับ `trip_stops.kind='transfer'`)
--   🔴 2 แถวไม่มี `kind` เลย → `event_kind is null` ซึ่ง `column-map.md:410` รับรองว่าเกิดจริง
--
-- ── 🔴 การตัดสินที่ต้องมีคนเห็น: events ลง **ทั้งสองแผน** ────────────────────
--   `trip_stops.plan_id` เป็น **not null** → เหตุการณ์ต้องสังกัดแผน
--   แต่ `DayEvent` ในระบบเก่าอยู่บน `Day` **ไม่ได้อยู่บนแผน** — เที่ยวบินเป็นข้อเท็จจริงของทริป
--   → ลงแผนเดียว = สลับแผนแล้ว **ตารางบินหายทั้งวัน** ซึ่งผิดแน่ ๆ
--   → ลงทั้งสองแผน = ซ้ำ 2 ชุด · แก้ชุดหนึ่งอีกชุดไม่ตาม
--   **เลือกอย่างหลัง** เพราะเป็นแบบเดียวกับ `trip_day_plan_settings` ที่ `D69` รับไปแล้ว
--   (`usePlans.ts:104` ก๊อปตั้งค่ารายวันต่อแผนจริงในโค้ดวันนี้)
--   ⚠️ **ยังไม่มี D number** — ส่ง P5/P8 ให้ตัดสินว่าควรมีไหม · ถ้าตัดสินเป็นอย่างอื่น
--      แก้ที่ generator แล้วสร้างใหม่ **ไม่ต้องไล่แก้ SQL ทีละแถว**
--
-- rank = `'E' || lpad(idx,4,'0') || 'V'` → `E0000V`…
--   · ผ่าน `trip_stops_rank_shape` (`^[0-9A-Za-z]+$` · ไม่ลงท้าย `0`)
--   · ไม่ชนกับ rank ของจุดแวะ (`0000V`…) และเรียงต่อท้ายเสมอ
--   · **ไม่ผูกกับเวลาโดยตั้งใจ** (`D81` ③.๒) — คิวรีที่หาขอบใช้ min/max ของเวลา ไม่ใช่ rank

begin;

create or replace function pg_temp.lid(kind text, id text) returns uuid
  language sql immutable as $$ select md5(kind || ':' || id)::uuid $$;

do $e7$
declare
  v_owner uuid := nullif(current_setting('e7.owner_uuid', true), '')::uuid;
  v_trip  uuid := pg_temp.lid('trip', 'korea-2026-10');
  n int; n_plans int; expected int;
begin
  if v_owner is null then raise exception 'ต้องตั้ง e7.owner_uuid ก่อน'; end if;

  select count(*) into n_plans from public.trip_plans where trip_id = v_trip;
  if n_plans = 0 then raise exception 'ยังไม่มีแผน — รัน 01 ก่อน'; end if;

  with ev(day_key, idx, event_kind, t_start, t_end, bound, offs,
          title, title_en, icon, detail, alert, editable, place_id,
          f_no, f_from, f_to, f_from_en, f_to_en,
          l_bag, l_imm, l_leaves, l_term) as (values
  ('d0', 0, 'move', '07:30', null, null, 0, 'ออกจากที่พัก ไปสุวรรณภูมิ', 'Leave home for Suvarnabhumi', '🏠', 'เผื่อ ~1 ชม. 25 น. ให้ถึงสนามบิน 08:55 · เช้าวันอาทิตย์ถนนปกติโล่ง · วิธีเดินทางกับเวลาที่เผื่อไว้อยู่ในรายละเอียดของที่พัก (แตะแถวนี้) · เวลานี้เป็นคำแนะนำ ปรับเองได้', false, true, 'home-base', null, null, null, null, null, null, null, null, null),
  ('d0', 1, 'checkin', '08:55', null, null, 0, 'ถึงสุวรรณภูมิ (เช็คอิน VN610)', 'Arrive Suvarnabhumi — check in VN610', '🛫', 'เผื่อ 3 ชม. ก่อนบิน — บินระหว่างประเทศช่วงเที่ยงคนแน่น', false, true, 'airport-bkk', null, null, null, null, null, null, null, null, null),
  ('d0', 2, 'flight', '11:55', '13:55', null, 0, 'VN610 กรุงเทพ (สุวรรณภูมิ) → ฮานอย', 'VN610 Bangkok (BKK) → Hanoi (HAN)', '✈️', 'เวียดนามแอร์ไลน์ · 2 ชม. · เวลาไทย = เวลาเวียดนาม (ไม่ต้องปรับนาฬิกา)', false, false, 'airport-han', 'VN610', 'BKK', 'HAN', 'Bangkok (Suvarnabhumi)', 'Hanoi (Noi Bai)', null, null, null, null),
  ('d0', 3, 'layover', '13:55', '01:15', null, 0, 'พักเครื่องที่ฮานอย 11 ชม. 20 น.', 'Layover in Hanoi — 11 h 20 m', '⏳', 'ยาวพอออกไปเที่ยวเมืองเก่าได้สบายๆ แล้วกลับมาขึ้น VN428 ตี 1:15', false, false, 'airport-han', null, null, null, null, null, 'through-checked', 'required-to-exit', true, false),
  ('d0', 4, 'move', '15:30', null, 'before', 0, 'ถึงย่านเมืองเก่า — เริ่มจากโบสถ์เซนต์โจเซฟ', 'Arrive Hanoi Old Quarter — start at St. Joseph''s Cathedral', '🚕', 'ผ่าน ตม. (ไม่ต้องรับกระเป๋า เช็คทะลุถึงกิมแฮแล้ว) · Grab Car จากโหน่ยบ่าย ~40-50 นาที ลงรถแถวโบสถ์หิน — ลากที่เที่ยวฮานอยจากคลังมาแทรกด้านล่างได้เลย (โบสถ์เซนต์โจเซฟ → ตรอกทางรถไฟ → เฝอ 10/บุ๋นจ่า → ทะเลสาบฮว่านเกี๋ยม/ถนนคนเดิน → บั๋นหมี่ 25)', false, true, 'hanoi-st-joseph', null, null, null, null, null, null, null, null, null),
  ('d0', 5, 'deadline', '21:00', null, 'after', 0, 'ออกจากถนนคนเดินกลับสนามบิน Noi Bai (T2)', 'Leave the Walking Street for Noi Bai Airport (T2)', '🚕', 'นั่ง Grab กลับสนามบิน ~40-50 นาที ถึงราว 21:50 · เผื่อเวลาอาบน้ำที่ Sông Hồng Premium Lounge ก่อนขึ้นเครื่องตี 1:15 · อยากคุมเวลาแม่นกว่านี้ให้แทรกแถว “✈️ ไปสนามบิน” ท้ายวัน แล้วระบบจะคำนวณจากเวลาเดินทางจริงให้', true, true, 'airport-han', null, null, null, null, null, null, null, null, null),
  ('d0', 6, null, '21:50', '00:30', null, 0, 'อาบน้ำพักผ่อนที่ Sông Hồng Premium Lounge', 'Shower & rest at Song Hong Premium Lounge', '🚿', 'T2 Airside ชั้น 4 ใกล้ Gate 28-30 · ใช้สิทธิ์ LoungeKey ฟรีด้วยบัตร JCB Platinum/Ultimate + Boarding Pass — อาบน้ำอุ่น สระผม เปลี่ยนชุด ทานของว่าง/เครื่องดื่ม เอนหลังพักผ่อนรอขึ้นเครื่อง', false, false, 'airport-han', null, null, null, null, null, null, null, null, null),
  ('d0', 7, 'flight', '01:15', '07:05', null, 1, 'VN428 ฮานอย → กิมแฮ (ปูซาน) — ออกตี 1:15 ของวันที่ 12', 'VN428 Hanoi (HAN) → Busan (PUS) — departs 01:15 on 12 Oct', '✈️', '3 ชม. 50 น. · นอนบนเครื่อง · เกาหลีเร็วกว่าไทย 2 ชม. (07:05 ที่เกาหลี = 05:05 ไทย)', false, false, 'airport-pus', 'VN428', 'HAN', 'PUS', 'Hanoi (Noi Bai)', 'Busan (Gimhae)', null, null, null, null),
  ('d1', 0, 'flight', '07:05', null, null, 0, 'VN428 ลงที่กิมแฮ (ปูซาน)', 'VN428 arrives Busan (PUS)', '🛬', 'ผ่าน ตม. + รับกระเป๋า ~1 ชม. · เข้าเมืองด้วยสาย BGL/รถไฟฟ้าสาย 2 หรือลิมูซีน ~45-60 น.', false, false, 'airport-pus', 'VN428', 'HAN', 'PUS', 'Hanoi (Noi Bai)', 'Busan (Gimhae)', null, null, null, null),
  ('d1', 1, 'move', '10:00', null, 'before', 0, 'ถึงย่านซอมยอน (โดยประมาณ)', 'Arrive Seomyeon, Busan (approx.)', '🚌', 'ออกจากกิมแฮ ~08:30 หลังผ่าน ตม./รับกระเป๋า · Light Rail (BGL) ต่อรถไฟฟ้าสาย 2 หรือแท็กซี่ ~1 ชม. 30 น. รวมรอ · ปรับเวลานี้ได้ที่ช่อง “🕐 ออกเดินทาง” ถ้าผ่าน ตม. เร็ว/ช้ากว่าที่เผื่อไว้', false, true, 'busan-seomyeon', null, null, null, null, null, null, null, null, null),
  ('d10', 0, 'deadline', '05:45', null, 'before', 0, 'เช็คเอาต์ + ออกจากโรงแรมโซล', 'Check out and leave the Seoul hotel', '🧳', 'เผื่อเวลาเดินไปสถานี/รอรถ — ถ้าโรงแรมอยู่ไกลสถานี AREX ให้ออกเร็วกว่านี้อีก 15-20 น. · แทรกแถว “✈️ ไปสนามบิน” ท้ายวันแล้วระบบจะคำนวณเวลาออกจริงจากพิกัดโรงแรมที่เลือกไว้ให้', true, true, '@hotel', null, null, null, null, null, null, null, null, null),
  ('d10', 1, 'move', '06:15', '07:15', null, 0, 'AREX โซล → อินชอน (ICN)', 'AREX Seoul → Incheon (ICN)', '🚆', 'ด่วน (Express) จากสถานีโซล 43 น. รอบแรก ~05:20 · ธรรมดา (All-stop) ~59 น. ขึ้นได้จากฮงแด/ควังฮวามุนสายตรง · หรือลิมูซีนบัสหน้าโรงแรมถ้าใกล้กว่า · ⚠️ เช็คอิน/โหลดกระเป๋าที่สถานีโซล (City Airport Check-in) ใช้กับ VN409 ไม่ได้ — บริการนี้รับเฉพาะ KE/OZ/7C/TW/RS/BX/LJ/ZE/LH ต้องไปเช็คอินที่ ICN เหมือนปกติ', false, true, 'station-seoul', null, null, null, null, null, null, null, null, null),
  ('d10', 2, 'checkin', '07:35', null, 'after', 0, 'ถึง ICN — เช็คอิน VN409', 'Arrive ICN — check in VN409', '🛂', 'เผื่อ 3 ชม. ก่อนบิน · เผื่อเวลาคืน T-money / ขอคืนภาษี (Tax refund) ก่อนเข้าเกต', false, true, 'airport-icn', null, null, null, null, null, null, null, null, null),
  ('d10', 3, 'flight', '10:35', '13:45', null, 0, 'VN409 อินชอน → โฮจิมินห์', 'VN409 Incheon (ICN) → Ho Chi Minh City (SGN)', '✈️', '5 ชม. 10 น. · เวียดนามช้ากว่าเกาหลี 2 ชม. (13:45 ที่เวียดนาม = 15:45 เกาหลี)', false, false, 'airport-sgn', 'VN409', 'ICN', 'SGN', 'Seoul (Incheon)', 'Ho Chi Minh City (Tan Son Nhat)', null, null, null, null),
  ('d10', 4, 'layover', '13:45', '16:50', null, 0, 'ต่อเครื่องที่โฮจิมินห์ 3 ชม. 5 น.', 'Layover in Ho Chi Minh City — 3 h 5 m', '⏳', 'อยู่ในเขต transit ของอาคารระหว่างประเทศ ไม่ต้องออกไปไหน · เผื่อเวลาตรวจความปลอดภัยรอบสอง', false, false, 'airport-sgn', null, null, null, null, null, 'through-checked', 'none', false, false),
  ('d10', 5, null, '14:00', '16:00', null, 0, 'พักที่ Rose Business Lounge (SGN, Terminal 2)', 'Rest at Rose Business Lounge (SGN, Terminal 2)', '🛋️', 'อยู่ฝั่ง international airside ใกล้ Gate 8-9 · ใช้สิทธิ์ LoungeKey ฟรีด้วยบัตร JCB Platinum/Ultimate + Boarding Pass (โควตาเดียวกับที่ใช้ตอนขาไปที่ฮานอย) · บุฟเฟต์อาหารเวียดนาม/นานาชาติ + เก้าอี้นวด · ออกไปเกตราว 16:00-16:10 เผื่อเดินไกล', false, false, 'airport-sgn', null, null, null, null, null, null, null, null, null),
  ('d10', 6, 'flight', '16:50', '18:30', null, 0, 'VN607 โฮจิมินห์ → กรุงเทพ (สุวรรณภูมิ)', 'VN607 Ho Chi Minh City (SGN) → Bangkok (BKK)', '🛬', '1 ชม. 40 น. · ถึงไทย 18:30', false, false, 'airport-bkk', 'VN607', 'SGN', 'BKK', 'Ho Chi Minh City (Tan Son Nhat)', 'Bangkok (Suvarnabhumi)', null, null, null, null),
  ('d10', 7, 'move', '20:15', null, null, 0, 'กลับถึงที่พัก — จบทริป', 'Home — end of trip', '🏠', 'เผื่อ ~1 ชม. 45 น. จากล้อแตะ 18:30: ผ่าน ตม.ไทย + รอกระเป๋า ~45-60 น. แล้ว ARL/แท็กซี่เข้าเมืองอีก ~40-50 น. · เวลานี้เป็นคำแนะนำ ปรับเองได้', false, true, 'home-base', null, null, null, null, null, null, null, null, null)
  )
  insert into public.trip_stops (
    id, trip_id, plan_id, trip_day_id, rank, kind,
    catalog_place_id, custom_place_id, place_ref,
    event_kind, schedule_bound, fixed_start_time, fixed_end_time, day_offset,
    title, title_en, icon, note, is_alert, time_is_flexible,
    flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
    layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change,
    added_by_user, updated_at
  )
  select
    pg_temp.lid('event', p.id::text || ':' || e.day_key || '#' || e.idx),
    v_trip, p.id, pg_temp.lid('day', e.day_key),
    'E' || lpad(e.idx::text, 4, '0') || 'V', 'event',
    -- `@hotel` → place_ref · ที่เหลือแยกด้วย *สมาชิกภาพ* ไม่ใช่ prefix (ดูก้อน 03)
    case when e.place_id <> '@hotel'
          and not exists (select 1 from legacy.custom_places cp where cp.id = e.place_id)
         then (select c.id from public.catalog_places c where c.legacy_slug = e.place_id) end,
    case when e.place_id <> '@hotel'
          and exists (select 1 from legacy.custom_places cp where cp.id = e.place_id)
         then pg_temp.lid('custom_place', e.place_id) end,
    case when e.place_id = '@hotel' then 'hotel' end,
    e.event_kind, e.bound, e.t_start, e.t_end, e.offs,
    e.title, e.title_en, e.icon, e.detail, e.alert, e.editable,
    e.f_no, e.f_from, e.f_to, e.f_from_en, e.f_to_en,
    e.l_bag, e.l_imm, e.l_leaves, e.l_term,
    v_owner, now()
  from ev e cross join public.trip_plans p
  where p.trip_id = v_trip;

  -- ── ตรวจ ────────────────────────────────────────────────────────────────
  expected := 18 * n_plans;
  select count(*) into n from public.trip_stops where trip_id = v_trip and kind = 'event';
  if n <> expected then raise exception 'events ต้องได้ % แถว (18 × % แผน) ได้ %', expected, n_plans, n; end if;

  -- 🔴 ทุกแถวต้องหาที่ลงได้ — คลัง · custom · หรือ place_ref · **ห้ามเป็น 0 ทั้งสามช่อง**
  --    `place_by_kind` ยอมให้ event มี 0 ช่องได้ → **แถวที่หาไม่เจอจะผ่าน constraint เงียบ ๆ**
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and kind = 'event'
     and catalog_place_id is null and custom_place_id is null and place_ref is null;
  if n > 0 then raise exception '% แถว event ไม่มีที่ลงเลยสักช่อง — placeId หาไม่เจอ', n; end if;

  -- `home-base` ต้องลงฝั่ง custom จริง (2 แถวต่อแผน) — เคสที่กันการกลับไปเทียบ prefix
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and kind = 'event' and custom_place_id is not null;
  if n <> 2 * n_plans then
    raise exception 'event ที่ชี้ custom place ต้องได้ % แถว ได้ % — home-base หลุดไปฝั่งคลัง?', 2 * n_plans, n;
  end if;

  -- ทุกแผนต้องได้ครบเท่ากัน — ไม่ใช่ยอดรวมตรงแต่กระจุกที่แผนเดียว
  select count(*) into n from (
    select plan_id from public.trip_stops where trip_id = v_trip and kind = 'event'
     group by plan_id having count(*) <> 18
  ) x;
  if n > 0 then raise exception '% แผนได้ events ไม่ครบ 18 แถว', n; end if;

  raise notice 'E7 · events % แถว (18 × % แผน) · custom % · place_ref %',
    expected, n_plans,
    (select count(*) from public.trip_stops where trip_id=v_trip and kind='event' and custom_place_id is not null),
    (select count(*) from public.trip_stops where trip_id=v_trip and kind='event' and place_ref is not null);
end $e7$;

commit;
