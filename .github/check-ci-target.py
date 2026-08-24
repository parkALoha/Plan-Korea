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
import os
import re
import sys
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ALLOWFILE = os.environ.get("ALLOWED_REF_FILE") or os.path.join(HERE, "allowed-project-ref")
REF_RE = re.compile(r"^[a-z]{20}$")


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _jwtref import ref_of as jwt_ref  # noqa: E402


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
    verified = 0

    # ── URL: บังคับ ตรวจได้เสมอ ────────────────────────────────────────────────
    # 🔴 ต้องเทียบ **host ที่ parse แล้ว** ห้ามใช้ substring เด็ดขาด
    #    ฉบับแรกของด่านนี้ (24 ส.ค. 2026) ใช้ `f"https://{allowed}.supabase.co" not in url`
    #    ซึ่ง **ผ่านทั้งสามเคสนี้** ตอนผมย้อนกลับมาทดสอบตัวเอง:
    #      · https://<ref-ทริป>.supabase.co#https://<ref-dev>.supabase.co   ← ปลายทางคือ DB ทริป!
    #      · https://evil.example.com/?u=https://<ref-dev>.supabase.co
    #      · https://<ref-dev>.supabase.co.attacker.test
    #    เคสแรกไม่ใช่การโจมตี — **copy-paste พลาดก็เกิดได้** และปลายทางคือฐานที่ห้ามแตะที่สุด
    #    🔴 อันตรายขึ้นอีกชั้นตั้งแต่ `00271d3` ให้ `delete on public.trips` กับ service_role
    #       = ด่านที่ปล่อยผ่านตรงนี้ ไม่ได้แปลว่า "รันเทสต์ผิดที่" แต่แปลว่า "**ลบแถวผิดฐาน**"
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    parsed = urlparse(url) if url else None
    host = (parsed.hostname or "").lower() if parsed else ""
    if not url:
        print("🔴 ci-target: ไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        bad += 1
    elif parsed.scheme != "https":
        print(f"🔴 ci-target: URL ไม่ใช่ https (scheme='{parsed.scheme}') — หยุดก่อนแตะ DB")
        bad += 1
    elif host != f"{allowed}.supabase.co":
        # ⛔ พิมพ์ได้แค่ host ห้ามพิมพ์ url เต็ม เผื่อมี query/credential ติดมา
        print(f"🔴 ci-target: host ของ URL ไม่ใช่ engine-dev · เจอ '{host or '(อ่านไม่ออก)'}'")
        print(f"   ต้องเป็น {allowed}.supabase.co เป๊ะ — หยุดก่อนแตะ DB")
        bad += 1
    else:
        print(f"✅ ci-target: URL ชี้ {allowed} (host ตรงเป๊ะ)")
        verified += 1

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
            verified += 1

    # 🔴 P1 ขอ 24 ส.ค. 2026: ตอนตรวจไม่ได้ ข้อความต้องอ่านออกว่า "ตรวจไม่ได้" ไม่ใช่ "ผ่าน"
    #    บรรทัดนี้ทำให้ผลเขียว **พกขอบเขตของตัวเองมาด้วย** — คนอ่านจะไม่นับ 2/3 เป็น 3/3
    print(f"📋 ci-target: ยืนยันได้ {verified}/3 ค่า (URL + anon + service_role)"
          + ("" if verified == 3 else " — ที่เหลือคือ 'ตรวจไม่ได้' ไม่ใช่ 'ผ่าน'"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
