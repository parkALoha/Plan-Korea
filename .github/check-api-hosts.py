#!/usr/bin/env python3
"""`E4-AC5` / `E4-AC6` — โฮสต์ API ที่ห้ามเรียก

· `AC5`: ห้ามเรียก ODsay / Kakao / Naver API (ทะเบียนมี*ช่องเสียบ* แต่**ห้ามเสียบ**)
· `AC6`: ห้ามเรียก Google Maps legacy (`maps.googleapis.com/maps/api/*`)

🔴 **เกณฑ์ที่วัดด้วย "ไม่เจออะไรเลย" ผ่านได้ฟรีตลอดกาล** — วันที่มีคนเผลอเสียบ
มันจะยังติ๊กอยู่ในเอกสาร เพราะไม่มีใครกลับไปรัน `grep` เดิมอีก (P1 · `E4`)

## 🎯 ทำไมย้ายมาจาก `lib/__tests__/apiHostGuard.test.ts` (P6 ตัดสิน · 27 ส.ค. 2026)
P1 วางไว้ฝั่งเทสต์เพราะทำได้ทันที · เหตุผลที่ย้ายไม่ใช่เรื่องโซน แต่เป็น **ข้อเท็จจริงของวันนี้เอง**:
**ชุดเต็มบน `platform` แดงมาหลายชั่วโมงจาก `customPlaceAdapter.test.ts` ที่ไม่เกี่ยวกันเลย**
· ด่านที่อยู่*ใน*ชุดทดสอบ **สืบทอดความพร้อมใช้ของทั้งชุด** — วันที่ชุดรันไม่ได้ ด่านก็ไม่ได้รัน
  และ *ไม่มีใครรู้ว่ามันไม่ได้รัน* เพราะหน้าจอเต็มไปด้วยความแดงของเรื่องอื่น
· `guards.sh` ไม่ต้องมี `node_modules` ไม่ต้องมีคีย์ รันได้ก่อนทุกอย่าง และงาน `guards` ใน CI
  แยกจากงาน `verify` → **ความล้มเหลวของโค้ดที่ไม่เกี่ยวกัน ปิดตาด่านนี้ไม่ได้อีก**
🔴 **ห้ามมีสองที่** — P1 ลบฝั่งเทสต์เมื่อรับข้อความนี้ (`D46`: สองชุดที่ต่างกันนิดเดียว
   ทำให้ช่องไปอยู่ตรงตัวที่หลวมกว่า โดยอ่านทีละอันแล้วถูกทั้งคู่)
"""

import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _tsscan import strip_comments, tracked  # noqa: E402

FORBIDDEN = [
    ("Google Maps legacy", "E4-AC6", re.compile(r"maps\.googleapis\.com/maps/api/", re.I)),
    ("ODsay",              "E4-AC5", re.compile(r"(api\.)?odsay\.com", re.I)),
    ("Kakao API",          "E4-AC5", re.compile(r"(dapi|apis)\.kakao\.com", re.I)),
    ("Naver API",          "E4-AC5", re.compile(r"(openapi\.naver|naveropenapi)\.com", re.I)),
]

# 🔴 self-test: ด่านที่ไม่เคยเห็นของผิด กับด่านที่พัง **หน้าตาเหมือนกันเป๊ะ**
#
# ⚠️ **CANARY ข้างล่างมีชื่อโฮสต์ที่ด่านนี้ห้ามไว้ อยู่เป็นสตริงจริง**
#    วันนี้ไม่ระเบิด **เพราะบังเอิญ** — ด่านนี้สแกนแค่ `*.ts`/`*.tsx` ไฟล์นี้เป็น `.py`
#    🔴 **วันที่มีคนขยายขอบเขตไปที่ `.py` มันจะแดงใส่ตัวเองทันที** (เกิดกับ `check-naive-strip.py`
#       มาแล้วจริง ๆ · P1 เจอบนหัว branch เมื่อ 27 ส.ค.) → ถ้าจะขยาย **ประกอบ CANARY ทีละชิ้นก่อน**
#       รูปแบบเดียวกับ `guards-selftest.sh:11` (`printf 'ejzibhgqhxdz%s' 'kovsnpds'`)
CANARY = ('const u = "https://maps.googleapis.com/maps/api/js?key=x";\n'
          'fetch("https://api.odsay.com/v1");\n'
          'const k = "https://dapi.kakao.com/v2";\n'
          'const n = "https://openapi.naver.com/v1";')


def main(argv) -> int:
    root = argv[0] if argv else "."

    # ① ด่านต้องพิสูจน์ก่อนว่าตัวเองยังจับของผิดได้ — **ก่อน**จะรายงานว่าของจริงสะอาด
    canary_code = strip_comments(CANARY)
    missed = [n for n, _, rx in FORBIDDEN if not rx.search(canary_code)]
    if missed:
        print(f"🔴 api-hosts: self-test ล้ม · regex จับไม่ได้แล้ว → {', '.join(missed)}")
        print("   🎯 ถ้าเคสนี้แดง แปลว่าเคสจริงข้างล่าง 'เขียว' เพราะตาบอด ไม่ใช่เพราะสะอาด")
        return 1

    files = [f for f in tracked(root, "*.ts", "*.tsx") if "__tests__" not in f]
    if len(files) < 100:
        print(f"🔴 api-hosts: ขอบเขตมีแค่ {len(files)} ไฟล์ — น้อยผิดปกติ")
        print("   ด่านที่สแกน 0 ไฟล์ก็ 'ผ่าน' · หยุดไว้ดีกว่าเขียวเพราะไม่มีอะไรให้มอง")
        return 1

    hits = []
    for f in files:
        try:
            src = open(f"{root}/{f}", encoding="utf-8").read()
        except OSError as e:
            print(f"🔴 api-hosts: อ่าน {f} ไม่ได้ — {e.__class__.__name__}")
            return 1
        code = strip_comments(src)
        for i, line in enumerate(code.split("\n"), 1):
            for name, ac, rx in FORBIDDEN:
                if rx.search(line):
                    hits.append(f"{f}:{i} — {name} ({ac})")

    if hits:
        print("🔴 api-hosts: เรียกโฮสต์ที่ `E4-AC5`/`AC6` ห้ามไว้")
        for h in hits:
            print(f"   {h}")
        print("   → ทะเบียนมีช่องเสียบไว้ แต่ยังไม่อนุมัติให้เสียบ · คุยกับ P1 ก่อน")
        return 1

    print(f"✅ api-hosts: ตรวจ {len(files)} ไฟล์ · ไม่มีการเรียก ODsay/Kakao/Naver/Maps-legacy")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
