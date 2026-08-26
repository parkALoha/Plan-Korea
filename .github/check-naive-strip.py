#!/usr/bin/env python3
"""จับ **ตัวตัดคอมเมนต์แบบไร้เดียงสา** — `//` ที่ตามด้วยไวลด์การ์ดถึงท้ายบรรทัด

## 🎯 ด่านนี้ไม่ได้จับ "การเขียนซ้ำ" · มันจับ "รูปที่พัง" (P6 ตัดสิน · 27 ส.ค. 2026)
P1 เสนอให้จับ *"ฟังก์ชันชื่อ/รูปคล้าย `stripComments` ที่เกิดนอกของกลาง"* — **ผมไม่เลือกทางนั้น**

🔴 **เพราะการซ้ำไม่ใช่ตัวที่กัด** · ตัวตัดคอมเมนต์ 2 ชุดที่ *ถูกทั้งคู่* ไม่เคยทำให้ใครเจ็บ
   สิ่งที่กัดทั้ง 4 ครั้งคือ **รูปเดียว**: ตัดที่ `//` ตัวแรกจนจบบรรทัด
   → `"https://dapi.kakao.com/…"` เหลือ `"https:` → **ด่านลบสิ่งที่ตัวเองตามหา แล้วรายงานว่าสะอาด**
   · ของกลางทั้งสองฝั่ง (`_helpers.ts` · `_tsscan.py`) เป็น **ตัวเดินทีละอักษร ไม่ใช่ regex**
     → **ด่านนี้จึงไม่แดงใส่ของที่เขียนถูก** ไม่ว่าจะเขียนซ้ำกี่ตัว
🎯 **ด่านที่แดงใส่โค้ดที่ถูกต้อง จะถูกปิดภายในเดือนเดียว** (`P-35`) — ด่านนี้เลี่ยงข้อนั้นโดยการ
   เล็งไปที่ข้อบกพร่อง ไม่ใช่ที่รสนิยม

## 📏 วัดก่อนสร้าง ไม่ใช่เดา
`git ls-files '*.ts' '*.tsx' '*.py'` ทั้งเรพ → **ผู้สมัคร 1 ราย** และรายนั้นเป็น *ข้อความอธิบายบั๊ก
ใน docstring* ไม่ใช่โค้ด → จึงตัดคอมเมนต์/docstring ทิ้งก่อนเสมอ (`D40`: ด่านที่แดงใส่ไฟล์ที่
อธิบายเหตุผลของตัวเอง สร้างแรงกดดันให้ *ลบคำอธิบายทิ้งเพื่อให้เขียว*)
· ย้อนดูของจริง: รูปนี้จะจับได้ **3 ใน 4 ครั้ง**ที่ทีมนี้เคยพลาด · ครั้งที่เหลือคือของกลางตัวแรกที่
  เขียนถูกตั้งแต่ต้น **ไม่ควรถูกจับอยู่แล้ว**

## ⚙️ กฎเดียว
หลังตัดคอมเมนต์ออก `//` ที่เหลือย่อมอยู่ใน *สตริงหรือ regex literal* เสมอ —
ถ้ามันตามด้วย `.*` หรือ `[^…]*` ทันที นั่นคือ "กินถึงท้ายบรรทัด" = รูปที่พัง
"""

import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _tsscan import strip_comments, strip_py_comments, tracked  # noqa: E402

# `//` หรือ `\/\/` ที่ตามด้วยไวลด์การ์ดถึงท้ายบรรทัดทันที
NAIVE = re.compile(r"(?:\\/\\/|//)(?:\.\s*\*|\[\^[^\]]{0,10}\]\s*\*)")

ALLOW_FILE = "naive-strip-allowed"


def allowed(root: str) -> set:
    import os
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), ALLOW_FILE)
    try:
        raw = open(f, encoding="utf-8").read()
    except OSError:
        return set()
    return {l.strip() for l in raw.splitlines() if l.strip() and not l.startswith("#")}


def main(argv) -> int:
    root = argv[0] if argv else "."

    # 🔴 self-test ก่อนเสมอ — ด่านที่ตาบอดกับด่านที่เห็นว่าสะอาด พิมพ์ข้อความเดียวกัน
    canaries = [
        'src = re.sub(r"//.*$", "", line)',
        'const out = s.replace(/\\/\\/.*/g, "");',
        'code = line.replace(/\\/\\/[^\\n]*/, "")',
    ]
    for c in canaries:
        if not NAIVE.search(c):
            print(f"🔴 naive-strip: self-test ล้ม · จับรูปนี้ไม่ได้แล้ว → {c}")
            return 1
    # และต้อง **ไม่** แดงใส่ของกลางที่เขียนถูก
    for ok in ['if c == "/" and nxt == "/":', 'const u = "https://a.com/x";', 'url.split("//")[1]']:
        if NAIVE.search(ok):
            print(f"🔴 naive-strip: self-test ล้ม · แดงใส่โค้ดที่ถูกต้อง → {ok}")
            return 1

    allow = allowed(root)
    files = tracked(root, "*.ts", "*.tsx", "*.py")
    if not files:
        print("🔴 naive-strip: ไม่มีไฟล์ให้ตรวจเลย — ขอบเขตเพี้ยน หยุดไว้ก่อน")
        return 1

    hits = []
    for f in files:
        if f in allow:
            continue
        try:
            src = open(f"{root}/{f}", encoding="utf-8").read()
        except OSError as e:
            print(f"🔴 naive-strip: อ่าน {f} ไม่ได้ — {e.__class__.__name__}")
            return 1
        code = strip_py_comments(src) if f.endswith(".py") else strip_comments(src)
        for i, line in enumerate(code.split("\n"), 1):
            if NAIVE.search(line):
                hits.append(f"{f}:{i} — {line.strip()[:70]}")

    if hits:
        print("🔴 naive-strip: เจอตัวตัดคอมเมนต์ที่กิน `//` ของ `https://` ไปด้วย")
        for h in hits:
            print(f"   {h}")
        print("   → ใช้ของกลางแทน: `_tsscan.strip_comments` (Python) · `stripTsComments` (TS)")
        print("   🎯 รูปนี้ทำให้ด่าน *ลบสิ่งที่ตัวเองตามหา* แล้วรายงานว่าสะอาด — แย่กว่าจับผิด")
        print(f"   ถ้าเคสนี้ถูกต้องจริง ใส่พาธลง .github/{ALLOW_FILE} พร้อมเหตุผล")
        return 1

    print(f"✅ naive-strip: ตรวจ {len(files)} ไฟล์ · ไม่มีตัวตัดคอมเมนต์แบบกินทั้งบรรทัด"
          + (f" (ยกเว้น {len(allow)})" if allow else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
