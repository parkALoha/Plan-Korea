-- ═══════════════════════════════════════════════════════════════════════════
-- `E3-AC7` — ② หน้าต่างหมดอายุแบบ *ไม่* แลกทิศอันตราย · ③ เคสถาวรที่ไม่ commit อะไร
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · P4 เสนอทั้งสองข้อ · P6 ยืนยันฝั่ง ops
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ② ปัญหาที่ P4 ตั้ง และเหตุผลที่ *fixed expiry เฉย ๆ* ผิด ────────────────
-- `write_is_blocked()` อ่านแค่ `read_only` · `changed_at` มีแต่ไม่มีใครอ่าน
-- → **โหมดค้างเปิด = ค้างตลอดกาล** (คนลืมปิด · process ถูก kill กลางหน้าต่าง)
--
-- 🔴 **แต่สองสถานะผิดมีทิศปลอดภัยตรงกันข้าม:**
-- ```
-- ค้างเปิดตอนควรปิด   → เขียนไม่ได้ = outage        🟡 ไม่มีข้อมูลเสีย
-- ปิดเองตอนควรเปิด    → เขียนระหว่างข้อมูลกำลังย้าย  🔴 ข้อมูลพัง
-- ```
-- 🎯 **auto-expiry ที่แก้เคส "ลืมปิด" จะ *สร้าง* เคสที่แย่กว่าให้ migration** — คำของ P4 และเขาถูก
--
-- ── 🔴 ทางที่ผมไม่เลือก และเหตุผล (เผื่อมีคนคิดท่านี้อีก) ─────────────────────
-- ท่าที่ดูฉลาดคือ **อนุมานจาก `allow_maintenance_write`**: ถ้าเปิดให้เขียน = งาน
-- maintenance = ไม่หมดอายุ · **ไม่ต้องมีพารามิเตอร์ใหม่ให้ใครลืม**
-- ⚠️ **มันพังกับเคส incident:** ล็อกระบบตอนมีเหตุ (`allow_maintenance_write = false`)
--    **ก็เป็นเคสที่ห้ามปลดล็อกตัวเองเหมือนกัน** → การอนุมานจะทำให้ล็อกตอนมีเหตุหลุดใน 15 นาที
-- → **จึงต้องเป็นพารามิเตอร์ตรง ๆ** · `p_expires_in_minutes` · `null` = ไม่หมดอายุ
--    **ค่าเริ่มต้น 15 นาที** เพราะคนที่ *ลืมระบุ* มักเป็นคนที่กำลังทดสอบ ไม่ใช่คนที่กำลังรัน `E7`
--    (คนรัน `E7` ทำตามลิสต์ · คนทดสอบกดเล่น) → **ค่าเริ่มต้นควรปลอดภัยสำหรับคนที่ประมาทกว่า**
--
-- ⚠️ **สิ่งที่ยังไม่มีและต้องพูด:** ถ้าคนรัน `E7` ลืมใส่ `null` **โหมดจะหลุดกลางการย้ายข้อมูล**
--    ด่านของข้อนี้คือ **สคริปต์ `E7` ต้องระบุเอง และ P4 จะ pin เวลาของ `E7` เป็นเทสต์**
--    → *"เชื่อว่า `E7` สั้น"* กลายเป็น *"วัดแล้วสั้น · ถ้าวันหนึ่งไม่สั้น เทสต์แดงก่อน"*
--
-- ── ③ เคสถาวรที่ไม่ commit อะไรเลย ─────────────────────────────────────────
-- เคสสดที่เปิดโหมดจริงบนฐานที่ใช้ร่วม 8 เซสชันลงถาวรไม่ได้ (`R11` · P4+P6 ไล่จนสุดทั้งสองฝั่ง)
-- **แต่ *ตรรกะของด่าน* พิสูจน์ได้โดยไม่แตะ state ที่ commit:**
-- ตั้ง flag → ลองเขียน → เก็บผลไว้ใน**ตัวแปร** → `raise` เพื่อ unwind → จับไว้เอง
-- · ข้อมูลที่เปลี่ยนถูก rollback หมด · **ตัวแปรไม่ใช่ข้อมูล จึงรอด**
-- · uncommitted ใน `READ COMMITTED` = **เซสชันอื่นมองไม่เห็นเลยแม้แต่วินาทีเดียว**
-- ⚠️ **มันพิสูจน์ตรรกะ ไม่ได้พิสูจน์ทางจริง** — ทาง PostgREST ยังเป็น one-shot ที่ยิงไปแล้ววันนี้
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

alter table app.system_mode add column if not exists expires_at timestamptz;

comment on column app.system_mode.expires_at is
  'null = ไม่หมดอายุ (E7 · incident) · มีค่า = หน้าต่างชั่วคราวที่ปลดล็อกตัวเองเมื่อถึงเวลา '
  'แยกเป็นคอลัมน์ตรง ๆ ไม่อนุมานจาก allow_maintenance_write เพราะ incident lock ก็ห้ามหลุดเอง';

-- ── แหล่งความจริงเดียวว่า "ตอนนี้โหมดมีผลอยู่ไหม" ──────────────────────────
-- 🔴 ทั้งตัวบังคับและตัวที่ผู้ใช้อ่าน **ต้องใช้ตัวนี้ตัวเดียว**
--    ไม่งั้นจะมีวินาทีที่ banner บอกว่าปิดรับ แต่เขียนได้จริง — สองแหล่งความจริงที่ต้องคอยให้ตรงกัน
create or replace function app.mode_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
           (select m.read_only and (m.expires_at is null or now() < m.expires_at)
              from app.system_mode m),
           false)
$$;
revoke all on function app.mode_is_active() from public, anon, authenticated;

create or replace function app.write_is_blocked()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare m record;
begin
  if not app.mode_is_active() then
    return false;
  end if;

  -- ① ด่านความปลอดภัย — คำขอที่มีตัวตนของผู้ใช้ ถูกปฏิเสธเสมอ ไม่มีทางยกเว้น
  if auth.uid() is not null then
    return true;
  end if;

  -- ② ด่านปฏิบัติการ — ไม่มีบริบทผู้ใช้ ต้องประกาศเจตนา *และ* ผู้ดูแลเปิดหน้าต่างให้
  select allow_maintenance_write into m from app.system_mode;
  if m.allow_maintenance_write
     and coalesce(current_setting('app.maintenance_write', true), '') = 'on' then
    return false;
  end if;

  return true;
end $$;
revoke all on function app.write_is_blocked() from public, anon, authenticated;

-- ── ผู้ใช้ต้องเห็นสถานะ *ที่มีผลจริง* ไม่ใช่ค่าดิบในคอลัมน์ ────────────────
create or replace function public.system_mode()
returns table (read_only boolean, reason text)
language sql stable security definer set search_path = '' as $$
  select app.mode_is_active(),
         case when app.mode_is_active() then (select m.reason from app.system_mode m) end
$$;
revoke all on function public.system_mode() from public;
grant execute on function public.system_mode() to anon, authenticated, service_role;

create or replace function public.set_system_mode(
  p_read_only               boolean,
  p_allow_maintenance_write boolean default false,
  p_reason                  text    default null,
  p_expires_in_minutes      int     default 15
)
returns table (read_only boolean, allow_maintenance_write boolean, reason text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    raise exception using errcode = 'PT403',
      message = 'สลับโหมดของระบบจากคำขอของผู้ใช้ไม่ได้', hint = 'system_mode_user_context';
  end if;

  update app.system_mode
     set read_only               = p_read_only,
         allow_maintenance_write = p_read_only and p_allow_maintenance_write,
         reason                  = case when p_read_only then p_reason end,
         -- 🔴 `null` = ไม่หมดอายุ · ต้องระบุเอง ไม่มีการอนุมาน (ดูหัวไฟล์)
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
-- ลายเซ็นเดิม 3 อาร์กิวเมนต์ไม่มีใครควรใช้ต่อ — ถอนทิ้งเพื่อไม่ให้มีสองทางที่ต่างกันเงียบ ๆ
drop function if exists public.set_system_mode(boolean, boolean, text);

-- ── ③ เคสถาวรที่ไม่ commit อะไร ────────────────────────────────────────────
create or replace function public.read_only_selftest()
returns table (scenario text, blocked boolean)
language plpgsql security definer set search_path = '' as $$
declare
  saw_user   boolean;
  saw_ops    boolean;
  saw_expired boolean;
  saw_off    boolean;
begin
  if auth.uid() is not null then
    raise exception using errcode = 'PT403', message = 'เรียกจากคำขอของผู้ใช้ไม่ได้';
  end if;

  begin
    -- โหมดปิด (ฐาน) — ถ้าข้อนี้บล็อก แปลว่าด่านบล็อกทุกอย่าง ไม่ใช่ทำงานถูก
    perform set_config('request.jwt.claims', '', true);
    saw_off := app.write_is_blocked();

    update app.system_mode
       set read_only = true, allow_maintenance_write = true, expires_at = null where only_row;

    -- มีบริบทผู้ใช้ → ต้องบล็อก **แม้เงื่อนไขยกเว้นครบ**
    perform set_config('request.jwt.claims',
      '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    perform set_config('app.maintenance_write', 'on', true);
    saw_user := app.write_is_blocked();

    -- ไม่มีบริบทผู้ใช้ + ครบสองเงื่อนไข → ต้องไม่บล็อก (ทางที่ E7 เดิน)
    perform set_config('request.jwt.claims', '', true);
    saw_ops := app.write_is_blocked();

    -- หมดอายุแล้ว → ต้องไม่บล็อก แม้ `read_only` ยังเป็น true ในคอลัมน์
    update app.system_mode set expires_at = now() - interval '1 second' where only_row;
    perform set_config('app.maintenance_write', 'off', true);
    saw_expired := app.write_is_blocked();

    -- 🔴 `raise` เพื่อ unwind — ข้อมูลทั้งหมดข้างบนถูก rollback · **ตัวแปรไม่ใช่ข้อมูล จึงรอด**
    raise exception using errcode = 'P0001', message = '__selftest_rollback__';
  exception when sqlstate 'P0001' then
    null;
  end;
  perform set_config('app.maintenance_write', 'off', true);

  return query
    select 'โหมดปิด — ต้องเขียนได้'::text,                         saw_off
    union all select 'มีผู้ใช้ + ยกเว้นครบ — ต้องบล็อก'::text,      saw_user
    union all select 'ไม่มีผู้ใช้ + ยกเว้นครบ — ต้องเขียนได้'::text, saw_ops
    union all select 'หมดอายุแล้ว — ต้องเขียนได้'::text,            saw_expired;
end $$;
revoke all on function public.read_only_selftest() from public, anon, authenticated;
grant execute on function public.read_only_selftest() to service_role;

do $verify$
declare r record; bad text := '';
begin
  for r in select * from public.read_only_selftest() loop
    if (r.scenario like '%ต้องบล็อก' and not r.blocked)
       or (r.scenario like '%ต้องเขียนได้' and r.blocked) then
      bad := bad || r.scenario || ' · ';
    end if;
  end loop;
  if bad <> '' then raise exception 'self-test ไม่ผ่าน: %', bad; end if;

  -- 🔴 และ self-test ต้องไม่ทิ้งอะไรไว้เลย
  if exists (select 1 from app.system_mode where read_only or allow_maintenance_write or expires_at is not null) then
    raise exception 'self-test ทิ้งสถานะไว้ — rollback ไม่ทำงาน';
  end if;
end $verify$;

commit;
