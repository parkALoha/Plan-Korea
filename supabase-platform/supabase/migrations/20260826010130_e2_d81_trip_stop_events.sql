-- ═══════════════════════════════════════════════════════════════════════════
-- `D81` — `day.events` ลงเป็น `trip_stops` ที่ `kind='event'` · ปิด `Q7`
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · ดีไซน์จาก P5 + P7 · ราคาของด่านนับใหม่โดย P4
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 แก้มติของตัวเองก่อน: `D81` ⑦ เขียนไว้ผิด และข้อมูลจริงค้านมัน 18/18 ──
-- `D81` ⑦ เขียนว่า *"`kind='event'` **ไม่มีสถานที่** เหมือน `intercity`/`hotel`"*
-- **ผิด** — และมันขัดกับสองอย่างในเอกสารเดียวกัน:
--   1. `column-map.md` แถว `placeId` เขียนเองว่า *"ผูกแถวเข้ากับสถานที่จริง → รูป/แผนที่/นำทาง"*
--   2. `place_ref` ที่ ⑦ สั่งให้เพิ่มเอง **จะไม่มีอะไรให้เป็นทางเลือกแทน ถ้า event ไม่มีสถานที่ได้เลย**
-- ตรวจกับ `data/itinerary.ts` ของทริปจริง: **เหตุการณ์ทั้ง 18 ตัวมี `placeId` ครบทุกตัว**
--   `airport-han` ×4 · `airport-sgn` ×3 · `airport-bkk` ×2 · `airport-pus` ×2
--   `home-base` ×2 (อยู่ใน `custom_places`) · `@hotel` ×1 (= `place_ref='hotel'`) · ที่เหลือเป็นที่เที่ยวจริง
-- ✅ **กติกาที่ถูก: `kind='event'` มีสถานที่ได้ *อย่างมาก 1 ทาง* จาก 3 ทาง** (คลังกลาง · คลังทริป · `place_ref`)
--    ไม่บังคับให้มี เพราะเหตุการณ์อย่าง *"เตือน: เช็คอินออนไลน์เปิดแล้ว"* ไม่มีสถานที่ตามธรรมชาติ
--    · แต่ **วันนี้ข้อมูลจริงคือ 18/18** — ถ้าวันหนึ่งมีแถวที่ไม่มีสถานที่ นั่นคือของใหม่ ไม่ใช่ของเดิม
-- 🎯 **ชนิดเดียวกับ `P-51`: สองประโยคในมติเดียวกัน แต่ละอันมีเหตุผลของตัวเอง และมันขัดกัน**
--
-- ── ② คำที่ห้ามรับมรดก (`D81` ②) — ชื่อในไฟล์นี้จึงไม่ตรงกับชื่อใน TS โดยตั้งใจ ──
-- ```
-- DayEvent.anchor  →  schedule_bound   (`anchor` ชนกับ hotelAnchorId() ของ `P-33`)
-- DayEventKind     →  event_kind       (`transfer` ชนกับ trip_stops.kind='transfer')
-- DayEvent.kind='transfer' → event_kind='move'
-- ```
-- **วันนี้ทั้งคู่อยู่คนละไฟล์จึงไม่ชน · วินาทีที่ลง DDL มันอยู่ตารางเดียวกัน**
--
-- ── ③ ของที่ DDL บังคับให้ไม่ได้ และต้องบังคับที่คิวรี (`D81` ③ · ③.๕) ──
-- ทุกคิวรีที่ถาม *"แถวไหนเป็นคนกำหนดขอบของวัน"* ต้องมีครบสองครึ่ง:
--   `where deleted_at is null`  **และ**  `order by rank, id`
-- ขาด `order by`   → 2 เครื่องเลือก**คนละแถว**
-- ขาด `deleted_at` → 2 เครื่องเลือก**แถวที่ตายแล้วเหมือนกัน** — ผู้ใช้มองไม่เห็นสาเหตุเลย
-- 📌 index ท้ายไฟล์นี้เป็น **partial `where ... and deleted_at is null`** โดยตั้งใจ
--    → คิวรีที่ลืมครึ่งใดครึ่งหนึ่ง **จะไม่ได้ index ตัวนี้** = มีสัญญาณ แทนที่จะเงียบสนิท
--    (ต่างจาก `trip_stops_day_plan_rank_idx` ที่จงใจ**ไม่** partial เพราะกฎ merge ต้องอ่าน tombstone)
--
-- ── ④ ของที่จงใจไม่ทำ ──
-- · **ไม่มี unique "หนึ่ง `before` ต่อวัน"** (`D81` ④) — 2 คนตั้งพร้อมกันแล้วคนหลังต้องไม่ได้ error
-- · **ไม่มี check ว่า `fixed_end_time > fixed_start_time`** — ช่วงต่อเครื่อง 11 ชม. ข้ามเที่ยงคืนได้
--   และ `day_offset` เป็นตัวบอกวัน ไม่ใช่เวลา → เทียบสตริงตรง ๆ จะผิดกับเคสจริง (VN428 ออกตี 1:15)
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

-- ── ยืนยันชื่อ constraint ก่อน drop — ไม่เดา ────────────────────────────────
-- 🔴 `trip_stops_kind_check` เป็นชื่อที่ PG **ตั้งเอง** ตอน `create table` ไม่ใช่ชื่อที่เราตั้ง
--    `drop constraint <ชื่อที่เดา>` ที่ผิด = migration ล้มพร้อมข้อความที่ไม่บอกว่าชื่อจริงคืออะไร
--    → ให้มันล้มพร้อม **รายชื่อจริงทั้งหมด** แทน ครั้งเดียวจบ
do $names$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.trip_stops'::regclass and conname = 'trip_stops_kind_check'
  ) then
    raise exception 'D81: ไม่พบ trip_stops_kind_check — check ที่มีจริงคือ: %',
      (select string_agg(conname, ', ' order by conname) from pg_constraint
        where conrelid = 'public.trip_stops'::regclass and contype = 'c');
  end if;
end $names$;

-- ── `kind` รับค่าใหม่ ────────────────────────────────────────────────────────
alter table public.trip_stops drop constraint trip_stops_kind_check;
alter table public.trip_stops add  constraint trip_stops_kind_check
  check (kind in ('place', 'hotel', 'intercity', 'transfer', 'event'));

-- ── คอลัมน์ของเหตุการณ์ ─────────────────────────────────────────────────────
alter table public.trip_stops
  add column event_kind text
      check (event_kind in ('flight', 'layover', 'checkin', 'deadline', 'move')),

  -- `D81` ② — ชื่อนี้แทน `anchor` เพื่อไม่ชนกับ `hotelAnchorId()`
  add column schedule_bound text
      check (schedule_bound in ('before', 'after')),

  -- รูปแบบเดียวกับ `transfer_target_time` เป๊ะ
  add column fixed_start_time text
      check (fixed_start_time is null or fixed_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column fixed_end_time text
      check (fixed_end_time   is null or fixed_end_time   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  -- เคสจริง: VN428 ออกตี 1:15 = วันถัดไป แต่แสดงบนการ์ดวันก่อน
  -- 🔴 เอกสารที่ยื่นให้ ตม. ต้องขึ้นวันที่ให้ถูก ไม่งั้นวันบินเข้าประเทศคลาดไป 1 วัน
  add column day_offset int not null default 0 check (day_offset between 0 and 3),

  add column title    text check (title    is null or length(title)    between 1 and 200),
  -- ใช้บนหน้า ตม./K-ETA (`E5-AC5`) · จงใจไม่มี `detail_en` ตามที่ `itinerary.ts` เขียนเหตุผลไว้เอง
  add column title_en text check (title_en is null or length(title_en) between 1 and 200),
  add column icon     text check (icon     is null or length(icon)     between 1 and 16),

  add column is_alert         boolean not null default false,
  -- `DayEvent.editable` กลับด้าน: `editable: true` = เวลานี้เป็นคำแนะนำ ปรับได้
  add column time_is_flexible boolean not null default false,

  add column flight_no        text,
  add column flight_from_code text check (flight_from_code is null or flight_from_code ~ '^[A-Z]{3}$'),
  add column flight_to_code   text check (flight_to_code   is null or flight_to_code   ~ '^[A-Z]{3}$'),
  add column flight_from_en   text,
  add column flight_to_en     text,

  add column layover_baggage text
      check (layover_baggage in ('through-checked', 'reclaim')),
  add column layover_immigration text
      check (layover_immigration in ('none', 'required-to-exit')),
  add column layover_leaves_airport  boolean,
  add column layover_terminal_change boolean,

  -- ค่าพิเศษ `"@hotel"` เดิม = ที่พักที่ตื่นมาจากคืนก่อนหน้า · พิกัดมาจาก `trip_hotels` ตอน render
  -- 🔴 **ไม่ใช่ FK และห้ามเป็น FK** — มันชี้ *"คืนไหน"* ไม่ใช่ *"แถวไหน"*
  add column place_ref text check (place_ref in ('hotel'));

-- ── ⑦ `trip_stops_place_by_kind` โตตาม ──────────────────────────────────────
alter table public.trip_stops drop constraint trip_stops_place_by_kind;
alter table public.trip_stops add  constraint trip_stops_place_by_kind check (
  case kind
    when 'intercity' then num_nonnulls(catalog_place_id, custom_place_id) = 0
    when 'hotel'     then num_nonnulls(catalog_place_id, custom_place_id) = 0
    -- 🔴 `<= 1` ไม่ใช่ `= 1` — ดูหัวไฟล์ ข้อ ① · และ `place_ref` นับรวมอยู่ในนี้
    when 'event'     then num_nonnulls(catalog_place_id, custom_place_id, place_ref) <= 1
    else                  num_nonnulls(catalog_place_id, custom_place_id) = 1
  end
);

-- ── คอลัมน์ของเหตุการณ์ ต้องว่างเมื่อไม่ใช่เหตุการณ์ ─────────────────────────
-- 🔴 **ทิศนี้สำคัญกว่าทิศตรงข้าม** — ถ้าไม่มี check นี้ จุดแวะปกติจะถือ `flight_no` ได้
--    แล้วหน้า ตม. จะอ่านเจอเที่ยวบินบนแถวที่ไม่ใช่เที่ยวบิน **โดยไม่มีอะไรค้านเลย**
alter table public.trip_stops add constraint trip_stops_event_columns_only_on_events check (
  kind = 'event' or num_nonnulls(
    event_kind, schedule_bound, fixed_start_time, fixed_end_time,
    title, title_en, icon,
    flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
    layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change,
    place_ref
  ) = 0
);
-- `day_offset`/`is_alert`/`time_is_flexible` เป็น `not null default` จึงนับด้วย `num_nonnulls` ไม่ได้
alter table public.trip_stops add constraint trip_stops_event_flags_only_on_events check (
  kind = 'event' or (day_offset = 0 and not is_alert and not time_is_flexible)
);

-- ── เหตุการณ์ต้องมีของที่ UI อ่านออก ────────────────────────────────────────
-- `DayEvent` บังคับ `time` · `icon` · `title` ที่ระดับ type อยู่แล้ว → ฐานบังคับด้วย
-- 🔴 `event_kind` **ไม่**อยู่ในนี้ เพราะ `DayEvent.kind` เป็น optional จริง ๆ
--    (*"ไม่ใส่ = เหตุการณ์ทั่วไป แสดงเป็นแถวข้อความเฉย ๆ"* — `itinerary.ts:64`)
alter table public.trip_stops add constraint trip_stops_event_needs_core check (
  kind <> 'event' or (fixed_start_time is not null and title is not null and icon is not null)
);

-- ── ฟิลด์ของเที่ยวบิน/ช่วงต่อเครื่อง: ครบชุดหรือไม่มีเลย และเฉพาะ kind ของมัน ──
-- 🎯 ครึ่งชุดคือสิ่งที่หน้า ตม. อ่านแล้วพิมพ์ช่องว่างลงเอกสารจริง โดยไม่มี error ที่ไหนเลย
alter table public.trip_stops add constraint trip_stops_flight_fields_complete check (
  case
    when event_kind = 'flight'
      then num_nonnulls(flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en) = 5
    else num_nonnulls(flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en) = 0
  end
);
alter table public.trip_stops add constraint trip_stops_layover_fields_complete check (
  case
    when event_kind = 'layover'
      then num_nonnulls(layover_baggage, layover_immigration,
                        layover_leaves_airport, layover_terminal_change) = 4
    else num_nonnulls(layover_baggage, layover_immigration,
                      layover_leaves_airport, layover_terminal_change) = 0
  end
);

-- ── index ของคิวรี "แถวไหนกำหนดขอบของวัน" ───────────────────────────────────
-- 🔴 partial โดยตั้งใจ (ดูหัวไฟล์ ข้อ ③) · `rank, id` ตรงกับ tie-break ของ `D6`/`E2-AC8`
create index trip_stops_schedule_bound_idx
  on public.trip_stops (trip_day_id, plan_id, schedule_bound, rank, id)
  where schedule_bound is not null and deleted_at is null;

-- ── grant ระดับคอลัมน์ — เพิ่มของใหม่เข้าลิสต์เดิมทั้ง insert และ update ─────
-- 🔴 `trip_id` ยังไม่อยู่ฝั่ง `update` เหมือนเดิม (P7 · `D70`)
revoke insert, update on public.trip_stops from authenticated;
grant insert (trip_id, plan_id, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
              dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
              visited_at, photo_path, transfer_target_time, transfer_target_label, legacy_added_by,
              event_kind, schedule_bound, fixed_start_time, fixed_end_time, day_offset,
              title, title_en, icon, is_alert, time_is_flexible,
              flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
              layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change,
              place_ref)
  on public.trip_stops to authenticated;
grant update (plan_id, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
              dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
              visited_at, photo_path, transfer_target_time, transfer_target_label, deleted_at,
              event_kind, schedule_bound, fixed_start_time, fixed_end_time, day_offset,
              title, title_en, icon, is_alert, time_is_flexible,
              flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
              layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change,
              place_ref)
  on public.trip_stops to authenticated;

-- ── ตรวจในทรานแซกชันเดียวกัน ก่อน commit ────────────────────────────────────
-- 🎯 `D82` — เครื่องมือที่ถามของจริง ถามห้องว่างได้เอง → ยืนยัน *จำนวน* ไม่ใช่แค่ "ไม่ error"
do $verify$
declare
  n_cols int;
  n_ins  int;
  n_upd  int;
begin
  select count(*) into n_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'trip_stops'
     and column_name in ('event_kind','schedule_bound','fixed_start_time','fixed_end_time',
                         'day_offset','title','title_en','icon','is_alert','time_is_flexible',
                         'flight_no','flight_from_code','flight_to_code','flight_from_en',
                         'flight_to_en','layover_baggage','layover_immigration',
                         'layover_leaves_airport','layover_terminal_change','place_ref');
  if n_cols <> 20 then
    raise exception 'D81: คาดว่าเพิ่ม 20 คอลัมน์ แต่นับได้ %', n_cols;
  end if;

  select count(*) into n_ins
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'trip_stops'
     and grantee = 'authenticated' and privilege_type = 'INSERT';
  select count(*) into n_upd
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'trip_stops'
     and grantee = 'authenticated' and privilege_type = 'UPDATE';
  -- insert เดิม 18 + 20 = 38 · update เดิม 17 + 20 = 37
  if n_ins <> 38 or n_upd <> 37 then
    raise exception 'D81: grant ระดับคอลัมน์ไม่ตรง — insert=% (คาด 38) update=% (คาด 37)', n_ins, n_upd;
  end if;

  -- 🔴 ถ้าเผลอ `grant update` ทั้งตาราง `trip_id` จะหลุดเข้ามา — ตรวจตรง ๆ ว่ามันไม่อยู่
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'trip_stops'
       and grantee = 'authenticated' and privilege_type = 'UPDATE' and column_name = 'trip_id'
  ) then
    raise exception 'D81: trip_id หลุดเข้าฝั่ง update — ย้ายแถวข้ามทริปได้';
  end if;
end $verify$;

commit;
