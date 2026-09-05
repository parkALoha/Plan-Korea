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

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _tsscan import strip_comments  # noqa: E402

CALL = re.compile(r"\.from\s*\(")
# ผู้รับที่ไม่ใช่ตาราง: JS builtin กับ Storage API
BUILTIN = re.compile(r"(^|[^A-Za-z0-9_$])(Array|Buffer|Object)$")
RECV = re.compile(r"([A-Za-z0-9_$\.\]\)]+)\s*$", re.S)
LITERAL = re.compile(r"[\"\'`]([a-z0-9_]+)[\"\'`]")


# 🔴 `strip_comments` เคยอยู่ในไฟล์นี้ · ย้ายไป `_tsscan.py` เมื่อ 27 ส.ค. 2026
#    เพราะ `check-api-hosts.py` ต้องใช้ตัวเดียวกัน — **ตัวตัดคอมเมนต์ 2 ชุดที่ต่างกันนิดเดียว
#    ทำให้ด่าน 2 ตัวมองไฟล์เดียวกันคนละแบบ และช่องจะอยู่ตรงตัวที่หลวมกว่า** (`D46`)


def scan(path: str) -> list:
    """🔴 **อ่านไฟล์ไม่ได้ ≠ ไฟล์สะอาด** (P6 · 27 ส.ค. 2026)

    ฉบับเดิม `except OSError: return []` → ไฟล์ที่ไม่มีอยู่จริง หรือพาธที่เป็นไดเรกทอรี
    (`IsADirectoryError` **เป็นลูกของ `OSError`**) ให้ผลเหมือนไฟล์ที่ตรวจแล้วไม่เจออะไร
    → `check-dynamic-from.py .` พิมพ์ `✅ ตรวจ 1 ไฟล์` แล้ว **exit 0**

    🎯 `guards.sh` ประกอบรายชื่อไฟล์เองด้วย `while read` — วันที่รายชื่อนั้นเพี้ยน
       (เปลี่ยนโครงโฟลเดอร์ · พาธมีช่องว่าง · ย้ายไฟล์) **ด่านจะเขียวโดยไม่ได้อ่านอะไรเลย**
       และเขียวหลอกอันตรายกว่าแดงหลอก เพราะแดงหลอกยังมีคนไปดู
    """
    try:
        src = open(path, encoding="utf-8").read()
    except OSError as e:
        raise SystemExit(f"🔴 dynamic-from: อ่าน {path} ไม่ได้ — {e.__class__.__name__}\n"
                         f"   ด่านนี้ไม่ถือว่า 'อ่านไม่ได้' เท่ากับ 'สะอาด' · หยุดทั้งด่าน")
    code = strip_comments(src)
    hits = []
    for m in CALL.finditer(code):
        before = code[max(0, m.start() - 200):m.start()]
        rm = RECV.search(before)
        recv = rm.group(1).rstrip(".") if rm else ""
        if BUILTIN.search(recv) or ".storage" in recv or recv.endswith("storage"):
            continue
        # 🔴 อาร์กิวเมนต์อาจขึ้นบรรทัดใหม่ (prettier ตัดเองเมื่อคอลัมน์ยาว)
        #    ฉบับแรก `continue` ทิ้งเมื่อท้ายบรรทัดว่าง พร้อมคอมเมนต์ที่อ้างว่า
        #    "ผู้รับไม่ใช่ตาราง ผ่านมาถึงนี่ไม่ได้" — **ข้ออ้างนั้นไม่จริง** และคอมเมนต์
        #    คือสิ่งที่ทำให้มันรอดรีวิว เพราะคนอ่านไม่ต้องตรวจสมมติฐานเอง
        rest = code[m.end():m.end() + 200].lstrip()
        line_no = code.count("\n", 0, m.start()) + 1
        lit = LITERAL.match(rest)
        if lit:
            hits.append((line_no, recv, "literal", lit.group(1)))
        else:
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


def normalize(path: str) -> str:
    """เทียบพาธกับ allowlist โดยไม่สนว่าผู้เรียกส่ง path มาแบบ *สัมพัทธ์* หรือ *เต็ม*

    🔴 ฉบับแรก `path.lstrip("./")` ใช้ได้เฉพาะตอน `guards.sh` เรียกด้วย `ROOT="."`
       (`find "./lib" ...` ได้ `./lib/engine/db.ts` → lstrip เหลือ `lib/engine/db.ts` พอดี)
       **แต่ `lstrip` ไม่ใช่ "ตัด prefix" — มันตัด *ตัวอักษร* `.`/`/` ทีละตัวจากหน้าสตริง**
       พอ `ROOT` เป็นพาธเต็ม (`find "/abs/path/lib" ...`) จะได้ `/abs/path/lib/engine/db.ts`
       lstrip ตัดได้แค่ `/` ตัวแรก เหลือ `Users/park/.../lib/engine/db.ts` ซึ่ง**ไม่ตรงกับ allowlist
       ไม่มีวันเลย** → ไฟล์ที่ยกเว้นไว้ถูกฟ้องเป็นของใหม่ (P6 เจอเอง 6 ก.ย. 2026 หลังยิงด้วย ROOT เต็ม
       ตามธรรมเนียม "อ้าง path เต็มเสมอ" ของทีม — ตรงกับที่ `§3.3` ใช้ตอนตรวจในทรีที่ปักหมุดด้วย)
    ✅ คำนวณ *สัมพัทธ์กับ ROOT จริง* แทน — ใช้ได้ทั้งสองแบบ เพราะ resolve เป็น absolute ก่อนเทียบเสมอ
       `guards.sh` ส่ง ROOT มาทาง env `DYNAMIC_FROM_ROOT` · ไม่ตั้งไว้ = คาดเป็น "." (พฤติกรรมเดิม)
    """
    import os
    root = os.environ.get("DYNAMIC_FROM_ROOT", ".")
    return os.path.relpath(os.path.abspath(path), os.path.abspath(root))


def main(paths) -> int:
    bad = 0
    allow = allowed_files()
    protected = protected_tables()
    for path in paths:
        norm = normalize(path)
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
