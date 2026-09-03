-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ `Q3` ก้าวที่ 1 · ตัวยืนยันที่ **มีอำนาจแยกแยะจริง**                      ║
-- ║ P4 ชี้ทั้งสองข้อ · P1 เขียน · 3 ก.ย. 2026                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ## 🔴 ทำไมต้องมีไฟล์นี้ ทั้งที่ `20260902160000` มีบล็อก `do $verify$`/`do $purged$` อยู่แล้ว
--
-- **① `do $purged$` ใช้ predicate ตัวเดียวกับ `delete` แบบคัดลอกมาทั้งก้อน**
-- ```
-- delete from travel_time_cache t where <P>;                     -- ตัวที่ทำ
-- select count(*) into n from travel_time_cache t where <P>;     -- ตัวที่ตรวจ  ← <P> เดียวกัน
-- ```
-- 🎯 **บล็อกนั้นแดงได้กรณีเดียว: `delete` ไม่ทำงาน — มันไม่มีอำนาจแยกแยะ `<P>` ที่ *ผิด* เลยตามนิยาม**
-- · 🔴 **และ `<P>` ที่ผิดคือบั๊กที่เกิดจริง** (`place_id:` ไม่เคยถูกเทียบ → ลบแถวสาธารณะ 3+3 แถว)
--   ⇒ ถ้า P1 ไม่ได้เจอด้วยมือจากการวัดกับสำเนาแช่แข็ง **บล็อกนั้นจะเขียวผ่านให้ แล้วรายงานว่า "ล้างครบ ตรวจแล้ว"**
-- · 🎯 ตระกูล *"จักรวาลของตัวตรวจ มาจาก derivation เดียวกับตัวที่ถูกตรวจ"* — **ใบนี้แข็งที่สุดในตระกูล
--   เพราะมันคัดลอกเงื่อนไขมาตรง ๆ ไม่ใช่แค่คิดจากที่เดียวกัน**
--
-- **② `do $verify$` อ่านสิทธิ์จาก `information_schema.role_table_grants` ซึ่งกรองด้วย *enabled roles***
-- · ทิศที่แย่ไม่ใช่ *บล็อกงาน* แต่คือ **มองไม่เห็น grant ที่มีอยู่จริง แล้วผ่านฟรี** — และข้อ ①/② ในบล็อกนั้น
--   เป็น *ข้อความปลอดภัย* ⇒ **มันจะผ่านพร้อมกับอันตราย**
-- · 📌 วัดมาแล้วว่ามุมมองนี้ **รายงานเกินจริง** ได้ในสภาพที่เจ้าของตารางเป็นสมาชิกของ `anon`
--   (เจอในสนามซ้อมในเครื่อง · ดู `scripts/e7-local-rehearsal.sh`)
-- · ✅ **`has_table_privilege()` ตอบตรง ไม่ขึ้นกับว่า role ไหน enabled อยู่**
--
-- ## ⚠️ ไฟล์ `20260902160000` **ไม่ถูกแก้** โดยตั้งใจ
-- มันรันบน `engine-dev` ไปแล้ว — **แก้ทีหลังจะทำให้ไฟล์ในรีโปไม่ใช่สิ่งที่รันจริง**
-- ไฟล์นี้จึงเป็น *ตัวต่อ* ไม่ใช่ *ตัวแทน* · และตอน `E9` รันชุดใหม่ ทั้งสองใบจะรันเรียงกันตามลำดับ

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์ — ต้องเป็น plan-korea-platform/pmvxwcimjebogjfimzqy/dev'; end if;
end $guard$;

-- ── ตัวยืนยันถาวร เรียกซ้ำได้ · `E9` และชุดเทสต์เรียกตัวเดียวกันนี้ ──
create or replace function app.assert_cache_lockdown() returns void
language plpgsql security invoker set search_path = '' as $fn$
declare n int; r record;
begin
  -- ① ฝั่งไคลเอนต์ห้ามมีสิทธิ์เขียนบนแคชใบไหนเลย — ถามตรงด้วย has_table_privilege
  for r in
    select w.who, t.tbl from unnest(array['authenticated','anon']) w(who)
    cross join unnest(array['public.place_details_cache','public.place_photo_cache',
                            'public.travel_time_cache','public.place_details_local_cache']) t(tbl)
  loop
    if has_table_privilege(r.who, r.tbl, 'INSERT')
    or has_table_privilege(r.who, r.tbl, 'UPDATE')
    or has_table_privilege(r.who, r.tbl, 'DELETE')
    or has_table_privilege(r.who, r.tbl, 'TRUNCATE') then
      raise exception '🔴 % ได้สิทธิ์เขียนบน % — ก้าวที่ 1 ห้ามมีการเขียนฝั่งไคลเอนต์เลย', r.who, r.tbl;
    end if;
  end loop;

  -- ② สองใบที่ไฟล์ก่อนหน้าประกาศว่า "ไม่แตะ" ต้องอ่านไม่ได้เลยแม้แต่ SELECT
  if has_table_privilege('authenticated','public.travel_time_cache','SELECT')
  or has_table_privilege('anon','public.travel_time_cache','SELECT')
  or has_table_privilege('authenticated','public.place_details_local_cache','SELECT')
  or has_table_privilege('anon','public.place_details_local_cache','SELECT') then
    raise exception '🔴 travel_time_cache / place_details_local_cache อ่านได้จากฝั่งไคลเอนต์ — ไฟล์ก่อนหน้าประกาศว่าไม่แตะสองใบนี้';
  end if;

  -- ③ สองใบที่เปิดอ่าน ต้องเปิดให้ `authenticated` เท่านั้น ไม่ใช่ `anon`
  if not has_table_privilege('authenticated','public.place_details_cache','SELECT')
  or not has_table_privilege('authenticated','public.place_photo_cache','SELECT') then
    raise exception '🔴 authenticated อ่าน place_details_cache/place_photo_cache ไม่ได้ — route จะอ่านแคชไม่ได้เลย';
  end if;
  if has_table_privilege('anon','public.place_details_cache','SELECT')
  or has_table_privilege('anon','public.place_photo_cache','SELECT') then
    raise exception '🔴 anon อ่านแคชได้ — ประตูเปิดกว้างกว่าที่ประกาศ';
  end if;

  -- ④ policy ต้องมี 2 ใบ และเป็น SELECT ทั้งคู่ (`pg_policies` เป็น catalog view ตรง ไม่มีปัญหา enabled roles)
  select count(*) into n from pg_policies where schemaname='public'
    and tablename in ('place_details_cache','place_photo_cache','travel_time_cache','place_details_local_cache');
  if n <> 2 then raise exception 'คาด policy 2 ใบ ได้ % — grant กับ policy ต้องตรงกัน', n; end if;

  -- 🔴 ⑤ **ตัวควบคุมฝั่งบวก — ใบเดียวในไฟล์นี้ที่มีอำนาจจับ `<P>` ที่ผิด** (P4 เสนอ)
  --    ทุกข้อข้างบนตรวจ *สิทธิ์* · ข้อนี้ตรวจว่า **เงื่อนไขลบไม่ได้กินคีย์รูปที่สองทิ้ง**
  --    ⚠️ **ข้อจำกัดที่ต้องรู้ (P4 เขียนกำกับมาเอง): ถ้าฐานไม่เคยมีคีย์รูปนั้น ข้อนี้จะแดงโดยไม่มีบั๊ก**
  --       → จึงบังคับเฉพาะเมื่อ **คลังมีคู่ให้จับได้จริง** ไม่ใช่บังคับลอย ๆ
  select count(*) into n from public.catalog_places c
   where c.google_place_id is not null
     and exists (select 1 from public.place_details_cache d
                  where d.maps_query = 'place_id:' || c.google_place_id);
  if n = 0 and exists (select 1 from public.catalog_places where google_place_id is not null) then
    raise exception
      '🔴 คลังมี google_place_id อยู่ แต่ไม่เหลือแถวแคชรูป place_id: ที่จับคู่ได้เลยสักแถว — '
      'เงื่อนไขลบน่าจะกินคีย์รูปที่สองทิ้ง (บั๊กที่แก้ไปแล้วใน 20260902160000)';
  end if;
  raise notice 'cache lockdown: ผ่านครบ 5 ข้อ · แถว place_id: ที่จับคู่คลังได้ %', n;
end $fn$;

revoke all on function app.assert_cache_lockdown() from public;

do $run$ begin perform app.assert_cache_lockdown(); end $run$;

commit;
