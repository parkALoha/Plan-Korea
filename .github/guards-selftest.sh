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

# ⑯ link ที่ราก แม้ยังไม่มีไฟล์ project-ref (เพิ่งสร้าง .temp) ก็ต้องโดนจับ
d="$(mk)"; mkdir -p "$d/supabase/.temp"
check "จับโฟลเดอร์ .temp ที่รากแม้ยังไม่มี project-ref" fail "$d"

# ⑰ workdir แปลกปลอมอื่นก็ต้องโดนจับ ไม่ใช่ hardcode เฉพาะราก
d="$(mk)"; mkdir -p "$d/somewhere/supabase/.temp"
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

# ㉑ ชื่อไฟล์อื่นในตระกูล .env ก็ต้องโดนจับ ไม่ใช่ hardcode เฉพาะ .env.local
d="$(mk)"; printf 'URL=https://%s.supabase.co\n' "$TRIP_REF" > "$d/.env.development.local"
check ".env จับไฟล์อื่นในตระกูลเดียวกันด้วย" fail "$d"

# ── ด่าน ci-target (ยืนยัน secret ก่อน CI แตะ DB) ────────────────────────────────
# 🔴 ด่านนี้ไม่ได้อยู่ใน guards.sh เพราะมันตรวจ **env ของ CI** ไม่ใช่ไฟล์ในทรี
#    แต่ต้องมีเทสต์ด้านลบเหมือนกันตามกฎ E0 ข้อ 1
CIT="$(cd "$(dirname "$0")" && pwd)/check-ci-target.py"
mkjwt() { python3 -c "
import base64,json,sys
p=base64.urlsafe_b64encode(json.dumps({'ref':sys.argv[1]}).encode()).decode().rstrip('=')
print('eyJhbGciOiJIUzI1NiJ9.'+p+'.sig')" "$1"; }
DEVREF=pmvxwcimjebogjfimzqy

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

exit $rc
