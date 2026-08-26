-- ═══════════════════════════════════════════════════════════════════════════
-- `E3-AC7` — **การวัด ไม่ใช่ฟีเจอร์**: trigger ที่ถูกยิงจากข้างใน `security definer`
-- เห็น `current_user` เป็นใคร · เจ้าของ: P1-Lead · 26 ส.ค. 2026 · P6 ตั้งคำถาม
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ทำไมต้องวัดก่อนเลือกดีไซน์ ──────────────────────────────────────────────
-- `E3-AC7` จะใช้ trigger เป็นจุดคอชขวดของโหมด read-only เพราะ `revoke` หยุด
-- `security definer` ไม่ได้ (7 RPC · `create_trip` + `soft_delete_*` ทั้ง 6)
-- และ `E7` ต้องเขียนได้ระหว่างโหมดนั้น → trigger ต้องมี "ทางยกเว้น"
--
-- 🔴 **สมมติฐานของ P6 ที่ถ้าจริงจะทำให้ดีไซน์ "ยกเว้นตาม role" พังทั้งอัน:**
-- > trigger ที่ถูกยิงโดย DML ข้างใน `security definer` เห็น `current_user`
-- > เป็น **เจ้าของฟังก์ชัน** ไม่ใช่ผู้เรียก
--
-- ถ้าจริง → เงื่อนไข *"ยกเว้นถ้าเป็น service_role/postgres"* จะยกเว้น
-- **ทั้ง 7 ทางที่ trigger เกิดมาเพื่อปิดพอดี** · และมันจะเขียวสนิท:
-- ทางตรงถูกปิดจริง คนทดสอบเห็นว่า "เขียนไม่ได้" **แต่ RPC ยังลบได้ทุกตัว**
-- 🎯 P6 พูดถูกว่ามันไม่ใช่ *"เปราะ"* — มัน **whitelist เป้าหมายของตัวเอง**
--
-- ── ทำไมไฟล์นี้เป็น migration ทั้งที่ไม่ได้สร้างอะไร ────────────────────────
-- P6 ยืนยันเองไม่ได้ (เครื่องไม่มี `psql`/docker) · REST รัน SQL ตามใจไม่ได้
-- **ผลของการวัดต้องอ่านซ้ำได้โดยคนอื่น ไม่ใช่คำบอกเล่าของผม** → เก็บลงตาราง
-- · ⚠️ **ไม่ใช่หลักฐานสุดท้าย** — ที่นี่จำลองผู้เรียกด้วย `set local role`
--   ทางที่ผู้ใช้จริงเดินคือ PostgREST + JWT · **ขอ P4 ยืนยันผ่านทางนั้นอีกชั้น**
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

create table if not exists app.role_probe (
  at            timestamptz not null default now(),
  path          text not null,
  cur_user      text,
  sess_user     text,
  guc_seen      text
);
revoke all on app.role_probe from public, anon, authenticated;

comment on table app.role_probe is
  'E3-AC7 — ผลการวัดว่า trigger เห็น current_user เป็นใครในแต่ละเส้นทาง (ไม่ใช่ฟีเจอร์ เป็นหลักฐาน)';

-- trigger ชั่วคราว: บันทึกอย่างเดียว ไม่บล็อกอะไร
create or replace function app.probe_log()
returns trigger language plpgsql as $$
begin
  insert into app.role_probe(path, cur_user, sess_user, guc_seen)
  values (
    current_setting('app.probe_path', true),
    current_user::text,
    session_user::text,
    current_setting('app.maintenance_write', true)
  );
  return new;
end $$;

create trigger zz_probe_log before update on public.trip_stops
  for each row execute function app.probe_log();

-- ฟังก์ชัน definer ที่เขียนจริง — รูปเดียวกับ `soft_delete_*` ทั้ง 6 ตัว
create or replace function app.probe_definer_write(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.trip_stops set note = note where id = p_id;
end $$;

do $run$
declare
  v_id    uuid;
  v_owner text := current_user;   -- 🔴 `reset role` คืนไปที่ *session_user* ไม่ใช่ role ที่กำลังใช้อยู่
begin                             --    รอบแรกล้มตรงนี้: หลัง reset แล้วไม่ได้เป็นเจ้าของ trip_stops อีก
  select id into v_id from public.trip_stops limit 1;
  if v_id is null then
    raise exception 'trip_stops ว่าง — วัดไม่ได้ และ "ไม่มีอะไรให้วัด" ไม่ใช่คำตอบ';
  end if;

  -- ① เขียนตรง ในฐานะ owner (ฐานอ้างอิง)
  perform set_config('app.probe_path', '1-direct-as-owner', true);
  update public.trip_stops set note = note where id = v_id;

  -- ② ผ่าน definer ในฐานะ owner
  perform set_config('app.probe_path', '2-definer-as-owner', true);
  perform app.probe_definer_write(v_id);

  -- ③ 🔴 ข้อที่ตอบคำถามของ P6: ผ่าน definer **ในฐานะ `authenticated`**
  perform set_config('app.probe_path', '3-definer-as-authenticated', true);
  set local role authenticated;
  perform app.probe_definer_write(v_id);
  execute format('set local role %I', v_owner);

  -- ④ GUC ที่ P6 เสนอเป็นทางยกเว้น — ตั้งแล้ว trigger เห็นข้ามชั้น definer ไหม
  perform set_config('app.probe_path', '4-definer-as-authenticated-with-guc', true);
  perform set_config('app.maintenance_write', 'on', true);
  set local role authenticated;
  perform app.probe_definer_write(v_id);
  execute format('set local role %I', v_owner);
end $run$;

-- เก็บกวาดของชั่วคราว — เหลือไว้แต่ผลการวัด
drop trigger zz_probe_log on public.trip_stops;
drop function app.probe_definer_write(uuid);
drop function app.probe_log();

commit;
