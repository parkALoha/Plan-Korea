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
# ใช้:  .github/diff-guard.sh [ROOT]            → คำนวณ diff เองจาก git (โหมดที่ CI ใช้)
#       .github/diff-guard.sh --stdin [ROOT]    → อ่านรายชื่อไฟล์จาก stdin (self-test / pre-commit hook)
#
# 🔴 ต้องเป็น flag ชัดเจน ห้ามเดาจาก `[ -t 0 ]` — เคยเขียนแบบนั้นแล้วเป็นบั๊กจริง:
#    GitHub Actions ให้ stdin ของ step เป็น /dev/null ซึ่งไม่ใช่ tty → ด่านจะเข้าโหมด stdin
#    อ่านรายชื่อได้ว่างเปล่า แล้ว "ผ่าน" ทุกครั้ง = ด่านกลายเป็น no-op โดยไม่มีสัญญาณอะไรเลย
#    (พบ 18 ส.ค. 2026 ตอนทดสอบด้วย `< /dev/null` ก่อนส่งมอบ hook)
set -uo pipefail
MODE=git
if [ "${1:-}" = "--stdin" ]; then MODE=stdin; shift; fi
ROOT="${1:-.}"
fail=0

if [ "$MODE" = git ]; then
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

# ── กฎ 2: ไฟล์ "โค้ด" ที่เปลี่ยน ห้ามอ้าง env ของ Supabase ──────────────────────
# ตรวจเฉพาะ "ไฟล์ที่เปลี่ยน" ไม่ใช่ทั้งทรี — ทั้งทรีจะล้มทันทีเพราะ lib/supabase.ts มีอยู่แล้ว
# เจตนาคือกัน "การเดินสาย env ใหม่" ไม่ใช่กันไฟล์เดิมที่ยังไม่ถูกแตะ
#
# 🔴 จำกัดที่นามสกุลของโค้ดเท่านั้น — พบตอนรันกับ diff จริง (18 ส.ค. 2026) ว่าถ้าไม่จำกัด
#    ด่านจะจับ `.md` ที่แค่ "พูดถึง" ชื่อตัวแปร (devops.md · backlog.md · security-review.md)
#    และจับ `ci.yml` ที่ตั้งค่าปลอมไว้ให้ `next build` — ทั้งหมดไม่ใช่การเดินสาย env
#    เทสต์ด้วยรายชื่อจำลองมองไม่เห็นข้อนี้ ต้องรันกับของจริงถึงจะโผล่
#
# ⚠️ ช่องที่ยอมเปิดไว้โดยรู้ตัว: workflow yaml ที่ใส่ค่า env จริงจะไม่โดนกฎนี้จับ
#    รับได้เพราะ (ก) yaml ไม่ได้ต่อแอปเข้า DB ด้วยตัวเอง (ข) gitleaks จับค่าจริงอยู่แล้ว
#    (ค) การแก้ workflow เห็นชัดในรีวิว · เขียนไว้ตรงนี้เพื่อไม่ให้มีใครเข้าใจว่าด่านครอบตรงนั้น
NEEDLE="$(printf 'NEXT_PUBLIC_%s' 'SUPABASE')"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
    *) continue ;;
  esac
  [ -f "$ROOT/$f" ] || continue        # ไฟล์ที่ถูกลบ ข้ามไป
  if grep -q "$NEEDLE" "$ROOT/$f" 2>/dev/null; then
    echo "🔴 ไฟล์โค้ดที่เปลี่ยนอ้าง env ของ Supabase: $f"
    fail=1
  fi
done <<< "$changed"

[ $fail -eq 0 ] && echo "✅ diff-guard: ไม่มี commit ที่แตะการต่อ Supabase/env"
exit $fail
