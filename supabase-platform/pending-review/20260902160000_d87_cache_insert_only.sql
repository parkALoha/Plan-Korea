-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ 🔴 ยังไม่ย้ายเข้า `supabase/migrations/` — ด่านผ่านแล้ว แต่ *เทสต์* ยังไม่ผ่าน │
-- └─────────────────────────────────────────────────────────────────────────────┘
-- (P1 · 2 ก.ย. 2026 · หลัง P6 แก้ `cache-lockdown` ใน `08cac2a` ให้ไฟล์นี้ผ่าน)
--
-- ## ทำไมไฟล์นี้เคย "ผ่านทุกอย่าง" ทั้งที่งานยังไม่ครบ
-- policy 6 ตัวข้างล่างเคยตั้งชื่อเป็นสตริงมีช่องว่าง (`"auth reads travel time cache"`)
-- · `policyMapOrdered()` ใน `schemaPins.test.ts:95` จับชื่อด้วย `(\S+)` → **ชื่อที่มีช่องว่าง
--   ไม่ match เลย** → พินทุกตัวในไฟล์นั้นมองไม่เห็น policy พวกนี้ → **เขียวเพราะไม่ถูกมอง**
-- 🎯 เปลี่ยนชื่อเป็นแบบเดียวกับทั้งรีโป (`<table>_<verb>`) แล้วพินเห็นทันที และ **แดง 3 ตัว**
--    · ตัวเลข `0-policy` ขยับ `4/4 → 1/1` — นั่นคือหลักฐานว่าพินเห็นจริง ไม่ใช่แค่แดงเฉย ๆ
--
-- ## งานที่เหลือจริง (พินเขียนเองว่า "นี่คือรายการงานที่เหลือ ไม่ใช่บั๊ก")
--   ① `rlsMatrix.test.ts` — ต้องมีเคสยิงถึง **6 คู่ (ตาราง, verb)** ที่ policy พวกนี้เปิด
--      place_details_cache {select,insert} · place_photo_cache {select,insert}
--      travel_time_cache {select,insert}
--   ② `schemaPins.test.ts` — รายชื่อ policy (63 → 69) + fingerprint เงื่อนไข ต้องไล่กิ่งก่อนอัปเดต
--   ③ แล้วค่อยรัน migration นี้ (ต้องได้อนุมัติจากผู้ใช้ — แตะฐานด้วย credential จริง)
-- ⚠️ ①② อยู่โซน P4 · ③ เป็นสิทธิ์ของผู้ใช้เท่านั้น — **ไม่ใช่ของที่ P1 เดินต่อคนเดียวได้**
--
-- 🔴 ห้ามย้ายไฟล์นี้เข้า `migrations/` ก่อน ① เสร็จ — `schemaPins` อ่าน *ไฟล์* ไม่ใช่ฐาน
--    ย้ายเมื่อไหร่ หัว branch แดงให้ทั้ง 8 เซสชันทันที โดยที่ฐานยังไม่ถูกแตะสักแถว

-- `D87` — แคชสามใบ: ให้ผู้ใช้ที่ล็อกอินแล้ว **เขียนได้ แต่ทับของเดิมไม่ได้**
-- เจ้าของ: P1-Lead · 2 ก.ย. 2026 · **ผู้ใช้ตัดสินทางเลือกที่ ③ ด้วยตัวเอง**
--
-- ## 🔴 สภาพก่อนหน้า — ทางตัน ไม่ใช่บั๊ก
--   revoke all … from public, anon, authenticated        ← ไม่มี role ฝั่งผู้ใช้แตะได้
--   grant select, insert, delete … to service_role        ← เหลือ service_role · และ **ไม่มี update**
--   RLS เปิดอยู่ แต่ **ไม่มี policy สักตัว**               ← แม้มี grant ก็ยังไม่ผ่าน
--   route ทั้งสามใช้ client ที่ถือคีย์ anon
--   `E3-AC9` ③ ห้ามโค้ดที่เสิร์ฟผู้ใช้แตะ service role key
-- 🎯 **role เดียวที่มีสิทธิ์ คือ role เดียวที่ห้ามใช้** → อ่านล้ม เขียนล้ม ยิง Google ทุกครั้ง
--    · ความล้มถูกกลืนโดย `noteCacheFailure` → **ไม่มีใครเห็นว่าแคชตายมา 8 วัน**
--
-- ## ทางที่ผู้ใช้เลือก (③) และทำไมไม่ใช่ ① หรือ ②
--   ① ให้เขียนทับได้     → ใครก็เขียนค่าผิดทับของคนอื่นได้ตลอดเวลา
--   ② งานเบื้องหลังอย่างเดียว → ต้องสร้างระบบใหม่ · คนแรกยังต้องรอ Google อยู่ดี
--   ③ **เขียนได้ ทับไม่ได้**  → ความเสียหายจำกัดที่ "ต้องเป็นคนแรก" ซึ่งควบคุมยากกว่ามาก
-- ✅ **และ ③ คือรูปที่เว็บทริปจริงใช้อยู่แล้ว** (`main` · `0010_travel_time_cache.sql:15-20`)
--    `for select using (true)` + `for insert with check (true)` · ใช้งานมาตลอดโดยไม่มีปัญหา
--    → **ไม่ใช่การออกแบบใหม่ เป็นการเอาของที่พิสูจน์แล้วมาใช้**
--
-- ## 🔴 ให้ `authenticated` เท่านั้น ไม่ให้ `anon`
-- ต่างจาก `main` ที่ให้ทุกคน — ที่นั่นมีประตู PIN อยู่ข้างหน้า ที่นี่ไม่มี
-- · แปลว่า **route ต้องเลิกใช้ client ที่ถือคีย์ anon** ไม่งั้น grant นี้ไม่มีผล (แก้ในโค้ดคู่กัน)
-- · ผู้เยี่ยมชมที่ไม่ล็อกอินยังเรียก route ได้ แต่ **เขียนแคชไม่ลง** → เสื่อมเท่าสภาพวันนี้ ไม่แย่ลง
--
-- ## ⚠️ ไม่ให้ `update` และไม่ให้ `delete` โดยตั้งใจ
-- · `update` = ทับของเดิม ซึ่งเป็นสิ่งที่ทางเลือก ③ ปฏิเสธ
-- · `delete` = ลบของคนอื่น · การล้างแคชเป็นงานของ `service_role` (มี grant อยู่แล้ว)
-- 🔴 **แปลว่าโค้ดต้องเลิกใช้ `.upsert()`** — `upsert` ต้องการ `update` เมื่อชนคีย์
--    → เปลี่ยนเป็น `.insert()` ที่ยอมให้ชนแล้วข้าม (แก้ในโค้ดคู่กัน) · **ถ้าลืม จะได้ 403 ตอนชนคีย์**
--
-- ## 📌 ค่าที่ผิดจะค้าง — ราคาที่ยอมรับแล้ว
-- ไม่มีใครทับได้ = ถ้าเขียนค่าผิดครั้งแรก มันอยู่จนกว่า `service_role` จะลบ
-- **นี่คือด้านกลับของสิ่งที่ ③ ซื้อมา ไม่ใช่ของที่ลืมคิด**

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · คัดลอกทั้งก้อน ไม่แก้อะไร ──────────────────────────
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
    where name = 'engine-dev' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev (ตรวจ name+ref+environment)';
  end if;
end $guard$;

-- ── grant: อ่านได้ · เพิ่มได้ · **ทับไม่ได้ ลบไม่ได้** ─────────────────────────
grant select, insert on public.place_details_cache to authenticated;
grant select, insert on public.place_photo_cache   to authenticated;
grant select, insert on public.travel_time_cache   to authenticated;

-- ── policy: RLS เปิดอยู่ → grant อย่างเดียวไม่พอ ต้องมี policy ด้วย ───────────
-- 🔴 แคชสามใบนี้ **ไม่มีข้อมูลของผู้ใช้สักคอลัมน์** — เป็นข้อเท็จจริงสาธารณะจาก Google
--    (เวลาเดินทางระหว่างสองจุด · เวลาเปิด-ปิดร้าน · รหัสรูป) → `using (true)` จึงไม่ได้เปิดอะไรของใคร
--    ⚠️ **ถ้าวันหนึ่งมีคอลัมน์ที่ผูกกับผู้ใช้ ต้องกลับมาแก้ policy นี้ทันที** — เหตุผลข้างบนจะหมดอายุ
create policy travel_time_cache_select        on public.travel_time_cache   for select to authenticated using (true);
create policy travel_time_cache_insert        on public.travel_time_cache   for insert to authenticated with check (true);
create policy place_details_cache_select      on public.place_details_cache for select to authenticated using (true);
create policy place_details_cache_insert      on public.place_details_cache for insert to authenticated with check (true);
create policy place_photo_cache_select        on public.place_photo_cache   for select to authenticated using (true);
create policy place_photo_cache_insert        on public.place_photo_cache   for insert to authenticated with check (true);

do $verify$
declare n int;
begin
  -- 🔴 เกณฑ์เชิงผลลัพธ์ ไม่ใช่ "คำสั่งรันผ่าน" — และ **ห้ามมี update/delete หลุดเข้ามา**
  select count(*) into n
    from information_schema.role_table_grants
   where grantee = 'authenticated'
     and table_name in ('place_details_cache','place_photo_cache','travel_time_cache')
     and privilege_type in ('UPDATE','DELETE');
  if n > 0 then
    raise exception '🔴 authenticated ได้ update/delete บนแคช % รายการ — ขัดกับทางเลือก ③ ที่ผู้ใช้เลือก', n;
  end if;

  select count(*) into n
    from information_schema.role_table_grants
   where grantee = 'authenticated'
     and table_name in ('place_details_cache','place_photo_cache','travel_time_cache')
     and privilege_type in ('SELECT','INSERT');
  if n <> 6 then
    raise exception 'คาด select+insert 6 รายการ (3 ตาราง × 2) ได้ % — ไม่ครบ', n;
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename in ('place_details_cache','place_photo_cache','travel_time_cache');
  if n <> 6 then
    raise exception 'คาด policy 6 ใบ ได้ % — grant ผ่านแต่ policy ไม่ครบ = ยังเขียนไม่ลง', n;
  end if;

  raise notice 'D87: grant select+insert 6 · policy 6 · update/delete 0 — ครบตามทางเลือก ③';
end $verify$;

commit;
