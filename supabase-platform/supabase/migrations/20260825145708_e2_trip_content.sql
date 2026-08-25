-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `checklist_items` · `place_notes` · `hidden_places` · `D53` · `D70` · `D76`
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 `Q1` ทำงานอีกครั้ง — `place_id` *"คงเดิม"* ชี้ไปคอลัมน์ที่ไม่มีอยู่แล้ว ────
-- `column-map.md` เขียน `place_id` ว่า **"คงเดิม"** ทั้งใน `place_notes` และ `hidden_places`
-- **แต่ `D53` แยกการอ้างสถานที่เป็น `catalog_place_id` / `custom_place_id` ไปแล้ว**
-- → *"คงเดิม"* ถูกตอนเขียน · **ชี้ไปคอลัมน์ที่ไม่มีในสคีมาใหม่ตั้งแต่วินาทีที่ `D53` ตัดสิน**
--    (รูปเดียวกับ `P-51` และ `D75` — เจอเพราะไปเขียน DDL ของตารางนั้นพอดี ไม่ใช่เพราะรีวิว)
--
-- **ตัดสิน:**
--   · **`place_notes` ได้ทั้งสองแบบ** — โน้ตบนสถานที่ที่ผู้ใช้เพิ่มเองสมเหตุสมผล → XOR แบบ `trip_stops`
--   · **`hidden_places` ได้เฉพาะคลังกลาง** — *"ซ่อน"* สถานที่ที่ตัวเองเพิ่มไม่มีความหมาย **ลบทิ้งตรงกว่า**
--     🎯 ถ้าให้ทั้งสองแบบ เราจะมีสองทางที่ทำเรื่องเดียวกัน แล้วต้องมีคนตัดสินใจทุกครั้งว่าจะใช้ทางไหน
--
-- ── `hidden_places` **ลบจริง** โดยตั้งใจ — ข้อยกเว้นที่ระบุไว้ใน `D76` ────────
-- *"เลิกซ่อน"* คือการลบแถวตามนิยาม · **tombstone ของการเลิกซ่อนไม่มีความหมาย**
-- (`D76` แยกไว้แล้วว่าใครได้/ไม่ได้ soft delete — ข้อนี้เข้าเกณฑ์ "ไม่ได้")
--
-- ── `checklist_items` — ติ๊กออกต้องล้างคนติ๊ก ─────────────────────────────
-- 🔴 ถ้าไม่ล้าง **ชื่อคนที่ไม่ได้ติ๊กแล้วจะค้างอยู่บนแถว** และหน้าจอจะบอกว่าเขาเป็นคนติ๊ก
--    เป็นข้อมูลที่ผิดแบบเงียบ — บังคับด้วย trigger ไม่ใช่หวังให้ไคลเอนต์ล้างเอง
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists public.hidden_places, public.place_notes, public.checklist_items;
--   drop function if exists public.soft_delete_checklist_item(uuid), public.soft_delete_place_note(uuid);
--   drop function if exists app.stamp_checked_by();
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

-- ═══ checklist_items ═══════════════════════════════════════════════════════
create table public.checklist_items (
  id       uuid primary key default gen_random_uuid(),
  trip_id  uuid not null references public.trips(id) on delete cascade,
  text     text not null check (length(trim(text)) between 1 and 300),
  category text,

  is_checked      boolean not null default false,
  checked_by_user uuid references public.profiles(id) on delete set null,
  legacy_checked_by text,

  added_by_user   uuid references public.profiles(id) on delete set null,
  legacy_added_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);
create index checklist_items_trip_idx on public.checklist_items (trip_id);

-- ═══ place_notes ═══════════════════════════════════════════════════════════
create table public.place_notes (
  id       uuid primary key default gen_random_uuid(),
  trip_id  uuid not null,
  plan_id  uuid not null,

  catalog_place_id uuid references public.catalog_places(id) on delete restrict,
  custom_place_id  uuid,

  note       text,
  -- `E2-AC5` — **path ไม่ใช่ URL** เหตุผลเดียวกับ `trip_stops.photo_path`
  photo_path text,

  added_by_user   uuid references public.profiles(id) on delete set null,
  legacy_added_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,

  -- `D53` — ชี้สถานที่ **หนึ่งเดียว** · โน้ตที่ไม่ชี้อะไรเลยคือโน้ตที่ไม่มีใครหาเจอ
  constraint place_notes_one_place check (num_nonnulls(catalog_place_id, custom_place_id) = 1),

  constraint place_notes_plan_fk foreign key (trip_id, plan_id)
    references public.trip_plans(trip_id, id) on delete cascade,
  constraint place_notes_custom_place_fk foreign key (trip_id, custom_place_id)
    references public.custom_places(trip_id, id) on delete restrict
);
create index place_notes_trip_plan_idx on public.place_notes (trip_id, plan_id);

-- ═══ hidden_places ═════════════════════════════════════════════════════════
create table public.hidden_places (
  trip_id          uuid not null references public.trips(id) on delete cascade,
  catalog_place_id uuid not null references public.catalog_places(id) on delete cascade,

  hidden_by_user   uuid references public.profiles(id) on delete set null,
  legacy_hidden_by text,
  hidden_at        timestamptz not null default now(),

  primary key (trip_id, catalog_place_id)
);

revoke all on public.checklist_items from anon;
revoke all on public.place_notes     from anon;
revoke all on public.hidden_places   from anon;

alter table public.checklist_items enable row level security;
alter table public.place_notes     enable row level security;
alter table public.hidden_places   enable row level security;

create policy checklist_items_select on public.checklist_items
  for select to authenticated using (app.can_read_trip(trip_id) and deleted_at is null);
create policy checklist_items_insert on public.checklist_items
  for insert to authenticated with check (app.can_write_trip(trip_id));
create policy checklist_items_update on public.checklist_items
  for update to authenticated
  using (app.can_write_trip(trip_id)) with check (app.can_write_trip(trip_id));

create policy place_notes_select on public.place_notes
  for select to authenticated using (app.can_read_trip(trip_id) and deleted_at is null);
create policy place_notes_insert on public.place_notes
  for insert to authenticated with check (app.can_write_trip(trip_id));
create policy place_notes_update on public.place_notes
  for update to authenticated
  using (app.can_write_trip(trip_id)) with check (app.can_write_trip(trip_id));

create policy hidden_places_select on public.hidden_places
  for select to authenticated using (app.can_read_trip(trip_id));
create policy hidden_places_insert on public.hidden_places
  for insert to authenticated with check (app.can_write_trip(trip_id));
-- 🔴 `hidden_places` มี DELETE โดยตั้งใจ — *"เลิกซ่อน"* คือการลบแถวตามนิยาม (`D76`)
create policy hidden_places_delete on public.hidden_places
  for delete to authenticated using (app.can_write_trip(trip_id));

grant select on public.checklist_items to authenticated;
grant insert (trip_id, text, category, legacy_added_by, legacy_checked_by)
  on public.checklist_items to authenticated;
grant update (text, category, is_checked) on public.checklist_items to authenticated;

grant select on public.place_notes to authenticated;
grant insert (trip_id, plan_id, catalog_place_id, custom_place_id, note, photo_path, legacy_added_by)
  on public.place_notes to authenticated;
grant update (note, photo_path) on public.place_notes to authenticated;

grant select, insert, delete on public.hidden_places to authenticated;

grant select, delete on public.checklist_items to service_role;
grant select, delete on public.place_notes     to service_role;
grant select, delete on public.hidden_places   to service_role;

create trigger checklist_items_stamp_added_by
  before insert on public.checklist_items
  for each row execute function app.stamp_added_by();
create trigger place_notes_stamp_added_by
  before insert on public.place_notes
  for each row execute function app.stamp_added_by();

create trigger checklist_items_touch before update on public.checklist_items
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();
create trigger place_notes_touch before update on public.place_notes
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at();

-- ── ติ๊ก/ติ๊กออก → เซิร์ฟเวอร์เขียน `checked_by_user` เอง ─────────────────
-- 🔴 ไคลเอนต์ไม่มีสิทธิ์คอลัมน์นี้อยู่แล้ว (deny-by-default) · trigger เป็น**ตัวเติมค่า** ไม่ใช่ตัวกัน
--    และ **ติ๊กออกต้องล้าง** — ไม่งั้นชื่อคนที่ไม่ได้ติ๊กแล้วจะค้างบนแถวและหน้าจอจะบอกว่าเขาติ๊ก
create or replace function app.stamp_checked_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_checked is distinct from old.is_checked then
    new.checked_by_user := case when new.is_checked then auth.uid() else null end;
  end if;
  return new;
end;
$$;

create trigger checklist_items_stamp_checked_by
  before update on public.checklist_items
  for each row execute function app.stamp_checked_by();

-- ── `P-53` — soft delete ผ่าน RPC ─────────────────────────────────────────
create or replace function public.soft_delete_checklist_item(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.checklist_items where id = p_id and deleted_at is null;
  if v_trip is null then raise exception 'ไม่พบรายการนี้ หรือถูกลบไปแล้ว'; end if;
  if not app.can_write_trip(v_trip) then raise exception 'ไม่มีสิทธิ์แก้ทริปนี้'; end if;
  update public.checklist_items set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.soft_delete_place_note(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.place_notes where id = p_id and deleted_at is null;
  if v_trip is null then raise exception 'ไม่พบโน้ตนี้ หรือถูกลบไปแล้ว'; end if;
  if not app.can_write_trip(v_trip) then raise exception 'ไม่มีสิทธิ์แก้ทริปนี้'; end if;
  update public.place_notes set deleted_at = now() where id = p_id;
end;
$$;

revoke all on function public.soft_delete_checklist_item(uuid) from public, anon, authenticated;
revoke all on function public.soft_delete_place_note(uuid)     from public, anon, authenticated;
grant execute on function public.soft_delete_checklist_item(uuid) to authenticated;
grant execute on function public.soft_delete_place_note(uuid)     to authenticated;

commit;
