#!/usr/bin/env python3
"""ด่าน 2 ข้อรอบ `supabase.from(...)` — ใช้ตัวแยกวิเคราะห์ตัวเดียวกัน

① ชื่อตารางต้องเป็น **สตริงตรง** เสมอ (ยกเว้นไฟล์ชั้น data-access)
② ตารางใน `helper-only-tables` **เรียกได้จากชั้น data-access เท่านั้น**

📌 อยู่ไฟล์เดียวกันเพราะทั้งคู่ต้องแยกให้ออกว่า `.from(` ตัวไหนคือตาราง ตัวไหนคือ
   `Array.from` / `Buffer.from` / `storage.from` · **แยกไฟล์ = มีตัวแยกวิเคราะห์ 2 ตัว
   ที่ต้องแก้พร้อมกันตลอดไป** ซึ่งเป็นรูปที่เราหลีกเลี่ยงกันมาทั้งคืน

ใช้:  .github/check-dynamic-from.py <ไฟล์.ts|.tsx> [...]
คืน:  0 = ทุกจุดใช้สตริงตรง · 1 = เจอชื่อตารางที่เป็นตัวแปร/นิพจน์

🔴 ที่มา — P4 ชี้ (25 ส.ค. 2026) และทิศที่เขาชี้คือหัวใจของไฟล์นี้:
   ด่านที่ตรวจ **สตริงตรง** อย่างเดียว จะ **ปล่อยผ่าน** ของที่มันไม่รู้จัก
   `การนับ` ที่พลาดจะรายงานว่าครอบ *น้อยกว่า* จริง → สั่งให้ไปทำงานเพิ่ม (ปลอดภัย)
   **ด่านที่พลาดจะ *ผ่าน* → ของที่ไม่รู้จักเดินผ่านฟรี (อันตราย)**
   → ไฟล์นี้ทำให้ **ของที่ไม่รู้จัก = แดง** แทน **ของที่ไม่รู้จัก = ผ่าน**

📌 เปิดตอนนี้ได้ฟรี: วัดแล้ว **0 จุด** ในโค้ดที่เสิร์ฟผู้ใช้ (46/46 เป็นสตริงตรงทั้งหมด)
   **ฐานเป็นศูนย์ = จังหวะที่ถูกที่สุด** ไม่ต้องไล่เก็บของเก่าก่อน และไม่ต้องรอ helper ของ `D81`

🔴 ทำไมยึด *ผู้รับ* ไม่ใช่แค่ `.from(`:
   `.from(` เปล่า ๆ ชนกับของที่ถูกต้อง **23 จุด** — `Array.from` (12) · `Buffer.from` (2)
   · `supabase.storage.from(BUCKET)` (9) · ถ้าแบนหมดจะแดงใส่โค้ดที่ไม่ผิดตั้งแต่วันแรก
   แล้วมันจะถูกปิดถาวรภายในวันเดียว (`P-35`) — **ด่านที่ฟ้องผิดครั้งเดียว จ่ายราคาที่ด่านอื่นทั้งหมดในไฟล์เดียวกัน**

⚠️ ไฟล์ที่ได้รับอนุญาตอยู่ใน `.github/dynamic-from-allowed` — **helper ของ `D81` อยู่ในนั้น**
   ฉบับแรกผมไม่ทำไฟล์นี้ โดยให้เหตุผลว่า "helper ก็เขียนชื่อตรง จึงไม่ต้องยกเว้น"
   🔴 **ผิด** — helper รับ union `EngineTable` แล้วส่งต่อ ซึ่งคือทั้งหมดของสิ่งที่ทำให้มันเป็น helper
   **ด่านนี้เป็นคนสอนผมเอง** ตอนรันครั้งแรกแล้วไปเจอไฟล์ที่ P1 เพิ่งเขียน
"""
import re
import sys

# `.from(` พร้อมตัวที่อยู่ข้างหน้าบนบรรทัดเดียวกัน — ใช้แยกว่าใครเป็นผู้รับ
CALL = re.compile(r"([A-Za-z0-9_$.\]\)]*)\.from\(\s*")
# ผู้รับที่ไม่ใช่ตาราง: JS builtin กับ Storage API
BUILTIN = re.compile(r"(^|[^A-Za-z0-9_$])(Array|Buffer|Object)$")


def scan(path: str) -> list:
    try:
        src = open(path, encoding="utf-8").read()
    except OSError:
        return []
    lines = src.split("\n")
    hits = []
    for line_no, line in enumerate(lines, 1):
        # ตัดคอมเมนต์บรรทัดเดียวออกก่อน — ไฟล์จริงมีคอมเมนต์ที่เขียน `supabase.from(...)`
        # เป็นตัวอย่างประกอบ (lib/writeGuard.ts:8) ถ้าไม่ตัดจะแดงใส่คำอธิบาย
        code = re.sub(r"//.*$", "", line)
        code = re.sub(r"^\s*\*.*$", "", code)
        for m in CALL.finditer(code):
            recv = m.group(1)
            if BUILTIN.search(recv):
                continue
            if ".storage" in recv:
                continue
            if not recv:
                # 🔴 เชนหลายบรรทัด: `supabase.storage\n  .from(BUCKET)`
                #    ผู้รับอยู่บรรทัดก่อนหน้า — ฉบับแรกดูแค่บรรทัดเดียวจึงฟ้อง Storage ผิด 2 จุด
                #    (เจอตอนรันจริงครั้งแรก ไม่ใช่ตอนอ่านโค้ดซ้ำ)
                back = " ".join(lines[max(0, line_no - 4):line_no - 1])
                if ".storage" in back:
                    continue
            rest = code[m.end():]
            lit = re.match(r'["\'`]([a-z0-9_]+)["\'`]', rest)
            if lit:
                hits.append((line_no, recv, "literal", lit.group(1)))
                continue
            if rest == "":
                continue          # อาร์กิวเมนต์ขึ้นบรรทัดใหม่ · ผู้รับไม่ใช่ตาราง ผ่านมาถึงนี่ไม่ได้
            hits.append((line_no, recv or "(ไม่มีผู้รับ)", "dynamic", rest[:40]))
    return hits


def protected_tables() -> set:
    """ตารางที่เรียกได้จากชั้น data-access เท่านั้น"""
    import os
    f = os.environ.get("HELPER_ONLY_TABLES") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "helper-only-tables")
    try:
        raw = open(f, encoding="utf-8").read()
    except OSError:
        return set()
    return {l.strip() for l in raw.splitlines()
            if l.strip() and not l.strip().startswith("#")}


def allowed_files() -> set:
    """ไฟล์ที่อนุญาตให้ใช้ชื่อตารางแบบไม่ใช่สตริงตรง (helper ของ D81)"""
    import os
    f = os.environ.get("DYNAMIC_FROM_ALLOWED") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "dynamic-from-allowed")
    try:
        raw = open(f, encoding="utf-8").read()
    except OSError:
        return set()
    return {l.strip() for l in raw.splitlines()
            if l.strip() and not l.strip().startswith("#")}


def main(paths) -> int:
    bad = 0
    allow = allowed_files()
    protected = protected_tables()
    for path in paths:
        norm = path.lstrip("./")
        is_helper = norm in allow
        for line_no, recv, kind, val in scan(path):
            if kind == "dynamic":
                if is_helper:
                    continue
                print(f"🔴 dynamic-from: {path}:{line_no} — `{recv}.from(` รับชื่อตารางที่ไม่ใช่สตริงตรง")
                print(f"   เจอ: {val.strip()}")
                bad += 1
            elif val in protected and not is_helper:
                print(f"🔴 helper-only: {path}:{line_no} — เรียก `{val}` ตรง ๆ นอกชั้น data-access")
                print(f"   → `{val}` ต้องพก predicate ของ D81 · เรียกผ่าน lib/engine/db.ts เท่านั้น")
                bad += 1
    if bad:
        print("   🔴 ชื่อตารางที่เป็นตัวแปร ทำให้ด่านอื่นที่อ่านชื่อตารางมองไม่เห็นจุดนี้ทั้งหมด")
        print("      เขียนชื่อตรง ๆ หรือคุยกับ P6/P1 ถ้าคิดว่าเคสนี้จำเป็นจริง")
        return 1
    print(f"✅ dynamic-from: ตรวจ {len(paths)} ไฟล์ · ชื่อตารางเป็นสตริงตรงทุกจุด"
          + (f" (ยกเว้น {len(allow)} ไฟล์ในรายการ)" if allow else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
