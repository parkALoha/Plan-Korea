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
import urllib.error
import urllib.request
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ALLOWFILE = os.environ.get("ALLOWED_REF_FILE") or os.path.join(HERE, "allowed-project-ref")
REF_RE = re.compile(r"^[a-z]{20}$")


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _jwtref import ref_of as jwt_ref  # noqa: E402


PROBE_TIMEOUT = 10


def probe_key(url: str, key: str) -> str:
    """ถามว่า **คีย์ใบนี้ใช้กับโปรเจกต์ที่ `url` ชี้ได้จริงไหม** — ยิงจริง ไม่ใช่แกะ

    คืน `"ok"` · `"rejected"` · `"unreachable"`

    🎯 **ทางเดียวที่เหลือหลังคีย์เปลี่ยนรูปแบบ** — `sb_secret_`/`sb_publishable_`
       **ไม่พก `ref` ไว้ข้างใน** จึงไม่มีอะไรให้แกะ · แต่คีย์ยังผูกกับโปรเจกต์อยู่ดี
       ⇒ ถามปลายทางตรง ๆ ว่ามันรับคีย์ใบนี้ไหม

    🔴 **ตรรกะที่ทำให้มันตอบคำถามเดิมได้ — สองชั้นต่อกัน:**
    ```
    ① host ของ url ตรงกับ allowed ref   ← ตรวจไปแล้วข้างบน · ตรวจได้เสมอ ไม่ต้องมีเน็ต
    ② คีย์ผ่าน auth ที่ url นั้น         ← ตรงนี้
    ⇒ คีย์เป็นของโปรเจกต์ที่ ① พิสูจน์แล้วว่าเป็น engine-dev
    ```
    · ⚠️ **ต้องใช้ `url` ตัวเดียวกับที่ ① ตรวจ ไม่ใช่ประกอบขึ้นใหม่** ไม่งั้นข้อสรุปขาดตอน

    🔴 **`unreachable` ไม่ใช่ `rejected` โดยตั้งใจ** — เน็ตล่มไม่ใช่คีย์ผิดใบ
       ถ้าปนกัน ด่านจะแดงใส่คนที่ทำถูกในวันที่เน็ตกระตุก **แล้วมันจะถูกลบทั้งใบ**
       (`TEAM.md` — false-red ชนิดที่แดงใส่คนที่ทำถูก) · ออฟไลน์จึงถอยไป
       เท่ากับพฤติกรรมเดิมพอดี **ไม่แย่ลงกว่าก่อนมีข้อนี้**

    ⛔ **ห้ามพิมพ์อะไรจากตัวคีย์หรือจากข้อความ exception** — คืนแค่สถานะสามค่า
    """
    # 🔴 **ปลายทางเป็น `/auth/v1/health` โดยตั้งใจ — และฉบับแรกของผมใช้ `/rest/v1/` แล้วผิด**
    #    วัดจริงทั้งสี่ช่อง (3 ก.ย. 2026 · เป็นตารางที่ยิงมา ไม่ใช่ที่นึกเอา):
    #    ```
    #                        anon(publishable)          service(secret)
    #    /rest/v1/           401 "Secret API key required"   200      ← **แดงใส่คีย์ที่ถูกต้อง**
    #    /auth/v1/health     200                             200
    #    /auth/v1/health     401 "Invalid API key" เมื่อคีย์ถูกทำให้เสีย (ทั้งสองชนิด)
    #    ```
    # 🎯 **`/rest/v1/` ปฏิเสธ publishable key เพราะ *ชนิดคีย์* ไม่ใช่ *โปรเจกต์ผิด*
    #    — คนละคำถามกับที่ด่านนี้ถาม และผลลัพธ์อ่านเหมือนกันเป๊ะ**
    # 🔴 **จับได้เพราะยิง *ทิศบวก* ด้วยคีย์จริง** — ถ้ายิงแต่ทิศแดงจะเขียวสนิทแล้วปล่อยผ่าน
    #    (`TEAM.md` — ผลลบสองใบที่อ่านเหมือนกัน · ทิศบวกคือใบเดียวที่พิสูจน์ว่าเส้นทางเดินได้)
    #
    # ⚠️ **สิ่งที่ทิศแดงพิสูจน์จริง ๆ: ปลายทาง *ตรวจคีย์* (คีย์เสีย → 401)**
    #    ส่วน *"คีย์ของโปรเจกต์อื่นจะถูกปฏิเสธ"* เป็นการอนุมานจากข้อที่ว่าคีย์ผูกกับโปรเจกต์
    #    — **ยืนยันตรง ๆ ไม่ได้ เพราะต้องใช้คีย์ของอีกโปรเจกต์ ซึ่งเราไม่มีและไม่ควรมี**
    req = urllib.request.Request(
        url.rstrip("/") + "/auth/v1/health",
        headers={"apikey": key, "Authorization": "Bearer " + key},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=PROBE_TIMEOUT) as r:
            return "ok" if 200 <= r.status < 400 else "unreachable"
    except urllib.error.HTTPError as e:
        # 🔴 เฉพาะ 401/403 เท่านั้นที่แปลว่า "คีย์ใบนี้ไม่ใช่ของที่นี่"
        #    สถานะอื่น (404 · 5xx) แปลว่าปลายทางเปลี่ยนหรือล่ม = **ตรวจไม่ได้**
        return "rejected" if e.code in (401, 403) else "unreachable"
    except Exception:
        return "unreachable"


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
    url_ok = False   # 🔴 ประตูของการยิงโพรบ — ดูเหตุผลที่บล็อกคีย์ข้างล่าง

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
        url_ok = True

    # 🔴 **หยุดตรงนี้ถ้า host ยังไม่ผ่าน — และหยุดด้วย `return` ไม่ใช่ด้วยธง** (P4 เสนอ · P1 รับ)
    #
    # ฉบับก่อนหน้าใช้ธง `url_ok` แล้วเช็คมันตรงจุดที่จะยิง · **ถูกต้องทางพฤติกรรม**
    # 🎯 **แต่ P4 ชี้ว่ารูปนั้นยังพลาดได้: คนที่เพิ่มโพรบตัวถัดไปต้องจำว่ามีธงอยู่**
    #    ขณะที่ `return` ทำให้ *ไม่มีโค้ดใดต่อจากนี้ได้รันเลย* เมื่อปลายทางยังพิสูจน์ไม่ได้
    #    ⇒ **ผิดไม่ได้ ดีกว่าผิดแล้วจับได้** — รูปเดียวกับที่ทีมใช้กับ `push` จาก worktree
    #
    # ⚠️ **ราคาที่จ่าย และจ่ายอย่างรู้ตัว:** URL ผิดแล้วจะไม่รู้ว่าคีย์ตั้งครบหรือยัง
    #    → ต้องแก้สองรอบแทนรอบเดียว · **ยอมรับได้ เพราะรายงานเรื่องคีย์ไม่มีความหมาย
    #      เลยถ้าเรายังไม่รู้ว่ากำลังพูดถึงโปรเจกต์ไหน**
    #
    # 🔴 ที่มา: `0f87208` เพิ่มการยิงจริงเข้าไปในด่านนี้ **และการยิงจริงคือความสามารถใหม่
    #    ที่ด่านฝั่งอ่านไฟล์ไม่เคยมี** — ฉบับแรกของมันส่ง service_role key ไปยัง host
    #    ที่ยังไม่ผ่านการตรวจ (เกิดขึ้นจริงหนึ่งครั้งตอนยิงทิศแดง)
    #    🎯 ***การเพิ่มความสามารถให้ด่าน = เพิ่มสิ่งที่ด่านทำได้ตอนมันตัดสินผิด*** (P4)
    if not url_ok:
        print("🛑 ci-target: หยุดก่อนตรวจคีย์ — **ห้ามส่ง credential ไปยังปลายทางที่ยังพิสูจน์ไม่ได้**")
        return 1

    # ── คีย์: ตรวจ claim `ref` ใน JWT ก่อน (ออฟไลน์) · ถ้าไม่ใช่ JWT ค่อยยิงจริง ────
    for name in ("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        val = os.environ.get(name, "").strip()
        if not val:
            print(f"🔴 ci-target: ไม่ได้ตั้ง {name} — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
            bad += 1
            continue
        ref = jwt_ref(val)
        if ref is None:
            # 🔴 **แก้ 3 ก.ย. 2026 (P4 ทักรอบที่สอง · P1 แก้)** — เดิมยอมแพ้ตรงนี้
            #    และเมื่อคีย์ *ทั้งสองใบ* เป็นรูปแบบใหม่ ด่านนี้เหลืออำนาจแค่ตรวจ URL
            #    ⇒ **"ยืนยันได้ 1/3" ไม่ใช่รายงานที่อ่อน มันคือด่านที่แทบไม่ทำงาน**
            # 🎯 **ทางออกคือบทเรียนของวันเดียวกัน: ยืนยันด้วย *เส้นทางที่ผู้เรียกจริงใช้*
            #    ไม่ใช่ด้วยการอ่านคุณสมบัติของตัวคีย์** (คู่กับข้อยกเว้นที่ 7 ·
            #    `has_function_privilege` = true แล้วเรียกไม่ได้จริง)
            # 🔴 มาถึงบรรทัดนี้ได้ก็ต่อเมื่อ host ผ่านแล้ว — บังคับด้วย `return` ข้างบน
            state = probe_key(url, val)
            if state == "rejected":
                print(f"🔴 ci-target: {name} ถูกปลายทางปฏิเสธ (401/403) — **ไม่ใช่คีย์ของ {allowed}**")
                print("   🔴 คีย์ผิดใบ = ยิงใส่โปรเจกต์อื่นโดย URL ดูถูกต้อง — หยุด")
                bad += 1
            elif state == "ok":
                print(f"✅ ci-target: {name} ผ่าน auth ที่ {allowed} — ยืนยันด้วยการยิงจริง")
                verified += 1
            else:
                print(f"⚠️ ci-target: {name} ไม่ใช่ JWT และยิงยืนยันไม่ได้ (ปลายทางไม่ตอบ) — "
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
