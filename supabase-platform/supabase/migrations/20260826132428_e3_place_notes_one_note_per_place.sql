-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 `place_notes` เสียข้อบังคับที่ตารางเดิมมี — **หนึ่งสถานที่ หนึ่งโน้ต ต่อแผน**
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · เจอตอนแปลง `usePlaceNotes` ใน `E3`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── สิ่งที่หายไประหว่างออกแบบตารางใหม่ ────────────────────────────────────
-- ```
-- เดิม  (0028_place_notes.sql)  primary key (plan_id, place_id)     ← กันซ้ำในตัว
-- ใหม่  (20260825145708)        id uuid primary key                 ← surrogate · ไม่กันอะไรเลย
-- ```
-- **ไม่มี `unique` ไหนแทนที่มันเลย** — สองแถวสำหรับสถานที่เดียวกันในแผนเดียวกันเขียนลงได้ทันที
--
-- 🔴 **และมันจะไม่พังแบบมี error — มันจะพังแบบ *โน้ตของผู้ใช้หาย***
-- UI ทำ `Object.fromEntries(rows.map(n => [n.place_id, n]))` → **แถวหลังทับแถวก่อนเสมอ**
-- และ **ลำดับที่ฐานคืนมาไม่มีการรับประกัน** (`D55`) → *"โน้ตที่เพิ่งพิมพ์หายไป แล้วกลับมาตอนรีเฟรช"*
-- · ผู้ใช้จะรายงานว่า *"บันทึกไม่ติด"* ซึ่งชี้ไปผิดที่ทั้งหมด
--
-- ── ทำไมถึงหลุด และทำไมด่านที่มีอยู่ไม่จับ ────────────────────────────────
-- `column-map.md` แมป **คอลัมน์** ครบทุกช่อง · **`primary key` ไม่ใช่คอลัมน์**
-- 🎯 **`E2-AC6` ถามว่า *ทุกคอลัมน์มีปลายทางไหม* ไม่ได้ถามว่า *ข้อบังคับทุกตัวมีปลายทางไหม***
--    → **คลาสทั้งคลาสนี้อยู่นอกเส้นที่เกณฑ์เดิน** — และนี่คือตัวอย่างแรกที่จับได้
-- · ⚠️ **ตารางอื่นที่เปลี่ยนจาก composite PK เป็น surrogate `id` ต้องถูกไล่ด้วย** — จดไว้ที่ `P-74`
--
-- ── ท่าที่ใช้: `unique` แยกสองตัว ไม่ใช่ตัวเดียว ────────────────────────────
-- `place_notes_one_place` บังคับว่ามีสถานที่ทางเดียว → อีกฝั่งเป็น `null` เสมอ
-- **`unique (plan_id, catalog_place_id, custom_place_id)` จึงใช้ไม่ได้** เพราะ `null` ไม่ชนกันเองใน SQL
-- → ต้องเป็น **partial unique index สองตัว** ตัวละฝั่ง
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

-- 🔴 เก็บกวาดของซ้ำก่อน ไม่งั้นสร้าง index ไม่ได้ · **เก็บแถวที่แก้ล่าสุด**
--    (ถ้ามีซ้ำจริง แถวที่ผู้ใช้เพิ่งพิมพ์คือแถวที่เขาอยากได้)
delete from public.place_notes a
 using public.place_notes b
 where a.plan_id = b.plan_id
   and a.catalog_place_id is not null
   and a.catalog_place_id = b.catalog_place_id
   and (a.updated_at, a.id) < (b.updated_at, b.id);

delete from public.place_notes a
 using public.place_notes b
 where a.plan_id = b.plan_id
   and a.custom_place_id is not null
   and a.custom_place_id = b.custom_place_id
   and (a.updated_at, a.id) < (b.updated_at, b.id);

-- 🔴 **ไม่ partial ตาม `deleted_at`** — tombstone ต้องกันที่ของมันไว้
--    ไม่งั้นลบโน้ตแล้วเขียนใหม่จะได้สองแถว แล้ว `D76` (tombstone อยู่ถาวร) จะทำให้มันค้างตลอดไป
create unique index place_notes_one_per_catalog_place
  on public.place_notes (plan_id, catalog_place_id)
  where catalog_place_id is not null;

create unique index place_notes_one_per_custom_place
  on public.place_notes (plan_id, custom_place_id)
  where custom_place_id is not null;

do $verify$
declare n int;
begin
  select count(*) into n from pg_indexes
   where schemaname = 'public'
     and indexname in ('place_notes_one_per_catalog_place', 'place_notes_one_per_custom_place');
  if n <> 2 then raise exception 'place_notes: index กันซ้ำไม่ครบ 2 ตัว (ได้ %)', n; end if;
end $verify$;

commit;
