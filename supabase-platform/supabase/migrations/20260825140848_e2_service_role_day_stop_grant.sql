-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `service_role` เข้าถึง `trip_days`/`trip_stops` ได้เท่าที่จำเป็น
--      **ข้อยกเว้นที่ 4 ของ `D38`** (จดใน `TEAM.md`)
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมต้องมี — และมันเปิดเผยของที่น่าสนใจกว่าตัว grant ────────────────────
-- เคส `D73` (*"ลบวันที่ยังมีจุดแวะอยู่ไม่ได้"*) **ไปไม่ถึง trigger ด้วยซ้ำ**
-- `permission denied for table trip_days` — `service_role` ไม่มีสิทธิ์บนตารางนี้เลย
--
-- 🎯 **ข้อเท็จจริงที่เพิ่งรู้จากการรัน: ประตูที่ P7 กลัวหนึ่งบาน ปิดอยู่แล้ววันนี้**
--    `service_role` ลบ `trip_days` ไม่ได้ · แต่ **ประตู `security definer` ยังเปิดอยู่**
--    (ฟังก์ชันรันด้วยสิทธิ์เจ้าของ = ไม่ผ่าน grant นี้) → **trigger ยังจำเป็นทุกตัวอักษร**
--    · และตัวปรับช่วงวันของ `E3` คือของที่จะเดินเข้าประตูนั้นพอดี
--
-- ── ขอบเขต และทำไมรูปนี้ ──────────────────────────────────────────────────
-- **รูปเดียวกับข้อยกเว้นที่ 2 เป๊ะ** (`grant select, delete on public.trips to service_role`)
-- และด้วยเหตุผลเดียวกัน: **ชุดทดสอบต้องเดินเส้นทางที่ไคลเอนต์เดินไม่ได้ เพื่อพิสูจน์ว่ามันถูกกัน**
-- · `trip_days` — `select, delete` เท่านั้น · `trip_stops` — `select` เท่านั้น (อ่านกลับมายืนยันผล)
-- 🔴 **ไม่ให้ `insert`/`update`** — fixture ทั้งหมดสร้างผ่าน client ของผู้ใช้จริง (`A`/`B`/`C`)
--    ซึ่งเป็นสิ่งที่ทำให้เคสวัด RLS จริง ไม่ใช่วัดว่า service_role ทำอะไรได้
-- ⚠️ **ห้าม `grant all`** ตามกติกา `TEAM.md`
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   revoke select, delete on public.trip_days from service_role;
--   revoke select on public.trip_stops from service_role;
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

grant select, delete on public.trip_days  to service_role;
grant select          on public.trip_stops to service_role;

commit;
