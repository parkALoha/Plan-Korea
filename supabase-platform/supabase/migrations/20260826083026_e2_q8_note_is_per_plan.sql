-- ═══════════════════════════════════════════════════════════════════════════
-- `Q8` ปิด — โน้ตรายวันเป็นของ **แผน** ไม่ใช่ของ **วัน** · ผู้ใช้ตัดสิน (26 ส.ค. 2026)
-- เจ้าของ: P1-Lead · **P7 เป็นคนเปิดคำถามนี้ และเปิดถูก**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ที่มา: ผมลงคอลัมน์ไปโดยยังไม่ได้ถาม ────────────────────────────────────
-- `20260825232458` เพิ่ม `trip_days.note` พร้อมคอมเมนต์ว่า *"`day.note` เดิม — ข้อความของผู้ใช้ต่อวัน"*
-- 🔴 **P7 ทัก: ผมตัดสินว่ามันเป็น "ต่อวัน" โดยไม่มีใครถามผู้ใช้เลย** (`Q8`)
-- · ในเว็บทริปเดิมมีแผนเดียว **"ต่อวัน" กับ "ต่อแผน" จึงเป็นสิ่งเดียวกันเสมอ**
-- · **แพลตฟอร์มมีหลายแผนต่อทริป** → มันแยกออกจากกัน และต้องเลือก
-- 🎯 **ประเภทของความพลาด: ค่าที่ถูกในโลกที่มีตัวแปรเดียว ถูกยกมาใช้ในโลกที่มีสองตัวแปร**
--    ญาติของ `D69` (`trip_day_settings` → `trip_day_plan_settings`) ซึ่งเป็นการย้ายด้วยเหตุผลเดียวกันเป๊ะ
--
-- ── ผู้ใช้ตอบ: **ของแผน — แต่ละแผนมีโน้ตของตัวเอง** ────────────────────────
-- เหตุผลที่สอดคล้อง: โน้ตแบบ *"แผนนี้ต้องรีบออก 7 โมง"* ผูกกับ**การตัดสินใจของแผนนั้น**
-- ไม่ใช่กับตัววันที่ · **เปรียบเทียบสองแผนแล้วเห็นโน้ตเดียวกัน = โน้ตนั้นอธิบายอะไรไม่ได้เลย**
--
-- ── 🔴 ไม่มีข้อมูลต้องย้าย และผมตรวจก่อน ไม่ใช่เดา ─────────────────────────
-- `trip_days.note` ลงไปเมื่อวาน · โค้ดที่เสิร์ฟผู้ใช้แตะ `trip_days` **0 จุด**
-- (`Day.note` ของเว็บเดิมมาจากไฟล์ TS ไม่ได้มาจากฐาน) → **ย้ายค่าแล้ว drop ได้ทันที ไม่มีใครเห็น**
-- · `insert … select` ข้างล่างจึงคาดว่าได้ 0 แถว **แต่ยังเขียนไว้** เพราะ *"คาดว่าว่าง"* กับ *"ว่างจริง"*
--   เป็นคนละอย่าง และถ้ามีแถวโผล่มา ผมอยากให้มันถูกย้าย ไม่ใช่ถูกทิ้ง
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

alter table public.trip_day_plan_settings
  add column note text check (note is null or length(note) <= 2000);

comment on column public.trip_day_plan_settings.note is
  'day.note เดิม — ข้อความของผู้ใช้ต่อ (วัน × แผน) · Q8 ตัดสิน 26 ส.ค. 2026';

-- ── ย้ายค่าเดิมเข้าทุกแผนของวันนั้น ก่อน drop ───────────────────────────────
-- 🔴 วันหนึ่งมีได้หลายแผน → โน้ตเดิมอันเดียวต้องกระจายไปทุกแผน **ไม่ใช่แผนแรก**
--    เลือกแผนเดียวคือการตัดสินใจแทนผู้ใช้ว่าโน้ตนั้นเป็นของแผนไหน ซึ่งเราไม่รู้
update public.trip_day_plan_settings s
   set note = d.note
  from public.trip_days d
 where d.id = s.trip_day_id
   and d.note is not null
   and length(trim(d.note)) > 0;

alter table public.trip_days drop column note;

-- ── grant — ถอด `note` ออกจาก `trip_days` · เพิ่มเข้า `trip_day_plan_settings` ──
-- 🔴 `grant … (คอลัมน์)` เป็น **ลิสต์ทั้งอัน** (`P-63`) → ต้องพิมพ์ที่เหลือซ้ำให้ครบ
--    ลิสต์เดิมของ `trip_days` คือ `overnight_kind` · `overnight_city_id` · `note` → เหลือสองตัว
revoke insert, update on public.trip_days from authenticated;
grant insert (overnight_kind, overnight_city_id) on public.trip_days to authenticated;
grant update (overnight_kind, overnight_city_id) on public.trip_days to authenticated;

-- `trip_day_plan_settings` ให้สิทธิ์ระดับ *ตาราง* อยู่แล้ว → คอลัมน์ใหม่ได้ตามไปเอง
-- ระบุซ้ำระดับคอลัมน์ไว้ด้วย เผื่อวันหนึ่งมีคนเปลี่ยนเป็นระดับคอลัมน์แล้วลืมตัวนี้
grant insert (note), update (note) on public.trip_day_plan_settings to authenticated;

do $verify$
declare
  n int;
begin
  -- ① คอลัมน์เดิมต้องหายจริง — สองที่ตอบคำถามเดียวกันคือสิ่งที่ `Q8` มีไว้ปิด
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trip_days' and column_name = 'note'
  ) then
    raise exception 'Q8: trip_days.note ยังอยู่';
  end if;

  -- ② ไคลเอนต์ต้องเขียน `note` ที่ปลายทางได้จริง — ไม่งั้นเราแค่ย้ายมันไปที่ที่แตะไม่ได้
  select count(*) into n
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'trip_day_plan_settings'
     and grantee = 'authenticated' and column_name = 'note'
     and privilege_type in ('INSERT', 'UPDATE');
  if n < 2 then
    raise exception 'Q8: authenticated เขียน trip_day_plan_settings.note ไม่ได้ (สิทธิ์ %)', n;
  end if;

  -- ③ 🔴 `trip_days` ต้องไม่เผลอได้สิทธิ์เกินลิสต์ตอน re-grant
  select count(*) into n
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'trip_days'
     and grantee = 'authenticated' and privilege_type = 'UPDATE';
  if n <> 2 then
    raise exception 'Q8: grant update ของ trip_days ควรเหลือ 2 คอลัมน์ (ได้ %)', n;
  end if;
end $verify$;

commit;
