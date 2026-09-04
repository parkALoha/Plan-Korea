-- ════════════════════════════════════════════════════════════════════════════
-- E5 — ตาข่ายรอง: `trip_days_delete` + `grant delete` เผื่อ `…120000` ถูกบันทึกไปแล้ว
-- เจ้าของ: P1-Lead · 4 ก.ย. 2026
-- ════════════════════════════════════════════════════════════════════════════
-- ## 🔴 เหตุผลเดิมของไฟล์นี้ **ผิด** — เขียนใหม่ทั้งหัว หลังรู้ความจริง
-- ฉบับแรกอ้างว่า *"ฐานรัน `…120000` ไปแล้วในเวอร์ชันที่เก่ากว่าไฟล์บนดิสก์"*
-- โดยสรุปจากอาการ *"grant update มีผล · grant delete ไม่มีผล ⇒ ครึ่งลงครึ่งไม่ลง"*
--
-- **ความจริงคือ `…120000` ไม่เคยรันเลย** — และ `grant update (start_date, end_date)`
-- ที่ผมวัดว่า "มีผล" **มาจากไฟล์ของคนอื่นเมื่อ 25 ส.ค.**:
--   `20260825122247_e2_freeze_row_times.sql:78`
--   `grant  update (title, start_date, end_date, base_timezone, status) …`
--
-- 🎯 ***ผมเห็นสองข้อเท็จจริงที่ถูกทั้งคู่ แล้วสร้างคำอธิบายที่เชื่อมมันได้พอดี — และมันผิด***
--    P4 ตัดสมมติฐานอื่นทิ้งจนเหลืออันนี้อันเดียว ⇒ **"เหลืออันเดียว" ไม่ได้แปลว่า "ถูก"
--    มันแปลว่าเรานึกไม่ออกแล้วต่างหาก**
-- · 🔴 และตัวที่หลอกเราทั้งคู่คือ `grep` — บรรทัดนั้นเขียน `grant··update` **เว้นวรรคสองครั้ง**
--   ⇒ `grep "grant update"` ไม่ match · ***สตริงที่เราค้นหา ไม่ใช่ไวยากรณ์ที่ Postgres อ่าน***
--
-- ## ⇒ แล้วทำไมยังเก็บไฟล์นี้ไว้
-- เพราะเรา **ยังพิสูจน์ไม่ได้** ว่า `…120000` ถูกบันทึกใน `schema_migrations` หรือไม่
-- (รอบที่ผู้ใช้กด มันล้มที่ assert ⇒ *ไม่ควร* ถูกบันทึก แต่เราไม่ได้ไปดูของจริง)
-- · ถ้ามันถูกบันทึก → `db push` จะข้าม `…120000` ถาวร และไฟล์นี้คือทางเดียวที่ policy จะลง
-- · ถ้าไม่ถูกบันทึก → `…120000` รันก่อน แล้วไฟล์นี้ `drop … if exists` + `create` ทับ **ผลเท่ากัน**
-- 🎯 ***ราคาของการเก็บไว้คือไฟล์ซ้ำหนึ่งใบ · ราคาของการลบทิ้งคือ policy ที่อาจไม่มีวันลง***
--
-- ⚠️ ลบไฟล์นี้ได้เมื่อ `raise notice` ข้างล่างยืนยันว่า `…120000` ถูกบันทึกแล้วและ policy มีอยู่จริง
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── ด่านกันรันผิดโปรเจกต์ · ต้องเป็นบล็อกแรกเสมอ ก่อน DDL ทุกบรรทัด ──────────
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
-- 1. 🔴 บันทึกสภาพ *ก่อนแก้* ให้เห็นในผลรัน — ตัวที่ตอบว่าใบนี้จำเป็นจริงไหม
-- ───────────────────────────────────────────────────────────────────────────
-- 🎯 ***ถ้าทั้งสองบรรทัดพิมพ์ `t` ออกมา แปลว่าไฟล์นี้ไม่จำเป็น และสมมติฐานของเราผิด***
--    — ให้เห็นตอนรัน ดีกว่าให้เดาทีหลัง · `notice` ไม่ทำให้ migration ล้ม
-- 🔴 **ฉบับแรกของบล็อกนี้ฆ่าการซ่อมได้ — P4 จับก่อนผู้ใช้กด (4 ก.ย. 2026)**
--    มันอ่าน `supabase_migrations.schema_migrations` ตรง ๆ · ถ้าสคีมานั้นไม่มี/ชื่อไม่ตรง/
--    role ที่รัน migration อ่านไม่ได้ → `42P01`/`42501` **ในบล็อกที่อยู่ก่อน DDL ทั้งหมด**
--    → `begin` ทั้งก้อน rollback ⇒ **grant ไม่ลง · policy ไม่ลง**
--    และ error ที่คนเห็นจะพูดถึง `schema_migrations` **ไม่ใช่เรื่องที่เรากำลังซ่อม**
-- 🎯 ***ตัววินิจฉัยที่ทำให้สิ่งที่มันวินิจฉัยล้มเหลว — และล้มไปทางที่อ่านเหมือนคนละปัญหา***
-- 🎯 ***หลักที่อยู่ใต้ข้อนี้: ของที่ *จำเป็น* ต้องไม่ขึ้นกับของที่ *ดีถ้ามี*** — ใบนี้มีหน้าที่เดียวคือซ่อม
--    · `has_table_privilege`/`pg_policies` เป็น catalog ที่อ่านได้เสมอ จึงไม่ต้องห่อ
--    · เฉพาะตัวที่สามที่ต้อง **ถามก่อนว่าเข้าถึงได้ไหม แทนที่จะเข้าถึงเลย**
do $before$
declare
  v_grant   boolean;
  v_policy  boolean;
  v_recorded text;
begin
  v_grant  := has_table_privilege('authenticated', 'public.trip_days', 'DELETE');
  v_policy := exists (select 1 from pg_policies
                       where schemaname='public' and tablename='trip_days'
                         and policyname='trip_days_delete');
  v_recorded := case
    when to_regclass('supabase_migrations.schema_migrations') is null then 'ตรวจไม่ได้'
    else (exists (select 1 from supabase_migrations.schema_migrations
                   where version = '20260904120000'))::text
  end;

  raise notice 'ก่อนแก้ · grant delete on trip_days = %', v_grant;
  raise notice 'ก่อนแก้ · policy trip_days_delete   = %', v_policy;
  raise notice 'ก่อนแก้ · 20260904120000 ถูกบันทึกไว้ = %', v_recorded;

  -- 🔴 **เขียนลงฐานด้วย ไม่ใช่ส่งออกทาง `notice` ทางเดียว** (P4 ข้อ ②)
  --    ```
  --    migration รันเสร็จ → สภาพ "ก่อนแก้" หายถาวร (ฐานย้อนเวลาไม่ได้ · §3.3)
  --    notice ถูกกลืน     → เสียคำตอบตลอดกาล **และไม่มีใครรู้ว่าเสียไป**
  --    ```
  --    `supabase db push` จะพิมพ์ `NOTICE` ออกมาไหม **เราไม่รู้** — และถ้ามันถูกกลบ
  --    ผลรันจะดู "สำเร็จ" ทุกประการ ไม่มีอะไรผิดปกติให้สังเกต
  -- 🎯 ***รูปเดียวกับที่ `§3.3` เตือนไว้ตรงตัว: "หลักฐานที่จะถูกยกไปใช้ ห้ามถูกกลบระหว่างทาง"***
  --    ที่นั่นตัวกลบคือ `2>/dev/null` · ที่นี่คือช่องทางส่ง `notice` ที่เราไม่ได้ควบคุม
  --    ⇒ ปลายทางที่สองอ่านได้ทีหลัง โดยไม่ขึ้นกับว่าใครเห็นจอตอนนั้น
  -- 🔴 **ห่อไว้ทั้งก้อน — ผมเพิ่งทำผิดข้อเดียวกับที่ P4 เพิ่งสอน ในย่อหน้าถัดจากที่เขาสอน**
  --    `create table … app.migration_probe` ต้องมีสิทธิ์สร้างใน schema `app`
  --    ไม่มี = โยน = **rollback ทั้งก้อน = การซ่อมไม่ลง** ซึ่งคือปัญหาที่บล็อกนี้เพิ่งถูกแก้ให้พ้น
  -- 🎯 ***"ของที่จำเป็นต้องไม่ขึ้นกับของที่ดีถ้ามี" ใช้กับตัวมันเองด้วย —
  --    และผมเกือบพิสูจน์ข้อนั้นด้วยการละเมิดมันในบรรทัดถัดไป***
  -- ⇒ ปลายทางที่สองเป็น *ของแถมของของแถม* · ล้มได้ ต้องไม่ลากใครไปด้วย
  begin
    create table if not exists app.migration_probe (
      version     text primary key,
      observed_at timestamptz not null default now(),
      note        text not null
    );
    insert into app.migration_probe (version, note)
    values ('20260904150000',
            format('ก่อนแก้: grant=%s policy=%s 120000_recorded=%s', v_grant, v_policy, v_recorded))
    on conflict (version) do update set note = excluded.note, observed_at = now();
  exception when others then
    -- เขียนไม่ได้ก็ไม่เป็นไร · `notice` ข้างบนยังออก และการซ่อมยังลง
    raise notice 'ก่อนแก้ · เขียน app.migration_probe ไม่ได้ (%) — ใช้ notice ข้างบนแทน', sqlerrm;
  end;
end $before$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ของที่ควรลงตั้งแต่ `…120000` — เนื้อเดียวกันเป๊ะ
-- ───────────────────────────────────────────────────────────────────────────
-- `can_write_trip` ตัวเดียวกับ `trip_days_insert`/`_update` ⇒ **ไม่มีเกณฑ์สิทธิ์ใหม่ให้ดูแล**
-- editor ที่เพิ่มวันได้ ก็ถอนวันได้ (สมมาตร) · ส่วนการแก้ `trips.start_date` ยังเป็น `owner` เหมือนเดิม
drop policy if exists trip_days_delete on public.trip_days;
create policy trip_days_delete on public.trip_days
  for delete to authenticated
  using (app.can_write_trip(trip_id));

grant delete on public.trip_days to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. assert — ฝั่งบวก และฝั่งควบคุมที่ยืนยันว่าไม่ได้เปิดเกิน
-- ───────────────────────────────────────────────────────────────────────────
do $assert$
begin
  if not has_table_privilege('authenticated', 'public.trip_days', 'DELETE') then
    raise exception 'assert ล้ม: authenticated ยัง delete trip_days ไม่ได้';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='trip_days' and policyname='trip_days_delete') then
    raise exception 'assert ล้ม: ไม่มี policy trip_days_delete — grant อย่างเดียวลบไม่ได้เพราะ RLS เปิดอยู่';
  end if;

  -- 🔴 เคสควบคุมของมติเดิม — ไฟล์นี้ต้อง **ไม่** ทำให้ลบทริปได้ (`20260824043822:273`)
  if has_table_privilege('authenticated', 'public.trips', 'DELETE') then
    raise exception 'assert ล้ม: authenticated ลบ trips ได้ — ขัดมติที่ต้องเป็น soft delete';
  end if;

  -- ✅ และยืนยันว่าครึ่งที่ *ลงไปแล้ว* ยังอยู่ครบ — ใบนี้ต้องไม่ทำให้ของเดิมหาย
  if not has_column_privilege('authenticated', 'public.trips', 'start_date', 'UPDATE') then
    raise exception 'assert ล้ม: grant update (start_date) หายไป — ใบนี้ไม่ควรแตะมัน';
  end if;
end $assert$;

commit;
