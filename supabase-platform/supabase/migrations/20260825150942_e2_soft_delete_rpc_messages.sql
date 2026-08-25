-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `P-53` ข้อความ error: แยกตาม **สิทธิ์อ่าน** ไม่ใช่ **สิทธิ์เขียน** (P4 ตอบ)
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── คำถามที่ผมถาม P4 และตอบเองไม่ได้ ───────────────────────────────────────
-- ฉบับแรกแยกข้อความ *"ไม่พบ"* กับ *"ไม่มีสิทธิ์"* เพื่อไม่ให้คนเดา `id` รู้ว่าแถวมีอยู่จริงไหม
-- 🔴 **แต่แยกแล้วก็รั่วอีกทาง: คนนอกที่เดา `id` ถูก ได้ *"ไม่มีสิทธิ์"* → รู้ว่า `id` นั้นมีอยู่จริง**
--    = **existence oracle** · ผมรู้ว่าทั้งสองทางมีปัญหา แต่หาทางที่สามไม่เจอ
--
-- ── คำตอบของ P4 — แก้บรรทัดเดียว และใช้ของที่มีอยู่แล้ว ───────────────────
-- > **แยกตาม *สิทธิ์อ่าน* ไม่ใช่ *สิทธิ์เขียน***
--
-- | ใคร | ได้ข้อความ | รั่วอะไร |
-- |---|---|---|
-- | `viewer` (อ่านได้ เขียนไม่ได้) | *"ไม่มีสิทธิ์แก้"* | **ไม่รั่ว — เขาเห็นแถวนั้นอยู่แล้ว** และข้อความช่วยเขาได้จริง |
-- | คนนอก (อ่านไม่ได้) | *"ไม่พบ"* | **ไม่รั่ว — เหมือน `id` มั่วทุกประการ** |
--
-- 🎯 **หลักการ: ข้อความที่ต่างกันได้ ต้องต่างเฉพาะกับคนที่รู้ความต่างนั้นอยู่แล้ว**
-- · และเราโชคดีที่มี `can_read_trip` แยกจาก `can_write_trip` อยู่แล้ว — **ไม่ต้องสร้างอะไรใหม่**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   คืนฟังก์ชันทั้ง 6 ตัวเป็นฉบับที่เช็คแค่ `v_trip is null`
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

create or replace function public.soft_delete_trip_stop(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.trip_stops where id = p_id and deleted_at is null;
  if v_trip is null or not app.can_read_trip(v_trip) then
    raise exception 'ไม่พบจุดแวะนี้ หรือถูกลบไปแล้ว';
  end if;
  if not app.can_write_trip(v_trip) then raise exception 'ไม่มีสิทธิ์แก้ทริปนี้'; end if;
  update public.trip_stops set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.soft_delete_custom_place(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.custom_places where id = p_id and deleted_at is null;
  if v_trip is null or not app.can_read_trip(v_trip) then
    raise exception 'ไม่พบสถานที่นี้ หรือถูกลบไปแล้ว';
  end if;
  if not app.can_write_trip(v_trip) then raise exception 'ไม่มีสิทธิ์แก้ทริปนี้'; end if;
  update public.custom_places set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.soft_delete_booking(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.bookings where id = p_id and deleted_at is null;
  if v_trip is null or not app.can_read_trip(v_trip) then
    raise exception 'ไม่พบใบจองนี้ หรือถูกลบไปแล้ว';
  end if;
  if not app.can_write_trip(v_trip) then raise exception 'ไม่มีสิทธิ์แก้ทริปนี้'; end if;
  update public.bookings set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.soft_delete_checklist_item(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.checklist_items where id = p_id and deleted_at is null;
  if v_trip is null or not app.can_read_trip(v_trip) then
    raise exception 'ไม่พบรายการนี้ หรือถูกลบไปแล้ว';
  end if;
  if not app.can_write_trip(v_trip) then raise exception 'ไม่มีสิทธิ์แก้ทริปนี้'; end if;
  update public.checklist_items set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.soft_delete_place_note(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.place_notes where id = p_id and deleted_at is null;
  if v_trip is null or not app.can_read_trip(v_trip) then
    raise exception 'ไม่พบโน้ตนี้ หรือถูกลบไปแล้ว';
  end if;
  if not app.can_write_trip(v_trip) then raise exception 'ไม่มีสิทธิ์แก้ทริปนี้'; end if;
  update public.place_notes set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.soft_delete_trip_hotel(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.trip_hotels where id = p_id and deleted_at is null;
  if v_trip is null or not app.can_read_trip(v_trip) then
    raise exception 'ไม่พบที่พักนี้ หรือถูกลบไปแล้ว';
  end if;
  if not app.can_write_trip(v_trip) then raise exception 'ไม่มีสิทธิ์แก้ทริปนี้'; end if;
  update public.trip_hotels set deleted_at = now() where id = p_id;
end;
$$;

commit;
