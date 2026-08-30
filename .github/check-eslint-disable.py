#!/usr/bin/env python3
"""จับ `eslint-disable` สองรูปที่หลบด่าน `no-restricted-imports` ของ `E6-AC11` ได้ — P1 · 30 ส.ค. 2026

## 🎯 ทำไมด่านนี้มีอยู่
`E6-AC11` (รวมแหล่งข้อมูล "วัน" ของทริปให้เหลือ `useTripDays()` แหล่งเดียว) เดิม P1 สั่งให้เลิก
`export buildDayBridge` เพื่อให้คอมไพเลอร์บังคับ — แต่เทสต์หน่วยของสะพานต้อง import ตัวเองไม่ได้
ไปด้วย ซึ่งเทสต์ชุดนั้นกันบั๊กจริงที่เคยกัด (`matched` = 0 เสมอ → แถบเตือนค้าง + แคชออฟไลน์ไม่เขียน)
→ ถอนคำสั่งเดิม เปลี่ยนมาบังคับด้วย `no-restricted-imports` ใน `eslint.config.mjs` แทน (P3 · `ca425c6`)
บังคับด้วย `npm run lint -- --max-warnings=0` ที่ CI รันอยู่แล้ว

## 🔴 รูที่กฎ eslint เพียงอย่างเดียวปิดไม่ได้ — P1 วัดของจริงก่อนเขียนด่านนี้
```
eslint-disable ทั้งรีโป = 27 จุด · ทุกจุดเป็น -next-line พร้อมระบุชื่อกฎ (0 blanket)
```
`eslint-disable-next-line no-restricted-imports` นอกไฟล์ที่ยกเว้น **แก้กฎเองในไฟล์ที่แก้ได้** —
grep หาชื่อกฎเจอ แต่ `/* eslint-disable */` (ไม่ระบุชื่อกฎ) **ปิดทุกกฎทั้งไฟล์โดยไม่มีสตริง
"no-restricted-imports" ให้หาเจอเลย** — ตระกูลเดียวกับ "ด่านตายเมื่อเอาคำถามออก" ที่ทีมนี้เจอซ้ำ
· วัดแล้ว blanket disable = 0 จุดในรีโปวันนี้ → **ห้ามได้ที่ราคา 0** ไม่กระทบใครสักคน

## ⚙️ สองกฎ ไม่ใช่กฎเดียว
1. **`eslint-disable` แบบ blanket** (ไม่ระบุชื่อกฎเลย) — ห้ามทั้งรีโป ไม่ผูกกับ `E6-AC11`
2. **`eslint-disable*` ที่ระบุ `no-restricted-imports`** — ห้ามนอกไฟล์ที่ `eslint.config.mjs` ยกเว้น
   (`hooks/useTripDays.tsx` · `lib/__tests__/**`)

## ⚠️ ข้อจำกัดที่รับไว้แล้ว (ไม่ใช่จุดอ่อนใหม่ของด่านนี้)
เป็น grep/regex ต่อบรรทัด ไม่ใช่ AST — เหมือนด่าน grep ทุกตัวอื่นในไฟล์นี้ (`check-api-hosts.py`,
`check-naive-strip.py` ฯลฯ) การหลบแบบ multi-line comment ที่จงใจแยกคำ หรือ dynamic string
construction ไม่ได้ถูกจับ — แต่ ESLint เองก็ไม่รู้จัก syntax แบบนั้นเป็น disable directive อยู่แล้ว
"""

import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _tsscan import tracked  # noqa: E402

DISABLE = re.compile(r"eslint-disable(-next-line|-line)?\b([^\n]*)")

EXEMPT_EXACT = {"hooks/useTripDays.tsx"}
EXEMPT_PREFIX = "lib/__tests__/"

RULE_OF_INTEREST = "no-restricted-imports"


def is_exempt(path: str) -> bool:
    return path in EXEMPT_EXACT or path.startswith(EXEMPT_PREFIX)


def parse_rules(rest: str) -> list:
    rest = rest.split("*/")[0].split("-->")[0].split(" -- ")[0]
    return [r.strip() for r in rest.split(",") if r.strip()]


def scan_line(line: str):
    """คืน (kind, snippet) ถ้าบรรทัดนี้ละเมิด — kind เป็น 'blanket' หรือ 'scoped', ไม่งั้นคืน None"""
    m = DISABLE.search(line)
    if not m:
        return None
    rest = m.group(2)
    rules = parse_rules(rest)
    if not rules:
        return "blanket"
    if RULE_OF_INTEREST in rules:
        return "scoped"
    return None


def main(argv) -> int:
    root = argv[0] if argv else "."

    # 🔴 self-test ก่อนเสมอ — ด่านที่ตาบอดกับด่านที่เห็นว่าสะอาด พิมพ์ข้อความเดียวกัน
    cases = [
        ("/* eslint-disable */", "blanket"),
        ("// eslint-disable", "blanket"),
        ("// eslint-disable-next-line no-restricted-imports", "scoped"),
        ("/* eslint-disable-next-line no-restricted-imports */", "scoped"),
        ("// eslint-disable-next-line @next/next/no-img-element", None),
        ("// eslint-disable-line react-hooks/exhaustive-deps", None),
        ("const eslint_disabled_flag = true;", None),
        ("// this line has nothing to do with lint", None),
    ]
    for line, expect in cases:
        got = scan_line(line)
        if got != expect:
            print(f"🔴 eslint-disable: self-test ล้ม · '{line}' → คาด {expect} ได้ {got}")
            return 1

    files = tracked(root, "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs")
    if not files:
        print("🔴 eslint-disable: ไม่มีไฟล์ให้ตรวจเลย — ขอบเขตเพี้ยน หยุดไว้ก่อน")
        return 1

    hits = []
    for f in files:
        try:
            src = open(f"{root}/{f}", encoding="utf-8").read()
        except OSError as e:
            print(f"🔴 eslint-disable: อ่าน {f} ไม่ได้ — {e.__class__.__name__}")
            return 1
        for i, line in enumerate(src.split("\n"), 1):
            kind = scan_line(line)
            if kind == "blanket":
                hits.append((f, i, line.strip(), "blanket disable ไม่ระบุชื่อกฎ — ปิดทุกกฎทั้งไฟล์"))
            elif kind == "scoped" and not is_exempt(f):
                hits.append((f, i, line.strip(),
                              f"disable {RULE_OF_INTEREST} นอกไฟล์ที่ยกเว้น (E6-AC11)"))

    if hits:
        print("🔴 eslint-disable: เจอการหลบด่านที่ห้าม")
        for f, i, line, reason in hits:
            print(f"   {f}:{i} — {reason}")
            print(f"      {line[:100]}")
        return 1

    print(f"✅ eslint-disable: ตรวจ {len(files)} ไฟล์ · ไม่มี blanket disable "
          f"และไม่มีใครหลบ {RULE_OF_INTEREST} นอกไฟล์ยกเว้น")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
