-- ════════════════════════════════════════════════════════════════════════════
-- E5 — ปักหมุดทริป (ผู้ใช้สั่งเอง 4 ก.ย. 2026 · เรฟ redesign หน้าแรก ข้อ 4)
-- เจ้าของ: P1-Lead
-- ════════════════════════════════════════════════════════════════════════════
-- ## 🔴 เก็บที่ `trip_members` ไม่ใช่ `trips` — และนี่คือเหตุผล ไม่ใช่รสนิยม
-- ทริปหนึ่งใบมีได้หลายคน · **การปักหมุดคือ *มุมมองส่วนตัว* ไม่ใช่คุณสมบัติของทริป**
-- ⇒ Alice ปักหมุดแล้ว Bob ต้องไม่เห็นว่ามันถูกปัก
-- · เก็บที่ `trips` = ปักหมุดกลายเป็นของสาธารณะในทริป **และ `trips_update` จำกัด `owner`
--   ⇒ editor/viewer จะปักหมุดของตัวเองไม่ได้เลย** ซึ่งกลับหัวกับความหมายของฟีเจอร์
--
-- ## 🔴 `pinned_at timestamptz` ไม่ใช่ `pinned boolean`
-- ผู้ใช้ปัก 3 ทริป ⇒ ต้องมีลำดับระหว่างของที่ปัก · timestamp ให้ลำดับนั้นฟรีโดยไม่ต้องมีคอลัมน์ที่สอง
-- · `null` = ไม่ได้ปัก · **ไม่มี `default`** — `now()` เป็นค่าเริ่มต้นจะทำให้ทุกคนที่เข้าทริปถูกปักอัตโนมัติ
--
-- ## 🔴 ทำไมต้องเป็น RPC ไม่ใช่ policy ใหม่ — **นี่คือส่วนที่สำคัญที่สุดของไฟล์นี้**
-- `trip_members_update` วันนี้จำกัด `owner` (`20260824043822:287-290`) และมี
-- `grant update (role) on trip_members to authenticated` (`…:87`) อยู่แล้ว
-- ```
-- ถ้าเพิ่ม policy "สมาชิกแก้แถวตัวเองได้"  → policy ของ UPDATE ถูก OR กัน
-- → editor แก้แถวตัวเองได้                → grant update (role) ยังอยู่
-- → **editor ตั้ง role ของตัวเองเป็น 'owner' ได้ทันที**
-- ```
-- 🎯 ***policy คุมว่า "แถวไหน" · `grant` คุมว่า "คอลัมน์ไหน" — เปิด policy ให้กว้างขึ้น
--    จึงเปิดทุกคอลัมน์ที่ `grant` เคยให้ไว้ *ตอนที่ policy ยังแคบ* ไปพร้อมกัน***
-- ⇒ **ไม่เพิ่ม policy · ไม่เพิ่ม column grant** · ใช้ `security definer` ที่แตะได้คอลัมน์เดียว
--   (รูปเดียวกับ `soft_delete_trip_hotel` · `soft_delete_custom_place` ที่มีอยู่แล้ว)
--
-- ## ⚠️ ที่ไฟล์นี้ **ไม่** ทำ
-- · ไม่มีเพดานจำนวนหมุด — ปักทุกใบ = ไม่มีใบไหนถูกปัก ซึ่งผู้ใช้เห็นเองและแก้เองได้
-- · ไม่แตะการเรียงลำดับฝั่ง API — คนอ่านเป็นคนตัดสินว่าจะเรียงยังไง
--
-- ── ถอนคืน ────────────────────────────────────────────────────────────────
--   drop function if exists public.set_trip_pinned(uuid, boolean);
--   alter table public.trip_members drop column if exists pinned_at;
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
-- 1. คอลัมน์
-- ───────────────────────────────────────────────────────────────────────────
alter table public.trip_members
  add column if not exists pinned_at timestamptz;

comment on column public.trip_members.pinned_at is
  'ผู้ใช้คนนี้ปักหมุดทริปนี้เมื่อไหร่ · null = ไม่ได้ปัก · เป็นมุมมองส่วนตัว คนอื่นในทริปไม่เห็น '
  '· เขียนผ่าน public.set_trip_pinned() เท่านั้น (ไม่มี column grant โดยตั้งใจ — ดูหัวไฟล์)';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RPC — ทางเดียวที่เขียนคอลัมน์นี้ได้
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.set_trip_pinned(p_trip_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'ต้องล็อกอินก่อน' using errcode = '42501';
  end if;

  -- 🔴 `where user_id = v_uid` คือด่านทั้งหมด — **แก้ได้เฉพาะแถวสมาชิกภาพของตัวเอง**
  --    ไม่ต้องเช็ค role เลย: ใครที่เป็นสมาชิกก็ปักหมุดของตัวเองได้ ซึ่งคือความหมายของฟีเจอร์
  --    · และ `set` แตะคอลัมน์เดียว ⇒ ไม่มีทางที่ `role` จะขยับผ่านทางนี้
  update public.trip_members
     set pinned_at = case when p_pinned then now() else null end
   where trip_id = p_trip_id
     and user_id = v_uid;

  -- 🔴 0 แถว = **ไม่ได้เป็นสมาชิกทริปนี้** ไม่ใช่ "สำเร็จแบบไม่มีอะไรเปลี่ยน"
  --    เงียบไว้ = ผู้เรียกเชื่อว่าปักแล้ว แล้วหน้าจอไม่ขยับ · อาการ "กดแล้วไม่เปลี่ยน" ที่ไล่หายากที่สุด
  if not found then
    raise exception 'ไม่พบทริปนี้ หรือคุณไม่ได้เป็นสมาชิก' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_trip_pinned(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_trip_pinned(uuid, boolean) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. assert — ฝั่งบวก **และ** ฝั่งควบคุมที่พิสูจน์ว่าไม่ได้เปิดเกิน
-- ───────────────────────────────────────────────────────────────────────────
do $assert$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='trip_members' and column_name='pinned_at') then
    raise exception 'assert ล้ม: ไม่มี trip_members.pinned_at';
  end if;

  if not has_function_privilege('authenticated', 'public.set_trip_pinned(uuid, boolean)', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก set_trip_pinned ไม่ได้';
  end if;

  -- 🔴 **เคสควบคุมที่สำคัญที่สุดในไฟล์นี้ — พิสูจน์ว่าเราไม่ได้เปิดทางที่หัวไฟล์เตือนไว้**
  --    ถ้าใครเผลอ `grant update (pinned_at)` ในอนาคต **ต้องแดงที่นี่** เพราะทางนั้นพ่วง
  --    `grant update (role)` ที่มีอยู่แล้ว ผ่าน policy ตัวเดียวกัน
  if has_column_privilege('authenticated', 'public.trip_members', 'pinned_at', 'UPDATE') then
    raise exception 'assert ล้ม: authenticated update pinned_at ตรงได้ — ต้องผ่าน RPC เท่านั้น (ดูหัวไฟล์: ทางนี้เปิด role ไปด้วย)';
  end if;

  -- ✅ และยืนยันว่า `trip_members_update` ยังเป็น owner-only เหมือนเดิม — ไฟล์นี้ต้องไม่ผ่อนมัน
  if exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='trip_members' and cmd='UPDATE'
       and policyname <> 'trip_members_update'
  ) then
    raise exception 'assert ล้ม: มี policy UPDATE ตัวใหม่บน trip_members — policy ของ UPDATE ถูก OR กัน ไล่ผลกระทบก่อน';
  end if;
end $assert$;

commit;
