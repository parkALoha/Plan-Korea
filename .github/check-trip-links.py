#!/usr/bin/env python3
"""ลิงก์ภายในที่ชี้หน้าของทริป **ต้องมี `tripId`** — `E5`

## 🔴 บั๊กที่ทำให้ด่านนี้มีอยู่ (P2 เจอ · P1 แก้ `274936a` · 27 ส.ค. 2026)
ปุ่ม **"🛂 Immigration sheet"** ใน `/summary` ชี้ไป `/summary?...` **ไม่มี `/trip/${tripId}` นำหน้า**
→ กดแล้วไม่ไปไหน · **เป็นปุ่มที่ผู้ใช้ต้องกดตอนยืนหน้าเคาน์เตอร์ ตม. วันที่ 11 ต.ค.**

🎯 **เหตุผลที่มันรอดมาถึงวันนั้น คือรูปของโค้ด ไม่ใช่ความสะเพร่า:**
```tsx
href={
  immigrationView
    ? `/summary?lang=${lang}`     ← สตริงอยู่ *คนละบรรทัด* กับ `href=`
```
· คำค้นที่ทุกคนใช้ (`href="/`) **มองรูปนี้ไม่เห็นตามนิยาม** — ตอนกวาด `href="/"` → `/trip/<id>` มันจึงตกหล่น
· 🔴 และตอน P1 ไล่หาจุดพี่น้องหลังรายงาน **ได้ผลว่าง แล้วเกือบสรุปว่าไม่มีตัวอื่น**
  ต้องค้นใหม่ด้วยรูป *"สตริงที่ขึ้นต้นบรรทัด"* ถึงเห็น
→ ด่านนี้จึงอ่าน **ทั้งนิพจน์ของ `href`** (ไล่ปีกกาให้สมดุล) ไม่ใช่ทีละบรรทัด

## 🔴 กฎงอกจาก route ที่มีอยู่จริง ไม่ได้ hardcode
อ่าน `app/trip/[tripId]/<name>/page.tsx` จาก git → ได้ชื่อหน้าที่ผูกกับทริป
→ วันที่มีใครเพิ่ม route ใหม่ **ด่านครอบให้เองโดยไม่ต้องมีคนจำ**

## ⚠️ ด่านนี้ใช้ได้กับทรี `platform` เท่านั้น — และ `guards.sh` กันไว้ให้แล้ว
บน `main` **ไม่มี `app/trip/[tripId]/` เลยสักไฟล์** · `/summary` แบบ bare คือรูปที่ *ถูกต้อง* ที่นั่น
🎯 ถ้าเอาด่านนี้ไปรันกับ `main` **มันจะแดงใส่ลิงก์ที่ถูกทุกเส้น** — รูปเดียวกับด่าน `.env`
"""

import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _tsscan import strip_comments, tracked  # noqa: E402

TRIP_DIR = "app/trip/[tripId]/"

# ✅ ข้อยกเว้นที่ประกาศชื่อไว้ พร้อมเหตุผล — **ไม่ใช่แพตเทิร์นกว้าง ๆ** (P1 กำชับ)
#    `/today` แบบ bare ต้องคงอยู่เพราะ `app/manifest.ts` ตั้ง `start_url: "/today"` ไว้ตายตัว
#    → PWA ที่ติดตั้งไปแล้วบนเครื่องผู้ใช้ชี้มาที่พาธนี้ · เปลี่ยนไม่ได้ฝ่ายเดียว
#    🔴 ถ้าจะเพิ่มชื่อที่นี่ **ต้องเขียนเหตุผลกำกับ** — รายการที่ไม่มีเหตุผลคือรายการที่จะโตเรื่อย ๆ
ALLOWED_BARE = {
    "today": "app/manifest.ts ตั้ง start_url: /today · PWA ที่ติดตั้งแล้วชี้มาที่นี่",
}

HREF = re.compile(r"href\s*=\s*")
LITERAL = re.compile(r"[`\"']([^`\"'\n]*)[`\"']")


def href_expr(code: str, start: int) -> str:
    """คืน *ทั้งนิพจน์* ของ href — ไล่ปีกกาให้สมดุล ไม่ใช่ตัดตามบรรทัด"""
    i = start
    while i < len(code) and code[i] in " \t\n":
        i += 1
    if i >= len(code):
        return ""
    if code[i] != "{":
        m = LITERAL.match(code, i)
        return m.group(0) if m else ""
    depth, j = 0, i
    while j < len(code):
        if code[j] == "{":
            depth += 1
        elif code[j] == "}":
            depth -= 1
            if depth == 0:
                return code[i:j + 1]
        j += 1
    return code[i:i + 400]


def trip_routes(root: str) -> set:
    """ชื่อหน้าที่ผูกกับทริป — มาจากไฟล์ที่มีอยู่จริง ไม่ใช่รายการที่พิมพ์เอง

    🔴 **ห้ามใช้ glob กับพาธนี้**: `git ls-files 'app/trip/[tripId]/*'` จะแปล `[tripId]`
       เป็น *character class* แล้วคืนค่าว่าง → ด่านเขียวเพราะไม่มีอะไรให้ตรวจ
       (P6 เดินเข้าไปเองตอนสร้างด่านนี้ · เป็นกับดักเซตว่างรอบที่ 4 ของทีมในวันเดียว)
    """
    out = set()
    for f in tracked(root):
        if f.startswith(TRIP_DIR) and f.endswith("page.tsx"):
            m = re.match(re.escape(TRIP_DIR) + r"(?:([^/]+)/)?page\.tsx$", f)
            if m and m.group(1):
                out.add(m.group(1))
    return out


def scan(root: str, names: set) -> list:
    hits = []
    for f in tracked(root):
        if not f.endswith((".tsx", ".ts")):
            continue
        if not (f.startswith("app/") or f.startswith("components/")):
            continue
        if f.startswith(TRIP_DIR):
            continue  # ในนั้นเป็นพาธสัมพัทธ์ของทริปอยู่แล้ว
        try:
            code = strip_comments(open(f"{root}/{f}", encoding="utf-8").read())
        except OSError as e:
            print(f"🔴 trip-links: อ่าน {f} ไม่ได้ — {e.__class__.__name__}")
            raise SystemExit(1)
        for m in HREF.finditer(code):
            expr = href_expr(code, m.end())
            # 🔴 อ่าน **ทุก** literal ในนิพจน์ ไม่ใช่ตัวแรก — ternary มีสองทาง
            #    ฉบับแรกของผมหยุดที่ตัวแรก แล้วเห็นบั๊กจริงแค่ 1 ใน 2 บรรทัด
            for lit in LITERAL.finditer(expr):
                p = lit.group(1)
                if not p.startswith("/") or p.startswith("/trip/"):
                    continue
                base = p.split("?")[0].split("#")[0].strip("/")
                if base in names and base not in ALLOWED_BARE:
                    line = code.count("\n", 0, m.end() + lit.start()) + 1
                    hits.append(f"{f}:{line} — {p}")
    return hits


def main(argv) -> int:
    root = argv[0] if argv else "."
    names = trip_routes(root)

    # 🔴 **เซตว่าง = ตัวไล่พัง ไม่ใช่ 'ไม่มีอะไรให้ตรวจ'** (P1 กำชับ · ทีมโดนมาแล้ว 3 รอบวันนี้)
    if not names:
        print(f"🔴 trip-links: ไม่พบ route ใต้ {TRIP_DIR} เลยสักตัว")
        print("   ด่านที่ไม่มีชื่อหน้าให้เทียบ จะเขียวตลอดกาลโดยไม่ได้ตรวจอะไร")
        print("   → เช็คว่าโครงโฟลเดอร์เปลี่ยนไหม (อย่าใช้ glob กับ [tripId] — git แปลเป็น char class)")
        return 1

    # 🔴 positive control: ด่านต้องพิสูจน์ว่ายังจับ *รูปหลายบรรทัด* ได้ ก่อนรายงานว่าของจริงสะอาด
    canary = (
        "<Link\n  href={\n    view\n      ? `/" + sorted(names)[0] + "?lang=${lang}`\n"
        "      : `/" + sorted(names)[0] + "?for=x`\n  }\n>"
    )
    found = [lit.group(1) for lit in LITERAL.finditer(href_expr(canary, canary.index("href=") + 5))]
    bare = [p for p in found if p.startswith("/") and not p.startswith("/trip/")]
    if len(bare) < 2:
        print(f"🔴 trip-links: self-test ล้ม · จับรูปหลายบรรทัดได้ {len(bare)}/2 ทาง")
        print("   🎯 บั๊กจริงเป็น ternary ที่มีสองทาง — ถ้าอ่านได้ทางเดียว จะเห็นครึ่งเดียว")
        return 1

    hits = scan(root, names)
    if hits:
        print("🔴 trip-links: ลิงก์ชี้หน้าของทริปโดยไม่มี tripId — กดแล้วไม่ไปไหน")
        for h in hits:
            print(f"   {h}")
        print(f"   → ต้องเป็น `/trip/${{tripId}}/<page>` · หน้าที่ผูกกับทริป: {sorted(names)}")
        print("   (ถ้าเป็นข้อยกเว้นจริง ใส่ชื่อ + เหตุผลใน ALLOWED_BARE ของไฟล์นี้)")
        return 1

    ex = f" · ยกเว้น {sorted(ALLOWED_BARE)}" if ALLOWED_BARE else ""
    print(f"✅ trip-links: หน้าของทริป {sorted(names)} ถูกลิงก์พร้อม tripId ทุกจุด{ex}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
