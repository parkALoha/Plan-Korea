#!/bin/bash
# บันทึกภาพปกเมือง/ประเทศ — ย่อ + ตั้งชื่อ + เก็บเข้าโฟลเดอร์ประเทศ
#   ใช้:  ./scripts/save-cover.sh <ไฟล์ต้นทาง> <country_id> <ชื่อเมืองหรือประเทศ>
#   เช่น: ./scripts/save-cover.sh ~/Downloads/Gemini_xxx.jpeg kr gyeongju
#
# 🔴 ย่อเหลือกว้าง 1200px เสมอ — ต้นฉบับจาก Gemini คือ ~3584px / ~4.4MB
#    87 ใบที่ขนาดนั้น = ~350MB ในรีโป · ย่อแล้วเหลือ ~200KB ⇒ ~17MB ทั้งชุด
#    (การ์ดแสดงจริงแค่ ~280px กว้าง · 1200 เผื่อจอ retina และการใช้ซ้ำที่อื่น)
# ⚠️ sips บนเครื่องนี้ **แปลง webp ไม่ได้** (exit 13) จึงเก็บเป็น .jpg
set -e
SRC="$1"; COUNTRY="$2"; NAME="$3"
[ -f "$SRC" ] || { echo "🔴 ไม่มีไฟล์: $SRC"; exit 1; }
DIR="$(cd "$(dirname "$0")/.." && pwd)/public/catalog/$COUNTRY"
mkdir -p "$DIR"
OUT="$DIR/$NAME.jpg"
sips -Z 1200 "$SRC" --out "$OUT" >/dev/null
W=$(sips -g pixelWidth "$OUT" | awk '/pixelWidth/{print $2}')
H=$(sips -g pixelHeight "$OUT" | awk '/pixelHeight/{print $2}')
SZ=$(stat -f%z "$OUT")
echo "✅ $COUNTRY/$NAME.jpg  ${W}x${H}  $((SZ/1024))KB"
[ "$W" -gt "$H" ] || echo "⚠️  ภาพนี้ไม่ใช่แนวนอน (${W}x${H}) — การ์ดจะครอปกลางจนเหลือแถบแคบ"
