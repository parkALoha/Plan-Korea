-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — ชั้น ③ แคชฝั่งเซิร์ฟเวอร์ 3 ตัว: `P-33` · `D77` · `Q3`
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── `P-33` — ทั้งไฟล์นี้มีอยู่เพราะข้อนี้ ────────────────────────────────────
-- แคช 3 ตัวนี้ **ไม่ใช่ข้อมูลของผู้ใช้ มันคือโครงสร้างพื้นฐานฝั่งเซิร์ฟเวอร์**
-- แต่วันนี้ (สคีมาเดิม `0004`/`0010`/`0011`) ทุกใบเปิด `using (true)` ให้ client เต็ม ๆ
--
--   ฝั่งอ่าน  `select distinct from_place_id from travel_time_cache where from_place_id like 'hotel@%'`
--            → **พิกัดที่พักของผู้ใช้ทุกคนในระบบ เป็นข้อความล้วน** (`lib/hotelLegs.ts:12` คีย์ด้วย `hotel@{lat},{lng}`)
--   ฝั่งเขียน `travel_time_cache` ขาด UPDATE policy อยู่แล้วทั้งที่โค้ดเรียก `.upsert()`
--            → 🔴 **"แก้" ด้วยการเติม UPDATE policy ให้ `authenticated` คือกับดัก ไม่ใช่ทางออก**
--              = ใครก็เขียนว่ามิเป่→แฮอึนแด 5 นาที แล้ว `/today` ของทุกคนบอกให้ออกสาย
--
-- 🎯 **ทางที่เลือก: ปิดทั้งสองฝั่งด้วยการตัดสินใจเดียว — client แตะไม่ได้เลยสักตาราง**
--    ✅ ไม่ต้องเปลี่ยนคีย์ ไม่ต้อง hash **ไม่เสียการใช้ซ้ำข้ามทริป ซึ่งเป็นเหตุผลที่แคชมีอยู่**
--    ⚠️ **ไม่ใช่การ hash พิกัด** — พิกัดในเมืองมีจำนวนน้อยพอจะไล่เดาย้อนได้ · hash ที่ client
--       คำนวณเองได้ ก็ไล่ย้อนได้ **ทางที่ดูฉลาดกว่าในข้อนี้คือทางที่อ่อนกว่า**
--
-- ── ทำไม 3 ตารางนี้ *ไม่มี policy สักตัว* และนั่นคือความตั้งใจ ───────────────
-- `enable row level security` + **ศูนย์ policy** + `revoke all from anon, authenticated`
-- → `authenticated` ที่ไม่ใช่ใครเป็นพิเศษ **ถูกปฏิเสธครบทั้ง 4 verb** = เกณฑ์ของ `P-33`/`E2-AC11` ตรงตัว
-- 🔴 **ตารางที่ไม่มี tenancy key คือตารางที่คำถาม "member vs non-member" ถามผิดข้อ
--    ไม่ใช่ตารางที่ไม่ต้องถาม** — มันมีเคสของตัวเองในเมทริกซ์ ไม่ได้หลุดออกไป
--
-- ── 🔴 `Q3` — *ใครเป็นคนเขียนแคช* ยังไม่มีคำตอบ และนี่คือที่จดมันไว้ ────────
-- `revoke` ปิดฝั่ง client แล้ว แต่ฝั่งเซิร์ฟเวอร์ยัง**ไม่มีหลักฐานตัวตน**ที่เขียนได้:
--   · `app/api/travel-time/route.ts:4` → `lib/supabase.ts:4` → **ยิงด้วย anon key**
--     *"อยู่ฝั่งเซิร์ฟเวอร์" ≠ "มีสิทธิ์ของเซิร์ฟเวอร์"* — `D38` ทั้งข้อพูดเรื่องนี้
--   · `service_role` ใช้ไม่ได้: `lib/__tests__/authNoServiceRole.test.ts` แบน `SUPABASE_SERVICE_ROLE_KEY`
--     ทั้งโฟลเดอร์ `app/` (`D38`/`E3-AC9`) — และด่านนั้น**ถูก** ห้ามแก้ให้ผ่าน
--   · definer RPC ที่ `grant execute to authenticated` **ไม่ปิดฝั่งเขียน** — ค่ามาจาก client อยู่ดี
--     = เปิดช่องวางยากลับมาในรูปที่ดูปลอดภัยกว่าเดิม
-- 📌 **สิ่งที่ตัดสินได้แล้ววันนี้และตัดสินไปแล้ว: ตารางอยู่ในสถานะปฏิเสธทุกทาง**
--    สิ่งที่ตัดสินไม่ได้วันนี้: หลักฐานตัวตนของฝั่งเขียน — **ต้องรอ `E3` ที่ port route จริง**
--    ⚠️ **ห้ามอ่านว่า "ค้างไว้ก่อน"** — `D73` คือการเลื่อนที่มีเหตุผลดีทุกครั้งจนไม่มีใครตัดสิน
--       จึงลงทะเบียนเป็น `Q3` ที่ `README.md` **ในคอมมิตเดียวกับไฟล์นี้**
--    ตัวเลือกที่ไล่แล้ว (ให้คนตอบ `Q3` ไม่ต้องเริ่มจากศูนย์):
--      (ก) definer RPC + `on conflict do nothing` → คีย์เย็นยังถูกวางยาได้ **ไม่พอ**
--      (ข) ไม่แคชใน DB เลย พึ่ง fetch cache ของ Next → ปลอดภัย แต่เสีย L2 + quota Google
--      (ค) role เฉพาะกิจ (เช่น `cache_writer`) มี grant แค่ 3 ตารางนี้ ไม่มี BYPASSRLS
--          — ไม่ใช่ `service_role` จึงไม่ชน `authNoServiceRole` **และไม่ขัด `D38`
--            เพราะเป็นสิทธิ์ที่ตั้งใจมอบพร้อมเทสต์ ไม่ใช่สิทธิ์ที่ถูกสมมติว่ามี**
--          ต้องมี P6 (env/secret) + P4 (เทสต์) ร่วมตัดสิน → **นี่คือเหตุผลที่มันไม่จบในไฟล์นี้**
--
-- ── `D77` — `place_details_cache` แตกเป็น 2 ใบ (ดูหัวข้อของมันเองด้านล่าง) ───
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop table if exists public.travel_time_cache;
--   drop table if exists public.place_photo_cache;
--   drop table if exists public.place_details_local_cache;
--   drop table if exists public.place_details_cache;
-- ═══════════════════════════════════════════════════════════════════════════

begin;

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
-- 1. `place_details_cache` — ข้อเท็จจริงของสถานที่ที่**ไม่ขึ้นกับภาษา**
-- ───────────────────────────────────────────────────────────────────────────
create table public.place_details_cache (
  maps_query        text primary key check (length(maps_query) between 1 and 500),
  google_place_id   text,
  opening_hours     jsonb,
  rating            numeric check (rating is null or rating between 0 and 5),
  user_rating_count integer check (user_rating_count is null or user_rating_count >= 0),
  primary_type      text,
  reviews           jsonb,
  fetched_at        timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. `D77` — ชื่อ/ที่อยู่ภาษาท้องถิ่นย้ายออกมาเป็นตารางของตัวเอง
-- ───────────────────────────────────────────────────────────────────────────
-- `column-map.md` เขียนว่า `locale` **"เป็นคีย์ร่วม — แคชแยกตามภาษาที่ขอ"** และ
-- คอลัมน์ที่เหลือ **"คงเดิม"** ทุกตัว · **สองคำตอบนี้ถูกทั้งคู่ และอยู่ด้วยกันไม่ได้** (`P-51` อีกตัว
-- เจอจากกติกา `Q1` ที่บังคับให้ cross-reference ทีละตารางก่อนเขียน DDL — ครั้งที่สองที่มันทำงาน):
--   · ถ้า PK = `(maps_query, locale)` → `rating`/`google_place_id`/`reviews` ถูกก๊อปต่อภาษา
--     = **เรทติ้งของที่เดียวกันต่างกันได้ตามภาษา** โดยไม่มีอะไรผิดสักบรรทัด
--   · และ `locale` วันนี้ **nullable** (แถวที่ยังไม่มีชื่อท้องถิ่น) — `null` อยู่ใน PK ไม่ได้
--
-- 🔴 **หลักฐานว่าสคีมาเดิมเจ็บจริง ไม่ใช่ความสวยงามเชิงทฤษฎี** — `app/api/place-name/route.ts:27`
--    เขียนไว้เองว่า *"จงใจไม่เก็บลง `place_details_cache`"* เพราะ `name_local`/`locale`
--    เก็บได้ภาษาเดียวต่อแถว · `backfillLocalName()` (`place-details/route.ts:89`) **`update` ทับ**
--    ทุกครั้งที่ขอคนละภาษา → ขอ `en` ทีนึง ชื่อเกาหลีที่ `/today` ใช้หายทันที
--    **มีทั้ง route ที่ยอมไม่ใช้แคชเลยเพื่อเลี่ยงอาการนี้** = ราคาที่จ่ายอยู่แล้ววันนี้
--
-- 🎯 แตกเป็น 2 ใบ ตอบทั้งสองคำตอบโดยไม่ต้องทิ้งข้อไหน: ข้อเท็จจริงกลางอยู่ใบบน
--    ชื่อต่อภาษาอยู่ใบนี้ · `E2-AC6` ยังตอบครบทุกคอลัมน์ **ไม่มีคอลัมน์ไหนหายไป**
--
-- ⚠️ **ไม่มี FK ไปหา `place_details_cache` โดยตั้งใจ** — สองใบนี้เป็นแคชอิสระที่บังเอิญ
--    คีย์ด้วยสตริงเดียวกัน · มี FK เมื่อไหร่ `/api/place-name` จะขอชื่ออย่างเดียวไม่ได้
--    ต้องไปยิง Google ขอ details ครบชุดก่อน **ซึ่งคือค่าใช้จ่ายที่เราเพิ่งพยายามเลี่ยง**
create table public.place_details_local_cache (
  maps_query    text not null check (length(maps_query) between 1 and 500),
  -- รูปแบบ BCP-47 อย่างย่อ ไม่ใช่ allowlist ภาษา — แพลตฟอร์มหลายประเทศจะเพิ่มภาษาเรื่อย ๆ
  -- แต่คีย์ต้องมีขอบเขต ไม่งั้น client ที่ส่งอะไรก็ได้จะทำให้แคชแตกเป็นล้านแถว
  locale        text not null check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  name_local    text,
  address_local text,
  fetched_at    timestamptz not null default now(),
  primary key (maps_query, locale)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. `place_photo_cache`
-- ───────────────────────────────────────────────────────────────────────────
create table public.place_photo_cache (
  maps_query  text primary key check (length(maps_query) between 1 and 500),
  photo_names text[] not null default '{}',
  fetched_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. `travel_time_cache` — ตารางที่ `P-33` เริ่มต้นจากมัน
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **ไม่มี `trip_id` โดยตั้งใจ และข้อนั้นยังถูกอยู่** — เวลาเดินทางระหว่างสองจุดเป็นความจริงกลาง
--    ใช้ซ้ำข้ามทริปได้และ**ควร**ใช้ซ้ำ · สิ่งที่ผิดไม่ใช่การไม่มี `trip_id`
--    **สิ่งที่ผิดคือคีย์ของแคชกลายเป็นข้อมูลส่วนตัว ซึ่งไม่มีใครต้องตัดสินใจให้มันเกิด**
--    (ทีมเลิกใช้ `leg_id` เป็นคีย์เพราะบั๊ก `9.1` แล้วเปลี่ยนมาคีย์ด้วยพิกัด ซึ่งแก้บั๊กนั้นได้จริง)
create table public.travel_time_cache (
  from_place_id    text not null check (length(from_place_id) between 1 and 500),
  to_place_id      text not null check (length(to_place_id)   between 1 and 500),
  -- ⚠️ `trip_stops.travel_mode` วันนี้**ไม่มี check** — ตัวนี้มีเพราะมันเป็นชิ้นส่วนของ PK
  --    ในตารางที่ใช้ร่วมกันทั้งระบบ · ความต่างนี้ตั้งใจ ไม่ใช่หลงลืม
  travel_mode      text not null check (travel_mode in ('walk', 'transit', 'drive')),
  duration_minutes integer not null check (duration_minutes >= 0),
  distance_meters  integer check (distance_meters is null or distance_meters >= 0),
  fetched_at       timestamptz not null default now(),
  primary key (from_place_id, to_place_id, travel_mode)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. สิทธิ์ — ปฏิเสธทุกทางสำหรับ client · `P-33`
-- ───────────────────────────────────────────────────────────────────────────
-- `revoke` ต้องมาคู่กับ RLS ไม่ใช่แทนกัน: default privileges ของ Supabase แจก `all` ให้
-- `anon`/`authenticated` ทุกตารางใน `public` อัตโนมัติ **ตอน `create table` นี้เอง**
-- → ถ้ามีแต่ RLS + ศูนย์ policy จะยังเป็น "ปฏิเสธเพราะไม่มี policy" ชั้นเดียว
--   ถ้ามีแต่ `revoke` จะไม่มี RLS รองเมื่อวันหนึ่งมีคน grant กลับ · **ต้องมีทั้งคู่**
revoke all on public.place_details_cache       from public, anon, authenticated;
revoke all on public.place_details_local_cache from public, anon, authenticated;
revoke all on public.place_photo_cache         from public, anon, authenticated;
revoke all on public.travel_time_cache         from public, anon, authenticated;

alter table public.place_details_cache       enable row level security;
alter table public.place_details_local_cache enable row level security;
alter table public.place_photo_cache         enable row level security;
alter table public.travel_time_cache         enable row level security;

-- 🔴 **ไม่มี `create policy` ในไฟล์นี้เลยสักบรรทัด และนั่นคือของที่ต้องตรวจว่ายังจริง**
--    ใครเติม policy ให้ `authenticated` บน 4 ตารางนี้ = เปิด `P-33` กลับมาทั้งข้อ
--    → ถ้าต้องให้เซิร์ฟเวอร์เข้าถึง ไปตอบ `Q3` ก่อน อย่าเติม policy ที่นี่

-- ── ข้อยกเว้นที่ 5 (P1 อนุมัติ 25 ส.ค. 2026 · branch `platform` เท่านั้น) ────
-- **ขอบเขต: ให้ชุดทดสอบวาง fixture ของตัวเองแล้วเก็บกวาด เท่านั้น**
-- 🎯 **เหตุผลที่ต้องมี `insert` ต่างจากข้อยกเว้นที่ 2/4 ซึ่งขอแค่ `select, delete`:**
--    เคส "C อ่านแคชไม่ได้" บนตาราง**ว่าง** ผ่านฉลุยโดยไม่ได้ทดสอบอะไรเลย —
--    คือกับดักข้อ 3 ที่ `rlsMatrix.test.ts` เขียนเตือนตัวเองไว้ (**เคสด้านลบล้วน**)
--    ต้องมีแถวอยู่จริงก่อน ถึงจะแปลว่า "อ่านไม่เห็น" ไม่ใช่ "ไม่มีอะไรให้เห็น"
--    · และ client เขียนแถวนั้นไม่ได้เลยตามนิยามของไฟล์นี้ → เหลือทางเดียวคือ `service_role`
-- 🔴 **ไม่ให้ `update`** — ชุดทดสอบวางแล้วลบ ไม่มีเคสไหนแก้แถวเดิม
--    · และ `service_role` มี **BYPASSRLS** โดยนิยาม → grant คือด่านสุดท้ายที่เหลือ ไม่มี policy มาช่วยอีกชั้น
grant select, insert, delete on public.place_details_cache       to service_role;
grant select, insert, delete on public.place_details_local_cache to service_role;
grant select, insert, delete on public.place_photo_cache         to service_role;
grant select, insert, delete on public.travel_time_cache         to service_role;

comment on table public.place_details_cache is
  'ชั้น ③ แคชฝั่งเซิร์ฟเวอร์ · P-33: client แตะไม่ได้ทั้ง 4 verb โดยตั้งใจ '
  'ห้ามเติม policy ให้ authenticated — ไปตอบ Q3 ก่อน';
comment on table public.place_details_local_cache is
  'D77 — ครึ่งที่ผูกกับภาษาของ place_details_cache · PK (maps_query, locale) '
  'ชั้น ③ · client แตะไม่ได้ทั้ง 4 verb (P-33)';
comment on table public.place_photo_cache is
  'ชั้น ③ แคชฝั่งเซิร์ฟเวอร์ · P-33: client แตะไม่ได้ทั้ง 4 verb โดยตั้งใจ';
comment on table public.travel_time_cache is
  'ชั้น ③ · P-33 เริ่มจากตารางนี้: from_place_id เก็บ hotel@{lat},{lng} = พิกัดที่พักผู้ใช้ '
  'ไม่มี trip_id โดยตั้งใจ (ใช้ซ้ำข้ามทริป) · client แตะไม่ได้ทั้ง 4 verb';

commit;
