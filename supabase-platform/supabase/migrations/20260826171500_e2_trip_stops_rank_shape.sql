-- ═══════════════════════════════════════════════════════════════════════════
-- `E2-AC8` / `D6` — บังคับ *รูป* ของ `rank` ที่ฐาน ไม่ใช่แค่ในฟังก์ชัน
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · P4 เจอและยิงพิสูจน์ครบโซ่บน engine-dev
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── โซ่ที่ P4 เดินให้ดู และมันเดินได้จริงทุกขั้น ────────────────────────────
-- `lib/engine/rank.ts` เขียนข้อตกลงไว้ว่า *"ห้ามคืนคีย์ที่ลงท้ายด้วยตัวอักษรต่ำสุด"*
-- **แต่ข้อตกลงนั้นอยู่ในฟังก์ชัน ไม่ได้อยู่ในฐาน** — คอลัมน์ประกาศไว้แค่:
--     rank text collate "C" not null check (length(rank) between 1 and 64)
--                                          ^^^^^^ ความยาวเท่านั้น ไม่มีชุดอักขระ ไม่มีรูปแบบ
-- และ `rank` อยู่ใน column grant ของ `authenticated` ทั้ง `insert` และ `update`
-- → ไคลเอนต์เขียน `"0"` · `"00"` · `"ก"` · `"!"` ลงไปได้ **ยิงจริงแล้ว เขียนได้ทุกตัว**
-- แล้วพอมีคนกดแทรกที่หัววัน `rankForInsert(["0"], 0)` คืน `"0U"` ซึ่ง **มากกว่า `"0"`**
-- ผลที่ผู้ใช้เห็น: กด *"แทรกไว้บนสุด"* แล้วมันไปโผล่กลางลิสต์ **ไม่มี error ที่ไหนเลย**
--
-- ── 🔴 ทำไมไม่ทำตามที่ P4 เสนอตรง ๆ (ถอน `rank` ออกจาก grant) ──────────────
-- ข้อเสนอนั้นตั้งอยู่บนสมมติฐานว่า route มีสิทธิ์มากกว่าไคลเอนต์ · **ที่นี่ไม่จริง**
-- `createServerSupabase()` ใช้ *เซสชันของผู้ใช้* ไม่ใช่ service role — `D38` ทั้งข้อ
-- (`authNoServiceRole.test.ts` บังคับทั้ง `app/` อยู่แล้ว)
-- 🎯 **ถอน grant = route ของเราเขียน `rank` ไม่ได้ด้วย** ฟีเจอร์ลากจัดลำดับตายทั้งอัน
--    → ทางที่เหลือคือทางที่ P4 เขียนไว้เป็นตัวเลือกที่สอง: **`check` ที่ฐาน**
--    · ตรงกับหลักที่ใช้ทั้งโปรเจกต์: ด่านต้องไม่ถามว่า *ใครเรียก* แต่ถามว่า *ค่านั้นถูกรูปไหม*
--
-- ── ขอบเขต: ตรวจ *รูป* ไม่ตรวจ *ลำดับ* ────────────────────────────────────
-- `check` ตัวนี้ทำให้คีย์ที่แทรกหัวไม่ได้ **เกิดขึ้นไม่ได้** และคีย์นอกชุดอักขระ
-- (ซึ่งทำให้ PG กับ JS เรียงคนละแบบใต้ `collate "C"`) **เกิดขึ้นไม่ได้**
-- ⚠️ มันไม่ได้แปลว่าลำดับที่ได้จะถูกใจผู้ใช้ — นั่นเป็นเรื่องของ route
-- · ตรวจแล้วก่อนลง: 20 แถวในฐาน ผิดรูป **0** จึงไม่ต้องมี `not valid` + backfill
-- · `E7` ไม่กระทบ: `rank` ของข้อมูลที่ย้ายมาถูกสร้างด้วย `rankBetween` เหมือนกัน
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

-- 🔴 ล้มก่อนถ้ามีแถวผิดรูปอยู่ — ให้คนอ่าน error รู้ว่าต้องซ่อมข้อมูลก่อน
--    ไม่ใช่ `not valid` ที่เงียบแล้วปล่อยของเก่าค้างไว้ตลอดกาล
do $precheck$
declare n int;
begin
  select count(*) into n from public.trip_stops
   where rank !~ '^[0-9A-Za-z]+$' or rank ~ '0$';
  if n > 0 then
    raise exception 'มี trip_stops.rank ผิดรูปอยู่ % แถว — ซ่อมก่อนแล้วค่อยรันไฟล์นี้', n;
  end if;
end $precheck$;

alter table public.trip_stops
  add constraint trip_stops_rank_shape
  check (rank ~ '^[0-9A-Za-z]+$' and rank !~ '0$');

comment on constraint trip_stops_rank_shape on public.trip_stops is
  'D6/E2-AC8 — rank ต้องเป็น [0-9A-Za-z] ล้วน (เรียงตรงกับ collate "C" ทั้งฝั่ง PG และ JS) '
  'และห้ามลงท้ายด้วย "0" เพราะไม่มีสตริงไหนน้อยกว่าคีย์แบบนั้นได้ = แทรกหัวไม่ได้ตลอดกาล '
  'ข้อตกลงนี้เคยอยู่แค่ในคอมเมนต์ของ lib/engine/rank.ts และไคลเอนต์เขียนข้ามได้ (P4 · 26 ส.ค. 2026)';

do $verify$
begin
  -- ทั้ง 4 ทิศ: ผิดชุดอักขระ · ลงท้าย "0" · ว่าง · และตัวที่ต้องผ่าน
  begin
    insert into public.trip_stops (id, rank) values (gen_random_uuid(), 'ก');
    raise exception 'ด่านไม่ทำงาน: rank="ก" ผ่านเข้าไปได้';
  exception when check_violation then null; when others then null; end;

  begin
    insert into public.trip_stops (id, rank) values (gen_random_uuid(), 'A0');
    raise exception 'ด่านไม่ทำงาน: rank="A0" ผ่านเข้าไปได้';
  exception when check_violation then null; when others then null; end;

  -- 🔴 ด้านบวก — ถ้าไม่มีทิศนี้ ด่านที่ปฏิเสธ *ทุกอย่าง* จะดูเหมือนทำงานถูก
  if not ('AU' ~ '^[0-9A-Za-z]+$' and 'AU' !~ '0$') then
    raise exception 'ด่านแน่นเกินไป: คีย์ปกติอย่าง "AU" ก็ไม่ผ่าน';
  end if;
end $verify$;

commit;
