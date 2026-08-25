-- ═══════════════════════════════════════════════════════════════════════════
-- ข้อยกเว้นที่ 5 ให้จริงตามที่เขียน — `service_role` มี **TRUNCATE** บนแคชโดยไม่มีใครให้
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · เจอด้วย `table_exposure()` ฉบับ 2 ที่ P4 บังคับให้แก้
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── เจอได้ยังไง ────────────────────────────────────────────────────────────
-- `table_exposure` ฉบับแรกตรวจแค่ `anon`/`authenticated` (ช่อง ② ที่ P4 ยิงพิสูจน์)
-- พอเปลี่ยนมาอ่านจาก `aclexplode()` **role ทุกตัวโผล่มาเอง** — และสิ่งแรกที่โผล่คือของผมเอง:
-- ```
-- place_details_cache  7 : DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE
--                                          ^^^^^^^^ ^^^^^^^^^^ ^^^^^^^ ^^^^^^^^
--                                          ไม่มีใครให้ · ไม่มีข้อยกเว้นข้อไหนพูดถึง
-- ```
-- 🎯 **`select, insert, delete` ที่ผมเขียนถูกต้อง — แต่ผมไม่เคย `revoke` จาก `service_role` ก่อน**
--    บรรทัดเดิมคือ `revoke all … from public, anon, authenticated` · **`service_role` ไม่อยู่ในนั้น**
--    → มันเก็บสิทธิ์พื้นฐาน 4 ตัวที่ Supabase ให้มาแต่แรกไว้ทั้งชุด
--
-- ⚠️ **และผมเกือบตีความผิดซ้ำ:** เห็นเลข `7` แล้วสรุปว่า *"ได้ `ALL`"* — **ไม่จริง**
--    `ALL` คือ **8** (มี `UPDATE` ด้วย) ซึ่งเห็นได้จาก `catalog_*` ที่ตั้งใจให้ 4 verb
--    **`UPDATE` ไม่ได้หลุด** · ของที่หลุดคือ 4 ตัวที่ไม่ใช่ DML — และตัวที่สำคัญคือ **`TRUNCATE`**
--
-- ── ทำไม `TRUNCATE` ถึงต้องถอน ไม่ใช่ปล่อยเพราะ "ก็ไม่มีใครเรียก" ────────────
-- `TRUNCATE` **ข้าม RLS · ข้าม policy · ข้าม `force row level security` · ไม่ยิง row trigger**
-- → **ลบทั้งตารางในคำสั่งเดียวโดยไม่มีด่านไหนของเราขวางเลยสักชั้น**
-- ขอบเขตของข้อยกเว้นที่ 5 เขียนว่า *"ให้ชุดทดสอบวาง fixture แล้วเก็บกวาด"* — **`TRUNCATE` ไม่ใช่การเก็บกวาด fixture**
-- 🔴 และมันคือรูปเดิมของสิ่งที่ทีมนี้ไล่ปิดกันทั้งวัน: **ขอบเขตที่เขียนไว้ กับสิทธิ์ที่มีจริง ไม่ตรงกัน
--    โดยไม่มีใครโกหกสักคน** — ต่างกันที่รอบนี้ **ตัววัดเป็นคนบอก ไม่ใช่คนอ่านเจอ**
--
-- ── 🔴 ของที่ไฟล์นี้ *ไม่* แก้ และต้องพูดออกมา ─────────────────────────────
-- **อีก 18 ตารางมีสิทธิ์พื้นฐานชุดเดียวกันอยู่ทั้งหมด** (`MAINTAIN` `REFERENCES` `TRIGGER` `TRUNCATE`)
-- รวม `trips` · `bookings` · `trip_stops` — **ข้อยกเว้นที่ 2/3/4 ก็ไม่ตรงกับของจริงแบบเดียวกัน**
-- 🔴 **ผมไม่แก้ให้ในไฟล์นี้โดยตั้งใจ** — ตารางพวกนั้นมีชุดทดสอบของ P4 พึ่งอยู่ และการถอนสิทธิ์
--    ข้ามโซนโดยไม่ถามคือสิ่งที่ `TEAM.md` ห้ามไว้ · **ส่งให้ P4 + P6 ตัดสินพร้อมกันทีเดียว**
--    · แคช 4 ใบแก้ได้ทันทีเพราะ **เพิ่งลงวันนี้ ยังไม่มีใครพึ่งมันนอกจากเคสที่ผมกับ P4 เพิ่งเขียน**
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   grant truncate, references, trigger, maintain on public.place_details_cache to service_role; (และอีก 3 ใบ)
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
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- `revoke all` ก่อน แล้ว `grant` เฉพาะที่ข้อยกเว้นที่ 5 ระบุ — **ลำดับนี้สำคัญ**
-- `grant` อย่างเดียวเป็นการ *เพิ่ม* ไม่ใช่การ *กำหนด* · ซึ่งคือรากของบั๊กนี้ทั้งข้อ
revoke all on public.place_details_cache       from service_role;
revoke all on public.place_details_local_cache from service_role;
revoke all on public.place_photo_cache         from service_role;
revoke all on public.travel_time_cache         from service_role;

grant select, insert, delete on public.place_details_cache       to service_role;
grant select, insert, delete on public.place_details_local_cache to service_role;
grant select, insert, delete on public.place_photo_cache         to service_role;
grant select, insert, delete on public.travel_time_cache         to service_role;

-- ตรวจในทรานแซกชันเดียวกัน — **ขอบเขตที่เขียนไว้ ต้องเท่ากับสิทธิ์ที่มีจริง เป๊ะ**
do $verify$
declare t text; got text[]; want text[] := array['DELETE','INSERT','SELECT'];
begin
  foreach t in array array['place_details_cache','place_details_local_cache',
                           'place_photo_cache','travel_time_cache'] loop
    select array_agg(a.privilege_type::text order by a.privilege_type)
      into got
      from pg_catalog.pg_class c
      cross join lateral aclexplode(c.relacl) a
     where c.relnamespace = 'public'::regnamespace
       and c.relname = t
       and a.grantee = 'service_role'::regrole::oid;
    if got is distinct from want then
      raise exception 'ข้อยกเว้นที่ 5 ไม่ตรงกับของจริงบน %: ได้ % ต้องการ %', t, got, want;
    end if;
  end loop;
end $verify$;

commit;
