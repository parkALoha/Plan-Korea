-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ ⚠️ อ่านให้จบก่อนรัน — ไฟล์นี้เคยเปิดรูรั่วจริง และเพิ่งถูกปิดวันเดียวกัน (P1 · 2 ก.ย.) ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- **สถานะ: ปิดครบแล้ว — รันได้เมื่อผู้ใช้อนุมัติ** (ดู "สถานะ 2 ก.ย. (ค่ำ)" ข้างล่าง)
-- 🔴 **แต่มันปลอดภัยเพราะ *ของสองอย่างที่ต้องอยู่ครบ* ไม่ใช่เพราะไฟล์นี้เขียนดี:**
--    ① ประตูฝั่งเขียนใน route ทั้งสามใบ  ② การล้างแถวเก่าในไฟล์นี้ (ก่อน `grant`)
--    **ถอดข้อใดข้อหนึ่งออก รูรั่วกลับมาทันที** — ส่วนที่เหลือของหัวข้อนี้คือรูรั่วนั้นคืออะไร
--
-- 📌 บันทึกไว้ทั้งท่อนโดยตั้งใจ **ไม่ลบทิ้งหลังแก้เสร็จ** — คนที่มารื้อประตูฝั่ง route วันหลัง
--    จะไม่ได้เปิดไฟล์นี้ **เหตุผลของ policy อยู่คนละไฟล์กับสิ่งที่ทำให้มันจริง**
--
-- ── ต่อไปนี้คือรูรั่วเดิม (พบตอนไล่ `E3-AC6` ครึ่งที่เหลือ) ──────────────────
--
-- `travel_time_cache.from_place_id` เป็น `text` และ **ค่ามาจาก query string ตรง ๆ ไม่มีตรวจชนิด**
--   app/api/travel-time/route.ts:19-20  อ่าน `originPlaceId`/`destPlaceId` จาก searchParams
--   app/api/travel-time/route.ts:74-75  เขียนลงแคชดิบ ๆ
--
-- ค่าที่ไหลเข้าไปจริงวันนี้ (ไล่โซ่ครบ ไม่ใช่อนุมาน):
--   ① **พิกัดที่พัก** — `hotelAnchorId()` คืน `hotel@<lat>,<lng>` (5 ตำแหน่ง ≈ ระดับเมตร)
--      hooks/useHotelDistance.ts:28 · hooks/useDaySchedule.ts:79,88 → components/PlaceDetailModal.tsx:51
--      🔴 `lib/__tests__/hotelAnchorId.test.ts:22` ยืนยันเองว่า **อ่านพิกัดกลับจาก id ได้**
--   ② **UUID ของสถานที่ส่วนตัว** — lib/resolvePlace.ts:100 คืน `{ id: custom.id }` (แถว custom_places ผูกทริป)
--      → hooks/useDaySchedule.ts:64 placesById → travelPairs.fromId → route
--
-- 🎯 **policy ในไฟล์นี้เป็น `using (true)` = ทุกแถว** → ผู้ใช้ที่ล็อกอินคนไหนก็ได้ `select *`
--    แล้วได้ **พิกัดที่พักทุกจุดที่ทุกคนในระบบเคยเปิดดู** เป็นข้อความล้วน ไม่ต้องถอดรหัสอะไร
--    · และคู่ (UUID, ระยะทาง) หลายคู่ใช้ triangulate พิกัดสถานที่ส่วนตัวได้ — ซึ่งเป็นสถานการณ์
--      ที่ `E3-AC6`/`D11` เขียนไว้ตรงตัว และด่านสคีมายอมรับเองว่าตรวจไม่ได้
--
-- ⚠️ **วันนี้ยังไม่รั่ว** เพราะ 4 ตารางนี้ `revoke all` จาก client — **ไฟล์นี้เองคือสิ่งที่จะเปิดมัน**
-- 🔴 **ด่าน `cache-lockdown` ของ P6 ผ่านไฟล์นี้ และนั่นถูกต้อง** — มันถามว่า *"สิทธิ์เกินที่ประกาศไหม"*
--    ไม่ได้ถาม *"ข้อมูลในคอลัมน์เป็นของใคร"* · **ไม่ใช่ช่องของด่าน เป็นช่องของดีไซน์**
--
-- ## ความคืบหน้า 2 ก.ย. 2026 (เย็น) — **ทาง (ข) ถูกยกเลิก · ใช้ (ก) แบบบัญชีขาว**
--   🔴 **hash + salt ถูกลองแล้วและถอนออก (P4 หัก · P1 ยืนยันกลไก)** — อย่าเอากลับมา
--      salt เป็นความลับฝั่งเซิร์ฟเวอร์ ผู้โจมตีคำนวณเองไม่ได้จริง **แต่เขาใช้ route เป็นเครื่อง hash ได้:**
--        ① `select *` เก็บเซต hash ที่มี → ② ยิง route ด้วยพิกัดที่สงสัย → ③ `select *` อีกรอบ
--        → hash ใหม่ที่โผล่คือของค่านั้น · อยู่ในเซตเดิมหรือเปล่า = "มีคนเคยดูที่นี่ไหม"
--      🎯 **hash ที่ยังแชร์แคชได้ = ออราเคิล · hash ที่ไม่เป็นออราเคิล = ไม่แชร์ = ไม่ใช่แคช**
--
--   ✅ **สิ่งที่ใช้แทน: แคชได้ก็ต่อเมื่อ *ทั้งสองปลาย* พิสูจน์ได้ว่าอยู่ในคลังสาธารณะ**
--      `lib/engine/db.ts` → `catalogPublicSlugs()` ถาม `catalog_places.legacy_slug`
--      `app/api/travel-time/route.ts` ใช้ผลนั้นเป็นประตู · ไม่ผ่าน = ไม่อ่านไม่เขียนแคชเลย
--      · ล้มแล้วได้ **เซตว่าง** (fail-closed) — แพงขึ้นแต่ไม่รั่ว · ยิงทิศแดงแล้ว: เปลี่ยนเป็น
--        fail-open → แดงเคสเดียวคือเคสนั้นพอดี
--      · `lib/__tests__/catalogPublicSlugs.test.ts` 7 เคส
--      🎯 **ถามว่า "พิสูจน์ได้ไหมว่าสาธารณะ" ไม่ใช่ "หน้าตาเหมือนของส่วนตัวไหม"** —
--        อย่างหลังต้องมีรายการรูปแบบที่ส่วนตัว ซึ่งผิดเงียบวันที่มีรูปใหม่ ·
--        และ **ตรวจด้วยรูปร่างไม่ได้เลย**: `custom_places.id` เป็น UUID ที่เข้า `^[a-z0-9-]+$`
--        เหมือน slug ทุกประการ (P4: *ด่านที่ตรวจรูปร่างของตัวระบุ จะพลาดข้อมูลส่วนตัว
--        ที่ถูกเข้ารหัสเป็นรูปร่างอื่นเสมอ — และพิกัดคือกรณีที่แย่ที่สุด เพราะมันเป็นตำแหน่งอยู่แล้ว*)
--      ⚠️ **ราคาที่ประกาศไว้:** เส้นทางที่ปลายเป็นที่พักหรือสถานที่ที่ผู้ใช้เพิ่มเอง **ไม่ถูกแคช**
--        → จ่าย Google ทุกครั้ง · `useHotelDistance` อยู่ในหน้ารายละเอียดสถานที่ซึ่งเปิดบ่อย
--        📌 ถ้าบิลแรงเกินรับ ทางถัดไปคือแคชแยกสโคปรายทริป (คอลัมน์ `trip_id` + policy) **ไม่ใช่กลับไป hash**
--
-- ## สถานะ 2 ก.ย. 2026 (ค่ำ) — **ครบแล้วทั้งสามข้อ · ไฟล์นี้พร้อมให้ผู้ใช้ตัดสินใจรัน**
--   ✅ ① **ล้างแถวเก่า + `do $verify$` แบบบัญชีขาว อยู่ในไฟล์นี้แล้ว ก่อน `grant`**
--        พร้อม **ทิศบวก**: ถ้า `catalog_places` ว่าง ให้ระเบิด — ไม่งั้นการลบทุกแถวจะอ่านเหมือน "สะอาด"
--   ✅ ② **ประตูฝั่งเขียนครบ *ทั้งสามใบ*** — `travel_time_cache` · `place_details_cache` · `place_photo_cache`
--        🔴 ใบที่สามเกือบหลุด: `place_photo_cache` ก็คีย์ด้วย `maps_query` เหมือนกัน
--           **ตอนปิด `place_details_cache` ผมไม่ได้ตรวจมัน** — เจอตอนกลับมาเขียน SQL ล้างแถว
--   ✅ ③ **เรื่อง `backfillLocalName` ใช้ `.update()` — ตัดสินแล้ว: ไม่ให้สิทธิ์ `update` และยอมรับผล**
--        🔴 **และผมเขียนผลกระทบไว้เกินจริงตอนแรก ขอแก้:**
--        `backfillLocalName` `return fresh` **ไม่ว่าการเขียนกลับจะล้มหรือไม่** (`route.ts:118`)
--        → **ผู้ใช้ยังได้ชื่อท้องถิ่นที่ถูกต้องเสมอ** · สิ่งที่เสียคือ *การเก็บมันไว้ใช้ซ้ำ*
--        🎯 **ผลจริงคือ *ต้นทุน* ไม่ใช่ *ความถูกต้อง*** — คำขอข้ามภาษาจะยิง Google ซ้ำทุกครั้ง
--        · ทำไมไม่เติม `update`: มันคือสิ่งที่ไฟล์นี้ตั้งใจไม่ให้ — **`update` = เขียนทับแถวของคนอื่นได้**
--          และตารางนี้ไม่มีคอลัมน์เจ้าของให้ policy เกาะ → จำกัดเป็นรายแถวไม่ได้เลย
--        · ทางที่ปฏิเสธ: แยกแถวต่อ locale (ต้องเปลี่ยน primary key ของตารางที่ใช้งานอยู่ — แพงกว่าผลที่ได้)
--        📌 ถ้าต้นทุนตรงนี้สูงเกินรับ **ให้กลับมาที่คีย์ ไม่ใช่ที่ `grant`**
--
-- ## ทางที่ต้องตัดสินก่อน (P1 ยังไม่เลือกให้ — เป็นการตัดสินใจเชิงดีไซน์)
--   (ก) ไม่แคชคีย์ที่ถือข้อมูลส่วนตัว (hotel@ / custom UUID) — แคบสุด เสีย cache hit บางส่วน
--   (ข) คีย์เป็น hash ที่มี salt ฝั่งเซิร์ฟเวอร์ — คงอัตราแคช · กัน enumerate · แต่เพิ่มของที่ต้องดูแล
--   (ค) ไม่ให้ `select` กับ `authenticated` เลย — แต่แล้ว route อ่านแคชไม่ได้ ซึ่งเป็นโจทย์ตั้งต้นของ `D87`
--   📌 (ก) กับ (ข) แก้ที่ *ฝั่งเขียน* (โซน P1) · **ทำก่อน แล้วไฟล์นี้ค่อยมีความหมาย**

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

-- ══ ล้างแถวที่คีย์ไม่ได้พิสูจน์ว่าสาธารณะ — **ต้องมาก่อน `grant` ในไฟล์เดียวกัน** ══
-- 🔴 **ประตูฝั่งโค้ด (`catalogPublicSlugs`/`catalogPublicMapsQueries`) คุ้มเฉพาะแถว *ใหม่***
--    แถวที่อยู่มาก่อนยังถือ `hotel@<lat>,<lng>` และข้อความที่ผู้ใช้พิมพ์เอง
--    → เปิด `select` เมื่อไหร่ รั่วทันทีโดยที่ประตูใหม่ไม่เกี่ยวเลย
-- 🔴 **แยกไฟล์ไม่ได้** — ถ้าล้างคนละ migration จะมีหน้าต่างที่ `grant` ลงแล้วแต่ยังไม่ล้าง
--
-- ✅ ใช้ **บัญชีขาว** ให้ตรงกับฝั่งโค้ด ไม่ใช่ `like 'hotel@%'`
--    (P4 เสนอบัญชีดำ · P1 เปลี่ยนเป็นขาว: บัญชีดำคือรายการของรูปที่ *รู้แล้ว* — และถ้าสองฝั่ง
--     ใช้คนละแบบ มันจะเถียงกันเงียบ ๆ วันที่มีรูปใหม่)
-- ⚠️ ลบปลอดภัย: แคชสร้างใหม่เองจาก Google · เสียแค่ค่าเรียกรอบแรกของแถวที่ถูกลบ

delete from public.travel_time_cache t
 where not exists (select 1 from public.catalog_places c where c.legacy_slug = t.from_place_id)
    or not exists (select 1 from public.catalog_places c where c.legacy_slug = t.to_place_id);

delete from public.place_details_cache d
 where not exists (select 1 from public.catalog_places c where c.maps_query = d.maps_query);

delete from public.place_photo_cache p
 where not exists (select 1 from public.catalog_places c where c.maps_query = p.maps_query);

do $purged$
declare n int;
begin
  -- 🎯 *"ผมลบแล้ว"* กับ *"ไม่เหลือแล้ว"* เป็นคนละประโยค (P4)
  --    migration รันครั้งเดียว — **ถ้าไม่ assert ตรงนี้ ไม่มีใครได้ตรวจอีกเลย**
  select count(*) into n from public.travel_time_cache t
   where not exists (select 1 from public.catalog_places c where c.legacy_slug = t.from_place_id)
      or not exists (select 1 from public.catalog_places c where c.legacy_slug = t.to_place_id);
  if n > 0 then raise exception 'travel_time_cache ยังเหลือ % แถวที่คีย์ไม่ใช่ของคลัง', n; end if;

  select count(*) into n from public.place_details_cache d
   where not exists (select 1 from public.catalog_places c where c.maps_query = d.maps_query);
  if n > 0 then raise exception 'place_details_cache ยังเหลือ % แถวที่คีย์ไม่ใช่ของคลัง', n; end if;

  select count(*) into n from public.place_photo_cache p
   where not exists (select 1 from public.catalog_places c where c.maps_query = p.maps_query);
  if n > 0 then raise exception 'place_photo_cache ยังเหลือ % แถวที่คีย์ไม่ใช่ของคลัง', n; end if;

  -- 🔴 **ทิศบวก — กันเคสที่ผ่านเพราะ *ไม่มีอะไรให้ตรวจ*** (`E3-AC6` · ตระกูลเดียวกับ `P-33` ข้อ 3)
  --    ถ้าคลังว่าง เงื่อนไขข้างบนจะเป็นจริงหลังลบทุกแถวทิ้ง แล้วอ่านเหมือน "สะอาด"
  select count(*) into n from public.catalog_places where legacy_slug is not null or maps_query is not null;
  if n = 0 then
    raise exception 'catalog_places ว่าง — การล้างข้างบนลบทุกแถวโดยไม่ได้พิสูจน์อะไรเลย';
  end if;
end $purged$;

-- ── grant: อ่านได้ · เพิ่มได้ · **ทับไม่ได้ ลบไม่ได้** ─────────────────────────
grant select, insert on public.place_details_cache to authenticated;
grant select, insert on public.place_photo_cache   to authenticated;
grant select, insert on public.travel_time_cache   to authenticated;

-- ── policy: RLS เปิดอยู่ → grant อย่างเดียวไม่พอ ต้องมี policy ด้วย ───────────
-- 🔴 **แก้ 2 ก.ย. 2026 — เหตุผลเดิมตรงนี้ *ผิด* และมันผิดในทิศที่อ่านแล้ววางใจ**
--    เดิมเขียนว่า *"แคชสามใบนี้ไม่มีข้อมูลของผู้ใช้สักคอลัมน์ → `using (true)` ไม่ได้เปิดอะไรของใคร"*
--    · **ข้อความส่วน *คอลัมน์* จริง** — เนื้อแถวเป็นข้อเท็จจริงจาก Google ทั้งหมด
--    · 🔴 **แต่ข้อมูลของผู้ใช้ไม่ได้อยู่ในคอลัมน์ มันอยู่ใน *คีย์***
--      `travel_time_cache.from_place_id` เคยถือ `hotel@<lat>,<lng>` (พิกัดที่พัก ระดับเมตร)
--      `place_details_cache.maps_query` / `place_photo_cache.maps_query` ถือ *ข้อความที่ผู้ใช้พิมพ์เอง*
--      เพราะ `placeQueryKey()` คืน `mapsQuery` ตรง ๆ เมื่อสถานที่ไม่มี `googlePlaceId`
--    🎯 **คอมเมนต์เดิมเตือนตัวเองไว้ว่า *"ถ้าวันหนึ่งมีคอลัมน์ที่ผูกกับผู้ใช้ ให้กลับมาแก้"* —
--       และมันไม่เคยดัง เพราะไม่มีคอลัมน์ไหนเพิ่มเลย · **สิ่งที่ผูกกับผู้ใช้เข้ามาทาง *คีย์* ซึ่งไม่มีใครเฝ้า**
--    ✅ วันนี้ `using (true)` ปลอดภัยได้เพราะ **สองอย่างที่ต้องอยู่ครบ ไม่ใช่เพราะเนื้อแถว:**
--       ① ประตูฝั่งเขียนใน route (`catalogPublicSlugs` / `catalogPublicMapsQueries`) — ของใหม่เข้าไม่ได้
--       ② การล้างข้างบน — ของเก่าไม่เหลือ
--    🔴 **ถอดข้อใดข้อหนึ่งออก policy นี้กลับมาอันตรายทันที** — เขียนไว้ตรงนี้เพราะคนอ่าน policy
--       จะไม่ได้เปิดไฟล์ route · **เหตุผลของ policy อยู่คนละไฟล์กับสิ่งที่ทำให้มันจริง**
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
