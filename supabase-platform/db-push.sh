#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# ทางเดียวที่ควรใช้ push migration ของแพลตฟอร์ม — `P-30` (P4 · 24 ส.ค. 2026)
# ═══════════════════════════════════════════════════════════════════════════
#
# 🔴 ทำไมต้องมีสคริปต์นี้ ทั้งที่ทุก migration มีด่าน `do $guard$` อยู่แล้ว:
#   `db push` ใส่โปรเจกต์ที่ไม่เคยรัน migration ของเรา จะรัน **`0001` เป็นตัวแรก**
#   แล้วด่าน allowlist ของไฟล์ถัดๆ ไปจะผ่านเสมอ **เพราะ `0001` เพิ่งสร้างเงื่อนไขที่มันตรวจให้**
#   → ปัญหาไก่กับไข่ที่ **แก้ใน SQL ไม่ได้**: อะไรก็ตามที่ `0001` ตรวจได้ `0001` เองก็สร้างได้
#
#   🎯 **ตัวตรวจจึงต้องอยู่ที่ตัวยิงคำสั่ง ไม่ใช่ในสิ่งที่ถูกยิง**
#
# ⚠️ **สิ่งที่สคริปต์นี้ทำไม่ได้ และต้องพูดออกมา:** มันห้ามใครพิมพ์ `supabase db push` ตรงๆ ไม่ได้
#   ทางกันชั้นสุดท้ายคือด่านใน `0001` เอง (public ต้องยังไม่มีตาราง)
#   🔴 **สคริปต์นี้ไม่ใช่ด่านเดียว และห้ามอ่านว่าเรื่องนี้ถูกปิดแล้ว**
#
# ใช้:  ./supabase-platform/db-push.sh            (หรือ `npm run db:push`)
#       ./supabase-platform/db-push.sh --self-test
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

die() { echo "🔴 $*" >&2; exit 1; }

check_target() {
  # 🔴 พาธต้องคำนวณ **ในฟังก์ชัน** ไม่ใช่ตอนโหลดสคริปต์
  #   ฉบับแรกคำนวณไว้ข้างนอก → self-test ตั้ง env ทีหลังแล้วไม่มีผล
  #   **ทุกเคสจึงชี้ไปไฟล์จริงของรีโปซึ่งตรงกันพอดี และเขียวทั้งแผงโดยไม่ได้ทดสอบอะไรเลย**
  #   🎯 self-test จับข้อนี้ได้ตั้งแต่รันครั้งแรก — เคสด้านลบ 4 ใน 5 ขึ้นแดงทันที
  #     เป็นตัวอย่างของสิ่งที่ทีมนี้ไล่ปิดกันมาทั้งวัน: **เขียวที่แปลว่า "ไม่ได้ตรวจ" ไม่ใช่ "ตรวจแล้วผ่าน"**
  local ROOT ALLOWED_FILE LINK_FILE
  ROOT="${DB_PUSH_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  ALLOWED_FILE="${ALLOWED_REF_FILE:-$ROOT/.github/allowed-project-ref}"
  LINK_FILE="${LINK_REF_FILE:-$ROOT/supabase-platform/supabase/.temp/project-ref}"
  # 🔴 ไม่มีไฟล์ = **ล้ม** ไม่ใช่ผ่าน · ด่านที่ข้ามตัวเองเมื่อขาดข้อมูล ไม่ใช่ด่าน
  [ -f "$ALLOWED_FILE" ] || die "ไม่มี $ALLOWED_FILE — ไม่รู้ว่าปลายทางที่อนุญาตคือใบไหน จึง push ไม่ได้"

  local allowed link
  allowed="$(tr -d '[:space:]' < "$ALLOWED_FILE")"
  [ -n "$allowed" ] || die "$ALLOWED_FILE ว่างเปล่า — ไม่รู้ว่าปลายทางที่อนุญาตคือใบไหน"

  [ -f "$LINK_FILE" ] || die "ยังไม่ได้ link — ไม่มี $LINK_FILE
   รัน: supabase link --project-ref $allowed --workdir supabase-platform"

  link="$(tr -d '[:space:]' < "$LINK_FILE")"

  if [ "$link" != "$allowed" ]; then
    die "ปลายทางไม่ตรงกับที่อนุญาต — **ยกเลิกแล้ว ไม่มีอะไรถูกรัน**
   link อยู่กับ : $link
   อนุญาตเฉพาะ : $allowed
   ⚠️ ถ้าคุณกำลังจะ 'แก้ให้มันเดินได้' ด้วยการ re-link — หยุดก่อน
      โปรเจกต์อื่นที่ token มองเห็นเป็น production ของคนอื่นทั้งนั้น
      และ migration ตัวแรกจะสร้างตาราง + trigger บน auth.users ให้ฐานนั้นทันที"
  fi

  echo "✅ ปลายทาง: $link (ตรงกับ $ALLOWED_FILE)"
}

# 🔴 `P-36` (P4) — ฉบับแรก `exec … "$@"` ส่งอาร์กิวเมนต์ของผู้ใช้ต่อไปทั้งหมด
#   และ `supabase db push` รับ flag ที่ **เปลี่ยนปลายทางทิ้งทั้งหมด** หลังด่านผ่านไปแล้ว:
#     --project-ref <ref>   --db-url <conn>   --local
#   `npm run db:push -- --project-ref <ref ของ a-gleam>` จะ:
#     ① ผ่าน check_target (เพราะ .temp/project-ref ยังตรง) ② **พิมพ์ยืนยันปลายทางที่ผิดออกมา**
#     ③ ยิงลง a-gleam
#   🎯 **ด่านตรวจ "ใบที่ link ไว้" · คำสั่งไปตาม "flag ที่ส่งมา" — ไม่มีอะไรผูกสองอย่างนี้เข้าด้วยกัน**
#   และมันจะถูกใช้จริงในวินาทีที่ `--linked` พัง ซึ่งคือวินาทีเดียวกับที่ข้อความ die เตือนว่าอย่า re-link
#
# 🔴 **allowlist ไม่ใช่ denylist** — นี่คือ `D48` ในไฟล์ที่เขียนขึ้นมาเพื่อแก้ `D48`
#   Supabase เพิ่ม flag ใหม่ได้ทุกเวอร์ชัน · denylist กันได้แค่ที่คนเขียนนึกออก ณ วันที่เขียน
check_args() {
  local a
  for a in "$@"; do
    case "$a" in
      --dry-run|--include-all|--include-roles|--include-seed|--skip-vault|--linked|--debug) ;;
      *)
        die "ไม่รับอาร์กิวเมนต์ '$a' — สคริปต์นี้บังคับปลายทางจาก allowed-project-ref เท่านั้น
   flag อย่าง --project-ref / --db-url / --local เปลี่ยนปลายทาง**หลัง**ด่านตรวจผ่านไปแล้ว
   → ด่านจะตรวจใบหนึ่ง แล้วยิงอีกใบ พร้อมพิมพ์ยืนยันปลายทางที่ผิดออกมาให้ด้วย
   ⚠️ --password ก็ไม่รับ: รหัสบนบรรทัดคำสั่งจะไปค้างใน shell history
   ที่รับ: --dry-run --include-all --include-roles --include-seed --skip-vault --linked --debug" ;;
    esac
  done
}

self_test() {
  local tmp pass=0 fail=0
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/.github" "$tmp/supabase-platform/supabase/.temp"

  t() { # ชื่อเคส · ต้องผ่าน(0)/ต้องล้ม(1)
    local name="$1" want="$2"; shift 2
    if ( DB_PUSH_ROOT="$tmp" ALLOWED_REF_FILE="$tmp/.github/allowed-project-ref" \
         LINK_REF_FILE="$tmp/supabase-platform/supabase/.temp/project-ref" \
         check_target >/dev/null 2>&1 ); then local got=0; else local got=1; fi
    if [ "$got" = "$want" ]; then echo "  ✅ $name"; pass=$((pass+1))
    else echo "  ❌ $name (ต้องการ exit=$want ได้ $got)"; fail=$((fail+1)); fi
  }

  echo "self-test ของ db-push.sh:"
  t "ไม่มีไฟล์ allowlist เลย → ต้องล้ม" 1
  printf 'aaaaaaaaaaaaaaaaaaaa' > "$tmp/.github/allowed-project-ref"
  t "มี allowlist แต่ยังไม่ได้ link → ต้องล้ม" 1
  printf 'bbbbbbbbbbbbbbbbbbbb' > "$tmp/supabase-platform/supabase/.temp/project-ref"
  t "🔴 link ไปคนละใบกับ allowlist → ต้องล้ม" 1
  printf 'aaaaaaaaaaaaaaaaaaaa\n' > "$tmp/supabase-platform/supabase/.temp/project-ref"
  t "link ตรงกับ allowlist (มี \\n ต่อท้าย) → ต้องผ่าน" 0
  : > "$tmp/.github/allowed-project-ref"
  t "allowlist ว่างเปล่า → ต้องล้ม ไม่ใช่ผ่านเพราะ '' = ''" 1

  # ── เคสของ check_args (`P-35`) — เส้นทางที่ self-test ฉบับแรก **มองไม่เห็นทั้งหมด** ──
  # 🔴 ฉบับแรกทดสอบแค่ check_target · รูของ `"$@"` จึงอยู่นอกสายตาของมันโดยสิ้นเชิง
  ta() { local name="$1" want="$2"; shift 2
    if ( check_args "$@" >/dev/null 2>&1 ); then local got=0; else local got=1; fi
    if [ "$got" = "$want" ]; then echo "  ✅ $name"; pass=$((pass+1))
    else echo "  ❌ $name (ต้องการ exit=$want ได้ $got)"; fail=$((fail+1)); fi
  }
  ta "ไม่มีอาร์กิวเมนต์เลย → ต้องผ่าน" 0
  ta "--dry-run → ต้องผ่าน" 0 --dry-run
  ta "--include-all --debug → ต้องผ่าน" 0 --include-all --debug
  ta "🔴 --project-ref <ใบอื่น> → ต้องล้ม" 1 --project-ref aaaaaaaaaaaaaaaaaaaa
  ta "🔴 --db-url <conn> → ต้องล้ม" 1 --db-url "postgresql://x@y/z"
  ta "🔴 --local → ต้องล้ม" 1 --local
  ta "🔴 --password บนบรรทัดคำสั่ง → ต้องล้ม" 1 --password hunter2
  ta "🔴 flag ที่ถูกปน หลัง flag ที่รับได้ → ต้องล้ม" 1 --dry-run --project-ref aaaaaaaaaaaaaaaaaaaa

  echo "  → ผ่าน $pass · ล้ม $fail"
  [ "$fail" -eq 0 ]
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi

check_args "$@"      # 🔴 ต้องมาก่อน check_target — ไม่มีประโยชน์ที่จะยืนยันปลายทางที่ flag กำลังจะเปลี่ยน
check_target
echo "→ supabase db push --workdir supabase-platform ${*:-}"
exec supabase db push --workdir supabase-platform "$@"
