-- ═══════════════════════════════════════════════════════════════════════════
-- ทางอ่านผลของ `app.role_probe` — `app` ไม่ถูก expose ผ่าน PostgREST โดยตั้งใจ
-- เจ้าของ: P1-Lead · 26 ส.ค. 2026 · `E3-AC7`
-- 🔴 **ผลการวัดที่อ่านไม่ได้ ก็ไม่ต่างจากไม่ได้วัด** — `P-50` ในรูปของหลักฐาน
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

create or replace function public.role_probe_result()
returns table (path text, cur_user text, sess_user text, guc_seen text)
language sql stable security definer set search_path = '' as $$
  select p.path, p.cur_user, p.sess_user, p.guc_seen
    from app.role_probe p order by p.at, p.path
$$;

revoke all on function public.role_probe_result() from public, anon, authenticated;
grant execute on function public.role_probe_result() to service_role;

commit;
