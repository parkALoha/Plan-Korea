-- ═══════════════════════════════════════════════════════════════════════════
-- E2 — `catalog_countries.supported`: กันคลังทดสอบไม่ให้โผล่ในช่องเลือกจุดหมาย
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── บั๊กที่ไฟล์นี้ปิด — เจอตอนทำงานที่ผู้ใช้สั่งคนละเรื่อง ───────────────────
-- ผู้ใช้ขอให้ **แบ่งเมืองปลายทางตามประเทศ** ในฟอร์มสร้างทริป · พอผมยิงค้นจริงเพื่อดูว่า
-- ข้อมูลพอไหม ก็เจอว่า `q="อ"` คืน **เมืองชื่อ "เมืองC" 8 แถว จากประเทศชื่อ "ทดสอบสาม"**
--
--   เมืองในฐานทั้งหมด            : 1,736
--   เมืองของ 4 ประเทศที่รองรับจริง :    42
--   🔴 เมือง fixture ที่ผู้ใช้ค้นเจอได้ : 1,694  (98% ของคลัง)
--
-- 🎯 **และการแบ่งกลุ่มตามประเทศทำให้มันแย่ลง ไม่ใช่ดีขึ้น** — ก่อนแบ่ง fixture ปนอยู่ในลิสต์เดียว
--    หลังแบ่ง มันจะได้ **หัวข้อกลุ่มเป็นของตัวเองชื่อ "ทดสอบสาม" · "ทดสอบเจ็ด"** อยู่กลางหน้าจอผู้ใช้
--    · งานที่ผู้ใช้สั่งจึงเป็นตัวที่ทำให้บั๊กนี้มองเห็นได้ ไม่ใช่ตัวที่ทำให้เกิด
--
-- ── ทำไมเป็นคอลัมน์ ไม่ใช่ลิสต์รหัสในโค้ด ────────────────────────────────
--   ทางที่ปฏิเสธ ① **กรองรหัสทดสอบออก (denylist)** — `TEST_COUNTRY_CODES` อยู่ใน
--     `lib/__tests__/_helpers.ts` ซึ่งโค้ดที่เสิร์ฟผู้ใช้ import ไม่ได้ และไม่ควรได้
--     · และมันเป็น denylist: **รหัสทดสอบตัวใหม่ที่ยังไม่มีใครจด จะรั่วทันที**
--     · ฐานวันนี้พิสูจน์แล้วว่าเกิดจริง — `_helpers.ts` จด `zz zy zx zw xq zv` แต่ในฐานมี
--       `xt zs zt` ที่ **ไม่อยู่ในทะเบียนเลย** · denylist ตามของจริงไม่ทัน
--   ทางที่ปฏิเสธ ② **allowlist `('th','jp','kr','vn')` ในโค้ด** — เป็นแหล่งความจริงที่สอง
--     คู่กับ `coverAssets.test.ts` ที่ถือลิสต์เดียวกันอยู่แล้ว · สองที่ต้อง sync มือ (`D48`)
--
--   ✅ **ที่เลือก: คอลัมน์ `supported boolean not null default false`**
--   🔴 **`default false` คือหัวใจทั้งหมดของการออกแบบนี้ ไม่ใช่รายละเอียด:**
--      ประเทศใหม่ **มองไม่เห็นจนกว่าจะมีคนตั้งใจเปิด** → fixture ที่ชุดทดสอบสร้างขึ้นกลางคัน
--      ถูกกันโดยอัตโนมัติ **โดยที่ไม่มีเทสต์ไหนต้องจำอะไรเลย**
--      · เทียบกับ `default true`: fixture ทุกตัวรั่ว และเราจะรู้ตอนผู้ใช้เห็น
--      · เทียบกับ denylist: ต้องมีคนจดรหัสใหม่ทุกครั้ง — ซึ่งวันนี้พิสูจน์แล้วว่าไม่เกิดขึ้นจริง
--
-- ── ⚠️ สิ่งที่คอลัมน์นี้ **ไม่ใช่** ──────────────────────────────────────
--   **ไม่ใช่สิทธิ์** — `authenticated` ยังอ่านทุกแถวได้เหมือนเดิม policy ไม่เปลี่ยนสักตัว
--   มันคือ **ขอบเขตผลิตภัณฑ์** ที่ชั้น API เอาไปกรองการ *ค้นหา* เท่านั้น
--   🔴 **ห้ามเอาไปกรองการ *แก้ไข* (resolve by id)** — ทริปที่มีอยู่ต้องเปิดได้ต่อ
--   แม้วันหนึ่งเราจะถอดประเทศออกจากขอบเขต · ปิดการค้น ≠ ทำให้ข้อมูลเก่าพัง
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   alter table public.catalog_countries drop column supported;
--   ⚠️ ต้องถอด `.eq("catalog_countries.supported", true)` ใน `lib/engine/db.ts` พร้อมกัน
--      ไม่งั้น `searchCatalogCities` จะ 502 ทุกคำขอ
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

alter table public.catalog_countries
  add column if not exists supported boolean not null default false;

comment on column public.catalog_countries.supported is
  'ประเทศนี้อยู่ในขอบเขตที่ผลิตภัณฑ์รองรับหรือยัง — ชั้น API ใช้กรอง *การค้นหา* เท่านั้น '
  'ไม่ใช่สิทธิ์ และห้ามใช้กรองการ resolve ข้อมูลเดิม · default false โดยตั้งใจ: '
  'ประเทศใหม่ (รวม fixture ของชุดทดสอบ) มองไม่เห็นจนกว่าจะมีคนตั้งใจเปิด';

-- ขอบเขตที่ผู้ใช้ตัดสิน 27 ส.ค. 2026: ไทย · ญี่ปุ่น · เกาหลี · เวียดนาม
update public.catalog_countries set supported = true where id in ('th', 'jp', 'kr', 'vn');

do $verify$
declare n_on int; n_off int; n_city_on int;
begin
  select count(*) into n_on  from public.catalog_countries where supported;
  select count(*) into n_off from public.catalog_countries where not supported;
  if n_on <> 4 then raise exception 'ประเทศที่เปิด % ไม่ใช่ 4', n_on; end if;

  -- 🔴 เคสนี้ต้องล้มถ้ามีคนเผลอเปิด fixture — **ไม่ใช่แค่ "นับได้ 4"**
  if exists (select 1 from public.catalog_countries
              where supported and id not in ('th','jp','kr','vn')) then
    raise exception 'มีประเทศนอกขอบเขตถูกเปิด supported';
  end if;

  -- 🔴 **เคสที่พิสูจน์ว่ามันแก้ปัญหาจริง ไม่ใช่แค่คอลัมน์ถูกเพิ่ม**
  --    ก่อนไฟล์นี้: เมืองที่ค้นเจอได้ 1,736 · หลังไฟล์นี้ต้องเหลือเฉพาะของ 4 ประเทศ
  --    ⚠️ ไม่ปักเลข 42 ตายตัว — คลังโตได้ทุกวัน · ปักว่า **ไม่มีเมืองของประเทศที่ปิดหลุดมา**
  select count(*) into n_city_on
    from public.catalog_cities c
    join public.catalog_countries n on n.id = c.country_id
   where n.supported;
  if n_city_on = 0 then raise exception 'ไม่มีเมืองของประเทศที่รองรับเลย — ค้นแล้วจะว่างทั้งหมด'; end if;
  if exists (
    select 1 from public.catalog_cities c
    join public.catalog_countries n on n.id = c.country_id
     where n.supported and n.id not in ('th','jp','kr','vn')
  ) then raise exception 'เมืองของประเทศนอกขอบเขตยังค้นเจอได้'; end if;

  raise notice 'supported: เปิด % ประเทศ · ปิด % ประเทศ · เมืองที่ค้นเจอได้ %', n_on, n_off, n_city_on;
end $verify$;

commit;
