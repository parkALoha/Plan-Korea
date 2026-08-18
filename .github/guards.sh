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

# ── ถ้ามีการ link CLI ไว้ ต้องเป็น engine-dev เท่านั้น (allowlist) ─────────────────
linkfile="$ROOT/supabase-platform/supabase/.temp/project-ref"
if [ -f "$linkfile" ]; then
  if [ -z "${DEV_PROJECT_REF:-}" ]; then
    echo "🔴 link แล้วแต่ไม่ได้ตั้ง DEV_PROJECT_REF — ตรวจไม่ได้ ถือว่าไม่ผ่าน (ตรวจไม่ได้ ≠ ปลอดภัย)"
    fail=1
  elif [ "$(cat "$linkfile")" != "$DEV_PROJECT_REF" ]; then
    echo "🔴 link อยู่กับโปรเจกต์ที่ไม่ใช่ engine-dev — หยุด"
    fail=1
  else
    echo "✅ link: อยู่กับ engine-dev"
  fi
fi

exit $fail
