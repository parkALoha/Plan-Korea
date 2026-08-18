# `supabase-platform/` — workdir ของ Supabase CLI สำหรับ **แพลตฟอร์ม** เท่านั้น

> เจ้าของ: P6-DevOps · สร้าง 18 ส.ค. 2026 (E0)
> ปลายทางเดียวที่อนุญาต: **`pmvxwcimjebogjfimzqy`** (org `Plan-trip-app` · project `engine-dev`)

## 🔴 ทำไมต้องเป็นโฟลเดอร์แยก ไม่ใช้ `supabase/` ที่มีอยู่

`branch platform` แตกมาจาก `main` → **`supabase/migrations/` มีไฟล์ migration ของทริปจริงติดมาครบ 31 ไฟล์**
ถ้าใช้ `supabase/` ตรงๆ จะเหลือทางเลือกแค่ 2 ทาง และแย่ทั้งคู่:

| ทาง | ผลที่ตามมา |
|---|---|
| ปล่อยไฟล์ทริปไว้ | `supabase db push` จะ **รัน 31 ไฟล์ของทริปใส่ `engine-dev`** แล้ว track ว่ารันแล้ว → dev DB กลายเป็น schema ทริป ไม่ใช่ schema แพลตฟอร์ม |
| ลบไฟล์ทริปบน `platform` | **การลบเดินทางเข้า `main` ตอน merge** → ไฟล์ประวัติของ DB ทริปหายจาก `main` · ระเบิดตอน `E9` ซึ่งเป็นจังหวะที่แย่ที่สุด |

**CLI resolve path เป็น `<workdir>/supabase/migrations` เปลี่ยนไม่ได้** → ต้องแยกที่ระดับ **workdir** ไม่ใช่โฟลเดอร์ย่อย

⚠️ **branch แยกกับโฟลเดอร์แยกแก้คนละปัญหา** — branch กันคนกับ CI สับสน · โฟลเดอร์กัน **CLI หยิบไฟล์ผิดชุด**
ซึ่ง branch ไม่ช่วยเลย เพราะไฟล์ทริปติดมากับ branch อยู่แล้ว

## ⛔ ยังใช้งานไม่ได้ — ขาด 2 อย่างที่ผมทำแทนไม่ได้

**1. Supabase CLI ยังไม่ได้ติดตั้งบนเครื่อง** (`supabase --version` → command not found)
```bash
brew install supabase/tap/supabase
```

**2. `config.toml` ยังไม่มี — ต้องให้ CLI สร้าง ห้ามเขียนมือ**
```bash
cd /Users/park/plan-korea-platform && supabase init --workdir supabase-platform
```
🔴 **จงใจไม่เขียน `config.toml` เอง** — คีย์ในไฟล์นั้นผูกกับเวอร์ชันของ CLI
ไฟล์ที่เขียนมือแล้ว *ดูเหมือนถูก* อันตรายกว่าไฟล์ที่ไม่มี เพราะไม่มีอะไรฟ้องจนกว่าจะรันจริง

## 🔴 กติกาการ link — เข้มกว่าปกติเพราะ DB ทริปอยู่ในบัญชีเดียวกัน

```bash
# link ได้ปลายทางเดียว และต้องใส่ token หน้าคำสั่งทุกครั้ง
SUPABASE_ACCESS_TOKEN=xxx supabase link --project-ref pmvxwcimjebogjfimzqy --workdir supabase-platform
```

1. **`link` ได้เฉพาะ `pmvxwcimjebogjfimzqy` เท่านั้น** — เป็น allowlist ไม่ใช่ blocklist
   🔴 **ห้าม link โปรเจกต์ของ DB ทริปจริงทุกกรณี** (ref ของมันอยู่ใน `PLAN.md §5` — จงใจไม่เขียนซ้ำที่นี่
   เพราะโฟลเดอร์นี้เป็น "ไฟล์ที่เครื่องจักรอ่านแล้วทำตาม" ซึ่งห้ามมี ref ของทริปตามมติ P1 17 ส.ค.
   · ด่าน `guards.sh` จับข้อนี้ได้จริง — มันจับไฟล์นี้มาแล้วตอนผมเขียนฉบับแรก)
2. 🔴 **`SUPABASE_ACCESS_TOKEN` ห้ามอยู่ใน shell profile** — ใส่หน้าคำสั่งเป็นครั้งๆ ไป
   เพื่อให้ทุกครั้งที่มีสิทธิ์เขียนเป็น **การตัดสินใจที่รู้ตัว** ไม่ใช่สิทธิ์ที่ค้างอยู่ในทุก terminal ที่เปิด
3. **CI มี step `assert linked ref` คอยตรวจ** ว่า `.temp/project-ref` ตรงกับ secret `DEV_PROJECT_REF`
   🔴 **link แล้วแต่ยังไม่ตั้ง secret = CI ไม่ผ่าน** (ตรวจไม่ได้ ≠ ปลอดภัย)

## ✅ วิธีรัน migration — **ตัดสินแล้ว: ใช้ CLI กับ `engine-dev` · copy-paste เหลือไว้เฉพาะ DB ทริป**

| DB | วิธีรัน | ทำไม |
|---|---|---|
| **`engine-dev`** (แพลตฟอร์ม) | **`supabase db push --workdir supabase-platform`** | **ได้ตาราง `supabase_migrations.schema_migrations` ที่ track ว่ารันอันไหนไปแล้ว** ซึ่งคือปัญหาที่แผนนี้ตั้งใจแก้ตั้งแต่ต้น · ถ้ากลับไป copy-paste เราจะได้ปัญหาเดิมกลับมาเป๊ะ |
| **DB ทริป** (`main`) | **copy-paste ใน SQL Editor เหมือนเดิม** ตาม `PLAN.md §5` | ไม่แตะของที่ทำงานอยู่ · และ CLI ไม่เคย link กับมันเลยตามกติกาข้อ 1 |

⚠️ **ผู้ใช้เป็นคนรัน** เพราะเป็นคนถือ token · เอเจนต์เตรียมไฟล์ให้แล้วบอกคำสั่งเต็ม **พร้อมระบุ ref ปลายทางในข้อความทุกครั้ง**

## 🔴 ทุก migration ต้องมี 2 บล็อกนี้ — ดูตัวอย่างที่ `migration-template.sql`

1. **บล็อก assert ปลายทาง** (บนสุด ก่อน DDL ทุกบรรทัด) — ให้ DB ปฏิเสธเองถ้ารันผิดโปรเจกต์
   **ไม่ใช่ป้ายให้คนอ่าน แต่เป็นด่านที่ทำงานตอนคนพลาด** และไม่มี ref หรือความลับอยู่ในไฟล์
2. **rollback SQL ในคอมเมนต์หัวไฟล์** — 31 ไฟล์ของทริปไม่มีสักไฟล์
   ถ้า migration พังแล้วไม่มีทางถอย จะเหลือแค่เขียน SQL แก้สดหน้างาน
