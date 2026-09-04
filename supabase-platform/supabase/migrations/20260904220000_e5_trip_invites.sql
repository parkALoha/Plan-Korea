-- ═══════════════════════════════════════════════════════════════════════════
-- ชวนเพื่อนเข้าทริปด้วยลิงก์ — `trip_invites` + RPC 5 ตัว
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้สั่งผ่าน P2 ("ทำเลย")
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 🔴 เก็บ *แฮช* ไม่ใช่ตัวโทเคน — และนี่คือการตัดสินใจที่สำคัญที่สุดในไฟล์นี้
--   โทเคนคือ **ความลับที่ให้สิทธิ์เขียนทริป** ⇒ ถ้าเก็บดิบ:
--     · ใครก็ตามที่อ่านแถวได้ (บั๊ก RLS · definer ที่เขียนพลาด · คนที่มี service_role) **ได้สิทธิ์ทันที**
--     · และ **ไม่มีร่องรอย** — การอ่านไม่ทิ้งอะไรไว้เลย
--   🎯 ***เก็บแฮชแล้ว "อ่านฐานได้" กับ "เข้าทริปได้" เลิกเป็นเรื่องเดียวกัน***
--   · โทเคนดิบถูกคืนออกไป **ครั้งเดียวตอนสร้าง** · หลังจากนั้นไม่มีใครในระบบอ่านมันได้อีก รวมทั้งเจ้าของทริป
--   · ⚠️ ผลที่ตามมาและต้องบอกผู้ใช้: **ทำลิงก์หายแล้วกู้ไม่ได้ ต้องสร้างใหม่** — นั่นคือราคาของข้อนี้
--
-- ## 🔴 `anon` เรียกได้ใบเดียว: `peek_trip_invite` — และมันเปิดเผยของจริง (ตั้งใจ · จำกัดแล้ว)
--   คนกดลิงก์ตอนยังไม่ล็อกอิน **ต้องรู้ว่ากำลังจะรับอะไร** ก่อนตัดสินใจสมัคร
--   ⇒ คืน `trip_title` · `inviter_name` · `role` · `expired` — **เท่านั้น**
--   🔴 **ไม่คืน**: `trip_id` · วัน · จุดแวะ · รายชื่อสมาชิก · จำนวนสมาชิก
--     ⇒ ***ถือลิงก์ = เห็นชื่อทริปกับชื่อคนชวน · ไม่ใช่เห็นแผน*** · เห็นแผนต้องกดรับและล็อกอิน
--   ⚠️ **นี่คือการยอมให้ข้อมูลรั่วโดยรู้ตัว**: ใครเดาโทเคนถูกจะเห็นสองอย่างนั้น
--     รับได้เพราะโทเคน 256 บิต · แต่ **ถ้าวันหนึ่งมีคนทำให้โทเคนสั้นลง ข้อนี้กลายเป็นช่องทันที**
--
-- ## 🔴 `role` ไม่มีค่าเริ่มต้นในสคีมา **โดยตั้งใจ**
--   ผู้สร้างลิงก์ต้องเลือกเองว่าให้ `editor` หรือ `viewer`
--   🎯 ***ค่าเริ่มต้นที่ไม่มีใครเลือก จะกลายเป็นสิ่งที่ทุกคนได้ — และไม่มีใครรู้ว่ามันถูกเลือกตอนไหน***
--   · `owner` ให้ผ่านลิงก์ไม่ได้เด็ดขาด (`check` บังคับ) — โอนความเป็นเจ้าของต้องเป็นการกระทำที่ตั้งใจ ไม่ใช่ผลข้างเคียงของลิงก์
--
-- ## ⚠️ ยังไม่ใช่ระบบเชิญเต็มรูป — ของที่ *ไม่* มีในใบนี้
--   ไม่มีเชิญด้วยอีเมล · ไม่มีแจ้งเตือน · ไม่มีคำขอเข้าร่วมที่รออนุมัติ
--   **มีแค่ "ลิงก์ที่ใครถือก็เข้าได้ ภายในเวลาและจำนวนครั้งที่กำหนด"** — ตรงกับที่ผู้ใช้ขอ (*"ส่งลิงก์เชิญร่วมทริปนี้ได้"*)
--
-- ## rollback
--   `drop function` 5 ตัว แล้ว `drop table public.trip_invites;`
--   · ไม่มีตารางอื่นอ้างถึงมัน · `trip_members` ที่เกิดจากการกดรับไปแล้ว **ไม่หายและไม่ควรหาย**
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

-- ───────────────────────────────────────────────────────────────────────────
-- 1. ตาราง
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.trip_invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  -- 🔴 sha256 ของโทเคน (hex 64 ตัว) — **ไม่ใช่ตัวโทเคน** · ดูเหตุผลหัวไฟล์
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role        text not null check (role in ('editor', 'viewer')),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  -- null = ใช้ได้ไม่จำกัดจำนวนครั้ง (ยังจำกัดด้วยเวลาอยู่)
  max_uses    int check (max_uses is null or max_uses > 0),
  used_count  int not null default 0 check (used_count >= 0),
  revoked_at  timestamptz,
  -- 🔴 อายุต้องเป็นอนาคตเสมอตอนสร้าง · กันลิงก์ที่ตายตั้งแต่เกิดซึ่งอ่านเหมือนลิงก์พัง
  constraint trip_invites_expiry_future check (expires_at > created_at)
);

create index if not exists trip_invites_trip_idx on public.trip_invites(trip_id);

comment on table public.trip_invites is
  'ลิงก์ชวนเข้าทริป · เก็บ sha256 ของโทเคน ไม่ใช่ตัวโทเคน · เข้าถึงผ่าน RPC เท่านั้น';

-- 🔴 **โหมดอ่านอย่างเดียวต้องครอบตารางนี้ด้วย — ผมลืม และด่านเป็นคนจับ ไม่ใช่ผม**
--    `pin:read-only-coverage` แดงทันทีที่มีตาราง `public` ใบใหม่ที่ไม่มี trigger นี้
--    🎯 ***ด่านชนิดนี้คือเหตุผลที่ทะเบียนต้อง "ผิดได้" — ถ้ามันแค่ลิสต์ชื่อที่คนพิมพ์เอง
--       ตารางใหม่ของผมจะไม่อยู่ในลิสต์ และมันจะเขียวโดยไม่ได้ตรวจอะไรเลย***
--    ⚠️ ไม่มี trigger นี้ = ตอนเปิดโหมดอ่านอย่างเดียว **ยังสร้าง/กดรับลิงก์เชิญได้อยู่**
--       ซึ่งแปลว่ามีคนเข้าทริปใหม่ได้ระหว่างที่เราประกาศว่าหยุดเขียนทั้งระบบ
create trigger zz_read_only_guard
  before insert or update or delete on public.trip_invites
  for each row execute function app.deny_write_when_read_only();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RLS — ปิดหมด ไม่มี policy สักใบ
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **ไม่มี policy = เข้าไม่ถึงจากไคลเอนต์เลย ไม่ใช่แค่ซ่อน** (`D18`)
--    ทุกเส้นทางผ่าน RPC `security definer` ซึ่งตรวจสิทธิ์เอง
--    🎯 ***ตารางนี้ถือความลับ ⇒ ทางเข้าที่ถูกต้องคือ "ไม่มีทางเข้า" แล้วเปิดเฉพาะประตูที่เราเขียนเอง***
alter table public.trip_invites enable row level security;
revoke all on public.trip_invites from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RPC
-- ───────────────────────────────────────────────────────────────────────────

-- ── สร้างลิงก์ — owner เท่านั้น · คืนโทเคนดิบ **ครั้งเดียวในชีวิตของลิงก์นั้น** ──
create or replace function public.create_trip_invite(
  p_trip_id      uuid,
  p_role         text,
  p_expires_days int default 7,
  p_max_uses     int default null
)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if app.trip_role(p_trip_id) is distinct from 'owner' then
    raise exception 'ไม่พบทริปนี้ หรือคุณไม่ใช่เจ้าของ' using errcode = 'P0002';
  end if;
  if p_role is null or p_role not in ('editor', 'viewer') then
    raise exception 'ต้องระบุสิทธิ์เป็น editor หรือ viewer' using errcode = '22023';
  end if;
  if p_expires_days is null or p_expires_days < 1 or p_expires_days > 90 then
    raise exception 'อายุลิงก์ต้องอยู่ระหว่าง 1 ถึง 90 วัน' using errcode = '22023';
  end if;

  -- 🔴 **244 บิต** จาก `gen_random_uuid()` สองใบ — **ไม่ใช่ 256** (P4 จับ · 5 ก.ย. 2026)
  --    UUIDv4 ยาว 128 บิต แต่ **6 บิตตายตัว**: 4 บิต version (เป็น `4` เสมอ) + 2 บิต variant (`8`/`9`/`a`/`b`)
  --    ⇒ เอนโทรปีจริง **122 บิต/ใบ** · สองใบ = **244** · (ยิงดู 5 ใบก็เห็น: หลัก version เป็น `4` ทุกใบ)
  --    🎯 ***และนี่คือกับดักของมัน: โทเคนออกมาเป็น hex 64 ตัว ⇒ **หน้าตาเหมือน 256 บิตเป๊ะ**
  --       12 บิตที่หายไปมองไม่เห็นจากตัวโทเคน — คนตรวจทีหลังจะนับตัวอักษรแล้วสรุปผิดแบบเดียวกับผม***
  --    · ⚠️ **ข้อสรุปไม่เปลี่ยน**: 244 บิตเดาไม่ออกพอ ๆ กับ 256 · การแลก (`peek` เปิดให้ `anon`) ยังคุ้ม
  --      (ไม่เปลี่ยนไปใช้ `gen_random_bytes(32)` ซึ่งให้ 256 จริง **เพราะไฟล์นี้ลงฐานไปแล้ว** —
  --       แก้เนื้อในไฟล์ที่ `schema_migrations` บันทึกแล้ว **จะไม่มีวันรัน** · ใบนี้จึงแก้คอมเมนต์อย่างเดียว
  --       ถ้าจะเปลี่ยนตัวสร้างจริง ต้องเป็น migration ใบใหม่ และ **ยังไม่มีเหตุผลพอที่จะทำ**)
  --
  --    🔴 **ไม่มีอะไรเฝ้า *ตัวสร้างโทเคน* เลย — จดเป็นความเสี่ยงที่รับไว้** (P4 ชี้ · ผมเห็นด้วยกับทางที่เขาเอน)
  --    `check (token_hash ~ '^[0-9a-f]{64}$')` บังคับรูปของ **แฮช** — แฮชของอะไรก็ได้ก็ผ่าน
  --    ทะเบียน definer ปักแค่ **ชื่อ** ฟังก์ชัน — เนื้อเปลี่ยนไม่มีอะไรฟ้อง
  --    ⇒ วันที่มีคน *"ย่อให้อ่านง่าย"* เหลือ `gen_random_uuid()` ใบเดียว (122 บิต) **ทุกด่านยังเขียว**
  --    ⚠️ ***ปลอดภัยเพราะบรรทัดนี้ยังเป็นแบบนี้ ไม่ใช่เพราะมีกลไกบังคับ*** — ทางที่พิจารณาแล้วไม่ทำ:
  --       assert "สร้างสองใบแล้วโทเคนต้องไม่ซ้ำและยาว 64" จับได้แค่ *พังสนิท* ไม่ได้จับ *อ่อนลง*
  --       ⇒ `§3.4`: ด่านที่แดงเฉพาะกับการละเมิดจริงไม่ได้ **อย่าสร้าง** · จดให้ชัดแทน
  --    · **ห้ามทำให้สั้นลง** — `peek_trip_invite` เปิดชื่อทริปให้คนที่เดาโทเคนถูก
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_exp   := now() + make_interval(days => p_expires_days);

  insert into public.trip_invites (trip_id, token_hash, role, created_by, expires_at, max_uses)
  values (p_trip_id, encode(sha256(v_token::bytea), 'hex'), p_role,
          (select auth.uid()), v_exp, p_max_uses)
  returning id into v_id;

  return query select v_id, v_token, v_exp;
end;
$$;

-- ── ดูว่าลิงก์นี้คืออะไร — **ใบเดียวที่ `anon` เรียกได้** ──
create or replace function public.peek_trip_invite(p_token text)
returns table (trip_title text, inviter_name text, role text, expired boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare v_inv public.trip_invites;
begin
  select * into v_inv from public.trip_invites
   where token_hash = encode(sha256(coalesce(p_token, '')::bytea), 'hex');
  if not found then
    raise exception 'ลิงก์นี้ใช้ไม่ได้' using errcode = 'P0002';
  end if;

  -- 🔴 คืนแค่ 4 อย่าง · **ไม่มี `trip_id`** ⇒ ถือลิงก์แล้วยังยิง endpoint อื่นของทริปไม่ได้
  --    (เหตุผลเต็มหัวไฟล์ — นี่คือเส้นแบ่ง "เห็นว่าถูกชวนไปไหน" กับ "เห็นแผน")
  return query
    select t.title,
           p.display_name,
           v_inv.role,
           (v_inv.revoked_at is not null
            or v_inv.expires_at <= now()
            or (v_inv.max_uses is not null and v_inv.used_count >= v_inv.max_uses))
      from public.trips t
      join public.profiles p on p.id = v_inv.created_by
     where t.id = v_inv.trip_id
       and t.deleted_at is null;   -- ทริปถูกลบแล้ว = ลิงก์ไม่มีความหมาย
end;
$$;

-- ── กดรับ — ต้องล็อกอินแล้ว ──
create or replace function public.redeem_trip_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.trip_invites;
begin
  if v_uid is null then
    raise exception 'ต้องล็อกอินก่อนกดรับคำเชิญ' using errcode = '42501';
  end if;

  -- 🔴 `for update` — กันสองคนกดพร้อมกันแล้ว `used_count` เพิ่มแค่ครั้งเดียว
  --    (โดยเฉพาะตอน `max_uses = 1` ซึ่งเป็นเคสที่คนใช้ลิงก์แบบใช้ครั้งเดียวคาดหวังว่าจะแน่นอน)
  select * into v_inv from public.trip_invites
   where token_hash = encode(sha256(coalesce(p_token, '')::bytea), 'hex')
   for update;
  if not found then
    raise exception 'ลิงก์นี้ใช้ไม่ได้' using errcode = 'P0002';
  end if;

  if v_inv.revoked_at is not null then
    raise exception 'ลิงก์นี้ถูกยกเลิกแล้ว' using errcode = 'P0002';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'ลิงก์นี้หมดอายุแล้ว' using errcode = 'P0002';
  end if;
  if v_inv.max_uses is not null and v_inv.used_count >= v_inv.max_uses then
    raise exception 'ลิงก์นี้ถูกใช้ครบจำนวนแล้ว' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.trips where id = v_inv.trip_id and deleted_at is null) then
    raise exception 'ทริปนี้ถูกลบไปแล้ว' using errcode = 'P0002';
  end if;

  -- 🔴 **เป็นสมาชิกอยู่แล้ว = ไม่ทำอะไร และไม่นับใช้** — ไม่ลดสิทธิ์ owner ที่เผลอกดลิงก์ตัวเอง
  --    🎯 ***`do nothing` ที่นี่กัน "กดลิงก์ viewer แล้วเจ้าของกลายเป็น viewer ในทริปตัวเอง"***
  --       ซึ่งเป็นการยกระดับสิทธิ์ *ย้อนกลับ* ที่หาไม่เจอจนกว่าจะมีคนบ่นว่าแก้ทริปไม่ได้
  if exists (select 1 from public.trip_members where trip_id = v_inv.trip_id and user_id = v_uid) then
    return v_inv.trip_id;
  end if;

  insert into public.trip_members (trip_id, user_id, role, invited_by)
  values (v_inv.trip_id, v_uid, v_inv.role, v_inv.created_by);

  update public.trip_invites set used_count = used_count + 1 where id = v_inv.id;
  return v_inv.trip_id;
end;
$$;

-- ── ยกเลิกลิงก์ · ดูลิงก์ที่มีอยู่ — owner เท่านั้น ──
create or replace function public.revoke_trip_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.trip_invites where id = p_invite_id;
  if v_trip is null or app.trip_role(v_trip) is distinct from 'owner' then
    raise exception 'ไม่พบลิงก์นี้ หรือคุณไม่ใช่เจ้าของทริป' using errcode = 'P0002';
  end if;
  update public.trip_invites set revoked_at = now()
   where id = p_invite_id and revoked_at is null;
end;
$$;

create or replace function public.list_trip_invites(p_trip_id uuid)
returns table (
  id uuid, role text, created_at timestamptz, expires_at timestamptz,
  max_uses int, used_count int, revoked_at timestamptz, active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.trip_role(p_trip_id) is distinct from 'owner' then
    raise exception 'ไม่พบทริปนี้ หรือคุณไม่ใช่เจ้าของ' using errcode = 'P0002';
  end if;
  -- 🔴 **ไม่มี `token_hash` ในรายการที่คืน** — เจ้าของก็ไม่ได้เห็น
  --    แฮชไม่ใช่โทเคน แต่การส่งมันออกไปไม่ได้ช่วยอะไรเลย และเปิดทางให้ยิงเทียบแบบออฟไลน์
  return query
    select i.id, i.role, i.created_at, i.expires_at, i.max_uses, i.used_count, i.revoked_at,
           (i.revoked_at is null and i.expires_at > now()
            and (i.max_uses is null or i.used_count < i.max_uses))
      from public.trip_invites i
     where i.trip_id = p_trip_id
     order by i.created_at desc
     limit 100;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. สิทธิ์
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public.create_trip_invite(uuid, text, int, int) from public, anon, authenticated;
revoke all on function public.peek_trip_invite(text)                   from public, anon, authenticated;
revoke all on function public.redeem_trip_invite(text)                 from public, anon, authenticated;
revoke all on function public.revoke_trip_invite(uuid)                 from public, anon, authenticated;
revoke all on function public.list_trip_invites(uuid)                  from public, anon, authenticated;

grant execute on function public.create_trip_invite(uuid, text, int, int) to authenticated;
grant execute on function public.redeem_trip_invite(text)                 to authenticated;
grant execute on function public.revoke_trip_invite(uuid)                 to authenticated;
grant execute on function public.list_trip_invites(uuid)                  to authenticated;
-- 🔴 ใบเดียวที่ `anon` ได้ — ดูขอบเขตที่หัวไฟล์
grant execute on function public.peek_trip_invite(text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. assert
-- ───────────────────────────────────────────────────────────────────────────
do $assert$
begin
  -- ① ไคลเอนต์แตะตารางตรง ๆ ไม่ได้สักเมธอด (ทั้งสอง role)
  if has_table_privilege('authenticated', 'public.trip_invites', 'SELECT')
     or has_table_privilege('authenticated', 'public.trip_invites', 'INSERT')
     or has_table_privilege('authenticated', 'public.trip_invites', 'UPDATE')
     or has_table_privilege('authenticated', 'public.trip_invites', 'DELETE') then
    raise exception 'assert ล้ม: authenticated แตะ trip_invites ตรง ๆ ได้ — โทเคนต้องออกทาง RPC เท่านั้น';
  end if;
  if has_table_privilege('anon', 'public.trip_invites', 'SELECT') then
    raise exception 'assert ล้ม: anon อ่าน trip_invites ได้';
  end if;

  -- ② ไม่มี policy สักใบ — ถ้ามีคนเพิ่ม แปลว่าเปิดทางตรงเข้าตารางที่ถือความลับ
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trip_invites') then
    raise exception 'assert ล้ม: มี policy บน trip_invites แล้ว — ตารางนี้ต้องเข้าถึงผ่าน RPC เท่านั้น';
  end if;

  -- ③ RLS เปิดจริง (ไม่มี policy + ไม่เปิด RLS = เจ้าของตารางยังอ่านได้ตามปกติ)
  if not (select relrowsecurity from pg_class where oid = 'public.trip_invites'::regclass) then
    raise exception 'assert ล้ม: trip_invites ยังไม่เปิด RLS';
  end if;

  -- ④ `anon` เรียกได้ใบเดียวเท่านั้น — เคสควบคุมทั้งสองทิศ
  if not has_function_privilege('anon', 'public.peek_trip_invite(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก peek ไม่ได้ — คนกดลิงก์ก่อนล็อกอินจะไม่รู้ว่ากำลังรับอะไร';
  end if;
  if has_function_privilege('anon', 'public.redeem_trip_invite(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon กดรับคำเชิญได้ — เข้าทริปได้โดยไม่มีตัวตน';
  end if;
  if has_function_privilege('anon', 'public.create_trip_invite(uuid, text, int, int)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon สร้างลิงก์เชิญได้';
  end if;
  if has_function_privilege('anon', 'public.list_trip_invites(uuid)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon อ่านรายการลิงก์ได้';
  end if;

  -- ⑤ ให้ผ่านลิงก์เป็น `owner` ไม่ได้ — `check` ต้องมีอยู่จริง ไม่ใช่แค่ตั้งใจ
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.trip_invites'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%role%editor%viewer%'
  ) then
    raise exception 'assert ล้ม: ไม่มี check บังคับ role ให้เป็น editor/viewer — ลิงก์แจก owner ได้';
  end if;

  -- ⑥ 🔴 คอลัมน์ที่เก็บโทเคนต้องเป็นแฮช — บังคับด้วย `check` รูปแฮช
  --    ⚠️ **ตรวจได้แค่ "รูปร่างเป็น hex 64 ตัว" ไม่ได้ตรวจว่ามันคือ sha256 ของอะไร**
  --       ถ้ามีคนเปลี่ยนไปเก็บของอื่นที่บังเอิญเป็น hex 64 ตัว assert นี้ผ่าน — จดไว้ว่านี่คือขอบเขต
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.trip_invites'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%[0-9a-f]{64}%'
  ) then
    raise exception 'assert ล้ม: ไม่มี check บังคับรูปแฮชของ token_hash';
  end if;

  -- ⑦ เคสควบคุมฝั่งบวก — ไม่มีข้อนี้ การ revoke ทุกอย่างทิ้งจะผ่าน ① ถึง ⑥ ครบเหมือนกันเป๊ะ
  if not has_function_privilege('authenticated', 'public.create_trip_invite(uuid, text, int, int)', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated สร้างลิงก์ไม่ได้ — ฟีเจอร์ตายทั้งใบ';
  end if;
  if not has_function_privilege('authenticated', 'public.redeem_trip_invite(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated กดรับไม่ได้ — ฟีเจอร์ตายทั้งใบ';
  end if;
end $assert$;

commit;
