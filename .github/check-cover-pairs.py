#!/usr/bin/env python3
"""ด่านภาพปกเมือง — คู่ต้องมีจริง *และ* ใบเล็กต้องเล็กจริง (P3 จับ 6 ก.ย. 2026)

🔴 ฉบับแรกอยู่ในบล็อก bash ของ guards.sh — ตรวจแค่ `[ -f "$sm" ]` (ไฟล์มีอยู่ไหม)
   P3 ยิงมัลแตนต์ *ที่ตรงกับด่านนี้จริง* (ไม่ใช่กับสคริปต์ของเขาเองแบบรอบแรก — ดู `dcacb7f`
   ก่อนหน้าสำหรับบทเรียนเรื่องเครดิตที่ส่งต่อผิด) แล้วพบว่า **สำเนาใบใหญ่ไปเป็นใบเล็ก
   (ชื่อถูก ขนาดยังเป็น 800px เดิม 830KB) ผ่านด่านฉลุย** — ตรงกับโหมดพังที่คอมเมนต์เดิม
   เขียนเองว่ากันไว้ (*"มือถือกลับไปโหลด 800px หนักเหมือนเดิมเงียบ ๆ"*) แต่โค้ดไม่ได้ตรวจจริง

🔴 ทำไมแยกเป็นไฟล์ python3 แทนที่จะเพิ่ม `sips` ในบล็อก bash เดิม:
   `sips` เป็นคำสั่งของ macOS เท่านั้น · CI รันบน `ubuntu-latest` (`ci.yml`) — ใส่ `sips`
   ตรง ๆ จะพังทุกรอบบน CI (ไม่มีคำสั่งนี้) ทั้งที่เขียวบนเครื่อง mac ทุกเครื่องของทีม
   → เขียน parser ของ JPEG header เองด้วย stdlib ล้วน (ไม่มี Pillow) ให้พกไปได้ทั้งสอง OS
   เหมือนด่านอื่นทุกตัวในไฟล์นี้ (check-dynamic-from.py · check-cache-lockdown.py ฯลฯ)

🔴 ทำไมไม่เช็คว่าใบใหญ่ = 800 / ใบเล็ก = 400 เป๊ะ:
   `save-cover.sh` **ย่อเท่านั้น ไม่ขยาย** (`sips -Z` ไม่ขยายภาพที่เล็กกว่าเป้าอยู่แล้ว)
   ⇒ สถานที่ที่ต้นฉบับเจนมาแคบกว่า 800px จะมีใบใหญ่ < 800px **โดยถูกต้อง**
   และถ้าใบใหญ่นั้นแคบกว่า 400px อยู่แล้ว ใบเล็กก็จะ**เท่ากับใบใหญ่พอดี** โดยถูกต้องเช่นกัน
   (ย่อ "ไม่เกิน 400" จากภาพที่กว้างแค่ 300 ก็ได้ 300 เท่าเดิม ไม่ใช่บั๊ก)
   ✅ กฎที่ใช้จึงเป็น "เพดาน" ไม่ใช่ "ค่าตายตัว": ใบใหญ่ ≤ 800 · ใบเล็ก ≤ 400 ·
   และถ้าใบใหญ่ *เกิน* 400 ใบเล็กต้อง **เล็กกว่าใบใหญ่จริง** (พิสูจน์ว่ามีการย่อเกิดขึ้นจริง
   ไม่ใช่แค่สำเนา) — เคสของ P3 (800/800) เข้าเงื่อนไขนี้พอดีเพราะ 800 > 400

ใช้:  .github/check-cover-pairs.py <ROOT>
คืน:  0 = ผ่าน · 1 = เจอของผิด
"""
import struct
import sys


BIG_MAX = 800
SMALL_MAX = 400


def jpeg_width(path):
    """คืนความกว้าง (px) ของไฟล์ JPEG หรือ None ถ้าอ่านไม่ได้/ไม่ใช่ JPEG ที่ parser นี้รู้จัก

    🔴 **อ่านไม่ได้ ≠ ไฟล์สะอาด** (รูปเดียวกับ check-dynamic-from.py) — คืน None แล้วผู้เรียก
    ต้องนับเป็นของผิด ไม่ใช่ข้ามเงียบ ๆ · parser นี้เดินเฉพาะ SOF marker ของ baseline/progressive
    JPEG ซึ่งครอบทุกไฟล์ที่ `sips`/Gemini ผลิต — ไม่รองรับ JPEG2000/arithmetic coding โดยตั้งใจ
    (ไม่มีไฟล์ไหนในคลังเป็นแบบนั้น และถ้ามี ก็ควรแดงเพื่อให้คนมาดู ไม่ใช่เดาว่าโอเค)
    """
    SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                   0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError:
        return None
    if len(data) < 4 or data[0:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 8 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in SOF_MARKERS:
            try:
                width = struct.unpack(">H", data[i + 7:i + 9])[0]
                return width
            except struct.error:
                return None
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        try:
            seglen = struct.unpack(">H", data[i + 2:i + 4])[0]
        except struct.error:
            return None
        i += 2 + seglen
    return None


def main(root: str) -> int:
    import glob
    import os

    bad = 0
    bigs = sorted(glob.glob(os.path.join(root, "public", "catalog", "*", "*.jpg")))
    for big in bigs:
        if big.endswith("-sm.jpg"):
            continue
        sm = big[:-4] + "-sm.jpg"
        rel_big = os.path.relpath(big, root)
        rel_sm = os.path.relpath(sm, root)
        if not os.path.isfile(sm):
            continue  # 🔴 ด่าน "ใบเล็กหาย" อยู่ในบล็อก bash ของ guards.sh แล้ว — ไม่ซ้ำที่นี่
        bw = jpeg_width(big)
        sw = jpeg_width(sm)
        if bw is None:
            print(f"🔴 ภาพปก: อ่านความกว้างของ {rel_big} ไม่ได้ (ไม่ใช่ JPEG ที่รู้จัก หรือไฟล์เสีย)")
            bad += 1
            continue
        if sw is None:
            print(f"🔴 ภาพปก: อ่านความกว้างของ {rel_sm} ไม่ได้ (ไม่ใช่ JPEG ที่รู้จัก หรือไฟล์เสีย)")
            bad += 1
            continue
        if bw > BIG_MAX:
            print(f"🔴 ภาพปก: {rel_big} กว้าง {bw}px เกินเพดาน {BIG_MAX}px")
            bad += 1
        if sw > SMALL_MAX:
            print(f"🔴 ภาพปก: {rel_sm} กว้าง {sw}px เกินเพดาน {SMALL_MAX}px")
            bad += 1
        if bw > SMALL_MAX and sw >= bw:
            print(f"🔴 ภาพปก: {rel_sm} ({sw}px) ไม่เล็กกว่า {rel_big} ({bw}px) จริง"
                  f" — ดูเหมือนสำเนา ไม่ใช่ใบที่ย่อแล้ว")
            print(f"   สร้างใหม่ด้วย: sips -Z {SMALL_MAX} \"{rel_big}\" --out \"{rel_sm}\"")
            bad += 1
    if bad:
        return 1
    print(f"✅ cover-pairs: ขนาดใบใหญ่/ใบเล็กของภาพปกทุกคู่อยู่ในเพดานที่ถูกต้อง")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
