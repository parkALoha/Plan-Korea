-- ═══════════════════════════════════════════════════════════════════════════
-- `E3-AC7` — โหมด read-only ที่บังคับได้จริงที่ชั้นฐาน
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · ข้อกำหนดจาก P6 (ops) + P7 (ผู้ใช้/ไคลเอนต์)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมไม่ใช่ `revoke` ──────────────────────────────────────────────────────
-- เกณฑ์เดิมเขียนว่า `revoke` *"ไม่มีทางเดินอ้อม แม้ผ่าน RPC"* — **ผิด**
-- ไคลเอนต์เรียก RPC ได้ 11 ตัว **7 ตัวเป็น `security definer`** (`create_trip` + `soft_delete_*` ทั้ง 6)
-- รันด้วยสิทธิ์เจ้าของ → `revoke` จาก `authenticated` ไม่มีผลข้างในมันเลย
-- 🔴 หลักฐานสดที่มีอยู่แล้ว: `soft_delete_*` เขียน `deleted_at` ได้ทุกวัน ทั้งที่ `deleted_at`
--    ไม่อยู่ใน column grant ของ `authenticated` สักตาราง
-- → `revoke` อย่างเดียวจะเหลือทางเขียนเปิด **7 ทาง รวม "ลบ" ทุกชนิด** และ **เขียวสนิท**
--
-- **trigger ยิงกับทุกการเขียน ไม่สนว่าคนเขียนเป็นใครหรือมาจาก definer** — จุดคอขวดเดียวที่ไม่มีทางอ้อม
--
-- ── ทำไมยกเว้นด้วย GUC ไม่ใช่ด้วย role (P6 ตั้งคำถาม · P1 วัด `20260826182000`) ──
-- **วัดแล้ว: trigger ที่ถูกยิงจากข้างใน definer เห็น `current_user` = `postgres` ไม่ใช่ผู้เรียก**
-- → เงื่อนไข *"ยกเว้นถ้าเป็น postgres/service_role"* จะยกเว้น **ทั้ง 7 RPC ที่ trigger เกิดมาเพื่อปิด**
--   มัน **whitelist เป้าหมายของตัวเอง** — P6: *"ไม่ใช่เปราะ มันกลับด้าน"*
-- 🎯 **ย้ายจาก "คุณเป็นใคร" (สืบทอดมาเอง ไม่มีใครต้องเขียนอะไร)**
--    **ไปเป็น "คุณประกาศไว้หรือเปล่า" (ต้องมีคนพิมพ์ลงไป และเป็น diff ที่มองเห็น)**
--
-- ── สองเงื่อนไข ไม่ใช่เงื่อนไขเดียว (P6 เสนอ · P1 แก้รูปให้ไม่วนเป็นวงกลม) ──
-- ```
-- ปล่อยผ่าน = allow_maintenance_write (ตาราง)  ∧  app.maintenance_write = 'on' (GUC)
-- ```
-- · ฉบับแรกของ P6 ใช้ `read_only` เป็นเงื่อนไขที่สอง **ซึ่งเป็นจริงเสมอตอน trigger ทำงาน** → ไม่เพิ่มอะไร
-- · แยกเป็นคนละคอลัมน์แล้วมันเพิ่มจริง: **โหมดที่กดตอน incident ตั้ง `allow_maintenance_write = false`**
--   → ต่อให้วันหนึ่งไคลเอนต์ตั้ง GUC ได้ (P4 ยืนยันว่าวันนี้ตั้งไม่ได้ 5 เส้นทาง) **ประตูก็ยังปิดสนิท**
-- · 🎯 สองชั้นนี้ **พังคนละแบบ**: GUC พังถ้าไคลเอนต์ตั้งได้ · ตารางพังถ้าสิทธิ์เขียนรั่ว
--   **ไม่มีความผิดพลาดเดียวที่ทำให้ทั้งคู่พังพร้อมกัน**
--
-- ── ทำไมตารางอยู่ใน `app` (ข้อบังคับ ops ของ P6) ────────────────────────────
-- DB ทริปจริงไม่มี schema `app` → **รันไฟล์นี้ผิดฐาน = ล้มเพราะไม่มีตาราง ไม่ใช่ทำงานสำเร็จ**
--
-- ── ขอบเขต: **ทุกตารางใน `public`** และเหตุผลที่ไม่ยกเว้นคลัง/แคช ─────────────
-- *"อ่านอย่างเดียว"* ควรแปลว่าฐานไม่เปลี่ยน · การยกเว้นคลัง/แคชคือการบอกว่าบางส่วนเปลี่ยนได้
-- ⚠️ **ผลที่ P6 ต้องรับรู้ ไม่ใช่ผลที่ผมซ่อนไว้:** งาน cron ที่อุ่นแคชจะถูกบล็อกด้วย
--    **เว้นแต่มันประกาศ `set local app.maintenance_write = 'on'`** — ผมถือว่านั่นเป็นคุณสมบัติ
--    (บังคับให้การเขียนระหว่างโหมดนี้เป็นสิ่งที่มีคนตั้งใจ) **แต่ถ้า P6 ไม่เอา บอกได้ ผมถอนตารางกลุ่มนั้นออก**
--
-- ── รหัสข้อผิดพลาด: `PT503` ───────────────────────────────────────────────────
-- P7: *"`revoke` แนบ `errcode` ของตัวเองไม่ได้ตามนิยาม → คิวแยก `42501` สองชนิดไม่ออก"*
-- trigger แนบได้ · เลือก `PT503` เพราะ **PostgREST แปลง `PTxxx` เป็น HTTP status `xxx`**
-- → ไคลเอนต์ได้ **`503` ไม่ใช่ `403`** แยกออกทันทีว่า *"ระบบปิดชั่วคราว"* ไม่ใช่ *"คุณไม่มีสิทธิ์"*
-- 🔴 **ข้อนี้ยังไม่ได้วัด — ขอ P4 ยืนยัน HTTP status จริง** ถ้า PostgREST ไม่แปลง จะได้ `500`
--    ซึ่งยังแยกจาก `403` ได้ แต่แย่กว่า · **อย่าอ่านบรรทัดนี้ว่ายืนยันแล้ว**
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

-- ── ① สถานะ — แถวเดียวเสมอ ─────────────────────────────────────────────────
create table if not exists app.system_mode (
  -- `check (only_row)` + primary key = **มีได้แถวเดียวตลอดกาล** ไม่ต้องพึ่งวินัยของคนเขียน
  only_row                boolean primary key default true check (only_row),
  read_only               boolean not null default false,
  -- 🔴 แยกจาก `read_only` โดยเจตนา — ดูหัวไฟล์ · `false` = แม้ประกาศ GUC ก็เขียนไม่ได้
  allow_maintenance_write boolean not null default false,
  reason                  text,
  changed_at              timestamptz not null default now(),
  changed_by              text not null default current_user
);
insert into app.system_mode (only_row) values (true) on conflict do nothing;

revoke all on app.system_mode from public, anon, authenticated;

comment on table app.system_mode is
  'E3-AC7 — โหมดของทั้งระบบ · แถวเดียว · authenticated แตะไม่ได้เลยทั้งอ่านและเขียน '
  '(อ่านผ่าน public.system_mode() แทน) · อยู่ใน app เพราะ DB ทริปจริงไม่มี schema นี้';

-- ── ② ตัวตัดสิน — แยกออกมาเพื่อให้เทสต์เรียกตรงได้ ─────────────────────────
create or replace function app.write_is_blocked()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare m record;
begin
  select read_only, allow_maintenance_write into m from app.system_mode;
  if m is null or not m.read_only then
    return false;                        -- ไม่ได้อยู่ในโหมดนี้ → ไม่บล็อกอะไรเลย
  end if;
  -- 🔴 สองเงื่อนไข · ขาดข้อใดข้อหนึ่ง = บล็อก
  if m.allow_maintenance_write
     and coalesce(current_setting('app.maintenance_write', true), '') = 'on' then
    return false;
  end if;
  return true;
end $$;

revoke all on function app.write_is_blocked() from public, anon, authenticated;

-- ── ③ ตัวบังคับ ────────────────────────────────────────────────────────────
create or replace function app.deny_write_when_read_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.write_is_blocked() then
    raise exception
      using errcode = 'PT503',
            message = 'ระบบอยู่ในโหมดอ่านอย่างเดียวชั่วคราว จึงบันทึกไม่ได้ตอนนี้',
            -- 🔴 ข้อความต้องบอกว่า *"ตั้งใจ"* ไม่ใช่ *"พัง"* (ข้อบังคับของ P6)
            --    ไม่งั้นคำถามแรกที่ ops จะโดนคือ "มันพังหรือมันตั้งใจ" และตอบไม่ได้ถ้าไม่เปิดฐานดู
            detail  = coalesce((select reason from app.system_mode), 'ไม่ได้ระบุเหตุผลไว้'),
            hint    = 'read_only_mode';
  end if;
  return coalesce(new, old);   -- `old` สำหรับ DELETE
end $$;

revoke all on function app.deny_write_when_read_only() from public, anon, authenticated;

-- ── ④ ติดกับ *ทุก* ตารางใน `public` — deny by default ──────────────────────
-- 🔴 วนจาก `pg_class` ไม่ใช่จากรายชื่อที่พิมพ์เอง — **ตารางใหม่จะได้ trigger เองตอนรันไฟล์นี้ซ้ำ**
--    (รายชื่อที่พิมพ์เองคือรายการที่คนลืมเติม ซึ่งทีมนี้เจอมาแล้วหลายรอบ)
do $attach$
declare r record;
begin
  for r in
    select c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    execute format('drop trigger if exists zz_read_only_guard on public.%I', r.relname);
    execute format(
      'create trigger zz_read_only_guard before insert or update or delete on public.%I
         for each row execute function app.deny_write_when_read_only()', r.relname);
  end loop;
end $attach$;

-- ── ⑤ ทางอ่านธง — `P-50`: ธงที่อ่านไม่ได้ ไม่ใช่ธง (ข้อบังคับของ P7) ────────
-- ⚠️ **ระหว่างโหมดนี้ `select` ต้องไม่ถูกถอน** ไม่งั้นธงเองก็อ่านไม่ได้
--    ไฟล์นี้ไม่ถอนสิทธิ์อ่านของใครเลย — **เขียนไว้เป็นข้อบังคับ ไม่ใช่ผลพลอยได้**
create or replace function public.system_mode()
returns table (read_only boolean, reason text)
language sql stable security definer set search_path = '' as $$
  select m.read_only, m.reason from app.system_mode m
$$;

revoke all on function public.system_mode() from public;
-- 🔴 `anon` ด้วย — คนที่ยังไม่ล็อกอินต้องเห็น banner ก่อนเริ่มพิมพ์ (P7 ข้อ ③)
--    และสถานะนี้ไม่ใช่ความลับ · `allow_maintenance_write` **ไม่ถูกคืนออกไป** เพราะไม่ใช่เรื่องของผู้ใช้
grant execute on function public.system_mode() to anon, authenticated, service_role;

commit;
