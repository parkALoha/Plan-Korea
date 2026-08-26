-- ═══════════════════════════════════════════════════════════════════════════
-- แก้ตัวเอง — `set_system_mode()` ใช้จริงไม่ได้ · `21000: UPDATE requires a WHERE clause`
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 **และข้อที่มีค่ากว่าตัวบั๊ก: `do $verify$` ของผมเรียกฟังก์ชันนี้แล้ว *ผ่าน***
-- Supabase บังคับ *"UPDATE ต้องมี WHERE"* กับ role ที่เข้ามาทาง API
-- **ไม่ใช่กับ session ที่รัน migration** → บล็อกยืนยันของผมเดินบนเส้นทางที่ไม่มีข้อจำกัดนั้น
-- > **ตัวตรวจที่รันคนละเส้นทางกับผู้ใช้จริง ยืนยันได้แค่ว่าโค้ดทำงานบนเส้นทางของตัวตรวจ**
-- · ตระกูลเดียวกับที่ทีมนี้ไล่ปิดกันทั้งวัน — ผมเพิ่งเขียนประโยคทำนองนี้เองใน `20260826172600`
--   แล้วเดินเข้ากับดักรุ่นถัดไปของมันในไฟล์ถัดมา
-- 🎯 **เจอเพราะยิงผ่าน HTTP จริง ไม่ใช่เพราะบล็อกยืนยัน** — ซึ่งเป็นเหตุผลที่ P4 ต้องมีอยู่
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

create or replace function public.set_system_mode(
  p_read_only               boolean,
  p_allow_maintenance_write boolean default false,
  p_reason                  text    default null
)
returns table (read_only boolean, allow_maintenance_write boolean, reason text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    raise exception
      using errcode = 'PT403',
            message = 'สลับโหมดของระบบจากคำขอของผู้ใช้ไม่ได้',
            hint    = 'system_mode_user_context';
  end if;

  -- 🔴 `where only_row` — ตารางมีแถวเดียวเสมอ (`primary key` + `check`) จึงไม่เปลี่ยนความหมาย
  --    แต่ **ขาดไม่ได้** เพราะ role ฝั่ง API ถูกบังคับให้ `UPDATE` ต้องมี `WHERE`
  update app.system_mode
     set read_only               = p_read_only,
         allow_maintenance_write = p_read_only and p_allow_maintenance_write,
         reason                  = case when p_read_only then p_reason else null end,
         changed_at              = now(),
         changed_by              = current_user
   where only_row;

  return query
    select m.read_only, m.allow_maintenance_write, m.reason from app.system_mode m;
end $$;

revoke all on function public.set_system_mode(boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_system_mode(boolean, boolean, text) to service_role;

commit;
