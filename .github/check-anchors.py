#!/usr/bin/env python3
"""ด่าน anchor — ลิงก์ภายในเอกสาร `](#หัวข้อ)` ต้องชี้ไปหัวข้อที่มีอยู่จริง

ที่มา: P8-PM/BA เสนอ 24 ส.ค. 2026 · P1 อนุมัติล่วงหน้า · P6-DevOps รับเข้า CI
เหตุผล: ลิงก์ภายในที่ชี้ผิด **ไม่มีสัญญาณอะไรเลย** — ไม่ error ไม่ fail test ไม่ขึ้น lint
        คนกดแล้วไม่ไปไหนก็เลื่อนหาเอง แล้วไม่มีใครรายงาน
        (ของจริง: สารบัญ backlog.md ข้อ 2.6 ชี้ผิดตั้งแต่วันที่เขียน เพราะ `-` เกินมาตัวเดียว)

ใช้:  .github/check-anchors.py <ไฟล์.md> [...]
คืน:  0 = ผ่าน · 1 = เจอลิงก์ที่ชี้ไปหัวข้อที่ไม่มีอยู่

🔴 ข้อจำกัดที่ต้องรู้ก่อนเชื่อผลของด่านนี้ (P8 เป็นคนชี้เอง — จดไว้ตามที่ตกลงกัน):
   `slug()` ข้างล่างเป็นการ **เลียนแบบ** กติกาการสร้าง anchor ของ GitHub ไม่ใช่ของจริง
   ตรวจแล้วว่าตรงกับหัวข้อภาษาไทย/อิโมจิ/em-dash/วงเล็บ ในไฟล์เราตอนนี้
   **แต่ถ้า GitHub เปลี่ยนกติกาเมื่อไหร่ ไฟล์นี้จะผิดโดยไม่มีสัญญาณ — ชนิดเดียวกับที่มันไปตรวจ**
   ถ้าวันหนึ่งด่านนี้ฟ้องลิงก์ที่กดแล้วไปถูกที่จริง ให้สงสัย slug() ก่อนสงสัยเอกสาร

🔴 ทำไมเป็น Python ทั้งที่ด่านอื่นเป็น bash:
   กติกาของ GitHub คือ "เก็บตัวอักษร/ตัวเลข/วรรณยุกต์ ทิ้งเครื่องหมายวรรคตอน"
   ซึ่งต้องดู Unicode category รายตัว · ทำใน sed/bash ได้แค่ hardcode ช่วงรหัส
   ซึ่งจะ **เงียบและผิด** กับสระ/วรรณยุกต์ไทย = สร้างบั๊กชนิดเดียวกับที่ด่านนี้มีหน้าที่จับ
   stdlib ล้วน ไม่มี dependency · python3 มีติดมากับ ubuntu-latest อยู่แล้ว
"""
import re
import sys
import unicodedata

FENCE = re.compile(r"^(\s{0,3})(`{3,}|~{3,})(.*)$")
HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*$")
LINK = re.compile(r"\]\(#([^)\s]+)\)")
INLINE_CODE = re.compile(r"`[^`]*`")


def slug(heading: str) -> str:
    """เลียนแบบกติกา anchor ของ GitHub: lower · ทิ้งวรรคตอน · space -> hyphen"""
    out = []
    for ch in heading.lower():
        if ch in "-_ ":
            out.append(ch)
        elif unicodedata.category(ch)[0] in ("L", "N", "M"):
            out.append(ch)
    return "".join(out).replace(" ", "-")


def strip_fences(text: str) -> list:
    """คืนบรรทัดที่อยู่ "นอก" code fence เท่านั้น

    🔴 จำเป็น ไม่ใช่ของแถม — ทั้งสองทางพังคนละแบบ:
       · `#` ในบล็อกโค้ดถูกนับเป็นหัวข้อ -> ด่านหลวมเกิน (เจอจริง 2 ตัวใน devops.md)
       · `](#x)` ในบล็อกโค้ดถูกนับเป็นลิงก์ -> ด่านฟ้องผิด ซึ่งอันตรายกว่า
         เพราะ CI แดงที่ไม่มีมูลสอนให้คนข้าม CI ทั้งใบ
    """
    lines = []
    closer = None  # (อักขระ, ความยาว) ของ fence ที่เปิดค้างอยู่
    for line in text.split("\n"):
        m = FENCE.match(line)
        if closer is None:
            if m:
                closer = (m.group(2)[0], len(m.group(2)))
            else:
                lines.append(line)
        else:
            # fence ปิดต้องเป็นอักขระเดียวกัน และยาวไม่น้อยกว่าตัวเปิด
            if m and m.group(2)[0] == closer[0] and len(m.group(2)) >= closer[1]:
                closer = None
    return lines


def anchors_of(lines: list) -> set:
    """เก็บ anchor ที่ GitHub จะสร้างจริง รวมท้าย -1 -2 ของหัวข้อชื่อซ้ำ

    🔴 หัวข้อซ้ำ: GitHub ให้ตัวแรกได้ slug เปล่า ตัวถัดไปได้ `-1`, `-2` ...
       ถ้าไม่ทำข้อนี้ ลิงก์ `#foo-1` ที่กดแล้วไปถูกที่ จะถูกฟ้องว่าพัง = ด่านโกหก
    """
    seen = {}
    out = set()
    for line in lines:
        m = HEADING.match(line)
        if not m:
            continue
        base = slug(m.group(2))
        n = seen.get(base, 0)
        seen[base] = n + 1
        out.add(base if n == 0 else f"{base}-{n}")
    return out


def links_of(lines: list) -> list:
    # ตัด inline code ออกก่อนหาลิงก์ — `](#ตัวอย่าง)` ที่เขียนอธิบายไว้ ไม่ใช่ลิงก์จริง
    # ⚠️ ตัดตอนหา "ลิงก์" เท่านั้น ห้ามตัดตอนหา "หัวข้อ"
    #    เพราะหัวข้ออย่าง `## \x60foo\x60 bar` จะเหลือ `## bar` แล้ว slug ผิด
    found = []
    for line in lines:
        found += LINK.findall(INLINE_CODE.sub("", line))
    return found


def check(path: str) -> list:
    with open(path, encoding="utf-8") as fh:
        lines = strip_fences(fh.read())
    have = anchors_of(lines)
    return sorted({a for a in links_of(lines) if a not in have})


def main(paths) -> int:
    bad = 0
    for path in paths:
        for anchor in check(path):
            print(f"🔴 {path}: ลิงก์ชี้ไปหัวข้อที่ไม่มีอยู่ -> #{anchor}")
            bad += 1
    if bad:
        print(f"🔴 anchor: ตรวจ {len(paths)} ไฟล์ · พัง {bad} ตัว")
        return 1
    print(f"✅ anchor: ตรวจ {len(paths)} ไฟล์ · ลิงก์ภายในชี้ถูกทุกตัว")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
