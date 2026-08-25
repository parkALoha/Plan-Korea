#!/usr/bin/env bash
# ตอบคำถามเดียว: **CI ที่แดงอยู่ เป็นเรื่องของโค้ดที่เราถืออยู่ หรือของเก่าที่ค้างบน remote**
#
# 🔴 ที่มา: 25 ส.ค. 2026 CI แดงค้าง ~2 ชม. ขณะที่ทุกเครื่องเขียว · ตัวแก้ค้างในเครื่องไม่ได้ push
#    ต้องเปิด log อ่านถึงจะรู้ว่าแดงเพราะอะไร · สคริปต์นี้ตอบโดยไม่ต้องเปิด log
#
# ใช้:  .github/ci-status.sh [branch]     (ค่าเริ่มต้น = branch ปัจจุบัน)
# ต้องมี: gh ที่ login แล้ว · ต้องต่อเน็ต
set -uo pipefail
REPO="parkALoha/Plan-Korea"
BR="${1:-$(git branch --show-current)}"

command -v gh >/dev/null 2>&1 || { echo "🔴 ไม่มี gh — ตอบไม่ได้"; exit 2; }

run="$(gh run list --repo "$REPO" --branch "$BR" --limit 1 \
        --json databaseId,headSha,conclusion,status,displayTitle 2>/dev/null)"
[ -z "$run" ] || [ "$run" = "[]" ] && { echo "🔴 ไม่พบ CI run ของ branch '$BR'"; exit 2; }

sha="$(printf '%s' "$run"  | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["headSha"])')"
concl="$(printf '%s' "$run"| python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["conclusion"] or json.load(sys.stdin)[0].get("status",""))' 2>/dev/null || echo "?")"
head="$(git rev-parse HEAD)"

echo "CI ล่าสุดของ '$BR': $concl"
echo "  CI ทดสอบ commit : ${sha:0:12}"
echo "  HEAD ในเครื่อง   : ${head:0:12}"

if [ "$sha" = "$head" ]; then
  echo "🎯 ตรงกัน — ผลนี้เป็นเรื่องของโค้ดที่คุณถืออยู่จริง"
  [ "$concl" = "failure" ] && echo "   🔴 แดงนี้คือของจริง ไม่ใช่เรื่อง remote ตามไม่ทัน"
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
