#!/usr/bin/env python3
"""ด่าน — ตารางแคชต้องอยู่ในระดับสิทธิ์ที่ประกาศไว้ ไม่มากไปไม่น้อยไป (P-33 · `Q3`)

ใช้:  .github/check-cache-lockdown.py <locked-list> <client-privileges-list> <migration.sql> [...]
คืน:  0 = ไม่มีใครเปิดสิทธิ์เกินที่ประกาศ · 1 = เจอ statement ที่เปิดเกิน

🔴 ที่มา: P1 เขียนคอมเมนต์ไว้ในไฟล์ migration ว่า
   *"ไม่มี `create policy` ในไฟล์นี้เลยสักบรรทัด และนั่นคือของที่ต้องตรวจว่ายังจริง"*
   **แต่คอมเมนต์ไม่ใช่ด่าน** — ไฟล์นี้คือการทำให้ประโยคนั้นมีคนบังคับ

🔴 แก้ 3 ก.ย. 2026 (P6) — เดิม (2 ก.ย. · `D87` ③) มีระดับที่สองแบบตายตัว ("insert-only":
   select+insert เท่านั้นผ่านได้) แต่ `Q3` ทับ `D87` ภายในวันเดียว (select อย่างเดียว 2 ตาราง
   ไม่มี insert เลย) → **ถ้ายังฮาร์ดโค้ด privilege ไว้ในโค้ด ด่านจะแดงใส่มติใหม่ที่ถูกต้อง**
   ตอนนี้ privilege ที่อนุญาตมาจาก `.github/cache-client-privileges` (รูป `table:priv1,priv2`)
   ไม่ใช่ค่าคงที่ในโค้ด — ครั้งหน้าที่มติเปลี่ยนอีก แก้แค่ไฟล์รายชื่อ ไม่ต้องแตะ logic
   · **locked** — ยังเหมือนเดิมทุกตัวอักษร: ศูนย์ policy · ศูนย์ grant ให้ client · RLS ต้องเปิด
   · **client-privileges** — เฉพาะ privilege ที่ระบุต่อตารางเท่านั้นผ่านได้ ให้ `authenticated`
     เท่านั้น · `update`/`delete`/`anon`/`public`/ปิด RLS ยังห้ามเสมอไม่ว่าจะระบุ privilege อะไร

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

FOR_CMD = re.compile(r"\bfor\s+(select|insert|update|delete|all)\b")
TO_ROLES = re.compile(r"\bto\s+([a-z0-9_,\s]+?)(?:\s+using\b|\s+with\b|$)")


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


def read_tables(path: str) -> list:
    raw = open(path, encoding="utf-8").read()
    return [l.strip() for l in raw.splitlines()
            if l.strip() and not l.strip().startswith("#")]


def read_privileges(path: str) -> dict:
    """อ่าน `.github/cache-client-privileges` — รูป `table:priv1,priv2` ต่อบรรทัด"""
    out = {}
    for line in read_tables(path):
        table, _, privs = line.partition(":")
        table = table.strip()
        priv_set = {p.strip() for p in privs.split(",") if p.strip()}
        out[table] = priv_set
    return out


def policy_roles(st: str) -> set:
    """คืนเซตของ role ที่ policy นี้ใช้กับ — **ไม่ระบุ `to` = default `public`** (นิยามของ Postgres)"""
    m = TO_ROLES.search(st)
    if not m:
        return {"public"}
    return {r.strip() for r in m.group(1).split(",") if r.strip()}


def policy_cmd(st: str) -> str:
    """คืนคำสั่งของ policy — **ไม่ระบุ `for` = default `all`** (นิยามของ Postgres)"""
    m = FOR_CMD.search(st)
    return m.group(1) if m else "all"


def grant_parts(st: str):
    """คืน (privs:set, grantee:str) จาก statement `grant ... on ... to ...`"""
    body = st[len("grant"):]
    on_idx = body.find(" on ")
    privs_part = body[:on_idx] if on_idx != -1 else body
    privs = {p.strip() for p in privs_part.split(",") if p.strip()}
    grantee = body.split(" to ", 1)[1] if " to " in body else ""
    return privs, grantee


def check_locked(st: str, hit: str, path: str) -> int:
    if st.startswith("create policy") or st.startswith("alter policy"):
        print(f"🔴 cache-lockdown: {path} สร้าง/แก้ policy บน `{hit}` (locked)")
        print("   → ตารางนี้ต้องมี **ศูนย์ policy** (P-33) · ถ้าตั้งใจจริงต้องย้ายไป cache-client-privileges และให้ P1 อนุมัติ")
        return 1
    if st.startswith("grant"):
        _, grantee = grant_parts(st)
        if any(re.search(rf"\b{g}\b", grantee) for g in BAD_GRANTEES):
            print(f"🔴 cache-lockdown: {path} grant สิทธิ์บน `{hit}` (locked) ให้ฝั่ง client")
            print(f"   → เปิดรูที่ `P-33` ปิดไว้ · ผู้รับ: {grantee[:60]}")
            return 1
        return 0
    if "disable row level security" in st:
        print(f"🔴 cache-lockdown: {path} ปิด RLS บน `{hit}` (locked)")
        print("   → `revoke` ต้องมาคู่กับ RLS ไม่ใช่แทนกัน")
        return 1
    return 0


def check_scoped(st: str, hit: str, allowed: set, path: str) -> int:
    if st.startswith("create policy") or st.startswith("alter policy"):
        cmd = policy_cmd(st)
        roles = policy_roles(st)
        if cmd == "all" or cmd not in allowed:
            print(f"🔴 cache-lockdown: {path} policy บน `{hit}` ครอบคลุม `{cmd}` — อนุญาตแค่ {sorted(allowed)}")
            print("   → แก้ `.github/cache-client-privileges` ก่อนถ้าตั้งใจขยายจริง (ต้อง P1 อนุมัติ)")
            return 1
        if roles - {"authenticated"}:
            print(f"🔴 cache-lockdown: {path} policy บน `{hit}` ให้ role {sorted(roles)}")
            print("   → ต้องระบุ `to authenticated` เท่านั้น · ไม่ระบุ `to` = default public = รั่วให้ anon")
            return 1
        return 0
    if st.startswith("grant"):
        privs, grantee = grant_parts(st)
        client_roles = set(re.findall(r"\b(anon|authenticated|public)\b", grantee))
        if not client_roles:
            # 🔴 ไม่มี role ฝั่ง client เลย (เช่น service_role ล้วน) — ข้อยกเว้นที่ 2/5 (TEAM.md)
            #    ยังคุมสิทธิ์ service_role ไม่ได้ที่นี่ — service_role มี BYPASSRLS อยู่แล้วโดยนิยาม
            return 0
        if client_roles - {"authenticated"}:
            print(f"🔴 cache-lockdown: {path} grant บน `{hit}` ให้ {grantee[:60]}")
            print("   → อนุญาตแค่ `authenticated` ไม่ให้ `anon`/`public`")
            return 1
        if privs - allowed:
            print(f"🔴 cache-lockdown: {path} grant `{sorted(privs)}` บน `{hit}` — อนุญาตแค่ {sorted(allowed)}")
            print(f"   → ผู้รับ: {grantee[:60]} · แก้ `.github/cache-client-privileges` ก่อนถ้าตั้งใจขยายจริง")
            return 1
        return 0
    if "disable row level security" in st:
        print(f"🔴 cache-lockdown: {path} ปิด RLS บน `{hit}`")
        print("   → RLS ต้องเปิดเสมอ ไม่ว่าจะอยู่ระดับไหน")
        return 1
    return 0


def main(argv) -> int:
    if len(argv) < 3:
        print("ใช้: check-cache-lockdown.py <locked-list> <client-privileges-list> <migration...>")
        return 1
    locked_file, priv_file, paths = argv[0], argv[1], argv[2:]

    try:
        locked = read_tables(locked_file)
    except OSError:
        print(f"🔴 cache-lockdown: เปิด {locked_file} ไม่ได้ — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1
    try:
        privileges = read_privileges(priv_file)
    except OSError:
        print(f"🔴 cache-lockdown: เปิด {priv_file} ไม่ได้ — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1
    if not locked and not privileges:
        print(f"🔴 cache-lockdown: {locked_file} และ {priv_file} ไม่มีชื่อตารางเลย — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1
    for table, privs in privileges.items():
        if not privs:
            print(f"🔴 cache-lockdown: {priv_file} — `{table}` ไม่มี privilege ระบุหลัง `:` — รูปแบบต้องเป็น table:priv1,priv2")
            return 1
    overlap = set(locked) & set(privileges)
    if overlap:
        print(f"🔴 cache-lockdown: ตาราง {sorted(overlap)} อยู่ทั้งสองรายการพร้อมกัน — นิยามขัดกัน")
        return 1

    bad = 0
    for path in paths:
        try:
            body = open(path, encoding="utf-8").read()
        except OSError:
            continue
        for st in statements(body):
            hit_locked = next((t for t in locked if t in st), None)
            if hit_locked:
                bad += check_locked(st, hit_locked, path)
                continue
            hit_scoped = next((t for t in privileges if t in st), None)
            if hit_scoped:
                bad += check_scoped(st, hit_scoped, privileges[hit_scoped], path)

    if bad:
        return 1
    print(f"✅ cache-lockdown: {len(locked)} ตาราง locked + {len(privileges)} ตาราง client-scoped "
          "ยังอยู่ในสิทธิ์ที่ประกาศไว้")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
