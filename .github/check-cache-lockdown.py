#!/usr/bin/env python3
"""ด่าน — ตารางในรายการต้องไม่มี policy และไม่มี grant ให้ anon/authenticated (P-33)

ใช้:  .github/check-cache-lockdown.py <ไฟล์รายชื่อตาราง> <migration.sql> [...]
คืน:  0 = ไม่มีใครเปิดกลับ · 1 = เจอ statement ที่เปิดรูกลับ

🔴 ที่มา: P1 เขียนคอมเมนต์ไว้ในไฟล์ migration ว่า
   *"ไม่มี `create policy` ในไฟล์นี้เลยสักบรรทัด และนั่นคือของที่ต้องตรวจว่ายังจริง"*
   **แต่คอมเมนต์ไม่ใช่ด่าน** — ไฟล์นี้คือการทำให้ประโยคนั้นมีคนบังคับ

╔══════════════════════════════════════════════════════════════════════════╗
║ ⚠️ **ขอบเขต: นี่คือครึ่งฝั่งไฟล์ ไม่ใช่ทั้งเรื่อง**                          ║
║   เห็น: migration ที่ *ยังไม่ถูก apply* ก็จับได้ · ไม่ต้องมี creds          ║
║   🔴 **มองไม่เห็น:** สิทธิ์ที่มาจากทางอื่น — `alter default privileges` ·    ║
║      role ที่ `anon` สืบทอดมา · `security definer` ที่เขียนแทนให้            ║
║      **สภาพจริงของฐานต้องวัดที่ฐาน** (ชุด `rlsMatrix` · โซน P1/P7)          ║
║   🎯 สองครึ่งนี้ปิดคนละด้าน: ฝั่งไฟล์เห็นของที่ยังไม่ apply ·                 ║
║      ฝั่งฐานเห็นผลสะสมจริง · **ไม่มีตัวไหนพอลำพัง**                        ║
╚══════════════════════════════════════════════════════════════════════════╝
"""
import re
import sys

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"--[^\n]*")
WS = re.compile(r"\s+")
BAD_GRANTEES = ("anon", "authenticated", "public")


def statements(sql: str):
    """คืน statement ที่ **ตัดคอมเมนต์ออกแล้ว**

    🔴 ต้องตัดคอมเมนต์ก่อนเสมอ — ไฟล์จริงมีบรรทัดอธิบายที่เขียนคำว่า
       `create policy` และ `grant execute to authenticated` อยู่ในคอมเมนต์
       ถ้าไม่ตัด ด่านจะแดงใส่ไฟล์ที่ถูกต้องตั้งแต่วันแรก แล้วถูกปิดถาวร (P-35)
    """
    sql = BLOCK_COMMENT.sub(" ", sql)
    sql = LINE_COMMENT.sub(" ", sql)
    for raw in sql.split(";"):
        s = WS.sub(" ", raw).strip().lower()
        if s:
            yield s


def main(argv) -> int:
    if len(argv) < 2:
        print("ใช้: check-cache-lockdown.py <ไฟล์รายชื่อ> <migration...>")
        return 1
    listfile, paths = argv[0], argv[1:]
    try:
        raw = open(listfile, encoding="utf-8").read()
    except OSError:
        print(f"🔴 cache-lockdown: เปิด {listfile} ไม่ได้ — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1
    tables = [l.strip() for l in raw.splitlines()
              if l.strip() and not l.strip().startswith("#")]
    if not tables:
        print(f"🔴 cache-lockdown: {listfile} ไม่มีชื่อตารางเลย — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1

    bad = 0
    for path in paths:
        try:
            body = open(path, encoding="utf-8").read()
        except OSError:
            continue
        for st in statements(body):
            hit = next((t for t in tables if t in st), None)
            if not hit:
                continue
            # ── create/alter policy บนตารางที่คุ้มครอง ────────────────────────
            if st.startswith("create policy") or st.startswith("alter policy"):
                print(f"🔴 cache-lockdown: {path} สร้าง/แก้ policy บน `{hit}`")
                print(f"   → ตารางนี้ต้องมี **ศูนย์ policy** (P-33) · ถ้าตั้งใจจริงต้องถอดชื่อออกจาก {listfile} และให้ P1 อนุมัติ")
                bad += 1
            # ── grant ให้ anon/authenticated/public (revoke ไม่นับ) ───────────
            elif st.startswith("grant"):
                grantee = st.split(" to ", 1)[1] if " to " in st else ""
                if any(re.search(rf"\b{g}\b", grantee) for g in BAD_GRANTEES):
                    print(f"🔴 cache-lockdown: {path} grant สิทธิ์บน `{hit}` ให้ฝั่ง client")
                    print(f"   → เปิดรูที่ `P-33` ปิดไว้ · ผู้รับ: {grantee[:60]}")
                    bad += 1
            # ── ปิด RLS = ถอดชั้นรองออก ───────────────────────────────────────
            elif "disable row level security" in st:
                print(f"🔴 cache-lockdown: {path} ปิด RLS บน `{hit}`")
                print("   → `revoke` ต้องมาคู่กับ RLS ไม่ใช่แทนกัน")
                bad += 1
    if bad:
        return 1
    print(f"✅ cache-lockdown: {len(tables)} ตารางยังไม่มี policy และไม่มี grant ให้ฝั่ง client")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
