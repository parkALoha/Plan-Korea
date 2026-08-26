-- ═══════════════════════════════════════════════════════════════════════════
-- `E3` — โหมดอ่านอย่างเดียวต้องครอบ **ไฟล์** ด้วย ไม่ใช่แค่ตาราง
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · P2-UI/UX เป็นคนพบ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 🔴 ช่องที่ปิด
-- `20260826194500` ผูก trigger `zz_read_only_guard` ด้วย
--     `format('… on public.%I', r.relname)`
-- → **ครอบเฉพาะตารางใน schema `public`** · `storage.objects` อยู่ schema `storage`
--
-- policy ของ `booking-files` (`20260825152500`) ตรวจแค่ *สมาชิกภาพของทริป*
-- **ไม่มีข้อไหนอ้างถึงโหมดเลย** → ระหว่างโหมดอ่านอย่างเดียว ผู้ใช้ยัง
-- **อัปโหลดและ *ลบ* ไฟล์ตั๋วได้ตามปกติ**
--
-- 🎯 **ตัวที่เจ็บคือ `delete` ไม่ใช่ `insert`**
-- · อัปโหลดตอน cutover → ไฟล์กำพร้า (แถวอ้างอิงเขียนไม่ได้) — **กู้ได้**
-- · **ลบตอน cutover → ไฟล์แนบของการจองหายถาวร ตอนที่ฐานกำลังถูกคัดลอกพอดี** — กู้ไม่ได้
--   และ `E7` คือช่วงเวลาที่เราจะเปิดโหมดนี้จริง
--
-- ## ⚠️ เอกสารเขียนข้อนี้ไว้เองแล้ว และมันก็ยังหลุด
-- `read-only-switch.md` ข้อ 2③ เขียนว่า *"ครอบได้ แต่ต้องตั้งใจครอบ ไม่ใช่ได้มาฟรี"*
-- **แล้วไม่มีใครตั้งใจครอบ** · ข้อ 5 (สถานะที่ลงแล้ว) ไม่มีแถวไหนพูดถึง `storage.objects` เลย
-- 🔴 **คำเตือนที่เขียนไว้ ไม่ได้ทำให้ของถูกทำ** — P2 เจอเพราะไปอ่านเอกสารตอนทำงานอื่น
--
-- ## สิ่งที่ **ไม่** ทำ
-- 🔴 **ไม่แตะ `booking_files_select`** — โหมดนี้คือ *อ่านอย่างเดียว* ไม่ใช่ *ปิดทั้งระบบ*
--    ผู้ใช้ที่ยืนอยู่หน้าเคาน์เตอร์ต้องเปิดไฟล์ตั๋วได้ตลอด **โดยเฉพาะระหว่าง cutover**
-- 🔴 **ไม่ผูก trigger กับ `storage.objects`** — ตารางนั้นเป็นของ `supabase_storage_admin`
--    การเพิ่ม trigger ลงไปคือการแตะโครงของ Supabase เอง ซึ่งอัปเกรดทับได้
--    · policy เป็นของที่เราสร้างเองอยู่แล้ว (`20260825152500`) → **แก้ที่ของเรา ไม่ใช่ของเขา**
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 🔴 **ตัวตนของฐานก่อนทุกอย่าง** — ด่าน `migration-guard` ของ P6 บังคับข้อนี้ และมันจับผมได้
--    ตอนผมเขียนไฟล์นี้ครั้งแรกโดยลืมบล็อกนี้ · **นั่นคือหน้าที่ของมันเป๊ะ**
do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่ใช่ engine-dev';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'write_is_blocked') then
    raise exception 'ไม่พบ app.write_is_blocked() — 20260826194500 ยังไม่ได้ลง';
  end if;
end $guard$;

-- ── ① policy ประเมินด้วยสิทธิ์ของผู้เรียก → `authenticated` ต้องเรียกฟังก์ชันนี้ได้ ──────
--
-- ⚠️ **ไม่ใช่การเปิดเผยอะไรใหม่** — สถานะโหมดถูกส่งให้ไคลเอนต์อยู่แล้วผ่าน RPC `public.system_mode()`
--    (แบนเนอร์บนหน้าจออ่านจากตรงนั้น) · ตัวนี้คืน `boolean` ตัวเดียว ไม่เปิด `app.system_mode`
-- 🔴 `app.system_mode` ยัง `revoke all` จาก `authenticated` เหมือนเดิมทุกตัวอักษร
grant execute on function app.write_is_blocked() to authenticated;

-- ── ② สร้าง policy ฝั่งเขียนใหม่ พร้อมเงื่อนไขโหมด ────────────────────────────
--
-- 📌 เงื่อนไขเดิมคงไว้ **ทุกตัวอักษร** แล้วเติม `and not app.write_is_blocked()`
--    ไม่ใช่เขียนใหม่ — เพื่อให้ `git diff` อ่านออกว่าเพิ่มอะไร ไม่ใช่เปลี่ยนอะไร

drop policy if exists booking_files_insert on storage.objects;
create policy booking_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booking-files'
    and app.can_write_trip(app.booking_file_trip(name))
    and not app.write_is_blocked()
  );

drop policy if exists booking_files_update on storage.objects;
create policy booking_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'booking-files'
    and app.can_write_trip(app.booking_file_trip(name))
    and not app.write_is_blocked()
  )
  with check (
    bucket_id = 'booking-files'
    and app.can_write_trip(app.booking_file_trip(name))
    and not app.write_is_blocked()
  );

drop policy if exists booking_files_delete on storage.objects;
create policy booking_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'booking-files'
    and app.can_write_trip(app.booking_file_trip(name))
    and not app.write_is_blocked()
  );

-- ── ③ ด่านยืนยัน — **ตรวจสภาพปลายทาง ไม่ใช่ข้อความใน migration** ────────────
--
-- ⚠️ **เขียนไว้ตรง ๆ ว่าตัวนี้ตรวจอะไรได้และตรวจอะไรไม่ได้:**
-- ✅ ตรวจได้: policy ฝั่งเขียนทั้ง 3 ตัว *อ้างถึง* `write_is_blocked` จริงในนิพจน์ที่ฐานเก็บไว้
-- ❌ ตรวจไม่ได้: ผู้ใช้จริงอัปโหลดไม่ได้จริงไหมตอนเปิดโหมด — **ต้องยิงผ่าน storage-api ในนาม
--    ผู้ใช้จริง ซึ่ง migration ทำไม่ได้** · นั่นคือของที่ต้องอยู่ใน `rlsMatrix.test.ts`
-- 🔴 **บทเรียนตรงจาก `do $verify` ที่เขียวทั้งที่ไม่ได้เขียนอะไรเลย (26 ส.ค. 2026):
--    ตัวตรวจที่เดินคนละเส้นทางกับของจริง ยืนยันได้แค่เส้นทางของตัวเอง**
do $verify$
declare
  missing text[];
  p       record;
begin
  for p in
    select polname,
           pg_get_expr(polqual,      polrelid) as using_expr,
           pg_get_expr(polwithcheck, polrelid) as check_expr
    from pg_policy
    where polrelid = 'storage.objects'::regclass
      and polname in ('booking_files_insert', 'booking_files_update', 'booking_files_delete')
  loop
    if coalesce(p.using_expr, '') !~ 'write_is_blocked'
       and coalesce(p.check_expr, '') !~ 'write_is_blocked' then
      missing := array_append(missing, p.polname);
    end if;
  end loop;

  if array_length(missing, 1) is not null then
    raise exception 'policy ที่ยังไม่อ้างโหมด: %', array_to_string(missing, ', ');
  end if;

  -- 🔴 นับด้วย — ถ้ามีตัวไหนหายไปทั้งใบ ลูปข้างบนจะไม่รู้เลยว่ามันหาย
  if (select count(*) from pg_policy
      where polrelid = 'storage.objects'::regclass
        and polname in ('booking_files_insert', 'booking_files_update', 'booking_files_delete')) <> 3 then
    raise exception 'policy ฝั่งเขียนของ booking-files ไม่ครบ 3 ตัว';
  end if;

  -- 🔴 และ `select` ต้อง **ไม่** ถูกแตะ — โหมดนี้คืออ่านอย่างเดียว ไม่ใช่ปิดทั้งระบบ
  if exists (select 1 from pg_policy
             where polrelid = 'storage.objects'::regclass
               and polname = 'booking_files_select'
               and pg_get_expr(polqual, polrelid) ~ 'write_is_blocked') then
    raise exception 'booking_files_select ไม่ควรอ้างโหมด — ผู้ใช้ต้องเปิดไฟล์ตั๋วได้ระหว่าง cutover';
  end if;
end $verify$;

commit;
