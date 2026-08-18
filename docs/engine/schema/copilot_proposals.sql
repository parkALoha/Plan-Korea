-- ============================================================================
-- ร่าง DDL: ที่เก็บ "ข้อเสนอ" ของ Travel Copilot
-- เจ้าของ: P5-AI/Agent · P1 อนุมัติให้ร่างลงที่นี่ 17 ส.ค. 2026
-- คู่กับ: docs/engine/copilot-spec.md §2.3 (tool เขียน) · §2.5 (rank key)
-- รอบแก้ที่ 2 — ตาม P4 `security-review.md §8.1–8.6` (P-01 … P-06) ทั้งหมด
--
-- 🔴 นี่ไม่ใช่ migration และห้ามรัน
--    - ห้ามคัดลอกไฟล์นี้ไป supabase/migrations/ (README.md กติกาเหล็กข้อ 3)
--    - ห้ามรันกับ Supabase `ejzibhgqhxdzkovsnpds` ซึ่งเป็น DB ทริปจริงของคน 2 คน
--    - dev DB คือ **คลาวด์** org `Plan-trip-app` · project `engine-dev` · ref `pmvxwcimjebogjfimzqy`
--      (แก้ 18 ส.ค. 2026 ตาม D14 — บรรทัดเดิมเขียนว่า "Supabase local ผ่าน Docker" ซึ่งหมดอายุแล้ว)
--    - ตัวไฟล์เองยังเริ่มลงมือได้ที่ E2 เท่านั้น ไม่ใช่ตอนนี้
--
-- 🔴 policy/ฟังก์ชันในไฟล์นี้เป็น "รูปแบบที่ตั้งใจไว้" ไม่ใช่ของจริง
--    P4-QA/Sec เป็นคนเขียนของจริงทั้งชุดที่ docs/engine/rls-policies.sql
--    (architecture.md §2.3 — คนออกแบบ schema ไม่ควรตรวจงานตัวเอง)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- ทำไมต้องเป็นตาราง ไม่ใช่ memory ฝั่งเซิร์ฟเวอร์ (P1 ตัดสิน)
-- ---------------------------------------------------------------------------
-- 1. เว็บนี้ sync สดระหว่างคน 2 คน — ถ้าเก็บใน memory ของ instance เดียว
--    อีกคนเปิดดูการ์ด "ก่อน → หลัง" ไม่เห็นเลย
-- 2. รันบน Vercel serverless — instance ถูกรีไซเคิลเมื่อไหร่ข้อเสนอหายทันที
--    ผู้ใช้จะเจอ "กดยืนยันแล้วไม่มีอะไรเกิดขึ้น" ซึ่งเป็นอาการเดียวกับบั๊กที่
--    lib/writeGuard.ts ถูกสร้างขึ้นมาเพื่อกำจัด (เฟส 20.2 — "พังแล้วมีเสียง")
-- 3. ต้องการ audit trail อยู่แล้ว (copilot-spec §2.3 ข้อ 6) ซึ่งต้องคงทนอยู่ดี


create table public.copilot_proposals (
  id            uuid primary key default gen_random_uuid(),

  -- ขอบเขต -------------------------------------------------------------------
  trip_id       uuid not null references public.trips(id) on delete cascade,
  -- ⚠️ plan_id รอข้อ 8.1 ใน copilot-spec.md — ผัง architecture.md §1.2 ยังไม่ระบุว่า
  --    trip_stops ผูกกับ trip_plans ยังไง ถ้า E2 ตัดสินว่าไม่ผูก ให้ลบคอลัมน์นี้ทิ้ง
  plan_id       uuid references public.trip_plans(id) on delete cascade,

  -- ⚠️ P-06: soft delete (D7) ทำให้ `on delete cascade` ของ day_id **ไม่เคยทำงาน**
  --    เพราะไม่มีใคร DELETE จริงอีกแล้ว · FK นี้จึงกันได้แค่การลบแข็ง ซึ่งจะไม่เกิด
  --    → ต้องตรวจว่าวันยังไม่ถูก soft delete ใน app.decide_proposal() ไม่ใช่พึ่ง FK
  day_id        uuid references public.trip_days(id) on delete cascade,

  -- ใครขอ --------------------------------------------------------------------
  -- FK จริงได้หลัง E1 (architecture.md §2.1) — ของเดิม added_by เป็นข้อความที่พิมพ์เอง
  requested_by  uuid not null references public.profiles(id),
  session_id    text,          -- ผูกกับบทสนทนา เผื่อไล่ย้อนว่าคุยอะไรกันอยู่ตอนเสนอ
  check (session_id is null or length(session_id) <= 100),   -- P-06

  -- เสนออะไร -----------------------------------------------------------------
  tool_name     text not null,
  check (tool_name in (
    'propose_reorder_day',
    'propose_move_stop',
    'propose_add_stop',
    'propose_remove_stop',
    'propose_set_day_start',
    'propose_set_dwell'
  )),
  -- args ที่โมเดลส่งมา หลังผ่าน validation ของ tool wrapper แล้ว
  -- 🔴 ห้ามมี rank key อยู่ในนี้ (copilot-spec §2.5) — โมเดลส่ง orderedStopIds[] มา
  --    แล้วเซิร์ฟเวอร์คำนวณ rank key ตอน apply เท่านั้น
  args          jsonb not null,

  -- แสดงให้คนดูก่อนกด --------------------------------------------------------
  -- ผลของ computeSchedule() ของ "สถานะหลังเปลี่ยน" (copilot-spec §2.3 ข้อ 2)
  -- เก็บไว้เลยแทนที่จะคำนวณใหม่ตอนเรนเดอร์ เพราะต้องเป็นภาพเดียวกับที่โมเดลใช้ตัดสินใจ
  -- ไม่งั้นการ์ดจะโชว์ตัวเลขที่ต่างจากที่ Copilot เพิ่งพูดไป
  preview       jsonb not null,

  -- ด่านกันชน ----------------------------------------------------------------
  -- updated_at ของทุกแถวที่จะแก้ ตอนสร้างข้อเสนอ:
  --   [{ "table": "trip_stops", "id": "...", "updated_at": "..." }, ...]
  -- ✅ D7 ทำให้ค่านี้เชื่อได้จริง เพราะมาจาก DB trigger ไม่ใช่นาฬิกาเครื่องผู้ใช้
  --    ของเดิม client เขียน updated_at เอง 20+ จุดใน 6 hook — ใช้เป็น token ไม่ได้เลย
  base_versions jsonb not null,
  check (jsonb_typeof(base_versions) = 'array'),
  -- 🔴 P-08: อาร์เรย์ว่างผ่านด่านโดยไม่ตรวจอะไรเลย ("ความจริงบนเซตว่าง" — P4 §2.8)
  --    loop ที่ไม่มีรอบจะคืน true เสมอ · และ client เป็นคนใส่ค่านี้
  --    → editor สร้างข้อเสนอที่ปิดด่านกันชนของตัวเอง แล้วทับงานที่อีกคนเพิ่งแก้ได้
  --    ทุกข้อเสนอต้องแตะอย่างน้อย 1 แถวเสมอ ไม่มีเคสที่ว่างแล้วถูกต้อง
  check (jsonb_array_length(base_versions) > 0),

  -- P-06: jsonb ไม่จำกัดขนาด → editor ยัดของใหญ่ได้
  check (pg_column_size(args)          < 100000),
  check (pg_column_size(preview)       < 100000),
  check (pg_column_size(base_versions) <  50000),

  status        text not null default 'pending',
  check (status in ('pending', 'applied', 'rejected', 'expired', 'stale')),
  -- stale = คนกดยืนยันแล้ว แต่ base_versions ไม่ตรงกับของจริง (อีกคนแก้ก่อน)
  --         ต่างจาก expired ที่หมดเวลาไปเฉยๆ โดยไม่มีใครกด — แยกไว้เพื่อดูว่าคน 2 คน
  --         แก้ชนกันบ่อยแค่ไหน ซึ่งเป็นสัญญาณว่า TTL 10 นาทีสั้นไปหรือยาวไป

  created_at    timestamptz not null default now(),
  -- TTL 10 นาที (copilot-spec §2.3 ข้อ 3) — ยาวพอให้คนอ่านการ์ดจบ
  -- สั้นพอที่แผนจะยังไม่เปลี่ยนไปมากในเว็บที่ sync สด 2 คน
  expires_at    timestamptz not null default now() + interval '10 minutes',
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id),

  -- 🔴 P-02 (แก้แล้ว) — ของเดิมเขียน `(status = 'pending') = (decided_at is null)`
  --    ซึ่งทำให้แถว expired (หมดเวลาโดยไม่มีใครกด → decided_at ต้องเป็น null)
  --    ตกด่าน CHECK ทุกครั้ง → คำสั่งเก็บกวาดข้างล่าง fail 100% ไม่ใช่บางครั้ง
  --    'pending' กับ 'expired' คือ 2 สถานะที่ "ไม่มีใครตัดสิน" · ที่เหลือมีคนกดจริง
  check ((status in ('pending', 'expired')) = (decided_at is null)),
  check ((decided_at is null) = (decided_by is null))
);


-- ---------------------------------------------------------------------------
-- ดัชนี
-- ---------------------------------------------------------------------------
-- 🔴 P-04 (แก้แล้ว) — ของเดิมเป็น index ธรรมดาแต่คอมเมนต์อ้างว่า "กันไม่ให้ยิงซ้อน"
--    ซึ่งเป็นรูปแบบเดียวกับ travel_time_cache เป๊ะ: เจตนาอยู่ในคอมเมนต์ การบังคับไม่มีอยู่
--
-- ✅ ตัดสิน (P5): กฎคือ **หนึ่ง pending ต่อผู้ใช้ต่อทริป** ไม่ใช่หนึ่งต่อทริป
--    เหตุผล: กฎใน copilot-spec §2.3 ข้อ 1 คือ "หนึ่งครั้งต่อหนึ่งเทิร์น" ซึ่งเป็นกฎของ
--    *บทสนทนา* ไม่ใช่ของทริป · เว็บนี้มีผู้ใช้ 2 คนที่คุยกับ Copilot พร้อมกันได้จริง
--    ถ้าบังคับหนึ่งต่อทริป คนที่สองจะถูกบล็อกด้วยเหตุผลที่ไม่เกี่ยวกับตัวเองเลย
--    และแก้ไม่ได้ด้วยตัวเอง ต้องรอให้อีกคนกดการ์ดค้างก่อน — เป็นทางตันที่ผู้ใช้งงแน่
--    ส่วนเคสที่ 2 คนเสนอชนกันจริง มี base_versions รับอยู่แล้ว → คนที่สองได้ 'stale'
--    ซึ่งเป็นสถานะที่ออกแบบมาเพื่อเคสนี้พอดี
create unique index copilot_proposals_one_pending_per_user
  on public.copilot_proposals (trip_id, requested_by)
  where status = 'pending';

-- เรนเดอร์การ์ด: "ทริปนี้มีข้อเสนอที่ยังรออยู่ไหม" (ทั้ง 2 คนต้องเห็นของกันและกัน)
create index copilot_proposals_pending_idx
  on public.copilot_proposals (trip_id, created_at desc)
  where status = 'pending';

-- ไล่เก็บกวาดของหมดอายุ
create index copilot_proposals_expiry_idx
  on public.copilot_proposals (expires_at)
  where status = 'pending';


-- ---------------------------------------------------------------------------
-- RLS — รูปแบบตาม architecture.md §2.3 · ของจริง P4 เขียน
-- 🔴 P-05 (แก้แล้ว): helper ย้ายไป schema `app` และใช้ชื่อของ P4
--    `public.can_access_trip` → `app.can_read_trip` · `public.can_edit_trip` → `app.can_write_trip`
--    เหตุผล: ฟังก์ชันใน `public` ถูก PostgREST สร้าง endpoint `rpc/` ให้อัตโนมัติ
--    → กลายเป็น oracle ให้ยิงถาม uuid มั่วๆ ว่าทริปไหนมีอยู่/ตัวเองเป็นสมาชิกทริปไหน
-- ---------------------------------------------------------------------------
alter table public.copilot_proposals enable row level security;

-- อ่าน: สมาชิกทริปทุกคนต้องเห็น รวม viewer — เพราะการ์ด "ก่อน → หลัง" ควรมองเห็นได้
--       ทั้งสองคน ไม่ใช่แค่คนที่พิมพ์ถาม (นี่คือเหตุผลข้อ 1 ที่ต้องเป็นตาราง)
create policy copilot_proposals_read on public.copilot_proposals
  for select using (app.can_read_trip(trip_id));

-- เขียน: เฉพาะคนที่แก้ทริปได้ — viewer เสนอไม่ได้ เพราะถ้าเสนอได้ก็จะกดยืนยันไม่ได้อยู่ดี
--        เป็นทางตันที่ทำให้ผู้ใช้สับสนเปล่าๆ
-- 🔴 P-03 (แก้แล้ว): ของเดิมตรวจแค่ can_edit_trip → editor เขียนแถวที่อ้างว่า
--    "อีกคนเสนอ" ได้ · เป็นบทเรียน added_by ที่กลับมาในตารางที่ออกแบบหลังบทเรียน
create policy copilot_proposals_write on public.copilot_proposals
  for insert with check (
    app.can_write_trip(trip_id)
    and requested_by = (select auth.uid())
  );

-- 🔴 ไม่มี policy UPDATE/DELETE สำหรับผู้ใช้ โดยตั้งใจ — ดู P-01 ข้างล่าง


-- ---------------------------------------------------------------------------
-- สิทธิ์ระดับตาราง — คู่กับ policy ข้างบน
--
-- ⚠️ RLS policy ไม่ทำงานเลยถ้า role ไม่มีสิทธิ์ระดับตารางก่อน · สองอย่างนี้ต้องมาคู่กันเสมอ
--    policy = "แถวไหนบ้าง" · grant = "ทำอะไรได้บ้าง" — ขาดอย่างใดอย่างหนึ่งคือใช้ไม่ได้
--
-- 🔴 ตารางนี้เพิ่งมี grant เป็นครั้งแรกในรอบนี้ และเหตุผลที่มันเคย "ทำงานได้" ทั้งที่ไม่มี
--    คือ `rls-policies.sql` เคยมี `grant ... on all tables in schema public`
--    ซึ่ง P4 ถอดออกตามกฎข้อ 5 แล้ว → **ตารางของใคร คนนั้น grant เอง**
--
--    ข้อสังเกตของ P4 ที่ควรอยู่ในไฟล์นี้มากกว่าอยู่ในรีวิว:
--    > **"การที่วันนี้ยังไม่มี คือสิ่งที่ควรเห็น ไม่ใช่สิ่งที่ควรกลบ"**
--    grant เหมารวมเคยทำให้ตารางนี้ใช้งานได้โดยที่ไฟล์นี้ไม่เคยขอสิทธิ์นั้น
--    ซึ่งแปลว่า **ไม่เคยมีใครตัดสินใจเรื่องสิทธิ์ของตารางนี้เลย** — มันแค่ได้มาโดยบังเอิญ
--    กฎข้อ 5 จึงไม่ได้แค่ปิดช่อง แต่ทำให้ความรับผิดชอบมองเห็นได้
grant select, insert on public.copilot_proposals to authenticated;

-- 🔴 จงใจไม่ให้ update/delete — ตรงกับที่ไม่มี policy สองตัวนั้น (P-01)
--    การเปลี่ยน status ทำผ่าน app.decide_proposal() ทางเดียวเท่านั้น
--    ⚠️ ถ้าวันหนึ่งมีคนเจอว่า "เปลี่ยน status ไม่ได้" แล้วมาเติม update ตรงนี้
--       เขาจะปิดฟีเจอร์ได้สำเร็จและเปิดช่องพร้อมกัน — ทางที่ถูกคือดูที่ grant execute ข้างล่าง


-- ---------------------------------------------------------------------------
-- 🔴 P-01 — จุดที่ร่างแรกของผมพัง และเป็นความเข้าใจผิดที่ต้องเขียนไว้ให้ชัด
-- ---------------------------------------------------------------------------
-- ร่างแรกเขียนว่า "ไม่เปิด UPDATE policy แล้วให้ Server Action เปลี่ยน status แทน"
-- **เจตนาถูก แต่ทำไม่ได้**:
--
--   Server Action ที่ใช้ session ของผู้ใช้ ก็รันเป็น role `authenticated` เหมือน browser
--   RLS ไม่สนว่าคำสั่งมาจากเซิร์ฟเวอร์หรือเบราว์เซอร์ มันสนแค่ role
--
-- → ไม่มี UPDATE policy = ทุกการเปลี่ยน status ได้ 42501 **ทุกครั้ง** ไม่ใช่บางครั้ง
--   = เส้นทางหลักของฟีเจอร์ (กดยืนยัน/ปฏิเสธ) พังทั้งเส้น
--   ข้อดีอย่างเดียว: พังดังจนเจอในนาทีแรกของ E8 ไม่ใช่พังเงียบแบบ travel_time_cache
--
-- และ 2 ทางออกที่ดูชัดเจนที่สุด ผิดทั้งคู่:
--   ❌ เพิ่ม UPDATE policy ให้ authenticated → เปิดช่องที่ตั้งใจปิดพอดี
--      client ยิง REST เปลี่ยน status ข้ามด่าน base_versions ได้ทันที
--   ❌ ให้ Server Action ใช้ service role → ข้าม RLS ทั้งระบบ
--      และเป็นทางที่คนจะเดินเข้าไปด้วยเหตุผลว่า "ก็ตรวจสิทธิ์แล้วนี่"
--
-- ✅ ทางเดียวที่ได้ครบ: SECURITY DEFINER function ที่ถือทั้ง **การตรวจ** และ **การเขียน**
--    ไว้ในทรานแซกชันเดียว → ด่าน base_versions ข้ามไม่ได้เชิงโครงสร้าง ไม่ใช่เพราะมีวินัย
-- ---------------------------------------------------------------------------

-- ตรวจว่าแถวที่จะแก้ยังเป็นเวอร์ชันเดิมอยู่ไหม
--
-- 🔴 จงใจไม่ใช้ dynamic SQL เลย แม้ base_versions จะมีชื่อตารางอยู่ข้างใน
--    ถ้าเขียนเป็น format('select ... from %I', v->>'table') แล้ว execute
--    ชื่อตารางจะกลายเป็นอินพุตของ SQL ในฟังก์ชันที่รันด้วยสิทธิ์ owner
--    ซึ่งเป็นที่ที่ผิดพลาดแล้วแพงที่สุดในระบบทั้งระบบ
--    → แตกเป็น branch ตายตัว · ตารางที่ไม่รู้จัก = โยน exception ไม่ใช่ข้ามไปเงียบๆ
-- 🔴 P-10: ต้องรับ p_trip เข้ามา scope ทุก branch
--    ฟังก์ชันนี้รันเป็น definer จึงมองเห็นทุกแถวทุกทริป · ถ้าไม่ scope ด้วย trip
--    (ก) กลายเป็น oracle บอกว่า uuid นี้มีอยู่จริงไหม
--    (ข) **หนักกว่า: ด่านอาจ "ผ่าน" โดยตรึงแถวของทริปอื่นที่ไม่ใช่แถวที่กำลังจะถูกแก้**
--        คือด่านทำงาน แต่ทำงานกับของผิดใบ — ซึ่งหน้าตาเหมือนด่านที่ทำงานถูกทุกประการ
create or replace function app.base_versions_match(p_trip uuid, p_versions jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_ok boolean;
begin
  -- 🔴 P-08: fail closed — ว่าง/null = ไม่ผ่าน ไม่ใช่ผ่านฟรี
  --    มี CHECK กันไว้ที่ตารางแล้ว แต่ฟังก์ชันต้องกันเองด้วย เพราะมันเป็นด่านสุดท้าย
  --    และต้องถูกต้องแม้ถูกเรียกจากที่อื่นในอนาคต — ด่านที่พึ่ง CHECK ของตารางอื่น
  --    คือด่านที่หายไปเงียบๆ วันที่มีคนเรียกมันจากทางใหม่
  if p_versions is null or jsonb_array_length(p_versions) = 0 then
    return false;
  end if;

  for v in select * from jsonb_array_elements(p_versions) loop
    case v->>'table'
      when 'trip_stops' then
        select exists (
          select 1 from public.trip_stops
           where id = (v->>'id')::uuid
             and trip_id = p_trip                -- P-10
             and updated_at = (v->>'updated_at')::timestamptz
             and deleted_at is null              -- D7: soft delete
        ) into v_ok;
      -- 🔴 P-11: branch เดิมอ้าง `trip_day_settings` ซึ่งผิด 2 ชั้น
      --    (ก) ตารางนั้นจะถูกยุบเป็น "คอลัมน์ของ trip_days" ในโมเดลใหม่ → จะไม่มีอยู่
      --    (ข) ตารางวันนี้ **ไม่มีคอลัมน์ `id`** เลย PK เป็น (plan_id, day_id)
      --        (`lib/supabase.ts` TripDaySettings) → `where id = ...` คอมไพล์ไม่ผ่านด้วยซ้ำ
      --    ผมเขียนโดยลอกทรงจาก branch แรกมาโดยไม่ได้เปิดดูรูปร่างจริงของตารางที่สอง
      when 'trip_days' then
        select exists (
          select 1 from public.trip_days
           where id = (v->>'id')::uuid
             and trip_id = p_trip                -- P-10
             and updated_at = (v->>'updated_at')::timestamptz
             and deleted_at is null
        ) into v_ok;
      else
        -- ✅ ต้องเป็น exception ไม่ใช่ `else null`
        --    ถ้าข้ามเงียบ ผู้ที่ใส่ชื่อตารางมั่วจะปิดด่านกันชนได้ทั้งด่าน
        raise exception 'base_versions: unknown table %', v->>'table';
    end case;
    if not v_ok then return false; end if;
  end loop;
  return true;
end $$;


-- ตัดสินข้อเสนอ — ทั้งการตรวจและการเขียนอยู่ในทรานแซกชันเดียว
--
-- 🔴 security definer ข้าม RLS → **ต้องตรวจสมาชิกเองข้างในทุกครั้ง**
--    ถ้าลืมบรรทัด can_write_trip ฟังก์ชันนี้จะกลายเป็นช่องให้ใครก็ตัดสินข้อเสนอ
--    ของทริปใครก็ได้ — อันตรายกว่าการไม่มีฟังก์ชันนี้เลย
create or replace function app.decide_proposal(p_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_trip    uuid;
  v_day     uuid;
  v_expires timestamptz;
  v_base    jsonb;
begin
  -- for update: ล็อกแถวไว้ กัน 2 คนกดยืนยันข้อเสนอเดียวกันพร้อมกันแล้ว apply ซ้ำ
  select trip_id, day_id, expires_at, base_versions
    into v_trip, v_day, v_expires, v_base
    from public.copilot_proposals
   where id = p_id and status = 'pending'
   for update;

  if v_trip is null then return 'not_pending'; end if;

  -- ตรวจสมาชิกเอง เพราะ definer ข้าม RLS ไปแล้ว
  if not app.can_write_trip(v_trip) then
    raise exception 'forbidden';
  end if;

  -- หมดอายุระหว่างที่การ์ดค้างอยู่บนจอ
  if v_expires < now() then
    update public.copilot_proposals set status = 'expired' where id = p_id;
    return 'expired';
  end if;

  if not p_accept then
    update public.copilot_proposals
       set status = 'rejected', decided_at = now(), decided_by = (select auth.uid())
     where id = p_id;
    return 'rejected';
  end if;

  -- P-06: วันอาจถูก soft delete ไปแล้ว — cascade ของ FK ไม่เคยทำงานใต้ soft delete
  if v_day is not null and not exists (
       select 1 from public.trip_days where id = v_day and deleted_at is null
     ) then
    update public.copilot_proposals
       set status = 'stale', decided_at = now(), decided_by = (select auth.uid())
     where id = p_id;
    return 'stale';
  end if;

  -- ด่านกันชน — อีกคนแก้ก่อนหรือเปล่า (P-10: scope ด้วยทริปของข้อเสนอนี้)
  if not app.base_versions_match(v_trip, v_base) then
    update public.copilot_proposals
       set status = 'stale', decided_at = now(), decided_by = (select auth.uid())
     where id = p_id;
    return 'stale';
  end if;

  -- 🔴 การเขียนข้อมูลจริงต้องอยู่ในทรานแซกชันเดียวกันนี้ ไม่ใช่ให้ Server Action
  --    ทำต่อหลังฟังก์ชันคืนค่า · ถ้าแยกกัน จะเกิดสถานะ 'applied' ทั้งที่ยังไม่มีอะไรถูกเขียน
  --    เมื่อการเขียนล้มเหลว — ซึ่งแย่กว่าไม่ apply เลย เพราะการ์ดหายไปแล้วแต่แผนไม่เปลี่ยน
  perform app.apply_proposal(p_id);

  update public.copilot_proposals
     set status = 'applied', decided_at = now(), decided_by = (select auth.uid())
   where id = p_id;
  return 'applied';
end $$;


-- เขียนข้อมูลจริงตาม tool_name — เรียกจาก decide_proposal เท่านั้น
--
-- ⚠️ ร่างนี้ใส่ไว้ 1 branch เป็นตัวอย่างรูปแบบ ที่เหลืออีก 5 ตัวทรงเดียวกัน
--    ตัวที่ยังเขียนไม่ได้ตอนนี้คือ propose_reorder_day / propose_move_stop / propose_add_stop
--    เพราะต้องใช้ตัวคำนวณ rank key ของ D6 ซึ่ง P1/P7 จะตัดสินรูปแบบที่ E2
--    → ห้ามให้ Copilot หรือฝั่งแอปคำนวณ rank key เอง (copilot-spec §2.5)
create or replace function app.apply_proposal(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select tool_name, args, trip_id into r from public.copilot_proposals where id = p_id;

  -- 🔴 P-12: ตรวจสมาชิกซ้ำที่นี่ด้วย ทั้งที่ decide_proposal ตรวจไปแล้ว
  --    ไม่ใช่ความซ้ำซ้อนที่ไร้ประโยชน์ — ถ้าไม่มีบรรทัดนี้ ความปลอดภัยของฟังก์ชันนี้
  --    ขึ้นอยู่กับ **GRANT ชั้นเดียว** คือ "ไม่มีใครเรียกมันตรงๆ ได้"
  --    ซึ่งเป็นสมมติฐานที่ P-09 พิสูจน์แล้วว่าไฟล์อื่นลบล้างได้โดยไม่มีใครเห็น
  --    หลักที่ยึด: ต้องพลาดสองชั้นพร้อมกันถึงจะเจาะได้ ไม่ใช่ชั้นเดียว
  if not app.can_write_trip(r.trip_id) then
    raise exception 'forbidden';
  end if;

  case r.tool_name
    when 'propose_set_dwell' then
      update public.trip_stops
         set dwell_minutes = (r.args->>'dwellMinutes')::int
       where id = (r.args->>'stopId')::uuid
         and deleted_at is null;
    -- when 'propose_reorder_day'  then ...  -- รอ rank key จาก E2
    -- when 'propose_move_stop'    then ...  -- รอ rank key จาก E2
    -- when 'propose_add_stop'     then ...  -- รอ rank key จาก E2
    -- when 'propose_remove_stop'  then ...  -- soft delete ไม่ใช่ DELETE
    -- when 'propose_set_day_start' then ...
    else
      raise exception 'apply_proposal: unhandled tool %', r.tool_name;
  end case;
end $$;

-- ---------------------------------------------------------------------------
-- สิทธิ์เรียกฟังก์ชัน
--
-- 🔴 P-07 — ร่างที่แล้ว revoke ทั้ง 3 ตัวรวมถึง decide_proposal ด้วย
--    ผลคือ Server Action (ซึ่งรันเป็น `authenticated`) เรียกไม่ได้เลย
--    ได้ `permission denied for function` **ทุกครั้ง** = ฟีเจอร์ตายอีกรอบ
--
--    🔴 นี่คือ P-01 กลับมาในหน้าใหม่ และเป็นสัญชาตญาณเดียวกันเป๊ะ:
--       ครั้งแรกด่านหายเพราะ **ไม่มี policy** · ครั้งนี้เพราะ **ไม่มี GRANT**
--       ทั้งสองครั้งผมปิดประตูโดยไม่ได้ถามว่า "แล้วคนที่ควรผ่านได้ เข้าทางไหน"
--       — ปิดให้แน่นเป็นสัญชาตญาณที่ถูก แต่ไม่ได้แปลว่าออกแบบทางเข้าแล้ว
-- ---------------------------------------------------------------------------

-- ✅ ตัวเดียวที่เป็นทางเข้าอย่างเป็นทางการ — ต้อง grant ให้เรียกได้
--    ปลอดภัยเพราะตัวมันเองตรวจสมาชิก + base_versions + ล็อกแถวไว้ครบ
--    (อยู่ schema `app` ซึ่งไม่ expose ให้ PostgREST → browser ยิงตรงไม่ได้ ต้องผ่าน Server Action)
grant execute on function app.decide_proposal(uuid, boolean) to authenticated;

-- ✅ 2 ตัวนี้ revoke ถูกแล้ว — เป็นชิ้นส่วนภายใน ถูกเรียกจาก decide_proposal
--    ด้วยสิทธิ์ owner ของ definer อยู่แล้ว ไม่ต้องให้ใครเรียกตรง
revoke all on function app.apply_proposal(uuid)              from public, anon, authenticated;
revoke all on function app.base_versions_match(uuid, jsonb)  from public, anon, authenticated;
revoke all on function app.decide_proposal(uuid, boolean)    from public, anon;

-- 🔴 กฎข้อ 5 ของ README (จาก P-09): **ห้าม `grant ... on all ... in schema`** ที่ไหนก็ตาม
--    ไฟล์นี้ตรวจแล้วไม่มี · ทุกบรรทัดข้างบนระบุชื่อฟังก์ชันพร้อม signature เต็ม
--    ⚠️ อย่าสับสน `revoke all on function <ชื่อ>` (= ทุก *สิทธิ์* ของฟังก์ชัน *ตัวที่ระบุ*) ซึ่งใช้ได้
--       กับ `grant ... on all functions in schema` (= ทุก *ฟังก์ชัน* แบบเหมารวม) ซึ่งห้าม
--       ถ้าใครมาไล่ลบคำว่า "all" ทั้งไฟล์จะลบผิดตัว
--
-- 🔴 P-09 · สิ่งที่ไฟล์นี้ป้องกันตัวเองไม่ได้: ไฟล์อื่นที่รัน **ทีหลัง** grant ทับ
--    `rls-policies.sql` เคยมี `grant execute on all functions in schema app to authenticated`
--    ซึ่งจะลบล้าง revoke ทั้งหมดข้างบนนี้ และเปิดให้เรียก `apply_proposal` ตรงๆ
--    ข้ามทั้งด่านสมาชิกและด่าน base_versions
--    → **2 ไฟล์อ่านแยกกันถูกทั้งคู่ ผลลัพธ์ขึ้นกับลำดับการรัน** · P4 แก้ฝั่งเขาแล้ว
--    → ตอนซ้อม migrate ที่ E7 ต้องมีขั้นตรวจสิทธิ์จริงหลังรันครบทุกไฟล์
--      ไม่ใช่เชื่อจากการอ่านไฟล์ทีละไฟล์ (นี่คือ DoD-7 ของข้อนี้)


-- ---------------------------------------------------------------------------
-- เก็บกวาด
-- ---------------------------------------------------------------------------
-- ✅ P-02 แก้แล้ว คำสั่งนี้จึงรันผ่าน (ของเดิมโยน CHECK violation ทุกครั้ง)
-- ไม่ต้องมี cron แยก — ให้ Server Action ที่สร้างข้อเสนอใหม่กวาดของเก่าไปด้วยเลย
-- (โปรเจกต์นี้มี /api/keep-alive อยู่แล้ว แต่ผูกกับ CRON_SECRET และมีหน้าที่อื่น
--  อย่าเอางานนี้ไปฝากรวม — ถ้า cron พลาด ข้อเสนอค้างจะกลายเป็นการ์ดผีที่กดได้)
--
--   update public.copilot_proposals
--      set status = 'expired'
--    where status = 'pending' and expires_at < now();
--
-- ⚠️ คำสั่งนี้ก็ติด P-01 เหมือนกัน — เป็น UPDATE ที่ไม่มี policy รองรับ
--    ต้องอยู่ใน SECURITY DEFINER function ด้วย (app.expire_proposals()) ไม่ใช่ยิงตรง
--
-- 🔴 P-06 · ตารางนี้ **ไม่มี `deleted_at` โดยตั้งใจ** ไม่ใช่ตกหล่น
--    D7 บอกว่า "soft delete ทุกตารางผู้ใช้" แต่ตารางนี้เป็น **audit trail**
--    แถวที่ตัดสินแล้วต้องอยู่ถาวรเพื่อตอบว่า "ใครอนุมัติให้ agent แก้แผนตอนไหน"
--    → ตอนกวาด soft delete ทั้งสคีมาใน E2 **ห้ามใส่ deleted_at ให้ตารางนี้**
--    ถ้าต้องการจำกัดขนาดจริงๆ ค่อยย้ายเข้าตาราง archive ที่ E6
