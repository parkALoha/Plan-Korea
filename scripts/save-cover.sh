#!/bin/bash
# บันทึกภาพปกเมือง/ประเทศ — ย่อ + ตั้งชื่อ + เก็บเข้าโฟลเดอร์ประเทศ
#   ใช้:  ./scripts/save-cover.sh <ไฟล์ต้นทาง> <country_id> <ชื่อเมืองหรือประเทศ>
#   เช่น: ./scripts/save-cover.sh ~/Downloads/Gemini_xxx.jpeg kr gyeongju
#
# 🔴 ย่อเหลือกว้าง 1200px เสมอ — ต้นฉบับจาก Gemini คือ ~3584px / ~4.4MB
#    87 ใบที่ขนาดนั้น = ~350MB ในรีโป · ย่อแล้วเหลือ ~200KB ⇒ ~17MB ทั้งชุด
# ⚠️ sips บนเครื่องนี้ **แปลง webp ไม่ได้** (exit 13) จึงเก็บเป็น .jpg
#
# 🔴 **ห้ามใช้ "ไฟล์ใหม่สุดใน Downloads" เป็นตัวเลือกอัตโนมัติ**
#    หลายเซสชันโหลดลงโฟลเดอร์เดียวกันพร้อมกัน ⇒ "ใหม่สุด" ของคุณอาจเป็นของคนอื่น
#    และภาพจะถูกเก็บใต้ชื่อเมืองที่ผิด **โดยไม่มีอะไรฟ้อง**
#    ⇒ ระบุพาธเต็มที่คุณเห็นกับตาเสมอ · แล้ว **เปิดดูภาพที่ได้** ก่อน commit
set -e
SRC="$1"; COUNTRY="$2"; NAME="$3"
[ -n "$SRC" ] && [ -n "$COUNTRY" ] && [ -n "$NAME" ] || { echo "ใช้: $0 <src> <country_id> <name>"; exit 2; }
[ -f "$SRC" ] || { echo "🔴 ไม่มีไฟล์: $SRC"; exit 1; }
DIR="$(cd "$(dirname "$0")/.." && pwd)/public/catalog/$COUNTRY"
mkdir -p "$DIR"
OUT="$DIR/$NAME.jpg"
[ -f "$OUT" ] && echo "⚠️  มีไฟล์อยู่แล้ว จะเขียนทับ: $COUNTRY/$NAME.jpg"
AGE=$(( $(date +%s) - $(stat -f%m "$SRC") ))
[ "$AGE" -lt 300 ] || echo "⚠️  ไฟล์ต้นทางเก่า ${AGE}s — แน่ใจว่าเป็นใบที่เพิ่งเจนใช่ไหม"
sips -Z 1200 "$SRC" --out "$OUT" >/dev/null
W=$(sips -g pixelWidth "$OUT" | awk '/pixelWidth/{print $2}')
H=$(sips -g pixelHeight "$OUT" | awk '/pixelHeight/{print $2}')
SZ=$(stat -f%z "$OUT")
echo "✅ $COUNTRY/$NAME.jpg  ${W}x${H}  $((SZ/1024))KB"
[ "$W" -gt "$H" ] || echo "⚠️  ไม่ใช่แนวนอน (${W}x${H}) — การ์ดจะครอปกลางจนเหลือแถบแคบ"
echo "🔴 ขั้นต่อไป: เปิดดูภาพนี้ด้วยตา (Read $OUT) ว่าเป็นเมืองนั้นจริง ก่อน commit"
