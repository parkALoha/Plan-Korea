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

# ── 🔴 ด่านชุดนี้เป็นของ *ทรี platform* เท่านั้น — ปฏิเสธทรีอื่นแทนที่จะให้ผลที่อ่านผิดได้ ──
#    (P6 · 27 ส.ค. 2026 · หลัง P1 ชี้ว่า `.gitignore` ต่างกันตาม branch)
#
# ผมลองรัน `guards.sh /Users/park/plan-korea` (ทรีหลัก · branch `main`) เพื่อดูว่าจะใช้
# สคริปต์ตัวเดียวคุมสองทรีได้ไหม — **ได้ผลลัพธ์ที่ดูน่าเชื่อถือ และมีข้อที่ผิดปนอยู่**
#   🔴 `.env ในทรีนี้ชี้ไป DB ทริป` ← **บนทรีหลักนี่คือสิ่งที่ *ถูกต้อง*** มันคือเว็บทริป
#      ข้อความของด่านยังเขียนว่า *"ห้ามก๊อป .env.local จากทรีหลัก"* ซึ่ง**สมมติว่าคุณอยู่ทรี platform**
# 🎯 ด่านหลายตัวที่นี่ฝัง "ทรีนี้คือทรี platform" ไว้ในเกณฑ์ · พอเอาไปใช้กับทรีอื่น
#    **มันไม่ได้เงียบ มันตอบคำถามอื่นด้วยน้ำเสียงมั่นใจเท่าเดิม** — ซึ่งแย่กว่าไม่ตอบ
#
# ⚠️ **และนี่คือเหตุผลที่ไม่ก๊อปด่านชุดนี้ไปไว้ที่ `main` ด้วย** — จะกลายเป็น 2 ชุดที่ต้อง sync
#    แล้วช่องจะไปอยู่ตรงชุดที่หลวมกว่า โดยอ่านทีละชุดแล้วถูกทั้งคู่ (`D46`)
#    ถ้าวันหนึ่ง `main` ต้องมีด่าน **ต้องเลือกเฉพาะข้อที่เหมาะกับ `main` ไม่ใช่ยกชุดไป**
if [ ! -d "$ROOT/supabase-platform" ]; then
  echo "🔴 guards.sh: ทรีนี้ไม่ใช่ทรี platform (ไม่มี supabase-platform/)"
  echo "   ROOT ที่ให้มา: $ROOT"
  echo "   ด่านชุดนี้ฝังสมมติฐาน 'ทรีนี้คือทรี platform' ไว้หลายข้อ — เช่น ด่าน .env"
  echo "   ที่ถือว่า 'ชี้ไป DB ทริป = ผิด' ซึ่ง **บนทรีหลักคือสิ่งที่ถูกต้อง**"
  echo "   → รันจาก /Users/park/plan-korea-platform เท่านั้น · อย่าอ่านผลของทรีอื่นว่าเป็นคำตอบ"
  exit 2
fi


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
# ⚠️ ข้อจำกัด: **ด่านนี้แทบไม่มีทางแดงบน CI** — `actions/checkout` ให้เฉพาะไฟล์ที่ tracked
#    และวันนี้ไม่มี `.temp` ไฟล์ไหน tracked เลย → โฟลเดอร์ไม่มีอยู่บน runner
#
# 🔴 **แก้ 27 ส.ค. 2026 — ฉบับเดิมเขียนเหตุผลว่า "`.temp/` ถูก gitignore ไว้" ซึ่ง *ผิด***
#    ~~ถูก gitignore~~ · วัดแล้ว: `git check-ignore supabase/.temp` → **ไม่มี rule ไหนตรงเลย**
#    · ที่ถูก ignore คือ **`supabase-platform/supabase/.temp` เท่านั้น** เพราะ `supabase init`
#      สร้าง `.gitignore` ไว้ *ข้างใน* subtree นั้น · `.gitignore` ที่รากเขียนกำกับไว้เองว่า
#      *"ไม่ต้องเขียนที่นี่ — `supabase init` สร้างให้แล้ว"* ซึ่งครอบแค่ subtree เดียว
#    🎯 **ข้อสรุปยังจริงวันนี้ แต่จริงด้วยเหตุผลอื่น** — จริงเพราะ *ยังไม่มีใคร commit* `.temp` เข้ามา
#      **ไม่ใช่เพราะมีอะไรกันไว้** · และนั่นคือความต่างที่ทำให้ข้อถัดไปมีอยู่
#
# 🔴 **ช่องที่เปิดอยู่จริง: `.temp/pooler-url` มี connection string พร้อมรหัสผ่าน**
#    ถ้า `.temp` ที่หลงมาถูก commit → **credential เข้าประวัติ git ถาวร** · `.gitignore` ที่รากไม่กันเลย
#    → เคสข้างล่างจึงตรวจ **ว่ามันถูก track หรือยัง** ไม่ใช่แค่ว่ามันมีอยู่บนดิสก์
#    ⚠️ `.gitignore` ที่รากอยู่นอกโซน P6 — **รายงาน P1 แล้ว ไม่แก้เอง**
#
# 🔴 **และข้อจำกัดที่ใหญ่กว่า: ด่านนี้ *ตรวจสภาพ* ไม่ได้ *กันการกระทำ*** (P1 ชี้ 26 ส.ค. 2026)
#    มันเห็น link ผิดที่ **หลังจากมันถูกสร้างแล้ว** · คนที่พิมพ์ `supabase db push` ตรง ๆ
#    จะได้ผลลัพธ์**ก่อน**ที่ใครจะรัน `guards.sh` · **ไม่มีทางดักคำสั่ง CLI จากในรีโป**
#    (shell wrapper = ต่อเครื่อง อยู่นอก version control · ยึดพาธ `.temp` เป็นไฟล์ = เปราะและ error สับสน)
#    → **อย่าอ่านด่านนี้ว่า "กันได้"** · มันย่นเวลาที่สภาพผิดจะถูกพบ ไม่ได้ทำให้สภาพผิดเกิดไม่ได้
#
# 📌 วัดแล้ว 26 ส.ค. 2026:
#    · `.temp/linked-project.json` อย่างเดียว → `db push` **ยังล้ม** (`Cannot find project ref`)
#    · `.temp/project-ref` ต่างหากที่ทำให้ push เดินต่อได้จริง
#
# 🔴 **แก้ 27 ส.ค. 2026 — เดิมด่านนี้จับที่ *ตัวโฟลเดอร์* โดยเขียนกำกับว่า "ตั้งใจให้กว้างแบบนี้"
#    เพื่อเห็นสภาพตั้งต้นก่อนไฟล์อันตรายจะมี · ~~เหตุผลนั้นตั้งอยู่บนสมมติฐานที่ผิด~~** (P1 ชี้)
#    **`.temp/` ไม่ใช่ *สภาพตั้งต้นของการ link* — CLI สร้างมันจากการเช็คเวอร์ชัน
#    ซึ่งมันทำแทบทุกคำสั่ง รวมทั้ง `supabase --version`**
#    · ของจริงที่เจอ: `supabase/.temp/` มีไฟล์เดียวคือ `cli-latest` (8 ไบต์ · เลขเวอร์ชัน)
#      ขณะที่ทรีที่ link จริงมี 10 ไฟล์ รวม `project-ref` · `pooler-url` · `linked-project.json`
#    🎯 **ด่านจึงรายงาน "มีคนรันคำสั่ง supabase จากตรงนี้" ว่าเป็น "ตรงนี้ถูก link แล้ว"**
#      — สองเหตุ ข้อความเดียว และข้อความนั้นบรรยายเหตุที่ไม่ได้เกิด
#    · และ `db push` ที่ไม่มี `project-ref` **ล้มเอง** → เหตุที่ 2 ไม่มีอันตรายเลยแม้แต่ทางเดียว
#
# ⚠️ **ทำไมถึงต้องแก้ ไม่ใช่ปล่อย:** `D72` ข้อ 2 บอกว่าคน push ต้องเห็นหัว branch เขียวทั้งหัว
#    → **แดงตัวนี้บล็อก push ของทั้ง 8 คน** · และ **แดงที่ผิดบ่อย ๆ สอนให้คนเลิกอ่าน**
#    จบที่เดียวกับเขียวหลอก แค่ใช้เวลานานกว่า
#    🎯 ตัวที่แยกสองเหตุออกจากกันคือ **`project-ref` มีอยู่ไหม** ไม่ใช่ **`.temp/` มีอยู่ไหม**
ALLOWED_TEMP="$ROOT/supabase-platform/supabase/.temp"
linked=""      # 🔴 link จริง — อันตราย
touched=""     # ℹ️ แค่มีคนรันคำสั่ง supabase จากตรงนั้น — ไม่อันตราย
while IFS= read -r d; do
  [ -z "$d" ] && continue
  [ "$d" = "$ALLOWED_TEMP" ] && continue
  # `project-ref` คือไฟล์ที่ `db push` อ่านเพื่อรู้ปลายทาง · `pooler-url` มี connection string
  if [ -f "$d/project-ref" ] || [ -f "$d/pooler-url" ]; then
    linked="$linked  $d ($(cat "$d/project-ref" 2>/dev/null || echo 'มี pooler-url'))
"
  else
    touched="$touched  $d
"
  fi
done < <(find "$ROOT" -type d -path '*/supabase/.temp' -not -path '*/node_modules/*' 2>/dev/null | sort)
if [ -n "$linked" ]; then
  echo "🔴 link อยู่ผิดที่ — workdir เดียวที่ link ได้คือ supabase-platform/"
  printf '%s' "$linked"
  echo "   ที่นี่ถูก link = \`supabase db push\` จากตรงนั้นจะรัน migration ของทริปใส่ DB ที่ link ไว้"
  echo "   ลบโฟลเดอร์ .temp/ นั้นทิ้ง แล้วใส่ --workdir supabase-platform เสมอ"
  fail=1
else
  echo "✅ link: ไม่มี link นอก supabase-platform/"
fi
# ℹ️ **ไม่ทำให้แดง** — `.temp/` ที่ไม่มี `project-ref` เกิดจาก `supabase --version` ก็ได้
#    บอกไว้เฉย ๆ เพราะมันแปลว่ามีคนรันคำสั่ง supabase จาก workdir ที่ไม่ใช่ supabase-platform
#    ซึ่งเป็น *นิสัย* ที่พาไปสู่ของจริง แม้ตัวมันเองจะไม่มีอันตราย
if [ -n "$touched" ]; then
  echo "ℹ️ .temp: มีร่องรอยการรัน supabase นอก supabase-platform/ (ไม่ได้ link · ไม่ทำให้แดง)"
  printf '%s' "$touched"
  echo "   → เคยชินกับ --workdir supabase-platform ไว้ · ลบทิ้งได้ ไม่มีอะไรข้างใน"
fi

# 🔴 **`.temp` ที่ถูก git ติดตามแล้ว = credential กำลังจะเข้าประวัติถาวร**
#    `pooler-url` มี connection string พร้อมรหัสผ่าน · `project-ref` บอกปลายทาง
#    ต่างจากเคสข้างบนตรงที่ **นี่กันของที่กู้ไม่ได้** — ลบไฟล์ทีหลังไม่ลบมันออกจากประวัติ
tracked_temp="$(git -C "$ROOT" ls-files -- '*supabase/.temp/*' 2>/dev/null || true)"
if [ -n "$tracked_temp" ]; then
  echo "🔴 .temp ถูก git ติดตามอยู่ — ไฟล์พวกนี้อาจมี connection string/รหัสผ่าน"
  printf '%s\n' "$tracked_temp" | sed 's/^/     /'
  echo "   → \`git rm --cached\` ออกก่อน commit · ถ้า commit ไปแล้ว **มันอยู่ในประวัติถาวร** ให้บอก P1 ทันที"
  fail=1
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

# ── ตารางแคชต้องไม่มี policy / grant ให้ฝั่ง client (P-33) ────────────────────────
# 🔴 migration เขียนคอมเมนต์ไว้เองว่า "ไม่มี create policy ในไฟล์นี้เลย และนั่นคือของที่ต้องตรวจ"
#    **คอมเมนต์ไม่ใช่ด่าน** — ตรงนี้คือคนที่บังคับประโยคนั้น
# ⚠️ ครึ่งฝั่งไฟล์เท่านั้น · สิทธิ์ที่มาทาง default privileges / role สืบทอด / definer
#    **มองไม่เห็น** ต้องวัดที่ฐาน (ชุด rlsMatrix) — รายละเอียดในหัว check-cache-lockdown.py
LOCKDOWN="$(cd "$(dirname "$0")" && pwd)/check-cache-lockdown.py"
LOCKLIST="${CACHE_TABLES_FILE:-$(cd "$(dirname "$0")" && pwd)/no-policy-tables}"
if [ -d "$MIGDIR" ]; then
  lmigs=""
  for f in "$MIGDIR"/*.sql; do [ -e "$f" ] && lmigs="$lmigs $f"; done
  if [ -n "$lmigs" ]; then
    if [ ! -f "$LOCKDOWN" ] || [ ! -f "$LOCKLIST" ]; then
      echo "🔴 cache-lockdown: หาสคริปต์หรือไฟล์รายชื่อไม่เจอ — ตรวจไม่ได้ ถือว่าไม่ผ่าน"
      fail=1
    # shellcheck disable=SC2086
    elif ! python3 "$LOCKDOWN" "$LOCKLIST" $lmigs; then
      fail=1
    fi
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

# ── ชื่อตารางที่ส่งให้ `.from()` ต้องเป็นสตริงตรง (P4 ชี้ · D81) ──────────────────
# 🔴 ทิศของ P4: ด่านที่อ่าน "สตริงตรง" อย่างเดียว จะ **ปล่อยผ่าน** ของที่มันไม่รู้จัก
#    → ชื่อตารางที่เป็นตัวแปร ทำให้ด่าน*ทุกตัว*ที่อ่านชื่อตารางตาบอดกับจุดนั้นพร้อมกัน
#    ด่านนี้ทำให้ **ของที่ไม่รู้จัก = แดง** · ไฟล์ที่อนุญาต (helper) อยู่ใน dynamic-from-allowed
DYNFROM="$(cd "$(dirname "$0")" && pwd)/check-dynamic-from.py"
if [ -d "$ROOT/lib" ] && [ -f "$DYNFROM" ]; then
  srcs=""
  while IFS= read -r f; do
    [ -n "$f" ] && srcs="$srcs $f"
  done < <(find "$ROOT/lib" "$ROOT/app" "$ROOT/hooks" "$ROOT/components" "$ROOT/data" \
             \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/__tests__/*' \
             -not -path '*/node_modules/*' 2>/dev/null | sort)
  if [ -n "$srcs" ]; then
    # shellcheck disable=SC2086
    python3 "$DYNFROM" $srcs || fail=1
  fi
fi

# ── E4-AC5/AC6: โฮสต์ API ที่ห้ามเรียก (ย้ายมาจากฝั่งเทสต์ · 27 ส.ค. 2026) ────────
# 🔴 P1 วางไว้ที่ lib/__tests__/apiHostGuard.test.ts ก่อน · P6 ย้ายมาที่นี่เพราะ
#    **ด่านที่อยู่ในชุดทดสอบ สืบทอดความพร้อมใช้ของทั้งชุด** — วันที่ชุดเต็มแดงจากเรื่องอื่น
#    (customPlaceAdapter.test.ts · 27 ส.ค.) ด่านนี้ไม่ได้รัน และไม่มีใครรู้ว่ามันไม่ได้รัน
#    ที่นี่ไม่ต้องมี node_modules ไม่ต้องมีคีย์ และงาน guards แยกจากงาน verify ใน CI
# ⚠️ ทั้งสองด่านล่างประกาศขอบเขตด้วย `git ls-files` → ต้องเป็น git repo จริงและมี lib/
#    ทรีจำลองใน guards-selftest.sh ไม่ใช่ทั้งสองอย่าง · ฉบับแรกไม่ได้กั้น → **positive control
#    พังไป 22 เคสรวด** และ negative test ผ่านหมดเหมือนเดิม (ทุกอย่างแดง ก็ตรงกับที่คาดพอดี)
#    🎯 ซ้ำรอย migration-guard-exempt: **มีแต่เคสด้านบวกเท่านั้นที่มองเห็นความพังแบบนี้**
#
# 🔴 **และฉบับที่กั้นด้วย `[ -d "$ROOT/.git" ]` ก็ผิดอีกชั้น** (P6 · 27 ส.ค. 2026)
#    ในทรีที่สร้างด้วย `git worktree` **`.git` เป็น *ไฟล์* ไม่ใช่ไดเรกทอรี** (ชี้ไป gitdir จริง)
#    → เงื่อนไขเป็นเท็จ **ด่านทั้งสองตัวเงียบหายไปจากทรีจริง ขณะที่ guards.sh ยังเขียว**
#    · ไม่มีอะไรฟ้องเลย เพราะ "ด่านไม่ได้รัน" กับ "ด่านรันแล้วสะอาด" ต่างกันแค่บรรทัด ✅ ที่หายไป
#      **และไม่มีใครนับบรรทัด ✅** → ใช้ `git rev-parse --git-dir` ซึ่งจริงทั้งสองแบบ
APIHOSTS="$(cd "$(dirname "$0")" && pwd)/check-api-hosts.py"
if [ -d "$ROOT/lib" ] && git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 && [ -f "$APIHOSTS" ]; then
  python3 "$APIHOSTS" "$ROOT" || fail=1
fi

# ── ตัวตัดคอมเมนต์แบบไร้เดียงสา (P1 ขอให้ชั่งน้ำหนัก · P6 รับ แต่เปลี่ยนเป้า) ──────────
# 🎯 P1 เสนอให้จับ "การเขียน stripComments ซ้ำ" · ผมจับ **รูปที่พัง** แทน
#    การซ้ำที่ถูกทั้งคู่ไม่เคยกัดใคร · สิ่งที่กัดทั้ง 4 ครั้งคือ `//` + ไวลด์การ์ดถึงท้ายบรรทัด
#    ซึ่งกิน `//` ของ `https://` → ด่านลบสิ่งที่ตัวเองตามหา แล้วรายงานว่าสะอาด
#    วัดแล้ว: ผู้สมัครในเรพ = 1 ราย และเป็น *ข้อความอธิบายบั๊ก* → ตัดคอมเมนต์ก่อนจึงเหลือ 0
NAIVESTRIP="$(cd "$(dirname "$0")" && pwd)/check-naive-strip.py"
if [ -d "$ROOT/lib" ] && git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 && [ -f "$NAIVESTRIP" ]; then
  python3 "$NAIVESTRIP" "$ROOT" || fail=1
fi

# ── E5: ลิงก์ภายในที่ชี้หน้าของทริป ต้องมี tripId (P2 เจอบั๊ก · P1 ขอ · 27 ส.ค. 2026) ──
# 🔴 ปุ่ม "Immigration sheet" ชี้ไป `/summary?...` ไม่มี `/trip/${tripId}` → กดแล้วไม่ไปไหน
#    เป็นปุ่มที่ผู้ใช้ต้องกดหน้าเคาน์เตอร์ ตม. วันที่ 11 ต.ค. · รอดมาเพราะสตริงอยู่คนละบรรทัดกับ `href=`
#    → `grep 'href="/'` มองไม่เห็นตามนิยาม · ด่านนี้อ่านทั้งนิพจน์โดยไล่ปีกกาให้สมดุล
TRIPLINKS="$(cd "$(dirname "$0")" && pwd)/check-trip-links.py"
if [ -d "$ROOT/app" ] && [ -f "$TRIPLINKS" ]; then
  python3 "$TRIPLINKS" "$ROOT" || fail=1
fi

# ── config ของ API ที่เส้นแบ่งความปลอดภัยพึ่งอยู่ (P4 ขอ · 26 ส.ค. 2026) ─────────
# 🔴 P4 พิสูจน์ว่าไคลเอนต์ตั้ง `app.*` GUC ไม่ได้ 5 เส้นทาง · เส้นที่เกือบเป็นทางคือ
#    claim ใน JWT ซึ่ง PostgREST map เป็น `request.jwt.claim.<key>` **ไม่ใช่ `<key>` ตรง ๆ**
#    → trigger ที่อ่าน `app.*` จึงไม่เห็น · **แต่เส้นนี้เปราะต่อ config**:
#    ถ้ามีคนตั้ง `db_pre_request` ที่ copy claim → GUC **เส้นนั้นจะเปิดทันที**
#
# ⚠️ **ขอบเขต: นี่คือครึ่งฝั่งไฟล์เท่านั้น** — โปรเจกต์บนคลาวด์ตั้งค่านี้จากแดชบอร์ดได้
#    โดยไม่ผ่าน `config.toml` เลย · **ครึ่งที่เหลือต้องเป็นเคสสดถาวร** (ปลูก claim แล้วยืนยันว่า
#    มันไม่กลายเป็น GUC) ไม่ใช่การทดสอบครั้งเดียวแล้วจบ
APICFG="$ROOT/supabase-platform/supabase/config.toml"
if [ -f "$APICFG" ]; then
  cfgbad=""
  # ตัดคอมเมนต์ก่อน — บรรทัดที่ถูก comment ไว้ไม่ใช่การตั้งค่า
  cfg="$(sed -e 's/#.*//' "$APICFG")"
  if printf '%s' "$cfg" | grep -qiE 'db[-_]pre[-_]request'; then
    cfgbad="$cfgbad  db_pre_request ถูกตั้งไว้ — เส้นทาง claim→GUC จะเปิด
"
  fi
  # schema `app` ต้องไม่ถูก expose ทาง REST — ตารางสวิตช์ read-only อยู่ในนั้น
  if printf '%s' "$cfg" | grep -E '^\s*schemas\s*=' | grep -q '"app"'; then
    cfgbad="$cfgbad  schema \`app\` ถูก expose ทาง REST — ตารางภายในจะเรียกจากไคลเอนต์ได้
"
  fi
  if [ -n "$cfgbad" ]; then
    echo "🔴 api-config: การตั้งค่าที่เส้นแบ่งความปลอดภัยพึ่งอยู่ ถูกเปลี่ยน"
    printf '%s' "$cfgbad"
    echo "   ถ้าตั้งใจจริง ต้องคุยกับ P1/P4 ก่อน — มันเปลี่ยนสมมติฐานของ trigger ที่อ่าน app.*"
    fail=1
  else
    echo "✅ api-config: ไม่มี db_pre_request · schema app ไม่ถูก expose"
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

# ── ไฟล์ที่ด่านยัง "มองไม่เห็น" เพราะยังไม่ถูก stage (P6 · 27 ส.ค. 2026) ────────────
# 🔴 **เตือน ไม่ทำให้แดง** — และนี่คือการตัดสินใจ ไม่ใช่ความขี้เกียจ
#
# เหตุ: ด่านเกือบทุกตัวประกาศขอบเขตด้วย `git ls-files` ซึ่ง **ไม่คืนไฟล์ที่ยังไม่ถูก add**
# → `check-naive-strip.py` เขียวตอนผมตรวจ แล้วแดงทันทีที่ commit (P1 เจอบนหัว branch)
# 🎯 **หน้าต่างที่คุณตรวจ กับหน้าต่างที่ด่านบังคับใช้จริง ไม่ใช่หน้าต่างเดียวกัน**
#    `git add` ไม่ได้ดูเหมือนการเปลี่ยนพฤติกรรมของด่าน แต่มันคือ
#
# ⚖️ **ทำไมไม่เอา untracked เข้าขอบเขตไปเลย (P1 เสนอ · ผมชั่งแล้วไม่เอา):**
#   ① **ใน CI ไม่มี untracked เลย** — `actions/checkout` เช็คเอาต์จาก git ล้วน
#      → ช่องนี้**มีเฉพาะตอนรันในเครื่อง** · เอาเข้าขอบเขตจึงไม่เปลี่ยนคำตัดสินของ CI แม้แต่นิดเดียว
#   ② **ทรีนี้ 8 เซสชันใช้ร่วมกัน** — scratch file ของคนอื่นจะทำให้ *ด่านของคุณ* แดง
#      โดยที่ไฟล์นั้นไม่ใช่ของคุณ และอาจไม่มีวันถูก commit → `P-35` เต็ม ๆ
#   🎯 **คือเอาความแดงปลอมมาแลกกับการปิดช่องที่มีแค่ในเครื่อง — ราคาแพงกว่าของที่ได้**
# ✅ ทางที่เลือก: **ทำให้จุดบอดมองเห็นได้ ณ วินาทีที่มันสำคัญ** โดยไม่แตะคำตัดสิน
untr="$(git -C "$ROOT" ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.py' 2>/dev/null | head -20)"
if [ -n "$untr" ]; then
  n="$(printf '%s\n' "$untr" | grep -c .)"
  echo "⚠️ ขอบเขต: มีไฟล์ซอร์ส $n ไฟล์ที่ยังไม่ถูก stage — **ด่านมองไม่เห็นไฟล์พวกนี้**"
  printf '%s\n' "$untr" | sed 's/^/     /'
  echo "   → \`git add -- <path>\` ก่อน แล้วรัน guards.sh ซ้ำ ถึงจะเป็นคำตอบที่ตรงกับที่ CI จะเห็น"
  echo "   (ไม่ทำให้แดง · ดูเหตุผลที่ไม่เอา untracked เข้าขอบเขตในคอมเมนต์เหนือบล็อกนี้)"
fi

exit $fail
