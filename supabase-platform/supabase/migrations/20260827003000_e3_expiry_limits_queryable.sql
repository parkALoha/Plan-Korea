-- ═══════════════════════════════════════════════════════════════════════════
-- `E3-AC7` — ① ปฏิเสธ expiry ที่ไม่มีเคสถูก · ② ทำตัวเลขให้ *อ่านจากฐานได้*
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · P4 เสนอทั้งสองข้อ (P6 ชี้ข้อ ②)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ① `p_expires_in_minutes < 1` = **"ขอล็อก" กลายเป็น "ไม่ล็อก" เงียบ ๆ** ───
-- `now() + make_interval(mins => -1)` = อดีต → `mode_is_active()` คืน `false` ทันที
-- → **โหมด "เปิด" ที่ปิดตั้งแต่วินาทีแรก โดยไม่มี error**
-- · ไม่ใช่รูความปลอดภัย (`system_mode()` คืน `false` ตรงกับพฤติกรรม — banner ไม่โกหก)
-- · 🔴 **แต่เป็นทิศอันตรายที่เราไล่ปิดกันทั้งวัน ในรูปเล็ก:** ops คำนวณ `deadline - now()`
--   ที่ deadline ผ่านไปแล้ว → กด *"ล็อกระบบ"* แล้ว**ระบบไม่ได้ล็อก**
-- 🎯 **ไม่มีเคสไหนที่ค่าติดลบถูก** — ถ้าจะปิดทันทีมี `p_read_only => false` อยู่แล้ว
--   (รูปเดียวกับ `*_by_user` ที่ไคลเอนต์ตั้งเองไม่มีเคสถูก · คำของ P4)
--
-- ── ② 🔴 ผมต้องแก้ข้อสมมติในคำขอของ P4 ก่อน ไม่งั้นจะได้ด่านที่วัดของที่ไม่มี ──
-- P4 ขอให้ *"maintenance expiry"* query ได้ เพื่อ assert `expiry >= E7_pin × safety`
-- **แต่วันนี้ maintenance hold ใช้ `p_expires_in_minutes => null` = ไม่หมดอายุเลย**
-- → **ไม่มีตัวเลข maintenance expiry อยู่จริง · ความสัมพันธ์ที่เขาอยากผูกยังไม่มีอยู่**
-- ⚠️ **ถ้าผมสร้างตัวเลขขึ้นมาให้เขาผูก ผมจะสร้างสิ่งที่เรากลัวขึ้นมาเอง** (maintenance ที่หมดอายุได้)
--
-- 🎯 **แต่ข้อกังวลที่อยู่ใต้คำขอนั้นถูก และผมทำให้ตรวจได้:**
-- คืนทั้งสองค่าให้ query ได้ · `maintenance_expiry_minutes` เป็น **`null` วันนี้**
-- → เทสต์ของ P4 **pin ว่ามันต้องเป็น `null`** · วันที่มีคนเปลี่ยนให้ maintenance หมดอายุได้
--   **เทสต์แดงทันที และคนนั้นต้องเขียนความสัมพันธ์กับ `E7`-pin ก่อน merge**
-- · 🔴 **ตรงกับด่าน publication ของ P4 เป๊ะ: pin สภาพที่คำถามยัง *ไม่* เปิด
--   เพื่อบังคับให้มีคนตอบตอนมันเปิด** — ไม่ใช่เดาคำตอบไว้ล่วงหน้า
--
-- ── แหล่งความจริงเดียวของเลข 15 ─────────────────────────────────────────────
-- เดิมอยู่ใน `default 15` ของลายเซ็น · ถ้าประกาศซ้ำใน `mode_limits()` จะมีสองที่ให้ต่างกัน
-- → ลายเซ็นเรียก `app.default_expiry_minutes()` **ตัวเดียวกับที่ `mode_limits()` คืน**
--   Postgres ประเมิน default ตอนเรียก จึงใช้ฟังก์ชันเป็น default ได้
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

create or replace function app.default_expiry_minutes()
returns int language sql immutable set search_path = '' as $$ select 15 $$;
revoke all on function app.default_expiry_minutes() from public, anon, authenticated;

comment on function app.default_expiry_minutes() is
  'E3-AC7 — หน้าต่างเริ่มต้นของ hold ที่ไม่ระบุเวลา · 15 นาทีเข้าคู่ timeout-minutes ของ CI (P6) '
  'เป็นแหล่งความจริงเดียว: ลายเซ็นของ set_system_mode เรียกตัวนี้เป็น default';

/**
 * ตัวเลขที่ด่านฝั่งเทสต์ต้องอ่านได้ — `service_role` เท่านั้น
 * 🔴 `maintenance_expiry_minutes` เป็น `null` **โดยการออกแบบ** — maintenance hold ไม่หมดอายุ
 *    เทสต์ควร pin ว่ามันเป็น `null` เพื่อให้วันที่มีคนเปลี่ยน มีคนต้องตอบว่าสัมพันธ์กับ `E7`-pin ยังไง
 */
create or replace function public.mode_limits()
returns table (default_expiry_minutes int, maintenance_expiry_minutes int)
language sql stable security definer set search_path = '' as $$
  select app.default_expiry_minutes(), null::int
$$;
revoke all on function public.mode_limits() from public, anon, authenticated;
grant execute on function public.mode_limits() to service_role;

create or replace function public.set_system_mode(
  p_read_only               boolean,
  p_allow_maintenance_write boolean default false,
  p_reason                  text    default null,
  p_expires_in_minutes      int     default app.default_expiry_minutes()
)
returns table (read_only boolean, allow_maintenance_write boolean, reason text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    raise exception using errcode = 'PT403',
      message = 'สลับโหมดของระบบจากคำขอของผู้ใช้ไม่ได้', hint = 'system_mode_user_context';
  end if;

  -- 🔴 ไม่มีเคสไหนที่ค่า < 1 ถูก · "ขอล็อก" ต้องไม่แปลว่า "ไม่ล็อก"
  if p_expires_in_minutes is not null and p_expires_in_minutes < 1 then
    raise exception using errcode = 'PT400',
      message = format('p_expires_in_minutes ต้อง >= 1 หรือ null (ได้ %s)', p_expires_in_minutes),
      hint    = 'ถ้าต้องการปิดโหมดทันที ใช้ p_read_only => false · ถ้าต้องการไม่หมดอายุ ใช้ null';
  end if;

  update app.system_mode
     set read_only               = p_read_only,
         allow_maintenance_write = p_read_only and p_allow_maintenance_write,
         reason                  = case when p_read_only then p_reason end,
         expires_at              = case
                                     when not p_read_only then null
                                     when p_expires_in_minutes is null then null
                                     else now() + make_interval(mins => p_expires_in_minutes)
                                   end,
         changed_at              = now(),
         changed_by              = current_user
   where only_row;

  return query select m.read_only, m.allow_maintenance_write, m.reason, m.expires_at
                 from app.system_mode m;
end $$;
revoke all on function public.set_system_mode(boolean, boolean, text, int)
  from public, anon, authenticated;
grant execute on function public.set_system_mode(boolean, boolean, text, int) to service_role;

do $verify$
declare hit boolean; lim record;
begin
  -- ① ค่าติดลบและศูนย์ต้องถูกปฏิเสธ · ต้องไม่แตะสถานะเลย
  for hit in select unnest(array[false]) loop null; end loop;
  begin
    hit := false;
    begin perform public.set_system_mode(true, false, 'x', -1);
    exception when sqlstate 'PT400' then hit := true; end;
    if not hit then raise exception 'ค่า -1 ผ่านเข้าไปได้'; end if;

    hit := false;
    begin perform public.set_system_mode(true, false, 'x', 0);
    exception when sqlstate 'PT400' then hit := true; end;
    if not hit then raise exception 'ค่า 0 ผ่านเข้าไปได้'; end if;
  end;
  if exists (select 1 from app.system_mode where read_only) then
    raise exception 'คำขอที่ถูกปฏิเสธกลับเปลี่ยนสถานะ';
  end if;

  -- 🔴 ทิศบวก — ด่านที่ปฏิเสธทุกค่าจะดูเหมือนทำงานถูก
  perform public.set_system_mode(true, false, 'ยืนยัน', 1);
  if not exists (select 1 from app.system_mode where read_only) then
    raise exception 'ค่า 1 ที่ถูกต้องกลับถูกปฏิเสธ';
  end if;
  perform public.set_system_mode(false);

  -- ② ตัวเลขต้องอ่านได้ และ default ต้องมาจากแหล่งเดียว
  select * into lim from public.mode_limits();
  if lim.default_expiry_minutes is distinct from app.default_expiry_minutes() then
    raise exception 'mode_limits() ไม่ตรงกับแหล่งความจริง';
  end if;
  if lim.maintenance_expiry_minutes is not null then
    raise exception 'maintenance_expiry_minutes ไม่เป็น null — ความสัมพันธ์กับ E7-pin ต้องถูกเขียนก่อน';
  end if;
end $verify$;

commit;
