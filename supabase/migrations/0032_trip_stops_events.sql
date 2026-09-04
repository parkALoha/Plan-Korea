-- ═══════════════════════════════════════════════════════════════════════════
-- เวลาตายตัว (เที่ยวบิน/เช็คอิน/พักเครื่อง/เดดไลน์) ลงเป็น trip_stops kind='event'
-- ผู้ใช้สั่ง 4 ก.ย. 2026 · เขียนโดย P2-UI/UX · **ดีไซน์ยกมาจาก `D81` ของ P1 บน branch platform**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมต้องมีใบนี้ ────────────────────────────────────────────────────────
-- ผู้ใช้พบเองจากการลองใช้: แถวเที่ยวบิน/เช็คอิน/เดดไลน์ **สร้างผ่านหน้าเว็บไม่ได้เลยสักทาง**
--   จุดแวะ      trip_stops ในฐาน        จุดเขียนจาก UI 5 แห่ง
--   เวลาตายตัว  data/itinerary.ts       จุดเขียนจาก UI 0 แห่ง · 35 รายการพิมพ์มือลงไฟล์โค้ด
-- ⇒ *"นึกถึงเวลาที่เราสร้างทริปใหม่ด้วยตัวเองผ่านหน้าบ้าน มันคงไม่ได้แบบนี้ถูกไหม"* — ถูก
-- ขอบเขตที่ผู้ใช้ขยายให้ P2 บันทึกไว้ที่ `TEAM.md §3.5` (commit 7d12b27)
--
-- ── 🔴 ใบนี้เป็น "ขั้น 1" ของแผนสองขั้น — เพิ่มอย่างเดียว ไม่ถอดอะไร ─────────
-- `data/itinerary.ts` **ยังทำงานเหมือนเดิม 100%** หลังรันใบนี้ · ยังไม่มีใครอ่านคอลัมน์ใหม่
-- ⇒ **ย้อนได้ด้วยการไม่ใช้ ไม่ต้อง rollback** — สำคัญเพราะทริปจริงคือ 11–21 ต.ค. (อีก ~5 สัปดาห์)
-- ขั้น 2 (ย้าย 35 รายการเข้าฐาน แล้วถอดออกจากไฟล์) เป็นคนละใบ และต้องพิสูจน์ก่อนว่า
-- **ตารางเวลาทุกจุดของทั้ง 11 วันเท่าเดิมเป๊ะ รวม day_offset** (P1 เพิ่มข้อ day_offset ให้)
--
-- ── ที่ยกมาจาก `D81` และเหตุผลของแต่ละชื่อ ─────────────────────────────────
-- ```
-- DayEvent.anchor        → schedule_bound    `anchor` ชนกับ hotelAnchorId() (`P-33`)
-- DayEventKind           → event_kind        `transfer` ชนกับ trip_stops.kind='transfer'
-- DayEvent.kind='transfer' → event_kind='move'
-- DayEvent.editable      → time_is_flexible  **กลับด้าน** (`editable: true` = เวลาแนะนำ ปรับได้)
-- ```
-- **วันนี้ทั้งคู่อยู่คนละไฟล์จึงไม่ชน · วินาทีที่ลง DDL มันอยู่ตารางเดียวกัน**
--
-- ── 🔴 ที่ต่างจากฉบับ platform เพราะสคีมาสองฝั่งไม่เหมือนกัน (ตรวจเองจาก migration ทุกใบ) ──
-- ```
-- platform  catalog_place_id / custom_place_id  uuid nullable · มี deleted_at · rank · trip_day_id
-- main      place_id text NOT NULL เดี่ยว        · ไม่มี deleted_at · order_index · day_id
-- ```
-- · **ไม่แตะ `place_id` และไม่ทำเป็น nullable** — `0017_trip_stops_intercity.sql:2` วางบรรทัดฐาน
--   ไว้แล้วว่า *"kind='intercity': place_id เป็นค่าว่าง"* ⇒ event ที่ไม่มีสถานที่ใช้ `''` ตามของเดิม
--   🎯 การเปลี่ยน NOT NULL บนตารางที่มีข้อมูลทริปจริงอยู่ = ความเสี่ยงที่ไม่จำเป็น
-- · **ไม่มี constraint `trip_stops_place_by_kind` บน main ให้แก้** (ฝั่ง platform มี) จึงไม่ drop อะไรเลย
-- · index ไม่ partial ด้วย `deleted_at` เพราะ **main ไม่มีคอลัมน์นั้น** (ไม่มี soft delete)
--
-- ── ⚠️ ที่จงใจไม่ทำ ────────────────────────────────────────────────────────
-- · **ไม่เพิ่ม CHECK ให้ `kind`** ทั้งที่ `main` ไม่มี ⇒ พิมพ์ `'evnet'` ผิดก็ลงได้ ไม่มีอะไรค้าน
--   เหตุผล: การเพิ่ม CHECK ต้องนับค่าที่มีอยู่จริงในฐานทริปก่อน ไม่งั้น migration ล้มกลางทาง
--   และ `0025_trip_stops_transfer.sql:8` เลือกทางเดียวกันมาแล้ว (*"kind เป็น text อิสระอยู่แล้ว"*)
--   📌 **จดเป็นความเสี่ยงที่รับไว้ ไม่ใช่ของที่ลืม** — ถ้าจะปิด ต้องเป็นใบของตัวเองที่นับก่อน
-- · **ไม่มี unique "หนึ่ง `before` ต่อวัน"** (`D81` ④) — 2 คนตั้งพร้อมกันแล้วคนหลังต้องไม่ได้ error
-- · **ไม่มี check `fixed_end_time > fixed_start_time`** — ช่วงต่อเครื่อง 11 ชม. ข้ามเที่ยงคืนได้
--   และ `day_offset` เป็นตัวบอกวัน ไม่ใช่เวลา → เทียบสตริงตรง ๆ จะผิดกับเคสจริง (VN428 ออกตี 1:15)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดฐาน ───────────────────────────────────────────────────────
-- 🔴 `main` ไม่มี `app.project_identity` แบบที่ platform ใช้กันเรื่องนี้
--    สิ่งที่ตรวจได้จริงคือ *รูปของฐาน* — ถ้าไม่ใช่ฐานของเว็บทริปนี้ ตารางพวกนี้จะไม่ครบ
--    ไม่ได้กันได้ 100% แต่กันเคสที่เกิดจริงได้: ชี้ผิดโปรเจกต์แล้วเจอฐานเปล่า/ฐานอื่น
do $guard$
begin
  if to_regclass('public.trip_stops') is null or to_regclass('public.trip_plans') is null then
    raise exception 'ผิดฐาน: ไม่พบ trip_stops/trip_plans — ใบนี้ใช้กับฐานของเว็บทริปเกาหลีเท่านั้น';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trip_stops' and column_name = 'kind'
  ) then
    raise exception 'ผิดลำดับ: ยังไม่มีคอลัมน์ kind — ต้องรัน 0017_trip_stops_intercity.sql ก่อน';
  end if;
end $guard$;

-- ── คอลัมน์ของเหตุการณ์ ────────────────────────────────────────────────────
-- ใช้ `if not exists` ทุกตัวตามแบบของ migration ใบอื่นในโฟลเดอร์นี้ (0017 · 0025 · 0027 …)
-- ⇒ รันซ้ำได้โดยไม่ล้ม ซึ่งสำคัญเพราะ **ผู้ใช้เป็นคนรัน `db:push` เอง** (PLAN.md หัวข้อ 5)
alter table public.trip_stops
  add column if not exists event_kind text,
  add column if not exists schedule_bound text,
  add column if not exists fixed_start_time text,
  add column if not exists fixed_end_time text,
  -- เคสจริง: VN428 ออกตี 1:15 = วันถัดไป แต่แสดงบนการ์ดวันก่อน
  -- 🔴 เอกสารที่ยื่นให้ ตม. ต้องขึ้นวันที่ให้ถูก ไม่งั้นวันบินเข้าประเทศคลาดไป 1 วัน
  add column if not exists day_offset int not null default 0,
  add column if not exists title text,
  -- ใช้บนหน้า ตม./K-ETA · จงใจไม่มี `detail_en` ตามที่ `itinerary.ts` เขียนเหตุผลไว้เอง
  add column if not exists title_en text,
  add column if not exists icon text,
  add column if not exists is_alert boolean not null default false,
  -- 🔴 กลับด้านจาก `DayEvent.editable` — `editable: true` = "เวลานี้เป็นคำแนะนำ ปรับได้"
  add column if not exists time_is_flexible boolean not null default false,
  add column if not exists flight_no text,
  add column if not exists flight_from_code text,
  add column if not exists flight_to_code text,
  add column if not exists flight_from_en text,
  add column if not exists flight_to_en text,
  add column if not exists layover_baggage text,
  add column if not exists layover_immigration text,
  add column if not exists layover_leaves_airport boolean,
  add column if not exists layover_terminal_change boolean,
  -- ค่าพิเศษ `"@hotel"` เดิม = ที่พักที่ตื่นมาจากคืนก่อนหน้า · พิกัดมาจาก `trip_hotels` ตอน render
  -- 🔴 **ไม่ใช่ FK และห้ามเป็น FK** — มันชี้ *"คืนไหน"* ไม่ใช่ *"แถวไหน"*
  add column if not exists place_ref text;

-- ── ข้อจำกัด ───────────────────────────────────────────────────────────────
-- `add constraint` ไม่มี `if not exists` → ห่อด้วย do block ให้รันซ้ำได้
do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'trip_stops_event_kind_valid') then
    alter table public.trip_stops add constraint trip_stops_event_kind_valid
      check (event_kind is null or event_kind in ('flight', 'layover', 'checkin', 'deadline', 'move'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trip_stops_schedule_bound_valid') then
    alter table public.trip_stops add constraint trip_stops_schedule_bound_valid
      check (schedule_bound is null or schedule_bound in ('before', 'after'));
  end if;

  -- รูปแบบเดียวกับ `transfer_target_time` เป๊ะ
  if not exists (select 1 from pg_constraint where conname = 'trip_stops_fixed_times_format') then
    alter table public.trip_stops add constraint trip_stops_fixed_times_format check (
      (fixed_start_time is null or fixed_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and
      (fixed_end_time   is null or fixed_end_time   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trip_stops_day_offset_range') then
    alter table public.trip_stops add constraint trip_stops_day_offset_range
      check (day_offset between 0 and 3);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trip_stops_event_text_lengths') then
    alter table public.trip_stops add constraint trip_stops_event_text_lengths check (
      (title    is null or length(title)    between 1 and 200) and
      (title_en is null or length(title_en) between 1 and 200) and
      (icon     is null or length(icon)     between 1 and 16)
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trip_stops_flight_codes_format') then
    alter table public.trip_stops add constraint trip_stops_flight_codes_format check (
      (flight_from_code is null or flight_from_code ~ '^[A-Z]{3}$') and
      (flight_to_code   is null or flight_to_code   ~ '^[A-Z]{3}$')
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trip_stops_layover_enums') then
    alter table public.trip_stops add constraint trip_stops_layover_enums check (
      (layover_baggage     is null or layover_baggage     in ('through-checked', 'reclaim')) and
      (layover_immigration is null or layover_immigration in ('none', 'required-to-exit'))
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trip_stops_place_ref_valid') then
    alter table public.trip_stops add constraint trip_stops_place_ref_valid
      check (place_ref is null or place_ref in ('hotel'));
  end if;

  -- ── 🔴 ข้อที่สำคัญที่สุดในไฟล์นี้ (ยกเหตุผลมาจาก `D81` ตรง ๆ) ──────────────
  -- **ทิศนี้สำคัญกว่าทิศตรงข้าม** — ถ้าไม่มี check นี้ จุดแวะปกติจะถือ `flight_no` ได้
  -- แล้วหน้า ตม. จะอ่านเจอเที่ยวบินบนแถวที่ไม่ใช่เที่ยวบิน **โดยไม่มีอะไรค้านเลย**
  -- 🎯 ข้ออื่นกันไม่ให้ event *ขาด* ของ · ข้อนี้กันไม่ให้ของที่ *ไม่ใช่* event ถือของของ event
  if not exists (select 1 from pg_constraint where conname = 'trip_stops_event_columns_only_on_events') then
    alter table public.trip_stops add constraint trip_stops_event_columns_only_on_events check (
      kind = 'event' or num_nonnulls(
        event_kind, schedule_bound, fixed_start_time, fixed_end_time,
        title, title_en, icon,
        flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
        layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change,
        place_ref
      ) = 0
    );
  end if;

  -- `day_offset`/`is_alert`/`time_is_flexible` เป็น not null default จึงนับด้วย num_nonnulls ไม่ได้
  if not exists (select 1 from pg_constraint where conname = 'trip_stops_event_flags_only_on_events') then
    alter table public.trip_stops add constraint trip_stops_event_flags_only_on_events check (
      kind = 'event' or (day_offset = 0 and not is_alert and not time_is_flexible)
    );
  end if;

  -- `DayEvent` บังคับ time · icon · title ที่ระดับ type อยู่แล้ว → ฐานบังคับด้วย
  -- 🔴 `event_kind` **ไม่**อยู่ในนี้ เพราะ `DayEvent.kind` เป็น optional จริง ๆ
  --    (*"ไม่ใส่ = เหตุการณ์ทั่วไป แสดงเป็นแถวข้อความเฉย ๆ"* — itinerary.ts:64)
  if not exists (select 1 from pg_constraint where conname = 'trip_stops_event_needs_core') then
    alter table public.trip_stops add constraint trip_stops_event_needs_core check (
      kind <> 'event' or (fixed_start_time is not null and title is not null and icon is not null)
    );
  end if;

  -- 🎯 ครึ่งชุดคือสิ่งที่หน้า ตม. อ่านแล้วพิมพ์ช่องว่างลงเอกสารจริง โดยไม่มี error ที่ไหนเลย
  if not exists (select 1 from pg_constraint where conname = 'trip_stops_flight_fields_complete') then
    alter table public.trip_stops add constraint trip_stops_flight_fields_complete check (
      case when event_kind = 'flight'
        then num_nonnulls(flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en) = 5
        else num_nonnulls(flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en) = 0
      end
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trip_stops_layover_fields_complete') then
    alter table public.trip_stops add constraint trip_stops_layover_fields_complete check (
      case when event_kind = 'layover'
        then num_nonnulls(layover_baggage, layover_immigration,
                          layover_leaves_airport, layover_terminal_change) = 4
        else num_nonnulls(layover_baggage, layover_immigration,
                          layover_leaves_airport, layover_terminal_change) = 0
      end
    );
  end if;
end $constraints$;

-- ── index ของคิวรี "แถวไหนกำหนดขอบของวัน" ───────────────────────────────────
-- partial เฉพาะ `schedule_bound is not null` — **ไม่มี `deleted_at` ให้ใส่** เพราะ main ไม่มี soft delete
-- `order_index, id` คือ tie-break เดียวกับ index เดิม `trip_stops_plan_day_idx`
create index if not exists trip_stops_schedule_bound_idx
  on public.trip_stops (plan_id, day_id, schedule_bound, order_index, id)
  where schedule_bound is not null;

commit;
