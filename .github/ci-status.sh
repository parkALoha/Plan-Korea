#!/usr/bin/env bash
# ตอบคำถามเดียว: **CI ที่แดงอยู่ เป็นเรื่องของโค้ดที่เราถืออยู่ หรือของเก่าที่ค้างบน remote**
#
# 🔴 ที่มา: 25 ส.ค. 2026 CI แดงค้าง ~2 ชม. ขณะที่ทุกเครื่องเขียว · ตัวแก้ค้างในเครื่องไม่ได้ push
#    ต้องเปิด log อ่านถึงจะรู้ว่าแดงเพราะอะไร · สคริปต์นี้ตอบโดยไม่ต้องเปิด log
#
# ใช้:  .github/ci-status.sh [branch] [workflow-file]     (ค่าเริ่มต้น = branch ปัจจุบัน · ci.yml)
# ต้องมี: gh ที่ login แล้ว · ต้องต่อเน็ต
#
# 🔴 แก้ 3 ก.ย. 2026 (P6 · เจอตอนออกแบบ cron warm-cache) — เดิมดึง "run ล่าสุดของ branch"
#    โดยไม่กรอง workflow name เลย · ตอนมีแค่ `ci.yml` ไฟล์เดียวไม่มีปัญหา
#    แต่พอเพิ่ม workflow ที่สอง (cron รันถี่กว่า push มาก) สคริปต์นี้จะเริ่มรายงานผลของ
#    **cron ล่าสุด แทน CI ล่าสุด** อย่างเงียบๆ — ทั้งสองคืน `success`/`failure` หน้าตาเหมือนกันทุกประการ
#    ไม่มีอะไรฟ้องว่าอ่านผิดตัว จนกว่าจะมีคนสังเกตว่า commit ที่รายงานไม่ตรงกับที่เพิ่ง push
# 🎯 ตระกูลเดียวกับ `D72` (เข้าใจผิดว่า "มีคำตอบ" ทั้งที่คำตอบตอบคนละคำถาม) แค่คนละเครื่องมือ
set -uo pipefail
REPO="parkALoha/Plan-Korea"
BR="${1:-$(git branch --show-current)}"
WF="${2:-ci.yml}"

command -v gh >/dev/null 2>&1 || { echo "🔴 ไม่มี gh — ตอบไม่ได้"; exit 2; }

run="$(gh run list --repo "$REPO" --branch "$BR" --workflow "$WF" --limit 1 \
        --json databaseId,headSha,conclusion,status,displayTitle 2>/dev/null)"
[ -z "$run" ] || [ "$run" = "[]" ] && { echo "🔴 ไม่พบ CI run ของ branch '$BR' workflow '$WF'"; exit 2; }

# 🔴 อ่าน stdin ครั้งเดียวแล้วพิมพ์ทั้งสองค่า — ฉบับแรกเรียก json.load(sys.stdin) สองครั้ง
#    ในบรรทัดเดียว ครั้งที่สองได้สตรีมว่างแล้ว throw → ตกไปที่ `|| echo "?"`
#    อาการ: run ที่ยังวิ่งอยู่ (conclusion ว่าง) แสดงเป็น `?` แทนที่จะเป็น `in_progress`
read -r sha concl <<EOF
$(printf '%s' "$run" | python3 -c 'import json,sys
r = json.load(sys.stdin)[0]
print(r["headSha"], r.get("conclusion") or r.get("status") or "unknown")')
EOF
head="$(git rev-parse HEAD)"

echo "CI ล่าสุดของ '$BR' ($WF): $concl"
echo "  CI ทดสอบ commit : ${sha:0:12}"
echo "  HEAD ในเครื่อง   : ${head:0:12}"

# ── แยก "มีคำตัดสิน" ออกจาก "ไม่มีคำตัดสิน" ก่อนพูดถึงเขียว/แดง ────────────────
# 🔴 P4 ชี้ 26 ส.ค. 2026: หน้าเว็บ GitHub แสดง `cancelled` เป็นกากบาทเทา
#    คนที่เหลือบดูจะเหมาว่า "ไม่เขียว = แดง"
# 🔴 แต่พอไปดูสคริปต์ตัวเอง มันแย่กว่านั้น — **ฉบับก่อนหน้านี้:**
#      · `cancelled` + sha ตรงกัน → พิมพ์ "🎯 ตรงกัน ผลนี้เป็นเรื่องของโค้ดคุณ" แล้ว **exit 0**
#        ทั้งที่ *ไม่มีผล* ให้พูดถึงเลย
#      · `cancelled` + sha เก่ากว่า → ตกเข้า else แล้วพิมพ์ว่า **"เขียวนี้…"**
#    → มันตอบผิด **ทั้งสองทิศ** และตอบด้วยน้ำเสียงมั่นใจ
# 🎯 `cancelled` = **ไม่ได้ตรวจ** · ไม่ใช่แดง และไม่ใช่เขียว · ต้องรันใหม่ถึงจะรู้
case "$concl" in
  success|failure) ;;   # มีคำตัดสิน — พูดเรื่องเขียว/แดงได้
  cancelled)
    echo "⚠️ **$concl = ไม่ได้ตรวจ · ไม่ใช่แดง และไม่ใช่เขียว**"
    echo "   run ถูกแซงโดย push ที่ใหม่กว่า — ตั้งแต่ 26 ส.ค. 2026 `cancel-in-progress: false`"
    echo "   แปลว่ามันถูกยกเลิก **ตอนยังไม่เริ่มรัน** ไม่ใช่ตายกลางคัน"
    echo "   → commit นี้ยังไม่มีใครตอบว่าผ่านหรือไม่ · ต้องมี run ใหม่ถึงจะรู้"
    exit 1 ;;
  skipped|stale|timed_out|action_required|neutral)
    echo "⚠️ **$concl = ไม่มีคำตัดสิน** — อย่าอ่านเป็นเขียวหรือแดง · ต้องรันใหม่"
    exit 1 ;;
  queued|in_progress|waiting|requested|pending)
    echo "⏳ ยังวิ่งอยู่ — ยังไม่มีผลให้ตัดสิน"
    exit 1 ;;
esac

if [ "$sha" = "$head" ]; then
  echo "🎯 ตรงกัน — ผลนี้เป็นเรื่องของโค้ดที่คุณถืออยู่จริง"
  if [ "$concl" = "failure" ]; then
    # 🔴 แก้ 26 ส.ค. 2026: ฉบับก่อนหน้า `exit 0` ตรงนี้ด้วย
    #    เพราะ exit code หมายถึง "ผลนี้พูดถึงโค้ดคุณไหม" ไม่ใช่ "โค้ดคุณเขียวไหม"
    #    ⚠️ แต่ **ไม่มีใครอ่านมันแบบนั้น** — `cmd && …` จะเดินต่อทั้งที่ CI แดง
    #    ตระกูลเดียวกับ `cancelled` ที่เพิ่งแก้ไปข้างบน: **ตอบด้วยน้ำเสียงมั่นใจในเรื่องที่คนถามคนละคำถาม**
    echo "   🔴 แดงนี้คือของจริง ไม่ใช่เรื่อง remote ตามไม่ทัน"
    exit 1
  fi
  exit 0
fi

if git merge-base --is-ancestor "$sha" HEAD 2>/dev/null; then
  n="$(git rev-list --count "$sha..HEAD")"
  echo "🔴 CI ทดสอบโค้ดที่ **เก่ากว่าเครื่องคุณ $n commit**"
  if [ "$concl" = "failure" ]; then
    echo "   → แดงนี้ **อาจไม่ใช่เรื่องโค้ดปัจจุบันเลย** · push ให้ครบก่อนแล้วค่อยตัดสิน"
  else
    echo "   → เขียวนี้ **ไม่ได้พูดถึงโค้ด $n commit ล่าสุดของคุณ**"
  fi
  exit 1
fi

echo "⚠️ commit ที่ CI ทดสอบ ไม่ได้เป็นบรรพบุรุษของ HEAD (คนละสาย/ถูก rebase?) — เทียบตรง ๆ ไม่ได้"
exit 1
