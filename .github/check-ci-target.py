#!/usr/bin/env python3
"""ด่านฝั่ง CI — ยืนยันว่า credential ใน env ชี้ไปที่ engine-dev ก่อนจะแตะ DB

ที่มา: P1 ถาม 24 ส.ค. 2026 ว่า CI มีจุดไหนยิงใส่ Supabase ได้โดยไม่ผ่านสายตาคนไหม
คำตอบ: **ไม่มี `db push` ใน CI เลย** — แต่ job `rls` รัน vitest ที่ต่อ DB จริง
        ด้วย `DEV_SUPABASE_URL` + anon + service_role **โดยไม่มีอะไรตรวจว่าเป็นโปรเจกต์ไหน**
        ถ้าวันหนึ่ง secret ถูกตั้งผิดใบ CI จะรันเมทริกซ์ RLS ใส่ DB นั้น **อัตโนมัติ ไม่มีคนดู**

🔴 ด่านใน SQL (`do $guard$` ที่หา `trip_meta`) ช่วยตรงนี้ไม่ได้เลย — มันกันแค่ตอน migration
   ไม่ได้กัน vitest ที่ยิง REST เข้าไปตรงๆ · และมันเป็น denylist ที่รู้จักแค่ DB ทริป (D48)

ใช้:  .github/check-ci-target.py
อ่าน: NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY
คืน:  0 = ทุกค่าชี้ engine-dev · 1 = มีค่าที่ไม่ตรง หรือตรวจไม่ได้ในส่วนที่บังคับ

⛔ ห้ามพิมพ์เนื้อคีย์ออกมาไม่ว่ากรณีใด — พิมพ์ได้แค่ project ref ซึ่งเป็นค่าสาธารณะ
"""
import base64
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ALLOWFILE = os.environ.get("ALLOWED_REF_FILE") or os.path.join(HERE, "allowed-project-ref")
REF_RE = re.compile(r"^[a-z]{20}$")


def jwt_ref(token: str):
    """ดึง claim `ref` ออกจาก payload ของ JWT

    🔴 **ไม่ได้ verify ลายเซ็น และไม่ตั้งใจจะ verify** — นี่คือด่านกัน "ตั้งผิดใบ"
       ไม่ใช่ด่านกัน "คนปลอมคีย์" · คีย์ปลอมที่ประกอบ payload เองจะผ่านด่านนี้
       ซึ่งรับได้ เพราะภัยที่กันอยู่คืออุบัติเหตุ ไม่ใช่การโจมตี
    คืน None ถ้าไม่ใช่ JWT (คีย์รูปแบบใหม่ `sb_secret_…` ไม่ได้พก ref มาด้วย)
    """
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        pad = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(pad)).get("ref")
    except Exception:
        return None


def main() -> int:
    if not os.path.isfile(ALLOWFILE):
        print(f"🔴 ci-target: ไม่มีไฟล์ allowlist ({ALLOWFILE}) — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1
    with open(ALLOWFILE, encoding="utf-8") as fh:
        allowed = fh.read().strip()
    if not REF_RE.match(allowed):
        print(f"🔴 ci-target: allowlist ไม่ใช่รูปแบบ project ref — ได้ '{allowed}'")
        return 1

    bad = 0

    # ── URL: บังคับ ตรวจได้เสมอ ────────────────────────────────────────────────
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    if not url:
        print("🔴 ci-target: ไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        bad += 1
    elif f"https://{allowed}.supabase.co" not in url:
        # ⛔ ไม่พิมพ์ url เต็ม เผื่อมีอะไรติดมา — พิมพ์แค่ ref ที่ดึงได้
        got = re.search(r"https://([a-z]{20})\.supabase\.co", url)
        print(f"🔴 ci-target: URL ไม่ได้ชี้ engine-dev · เจอ ref = {got.group(1) if got else '(อ่านไม่ออก)'}")
        print(f"   ต้องเป็น {allowed} เท่านั้น — หยุดก่อนแตะ DB")
        bad += 1
    else:
        print(f"✅ ci-target: URL ชี้ {allowed}")

    # ── คีย์: ตรวจ claim `ref` ใน JWT · best-effort ────────────────────────────
    for name in ("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        val = os.environ.get(name, "").strip()
        if not val:
            print(f"🔴 ci-target: ไม่ได้ตั้ง {name} — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
            bad += 1
            continue
        ref = jwt_ref(val)
        if ref is None:
            # คีย์รูปแบบใหม่ไม่พก ref · บอกตรงๆ ว่าตรวจไม่ได้ ไม่แกล้งว่าผ่าน
            print(f"⚠️ ci-target: {name} ไม่ใช่ JWT จึงไม่มี ref ให้ตรวจ — "
                  f"ด่านนี้ยืนยันคีย์ตัวนี้ไม่ได้ (URL ยังถูกตรวจอยู่)")
        elif ref != allowed:
            print(f"🔴 ci-target: {name} เป็นคีย์ของโปรเจกต์ {ref} ไม่ใช่ {allowed}")
            print("   🔴 คีย์ผิดใบ = ยิงใส่โปรเจกต์อื่นโดย URL ดูถูกต้อง — หยุด")
            bad += 1
        else:
            print(f"✅ ci-target: {name} เป็นคีย์ของ {allowed}")

    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
