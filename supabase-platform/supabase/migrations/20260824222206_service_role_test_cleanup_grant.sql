-- ═══════════════════════════════════════════════════════════════════════════
-- P-28 ครึ่งที่สอง — ให้ `service_role` ลบทริปของ fixture ได้ เพื่อให้เมทริกซ์ RLS เก็บกวาดตัวเองได้
-- เจ้าของ: P1-Lead · จาก `P-28` (P1 ไล่โซ่ FK · P4 วัดสิทธิ์ได้ตรง) · 24 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 **ข้อยกเว้นของ `D38` — อ่านก่อนคิดจะขยาย grant นี้**
--   `D38` = *"Server Action ไม่ใช่สิทธิ์พิเศษ"* และมี `lib/__tests__/authNoServiceRole.test.ts`
--   บังคับว่า **โค้ดแอปห้ามแตะ `SUPABASE_SERVICE_ROLE_KEY`** เลยสักบรรทัด
--   grant นี้ **ไม่ขัดกับข้อนั้น** เพราะผู้ใช้สิทธิ์คือ *ชุดทดสอบ* ไม่ใช่โค้ดที่เสิร์ฟผู้ใช้
--   · เทสต์ตัวนั้นสแกนแค่ `lib/auth` กับ `app/` — เมทริกซ์อยู่นอกขอบเขตโดยตั้งใจ
--   🔴 **แต่ข้อยกเว้นที่ไม่ได้จด จะหายไปจากความจำของคนที่อนุมัติมันเอง** (`TEAM.md` ข้อ 3)
--     → จดไว้ที่ `TEAM.md` แล้วด้วย ไม่ใช่แค่ในไฟล์นี้กับ commit
--
-- ── ทำไมต้องมี ────────────────────────────────────────────────────────────
--   `afterAll` ของเมทริกซ์เก็บกวาดด้วย `auth.admin.deleteUser` อย่างเดียว แล้วติดโซ่นี้:
--     deleteUser → auth.users ถูกลบ → public.profiles (on delete cascade) ลบตาม
--                → ชน `trips.created_by references profiles(id) ON DELETE RESTRICT`
--   และ **ไม่มีทางลบทริปจากทางไหนเลย**: ไม่มี `trips_delete` policy (ตั้งใจ · รอ soft delete ที่ `E2`)
--   · `authenticated` ได้แค่ `select, insert, update` บน `trips`
--   → fixture ของทุกรอบค้างอยู่ในฐานถาวร และ user ลบไม่ออก
--
--   📌 **สองสาเหตุ ไม่ใช่สาเหตุเดียว** — P1 เจอโซ่ FK · P4 วัดได้ว่า `service_role`
--   ไม่มีแม้แต่ `select` บน `profiles` (`admin.from("profiles").select("id")` → `permission denied`)
--   **แก้ข้อเดียวไม่พอ** · ไฟล์นี้แก้ข้อที่สอง เท่าที่ `afterAll` ต้องใช้จริง
--
-- ── ทำไมแค่ `trips` และแค่ 2 สิทธิ์ ────────────────────────────────────────
--   กฎร่วมข้อ 5: **"อย่า grant สิ่งที่ยังไม่ต้องใช้"** · `afterAll` ต้องการทางเดียวคือ
--   หาทริปของรอบตัวเองแล้วลบมันก่อนลบ user · `trip_members` หายเองด้วย `on delete cascade`
--   ของ FK จาก `trips` (cascade ไม่ต้องมี grant) · `profiles` หายเองตอน `deleteUser`
--   🔴 **ถ้าวันหนึ่งต้องเพิ่ม ให้เพิ่มทีละสิทธิ์พร้อมเหตุผล ห้าม `grant all`**
--
-- ⚠️ **สิ่งที่ grant นี้ *ไม่* ได้แปลว่า:** `service_role` มี BYPASSRLS อยู่แล้วโดยนิยาม
--   grant จึงเป็นด่านสุดท้ายที่เหลือของตารางนี้สำหรับ role นั้น **ไม่มี policy มาช่วยอีกชั้น**
--   นี่คือเหตุผลที่ขอบเขตต้องแคบที่สุดเท่าที่ทำให้ `afterAll` เดินได้
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   revoke select, delete on public.trips from service_role;
--   🟢 ถอยได้สะอาด · ผลคือ `afterAll` กลับไปเก็บกวาดไม่ได้เหมือนเดิม ไม่มีอย่างอื่นพัง
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · allowlist ตาม D48 · fail closed ──────────────────
do $guard$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'app' and table_name = 'project_identity'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ฐานนี้ไม่ใช่ engine-dev ของแพลตฟอร์ม';
  end if;

  -- 🔴 `P-31`: ต้องเช็ค `ref` + `environment` ด้วย · `name` อย่างเดียวแยก dev ออกจาก prod ไม่ได้
  --    วันที่มี prod มันจะชื่อ `plan-korea-platform` เหมือนกันเป๊ะ
  --    ⚠️ **เปลี่ยน ref ตรงนี้ = เจตนาเล็งไปฐานอื่น** ต้องเป็นการตัดสินใจ ไม่ใช่การคัดลอก
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform'
       and ref  = 'pmvxwcimjebogjfimzqy'
       and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;
end $guard$;

grant select, delete on public.trips to service_role;

commit;
