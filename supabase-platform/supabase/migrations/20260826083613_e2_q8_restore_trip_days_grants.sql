-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 `P-63` **เกิดซ้ำทั้งดุ้น — ในไฟล์ที่อ้างถึง `P-63` อยู่ในคอมเมนต์ของตัวเอง**
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · แก้ `20260826083026`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่ผมทำพัง ──────────────────────────────────────────────────────────
-- `Q8` ต้องถอด `note` ออกจาก grant ของ `trip_days` · ผมเขียน:
-- ```
-- revoke insert, update on public.trip_days from authenticated;
-- grant insert (overnight_kind, overnight_city_id) …    -- ← เหลือ 2 คอลัมน์
-- ```
-- **ผลคือ `authenticated` เพิ่มวันไม่ได้เลย** — `permission denied for table trip_days`
-- เคสสดของ P4 แดง **12 เคส · 10 suite** ทันที
--
-- ── 🔴 ทำไมผมได้ลิสต์ผิด ทั้งที่ไปอ่านไฟล์มาก่อน ────────────────────────────
-- ผมอ่าน `20260825232458` ซึ่งเขียนว่า `grant insert (overnight_kind, overnight_city_id, note)`
-- **แล้วอ่านมันเป็น "ลิสต์ทั้งหมด" ทั้งที่มันเป็น "ส่วนที่ไฟล์นั้นเพิ่ม"**
-- ประวัติจริงของสิทธิ์นี้กระจายอยู่ใน **4 ไฟล์**:
-- ```
-- 20260825110903  grant select, insert, update            (ระดับตาราง = ทุกคอลัมน์)
-- 20260825122247  revoke → grant insert (id, trip_id, date, timezone) · update (trip_id, date, timezone)
-- 20260825230512  grant insert (city_id) · update (city_id)
-- 20260825232458  grant insert (overnight_kind, overnight_city_id, note) · update (…)
-- ```
-- 🎯 **`grant` สะสม · `revoke` ล้างทั้งหมด — และไฟล์ที่บอกความจริงทั้งหมดไม่มีอยู่**
--    ต้องอ่านทั้ง 4 ไฟล์แล้วประกอบเอง **และไม่มีอะไรบอกว่ามีกี่ไฟล์ที่ต้องอ่าน**
--
-- ── 🔴 และครึ่งที่สองของ `P-63` ก็เกิดซ้ำด้วย ───────────────────────────────
-- ผมเขียน `do $verify$` ตรวจว่า `grant update` เหลือ **2 คอลัมน์** · **มันผ่าน**
-- เพราะ **เลข 2 มาจากลิสต์ผิดใบเดียวกับที่ผมพิมพ์**
-- > *"ตัวตรวจที่ได้ค่าคาดหวังมาจากแหล่งเดียวกับของที่ถูกตรวจ ยืนยันได้แค่ว่าผมพิมพ์ตรงกับที่ผมคิด"*
-- **ผมเขียนประโยคนี้เองเมื่อ 10 ชั่วโมงก่อน ในบันทึกของ `P-63`**
--
-- 🔴 **บทเรียนที่ต่างจาก `P-63` เดิม และเป็นเหตุผลที่ไฟล์นี้ต้องมีคอมเมนต์ยาว:**
-- > **การอ้างถึงบทเรียน ไม่ใช่การใช้บทเรียน** — ไฟล์ `20260826083026` เขียนคำว่า `P-63`
-- > ไว้ในคอมเมนต์ตรงบรรทัดที่พลาดพอดี **แล้วก็ยังพลาด**
-- · คอมเมนต์นั้นเตือนเรื่อง *"ลิสต์ทั้งอัน"* ถูกทุกตัวอักษร · **แต่ผมไปหาลิสต์จากไฟล์เดียว**
-- · 🎯 **สิ่งที่ขาดไม่ใช่ความรู้ — คือ *ขั้นตอนที่บังคับให้ไปดูของจริง*** ซึ่งคือสิ่งที่ไฟล์นี้เพิ่ม
--
-- ── ท่าที่ใช้ในไฟล์นี้: **ยืนยันด้วย *ชื่อ* ไม่ใช่ *จำนวน*** ─────────────────
-- จำนวนผิดได้เงียบเพราะมันมาจากลิสต์เดียวกับที่พิมพ์ · **ชื่อผิดต้องพิมพ์ชื่อผิดจริง ๆ**
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

-- ลิสต์ที่ถูก = ประกอบจากทั้ง 4 ไฟล์ **ลบ `note` ที่ `Q8` ย้ายออกไป**
-- 🔴 `id` อยู่ฝั่ง insert ไม่อยู่ฝั่ง update (`20260825122247`) — แก้ `id` = ย้ายวันข้ามตัวตน
revoke insert, update on public.trip_days from authenticated;
grant insert (id, trip_id, date, timezone, city_id, overnight_kind, overnight_city_id)
  on public.trip_days to authenticated;
grant update (trip_id, date, timezone, city_id, overnight_kind, overnight_city_id)
  on public.trip_days to authenticated;

do $verify$
declare
  got  text[];
  want text[];
begin
  -- ① INSERT — เทียบ **ชื่อ** ไม่ใช่จำนวน
  select array_agg(column_name order by column_name) into got
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'trip_days'
     and grantee = 'authenticated' and privilege_type = 'INSERT';
  want := array['city_id','date','id','overnight_city_id','overnight_kind','timezone','trip_id'];
  if got is distinct from want then
    raise exception 'trip_days INSERT ไม่ตรง · ได้ % · ต้องการ %', got, want;
  end if;

  -- ② UPDATE — เหมือนกัน ลบ `id` ออก
  select array_agg(column_name order by column_name) into got
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'trip_days'
     and grantee = 'authenticated' and privilege_type = 'UPDATE';
  want := array['city_id','date','overnight_city_id','overnight_kind','timezone','trip_id'];
  if got is distinct from want then
    raise exception 'trip_days UPDATE ไม่ตรง · ได้ % · ต้องการ %', got, want;
  end if;

  -- ③ `note` ต้องไม่กลับมา — `Q8` ย้ายมันไป `trip_day_plan_settings` แล้ว
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trip_days' and column_name = 'note'
  ) then
    raise exception 'Q8: trip_days.note กลับมาแล้ว';
  end if;
end $verify$;

commit;
