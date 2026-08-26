#!/usr/bin/env python3
"""ด่านฝั่ง CI — ถ้าระบบอยู่ในโหมด read-only **ประกาศว่าผลรอบนี้ไม่มีความหมาย**

ใช้:  .github/check-readonly-mode.py                 (เรียก RPC จริง · ใช้ env ของ job rls)
      .github/check-readonly-mode.py --decide '<json>'   (ตรรกะล้วน · สำหรับ self-test)
คืน:  0 = รันชุดสดต่อได้ · 1 = อย่ารัน / ตรวจไม่ได้

🔴 ที่มา — `E3-AC7` เปิดโหมดที่ **บล็อกการเขียนทั้งระบบ** · ถ้าชุดสดรันตอนโหมดเปิด
   มันจะพ่นความล้มเหลวเต็มไปหมด **แล้วคนจะไปไล่หาบั๊กใน policy ที่ไม่มีบั๊ก**
   คืนนี้เราจ่ายค่าบทเรียนนี้ไปแล้วรอบหนึ่ง (`9fceac6` แดงเพราะฐานล้ำหน้าโค้ด ไม่ใช่เพราะโค้ดพัง)

🔴 **ขอบเขตที่ต้องทบทวนวันที่ platform มีผู้ใช้จริง (P4 ชี้ · 26 ส.ค. 2026):**
   ด่านนี้เห็นโหมดที่ค้างเปิด **เฉพาะตอนมี CI run เท่านั้น** · วันนี้พอ เพราะโหมดแตะแค่ `engine-dev`
   → ค้างตอนตี 4 = **งานพัฒนาหยุด** ไม่ใช่ผู้ใช้เดือดร้อน (`Korea-Trip` ไม่มีตารางนี้เลย)
   ⚠️ **แต่ `E3-AC7` มีอยู่เพื่อ ship ขึ้น platform prod** — วันที่ platform มีผู้ใช้จริง
   *"ผู้ใช้ค้างจนกว่าจะมีคนสังเกต"* อาจรับไม่ได้ ต่างจาก *"งานพัฒนาหยุดจนมีคนสังเกต"*
   🎯 **นี่คือ "ปลอดภัยเพราะยังไม่มีผู้ใช้ ไม่ใช่ปลอดภัยเพราะกันได้"** — ความปลอดภัยชนิดนี้
   **หมดอายุพร้อมความคืบหน้า และหมดอายุเงียบ** · วันที่ platform live **ต้องทบทวนว่าการเห็นโหมด
   ต้องไม่ขึ้นกับว่ามีคน push หรือไม่** · ห้ามอ่านบรรทัดนี้ว่า "ปิดเรื่องแล้ว" — มันคือ *เลื่อน*

🎯 รูปเดียวกับ `applied_migrations()` ของ P1: **ประกาศว่า "ผลไม่มีความหมาย"
   ไม่ใช่รายงานว่า "โค้ดพัง"** — ข้อความที่ถูกต้องหยุดการไล่ล่าผิดทางได้ ตัวด่านเฉย ๆ หยุดไม่ได้

⚠️ ทำไม "ไม่มี RPC" ถึง **ผ่าน** ไม่ใช่แดง (ต่างจากกติกา "ตรวจไม่ได้ ≠ ปลอดภัย" ที่เราใช้ที่อื่น):
   ถ้า `public.system_mode()` ยังไม่มีในฐาน แปลว่า **migration ของโหมดนี้ยังไม่ถูก apply**
   → ไม่มี trigger → **ไม่มีโหมดให้ค้างอยู่** · ความเสี่ยงที่ด่านนี้กันอยู่ *ไม่มีอยู่จริง* ในสภาพนั้น
   🔴 ต่างจากเคส `DEV_PROJECT_REF` ตรงที่ตรงนั้น "ตรวจไม่ได้" แปลว่า *อาจชี้ผิดฐาน* ซึ่งอันตรายจริง
   · แต่ error อื่น (เน็ต · สิทธิ์ · payload แปลก) = **แดง** เพราะ RPC *ควร* มีและ *ควร* ตอบได้
"""
import json
import os
import sys
import urllib.error
import urllib.request

RPC = "/rest/v1/rpc/system_mode"


def decide(payload) -> int:
    """ตรรกะล้วน — แยกออกมาเพื่อให้ self-test ยิงได้โดยไม่ต้องมีเน็ต"""
    if not isinstance(payload, list) or not payload:
        print(f"🔴 readonly-mode: payload ไม่ใช่รูปที่คาด — ได้ {str(payload)[:80]}")
        return 1
    row = payload[0]
    if not isinstance(row, dict) or "read_only" not in row:
        print(f"🔴 readonly-mode: ไม่มีคอลัมน์ read_only — ได้ {str(row)[:80]}")
        return 1
    if row.get("read_only"):
        reason = row.get("reason") or "(ไม่ได้ระบุเหตุผล)"
        print("🔴 readonly-mode: ระบบอยู่ในโหมด read-only — **ผลของชุดสดรอบนี้ไม่มีความหมาย**")
        print(f"   เหตุผลที่บันทึกไว้: {reason}")
        print("   🔴 อย่าไปไล่หาบั๊กใน policy — การเขียนถูกบล็อกโดยตั้งใจ")
        print("   ปิดโหมดก่อน (`app.system_mode.read_only = false`) แล้วรันใหม่")
        return 1
    print("✅ readonly-mode: ระบบเขียนได้ตามปกติ — ผลของชุดสดเชื่อถือได้")
    return 0


def main(argv) -> int:
    if len(argv) >= 2 and argv[0] == "--decide":
        try:
            return decide(json.loads(argv[1]))
        except json.JSONDecodeError as e:
            print(f"🔴 readonly-mode: อ่าน json ไม่ได้ — {e}")
            return 1

    url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not key:
        print("🔴 readonly-mode: ไม่ได้ตั้ง URL หรือ service_role key — ตรวจไม่ได้ ถือว่าไม่ผ่าน")
        return 1
    req = urllib.request.Request(
        url + RPC, data=b"{}",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return decide(json.loads(r.read().decode()))
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        if e.code in (404, 400) and ("PGRST202" in body or "not find" in body):
            print("⚠️ readonly-mode: ยังไม่มี `public.system_mode()` ในฐานนี้")
            print("   → migration ของโหมด read-only ยังไม่ถูก apply = ไม่มีโหมดให้ค้าง · รันต่อได้")
            return 0
        print(f"🔴 readonly-mode: เรียก RPC ไม่สำเร็จ (HTTP {e.code}) — {body}")
        return 1
    except Exception as e:
        print(f"🔴 readonly-mode: เรียก RPC ไม่สำเร็จ — {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
