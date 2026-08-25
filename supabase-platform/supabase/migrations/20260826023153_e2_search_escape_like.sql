-- ═══════════════════════════════════════════════════════════════════════════
-- `P-66` — `search_place_names()` ไม่ escape LIKE wildcard · **P4 หักด่านผมด้วยอักขระเดียว**
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่ P4 ยิงได้ ────────────────────────────────────────────────────────
-- ```
-- ค้น 'ไม่มีจริงzz' → 0 แถว  ✅
-- ค้น '   '        → 0 แถว  ✅ ด่านคำค้นว่างของผมทำงาน
-- ค้น '%'          → 5 แถว  🔴 ทั้งคลังของเมือง
-- ค้น '_'          → 5 แถว  🔴
-- ```
-- `app.search_norm()` ทำแค่ `lower` + `unaccent` → `q` ไปโผล่ใน `like '%' || q || '%'` **ดิบ ๆ**
--
-- 🎯 **ด่านที่ผมเขียนไว้เอง (`length(trim(q)) = 0 → return`) มีไว้กัน *"คืนทั้งคลัง"* พอดี**
--    **และมันถูกเดินอ้อมด้วยอักขระเดียว** — ด่านที่กันเจตนาหนึ่ง แต่กันเฉพาะ*ทางที่ผมนึกออก*
--
-- ── ⚠️ ขอบเขตความรุนแรง — P4 ระบุไว้ชัดและผมยกมาทั้งข้อ ไม่ตัดให้ดูเบา ─────
-- **ไม่ใช่ช่องรั่วข้อมูล:** `catalog_place_names` เป็น `using (true)` → ใครก็ select ทั้งคลังได้อยู่แล้ว
-- และ `limit p_limit` ยังคุมจำนวนแถวอยู่
-- 🔴 **ทางที่กัดจริงคือ `E5`:** copilot ประกอบ `p_query` จากผลลัพธ์โมเดล
--    → สตริงที่มี `%` หรือ `_` จะได้คลังทั้งเมืองกลับไป **แล้วเอเจนต์จะเชื่อว่านั่นคือ "ผลค้นหา"**
--    · **คนพิมพ์เองแทบไม่เจอ · เอเจนต์เจอแน่** — และมันจะดูเหมือนคำตอบที่มีเหตุผลทุกประการ
--
-- ── ทำไม escape ไม่ใช่ตัด LIKE ทิ้ง ─────────────────────────────────────────
-- LIKE มีไว้รับคำค้นสั้นที่ trigram มองไม่เห็น (similarity ต่ำกว่า threshold)
-- **ตัดทิ้ง = ค้นคำสั้นพังทั้งหมด เพื่อแก้บั๊กของอักขระสองตัว** — ราคาผิดสัดส่วน
--
-- 🔴 **ลำดับของ `replace` สำคัญ: `\` ต้องมาก่อนเสมอ**
--    ถ้าแทน `%` ก่อน `\%` ที่เพิ่งสร้างจะโดน escape ซ้ำในรอบของ `\` กลายเป็น `\\%`
--    → กลับไปเป็น wildcard อีกครั้ง **และเทสต์ที่ยิงแค่ `%` ตัวเดียวจะยังเขียว**
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

/**
 * ทำให้สตริงค้นหาเป็น **ข้อความล้วน** สำหรับ `LIKE` — `\` ก่อน แล้วค่อย `%` `_`
 * ⚠️ ใช้คู่กับ `escape '\'` เสมอ · ขาดคำสั่งนั้นแล้ว backslash จะไม่มีความหมายพิเศษและ escape ไร้ผล
 */
create or replace function app.like_literal(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select replace(replace(replace(coalesce(t, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

create or replace function public.search_place_names(
  p_trip_id uuid,
  p_query   text,
  p_intent  text,           -- 🔴 ไม่มี default โดยตั้งใจ (`copilot-spec.md §25`)
  p_city_id uuid default null,
  p_limit   int  default 20
)
returns table (
  source       text,
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
  q      text := app.search_norm(p_query);
  q_like text := '%' || app.like_literal(app.search_norm(p_query)) || '%';
begin
  if p_intent is null or p_intent not in ('identify', 'discover') then
    raise exception 'search_place_names: p_intent ต้องเป็น ''identify'' หรือ ''discover'' (ได้มา: %) — ไม่มีค่าเริ่มต้นโดยตั้งใจ ดู copilot-spec.md §25', coalesce(p_intent, 'null');
  end if;

  if length(trim(coalesce(p_query, ''))) = 0 then
    return;
  end if;

  if p_intent = 'identify' then
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
              or app.search_norm(n.name) like q_like escape '\')
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
              or app.search_norm(cn.name) like q_like escape '\')
       order by 6 desc, 4 asc
       limit p_limit;
  else
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
              or app.search_norm(n.name) like q_like escape '\')
       order by 6 desc, 4 asc
       limit p_limit;
  end if;
end
$fn$;

revoke all on function public.search_place_names(uuid, text, text, uuid, int) from public;
grant execute on function public.search_place_names(uuid, text, text, uuid, int) to authenticated;

do $verify$
declare
  ok boolean;
begin
  -- ① ลำดับ replace ถูกไหม — ยิงตรง ๆ ไม่ใช่เชื่อว่าพิมพ์ถูก
  --    🔴 เคสนี้คือเคสที่จับ "แทน % ก่อน \" ได้ · เคสที่ยิงแค่ '%' ตัวเดียวจับไม่ได้
  if app.like_literal('a\%b_c') <> 'a\\\%b\_c' then
    raise exception 'P-66: like_literal ลำดับผิด — ได้ %', app.like_literal('a\%b_c');
  end if;

  -- ② `%` ล้วนต้องกลายเป็นข้อความล้วน
  if app.like_literal('%') <> '\%' then
    raise exception 'P-66: like_literal ไม่ escape %%';
  end if;

  -- ③ ยังเป็น invoker เหมือนเดิม (`D38`) — เขียนฟังก์ชันทับแล้วธงหายได้เงียบ ๆ
  select not prosecdef into ok
    from pg_proc where oid = 'public.search_place_names(uuid, text, text, uuid, int)'::regprocedure;
  if not ok then raise exception 'D38: search_place_names ต้องเป็น security invoker'; end if;

  -- ④ `p_intent` ยังไม่มีค่าเริ่มต้น
  select pronargdefaults = 2 into ok
    from pg_proc where oid = 'public.search_place_names(uuid, text, text, uuid, int)'::regprocedure;
  if not ok then raise exception 'copilot-spec §25: p_intent ต้องไม่มีค่าเริ่มต้น'; end if;
end $verify$;

commit;
