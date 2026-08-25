-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `service_role` ดูแลคลังได้ · **ข้อยกเว้นที่ 3 ของ `D38`** (จดใน `TEAM.md` แล้ว)
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมต้องมี ────────────────────────────────────────────────────────────
-- `…132854_e2_catalog_geo.sql` สร้างตารางคลังแล้ว **แต่ `service_role` เขียนไม่ได้**
-- (`permission denied for table catalog_countries` — เจอตอนรันเทสต์ครั้งแรก)
-- ยืนยันว่าเป็นสภาพจริงของโปรเจกต์นี้ ไม่ใช่ของแปลก: `trips` ก็ต้อง grant ให้ `service_role`
-- แยกต่างหากมาแล้วเหมือนกัน (ข้อยกเว้นที่ 2 · `…222206_service_role_test_cleanup_grant.sql`)
--
-- ── ทำไมมันต่างจากข้อยกเว้นที่ 2 และทำไมผมถือว่ารับได้ ─────────────────────
-- ข้อยกเว้นที่ 2 เปิดสิทธิ์บน **`trips` ซึ่งเป็นข้อมูลของผู้ใช้** — จึงต้องแคบที่สุด (`select, delete` เท่านั้น)
-- 🎯 **คลังไม่มีข้อมูลของผู้ใช้เลยสักแถว** — เป็นข้อมูลอ้างอิงสาธารณะที่**ไม่มีทางเขียนจากฝั่งไคลเอนต์ได้**
--    (ไม่มี policy ฝั่งเขียน · `grant` ให้ `authenticated` มีแค่ `select`)
--    → **`service_role` คือทางที่ตั้งใจให้ใช้ดูแลมัน** ไม่ใช่ทางลัดที่หลบด่าน
-- · ผู้ใช้จริงของสิทธิ์นี้: **seed คลังตอน `E7`** (ย้าย `data/places.ts` ลงฐาน) · fixture ของชุดทดสอบ
--
-- 🔴 **สิ่งที่ *ไม่* เปลี่ยน:** `lib/__tests__/authNoServiceRole.test.ts` ยังบังคับว่า
--    **โค้ดที่เสิร์ฟผู้ใช้ (`lib/auth` + `app/`) ห้ามแตะ service role key** เหมือนเดิมทุกตัวอักษร
-- ⚠️ **ห้าม `grant all`** ตามกติกาใน `TEAM.md` — ระบุชื่อสิทธิ์ทีละตัวเสมอ
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   revoke select, insert, update, delete on public.catalog_countries from service_role;
--   revoke select, insert, update, delete on public.catalog_cities    from service_role;
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

grant select, insert, update, delete on public.catalog_countries to service_role;
grant select, insert, update, delete on public.catalog_cities    to service_role;

commit;
