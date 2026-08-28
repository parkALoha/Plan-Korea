#!/usr/bin/env python3
"""`E6-AC10` — ขนาดบันเดิลต่อ route เทียบรอบต่อรอบ

## 🔴 ทำไมต้องมีไฟล์นี้ (P1 เสนอ · P6 สร้าง · 28 ส.ค. 2026)
`E6-AC10` ถูกจะวัดด้วย **การนับบรรทัด `import`** ซึ่งตอบคนละคำถามกับที่มันถาม:
`import { CATEGORY_EMOJI } from "@/data/places"` บรรทัดเดียว อาจลาก `PLACES` ทั้งก้อน
หรือถูก tree-shake ทิ้ง — **บรรทัดเดียวกันเป๊ะ ผลต่างกันสิ้นเชิง** (ตัวเลขจาก `grep` เป็นเบาะแส ไม่ใช่จำนวน)

🔴 **และสมมติฐานแรกของทั้งคู่ผิด**: ทั้ง P1 และผมคิดว่า `npm run build` พิมพ์ตาราง
"First Load JS" ต่อ route ออกมาให้อยู่แล้ว — **Next.js 16.3.0 ในเรพนี้ไม่พิมพ์เลย**
(`AGENTS.md` เตือนไว้แล้วว่า Next เวอร์ชันนี้ไม่ใช่ตัวที่อยู่ในความจำ ต้องเช็คจริงก่อนเขียนโค้ด)

## ✅ แหล่งข้อมูลจริงที่ใช้แทน: `.next/server/app/**/*_client-reference-manifest.js`
ทุก route มีไฟล์นี้ ข้างในมี `clientModules` ที่แต่ละตัวชี้ไปยัง **ชื่อไฟล์ chunk จริง**
ใน `.next/static/chunks/` — รวมชุดไฟล์ที่ไม่ซ้ำแล้วบวกขนาดจริงจากดิสก์ = ขนาดบันเดิลของ route นั้น
🎯 **ทดสอบแล้วกับทั้ง 40 route ในเรพจริง (ไม่ใช่ route สมมติ)**: parse error = 0 · chunk file หาย = 0
รวมถึง API route (ถูกต้อง = 0 KB เพราะไม่มี client bundle) และ dynamic segment (`/trip/[tripId]/page`)

## 🔴 ขอบเขต — เทียบรอบต่อรอบ ไม่ตัดสินว่าเลขไหน "ดีพอ" (P1 กำหนด)
เกณฑ์ว่าโตเท่าไหร่ถึงควรกัน เป็นของคนตั้ง `AC` ไม่ใช่ของด่านนี้ · **สคริปต์นี้ไม่ fail เพราะขนาดโต**
ไม่ว่าโตแค่ไหน — พิมพ์ diff ให้คนอ่าน ไม่ใช่ตัดสินแทน

## 🔴 แต่ fail ถ้า "วัดไม่ได้" (P1 กำชับ · รอบที่ 6 ของทีมในวันนี้ที่เจอกับดักนี้)
· ไม่มี `.next/server/app/` เลย → build ยังไม่รัน หรือ path เปลี่ยน → **แดง**
· ไม่มีไฟล์ baseline → **แดง** (ไม่ใช่ "ยังไม่เคยวัด = ผ่าน")
· baseline parse ไม่ได้ → **แดง**
· manifest ของ route ไหน parse ไม่ได้ หรือ chunk file ที่มันชี้ไปหาไม่เจอ → **แดง**
  (ไม่ใช่ข้ามเงียบแล้วรายงานว่า route อื่นสะอาด — นั่นคือ "ผ่านเพราะไม่ได้วัด")

## อัปเดต baseline เมื่อขนาดโตแบบตั้งใจ
    python3 .github/check-bundle-size.py . --update
"""

import json
import os
import re
import sys

BASELINE = "bundle-size-baseline.json"


def route_sizes(root: str):
    """คืน {route: bytes} จาก client-reference-manifest จริง หรือ raise ถ้าวัดไม่ได้"""
    app_dir = os.path.join(root, ".next", "server", "app")
    if not os.path.isdir(app_dir):
        raise RuntimeError(f"ไม่พบ {app_dir} — ยังไม่ได้ `npm run build` หรือ path เปลี่ยน")

    results = {}
    found_any = False
    for dirpath, _, files in os.walk(app_dir):
        for f in files:
            if not f.endswith("_client-reference-manifest.js"):
                continue
            found_any = True
            path = os.path.join(dirpath, f)
            content = open(path, encoding="utf-8").read()
            m = re.search(r'globalThis\.__RSC_MANIFEST\["([^"]+)"\]\s*=\s*(\{.*\});', content, re.S)
            if not m:
                raise RuntimeError(f"parse ไม่ได้: {path}")
            try:
                data = json.loads(m.group(2))
            except json.JSONDecodeError as e:
                raise RuntimeError(f"JSON พังใน {path}: {e}")

            chunks = set()
            for mod in data.get("clientModules", {}).values():
                chunks.update(mod.get("chunks", []))

            total = 0
            for c in chunks:
                name = c.split("/")[-1]
                chunk_path = os.path.join(root, ".next", "static", "chunks", name)
                if not os.path.exists(chunk_path):
                    raise RuntimeError(f"chunk หาย: {chunk_path} (อ้างจาก {path})")
                total += os.path.getsize(chunk_path)
            results[m.group(1)] = total

    if not found_any:
        raise RuntimeError(f"ไม่มี *_client-reference-manifest.js เลยสักไฟล์ใน {app_dir}")
    return results


def fmt_kb(n: int) -> str:
    return f"{n / 1024:.1f} KB"


def main(argv) -> int:
    root = "."
    update = False
    for a in argv:
        if a == "--update":
            update = True
        else:
            root = a

    baseline_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), BASELINE)

    try:
        current = route_sizes(root)
    except RuntimeError as e:
        print(f"🔴 bundle-size: วัดขนาดปัจจุบันไม่ได้ — {e}")
        return 1

    if update:
        with open(baseline_path, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, sort_keys=True, ensure_ascii=False)
            f.write("\n")
        print(f"✅ bundle-size: เขียน baseline ใหม่ {len(current)} route ลง {baseline_path}")
        return 0

    if not os.path.isfile(baseline_path):
        print(f"🔴 bundle-size: ไม่มีไฟล์ baseline ({baseline_path})")
        print("   ไม่ถือว่า 'ยังไม่เคยวัด' = ผ่าน — สร้างด้วย: python3 .github/check-bundle-size.py . --update")
        return 1
    try:
        baseline = json.load(open(baseline_path, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"🔴 bundle-size: อ่าน baseline ไม่ได้ — {e}")
        return 1

    routes = sorted(set(current) | set(baseline))
    new_routes, removed_routes, changed, unchanged = [], [], [], 0
    for r in routes:
        cur, base = current.get(r), baseline.get(r)
        if base is None:
            new_routes.append((r, cur))
        elif cur is None:
            removed_routes.append((r, base))
        elif cur != base:
            changed.append((r, base, cur))
        else:
            unchanged += 1

    print(f"📦 bundle-size: {len(routes)} route · {unchanged} ไม่เปลี่ยน · "
          f"{len(changed)} เปลี่ยน · {len(new_routes)} ใหม่ · {len(removed_routes)} หายไป")
    for r, base, cur in sorted(changed, key=lambda t: t[2] - t[1], reverse=True):
        delta = cur - base
        sign = "+" if delta >= 0 else ""
        print(f"   {sign}{fmt_kb(delta):>10s}  {r}  ({fmt_kb(base)} → {fmt_kb(cur)})")
    for r, cur in new_routes:
        print(f"   +new       {r}  ({fmt_kb(cur)})")
    for r, base in removed_routes:
        print(f"   -removed   {r}  (เคยมี {fmt_kb(base)})")

    print("   (เทียบรอบต่อรอบเท่านั้น — ไม่ตัดสินว่าโตเท่าไหร่ถึงเกินไป)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
