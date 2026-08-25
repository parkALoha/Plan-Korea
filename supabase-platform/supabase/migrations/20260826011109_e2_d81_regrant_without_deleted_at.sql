-- ═══════════════════════════════════════════════════════════════════════════
-- `P-63` — DDL ของ `D81` **คืน `deleted_at` กลับเข้ามือไคลเอนต์โดยไม่ได้ตั้งใจ**
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · **จับได้ด้วยเคสสดของ P4 ไม่ใช่ด้วยการอ่านโค้ด**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่เกิดขึ้น ──────────────────────────────────────────────────────────
-- `20260826010130` ต้องเขียน `grant update (...)` ใหม่ทั้งลิสต์ (เพราะ `revoke` แล้ว `grant`)
-- ผมประกอบลิสต์เดิมขึ้นมาจาก **`20260825142639_e2_soft_delete.sql`** ซึ่งมี `deleted_at` อยู่
-- 🔴 **แต่ `20260825142949_e2_soft_delete_rpc.sql` ถอด `deleted_at` ออกไปแล้ว หลังจากนั้น 3 นาที**
--    ด้วยเหตุผลที่เขียนไว้ในไฟล์นั้นเองว่า *"ถอน `deleted_at` ออกจากมือไคลเอนต์ — เหลือทางเดียวคือ RPC"*
-- → **ผมย้อนการแก้ความปลอดภัยของเมื่อวาน ด้วยการก๊อปลิสต์จากไฟล์ที่เก่ากว่าหนึ่งใบ**
--
-- ── 🎯 ทำไมมันไม่ใช่แค่ "ลอกผิดบรรทัด" ──────────────────────────────────────
-- `grant update (คอลัมน์...)` **ไม่ใช่ส่วนเพิ่ม มันคือลิสต์ทั้งอัน** — เขียนทับทุกครั้งที่แตะ
-- ทุกครั้งที่ใครเพิ่มคอลัมน์ใหม่ **เขาต้องพิมพ์ลิสต์เดิมซ้ำจากความจำหรือจากไฟล์สักใบ**
-- 🔴 **และ "ไฟล์สักใบ" นั้นอาจไม่ใช่ใบล่าสุด — ไม่มีอะไรในภาษาบอกเลยว่าลิสต์ที่กำลังลอกมันเก่าไปแล้ว**
-- · ยิ่งลิสต์ยาว (ตอนนี้ 36 ตัว) ยิ่งไม่มีใครไล่ทีละตัว · **นี่คือทางที่สิทธิ์ย้อนกลับได้เงียบที่สุดที่เรามี**
--
-- ── สิ่งที่จับได้ และสิ่งที่ *ไม่* จับ ─────────────────────────────────────────
-- ✅ เคสสดของ P4 (*"ไคลเอนต์เขียน `deleted_at` ได้ตรง ๆ"*) แดงทันทีในรอบแรก
-- 🔴 `do $verify$` ของผมเองในไฟล์เดิม **เขียว** — เพราะมันตรวจ *จำนวน* (37) ที่ผมคำนวณจากลิสต์ผิดตัวเดียวกัน
--    **ตัวตรวจที่ได้ค่าคาดหวังมาจากแหล่งเดียวกับของที่ถูกตรวจ ยืนยันได้แค่ว่าผมพิมพ์ตรงกับที่ผมคิด**
-- 🎯 ไฟล์นี้จึงเพิ่มด่านคนละชนิด: **assert ว่า `deleted_at` ไม่อยู่** — เป็นข้อความเชิงคุณสมบัติ ไม่ใช่เชิงจำนวน
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

-- ลิสต์เดียวกับ `20260826010130` เป๊ะ **ลบ `deleted_at` ออกตัวเดียว**
revoke update on public.trip_stops from authenticated;
grant update (plan_id, trip_day_id, catalog_place_id, custom_place_id, kind, rank,
              dwell_minutes, travel_mode, note, intercity_from, intercity_to, intercity_mode,
              visited_at, photo_path, transfer_target_time, transfer_target_label,
              event_kind, schedule_bound, fixed_start_time, fixed_end_time, day_offset,
              title, title_en, icon, is_alert, time_is_flexible,
              flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
              layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change,
              place_ref)
  on public.trip_stops to authenticated;

do $verify$
declare
  n int;
begin
  -- ① เชิงคุณสมบัติ — คอลัมน์ที่ห้ามอยู่ในมือไคลเอนต์ ต้องไม่อยู่
  --    🔴 ข้อนี้ต้องมาก่อนข้อ ② เสมอ · ข้อ ② เขียวได้ทั้งที่ข้อ ① แดง (แค่สลับตัวไหนอยู่ในลิสต์)
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'trip_stops'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
       and column_name in ('deleted_at', 'trip_id', 'added_by_user', 'legacy_added_by',
                           'created_at', 'updated_at', 'updated_by_user')
  ) then
    raise exception 'P-63: คอลัมน์ที่ห้ามให้ไคลเอนต์เขียน หลุดเข้า grant update: %',
      (select string_agg(column_name, ', ' order by column_name)
         from information_schema.column_privileges
        where table_schema = 'public' and table_name = 'trip_stops'
          and grantee = 'authenticated' and privilege_type = 'UPDATE'
          and column_name in ('deleted_at', 'trip_id', 'added_by_user', 'legacy_added_by',
                              'created_at', 'updated_at', 'updated_by_user'));
  end if;

  -- ② เชิงจำนวน — 16 (หลัง `soft_delete_rpc`) + 20 ของ `D81`
  select count(*) into n
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'trip_stops'
     and grantee = 'authenticated' and privilege_type = 'UPDATE';
  if n <> 36 then
    raise exception 'P-63: grant update ควรเป็น 36 คอลัมน์ แต่นับได้ %', n;
  end if;
end $verify$;

commit;
