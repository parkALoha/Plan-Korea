#!/bin/bash
# จองคิวดาวน์โหลด แล้วรับไฟล์ของตัวเองกลับมาให้แน่ใจ — สำหรับตอนหลายเซสชันเจนภาพพร้อมกัน
#
#   ./scripts/dl-claim.sh begin <ชื่อคุณ>     → จองคิว (รอถ้ามีคนถืออยู่) แล้วจดสภาพ Downloads
#   …กดปุ่มดาวน์โหลดใน Gemini…
#   ./scripts/dl-claim.sh take  <ชื่อคุณ>     → รอไฟล์ใหม่ที่ *นิ่งแล้ว* คืนพาธ แล้วปล่อยคิว
#
# ## 🔴 ทำไมต้องมี — `diff ก่อน/หลัง` ให้คำตอบเดียวที่ผิดได้ (P3 วัด 5 ก.ย. 2026)
# ```
# ใบ 1  กดโหลด → ไฟล์ใหม่ 2 ใบพร้อมกัน → ใบแรกเป็นของคนอื่น (โกเบ)
# ใบ 2  กดโหลด → ไฟล์ใหม่ **1 ใบ** → เป็นของคนอื่น (จางเจียเจี้ย) · ของเขามาทีหลัง **68 วินาที**
# ```
# 🎯 ***ใบ 2 อันตรายกว่า — มีไฟล์เดียว ทุกสัญญาณบอกว่า "นี่แหละของคุณ"***
#    ⇒ `diff` ไม่ได้แค่ "ลดโอกาส" · มันผลิต **คำตอบที่ผิดและดูน่าเชื่อ**
# ⇒ ตัวนี้ตัดการแข่งทิ้งด้วยการ **ให้โหลดได้ทีละคน** ไม่ใช่เดาว่าไฟล์ไหนของใคร
#
# 🔴 **ไม่ได้แทนการเปิดดูภาพ** — ล็อกกันไฟล์ชนกัน · **มันไม่รู้ว่า AI เจนตรงเมืองไหม**
#    การเปิดดูยังเป็นด่านเดียวที่จับ *เนื้อหา* ได้
set -u
LOCK=/tmp/luitrip-dl.lock
SNAP=/tmp/luitrip-dl-snap
DL=~/Downloads
CMD="${1:-}"; WHO="${2:-unknown}"

snapshot() { ls "$DL"/Gemini_Generated_Image_*.jpeg 2>/dev/null | sort; }

case "$CMD" in
  begin)
    # `mkdir` เป็น atomic — ใช้เป็นล็อกได้โดยไม่ต้องมีอะไรเพิ่ม
    for i in $(seq 1 240); do
      if mkdir "$LOCK" 2>/dev/null; then
        echo "$WHO $(date +%s)" > "$LOCK/owner"
        snapshot > "$SNAP-$WHO.txt"
        echo "✅ ได้คิวแล้ว ($WHO) — กดปุ่มดาวน์โหลดได้เลย แล้วเรียก: $0 take $WHO"
        exit 0
      fi
      # 🔴 ล็อกค้างเกิน 3 นาที = เจ้าของตายกลางทาง · ยึดคืน ไม่งั้นทุกคนค้างตลอดกาล
      if [ -f "$LOCK/owner" ]; then
        AGE=$(( $(date +%s) - $(awk '{print $2}' "$LOCK/owner" 2>/dev/null || echo 0) ))
        if [ "$AGE" -gt 180 ]; then
          echo "⚠️  ล็อกค้างของ $(awk '{print $1}' "$LOCK/owner") นาน ${AGE}s — ยึดคืน"
          rm -rf "$LOCK"; continue
        fi
      fi
      [ "$i" = 1 ] && echo "⏳ มีคนถือคิวอยู่ ($(awk '{print $1}' "$LOCK/owner" 2>/dev/null)) — รอ…"
      sleep 1
    done
    echo "🔴 รอเกิน 4 นาที ยังไม่ได้คิว — บอก P5"; exit 1 ;;

  take)
    [ -f "$SNAP-$WHO.txt" ] || { echo "🔴 ยังไม่ได้ begin"; exit 2; }
    for i in $(seq 1 90); do
      NEW=$(comm -13 "$SNAP-$WHO.txt" <(snapshot))
      N=$(printf '%s' "$NEW" | grep -c . || true)
      if [ "$N" -ge 1 ]; then
        F=$(printf '%s' "$NEW" | head -1)
        # รอให้ไฟล์นิ่ง — ขนาดไม่เปลี่ยน 2 วินาที ⇒ โหลดจบแล้ว
        S1=$(stat -f%z "$F" 2>/dev/null || echo 0); sleep 2
        S2=$(stat -f%z "$F" 2>/dev/null || echo 0)
        if [ "$S1" = "$S2" ] && [ "$S1" != "0" ]; then
          [ "$N" -gt 1 ] && echo "⚠️  เจอไฟล์ใหม่ $N ใบ — คิวควรกันได้ แจ้ง P5 ถ้าเจอบ่อย"
          echo "$F"
          rm -rf "$LOCK"; rm -f "$SNAP-$WHO.txt"
          exit 0
        fi
      fi
      sleep 1
    done
    echo "🔴 รอ 90 วิ ไม่เห็นไฟล์ใหม่ — ปล่อยคิวแล้ว ลองกดโหลดใหม่"
    rm -rf "$LOCK"; rm -f "$SNAP-$WHO.txt"; exit 1 ;;

  *) echo "ใช้: $0 begin|take <ชื่อคุณ>"; exit 2 ;;
esac
