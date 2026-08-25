-- ═══════════════════════════════════════════════════════════════════════════
-- `P-37` — P1 ทำ `P-50` ซ้ำ **ภายในการแก้ `P-50` เอง** · แก้ให้ถูกชั้น
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 **สิ่งที่เพิ่งเกิด — ห่างจาก `P-50` สิบนาที และเป็นความพลาดชนิดเดียวกันเป๊ะ:**
--   P4 ชี้ว่า harness อ่าน `app.unsafe_state` ไม่ได้ · P1 แก้ด้วย RPC (ถูก)
--   แล้ว P1 คิดต่อว่า *"harness ควรตั้งธงเองได้ด้วย จะได้ทดสอบทางที่ธงถูกตั้ง"* (ถูก)
--   🔴 **แล้วแก้ด้วย `grant insert, delete on app.unsafe_state to service_role` — ซึ่งไม่ช่วยอะไรเลย**
--
--   ```
--   admin.from("unsafe_state").insert(...)             → PGRST205 (มองหาใน public)
--   admin.schema("app").from("unsafe_state").insert()  → PGRST106 Invalid schema: app
--   ```
--   🎯 **PostgREST เอื้อมไม่ถึง schema `app` ไม่ว่าจะ grant อะไรก็ตาม**
--      **ปัญหาไม่เคยเป็นเรื่องสิทธิ์ — มันเป็นเรื่องเส้นทาง** และ P1 แก้ที่ชั้นที่ไม่ใช่ปัญหา
--
--   📌 **ชนิดของความพลาด: เจอกำแพงแล้วเดาว่าเป็นเรื่องสิทธิ์ เพราะสิทธิ์คือสิ่งที่เพิ่งแก้ไปทั้งวัน**
--      · และ **`grant` ที่ไม่ช่วยอะไร ไม่ส่งเสียงบอกว่ามันไม่ช่วย** — มันสำเร็จเงียบ ๆ
--      · จับได้เพราะ **ทดสอบก่อนส่งให้ P4** ไม่ใช่เพราะอ่านซ้ำแล้วเห็น
--
-- ── แก้ 2 อย่าง ────────────────────────────────────────────────────────────
--   ① ถอน grant ที่ไร้ประโยชน์ทิ้ง — **"อย่า grant สิ่งที่ยังไม่ต้องใช้" (กฎร่วมข้อ 5)**
--      สิทธิ์ที่ให้ไปโดยไม่ได้ผล ยังเป็นสิทธิ์ที่ให้ไปอยู่ดี
--   ② เปิดทางที่ถูกชั้น: RPC `set`/`clear` แบบ definer ให้ `service_role` เท่านั้น
--      → harness ทดสอบ **ทางที่ธงถูกตั้ง** ได้จริง ไม่ใช่ทดสอบได้แค่ตอนธงว่าง
--
-- ⚠️ **ของที่ยอมรับ:** มีฟังก์ชันที่ตั้งธง "ฐานไม่ปลอดภัย" ได้จาก harness
--    ผลเสียสูงสุดคือ **ชุดเทสต์แดงดังทุกรอบจนมีคนเก็บ** — ทิศที่ปลอดภัย และเป็นพฤติกรรมที่ธงออกแบบมาให้เป็น
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   drop function if exists public.unsafe_state_set(text, text);
--   drop function if exists public.unsafe_state_clear();
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity ไม่ตรงกับ engine-dev';
  end if;
exception
  when undefined_table then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ฐานนี้ไม่ใช่ engine-dev';
end $guard$;

-- ① ถอนสิทธิ์ที่ให้ไปแล้วไม่ได้ผล
revoke insert, delete on app.unsafe_state from service_role;

-- ② ทางที่ถูกชั้น
create function public.unsafe_state_set(p_reason text, p_note text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.unsafe_state (reason, note)
  values (p_reason, p_note)
  on conflict (singleton) do update
    set reason = excluded.reason, note = excluded.note, started_at = now();
$$;

create function public.unsafe_state_clear()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from app.unsafe_state;
$$;

-- 🔴 `P-32` ครบทั้งสามชื่อ — `from public` อย่างเดียวไม่ถอนสิทธิ์ที่ให้ตามชื่อ
revoke execute on function public.unsafe_state_set(text, text) from public, anon, authenticated;
revoke execute on function public.unsafe_state_clear()          from public, anon, authenticated;
grant  execute on function public.unsafe_state_set(text, text)   to service_role;
grant  execute on function public.unsafe_state_clear()           to service_role;

commit;
