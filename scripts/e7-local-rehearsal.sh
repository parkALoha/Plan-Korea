#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# สนามซ้อม E7 ในเครื่อง — ฐานเก่า(สำเนาแช่แข็ง) + สคีมาใหม่(89 migration) ฐานเดียว
#
# ทำไมมี: E7-AC1/AC6 ต้องซ้อม migrate บน "โปรเจกต์ซ้อม" ซึ่งติดโควตา Supabase
#         สคริปต์นี้สร้างสนามเดียวกันในเครื่อง **โดยไม่แตะ Supabase สักคำสั่ง**
#         → พอได้โปรเจกต์จริง การซ้อมจะเป็น "การยืนยัน" ไม่ใช่ "การค้นพบ"
#
# 🔴 ไม่ใช่ของแทนโปรเจกต์ซ้อม — auth/storage เป็น stub · RLS ไม่ได้ทดสอบเต็มรูป
#    ใช้พัฒนา/ทดสอบ *สคริปต์ migrate* เท่านั้น
#
# ผลลัพธ์:  legacy.*  = 14 ตาราง 670 แถว (สำเนาแช่แข็ง)
#          public.*  = 27 ตาราง (สคีมาแพลตฟอร์ม)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
PG=${PG:-/opt/homebrew/opt/postgresql@17/bin}
WORK=${WORK:-/tmp/e7-rehearsal}
PORT=${PORT:-55432}
DUMP_SCHEMA=${DUMP_SCHEMA:-$HOME/trip-schema.sql}
DUMP_DATA=${DUMP_DATA:-$HOME/trip-data.sql}
MIG=${MIG:-$(cd "$(dirname "$0")/.." && pwd)/supabase-platform/supabase/migrations}
export LC_ALL=C LANG=C          # 🔴 ไม่ตั้ง = postmaster ตายตอน start บน macOS

[ -f "$DUMP_SCHEMA" ] || { echo "ไม่พบ $DUMP_SCHEMA"; exit 1; }
[ -d "$MIG" ]         || { echo "ไม่พบ $MIG"; exit 1; }

q() { "$PG/psql" -h 127.0.0.1 -p "$PORT" -U "$1" -d "$2" -v ON_ERROR_STOP=1 -q "${@:3}"; }

echo "▸ คลัสเตอร์ชั่วคราวที่ $WORK"
"$PG/pg_ctl" -D "$WORK/pgdata" stop >/dev/null 2>&1 || true
rm -rf "$WORK"; mkdir -p "$WORK"
"$PG/initdb" -D "$WORK/pgdata" --encoding=UTF8 --locale=C -U postgres >/dev/null
"$PG/pg_ctl" -D "$WORK/pgdata" -l "$WORK/pg.log" -o "-p $PORT -h 127.0.0.1" start >/dev/null
sleep 2

echo "▸ role — pgo ไม่ใช่ superuser โดยตั้งใจ (superuser bypass RLS → ด่านของ migration จะดูเหมือนพัง)"
q postgres postgres -c "
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create role supabase_admin nologin; create role authenticator nologin; create role supabase_auth_admin nologin;
  create role pgo login nosuperuser createdb createrole nobypassrls;
  grant anon, authenticated, service_role, supabase_admin to pgo;"
q postgres postgres -c "create database rehearsal owner pgo;"

echo "▸ restore สำเนาแช่แข็งเข้า public แล้วย้ายไป legacy"
q postgres rehearsal -c "drop schema public cascade;"
q postgres rehearsal --single-transaction -f "$DUMP_SCHEMA"
q postgres rehearsal --single-transaction -f "$DUMP_DATA"
q postgres rehearsal -c "
  alter schema public rename to legacy; create schema public; alter schema public owner to pgo;
  grant usage on schema legacy to pgo; grant select on all tables in schema legacy to pgo;"

echo "▸ stub ของ Supabase (สิ่งที่ migration พึ่งแต่ไม่ได้สร้างเอง)"
q postgres rehearsal <<'SQL'
create schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists btree_gist; create extension if not exists pgcrypto;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text,
  raw_user_meta_data jsonb, created_at timestamptz default now());
-- 🔴 ต้องอ่าน request.jwt.claims->>'sub' เหมือนของจริง — ฉบับแรกอ่าน request.jwt.claim.sub
--    ซึ่งเป็นคนละ setting และ migration ใบที่ 66 จับได้เอง
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
                  nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
create schema storage;
create table storage.buckets (id text primary key, name text not null, owner uuid, owner_id text,
  created_at timestamptz default now(), updated_at timestamptz default now(), public boolean default false,
  avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text, owner uuid, owner_id text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), metadata jsonb, path_tokens text[],
  version text, user_metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/') $$;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
grant usage on schema auth, storage, extensions to anon, authenticated, service_role, pgo;
grant all on schema auth, storage, extensions, supabase_migrations to pgo;
grant all on all tables in schema auth, storage, supabase_migrations to pgo;
alter schema auth owner to pgo; alter schema storage owner to pgo;
alter schema supabase_migrations owner to pgo; alter schema extensions owner to pgo;
alter table auth.users owner to pgo; alter table storage.buckets owner to pgo;
alter table storage.objects owner to pgo; alter table supabase_migrations.schema_migrations owner to pgo;
alter function auth.uid() owner to pgo; alter function auth.jwt() owner to pgo;
alter function storage.foldername(text) owner to pgo;
SQL

# seed ขั้นต่ำ — ใช้ country code สงวน zz (TEST_COUNTRY_CODES) จึง reap-safe
cat > "$WORK/seed.sql" <<'SQL'
do $$ declare city uuid; place uuid; begin
  insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','seed@local') on conflict do nothing;
  insert into catalog_countries(id,name_th,name_en) values ('zz','ทดสอบ','Testland') on conflict do nothing;
  insert into catalog_cities(country_id,name_th,name_en,lat,lng,timezone)
    values ('zz','เมืองทดสอบ','Testville',37.5,127.0,'Asia/Seoul') returning id into city;
  insert into catalog_places(city_id,category,lat,lng) values (city,'attraction',37.5,127.0) returning id into place;
  insert into trips(id,created_by,title,start_date,end_date)
    values ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-000000000001','seed trip','2026-10-11','2026-10-21');
  insert into trip_plans(id,trip_id,name) values ('00000000-0000-0000-0000-0000000000bb','00000000-0000-0000-0000-0000000000aa','seed plan');
  insert into trip_days(id,trip_id,date,city_id) values ('00000000-0000-0000-0000-0000000000cc','00000000-0000-0000-0000-0000000000aa','2026-10-11',city);
  insert into trip_stops(id,trip_id,plan_id,trip_day_id,rank,catalog_place_id)
    values ('00000000-0000-0000-0000-0000000000dd','00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000bb','00000000-0000-0000-0000-0000000000cc','n',place);
end $$;
SQL

echo "▸ ยิง migration ตามลำดับ"
n=0; ok=0
for f in "$MIG"/*.sql; do
  n=$((n+1)); v=$(basename "$f" | cut -d_ -f1); b=$(basename "$f")
  # 🔴 hook สองจุด — ไม่ใช่ workaround แต่เป็นเงื่อนไขที่ migration บังคับเอง
  case "$b" in
    *_e2_rank_shape_real_negative_test.sql)
      # ใบนี้ปฏิเสธที่จะผ่านถ้า trip_stops ว่าง ("ไม่มีอะไรให้ทดสอบ" ไม่ใช่ "ผ่าน")
      q postgres rehearsal -f "$WORK/seed.sql" >/dev/null ;;
    *_e5_drop_trip_cover_storage.sql)
      # ใบนี้บังคับให้ลบ bucket ผ่าน Storage API ก่อน — ในสนามจำลองลบจากตาราง stub แทน
      q postgres rehearsal -c "delete from storage.objects where bucket_id='trip-covers';
                               delete from storage.buckets where id='trip-covers';" >/dev/null ;;
  esac
  if out=$(q pgo rehearsal -f "$f" 2>&1); then
    ok=$((ok+1))
    q pgo rehearsal -c "insert into supabase_migrations.schema_migrations(version,name)
                        values ('$v','$b') on conflict do nothing;" >/dev/null
  else
    echo "🔴 ล้มที่ใบที่ $n : $b"; echo "$out" | grep -iE "error" | head -3; exit 1
  fi
done

echo
echo "▸ ตรวจสภาพ — ตัวเลขต้องตรง ไม่ใช่แค่ 'ไม่มี error'"
q postgres rehearsal -tA <<'SQL'
select 'legacy   ' || count(*) || ' ตาราง (ต้อง 14)' from pg_tables where schemaname='legacy';
select 'public   ' || count(*) || ' ตาราง' from pg_tables where schemaname='public';
select 'legacy   ' || sum(c) || ' แถว (ต้อง 670)' from (
  select (xpath('/row/c/text()', query_to_xml(format('select count(*) c from legacy.%I',tablename),false,true,'')))[1]::text::int c
  from pg_tables where schemaname='legacy') s;
select 'migration ' || count(*) || ' ใบ' from supabase_migrations.schema_migrations;
SQL
echo
echo "✅ สนามพร้อม — ต่อด้วย: $PG/psql -h 127.0.0.1 -p $PORT -U pgo -d rehearsal"
echo "   เก็บกวาด:   $PG/pg_ctl -D $WORK/pgdata stop && rm -rf $WORK"
