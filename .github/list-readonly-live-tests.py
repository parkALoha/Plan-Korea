#!/usr/bin/env python3
"""หาไฟล์เทสต์ที่ *ใช้จริง* `READ_ONLY_MODE_TEST` — ไม่ใช่แค่เอ่ยถึง

## 🔴 ทำไมต้องมีไฟล์นี้แทนที่จะเป็น `grep` บรรทัดเดียวใน `ci.yml` (P6 · 27 ส.ค. 2026)
job `readonly-storage` เลือกไฟล์เทสต์ที่จะรันด้วยการค้นหาว่าไฟล์ไหน "เกี่ยวข้อง" กับธงนี้
ประวัติของการเลือกวิธี:
· `grep -l 'READ_ONLY_MODE_TEST' *.test.ts` — จับคำในคอมเมนต์/ข้อความ warn ด้วย
  → ไฟล์ที่แค่ *เอ่ยถึง* ธง (ไม่เคยเข้าโหมดจริง) จะถูกลากเข้า job ที่เปิด read-only จริงบน engine-dev
· `grep -l 'process\\.env\\.READ_ONLY_MODE_TEST'` — แคบลง แต่ **overfit กับสไตล์การเขียน**
  → ไฟล์ที่เขียน `const { READ_ONLY_MODE_TEST } = process.env` จะ**หลุดออกเงียบ ๆ**
  🔴 **และนี่อันตรายกว่าจับเกิน**: ไฟล์หลุดไป *หนึ่ง* ไฟล์ไม่ทำให้เซตว่าง (ยังมีไฟล์อื่นให้รัน)
     → empty-set guard ไม่ยิง → job ยังเขียว → **เคสความปลอดภัยหายไปเงียบ ๆ**
· `grep -n 'X' file | grep -v comment-prefix` — P4 เสนอ แล้วเจอบั๊กของตัวเอง:
  **`grep -n` ใส่ prefix ชื่อไฟล์เฉพาะตอนกวาดหลายไฟล์** ไฟล์เดียวไม่มี `file:` นำหน้า
  → regex ที่คาด prefix จะพังเงียบ ๆ ตอนเหลือไฟล์เดียว (จุดตัดที่ไม่มีใครทดสอบ)

🎯 **ทางที่ใช้: `strip_comments` ตัวเดียวกับที่ `.github/check-naive-strip.py` บังคับให้ทุกด่านใช้**
เดินทีละตัวอักษร รู้ว่าอยู่ในสตริง/คอมเมนต์ไหม — ไม่พังกับ `https://` ไม่พังกับไฟล์เดียว
ไม่ต้องเดาว่าใครจะเขียน `process.env.X` หรือ destructure — ตัดคอมเมนต์ก่อน แล้วชื่อธงที่เหลือคือของจริงเสมอ
"""

import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _tsscan import strip_comments, tracked  # noqa: E402

FLAG = "READ_ONLY_MODE_TEST"


def main(argv) -> int:
    root = argv[0] if argv else "."
    hits = []
    for f in tracked(root, "lib/__tests__/*.test.ts"):
        try:
            code = strip_comments(open(f"{root}/{f}", encoding="utf-8").read())
        except OSError as e:
            print(f"🔴 list-readonly-live-tests: อ่าน {f} ไม่ได้ — {e.__class__.__name__}", file=sys.stderr)
            return 1
        if re.search(r"\b" + FLAG + r"\b", code):
            hits.append(f)

    # 🔴 เซตว่าง = ตัวไล่พัง ไม่ใช่ "ไม่มีอะไรให้รัน" — ทั้งไฟล์นี้มีไว้แก้ปัญหานี้ให้ครบทุกทิศ
    if not hits:
        print(f"🔴 list-readonly-live-tests: ไม่พบไฟล์ที่ใช้ {FLAG} เลยสักไฟล์", file=sys.stderr)
        print("   ตัวไล่พังหรือไม่มีเคสสดเหลืออยู่ — ไม่ถือว่า 'ไม่มีอะไรให้รัน' = ผ่าน", file=sys.stderr)
        return 1

    for h in sorted(hits):
        print(h)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
