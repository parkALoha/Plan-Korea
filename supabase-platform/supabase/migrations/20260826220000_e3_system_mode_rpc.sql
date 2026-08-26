-- ═══════════════════════════════════════════════════════════════════════════
-- `E3-AC7` — ทางเปิด/ปิดโหมด · และถอน trigger ออกจากตารางที่ไม่ใช่ของเรา
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · P4 ยิงแล้วพบทั้งสองข้อ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ① ทำไมต้องมี RPC ทั้งที่ "เปิดไม่ได้จากไคลเอนต์" เป็นคุณสมบัติที่ดี ────────
-- P4 พยายามวัด HTTP status ของ `PT503` และเคส RPC 7 ตัว **แล้ววัดไม่ได้เลย**
-- เพราะ **ไม่มีทางเปิดโหมดนอกจาก migration/psql**
-- 🔴 **การที่วัดไม่ได้ ไม่ได้แปลว่ามันปลอดภัย — มันแปลว่าเราไม่รู้**
--    บทพิสูจน์ที่มีอยู่จับ `sqlstate 'PT503'` **ในทรานแซกชัน ไม่เคยผ่านชั้น PostgREST เลยสักครั้ง**
--    → *"`PTxxx` → HTTP `xxx`"* ยังเป็น **คำเชื่อ 100%**
-- · และ P6 รันจาก CI ซึ่ง**ไม่มี `psql`** → ถ้าไม่มี RPC **ฟีเจอร์นี้เปิดใช้จริงไม่ได้เลย**
--
-- ⚠️ **RPC นี้คือพื้นผิวโจมตีใหม่ และผมรู้ตัว** — P4 จะยิงมันทันทีที่ลง · สามชั้น:
--   ⓐ `revoke execute from public, anon, authenticated` · `grant` ให้ `service_role` เท่านั้น
--   ⓑ 🔴 **ปฏิเสธถ้ามีบริบทผู้ใช้ (`auth.uid()` ไม่ null) แม้ผู้เรียกจะมีสิทธิ์**
--      → ต่อให้ `grant` รั่ววันหนึ่ง คำขอที่มาจากเบราว์เซอร์ก็ยังเรียกไม่ได้
--      **หลักการเดียวกับตัวด่านเอง — ไม่ได้คิดท่าใหม่ให้ต้องพิสูจน์แยก**
--   ⓒ อยู่ใน `public` แต่**ไม่คืนอะไรที่ไคลเอนต์ไม่ควรรู้** (คืนสถานะที่เพิ่งตั้ง)
--
-- ── ② `spatial_ref_sys` — trigger ไปเกาะตารางของ PostGIS (P4 พบ) ────────────
-- ผมวนจาก `pg_class` เพื่อไม่ให้พลาดตารางใหม่ · **แต่มันกวาดตารางของ extension มาด้วย**
-- วันนี้ไม่มีใครเขียน `spatial_ref_sys` — **แต่ถ้า PostGIS อัปเดตตัวเองตอนโหมดเปิด มันจะถูกบล็อก**
-- 🎯 **ตัวกรองที่ถูกไม่ใช่ "รายชื่อที่เราพิมพ์" (ซึ่งคนลืมเติม) แต่คือ "ตารางนี้เป็นของ extension หรือเปล่า"**
--    ถามจาก `pg_depend` — **ตารางใหม่ของเรายังได้ trigger อัตโนมัติเหมือนเดิม**
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

-- ── ① ถอน trigger ออกจากตารางของ extension แล้วติดใหม่ให้เฉพาะของเรา ───────
do $attach$
declare r record;
begin
  for r in
    select c.oid, c.relname,
           exists (
             select 1 from pg_catalog.pg_depend d
              where d.objid = c.oid and d.classid = 'pg_class'::regclass and d.deptype = 'e'
           ) as from_extension
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    execute format('drop trigger if exists zz_read_only_guard on public.%I', r.relname);
    if not r.from_extension then
      execute format(
        'create trigger zz_read_only_guard before insert or update or delete on public.%I
           for each row execute function app.deny_write_when_read_only()', r.relname);
    end if;
  end loop;
end $attach$;

-- ── ② ทางเปิด/ปิดโหมด ──────────────────────────────────────────────────────
create or replace function public.set_system_mode(
  p_read_only               boolean,
  p_allow_maintenance_write boolean default false,
  p_reason                  text    default null
)
returns table (read_only boolean, allow_maintenance_write boolean, reason text)
language plpgsql security definer set search_path = '' as $$
begin
  -- 🔴 ชั้น ⓑ — บริบทผู้ใช้ = ปฏิเสธ แม้ผู้เรียกจะมีสิทธิ์เรียก
  --    ด่านนี้ไม่ได้แทน `grant` มันซ้อนกับ `grant` เพื่อให้ `grant` รั่วแล้วยังไม่พอ
  if auth.uid() is not null then
    raise exception
      using errcode = 'PT403',
            message = 'สลับโหมดของระบบจากคำขอของผู้ใช้ไม่ได้',
            hint    = 'system_mode_user_context';
  end if;

  update app.system_mode
     set read_only               = p_read_only,
         -- 🔴 ปิดโหมด = ปิดหน้าต่างยกเว้นเสมอ · ไม่ให้ค้างไว้โดยไม่มีใครสังเกต
         allow_maintenance_write = p_read_only and p_allow_maintenance_write,
         reason                  = case when p_read_only then p_reason else null end,
         changed_at              = now(),
         changed_by              = current_user;

  return query
    select m.read_only, m.allow_maintenance_write, m.reason from app.system_mode m;
end $$;

revoke all on function public.set_system_mode(boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_system_mode(boolean, boolean, text) to service_role;

comment on function public.set_system_mode(boolean, boolean, text) is
  'E3-AC7 — เปิด/ปิดโหมดอ่านอย่างเดียว · service_role เท่านั้น + ปฏิเสธถ้ามี auth.uid() '
  'มีเพราะถ้าเปิดโหมดไม่ได้จากที่ไหนเลย เราจะพิสูจน์ไม่ได้ว่ามันบล็อกอะไรจริง (P4 · 26 ส.ค. 2026) '
  'และ P6 รันจาก CI ที่ไม่มี psql';

-- ── ③ ยืนยัน ──────────────────────────────────────────────────────────────
do $verify$
declare n int;
begin
  -- trigger ต้องอยู่ครบทุกตารางของเรา และ **ไม่อยู่** บนตารางของ extension
  select count(*) into n
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
   where c.relkind = 'r'
     and not exists (
       select 1 from pg_catalog.pg_depend d
        where d.objid = c.oid and d.classid = 'pg_class'::regclass and d.deptype = 'e')
     and not exists (
       select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = c.oid and t.tgname = 'zz_read_only_guard' and not t.tgisinternal);
  if n > 0 then raise exception 'มีตารางของเรา % ใบที่ไม่มี trigger', n; end if;

  select count(*) into n
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
   where c.relkind = 'r'
     and exists (
       select 1 from pg_catalog.pg_depend d
        where d.objid = c.oid and d.classid = 'pg_class'::regclass and d.deptype = 'e')
     and exists (
       select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = c.oid and t.tgname = 'zz_read_only_guard' and not t.tgisinternal);
  if n > 0 then raise exception 'trigger ยังเกาะตารางของ extension อยู่ % ใบ', n; end if;

  -- 🔴 ทิศบวกของ RPC เอง: เปิดแล้วต้องเปิดจริง · ปิดแล้วต้องปิดจริง
  perform public.set_system_mode(true, true, 'ยืนยัน RPC');
  if not exists (select 1 from app.system_mode where read_only and allow_maintenance_write) then
    raise exception 'RPC เปิดโหมดไม่ติด';
  end if;

  -- 🔴 ปิดโหมดต้องล้างหน้าต่างยกเว้นด้วย ไม่ใช่แค่ `read_only`
  perform public.set_system_mode(false, true, 'ควรถูกละทิ้ง');
  if exists (select 1 from app.system_mode
              where read_only or allow_maintenance_write or reason is not null) then
    raise exception 'ปิดโหมดแล้วยังมีสถานะค้าง';
  end if;
end $verify$;

commit;
