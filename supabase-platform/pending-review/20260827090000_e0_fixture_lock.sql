-- ═══════════════════════════════════════════════════════════════════════════
-- `E0` — ล็อกกันสองเซสชันรันชุดสดทับกัน (fixture lock)
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026 · P4-QA/Sec ออกแบบกลไก · ผมเขียน RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 🔴 ปัญหาที่วัดแล้ว ไม่ใช่ที่กลัว
-- P1 กับ P4 รันชุดสดทับกัน **4+ ครั้งในไม่กี่ชั่วโมง** · ทุกครั้งรูปเดียวกัน:
-- ```
-- ชุดเต็ม → rlsMatrix: 612 passed | 273 skipped   (beforeAll ล้ม · duplicate key)
-- รันเดี่ยวหลังรอ    → 299 passed
-- ```
-- · เสียเวลา ~3–5 นาทีต่อครั้งเพื่อยืนยันสิ่งที่รู้อยู่แล้ว · **โต ไม่หด** เมื่อทีมทำงานพร้อมกันมากขึ้น
-- · `TEST_COUNTRY_CODES` จองรหัส **ต่อบล็อก ไม่ใช่ต่อเซสชัน** → สองเซสชันรันบล็อกเดียวกัน **ได้รหัสเดียวกันเสมอ**
--
-- 🔴 **และราคาที่หนักกว่าเวลา: collided run *เขียวหลอก* ได้** (P4 ชี้)
-- ถ้าอีกฝั่งลบ fixture ก่อนเคสที่ควรแดงได้รัน → เคสนั้นผ่านเพราะ**ไม่มีอะไรให้เห็น**
-- 🎯 **ครั้งที่มันแดงเรานับได้ · ครั้งที่มันเขียวหลอก เรานับไม่ได้ตามนิยาม**
--    → เลข 4 คือ **ขอบล่าง** ของความถี่จริง ไม่ใช่ค่าจริง
--
-- ## ⚠️ ทำไม **ไม่ใช่** `pg_advisory_lock` — P4 วัดแล้ว ไม่ได้เดา
-- · advisory lock เป็น **session-scoped** ต้องมี connection ค้างถือไว้
-- · **เทสต์มีแค่ supabase-js (REST)** — ไม่มี pg connection ตรง (ไม่มี connection string ใน `.env.local`)
-- · ทุก RPC ผ่าน PostgREST = **คนละ pooled connection** → session lock รั่วไปค้างในพูล หรือปลดตอนจบ RPC
-- 🔴 **เหตุผลหลักที่ผมเชียร์ advisory lock (ปลดเองตอน connection หลุด) ใช้ไม่ได้
--    เพราะไม่มี connection ค้างให้หลุด — มันหลุดทุก request อยู่แล้ว**
--
-- ## กลไกที่เลือก: **แถวล็อก + วันหมดอายุ** — รูปเดียวกับ `app.system_mode` ของ read-only mode
-- 🎯 **auto-release คือ *expiry* ไม่ใช่ *connection drop*** — ปัญหาเดียวกัน ทางแก้เดียวกัน
-- · ราคาที่ยอมรับ: process ถูกฆ่ากลางทาง → ล็อกค้างได้ถึง TTL แทนที่จะปลดทันที · **มีขอบ**
--
-- ## 🔴 บทเรียนที่ผมเคยจ่ายไปแล้วกับ `app.unsafe_state` และจะไม่จ่ายซ้ำ
-- ผมสร้างตารางใน schema `app` แล้ว push **โดยไม่เคยตรวจว่ามีใครอ่านมันได้**
-- → `PGRST205 Could not find the table 'public.unsafe_state'` · **PostgREST มองไม่เห็น schema `app`**
-- → ไฟล์นี้จึงมี **RPC ใน `public` ตั้งแต่ต้น** ไม่ใช่ตารางเปล่า ๆ
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

create table if not exists app.fixture_lock (
  -- แถวเดียวเสมอ — คำถามคือ "มีใครถืออยู่ไหม" ไม่ใช่ "กี่คนถือ"
  singleton  boolean primary key default true check (singleton),
  held_by    text,
  acquired_at timestamptz,
  expires_at timestamptz
);
insert into app.fixture_lock (singleton) values (true) on conflict do nothing;

alter table app.fixture_lock enable row level security;   -- ไม่มี policy โดยตั้งใจ (`D18`)
revoke all on app.fixture_lock from public, anon, authenticated;

comment on table app.fixture_lock is
  'E0 — ล็อกกันสองเซสชันรันชุดสดทับกัน · แถวเดียว · ปลดเองด้วย expires_at ไม่ใช่ connection drop';

-- ── ① ขอล็อก — **atomic ในคำสั่งเดียว** ────────────────────────────────────
--
-- 🔴 `update … where (ว่าง or หมดอายุ) returning` เป็น atomic ของมันเอง
--    **อ่านก่อนแล้วค่อยเขียน จะมีช่องให้สองเซสชันอ่านเจอ "ว่าง" พร้อมกัน** แล้วได้ล็อกทั้งคู่
--    · นั่นคือ TOCTOU และมันคือทั้งหมดที่ล็อกตัวนี้มีไว้ป้องกัน
--
-- ⚠️ **TTL ต้องยาวกว่าชุดสดที่ยาวที่สุด** — วัดได้ ~140–200 วิ (27 ส.ค. 2026) → ตั้ง 300
--    🔴 **ถ้าชุดช้าลงกว่านี้ ค่านี้ต้องโตตาม** ไม่งั้นล็อกจะหมดอายุ*ระหว่าง*ที่เจ้าของยังรันอยู่
--       แล้วอีกเซสชันจะเข้ามาชนทั้งที่ล็อกทำงานถูกทุกอย่าง — **ความคู่กันนี้ไม่มีอะไรบังคับ จึงเขียนไว้**
create or replace function public.acquire_fixture_lock(
  p_holder text,
  p_ttl_seconds int default 300
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare got boolean;
begin
  if coalesce(trim(p_holder), '') = '' then
    raise exception 'ต้องระบุว่าใครถือล็อก' using errcode = '22023';
  end if;
  if p_ttl_seconds < 1 or p_ttl_seconds > 1800 then
    -- เพดาน 30 นาที — ล็อกที่ค้างนานกว่านั้นคือของที่ต้องมีคนไปดู ไม่ใช่ของที่ต้องรอ
    raise exception 'TTL ต้องอยู่ระหว่าง 1–1800 วินาที' using errcode = '22023';
  end if;

  update app.fixture_lock
     set held_by = p_holder,
         acquired_at = now(),
         expires_at = now() + make_interval(secs => p_ttl_seconds)
   where singleton
     and (held_by is null or expires_at < now())
  returning true into got;

  return coalesce(got, false);
end $$;

-- ── ② คืนล็อก — **เฉพาะเจ้าของเท่านั้น** ───────────────────────────────────
--
-- 🔴 ไม่เช็คเจ้าของ = เซสชันที่ล็อกหมดอายุไปแล้ว **จะปลดล็อกของคนที่ถืออยู่ตอนนี้**
--    (มันไม่รู้ว่าตัวเองหมดอายุไปแล้ว · `afterAll` ยังทำงานตามปกติ)
create or replace function public.release_fixture_lock(p_holder text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare freed boolean;
begin
  update app.fixture_lock
     set held_by = null, acquired_at = null, expires_at = null
   where singleton and held_by = p_holder
  returning true into freed;
  return coalesce(freed, false);
end $$;

-- ── ③ ใครถืออยู่ — สำหรับข้อความตอน bounded-retry หมดเวลา ────────────────────
-- 🎯 **ข้อความตอนแดงต้องบอกว่า *ใคร* ถือ ไม่ใช่แค่ว่า "ถือไม่ได้"** — ไม่งั้นคนที่เจอไม่รู้จะไปดูที่ไหน
create or replace function public.fixture_lock_holder()
returns table (held_by text, expires_at timestamptz)
language sql security definer set search_path = '' as $$
  select f.held_by, f.expires_at from app.fixture_lock f where f.singleton
$$;

-- ── สิทธิ์ — **ชุดทดสอบเท่านั้น ไม่ใช่ผู้ใช้แอป** ──────────────────────────────
-- 🔴 `authenticated` ไม่ได้อะไรเลย · ผู้ใช้จริงไม่ควรมีทางแตะล็อกของชุดทดสอบ
revoke all on function public.acquire_fixture_lock(text, int) from public, anon, authenticated;
revoke all on function public.release_fixture_lock(text)       from public, anon, authenticated;
revoke all on function public.fixture_lock_holder()            from public, anon, authenticated;
grant execute on function public.acquire_fixture_lock(text, int) to service_role;
grant execute on function public.release_fixture_lock(text)      to service_role;
grant execute on function public.fixture_lock_holder()           to service_role;

-- ── ด่านยืนยัน — **เดินเส้นทางจริง ไม่ใช่ตรวจว่าฟังก์ชันมีอยู่** ─────────────
--
-- 🔴 บทเรียนตรงจาก `do $verify$` ที่เขียวทั้งที่ไม่ได้เขียนอะไร (26 ส.ค. 2026)
--    เคสนี้ **ขอล็อกจริง · ขอซ้ำต้องไม่ได้ · คืนแล้วขอใหม่ได้ · คนอื่นคืนไม่ได้**
do $verify$
declare a boolean; b boolean; c boolean;
begin
  perform public.release_fixture_lock(coalesce((select held_by from app.fixture_lock), ''));

  a := public.acquire_fixture_lock('verify-A', 60);
  if not a then raise exception 'ขอล็อกครั้งแรกไม่ได้'; end if;

  b := public.acquire_fixture_lock('verify-B', 60);
  if b then raise exception '🔴 สองเซสชันถือล็อกพร้อมกันได้ — ล็อกไม่ทำงาน'; end if;

  -- คนที่ไม่ได้ถือ ปลดไม่ได้
  c := public.release_fixture_lock('verify-B');
  if c then raise exception '🔴 คนที่ไม่ได้ถือล็อก ปลดล็อกของคนอื่นได้'; end if;

  if not public.release_fixture_lock('verify-A') then raise exception 'เจ้าของปลดล็อกตัวเองไม่ได้'; end if;
  if not public.acquire_fixture_lock('verify-C', 60) then raise exception 'ปลดแล้วขอใหม่ไม่ได้'; end if;
  perform public.release_fixture_lock('verify-C');

  if (select held_by from app.fixture_lock) is not null then
    raise exception 'ด่านยืนยันทิ้งล็อกค้างไว้';
  end if;
end $verify$;

commit;
