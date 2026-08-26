-- ═══════════════════════════════════════════════════════════════════════════
-- `E3-AC7` — **พิสูจน์ว่ามันบล็อกจริง รวมทางที่ `revoke` ปิดไม่ได้**
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- P6: *"เกณฑ์เขียนว่า 'ไม่มีทางเดินอ้อม แม้ผ่าน RPC' — ประโยคนั้นเป็นสิ่งที่ต้องพิสูจน์
--      ไม่ใช่สิ่งที่ประกาศ · ถ้าไม่มีเคสนั้น เราจะได้ read-only ที่พิสูจน์แล้วเฉพาะทางที่ไม่มีใครใช้"*
--
-- 🔴 **ทั้งหมดอยู่ในทรานแซกชันเดียว และคืนโหมดเป็นปิดก่อน `commit` เสมอ**
--    ฐานนี้ใช้ร่วมกัน 8 เซสชัน — เปิดโหมดค้างไว้ = ชุดสดของคนอื่นแดงโดยไม่มีใครรู้ว่าทำไม
--    (และตัวที่จะบอกเขาได้ — ชุดสดประกาศโหมดเอง — **ยังไม่มี** เป็นของค้างที่จดไว้)
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

-- ฟังก์ชัน definer ที่เขียนจริง — รูปเดียวกับ `soft_delete_*` ทั้ง 6 ตัว
-- (ชื่อเดียวกับ probe ของ `20260826182000` · ขึ้นทะเบียนใน `schemaPins` แล้ว)
create or replace function app.probe_definer_write(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.trip_stops set note = note where id = p_id;
end $$;

do $proof$
declare
  v_id  uuid;
  v_err text;
  hit   boolean;
begin
  select id into v_id from public.trip_stops limit 1;
  if v_id is null then
    raise exception 'trip_stops ว่าง — พิสูจน์ไม่ได้ และ "ไม่มีอะไรให้พิสูจน์" ไม่ใช่ "ผ่าน"';
  end if;

  -- ══ ทิศบวก ① โหมดปิดอยู่ → เขียนได้ตามปกติ ══════════════════════════════
  -- 🔴 ถ้าไม่มีข้อนี้ ด่านที่บล็อก *ทุกอย่างตลอดเวลา* จะดูเหมือนทำงานถูก
  update public.trip_stops set note = note where id = v_id;
  perform app.probe_definer_write(v_id);

  -- ══ เปิดโหมด · ไม่อนุญาต maintenance write ═══════════════════════════════
  update app.system_mode
     set read_only = true, allow_maintenance_write = false, reason = 'พิสูจน์ E3-AC7';

  -- ทิศลบ ② เขียนตรง ต้องถูกบล็อก
  hit := false;
  begin
    update public.trip_stops set note = note where id = v_id;
  exception when sqlstate 'PT503' then hit := true;
  end;
  if not hit then raise exception 'ด่านไม่ทำงาน: เขียนตรงยังผ่านตอนโหมดเปิด'; end if;

  -- 🔴 ทิศลบ ③ **ผ่าน `security definer` — ทางที่ `revoke` ปิดไม่ได้ นี่คือข้อที่สำคัญที่สุด**
  hit := false;
  begin
    perform app.probe_definer_write(v_id);
  exception when sqlstate 'PT503' then hit := true;
  end;
  if not hit then
    raise exception 'ด่านไม่ทำงานบนทาง definer — ซึ่งเป็นทางที่ผู้ใช้ลบของจริงทั้งหมด';
  end if;

  -- ทิศลบ ④ ประกาศ GUC อย่างเดียว **ยังไม่พอ** เพราะตารางไม่อนุญาต
  hit := false;
  begin
    perform set_config('app.maintenance_write', 'on', true);
    update public.trip_stops set note = note where id = v_id;
  exception when sqlstate 'PT503' then hit := true;
  end;
  if not hit then
    raise exception 'GUC อย่างเดียวเปิดประตูได้ — เงื่อนไขที่สองไม่ทำงาน (ข้อเสนอของ P6 พัง)';
  end if;
  perform set_config('app.maintenance_write', 'off', true);

  -- ══ ทิศบวก ⑤ ครบสองเงื่อนไข → ผ่าน (ทางที่ `E7` จะเดิน) ═══════════════════
  update app.system_mode set allow_maintenance_write = true;
  perform set_config('app.maintenance_write', 'on', true);
  update public.trip_stops set note = note where id = v_id;
  perform app.probe_definer_write(v_id);
  perform set_config('app.maintenance_write', 'off', true);

  -- ทิศลบ ⑥ อนุญาตแล้วแต่ไม่ประกาศ GUC → ยังบล็อก
  hit := false;
  begin
    update public.trip_stops set note = note where id = v_id;
  exception when sqlstate 'PT503' then hit := true;
  end;
  if not hit then
    raise exception 'ตารางอนุญาตอย่างเดียวเปิดประตูได้ — GUC ไม่ได้ถูกตรวจจริง';
  end if;

  -- ══ 🔴 คืนสภาพ **เสมอ** ═════════════════════════════════════════════════
  update app.system_mode
     set read_only = false, allow_maintenance_write = false, reason = null;
end $proof$;

drop function app.probe_definer_write(uuid);

-- 🔴 กันความผิดพลาดของตัวเอง: ถ้าบล็อกข้างบนออกก่อนถึงบรรทัดคืนสภาพด้วยเหตุใดก็ตาม
--    ทั้งทรานแซกชันจะ rollback อยู่แล้ว · ข้อนี้กันกรณีที่มันไม่ rollback
do $final$
begin
  if exists (select 1 from app.system_mode where read_only) then
    raise exception 'โหมด read-only ยังเปิดค้างอยู่ตอนจบไฟล์ — หยุดทั้งไฟล์';
  end if;
end $final$;

commit;
