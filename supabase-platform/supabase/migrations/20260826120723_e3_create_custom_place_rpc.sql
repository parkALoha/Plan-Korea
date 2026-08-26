-- ═══════════════════════════════════════════════════════════════════════════
-- `E3` — `create_custom_place()` · หนึ่งสถานที่ = หลายแถวคนละตาราง จึงต้องอะตอมิก
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ปัญหาที่ฝั่งอ่านไม่มี ────────────────────────────────────────────────────
-- UI ส่ง `CustomPlace` มาก้อนเดียว **แต่ฐานเก็บเป็น 1 แถวใน `custom_places` + N แถวใน `custom_place_names`**
-- เขียนทีละคำสั่งจาก route → **ล้มกลางคันแล้วเหลือสถานที่ที่ไม่มีชื่อ**
-- 🔴 และสถานที่ที่ไม่มีชื่อ **ไม่พังอะไรเลย มันแค่โผล่เป็นการ์ดเปล่าในคลัง** — ผู้ใช้ลบก็ไม่รู้ว่าลบอะไร
--
-- ── 🔴 `security invoker` — และข้อนี้สำคัญกว่าที่ดู ─────────────────────────
-- `authenticated` **มีสิทธิ์ `insert` ทั้งสองตารางอยู่แล้ว** (`20260825140057` บรรทัด 137 · 144)
-- → ฟังก์ชันนี้จึง **ไม่ได้ให้สิทธิ์ใครเพิ่มแม้แต่นิดเดียว มันให้แค่ *ทรานแซกชัน***
-- 🎯 **ต่างจาก `create_trip` ที่ต้องเป็น `definer` จริง ๆ** เพราะมันสร้างทริป *และ* แถวสมาชิกเจ้าของ
--    ซึ่งเป็นปัญหาไก่กับไข่กับ RLS · **ที่นี่ไม่มีปัญหานั้น จึงไม่มีเหตุผลให้ยกสิทธิ์**
-- · `D38` — *Server Action ไม่ใช่สิทธิ์พิเศษ* · **RPC ก็เหมือนกัน** และ `do $verify$` ตรวจข้อนี้
--
-- ── เมืองมาเป็น slug ไม่ใช่ uuid ───────────────────────────────────────────
-- `CustomPlace.city` ของ UI เป็นสตริง (`"busan"`) · ฐานต้องการ `city_id uuid`
-- แปลงในนี้เพื่อให้เป็น **คำขอเดียว** · slug ที่ไม่รู้จัก → `raise` พร้อมบอกว่าเมืองไหน
-- 🔴 **ห้ามเงียบแล้วใส่ null** — `city_id` เป็น `not null` อยู่แล้ว แต่ข้อความที่ได้จะเป็น
--    *"null value violates not-null constraint"* ซึ่ง **ไม่มีใครเดาออกว่าแปลว่า "ไม่รู้จักเมืองนี้"**
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

create or replace function public.create_custom_place(
  p_trip_id         uuid,
  p_city_slug       text,
  p_category        text,
  p_lat             double precision,
  p_lng             double precision,
  p_maps_query      text,
  p_name_th         text,
  p_name_en         text default null,
  p_name_ko         text default null,
  p_description     text default null,
  p_google_place_id text default null,
  p_legacy_added_by text default null
)
returns uuid
language plpgsql
-- 🔴 **ไม่ระบุ `security definer` โดยตั้งใจ** → เป็น `invoker` · RLS ทำงานเหมือนตอนไคลเอนต์เขียนเอง
set search_path = ''
as $fn$
declare
  v_city_id uuid;
  v_id      uuid;
begin
  select id into v_city_id
    from public.catalog_cities
   where legacy_slug = p_city_slug;

  if v_city_id is null then
    raise exception 'ไม่รู้จักเมือง %s — ต้องมีอยู่ใน catalog_cities.legacy_slug ก่อน', p_city_slug
      using errcode = '23503';
  end if;

  -- ⚠️ `id` ไม่อยู่ใน grant ของไคลเอนต์ → **ฐานเป็นคนออกให้** และคืนกลับไป
  --    (ฝั่ง hook จึงต้องเขียนก่อนแล้วค่อยใส่ state ไม่ใช่เดา id เอง — ดูคอมเมนต์ที่ `useCustomPlaces`)
  insert into public.custom_places
    (trip_id, city_id, category, lat, lng, maps_query, description, google_place_id, legacy_added_by)
  values
    (p_trip_id, v_city_id, p_category, p_lat, p_lng, p_maps_query, p_description,
     p_google_place_id, p_legacy_added_by)
  returning id into v_id;

  -- ชื่อ: ใส่เฉพาะภาษาที่มีจริง · `priority = 1` เพราะสร้างใหม่ยังไม่มีชื่อคู่แข่ง
  -- 🔴 `nullif(trim(...), '')` — สตริงว่างไม่ใช่ชื่อ และ `check` ของตารางจะปฏิเสธมันอยู่แล้ว
  --    ปล่อยให้ถึง `check` = ได้ error ที่อ่านไม่ออกแทนที่จะข้ามช่องที่ผู้ใช้ไม่ได้กรอก
  insert into public.custom_place_names (trip_id, place_id, locale, name, priority, source)
  select p_trip_id, v_id, l.locale, l.name, 1, 'user'
    from (values ('th', nullif(trim(p_name_th), '')),
                 ('en', nullif(trim(p_name_en), '')),
                 ('ko', nullif(trim(p_name_ko), ''))) as l(locale, name)
   where l.name is not null;

  return v_id;
end
$fn$;

revoke all on function public.create_custom_place(uuid, text, text, double precision, double precision,
  text, text, text, text, text, text, text) from public;
grant execute on function public.create_custom_place(uuid, text, text, double precision, double precision,
  text, text, text, text, text, text, text) to authenticated;

do $verify$
declare ok boolean;
begin
  -- 🔴 ต้องเป็น `invoker` — ถ้าวันหนึ่งมีคนเติม `security definer` เข้าไป
  --    ฟังก์ชันนี้จะข้าม RLS **แล้วใครก็เขียนใส่ทริปคนอื่นได้ผ่านมัน**
  select not prosecdef into ok from pg_proc
   where oid = 'public.create_custom_place(uuid, text, text, double precision, double precision, text, text, text, text, text, text, text)'::regprocedure;
  if not ok then raise exception 'D38: create_custom_place ต้องเป็น security invoker'; end if;

  -- `anon` ต้องเรียกไม่ได้
  if has_function_privilege('anon',
    'public.create_custom_place(uuid, text, text, double precision, double precision, text, text, text, text, text, text, text)', 'EXECUTE') then
    raise exception 'anon ต้องเรียก create_custom_place ไม่ได้';
  end if;
end $verify$;

commit;
