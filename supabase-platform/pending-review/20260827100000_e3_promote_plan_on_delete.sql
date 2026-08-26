-- ═══════════════════════════════════════════════════════════════════════════
-- `E3` — ลบแผนที่ใช้อยู่แล้ว **ต้องมีแผนอื่นขึ้นมาแทน**
-- เจ้าของ: P1-Lead · 27 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## สิ่งที่ผิดวันนี้
-- ฐานบังคับ invariant ของแผนไว้ **สองในสามข้อ**:
--   ① `trip_plans_keep_one`     → ทริปต้องมีแผน **อย่างน้อย 1**       ✅ มี
--   ② `trip_plans_one_active`   → แผนที่ active **ไม่เกิน 1**          ✅ มี (partial unique index · `D52`)
--   ③ แผนที่ active **อย่างน้อย 1**                                     🔴 **ไม่มีใครบังคับเลย**
--
-- 🔴 **และข้อ ③ คือข้อที่ทั้งแอปสมมติว่าจริง** — `useStops(tripId, activePlanId)`,
--    `useDaySettings(...)`, `usePlaceNotes(...)` รับ `activePlanId` เป็น `null` ได้ทั้งหมด
--    → `null` = **ไม่ดึงอะไรเลย** → ทริปที่มีจุดแวะครบกลายเป็นหน้าจอว่าง
--
-- ## ไปถึงสถานะนั้นได้ยังไง — **ทางเดียว และเป็นทางที่ UI เปิดให้เดินตรง ๆ**
-- `app/page.tsx:377-378` — เมนู "ลบแผน" ลบ **แผนที่ active อยู่เท่านั้น** (`deletePlan(activePlanId)`)
--   1. ทริปมีแผน A (active) + แผน B
--   2. ผู้ใช้ลบแผน A → `trip_plans_keep_one` ผ่าน (B ยังอยู่) → **ลบสำเร็จ**
--   3. **ไม่เหลือแถวไหนที่ `is_active`** → `activePlanId = null`
--   4. หน้าจอ: จุดแวะหาย · ตั้งค่ารายวันหาย · โน้ตหาย — **ทั้งที่แผน B ยังมีของครบทุกชิ้น**
--
-- ⚠️ **ค้างถาวร ไม่ใช่ชั่วคราว** — ไม่มีอะไรในระบบเลื่อนแผนอื่นขึ้นมาแทน
--    วัดแล้วด้วย `git ls-files | xargs grep 'is_active = true'` **ทั้งรีโป**:
--    มีคนตั้งค่านี้แค่ 3 ที่ — `create_trip` (แผนตั้งต้น) · `set_active_plan` (ผู้ใช้สลับเอง) · ไคลเอนต์ที่เรียกสองอันนั้น
--    **ไม่มีตัวไหนทำงานตอนลบ**
--
-- ## 🔴 และมีคนเชื่อไปแล้วว่ามันมี
-- `hooks/usePlans.ts` เขียนคอมเมนต์ไว้ว่า
--   *"ลบแผนที่ active อยู่ทำให้ **แผนอื่นกลายเป็น active** ซึ่งเป็นผลข้างเคียงที่ฝั่งนี้เดาเองไม่ได้"*
-- → **คำอธิบายนั้นบรรยายพฤติกรรมที่ไม่มีอยู่จริง** · และมันสมเหตุสมผลพอที่จะอ่านผ่านทุกครั้ง
--    (ตระกูลเดียวกับ `D71` · และกับคอมเมนต์ `pg_trigger_depth()` ที่ P7 จับได้ในไฟล์ `20260825120856`)
--    ⚠️ **ไฟล์นี้ทำให้คอมเมนต์นั้นเป็นจริง — ไม่ใช่ลบคอมเมนต์ทิ้ง** เพราะพฤติกรรมที่มันบรรยายคือพฤติกรรมที่ถูก
--
-- ## ทำไม "เลื่อนขั้น" ไม่ใช่ "ปฏิเสธ"
-- ด่านอีกสองตัวในตระกูลนี้ (`assert_trip_has_owner` · `assert_trip_has_plan`) **ปฏิเสธ**
-- 🔴 ตัวนี้ปฏิเสธไม่ได้ เพราะ **UI ลบได้เฉพาะแผนที่ active** → ปฏิเสธ = ปุ่มลบแผนใช้ไม่ได้ตลอดกาล
--    · และผู้ใช้ที่อยากลบแผนที่ใช้อยู่ **ไม่ได้ทำอะไรผิด** — มันเป็นการกระทำที่ถูกต้องสมบูรณ์
--    · สิ่งที่ขาดคือ *ผลที่ตามมา* ไม่ใช่ *การอนุญาต*
--
-- ## ทำไมต้องอยู่ที่ฐาน ไม่ใช่ที่ route
-- เขียนที่ route = ลบเสร็จแล้วค่อยสั่งเลื่อนขั้น = **สองคำสั่ง**
-- · ล้มระหว่างกลาง (เน็ตหลุด · process ตาย) → **ค้างถาวรในสถานะที่ไฟล์นี้มีไว้กัน**
-- · เหตุผลเดียวกับ `P-54` (แผนตั้งต้นอยู่ในทรานแซกชันของ `create_trip`)
--   และ `D52` (สลับแผนต้องอยู่ทรานแซกชันเดียว) — **ไม่ใช่เหตุผลใหม่ เป็นเหตุผลเดิมข้อที่สาม**
--
-- ## `security definer` — เหตุผลเดียวกับ `20260825141033` ทุกตัวอักษร
-- ตอนลบทริปทั้งใบด้วย `service_role`, cascade จะยิง trigger นี้
-- `service_role` **ไม่มี grant บน `trip_plans`** → `invoker` จะได้ `permission denied`
-- 🔴 **ขอบเขตของสิทธิ์ที่เพิ่มขึ้น: ตั้ง `is_active = true` ให้แผน *ในทริปเดียวกับแถวที่เพิ่งถูกลบ* เท่านั้น**
--    ไม่รับ input จากใคร · ไม่ข้ามทริป · ไม่สร้าง/ไม่ลบอะไร (`D38`)
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

create or replace function app.promote_plan_if_none_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_next uuid;
begin
  -- ① ทริปหายไปแล้ว = กำลังลบทั้งใบ (cascade) → ไม่มีอะไรต้องเลื่อนขั้น
  --    รูปเดียวกับ `app.assert_trip_has_plan()` และด้วยเหตุผลเดียวกัน
  if not exists (select 1 from public.trips where id = old.trip_id) then
    return null;
  end if;

  -- ② ยังมีตัว active อยู่ = แถวที่เพิ่งลบไม่ใช่ตัวที่ active → ไม่ต้องทำอะไร
  if exists (
    select 1 from public.trip_plans where trip_id = old.trip_id and is_active
  ) then
    return null;
  end if;

  -- ③ เลื่อน **แผนที่เก่าที่สุด** ขึ้นมา — โดยปกติคือ 'แผน A' ที่ `create_trip` สร้าง
  --    🔴 ตัดสินเสมอกันด้วย `id` เพราะ `created_at` เท่ากันได้จริง (ก๊อปแผนหลายใบในทรานแซกชันเดียว)
  --    ถ้าไม่มี tiebreak ผลจะไม่แน่นอน และเทสต์จะกะพริบโดยไม่มีใครรู้สาเหตุ
  select id into v_next
    from public.trip_plans
   where trip_id = old.trip_id
   order by created_at, id
   limit 1;

  -- ④ ไม่เหลือแผนเลย → **ไม่ใช่หน้าที่ของไฟล์นี้**
  --    `trip_plans_keep_one` (deferred constraint trigger) จะปฏิเสธทั้งทรานแซกชันตอน commit
  --    ⚠️ ห้าม raise ตรงนี้ ไม่งั้นข้อความที่ผู้ใช้เห็นจะกลายเป็นข้อความของไฟล์นี้
  --       แทนที่จะเป็น *"ลบแผนสุดท้ายไม่ได้"* ซึ่งเป็นข้อความที่ตรงกับสิ่งที่เขาเพิ่งทำ
  if v_next is null then
    return null;
  end if;

  update public.trip_plans set is_active = true where id = v_next;
  return null;
end
$fn$;

revoke all on function app.promote_plan_if_none_active() from public, anon, authenticated;

-- 🔴 **trigger ธรรมดา ไม่ใช่ constraint trigger** — ต้องทำงาน *ทันทีหลังลบ*
--    ไม่ใช่ตอน commit · `trip_plans_keep_one` ถึงจะ deferred ก็ยังตรวจตอน commit ตามเดิม
--    → ลำดับที่ได้: ลบ → เลื่อนขั้น(ทันที) → ... → นับแผนตอน commit
drop trigger if exists trip_plans_promote_active on public.trip_plans;
create trigger trip_plans_promote_active
  after delete on public.trip_plans
  for each row execute function app.promote_plan_if_none_active();

-- ───────────────────────────────────────────────────────────────────────────
-- ด่านยืนยัน
-- ───────────────────────────────────────────────────────────────────────────
-- 🔴 **ด่านนี้ตรวจได้แค่ *โครงสร้าง* ไม่ได้ตรวจ *พฤติกรรม*** และผมเขียนไว้ตรง ๆ ว่าตรวจไม่ได้
--    การพิสูจน์จริงต้องมีทริปที่มี 2 แผนของผู้ใช้จริง แล้วลบตัวที่ active
--    → **เป็นเคสในชุดสด (โซน P4) ไม่ใช่สิ่งที่ migration ทำเองได้**
--    ⚠️ อย่านับว่าข้อนี้ปิดเพราะ migration ผ่าน — มันบอกแค่ว่า trigger ถูกติดตั้ง
do $verify$
declare
  v_secdef boolean;
begin
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.trip_plans'::regclass
       and t.tgname  = 'trip_plans_promote_active'
       and not t.tgisinternal
  ) then
    raise exception 'ยืนยันล้ม: ไม่มี trigger trip_plans_promote_active';
  end if;

  select p.prosecdef into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'promote_plan_if_none_active';

  if v_secdef is null then
    raise exception 'ยืนยันล้ม: ไม่มีฟังก์ชัน app.promote_plan_if_none_active';
  end if;
  if not v_secdef then
    raise exception 'ยืนยันล้ม: ฟังก์ชันไม่ใช่ security definer — cascade ลบทริปจะ permission denied';
  end if;

  -- ด่านคู่: ตัวที่บังคับ ① และ ② ต้องยังอยู่ ไม่งั้นไฟล์นี้แก้ปัญหาคนละใบ
  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.trip_plans'::regclass
                              and tgname = 'trip_plans_keep_one'
  ) then
    raise exception 'ยืนยันล้ม: trip_plans_keep_one หายไป — invariant ① ไม่มีใครบังคับ';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'trip_plans_one_active'
  ) then
    raise exception 'ยืนยันล้ม: trip_plans_one_active หายไป — invariant ② ไม่มีใครบังคับ';
  end if;
end $verify$;

commit;
