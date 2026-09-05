-- E5 · คืน execute บน app.search_norm ให้ service_role
--
-- 🔴 **ใบนี้ซ่อมสิ่งที่ `20260905020000` ทำพัง — ฐาน dev พังอยู่จริงตั้งแต่ใบนั้นถูกรัน**
--    อาการ: `permission denied for function search_norm` ทุกครั้งที่ service_role เขียน
--    `public.catalog_place_names` · จับได้จาก `rlsMatrix` (3 เคส) ไม่ใช่จากการอ่านโค้ด
--
-- ## ทำไมมันพัง — สองบรรทัดที่อยู่คนละไฟล์และไม่มีอะไรเชื่อมกัน
--   `20260825134043:185`  grant select, insert, update, delete on catalog_place_names to service_role
--   `20260826015533:72`   create index … on catalog_place_names using gin (app.search_norm(name) …)
--   ⇒ **ทุก insert/update ของตารางนี้ ประเมิน `app.search_norm` ⇒ ผู้เขียนต้องมี EXECUTE**
--   ก่อนหน้านี้ได้มาฟรีเพราะ `proacl = null` (= PUBLIC) · `20260905020000` ปิด PUBLIC
--   แล้วคืนให้ `authenticated` อย่างเดียว ⇒ **service_role หลุด**
--
-- 🎯 ***`revoke … from public` ไม่ได้ปิดแค่ช่อง — มันถอนสิทธิ์ของทุกคนที่เคยได้มา*โดยปริยาย* ด้วย***
--    **และคนที่เคยได้มาโดยปริยาย ไม่ปรากฏใน `git diff` และ `grep` หาไม่เจอ** — เพราะไม่เคยมี
--    บรรทัด `grant … to service_role` ให้หาตั้งแต่แรก · เป็นด้านกลับของกฎที่ `§3.5` จดไว้แล้วว่า
--    *"บรรทัดที่หายไป ไม่ปรากฏใน git diff"*
--
-- ## ทำไม assert ของใบก่อนไม่จับ
--    มันถาม 2 คำถาม: PUBLIC เรียกไม่ได้แล้วใช่ไหม (✅) · authenticated ยังเรียกได้ไหม (✅)
--    **ไม่มีคำถามว่า "แล้วใครอีกบ้างที่ต้องเรียกได้"** — ชุดที่ต้องนับคือ *ทุก role ที่เขียนตาราง
--    ที่มี index expression เรียกฟังก์ชันนี้* ซึ่งอ่านจากใบนั้นใบเดียวไม่มีทางรู้
--    · ⇒ assert ข้างล่างจึงยิง **ผ่าน role จริง** ไม่ใช่ถาม `has_function_privilege`
--      (`§3.5`: *สิทธิ์ = true ไม่ได้แปลว่าเรียกได้* · ที่นี่กลับกัน — ต้องพิสูจน์ว่าเรียกได้จริง)
--
-- ## ขอบเขต — ให้เท่าที่จำเป็น ไม่ให้เกิน
--    ให้เฉพาะ `search_norm` **ไม่ให้ `like_literal`** — `like_literal` ไม่อยู่ใน index expression
--    ใด ๆ (ใช้เฉพาะในตัว `public.search_place_names` ซึ่ง grant ให้ `authenticated` เท่านั้น)
--    ⇒ service_role ไม่มีเส้นทางไหนไปถึงมัน
--    · `anon` ไม่ต้องได้: `search_place_names` ไม่ได้ grant ให้ anon (`20260826023153:141-142`)
--      และ RPC สาธารณะ 3 ตัวของทะเบียนข้อ 9 ไม่มีตัวไหนเรียก `search_norm`
--
-- 📌 ทะเบียน `service_role` ข้อ 11 (`TEAM.md §3.5`) · ฟังก์ชันบริสุทธิ์ (immutable · text→text)
--    **ไม่แตะข้อมูลผู้ใช้ ไม่เพิ่มการเข้าถึงใด ๆ** — service_role มี insert บนตารางนั้นอยู่แล้ว (ข้อ 3)

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

grant execute on function app.search_norm(text) to service_role;

-- ── ทิศลบมาก่อน: ใบนี้ต้องไม่คืนสิ่งที่ใบก่อนตั้งใจปิด และต้องไม่ให้เกินที่จำเป็น ──────
--
-- 🔴 **บล็อกนี้ต้องอยู่ *ก่อน* บล็อกที่สลับ role — ฉบับก่อนวางไว้หลัง แล้วล้มจริง**
--    `ERROR: permission denied for schema app (SQLSTATE 42501) · At statement: 4`
--    เหตุ: `reset role` **ไม่ได้คืนเป็น role ที่กำลังรัน migration อยู่** — มันคืนเป็น `session_user`
--    ซึ่งคือ *login role ชั่วคราวที่ Supabase CLI สร้าง* (`Initialising login role…`) และ **ไม่มี USAGE บน `app`**
--    ⇒ `'app.search_norm(text)'::regprocedure` ที่ `has_function_privilege` ต้อง resolve **ล้มทันที**
--    🎯 ***`reset role` อ่านเหมือน "เลิกสวมบทบาท" แต่จริง ๆ คือ "กลับไปเป็น session_user" —
--       ซึ่งเท่ากับ role เดิมก็ต่อเมื่อไม่มีใคร `set role` มาก่อนเรา · ที่นี่ CLI ทำมาก่อนแล้ว***
--    ✅ จึงเก็บ `current_user` ไว้แล้วคืนด้วยชื่อจริง ไม่ใช้ `reset role` อีก

do $assert$
begin
  if has_function_privilege('public', 'app.search_norm(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: PUBLIC กลับมาเรียก app.search_norm ได้';
  end if;
  if has_function_privilege('anon', 'app.search_norm(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon เรียก app.search_norm ได้ — ไม่มีเส้นทางไหนต้องการ';
  end if;
  if has_function_privilege('service_role', 'app.like_literal(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: service_role ได้ like_literal ซึ่งไม่มีเส้นทางไหนต้องการ';
  end if;
  -- 🔴 ห้ามมีใครเปิด USAGE บน schema app ให้ service_role เพราะเข้าใจผิดจากใบนี้
  --    รอบที่ล้มพิสูจน์แล้วว่า **เส้นทาง index ไม่ต้องใช้มัน** (บล็อกข้างล่างผ่านไปก่อนบล็อกนี้จะล้ม)
  if has_schema_privilege('service_role', 'app', 'USAGE') then
    raise exception 'assert ล้ม: service_role ได้ usage on schema app — เส้นทาง index ไม่ต้องใช้ อย่าเปิด';
  end if;
end $assert$;

-- ── ทิศบวก: ยืนยันด้วย **เส้นทางที่ผู้เขียนจริงเดิน** ไม่ใช่ด้วยคิวรีสิทธิ์ ────────────
--
-- ✅ **เส้นทางจริงคือ index expression ซึ่งเก็บเป็น OID ⇒ ไม่ resolve ชื่อ ⇒ ไม่ตรวจ USAGE**
--    **พิสูจน์แล้วด้วยการยิงจริง ไม่ใช่การอนุมาน:** รอบ `db push` ที่ล้มด้วย statement 4
--    แปลว่า **statement 3 (บล็อกนี้) ผ่านไปแล้ว** — `service_role` insert สำเร็จทั้งที่ไม่มี USAGE บน `app`
--    · ก่อนหน้านั้น P4 อนุมานไว้ถูก จากข้อความ error ที่ว่า `permission denied for **function**`
--      (ไม่ใช่ `for schema`) — **แต่นั่นเป็นการอ่านข้อความ · อันนี้คือการเดินเส้นทางนั้นจริง**

do $assert$
declare
  v_role  text := current_user;   -- 🔴 เก็บไว้คืนเอง · `reset role` คืนผิดตัว (ดูบล็อกบน)
  v_city  uuid;
  v_place uuid;
begin
  select city_id, id into v_city, v_place from public.catalog_places limit 1;

  -- 🔴 ไม่มีแถวให้ยิง = **ต้องแดง ไม่ใช่ข้าม** — เคสที่ข้ามตัวเองเงียบ ๆ อ่านเป็นเขียว
  if v_place is null then
    raise exception 'assert ล้ม: ไม่มีแถวใน catalog_places ให้ยิงเส้นทางจริง — เคสนี้ห้ามถูกข้าม';
  end if;

  -- ① เส้นทางที่พังอยู่จริง: service_role เขียนตารางที่มี GIN index บน app.search_norm
  --    แถวโพรบถูกลบในทรานแซกชันเดียวกัน ⇒ ไม่เหลือของค้างไม่ว่าใบนี้จะ commit หรือ rollback
  set local role service_role;
  insert into public.catalog_place_names (place_id, city_id, locale, name, priority, source)
  values (v_place, v_city, 'zz', '__probe_search_norm__', 999, 'curated');
  delete from public.catalog_place_names
   where place_id = v_place and locale = 'zz' and priority = 999;
  execute format('set local role %I', v_role);

  -- ② authenticated ยังเรียกได้ด้วยชื่อ (role นี้ **มี** USAGE บน app) — ใบก่อนให้ไว้ ห้ามทำหาย
  set local role authenticated;
  perform app.search_norm('ทดสอบ Test');
  perform app.like_literal('100%');
  execute format('set local role %I', v_role);
exception
  when insufficient_privilege then
    execute format('set local role %I', v_role);
    raise exception 'assert ล้ม: เส้นทางเขียนคลังยังถูกปฏิเสธ — %', sqlerrm;
end $assert$;

commit;
