#!/usr/bin/env bash
# เทสต์ด้านลบของ .github/guards.sh — พิสูจน์ว่าด่านยัง "จับของผิดได้จริง"
#
# 🔴 กติกาที่ P1 ยกขึ้นเมื่อ 18 ส.ค. 2026: ทุก guard ต้องมีเทสต์ด้านลบเสมอ
#    เพราะ **ด่านที่ไม่เคยเห็นของผิด กับด่านที่พัง หน้าตาเหมือนกันเป๊ะ**
#    ถ้าวันหนึ่งมีคนแก้ guards.sh จนมันไม่จับอะไรเลย CI จะยังเขียวทุกวันโดยไม่มีสัญญาณ
#    ไฟล์นี้คือสิ่งเดียวที่ทำให้ความต่างนั้นมองเห็นได้
set -uo pipefail
# GUARDS_SH override ไว้เพื่อทดสอบตัว self-test เอง (ดูท้ายไฟล์) — ปกติไม่ต้องตั้ง
G="${GUARDS_SH:-$(cd "$(dirname "$0")" && pwd)/guards.sh}"
TRIP_REF="$(printf 'ejzibhgqhxdz%s' 'kovsnpds')"
rc=0

mk() {  # สร้างทรีจำลองที่ "สะอาด" แล้วคืน path
  d="$(mktemp -d)"
  mkdir -p "$d/docs/engine/schema" "$d/.github"
  echo "-- ร่าง DDL" > "$d/docs/engine/schema/ok.sql"
  echo "name: ci" > "$d/.github/ci.yml"
  echo "$d"
}

check() {  # check <ชื่อเคส> <คาดหวัง pass|fail> <path>
  name="$1"; want="$2"; dir="$3"
  if "$G" "$dir" >/dev/null 2>&1; then got=pass; else got=fail; fi
  rm -rf "$dir"
  if [ "$got" = "$want" ]; then
    echo "✅ $name — ได้ $got ตามคาด"
    return 0
  fi
  echo "🔴 $name — คาด $want แต่ได้ $got · guards.sh ใช้การไม่ได้"
  rc=1
  # 🔴 ต้อง return 1 ด้วย ไม่ใช่ตั้งแค่ $rc — เคสที่ห่อในซับเชลล์ `( ... ) || rc=1`
  #    จะไม่เห็นการตั้ง rc ข้างใน ทำให้ self-test พิมพ์ 🔴 แต่ exit 0 (เจอจริง 18 ส.ค. 2026)
  return 1
}

# ① ควบคุมด้านบวก: ทรีสะอาดต้องผ่าน — ถ้าข้อนี้ fail แปลว่าเคสด้านลบข้างล่างเชื่อไม่ได้
d="$(mk)"; check "ทรีสะอาดต้องผ่าน" pass "$d"

# ② AC10: .sql นอก schema/ ต้องโดนจับ
d="$(mk)"; echo "select 1;" > "$d/docs/engine/stray.sql"
check "AC10 จับ .sql นอก schema/" fail "$d"

# ③ ref guard: ref ทริปในไฟล์ที่เครื่องทำตาม ต้องโดนจับ
d="$(mk)"; printf 'url: %s.supabase.co\n' "$TRIP_REF" > "$d/.github/bad.yml"
check "ref guard จับ ref ทริปใน .github/" fail "$d"

# ④ ref guard: ref ในเอกสารเชิงบรรยาย **ต้องไม่โดนจับ** (มติ P1 17 ส.ค.)
#    ถ้าเคสนี้ fail แปลว่ามีคนขยายขอบเขตด่านเกินมติโดยไม่ได้ตั้งใจ
d="$(mk)"; printf 'ref คือ %s\n' "$TRIP_REF" > "$d/docs/engine/README.md"
check "ref ในเอกสารเชิงบรรยายต้องไม่โดนจับ" pass "$d"

# ⑥ ด่านโฟลเดอร์ migrations ผิดที่ — CLI ใช้ X/supabase/migrations/ ไม่ใช่ X/migrations/
d="$(mk)"; mkdir -p "$d/supabase-platform/migrations"
check "จับโฟลเดอร์ supabase-platform/migrations/ ที่ CLI มองไม่เห็น" fail "$d"

d="$(mk)"; mkdir -p "$d/supabase-platform/migrations"; echo "create table t();" > "$d/supabase-platform/migrations/0001_x.sql"
check "จับ .sql ที่วางผิดโฟลเดอร์" fail "$d"

# ⑦ ล็อกขอบเขต: โฟลเดอร์ที่ถูกต้องตาม CLI ต้องไม่โดนจับ
d="$(mk)"; mkdir -p "$d/supabase-platform/supabase/migrations"
echo "create table t();" > "$d/supabase-platform/supabase/migrations/0001_x.sql"
check "โฟลเดอร์ที่ถูกต้องของ CLI ต้องไม่โดนจับ" pass "$d"

# ⑧ link guard ต้องอ่าน path ใหม่ของ CLI (supabase-platform/supabase/.temp/)
#    เคยเขียน path ผิดไว้ ทำให้ด่านนี้ข้ามตัวเองเงียบๆ = no-op อีกตัว
d="$(mk)"; mkdir -p "$d/supabase-platform/supabase/.temp"
echo "someotherref" > "$d/supabase-platform/supabase/.temp/project-ref"
( unset DEV_PROJECT_REF; check "link แต่ไม่มี secret ต้องไม่ผ่าน (path ใหม่)" fail "$d" ) || rc=1

# ── ด่าน anchor (ลิงก์ภายในเอกสาร) ───────────────────────────────────────────────
# ⑨ ลิงก์ชี้ไปหัวข้อที่ไม่มีอยู่ ต้องโดนจับ
d="$(mk)"; printf '# หัวข้อจริง\n\n[ไป](#หัวข้อปลอม)\n' > "$d/docs/engine/toc.md"
check "anchor จับลิงก์ที่ชี้ไปหัวข้อที่ไม่มี" fail "$d"

# ⑩ ลิงก์ชี้ถูก **ต้องไม่โดนจับ** — เคสด้านบวก กันด่านฟ้องมั่ว
#    (หัวข้อไทย + อิโมจิ + em-dash คือของจริงในเอกสารเรา ไม่ใช่เคสสมมติ)
d="$(mk)"; printf '# 🔴 กติกาเหล็ก — ข้อ 3\n\n[ไป](#-กติกาเหล็ก--ข้อ-3)\n' > "$d/docs/engine/toc.md"
check "anchor ไม่ฟ้องลิงก์ที่ชี้ถูก (ไทย+อิโมจิ+em-dash)" pass "$d"

# ⑪ เคสจริงที่ทำให้ด่านนี้เกิด — สารบัญ backlog.md ข้อ 2.6 มี `-` เกินมาตัวเดียว
#    `## 2.6 — ...` -> slug ที่ถูกคือ `26--...` แต่สารบัญเขียน `26---...` · ห่างกันขีดเดียว ตาคนไม่เห็น
d="$(mk)"; printf '## 2.6 — ของค้าง\n\n[2.6](#26---ของค้าง)\n' > "$d/docs/engine/toc.md"
check "anchor จับเคสจริงของ backlog.md 2.6 (ต่างกันขีดเดียว)" fail "$d"

# ⑫ หัวข้อใน code fence **ไม่ใช่หัวข้อจริง** — ถ้านับ ด่านจะหลวมจนลิงก์พังหลุดได้
d="$(mk)"; printf '# จริง\n\n```sh\n# ปลอม\n```\n\n[ไป](#ปลอม)\n' > "$d/docs/engine/toc.md"
check "anchor ไม่นับหัวข้อใน code fence" fail "$d"

# ⑬ ลิงก์ใน code fence **ไม่ใช่ลิงก์จริง** — ถ้านับ CI จะแดงแบบไม่มีมูล
#    ซึ่งอันตรายกว่าไม่มีด่าน เพราะสอนให้คนข้าม CI ทั้งใบ (เหตุผลเดียวกับที่แยก job rls)
d="$(mk)"; printf '# จริง\n\n```md\n[ตัวอย่าง](#ไม่มีหัวข้อนี้)\n```\n' > "$d/docs/engine/toc.md"
check "anchor ไม่นับลิงก์ใน code fence" pass "$d"

# ⑭ หัวข้อชื่อซ้ำ: GitHub ให้ตัวที่สองเป็น `-1` · ลิงก์ไป `-1` ต้องไม่โดนฟ้อง
d="$(mk)"; printf '# ซ้ำ\n\n# ซ้ำ\n\n[ตัวสอง](#ซ้ำ-1)\n' > "$d/docs/engine/toc.md"
check "anchor รู้จักหัวข้อซ้ำที่ลงท้าย -1" pass "$d"

exit $rc
