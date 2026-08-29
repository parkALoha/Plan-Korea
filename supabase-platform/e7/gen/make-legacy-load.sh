#!/usr/bin/env bash
# ┌───────────────────────────────────────────────────────────────────────────┐
# │ E7 · ขั้น 0.5 — สร้างไฟล์โหลด `legacy.*` ขึ้น engine-dev                     │
# └───────────────────────────────────────────────────────────────────────────┘
#
# 🔴 **ไฟล์ผลลัพธ์ห้าม commit ขึ้น git เด็ดขาด**
#    มันมี `custom_places` ทั้งตาราง ซึ่งรวม `home-base` = **ที่อยู่จริงของเจ้าของทริป**
#    `data/transferPoints.ts:21-23` เขียนไว้เองว่าจงใจไม่ให้ที่อยู่นั้นอยู่ในไฟล์ที่ commit
#    → สคริปต์นี้ commit ได้ (เป็นสูตร) · ผลลัพธ์เขียนลง /tmp เท่านั้น
#
# ทำไมต้องมีไฟล์นี้: ก้อน E7 ทั้ง 9 อ่าน `legacy.*` แต่ไม่มีเอกสารไหนบอกว่า schema นั้น
# ขึ้นไปอยู่บน engine-dev ได้ยังไง · ท่าของสนามซ้อม (`alter schema public rename to legacy`)
# ใช้ไม่ได้เพราะ `public` บน engine-dev มีสคีมาแพลตฟอร์มอยู่
#
# ต้องมี: สนามซ้อมในเครื่องรันอยู่ (`scripts/e7-local-rehearsal.sh`) และมี `legacy.*` ครบ 14 ตาราง
set -euo pipefail

PORT=${PORT:-55432}
OUT=${OUT:-/tmp/legacy-load.sql}
PG=${PG:-/opt/homebrew/opt/postgresql@17/bin}
[ -x "$PG/pg_dump" ] || PG="$(dirname "$(command -v pg_dump)")"

n=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -Atc \
     "select count(*) from information_schema.tables where table_schema='legacy'")
[ "$n" = "14" ] || { echo "❌ สนามซ้อมมี legacy $n ตาราง ต้องเป็น 14 — รัน e7-local-rehearsal.sh ก่อน"; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# 🔴 เขียนหัวไฟล์ก่อน — ด่านสามชั้น ยิงพิสูจน์แล้วทั้งสามทิศ (29 ส.ค. 2026)
cat > "$tmp/head.sql" <<'HEAD'
do $guard$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='app' and table_name='project_identity') then
    raise exception 'ผิดโปรเจกต์: ไม่มี app.project_identity → ไม่ใช่ engine-dev';
  end if;
  if not exists (select 1 from app.project_identity
                 where name='plan-korea-platform' and ref='pmvxwcimjebogjfimzqy' and environment='dev') then
    raise exception 'ผิดโปรเจกต์: app.project_identity ไม่ใช่ engine-dev';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='legacy') then
    raise exception 'มี schema legacy อยู่แล้ว (% ตาราง) — ถ้าจะโหลดใหม่ต้อง drop เองก่อน โดยตั้งใจ',
      (select count(*) from information_schema.tables where table_schema='legacy');
  end if;
end $guard$;

create schema legacy;
HEAD

"$PG/pg_dump" -h 127.0.0.1 -p "$PORT" -U postgres -d rehearsal -n legacy \
  --no-owner --no-privileges -f "$tmp/body.sql"

# 🔴 `SET transaction_timeout` เป็นของ PG17 — Supabase อาจเป็นรุ่นเก่ากว่า แล้วจะ error ที่บรรทัดแรก
# 🔴 `CREATE SCHEMA legacy` ของ pg_dump ต้องออก เพราะหัวไฟล์สร้างเองหลังผ่านด่านแล้ว
sed -i '' '/^SET transaction_timeout/d;/^CREATE SCHEMA legacy;/d' "$tmp/body.sql" 2>/dev/null \
  || sed -i '/^SET transaction_timeout/d;/^CREATE SCHEMA legacy;/d' "$tmp/body.sql"

cat "$tmp/head.sql" "$tmp/body.sql" > "$OUT"

echo "✅ $OUT"
echo "   $(wc -l < "$OUT" | tr -d ' ') บรรทัด · $(du -h "$OUT" | cut -f1)"
echo "   CREATE TABLE $(grep -c '^CREATE TABLE' "$OUT") · COPY $(grep -c '^COPY legacy' "$OUT")"
echo "🔴 ห้าม commit ไฟล์นี้ — มีที่อยู่จริงของเจ้าของทริปอยู่ใน custom_places"
