#!/usr/bin/env python3
"""`E4-AC5` / `E4-AC6` — โฮสต์ API ที่ห้ามเรียก

· `AC5`: ห้ามเรียก ODsay / Kakao / Naver API (ทะเบียนมี*ช่องเสียบ* แต่**ห้ามเสียบ**)
· `AC6`: ห้ามเรียก Google Maps legacy (`maps.googleapis.com/maps/api/*`)

🔴 **เกณฑ์ที่วัดด้วย "ไม่เจออะไรเลย" ผ่านได้ฟรีตลอดกาล** — วันที่มีคนเผลอเสียบ
มันจะยังติ๊กอยู่ในเอกสาร เพราะไม่มีใครกลับไปรัน `grep` เดิมอีก (P1 · `E4`)

## 🎯 ทำไมย้ายมาจาก `lib/__tests__/apiHostGuard.test.ts` (P6 ตัดสิน · 27 ส.ค. 2026)
P1 วางไว้ฝั่งเทสต์เพราะทำได้ทันที · เหตุผลที่ย้ายไม่ใช่เรื่องโซน แต่เป็น **ข้อเท็จจริงของวันนี้เอง**:
**ชุดเต็มบน `platform` แดงมาหลายชั่วโมงจาก `customPlaceAdapter.test.ts` ที่ไม่เกี่ยวกันเลย**
· ด่านที่อยู่*ใน*ชุดทดสอบ **สืบทอดความพร้อมใช้ของทั้งชุด** — วันที่ชุดรันไม่ได้ ด่านก็ไม่ได้รัน
  และ *ไม่มีใครรู้ว่ามันไม่ได้รัน* เพราะหน้าจอเต็มไปด้วยความแดงของเรื่องอื่น
· `guards.sh` ไม่ต้องมี `node_modules` ไม่ต้องมีคีย์ รันได้ก่อนทุกอย่าง และงาน `guards` ใน CI
  แยกจากงาน `verify` → **ความล้มเหลวของโค้ดที่ไม่เกี่ยวกัน ปิดตาด่านนี้ไม่ได้อีก**
🔴 **ห้ามมีสองที่** — P1 ลบฝั่งเทสต์เมื่อรับข้อความนี้ (`D46`: สองชุดที่ต่างกันนิดเดียว
   ทำให้ช่องไปอยู่ตรงตัวที่หลวมกว่า โดยอ่านทีละอันแล้วถูกทั้งคู่)
"""

import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _tsscan import strip_comments, tracked  # noqa: E402

FORBIDDEN = [
    ("Google Maps legacy", "E4-AC6", re.compile(r"maps\.googleapis\.com/maps/api/", re.I)),
    ("ODsay",              "E4-AC5", re.compile(r"(api\.)?odsay\.com", re.I)),
    ("Kakao API",          "E4-AC5", re.compile(r"(dapi|apis)\.kakao\.com", re.I)),
    ("Naver API (legacy)", "E4-AC5", re.compile(r"(openapi\.naver|naveropenapi)\.com", re.I)),
    # 🔴 เพิ่ม 27 ส.ค. 2026 — P4 วัดแล้วว่า 4 ตัวบนพลาด **โฮสต์จริงที่ provider ใช้กันวันนี้**
    #    `naveropenapi.apigw.ntruss.com` ลงท้าย `.ntruss.com` **ไม่ใช่ `.com` ของ naver**
    #    → regex เดิมไม่แมตช์เลย · ใครเอา Naver Cloud Maps กลับมา **ด่านเขียว** (P1 อนุมัติ)
    # ⚠️ **`(?<![a-z0-9-])` ไม่ใช่ `(?:^|\.)`** — ฉบับแรกใช้ `(?:^|\.)` แล้ว **พลาด apex domain**
    #    `https://kakaomobility.com/x` มี `/` นำหน้า ไม่ใช่ `.` และไม่ใช่ต้นบรรทัด → **หลุด**
    #    lookbehind กันเฉพาะ "ตัวอักษรของ hostname" → `/` `"` `.` ผ่านหมด แต่ `evilkakaomobility` ไม่ผ่าน
    #    🎯 เจอเพราะ P4 ถามเรื่องความหมายของการแมตช์ prefix — **คำถามที่ไม่ได้เล็งมาที่บั๊กนี้เลย**
    ("Naver Cloud Maps",   "E4-AC5", re.compile(r"(?<![a-z0-9-])apigw\.ntruss\.com", re.I)),
    ("Kakao Mobility",     "E4-AC5", re.compile(r"(?<![a-z0-9-])kakaomobility\.com", re.I)),
    # 🔴 เพิ่ม 27 ส.ค. 2026 (P4 เสนอ · reasoned ไม่ใช่ measured — ยังไม่มีในโค้ดเรา)
    #    `openapi.map.naver.com` = **Naver Maps JS SDK v3 loader** โหลดด้วย `<script src=...>`
    #    พร้อม `ncpClientId` → **โค้ดเราฝังเอง + มี credential = API host ต้องห้าม ไม่ใช่ deep-link**
    #    ⚠️ กฎ `openapi\.naver\.com` ไม่แมตช์ เพราะมี `.map.` คั่น · `oapi.` คือ host รุ่นเก่าของตัวเดียวกัน
    # 🎯 **ระวังตอนแก้กฎนี้:** ห้ามย่อเป็น `map\.naver\.com` เด็ดขาด — จะกลืน deep-link ของ `E4-AC4`
    #    (ถ้าใครลอง `DEEPLINKS_OK` จะทำให้ด่านปฏิเสธที่จะรันทันที ซึ่งเป็นพฤติกรรมที่ตั้งใจ)
    ("Naver Maps JS SDK",  "E4-AC5", re.compile(r"(?<![a-z0-9-])(?:openapi|oapi)\.map\.naver\.com", re.I)),
    ("Kakao REST API",     "E4-AC5", re.compile(r"(?<![a-z0-9-])kapi\.kakao\.com", re.I)),
]

# 🔴 **CANARY ประกอบทีละชิ้น ห้ามเขียนโฮสต์ติดกัน** (P6 · 27 ส.ค. 2026)
#    ไฟล์นี้ต้องถือ "ชื่อโฮสต์ที่ตัวเองห้าม" ไว้เพื่อทดสอบตัวเอง · ฉบับแรกเขียนติดกัน
#    **วันนี้ไม่ระเบิดเพราะบังเอิญ** — ด่านนี้สแกนแค่ `*.ts`/`*.tsx` และไฟล์นี้เป็น `.py`
#    วันที่มีคนขยายขอบเขตไปที่ `.py` มันจะแดงใส่ตัวเองทันที (เกิดกับ `check-naive-strip.py` มาแล้วจริง)
#    รูปแบบเดียวกับ `guards-selftest.sh:11` · `printf 'ejzibhgqhxdz%s' 'kovsnpds'`
_D = "."
CANARY = "\n".join([
    'const u = "https://maps' + _D + 'googleapis' + _D + 'com/maps/api/js?key=x";',
    'fetch("https://api' + _D + 'odsay' + _D + 'com/v1");',
    'const k = "https://dapi' + _D + 'kakao' + _D + 'com/v2";',
    'const n = "https://openapi' + _D + 'naver' + _D + 'com/v1";',
    'const w = "https://naveropenapi' + _D + 'apigw' + _D + 'ntruss' + _D + 'com/map-direction/v1";',
    'const m = "https://apis-navi' + _D + 'kakaomobility' + _D + 'com/v1/directions";',
    'const s = "https://openapi' + _D + 'map' + _D + 'naver' + _D + 'com/openapi/v3/maps.js";',
    'const r = "https://kapi' + _D + 'kakao' + _D + 'com/v2/user/me";',
])

# ✅ **เคสด้านบวกที่ต้อง *ไม่* ถูกจับ — ปุ่มนำทางที่ `E4-AC4` ตั้งใจสร้าง** (P1 · P5 ยืนยัน)
# 🎯 เส้นแบ่งที่ `AC5` หมายถึงจริง:
#    · **API host** — โค้ดเรายิงเอง ใช้คีย์ กินโควตา → 🔴 ห้าม
#    · **Deep-link host** — URL ที่*ผู้ใช้กด* ไม่มีคีย์ ไม่มีโควตา → ✅ ของที่เราตั้งใจสร้าง
# 🔴 **เคสกลุ่มนี้ไม่ได้มีไว้ยืนยันว่าวันนี้ถูก** — มีไว้กันคนที่ "รัดด่านให้แน่นขึ้น" ในอีก 3 เดือน
#    แล้วฆ่า `lib/mapLinks.ts` โดยไม่รู้ตัว · **การรัดเพิ่มดูเหมือนความรอบคอบทุกครั้ง**
#    และการซ่อมที่เป็นธรรมชาติที่สุดของความแดงนั้น คือลบปุ่มนำทางทิ้ง — ซึ่งใช้จริงระหว่างทริป 11–21 ต.ค.
DEEPLINKS_OK = [
    'https://map' + _D + 'kakao' + _D + 'com/link/to/x,1,2',
    'https://map' + _D + 'naver' + _D + 'com/p/search/x',
    'https://map' + _D + 'naver' + _D + 'com/v5/directions',
]

# 🔴 **เคสด้านลบที่ต้องคู่กับ `DEEPLINKS_OK` เสมอ** (P4 ชี้ · 27 ส.ค. 2026)
#    P4 ถามว่า `DEEPLINKS_OK` ที่ปล่อย `map.naver.com` จะปล่อย `openapi.map.naver.com` ด้วยไหม
#    **คำตอบคือไม่ เพราะ `DEEPLINKS_OK` ไม่ใช่ allowlist ตอนสแกน** — มันเป็นแค่ข้อยืนยันว่า
#    "ห้ามมีกฎไหนแมตช์สตริงพวกนี้" · ไฟล์จริงถูกวัดด้วย `FORBIDDEN` เท่านั้น ไม่มีทางลัดไหนข้ามได้
# 🎯 **แต่คำถามนั้นชี้ของจริง**: subdomain ข้าง ๆ ของ deep-link ที่เป็น API host
#    → เคสนี้ pin ไว้ว่า **ต้องถูกจับ** เพื่อไม่ให้ใครแก้กฎจน `map.naver.com` กลืนทั้งกลุ่ม
MUST_CATCH = [
    'https://openapi' + _D + 'map' + _D + 'naver' + _D + 'com/openapi/v3/maps.js?ncpClientId=x',
    'https://oapi' + _D + 'map' + _D + 'naver' + _D + 'com/openapi/v3/maps.js',
    'https://kapi' + _D + 'kakao' + _D + 'com/v2/user/me',
    'https://kakaomobility' + _D + 'com/x',
    'https://apigw' + _D + 'ntruss' + _D + 'com/x',
]


def main(argv) -> int:
    root = argv[0] if argv else "."

    # ① ด่านต้องพิสูจน์ก่อนว่าตัวเองยังจับของผิดได้ — **ก่อน**จะรายงานว่าของจริงสะอาด
    canary_code = strip_comments(CANARY)
    missed = [n for n, _, rx in FORBIDDEN if not rx.search(canary_code)]
    if missed:
        print(f"🔴 api-hosts: self-test ล้ม · regex จับไม่ได้แล้ว → {', '.join(missed)}")
        print("   🎯 ถ้าเคสนี้แดง แปลว่าเคสจริงข้างล่าง 'เขียว' เพราะตาบอด ไม่ใช่เพราะสะอาด")
        return 1

    # ②a host ที่ต้องจับให้ได้แม้อยู่ต้น authority หรือเป็น subdomain ข้าง ๆ deep-link
    for link in MUST_CATCH:
        if not any(rx.search(link) for _, _, rx in FORBIDDEN):
            print(f"🔴 api-hosts: self-test ล้ม · **หลุด** host ที่ต้องจับ → {link}")
            print("   🎯 เช็คว่าใครย่อกฎจนสั้นเกิน หรือใช้ `(?:^|\\.)` ซึ่งพลาด apex domain")
            return 1

    # ② และต้อง **ไม่** จับ deep-link ที่ `E4-AC4` ตั้งใจสร้าง — ด่านที่รัดเกินไปฆ่าปุ่มนำทาง
    for link in DEEPLINKS_OK:
        for name, _, rx in FORBIDDEN:
            if rx.search(link):
                print(f"🔴 api-hosts: self-test ล้ม · กฎ `{name}` จับ deep-link ที่ต้องปล่อย")
                print(f"   {link}")
                print("   🎯 `AC5` ห้าม *API host* (โค้ดเรายิงเอง ใช้คีย์ กินโควตา)")
                print("      **ไม่ได้ห้าม deep-link ที่ผู้ใช้กด** — นั่นคือตัวส่งมอบของ `E4-AC4`")
                print("      ถ้ารัดกฎจนแดงตรงนี้ การซ่อมที่ 'ธรรมชาติที่สุด' คือลบปุ่มนำทางทิ้ง")
                print("      → `lib/mapLinks.ts` · ปุ่มที่ใช้จริงระหว่างทริป 11–21 ต.ค. 2026")
                return 1

    files = [f for f in tracked(root, "*.ts", "*.tsx") if "__tests__" not in f]
    if len(files) < 100:
        print(f"🔴 api-hosts: ขอบเขตมีแค่ {len(files)} ไฟล์ — น้อยผิดปกติ")
        print("   ด่านที่สแกน 0 ไฟล์ก็ 'ผ่าน' · หยุดไว้ดีกว่าเขียวเพราะไม่มีอะไรให้มอง")
        return 1

    hits = []
    for f in files:
        try:
            src = open(f"{root}/{f}", encoding="utf-8").read()
        except OSError as e:
            print(f"🔴 api-hosts: อ่าน {f} ไม่ได้ — {e.__class__.__name__}")
            return 1
        code = strip_comments(src)
        for i, line in enumerate(code.split("\n"), 1):
            for name, ac, rx in FORBIDDEN:
                if rx.search(line):
                    hits.append(f"{f}:{i} — {name} ({ac})")

    if hits:
        print("🔴 api-hosts: เรียกโฮสต์ที่ `E4-AC5`/`AC6` ห้ามไว้")
        for h in hits:
            print(f"   {h}")
        print("   → ทะเบียนมีช่องเสียบไว้ แต่ยังไม่อนุมัติให้เสียบ · คุยกับ P1 ก่อน")
        return 1

    print(f"✅ api-hosts: ตรวจ {len(files)} ไฟล์ · ไม่มีการเรียก ODsay/Kakao/Naver/Maps-legacy")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
