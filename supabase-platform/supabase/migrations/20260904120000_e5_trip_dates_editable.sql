-- ════════════════════════════════════════════════════════════════════════════
-- E5 — แก้ช่วงวันของทริปหลังสร้างแล้ว (`start_date`/`end_date` + เพิ่ม/ถอนวัน)
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026
-- ════════════════════════════════════════════════════════════════════════════
-- ## ทำไมต้องมี
-- ช่วงวันของทริปถูกกำหนด **ครั้งเดียวตอนสร้าง** ผ่าน `create_trip` (`20260827080000:70-93`)
-- แล้วไม่มีเส้นทางไหนแก้ได้เลย เพราะ `20260826…:75` `revoke insert, update on public.trips
-- from authenticated` แล้ว grant กลับมาแค่ `cover_image_url` (`:164-165`)
-- ⇒ **พิมพ์วันผิดตอนสร้าง = ต้องสร้างทริปใหม่ทั้งใบ** และทริปเก่าลบทิ้งก็ไม่ได้อีก
--
-- 🎯 ***ช่องที่แก้ไม่ได้ ไม่ได้แปลว่า "แก้ไม่บ่อย" — มันแปลว่าพลาดแล้วจบ***
--
-- ## สิ่งที่ไฟล์นี้ให้ และไม่ให้
-- ✅ `grant update (start_date, end_date) on trips` — policy `trips_update` (owner เท่านั้น)
--    มีอยู่แล้วที่ `20260824043822:268-271` **ไฟล์นี้ไม่แตะ policy นั้นเลย**
-- ✅ `trip_days_delete` policy + `grant delete on trip_days` — ย่อช่วงวันแล้วต้องถอนวันส่วนเกินได้
-- ❌ **ไม่ให้ `delete on trips`** — ดูข้อถัดไป
--
-- ## 🔴 ทำไมไม่รวม "ลบทริป" ไว้ในไฟล์นี้ ทั้งที่มันเป็นของที่ขาดเหมือนกัน
-- `20260824043822:273-274` เขียนไว้ตรง ๆ ว่า:
--   *"ไม่มี policy DELETE — ลบทริปคือลบจุดแวะทั้งทริปแบบย้อนไม่ได้
--     ต้องผ่านทางที่ตั้งใจ (E2 soft delete) ไม่ใช่ DELETE ตรงจาก client"*
-- ⇒ **มีคนตัดสินใจเรื่องนี้ไปแล้ว และทางที่เขาเลือกคือ soft delete ซึ่งยังไม่ถูกสร้าง**
-- การเติม `grant delete` ที่นี่คือการเดินสวนมติเดิม **ในไฟล์ที่ชื่อว่าเรื่องวันที่**
-- ซึ่งจะไม่มีใครหาเจอตอนย้อนดูว่าทำไมมติเปลี่ยน
-- · 📌 ลบทริปเป็นใบแยก และต้องเป็น soft delete (รูปเดียวกับ `soft_delete_trip_hotel`
--   ที่ `20260825150325:124-135`) พร้อมแก้ `trips_select` ให้กรอง `deleted_at`
--   — **งานนั้นแตะ policy ที่ทุกตารางลูกพึ่งอยู่ จึงต้องเป็นการตัดสินใจของตัวเอง ไม่ใช่ผลพลอยได้**
--
-- ## ⚠️ สิ่งที่ไฟล์นี้ **ไม่** รับประกัน และผู้เรียกต้องรับผิดชอบ
-- `grant delete on trip_days` ทำให้ลบวันที่ **มีจุดแวะอยู่** ได้ด้วย (`trip_stops.day_id` cascade)
-- 🔴 **ฐานไม่กันข้อนี้ให้ และไม่ควรกัน** — ผู้ใช้ที่ย่อทริปจาก 7 วันเหลือ 5 วันตั้งใจทิ้งสองวันนั้นจริง
--    ⇒ **ด่านอยู่ที่ route**: ย่อช่วงวันแล้ววันที่หายมีจุดแวะ ต้องตอบ `409` พร้อมบอกจำนวน
--      และเดินต่อได้เฉพาะเมื่อผู้เรียกยืนยันมาโดยเจตนา (`app/api/engine/trips/[tripId]/route.ts`)
--    🎯 *สิ่งที่ย้อนไม่ได้ต้องเป็นการกระทำที่รู้ตัว — ไม่ใช่ผลข้างเคียงของการแก้วันที่*
--
-- ── ถอนคืน ────────────────────────────────────────────────────────────────
--   revoke update (start_date, end_date) on public.trips from authenticated;
--   revoke delete on public.trip_days from authenticated;
--   drop policy if exists trip_days_delete on public.trip_days;
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
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

-- ───────────────────────────────────────────────────────────────────────────
-- 1. เจ้าของทริปแก้ช่วงวันได้
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **grant ทีละคอลัมน์ ไม่ใช่ `grant update on public.trips`**
--    `20260826…:162` ตั้งรูปนี้ไว้แล้วโดยตั้งใจ — `trips` มีคอลัมน์ที่ไคลเอนต์ห้ามแตะ
--    (`created_by` · `base_timezone` ที่ `D37` ผูกไว้กับการคำนวณเวลาทั้งทริป)
--    ⇒ เปิดทั้งตารางคือเปิดของที่ไม่มีใครขอ
-- ⚠️ constraint `trips_dates_ordered` เป็นคนกัน `end < start` อยู่แล้ว — ไม่ต้องเขียนซ้ำที่นี่
grant update (start_date, end_date) on public.trips to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ถอนวันส่วนเกินได้เมื่อย่อช่วงวัน
-- ───────────────────────────────────────────────────────────────────────────
-- `can_write_trip` ตัวเดียวกับ `trip_days_insert`/`trip_days_update` (`20260825110903:146,155`)
-- ⇒ **ไม่มีเกณฑ์สิทธิ์ใหม่ให้ดูแล** — editor ที่เพิ่มวันได้ ก็ถอนวันได้ ซึ่งสมมาตรและอธิบายง่าย
-- 🔴 ไม่ใช้ `owner` เหมือน `trips_update` โดยตั้งใจ: การเพิ่ม/ถอนวันเป็นการ *แก้แผน*
--    ส่วนการแก้ `trips.start_date` เป็นการ *แก้ตัวทริป* — คนละระดับ และฐานสะท้อนความต่างนั้นอยู่แล้ว
drop policy if exists trip_days_delete on public.trip_days;
create policy trip_days_delete on public.trip_days
  for delete to authenticated
  using (app.can_write_trip(trip_id));

grant delete on public.trip_days to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. assert — ต้องแดงถ้าไฟล์นี้ไม่ได้ผล
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 assert ที่ถามว่า *"สิทธิ์ถูกให้ไหม"* ไม่ได้ตอบว่า *"เรียกได้ไหม"* (`TEAM.md §3.5` ข้อ 6/7)
--    ที่นี่ทั้งสองคำถามตรงกันจริง เพราะเป็น grant บนตารางที่ PostgREST expose อยู่แล้ว
--    (ต่างจากฟังก์ชันใน schema `app` ที่ต้องมี wrapper + definer) — **จดไว้ว่าตรงกันเพราะอะไร
--    ไม่ใช่ปล่อยให้คนอ่านทีหลังเดาว่าเราลืมคิด**
do $assert$
begin
  if not has_column_privilege('authenticated', 'public.trips', 'start_date', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated ยัง update trips.start_date ไม่ได้';
  end if;
  if not has_column_privilege('authenticated', 'public.trips', 'end_date', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated ยัง update trips.end_date ไม่ได้';
  end if;

  -- ✅ เคสควบคุมฝั่งลบ — ต้องพิสูจน์ว่าเรา **ไม่ได้** เปิดเกินที่ขอ
  --    ไม่มีข้อนี้ `grant update on public.trips` ทั้งตารางก็ผ่าน assert ข้างบนครบเหมือนกันเป๊ะ
  if has_column_privilege('authenticated', 'public.trips', 'created_by', 'UPDATE') then
    raise exception 'assert ล้ม: เปิดกว้างเกิน — authenticated update trips.created_by ได้';
  end if;
  if has_column_privilege('authenticated', 'public.trips', 'base_timezone', 'UPDATE') then
    raise exception 'assert ล้ม: เปิดกว้างเกิน — authenticated update trips.base_timezone ได้';
  end if;

  if not has_table_privilege('authenticated', 'public.trip_days', 'DELETE') then
    raise exception 'assert ล้ม: authenticated ยัง delete trip_days ไม่ได้';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'trip_days' and policyname = 'trip_days_delete'
  ) then
    raise exception 'assert ล้ม: ไม่มี policy trip_days_delete — grant อย่างเดียวลบไม่ได้เพราะ RLS เปิดอยู่';
  end if;

  -- 🔴 เคสควบคุมของมติเดิม — ไฟล์นี้ต้อง **ไม่** ทำให้ลบทริปได้
  --    ถ้าวันหนึ่งมีคนตั้งใจเปิด เขาจะเห็น assert นี้แดงและรู้ว่าต้องมาแก้ที่นี่ด้วย
  --    ⇒ มติเดิมถูกผูกกับของที่รันได้ ไม่ใช่กับคอมเมนต์ที่หมดอายุเงียบ
  if has_table_privilege('authenticated', 'public.trips', 'DELETE') then
    raise exception 'assert ล้ม: authenticated ลบ trips ได้ — ขัดมติที่ 20260824043822:273 (ต้องเป็น soft delete)';
  end if;
end $assert$;

commit;
