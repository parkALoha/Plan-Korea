-- ════════════════════════════════════════════════════════════════════════════
-- E2 — เปิด `supported` ให้ ไต้หวัน · สิงคโปร์ (เงื่อนไขที่ `20260904080000`/`100000` ตั้งไว้เอง)
-- เจ้าของ: P5 · 4 ก.ย. 2026
-- ════════════════════════════════════════════════════════════════════════════
-- สองไฟล์นั้นตั้ง `supported = false` **โดยตั้งใจ** พร้อมเขียนเงื่อนไขปลดล็อกไว้ว่า
-- *"เปิดในไฟล์ที่ลงสถานที่"* — ตอนนี้ลงแล้ว: **ไต้หวัน 120 แห่ง · สิงคโปร์ 20 แห่ง**
-- และ **ไม่มีเมืองไหนในสองประเทศนี้ที่ยังว่าง** (วัดแบบแบ่งหน้า ไม่ใช่ครั้งเดียวชนเพดาน 1000)
--
-- 🔴 **บทเรียนที่ทำให้ไฟล์นี้มีอยู่ — `20260904060000` ของ P1:**
--    เพิ่มประเทศโดยไม่ตั้ง `supported` ⇒ ข้อมูล 119 แห่งอยู่ในฐานแต่ผู้ใช้มองไม่เห็นสักแห่ง
--    assert ของ migration นั้นผ่านครบ 3 ข้อ **เพราะทุกข้อถามว่า "แถวอยู่ในตารางไหม"**
--    ไม่มีข้อไหนถามว่า *"ผู้ใช้เห็นไหม"* · P2 จับได้ด้วยการเปิดหน้าจริงแล้วนับ
--    ⇒ **ไฟล์นี้ assert เงื่อนไขที่ทำให้การเปิดสวิตช์ *สมควร* ไม่ใช่แค่ว่าสวิตช์ถูกพลิก**
--
-- ── ถอนคืน ────────────────────────────────────────────────────────────────
--   update public.catalog_countries set supported = false where id in ('tw','sg');
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity — ฐานนี้ไม่ใช่ engine-dev';
  end if;
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- 🔴 **ตรวจ *ก่อน* พลิกสวิตช์ ไม่ใช่หลัง** — ถ้ายังมีเมืองว่าง ต้องไม่เปิด
do $precondition$
declare bad text;
begin
  select string_agg(ci.name_th, ', ') into bad
    from public.catalog_cities ci
    left join public.catalog_places p on p.city_id = ci.id
   where ci.country_id in ('tw','sg')
   group by ci.id, ci.name_th
  having count(p.id) = 0;

  if bad is not null then
    raise exception 'ยังมีเมืองที่ไม่มีสถานที่: % — เปิด supported ตอนนี้ = ผู้ใช้เลือกแล้วเจอหน้าว่าง', bad;
  end if;
end $precondition$;

update public.catalog_countries
   set supported = true
 where id in ('tw', 'sg');

do $verify$
declare n int;
begin
  select count(*) into n from public.catalog_countries
   where id in ('tw','sg') and supported;
  if n <> 2 then raise exception 'ควรเปิดครบ 2 ประเทศ แต่เปิดได้ %', n; end if;

  -- จำนวนประเทศที่ผู้ใช้เลือกได้ ต้องเป็น 9 พอดี (7 เดิม + 2 ใบนี้)
  select count(*) into n from public.catalog_countries where supported;
  if n <> 9 then raise exception 'ประเทศที่เปิดควรเป็น 9 แต่เป็น % — มีคนเปิด/ปิดอย่างอื่นด้วย', n; end if;
end $verify$;

commit;
