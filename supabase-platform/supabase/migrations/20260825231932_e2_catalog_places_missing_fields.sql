-- ═══════════════════════════════════════════════════════════════════════════
-- `P-58` — คลังกลางเก็บ 4 ฟิลด์ของ `data/places.ts` ไม่ได้ · **แต่คลังของผู้ใช้เก็บได้ 3**
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026 · ต่อจาก `P-57` — คลาสเดียวกัน คนละไฟล์
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── วิธีที่เจอ — ไล่ `Place` ใน `data/places.ts` เทียบคอลัมน์จริงในฐาน ───────
-- `P-57` แสดงว่า `column-map.md` แมป *ตาราง DB 14 ใบ* และ **โครงของทริปที่อยู่ในไฟล์ ไม่มีใครแมป**
-- → ไล่ไฟล์ที่สองในคลาสเดียวกัน: `data/places.ts` (**72 ที่คัดสรร** · `B6` สั่งให้หายไปเหมือนกัน)
--
-- ```
--                    catalog_places   custom_places   ใช้กี่จุดในโค้ด
--   maps_query            ❌              ✅              12
--   description           ❌              ✅               8   (`descriptionTh`)
--   google_place_id       ❌              ✅              16
--   youtube_query         ❌              ❌               7
-- ```
--
-- 🎯 **ข้อที่ชี้ขาดว่ามันเป็นความพลาด ไม่ใช่การตัดสินใจ:**
--    **`custom_places` (สถานที่ที่ *ผู้ใช้* เพิ่มเอง) เก็บได้ 3 ใน 4 · `catalog_places` (คลัง *ที่เราคัด*) เก็บไม่ได้เลย**
--    ทั้งที่ 72 ที่ในไฟล์**มีครบทุกตัว** และคลังคือที่ที่มันต้องไปอยู่
--    → คลังถูกสร้างโดยลอกบางส่วนของ `custom_places` มา **โดยไม่มีใครเทียบกับ `data/places.ts` ซึ่งเป็นต้นทางจริง**
--
-- ── 🔴 `maps_query` เป็นตัวที่หนักที่สุด และมันต่อกับงานที่ผมเพิ่งลงวันนี้ ────
-- `lib/placeQuery.ts:17` เขียนไว้เองว่า `mapsQuery` คือ **คีย์ของ `place_details_cache` และ `place_photo_cache`**
-- → **แคช 2 ใบที่ผมสร้างเมื่อเช้า คีย์ด้วยค่าที่คลังกลางเก็บไม่ได้**
--    ไม่มีใครสะดุด เพราะ **ยังไม่มีโค้ดไหนอ่านคลังจริง** — `E5` จะเป็นคนเจอ ถ้าไม่เจอวันนี้
--
-- ── ⚠️ `description` — เพิ่มโดยรู้ตัวว่ามีข้อจำกัดที่ *ไม่ได้* เกิดจากไฟล์นี้ ──
-- `custom_places.description` เป็น **คอลัมน์เดียว ภาษาเดียว** อยู่แล้ว · ไฟล์นี้แค่ทำให้คลัง**สมมาตรกับมัน**
-- 🔴 **ไม่ได้แปลว่าข้อจำกัดนั้นถูก** — ต่างจาก `catalog_place_names` ที่แยก locale เป็นแถว
--    **คำบรรยายไทยของที่เที่ยวเกาหลี ใช้กับผู้ใช้ที่ไม่ได้อ่านไทยไม่ได้** และแพลตฟอร์มตั้งใจรับหลายประเทศ
--    → เปิดเป็น **`Q6`** · **ถ้าตัดสินว่าต้องแยก locale มันต้องแยกทั้งสองตาราง ไม่ใช่แค่ตารางนี้**
--    · เลือกเพิ่มตอนนี้เพราะ **ไม่เพิ่ม = ข้อมูลหายตอน `E7` แน่นอน** · เพิ่ม = เสียแค่การย้ายทีหลัง
--
-- ── ทำไมไม่เพิ่ม `youtube_query` ให้ `custom_places` ด้วย ──────────────────
-- `youtubeQuery` เป็นค่าที่ **เราคัดมาให้** ไม่ใช่ของที่ผู้ใช้กรอกตอนเพิ่มสถานที่ระหว่างทาง
-- **เพิ่มคอลัมน์ที่ไม่มีใครเขียน คือของที่ P7 ค้านไว้แล้วตอน `client_edited_at`** — ไม่เพิ่ม
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   alter table public.catalog_places drop column maps_query, drop column description,
--                                     drop column google_place_id, drop column youtube_query;
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

alter table public.catalog_places
  add column maps_query      text,
  add column description     text,
  add column google_place_id text,
  add column youtube_query   text;

comment on column public.catalog_places.maps_query is
  'P-58 — คีย์ที่ใช้ยิง Google และเป็น **คีย์ของ place_details_cache / place_photo_cache** (lib/placeQuery.ts:17) '
  'ไม่มีคอลัมน์นี้ = แคช 2 ใบคีย์ด้วยค่าที่คลังเก็บไม่ได้';
comment on column public.catalog_places.description is
  'P-58 — `descriptionTh` เดิม · **ภาษาเดียว สมมาตรกับ custom_places.description** '
  '🔴 ข้อจำกัดนี้เป็นของเดิม ไม่ใช่ของที่ไฟล์นี้สร้าง — ถ้าตัดสินว่าต้องแยก locale (Q6) ต้องแยกทั้งสองตาราง';
comment on column public.catalog_places.google_place_id is
  'P-58 — มีค่าเมื่อไหร่ใช้ระบุตัวสถานที่แทนการค้นด้วยชื่อเสมอ (lib/placeQuery.ts)';
comment on column public.catalog_places.youtube_query is
  'P-58 — คลิปแนะนำที่ของ PLAN.md §1 · เป็นค่าที่เราคัดมาให้ ไม่ใช่ของที่ผู้ใช้กรอก '
  'จึงไม่เพิ่มให้ custom_places (คอลัมน์ที่ไม่มีใครเขียน = ของที่ P7 ค้านไว้แล้ว)';

-- `catalog_places` ให้ `authenticated` **ระดับตาราง** (`…134043:180`) → คอลัมน์ใหม่ถูกครอบเอง
-- ตรวจในทรานแซกชันเดียวกัน **ไม่เชื่อว่ามันครอบ — ถามฐาน**
do $verify$
declare missing text[];
begin
  select array_agg(c) into missing
    from unnest(array['maps_query','description','google_place_id','youtube_query']) c
   where not pg_catalog.has_column_privilege('authenticated', 'public.catalog_places', c, 'SELECT');
  if missing is not null then
    raise exception 'authenticated อ่านคอลัมน์ใหม่ไม่ได้: % — grant เป็นระดับคอลัมน์ ไม่ใช่ระดับตาราง', missing;
  end if;
end $verify$;

commit;
