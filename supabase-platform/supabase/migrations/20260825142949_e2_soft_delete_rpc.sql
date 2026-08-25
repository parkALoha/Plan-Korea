-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `P-53`: soft delete ผ่าน RPC · **`P-26` กลับมาในรูปที่กลับด้าน**
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── อาการ (วัดจากฐานจริง ไม่ใช่การอ่านโค้ด) ────────────────────────────────
--   `update trip_stops set note = 'x'`        → ✅ ผ่าน
--   `update trip_stops set deleted_at = now()` → 🔴 `42501 new row violates row-level security policy`
--
-- ── สาเหตุ ────────────────────────────────────────────────────────────────
-- **PostgREST ห่อทุก `UPDATE` ด้วย CTE ที่มี `RETURNING` เสมอ** (ต้องใช้นับจำนวนแถว)
-- → **แถวใหม่ต้องผ่าน policy `SELECT` ด้วย** · และ policy นั้นเพิ่งถูกเติม `and deleted_at is null`
-- 🎯 **การตั้ง `deleted_at` จึงทำให้แถวใหม่มองไม่เห็นโดยตัวมันเอง แล้วถูกปฏิเสธเพราะมองไม่เห็น**
--
-- 🔴 **นี่คือ `P-26` เป๊ะ แค่กลับด้าน** — `P-26` คือ `insert().select()` ที่แถว*ใหม่*ยังไม่ผ่าน
--    `trips_select` เพราะ `trip_members` ยังว่าง · ข้อนี้คือแถวใหม่ไม่ผ่าน `trip_stops_select`
--    เพราะมันเพิ่งทำให้ตัวเองหายไป · **รากเดียวกัน: `RETURNING` เจอ policy ที่ซ่อนแถว**
--    · และทางแก้ก็ตัวเดียวกัน: **RPC `security definer`** (`D49`)
--
-- ── ทำไมทางนี้ดีกว่า "เลิกกรองที่ policy" ─────────────────────────────────
-- ทางเลือกคือย้ายการกรอง tombstone ไปที่ query — **ปฏิเสธ** เพราะ `D76` เขียนไว้เองว่า
-- *บังคับที่ policy ไม่ใช่ที่ query · ลืมที่ query แล้ว**เห็นน้อยลง** ไม่ใช่เห็นมากขึ้น*
-- ✅ **และ RPC ให้ของแถมที่ `update` ให้ไม่ได้: "ลบ" กลายเป็น *การกระทำ* ที่มีชื่อ**
--    แทนที่จะเป็น *"เขียนคอลัมน์หนึ่ง"* ที่ใครก็ต้องจำเองว่าคอลัมน์ไหนแปลว่าลบ
--
-- 🔴 **และ `deleted_at` ถูกถอดออกจาก `grant update` ของไคลเอนต์ทั้งหมด**
--    เหลือทางเดียวจริง ๆ · ไม่ใช่ "มีสองทางแต่แนะนำทางนี้"
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop function if exists public.soft_delete_trip_stop(uuid);
--   drop function if exists public.soft_delete_custom_place(uuid);
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ฐานนี้ไม่ใช่ engine-dev ของแพลตฟอร์ม';
  end if;

  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform'
       and ref  = 'pmvxwcimjebogjfimzqy'
       and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;
end $guard$;

-- ถอน `deleted_at` ออกจากมือไคลเอนต์ — เหลือทางเดียวคือ RPC
revoke update on public.trip_stops    from authenticated;
revoke update on public.custom_places from authenticated;
grant update (plan_id, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
              dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
              visited_at, photo_path, transfer_target_time, transfer_target_label)
  on public.trip_stops to authenticated;
grant update (city_id, category, lat, lng, maps_query, description, google_place_id)
  on public.custom_places to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 `security definer` และเหตุผลที่มันไม่ใช่ "ทางลัดที่หลบด่าน" (`D38`)
--    ฟังก์ชัน **ถาม `app.can_write_trip()` ของคนเรียกเอง** ก่อนทำอะไรทั้งสิ้น
--    definer มีไว้เพื่อ **ตัดวงจร `RETURNING` ↔ policy ที่ซ่อนแถว** ไม่ใช่เพื่อได้สิทธิ์เพิ่ม
--    · กันที่ **ชั้น grant** ไม่ใช่ในบอดี้ (`P-32`) — `anon` เรียกไม่ได้ตั้งแต่ต้น
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.soft_delete_trip_stop(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.trip_stops where id = p_id and deleted_at is null;
  -- 🔴 แถวที่ไม่มี/ถูกลบไปแล้ว กับแถวที่ไม่มีสิทธิ์ **ต้องแยกข้อความกัน**
  --    ข้อความเดียวกันแปลว่าใครก็ตามที่เดา id ได้ จะรู้ว่ามันมีอยู่จริงไหม
  if v_trip is null then
    raise exception 'ไม่พบจุดแวะนี้ หรือถูกลบไปแล้ว';
  end if;
  if not app.can_write_trip(v_trip) then
    raise exception 'ไม่มีสิทธิ์แก้ทริปนี้';
  end if;

  update public.trip_stops set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.soft_delete_custom_place(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.custom_places where id = p_id and deleted_at is null;
  if v_trip is null then
    raise exception 'ไม่พบสถานที่นี้ หรือถูกลบไปแล้ว';
  end if;
  if not app.can_write_trip(v_trip) then
    raise exception 'ไม่มีสิทธิ์แก้ทริปนี้';
  end if;

  -- ด่าน `custom_places_not_in_use` จะยิงเองตอน `update` — ไม่ตรวจซ้ำที่นี่
  -- **ตรวจสองที่ = สองที่ที่ต้องตรงกัน** ซึ่งเป็นรูปแบบที่ `_helpers` ถูกรวมเพื่อเลี่ยงมาแล้ว 3 รอบ
  update public.custom_places set deleted_at = now() where id = p_id;
end;
$$;

revoke all on function public.soft_delete_trip_stop(uuid)    from public, anon, authenticated;
revoke all on function public.soft_delete_custom_place(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_trip_stop(uuid)    to authenticated;
grant execute on function public.soft_delete_custom_place(uuid) to authenticated;

commit;
