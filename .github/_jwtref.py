"""ดึง claim `ref` (และ `role`) ออกจาก JWT ของ Supabase — ใช้ร่วมกันหลายด่าน

🔴 อยู่เป็นโมดูลกลางโดยตั้งใจ · ก่อนหน้านี้ตรรกะนี้อยู่ใน check-ci-target.py ที่เดียว
   ถ้าคัดลอกไปอีกที่ วันที่แก้ที่หนึ่งแล้วลืมอีกที่ = ด่านสองตัวที่เชื่อคนละเรื่อง
   (เป็นเหตุผลเดียวกับที่ `allowed-project-ref` มีแหล่งเดียว)

🔴 **ไม่ verify ลายเซ็น และไม่ตั้งใจจะ verify** — นี่คือด่านกัน "หยิบคีย์ผิดใบ"
   ไม่ใช่ด่านกัน "คนปลอมคีย์" · คีย์ที่ประกอบ payload เองจะผ่าน ซึ่งรับได้
   เพราะภัยที่กันอยู่คืออุบัติเหตุ ไม่ใช่การโจมตี
"""
import base64
import json
import re

# JWT = 3 ท่อน base64url คั่นด้วยจุด · ยึด `eyJ` (คือ `{"` ที่ถูก base64) กันจับคำทั่วไป
# 🔴 ท่อนลายเซ็นตั้งเป็น {1,} โดยตั้งใจ — ฉบับแรกใช้ {4,} แล้ว **มองข้ามโทเคนที่ลายเซ็นสั้น**
#    เจอเพราะเทสต์ด้านลบสร้างโทเคนที่ลายเซ็น 3 ตัวอักษร แล้วด่านปล่อยผ่านเงียบ
#    เราไม่ได้ตรวจลายเซ็นอยู่แล้ว **ความยาวของมันจึงไม่ควรเป็นเงื่อนไขว่าจะตรวจ ref หรือไม่**
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{1,}")


def claims(token: str) -> dict:
    """คืน payload ของ JWT เป็น dict · คืน {} ถ้าอ่านไม่ได้หรือไม่ใช่ JWT"""
    parts = token.split(".")
    if len(parts) != 3:
        return {}
    try:
        pad = parts[1] + "=" * (-len(parts[1]) % 4)
        out = json.loads(base64.urlsafe_b64decode(pad))
        return out if isinstance(out, dict) else {}
    except Exception:
        return {}


def ref_of(token: str):
    """คืน claim `ref` · None ถ้าไม่มี (คีย์รูปแบบใหม่ `sb_secret_…` ไม่พก ref มาด้วย)"""
    return claims(token).get("ref")
