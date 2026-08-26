"""ของกลางสำหรับด่านที่ **อ่านซอร์ส** — ตัดคอมเมนต์ + ประกาศขอบเขตจาก git

🔴 **ทำไมไฟล์นี้ถึงมี** (P6 · 27 ส.ค. 2026)
ทีมนี้เขียน "ตัวตัดคอมเมนต์" ขึ้นมาใหม่ **4 ครั้ง** และ 3 ใน 4 ครั้งได้รูปไร้เดียงสาเดียวกัน
คือตัดที่ `//` ตัวแรกจนจบบรรทัด → `"https://dapi.kakao.com/…"` เหลือ `"https:`
**ด่านจึงลบสิ่งที่ตัวเองมีหน้าที่หา แล้วรายงานว่าสะอาด** — ทิศที่แย่กว่าจับผิด เพราะไม่มีใครไปดู

⚠️ **ครั้งที่ 4 (P1) ไม่ได้ข้ามภาษาเลย** — เขียนซ้ำ *ในโฟลเดอร์เดียวกับ* `_helpers.ts`
ซึ่งเป็นไฟล์ที่ถูกสร้างมาเพื่อกันการซ้ำนั้นโดยเฉพาะ
🎯 **ระยะห่างระหว่างภาษาไม่ใช่สาเหตุ · ของกลางกันได้ก็ต่อเมื่อคนถัดไปเจอมัน *ก่อน* พิมพ์ของตัวเอง**
   → นั่นคือเหตุผลที่ `check-naive-strip.py` มีอยู่: **ปิดด้วยเครื่องมือ เพราะเอกสารปิดไม่ได้**

📌 ฝั่ง TypeScript ของกลางอยู่ที่ `lib/__tests__/_helpers.ts` (`stripTsComments`)
   **สองที่นี้จงใจให้มี** — คนละภาษา เรียกข้ามกันไม่ได้ · ที่ห้ามคือ *ที่ที่ 3*
"""

import subprocess


def strip_comments(src: str) -> str:
    """คืนซอร์สที่ **คอมเมนต์ถูกแทนด้วยช่องว่าง** โดยความยาวและเลขบรรทัดไม่เปลี่ยน (TS/JS)

    🔴 ต้องรู้ว่าอยู่ในสตริงหรือไม่ · ฉบับแรกใช้ `re.sub(r"//.*$", "", line)` ทีละบรรทัด
       → `"https://…"` มี `//` อยู่ข้างใน **regex จึงกลืนโค้ดจริงที่เหลือทั้งบรรทัด**
       ผลคือ `supabase.from(t)` ที่ตามหลัง URL บนบรรทัดเดียวกัน **หลุดเงียบ**
    """
    out = list(src)
    i, n, state = 0, len(src), None
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if state is None:
            if c == "/" and nxt == "/":
                state, out[i], out[i + 1] = "//", " ", " "; i += 2; continue
            if c == "/" and nxt == "*":
                state, out[i], out[i + 1] = "/*", " ", " "; i += 2; continue
            if c in "\"'`":
                state = c
            i += 1; continue
        if state == "//":
            if c == "\n": state = None
            else: out[i] = " "
            i += 1; continue
        if state == "/*":
            if c == "*" and nxt == "/":
                out[i], out[i + 1], state = " ", " ", None; i += 2; continue
            if c != "\n": out[i] = " "
            i += 1; continue
        if c == "\\":
            i += 2; continue
        if c == state:
            state = None
        i += 1
    return "".join(out)


def strip_py_comments(src: str) -> str:
    """เวอร์ชัน Python — `#` นอกสตริง + docstring สามอัญประกาศ

    🔴 **จำเป็นเพราะด่านของเราเขียนด้วย Python และ *อธิบายบั๊กที่ตัวเองตามหา* ไว้ใน docstring**
    ถ้าไม่ตัด docstring ทิ้งก่อน `check-naive-strip.py` จะแดงใส่คำเตือนของตัวเอง — `D40`
    (แรงกดดันที่ตามมาคือ *ลบคำอธิบายทิ้งให้เขียว* = ลบความรู้เพื่อให้ตัวเลขสวย)
    """
    out = list(src)
    i, n, state = 0, len(src), None
    while i < n:
        c = src[i]
        three = src[i:i + 3]
        if state is None:
            if three in ('"""', "'''"):
                state = three
                out[i] = out[i + 1] = out[i + 2] = " "
                i += 3; continue
            if c == "#":
                state = "#"; out[i] = " "; i += 1; continue
            if c in "\"'":
                state = c
            i += 1; continue
        if state == "#":
            if c == "\n": state = None
            else: out[i] = " "
            i += 1; continue
        if state in ('"""', "'''"):
            if three == state:
                out[i] = out[i + 1] = out[i + 2] = " "
                state = None; i += 3; continue
            if c != "\n": out[i] = " "
            i += 1; continue
        if c == "\\":
            i += 2; continue
        if c == state:
            state = None
        i += 1
    return "".join(out)


def tracked(root: str, *globs: str) -> list:
    """ขอบเขตของด่าน **มาจาก git ไม่ใช่จากรายชื่อโฟลเดอร์ที่คนเขียนด่านพิมพ์เอง**

    🔴 `P-61`: P1 รายงาน *"ไม่เจออะไรเลย"* จาก `grep -rn lib/ app/ components/`
       **โดยไม่ได้ใส่ `data/` ซึ่งเป็นที่ที่ของจริงอยู่** — ด่านที่ประกาศขอบเขตเองจะพลาดแบบนี้เสมอ
    """
    out = subprocess.run(
        ["git", "-C", root, "ls-files", *globs],
        capture_output=True, text=True, check=True,
    ).stdout
    return [f for f in out.split("\n") if f]
