#!/usr/bin/env bash
# ด่านของ E0 — แยกออกมาเป็นสคริปต์เพื่อให้ "รันกับทรีจริง" และ "รันกับทรีจำลอง" ได้ด้วยโค้ดชุดเดียวกัน
#
# 🔴 เหตุผลที่ต้องแยก: ด่านที่ไม่เคยเห็นของผิด กับด่านที่พัง หน้าตาเหมือนกันเป๊ะ
#    การแยกทำให้ self-test ใน ci.yml พิสูจน์ได้ว่าด่านนี้ยังจับของผิดได้จริง ไม่ใช่ผ่านเพราะไม่มีอะไรให้จับ
#
# ใช้:  .github/guards.sh [ROOT]     (ค่าเริ่มต้น ".")
# คืน:  0 = ผ่าน · 1 = เจอของผิด
set -uo pipefail
ROOT="${1:-.}"
fail=0

# ref ของ DB ทริป — ประกอบจาก 2 ชิ้นเพื่อไม่ให้ไฟล์นี้ trip ด่านของตัวเอง
TRIP_REF="$(printf 'ejzibhgqhxdz%s' 'kovsnpds')"

# ── E0-AC10 · .sql ของงานออกแบบต้องอยู่ใน docs/engine/schema/ เท่านั้น ────────────
# ⚠️ ด่านหลักของเรื่อง policy คือ rls-policies.sql §11.2 (policy_count = 0)
#    AC10 เป็นด่านรอง คุ้มเพราะทำงานได้ก่อนมี DB ให้ query ไม่ใช่เพราะครอบคลุมกว่า
if [ -d "$ROOT/docs/engine" ]; then
  stray="$(find "$ROOT/docs/engine" -name '*.sql' -not -path "$ROOT/docs/engine/schema/*" 2>/dev/null)"
  if [ -n "$stray" ]; then
    echo "🔴 AC10: เจอ .sql นอก docs/engine/schema/"
    echo "$stray"
    echo "   กติกาเหล็กข้อ 3 — SQL ของงานแพลตฟอร์มอยู่ได้ที่ docs/engine/schema/ ที่เดียว"
    fail=1
  else
    echo "✅ AC10: .sql ทุกไฟล์อยู่ใน schema/"
  fi
fi

# ── ref ของ DB ทริปห้ามอยู่ใน "ไฟล์ที่เครื่องจักรอ่านแล้วทำตาม" ──────────────────
# 🔴 ขอบเขตนี้คือมติ P1 (17 ส.ค. 2026) ไม่ใช่ "ห้ามปรากฏในทุกไฟล์"
#    ref รั่วผ่าน client bundle อยู่แล้ว (lib/supabase.ts:3 + proxy.ts ตัด _next ออกจากด่าน PIN)
#    การไล่ลบจากเอกสารเชิงบรรยายจึงไม่ปิดอะไร · ที่อันตรายจริงคือไฟล์ที่ "คำสั่งวิ่งตาม"
#    ดู docs/engine/devops.md §1.7
scoped=""
for p in .github supabase-platform supabase/migrations package.json vercel.json; do
  [ -e "$ROOT/$p" ] && scoped="$scoped $ROOT/$p"
done
if [ -n "$scoped" ]; then
  # shellcheck disable=SC2086
  hits="$(grep -rl "$TRIP_REF" $scoped 2>/dev/null)"
  if [ -n "$hits" ]; then
    echo "🔴 ref ของ DB ทริปอยู่ในไฟล์ที่เครื่องจักรอ่านแล้วทำตาม — คำสั่งอาจวิ่งไปผิดที่"
    echo "$hits"
    fail=1
  else
    echo "✅ ref: ไม่มี ref ทริปในไฟล์ที่เครื่องทำตาม"
  fi
fi

# ── .sql ของแพลตฟอร์มต้องอยู่ในโฟลเดอร์ที่ CLI ใช้จริง ──────────────────────────
# 🔴 `supabase --workdir X` หา migration ที่ **`X/supabase/migrations/`** — มันเติม `supabase/` ให้เสมอ
#    (ยืนยันด้วย `supabase migration new` จริงบน CLI 2.114.0 · 18 ส.ค. 2026)
#    ถ้าใครวางไฟล์ที่ `supabase-platform/migrations/` **`db push` จะขึ้นเขียวโดยไม่รันอะไรเลย**
#    = คำสั่งที่สำเร็จโดยไม่ได้ทำงาน · ชนิดเดียวกับบั๊ก no-op ที่เจอในด่านตัวเอง
wrongdir="$ROOT/supabase-platform/migrations"
if [ -d "$wrongdir" ]; then
  wrongsql="$(find "$wrongdir" -name '*.sql' 2>/dev/null)"
  if [ -n "$wrongsql" ]; then
    echo "🔴 .sql อยู่ผิดโฟลเดอร์ — CLI จะไม่เห็นไฟล์พวกนี้เลย:"
    echo "$wrongsql"
    echo "   ที่ถูกคือ supabase-platform/supabase/migrations/"
    fail=1
  else
    echo "🔴 มีโฟลเดอร์ supabase-platform/migrations/ ซึ่งไม่ใช่ที่ที่ CLI ใช้ — ลบทิ้ง"
    echo "   ที่ถูกคือ supabase-platform/supabase/migrations/"
    fail=1
  fi
else
  echo "✅ migrations: ไม่มีโฟลเดอร์ที่ CLI มองไม่เห็น"
fi

# ── ทุก .sql ที่จอดใน pending-review/ ต้องมีชื่ออยู่ใน README ของโฟลเดอร์นั้น ──────
# 🔴 `pending-review/` ถูกออกแบบให้ **CLI มองไม่เห็นโดยตั้งใจ** (P1 · 24 ส.ค. 2026)
#    ซึ่งแปลว่ามันเป็นที่ที่ **ของหายเงียบได้ดีที่สุดในรีโป** — ไม่มีเครื่องมือไหนเดินผ่านมันเลย
#    ไฟล์ที่จอดแล้วไม่มีใครจดว่ารออะไร **หน้าตาเหมือนไฟล์ที่ทำเสร็จแล้ว**
#
# ด่านนี้ไม่ตัดสินว่าไฟล์ถูกหรือผิด — ถามข้อเดียวว่า **"ยังมีคนรู้ไหมว่ามันรออะไร"**
# ⚠️ ไม่ใช้เกณฑ์ "ค้างเกิน N วัน" โดยตั้งใจ: บน CI ไฟล์ถูก checkout ใหม่ทุกครั้ง
#    **mtime จึงเป็นเวลา checkout ไม่ใช่เวลาที่จอด** — เกณฑ์เวลาที่วัดจาก mtime จะโกหก
PRDIR="$ROOT/supabase-platform/pending-review"
if [ -d "$PRDIR" ]; then
  prsql="$(find "$PRDIR" -maxdepth 1 -name '*.sql' 2>/dev/null | sort)"
  if [ -z "$prsql" ]; then
    echo "✅ pending-review: ไม่มีไฟล์ค้าง"
  elif [ ! -f "$PRDIR/README.md" ]; then
    echo "🔴 pending-review: มี .sql จอดอยู่แต่ไม่มี README.md — ไม่มีใครรู้ว่ามันรออะไร"
    fail=1
  else
    missing=""
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      grep -qF "$(basename "$f")" "$PRDIR/README.md" || missing="$missing  $(basename "$f")
"
    done <<EOF
$prsql
EOF
    if [ -n "$missing" ]; then
      echo "🔴 pending-review: ไฟล์พวกนี้จอดอยู่แต่ไม่มีชื่อใน README.md — จอดแล้วหาย"
      printf '%s' "$missing"
      echo "   เพิ่มลงตาราง 'ของที่อยู่ในนี้ตอนนี้' พร้อมระบุว่า **รออะไร/ใครตัดสิน**"
      fail=1
    else
      echo "✅ pending-review: ทุกไฟล์ที่จอดมีคนจดว่ารออะไร"
    fi
  fi
fi

# ── link ต้องอยู่ "ถูกที่" ไม่ใช่แค่ "ชี้ถูก ref" ──────────────────────────────────
# 🔴 สถานะ link ผูกกับ **workdir** ไม่ใช่กับ repo — ราก link แยกจาก supabase-platform/ ได้
#    ด่านข้างล่างถามว่า "ชี้ไปโปรเจกต์ไหน" แต่ไม่เคยถามว่า "ยืนอยู่ตรงไหนตอนถาม" (P1 ชี้ 24 ส.ค. 2026)
#
#    ลำดับที่ทำให้มันเกิด อ่านเป็นเหตุเป็นผลทุกขั้น และจบแบบไม่มี error สักบรรทัด:
#      1. พิมพ์ `supabase db push` จากรากตามความเคยชิน
#      2. CLI ตอบ "Cannot find project ref. Have you run supabase link?"
#         🔴 **ข้อความ error ชี้ไปที่คำสั่งที่จะติดตั้งกับดักพอดี**
#      3. ทำตามที่ error บอก -> `supabase link` **จากราก** -> รากกลายเป็น workdir ที่ link แล้ว
#      4. push อีกครั้ง -> **31 migration ของทริปลง DB ที่ link ไว้ เงียบสนิท**
#    ผลไม่ใช่หายนะแต่หลอกตา: DB ได้สคีมาทริป ดูใช้งานได้ · identity ไม่ได้ลงเพราะคนละ workdir
#    -> P4 รันเมทริกซ์แล้วแดง แล้วจะไปไล่หาสาเหตุที่ RLS ทั้งที่ปัญหาคือสคีมาผิดใบ
#
# ⚠️ ข้อจำกัดที่ต้องรู้: `.temp/` ถูก gitignore ไว้ **ด่านนี้จึงไม่มีวันแดงบน CI**
#    มันกัดตอนรัน guards.sh บนเครื่องเท่านั้น · ไม่ใช่เหตุผลให้ตัดทิ้ง แต่อย่านับว่า CI คุ้มให้
ALLOWED_TEMP="$ROOT/supabase-platform/supabase/.temp"
strays=""
while IFS= read -r d; do
  [ -z "$d" ] && continue
  [ "$d" = "$ALLOWED_TEMP" ] && continue
  strays="$strays  $d
"
done < <(find "$ROOT" -type d -path '*/supabase/.temp' -not -path '*/node_modules/*' 2>/dev/null | sort)
if [ -n "$strays" ]; then
  echo "🔴 link อยู่ผิดที่ — workdir เดียวที่ link ได้คือ supabase-platform/"
  printf '%s' "$strays"
  echo "   ที่นี่ถูก link = \`supabase db push\` จากตรงนั้นจะรัน migration ของทริปใส่ DB ที่ link ไว้"
  echo "   ลบโฟลเดอร์ .temp/ นั้นทิ้ง แล้วใส่ --workdir supabase-platform เสมอ"
  fail=1
else
  echo "✅ link: ไม่มี link นอก supabase-platform/"
fi

# ── allowlist ของ ref ที่อนุญาต — อ่านจากไฟล์ที่ commit ไม่ใช่จาก env ──────────────
# 🔴 เปลี่ยน 24 ส.ค. 2026 (มติ P1) · เดิมบังคับต้องมี DEV_PROJECT_REF ไม่งั้นแดง
#    ปัญหา: ด่าน `.temp/` กับ `.env` **มีค่าเฉพาะตอนรันบนเครื่อง** (ทั้งคู่ไม่มีวันแดงบน CI)
#    การทำให้ "รันเปล่าๆ แล้วแดงเสมอ" จึงกดดันให้คนเลิกรัน หรือเรียนรู้ที่จะข้ามมัน
#    → วันที่มันแดงเพราะของจริง จะไม่มีใครเหลืออ่านมันแล้ว
#
# 🔴 และ ref ของ engine-dev **ไม่ใช่ความลับ ไม่เคยเป็น** — อยู่ในไฟล์ที่ commit แล้ว 8 ไฟล์ 30 จุด
#    (ตรวจด้วย `git grep -c pmvxwcimjebogjfimzqy`) · การบังคับให้ตั้ง env เพื่อรู้ค่าสาธารณะ
#    **ไม่ได้เพิ่มความปลอดภัยเลย เพิ่มแต่ความฝืด** · ต่างจาก SUPABASE_ACCESS_TOKEN ซึ่งลับจริง
#
# ⚠️ ข้อแลกที่ต้องรู้: allowlist ย้ายจาก "ค่าที่คนตั้ง CI คุม" ไปเป็น "ค่าที่ commit ในรีโป"
#    → **ใครแก้ไฟล์นี้ก็ย้าย allowlist ได้** · รับได้เพราะ **มันเห็นใน diff และผ่านรีวิว**
#    ต่างจาก env var ที่เปลี่ยนเงียบๆ ได้โดยไม่มีร่องรอย
# 🎯 และมี interlock: ไฟล์นี้อยู่ใน `.github/` ซึ่ง **ด่าน ref ข้างบนสแกนอยู่แล้ว**
#    → ถ้าใครเอา ref ทริปมาใส่เป็น allowlist **ด่านคนละตัวจะจับได้** ไม่ต้องพึ่งด่านนี้ตรวจตัวเอง
ALLOWFILE="${ALLOWED_REF_FILE:-$(cd "$(dirname "$0")" && pwd)/allowed-project-ref}"
allowed=""
[ -f "$ALLOWFILE" ] && allowed="$(tr -d ' \t\r\n' < "$ALLOWFILE")"

if [ -z "$allowed" ]; then
  echo "🔴 allowlist: ไม่มีไฟล์หรือไฟล์ว่าง ($ALLOWFILE) — ตรวจไม่ได้ ถือว่าไม่ผ่าน"
  fail=1
elif ! printf '%s' "$allowed" | grep -Eq '^[a-z]{20}$'; then
  # ไฟล์เพี้ยน/ถูกตัด ต้องไม่กลายเป็น allowlist เงียบๆ
  echo "🔴 allowlist: ค่าในไฟล์ไม่ใช่รูปแบบ project ref (ต้องเป็น a-z 20 ตัว) — ได้ '$allowed'"
  fail=1
elif [ -n "${DEV_PROJECT_REF:-}" ] && [ "$DEV_PROJECT_REF" != "$allowed" ]; then
  # 🔴 ข้อนี้คือส่วนเดียวของด่าน link ที่ทำงานบน CI ได้จริง
  #    เพราะ CI ไม่มี .temp/ เลย (gitignore) ด่านข้างล่างจึงไม่เคยรันที่นั่น
  #    ที่นี่ตอบคำถาม "secret ที่ตั้งใน CI ตรงกับ repo ไหม" ซึ่งยังคุ้มที่จะถาม
  echo "🔴 allowlist: DEV_PROJECT_REF ขัดกับไฟล์ที่ commit ไว้ — อย่าเดาว่าอันไหนถูก"
  echo "   env=$DEV_PROJECT_REF · ไฟล์=$allowed"
  fail=1
else
  echo "✅ allowlist: $allowed"
fi

# ── .env* ในทรีนี้ ต้องไม่ชี้ไป DB ทริป ──────────────────────────────────────────
# 🔴 ช่องที่ด่านอื่น **ทั้งหมด** มองไม่เห็น (P1 เจอ 24 ส.ค. 2026):
#    คนที่อยากทดสอบล็อกอินในเบราว์เซอร์ต้องมี `.env.local` ในทรีนี้ก่อน
#    **ที่ที่หาง่ายที่สุดคือก๊อปจากทรีหลัก — ซึ่งชี้ไป DB ทริปจริง**
#    ผล: dev server ของ platform ต่อ **DB ทริป** · refreshSession() ยิงไปที่นั่นทุก request
#    และวันที่ใครรันโค้ดที่เขียนข้อมูล **มันเขียนลงของจริง** โดยไม่มีอะไรทัก
#
# 🔴 ทำไมด่านอื่นไม่เห็นสักตัว: `.gitignore` มี `.env*` → **ไฟล์ไม่เคยขึ้น git**
#    gitleaks กับ CI จึงไม่มีทางเห็นมันได้เลย · ด่าน ref ข้างบนก็ไม่ได้สแกน `.env`
#    **ด่านทุกตัวของเราเฝ้าไฟล์ที่ commit — ช่องนี้อยู่ในไฟล์ที่ "ห้าม" commit โดยตั้งใจ**
#
# ⚠️ เหมือนด่าน `.temp/`: **บน CI ไม่มีไฟล์ให้สแกน = ไม่มีวันแดงที่นั่น**
#    กัดตอนรัน guards.sh บนเครื่องเท่านั้น · **อย่านับว่า CI คุ้มให้**
# ⚠️ ด่านนี้ตั้งอยู่บนสมมติฐานว่า ROOT คือทรี `platform` — ทรีหลักมี `.env.local` ที่ชี้ DB ทริป
#    **โดยถูกต้อง** ถ้าเอา guards.sh ไปรันใส่ทรีหลัก มันจะฟ้องของที่ไม่ผิด
envhits=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  grep -q "$TRIP_REF" "$f" 2>/dev/null && envhits="$envhits  $f
"
done < <(find "$ROOT" -type f -name '.env*' -not -path '*/node_modules/*' 2>/dev/null | sort)
if [ -n "$envhits" ]; then
  echo "🔴 .env ในทรีนี้ชี้ไป DB ทริป — dev server จะต่อของจริง ไม่ใช่ engine-dev"
  printf '%s' "$envhits"
  echo "   🔴 ห้ามก๊อป .env.local จากทรีหลัก — ต้องใช้ URL/key ของ engine-dev เท่านั้น"
  fail=1
else
  echo "✅ .env: ไม่มี ref ทริปเป็นสตริงในไฟล์ .env"
fi
# 🔴 ด่านข้างบน grep หา ref แบบ "สตริงตรงๆ" ซึ่ง **มองไม่เห็น ref ที่อยู่ใน JWT**
#    (payload ถูก base64 ไว้) · ยืนยันแล้ว 24 ส.ค. 2026 ว่า .env ที่มี URL ของ engine-dev
#    แต่ service_role เป็นคีย์ของ DB ทริป **ผ่านด่านเดิมพร้อมข้อความ ✅**
#    → ต้องถอด JWT มาดู ref จริง · ตรรกะอยู่ใน .github/check-env-keys.py
ENVKEYS="$(cd "$(dirname "$0")" && pwd)/check-env-keys.py"
envfiles=""
while IFS= read -r f; do
  [ -n "$f" ] && envfiles="$envfiles $f"
done < <(find "$ROOT" -type f -name '.env*' -not -path '*/node_modules/*' 2>/dev/null | sort)
if [ -n "$envfiles" ]; then
  if [ ! -f "$ENVKEYS" ]; then
    echo "🔴 .env: หา check-env-keys.py ไม่เจอ — ตรวจไม่ได้ ถือว่าไม่ผ่าน"
    fail=1
  # shellcheck disable=SC2086
  elif ! python3 "$ENVKEYS" "$allowed" $envfiles; then
    fail=1
  else
    echo "✅ .env: คีย์ใน .env ทุกไฟล์เป็นของ $allowed"
  fi
fi

# ── ทุก migration ต้อง assert app.project_identity + ref (D48 · P1 สั่ง 24 ส.ค. 2026) ──
# 🔴 `P-30` (P4): ด่านที่อยู่ใน **สิ่งที่ถูกยิง** กันได้แค่ลำดับหลังของตัวเอง ตัวแรกไม่มีอะไรกัน
#    ด่านนี้จึงไม่ได้แทนด่านใน SQL — มันตรวจว่า **ไฟล์ที่ควรมีด่าน มีจริงหรือเปล่า**
#    เป็นคนละคำถามกัน: SQL ถามว่า "ฐานนี้ใช่ไหม" · ตรงนี้ถามว่า "ยังมีคนใส่ด่านอยู่ไหม"
#
# 🎯 ref ที่ต้องปรากฏ อ่านจาก `allowed-project-ref` ตัวเดียวกับด่าน allowlist
#    → **ไม่มีแหล่งความจริงที่สอง** · เปลี่ยน ref ที่เดียว ด่านทั้งหมดขยับตาม
MIGDIR="$ROOT/supabase-platform/supabase/migrations"
# 🔴 รายชื่อยกเว้นต้องผูกกับ **ทรีที่กำลังตรวจ** ไม่ใช่กับที่อยู่ของสคริปต์
#    (ต่างจาก `allowed-project-ref` ซึ่งเป็น config ที่เดินทางไปกับด่าน)
#    เพราะข้อยกเว้นพูดถึง **ไฟล์ของทรีนั้น** — ผูกกับสคริปต์แล้วเคสด้านบวกใน self-test พังทันที
#    (เจอตอนเขียนเทสต์ด้านบวก 24 ส.ค. 2026 · **เคสด้านลบทั้ง 5 ผ่านหมดโดยที่ด่านยังผิดอยู่**)
EXEMPTFILE="${MIGRATION_EXEMPT_FILE:-$ROOT/.github/migration-guard-exempt}"
if [ -d "$MIGDIR" ] && [ -n "$allowed" ]; then
  if [ ! -f "$EXEMPTFILE" ]; then
    echo "🔴 migration-guard: ไม่มีไฟล์รายชื่อยกเว้น ($EXEMPTFILE) — ตรวจไม่ได้ ถือว่าไม่ผ่าน"
    fail=1
  else
    exempt="$(sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$EXEMPTFILE" | grep -v '^$' || true)"
    migbad=""
    for f in "$MIGDIR"/*.sql; do
      [ -e "$f" ] || continue
      b="$(basename "$f")"
      printf '%s\n' "$exempt" | grep -qxF "$b" && continue
      if ! grep -qF 'app.project_identity' "$f"; then
        migbad="$migbad  $b — ไม่มี app.project_identity
"
      elif ! grep -qF "$allowed" "$f"; then
        migbad="$migbad  $b — มี marker แต่ไม่ได้เช็ค ref $allowed (เล็งไปฐานอื่น?)
"
      fi
    done
    # ยกเว้นที่ไม่มีไฟล์จริงแล้ว = ของค้างเงียบ ต้องเก็บกวาด
    staleex=""
    while IFS= read -r e; do
      [ -z "$e" ] && continue
      [ -e "$MIGDIR/$e" ] || staleex="$staleex  $e
"
    done <<EOF
$exempt
EOF
    if [ -n "$migbad" ]; then
      echo "🔴 migration-guard: มี migration ที่ไม่ได้ assert ตัวตนของฐาน"
      printf '%s' "$migbad"
      echo "   คัดลอกบล็อกด่านจาก supabase-platform/migration-template.sql"
      echo "   ถ้าเป็นไฟล์ bootstrap จริงๆ ให้เพิ่มชื่อใน .github/migration-guard-exempt พร้อมเหตุผล"
      fail=1
    elif [ -n "$staleex" ]; then
      echo "🔴 migration-guard: มีชื่อในรายการยกเว้นที่ไม่มีไฟล์แล้ว — ลบทิ้ง"
      printf '%s' "$staleex"
      fail=1
    else
      echo "✅ migration-guard: ทุก migration ที่ไม่ได้ยกเว้น assert ตัวตนของฐานครบ"
    fi
  fi
fi

# ── ถ้ามีการ link CLI ไว้ ต้องตรงกับ allowlist เท่านั้น ────────────────────────────
linkfile="$ROOT/supabase-platform/supabase/.temp/project-ref"
if [ -f "$linkfile" ] && [ -n "$allowed" ]; then
  if [ "$(tr -d ' \t\r\n' < "$linkfile")" != "$allowed" ]; then
    echo "🔴 link อยู่กับโปรเจกต์ที่ไม่ใช่ engine-dev — หยุด"
    echo "   link=$(tr -d ' \t\r\n' < "$linkfile") · อนุญาต=$allowed"
    fail=1
  else
    echo "✅ link: อยู่กับ engine-dev"
  fi
fi

# ── ลิงก์ภายในเอกสาร `](#หัวข้อ)` ต้องชี้ไปหัวข้อที่มีอยู่จริง ────────────────────
# 🔴 ความพังชนิด "ไม่มีสัญญาณ": ไม่ error ไม่ fail test ไม่ขึ้น lint · คนกดแล้วไม่ไปไหนก็เลื่อนหาเอง
#    เจอจริง 24 ส.ค. 2026 — สารบัญ backlog.md ข้อ 2.6 ชี้ผิดตั้งแต่วันที่เขียน (`-` เกินมาตัวเดียว)
#    ตรรกะอยู่ใน .github/check-anchors.py (เป็น Python ไม่ใช่ bash — เหตุผลอยู่ในหัวไฟล์นั้น)
ANCHORS="$(cd "$(dirname "$0")" && pwd)/check-anchors.py"
mds=()
while IFS= read -r f; do [ -n "$f" ] && mds+=("$f"); done < <(
  find "$ROOT" -name '*.md' \
    -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/.git/*' 2>/dev/null | sort
)
if [ "${#mds[@]}" -gt 0 ]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "🔴 anchor: ไม่มี python3 — ตรวจไม่ได้ ถือว่าไม่ผ่าน (ตรวจไม่ได้ ≠ ปลอดภัย)"
    fail=1
  elif [ ! -f "$ANCHORS" ]; then
    echo "🔴 anchor: หา check-anchors.py ไม่เจอที่ $ANCHORS — ตรวจไม่ได้ ถือว่าไม่ผ่าน"
    fail=1
  elif ! python3 "$ANCHORS" "${mds[@]}"; then
    echo "   แก้ที่สารบัญ หรือแก้ที่หัวข้อก็ได้ ขอแค่ให้ตรงกัน"
    fail=1
  fi
fi

# ── ทุก `D<n>` ที่อ้างถึง ต้องมีนิยามใน docs/engine/README.md ──────────────────────
# ⚠️ **ขอบเขตแคบ อ่านก่อนนับว่าครอบคลุม:** จับได้แค่ "อ้างถึง D ที่ไม่มีอยู่"
#    🔴 **จับกล่องที่ค้างเป็นเท็จไม่ได้เลย** ซึ่งคือปัญหาจริงของ `D71`
#    ของจริงต้องรอทะเบียนคำถาม `Q<n>` (P8 ออกแบบ) — รายละเอียดในหัว check-decision-refs.py
DREFS="$(cd "$(dirname "$0")" && pwd)/check-decision-refs.py"
DREADME="$ROOT/docs/engine/README.md"
if [ -f "$DREADME" ]; then
  dmds=""
  while IFS= read -r f; do
    [ -n "$f" ] && dmds="$dmds $f"
  done < <(find "$ROOT/docs/engine" -maxdepth 1 -name '*.md' 2>/dev/null | sort)
  if [ ! -f "$DREFS" ]; then
    echo "🔴 decision-refs: หา check-decision-refs.py ไม่เจอ — ตรวจไม่ได้ ถือว่าไม่ผ่าน"
    fail=1
  # shellcheck disable=SC2086
  elif ! python3 "$DREFS" "$DREADME" $dmds; then
    fail=1
  fi
fi

# ── ข้อมูล (ไม่ใช่ด่าน): HEAD กับ origin ห่างกันแค่ไหน ────────────────────────────
# 🔴 ปัญหาจริง 25 ส.ค. 2026: CI แดงค้าง ~2 ชม. ขณะที่ทุกเครื่องเขียวสนิท
#    ตัวแก้เขียนเสร็จแล้วแต่ **นอนค้างในเครื่อง ไม่ได้ push** พร้อมอีก 10 ตัว
#    → CI รายงานสภาพที่ไม่มีใครอยู่ในนั้นแล้ว **และไม่มีสัญญาณอะไรบอกว่าสองอันไม่ตรงกัน**
#    ทีมนี้ commit บ่อยกว่า push มาก ของค้าง 11 ตัวเป็นเรื่องปกติ
#
# ⚠️ **บรรทัดนี้ไม่เคยทำให้ fail** โดยตั้งใจ — commit ค้างเป็นเรื่องปกติ ไม่ใช่ความผิด
#    ด่านที่แดงด้วยเหตุที่ไม่ใช่ปัญหา จะถูกเลิกอ่าน (บทเรียนของวันนี้)
#    หน้าที่มันคือ **ทำให้ความต่างมองเห็น** ไม่ใช่ตัดสิน
# ⚠️ `origin/<branch>` สดแค่เท่าที่ `git fetch` ล่าสุด — ตัวเลขนี้จึงเป็นขั้นต่ำ ไม่ใช่ค่าจริงเสมอ
#    ถ้าต้องการคำตอบที่เชื่อได้ว่า "CI แดงกับโค้ดของเราหรือของเก่า" ใช้ .github/ci-status.sh
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  br="$(git -C "$ROOT" branch --show-current 2>/dev/null || true)"
  if [ -n "$br" ] && git -C "$ROOT" rev-parse --verify -q "origin/$br" >/dev/null 2>&1; then
    ahead="$(git -C "$ROOT" rev-list --count "origin/$br..HEAD" 2>/dev/null || echo 0)"
    if [ "${ahead:-0}" -gt 0 ]; then
      echo "⚠️ git: มี $ahead commit บน '$br' ที่ยังไม่ได้ push (นับจาก fetch ล่าสุด)"
      echo "   → ถ้า CI แดงอยู่ **มันกำลังทดสอบโค้ดที่ไม่ใช่ของคุณ** · เช็คด้วย .github/ci-status.sh"
    fi
  fi
fi

exit $fail
