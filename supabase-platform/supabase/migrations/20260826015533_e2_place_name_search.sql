-- ═══════════════════════════════════════════════════════════════════════════
-- `D56` — `pg_trgm` + `unaccent` · และ `search_place_names()` ตามสเปกของ P5
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · รูปพารามิเตอร์จาก `copilot-spec.md §25`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 `intent` เป็น required ไม่มีค่าเริ่มต้น — และเหตุผลของ P5 คือทั้งหมดของไฟล์นี้ ──
-- ผมถามหา *"ชื่อพารามิเตอร์กับค่าเริ่มต้น"* · P5 ตอบว่า **ไม่มีค่าเริ่มต้น** และยืนยันแม้มันไม่สะดวก:
--   > ค่าเริ่มต้นใดก็ตาม **ถูกครึ่งหนึ่งของเวลา และเงียบอีกครึ่งหนึ่ง**
--   > · default `discover` → ผู้ใช้ถามถึงจุดในแผนตัวเอง แล้วได้ *"ไม่เจอ"*
--   > · default `identify` → ขอบเขตแคบเกิน แล้วได้ *"ไม่เจอ"* เหมือนกัน
--   > 🔴 **ทั้งสองพังด้วยข้อความเดียวกันเป๊ะ — แยกไม่ออกจาก log ว่าตั้ง default ผิดข้าง**
-- · **วันนี้ยังไม่มีจุดเรียกสักจุด → "required" ราคาศูนย์ และแพงมากถ้ามาเติมทีหลัง**
-- 🎯 ตรงกับที่ทีมตัดสินเรื่อง `security_invoker`: **ธงที่ละไว้แล้วยังทำงานได้ คือธงที่จะถูกละ**
--
-- ── สองเจตนาต่างกัน 3 ข้อ ไม่ใช่ข้อเดียว (P5 · แก้ข้อเสนอ `includeHidden` ของผม) ──
-- ```
--                 identify                          discover
-- ขอบเขต        เฉพาะที่ทริปนี้อ้างถึงแล้ว (trip_stops)   catalog_places ของเมืองนั้น
-- picker_hidden ไม่กรอง (สนามบินคือจุดแวะจริง)        กรอง
-- anti-join     ไม่ — นั่นคือสิ่งที่กำลังหา            ใช่
-- ```
-- 🔴 **`includeHidden` จะแก้ข้อที่เล็กที่สุด แล้วปล่อยข้อที่ใหญ่ที่สุดไว้เหมือนเดิม**
--    `identify` ที่ค้นทั้งคลัง จะ map *"ตลาดกลางคืน"* ไปตลาดในเมืองที่ผู้ใช้ไม่ได้พูดถึง
--    → **`propose_remove_stop` ชี้ไปที่จุดที่ผู้ใช้ไม่ได้หมายถึง**
--
-- ── 📌 `identify` รวม `custom_places` ด้วย — อ่านตามตัวอักษรของสเปก ไม่ใช่ขยายเอง ──
-- P5 เขียนว่า *"เฉพาะสถานที่ที่ทริปนี้อ้างถึงอยู่แล้ว (**ผ่าน `trip_stops`**)"*
-- และ `trip_stops` อ้างได้ทั้ง `catalog_place_id` และ `custom_place_id` (`D53`)
-- 🔴 **ถ้าค้นแต่คลังกลาง ผู้ใช้ถามถึงที่ที่ตัวเองเพิ่มเองจะได้ "ไม่เจอ"** — ซึ่งเป็นอาการเดียวกับ
--    ที่ P5 ใช้เป็นเหตุผลว่าทำไมห้ามมี default · **อาการเดียวกัน = ต้องกันด้วยเหตุผลเดียวกัน**
-- · `discover` **ไม่**รวม custom ตามตารางของ P5 (*"`catalog_places` ของเมืองนั้น"*) ตรงตัวอักษร
--
-- ── 🔴 `security invoker` (ค่าเริ่มต้น) ไม่ใช่ `definer` ──
-- `D38` — **Server Action / RPC ไม่ใช่สิทธิ์พิเศษ** · ฟังก์ชันนี้ไม่ต้องการสิทธิ์ที่ผู้เรียกไม่มีเลย
-- · `catalog_place_names` ให้ `authenticated` อ่านได้อยู่แล้ว · `trip_stops` มี policy ผูก `app.can_read_trip`
-- 🎯 **RLS จึงเป็นตัวจำกัดขอบเขตให้เอง — ไม่มีบรรทัดไหนในนี้ต้องเช็คว่าใครเป็นเจ้าของทริป**
--    ถ้าเขียนเป็น `definer` เราจะต้องเขียนการตรวจนั้นเอง **และมันจะถูกวันนี้ ผิดวันที่ policy เปลี่ยน**
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

create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ── ตัวปรับข้อความให้เทียบกันได้ ────────────────────────────────────────────
-- 🔴 **ต้อง `immutable` ไม่งั้นสร้าง index ไม่ได้** — และ `unaccent(text)` แบบ 1 อาร์กิวเมนต์
--    เป็น `stable` เพราะมันไปหา dictionary ผ่าน `search_path` ตอนรัน
--    → ใช้แบบ 2 อาร์กิวเมนต์ที่ระบุ dictionary ตรง ๆ ซึ่ง `immutable`
-- ⚠️ **ถ้าเผลอใช้แบบ 1 อาร์กิวเมนต์ error จะบอกว่า "functions in index expression must be marked IMMUTABLE"
--    ซึ่งอ่านไม่ออกเลยว่าเกี่ยวกับ dictionary** — เขียนไว้กันคนถัดไปเสียเวลา
create or replace function app.search_norm(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')))
$$;

create index catalog_place_names_search_idx
  on public.catalog_place_names using gin (app.search_norm(name) extensions.gin_trgm_ops);
create index custom_place_names_search_idx
  on public.custom_place_names using gin (app.search_norm(name) extensions.gin_trgm_ops);

-- ── ค้นชื่อ ─────────────────────────────────────────────────────────────────
create or replace function public.search_place_names(
  p_trip_id uuid,
  p_query   text,
  p_intent  text,           -- 🔴 ไม่มี default โดยตั้งใจ — ดูหัวไฟล์
  p_city_id uuid default null,
  p_limit   int  default 20
)
returns table (
  source       text,        -- 'catalog' | 'custom'
  place_id     uuid,
  city_id      uuid,
  matched_name text,
  locale       text,
  score        real
)
language plpgsql
stable
set search_path = ''
as $fn$
declare
  q text := app.search_norm(p_query);
begin
  if p_intent is null or p_intent not in ('identify', 'discover') then
    -- 🔴 ข้อความนี้ต้องบอก *ค่าที่รับได้* ไม่ใช่แค่ว่าผิด — คนที่เจอมันคือคนที่กำลังเขียนจุดเรียกใหม่
    raise exception 'search_place_names: p_intent ต้องเป็น ''identify'' หรือ ''discover'' (ได้มา: %) — ไม่มีค่าเริ่มต้นโดยตั้งใจ ดู copilot-spec.md §25', coalesce(p_intent, 'null');
  end if;

  if length(trim(coalesce(p_query, ''))) = 0 then
    return;   -- ค้นด้วยสตริงว่าง = ไม่มีคำถาม · คืนศูนย์แถว ไม่ใช่คืนทั้งคลัง
  end if;

  if p_intent = 'identify' then
    -- ทุกอย่างที่ทริปนี้อ้างถึงจริง ผ่านจุดแวะที่ยังไม่ถูกลบ · **ไม่กรอง `picker_hidden`**
    return query
      select 'catalog'::text, n.place_id, n.city_id, n.name, n.locale,
             extensions.similarity(app.search_norm(n.name), q)
        from public.catalog_place_names n
       where exists (
               select 1 from public.trip_stops s
                where s.trip_id = p_trip_id
                  and s.catalog_place_id = n.place_id
                  and s.deleted_at is null
             )
         and (app.search_norm(n.name) operator(extensions.%) q
              or app.search_norm(n.name) like '%' || q || '%')
      union all
      select 'custom'::text, cn.place_id, cp.city_id, cn.name, cn.locale,
             extensions.similarity(app.search_norm(cn.name), q)
        from public.custom_place_names cn
        join public.custom_places cp on cp.id = cn.place_id
       where exists (
               select 1 from public.trip_stops s
                where s.trip_id = p_trip_id
                  and s.custom_place_id = cn.place_id
                  and s.deleted_at is null
             )
         and (app.search_norm(cn.name) operator(extensions.%) q
              or app.search_norm(cn.name) like '%' || q || '%')
       order by 6 desc, 4 asc
       limit p_limit;
  else
    -- `discover` — คลังกลางของเมืองนั้น · **กรอง `picker_hidden`** · ตัดของที่อยู่ในทริปแล้วออก
    return query
      select 'catalog'::text, n.place_id, n.city_id, n.name, n.locale,
             extensions.similarity(app.search_norm(n.name), q)
        from public.catalog_place_names n
        join public.catalog_places p on p.id = n.place_id
       where (p_city_id is null or n.city_id = p_city_id)
         and not p.picker_hidden
         and not exists (
               select 1 from public.trip_stops s
                where s.trip_id = p_trip_id
                  and s.catalog_place_id = n.place_id
                  and s.deleted_at is null
             )
         and (app.search_norm(n.name) operator(extensions.%) q
              or app.search_norm(n.name) like '%' || q || '%')
       order by 6 desc, 4 asc
       limit p_limit;
  end if;
end
$fn$;

revoke all on function public.search_place_names(uuid, text, text, uuid, int) from public;
grant execute on function public.search_place_names(uuid, text, text, uuid, int) to authenticated;

-- ── ตรวจในทรานแซกชันเดียวกัน ────────────────────────────────────────────────
do $verify$
declare
  ok boolean;
begin
  -- ① `search_norm` ต้อง immutable จริง ไม่งั้น index ข้างบนจะสร้างไม่ได้ตั้งแต่แรก
  --    (ถึงตรงนี้ได้แปลว่าผ่านแล้ว — เช็คซ้ำเพื่อให้ข้อความชัดถ้าวันหนึ่งมีคนแก้)
  select provolatile = 'i' into ok
    from pg_proc where oid = 'app.search_norm(text)'::regprocedure;
  if not ok then raise exception 'D56: app.search_norm ต้องเป็น immutable'; end if;

  -- ② 🔴 ต้องเป็น `invoker` — `definer` จะทำให้ RLS ไม่ใช่ตัวจำกัดขอบเขตอีกต่อไป
  select not prosecdef into ok
    from pg_proc where oid = 'public.search_place_names(uuid, text, text, uuid, int)'::regprocedure;
  if not ok then raise exception 'D38: search_place_names ต้องเป็น security invoker'; end if;

  -- ③ `p_intent` ต้องไม่มีค่าเริ่มต้น — ถ้ามีเมื่อไหร่ เหตุผลทั้งหมดของ §25 หายไปเงียบ ๆ
  --    pronargdefaults นับจากท้าย: p_city_id + p_limit = 2 · ถ้าเป็น 3 แปลว่า p_intent มี default แล้ว
  select pronargdefaults = 2 into ok
    from pg_proc where oid = 'public.search_place_names(uuid, text, text, uuid, int)'::regprocedure;
  if not ok then raise exception 'copilot-spec §25: p_intent ต้องไม่มีค่าเริ่มต้น'; end if;

  -- ④ ไม่มี index ไหนหาย (สองตัว) — ค้นได้โดยไม่มี index คือ seq scan ที่เงียบและช้าขึ้นเรื่อย ๆ
  if (select count(*) from pg_indexes
       where schemaname = 'public'
         and indexname in ('catalog_place_names_search_idx', 'custom_place_names_search_idx')) <> 2 then
    raise exception 'D56: index trgm ไม่ครบ 2 ตัว';
  end if;
end $verify$;

commit;
