#!/usr/bin/env python3
"""ด่าน .env — คีย์ Supabase ในไฟล์ .env ต้องเป็นของโปรเจกต์ที่อนุญาตเท่านั้น

ใช้:  .github/check-env-keys.py <allowed-ref> <ไฟล์.env> [...]
คืน:  0 = ไม่มีคีย์ของโปรเจกต์อื่น · 1 = เจอ

🔴 ทำไมต้องมี ทั้งที่ด่าน .env เดิม grep หา ref ทริปอยู่แล้ว:
   **ref ใน JWT ถูก base64 ไว้ ไม่ได้ปรากฏเป็นสตริงตรงๆ ในไฟล์**
   ยืนยันแล้ว 24 ส.ค. 2026: `.env.local` ที่มี URL ของ engine-dev
   แต่ `SUPABASE_SERVICE_ROLE_KEY` เป็นคีย์ของ **DB ทริป**
   → ด่านเดิมพิมพ์ `✅ .env: ไม่มีไฟล์ .env ที่ชี้ไป DB ทริป` **ทั้งที่มันมีอยู่**
   🔴 ไม่ใช่ช่องที่ยังไม่ได้ปิด แต่เป็นด่านที่ **รายงานตรงข้ามกับความจริง**

   จังหวะสำคัญ: `PLAN.md` ลำดับหลัง token ใช้ได้ ขั้นที่ 3 คือ
   "ใส่ `SUPABASE_SERVICE_ROLE_KEY` ลง `.env.local` ของทรี platform"
   = ของจริงกำลังจะมาถึงช่องนี้พอดี · และ `service_role` มี `delete on public.trips` แล้ว

⛔ ห้ามพิมพ์เนื้อคีย์ · พิมพ์ได้แค่ ref กับ role ซึ่งเป็นค่าสาธารณะ
"""
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _jwtref import JWT_RE, claims  # noqa: E402


def main(argv) -> int:
    if len(argv) < 2:
        print("ใช้: check-env-keys.py <allowed-ref> <ไฟล์...>")
        return 1
    allowed, paths = argv[0], argv[1:]
    bad = 0
    for path in paths:
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            continue
        for tok in JWT_RE.findall(text):
            c = claims(tok)
            ref = c.get("ref")
            if ref and ref != allowed:
                role = c.get("role", "(ไม่ระบุ role)")
                print(f"🔴 .env: {path} มีคีย์ของโปรเจกต์ {ref} (role={role}) ไม่ใช่ {allowed}")
                bad += 1
    if bad:
        print("   🔴 คีย์ผิดใบใน .env = dev server และเทสต์บนเครื่องจะยิงไปฐานนั้น")
        print("      โดย URL อาจดูถูกต้อง — ref ใน JWT ไม่ได้ปรากฏเป็นสตริงให้ grep เจอ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
