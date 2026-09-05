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
DEVREF=pmvxwcimjebogjfimzqy
mkjwt() { python3 -c "
import base64,json,sys
p=base64.urlsafe_b64encode(json.dumps({'ref':sys.argv[1],'role':'service_role'}).encode()).decode().rstrip('=')
print('eyJhbGciOiJIUzI1NiJ9.'+p+'.sig')" "$1"; }
rc=0

# 🔴 **ห้าม `git -C ""` เด็ดขาด — พาธว่างแปลว่า git ไปทำงานที่ cwd จริง**
#    เกิดจริง 27 ส.ค. 2026: เคสหนึ่งเรียก `$(mkrepo)` **ก่อน** ที่ `mkrepo` จะถูกนิยาม
#    (bash อ่านบนลงล่าง) → `$d` ว่าง → `git -C "" add -f -- supabase/.temp/cli-latest`
#    **ไป stage ไฟล์นั้นเข้าทรีจริงของทีม** · และเคสนั้น "ผ่าน" เพราะ guards.sh ล้มกับพาธว่าง
#    ไม่ใช่เพราะจับของผิดได้ → **ผลเคสถูก เหตุผลผิด และไม่มีอะไรในผลลัพธ์บอกเลย**
# 🎯 ตัวที่เปิดโปงคือ stderr `No such file or directory` ที่โผล่ข้างเคสสีเขียว
#    → ห่อ `git` ให้ปฏิเสธพาธว่าง จะได้ไม่ต้องพึ่งสายตาใครอีก
git() {
  if [ "${1-}" = "-C" ] && [ -z "${2-}" ]; then
    echo "🔴 self-test: git -C ด้วยพาธว่าง — fixture ไม่ถูกสร้าง เคสนี้ไม่ได้ทดสอบอะไรเลย" >&2
    rc=1
    return 1
  fi
  command git "$@"
}

mk() {  # สร้างทรีจำลองที่ "สะอาด" แล้วคืน path
  d="$(mktemp -d)"
  # 🔴 ต้องมี supabase-platform/ ไม่งั้น guards.sh ปฏิเสธทั้งทรี (exit 2) ตั้งแต่บรรทัดแรก
  #    เพิ่ม 27 ส.ค. 2026 พร้อมกับด่าน "ทรีนี้ไม่ใช่ทรี platform"
  #    · ตอนเพิ่มด่านนั้น **positive control พังไป 16 เคสรวด** และ negative test ผ่านหมดเหมือนเดิม
  #      (ทุกอย่างแดง ก็ตรงกับที่มันคาดพอดี) — รูปเดิมกับตอนต่อสาย api-hosts
  mkdir -p "$d/docs/engine/schema" "$d/.github" "$d/supabase-platform"
  echo "-- ร่าง DDL" > "$d/docs/engine/schema/ok.sql"
  echo "name: ci" > "$d/.github/ci.yml"
  echo "$d"
}

# 🔴 ต้องนิยาม *ก่อน* เคสแรกที่ใช้มัน — bash อ่านบนลงล่าง
#    เคย: `mkrepo` อยู่บรรทัด 584 แต่เคส ⑯b ใช้ที่ 159 → `$(mkrepo)` คืนค่าว่าง
#    → `check` รันบนพาธว่าง แล้ว **ผ่านเพราะ guards.sh ล้มกับพาธว่าง ไม่ใช่เพราะจับของผิดได้**
#    🎯 จับได้เพราะ stderr พ่น `No such file or directory` ไม่ใช่เพราะผลเคสผิด (ผลมัน 'ถูก')

mkrepo() {  # git repo จริงที่มี lib/ และไฟล์ .ts มากพอให้ด่านยอมทำงาน
  d="$(mktemp -d)"; mkdir -p "$d/lib" "$d/docs/engine/schema" "$d/.github" "$d/supabase-platform"
  echo "-- ร่าง" > "$d/docs/engine/schema/ok.sql"
  i=0; while [ $i -lt 110 ]; do echo "export const v$i = 1;" > "$d/lib/f$i.ts"; i=$((i+1)); done
  git -C "$d" init -q . && git -C "$d" add -A >/dev/null 2>&1
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
#
# 🔴 **หยุดทันทีถ้าข้อนี้ fail — ไม่รันต่อ** (P6 · 27 ส.ค. 2026 · P1 ถามหารูปที่ดีกว่า)
#    เกิดมาแล้ว **2 ครั้งในวันเดียว สคริปต์เดียว คนเดียว**: เพิ่มเงื่อนไขระดับทั้งไฟล์ลง `guards.sh`
#    (ต่อสาย `api-hosts` → พัง 22 เคส · ด่าน "ต้องเป็นทรี platform" → พัง 16 เคส)
#    ทั้งสองครั้ง **ทรีจำลองไม่ผ่านเงื่อนไขใหม่ → เคสด้านลบผ่านหมดแบบว่างเปล่า** (ทุกอย่างแดง
#    ก็ตรงกับที่มันคาดพอดี) และ **เคส ① นี้แดงทั้งสองครั้ง พร้อมคำอธิบายที่ถูกต้องอยู่ข้างบนนี้แล้ว**
#
# 🎯 **ปัญหาไม่ใช่ว่าไม่มีสัญญาณ — ปัญหาคือมันถูกกลบ**
#    ผลที่พิมพ์ออกมาคือ `104 ✅ / 16 🔴` ซึ่ง**อ่านว่า "ส่วนใหญ่ดี มีปัญหาเฉพาะจุด 16 อัน"**
#    ความจริงคือ **ทั้ง 121 เคสไม่มีความหมายเลยสักเคส** · ตัวเลขนั้น *ต่ำกว่า* ความเสียหายจริง
#    → หยุดที่นี่ แล้วบอกตรง ๆ ว่าอะไรพัง **ดีกว่าให้คนไปไล่ 16 อาการของสาเหตุเดียว**
#
# 📌 เลือกทางนี้แทน "fail ถ้าเคสด้านบวกผ่านน้อยกว่า N" ที่ P1 เสนอ — N เป็นเลขที่ต้องตามแก้
#    ทุกครั้งที่เพิ่มเคส และมันจับ *อาการ* · ทางนี้จับ *สาเหตุ* และไม่มีเลขให้ดริฟต์
d="$(mk)"; check "ทรีสะอาดต้องผ่าน" pass "$d"
if [ "$rc" -ne 0 ]; then
  echo
  echo "🔴🔴 หยุด — ควบคุมพื้นฐานล้ม · **ไม่รันเคสที่เหลือ เพราะมันจะไม่มีความหมาย**"
  echo "   ทรีสะอาดที่ \`mk\` สร้าง ไม่ผ่าน guards.sh → เคสด้านลบทุกอันจะ 'ผ่าน' แบบว่างเปล่า"
  echo "   (มันคาดว่า fail · ตอนนี้ทุกอย่าง fail · จึงตรงกันหมดโดยไม่ได้ทดสอบอะไรเลย)"
  echo
  echo "   🎯 สาเหตุที่พบบ่อยที่สุด: เพิ่ง**เพิ่มเงื่อนไขระดับทั้งไฟล์**ลง guards.sh"
  echo "      แล้วทรีจำลองยังไม่มีสิ่งที่เงื่อนไขนั้นต้องการ → แก้ที่ \`mk\`/\`mkrepo\`/\`mkworktree\`"
  echo "      เกิดมาแล้ว 2 ครั้ง: supabase-platform/ ที่หายไป · การต่อสาย api-hosts"
  echo
  echo "   ดูสาเหตุจริง:  .github/guards.sh \$(mktemp -d)"
  exit 1
fi

# ①b 🔴 ทรีที่ *ไม่ใช่* ทรี platform ต้องถูก **ปฏิเสธ** ไม่ใช่ถูกตรวจแล้วให้ผลที่อ่านผิดได้
#    เหตุ: ผมลองรัน guards.sh ใส่ทรีหลัก (`main`) เพื่อดูว่าใช้สคริปต์เดียวคุมสองทรีได้ไหม
#    → ได้ผลที่ดูน่าเชื่อถือ **และมีข้อที่ผิดปนอยู่**: `.env ชี้ไป DB ทริป` ซึ่งบนทรีหลัก **ถูกต้อง**
#    🎯 ด่านหลายตัวฝัง "ทรีนี้คือทรี platform" ไว้ในเกณฑ์ · พอเอาไปใช้ที่อื่น
#       **มันไม่เงียบ มันตอบคำถามอื่นด้วยน้ำเสียงมั่นใจเท่าเดิม**
d="$(mktemp -d)"; mkdir -p "$d/docs/engine/schema" "$d/.github"   # จงใจไม่มี supabase-platform/
if "$G" "$d" >/dev/null 2>&1; then
  echo "🔴 ทรีที่ไม่ใช่ platform ต้องถูกปฏิเสธ — แต่ guards.sh ยอมรันให้"; rc=1
else
  st=$?; "$G" "$d" >/dev/null 2>&1 || st=$?
  if [ "$st" -eq 2 ]; then
    echo "✅ ทรีที่ไม่ใช่ platform ถูกปฏิเสธด้วย exit 2 (ไม่ใช่ 1 ที่แปลว่าเจอปัญหา)"
  else
    echo "🔴 ปฏิเสธแล้วแต่ exit=$st — ต้องเป็น 2 เพื่อแยก 'รันไม่ได้' ออกจาก 'เจอปัญหา'"; rc=1
  fi
fi
rm -rf "$d"

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
# 🔴 แก้ fixture 24 ส.ค. 2026: เดิมใส่ `create table t();` เปล่าๆ ซึ่ง **ตอนนี้ผิดจริง**
#    เพราะด่าน migration-guard (D48) บังคับให้ทุก migration assert ตัวตนของฐาน
#    → แก้ fixture ให้สมจริง ไม่ใช่ผ่อนด่านให้ fixture เก่ารอด
d="$(mk)"; mkdir -p "$d/supabase-platform/supabase/migrations"
printf "do \$guard\$ begin perform 1 from app.project_identity where ref = 'pmvxwcimjebogjfimzqy'; end \$guard\$;\n" \
  > "$d/supabase-platform/supabase/migrations/0001_x.sql"
printf '# ไม่ยกเว้นอะไร\n' > "$d/.github/migration-guard-exempt"
check "โฟลเดอร์ที่ถูกต้องของ CLI ต้องไม่โดนจับ" pass "$d"

# ⑧ link guard ต้องอ่าน path ใหม่ของ CLI (supabase-platform/supabase/.temp/)
#    เคยเขียน path ผิดไว้ ทำให้ด่านนี้ข้ามตัวเองเงียบๆ = no-op อีกตัว
# 🔴 แก้ 24 ส.ค. 2026: เดิมเคสนี้พิสูจน์ว่า "ไม่มี env = แดง" ซึ่ง**เลิกใช้แล้ว** (มติ P1)
#    ตอนนี้พิสูจน์ของที่แรงกว่า: **link ไปที่ ref อื่นต้องแดง แม้ไม่มี env เลยก็ตาม**
d="$(mk)"; mkdir -p "$d/supabase-platform/supabase/.temp"
echo "someotherref" > "$d/supabase-platform/supabase/.temp/project-ref"
( unset DEV_PROJECT_REF; check "link ไป ref อื่นต้องแดง แม้ไม่มี DEV_PROJECT_REF" fail "$d" ) || rc=1

# ⑧b เคสที่เป็นเหตุผลของการเปลี่ยนทั้งหมด: link ถูก + **ไม่ตั้ง env** -> ต้องเขียว
#    ถ้าเคสนี้ fail แปลว่าเรากลับไปสร้างแรงกดดันให้คนเลิกรัน guards.sh บนเครื่องอีก
d="$(mk)"; mkdir -p "$d/supabase-platform/supabase/.temp"
echo "pmvxwcimjebogjfimzqy" > "$d/supabase-platform/supabase/.temp/project-ref"
( unset DEV_PROJECT_REF; check "link ถูกและไม่ตั้ง env ต้องเขียว (ไม่ฝืนคนรันบนเครื่อง)" pass "$d" ) || rc=1

# ⑧c DEV_PROJECT_REF ที่ขัดกับไฟล์ allowlist -> ต้องแดง
#    นี่คือส่วนเดียวของด่านนี้ที่ทำงานบน CI ได้จริง (CI ไม่มี .temp/ ให้ตรวจ)
d="$(mk)"
( DEV_PROJECT_REF=aaaaaaaaaaaaaaaaaaaa; export DEV_PROJECT_REF
  check "DEV_PROJECT_REF ที่ขัดกับไฟล์ allowlist ต้องแดง" fail "$d" ) || rc=1

# ⑧d ไฟล์ allowlist เพี้ยน/ถูกตัด ต้องไม่กลายเป็น allowlist เงียบๆ
d="$(mk)"; bad="$(mktemp)"; echo "ตัดมาครึ่งเดียว" > "$bad"
( ALLOWED_REF_FILE="$bad"; export ALLOWED_REF_FILE
  check "ไฟล์ allowlist ที่ไม่ใช่รูปแบบ ref ต้องแดง" fail "$d" ) || rc=1
rm -f "$bad"

# ⑧e interlock: ref ทริปในไฟล์ allowlist ต้องโดน **ด่าน ref** จับ ไม่ต้องพึ่งด่านนี้ตรวจตัวเอง
d="$(mk)"; printf '%s\n' "$TRIP_REF" > "$d/.github/allowed-project-ref"
check "ref ทริปในไฟล์ allowlist โดนด่าน ref จับ (interlock)" fail "$d"

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

# ── ด่าน "link อยู่ถูกที่ไหม" ────────────────────────────────────────────────────
# 🔴 เคสนี้เคยหลุดจริง — ก่อน 24 ส.ค. 2026 ด่านตรวจแค่ ref ไม่ตรวจตำแหน่ง
#    ทรีที่รากถูก link กับ engine-dev ผ่านฉลุย exit=0 (ยืนยันด้วยมือก่อนแก้)
# ⑮ รากถูก link -> ต้องโดนจับ (นี่คือฉากที่ error message ของ CLI ชวนให้ทำ)
d="$(mk)"; mkdir -p "$d/supabase/.temp"; echo "pmvxwcimjebogjfimzqy" > "$d/supabase/.temp/project-ref"
( DEV_PROJECT_REF=pmvxwcimjebogjfimzqy; export DEV_PROJECT_REF
  check "จับ link ที่ราก แม้ ref จะเป็น engine-dev ที่ถูกต้อง" fail "$d" ) || rc=1

# ⑯ 🔴 **เคสนี้เคยคาด `fail` และถูกกลับด้านเมื่อ 27 ส.ค. 2026** (P1 ชี้ · P6 ยืนยันด้วยของจริง)
#    ~~"โฟลเดอร์ .temp ที่รากแม้ยังไม่มี project-ref ก็ต้องโดนจับ"~~
#    เหตุผลเดิม: `.temp/` คือ *สภาพตั้งต้นของการ link* จับไว้ก่อนดีกว่า
#    🔴 **สมมติฐานนั้นผิด** — CLI สร้าง `.temp/cli-latest` จากการเช็คเวอร์ชัน
#    ซึ่งมันทำแทบทุกคำสั่ง **รวมทั้ง `supabase --version`**
#    · ของจริงที่ P1 เจอ: `.temp/` มีไฟล์เดียว 8 ไบต์ = เลขเวอร์ชัน · ไม่มีอะไรถูก link
#    · และ `db push` ที่ไม่มี `project-ref` **ล้มเอง** → ไม่มีอันตรายเลยแม้แต่ทางเดียว
#    ⚠️ แดงตัวนี้ **บล็อก push ของทั้ง 8 คน** (`D72` ข้อ 2) และ **แดงที่ผิดบ่อย ๆ สอนให้คนเลิกอ่าน**
d="$(mk)"; mkdir -p "$d/supabase/.temp"; echo "v2.115.0" > "$d/supabase/.temp/cli-latest"
check ".temp ที่มีแค่ cli-latest ต้อง *ไม่* แดง (แค่มีคนรัน supabase จากตรงนั้น)" pass "$d"

# ⑯b 🔴 **`.temp` ที่ถูก git *ติดตาม* แล้ว = credential กำลังจะเข้าประวัติถาวร**
#    ใช้ `cli-latest` ล้วน ๆ โดยตั้งใจ — ไฟล์นี้ **ไม่ทำให้ด่าน link แดง** (เคส ⑯)
#    ถ้าเคสนี้แดง แปลว่าแดงเพราะ *ถูก track* จริง ๆ ไม่ใช่แดงตกทอดจากด่านอื่น
#    ⚠️ เจอ 27 ส.ค. 2026: `.gitignore` ที่รากไม่ครอบ `supabase/.temp` เลย
#       ครอบแค่ `supabase-platform/supabase/.temp` (ไฟล์ที่ `supabase init` สร้างใน subtree)
d="$(mkrepo)"; mkdir -p "$d/supabase/.temp"; echo "v2.115.0" > "$d/supabase/.temp/cli-latest"
git -C "$d" add -f -- supabase/.temp/cli-latest >/dev/null 2>&1
check ".temp ที่ถูก git ติดตามต้องแดง (ทางที่ credential เข้าประวัติ)" fail "$d"

# ⑯a แต่ `pooler-url` อย่างเดียวก็ต้องแดง — มันมี connection string และแปลว่า link เกิดจริง
d="$(mk)"; mkdir -p "$d/supabase/.temp"
echo "postgresql://postgres.xxx:p@host:5432/postgres" > "$d/supabase/.temp/pooler-url"
check "จับ .temp ที่มี pooler-url แม้ไม่มี project-ref" fail "$d"

# ⑰ workdir แปลกปลอมอื่นก็ต้องโดนจับ ไม่ใช่ hardcode เฉพาะราก
d="$(mk)"; mkdir -p "$d/somewhere/supabase/.temp"
echo "pmvxwcimjebogjfimzqy" > "$d/somewhere/supabase/.temp/project-ref"
check "จับ link ใน workdir แปลกปลอมที่ไม่ใช่ราก" fail "$d"

# ⑱ ล็อกขอบเขต: link ที่ supabase-platform/ (ที่เดียวที่อนุญาต) + ref ถูก ต้องผ่าน
#    ถ้าเคสนี้ fail แปลว่าด่านใหม่กว้างเกินจนบล็อกทางที่ถูกต้อง = ใช้งานจริงไม่ได้
d="$(mk)"; mkdir -p "$d/supabase-platform/supabase/.temp"
echo "pmvxwcimjebogjfimzqy" > "$d/supabase-platform/supabase/.temp/project-ref"
( DEV_PROJECT_REF=pmvxwcimjebogjfimzqy; export DEV_PROJECT_REF
  check "link ที่ supabase-platform/ พร้อม ref ที่ถูก ต้องผ่าน" pass "$d" ) || rc=1

# ── ด่าน .env ชี้ DB ทริป ────────────────────────────────────────────────────────
# 🔴 ช่องนี้ไม่มีด่านไหนเห็นเลยก่อน 24 ส.ค. 2026 เพราะ .gitignore กัน .env* ไม่ให้ขึ้น git
#    ทำให้ทั้ง gitleaks และ CI ตาบอดถาวร · ด่านนี้จึงมีค่าเฉพาะตอนรันบนเครื่อง
# ⑲ .env.local ที่ถือ ref ทริป -> ต้องโดนจับ (เคสก๊อปจากทรีหลัก)
d="$(mk)"; printf 'NEXT_PUBLIC_SUPABASE_URL=https://%s.supabase.co\n' "$TRIP_REF" > "$d/.env.local"
check ".env จับไฟล์ที่ก๊อปมาจากทรีหลัก (ชี้ DB ทริป)" fail "$d"

# ⑳ .env.local ที่ถือ ref engine-dev **ต้องไม่โดนจับ** — กันด่านกว้างเกินจนบล็อกทางที่ถูก
d="$(mk)"; printf 'NEXT_PUBLIC_SUPABASE_URL=https://pmvxwcimjebogjfimzqy.supabase.co\n' > "$d/.env.local"
check ".env ที่ชี้ engine-dev ต้องผ่าน" pass "$d"

# ㉑b 🔴 เคสที่ด่าน .env **เคยผ่านพร้อมข้อความ ✅ ทั้งที่ผิด** (เจอ 24 ส.ค. 2026)
#     URL เป็น engine-dev แต่ service_role เป็นคีย์ของ DB ทริป
#     ref ใน JWT ถูก base64 ไว้ → `grep` หา ref ไม่มีทางเจอ
#     🔴 ไม่ใช่ช่องที่ยังไม่ได้ปิด แต่เป็นด่านที่รายงานตรงข้ามกับความจริง
d="$(mk)"
{ echo "NEXT_PUBLIC_SUPABASE_URL=https://pmvxwcimjebogjfimzqy.supabase.co"
  echo "SUPABASE_SERVICE_ROLE_KEY=$(mkjwt "$TRIP_REF")"; } > "$d/.env.local"
check ".env จับ service_role ของ DB ทริปที่ซ่อนอยู่ใน JWT" fail "$d"

# ㉑c คีย์ของ engine-dev ต้องไม่โดนจับ — กันด่านกว้างเกินจนบล็อกทางที่ถูก
d="$(mk)"
{ echo "NEXT_PUBLIC_SUPABASE_URL=https://pmvxwcimjebogjfimzqy.supabase.co"
  echo "SUPABASE_SERVICE_ROLE_KEY=$(mkjwt pmvxwcimjebogjfimzqy)"; } > "$d/.env.local"
check ".env ที่มีคีย์ของ engine-dev ต้องผ่าน" pass "$d"

# ㉑d คีย์รูปแบบใหม่ที่ไม่ใช่ JWT ต้องไม่ทำให้แดง (ไม่มี ref ให้ตรวจ ≠ ผิด)
d="$(mk)"
{ echo "NEXT_PUBLIC_SUPABASE_URL=https://pmvxwcimjebogjfimzqy.supabase.co"
  echo "SUPABASE_SERVICE_ROLE_KEY=sb_secret_AbCdEfGhIjKlMnOpQrSt"; } > "$d/.env.local"
check ".env ที่ใช้คีย์รูปแบบใหม่ ต้องไม่แดงเพราะตรวจ ref ไม่ได้" pass "$d"

# ㉑ ชื่อไฟล์อื่นในตระกูล .env ก็ต้องโดนจับ ไม่ใช่ hardcode เฉพาะ .env.local
d="$(mk)"; printf 'URL=https://%s.supabase.co\n' "$TRIP_REF" > "$d/.env.development.local"
check ".env จับไฟล์อื่นในตระกูลเดียวกันด้วย" fail "$d"

# ── ด่าน ci-target (ยืนยัน secret ก่อน CI แตะ DB) ────────────────────────────────
# 🔴 ด่านนี้ไม่ได้อยู่ใน guards.sh เพราะมันตรวจ **env ของ CI** ไม่ใช่ไฟล์ในทรี
#    แต่ต้องมีเทสต์ด้านลบเหมือนกันตามกฎ E0 ข้อ 1
CIT="$(cd "$(dirname "$0")" && pwd)/check-ci-target.py"

citcheck() {  # citcheck <ชื่อ> <pass|fail> <url-ref> <anon-ref> <svc-ref>
  name="$1"; want="$2"
  if NEXT_PUBLIC_SUPABASE_URL="https://$3.supabase.co" \
     NEXT_PUBLIC_SUPABASE_ANON_KEY="$(mkjwt "$4")" \
     SUPABASE_SERVICE_ROLE_KEY="$(mkjwt "$5")" \
     "$CIT" >/dev/null 2>&1; then got=pass; else got=fail; fi
  if [ "$got" = "$want" ]; then echo "✅ $name — ได้ $got ตามคาด"; return 0; fi
  echo "🔴 $name — คาด $want แต่ได้ $got · check-ci-target.py ใช้การไม่ได้"
  rc=1; return 1
}

citcheck "ci-target: ทุกค่าชี้ engine-dev ต้องผ่าน" pass "$DEVREF" "$DEVREF" "$DEVREF"
citcheck "ci-target: URL ชี้ DB ทริปต้องแดง" fail "$TRIP_REF" "$DEVREF" "$DEVREF"
citcheck "ci-target: service_role ของโปรเจกต์อื่นต้องแดง แม้ URL ถูก" fail "$DEVREF" "$DEVREF" "abcdefghijklmnopqrst"
citcheck "ci-target: anon ของโปรเจกต์อื่นต้องแดง แม้ URL ถูก" fail "$DEVREF" "abcdefghijklmnopqrst" "$DEVREF"

# 🔴 เคสที่ฉบับแรกของด่านนี้ **ปล่อยผ่านทั้งหมด** (เจอตอนย้อนกลับมาทดสอบตัวเอง 24 ส.ค. 2026)
#    ต้นเหตุ: เทียบ URL ด้วย substring แทนที่จะ parse host
#    ⚠️ เคสแรกอันตรายที่สุดและ **ไม่ใช่การโจมตี — copy-paste พลาดก็เกิดได้**:
#       host จริงคือ DB ทริป แต่มี ref ของ engine-dev ห้อยอยู่ท้าย fragment
#    🔴 และตั้งแต่ `00271d3` ให้ `delete on public.trips` กับ service_role
#       การปล่อยผ่านตรงนี้ = **ลบแถวผิดฐาน** ไม่ใช่แค่รันเทสต์ผิดที่
urlcheck() {  # urlcheck <ชื่อ> <pass|fail> <url>
  name="$1"; want="$2"
  if NEXT_PUBLIC_SUPABASE_URL="$3" \
     NEXT_PUBLIC_SUPABASE_ANON_KEY="$(mkjwt "$DEVREF")" \
     SUPABASE_SERVICE_ROLE_KEY="$(mkjwt "$DEVREF")" \
     "$CIT" >/dev/null 2>&1; then got=pass; else got=fail; fi
  if [ "$got" = "$want" ]; then echo "✅ $name — ได้ $got ตามคาด"; return 0; fi
  echo "🔴 $name — คาด $want แต่ได้ $got · ด่าน URL ใช้การไม่ได้"
  rc=1; return 1
}

urlcheck "ci-target: host เป็น DB ทริป แต่มี ref dev ห้อยท้าย ต้องแดง" fail \
  "https://$TRIP_REF.supabase.co#https://$DEVREF.supabase.co"
urlcheck "ci-target: host คนละเจ้า แต่มี ref dev ใน query ต้องแดง" fail \
  "https://evil.example.com/?u=https://$DEVREF.supabase.co"
urlcheck "ci-target: host ที่เอา ref dev ไปขึ้นต้นโดเมนอื่น ต้องแดง" fail \
  "https://$DEVREF.supabase.co.attacker.test"
urlcheck "ci-target: scheme ไม่ใช่ https ต้องแดง" fail "http://$DEVREF.supabase.co"
urlcheck "ci-target: URL ที่ถูกต้องต้องยังผ่าน" pass "https://$DEVREF.supabase.co"

# ไม่ตั้ง env เลย ต้องแดง (ตรวจไม่ได้ ≠ ปลอดภัย)
if ( env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
         -u SUPABASE_SERVICE_ROLE_KEY "$CIT" >/dev/null 2>&1 ); then
  echo "🔴 ci-target: ไม่ตั้ง env แล้วยังผ่าน — ตรวจไม่ได้ต้องไม่ผ่าน"; rc=1
else
  echo "✅ ci-target: ไม่ตั้ง env ต้องไม่ผ่าน — ได้ fail ตามคาด"
fi

# ── ด่าน pending-review ─────────────────────────────────────────────────────────
# ㉒ .sql จอดอยู่แต่ไม่มีชื่อใน README -> ต้องโดนจับ (เคส "จอดแล้วหาย")
d="$(mk)"; mkdir -p "$d/supabase-platform/pending-review"
echo "select 1;" > "$d/supabase-platform/pending-review/0009_parked.sql"
echo "# ว่างเปล่า ไม่ได้จดอะไร" > "$d/supabase-platform/pending-review/README.md"
check "pending-review จับไฟล์ที่จอดแล้วไม่มีใครจด" fail "$d"

# ㉓ จดไว้ใน README แล้ว -> ต้องผ่าน
d="$(mk)"; mkdir -p "$d/supabase-platform/pending-review"
echo "select 1;" > "$d/supabase-platform/pending-review/0009_parked.sql"
printf '| `0009_parked.sql` | รอ P4 ตัดสิน |\n' > "$d/supabase-platform/pending-review/README.md"
check "pending-review ผ่านเมื่อมีคนจดว่ารออะไร" pass "$d"

# ㉔ มี .sql จอดแต่ไม่มี README เลย -> ต้องโดนจับ
d="$(mk)"; mkdir -p "$d/supabase-platform/pending-review"
echo "select 1;" > "$d/supabase-platform/pending-review/0009_parked.sql"
check "pending-review จับกรณีไม่มี README เลย" fail "$d"

# ── ด่าน migration-guard (D48) ──────────────────────────────────────────────────
# 🔴 P-30: ด่านที่อยู่ใน *สิ่งที่ถูกยิง* กันตัวแรกไม่ได้ · ด่านนี้ตอบคนละคำถาม
#    SQL ถามว่า "ฐานนี้ใช่ไหม" · ด่านนี้ถามว่า "ยังมีคนใส่ด่านลงไฟล์อยู่ไหม"
mkmig() {  # mkmig <dir> <ชื่อไฟล์> <เนื้อ> — สร้าง migration + ไฟล์ยกเว้นเปล่าในทรีจำลอง
  mkdir -p "$1/supabase-platform/supabase/migrations"
  printf '%s\n' "$3" > "$1/supabase-platform/supabase/migrations/$2"
  [ -f "$1/.github/migration-guard-exempt" ] || printf '# ไม่ยกเว้นอะไร\n' > "$1/.github/migration-guard-exempt"
}
GOOD="do \$guard\$ begin perform 1 from app.project_identity where ref = 'pmvxwcimjebogjfimzqy'; end \$guard\$;"

# ㉕ migration ที่ไม่มี marker เลย -> ต้องโดนจับ
d="$(mk)"; mkmig "$d" "20990101000000_no_guard.sql" "create table t();"
check "migration-guard จับไฟล์ที่ไม่ได้ assert app.project_identity" fail "$d"

# ㉖ มี marker + ref ถูก -> ต้องผ่าน
d="$(mk)"; mkmig "$d" "20990101000000_ok.sql" "$GOOD"
check "migration-guard ผ่านเมื่อ assert marker + ref ครบ" pass "$d"

# ㉗ มี marker แต่ ref เป็นของฐานอื่น -> ต้องโดนจับ (เล็งไปฐานอื่นโดยตั้งใจหรือคัดลอกมาผิด)
d="$(mk)"; mkmig "$d" "20990101000000_wrongref.sql" \
  "do \$guard\$ begin perform 1 from app.project_identity where ref = 'aaaaaaaaaaaaaaaaaaaa'; end \$guard\$;"
check "migration-guard จับ marker ที่เช็ค ref ของฐานอื่น" fail "$d"

# ㉘ ไฟล์ที่อยู่ในรายการยกเว้น ต้องผ่านแม้ไม่มี marker
d="$(mk)"; mkmig "$d" "20990101000000_bootstrap.sql" "create schema app;"
printf '# เหตุผล\n20990101000000_bootstrap.sql\n' > "$d/.github/migration-guard-exempt"
check "migration-guard ยกเว้นไฟล์ bootstrap ตามรายชื่อในไฟล์" pass "$d"

# ㉙ ชื่อในรายการยกเว้นที่ไม่มีไฟล์จริงแล้ว -> ต้องโดนจับ (ยกเว้นที่อายุยืนกว่าไฟล์)
d="$(mk)"; mkmig "$d" "20990101000000_ok.sql" "$GOOD"
printf 'ไฟล์ที่ถูกลบไปแล้ว.sql\n' > "$d/.github/migration-guard-exempt"
check "migration-guard จับรายการยกเว้นที่ไม่มีไฟล์แล้ว" fail "$d"

# ㉚ ไม่มีไฟล์รายชื่อยกเว้นเลย -> ต้องโดนจับ (ตรวจไม่ได้ ≠ ปลอดภัย)
d="$(mk)"; mkmig "$d" "20990101000000_ok.sql" "$GOOD"
( MIGRATION_EXEMPT_FILE="/ไม่มีไฟล์นี้จริง"; export MIGRATION_EXEMPT_FILE
  check "migration-guard ไม่มีไฟล์รายชื่อยกเว้น ต้องไม่ผ่าน" fail "$d" ) || rc=1

# ── ด่าน decision-refs ──────────────────────────────────────────────────────────
# ⚠️ ขอบเขตแคบโดยตั้งใจ: จับ "อ้าง D ที่ไม่มีอยู่" เท่านั้น **ไม่ได้จับกล่องที่ค้างเป็นเท็จ**
mkdocs() {  # mkdocs <dir> <เนื้อ README> <เนื้อไฟล์อื่น>
  mkdir -p "$1/docs/engine"
  printf '%s\n' "$2" > "$1/docs/engine/README.md"
  printf '%s\n' "$3" > "$1/docs/engine/other.md"
}

# ㉛ อ้างถึง D ที่ไม่มีนิยาม -> ต้องโดนจับ
d="$(mk)"; mkdocs "$d" '### D1 — มีจริง' 'ดู `D99` ประกอบ'
check "decision-refs จับการอ้าง D ที่ไม่มีนิยาม" fail "$d"

# ㉜ อ้างถึง D ที่มีนิยาม -> ต้องผ่าน
d="$(mk)"; mkdocs "$d" '### D1 — มีจริง' 'ดู `D1` ประกอบ'
check "decision-refs ผ่านเมื่อ D ที่อ้างมีนิยามจริง" pass "$d"

# ㉝ นิยามแบบแถวตารางก็ต้องนับ
d="$(mk)"; mkdocs "$d" '| D22 | อาการ | อ่านผิดว่า |' 'ดู `D22` ประกอบ'
check "decision-refs นับนิยามที่เป็นแถวตารางด้วย" pass "$d"

# ㉞ 🔴 การอ้างถึงในเนื้อความ **ต้องไม่นับเป็นนิยาม**
#    ไม่งั้นพิมพ์เลขผิดในย่อหน้าเดียว มันจะกลายเป็นนิยามของตัวเอง แล้วด่านผ่านตัวเองเงียบๆ
d="$(mk)"; mkdocs "$d" '### D1 — มีจริง

ย่อหน้านี้พูดถึง `D99` เฉยๆ ไม่ใช่หัวข้อ' 'ดู `D99` ประกอบ'
check "decision-refs ไม่นับการอ้างในเนื้อความว่าเป็นนิยาม" fail "$d"

# ㉟ README ที่ไม่มีนิยาม D เลย = ผิดปกติ ต้องไม่ผ่าน
d="$(mk)"; mkdocs "$d" 'ไม่มีอะไรเลย' 'ดู `D1` ประกอบ'
check "decision-refs README ที่ไม่มีนิยามเลย ต้องไม่ผ่าน" fail "$d"

# ── ด่าน cache-lockdown (P-33 · Q3) ───────────────────────────────────────────────
# 🔴 กับดัก false positive 3 อันในไฟล์จริง: `revoke … from anon, authenticated` ·
#    `grant … to service_role` · และ **คอมเมนต์ที่เขียนคำว่า `create policy`**
#    ถ้าด่านแดงใส่ของพวกนี้ มันจะถูกปิดถาวรตั้งแต่วันแรก (P-35)
# 🔴 แก้ 3 ก.ย. 2026 — เคสชุดนี้เคยผูกกับดีไซน์ `D87` (select+insert 3 ใบ) ที่ถูก `Q3`
#    ทับภายในวันเดียว (select อย่างเดียว 2 ใบ · `travel_time_cache` กลับไป locked)
#    ของจริงตอนนี้: **locked** = `place_details_local_cache` · `travel_time_cache`
#    **client-scoped (select)** = `place_details_cache` · `place_photo_cache`
LOCKLIST_T="$(cd "$(dirname "$0")" && pwd)/no-policy-tables"
mkmigsql() {
  mkdir -p "$1/supabase-platform/supabase/migrations"
  printf '%s\n' "$2" > "$1/supabase-platform/supabase/migrations/20990909000000_x.sql"
  printf '# ไม่ยกเว้นอะไร\n' > "$1/.github/migration-guard-exempt"
}
GUARDBLK="do \$guard\$ begin perform 1 from app.project_identity where ref = 'pmvxwcimjebogjfimzqy'; end \$guard\$;"

# ㊱ create policy บนตาราง **locked** -> ต้องโดนจับ
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
create policy p on public.travel_time_cache for select to authenticated using (true);"
check "cache-lockdown จับ create policy บนตาราง locked" fail "$d"

# ㊲ grant ให้ authenticated บนตาราง locked -> ต้องโดนจับ
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
grant select on public.place_details_local_cache to authenticated;"
check "cache-lockdown จับ grant ให้ authenticated (ตาราง locked)" fail "$d"

# ㊲a 🎯 เคสควบคุมฝั่งบวกของ `Q3` — select ให้ authenticated บนตาราง client-scoped ต้องผ่าน
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
grant select on public.place_details_cache to authenticated;"
check "cache-lockdown ไม่ฟ้อง select ให้ authenticated บนตาราง client-scoped (Q3)" pass "$d"

# ㊲b insert บนตาราง client-scoped -> ต้องโดนจับ (Q3 ยอมแค่ select ไม่มี insert แล้ว — D87 เดิมถูกถอน)
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
grant insert on public.place_details_cache to authenticated;"
check "cache-lockdown จับ grant insert บนตาราง client-scoped (D87 ถูก Q3 ถอนแล้ว)" fail "$d"

# ㊲c delete บนตาราง client-scoped -> ต้องโดนจับ
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
grant delete on public.place_photo_cache to authenticated;"
check "cache-lockdown จับ grant delete บนตาราง client-scoped" fail "$d"

# ㊲d anon บนตาราง client-scoped -> ต้องโดนจับ (Q3 ให้แค่ authenticated)
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
grant select on public.place_details_cache to anon;"
check "cache-lockdown จับ grant ให้ anon บนตาราง client-scoped" fail "$d"

# ㊲e policy ที่ไม่ระบุ `to` บนตาราง client-scoped -> ต้องโดนจับ (default = public)
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
create policy p on public.place_photo_cache for select using (true);"
check "cache-lockdown จับ policy ไม่ระบุ to (default public) บนตาราง client-scoped" fail "$d"

# ㊲f policy for select to authenticated บนตาราง client-scoped -> ต้องผ่าน (รูปเดียวกับ Q3 จริง)
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
create policy p on public.place_photo_cache for select to authenticated using (true);"
check "cache-lockdown ไม่ฟ้อง policy select to authenticated บนตาราง client-scoped" pass "$d"

# ㊲g policy for update to authenticated บนตาราง client-scoped -> ต้องโดนจับ (update ไม่อยู่ใน privilege ที่ประกาศ)
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
create policy p on public.place_photo_cache for update to authenticated using (true);"
check "cache-lockdown จับ policy for update บนตาราง client-scoped" fail "$d"

# ㊳ ปิด RLS -> ต้องโดนจับ
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
alter table public.place_details_cache disable row level security;"
check "cache-lockdown จับการปิด RLS" fail "$d"

# ㊴ revoke จาก anon/authenticated **ต้องไม่โดนจับ** — นี่คือ statement จริงในไฟล์ P1
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
revoke all on public.place_details_cache from public, anon, authenticated;"
check "cache-lockdown ไม่ฟ้อง revoke จาก anon/authenticated" pass "$d"

# ㊵ grant ให้ service_role **ต้องไม่โดนจับ** — ข้อยกเว้นที่ 5 ที่ P1 อนุมัติแล้ว
d="$(mk)"; mkmigsql "$d" "$GUARDBLK
grant select, insert, delete on public.place_photo_cache to service_role;"
check "cache-lockdown ไม่ฟ้อง grant ให้ service_role" pass "$d"

# ㊶ คอมเมนต์ที่เขียนคำว่า create policy **ต้องไม่โดนจับ**
d="$(mk)"; mkmigsql "$d" "-- ไม่มี create policy ในไฟล์นี้เลย · grant execute to authenticated ก็ไม่ปิดฝั่งเขียน
$GUARDBLK"
check "cache-lockdown ไม่ฟ้องคำที่อยู่ในคอมเมนต์" pass "$d"

# ── ด่าน cache-registry-drift (P1+P6 · 3 ก.ย. 2026) ───────────────────────────────
# 🔴 เทียบ `.github/{no-policy-tables,cache-client-privileges}` กับ `assert_cache_lockdown()`
#    — เรียกสคริปต์ตรงๆ (ไม่ผ่าน guards.sh) เพราะ CLI รับ 2 ไฟล์รายชื่อ + migration หลายไฟล์
DRIFT_T="$(cd "$(dirname "$0")" && pwd)/check-cache-registry-drift.py"
driftchk() {  # driftchk <ชื่อ> <pass|fail> <locked-file> <priv-file> <เนื้อ migration>
  name="$1"; want="$2"; lockedf="$3"; privf="$4"; body="$5"
  mig="$(mktemp)"; printf '%s\n' "$body" > "$mig"
  if python3 "$DRIFT_T" "$lockedf" "$privf" "$mig" >/dev/null 2>&1; then got=pass; else got=fail; fi
  rm -f "$mig"
  if [ "$got" = "$want" ]; then echo "✅ $name — ได้ $got ตามคาด"; return 0; fi
  echo "🔴 $name — คาด $want แต่ได้ $got"; rc=1; return 1
}

# 🔴 ต้องมีคำว่า `assert_cache_lockdown` ในทุกฟิกซ์เจอร์ — ด่านนี้ข้าม (คืน pass ทันที) ถ้าไม่มี
#    migration ไหนแตะฟังก์ชันนี้เลย ถ้าลืมใส่ ฟิกซ์เจอร์จะ "ผ่าน" ผ่านทางลัดนั้นแทนที่จะทดสอบตรรกะจริง
REALLOCKED="$(cd "$(dirname "$0")" && pwd)/no-policy-tables"
REALPRIV="$(cd "$(dirname "$0")" && pwd)/cache-client-privileges"
DECLARE_MATCH="create or replace function app.assert_cache_lockdown() returns void as \$fn\$
declare
  locked     text[] := array['travel_time_cache','place_details_local_cache'];
  readable   text[] := array['place_details_cache','place_photo_cache'];
begin end; \$fn\$;"

driftchk "cache-registry-drift: ตรงกับไฟล์จริงวันนี้ ต้องผ่าน" pass "$REALLOCKED" "$REALPRIV" "$DECLARE_MATCH"

# 🔴 ดริฟต์จริง — SQL มีตารางเพิ่มที่ไฟล์ไม่มี ต้องจับ
driftchk "cache-registry-drift: จับดริฟต์จริง (ตารางเกินในฟังก์ชัน)" fail "$REALLOCKED" "$REALPRIV" \
"create or replace function app.assert_cache_lockdown() returns void as \$fn\$
declare
  locked     text[] := array['travel_time_cache','place_details_local_cache','extra_cache'];
  readable   text[] := array['place_details_cache','place_photo_cache'];
begin end; \$fn\$;"

# 🔴 ตัวแจงตาบอด (เปลี่ยนชื่อตัวแปร) — ต้องจับเป็น fail เหมือนกัน แต่คนละข้อความจากดริฟต์จริง
#    ยืนยันข้อความแยกกันจริงด้วย grep ตรงๆ ไม่ใช่แค่ exit code เดียวกัน
d_blind="$(mktemp)"; printf '%s\n' "create or replace function app.assert_cache_lockdown() returns void as \$fn\$
declare
  cache_locked_tables text[] := array['travel_time_cache','place_details_local_cache'];
  cache_readable_tables text[] := array['place_details_cache','place_photo_cache'];
begin end; \$fn\$;" > "$d_blind"
blind_out="$(python3 "$DRIFT_T" "$REALLOCKED" "$REALPRIV" "$d_blind" 2>&1)"
rm -f "$d_blind"
if printf '%s' "$blind_out" | grep -q "ตัวแจงล้า"; then
  echo "✅ cache-registry-drift: ตัวแจงตาบอด (เปลี่ยนชื่อตัวแปร) ได้ข้อความ 'ตัวแจงล้า' แยกจากดริฟต์จริง"
else
  echo "🔴 cache-registry-drift: ตัวแจงตาบอด — คาดข้อความ 'ตัวแจงล้า' ไม่เจอ (อาจไปพูดว่าดริฟต์แทน)"; rc=1
fi

# 🔴 P1 ขอ (3 ก.ย. 2026) — ปิดประตู "ทางลัดข้าม" ไม่ให้เงียบตลอดไปวันที่มีคนแก้ regex/รูป SQL
#    รันด่านนี้ใส่ **migration จริงของทรี** (ไม่ใช่ fixture) แล้วยืนยันว่ามันเข้าตรรกะเทียบจริง
#    (ข้อความ "ตรงกันระหว่างไฟล์กับ") ไม่ใช่ทางลัด "ข้าม (ไม่มีอะไรให้เทียบ)" — ถ้าวันหนึ่งใครแก้
#    LOCKED_RE/READABLE_RE จนแจงไม่ออกจากของจริง เคสนี้ต้องจับได้ ไม่ใช่รอให้ P1 ยิงมือ
REALMIGDIR="$(cd "$(dirname "$0")/.." && pwd)/supabase-platform/supabase/migrations"
if [ -d "$REALMIGDIR" ]; then
  real_migs=""
  for f in "$REALMIGDIR"/*.sql; do [ -e "$f" ] && real_migs="$real_migs $f"; done
  # shellcheck disable=SC2086
  real_out="$(python3 "$DRIFT_T" "$REALLOCKED" "$REALPRIV" $real_migs 2>&1)"
  if printf '%s' "$real_out" | grep -q "ตรงกันระหว่างไฟล์กับ"; then
    echo "✅ cache-registry-drift: migration จริงของทรีเข้าตรรกะเทียบจริง (ไม่ได้ผ่านทางลัดข้าม)"
  elif printf '%s' "$real_out" | grep -q "ไม่มี migration ไหนแตะ"; then
    echo "🔴 cache-registry-drift: migration จริงผ่านทางลัด 'ข้าม' — ด่านนี้ไม่ได้ตรวจอะไรบนทรีจริงเลย"; rc=1
  else
    echo "🔴 cache-registry-drift: รันกับ migration จริงแล้วไม่เขียว ไม่ใช่สภาพที่คาด — $(printf '%s' "$real_out" | head -1)"; rc=1
  fi
else
  echo "🔴 cache-registry-drift: หา $REALMIGDIR ไม่เจอ — เคสกันทางลัดข้ามรันไม่ได้"; rc=1
fi

# ── ด่าน dynamic-from ───────────────────────────────────────────────────────────
# 🔴 ด่านนี้เจอของจริงตั้งแต่รันครั้งแรก และสอนผมว่าสมมติฐานผมผิด (ดูหัว check-dynamic-from.py)
DYN="$(cd "$(dirname "$0")" && pwd)/check-dynamic-from.py"
dynchk() {  # dynchk <ชื่อ> <pass|fail> <เนื้อไฟล์>
  name="$1"; want="$2"; d="$(mktemp -d)"
  printf '%s\n' "$3" > "$d/x.ts"
  if DYNAMIC_FROM_ALLOWED=/dev/null "$DYN" "$d/x.ts" >/dev/null 2>&1; then got=pass; else got=fail; fi
  rm -rf "$d"
  if [ "$got" = "$want" ]; then echo "✅ $name — ได้ $got ตามคาด"; return 0; fi
  echo "🔴 $name — คาด $want แต่ได้ $got · check-dynamic-from.py ใช้การไม่ได้"; rc=1; return 1
}

dynchk "dynamic-from จับชื่อตารางที่เป็นตัวแปร" fail 'supabase.from(t).select("*");'
dynchk "dynamic-from ผ่านเมื่อชื่อตารางเป็นสตริงตรง" pass 'supabase.from("trips").select("*");'
dynchk "dynamic-from ไม่ฟ้อง Array.from ที่ขึ้นบรรทัดใหม่" pass 'const q = Array.from(
  byQuery.keys()
);'
# 🔴 เคสที่ฉบับแรกฟ้องผิด — receiver อยู่คนละบรรทัด
dynchk "dynamic-from ไม่ฟ้อง storage เชนหลายบรรทัด" pass 'const x = await supabase.storage
  .from(BUCKET)
  .createSignedUrl(k, 60);'
dynchk "dynamic-from ไม่ฟ้องชื่อตารางที่อยู่ในคอมเมนต์" pass '// เดิมเขียนเป็น supabase.from(...) แล้วลืม predicate
supabase.from("trips").select("*");'

# ไฟล์ในรายการอนุญาต ต้องผ่านแม้ใช้ตัวแปร
d="$(mktemp -d)"; printf 'supabase.from(name);\n' > "$d/db.ts"
al="$(mktemp)"; printf '%s\n' "$(basename "$d")/db.ts" > "$al"
if DYNAMIC_FROM_ALLOWED="$al" "$DYN" "$d/db.ts" >/dev/null 2>&1; then
  echo "🔴 dynamic-from: ไฟล์นอกรายการ (พาธไม่ตรง) ไม่ควรผ่าน"; rc=1
else
  echo "✅ dynamic-from: เทียบพาธแบบตรงตัว ไม่ใช่แค่ชื่อไฟล์ — ได้ fail ตามคาด"
fi
rm -rf "$d" "$al"

# 🔴 **เคสที่หลุดจริง 6 ก.ย. 2026** — `guards.sh` เรียกด้วย ROOT เป็นพาธเต็ม (ตามธรรมเนียม
#    "อ้าง path เต็มเสมอ" ของ `§3.3` และตรงกับที่ท่าปักหมุดในทรีชั่วคราวต้องใช้) แต่ allowlist
#    เก็บพาธสัมพัทธ์แบบรีโป (`lib/engine/db.ts`) — `path.lstrip("./")` ตัดได้แค่ `/` ตัวแรก
#    ของพาธเต็ม ไม่เหลือ `lib/engine/db.ts` ให้ตรง ⇒ **ไฟล์ที่ยกเว้นไว้ถูกฟ้องเป็นของใหม่**
#    ทั้งที่ ROOT="." (สิ่งที่ CI เรียกจริงใน ci.yml) ไม่เจอปัญหานี้เลย — สองคนรันคนละท่าได้คนละคำตอบ
d="$(mktemp -d)"; mkdir -p "$d/lib/engine"; printf 'supabase.from(name);\n' > "$d/lib/engine/db.ts"
al="$(mktemp)"; printf 'lib/engine/db.ts\n' > "$al"
if ( DYNAMIC_FROM_ALLOWED="$al" DYNAMIC_FROM_ROOT="$d" "$DYN" "$d/lib/engine/db.ts" >/dev/null 2>&1 ); then
  echo "✅ dynamic-from: ไฟล์ในรายการยกเว้น ผ่านแม้เรียกด้วย ROOT เป็นพาธเต็ม"
else
  echo "🔴 dynamic-from: ROOT เป็นพาธเต็มทำให้ allowlist match พัง (บั๊กที่เคยเกิดจริงกลับมา)"; rc=1
fi
rm -rf "$d" "$al"

# ── ด่าน helper-only (ครึ่งที่สองของ D81 · ใช้ตัวแยกวิเคราะห์ตัวเดียวกับ dynamic-from) ──
hochk() {  # hochk <ชื่อ> <pass|fail> <เนื้อไฟล์>
  name="$1"; want="$2"; d="$(mktemp -d)"
  printf '%s\n' "$3" > "$d/x.ts"
  if DYNAMIC_FROM_ALLOWED=/dev/null "$DYN" "$d/x.ts" >/dev/null 2>&1; then got=pass; else got=fail; fi
  rm -rf "$d"
  if [ "$got" = "$want" ]; then echo "✅ $name — ได้ $got ตามคาด"; return 0; fi
  echo "🔴 $name — คาด $want แต่ได้ $got"; rc=1; return 1
}

hochk "helper-only จับการเรียก catalog_places ตรง ๆ" fail 'supabase.from("catalog_places").select("*");'
# 🔴 เคสนี้ตรึง *การตัดสินใจ* ไม่ใช่แค่พฤติกรรม: trip_stops ยังไม่อยู่ในรายการโดยตั้งใจ
#    (7 จุดในโค้ดเว็บทริปที่ freeze) · วันที่ย้ายเข้า helper แล้วเพิ่มชื่อ เคสนี้จะแดง
#    **และมันควรแดง** — เป็นสัญญาณว่าถึงเวลาแก้เคสนี้พร้อมกัน ไม่ใช่ว่าด่านพัง
hochk "trip_stops ยังเรียกตรงได้ (ยังไม่อยู่ในรายการ)" pass 'supabase.from("trip_stops").select("*");'
hochk "ตารางที่ไม่ได้คุ้มครอง เรียกตรงได้" pass 'supabase.from("bookings").select("*");'

# ไฟล์ในชั้น data-access เรียกตารางที่คุ้มครองได้
d="$(mktemp -d)"; printf 'supabase.from("catalog_places").select("*");\n' > "$d/db.ts"
al="$(mktemp)"; printf 'db.ts\n' > "$al"
if ( cd "$d" && DYNAMIC_FROM_ALLOWED="$al" "$DYN" db.ts >/dev/null 2>&1 ); then
  echo "✅ helper-only: ไฟล์ในชั้น data-access เรียกตารางที่คุ้มครองได้ — ได้ pass ตามคาด"
else
  echo "🔴 helper-only: ไฟล์ในชั้น data-access ควรเรียกได้ แต่โดนจับ"; rc=1
fi
rm -rf "$d" "$al"

# ── รูที่ P4 รายงาน 25 ส.ค. 2026 — ทั้งคู่เป็นทิศ "มองไม่เห็น = ผ่าน" ────────────
# 🔴 ทั้งสองรูเลี่ยงได้ **ทั้งสองกฎ** (ชื่อไดนามิก และ helper-only) = 4 รูปที่หลุด
#    รูที่ 1: ตัดคอมเมนต์ด้วย regex ทีละบรรทัด → `//` ใน `"https://…"` กลืนโค้ดที่เหลือ
#             ⚠️ ทีมนี้จดบทเรียนนี้ไว้แล้วที่ `_helpers.ts` (`stripTsComments`) **แต่คนละภาษา**
#    รูที่ 2: อาร์กิวเมนต์ขึ้นบรรทัดใหม่ (prettier ตัดเอง) → `continue` เงียบ
#             ⚠️ และคอมเมนต์ตรงนั้นอ้างว่า "ผ่านมาถึงนี่ไม่ได้" ซึ่งไม่จริง — **คำอธิบายคือสิ่งที่ทำให้มันรอดรีวิว**
dynchk "รูที่ 1: URL บรรทัดเดียวกัน + ชื่อตัวแปร" fail 'fetch("https://api.example/x"); supabase.from(t);'
dynchk "รูที่ 1: URL บรรทัดเดียวกัน + ตารางที่คุ้มครอง" fail 'const u = "https://x/y"; supabase.from("catalog_places");'
dynchk "รูที่ 2: อาร์กิวเมนต์ขึ้นบรรทัดใหม่ + ชื่อตัวแปร" fail 'supabase.from(
  t
);'
dynchk "รูที่ 2: อาร์กิวเมนต์ขึ้นบรรทัดใหม่ + ตารางที่คุ้มครอง" fail 'supabase.from(
  "catalog_places"
);'
# เคสด้านบวกคู่กัน — ตัดคอมเมนต์ต้อง **ไม่** กินโค้ดจริง
dynchk "URL ในสตริงที่ไม่มีอะไรผิด ต้องไม่โดน" pass 'const u = "https://x/y"; supabase.from("bookings");'
dynchk "ชื่อตารางในคอมเมนต์บล็อก ต้องไม่โดน" pass '/* supabase.from("catalog_places") */
supabase.from("bookings");'

# ── "หนึ่งเลข หนึ่งนิยาม" (P1 ขอ · P-66×2 · P-67×2 คืนนี้) ──────────────────────
DREFS_T="$(cd "$(dirname "$0")" && pwd)/check-decision-refs.py"
dref() {  # dref <ชื่อ> <pass|fail> <เนื้อ README>
  name="$1"; want="$2"; d="$(mktemp -d)"
  printf '%s\n' "$3" > "$d/R.md"
  if "$DREFS_T" "$d/R.md" "$d/R.md" >/dev/null 2>&1; then got=pass; else got=fail; fi
  rm -rf "$d"
  if [ "$got" = "$want" ]; then echo "✅ $name — ได้ $got ตามคาด"; return 0; fi
  echo "🔴 $name — คาด $want แต่ได้ $got"; rc=1; return 1
}

dref "หนึ่งเลขหนึ่งนิยาม: P ซ้ำต้องแดง" fail '### 🔴 `P-66` — หนึ่ง
### 🔴 `P-66` — สอง'
dref "หนึ่งเลขหนึ่งนิยาม: D ซ้ำต้องแดง" fail '### 🟢 D53 — หนึ่ง
### 🎯 D53 — สอง'
# 🔴 4 เคสนี้ P1 วัดมาก่อนขอ ว่าจะเป็น false positive ถ้าไม่แยก "นิยาม" ออกจาก "เอ่ยถึง"
dref "หัวข้อที่เอ่ยถึง ID ไม่ใช่นิยาม" pass '### 🔴 `P-33` — นิยามจริง
### 📌 เลขที่ชนกัน — `P-33` มี 2 ความหมาย
### ② เคส `P-33` — และตัวกัน'
# ตัวหลอกที่สุด: ID อยู่หน้าสุดจริง **แต่ไม่มี em-dash** → ไม่ใช่นิยาม
dref "ID หน้าสุดแต่ไม่มี em-dash ไม่ใช่นิยาม" pass '### 🔴 `P-33` — นิยามจริง
### 🔴 `P-33` ปิดฝั่ง client แล้ว · ต่อ'
dref "นิยามกลุ่ม (P-30 · P-31) นับทุกตัว" pass '### 📌 `P-30` · `P-31` — ของ P4'
dref "ธรรมเนียมเก่า (เปล่า) กับใหม่ (backtick) ใช้ได้ทั้งคู่" pass '### 🔴 P-24 — เก่า
### 🔴 `P-61` — ใหม่'

# ── ด่าน api-config (P4 ขอ · เส้นแบ่งที่ trigger อ่าน app.* พึ่งอยู่) ─────────────
mkcfg() {  # mkcfg <dir> <เนื้อ config.toml>
  mkdir -p "$1/supabase-platform/supabase"
  printf '%s\n' "$2" > "$1/supabase-platform/supabase/config.toml"
}

# ㊷ db_pre_request ถูกตั้ง -> ต้องโดนจับ (เส้นทาง claim→GUC จะเปิด)
d="$(mk)"; mkcfg "$d" '[api]
db_pre_request = "public.copy_claims"'
check "api-config จับ db_pre_request ที่ถูกตั้ง" fail "$d"

# ㊸ เขียนแบบขีดกลางก็ต้องจับ
d="$(mk)"; mkcfg "$d" '[api]
db-pre-request = "x"'
check "api-config จับ db-pre-request (ขีดกลาง)" fail "$d"

# ㊹ 🔴 ถูก comment ไว้ **ต้องไม่โดนจับ** — บรรทัดที่ปิดไว้ไม่ใช่การตั้งค่า
#    ถ้าฟ้อง จะแดงใส่ config ที่มีคำอธิบายอยู่ ซึ่งไฟล์จริงเต็มไปด้วยคอมเมนต์
d="$(mk)"; mkcfg "$d" '[api]
# db_pre_request = "public.copy_claims"   ← ปิดไว้โดยตั้งใจ
schemas = ["public", "graphql_public"]'
check "api-config ไม่ฟ้อง db_pre_request ที่ถูก comment ไว้" pass "$d"

# ㊺ schema app ถูก expose -> ต้องโดนจับ (ตารางสวิตช์จะเรียกจากไคลเอนต์ได้)
d="$(mk)"; mkcfg "$d" '[api]
schemas = ["public", "app", "graphql_public"]'
check "api-config จับ schema app ที่ถูก expose" fail "$d"

# ㊻ config ปกติ ต้องผ่าน
d="$(mk)"; mkcfg "$d" '[api]
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]'
check "api-config ผ่านกับ config ที่ถูกต้อง" pass "$d"

# ── ด่าน readonly-mode (ข้อ ⑤ ของ P6 · ฝั่ง CI) ─────────────────────────────────
# 🔴 ยิงตรรกะล้วนผ่าน --decide เพื่อให้ทดสอบได้โดยไม่ต้องมีเน็ตหรือ creds
ROM="$(cd "$(dirname "$0")" && pwd)/check-readonly-mode.py"
rom() {  # rom <ชื่อ> <pass|fail> <json>
  name="$1"; want="$2"
  if "$ROM" --decide "$3" >/dev/null 2>&1; then got=pass; else got=fail; fi
  if [ "$got" = "$want" ]; then echo "✅ $name — ได้ $got ตามคาด"; return 0; fi
  echo "🔴 $name — คาด $want แต่ได้ $got"; rc=1; return 1
}

rom "readonly-mode: โหมดเปิดต้องแดง" fail '[{"read_only":true,"reason":"E7 cutover"}]'
rom "readonly-mode: โหมดปิดต้องผ่าน" pass '[{"read_only":false,"reason":null}]'
# 🔴 ตารางไม่มีแถว = อ่านสถานะไม่ได้ ≠ ปลอดภัย · ต้องแดง ไม่ใช่ผ่านเพราะ "ไม่เจอ true"
rom "readonly-mode: ตารางไม่มีแถวต้องแดง" fail '[]'
rom "readonly-mode: payload ผิดรูปต้องแดง" fail '[{"mode":"ro"}]'
rom "readonly-mode: payload ไม่ใช่ list ต้องแดง" fail '{"read_only":false}'
# เคสด้านบวกของ *ข้อความ*: ต้องมีคำว่า "ไม่มีความหมาย" ไม่ใช่แค่ exit 1
# 🔴 ต้องเก็บ output ใส่ตัวแปรก่อน **ห้าม pipe ตรงเข้า grep**
#    ไฟล์นี้ตั้ง `set -o pipefail` → `cmd | grep` จะคืน exit ของ `cmd` (ซึ่งคือ 1 โดยตั้งใจ)
#    ทำให้เคสนี้แดงทั้งที่ข้อความถูกต้อง — **เครื่องมือวัดโกหก ตระกูลเดียวกับ `$?` หลัง pipe**
rom_out="$("$ROM" --decide '[{"read_only":true,"reason":"x"}]' 2>&1 || true)"
if printf '%s' "$rom_out" | grep -q 'ไม่มีความหมาย'; then
  echo "✅ readonly-mode: ข้อความบอกว่า 'ผลไม่มีความหมาย' ไม่ใช่ 'โค้ดพัง'"
else
  echo "🔴 readonly-mode: ข้อความไม่ได้บอกว่าผลไม่มีความหมาย — คนจะไปไล่หาบั๊ก"; rc=1
fi

# ── ขอบของ "หัวข้อ" ตาม CommonMark (เจอของจริง 27 ส.ค. 2026) ────────────────────
# 🔴 เยื้อง 4 ช่องขึ้นไป = **code block ไม่ใช่หัวข้อ** → ไม่มี anchor
#    `backlog.md:905` เขียน `### \`P-78\`` เยื้อง 6 ช่อง · ในซอร์สดูเหมือนหัวข้อทุกประการ
#    แต่ GitHub เรนเดอร์เป็นบล็อกโค้ด → ลิงก์ `#-p-78` ชี้ไปที่ที่ไม่มีอยู่
# ⚠️ และช่วง 1–3 ช่องต้องนับเป็นหัวข้อ ไม่งั้นด่านจะฟ้องลิงก์ที่กดแล้วไปถูกที่
d="$(mk)"; printf '  ## หัวข้อเยื้องสองช่อง\n\n[ไป](#หัวข้อเยื้องสองช่อง)\n' > "$d/docs/engine/x.md"
check "anchor นับหัวข้อที่เยื้อง 1–3 ช่องว่าเป็นหัวข้อ" pass "$d"

d="$(mk)"; printf '      ### หัวข้อเยื้องหกช่อง\n\n[ไป](#หัวข้อเยื้องหกช่อง)\n' > "$d/docs/engine/x.md"
check "anchor ไม่นับบรรทัดเยื้อง 4+ ช่องว่าเป็นหัวข้อ" fail "$d"

# ── api-hosts + naive-strip (P6 · 27 ส.ค. 2026) ────────────────────────────────
# 🔴 **เคสกลุ่มนี้เกิดขึ้นเพราะ self-test ชุดเดิมมองไม่เห็นความพังที่เพิ่งเกิด:**
#    ตอนต่อสายด่านสองตัวนี้ ผมกั้นด้วย `[ -d "$ROOT/.git" ]` ซึ่ง **เป็นเท็จในทรีที่สร้างด้วย
#    `git worktree`** (ที่นั่น `.git` เป็นไฟล์) → ด่านทั้งสองตัวเงียบหายจากทรีจริง **แต่ guards.sh ยังเขียว**
#    · ทรีจำลองของ self-test ไม่มี lib/ อยู่แล้ว จึงข้ามด่านนี้ทั้งคู่ **ทุกเคสยังเขียวหมด**
#    🎯 บทเรียน: **เคสที่ทดสอบ *ด่าน* ไม่ได้ทดสอบ *สายที่ต่อด่านเข้ากับ guards.sh*
#       "ด่านไม่ได้รัน" กับ "ด่านรันแล้วสะอาด" ต่างกันแค่บรรทัด ✅ ที่หายไป — และไม่มีใครนับบรรทัด**


pyc() {  # pyc <ชื่อ> <pass|fail> <สคริปต์> <dir>
  name="$1"; want="$2"; scr="$3"; dir="$4"
  if python3 "$(cd "$(dirname "$0")" && pwd)/$scr" "$dir" >/dev/null 2>&1; then got=pass; else got=fail; fi
  rm -rf "$dir"
  if [ "$got" = "$want" ]; then echo "✅ $name — ได้ $got ตามคาด"; return 0; fi
  echo "🔴 $name — คาด $want แต่ได้ $got"; rc=1; return 1
}

d="$(mkrepo)"; pyc "api-hosts: ทรีสะอาดต้องผ่าน" pass check-api-hosts.py "$d"

d="$(mkrepo)"; echo 'fetch("https://dapi.kakao.com/v2/local");' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: เรียก Kakao ต้องโดนจับ" fail check-api-hosts.py "$d"

d="$(mkrepo)"; echo 'const u = "https://maps.googleapis.com/maps/api/js";' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: Maps legacy ต้องโดนจับ" fail check-api-hosts.py "$d"

# 🔴 ไฟล์ที่อธิบายว่า "ห้ามเรียกโฮสต์นี้" ย่อมมีชื่อโฮสต์อยู่ในคอมเมนต์เสมอ (`D40`)
d="$(mkrepo)"; echo '// ห้ามเรียก https://api.odsay.com/v1 — E4-AC5' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: ชื่อโฮสต์ในคอมเมนต์ต้องไม่โดนจับ" pass check-api-hosts.py "$d"

# 🔴 โฮสต์จริงของ provider ที่ regex ชุดแรกพลาด (P4 วัด · P1 อนุมัติ · 27 ส.ค. 2026)
#    `naveropenapi.apigw.ntruss.com` ลงท้าย `.ntruss.com` ไม่ใช่ `.com` ของ naver
d="$(mkrepo)"; echo 'fetch("https://naveropenapi.apigw.ntruss.com/map-direction/v1");' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: Naver Cloud Maps (ntruss) ต้องโดนจับ" fail check-api-hosts.py "$d"

d="$(mkrepo)"; echo 'fetch("https://apis-navi.kakaomobility.com/v1/directions");' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: Kakao Mobility ต้องโดนจับ" fail check-api-hosts.py "$d"

# 🔴 Naver Maps JS SDK — **subdomain ข้าง ๆ deep-link แต่เป็น API host** (P4 ชี้ · 27 ส.ค. 2026)
#    `<script src="https://openapi.map.naver.com/...?ncpClientId=...">` = โค้ดเราฝัง + มี credential
#    กฎ `openapi\.naver\.com` ไม่แมตช์ เพราะมี `.map.` คั่น → เคยหลุดทั้งที่ดูเหมือนถูกครอบแล้ว
d="$(mkrepo)"; echo 'const s = "https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=x";' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: Naver Maps JS SDK (openapi.map.naver) ต้องโดนจับ" fail check-api-hosts.py "$d"

d="$(mkrepo)"; echo 'fetch("https://kapi.kakao.com/v2/user/me");' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: Kakao REST (kapi) ต้องโดนจับ" fail check-api-hosts.py "$d"

# 🔴 บริการ NCP ที่ไม่ผ่าน apigw — กฎเดิม (`apigw\.ntruss\.com`) ปล่อยทั้งกลุ่มนี้
#    ขยายเป็นทั้งโดเมนเพราะ `AC5` เขียนว่า "Naver API ใหม่แม้แต่ตัวเดียว" (P4 เสนอ · P6 เคาะ)
d="$(mkrepo)"; echo 'fetch("https://objectstorage.ntruss.com/bucket/x");' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: NCP ที่ไม่ผ่าน apigw ต้องโดนจับ" fail check-api-hosts.py "$d"

# 🔴 Kakao map tile/CDN — P1 ตัดสิน: **ฝัง SDK = เรียก API โดยให้ SDK เรียกแทน**
#    ถ้าห้าม dapi.kakao.com แต่ปล่อยให้ฝัง SDK ที่เรียกมันแทนเรา ด่านจะห้ามแค่ *วิธีเขียน*
d="$(mkrepo)"; echo 'const t = "https://t1.daumcdn.net/mapjsapi/v1/tile.png";' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: Kakao map tile (daumcdn) ต้องโดนจับ" fail check-api-hosts.py "$d"

# ✅ คุมด้าน lookbehind: คำที่ *ลงท้าย* ด้วยชื่อโดเมนแต่ไม่ใช่โดเมนนั้น ต้องไม่โดนจับ
d="$(mkrepo)"; echo 'const s = "https://notntruss.com/x";' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: notntruss.com ต้อง *ไม่* โดนจับ (lookbehind ทำงาน)" pass check-api-hosts.py "$d"

# 🔴 apex domain — `(?:^|\.)` ฉบับแรกพลาดเคสนี้ เพราะมี `/` นำหน้า ไม่ใช่ `.`
d="$(mkrepo)"; echo 'fetch("https://kakaomobility.com/v1/directions");' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: apex domain (ไม่มี subdomain) ต้องโดนจับ" fail check-api-hosts.py "$d"

# ✅ Google family ใหม่ที่เราใช้จริง ต้องไม่โดนจับ (P4 วัดว่าซอร์สเรามีแค่กลุ่มนี้ + deep-link)
d="$(mkrepo)"; printf 'const a = "https://places.googleapis.com/v1/places";\nconst b = "https://routes.googleapis.com/directions/v2";\n' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: places/routes.googleapis.com ต้อง *ไม่* โดนจับ" pass check-api-hosts.py "$d"

# ✅ **เคสด้านบวก — ปุ่มนำทางของ `E4-AC4` ต้องรอด** (P1 ขอ · P5 ยืนยันเส้นแบ่ง)
# 🎯 **ไม่ได้มีไว้ยืนยันว่าวันนี้ถูก · มีไว้กันคนที่ "รัดด่านให้แน่นขึ้น" ในอีก 3 เดือน**
#    แล้วฆ่า `lib/mapLinks.ts` โดยไม่รู้ตัว — **การรัดเพิ่มดูเหมือนความรอบคอบทุกครั้ง**
#    เส้นแบ่ง: `AC5` ห้าม *API host* (ยิงเอง ใช้คีย์ กินโควตา) **ไม่ได้ห้าม deep-link ที่ผู้ใช้กด**
d="$(mkrepo)"; cat > "$d/lib/x.ts" <<'TSEOF'
export function kakaoTo(name: string, lat: number, lng: number) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}
export function naverSearch(name: string) {
  return `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
}
TSEOF
git -C "$d" add -A >/dev/null 2>&1
pyc "api-hosts: deep-link map.kakao/map.naver ต้อง *ไม่* โดนจับ" pass check-api-hosts.py "$d"

d="$(mkrepo)"; pyc "naive-strip: ทรีสะอาดต้องผ่าน" pass check-naive-strip.py "$d"

d="$(mkrepo)"; printf 'x = re.sub(r"//.*$", "", line)\n' > "$d/lib/s.py"
git -C "$d" add -A >/dev/null 2>&1
pyc "naive-strip: รูป Python ต้องโดนจับ" fail check-naive-strip.py "$d"

d="$(mkrepo)"; printf 'const o = s.replace(/\\/\\/.*/g, "");\n' > "$d/lib/s.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "naive-strip: รูป TS ต้องโดนจับ" fail check-naive-strip.py "$d"

# 🎯 ควบคุมด้านบวกที่สำคัญที่สุดของด่านนี้ — ถ้ามันแดงใส่ของถูก มันจะถูกปิดใน 1 เดือน (`P-35`)
d="$(mkrepo)"; printf 'const u = "https://dapi.kakao.example/x";\nconst p = u.split("//")[1];\n' > "$d/lib/s.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "naive-strip: URL จริง + split(\"//\") ต้องไม่โดนจับ" pass check-naive-strip.py "$d"

d="$(mkrepo)"; printf '"""อย่าเขียน re.sub(r"//.*$", ...) นะ"""\nreal = 1\n' > "$d/lib/s.py"
git -C "$d" add -A >/dev/null 2>&1
pyc "naive-strip: รูปที่ห้าม ซึ่งอยู่ใน docstring ต้องไม่โดนจับ" pass check-naive-strip.py "$d"

# 🔴 **ด่านต้องผ่านกฎของตัวเอง** (P6 · 27 ส.ค. 2026 · P1 รายงานว่าหัว branch แดง)
#    `check-naive-strip.py` สแกน `*.py` ด้วย → มันเจอ canary ของตัวเอง **แล้วแดงใส่ตัวเอง**
# 🎯 **และตอนผมตรวจก่อน commit มันเขียว** เพราะไฟล์ยัง untracked และขอบเขตมาจาก `git ls-files`
#    → **หน้าต่างที่ผมตรวจ กับหน้าต่างที่ด่านบังคับใช้จริง ไม่ใช่หน้าต่างเดียวกัน**
#    `git add` คือสิ่งที่ทำให้ด่านมองเห็นตัวเอง · ไม่มีอะไรเตือนระหว่างนั้นเลย
#    เคสนี้ปิดช่องนั้นด้วยการเอา *ตัวด่านจริง* ไปวางในรีโปจำลองแล้วให้มันตรวจตัวเอง
d="$(mkrepo)"; mkdir -p "$d/.github"
cp "$(cd "$(dirname "$0")" && pwd)"/check-*.py "$(cd "$(dirname "$0")" && pwd)"/_*.py "$d/.github/" 2>/dev/null
git -C "$d" add -A >/dev/null 2>&1
pyc "naive-strip: ตัวด่านทุกตัวต้องผ่านกฎของตัวเอง" pass check-naive-strip.py "$d"

# ── E6-AC11 eslint-disable (P6 · 30 ส.ค. 2026) ────────────────────────────────
d="$(mkrepo)"; pyc "eslint-disable: ทรีสะอาดต้องผ่าน" pass check-eslint-disable.py "$d"

d="$(mkrepo)"; printf '/* eslint-disable */\nconst x = 1;\n' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "eslint-disable: blanket disable ไม่ระบุชื่อกฎ ต้องโดนจับ" fail check-eslint-disable.py "$d"

d="$(mkrepo)"; printf 'import { buildDayBridge } from "@/lib/engine/dayBridge";\n// eslint-disable-next-line no-restricted-imports\nconst y = buildDayBridge();\n' > "$d/lib/x.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "eslint-disable: หลบ no-restricted-imports นอกไฟล์ยกเว้น ต้องโดนจับ" fail check-eslint-disable.py "$d"

# ✅ เคสควบคุมฝั่งบวก — ไฟล์ที่ eslint.config.mjs ยกเว้นไว้จริง (hooks/useTripDays.tsx) ต้องผ่าน
d="$(mkrepo)"; mkdir -p "$d/hooks"
printf 'import { buildDayBridge } from "@/lib/engine/dayBridge";\n// eslint-disable-next-line no-restricted-imports\nexport function useTripDays() { return buildDayBridge(); }\n' > "$d/hooks/useTripDays.tsx"
git -C "$d" add -A >/dev/null 2>&1
pyc "eslint-disable: disable ใน hooks/useTripDays.tsx (ไฟล์ยกเว้น) ต้องไม่โดนจับ" pass check-eslint-disable.py "$d"

# ✅ เคสควบคุมฝั่งบวก — ไฟล์ทดสอบ lib/__tests__/** อีกไฟล์ที่ถูกยกเว้นไว้
d="$(mkrepo)"; mkdir -p "$d/lib/__tests__"
printf 'import { buildDayBridge } from "../engine/dayBridge";\n// eslint-disable-next-line no-restricted-imports\ntest("x", () => buildDayBridge());\n' > "$d/lib/__tests__/dayBridge.test.ts"
git -C "$d" add -A >/dev/null 2>&1
pyc "eslint-disable: disable ใน lib/__tests__/** (ไฟล์ยกเว้น) ต้องไม่โดนจับ" pass check-eslint-disable.py "$d"

# ✅ เคสควบคุมฝั่งบวก — disable กฎอื่นที่ไม่ใช่ no-restricted-imports ต้องไม่โดนจับ (ของจริงมี 27 จุดแบบนี้)
d="$(mkrepo)"; printf '// eslint-disable-next-line @next/next/no-img-element\nconst img = <img src="x" />;\n' > "$d/lib/x.tsx"
git -C "$d" add -A >/dev/null 2>&1
pyc "eslint-disable: disable กฎอื่นที่ไม่ใช่ no-restricted-imports ต้องไม่โดนจับ" pass check-eslint-disable.py "$d"

# ── E5 trip-links (P6 · 27 ส.ค. 2026) ─────────────────────────────────────────
mktrip() {  # ทรีที่มี route ของทริปจริง
  d="$(mkrepo)"; mkdir -p "$d/app/trip/[tripId]/summary" "$d/app/trip/[tripId]/today" "$d/app/summary"
  for f in "app/trip/[tripId]/page.tsx" "app/trip/[tripId]/summary/page.tsx" "app/trip/[tripId]/today/page.tsx"; do
    echo 'export default function P(){return null}' > "$d/$f"
  done
  echo "$d"
}

# 🔴 รูปที่ทำให้บั๊กจริงรอด: สตริงอยู่คนละบรรทัดกับ href= และเป็น ternary สองทาง
#    ฉบับแรกของด่านอ่าน literal ตัวแรกตัวเดียว → เห็นบั๊กจริงแค่ 1 ใน 2 บรรทัด
d="$(mktrip)"; cat > "$d/app/summary/page.tsx" <<'TSEOF'
export default function S() {
  return (
    <Link
      href={
        view
          ? `/summary?lang=${lang}`
          : `/summary?lang=en&for=immigration`
      }
    >go</Link>
  );
}
TSEOF
git -C "$d" add -A >/dev/null 2>&1
pyc "trip-links: ลิงก์ bare หลายบรรทัด (รูปบั๊กจริง) ต้องโดนจับ" fail check-trip-links.py "$d"

d="$(mktrip)"; cat > "$d/app/summary/page.tsx" <<'TSEOF'
export default function S() {
  return <Link href={`/trip/${tripId}/summary?lang=${lang}`}>go</Link>;
}
TSEOF
git -C "$d" add -A >/dev/null 2>&1
pyc "trip-links: ลิงก์ที่มี tripId ต้องผ่าน" pass check-trip-links.py "$d"

# ✅ ข้อยกเว้นที่ประกาศชื่อไว้ (manifest start_url) ต้องไม่โดนจับ
d="$(mktrip)"; echo 'export default function S(){return <Link href="/today">t</Link>}' > "$d/app/summary/page.tsx"
git -C "$d" add -A >/dev/null 2>&1
pyc "trip-links: /today ที่ประกาศยกเว้นไว้ ต้องไม่โดนจับ" pass check-trip-links.py "$d"

# 🔴 เซตว่าง = ตัวไล่พัง ไม่ใช่ "ไม่มีอะไรให้ตรวจ" — ต้องแดง ไม่ใช่เขียว
d="$(mkrepo)"; mkdir -p "$d/app"; echo 'export default function P(){return null}' > "$d/app/page.tsx"
git -C "$d" add -A >/dev/null 2>&1
pyc "trip-links: ไม่มี route ของทริปเลย ต้องแดง (กับดักเซตว่าง)" fail check-trip-links.py "$d"

# ── ควบคุม "สาย" ไม่ใช่ "ด่าน" ────────────────────────────────────────────────
# 🔴 **ฉบับแรกของเคสนี้ใช้ `mkrepo` อย่างเดียว และมันจับบั๊กที่มันถูกเขียนขึ้นมาเพื่อจับ *ไม่ได้***
#    ผมลองใส่บั๊ก `[ -d "$ROOT/.git" ]` กลับเข้าไป → **สองเคสนี้ยังเขียวทั้งคู่**
#    ขณะที่ทรีจริงรันด่านไป **0 ตัว** · เพราะ `mkrepo` สร้าง repo ธรรมดาที่ `.git` เป็นไดเรกทอรี
#    **แต่ทรีที่ทีมนี้ทำงานอยู่จริงเป็น `git worktree` ซึ่ง `.git` เป็นไฟล์**
# 🎯 บทเรียนซ้อนบทเรียน: **ควบคุมที่ไม่เคยแดง กับควบคุมที่พัง หน้าตาเหมือนกันเป๊ะ —
#    รวมถึงตอนที่เราเพิ่งเขียนมันเองเมื่อ 5 นาทีที่แล้ว** · ต้องพิสูจน์ว่ามันแดงได้ก่อนถึงจะนับ
mkworktree() {  # ทรีที่ `.git` เป็น *ไฟล์* — รูปเดียวกับ /Users/park/plan-korea-platform
  b="$(mktemp -d)"; mkdir -p "$b/up/lib" "$b/up/docs/engine/schema" "$b/up/supabase-platform"
  # git ไม่เก็บโฟลเดอร์ว่าง → ต้องมีไฟล์ ไม่งั้น worktree จะไม่มี supabase-platform/
  echo "placeholder" > "$b/up/supabase-platform/.keep"
  echo "-- ร่าง" > "$b/up/docs/engine/schema/ok.sql"
  i=0; while [ $i -lt 110 ]; do echo "export const v$i = 1;" > "$b/up/lib/f$i.ts"; i=$((i+1)); done
  git -C "$b/up" init -q . >/dev/null 2>&1
  git -C "$b/up" add -A >/dev/null 2>&1
  git -C "$b/up" -c user.email=t@t -c user.name=t commit -qm init >/dev/null 2>&1
  git -C "$b/up" worktree add -q "$b/wt" -b wtbranch >/dev/null 2>&1
  echo "$b"
}

wiring() {  # wiring <ชื่อทรี> <path>
  label="$1"; dir="$2"
  out="$("$G" "$dir" 2>&1)"
  for want in api-hosts naive-strip eslint-disable; do
    if printf '%s' "$out" | grep -q "$want"; then
      echo "✅ สาย ($label): guards.sh เรียก $want จริง"
    else
      echo "🔴 สาย ($label): guards.sh **ไม่ได้เรียก** $want — ด่านเงียบหายแต่ผลรวมยังเขียว"; rc=1
    fi
  done
}

d="$(mkrepo)"; wiring "repo ธรรมดา" "$d"; rm -rf "$d"
b="$(mkworktree)"
[ -f "$b/wt/.git" ] && echo "✅ fixture: .git ของ worktree เป็นไฟล์จริงตามที่ตั้งใจ" \
  || { echo "🔴 fixture: .git ของ worktree ไม่ใช่ไฟล์ — เคสข้างล่างไม่ได้ทดสอบสิ่งที่ตั้งใจ"; rc=1; }
wiring "git worktree" "$b/wt"
git -C "$b/up" worktree remove --force "$b/wt" >/dev/null 2>&1; rm -rf "$b"

# ── ด่าน "ภาพปกต้องมาเป็นคู่" (P5 เสนอ · P6 ทำเป็นด่าน 6 ก.ย. 2026) ──────────────
# 🔴 "ทรีสะอาดต้องผ่าน" ข้างบนใช้ `mk()` ซึ่งไม่มี public/catalog เลย — นั่นคือเคส
#    "ไม่มีโฟลเดอร์ catalog เลย" อยู่แล้วโดยไม่ต้องเขียนซ้ำ · ที่นี่เติมอีก 4 เคสที่เหลือ
d="$(mk)"; mkdir -p "$d/public/catalog/cn"
echo x > "$d/public/catalog/cn/beijing.jpg"; echo x > "$d/public/catalog/cn/beijing-sm.jpg"
check "ภาพปก: คู่ครบต้องผ่าน" pass "$d"

d="$(mk)"; mkdir -p "$d/public/catalog/cn"
echo x > "$d/public/catalog/cn/beijing.jpg"
check "ภาพปก: ไม่มีใบเล็กคู่ต้องแดง" fail "$d"

d="$(mk)"; mkdir -p "$d/public/catalog/cn"
echo x > "$d/public/catalog/cn/beijing-sm.jpg"
check "ภาพปก: ใบเล็กกำพร้าต้องแดง" fail "$d"

d="$(mk)"; mkdir -p "$d/public/catalog/cn"
check "ภาพปก: โฟลเดอร์ประเทศว่างต้องผ่าน" pass "$d"

exit $rc
