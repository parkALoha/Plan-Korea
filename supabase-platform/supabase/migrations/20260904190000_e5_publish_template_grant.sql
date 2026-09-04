-- ════════════════════════════════════════════════════════════════════════════
-- E5 — ให้ `service_role` ติดธง "ทริปแนะนำ" ได้ · ข้อยกเว้นที่ 8 ของทะเบียน `§3.5`
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026
-- ════════════════════════════════════════════════════════════════════════════
-- ## 🔴 ทำไมต้องมี — **ผมสร้างคอลัมน์ที่ไม่มีใครเขียนได้เลย**
-- `20260904180000` เพิ่ม `trips.published_template_at` แล้ว **จงใจไม่ให้ `authenticated`**
-- (ไม่งั้นไคลเอนต์ประกาศทริปตัวเองเป็นทริปแนะนำได้ — assert ในใบนั้นบังคับข้อนี้อยู่)
-- 🎯 ***แต่ผมไม่ได้ให้ใครเลย ⇒ ฟีเจอร์ทั้งอันเรียกใช้ไม่ได้ · ธงที่ไม่มีใครติดได้ = ธงที่ไม่มีอยู่***
-- · รูปเดียวกับข้อ 6/7 ของ `§3.5` เป๊ะ (*ฟังก์ชันที่ไม่มีใครเรียกได้ ไม่ใช่ด่าน มันคือโค้ดที่ตายแล้ว*)
--   **แค่คราวนี้ผมเป็นคนสร้างมันเอง ในวันเดียวกับที่อ้างกติกาข้อนั้น**
--
-- ## 🔴 และ `hint` ของ PostgREST ที่โผล่มาตอนผมยิงทดสอบ **ไม่ใช่เหตุผลของใบนี้**
-- ```
-- 42501  "hint": "Grant the required privileges to the current role with: GRANT INSERT ON public.trips TO service_role;"
-- ```
-- 🎯 ***มันเสนอ `INSERT` ทั้งตาราง — ซึ่งใบนี้ไม่ให้ และไม่ควรให้*** · `§3.5` เตือนรูปนี้ไว้แล้ว:
--    *อ่าน `hint` เป็นข้อมูลว่าทำไมถึงล้ม ไม่ใช่ขั้นตอนถัดไป*
-- · **ทางที่ไม่ต้องขอ `insert` มีอยู่จริงและเราจะใช้มัน**: สร้างทริป template ผ่าน **หน้าเว็บในฐานะผู้ใช้**
--   (เส้นทางเดียวกับผู้ใช้จริงทุกคน) ⇒ เหลือแค่ *ติดธง* ที่ต้องมาทางนี้
-- · ⇒ ใบนี้ให้ **คอลัมน์เดียว เมธอดเดียว** ไม่ใช่สิ่งที่ `hint` เสนอ
--
-- ## ⚠️ ราคาที่จ่ายและต้องรู้ว่าจ่าย
-- `service_role` มี **BYPASSRLS** ⇒ `grant` คือด่านสุดท้าย ไม่มี policy มาช่วยอีกชั้น
-- ⇒ ใครก็ตามที่ถือ service key **ติดธงให้ทริปของใครก็ได้** · ราคาของ "ติดธงผิดใบ" ถูกจำกัดไว้แล้ว
--    โดยการออกแบบของ `…180000`: **ไม่มี policy ให้อ่าน `trips` ของคนอื่น** ⇒ เนื้อออกได้ทางเดียวคือ
--    `copy_trip_template()` ซึ่ง *เขียนลงทริปของผู้เรียกเอง* ⇒ **ก๊อปได้ ≠ อ่านได้**
--    🎯 ***นี่คือเหตุผลที่ใบ …180000 ปฏิเสธ policy อ่าน — มันกำลังจ่ายคืนตรงนี้***

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

-- 🔴 **คอลัมน์เดียว เมธอดเดียว** — ไม่ใช่ `update on public.trips`
--    ทะเบียน `§3.5` ห้าม `grant all` และสั่งให้ระบุสิทธิ์ทีละตัว · นี่คือรูปที่แคบที่สุดที่ทำงานได้
grant update (published_template_at) on public.trips to service_role;

-- 🔴 `service_role` ต้อง `select` ได้ด้วยเพื่อ **ยืนยันว่าติดธงถูกใบ** — ข้อยกเว้นที่ 2 ให้ไว้แล้ว
--    ไม่ต้องขอเพิ่ม · จดไว้เพื่อให้คนอ่านรู้ว่าตรวจแล้วไม่ใช่ลืม

do $assert$
begin
  -- ✅ ฝั่งบวก — ใบนี้ต้องได้ผลจริง
  if not has_column_privilege('service_role', 'public.trips', 'published_template_at', 'UPDATE') then
    raise exception 'assert ล้ม: service_role ยังติดธง published_template_at ไม่ได้';
  end if;

  -- 🔴 เคสควบคุม ① — **ไคลเอนต์ต้องยังติดธงเองไม่ได้** (ข้อนี้คือทั้งหมดของ …180000)
  if has_column_privilege('authenticated', 'public.trips', 'published_template_at', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated ติดธงทริปแนะนำเองได้ — ใบนี้ไปเปิดของที่ …180000 ปิดไว้';
  end if;

  -- 🔴 เคสควบคุม ② — **ใบนี้ต้องไม่แอบให้ service_role มากกว่าคอลัมน์เดียว**
  --    ไม่มีข้อนี้ `grant update on public.trips to service_role` ก็ผ่าน assert ข้างบนเหมือนกันเป๊ะ
  if has_column_privilege('service_role', 'public.trips', 'title', 'UPDATE') then
    raise exception 'assert ล้ม: กว้างเกิน — service_role แก้ trips.title ได้';
  end if;
  if has_column_privilege('service_role', 'public.trips', 'created_by', 'UPDATE') then
    raise exception 'assert ล้ม: กว้างเกิน — service_role แก้ trips.created_by ได้';
  end if;
  if has_table_privilege('service_role', 'public.trips', 'INSERT') then
    raise exception 'assert ล้ม: service_role insert trips ได้ — ใบนี้ไม่ได้ขอ และ hint ของ PostgREST ไม่ใช่คำขออนุมัติ';
  end if;
end $assert$;

commit;
