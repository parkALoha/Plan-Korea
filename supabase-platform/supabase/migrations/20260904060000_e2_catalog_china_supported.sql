-- ════════════════════════════════════════════════════════════════════════════
-- E2 — เปิด `supported` ให้ จีน · ฮ่องกง · มาเก๊า (แก้ของที่ `20260904040000` พลาด)
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026 · P2 เจอ
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 **บั๊ก: `20260904040000` แทรกประเทศโดยไม่ระบุ `supported`**
--    → ได้ค่าเริ่มต้น `false` → **`/api/engine/countries` กรองออกทั้งสามใบ**
--    ⇒ ข้อมูล **119 แห่ง** (จีน 98 · ฮ่องกง 12 · มาเก๊า 9) อยู่ในฐานแล้ว
--      **แต่ผู้ใช้มองไม่เห็นสักแห่ง**
--
-- ── 🎯 ทำไมด่านของ migration เดิมจับไม่ได้ ────────────────────────────
-- `20260904040000` มี assert ครบ 3 ข้อ และ **ผ่านหมด**:
--     นับประเทศ = 3 ✅ · นับเมือง = 9 ✅ · ไม่มีอักขระ PUA ✅
-- 🔴 **ทุกข้อถามว่า "แถวอยู่ในตารางไหม" — ไม่มีข้อไหนถามว่า "ผู้ใช้เห็นไหม"**
--    ***ตระกูลเดียวกับที่ทีมจดไว้: หลักฐานที่ถูกต้อง แต่ตอบคนละคำถาม***
--    วัดง่าย  = "แถวมีไหม"      · คำถามจริง = "เสิร์ฟออกไปไหม"
-- · 📌 P2 เจอเพราะ **เปิด `/api/engine/countries` จริงแล้วนับได้ 4 ไม่ใช่ 7**
--   ไม่ใช่เพราะอ่านโค้ด — **การยิงเส้นทางที่ผู้ใช้จริงใช้ คือสิ่งเดียวที่จับข้อนี้ได้**
--
-- ── ⚠️ ทำไมไม่ตั้ง default เป็น true ─────────────────────────────────
-- `supported=false` เป็นค่าเริ่มต้นที่ **ถูกแล้ว** — ประเทศที่เพิ่งใส่ยังไม่ควรโผล่
-- จนกว่าจะมีเมือง/สถานที่พร้อม (`D…` กัน fixture ของชุดทดสอบไม่ให้โผล่ด้วยกลไกเดียวกัน)
-- 🔴 **ที่ผิดคือ migration ที่เพิ่มประเทศพร้อมข้อมูลครบ แล้วไม่เปิดสวิตช์**
-- ════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
    where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then raise exception 'ผิดโปรเจกต์'; end if;

  -- 🔴 เปิดได้ต่อเมื่อ **มีของให้ดูจริง** — ไม่ใช่เปิดประเทศเปล่า
  if (select count(*) from public.catalog_places p
        join public.catalog_cities c on c.id = p.city_id
       where c.country_id in ('cn','hk','mo')) < 100 then
    raise exception 'ยังมีสถานที่ไม่พอสำหรับ cn/hk/mo — รัน 20260904050000 ก่อน';
  end if;
end $guard$;

update public.catalog_countries set supported = true, updated_at = now()
 where id in ('cn','hk','mo') and supported is distinct from true;

do $verify$
declare n int;
begin
  select count(*) into n from public.catalog_countries where id in ('cn','hk','mo') and supported;
  if n <> 3 then raise exception 'ควรเปิด supported ครบ 3 ประเทศ แต่ได้ %', n; end if;

  -- 🔴 ทิศบวก: ทุกประเทศที่เปิดต้องมีเมืองที่มีสถานที่จริง ไม่ใช่ประเทศเปล่า
  select count(*) into n from public.catalog_countries co
   where co.supported
     and not exists (
       select 1 from public.catalog_cities ci
        join public.catalog_places p on p.city_id = ci.id
       where ci.country_id = co.id);
  if n > 0 then raise exception 'มีประเทศที่ supported=true แต่ไม่มีสถานที่เลย % ประเทศ', n; end if;
end $verify$;
