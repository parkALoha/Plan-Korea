-- ═══════════════════════════════════════════════════════════════════════════
-- `P-60` — 3 ไฟล์ที่เหลือใน `data/` · `transferPoints` · `emergency` · `airportAccess`
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · ปิดคลาสที่ `P-57` เปิดไว้ให้ครบทั้ง 5 ไฟล์
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ไล่ครบทั้ง `data/` แล้ว (2,290 บรรทัด · 5 ไฟล์) ────────────────────────
--   `itinerary.ts`     → `P-57` · `D80` · `Q7`
--   `places.ts`        → `P-58`
--   **`transferPoints.ts` · `emergency.ts` · `airportAccess.ts` → ไฟล์นี้**
--
-- 🎯 **ทั้งสามไม่มีมติไหนขัด และคีย์ชัดเจนทั้งหมด** — ต่างจาก `Q5`/`Q7` ที่ต้องตัดสินร่วม
--    `EMERGENCY_BY_COUNTRY: Record<"kr"|"vn", …>` **คีย์ด้วยรหัสประเทศ = `catalog_countries.id` พอดี**
--    `AIRPORT_ACCESS: Record<string, …>` คีย์ด้วย `"airport-icn"` = `catalog_places.legacy_slug`
--    → **ลงได้เลย ไม่ต้องเปิดคำถาม**
--
-- ── ① `transferPoints.ts` — `TransferPoint = Place & { transferKind, pickerHidden? }` ──
-- ฟิลด์ของ `Place` ครบแล้วตั้งแต่ `P-58` · เหลือ 2 ตัวที่ยังไม่มีที่:
-- 🔴 `source = 'transfer'` บอกว่า *"เป็นจุดเปลี่ยนถ่าย"* **แต่ไม่บอกว่าสนามบินหรือสถานี**
--    ซึ่งไฟล์เขียนเองว่า *"สนามบินกับสถานีใช้คนละสถานการณ์กัน"*
--
-- ⚠️ **`picker_hidden` ใช้ `not null default false` — และมันไม่ขัดกับบทเรียนของ P7 ใน `D80`**
--    ที่ `D80` ปฏิเสธคือ `default` ที่**ซ่อนสถานะ "ยังไม่ตัดสิน"** ของ *ผู้ใช้*
--    ตัวนี้เป็น **ข้อมูลที่เราคัดมา** และไม่มีสถานะ "ยังไม่ตัดสิน": จุดเปลี่ยนถ่ายทุกจุดขึ้นในลิสต์
--    เว้นแต่มีคนตั้งใจซ่อน · **ความเงียบของคนคัด = "ขึ้นลิสต์" จริง ๆ ไม่ใช่ "ยังไม่ได้คิด"**
--
-- ── ② `emergency.ts` → `catalog_country_contacts` ─────────────────────────
-- **เบอร์ฉุกเฉินรายประเทศคือฟีเจอร์แกนของแพลตฟอร์มหลายประเทศ ไม่ใช่ของแถมของทริปเกาหลี**
-- · `local` เป็นคำที่ PostgreSQL ใช้ (`SET LOCAL`) → ตั้งชื่อ `local_number` **ไม่ใช่ `local`**
--
-- ── ③ `airportAccess.ts` → `catalog_place_access` ─────────────────────────
-- *"ลงสนามบินแล้วเข้าเมืองยังไง"* — ลูกของจุดเปลี่ยนถ่าย · `from` เป็นคำสงวน → `from_label`
--
-- ── 🔴 `E2-AC2` — รายชื่อตารางที่ยกเว้น `using (true)` โตจาก 4 เป็น 6 ────────
-- `E2-AC2` บังคับว่า **ตารางคลังที่ยกเว้นต้องถูกระบุชื่อครบในเกณฑ์ ห้ามเขียนว่า "ยกเว้น catalog" เฉย ๆ**
-- (`D48` — กันตารางใหม่ได้ข้อยกเว้นฟรีจากการตั้งชื่อขึ้นต้นด้วย `catalog_`)
-- → **2 ตารางในไฟล์นี้ต้องถูกเติมเข้ารายชื่อ ไม่ใช่ผ่านเพราะชื่อขึ้นต้นถูก** · แจ้ง P8 + P4 แล้ว
--    รายชื่อใหม่: `catalog_countries` · `catalog_cities` · `catalog_places` · `catalog_place_names`
--                **`catalog_country_contacts`** · **`catalog_place_access`**
--
-- ── ⚠️ ทั้งสองตารางเก็บข้อความภาษาไทย — `Q6` ตัวเดิม ไม่ใช่ตัวใหม่ ──────────
-- `label` · `detail` · `note` · `from_label` เป็นไทยทั้งหมด **เหมือน `catalog_places.description`**
-- 🔴 **ผมไม่แก้ที่นี่โดยตั้งใจ** — `Q6` ถามว่าคำบรรยายควรแยก locale ไหม · **ถ้าคำตอบคือแยก
--    มันต้องแยกทุกตารางพร้อมกัน** · แยกตารางนี้ตารางเดียวตอนนี้ = สร้างสองมาตรฐานในคลังเดียวกัน
--
-- 📌 **`service_role` ต้อง `grant` ชัดเจน** — `alter default privileges … revoke all from service_role`
--    (`20260825223949`) ทำให้ตารางที่เกิดหลังจากนั้น**ไม่ได้อะไรจาก default อีก** · กลไกทำงานตามที่ตั้งใจ
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists public.catalog_place_access;
--   drop table if exists public.catalog_country_contacts;
--   alter table public.catalog_places drop column transfer_kind, drop column picker_hidden;
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

-- ── ① ──────────────────────────────────────────────────────────────────────
alter table public.catalog_places
  add column transfer_kind text check (transfer_kind in ('airport', 'station')),
  add column picker_hidden boolean not null default false,
  -- 🔴 ชุดค่าที่ขัดกันต้องเขียนลงไปไม่ได้ (บทเรียนของ P7 ใน `D80`)
  --    "เป็นสนามบิน" กับ "ไม่ใช่จุดเปลี่ยนถ่าย" อยู่ด้วยกันไม่ได้
  add constraint catalog_places_transfer_kind_only_for_transfer check (
    transfer_kind is null or source = 'transfer'
  );

comment on column public.catalog_places.transfer_kind is
  'P-60 — สนามบินหรือสถานี · `source=''transfer''` บอกแค่ว่าเป็นจุดเปลี่ยนถ่าย ไม่บอกว่าชนิดไหน '
  'ไฟล์ต้นทางเขียนเองว่า "สนามบินกับสถานีใช้คนละสถานการณ์กัน"';
comment on column public.catalog_places.picker_hidden is
  'P-60 — ไม่ต้องโผล่ในลิสต์ "ไปสนามบิน/สถานี" · มีไว้ให้แถวตารางบินอ้างถึงเท่านั้น '
  'not null default false ไม่ขัดกับ D80: นี่คือข้อมูลที่เราคัด ไม่มีสถานะ "ยังไม่ตัดสิน" '
  'ความเงียบของคนคัด = "ขึ้นลิสต์" จริง ๆ';

-- ── ② ──────────────────────────────────────────────────────────────────────
create table public.catalog_country_contacts (
  id           uuid primary key default gen_random_uuid(),
  country_id   text not null references public.catalog_countries(id) on delete cascade,

  icon         text,
  label        text not null check (length(trim(label)) between 1 and 120),
  -- เบอร์ที่กดจาก**ในประเทศนั้น** (สั้น ไม่มีรหัสประเทศ) · `local` เป็นคำที่ PG ใช้ จึงเติม `_number`
  local_number text,
  -- เบอร์รูปแบบสากล สำหรับโทรจากซิมไทย/eSIM
  tel          text,
  detail       text,
  url          text,
  priority     int not null default 1 check (priority >= 1),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- อย่างน้อยต้องมีเบอร์ทางใดทางหนึ่ง ไม่งั้นแถวนี้ไม่มีประโยชน์
  constraint catalog_country_contacts_has_number check (
    local_number is not null or tel is not null or url is not null
  ),
  constraint catalog_country_contacts_priority_unique unique (country_id, priority)
);
create index catalog_country_contacts_country_idx on public.catalog_country_contacts (country_id);

-- ── ③ ──────────────────────────────────────────────────────────────────────
create table public.catalog_place_access (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references public.catalog_places(id) on delete cascade,

  legacy_slug text check (legacy_slug ~ '^[a-z0-9-]{1,60}$'),
  icon        text,
  label       text not null check (length(trim(label)) between 1 and 120),
  -- ระยะเวลาช่วงวิ่งจริงตามตารางเดินรถ **ยังไม่รวมเวลาเดินไปจุดขึ้นรถ** (ตามที่ไฟล์ต้นทางระบุ)
  minutes     int not null check (minutes between 0 and 1440),
  from_label  text not null check (length(trim(from_label)) between 1 and 200),
  note        text,
  priority    int not null default 1 check (priority >= 1),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint catalog_place_access_priority_unique unique (place_id, priority)
);
create index catalog_place_access_place_idx on public.catalog_place_access (place_id);

-- ── สิทธิ์ — รูปเดียวกับคลังอื่นทุกตัวอักษร ────────────────────────────────
revoke all on public.catalog_country_contacts from public, anon, authenticated;
revoke all on public.catalog_place_access     from public, anon, authenticated;

alter table public.catalog_country_contacts enable row level security;
alter table public.catalog_place_access     enable row level security;

-- `using (true)` โดยตั้งใจ — คลังเป็นข้อมูลสาธารณะที่เขียนจากไคลเอนต์ไม่ได้เลย
-- 🔴 **และทั้งสองตารางต้องถูกเติมเข้ารายชื่อของ `E2-AC2` ไม่ใช่ผ่านเพราะชื่อขึ้นต้นด้วย `catalog_`** (`D48`)
create policy catalog_country_contacts_select on public.catalog_country_contacts
  for select to authenticated using (true);
create policy catalog_place_access_select on public.catalog_place_access
  for select to authenticated using (true);

grant select on public.catalog_country_contacts to authenticated;
grant select on public.catalog_place_access     to authenticated;

-- ต้องระบุชัดเจน — `alter default privileges … revoke all from service_role` (20260825223949)
-- ทำให้ตารางที่เกิดหลังจากนั้นไม่ได้อะไรจาก default อีก · **กลไกทำงานตามที่ตั้งใจ**
grant select, insert, update, delete on public.catalog_country_contacts to service_role;
grant select, insert, update, delete on public.catalog_place_access     to service_role;

create trigger catalog_country_contacts_touch before update on public.catalog_country_contacts
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at_only();
create trigger catalog_place_access_touch before update on public.catalog_place_access
  for each row when (old.* is distinct from new.*) execute function app.touch_updated_at_only();

comment on table public.catalog_country_contacts is
  'P-60 — เบอร์ฉุกเฉิน/สายด่วนรายประเทศ (data/emergency.ts เดิม · คีย์ด้วยรหัสประเทศพอดี) '
  '**ฟีเจอร์แกนของแพลตฟอร์มหลายประเทศ ไม่ใช่ของแถมของทริปเกาหลี** '
  '⚠️ label/detail เป็นไทย — Q6 ตัวเดิม ถ้าตัดสินว่าต้องแยก locale ต้องแยกทุกตารางพร้อมกัน';
comment on table public.catalog_place_access is
  'P-60 — "ลงสนามบินแล้วเข้าเมืองยังไง" (data/airportAccess.ts เดิม) · ลูกของ catalog_places '
  'minutes = ช่วงวิ่งจริงตามตารางเดินรถ **ยังไม่รวมเวลาเดินไปจุดขึ้นรถ** (ตามต้นทาง)';

commit;
