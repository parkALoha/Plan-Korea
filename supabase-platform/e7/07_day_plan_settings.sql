-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 7: trip_day_settings 18 → trip_day_plan_settings 18           │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ต้องรัน `01` ก่อน (ต้องมีทั้ง `trip_days` และ `trip_plans` — FK ผูกทั้งคู่)
--
-- 🔴 **ปลายทางชื่อ `trip_day_plan_settings` ไม่ใช่ `trip_days`** (`D69`)
--    ⚠️ `column-map.md:196` ยังเขียนในบรรทัด 🔴 ว่า *"ยุบเข้า `trip_days` ไม่แยกตาราง"*
--       ขณะที่ **หัวข้อของมันเอง (บรรทัด 194) เขียนว่า `trip_day_plan_settings`**
--       → หัวข้อถูกอัปเดตตาม `D69` แต่เนื้อในบรรทัดถัดมาไม่ได้ขยับ · แจ้ง P8 แล้ว
--    เหตุผลที่ยุบไม่ได้ (P8 บันทึกที่ `backlog.md:448`): **ตั้งค่ารายวันเป็น *ต่อแผน***
--    `usePlans.ts:104` ก๊อปตั้งค่าต่อแผนจริงในโค้ดวันนี้ · `trip_days` เป็นต่อทริป
--    → ยุบเข้าไปเมื่อไหร่ **สองแผนบนวันเดียวกันจะเขียนทับกัน**
--
--   PK เดิม `(plan_id, day_id)`  →  ใหม่ `(plan_id, trip_day_id)`  — รูปเดียวกัน
--   18 แถว = 2 แผน × วันที่มีตั้งค่า · `plan-default` 7 · `plan-tewl9a9gd5msprnhqj` 11

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.lid(kind text, id text) returns uuid
  language sql immutable as $$ select md5(kind || ':' || id)::uuid $$;

do $e7$
declare
  v_owner uuid := nullif(current_setting('e7.owner_uuid', true), '')::uuid;
  v_trip  uuid := pg_temp.lid('trip', 'korea-2026-10');
  n int; expected int;
begin
  if v_owner is null then raise exception 'ต้องตั้ง e7.owner_uuid ก่อน'; end if;

  insert into public.trip_day_plan_settings (
    trip_id, plan_id, trip_day_id, start_time, return_travel_mode, is_locked, updated_by_user
  )
  select v_trip,
         pg_temp.lid('plan', s.plan_id),
         pg_temp.lid('day',  s.day_id),
         nullif(s.start_time, ''),
         nullif(s.return_travel_mode, ''),
         s.is_locked,
         v_owner
  from legacy.trip_day_settings s;

  select count(*) into expected from legacy.trip_day_settings;
  select count(*) into n from public.trip_day_plan_settings where trip_id = v_trip;
  if n <> expected then raise exception 'trip_day_plan_settings ต้องได้ % ได้ %', expected, n; end if;

  -- 🔴 **เคสที่ผูกกับเหตุผลของ `D69` โดยตรง** — ถ้ามีใครยุบตารางนี้เข้า `trip_days` วันหลัง
  --    วันเดียวกันสองแผนจะเหลือแถวเดียว · เคสนี้ทำให้การยุบนั้นแดงทันที
  select count(*) into n from (
    select trip_day_id from public.trip_day_plan_settings
     where trip_id = v_trip group by trip_day_id having count(distinct plan_id) > 1
  ) x;
  if n = 0 then
    raise exception 'ไม่มีวันไหนที่สองแผนตั้งค่าต่างกันเลย — ข้อมูลนี้พิสูจน์ D69 ไม่ได้ ตรวจการแมป';
  end if;

  -- ค่าต้องเท่าเดิมทุกแถว ไม่ใช่แค่ "insert ผ่าน"
  select count(*) into n
  from legacy.trip_day_settings s
  join public.trip_day_plan_settings p
    on p.plan_id = pg_temp.lid('plan', s.plan_id) and p.trip_day_id = pg_temp.lid('day', s.day_id)
  where p.start_time is distinct from nullif(s.start_time, '')
     or p.return_travel_mode is distinct from nullif(s.return_travel_mode, '')
     or p.is_locked is distinct from s.is_locked;
  if n > 0 then raise exception '% แถวค่าเพี้ยนจากเดิม', n; end if;

  raise notice 'E7 · trip_day_plan_settings % แถว · % วันที่สองแผนตั้งค่าแยกกัน',
    expected,
    (select count(*) from (select trip_day_id from public.trip_day_plan_settings
       where trip_id = v_trip group by trip_day_id having count(distinct plan_id) > 1) y);
end $e7$;

commit;
