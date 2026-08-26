-- ═══════════════════════════════════════════════════════════════════════════
-- `E3` — RPC ของแผน: สลับแผนที่ใช้อยู่ · ก๊อปแผน
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · **ทั้งคู่เป็น `security invoker`**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมต้องเป็น RPC ไม่ใช่คำสั่งเรียงกันจาก route ────────────────────────
-- ① **สลับแผน** — `trip_plans_one_active` เป็น *partial unique index* (`D52`)
--    → ปลดของเก่าแล้วตั้งของใหม่ **ต้องอยู่ทรานแซกชันเดียว** ไม่งั้นชน index ระหว่างทาง
--    · เขียนจาก route เป็นสองคำสั่ง = **มีช่วงที่ไม่มีแผนไหน active เลย** และถ้าล้มกลางทางก็ค้างแบบนั้น
-- ② **ก๊อปแผน** — สร้างแผน + ก๊อปจุดแวะ + ก๊อปตั้งค่ารายวัน
--    · `P-71`: ของเดิม `await writeGuard(...)` **ทิ้งค่าที่คืนมา 6 จุด** → ก๊อปไม่ครบโดยแอปเดินต่อ
--    🔴 **แผนที่ก๊อปมาไม่ครบ ไม่มีทางรู้ว่าขาดอะไร** เพราะไม่เคยมีใครเห็นว่ามันล้ม
--    → ทรานแซกชันเดียวจบ · **ล้ม = ไม่มีแผนใหม่เลย ซึ่งดีกว่าแผนครึ่งใบ**
--
-- 🔴 **`invoker` ทั้งคู่** — `authenticated` มีสิทธิ์ทุกตารางที่แตะอยู่แล้ว
-- ฟังก์ชันนี้ให้ **ทรานแซกชัน** ไม่ได้ให้ **สิทธิ์** (`D38`)
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

create or replace function public.set_active_plan(p_trip_id uuid, p_plan_id uuid)
returns void
language plpgsql
set search_path = ''
as $fn$
begin
  -- 🔴 ปลดก่อนตั้ง · ทั้งคู่ในทรานแซกชันเดียว → index ไม่เคยเห็นสองตัว active พร้อมกัน
  update public.trip_plans set is_active = false
   where trip_id = p_trip_id and is_active and id <> p_plan_id;

  update public.trip_plans set is_active = true
   where trip_id = p_trip_id and id = p_plan_id;

  if not found then
    raise exception 'ไม่พบแผน % ในทริปนี้ (หรือไม่มีสิทธิ์)', p_plan_id using errcode = '42501';
  end if;
end
$fn$;

create or replace function public.duplicate_trip_plan(
  p_trip_id uuid, p_source_plan_id uuid, p_name text
)
returns uuid
language plpgsql
set search_path = ''
as $fn$
declare
  v_new uuid;
begin
  insert into public.trip_plans (trip_id, name, is_active)
  values (p_trip_id, p_name, false)
  returning id into v_new;

  -- ก๊อปจุดแวะ **ที่ยังไม่ถูกลบ** — tombstone ไม่ควรตามไปแผนใหม่ (`D76`)
  insert into public.trip_stops
    (trip_id, plan_id, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
     dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
     visited_at, photo_path, transfer_target_time, transfer_target_label, legacy_added_by,
     event_kind, schedule_bound, fixed_start_time, fixed_end_time, day_offset,
     title, title_en, icon, is_alert, time_is_flexible,
     flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
     layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change, place_ref)
  select trip_id, v_new, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
         dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
         visited_at, photo_path, transfer_target_time, transfer_target_label, legacy_added_by,
         event_kind, schedule_bound, fixed_start_time, fixed_end_time, day_offset,
         title, title_en, icon, is_alert, time_is_flexible,
         flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
         layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change, place_ref
    from public.trip_stops
   where trip_id = p_trip_id and plan_id = p_source_plan_id and deleted_at is null;

  insert into public.trip_day_plan_settings
    (trip_id, plan_id, trip_day_id, start_time, return_travel_mode, is_locked, note)
  select trip_id, v_new, trip_day_id, start_time, return_travel_mode, is_locked, note
    from public.trip_day_plan_settings
   where trip_id = p_trip_id and plan_id = p_source_plan_id;

  return v_new;
end
$fn$;

revoke all on function public.set_active_plan(uuid, uuid) from public;
revoke all on function public.duplicate_trip_plan(uuid, uuid, text) from public;
grant execute on function public.set_active_plan(uuid, uuid) to authenticated;
grant execute on function public.duplicate_trip_plan(uuid, uuid, text) to authenticated;

do $verify$
declare ok boolean;
begin
  select not prosecdef into ok from pg_proc
   where oid = 'public.set_active_plan(uuid, uuid)'::regprocedure;
  if not ok then raise exception 'D38: set_active_plan ต้องเป็น invoker'; end if;

  select not prosecdef into ok from pg_proc
   where oid = 'public.duplicate_trip_plan(uuid, uuid, text)'::regprocedure;
  if not ok then raise exception 'D38: duplicate_trip_plan ต้องเป็น invoker'; end if;
end $verify$;

commit;
