-- ═══════════════════════════════════════════════════════════════════════════
-- ① ปิดที่ชั้น default ไม่ใช่ชั้นตาราง (P4) · ② ตารางทดลองตอบคำถามของ P5 เรื่อง `Q3`
-- เจ้าของ: P1-Lead · 25 ส.ค. 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ══ ① `TRUNCATE` — P4 ชี้ว่าทางที่ผมทำเมื่อชั่วโมงก่อนคือ whack-a-mole ═══════
-- **หลักฐานอยู่ในตัวเลขที่ผมส่งให้เขาเอง:** `custom_places` = `MAINTAIN,REFERENCES,TRIGGER,TRUNCATE`
-- 🎯 **`custom_places` ไม่มี `grant … to service_role` อยู่ในไฟล์ไหนเลยสักบรรทัด**
--    → สิทธิ์ 4 ตัวนั้น **ไม่ได้มาจากเรา** มันมาจาก default privileges ของ Supabase ตอน `create table`
--    · `identity.sql:91` ทำ `alter default privileges … revoke all on tables from anon, authenticated`
--      — **ไม่มี `service_role` อยู่ในบรรทัดนั้น**
--
-- 🔴 **แปลว่า: ถอนทีละตารางวันนี้ แล้วตารางถัดไปของ `E3`/`E5` จะมาพร้อม `TRUNCATE` อีก
--    และไม่มีอะไรบอกใครเลย** — เป็น `P-30` เป๊ะ ๆ อีกรอบ:
--    **เงื่อนไขที่ด่านตรวจ ถูกผลิตใหม่โดยสิ่งที่ด่านกำลังกัน**
--
-- ✅ **ปิดที่ชั้น default:** `grant` ที่เขียนไว้ในข้อยกเว้นที่ 2/3/4/5 กลายเป็น**แหล่งสิทธิ์เดียว**
--    ของ `service_role` → **ทะเบียนใน `TEAM.md` เป็นจริงตามตัวอักษร** ซึ่งคือสิ่งที่ไล่แก้กันมาทั้งวัน
--
-- ⚠️ **ความจริงอีกด้านที่ P4 บอกครบ และผมยกมาเพราะมันสำคัญ:**
--    **ความเสี่ยงจริงของ `TRUNCATE` ผ่านคีย์ ≈ 0** — **PostgREST ไม่มี verb ที่แปลเป็น `TRUNCATE` เลย**
--    `MAINTAIN`/`REFERENCES`/`TRIGGER` เป็น DDL ยิ่งเข้าไม่ถึง
--    → **ข้อนี้ไม่ใช่การปิดช่องโหว่ · มันคือการทำให้ทะเบียนตรงกับของจริง** · ราคาถูก ผลถาวร ไม่ด่วน
--
-- 📌 **ไม่กวาดตารางเดิม 18 ใบในไฟล์นี้** — P6 เตือนว่าข้อยกเว้น 2/4/5 พึ่ง `service_role DELETE`
--    และ `revoke all` แล้ว re-grant รวดเดียวจะพังทันทีถ้าลำดับพลาด **ขณะที่ชุดสดกำลังไม่เสถียร**
--    · `TRUNCATE` ซึ่งเป็นสมาชิกที่อันตรายจริง **ถอนไปแล้วทุกใบเมื่อคอมมิตก่อน**
--    · ที่เหลือ (`MAINTAIN`/`REFERENCES`/`TRIGGER`) รอหลังทริป ตามที่ P6 เสนอ
--
-- ══ ② ตารางทดลอง — ตอบคำถามที่ P5 ขอให้ยืนยัน ไม่ใช่ให้เชื่อ ════════════════
-- P5 อนุมานว่า: `cache_writer` เป็น role ธรรมดา → **RLS บังคับกับมันเหมือนทุกคน**
-- → **0 policy = 0 แถว** → **grant ผ่านหมด แล้วโดนปฏิเสธที่ด่านถัดไป**
-- → ถ้าจริง ตัวเลือก (ค) ของ `Q3` **ต้องมี `create policy … to cache_writer`**
--   = แคชจะเลิกเป็น "ตารางที่มี 0 policy" ซึ่งเป็นสิ่งที่ `e2_caches.sql:169` สั่งให้เฝ้า
--
-- 🔴 **P5 เขียนเองว่า "ผมรันกับฐานไม่ได้ ข้อนี้เป็นการอนุมานจากกลไก · ถ้าผมผิด ผมอยากรู้
--    ก่อนที่ `Q3` จะถูกเขียนโดยอิงข้อนี้"** — และวันนี้เราเจอมาแล้ว 2 ครั้งว่าอนุมานที่ฟังดูถูก
--    พาไปผิดที่ (`§16.1` ของ P5 เอง · `§11.18` ของ P7) → **ยิงจริง**
--
-- ⚠️ **ทดลองบนตารางใหม่ ไม่ใช่บนแคช** — แตะแคชแม้ชั่วคราวคือการเปิด `P-33` ชั่วคราว
--    และ P4 กำลังรันชุดสดอยู่ **จะทำให้เคสของเขาแดงโดยไม่มีใครรู้ว่าทำไม**
-- 📌 ตารางนี้ **ต้องถูกลบในคอมมิตถัดไปทันทีที่วัดเสร็จ** — เขียนไว้ตรงนี้เพื่อไม่ให้มันค้าง
--
-- ── rollback ──────────────────────────────────────────────────────────────
--   alter default privileges in schema public grant all on tables to service_role;
--   drop table if exists public.rls_force_probe;
-- ═══════════════════════════════════════════════════════════════════════════

begin;

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
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: app.project_identity มีอยู่ แต่ไม่ใช่ engine-dev';
  end if;
end $guard$;

-- ── ① ตารางที่เกิดหลังจากนี้ ไม่ได้อะไรจาก default อีกต่อไป ────────────────
alter default privileges in schema public revoke all on tables from service_role;

-- ── ② ตารางทดลองของ P5 ─────────────────────────────────────────────────────
create table public.rls_force_probe (
  id   int primary key,
  note text not null
);
insert into public.rls_force_probe values (1, 'แถวนี้มีอยู่จริง — ถ้าอ่านไม่เห็น แปลว่า RLS กัน ไม่ใช่ตารางว่าง');

alter table public.rls_force_probe enable  row level security;
alter table public.rls_force_probe force   row level security;
-- 🔴 **ไม่มี policy สักตัว** — เหมือนแคชทั้ง 4 ใบเป๊ะ

-- 🎯 หัวใจของการทดลอง: **ให้ grant ครบ แล้วดูว่ายังอ่านได้ไหม**
--    ถ้าอ่านไม่ได้ = **grant ผ่าน แต่ RLS ปฏิเสธ** = P5 ถูก และ `Q3` ทาง (ค) ต้องมี policy
grant select on public.rls_force_probe to authenticated;
grant select on public.rls_force_probe to service_role;

comment on table public.rls_force_probe is
  '🔬 ตารางทดลองชั่วคราว — ตอบคำถามของ P5: role ธรรมดาที่มี grant ครบ แต่ตารางมี force RLS + 0 policy '
  'อ่านได้หรือไม่ · ผลกระทบ: ตัวเลือก (ค) ของ Q3 (cache_writer) ต้องมี policy หรือไม่ '
  '🔴 ต้องถูก drop ในคอมมิตถัดไปทันทีที่วัดเสร็จ ห้ามค้าง';

commit;
