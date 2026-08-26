-- ═══════════════════════════════════════════════════════════════════════════
-- `E3-AC7` — **กลับขั้วเงื่อนไข: ปฏิเสธเมื่อมีบริบทผู้ใช้ แทนที่จะอนุญาตเมื่อมีธง**
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · ข้อเสนอของ P7 · ผมรับแต่ไม่ทั้งดุ้น (ดูข้อ ③)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ข้อโต้แย้งของ P7 และเหตุผลที่มันชนะ ────────────────────────────────────
-- ฉบับก่อน (`20260826194500`) ยกเว้นด้วย `app.maintenance_write` — **GUC ตัวใหม่**
-- → ต้องพิสูจน์ว่าไคลเอนต์ตั้งมันไม่ได้ (P4 กำลังทำ · 5 เส้นทางแล้วยังตั้งไม่ได้)
--
-- 🎯 **P7 ชี้ว่ามี GUC ตัวหนึ่งที่เราเดิมพันไปแล้วทั้งสคีมา: `request.jwt.claims`**
--    ทุก policy ในฐานนี้อ่าน `auth.uid()` ซึ่งอ่าน GUC ตัวนั้น
--    > **ถ้าไคลเอนต์ปลอมมันได้ RLS ทั้งฐานพังไปแล้วตั้งแต่ `E1` ไม่ใช่แค่ด่านนี้**
--    → **ผูกด่านกับ `auth.uid()` = ไม่เพิ่มข้อสมมติใหม่สักข้อ**
--
-- 🔴 **และทิศของความผิดพลาดกลับด้าน ซึ่งสำคัญกว่าเรื่องข้อสมมติ:**
-- ```
-- เดิม  : อนุญาตถ้าธงถูกตั้ง      → บั๊ก/ธงรั่ว = **ด่านเปิด**
-- ใหม่  : ปฏิเสธถ้ามีบริบทผู้ใช้   → บั๊ก      = **เขียนไม่ได้** (ปลอดภัย)
-- ```
--
-- ── หลักฐานว่า `auth.uid()` มองเห็นตัวจริงจากในtrigger **ที่ยิงจากข้างใน definer** ──
-- 🔴 **ไม่ต้องวัดใหม่ — มันรันเขียวอยู่ในชุดเทสต์ทุกวันและเป็นของ P4 ไม่ใช่ของผม:**
-- `rlsMatrix.test.ts:2789-2797` — A เรียก `soft_delete_trip_stop` (**`security definer`**)
-- → trigger `touch_updated_at` เขียน `updated_by_user = ids.a` **ถูกคน**
-- **นั่นคือ `auth.uid()` ข้ามชั้น definer ไปถึง trigger ได้ ยืนยันด้วยเคสที่มีอยู่แล้ว**
-- · เข้ากับที่ผมวัดไว้ (`20260826182000`): **GUC เดินทางไปกับ *คำขอ* ไม่ได้เดินทางไปกับ *สิทธิ์***
--   `current_user` กลายเป็นเจ้าของฟังก์ชัน · `auth.uid()` ไม่กลาย — คนละชนิดของสถานะ
--
-- ── ③ 🔴 ที่ผมไม่รับทั้งดุ้น: **ไม่ทิ้งเงื่อนไขประกาศเจตนาสำหรับฝั่ง service_role** ──
-- ข้อเสนอของ P7 ล้วน ๆ แปลว่า **อะไรก็ตามที่รันเป็น `service_role` เขียนได้ตลอดโหมดนี้
-- โดยไม่ต้องประกาศอะไรเลย** — รวม cron อุ่นแคชที่ไม่มีใครนึกถึงตอนกดสวิตช์
-- 🎯 **นั่นคือการยกเว้นด้วย *ตัวตน* อีกรูปหนึ่ง ซึ่งเป็นสิ่งที่ P6 เตือนไว้ตั้งแต่ต้น**
--
-- **ท่าที่ใช้: สองสาขา คนละหน้าที่ คนละชนิดของด่าน**
-- ```
-- auth.uid() is not null  → ปฏิเสธเสมอ ไม่มีทางยกเว้น     ← **ด่านความปลอดภัย**
-- auth.uid() is null      → ต้อง allow_maintenance_write ∧ GUC  ← **ด่านปฏิบัติการ**
-- ```
-- · 🔴 **และนี่คือเหตุผลที่ข้อกังวลเรื่อง GUC ปลอมได้ หมดความสำคัญ:**
--   GUC ถูกตรวจ**เฉพาะสาขาที่ไคลเอนต์ไปไม่ถึงอยู่แล้ว** — ต่อให้ปลอมได้ ก็ยังติดสาขาแรก
--   **มันจึงเป็นด่าน "คุณตั้งใจหรือเปล่า" ไม่ใช่ด่าน "คุณเป็นใคร"** และความปลอดภัยไม่ได้พึ่งมัน
-- · งานพิสูจน์ของ P4 **ยังจำเป็น** (P7 เขียนข้อนี้เอง) — แค่ไม่ใช่สิ่งที่ความปลอดภัยแขวนอยู่อีกต่อไป
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

create or replace function app.write_is_blocked()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  m   record;
  uid uuid;
begin
  select read_only, allow_maintenance_write into m from app.system_mode;
  if m is null or not m.read_only then
    return false;
  end if;

  -- ① 🔴 **ด่านความปลอดภัย** — คำขอที่มีตัวตนของผู้ใช้ติดมา ถูกปฏิเสธเสมอ
  --    ครอบทั้ง 7 RPC ที่เป็น `security definer` เพราะ `auth.uid()` เดินทางไปกับ*คำขอ*
  --    ไม่ใช่ไปกับ*สิทธิ์* (ต่างจาก `current_user` ที่กลายเป็นเจ้าของฟังก์ชัน)
  --    **ไม่มีทางยกเว้นสาขานี้ และตั้งใจให้ไม่มี**
  uid := auth.uid();
  if uid is not null then
    return true;
  end if;

  -- ② **ด่านปฏิบัติการ** — ไม่มีบริบทผู้ใช้ (service_role · migration · psql)
  --    ต้องประกาศเจตนา *และ* ผู้ดูแลต้องเปิดหน้าต่างให้ก่อน
  --    ⚠️ ไคลเอนต์ไปไม่ถึงสาขานี้ → ความปลอดภัยไม่ได้แขวนอยู่กับ GUC ตัวนี้
  if m.allow_maintenance_write
     and coalesce(current_setting('app.maintenance_write', true), '') = 'on' then
    return false;
  end if;

  return true;
end $$;

revoke all on function app.write_is_blocked() from public, anon, authenticated;

comment on function app.write_is_blocked() is
  'E3-AC7 — สองสาขาคนละหน้าที่: auth.uid() ไม่ null = ด่านความปลอดภัย (ปฏิเสธเสมอ) '
  '· null = ด่านปฏิบัติการ (ต้อง allow_maintenance_write ∧ GUC) '
  'ไคลเอนต์ไปไม่ถึงสาขาที่สอง จึงไม่ต้องเดิมพันความปลอดภัยกับ GUC ตัวใหม่ (P7 · 26 ส.ค. 2026)';

-- ── พิสูจน์สาขาใหม่ · ทิศที่ฉบับก่อนพิสูจน์ไม่ได้เลย ────────────────────────
create or replace function app.probe_definer_write(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.trip_stops set note = note where id = p_id;
end $$;

do $proof$
declare
  v_id uuid;
  hit  boolean;
  FAKE constant text := '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
begin
  select id into v_id from public.trip_stops limit 1;
  if v_id is null then raise exception 'trip_stops ว่าง — พิสูจน์ไม่ได้'; end if;

  -- ทิศบวก ① โหมดปิด + มีบริบทผู้ใช้ → เขียนได้ (ไม่งั้นด่านนี้จะบล็อกทุกคนตลอดเวลา)
  perform set_config('request.jwt.claims', FAKE, true);
  update public.trip_stops set note = note where id = v_id;
  perform set_config('request.jwt.claims', '', true);

  update app.system_mode
     set read_only = true, allow_maintenance_write = true, reason = 'พิสูจน์ E3-AC7 สาขาผู้ใช้';
  perform set_config('app.maintenance_write', 'on', true);

  -- 🔴 ทิศลบ ② **ครบทุกเงื่อนไขยกเว้นที่มีอยู่ แต่มีบริบทผู้ใช้ → ต้องยังบล็อก**
  --    นี่คือข้อที่ฉบับก่อนจะปล่อยผ่าน ถ้าไคลเอนต์ตั้ง GUC ได้
  perform set_config('request.jwt.claims', FAKE, true);
  hit := false;
  begin
    update public.trip_stops set note = note where id = v_id;
  exception when sqlstate 'PT503' then hit := true;
  end;
  if not hit then
    raise exception 'สาขาความปลอดภัยไม่ทำงาน: มี auth.uid() แต่ยังเขียนได้ตอนโหมดเปิด';
  end if;

  -- 🔴 ทิศลบ ③ **เดียวกัน แต่ผ่าน `security definer`** — ทางที่ผู้ใช้ลบของจริง
  hit := false;
  begin
    perform app.probe_definer_write(v_id);
  exception when sqlstate 'PT503' then hit := true;
  end;
  if not hit then
    raise exception 'สาขาความปลอดภัยไม่ทำงานบนทาง definer — auth.uid() ไม่ข้ามชั้นมาหรือเปล่า';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ทิศบวก ④ ไม่มีบริบทผู้ใช้ + ครบสองเงื่อนไข → ผ่าน (ทางที่ `E7` เดิน)
  update public.trip_stops set note = note where id = v_id;
  perform app.probe_definer_write(v_id);

  perform set_config('app.maintenance_write', 'off', true);
  update app.system_mode
     set read_only = false, allow_maintenance_write = false, reason = null;
end $proof$;

drop function app.probe_definer_write(uuid);

do $final$
begin
  if exists (select 1 from app.system_mode where read_only) then
    raise exception 'โหมด read-only ยังเปิดค้างอยู่ตอนจบไฟล์';
  end if;
end $final$;

commit;
