#!/usr/bin/env python3
"""ด่านเทียบ — `.github/{no-policy-tables,cache-client-privileges}` ต้องพูดตรงกับ `assert_cache_lockdown()`

ใช้:  .github/check-cache-registry-drift.py <no-policy-tables> <cache-client-privileges> <migration.sql> [...]
คืน:  0 = สองฝั่งพูดตรงกัน · 1 = ดริฟต์ *หรือ* แจงชื่อตารางจาก SQL ไม่ออก

🔴 ที่มา (P1 · P6 · 3 ก.ย. 2026) — `check-cache-lockdown.py` (ตรวจ migration ที่ *ยังไม่ apply*)
   กับ `app.assert_cache_lockdown()` (ตรวจ *ฐานจริงหลัง apply*) ตอบคนละคำถาม แต่ทั้งคู่ต้องรู้ว่า
   ตารางไหนอยู่กลุ่มไหน — **สองที่ที่ประกาศอิสระจากกัน ดริฟต์ได้โดยไม่มีอะไรฟ้อง**
   (`D87`→`Q3` เปลี่ยนภายในวันเดียวแล้ว — ไม่ใช่สถานการณ์สมมติ)

   ✅ **ทำไมไม่ parameterize ฟังก์ชันให้อ่านจากไฟล์แทน (ทางที่ปฏิเสธ):**
   ① ข้อ ④⑤ ของ `assert_cache_lockdown()` ไม่ใช่ privilege check ล้วน — ④ นับ policy รวม
      ⑤ เป็น data-integrity เรื่องรูปคีย์ ไม่เกี่ยวกับ privilege เลย → parameterize บังคับผ่าฟังก์ชัน
      ออกเป็นส่วนที่ derive ได้กับที่ derive ไม่ได้ เสี่ยงเกินสัดส่วนของปัญหา
   ② **สองฝั่งต้องประกาศอิสระจากกันถึงจะเทียบแล้วมีความหมาย** — ถ้าฝั่งหนึ่งอ่านค่าจากอีกฝั่ง
      วันที่ฝั่งต้นทางผิด อีกฝั่งจะเชื่อตามแล้วผ่าน ไม่ใช่ตรวจ
   → ด่านนี้จึง **ไม่ประกาศค่าใหม่เอง** อ่านสองฝั่งที่มีอยู่แล้วมาเทียบ set-equality เท่านั้น
     ไม่ใช่ทะเบียนที่สาม

   🔴 **ข้อที่ P1 ขอเพิ่ม — จักรวาลต้องไม่ว่างก่อนเทียบ:** แจงได้ 0 (หรือน้อยผิดปกติ) มีสองความหมาย
   ที่แยกกันไม่ออกจาก set-equality เฉยๆ:
     ① ฟังก์ชันไม่มีตารางพวกนั้นแล้วจริง — ดริฟต์จริง ควรแดง
     ② regex อ่านไม่ออก (มีคนย้ายเป็น CTE/ตัวแปรชื่ออื่น/ขึ้นบรรทัดใหม่) — **ตัวแจงตาบอด ไม่ใช่ดริฟต์**
   ถ้าไม่แยก ด่านจะแดงใส่คน refactor ฟังก์ชันอย่างถูกต้อง แล้วถูกลบทั้งใบ (ตระกูลเดียวกับ `grep`
   แคบที่รูป ที่กัดทีมนี้ 4 ครั้งในวันเดียว) — จึงมีข้อความคนละแบบสำหรับสองกรณีนี้โดยเฉพาะ

⚠️ ขอบเขต: parse ด้วย regex ตามสไตล์ `check-cache-lockdown.py` — เจาะจงหาบรรทัด
   `locked text[] := array[...]` / `readable text[] := array[...]` ใน `app.assert_cache_lockdown()`
   (ปัจจุบันคือ migration `20260903180000_q3_lockdown_single_table_list.sql`) ถ้ามีคนเปลี่ยนรูป
   ประกาศ (เช่น multi-line, เปลี่ยนชื่อตัวแปร) regex นี้จะแจงไม่ออก — อ่านข้อความ error ก่อนเชื่อว่าดริฟต์จริง
"""
import re
import sys
from typing import Optional

LOCKED_RE = re.compile(r"\blocked\s+text\[\]\s*:=\s*array\[([^\]]*)\]")
READABLE_RE = re.compile(r"\breadable\s+text\[\]\s*:=\s*array\[([^\]]*)\]")


def read_tables(path: str) -> set:
    raw = open(path, encoding="utf-8").read()
    out = set()
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        table, _, _ = line.partition(":")  # cache-client-privileges มี "table:priv" · no-policy-tables ไม่มี ":"
        out.add(table.strip())
    return out


def extract_array(text: str, pattern: re.Pattern) -> Optional[set]:
    """คืนเซตชื่อตารางจากบรรทัดล่าสุดที่ match (migration หลังๆ `create or replace` ทับของเก่า) · `None` = แจงไม่ออก"""
    matches = pattern.findall(text)
    if not matches:
        return None
    last = matches[-1]
    return {t.strip().strip("'\"") for t in last.split(",") if t.strip()}


def main(argv) -> int:
    if len(argv) < 3:
        print("ใช้: check-cache-registry-drift.py <no-policy-tables> <cache-client-privileges> <migration...>")
        return 1
    locked_file, priv_file, paths = argv[0], argv[1], argv[2:]

    try:
        file_locked = read_tables(locked_file)
    except OSError:
        print(f"🔴 cache-registry-drift: เปิด {locked_file} ไม่ได้ — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1
    try:
        file_readable = read_tables(priv_file)
    except OSError:
        print(f"🔴 cache-registry-drift: เปิด {priv_file} ไม่ได้ — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1
    if not file_locked and not file_readable:
        print(f"🔴 cache-registry-drift: {locked_file} และ {priv_file} ไม่มีชื่อตารางเลย — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1

    corpus = ""
    for path in paths:
        try:
            corpus += "\n" + open(path, encoding="utf-8").read()
        except OSError:
            continue

    # 🔴 ถ้าไม่มี migration ไหนแตะฟังก์ชันนี้เลย ด่านนี้ไม่มีอะไรให้เทียบ — ไม่ใช่ "แจงไม่ออก"
    #    ไม่งั้นทรีจำลอง/migration ที่ไม่เกี่ยวกับแคชเลยจะแดงใส่ด่านนี้ทุกครั้งโดยไม่มีเหตุผล
    if "assert_cache_lockdown" not in corpus:
        print("✅ cache-registry-drift: ไม่มี migration ไหนแตะ assert_cache_lockdown() — ข้าม (ไม่มีอะไรให้เทียบ)")
        return 0

    sql_locked = extract_array(corpus, LOCKED_RE)
    sql_readable = extract_array(corpus, READABLE_RE)

    # 🔴 จักรวาลต้องไม่ว่างก่อนเทียบ — แยก "แจงไม่ออก" ออกจาก "ดริฟต์จริง" ตามที่ P1 ขอ
    if sql_locked is None or sql_readable is None:
        missing = []
        if sql_locked is None:
            missing.append("locked")
        if sql_readable is None:
            missing.append("readable")
        print(f"🔴 cache-registry-drift: แจงชื่อตารางจาก assert_cache_lockdown() ไม่ออก ({', '.join(missing)})")
        print("   → นี่คือ **ตัวแจงล้า ไม่ใช่ไฟล์ดริฟต์** — มีคนย้าย declaration เป็นรูปอื่น (CTE/multi-line/เปลี่ยนชื่อตัวแปร)")
        print(f"   แก้ regex ใน {__file__} ให้ตรงกับรูปใหม่ก่อน อย่าเชื่อว่าตารางหายไปจริง")
        return 1
    if not sql_locked or not sql_readable:
        print("🔴 cache-registry-drift: แจงได้แต่ได้เซตว่าง (locked หรือ readable) — ผิดปกติ ไม่ใช่สภาพที่ตั้งใจ")
        return 1

    bad = False
    if sql_locked != file_locked:
        print(f"🔴 cache-registry-drift: locked ไม่ตรงกัน")
        print(f"   assert_cache_lockdown(): {sorted(sql_locked)}")
        print(f"   {locked_file}: {sorted(file_locked)}")
        print(f"   ต่างกัน: {sorted(sql_locked ^ file_locked)}")
        bad = True
    if sql_readable != file_readable:
        print(f"🔴 cache-registry-drift: readable ไม่ตรงกัน")
        print(f"   assert_cache_lockdown(): {sorted(sql_readable)}")
        print(f"   {priv_file}: {sorted(file_readable)}")
        print(f"   ต่างกัน: {sorted(sql_readable ^ file_readable)}")
        bad = True

    if bad:
        return 1
    print(f"✅ cache-registry-drift: locked ({len(sql_locked)}) + readable ({len(sql_readable)}) "
          "ตรงกันระหว่างไฟล์กับ assert_cache_lockdown()")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
