#!/usr/bin/env bash
# ด่านชั่วคราว — ห้าม commit ที่แตะการต่อ Supabase/env ลง branch `platform`
# จนกว่าเรื่องการตั้งค่า Vercel preview จะปิด (P1 ประกาศ 18 ส.ค. 2026)
#
# 🔴 ทำไมถึงผูกกับ diff ไม่ใช่ชื่อเฟส:
#    "ห้ามก่อน E1" เป็นเงื่อนไขที่ไม่มีใครรู้ว่าละเมิดตอนไหน เพราะไม่มีเส้นชัดว่าเฟสเริ่มเมื่อไหร่
#    และคนร่างโค้ดไว้ก่อนได้เสมอ · ผูกกับ diff แล้วเครื่องตอบได้เองทุกครั้ง
#
# 🔴 วิธีปลดล็อกเมื่อเรื่อง Vercel ปิดแล้ว: **ลบ step นี้ออกจาก ci.yml เป็น commit ที่รีวิวเห็น**
#    จงใจไม่ทำเป็นตัวแปรลับ/secret สลับเปิดปิด — ถ้าปลดล็อกได้เงียบๆ มันจะถูกปลดตอนที่ใครสักคนรีบ
#    แล้วไม่มีใครรู้ว่าถูกปลดเมื่อไหร่และด้วยเหตุผลอะไร
#
# ใช้:  .github/diff-guard.sh [ROOT]
#       รายชื่อไฟล์ที่เปลี่ยนอ่านจาก stdin ถ้ามี · ไม่งั้นคำนวณจาก git diff origin/main...HEAD
#       (รับจาก stdin ได้เพื่อให้ self-test ป้อนรายชื่อจำลองเข้าตรรกะชุดเดียวกับที่ CI ใช้จริง)
set -uo pipefail
ROOT="${1:-.}"
fail=0

if [ -t 0 ]; then
  changed="$(git -C "$ROOT" diff --name-only origin/main...HEAD 2>/dev/null)"
  if [ -z "$changed" ]; then
    echo "⚠️ หา diff เทียบ origin/main ไม่ได้ — ตรวจไม่ได้ ถือว่าไม่ผ่าน (ตรวจไม่ได้ ≠ ปลอดภัย)"
    exit 1
  fi
else
  changed="$(cat)"
fi

# ── กฎ 1: path ต้องห้าม ────────────────────────────────────────────────────────
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    lib/supabase.ts|supabase-platform/*|.env|.env.*|*/.env|*/.env.*)
      echo "🔴 diff แตะ path ต้องห้าม: $f"
      fail=1
      ;;
  esac
done <<< "$changed"

# ── กฎ 2: ไฟล์ที่เปลี่ยน ห้ามมีสตริงต่อ env ของ Supabase ────────────────────────
# ตรวจเฉพาะ "ไฟล์ที่เปลี่ยน" ไม่ใช่ทั้งทรี — ทั้งทรีจะล้มทันทีเพราะ lib/supabase.ts มีอยู่แล้ว
# เจตนาคือกัน "การเดินสาย env ใหม่" ไม่ใช่กันไฟล์เดิมที่ยังไม่ถูกแตะ
NEEDLE="$(printf 'NEXT_PUBLIC_%s' 'SUPABASE')"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ -f "$ROOT/$f" ] || continue        # ไฟล์ที่ถูกลบ ข้ามไป
  if grep -q "$NEEDLE" "$ROOT/$f" 2>/dev/null; then
    echo "🔴 ไฟล์ที่เปลี่ยนมีการต่อ env ของ Supabase: $f"
    fail=1
  fi
done <<< "$changed"

[ $fail -eq 0 ] && echo "✅ diff-guard: ไม่มี commit ที่แตะการต่อ Supabase/env"
exit $fail
