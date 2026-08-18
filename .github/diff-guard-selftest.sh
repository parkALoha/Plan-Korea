#!/usr/bin/env bash
# เทสต์ด้านลบของ .github/diff-guard.sh — กติกา P1 18 ส.ค. 2026
# 🔴 ด่านที่ไม่เคยเห็นของผิด กับด่านที่พัง หน้าตาเหมือนกันเป๊ะ
set -uo pipefail
G="${DIFF_GUARD_SH:-$(cd "$(dirname "$0")" && pwd)/diff-guard.sh}"
NEEDLE="$(printf 'NEXT_PUBLIC_%s' 'SUPABASE')"
rc=0

mk() { d="$(mktemp -d)"; mkdir -p "$d/lib" "$d/docs/engine/schema" "$d/.github"; echo "$d"; }

check() {  # check <ชื่อ> <pass|fail> <dir> <รายชื่อไฟล์ที่เปลี่ยน>
  name="$1"; want="$2"; dir="$3"; files="$4"
  if printf '%s\n' "$files" | "$G" --stdin "$dir" >/dev/null 2>&1; then got=pass; else got=fail; fi
  if [ "$got" = "$want" ]; then echo "✅ $name — ได้ $got ตามคาด"
  else echo "🔴 $name — คาด $want แต่ได้ $got · diff-guard.sh ใช้การไม่ได้"; rc=1; fi
  rm -rf "$dir"
}

# ① ควบคุมด้านบวก — diff ที่ไม่เกี่ยวต้องผ่าน (ถ้าข้อนี้พัง เคสด้านลบข้างล่างเชื่อไม่ได้)
d="$(mk)"; echo "# doc" > "$d/docs/engine/devops.md"; echo "name: ci" > "$d/.github/ci.yml"
check "diff ปกติต้องผ่าน" pass "$d" "$(printf 'docs/engine/devops.md\n.github/ci.yml')"

# ② path ต้องห้าม — lib/supabase.ts
d="$(mk)"; echo "x" > "$d/lib/supabase.ts"
check "จับ lib/supabase.ts" fail "$d" "lib/supabase.ts"

# ③ path ต้องห้าม — supabase-platform/
d="$(mk)"; mkdir -p "$d/supabase-platform"; echo "x" > "$d/supabase-platform/config.toml"
check "จับ supabase-platform/" fail "$d" "supabase-platform/config.toml"

# ④ path ต้องห้าม — .env*
d="$(mk)"; echo "x" > "$d/.env.production"
check "จับ .env.production" fail "$d" ".env.production"

# ⑤ เนื้อไฟล์ — ไฟล์ใหม่ที่เดินสาย env ของ Supabase
d="$(mk)"; printf 'const u = process.env.%s_URL\n' "$NEEDLE" > "$d/lib/newClient.ts"
check "จับไฟล์ใหม่ที่ต่อ env Supabase" fail "$d" "lib/newClient.ts"

# ⑥ 🔴 ล็อกขอบเขต — ชื่อไฟล์มีคำว่า supabase แต่เป็นเอกสาร และไม่ได้ต่อ env → ต้องผ่าน
#    ถ้าเคสนี้ fail แปลว่ามีคนขยายด่านจาก "การต่อ env" เป็น "อะไรก็ตามที่ชื่อคล้าย"
d="$(mk)"; echo "บันทึกการตั้งค่า" > "$d/docs/engine/schema/supabase-notes.md"
check "เอกสารที่ชื่อมี supabase ต้องไม่โดนจับ" pass "$d" "docs/engine/schema/supabase-notes.md"

# ⑥.5 🔴 ล็อกขอบเขตกฎ 2 — เอกสาร/yaml ที่แค่พูดถึงชื่อตัวแปร ต้องไม่โดนจับ
#      พบตอนรันกับ diff จริง: ถ้าไม่จำกัดนามสกุล ด่านจะจับ devops.md · backlog.md · ci.yml
d="$(mk)"; printf 'อ่าน %s_URL จาก env\n' "$NEEDLE" > "$d/docs/engine/devops.md"
check "เอกสารที่พูดถึงชื่อ env ต้องไม่โดนจับ" pass "$d" "docs/engine/devops.md"

d="$(mk)"; printf '          %s_URL: https://placeholder.supabase.co\n' "$NEEDLE" > "$d/.github/ci.yml"
check "ci.yml ที่ตั้งค่าปลอมต้องไม่โดนจับ" pass "$d" ".github/ci.yml"

# ⑦ ไฟล์ที่ถูกลบ (ไม่มีอยู่จริงในทรี) ต้องไม่ทำให้ด่านพัง
d="$(mk)"
check "ไฟล์ที่ถูกลบต้องไม่ทำให้ด่านพัง" pass "$d" "components/OldThing.tsx"

# ⑧ 🔴 กันบั๊กที่เคยเกิดจริง: เรียกโดยไม่ใส่ --stdin ขณะ stdin เป็น /dev/null
#    ต้องเข้าโหมด git (ไม่ใช่โหมด stdin) → ในทรีที่ไม่ใช่ git repo ต้องล้ม ไม่ใช่ผ่านเปล่าๆ
#    ถ้าเคสนี้ pass แปลว่าด่านกลับไปเป็น no-op บน CI เหมือนเดิม
d="$(mk)"
if "$G" "$d" </dev/null >/dev/null 2>&1; then
  echo "🔴 ไม่ใส่ --stdin แล้วยังผ่าน — ด่านเป็น no-op บน CI (บั๊กเดิมกลับมา)"; rc=1
else
  echo "✅ ไม่ใส่ --stdin ต้องเข้าโหมด git และล้มเมื่อหา diff ไม่ได้ — ได้ fail ตามคาด"
fi
rm -rf "$d"

exit $rc
