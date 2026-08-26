# DevOps — CI/CD · Supabase local · env · rate limit · tier

> เจ้าของไฟล์: **P6-DevOps** · เริ่ม 17 ส.ค. 2026 · ระยะออกแบบ **ไม่มีอะไรในไฟล์นี้ถูกรันตอนนี้**
> ทุกข้อคือแผนไว้ทำ **หลัง 21 ต.ค. 2026** (ทริปจบ) ยกเว้นข้อที่ระบุชัดว่า "ทำได้เลยโดยไม่แตะ production"
>
> 🔴 **ข้อห้ามที่คุมทั้งไฟล์นี้:** ห้าม redeploy production · ห้ามแตะ env บน Vercel · ห้ามแตะ Supabase
> `ejzibhgqhxdzkovsnpds` · ห้ามวางไฟล์ `.sql` ของงานแพลตฟอร์มใน `supabase/migrations/`

---

## 0. สรุปให้ผู้ตัดสินใจอ่าน 1 นาที

| เรื่อง | สถานะวันนี้ | ข้อเสนอ | ต้องจ่ายเงินไหม |
|---|---|---|---|
| CI | **ไม่มีเลย** ไม่มี `.github/` | GitHub Actions 3 job: lint · test · build | ฟรี (repo ส่วนตัว 2,000 นาที/เดือน) |
| dev DB | ไม่มี — ทุกคนต่อ DB ทริปจริง | ~~Supabase local (Docker)~~ → **staging บนคลาวด์ org ใหม่ (D14)** | ฟรี (2 โปรเจกต์ในเพดาน free) |
| migration | รันมือ copy-paste 31 ไฟล์ ไม่มีตาราง track | baseline + `supabase migration` ใน dev · **prod ยังรันมือ** | ฟรี |
| env | 8 ตัว 1 ระดับ | 3 ระดับ local/preview/prod + service-role key | ฟรี |
| rate limit | in-memory `Map` ต่อ instance | Upstash Redis (ทำตอนมีผู้ใช้จริงเกิน ~50 คน) | ~$0–10/เดือน |
| tier | Vercel Hobby + Supabase free | **ไม่พอสำหรับหลายผู้ใช้** ต้องขยับทั้งคู่ | **~$45/เดือน** ดูข้อ 5 |
| monitoring | ไม่มีเลย | Sentry free + uptime free + **cost alert ของ Google (ด่วนสุด)** | ฟรี |

**สิ่งที่ผมต้องการคำตอบจากผู้ใช้ก่อนระยะ 2:** ข้อ 5 (จ่ายเงินเท่าไร) และ ข้อ 1.1 (จะติดตั้ง Docker ตัวไหน)

---

## 0.5 บันทึกการตัดสินใจ — P1 รีวิวแล้ว 17 ส.ค. 2026

| เรื่อง | มติ | อยู่ข้อไหน |
|---|---|---|
| **env ของ Production ไหลลง Preview** | 🔴 **ขึ้นเป็นข้อห้ามระดับกติกาเหล็ก** — เป็นทางที่กติกาข้อ 2 ถูกละเมิดได้โดยไม่มีใครตั้งใจ | 3.2 · 7.2 |
| **ห้าม `supabase link` · ห้ามมี `SUPABASE_ACCESS_TOKEN` บนเครื่อง** | 🔴 **P1 รับเข้าเป็นกติกาเหล็ก** | 1.2 |
| workdir แยก `supabase-platform/` | ✅ รับ (แก้ที่กติกาเหล็กข้อ 3 ชนกับ CLI) | 1.3 |
| migration 31 ไฟล์ | ✅ **เอาทาง A** — แช่แข็งถาวร แพลตฟอร์มเริ่มจากศูนย์ · ทาง B/C ตกไป | 1.6 |
| **dev/staging DB** | 🔄 **D14 กลับมติ: ย้ายจาก Docker → Supabase คลาวด์ org ใหม่** (ผู้ใช้ตัดสิน) · ไม่ต้องลง Docker แล้ว | 1.1 |
| **prod ของแพลตฟอร์ม** | 🔄 **D21 กลับมติ: prod = DB เดิม แปลง schema ที่เดิม + สำเนาแช่แข็งในโปรเจกต์ที่ 2** (ของเดิม "โปรเจกต์ใหม่" ตกไป) | 3.2 |
| 3 ผลตามมาของ staging บนคลาวด์ | ✅ **รับทั้ง 3 ข้อจาก P4** — fixture namespace · ทน cold start ที่ต้นเหตุ · assert `role` ใน JWT | 2.4.1 |
| กติกา "ห้าม `supabase link`" | ⚠️ **ขอมติแก้** — D14 ทำให้กติกาเดิมแปลว่า migration กลับไป copy-paste มือ · เสนอฉบับแก้ที่เข้มเท่าเดิม | 1.2 |
| **R7 — Vercel Hobby รับได้กี่ผู้ใช้** | ✅ **ตอบแล้ว** — สัญญาชนที่ผู้ใช้คนแรก · ตัวเลขชนที่ ~50–160 คน/เดือน · **`E3` ต้องมาก่อนการจ่ายเงิน** | 5.1.1 |
| 🔴 **timeout 10 วิ ที่ผมเคยบอก P1** | ❌ **ผิด — ที่ถูกคือ 300 วิ** · ยืนยันจาก **4 หน้าอิสระ** ของ Vercel หลัง P1 ทักท้วง · ต้องแจ้ง P5 | 5.1.2 |
| **แยกเพดาน "ชนที่คนแรก" vs "ชนเมื่อคนเยอะ"** | ✅ ทำตามที่ P1 สั่ง — และพบว่า **เราจะจ่ายเงินเพราะสัญญา/backup ก่อนแตะเพดาน capacity สักตัว** | 5.1.1 |
| **ราคาทุกช่องผ่านการเปิดหน้าจริง** | ✅ **ครบแล้ว 17 ส.ค. 2026** — Vercel · Supabase · Upstash · Sentry · **ไม่เหลือตัวเลขที่จำมาในเอกสารนี้** | 4.2 · 5.2 · 6.1 |
| หน้าต่าง read-only ตอน cutover | ✅ P1 รับเป็น **`E3-AC7`** (ผมกับ P8 ชี้ตรงกัน) | 3.2 |
| Pro ชั่วคราวช่วง cutover เพื่อ PITR | ⏳ **เก็บเป็นทางเลือกให้ผู้ใช้ตัดสินตอน `E9`** ไม่ต้องตัดสินตอนนี้ | 3.2 |
| **repo อยู่ใต้บัญชีส่วนตัว ไม่ใช่ org** | ✅ P1 เช็ค GitHub API แล้ว → **ข้อจำกัด "Hobby ต่อ repo ของ org ไม่ได้" ไม่กระทบเรา** ตัดออกจากชนิด A | 5.1.1 |
| **กันสลับโปรเจกต์โดยไม่เขียน ref ลง git** | ✅ ออกแบบแล้ว (P1 มอบ) — 🔴 **แต่ต้องแก้สมมติฐานก่อน: ref รั่วผ่านเว็บสาธารณะอยู่แล้ว repo private ไม่ทำให้เป็นความลับ** | 1.7 |
| **กติกาเรื่อง ref ในไฟล์** | ✅ **P1 ตัดสินตามที่ผมเสนอ: ไม่ตั้งกติกา "ห้ามเขียน ref"** — เขียนในเอกสารเชิงบรรยายได้ · **ห้ามใช้ ref ที่เขียนไว้เป็นกลไกกันพลาด** · **ห้ามอยู่ในไฟล์ที่เครื่องจักรอ่านแล้วทำตาม** (`supabase-platform/` · `.github/workflows/` · `package.json`) | 1.7 |
| **repo เป็น private** | ⏳ P1 เสนอผู้ใช้แล้ว · **เหตุผลที่ถูกคือซ่อน `docs/engine/` ทั้งชุด (แผนที่ช่องโหว่ที่เราเขียนเอง) ไม่ใช่ซ่อน ref** · 🔴 **และห้ามนับว่านี่ปิดความเสี่ยง — สิ่งที่ปิดจริงคือ RLS (B2/`E1`)** | 1.7 |
| Realtime connection เป็นเพดานที่จะชนก่อนเพื่อน | ✅ P1 รับเป็นโจทย์ของ `E3` — เป้าหมายคือ **ลด channel ต่อผู้ใช้** ไม่ใช่แค่ย้ายไป DAL | 5.1 |
| แคช place details/photo | ✅ **ห้ามรื้อทิ้งตอนออกแบบ schema ใหม่ — เป็นข้อบังคับของ `E2`** | 5.2 |
| rollback SQL ในทุก migration | ✅ รับเป็นข้อบังคับของระยะ 2 | 7.3 |
| ห้ามอัป Node ก่อน 21 ต.ค. | ✅ รับ · `.nvmrc` รอหลังทริป | 2.3 |
| ห้ามใส่ Google key จริงใน CI secret | ✅ รับ · P1 ส่งต่อ P3 แล้ว พร้อมเงื่อนไข "ถ้าพลิกเป็น Server Component ต้องรื้อใหม่" (คุมที่ `E6`) | 2.2 |

**4 ข้อที่ผมขออนุมัติ — P1 ตอบแล้ว:** ข้อ 1–2 (uptime monitor · Google quota) **ต้องให้ผู้ใช้อนุมัติเอง**
เพราะเป็นบัญชี/บริการภายนอกของผู้ใช้ · ข้อ 3–4 (`.nvmrc` · `.env.example`) ❌ **รอหลัง 21 ต.ค.**
เพราะอยู่ที่ root ระหว่าง freeze ไม่คุ้มความเสี่ยง → **ระยะนี้ P6 ไม่มีของที่ลงมือทำได้เลย มีแต่เอกสาร ถูกต้องแล้ว**

---

## 🔴 ข้อที่ทุกแผน infra ต้องเคารพ — Google Maps API key

คัดจาก `PLAN.md §4` (รายการที่ปิดไปแล้ว 13 ส.ค. 2026) ย้ำไว้ที่นี่เพราะงาน infra มักไป "เก็บกวาด" เรื่องนี้:

- โปรเจกต์ Google Cloud: `galvanized-pipe-427006-t6` มี key **2 ใบ**
- **ใบ browser** (`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`) — Websites restriction + Maps Embed/Maps JavaScript
- **ใบ server** (`GOOGLE_MAPS_API_KEY`) — Places API (New) · Routes API · YouTube Data API v3
  · **Application restrictions = None และต้องคงไว้แบบนั้นตลอดไป**

🔴 **ห้ามใส่ Websites/HTTP-referrer/IP restriction กับใบ server เด็ดขาด** — Vercel Hobby ไม่มี IP ขาออกคงที่
และ server route ยิงจากฝั่งเซิร์ฟเวอร์ **โดยไม่มี `Referer` header** ใส่แล้วพังทันที 4 จุด
🔴 **Google จะขึ้นแถบเหลือง "this key can currently be used with any application" ค้างตลอดไป — ถูกต้องแล้ว ห้ามแก้ตาม**

**ผลต่อแผน infra ของผมโดยตรง:**
1. ถ้าอนาคตย้ายไป Vercel Pro/Enterprise แล้วมีคนเสนอเปิด **Static IP / Secure Compute** เพื่อจะได้ล็อก key
   ด้วย IP — **อย่าเพิ่งทำ** ต้องทดสอบครบ 4 จุดบน preview ก่อน และไม่มีเหตุผลด้านค่าใช้จ่ายให้รีบ
2. การกันคีย์รั่วของใบ server ทำที่ **quota + budget alert + rate limit** ไม่ใช่ที่ application restriction
   (ดูข้อ 6.3) — นี่คือเหตุผลที่ข้อ 6 ให้ cost alert ของ Google เป็นงานด่วนที่สุดของ monitoring
3. ห้ามใส่ key ใบ server ใน CI secret ของ job ที่รัน E2E สาธารณะ — ใช้ mock (ดูข้อ 2.4)

---

## 1. Supabase local ด้วย Docker

### 1.1 ⚠️ หัวข้อนี้ถูกแทนที่โดยมติ D14 — dev DB ย้ายจาก Docker ไป Supabase คลาวด์

> 🔴 **ผู้ใช้เปลี่ยนใจ (D14): dev/staging DB = โปรเจกต์ Supabase คลาวด์ใน organization ใหม่ ไม่ใช่ Docker**
> เหตุผลที่ชนะคือข้อจำกัดที่ผมเขียนเองใน 1.5 — **local ทดสอบ OAuth กับ Supavisor pooler ไม่ได้**
> ซึ่งเป็น 2 จุดที่ "บนเครื่องผ่าน ขึ้นจริงพัง" บ่อยที่สุด · **ผมเห็นด้วยกับมตินี้**

**ผลคือ: ไม่ต้องลง Docker/OrbStack แล้ว · E0 ฝั่งผู้ใช้เบาลงมาก**
ตรวจบนเครื่องวันนี้ (17 ส.ค. 2026): `docker` → *command not found* · `supabase` → *command not found*
· `node v20.12.2` · `npm 10.5.0` — **เหลือของที่ต้องลงแค่ Supabase CLI ตัวเดียว ไม่ต้องมี container runtime**

```bash
brew install supabase/tap/supabase
```

**ของที่ยังใช้ได้จากหัวข้อ 1.3–1.6:** โครงโฟลเดอร์ `supabase-platform/` · แผน migration ทาง A ·
คำสั่ง `migration new`/`up`/`diff`/`lint` — ทั้งหมดทำงานกับ DB คลาวด์ได้เหมือนกัน
**ของที่ตกไป:** `supabase start/stop/status` (คำสั่งของ local stack) และตาราง "ทดสอบไม่ได้" ใน 1.5
เปลี่ยนความหมายไปทั้งตาราง — ดูกล่องท้าย 1.5

⚠️ **สิ่งที่ต้องเพิ่มเพราะย้ายขึ้นคลาวด์: staging ต้องมี keep-alive ของตัวเอง**
Supabase free หลับเมื่อไม่มี request 7 วัน — เหมือนที่ทริปเจอและแก้ด้วย `/api/keep-alive` + cron
staging ที่หลับ = CI แดงตอนเช้าวันจันทร์โดยไม่มีใครแก้อะไรเลย · **P8 ทำเป็น `E0-AC7` แล้ว**
🔴 แต่ **cron ของ Vercel Hobby ยิงได้วันละครั้ง** (ยืนยันแล้ว ดู 5.1) — ถ้าจะปลุก staging ต้องใช้
GitHub Actions `schedule` แทน ซึ่งฟรีและตั้งถี่กว่าได้ **นี่เป็นงานของ CI ไม่ใช่ของ `vercel.json`**

### 1.2 🔴 กติกาความปลอดภัยข้อเดียวที่ห้ามพลาด: ห้าม `supabase link`

Supabase CLI มีคำสั่งที่ **เขียนใส่ DB คลาวด์ได้จริง** ถ้าเผลอ `link` โปรเจกต์ทริปเข้ากับ repo นี้:

| คำสั่ง | ทำอะไรถ้าเผลอ link ไปที่ `ejzibhgqhxdzkovsnpds` |
|---|---|
| `supabase db push` | **รัน migration ที่ยังไม่เคยรัน ใส่ DB ทริปจริง** ← หายนะที่แผนทั้งหมดนี้กันอยู่ |
| `supabase db reset` | ล้าง schema **(ในเครื่องเท่านั้น — แต่คนอ่านคำสั่งผิดได้ง่าย)** |
| `supabase db pull` | ปลอดภัย (อ่านอย่างเดียว) แต่จะเขียนไฟล์ทับใน `supabase/migrations/` |

**กติกา** — 🔴 **P1 รับ 2 ข้อแรกเข้าเป็นกติกาเหล็กของระยะออกแบบแล้ว (17 ส.ค. 2026)**:
1. **ห้ามรัน `supabase link` ในโฟลเดอร์นี้ ทุกกรณี จนกว่าทริปจะจบและผู้ใช้สั่งเป็นลายลักษณ์อักษร**
2. ห้ามใส่ `SUPABASE_ACCESS_TOKEN` ไว้ใน env ของเครื่อง
   ~~ไม่มี token ก็ `link`/`push` ไม่ได้เลย เป็นด่านสุดท้ายที่ทำงานแม้คนพิมพ์ผิด~~
   🔴 **ประโยคที่ขีดฆ่าไม่จริง — ตรวจแล้ว 24 ส.ค. 2026 (P6)** · กติกาตัวข้อยังใช้อยู่ แต่**อย่านับว่ามันเป็นด่าน**
   `SUPABASE_ACCESS_TOKEN` ไม่ได้ตั้งใน env และไม่มีใน `.zshrc/.zprofile/.bashrc/.bash_profile` จริงตามกติกา
   **แต่ CLI ยัง authenticated อยู่** — `supabase projects list` คืนผลได้โดยไม่ต้องมี token
   (login ค้างใน keychain ไม่ใช่ไฟล์ · `~/.supabase` มีแค่ telemetry) = มีคนเคยรัน `supabase login` ไปแล้ว
   ซึ่งเป็นสิ่งที่ `§12.1` ห้ามไว้เองพอดี
   🔴 **บัญชีที่ค้างอยู่นั้นเห็น `Korea-Trip` (DB ทริป) แต่เห็น `engine-dev` ไม่ได้** — สิทธิ์กลับด้านกับที่แผนสมมติ
   📌 **ชัดขึ้นเมื่อ 24 ส.ค. 2026 (P1 ยืนยันด้วยภาพหน้าจอ): เบราว์เซอร์เห็น `engine-dev` · CLI ไม่เห็น**
   → **มันคนละบัญชีกันจริง ไม่ใช่บัญชีเดียวที่สิทธิ์ขาด**
   🔴 **ทางแก้จึงไม่ใช่ "ขอสิทธิ์เพิ่ม" หรือ "เชิญบัญชีเข้า org" — แต่คือ ออก token จากบัญชีที่ใช้ในเบราว์เซอร์**
     แล้วพิสูจน์ด้วย `§12.1` ขั้น 2 ก่อนใช้ · **อย่าไปไล่แก้เรื่องสิทธิ์ มันไม่ใช่ปัญหา**
   → ด่านที่กันจริงคือ **บล็อก assert ที่หัว migration** (ดู `§12.5`) และ **ด่าน link-location ใน `guards.sh`**
     ไม่ใช่การไม่มี token
3. `.gitignore` ต้องเพิ่ม `supabase-platform/.temp/` และ `.branches/` (CLI เก็บ project-ref ที่ link ไว้ตรงนั้น)

> 🔴 **ต้องแก้กติกาข้อนี้เพราะ D14 เปลี่ยนสมมติฐานใต้มัน — ขอมติ P1**
> ตอนผมเขียนกติกา "ห้าม `link`" dev DB ยังเป็น Docker ซึ่ง **ไม่ต้อง link เลย** กติกาจึงไม่มีต้นทุน
> พอ D14 ย้าย staging ขึ้นคลาวด์ **การจะรัน migration ใส่ staging ต้อง link หรือไม่ก็กลับไป copy-paste มือ**
> — ถ้าปล่อยกติกาไว้เดิม เราจะได้ระบบ migration ที่ track ไม่ได้เหมือนเดิมเป๊ะ ซึ่งคือปัญหาที่ตั้งใจจะแก้
>
> **ข้อเสนอฉบับแก้ (เข้มเท่าเดิม แต่ใช้งานได้):**
> 1. `link` ได้ **เฉพาะภายใน `supabase-platform/` และเฉพาะ ref ของ staging เท่านั้น**
> 2. **ref ของทริป `ejzibhgqhxdzkovsnpds` ห้ามปรากฏใน `supabase-platform/` ทุกไฟล์** — เพิ่ม step ใน CI
>    ที่ `grep` หา ref นี้ทั้งโฟลเดอร์แล้ว fail ทันทีถ้าเจอ (ด่านที่ทำงานแม้คนตั้งใจ ไม่ใช่แค่ตอนพลาด)
> 3. **`SUPABASE_ACCESS_TOKEN` ยังห้ามอยู่ใน shell profile** — ให้ใส่หน้าคำสั่งเป็นครั้งๆ ไป
>    (`SUPABASE_ACCESS_TOKEN=… supabase db push --workdir supabase-platform`) เพื่อให้ทุกครั้งที่มีสิทธิ์เขียน
>    เป็นการตัดสินใจที่รู้ตัว ไม่ใช่สิทธิ์ที่ค้างอยู่ในทุก terminal ที่เปิด
> 4. เจตนาเดิมยังอยู่ครบ: **ไม่มีทางที่คำสั่งเผลอๆ จะไปแตะ `ejzibhgqhxdzkovsnpds` ได้**

### 1.3 โครงโฟลเดอร์ที่ไม่ชนกติกาเหล็กข้อ 3

กติกาเหล็กข้อ 3 ของ `docs/engine/README.md:16` บอกว่า SQL แพลตฟอร์มต้องอยู่ `docs/engine/schema/` เท่านั้น
แต่ Supabase CLI **บังคับ** ให้ migration อยู่ที่ `<workdir>/supabase/migrations/` เปลี่ยน path ไม่ได้
สองข้อนี้ชนกันตรงๆ — ทางออกคือ **แยก workdir คนละอันไปเลย ไม่ใช่แยกโฟลเดอร์ย่อย**:

```
plan-korea/
├── supabase/migrations/          ← 31 ไฟล์ของทริปจริง · 🔴 แช่แข็ง ห้ามเพิ่ม/แก้/ลบ
│                                    (จนถึง 21 ต.ค. และหลังจากนั้นก็ยังเป็นของ DB ทริป)
├── docs/engine/schema/           ← ร่าง DDL ของแพลตฟอร์ม (P1) · แหล่งความจริงของ "อยากได้อะไร"
└── supabase-platform/            ← ⬅ ระยะ 2 ค่อยสร้าง · workdir แยกของ dev DB
    ├── config.toml               ← project_id = "plan-korea-platform" (คนละชื่อ กันสับสน)
    ├── migrations/               ← migration จริงของแพลตฟอร์ม (แปลงจาก docs/engine/schema/)
    └── seed.sql                  ← ข้อมูลตัวอย่างหลายทริป/หลายผู้ใช้
```

**ทำไมแยก workdir ถึงกันพลาดได้จริง:** ทุกคำสั่งต้องพิมพ์ `--workdir supabase-platform` หรือ `cd` เข้าไปก่อน
คำสั่งที่พิมพ์เผลอๆ ที่ root จะ error ทันที ไม่ใช่เผลอไปรันใส่ของทริป
🔴 **แก้ 24 ส.ค. 2026 — เหตุผลที่เขียนไว้เดิมผิด** · เดิมเขียนว่ารากพังเพราะ "ไม่มี `config.toml`"
ของจริงบน CLI 2.114.0 มัน error ว่า **`Cannot find project ref. Have you run supabase link?`**
→ สิ่งที่กันอยู่จริงคือ **สถานะ `link` ซึ่งแยกตาม workdir** ไม่ใช่ `config.toml`
⚠️ ต่างกันตรงที่ **ถ้ารากถูก link เมื่อไหร่ เกราะนี้หายทันที** — ดูกับดักใน `§12.1`
(ยังไม่ได้พิสูจน์ว่า `config.toml` ที่หายไปจะกัน `db push` ได้เองบนรากที่ link แล้วหรือไม่ ·
ทดสอบไม่ได้โดยไม่สร้างอันตรายเอง จึงไม่เคลม)

⚠️ ข้อแลก: `supabase/migrations/` ของทริปจะ **ไม่ถูกรันเข้า dev DB โดยอัตโนมัติ** ซึ่ง**เป็นเรื่องดี** —
schema แพลตฟอร์มต่างจาก schema ทริปเยอะมาก (มี `trip_id`, identity, tenancy — ดู B1–B6 ใน README)
การเอา 31 ไฟล์เดิมไปกองรวมจะทำให้ dev DB เป็นลูกผสมที่ไม่ตรงกับอะไรเลย

### 1.4 คำสั่งครบวงจร (ระยะ 2)

🔴 **ยังไม่มีอยู่จริงสักตัว — อย่าอ่านบล็อกข้างล่างว่าเป็นกลไกที่มีแล้ว** (ตรวจ 24 ส.ค. 2026)
`grep '"db:' package.json` → **0 บรรทัดทั้งสองทรี** · `package.json` วันนี้มีแค่ `build` `dev` `lint` `start` `test`
**เอกสารที่บรรยายกลไกกันพลาดที่ยังไม่มีอยู่ อันตรายกว่าไม่เขียนเลย** เพราะคนอ่านจะเชื่อว่ามีของกันอยู่ (P1 ชี้)
วันนี้จึงต้อง **พิมพ์ `--workdir supabase-platform` เองทุกครั้ง** — รวมทั้ง `db push`

ข้างล่างคือ *ข้อเสนอ* สำหรับระยะ 2 — **วันนี้ยังไม่แก้ `package.json` เพราะเป็นไฟล์นอกโซนผม**
🔴 **ถ้าวันหนึ่งใส่จริง ต้องรื้อ 2 อย่างก่อน:**
1. **เพิ่ม `db:push`** — เป็นคำสั่งเดียวที่ `§1.2` บอกเองว่าอันตรายที่สุด แต่กลับเป็นตัวเดียวที่ไม่มีตัวห่อ
   ทั้งที่ `db:reset` ซึ่งอันตรายพอกันยังมี (P8 ชี้ 24 ส.ค. 2026)
2. **ตัด `db:start`/`db:stop`/`db:status`** — เป็นคำสั่งของ local stack ซึ่ง **D14 ทำให้ตกรุ่นไปแล้ว**

```jsonc
{
  "scripts": {
    "db:start":  "supabase start  --workdir supabase-platform",
    "db:stop":   "supabase stop   --workdir supabase-platform",
    "db:status": "supabase status --workdir supabase-platform",
    "db:new":    "supabase migration new --workdir supabase-platform",
    "db:up":     "supabase migration up  --workdir supabase-platform",
    "db:reset":  "supabase db reset      --workdir supabase-platform",
    "db:diff":   "supabase db diff       --workdir supabase-platform",
    "db:lint":   "supabase db lint       --workdir supabase-platform"
  }
}
```

| งาน | คำสั่ง | หมายเหตุ |
|---|---|---|
| ครั้งแรกสุด | `supabase init --workdir supabase-platform` | สร้าง `config.toml` |
| เปิด stack | `npm run db:start` | ครั้งแรกโหลด image ~6 GB ใช้เวลานาน · ครั้งต่อไป ~30 วิ |
| ดู URL/key | `npm run db:status` | พิมพ์ anon key + **service_role key** ของ local ออกมา |
| เขียน migration ใหม่ | `npm run db:new add_trips_table` | สร้างไฟล์ `<timestamp>_add_trips_table.sql` |
| รัน migration ที่ค้าง | `npm run db:up` | รันเฉพาะที่ยังไม่เคยรัน (track ในตาราง — ดู 1.6) |
| **ล้างแล้วสร้างใหม่หมด** | `npm run db:reset` | drop → รัน migration ทุกไฟล์เรียงลำดับ → รัน `seed.sql` |
| ตรวจ policy/schema | `npm run db:lint` | จับ RLS ที่เปิดตารางแต่ไม่มี policy ได้ — มีประโยชน์กับ B2 มาก |
| ปิด (คืน RAM) | `npm run db:stop` | ข้อมูลยังอยู่ · `--no-backup` ถึงจะลบ volume |

**หน้าเว็บที่ได้เมื่อ start สำเร็จ:** Studio `http://localhost:54323` · API `http://localhost:54321`
· Postgres `postgresql://postgres:postgres@localhost:54322/postgres` · กล่องอีเมลจำลอง `http://localhost:54324`

### 1.5 🔴 อะไรทดสอบบนเครื่องไม่ได้ — ตอบตรงคำถาม P1

P1 ถามเพราะแพลตฟอร์มพึ่ง Realtime หนัก ผมตรวจแล้วได้ **10 hooks** ที่เปิด `postgres_changes` จริง
(`hooks/usePlans.ts` · `useStops.ts` · `useHotels.tsx` · `useBookings.tsx` · `useChecklist.ts`
· `useCustomPlaces.tsx` · `useHiddenPlaces.ts` · `useDaySettings.ts` · `useOvernightOverrides.ts`
· `usePlaceNotes.ts` — 11 จุดเรียกรวม)

| ความสามารถ | local ทดสอบได้ไหม | รายละเอียด |
|---|---|---|
| **Realtime `postgres_changes`** | ✅ **ได้เต็ม** | container `realtime` อยู่ในชุด · ต้องตั้ง `REPLICA IDENTITY FULL` + ใส่ตารางใน publication `supabase_realtime` เหมือนคลาวด์เป๊ะ (`0009_trip_stops_replica_identity.sql` ทำแบบนี้อยู่แล้ว) |
| Realtime Broadcast / Presence | ✅ ได้ | |
| **RLS + `auth.uid()`** | ✅ **ได้เต็ม** | สำคัญที่สุดสำหรับ B2 (53 policy `using (true)`) — เทสต์ของ P4 รันที่นี่ได้ ดูข้อ 2.3 |
| Auth: email/password, magic link | ✅ ได้ | อีเมลไม่ได้ส่งออกจริง ไปโผล่ที่ Inbucket `:54324` แทน |
| **Auth: OAuth provider ภายนอก** (Google/Apple/Kakao) | ⚠️ **ได้ครึ่งเดียว** | ต้องมี client id/secret จริง + ตั้ง callback เป็น `http://localhost:54321/auth/v1/callback` ในคอนโซลผู้ให้บริการ · flow ที่ผูกกับโดเมนจริง (Apple, Kakao) ทดสอบครบบนเครื่องไม่ได้ → **ต้องมีชั้น preview** ดูข้อ 3 |
| Storage | ✅ ได้ | เก็บลงดิสก์ผ่าน imgproxy — **แต่ไม่มี CDN** ความเร็ว/แคชวัดจากที่นี่ไม่ได้ |
| Edge Functions (Deno) | ✅ ได้ | `supabase functions serve` — โปรเจกต์นี้ยังไม่มีสักตัว |
| `pg_cron` / `pg_net` | ✅ ได้ | ต้องเปิด extension ใน migration เอง |
| **Connection pooler ที่พฤติกรรมเหมือน prod** | ❌ **ไม่ได้** | local เชื่อมตรง Postgres · ปัญหา pool exhaustion/prepared statement ของ Supavisor จะโผล่เฉพาะบนคลาวด์ |
| **PITR / backup / read replica** | ❌ ไม่ได้ | ของ Pro tier ล้วน |
| **ประสิทธิภาพ/ขนาดจริง** | ❌ ไม่ได้ | Mac M-series แรงกว่า instance free tier มาก · **ห้ามสรุปว่า query เร็วพอจากตัวเลขบนเครื่อง** |
| Log drain / Analytics | ❌ ไม่ได้ | |
| Custom domain / SSL | ❌ ไม่ได้ | |

**บทสรุปที่ P1 ต้องรู้:** **Realtime กับ RLS ซึ่งเป็น 2 เรื่องที่แพลตฟอร์มพึ่งมากที่สุด ทดสอบบนเครื่องได้เต็ม**
ของที่ทดสอบไม่ได้คือของที่ต้องมี **preview environment บนคลาวด์** มาปิดช่อง (ข้อ 3) —
โดยเฉพาะ OAuth provider และ pooler ซึ่งเป็น 2 จุดที่ "รันบนเครื่องผ่าน แต่ขึ้นจริงพัง" เกิดบ่อยที่สุด

> ✅ **มติ D14 ตัดปัญหานี้ทิ้งทั้งตาราง (17 ส.ค. 2026)** — ย้าย staging ขึ้นคลาวด์เลย ทุกช่อง ❌ ในตารางข้างบน
> กลายเป็น ✅ หมด รวมทั้ง OAuth และ pooler · **ตารางนี้เก็บไว้เพราะมันคือเหตุผลที่มติออกมาแบบนี้**
> ไม่ใช่เพราะยังใช้อยู่ · ถ้าวันหนึ่งมีคนเสนอย้ายกลับไป Docker เพื่อประหยัด ให้กลับมาอ่านตารางนี้ก่อน
>
> 🔴 **ราคาที่จ่ายแลกมา — P4 ชี้ถูกและผมรับทั้ง 3 ข้อ (ดู 2.4):** staging เปลี่ยนสถานะจาก
> *"ของฉัน พังก็ `db reset`"* เป็น ***"ของกลางที่ 8 เซสชันใช้ร่วมกัน และ free tier ไม่มี PITR ให้กู้"***

### 1.6 ย้าย 31 migration เข้าระบบที่ track ได้

**สถานะจริง:** `supabase/migrations/0001_init.sql` … `0031_bookings_walkup_status.sql`
ไม่มีตารางไหนบันทึกว่ารันอันไหนไปแล้ว — "รู้" ผ่าน `PLAN.md §4` กับความจำของผู้ใช้เท่านั้น
(`memory` ของโปรเจกต์บันทึกว่า 0001–0031 ลงครบแล้ว)

Supabase CLI track ด้วยตาราง `supabase_migrations.schema_migrations` (คอลัมน์ `version`)
โดยอ่าน `version` จากตัวเลขนำหน้าชื่อไฟล์ · ไฟล์เดิมเป็น `0001`–`0031` ส่วนไฟล์ใหม่ CLI จะตั้งเป็น
`YYYYMMDDHHMMSS` (14 หลัก) — **ปนกันได้เพราะเรียงเป็นสตริงแล้ว `0031` < `20261022…` อยู่แล้ว**
แต่ผมยังไม่แนะนำให้ปน ด้วยเหตุผลข้อ 1.3

**แผน 3 ทาง เรียงตามความเสี่ยงจากน้อยไปมาก** — ✅ **P1 ตัดสินแล้ว: เอาทาง A** (17 ส.ค. 2026)
เหตุผลที่ปิดการถกเถียง: **ทาง B เพิ่มความเสี่ยงเพื่อแลกกับความสะดวก** การทำให้ `db push` "รู้จัก" DB ทริป
คือสิ่งที่แผนทั้งหมดนี้พยายามกันมาตลอด · ทาง C ตกไปเพราะ `PLAN.md` อ้างเลข `0025`/`0031` ไว้หลายจุด
เก็บทาง B/C ไว้ในเอกสารเพื่อไม่ให้มีคนเสนอซ้ำโดยไม่รู้ว่าเคยพิจารณาแล้ว

**ทาง A — ไม่แตะของทริปเลย ✅ เลือกทางนี้ (ทำในระยะ 2 ได้ทันที)**
`supabase/migrations/` ถือว่าแช่แข็งถาวรในฐานะ "ประวัติศาสตร์ของ DB ทริป"
แพลตฟอร์มเริ่ม migration `0001` ของตัวเองใน `supabase-platform/migrations/` จากศูนย์
ข้อมูลทริปจริงย้ายเข้าแพลตฟอร์มผ่าน **สคริปต์ย้ายข้อมูล ไม่ใช่ migration** (คือ `E7` ในลำดับระยะ 2)
> ✅ ความเสี่ยงต่อ DB ทริป = 0 · ✅ ไม่ต้องรอทริปจบก็เริ่มเขียนได้ · ⚠️ ไม่ได้แก้ปัญหา "DB ทริปไม่มี track"

**ทาง B — baseline ให้ DB ทริปด้วย (ทำหลัง 21 ต.ค. เท่านั้น)**
ถ้าผู้ใช้อยากให้ DB ทริปมี track ด้วย รัน SQL นี้ **ครั้งเดียว** ใน SQL Editor ของ `ejzibhgqhxdzkovsnpds`
มันแค่ "บันทึกว่ารันไปแล้ว" **ไม่รัน DDL อะไรทั้งสิ้น ไม่แตะข้อมูล**:

```sql
-- ⚠️ รันที่ https://supabase.com/dashboard/project/ejzibhgqhxdzkovsnpds/sql/new เท่านั้น
-- ⚠️ หลัง 21 ต.ค. 2026 เท่านั้น · สแตมป์ว่า 0001–0031 รันไปแล้ว โดยไม่รันซ้ำ
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name)
values ('0001','init'), ('0002','trip_hotels'), ('0003','trip_plans')
       -- … ครบถึง ('0031','bookings_walkup_status')
on conflict (version) do nothing;
```

> ⚠️ ทางนี้ทำให้ `supabase db push` "คิดว่ารู้จัก" DB ทริป ซึ่ง**เพิ่มความเสี่ยง** ที่คนจะเผลอ push
> ถ้าเลือกทางนี้ กติกา 1.2 (ห้าม link · ห้ามมี access token) ยิ่งต้องเข้มขึ้น
> **ผมไม่แนะนำ เว้นแต่ผู้ใช้อยากได้จริงๆ** — ประโยชน์น้อยกว่าความเสี่ยงมาก

**ทาง C — เปลี่ยนชื่อไฟล์เดิมเป็น timestamp** ❌ **ไม่เอา**
ทำให้ประวัติ git อ่านไม่ออก และ `PLAN.md` อ้างเลข `0025`/`0031` ไว้หลายจุด จะเพี้ยนหมด

### 1.7 กันสลับโปรเจกต์ผิด โดยไม่ต้องเขียน ref ลงไฟล์ที่ commit (P1 มอบ 17 ส.ค. 2026)

**โจทย์:** `PLAN.md §5` เขียน ref `ejzibhgqhxdzkovsnpds` + ลิงก์ SQL Editor ไว้**โดยตั้งใจ** เพื่อกันสลับโปรเจกต์ผิด
(เคยพลาดจริง — รัน `0029` ลง mu-phone แล้วได้ `relation "public.custom_places" does not exist`)
**เหตุผลนั้นดีและยังจริงอยู่** แต่เขียนตอนไม่มีใครคิดว่า repo เป็น public

#### 🔴 ก่อนออกแบบ — ต้องแก้สมมติฐานใต้โจทย์ก่อน: **ref ไม่ใช่ความลับอยู่แล้ว และ repo private ไม่ทำให้มันเป็นความลับ**

ตรวจจากโค้ดจริงวันนี้ (17 ส.ค. 2026):
- `lib/supabase.ts:3` อ่าน `NEXT_PUBLIC_SUPABASE_URL` → **Next inline ค่านี้ลง client bundle** (คำนำหน้า `NEXT_PUBLIC_`)
- ไฟล์นี้ถูก import จาก **39 ไฟล์ฝั่ง client** (hooks/components) → มันอยู่ในบันเดิลแน่นอน
- `proxy.ts:71` matcher = `"/((?!_next|favicon.ico|...).*)"` → **ตัด `_next` ออกทั้งก้อน ด่าน PIN ไม่แตะบันเดิล**
- URL ของ Supabase **มี ref อยู่ในตัวมันเอง** (`https://<ref>.supabase.co`)

→ **ใครก็ตามที่เปิด `korea-trip-plan-one.vercel.app` แล้วโหลด JS ได้ ก็ได้ ref ไปแล้ว โดยไม่ต้องผ่าน PIN
และโดยไม่ต้องดู repo เลย**

**ผลต่อข้อเสนอของ P1 — ผมสนับสนุน แต่ขอให้นับค่าให้ถูก:**
- ✅ **เปลี่ยน repo เป็น private = ควรทำ** ราคาถูก ไม่มีข้อเสีย และซ่อนของอื่นที่มีค่าจริง
  (เอกสารออกแบบทั้งชุดใน `docs/engine/` · ข้อมูลทริป · การวิเคราะห์ช่องโหว่ที่เราเขียนเอง)
- ❌ **แต่การลบ ref ออกจาก `PLAN.md` ให้ค่าด้านความปลอดภัยเกือบเป็นศูนย์** — ที่อยู่รั่วผ่านเว็บสาธารณะอยู่แล้ว
- 🔴 **สิ่งที่ปิดช่องนี้จริงมีอย่างเดียวคือ RLS (B2 / `E1`)** ซึ่งอยู่หัวลำดับระยะ 2 อยู่แล้ว
  **อย่าให้การจัดระเบียบ `PLAN.md` ถูกนับว่าเป็นการปิดความเสี่ยงนี้** — มันคนละเรื่องกัน

**→ ดังนั้นผมออกแบบข้อนี้ในฐานะ "กันคนทำพลาด" ไม่ใช่ "กันคนไม่หวังดี"** ซึ่งเป็นเจตนาเดิมของ `PLAN.md §5` พอดี

#### ด่านที่ 1 (สำคัญที่สุด) — ให้ **ตัว DB ปฏิเสธเอง** ไม่ใช่ให้คนอ่านป้ายแล้วระวัง

ปัญหาของกติกาปัจจุบันคือมันเป็น **ป้าย** — พึ่งให้คนอ่านและจำ · ท่าที่ถูกคือ **ด่านที่ทำงานตอนคนพลาด**
ให้ทุก migration ขึ้นต้นด้วยบล็อกนี้ **ก่อน DDL ทุกบรรทัด**:

```sql
-- ด่านกันรันผิดโปรเจกต์ — ต้องเป็นบล็อกแรกของทุกไฟล์ · ไม่มี ref ไม่มีความลับอยู่ในนี้
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trip_meta'
  ) then
    raise exception 'ผิดโปรเจกต์: ฐานนี้ไม่มีตาราง trip_meta — นี่ไม่ใช่ DB ของ plan-korea';
  end if;
end $$;
```

**ทำไมท่านี้ชนะป้าย:**
- **หยุดที่วินาทีที่พลาด** ไม่ใช่ตอนอ่านเอกสารล่วงหน้า · `raise exception` ทำให้ทั้ง transaction ถูก rollback
- **ไม่มี ref ไม่มี URL ไม่มีความลับในไฟล์** — อ้างชื่อตารางซึ่งอยู่ใน schema อยู่แล้ว
- **ข้อความบอกทันทีว่าผิดยังไง** ไม่ใช่ `relation ... does not exist` กลางไฟล์แบบครั้งที่แล้ว
- **ใช้ได้กับทุกโปรเจกต์** — mu-phone ใส่บล็อกเดียวกันโดยเปลี่ยนชื่อตารางเป็นของตัวเอง

**ท่าที่ดีกว่าสำหรับแพลตฟอร์ม (ระยะ 2):** migration แรกสร้างตารางระบุตัวตนไปเลย
`create table public._project_identity (name text primary key);` แล้ว insert `'plan-korea-staging'` /
`'plan-korea-prod'` · migration ถัดๆ ไป assert ค่านั้นแทนการเดาจากชื่อตาราง — **ชัดเจนกว่าและไม่ผูกกับ schema
ที่จะเปลี่ยนไปเรื่อยๆ**

#### ด่านที่ 2 — ref ย้ายไปอยู่ในไฟล์ที่ไม่ถูก commit แล้วให้สคริปต์เป็นคนเปิดลิงก์

`.env.local` ถูก ignore อยู่แล้ว (`.gitignore:34` `.env*` — และ P1 ยืนยันแล้วว่าไม่มี key หลุดใน git)
เพิ่ม `SUPABASE_PROJECT_REF` ที่นั่น แล้วให้เอกสารอ้าง **ชื่อตัวแปร ไม่ใช่ค่า**:

```jsonc
// package.json — ระยะ 2 (วันนี้ยังไม่แก้ ไฟล์อยู่นอกโซนผม)
"db:sql": "node -e \"require('fs').readFileSync('.env.local','utf8').match(/SUPABASE_PROJECT_REF=(.*)/)&&console.log('https://supabase.com/dashboard/project/'+RegExp.$1+'/sql/new')\""
```

→ `PLAN.md §5` เปลี่ยนจาก *"ลิงก์ตรงไป SQL Editor: `https://…/ejzibhgqhxdzkovsnpds/…`"*
เป็น *"รัน `npm run db:sql` เพื่อเปิด SQL Editor ของโปรเจกต์ที่ตั้งไว้ใน `.env.local`"*
**ได้ความสะดวกเท่าเดิม ไม่มี ref ใน git และคนละเครื่องได้ลิงก์ของโปรเจกต์ตัวเอง**

#### ด่านที่ 3 — CI ยืนยันว่า link อยู่กับ staging (แบบ allowlist)

🔴 **ผมเจอว่า step CI ที่ผมเสนอไว้เองใน 2.4 ทำผิดข้อนี้เสียเอง** — มันเขียน
`grep -rn "ejzibhgqhxdzkovsnpds" supabase-platform` ซึ่ง**ก็คือการเขียน ref ลงไฟล์ที่ commit**
แก้เป็น **allowlist เทียบกับ secret** แล้ว (ดูโค้ดใน 2.4) — ดีกว่าเดิม 2 ทาง: ไม่มี ref ใน repo
**และจับได้ทุกโปรเจกต์ที่ผิด ไม่ใช่แค่ของทริป**

#### สรุปสิ่งที่ต้องทำ (ระยะ 2 — วันนี้ยังไม่แตะ `PLAN.md`)

| # | ทำอะไร | ไฟล์ | ใคร |
|---|---|---|---|
| 1 | บล็อก assert หัวไฟล์ทุก migration (คู่กับ rollback SQL ที่รับไปแล้ว) | `supabase-platform/migrations/*` | P6 + P1 |
| 2 | `SUPABASE_PROJECT_REF` เข้า `.env.local` + `.env.example` | 2 ไฟล์ | P6 |
| 3 | `npm run db:sql` แทนลิงก์ตรง | `package.json` | P1 (เจ้าของไฟล์) |
| 4 | `PLAN.md §5` เลิกเขียน ref/URL อ้างสคริปต์แทน | `PLAN.md` | **P1 เท่านั้น** |

🔴 **ลำดับบังคับของข้อ 4 — P1 ตัดสิน 17 ส.ค. 2026:** **ห้ามถอดป้ายก่อนที่ด่าน ① จะมีจริง**
`PLAN.md §5` ที่บอกให้ระบุ ref ทุกครั้ง **เป็นป้ายที่กำลังทำงานอยู่** · ถ้าลบมันตอนที่ยังไม่มีบล็อก
`raise exception` หน้า migration เราจะได้ช่วงเวลาที่**ไม่มีทั้งป้ายและด่าน** ซึ่งแย่กว่าสถานะวันนี้
**ปล่อยป้ายที่ทำงานอยู่ไว้ก่อน ดีกว่าถอดป้ายแล้วยังไม่มีด่าน**
| 5 | CI assert linked ref เทียบ secret | `.github/workflows/ci.yml` | P6 |

#### ⚠️ ตรวจตัวเองก่อนเสนอให้คนอื่นแก้ — **เอกสารฉบับนี้เขียน ref ไว้ 12 จุด**

`grep -c` ในไฟล์นี้ได้ **12** · ถ้าทีมรับกติกาว่า *"ห้ามเขียน ref ลงไฟล์ที่ commit"* **เอกสารของผมเองก็ผิดกติกา**
และไฟล์อื่นใน `docs/engine/` น่าจะมีอีก → **งานนี้ใหญ่กว่าการแก้ `PLAN.md` ไฟล์เดียวมาก**

**ข้อเสนอของผมคือ อย่าตั้งกติกาแบบ "ห้ามเขียน ref" ตั้งแต่แรก** เพราะ:
1. **ref ไม่ใช่ความลับ** — รั่วผ่านบันเดิลสาธารณะอยู่แล้ว (ย่อหน้าบนสุดของ 1.7) การไล่ลบจึงเป็นงานที่**รู้สึกเหมือนปิดช่อง แต่ไม่ได้ปิดอะไร**
2. **สิ่งที่มีค่าจริงคือเปลี่ยนจากป้ายเป็นด่าน** (ด่าน 1–3 ข้างบน) ซึ่งทำได้โดยไม่ต้องลบสักตัวอักษร
3. ที่ที่ ref **ไม่ควรอยู่จริงๆ** มีชุดเดียวคือ **ไฟล์ที่เครื่องจักรอ่านแล้วทำตาม** — `supabase-platform/`,
   `.github/workflows/`, `package.json` scripts · เพราะที่นั่น ref ที่ผิดแปลว่า**คำสั่งวิ่งไปผิดที่** ไม่ใช่แค่เอกสารล้าสมัย
   (นี่คือเหตุผลที่ผมแก้ step CI ของตัวเองใน 2.4 — ไม่ใช่เพราะความลับ แต่เพราะมันเป็นไฟล์ที่เครื่องทำตาม)

🔴 **สรุปสิ่งที่ผมแนะนำให้ P1 ตัดสิน:** เอกสารเชิงบรรยาย (`PLAN.md`, `docs/engine/*.md`) **เขียน ref ต่อไปได้**
ถ้ามันช่วยให้คนเข้าใจ · แต่ **ห้ามใช้ ref ที่เขียนไว้เป็นกลไกกันพลาด** — กลไกต้องเป็นด่าน 1–3
· และ **repo private ยังควรทำ** ด้วยเหตุผลอื่น (ซ่อนเอกสารออกแบบและข้อมูลทริป) ไม่ใช่เพื่อซ่อน ref

---

## 2. CI — GitHub Actions

### 2.1 ⚠️ ก่อนอื่น: repo นี้มี remote ไหม

`.github/` ไม่มีในโปรเจกต์ · ถ้า repo ยังไม่ได้ push ขึ้น GitHub เลย CI ทั้งหมดในข้อนี้ยังรันไม่ได้
**ต้องถามผู้ใช้ว่ามี GitHub remote หรือยัง และ Vercel deploy ด้วยวิธีไหน (git integration หรือ `vercel` CLI)**
เพราะข้อ 7 (preview per PR) ขึ้นกับคำตอบนี้ทั้งหมด

### 2.2 job หลัก — `ci.yml` (ระยะ 2 ค่อยสร้างไฟล์จริง)

```yaml
# .github/workflows/ci.yml — 🔴 ยังไม่สร้างไฟล์นี้จนกว่าจะถึงระยะ 2
name: CI
on:
  pull_request:
  push:
    branches: [main]

concurrency:                       # PR ที่ push ซ้ำ ยกเลิกรอบเก่าทิ้ง ประหยัดโควตา
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15            # กันงานค้างกินโควตา 6 ชม.
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm               # แคช ~/.npm ให้เอง ไม่ต้องเขียน actions/cache เอง
      - run: npm ci

      - run: npm run lint
      - run: npm test
      - run: npx tsc --noEmit      # ⬅ เพิ่มใหม่: `next build` จับ type error ก็จริง แต่ช้ากว่ามาก
                                   #    และ CI ควรฟ้อง type ก่อนจะไปเสียเวลา build

      - name: Cache .next
        uses: actions/cache@v4
        with:
          path: .next/cache
          key: next-${{ hashFiles('package-lock.json') }}-${{ hashFiles('**/*.[jt]s?(x)') }}
          restore-keys: next-${{ hashFiles('package-lock.json') }}-
      - run: npm run build
        env:                       # build ต้องการ env ครบ ไม่งั้นล้มตอน prerender
          NEXT_PUBLIC_SUPABASE_URL: http://localhost:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.CI_DUMMY_ANON_KEY }}
          NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY: dummy-not-a-real-key
          GOOGLE_MAPS_API_KEY: dummy-not-a-real-key
```

**🔴 หมายเหตุสำคัญของ env ใน build:** ห้ามใส่ key จริงของ Google ใน CI เด็ดขาด (ดูข้อ 0 ย่อหน้าแรก)
`next build` ต้องการแค่ว่า**ตัวแปรมีค่า** ไม่ได้เรียก Google จริงตอน build (ทั้ง 4 หน้าเป็น `"use client"` — B8)
ค่าปลอมจึงพอ · **ถ้าวันหนึ่ง P3 พลิกเป็น Server Component แล้วมี fetch ตอน build ข้อนี้ต้องรื้อใหม่**

### 2.3 🔴 Node 20 หมดอายุแล้ว — ต้องตัดสินใจก่อนตั้ง CI

- เครื่องผู้ใช้: **Node v20.12.2**
- `next@16.3.0` ประกาศ `engines.node: ">=20.9.0"` → ผ่านฉิวเฉียด
- **แต่ Node 20 เข้าสถานะ end-of-life ไปแล้ว (เม.ย. 2026)** วันนี้ 17 ส.ค. 2026 = ไม่มี security patch อีกแล้ว

**ข้อเสนอ:** เพิ่ม `.nvmrc` ที่ root แล้วให้ CI อ่านจากไฟล์นั้น เครื่องคนกับ CI จะไม่มีวันหลุดกัน

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| `.nvmrc` = `20.12.2` (ตรงกับเครื่องวันนี้) | ไม่มีอะไรเปลี่ยน · **ปลอดภัยที่สุดช่วงก่อนทริป** | ใช้ runtime ที่ EOL แล้ว |
| **`.nvmrc` = `22` (แนะนำ ทำหลัง 21 ต.ค.)** | LTS มี patch ถึง เม.ย. 2027 · Vercel รองรับ | ต้องอัป Node บนเครื่อง + เช็คว่า build ผ่าน |

🔴 **ห้ามอัป Node บนเครื่องก่อน 21 ต.ค.** — ถ้า `next dev` พังตอนอยู่เกาหลี ไม่มีใครมาแก้ให้
`.nvmrc` เป็นไฟล์ใหม่ที่ไม่กระทบ runtime ของใคร → **สร้างได้เลยตั้งแต่วันนี้ถ้า P1 อนุมัติ** โดยใส่ `20.12.2` ไปก่อน
แล้วค่อยแก้เป็น `22` ในระยะ 2 พร้อมกับอัปเครื่อง

### 2.4 job เทสต์ RLS บน Supabase local (ตามที่ P1 ขอ — ทำงานร่วมกับ P4)

นี่คือ job ที่ตอบโจทย์ B2 (`53 policy = using (true)`) โดยตรง — **แต่ยังรันไม่ได้จนกว่า P4 จะเขียนเคสเสร็จ
และจนกว่าจะมี schema แพลตฟอร์มใน `supabase-platform/migrations/`**

```yaml
# job ที่ 2 ใน ci.yml — 🔴 ระยะ 2
  rls:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - uses: supabase/setup-cli@v1
        with: { version: latest }

      # 🔴 ด่านที่ต้องมาก่อนทุกอย่าง — ยืนยันว่า link ไปที่ staging เท่านั้น (ดู 1.2 · 1.7)
      # ⚠️ เดิมผมเขียน step นี้เป็น `grep` หา ref ของทริปตรงๆ ซึ่ง **เขียน ref ลงไฟล์ที่ commit เสียเอง**
      # ฉบับนี้กลับด้านเป็น allowlist: เทียบกับ secret แทน · ไม่มี ref อยู่ใน repo และจับได้ทุกโปรเจกต์ที่ผิด
      # ไม่ใช่แค่ของทริป
      - name: assert linked project is staging
        run: |
          linked=$(cat supabase-platform/.temp/project-ref 2>/dev/null || echo "none")
          [ "$linked" = "${{ secrets.STAGING_PROJECT_REF }}" ] \
            || { echo "🔴 link อยู่กับโปรเจกต์ที่ไม่ใช่ staging — หยุด"; exit 1; }

      - run: supabase db lint --workdir supabase-platform   # จับตารางที่เปิด RLS แต่ไม่มี policy
      - run: npm run test:rls
        env:
          # ชี้ไปที่ staging บนคลาวด์ (D14) — ห้ามใส่ค่าของ ejzibhgqhxdzkovsnpds ที่นี่ ไม่ว่ากรณีใด
          SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.STAGING_SERVICE_ROLE_KEY }}
          TEST_RUN_ID: ${{ github.run_id }}-${{ github.run_attempt }}   # namespace ของ fixture
```

### 2.4.1 🔴 3 ข้อที่ P4 ชี้ว่าเป็นผลตามมาของ D14 — ผมรับทั้งหมด

staging เปลี่ยนจาก *"ของฉัน ทิ้งได้"* เป็น *"ของกลาง 8 เซสชันใช้ร่วมกัน ไม่มี PITR"* → 3 ข้อนี้กลายเป็นของบังคับ:

**① fixture ต้องมี namespace ต่อรอบ · ห้าม `truncate` ห้ามลบแบบกวาด**
ทุกแถวที่เทสต์สร้างต้องมีคอลัมน์ (หรือ prefix) ที่ผูกกับ `TEST_RUN_ID` และการล้างต้องลบ **เฉพาะ run ตัวเอง**
เหตุผลที่เข้มขนาดนี้: 8 เซสชันแชร์ tree เดียวกัน + CI รันซ้อนกันได้ + **free tier ไม่มี PITR — กวาดผิดแล้วจบ**
🔴 **`supabase db reset` ห้ามใช้กับ staging เด็ดขาด** — คำสั่งนี้เกิดมาเพื่อ local ที่ทิ้งได้

**② ต้องทน cold start ที่ต้นเหตุ ไม่ใช่ใส่ `retry`**
Supabase free หลับหลัง 7 วัน · request แรกหลังตื่นช้ามาก → เทสต์ RLS จะแดงเป็นครั้งๆ โดยไม่มีใครแก้อะไร
🔴 **P4 พูดถูกและผมอยากย้ำ: นี่คือวิธีที่เทสต์ความปลอดภัยตายจริง โดยไม่มีใครลบมันสักบรรทัด**
คนจะค่อยๆ เชื่อว่า *"เทสต์ RLS มันแดงเองอยู่แล้ว"* แล้ว rerun ผ่านไป — วันที่มันแดงเพราะ policy พังจริง จะไม่มีใครเชื่อมัน
**แก้ที่ต้นเหตุ 2 ชั้น ไม่ใช่ `retry` รอบเทสต์:**
- **ชั้นกัน:** GitHub Actions `schedule` ปลุก staging ทุกวัน (`E0-AC7`) — staging ไม่หลับก็ไม่มี cold start
- **ชั้นรับ:** step *ก่อน* เทสต์ ที่ยิง health check แล้วรอจนตอบ 200 (มี timeout ชัดเจน) — **แยก "DB ยังไม่ตื่น"
  ออกจาก "เทสต์ล้ม" ให้เป็นคนละ step** เพื่อให้ผลแดงมีความหมายเดียวเสมอ

**③ service-role key ของ staging จะอยู่ใน CI secret → assertion ตรวจ `role` เป็นของบังคับ**
เดิมการ "เผลอใช้ service role" ต้องตั้งใจทำ · ตอนนี้ key นอนอยู่ใน env ของ job เดียวกัน **หยิบมาใช้ได้ทันที**
และเทสต์ที่ใช้ service role จะ **เขียวหลอกทุกเคส** เพราะมัน bypass RLS ทั้งหมด
→ **ทุกเคสต้อง assert ว่า JWT ที่ใช้ยิงมี `role` เป็นผู้ใช้จริง ไม่ใช่ `service_role` ก่อนรันเคส**
service role ใช้ได้เฉพาะขั้นตอน setup/teardown ของ fixture เท่านั้น

**รูปแบบเทสต์ที่ผมแนะนำให้ P4 ใช้** (เขียนไว้ให้ P4 พิจารณา ไม่ใช่คำสั่ง):
เทสต์ RLS ที่มีค่าคือเทสต์ที่ **สร้างผู้ใช้ 2 คนจริง แล้วพิสูจน์ว่าคนที่ 2 อ่าน/เขียนของคนที่ 1 ไม่ได้**
ต้องยิงผ่าน PostgREST ด้วย JWT ของแต่ละคน ไม่ใช่ต่อ Postgres ตรงด้วย service role (ซึ่ง bypass RLS ทั้งหมด)
เคสที่ต้องมีอย่างน้อย: **select ข้ามทริป · insert ปลอม `trip_id` · update แถวคนอื่น · delete แถวคนอื่น
· และเคสที่โดนลืมบ่อยที่สุด: `upsert`** ← `travel_time_cache` ในกล่องบั๊กของ README คือตัวอย่างจริงที่
policy ขาด `UPDATE` แล้วไม่มีใครรู้ เพราะไม่มีเทสต์ upsert

⚠️ `vitest.config.mts` วันนี้ตั้ง `environment: "node"` อันเดียว · เทสต์ RLS ใช้ node ได้ (ยิง HTTP)
แต่ถ้า P4 อยากได้ component test ด้วยต้องเพิ่ม projects/jsdom — **นั่นเป็นเรื่องของระยะ 2 และเป็นไฟล์นอกโซนผม**

### 2.5 ทำ CI ให้เร็ว

| เทคนิค | ประหยัด |
|---|---|
| `cache: npm` ใน setup-node | `npm ci` จาก ~60 วิ → ~15 วิ |
| แคช `.next/cache` | build ครั้งที่ 2+ เร็วขึ้นชัด (Next reuse compiler cache) |
| `concurrency` + `cancel-in-progress` | ไม่เผาโควตากับ commit ที่ถูกทับแล้ว |
| แยก `rls` เป็นคนละ job | job แรกฟ้อง lint error ใน ~1 นาที ไม่ต้องรอ Docker บูต |
| `timeout-minutes` ทุก job | กันงานค้าง 6 ชั่วโมงตามค่า default |
| ไม่ใส่ `matrix` หลาย Node version | โปรเจกต์นี้ deploy บน runtime เดียว ไม่มีเหตุผลต้องเทสต์หลายเวอร์ชัน |

**โควตา:** repo ส่วนตัวได้ 2,000 นาที/เดือนบนแผนฟรี · ประมาณการ ~4 นาที/PR (verify) + ~6 นาที (rls)
= ~10 นาที/PR → **~200 PR/เดือนถึงจะเต็ม** เหลือเฟือ · ถ้า repo เป็น public จะฟรีไม่จำกัด

---

## 3. Environment strategy

### 3.1 วันนี้: env เดียว 8 ตัว

ตรวจจากโค้ดจริง — `process.env.*` ที่ถูกอ้างในแอป:

| ตัวแปร | จำนวนจุดที่ใช้ | อยู่ใน `.env.local` ไหม | ฝั่ง |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | 7 | ✅ | server เท่านั้น |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` | 3 | ✅ | **ขึ้น bundle** (ตั้งใจ — มี Websites restriction) |
| `NEXT_PUBLIC_SUPABASE_URL` | 2 | ✅ | **ขึ้น bundle** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 2 | ✅ | **ขึ้น bundle** (ตั้งใจ — คือรากของ B3) |
| `TRIP_PIN` | 2 | ✅ | server |
| `TRIP_PIN_SECRET` | 1 | ✅ | server |
| `NODE_ENV` | 2 | — | framework ใส่ให้ |
| `CRON_SECRET` | 1 (`app/api/keep-alive/route.ts:24`) | ❌ **ไม่มีในเครื่อง** | server |

⚠️ **`CRON_SECRET` ไม่มีใน `.env.local`** → บนเครื่อง `/api/keep-alive` **เปิดให้ทุกคน**
(`route.ts:25` เช็ค `secret &&` = ไม่มี secret ก็ปล่อยผ่าน) เป็นดีไซน์ fail-open แบบเดียวกับ `proxy.ts:43`
**บน production ตั้งแล้วและยืนยัน 401 ด้วย curl แล้ว** (`PLAN.md §4` ข้อ 3.5) — บนเครื่องไม่ใช่ปัญหา
แต่ต้องเขียนไว้ใน `.env.example` ไม่งั้นคนใหม่จะไม่รู้ว่ามีตัวแปรนี้อยู่

### 3.2 แพลตฟอร์มต้องมี 3 ระดับ

| ระดับ | DB | ใครใช้ | เกิดเมื่อ |
|---|---|---|---|
| **local** | Supabase local (Docker) | นักพัฒนา/8 เซสชัน | ทุกวัน |
| **preview** | Supabase คลาวด์ **โปรเจกต์ใหม่แยกต่างหาก** | ตรวจ PR · ทดสอบ OAuth · ทดสอบ pooler | ต่อ PR |
| **production** | ⚠️ ตัดสินทีหลัง — ดูกล่องเตือนล่าง | ผู้ใช้จริง | หลัง `E7` |

⚠️ **มติข้อนี้ถูกกลับแล้วโดย D21 — เก็บไว้เพื่อให้เห็นว่าเปลี่ยนเพราะอะไร**
รอบแรก P1 ตัดสินว่า *prod = โปรเจกต์ใหม่* (ตามที่ผมเอน) · **D21 กลับเป็น: prod = DB เดิม แปลง schema ที่เดิม
+ ต้องมีสำเนาแช่แข็งในโปรเจกต์ที่ 2 ก่อนแตะ schema** · ✅ **ผมเห็นด้วยกับ D21** — มันได้ของที่ผมต้องการ
(ย้อนกลับได้) โดยไม่ต้องจ่ายค่าย้ายข้อมูลข้ามโปรเจกต์ และ**ยังตอบโจทย์ `E7` ซ้อม 2 รอบได้เหมือนกัน**

**นับโปรเจกต์ใหม่ตาม D21:** organization ใหม่ถือ **staging + สำเนาแช่แข็ง = 2 พอดี** ← ยังอยู่ในเพดาน
free tier (*"Limit of 2 active projects"* — P1 ยืนยันแล้ว) · **ไม่ต้องจ่าย Pro ตอนนี้**
🔴 **แต่ยังเหลือ 2 ข้อที่ต้องอยู่ในแผน `E7`:**
(ก) **ตอน cutover ต้องมีหน้าต่างที่ DB เดิมเป็น read-only** กันข้อมูลถูกเขียนสองที่ระหว่างแปลง schema —
เป็นเรื่องของโค้ด (`E3`/`E5`) ต้องออกแบบเผื่อตั้งแต่ต้น **ไม่ใช่ไปคิดตอน `E7`**
(ข) **การแปลง schema ที่เดิมคือการแตะ DB ที่ไม่มี PITR** → **อาจต้องจ่าย Pro ชั่วคราวเฉพาะช่วง cutover
เพื่อให้มี PITR** (P8 ทำเป็นทางเลือกไว้แล้ว) — สำเนาแช่แข็งช่วยได้ แต่มันคือ snapshot ณ เวลาหนึ่ง
ไม่ใช่การกู้กลับไปยังวินาทีก่อนคำสั่งที่พลาด

🔴 **preview ต้องไม่ต่อ DB ทริปจริงเด็ดขาด** — ค่า default ของ Vercel คือ **env ของ Production ไหลลง Preview
ถ้าไม่ตั้งค่าที่ scope Preview แยก** ซึ่งแปลว่าถ้าเปิด preview วันนี้โดยไม่ทำอะไร PR ทุกอันจะเขียนใส่ DB ทริปจริง
นี่คือเหตุผลอันดับ 1 ที่ **ห้ามเปิด preview deployment ก่อน 21 ต.ค.**

> 🔴 **P1 ยกข้อนี้ขึ้นเป็นข้อห้ามระดับกติกาเหล็ก (17 ส.ค. 2026)** — เพราะกติกาข้อ 2 (*ห้ามแตะ
> `ejzibhgqhxdzkovsnpds`*) เขียนไว้กันคนพิมพ์คำสั่งผิด แต่**ไม่ได้กันทางนี้เลย** ทางนี้ละเมิดกติกาได้
> โดยไม่มีใครตั้งใจละเมิด และไม่มีคำสั่งไหนถูกพิมพ์ผิดสักตัว

### 3.3 `SUPABASE_SERVICE_ROLE_KEY` — กันไม่ให้หลุดขึ้น client อย่างไร

key นี้ **bypass RLS ทั้งหมด** ถ้าหลุด = ใครก็อ่าน/แก้/ลบข้อมูลทุกทริปของทุกผู้ใช้ได้ทันที
5 ด่านซ้อนกัน (ด่านเดียวไม่พอ):

1. **ชื่อห้ามขึ้นต้นด้วย `NEXT_PUBLIC_`** — Next inline เฉพาะตัวที่ขึ้นต้นแบบนั้นลง bundle
   นี่คือด่านของ framework ที่ทำงานเองอยู่แล้ว แต่พึ่งอย่างเดียวไม่ได้เพราะคนตั้งชื่อผิดได้
2. **แตะได้เฉพาะไฟล์ที่มี `import "server-only"`** — ให้ผิดพลาดตอน build แทนที่จะหลุดตอน runtime
   ท่าที่ผมแนะนำ: ไฟล์เดียวชื่อ `lib/supabaseAdmin.ts` ที่บรรทัดแรกเป็น `import "server-only"`
   และเป็น**ที่เดียวในโปรเจกต์**ที่อ่าน `process.env.SUPABASE_SERVICE_ROLE_KEY`
   ใครเผลอ import ไฟล์นี้เข้า client component → `next build` ล้ม พร้อมบอกว่าไฟล์ไหน
3. **ESLint rule ห้ามอ่านตัวแปรนี้นอกไฟล์นั้น** — `no-restricted-properties` หรือ custom rule
   ทำให้ `npm run lint` (ซึ่ง `PLAN.md §5` บังคับให้ผ่านก่อนบอกว่าเสร็จอยู่แล้ว) เป็นด่านที่ 3
4. **CI grep กันตรงๆ** — step เล็กๆ ที่ล้มทันทีถ้าเจอสตริงนี้ในที่ที่ไม่ควรอยู่:
   ```yaml
   - name: guard service-role key
     run: |
       ! grep -rn "NEXT_PUBLIC_SUPABASE_SERVICE\|SUPABASE_SERVICE_ROLE_KEY" \
           app components hooks --include="*.ts*" \
         || { echo "service-role key ห้ามอยู่ในโค้ดฝั่ง client"; exit 1; }
       ! grep -rn "service_role" .next/static -r 2>/dev/null \
         || { echo "🔴 service-role key หลุดขึ้น bundle"; exit 1; }
   ```
   step ที่สอง (grep ใน `.next/static` หลัง build) คือด่านที่จับได้จริงแม้ทุกด่านบนพลาดหมด
5. **scope บน Vercel** — ตั้งเฉพาะ Production + Preview · **ห้ามติ๊ก Development**
   เพราะค่า Development จะถูกดึงลงเครื่องเมื่อรัน `vercel env pull` แล้วไปนอนใน `.env.local` ของทุกคน

**ของที่ต้องมีคู่กัน:** `.env.example` (commit ขึ้น git — มีแต่ชื่อตัวแปร ไม่มีค่า)
⚠️ `.gitignore:34` เขียนว่า `.env*` ซึ่งกิน `.env.example` ไปด้วย → ต้องเพิ่มบรรทัด `!.env.example`
ไม่งั้นไฟล์จะถูกสร้างแล้วหายไปเงียบๆ โดยไม่มีใครสังเกต

### 3.4 secret ตัวไหนอยู่ระดับไหน

| secret | local | preview | production | หมายเหตุ |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | localhost:54321 | โปรเจกต์ preview | โปรเจกต์ prod | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ค่าคงที่ของ local | ของ preview | ของ prod | ขึ้น bundle — ยอมรับได้ต่อเมื่อ RLS จริงถูกเปิด (`E1`) |
| **`SUPABASE_SERVICE_ROLE_KEY`** | จาก `db:status` | ของ preview | ของ prod | 🔴 5 ด่านข้อ 3.3 |
| `GOOGLE_MAPS_API_KEY` | ใบ server | **ควรเป็นคีย์คนละใบ + quota ต่ำ** | ใบ server | preview ใช้ใบเดียวกับ prod = PR เดียวยิงพลาดแล้วบิลบานร่วมกัน |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` | ใบ browser | ต้องเพิ่ม `*.vercel.app` ใน Websites restriction | ใบ browser | ⚠️ preview URL เปลี่ยนทุก deploy — ต้องใส่ wildcard |
| `TRIP_PIN` / `TRIP_PIN_SECRET` | ตั้งเองได้ | คนละค่ากับ prod | ค่าจริง | แพลตฟอร์มจะเลิกใช้เมื่อมี identity จริง (`E1`) |
| `CRON_SECRET` | ไม่ต้องมี | ไม่ต้องมี | ค่าจริง | |

---

## 4. ย้าย rate limit ออกจาก in-memory

### 4.1 ของที่มีอยู่ ทำงานได้ดีกว่าที่คิด

`lib/rateLimit.ts` — `Map` ในหน่วยความจำ · เพดาน `MAX_BUCKETS = 5000` แล้ว `clear()` ทั้งกระบิ (`:15`)
· key = `routeName:ip` จาก `x-forwarded-for` (`:38`) · ใช้ครบ **ทั้ง 13 API route** (ตรวจแล้ว ไม่มีเส้นไหนหลุด):

| กลุ่ม | route | เพดาน/นาที |
|---|---|---|
| ยิงเป็นชุดตอนเปิดหน้าเดียว | `place-photo` 400 · `place-details`/`place-photos`/`place-name` 300 · `travel-time` 150 | 150–400 |
| ยิงตามการกด | `geocode`/`place-search`/`place-nearby`/`place-autocomplete`/`weather` 60 · `youtube-video` 30 | 30–60 |
| ด่าน | `unlock` 10 · `keep-alive` 5 | 5–10 |

**จุดอ่อนจริง 3 ข้อ:**
1. **แต่ละ serverless instance นับของตัวเอง** — Vercel รัน 5 instance = เพดานจริงกลายเป็น 5 เท่า
2. **`clear()` ทั้งกระบิที่ 5,000 buckets** — คนยิงด้วย `x-forwarded-for` ปลอมหลายพันค่า ทำให้คนที่กำลังโดน
   limit อยู่ได้เริ่มนับใหม่ · **โค้ดเขียนกำกับไว้เองว่ารับได้เพราะเป็นด่านคุมค่าใช้จ่าย ไม่ใช่ด่านความปลอดภัย** — ถูกต้อง
3. **`unlock` เพดาน 10/นาที คือด่านกัน brute-force PIN 4 หลัก** ← นี่คือข้อเดียวที่ **เป็น**ด่านความปลอดภัยจริง
   และ**อ่อนที่สุด** เพราะข้อ 1 + ข้อ 2 รวมกันแปลว่าเดา PIN ได้เร็วกว่า 10 ครั้ง/นาทีมาก
   PIN มี 10,000 ค่า → **นี่เป็นเรื่องของ P4 ไม่ใช่ของผม** ผมแค่ชี้ว่า infra แก้ให้ได้ด้วย Redis
   🔴 **ไม่ต้องแก้ก่อนทริป** — เว็บนี้ไม่มีใครรู้ URL นอกจาก 2 คน และ fail-open ที่ `proxy.ts:43` คือ
   การตัดสินใจที่ถูกแล้วสำหรับสถานการณ์ "อยู่เกาหลีแล้วเว็บต้องเปิดได้"

### 4.2 ตัวเลือกตอนเป็นแพลตฟอร์ม

| ทาง | ราคา | latency ที่เพิ่ม | ข้อดี | ข้อเสีย |
|---|---|---|---|---|
| **อยู่กับ in-memory ต่อ** | ฟรี | 0 | ไม่ต้องทำอะไร | นับไม่ตรงเมื่อมีหลาย instance · brute-force `unlock` ไม่ถูกกัน |
| **Upstash Redis** (แนะนำ) | ✅ **ยืนยันแล้ว 17 ส.ค. 2026:** free = **500K command/เดือน · 256 MB · bandwidth 10 GB/เดือน** · เกินนั้น **$0.20 ต่อ 100K command** · storage $0.25/GB (1 GB แรกฟรี) · **ไม่มีขั้นต่ำรายเดือน** | +10–40 ms | `@upstash/ratelimit` มี sliding window/token bucket ให้เสร็จ · REST เรียกจาก edge ได้ · ทำ analytics ได้ | ผูกกับผู้ให้บริการเพิ่มอีกราย |
| **Vercel KV** | ปัจจุบันคือ Upstash ที่ขายผ่าน Vercel Marketplace | เท่ากัน | บิลรวมกับ Vercel · ตั้ง env ให้เอง | ราคาปกติแพงกว่าซื้อตรง · เป็นคนละของกับ "Vercel KV" รุ่นเก่า **ต้องเช็คหน้าราคาจริงก่อนตัดสินใจ** |
| **นับใน Postgres** | ฟรี (ใช้ DB ที่มีอยู่) | +20–60 ms | ไม่มีบริการเพิ่ม | เผา connection pool + write I/O ของ DB ซึ่งเป็นทรัพยากรที่ตึงอยู่แล้ว · **ไม่แนะนำ** |

**ข้อเสนอ:** ทำเป็น 2 ชั้น ไม่ใช่เลือกอย่างใดอย่างหนึ่ง
- **ชั้นถูก (in-memory เดิม)** อยู่ต่อ เป็นด่านหน้าที่ latency = 0 กันการยิงรัวจาก IP เดียวใน instance เดียว
- **ชั้นแม่น (Redis)** ใส่เฉพาะเส้นที่ **แพงจริง** หรือ **เป็นด่านความปลอดภัยจริง**:
  auth/login · เส้นที่ยิง Google แบบคิดเงินสูง (`place-search`, `travel-time`) · การสร้างทริปใหม่

**เกณฑ์ว่าเมื่อไรค่อยทำ:** ตอนมีผู้ใช้จริงเกิน ~50 คน หรือตอนบิล Google เดือนแรกเกิน $20
ก่อนหน้านั้น in-memory พอ **และการเพิ่มบริการตอนยังไม่มีผู้ใช้คือการเพิ่มของที่ต้องดูแลโดยเปล่าประโยชน์**

**สิ่งที่ต้องแก้พร้อมกันตอนย้าย:** key ต้องเลิกใช้ `x-forwarded-for` ล้วน (ปลอมได้) เปลี่ยนเป็น
`userId ?? ip` เมื่อมี identity แล้ว (`E1`) — ไม่งั้นย้ายไป Redis ก็ยัง bypass ได้ด้วย header ปลอมเหมือนเดิม

---

## 5. ประเมิน tier — ตัวเลขที่ผู้ใช้ต้องตัดสินใจ

> ✅ **เปิดหน้าเว็บยืนยันครบแล้ว 17 ส.ค. 2026** (รอบแรกผมจำมา — รอบนี้เช็คจริงตาม D3/D23)
> **Vercel Pro = $20 per user/month (Developer seat) · Viewer seat ฟรี** — `vercel.com/docs/plans/hobby` หัวข้อ Upgrading to Pro
> **Supabase Pro = $25/เดือน · free = 2 active projects · ไม่มี backup/PITR** — P1 ยืนยันแล้ว 2 ช่อง ผมยืนยันซ้ำจาก `supabase.com/pricing`
> **Supabase free เพิ่มเติมที่เพิ่งยืนยัน:** Realtime **200 concurrent** · **2 ล้าน message/เดือน** · **egress 5 GB** · **DB 500 MB**
> (Pro: 500 concurrent · 5 ล้าน message · egress 250 GB · DB 8 GB)
> ✅ **Upstash/Sentry ยืนยันแล้วเช่นกัน (17 ส.ค. 2026) — ตัวเลขที่ผมจำมาถูกทั้งคู่**
> **Upstash Redis:** free 500K command/เดือน · 256 MB · bandwidth 10 GB · เกินนั้น **$0.20/100K command** · ไม่มีขั้นต่ำรายเดือน
> **Sentry:** free 5,000 error/เดือน · เก็บ 30 วัน · **ผู้ใช้ได้คนเดียว** · Team $26/เดือน (จ่ายรายปี) · 50,000 error · ผู้ใช้ไม่จำกัด
> 🟢 **ตอนนี้ทุกตัวเลขราคาในเอกสารนี้ผ่านการเปิดหน้าจริงครบแล้ว ไม่เหลือช่องที่จำมา**

### 5.1 ขีดจำกัดที่จะชนก่อนเพื่อน

**📏 ที่มาของตัวเลขในตารางนี้:** เปิดเอกสารจริงวันนี้ (17 ส.ค. 2026) ไม่ได้จำมา —
`vercel.com/docs/limits` (หน้าระบุ `last_updated: 2026-08-03`) · `vercel.com/docs/plans/hobby` (`2026-06-16`)
· `vercel.com/docs/cron-jobs/usage-and-pricing` (`2026-07-15`) · `supabase.com/pricing`
**ยกเว้นช่องที่เขียนกำกับว่า "ประเมิน" — ช่องพวกนั้นคือการคำนวณของผม ไม่ใช่ตัวเลขที่ผู้ให้บริการประกาศ**

| | Hobby / free วันนี้ (ยืนยันแล้ว) | ชนเมื่อไร |
|---|---|---|
| 🔴 **Vercel: ห้ามใช้เชิงพาณิชย์** | *"the Hobby plan restricts users to non-commercial, personal use only"* | **ชนที่ผู้ใช้คนแรกที่ไม่ใช่คนในบ้าน — ไม่ใช่ที่ตัวเลขไหนเลย** |
| **Vercel: cron ขั้นต่ำวันละครั้ง** | 100 cron/โปรเจกต์ แต่ **minimum interval = once per day · คลาดเคลื่อน ±59 นาที** · เขียน `0 * * * *` จะ **deploy ไม่ผ่าน** | ชนทันทีที่ต้องมีงานเป็นระยะถี่กว่าวันละครั้ง (ปลุก staging · sync · เตือน) |
| **Vercel: Function Invocations** | **1,000,000/เดือน** | **~50–160 ผู้ใช้/เดือน** (ประเมิน — ดู 5.1.1) ← **เพดานตัวเลขที่ชนก่อนเพื่อนฝั่ง Vercel** |
| Vercel: Edge Requests | **1,000,000/เดือน** | ~300 ผู้ใช้/เดือน (ประเมิน) |
| Vercel: Fast Data Transfer | **100 GB/เดือน** | ~8,000 การเข้าครั้งแรก/เดือน (ประเมิน) — ไม่ใช่ตัวที่ชนก่อน |
| Vercel: Fast Origin Transfer | **สูงสุด 10 GB/เดือน** | ⚠️ **ประเมินไม่ได้** — ขึ้นกับ hit rate ของ edge cache ที่วัดได้ต่อเมื่อ deploy จริง |
| Vercel: Active CPU | **4 CPU-hrs/เดือน** | ⚠️ **ประเมินไม่ได้จากในเครื่อง** — ต้องวัดจาก dashboard หลัง deploy · **เป็นตัวที่ผมสงสัยมากที่สุดว่าอาจชนก่อน Invocations** |
| ~~Vercel: function timeout 10 วิ~~ | ✅ **ที่ถูกคือ 300 วิ (5 นาที) — ผมเคยบอก P1 ผิด ดู 5.1.2** | **ไม่ชน** · Copilot ของ P5 ไม่ติดเพดานนี้ |
| **Supabase: หลับเมื่อไม่มี request 7 วัน** | free tier | กันอยู่ด้วย `/api/keep-alive` + cron แล้ว |
| **Supabase: 2 โปรเจกต์ active ต่อ organization** | free tier | **ชนทันทีที่ขอ preview environment** (ทริป + preview + prod = 3) |
| Supabase: DB 500 MB | free tier | หลายผู้ใช้ + รูป + แคช place → ชนภายในไม่กี่เดือน |
| Supabase: Realtime concurrent | free ~200 connection | 10 hooks × 1 channel/ผู้ใช้ = **~20 ผู้ใช้พร้อมกันก็ชน** ← ข้อนี้อันตรายเงียบที่สุด |
| Supabase: ไม่มี backup/PITR | free tier | **ชนวันที่ผู้ใช้คนแรกทำข้อมูลหาย** — free tier กู้ให้ไม่ได้ |

🔴 **ข้อที่ผมอยากให้ P1 อ่านซ้ำ: Realtime concurrent connection**
`README.md:46` บอกว่ามี 28 hooks และผมนับได้ 10 ตัวที่เปิด `postgres_changes` — **หนึ่งผู้ใช้ที่เปิดหน้าแผน
กินหลาย connection พร้อมกัน** เพดาน free tier จึงหารด้วยเลขนั้น ไม่ใช่จำนวนคน
ถ้าไม่รวม channel ให้เหลือน้อยลงในระยะ 2 (เรื่องของ P3/P1) ต่อให้ซื้อ Pro ก็จะชนอีกที่ ~500 connection

> ✅ **P1 รับเป็นโจทย์ของ `E3` แล้ว (17 ส.ค. 2026)** — `E3` มีเป้าหมายเพิ่มว่า **ลด channel ต่อผู้ใช้**
> ไม่ใช่แค่ย้ายไป DAL · P8 ยืนยันจากอีกทางว่า **10 hooks นี้ถือ 60 จาก 67 จุดที่แตะ DB (90%)**
> (⚠️ ตัวเลขที่ถูกคือ **67 จุด ไม่ใช่ 47** ตามที่ `README.md` B8 เขียนไว้ — P8 จับได้ ดู D10)
> แปลว่า **การรวม channel กับการเขียน 10 hooks ใหม่เป็นงานเดียวกัน** ไม่ต้องทำสองรอบ

### 5.1.1 R7 — Vercel Hobby รับได้ถึงกี่ผู้ใช้ · และอันไหนชนก่อน Realtime

**คำตอบสั้น 3 บรรทัด:**
1. 🔴 **เพดานแรกไม่ใช่ตัวเลข แต่เป็นสัญญา** — Hobby *"restricts users to non-commercial, personal use only"*
   **ชนที่ผู้ใช้คนแรกที่ไม่ใช่คนในบ้าน** ไม่ว่าจะมีกี่ request · คำถาม "รับได้กี่ผู้ใช้" มีคำตอบทางสัญญาว่า **ศูนย์**
2. ถ้าไม่นับสัญญา ดูแต่ตัวเลข: **Function Invocations 1,000,000/เดือน ชนก่อนเพื่อน ที่ ~50–160 ผู้ใช้/เดือน**
3. 🔴 **ผมตอบว่า "Realtime ชนก่อนเสมอ" ไม่ได้ ข้อมูลไม่รองรับ** — วันนี้ทั้งสองอยู่คนละหน่วยและ**อยู่ระดับเดียวกัน**
   · **แต่หลัง `E3` ของ P3 ลงแล้ว Vercel จะกลายเป็นตัวที่ชนก่อนชัดเจน** ซึ่งเป็นเพดานที่เงินแก้ได้

### 🔴 แยกเพดาน 2 ชนิด — ตามที่ P1 สั่ง เพราะแก้ด้วยวิธีคนละแบบ

**ชนิด A — ชนตั้งแต่ผู้ใช้คนแรก · ไม่เกี่ยวกับจำนวนคนเลย**

| เพดาน | ยืนยันจาก | แก้ด้วยอะไร |
|---|---|---|
| 🔴 **Hobby ห้ามใช้เชิงพาณิชย์** | `docs/plans/hobby` | **เงิน** — ขยับ Pro $20/seat · เป็นเรื่องสัญญา ไม่ใช่ capacity |
| **cron ขั้นต่ำวันละครั้ง** (เขียนถี่กว่า **deploy ไม่ผ่าน**) | `docs/cron-jobs/usage-and-pricing` | **สถาปัตยกรรม** — ย้ายงานเป็นระยะไป GitHub Actions `schedule` ซึ่งฟรีและถี่กว่าได้ · **ไม่ต้องจ่ายเงินเพื่อข้อนี้** |
| **Hobby ต่อ Git repo ที่เป็นของ GitHub organization ไม่ได้** | `docs/limits` | **เงิน หรือ สถาปัตยกรรม** — ขยับ tier หรือเก็บ repo ไว้ใต้บัญชีส่วนตัว ← 🔴 **ข้อนี้ยังไม่มีใครพูดถึง และมันตัดสินคำถามข้อ 1 ของผม** |
| **Supabase free ไม่มี backup/PITR** | `supabase.com/pricing` | **เงิน** — Pro $25 |
| ~~function timeout 10 วิ~~ | ❌ **ไม่มีเพดานนี้จริง** | — ดู 5.1.2 |

**ชนิด B — ชนเมื่อผู้ใช้เยอะ · เงินแก้ได้ตรงๆ**
Function Invocations 1M (**~50–160 คน** ← ตัวที่ชนก่อน) · Edge Requests 1M (~317 คน) ·
Fast Data Transfer 100 GB · Realtime 200 concurrent (~20 คนพร้อมกัน) · egress 5 GB · DB 500 MB

🔴 **ข้อสรุปที่ P1 ขอ:** *"Hobby พอสำหรับ N คน"* **เป็นประโยคที่ตอบผิดโจทย์** — เพดานที่บังคับให้เราขยับ tier
คือ **ชนิด A ซึ่งชนที่คนแรก** ไม่ใช่ชนิด B · **แปลว่าเราจะจ่ายเงินเพราะสัญญาและ backup ก่อนที่จะเคยแตะเพดาน
capacity สักตัวเดียว** · และในชนิด A มี **1 ข้อที่ไม่ต้องใช้เงินแก้เลย (cron → GitHub Actions)** ซึ่งบังเอิญ
เป็นข้อเดียวกับที่ `E0-AC7` ต้องใช้ปลุก staging พอดี

**📏 วิธีคิดของชนิด B — สมมติฐานทุกตัวเปิดเผยไว้ให้แย้งได้**

| ตัวตั้ง | ค่า | ที่มา |
|---|---|---|
| API call ต่อการเปิดหน้าแผน 1 ครั้ง | ~34 | `lib/rateLimit.ts:29` — **คอมเมนต์ที่โค้ดเขียนกำกับตัวเองไว้ตั้งแต่เฟส 13 ผมไม่ได้วัดซ้ำในเบราว์เซอร์** |
| รูปต่อหน้าแผน | 200+ | `app/api/place-photo/route.ts:4` — คอมเมนต์ในโค้ดเช่นกัน |
| รูปถูกแคชในเบราว์เซอร์ 30 วัน | `max-age=2592000` | `app/api/place-photo/route.ts:41` — **อ่านจากโค้ดจริง** → เปิดซ้ำไม่เสียรูปอีก |
| invocation ต่อ 1 API call | ~2 | **ประเมิน** — `proxy.ts` รันทุก request ที่ไม่อยู่ใน `PUBLIC_PATHS` (`proxy.ts:23`) จึงนับ proxy + route |
| เปิดหน้าแผนกี่ครั้ง/คน/เดือน | 30 · 90 · 300 | **สมมติฐานล้วน** = 1 · 3 · 10 ครั้งต่อวัน |

→ **~70 invocation ต่อการเปิดหน้า 1 ครั้ง** (35 request × 2)

| การใช้งาน | invocation/คน/เดือน | **เพดาน 1,000,000 = กี่ผู้ใช้** |
|---|---|---|
| เบา (1 ครั้ง/วัน) | 2,100 | **~476 คน** |
| ปกติ (3 ครั้ง/วัน) | 6,300 | **~159 คน** |
| หนัก (10 ครั้ง/วัน — แบบช่วงอยู่ในทริปจริง) | 21,000 | **~48 คน** |

**เพดานอื่นของ Vercel อยู่ไกลกว่านี้:** Edge Requests 1M ที่ ~35 req/เปิด → ~317 คน ·
Fast Data Transfer 100 GB ที่ ~12 MB ต่อการเข้าครั้งแรก (200 รูป × ~60 KB **ซึ่งเป็นตัวเลขประเมิน ไม่ได้วัด**)
→ ~8,300 การเข้าครั้งแรก/เดือน

⚠️ **2 ช่องที่ผมประเมินไม่ได้ — ต้องวัดจาก dashboard หลัง deploy จริง: Active CPU 4 CPU-hrs · Fast Origin Transfer 10 GB**

🟢 **อัปเดต: ความกังวลเรื่อง Active CPU เบาลงมาก หลังเปิด `docs/fluid-compute` (17 ส.ค. 2026)**
เดิมผมเดาว่า *"route ส่วนใหญ่รอ Google = I/O ไม่ใช่ CPU"* แล้วกำกับเองว่าเป็นการเดา —
**ตอนนี้ไม่ต้องเดาแล้ว เอกสาร Vercel เขียนตรงๆ ว่า:**
> *"Active CPU billing applies while your code is executing, and **pauses while your function is waiting on I/O**."*

route ของเราเกือบทั้งหมดคือ "รอ Google / รอ Supabase" ซึ่งเป็น I/O → **ไม่กิน Active CPU ระหว่างรอ**
→ **Function Invocations 1,000,000 ยังเป็นตัวที่ชนก่อนเพื่อน อันดับไม่พลิก**
⚠️ แต่ยังต้องวัดจริงอยู่ดี เพราะ *"ไม่กินระหว่างรอ"* ไม่เท่ากับ *"ไม่กินเลย"* — การ parse JSON ก้อนใหญ่
และการสตรีมรูปผ่าน `place-photo` ยังใช้ CPU จริง · **ห้ามใช้ตัวเลข ~50–160 ผูกพันเงินจนกว่าจะวัด**

**เทียบกับ Realtime — ทำไมผมตอบ "อันไหนชนก่อน" แบบฟันธงไม่ได้**

ปัญหาคือ **สองฝั่งอยู่คนละหน่วย**: Vercel นับ **ยอดรวมต่อเดือน** · Supabase Realtime นับ **จำนวนพร้อมกัน ณ ขณะหนึ่ง**
การแปลงต้องใช้ **อัตราส่วน peak concurrency ต่อผู้ใช้รายเดือน ซึ่งไม่มีใครวัด และผมไม่มีทางรู้**

| สมมติฐาน peak concurrency | Realtime 20 คนพร้อมกัน = กี่ผู้ใช้/เดือน | เทียบ Vercel ~159 |
|---|---|---|
| 3% (แอปทั่วไป) | ~670 คน | **Vercel ชนก่อน** |
| 10% | ~200 คน | **พอๆ กัน** |
| 20% (กลุ่มวางแผนพร้อมกัน · ในทริปเปิดพร้อมกันตอนเช้า) | ~100 คน | **Realtime ชนก่อน** |

**แอปนี้มีเหตุผลให้เชื่อว่าอัตราส่วนสูง** (คนวางแผนทริปเดียวกันออนไลน์พร้อมกัน และช่วงอยู่ในทริปทุกคนเปิดตอนเช้าเหมือนกัน)
แต่นั่นคือ**เหตุผล ไม่ใช่การวัด** → **สรุปตรงๆ ตามที่ P1 ขอ: วันนี้ทั้งสองอยู่ระดับเดียวกัน ไม่มีตัวไหนชนะขาด**

**✅ ยืนยันตัวเลขให้ P3 (ข้อที่ P1 อยากให้เราปิดร่วมกัน)**
- **โควตาจริงที่ P3 ต้องการยืนยัน: Free = 200 concurrent peak connections · Pro = 500** ← เปิด `supabase.com/pricing` วันนี้ **ยืนยันแล้วว่าถูก**
- ดังนั้น **P3 คำนวณถูก**: 10 channel/คน → 20 คน · เหลือ **1 channel/user/tripId → 200 คน** (บน free tier)
- **แต่ผลที่ตามมาสำคัญกว่าตัวเลข:** พอ Realtime ขยับไป 200 คนพร้อมกัน (≈ 1,000–2,000 ผู้ใช้/เดือน
  ที่อัตราส่วน 10–20%) **Vercel ~159 คน/เดือน จะกลายเป็นเพดานที่ชนก่อนชัดเจน**
- 🟢 **แปลว่าคำตอบของ R7 ไม่ใช่ "เงินไม่ใช่ทางแก้" แต่คือ "เงินยังไม่ใช่ทางแก้จนกว่า `E3` จะลง · หลัง `E3` เงินคือทางแก้พอดี"**
  → **`E3` ต้องมาก่อนการจ่ายเงิน** ไม่ใช่ทางเลือกแทนกัน · จ่าย Pro ก่อน `E3` = ซื้อเพดานที่ยังชนไม่ถึง

⚠️ **เพดานฝั่ง Supabase อีก 2 ตัวที่ยังไม่มีใครพูดถึง และ Vercel ไม่ได้ช่วยเลย** — เพราะ B8 บอกว่า
**ทุกการอ่าน/เขียนยิงจาก browser ตรงเข้า Supabase (67 จุด) ไม่ผ่าน Vercel**:
**egress 5 GB/เดือน (free)** และ **Realtime 2 ล้าน message/เดือน** · ทั้งสองตัวโตตามจำนวนผู้ใช้ตรงๆ
และ **การซื้อ Vercel Pro ไม่ขยับทั้งคู่แม้แต่นิดเดียว**

### 5.1.2 🔴 แก้ตัวเลขที่ผมให้ P1 ผิด — function timeout ไม่ใช่ 10 วินาที · **ที่ถูกคือ 300 วินาที**

ผมเคยเขียนว่า Hobby timeout = 10 วิ และบอก P1 ว่า **Copilot ของ P5 "ชนแน่นอน"** · P1 ส่งต่อ P5 แล้ว
และ P5 ใช้ตัวเลขนี้เปลี่ยน streaming จาก "เปิด" เป็น **"บังคับ"** ในสเปก — **ตัวเลขผิด ต้องแจ้งกลับ**

**📏 ยืนยันจาก 4 หน้าอิสระของ Vercel เอง (เปิดจริง 17 ส.ค. 2026 หลัง P1 ทักท้วงตาม D3/D21.2):**

| หน้า | `last_updated` | สิ่งที่เขียน |
|---|---|---|
| `docs/limits` | 2026-08-03 | ตาราง 10s/60s มีจริง **แต่ประโยคนำหน้ากำกับว่าใช้กับ** *"an existing project, deployed to Vercel before April 23rd 2025 and **not using Fluid compute**"* |
| `docs/plans/hobby` | 2026-06-16 | Hobby: *"Vercel Function maximum duration — **300s (5 minutes)**"* |
| `docs/functions/configuring-functions/duration` | 2026-07-01 | หัวข้อ Duration limits *"...with fluid compute (**enabled by default**)"* → **Hobby: Default 300s · Maximum 300s** |
| `docs/fluid-compute` | 2026-07-01 | *"**As of April 23, 2025, fluid compute is enabled by default for new projects.**"* → Hobby Default/Max = **300s / 300s** |

**โปรเจกต์นี้สร้างปี 2026 → fluid compute เปิดอยู่ → เพดานคือ 300 วินาที** · `vercel.json` ปัจจุบันไม่มีบล็อก
`functions` จึงไม่มีอะไร override ลงมาต่ำกว่านั้น (ลำดับ precedence: โค้ด > `vercel.json` > dashboard > fluid default)

**ตอบข้อ ① ของ P5 โดยตรง:** tool loop นับรวมในโควตาจริงตามที่ P5 ว่า — **แต่โควตาคือ 300 วิ ไม่ใช่ 10 วิ**
tool 3–4 ตัวที่ยิง Places/Routes API จริง ต่อให้ตัวละ 3–5 วิ รวมกับเวลาที่โมเดลคิด ก็ยังอยู่ในหลัก **สิบวินาที
บนเพดานห้านาที** → **ไม่ชน และไม่ใช่ "ชนแน่นอน"**

🟢 **แต่ข้อ ② ของ P5 ถูกต้องและยังยืนอยู่เต็มๆ แม้ตัวเลขจะเปลี่ยน** — *"คำถามอย่าง 'สวัสดี' ไม่เรียก tool เลย
→ ทดสอบผ่านแล้วขึ้นจริงพัง และจะพังเฉพาะกับคำถามที่มีค่าที่สุด"* นี่เป็นข้อสังเกตเรื่อง**วิธีทดสอบ**
ที่ไม่ได้อาศัยเลข 10 วิเลย และตรงกับรูปแบบร่วมของทีมพอดี · **เคสทดสอบของ Copilot ต้องมีเคสที่เรียก tool ครบลูป
ไม่ใช่เคสที่ตอบได้โดยไม่แตะ tool** — ผมสนับสนุนข้อนี้เต็มที่

**คำแนะนำถึง P5 — ไม่ต้องรื้อสเปก:** streaming ยัง**ควร**บังคับต่อไปได้ด้วยเหตุผล UX (ผู้ใช้เห็นความคืบหน้า
แทนที่จะจ้องหน้าจอเปล่า 15 วิ) และ P5 พูดถูกว่าการแปลงทีหลังต้องรื้อทั้งเส้น · **สิ่งที่ต้องแก้คือเหตุผล ไม่ใช่ข้อสรุป**
🔴 **ที่ต้องระวังคือ อย่าให้ข้อจำกัดปลอมไหลไปเป็นเหตุผลของการตัดสินใจข้ออื่น** เช่น "ต้องขยับเป็น Pro เพื่อ timeout"
(ไม่จริง) หรือ "ต้องตัด tool ออกจากลูปให้เหลือน้อยที่สุด" (ไม่จำเป็นด้วยเหตุผลนี้)

**ผมพลาดยังไง:** อ่านตารางแรกแล้วหยุด ไม่ได้อ่านประโยคที่กำกับเงื่อนไขไว้เหนือตาราง —
**ตัวเลขในตารางถูกต้องทุกตัว แต่มันเป็นตารางของโปรเจกต์คนละกลุ่มกับเรา** ตรงกับที่ P8 สรุปไว้เป๊ะ:
*ตัวเลขตอบคำถามที่เราถามจริงๆ ไม่ใช่คำถามที่เราคิดว่าถาม*

### 5.2 ค่าใช้จ่ายจริงต่อเดือน

| ระดับ | Vercel | Supabase | อื่นๆ | **รวม/เดือน** | เหมาะกับ |
|---|---|---|---|---|---|
| **วันนี้** | Hobby $0 | Free $0 | $0 | **$0** | ทริป 2 คน — **พอแล้ว ไม่ต้องเปลี่ยนอะไร** |
| **ขั้นต่ำที่ทำแพลตฟอร์มได้จริง** | Pro ~$20/ผู้ใช้ | Pro ~$25/โปรเจกต์ | $0 | **~$45** | เปิดให้คนนอกใช้ · มี backup · cron ได้ถี่ · timeout 60+ วิ |
| **+ preview แยก DB** | Pro $20 | Pro $25 + preview branch/โปรเจกต์ที่ 2 | $0 | **~$45–70** | ทดสอบ OAuth/pooler ก่อนขึ้นจริง |
| **โตแล้ว** | Pro $20 | Pro $25 + compute add-on | Upstash ~$10 · Sentry ~$26 | **~$80–120** | ผู้ใช้หลักร้อย |

**ต้นทุนที่คนลืมนับ และเป็นตัวที่ผมกลัวที่สุด — Google API:**
Places API (New) กับ Routes API **คิดเงินต่อ request** และ **ไม่มีเพดานให้หยุดเองถ้าไม่ตั้ง quota**
วันนี้มี 2 คนใช้ → เกือบไม่มีบิล · แพลตฟอร์มที่มีผู้ใช้ 100 คน แต่ละคนเปิดหน้าแผน 1 ครั้ง
= **~34 request ต่อการเปิดหน้า 1 ครั้ง** (ตัวเลขนี้เขียนอยู่ใน `lib/rateLimit.ts:29` เอง)
→ 3,400 request/วัน → ~100,000/เดือน ซึ่งเป็นหลัก **สิบถึงร้อยดอลลาร์ต่อเดือน** ขึ้นกับ SKU
🔴 **ข้อนี้อาจแพงกว่าค่า Vercel + Supabase รวมกัน** และเป็นเหตุผลว่าทำไมข้อ 6.3 ต้องทำก่อนเปิดให้คนนอกใช้

> ✅ **P1 รับเป็นข้อบังคับของ `E2` แล้ว (17 ส.ค. 2026):** แคช place details / place photo ที่มีอยู่แล้วใน DB
> (`0004_place_photo_cache.sql` · `0011_place_details_cache.sql` · `0012_place_details_extra.sql`)
> **ห้ามรื้อทิ้งตอนออกแบบ schema ใหม่** — มันคือสิ่งเดียวที่กันไม่ให้ค่า Google โตตามจำนวนผู้ใช้แบบเชิงเส้น

### 5.3 สรุปคำแนะนำ

1. **ก่อน 21 ต.ค.: ไม่ต้องจ่ายอะไรเลย** ของที่มีพอสำหรับ 2 คนและพิสูจน์แล้วหน้างาน
2. **วันที่เปิดให้คนนอกใช้จริงคือวันที่ต้องจ่าย ~$45/เดือน** — Vercel Hobby ห้ามใช้เชิงพาณิชย์ และ
   Supabase free ไม่มี backup ทั้งสองข้อนี้ไม่ใช่เรื่องประสิทธิภาพแต่เป็นเรื่องที่ยอมรับความเสี่ยงไม่ได้
3. **ตั้ง Google budget alert ก่อนเปิดให้คนนอกใช้ 100%** ค่านี้เป็นตัวเดียวที่โตไม่มีเพดาน

---

## 6. Monitoring

### 6.1 error tracking

**ไม่มีอะไรเลยวันนี้** — error ทั้งหมดหายไปกับ log ของ Vercel ที่ Hobby เก็บสั้นมาก
โค้ดหลายจุดจงใจกลืน error เงียบ (เช่น `travel_time_cache` upsert ที่ล้มแล้วทิ้ง error ตาม README)
= **ถ้าไม่ใส่ error tracking จะไม่มีวันรู้ว่าอะไรพัง**

**ข้อเสนอ: Sentry** — ✅ **ยืนยันแล้ว 17 ส.ค. 2026:** Developer (free) = **5,000 error/เดือน · เก็บย้อนหลัง 30 วัน
· 🔴 ผู้ใช้ได้คนเดียว** · Team = **$26/เดือน (ราคาเมื่อจ่ายรายปี) · 50,000 error · ผู้ใช้ไม่จำกัด**
· `@sentry/nextjs` ติดตั้งได้ตรงๆ

⚠️ **"ผู้ใช้ได้คนเดียว" ของ free tier คือข้อที่ต้องดูก่อนตัดสิน** — โปรเจกต์นี้มีเจ้าของเป็นคนเดียว (ผู้ใช้)
ส่วน 8 เซสชันคือ agent ไม่ใช่บัญชีคน → **free tier พอ** · แต่ถ้าวันหนึ่งมีคนที่ 2 ต้องเข้าไปดู error ด้วย
จะกระโดดเป็น $26/เดือนทันที **ไม่ใช่เพราะปริมาณ error แต่เพราะจำนวนคน** — เป็นเพดาน **ชนิด A** (ดู 5.1.1)
🔴 **ห้ามติดตั้งก่อน 21 ต.ค.** เพราะต้องแก้ `next.config.ts` (ไฟล์นอกโซนผมและอยู่ในของแช่แข็ง) และต้อง redeploy
🔴 **ตอนติดตั้งต้องปิด PII** — เว็บนี้มีข้อมูลทริปจริงของคน 2 คน ค่า default ของ Sentry ส่ง URL + breadcrumb
ซึ่งอาจมีชื่อสถานที่/ที่พัก · ต้องตั้ง `sendDefaultPii: false` และกรอง query string

### 6.2 uptime

- **UptimeRobot / Better Stack** free tier ping ทุก 5 นาทีก็พอ
- 🔴 **ping เส้นไหน** — `/` โดนด่าน PIN เด้ง 307 ไป `/unlock` ซึ่ง monitor จะนับว่า "ยังไม่ตาย" ทั้งที่ DB อาจหลับ
  **ต้อง ping `/api/keep-alive` ที่อยู่ใน `PUBLIC_PATHS` (`proxy.ts:28`) แทน** เพราะมันแตะ Supabase จริง
  แล้วตอบ `{ok:true}` — คือ health check ที่มีความหมายเดียวในเว็บนี้
- ⚠️ แต่ `CRON_SECRET` ถูกตั้งไว้บน production แล้ว → monitor ที่ไม่มี Bearer จะได้ **401 ตลอด**
  ทางแก้: ตั้ง monitor ให้ **นับ 401 ว่าเป็นสถานะปกติ** (ยืนยันว่า Next ตื่นอยู่) แล้ว alert เมื่อได้ 5xx/timeout
  หรือใส่ header `Authorization: Bearer …` ในตัว monitor (ทำได้ทั้ง UptimeRobot Pro และ Better Stack free)
  **ทางแรกดีกว่า** — ไม่ต้องเอา secret ไปฝากบริการที่สาม
- 🔴 **ตั้งได้เลยตั้งแต่วันนี้โดยไม่แตะโค้ด ไม่แตะ env ไม่ต้อง redeploy** — เป็นการตั้งค่านอกโปรเจกต์ทั้งหมด
  **นี่คือของชิ้นเดียวในเอกสารนี้ที่ผมแนะนำให้ทำก่อนทริป** เพราะช่วงอยู่เกาหลีคือช่วงที่ต้องรู้เร็วที่สุด
  ว่าเว็บล่ม แต่ต้องให้ P1/ผู้ใช้อนุมัติก่อน

### 6.3 🔴 cost alert ของ Google — ด่วนที่สุดในข้อ 6

Google คิดเงินต่อ request และ **ไม่หยุดให้เองถ้าไม่ตั้ง quota** ทำ 3 อย่างในคอนโซล
(`galvanized-pipe-427006-t6`) — **ทั้งหมดเป็นการตั้งค่าฝั่ง Google ไม่แตะโค้ด ไม่แตะ Vercel ไม่ต้อง redeploy**:

1. **Budget alert** — Billing → Budgets & alerts → ตั้งงบ + แจ้งเตือนที่ 50/90/100%
   ⚠️ **มันแค่ส่งอีเมล ไม่ตัดบริการ** อย่าเข้าใจผิดว่าเป็นเพดาน
2. **Per-API quota** — APIs & Services → เลือก API → Quotas → จำกัด request/วัน ต่อ Places/Routes/YouTube
   **นี่คือเพดานจริงอันเดียวที่หยุดค่าใช้จ่ายได้** · ตั้งไว้สูงกว่าการใช้จริงหลายเท่าเพื่อไม่ให้ทริปสะดุด
   🔴 **ถ้าจะตั้งก่อน 21 ต.ค. ต้องตั้งให้สูงมากๆ** เช่น 10 เท่าของ peak ที่เคยเห็น —
   ตั้งต่ำแล้วชนเพดานตอนอยู่เกาหลี = แผนที่/เส้นทางดับหน้างาน ซึ่งแย่กว่าบิลบานมาก
3. **ดู usage เป็นราย SKU** — Google Maps Platform → Metrics แยกดูว่า SKU ไหนกินเงิน
   จะได้รู้ว่าต้องไปเพิ่มแคชที่ไหนตอนออกแบบ schema ใหม่

### 6.4 ของที่ยังไม่ต้องมี

APM/tracing · log aggregation · RUM · dashboard — **ยังไม่ต้อง** จนกว่าจะมีผู้ใช้จริงหลักร้อย
ตอนนี้ใส่ไปก็ไม่มีใครเปิดดู เป็นค่าใช้จ่ายและงานดูแลเปล่าๆ

---

## 7. Deploy / rollback

### 7.1 วันนี้

- Vercel Hobby project `korea-trip-plan` → `korea-trip-plan-one.vercel.app`
- `vercel.json` มีแค่ cron เดียว `0 3 * * *` → `/api/keep-alive` (= 10:00 น. เวลาไทย)
- **ไม่มี CI กั้นก่อน deploy** — push ขึ้น `main` แล้วขึ้นเลย
  🔴 ระหว่างนี้ถึง 21 ต.ค. **การกันความพังคือ "คนระวังเอง" ล้วนๆ** ตามกติกา `PLAN.md §5`
  (`npm run lint` ต้องผ่านก่อนบอกว่าเสร็จ) — CI ในข้อ 2 คือของที่จะมาแทนความระวังของคน แต่ยังไม่มี

### 7.2 preview deployment ต่อ PR (ระยะ 2 เท่านั้น)

Vercel สร้าง preview ให้ทุก PR อยู่แล้วถ้าเปิด git integration — **แต่มี 3 กับดักที่ต้องปิดก่อน**:

1. 🔴 **env ของ Production ไหลลง Preview โดยอัตโนมัติถ้าไม่ตั้ง scope Preview แยก**
   → **PR ทุกอันจะเขียนใส่ DB ทริปจริง** นี่คือเหตุผลที่ห้ามเปิด preview ก่อน 21 ต.ค.
2. ⚠️ **URL ของ preview เปลี่ยนทุก deploy** → ใบ browser ของ Google (Websites restriction) จะบล็อก
   ต้องเพิ่ม `https://*.vercel.app/*` หรือ **ใช้ key คนละใบสำหรับ preview** (แนะนำแบบหลัง —
   ใส่ wildcard `*.vercel.app` แปลว่าใครก็ตามที่ deploy อะไรบน vercel.app ใช้คีย์เราได้)
3. ⚠️ **preview ก็ยังโดนด่าน PIN** ถ้าตั้ง `TRIP_PIN` ที่ scope Preview — ตั้งใจให้เป็นแบบนั้น
   preview ไม่ควรเปิดสาธารณะ

### 7.3 เงื่อนไข rollback

**วิธี rollback:** Vercel Dashboard → Deployments → เลือกอันก่อนหน้า → Promote to Production
เป็น instant rollback ไม่ต้อง build ใหม่ · **ทำได้แม้ตอนอยู่เกาหลีผ่านมือถือ** ← สำคัญมากสำหรับทริป

| อาการ | ทำอะไร |
|---|---|
| หน้าเว็บขาว / build ผ่านแต่ runtime ตาย | **Promote deployment ก่อนหน้าทันที** อย่าเพิ่งหาสาเหตุ |
| API route คืน 500 เป็นชุด | rollback ก่อน แล้วค่อยดู log |
| แผนที่ไม่ขึ้น/เส้นทางไม่มา | **ห้าม rollback มั่ว** — เช็คก่อนว่าเป็นเรื่อง Google key (ดูข้อ 0) หรือ quota เต็ม (6.3) |
| DB error หลัง migration | 🔴 **rollback โค้ดไม่ช่วย** เพราะ migration ไม่ย้อนกลับเอง — ต้องมี SQL ย้อนกลับเตรียมไว้ก่อน |

🔴 **กติกานี้ P1 รับเป็นข้อบังคับของระยะ 2 แล้ว (17 ส.ค. 2026):** ทุก migration ต้องมี **rollback SQL
เขียนไว้ในคอมเมนต์หัวไฟล์** ตั้งแต่วันที่เขียน · 31 ไฟล์เดิมไม่มีสักไฟล์ → ถ้าวันนี้ migration ไหนพัง **ไม่มีทางถอย
นอกจากเขียน SQL แก้สดหน้างาน** ซึ่งเป็นสถานการณ์ที่ห้ามให้เกิดตอนอยู่เกาหลี

### 7.4 checklist ก่อน deploy production (ระยะ 2)

1. CI เขียวครบทุก job (lint · test · tsc · build · rls)
2. preview deployment ถูกเปิดดูด้วยตาจริงอย่างน้อย 1 หน้า
3. ถ้ามี migration → รันบน preview DB ก่อน แล้วยืนยันด้วย curl (ตามกติกา `PLAN.md §5`)
4. รู้ว่า deployment ก่อนหน้าคืออันไหน (เผื่อ rollback)
5. ไม่ deploy วันศุกร์เย็น และ 🔴 **ไม่ deploy ระหว่าง 11–21 ต.ค. 2026 ทุกกรณี** เว้นแต่แก้บั๊กที่ทำให้ใช้งานไม่ได้

---

## 8. ของที่ทำได้เลยโดยไม่ผิดกติกาแช่แข็ง — P1 ตอบแล้ว 17 ส.ค. 2026

| # | ของ | แตะอะไร | สถานะ |
|---|---|---|---|
| 1 | **ตั้ง uptime monitor ยิง `/api/keep-alive`** | ไม่แตะ repo เลย | 🟡 **รอผู้ใช้อนุมัติ** — เป็นการผูกบริการภายนอก P1 เสนอให้ผู้ใช้พร้อมกับดักข้อ 6.2 แล้ว |
| 2 | **ตั้ง Google budget alert + quota (ตั้งสูงมาก)** | ไม่แตะ repo เลย | 🟡 **รอผู้ใช้อนุมัติ** — เป็นบัญชี Google ของผู้ใช้ |
| 3 | `.nvmrc` = `20.12.2` | ไฟล์ใหม่ที่ root | ❌ **รอหลัง 21 ต.ค.** — อยู่ root ระหว่าง freeze ไม่คุ้มความเสี่ยง |
| 4 | `.env.example` + `!.env.example` ใน `.gitignore` | 2 ไฟล์ที่ root | ❌ **รอหลัง 21 ต.ค.** ชุดเดียวกับข้อ 3 |

**ผลคือระยะนี้ P6 ไม่มีของที่ลงมือทำได้เลย มีแต่เอกสารฉบับนี้ — ถูกต้องตามเจตนาของระยะออกแบบ**
ข้อ 1–2 ถ้าผู้ใช้อนุมัติ **ผมยังทำแทนไม่ได้อยู่ดี** เพราะต้องเข้าบัญชี UptimeRobot/Google Cloud ของผู้ใช้เอง —
สิ่งที่ผมทำได้คือเขียนขั้นตอนให้ครบพร้อมกับดัก ซึ่งอยู่ในข้อ 6.2 และ 6.3 แล้ว

---

## 9. คำถามที่ต้องได้คำตอบก่อนระยะ 2

| # | คำถาม | ถามใคร | สถานะ 17 ส.ค. 2026 |
|---|---|---|---|
| 1 | repo นี้มี GitHub remote ไหม · Vercel deploy ผ่าน git integration หรือ CLI · 🔴 **และ repo อยู่ใต้บัญชีส่วนตัวหรือ GitHub organization** | ผู้ใช้ | ⏳ **ขยายคำถามแล้ว** — `docs/limits` ระบุว่า **Hobby ต่อกับ repo ที่เป็นของ GitHub organization ไม่ได้เลย** ถ้าคำตอบคือ organization แปลว่า preview per PR ต้องขยับ tier ตั้งแต่วันแรก · ติดข้อ 2 และ 7.2 ทั้งหมด |
| 2 | จะติดตั้ง OrbStack หรือ Docker Desktop · เครื่อง RAM เท่าไร | ผู้ใช้ | ⏳ P1 รวมส่งผู้ใช้แล้ว (รวมสเปกเครื่อง) |
| 3 | ยอมจ่าย ~$45/เดือน ตอนเปิดให้คนนอกใช้ไหม | ผู้ใช้ | ⏳ P1 รวมส่งผู้ใช้แล้ว |
| 4 | prod ใช้ `ejzibhgqhxdzkovsnpds` เดิม หรือโปรเจกต์ใหม่ | P1 | ✅ **ตอบแล้ว: โปรเจกต์ใหม่** (ดู 3.2) |
| 5 | เทสต์ RLS จะรันด้วยรูปแบบไหน (JWT จริงผ่าน PostgREST?) | P4 | ⏳ P1 ส่งต่อ P4 แล้ว · P1 ยืนยันว่าข้อ "ห้ามใช้ service role" ถูกและสำคัญ |
| 6 | ~~Copilot จะ stream ไหม (timeout 10 วิ)~~ | P5 | ❌ **คำถามตกไป — ผมถามบนตัวเลขที่ผิด** เพดานจริง 300 วิ ไม่บีบการออกแบบ (ดู 5.1.2) |
| 7 | 10 hooks จะรวมเหลือกี่ channel ในระยะ 2 | P3 | ⏳ P1 ส่งต่อ P3 แล้ว · ✅ ตัวเป้าหมายตัดสินแล้วว่าเป็นงานของ `E3` |

---

## 10. บันทึกการตรวจ (17 ส.ค. 2026)

ตรวจจากโค้ดจริงในเครื่อง ไม่ได้เดา:

- `.github/` **ไม่มี** · `package.json` มี 5 scripts (`dev` `build` `start` `lint` `test`)
- `vitest.config.mts` — `environment: "node"` · plugin `vite-tsconfig-paths` · ไม่มี coverage · ไม่มี setupFiles
- `lib/__tests__/` 13 ไฟล์ ทุกไฟล์เป็น pure function
- `vercel.json` — cron เดียว `0 3 * * *` → `/api/keep-alive`
- `.env.local` มี **6 ตัว** (ไม่มี `CRON_SECRET` — ตั้งเฉพาะบน Vercel)
- `app/api/` **13 route** · ตรวจแล้ว **ทั้ง 13 เส้นเรียก `rateLimitGuard` ครบ ไม่มีเส้นไหนหลุด**
- `postgres_changes` **11 จุดใน 10 hooks**
- `docker`/`supabase` CLI **ไม่มีบนเครื่องนี้** · `node v20.12.2` · `npm 10.5.0`
- `.gitignore:34` = `.env*` (กิน `.env.example` ด้วย) · `/coverage` ถูก ignore ไว้แล้ว
- `next@16.3.0` → `engines.node: ">=20.9.0"`

### ที่ขัดกับบรีฟของ P1 (P1 ขอให้บอก)

1. ✅ ทุกข้อเท็จจริงที่ P1 เขียนมา **ตรงกับของจริงหมด** — ไม่มีข้อไหนผิด
2. ➕ **เพิ่มเติมที่บรีฟไม่ได้พูดถึงและกระทบแผนโดยตรง:**
   - 🔴 **เครื่องนี้ยังไม่มี Docker และไม่มี Supabase CLI** → การตัดสินใจ "dev DB = Supabase local"
     ยังเริ่มไม่ได้จนกว่าผู้ใช้จะติดตั้งเอง (ข้อ 1.1)
   - 🔴 **Node 20 หมดอายุ (EOL เม.ย. 2026) แล้ว** — ยังใช้ต่อได้ แต่ต้องมีแผนขยับเป็น 22 หลังทริป (ข้อ 2.3)
   - 🔴 **กติกาเหล็กข้อ 3 ชนกับข้อจำกัดของ Supabase CLI ตรงๆ** (CLI บังคับ path `supabase/migrations/`)
     → ต้องใช้ workdir แยก `supabase-platform/` (ข้อ 1.3)
   - 🔴 **Realtime concurrent connection คือเพดานที่จะชนก่อนเพื่อน** ไม่ใช่ DB size หรือ bandwidth
     10 hooks × ผู้ใช้ ≈ ชนที่ ~20 ผู้ใช้พร้อมกันบน free tier (ข้อ 5.1)
   - 🟡 **`CRON_SECRET` ทำให้ uptime monitor ได้ 401 ตลอด** ต้องตั้ง monitor ให้นับ 401 = ปกติ (ข้อ 6.2)
   - 🟡 **`.gitignore` `.env*` จะกลืน `.env.example`** ที่แผนข้อ 3.3 ต้องใช้ (ข้อ 3.3 ท้ายหัวข้อ)

---

## 11. บันทึก E0 — สิ่งที่สร้างจริง (18 ส.ค. 2026 · branch `platform`)

> หัวข้อ 1–10 คือ **เอกสารออกแบบ** เขียนไว้ 17 ส.ค. ตอนที่ยังไม่มีโค้ด
> หัวข้อนี้คือ **สิ่งที่สร้างจริง** และ **ที่ที่ของจริงต่างจากแบบ** — อ่านหัวข้อนี้ก่อนเชื่อหัวข้อ 2

🔴 **อยู่บน branch `platform` เท่านั้น · ยังไม่ push · CI จึงยังไม่เคยรันบน GitHub สักครั้ง**
→ **ระหว่างนี้สิ่งที่กันจริงคือวินัยของ 8 เซสชัน ไม่ใช่เครื่องจักร** ห้ามเขียนที่ไหนว่า "มีด่านแล้ว"

### 11.1 ไฟล์ที่มี

| ไฟล์ | หน้าที่ |
|---|---|
| `.github/workflows/ci.yml` | 2 job — `guards` (เร็ว ล้มก่อน) · `verify` (lint · test · typegen · tsc · build) |
| `.github/guards.sh` | AC10 · ref guard · link allowlist · **รับ `ROOT` เป็นอาร์กิวเมนต์** |
| `.github/guards-selftest.sh` | เทสต์ด้านลบ 5 เคส |
| `.github/diff-guard.sh` | ห้าม commit ที่แตะการต่อ Supabase/env ลง `platform` |
| `.github/diff-guard-selftest.sh` | เทสต์ด้านลบ 10 เคส |
| `.github/hooks/pre-commit` | ตัวจับก่อนบนเครื่อง (**ไม่ใช่ด่านของทีม** — ดู 11.4) |

### 11.2 🔴 3 เรื่องที่ของจริงต่างจากแบบ — และทั้งสามเจอเพราะรันจริง ไม่ใช่เพราะออกแบบ

**① `next typegen` ต้องมาก่อน `tsc` — แบบในหัวข้อ 2.2 ไม่มีขั้นนี้**
`npx tsc --noEmit` ล้มด้วย `TS2304: Cannot find name 'LayoutProps'` ที่ `app/layout.tsx:31`
Next 16 สร้าง global type (`LayoutProps`/`PageProps`/`RouteContext`) ตอน build/dev — **ทรีที่เพิ่ง checkout ยังไม่มี
และ CI checkout สดทุกครั้งจึงเจอทุกครั้ง** · ดู `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:297`

**② `diff-guard` เคยเป็น no-op บน CI — ด่านที่ผ่านทุกครั้งโดยไม่ตรวจอะไรเลย**
เดาโหมดจาก `[ -t 0 ]` · **GitHub Actions ให้ stdin ของทุก `run:` step เป็น `/dev/null` ซึ่งไม่ใช่ tty**
→ เข้าโหมด stdin → อ่านรายชื่อได้ว่าง → ขึ้น ✅ ทุกครั้ง
🔴 **self-test 7 เคสผ่านหมด เพราะทุกเคสป้อน stdin เข้าไปเอง จึงทดสอบแต่โหมดที่ CI ไม่ได้ใช้**
**เจอเพราะจะทำ hook เลยต้องรู้ว่าโหมด stdin ทำงานยังไง — ไม่ใช่เพราะเทสต์จับได้**
> **เทสต์พิสูจน์ได้แค่เรื่องที่มันจำลอง · โหมดที่มันไม่ได้จำลอง คือโหมดที่ไม่มีใครรู้ว่ายังไม่ถูกตรวจ**

แก้เป็น flag `--stdin` ชัดเจน + เคสที่ล้มถ้าบั๊กนี้กลับมา

**③ กฎ "ห้ามมี `NEXT_PUBLIC_SUPABASE`" กว้างเกินไปเมื่อเจอ diff จริง**
จับ `ci.yml` (ค่า placeholder ที่ `next build` ต้องใช้) และ `.md` 3 ไฟล์ที่แค่**พูดถึง**ชื่อตัวแปร
(`devops.md` · `backlog.md` ของ P8 · `security-review.md` ของ P4)
→ จำกัดที่นามสกุลโค้ด (`.ts .tsx .js .jsx .mjs .cjs`) เพราะ**การเดินสาย env เกิดในโค้ด ไม่ใช่ในเอกสาร**
⚠️ **ช่องที่ยอมเปิดไว้โดยรู้ตัว:** workflow yaml ที่ใส่ค่า env จริงไม่โดนกฎนี้จับ · รับได้เพราะ yaml ไม่ได้ต่อแอปเข้า DB เอง ·
gitleaks จับค่าจริงอยู่แล้ว · และการแก้ workflow เห็นชัดในรีวิว

### 11.3 กติกาที่ตกผลึกจาก E0 — ใช้กับด่านทุกตัวที่จะเขียนต่อจากนี้

1. **ทุก guard ต้องมีเทสต์ด้านลบ** — *ด่านที่ไม่เคยเห็นของผิด กับด่านที่พัง หน้าตาเหมือนกันเป๊ะ*
2. **ต้องมีเทสต์ด้านบวกคุมด้วย** — ถ้าด่านล้มทุกอย่าง เคสด้านลบจะเขียวหลอกทั้งชุด
3. **self-test รันก่อนด่านจริงเสมอ** — ถ้าด่านพัง ผลเขียวของด่านไม่มีความหมาย
4. **ต้องล็อกขอบเขตด้วยเทสต์ด้านบวก ไม่ใช่แค่ห้ามหลวม** — ด่านถูกรัดแน่นขึ้นเรื่อยๆ ได้เหมือนกติกา
   · เคสที่ทำหน้าที่นี้: *ref ในเอกสารเชิงบรรยายต้องไม่โดนจับ* · *เอกสารที่พูดถึงชื่อ env ต้องไม่โดนจับ*
   · **มติที่ล็อกด้วยเทสต์ ไม่หมดอายุเงียบเหมือนมติที่ล็อกด้วยเอกสาร**
5. **ทรีจริงกับทรีจำลองต้องวิ่งผ่านโค้ดชุดเดียวกัน** (`ROOT`/`--stdin` เป็นอาร์กิวเมนต์) — ถ้าคนละชุด เทสต์พิสูจน์คนละอย่างกับที่ CI ใช้
6. **ตรวจไม่ได้ ≠ ปลอดภัย** — หา diff ไม่ได้ / link แล้วแต่ไม่มี secret = ถือว่าไม่ผ่าน
7. **รันด่านซ้ำหลังทุก merge** — ด่านที่ผ่านก่อน merge ไม่ได้แปลว่าผ่านหลัง merge

### 11.4 pre-commit hook — ขอบเขตที่ห้ามนับเกิน

`git config core.hooksPath .github/hooks` (P1 ตั้งให้ 18 ส.ค.)
🔴 **ไม่ใช่ด่านของทีม** — `--no-verify` ข้ามได้ · คนที่ `clone` ใหม่ต้องตั้ง config เอง · **CI คือด่านจริง hook เป็นตัวจับก่อน ห้ามนับซ้ำเป็นสองด่าน**

**กลไกที่เข้าใจผิดกันมาแล้วครั้งหนึ่ง:** `.git/config` **แชร์ระหว่าง worktree จริง** แต่ `core.hooksPath` ที่เป็น
**พาธสัมพัทธ์ resolve เทียบรากของแต่ละ worktree** → ชี้คนละที่ → **ทรีหลักไม่มีไฟล์ = ไม่มี hook ทำงานบน `main`**
ข้อเท็จจริงสองข้อนี้เข้ากันได้ ไม่ขัดกัน

🔴 **การเช็ค branch ในบรรทัดแรกของ hook ห้ามลบ แม้จะดูเป็นโค้ดตายวันนี้** —
ไฟล์ hook ถูก commit บน `platform` → **วันที่ merge เข้า `main` มันจะไปโผล่ในทรีหลักและเริ่มทำงานเอง**
ตอนนั้นการเช็ค branch คือสิ่งเดียวที่กันไม่ให้ hook ขวางการแก้บั๊กหน้างานบน `main`
**หลักเดียวกับ fail-open ที่ `proxy.ts:43`: ด่านที่ขวางการแก้บั๊กหน้างาน แย่กว่าความเสี่ยงที่มันกัน**

### 11.5 ของค้างที่บล็อกอยู่ — **ปรับปรุง 24 ส.ค. 2026**

⚠️ **ฉบับ 18 ส.ค. ล้าสมัย 3 บรรทัด** — เก็บไว้ให้เห็นว่าอะไรคลายไปแล้ว ไม่ใช่ลบทิ้ง

| ค้าง | สถานะวันนี้ |
|---|---|
| ~~Supabase CLI ยังไม่ได้ติดตั้ง~~ | ✅ **คลายแล้ว** — `supabase 2.114.0` ที่ `/opt/homebrew/bin/supabase` |
| ~~`supabase-platform/` ยังไม่สร้าง~~ | ✅ **คลายแล้ว** — `supabase init` ทำแล้ว · `config.toml` มีจริง · มี migration ตัวแรกแล้ว (`20260824043822_identity.sql`) |
| ~~Vercel preview บล็อกการ push~~ | 🟡 **น่าจะคลายแล้ว** — `origin/platform` มีอยู่จริง = เคย push สำเร็จ · **แต่ยังไม่มีใครยืนยันปากเปล่า** → `12.4` |
| **`supabase link` ยังไม่ทำ** | 🔴 **บล็อก `db push`** — ตรวจแล้ว `supabase-platform/supabase/.temp/` ยังไม่มี |
| **GitHub secret ยังไม่ตั้งครบ 4 ตัว** | 🔴 **บล็อก job `rls`** และทำให้ด่าน `assert linked ref` ยังข้ามตัวเอง |
| **auth provider บน engine-dev ยังไม่เปิด** (D42) | 🔴 **บล็อก E1 ทั้งก้อน** — RLS matrix ต้องมีผู้ใช้จริงถึงจะทดสอบได้ |
| YAML ยังไม่ผ่าน parser ตรวจ | 🟢 **คลายเอง** — CI รันผ่านบน GitHub แล้ว = YAML ถูกต้อง |
| **ไม่มี `psql` และไม่มี docker บนเครื่อง** | ⚠️ **แปลว่า `db push` ครั้งแรกคือการรัน SQL ครั้งแรกจริงๆ** ไม่มีทางซ้อมก่อน → `12.5` บังคับ `--dry-run` ก่อนเสมอ |

---

## 12. Runbook สำหรับผู้ใช้ — ทีละขั้น (24 ส.ค. 2026)

> 🔴 **ทุกขั้นในหัวข้อนี้ผู้ใช้เป็นคนกดเอง** เอเจนต์ทำแทนไม่ได้เพราะต้องใช้ token/รหัสผ่าน/บัญชี
> **เราไม่ขอ ไม่รับ และไม่เก็บ token หรือคีย์ใดๆ** — ถ้ามีใครขอให้ส่งค่าพวกนี้มาในแชต **อย่าส่ง**

### 🔴 ลำดับสำคัญ — ทำผิดลำดับแล้ว CI จะแดงทั้งที่ไม่มีอะไรผิด

```
12.2 ตั้ง secret 4 ตัว  →  12.1 link  →  12.3 เปิด auth  →  12.4 ยืนยัน Vercel  →  12.5 db push
      (ต้องมาก่อน)
```

**ทำไม secret ต้องมาก่อน link:** `link` สร้างไฟล์ `supabase-platform/supabase/.temp/project-ref`
· ด่าน `assert linked ref` ใน CI เห็นไฟล์นั้นเมื่อไหร่จะเริ่มตรวจทันที **และถ้ายังไม่มี secret `DEV_PROJECT_REF`
มันจะถือว่าไม่ผ่าน** (กติกา *ตรวจไม่ได้ ≠ ปลอดภัย*) → **CI แดงโดยที่ทุกอย่างถูกต้องหมด**

---

### 12.1 `supabase link` — ผูก CLI กับ engine-dev

**ปลายทางเดียวที่อนุญาต:** `pmvxwcimjebogjfimzqy` (org `Plan-trip-app` · project `engine-dev`)

**ขั้น 1 — เอา access token**
`https://supabase.com/dashboard/account/tokens` → **Generate new token** → ตั้งชื่อ (เช่น `plan-korea-cli`)
→ **คัดลอกทันที · หน้าเว็บจะไม่แสดงให้ดูอีก**

**ขั้น 2 — 🔴 พิสูจน์ token ก่อนใช้ (มติ P1 · 24 ส.ค. 2026 · ห้ามข้าม)**

```bash
SUPABASE_ACCESS_TOKEN=<วาง token ตรงนี้> supabase projects list
```

**ต้องเห็น `engine-dev` ในผลลัพธ์ · ถ้าไม่เห็น หยุด อย่าไปต่อ**

| ถ้าพลาดแบบนี้ | ขั้นนี้จับได้ยังไง |
|---|---|
| token เป็นค่าว่าง (ตัวแปรไม่ได้ตั้ง) | ลิสต์จะขึ้น `a-gleam` + `Korea-Trip` **ไม่มี `engine-dev`** — เห็นด้วยตาทันที |
| token ของบัญชีผิด | เหมือนกัน — ไม่มี `engine-dev` |
| token ถูก | ✅ `engine-dev` โผล่ = **เคสด้านบวก** ยืนยันว่าเส้นทางที่ถูกยังทำได้จริง |

**ทำไมต้องมีขั้นนี้ ทั้งที่ดูซ้ำซ้อน:** ทางกันแบบ *"ระวังอย่าพิมพ์ผิด"* **พึ่งวินัย** และกติกาแบบนั้นพังเงียบ
**ขั้นนี้ไม่ได้ขอให้คุณระวัง — ถ้าพิมพ์ผิดจริง มันบอกคุณเอง** · เป็น read-only ปลอดภัยสนิท ไม่เขียนอะไรทั้งนั้น
🎯 คือกฎ *"ทุกด่านต้องมีเทสต์ด้านลบ"* ของเราเอง เอามาใช้กับ **ตัวตน** แทน **สิทธิ์แถว** (P1)

⚠️ **ส่วนที่ทดสอบแล้ว vs ยังไม่ได้ทดสอบ (กติกา D3) — ขั้นนี้เป็นด่านกั้น จึงต้องบอกให้ชัด:**
· ✅ **เคสด้านลบทดสอบจริงแล้ว** 24 ส.ค. 2026 — `SUPABASE_ACCESS_TOKEN= supabase projects list` (ค่าว่าง)
  คืน `a-gleam` + `Korea-Trip` **ไม่มี `engine-dev`** ตามตารางเป๊ะ
· ✅ **เคสด้านบวกทดสอบแล้วเช่นกัน 24 ส.ค. 2026** — ผู้ใช้รันด้วย token จริง **`engine-dev` โผล่จริง**
  (ตอนเขียนครั้งแรกยังพิสูจน์ไม่ได้ เพราะไม่มี token ของบัญชีที่เข้า `Plan-trip-app` — **ตอนนี้ครบทั้งสองด้านแล้ว**)

**ขั้น 3 — เอา DB password ของ engine-dev**
`https://supabase.com/dashboard/project/pmvxwcimjebogjfimzqy/settings/database`
· ถ้าจำรหัสเดิมไม่ได้ กด **Reset database password** แล้วคัดลอกอันใหม่
· ⚠️ **นี่คือรหัสของ engine-dev เท่านั้น การรีเซ็ตไม่กระทบ DB ทริปแม้แต่นิดเดียว** (คนละโปรเจกต์ คนละ org)

**ขั้น 4 — รันคำสั่ง** (แทน `<TOKEN>` ด้วยค่าจากขั้น 1 — ตัวที่ผ่านขั้น 2 มาแล้ว)

```bash
cd /Users/park/plan-korea-platform && SUPABASE_ACCESS_TOKEN=<TOKEN> supabase link --project-ref pmvxwcimjebogjfimzqy --workdir supabase-platform
```

· มันจะ **ถามรหัสผ่าน DB** (จากขั้น 3) แบบพิมพ์แล้วไม่ขึ้นจอ — พิมพ์แล้ว Enter
· สำเร็จแล้วจะเกิดไฟล์ `supabase-platform/supabase/.temp/project-ref` (ถูก `.gitignore` อยู่แล้ว ไม่ขึ้น git)

🔴 **ห้ามใช้ `supabase login`** ถึงจะสะดวกกว่า — คำสั่งนั้น **เก็บ token ไว้ถาวรในเครื่อง**
ซึ่งคือสิ่งที่กติกา *"token ใส่หน้าคำสั่งเป็นครั้งๆ"* ตั้งใจกันพอดี · **ใส่หน้าคำสั่งแล้วสิทธิ์หมดไปพร้อมคำสั่งนั้น**

> 🔴 **แต่เครื่องนี้ login ค้างอยู่แล้ว — ตรวจพบ 24 ส.ค. 2026 (P6)**
> `supabase projects list` คืนผลได้**โดยไม่ต้องใส่ token** → มีคนเคยรัน `supabase login` ไปก่อนหน้านี้
> บัญชีที่ค้างอยู่เห็น 2 โปรเจกต์: `a-gleam` และ **`Korea-Trip` (DB ทริปจริง)** · **ไม่เห็น `engine-dev`**
> **ผลต่อขั้นนี้:** คำสั่งขั้น 4 ที่ใส่ `SUPABASE_ACCESS_TOKEN=` หน้าคำสั่ง **ยังถูกต้องและใช้ได้**
> **ทดสอบแล้ว 24 ส.ค. 2026:** ใส่ token ปลอมหน้าคำสั่ง → **พัง** = **env ชนะ login ที่ค้างจริง** ไม่ใช่แค่เชื่อว่าชนะ
>
> 🔴 **แต่ token ที่เป็น "ค่าว่าง" ไม่ชนะ — มันเงียบแล้วถอยกลับไปใช้ login ที่ค้างแทน**
> `SUPABASE_ACCESS_TOKEN= supabase projects list` → **คืนผลปกติ** เหมือนไม่ได้ใส่อะไรเลย (ทดสอบแล้ว)
> **เข้าทางนี้ได้ง่ายกว่าที่คิด:** เขียน `SUPABASE_ACCESS_TOKEN=$MYTOKEN …` แล้ว `$MYTOKEN` ไม่ได้ตั้ง → เชลล์แทนเป็นค่าว่าง
> → คำสั่งจะ **สลับตัวตนไปเป็นบัญชีที่ค้างอยู่โดยไม่บอก** · อันตรายไม่ใช่ที่มัน "พัง" แต่ที่มัน **ไม่ได้พังด้วยเหตุผลที่คุณคิด**
> วันนี้อาการจะโผล่เป็น error เรื่องสิทธิ์ที่อ่านไม่ออก (เพราะบัญชีที่ค้างไม่เห็น `engine-dev`)
> **แต่วันที่บัญชีนั้นได้สิทธิ์ `engine-dev` เมื่อไหร่ อาการจะหายไปเลย แล้วมันจะรันเงียบสนิท**
> ✅ **วิธีกันที่ใช้จริง คือ "ขั้น 2 — พิสูจน์ token ก่อนใช้" ข้างบน** — มันจับเคสนี้ได้ตรงๆ ด้วยตา
> · วาง token ตรงๆ อย่าผ่านตัวแปร ยังเป็นนิสัยที่ดี **แต่มันพึ่งวินัย จึงไม่นับเป็นด่าน**
> · ⚪ **`supabase logout` เป็น "ทางเลือกถ้าอยากตัดให้จบ" ไม่ใช่ขั้นบังคับ — มติ P1 24 ส.ค. 2026**
>   ⚠️ **มันเป็น global ไม่ใช่ต่อโปรเจกต์** — จะไปตัด CLI ของ `~/mu-phone` ที่ใช้ Supabase คนละใบด้วย
>   และ `§12.1` ห้าม `supabase login` อยู่ → **logout แล้วจะไม่มีทางกลับที่กติกาเราอนุญาต** (ทางตันที่กติกาเราสร้างเอง)
>   🔴 **และมันแก้อาการไม่ใช่เหตุ** — วันหน้ามีคน `login` อีก กับดักกลับมาทันที · **ขั้น 2 ทำงานทุกครั้งไม่ว่า state เป็นยังไง**
> **ผลที่ต้องระวัง:** คำสั่ง `supabase` ใดๆ ที่รัน **โดยไม่ใส่ token หน้าคำสั่ง จะไม่ error เรื่องสิทธิ์**
> มันจะวิ่งด้วยบัญชีที่ค้างอยู่ ซึ่งแตะ **DB ทริป** ได้ · ถ้าอยากตัดความเสี่ยงนี้ให้จบ ให้รัน `supabase logout` ก่อนเริ่ม

> ### 🔴 กับดักที่ต้องรู้ก่อนขั้น 4 — `link` ผูกกับ "ที่ที่คุณยืน" ไม่ใช่กับ repo
> ถ้าพิมพ์ `supabase db push` **โดยลืม `--workdir`** จะเจอ:
> ```
> Cannot find project ref. Have you run supabase link?
> ```
> ⚠️ **ข้อความนี้ไม่ได้แปลว่า "ยังไม่ได้ link" — มันแปลว่า "คุณยืนผิดที่"** และมัน**ชี้คุณไปที่คำสั่งที่จะติดตั้งกับดักพอดี**
> 🔴 **ห้ามรัน `supabase link` ตรงนั้นเด็ดขาด** · ถ้าทำ รากจะกลายเป็น workdir ที่ link แล้ว
> แล้ว `db push` รอบถัดไปจะรัน **31 migration ของทริป** ใส่ DB ที่ link ไว้ — **เงียบสนิท ไม่มี error สักบรรทัด**
> ผลไม่ใช่หายนะแต่หลอกตา: DB ได้สคีมา**ทริป** ดูใช้งานได้ทุกอย่าง ส่วน `identity` ไม่ได้ลงเพราะคนละ workdir
> → P4 รันเมทริกซ์แล้วแดง แล้วจะไปไล่หาสาเหตุที่ RLS ทั้งที่ปัญหาคือ**สคีมาผิดใบ** (P1 ชี้ 24 ส.ค. 2026)
>
> **✅ ทางที่ถูกเมื่อเจอ error นี้:** อย่า `link` — เติม `--workdir supabase-platform` เข้าไปในคำสั่งเดิม แล้วรันใหม่
> **ด่านที่กันให้แล้ว:** `.github/guards.sh` แดงทันทีถ้าเจอ `.temp/` นอก `supabase-platform/`
> ⚠️ แต่ `.temp/` ถูก `.gitignore` ไว้ **ด่านนี้จึงไม่มีวันแดงบน CI** — กัดตอนรัน `guards.sh` บนเครื่องเท่านั้น

⚠️ **ช่องที่ `link` กันไม่ได้ และต้องรู้ไว้:** `supabase db push --project-ref <อะไรก็ได้>` **ข้าม link ได้**
→ สิ่งที่กันจริงคือ **บล็อก assert ที่หัว migration** ซึ่งจะ `raise exception` ทันทีถ้าเจอตาราง `trip_meta`
(= DB ทริป) แล้ว rollback ทั้ง transaction · **ยืนยันแล้วว่าบล็อกนี้อยู่ในไฟล์จริง บรรทัด 31–39**

---

### 12.2 GitHub secret 4 ตัว — **ทำก่อน 12.1**

`https://github.com/parkALoha/Plan-Korea/settings/secrets/actions` → **New repository secret** (ทำ 4 รอบ)

| ชื่อ secret (พิมพ์ให้ตรงตัวพิมพ์ใหญ่เล็ก) | ค่าที่ใส่ | เอามาจากไหน |
|---|---|---|
| `DEV_PROJECT_REF` | `pmvxwcimjebogjfimzqy` | พิมพ์ตรงๆ ได้เลย |
| `DEV_SUPABASE_URL` | `https://pmvxwcimjebogjfimzqy.supabase.co` | พิมพ์ตรงๆ ได้เลย |
| `DEV_SUPABASE_ANON_KEY` | คีย์ที่ขึ้นต้น **`sb_publishable_…`** | หน้า API keys ของ engine-dev |
| `DEV_SERVICE_ROLE_KEY` | คีย์ที่ขึ้นต้น **`sb_secret_…`** | หน้าเดียวกัน · ต้องกด **Reveal** ก่อน |

**หน้าที่ไปเอาคีย์:** `https://supabase.com/dashboard/project/pmvxwcimjebogjfimzqy/settings/api-keys`

🔴 **engine-dev ใช้คีย์รุ่นใหม่ หน้าตาไม่เหมือนโปรเจกต์ทริป** — รุ่นเก่าเป็น JWT ยาวๆ ขึ้นต้น `eyJ…`
รุ่นใหม่แยกเป็น **publishable** (เปิดเผยได้ ขึ้น bundle ได้) กับ **secret** (ห้ามหลุด)
· **ตัวไหนไปช่องไหน:** `publishable` → `DEV_SUPABASE_ANON_KEY` · `secret` → `DEV_SERVICE_ROLE_KEY`
· ⚠️ **ใส่สลับกันจะไม่มีอะไรฟ้องทันที** แต่เทสต์ RLS จะแดงที่เคส `jwtRole` ซึ่งตรวจว่าคีย์เป็น role ที่อ้างจริง

⛔ **ห้ามใส่ค่าของ Supabase ทริปจริงใน 3 ตัวหลังเด็ดขาด** — ทั้ง 3 ตัวถูกส่งเข้าเทสต์ที่**สร้างและลบข้อมูล**

> 🔴 **รู้ล่วงหน้าแล้วว่า job `rls` จะยังแดงต่อไปแม้ตั้ง secret ถูกทุกตัว — ไม่ใช่ความผิดของผู้ใช้**
> `lib/__tests__/rlsMatrix.test.ts:49` มีฟังก์ชัน `jwtRole()` ที่อ่าน claim `role` โดยการ **แยก JWT ด้วยจุด
> แล้ว base64-decode ส่วนกลาง** · คีย์รุ่นใหม่ของ engine-dev (`sb_publishable_…` / `sb_secret_…`)
> **ไม่ใช่ JWT ไม่มีจุด ไม่มี claim ให้ถอด** → คืน `null` → เคส *"ANON ไม่ใช่ anon key"* ล้มแน่นอน
> **จำลองแล้วยืนยัน:** JWT เก่า → `"anon"` · `sb_publishable_…` → `null` · `sb_secret_…` → `null`
> · **เป็นงานของ P4 ต้องแก้ตัวตรวจให้รองรับคีย์ 2 รูปแบบ** · **ห้ามแก้ด้วยการปิดเคสนี้ทิ้ง**
> เพราะมันคือเคสที่กัน "หยิบคีย์ผิดใบ" ซึ่งเป็นความผิดพลาดที่แพงที่สุดในชุดนี้

---

### 12.3 เปิด auth provider 2 ทางบน engine-dev (D42)

> 🟢 **อ่านก่อนถ้ากังวลเรื่อง Google:** งานนี้ **ไม่แตะ API key ทั้ง 2 ใบที่ใช้อยู่เลยแม้แต่ตัวอักษรเดียว**
> `PLAN.md §4` ข้อ -4 คือเรื่อง **API key** (Maps/Places/Routes) · อันนี้คือ **OAuth client** ซึ่งเป็น
> **ของคนละชนิด สร้างแยก ลบแยก** อยู่คนละหน้าในคอนโซล · **ถ้าอันนี้พัง แผนที่ไม่กระทบ**

> ### 🔴 ค่าเริ่มต้น: **สร้าง OAuth client ในโปรเจกต์ Google Cloud ของตัวเอง** (แก้ 24 ส.ค. 2026)
> ~~"สร้างในโปรเจกต์ใหม่ก็ได้ — แค่สะดวกกว่าเพราะมีบัญชีอยู่แล้ว"~~
> 🔴 **ฉบับเดิมเขียนผิดน้ำหนัก: วางไว้เป็นทางเลือกเพื่อความสบายใจ และ*เหตุผลที่ทำให้มันจำเป็น*ไม่มีอยู่เลยสักบรรทัด**
>
> **เหตุผลที่หายไป: OAuth consent screen เป็นของ _โปรเจกต์_ ไม่ใช่ของ _client_**
> `galvanized-pipe-427006-t6` เป็นโปรเจกต์ของ **ธุรกิจอีกร้านของผู้ใช้ (`A GLEAM`)** — ถ้าสร้าง client ในนั้น จะได้อย่างใดอย่างหนึ่ง:
> · ปล่อยชื่อเดิมไว้ → **หน้าล็อกอิน Plan Korea ขึ้นว่า "A GLEAM ต้องการเข้าถึงบัญชี Google ของคุณ"**
> · เปลี่ยนชื่อเป็น Plan Korea → **หน้าล็อกอินของร้านนั้นเปลี่ยนตามไปด้วย**
> ⚠️ **ทั้งสองทางไม่มี error ไม่มีอะไรพัง — มันแค่ผิด และผิดในที่ที่ผู้ใช้ปลายทางเห็น**
>
> ✅ **ของจริงตอนนี้แยกแล้ว** — อยู่ในโปรเจกต์ใหม่ชื่อ `plan-korea`
> **หลักฐานว่าแยกจริงคือ project number เปลี่ยน** (`1047997121841-` → `450149358675-`)
> 🔴 **ห้ามเขียน Client ID / Client secret ลงเอกสารนี้** — บันทึกแค่ว่าแยกแล้วพอ

> ### 🔴 ก่อนแตะอะไรในหน้า dashboard — ยืนยันก่อนว่าอยู่โปรเจกต์ไหน (เพิ่ม 24 ส.ค. 2026)
> **เกิดขึ้นจริงแล้ววันนี้:** ผู้ใช้เปิดหน้า provider แล้ว **callback URL เป็นของ `ejzibhgqhxdzkovsnpds` = DB ทริปจริง**
> **จับได้ด้วยการอ่าน callback URL ก่อนกด Save** · ช่อง Client ID ยังว่าง **ไม่มีอะไรลง DB ทริป**
> — แต่ห่างจาก Save แค่คลิกเดียว
> 📌 **มีอย่างน้อย 2 คนอ่านเจอแยกกัน ไม่ได้นัดกัน** (ผู้ใช้ส่งภาพหน้าจอเดียวกันไปหลายเซสชัน)
> **ไม่ระบุตัวคนโดยตั้งใจ** — ตัวคนไม่ใช่สาระของบรรทัดนี้ และเป็นส่วนเดียวที่ยืนยันตรงกันไม่ได้:
> **แต่ละเซสชันมองเห็นแต่ฝั่งตัวเอง** จึงยืนยันได้แค่ว่า *ตัวเองอ่านเจอ* ไม่ใช่ว่า *มีใครอ่านเจออีกไหม*
>
> 🔴 **ที่หยุดไว้ได้คือ "คนอ่านเจอ" ไม่ใช่ด่าน** — เพราะฝั่ง dashboard ไม่มีด่านสักตัว
> 🔴 **และการที่ต้องใช้คนอ่านถึง 2 คนกว่าจะหยุดได้ ทำให้ข้อนี้หนักขึ้น ไม่ใช่เบาลง**
>
> 🔴 **ทุกด่านที่เรามี (`guards.sh` · CI · บล็อก assert หัว migration) มองไม่เห็นเบราว์เซอร์เลยสักตัว**
> งานในหน้า dashboard **อยู่นอกทุกด่าน** — ตรงนี้มีแค่ตาคุณ ไม่มีอะไรรับไม้ต่อถ้าพลาด
>
> ## 🔴 ด่านแรกสุด — อ่าน **Callback URL** ก่อนแตะอะไรทั้งสิ้น (ใช้ร่วมกันทั้ง (ก) และ (ข))
> `https://supabase.com/dashboard/project/pmvxwcimjebogjfimzqy/auth/providers` → **Google**
> **ไม่ต้องเปิดสวิตช์ ไม่ต้องกดอะไรเลย**
> ช่อง **Callback URL (for OAuth)** **แสดงค่าอยู่แล้วตั้งแต่สวิตช์ยังปิด**
> (ยืนยันด้วยภาพหน้าจอ 24 ส.ค. 2026 — P1: สวิตช์ Enable ปิดอยู่ แต่ callback URL + ปุ่ม Copy ใช้งานได้)
>
> · ขึ้นต้นด้วย `https://pmvxwcimjebogjfimzqy.` → ✅ อยู่ถูกโปรเจกต์ · ทำ (ก)/(ข) ต่อได้
> · ขึ้นต้นด้วย `https://ejzibhgqhxdzkovsnpds.` → 🔴 **DB ทริป · หยุด** สลับที่ project picker มุมซ้ายบน
>
> **ทำไมใช้ค่านี้ ไม่ใช่แถบที่อยู่:** แถบที่อยู่คือค่าที่ **คุณ** พิมพ์หรือกดเข้าไปเอง ·
> callback URL คือค่าที่ **เซิร์ฟเวอร์ตอบกลับมา** — **เป็นพยานที่ไม่ได้มาจากปากเรา** (P1)
> · แถบที่อยู่ยังใช้เป็น **ด่านคู่** ได้ (ต้องมี `pmvxwcimjebogjfimzqy` เหมือนกัน) **แต่ไม่ใช่ด่านหลัก**
>
> 🔴 **ทำไมด่านนี้ต้องมาก่อนสวิตช์ — ไม่ใช่แค่เรื่องลำดับ**
> ถ้าต้องเปิดสวิตช์ก่อนจึงจะรู้ว่าอยู่ถูกที่ = **เปลี่ยน state ก่อนรู้ว่าอยู่ถูกที่ไหม** ซึ่งกลับหัวกลับหาง
> **วันนี้ผู้ใช้เปิดสวิตช์บน DB ทริปไปแล้วจริง** ถึงได้เจอ `At least one Client ID is required`
> 🔴 **ที่รอดคือ Google บังคับให้มี Client ID ไม่ใช่เพราะเราออกแบบไว้** — ความบังเอิญที่ห้ามพึ่งรอบหน้า
>
> ⚠️ **ถ้าเปิดหน้าแล้วไม่เห็น Callback URL** (Supabase เปลี่ยนหน้าตาได้ · ภาพที่ยืนยันคือของวันนี้เท่านั้น)
> **ให้ถอยไปใช้แถบที่อยู่ · 🔴 ห้ามเปิดสวิตช์เพื่อให้มันโผล่** — นั่นคือการเปลี่ยน state เพื่อจะได้ตรวจ
>
> ## 🔴 ด่านเดียวกันนี้ใช้กับ **Google Cloud Console** ด้วย — ไม่ใช่แค่ Supabase
> **ก่อนพิมพ์อะไรในหน้า Google Console ดู `project=` บนแถบที่อยู่ก่อนทุกครั้ง**
> **เกิดขึ้นจริงวันเดียวกัน:** หลังผู้ใช้กด Create โปรเจกต์ใหม่ **Google เด้งกลับไปหน้า Branding ของโปรเจกต์เก่าเอง**
> พร้อม toast *"Now viewing project My First Project"* · พิมพ์ต่อตรงนั้น = **แก้ consent screen ของร้านอื่น**
> ที่รอดเพราะดู `project=` ก่อนพิมพ์
>
> > 🎯 **หน้าจอเปลี่ยน แต่บริบทไม่เปลี่ยน และไม่มีอะไรเตือน**
>
> **กลไกเดียวกับ callback URL ทุกประการ · คนละผู้ให้บริการ · วันเดียวกัน**
> → สมมติฐานที่ใช้ได้กับทั้งสองเจ้า: **อย่าเชื่อว่า "หน้าที่เปิดอยู่" คือ "ของที่กำลังแก้"** ให้เชื่อค่าที่หน้าเว็บบอกเท่านั้น
>
> ✅ **ยืนยันแล้ว 24 ส.ค. 2026 (P1 เห็นภาพหน้าจอของผู้ใช้):** บัญชีในเบราว์เซอร์ **เห็น `engine-dev` ได้จริง**
> (แท็บเขียน `engine-dev | Plan-trip-app` · callback URL เป็น `pmvxwcimjebogjfimzqy`)
> → **ตัดสมมติฐาน "ถูกเด้งออกเพราะบัญชีไม่มีสิทธิ์" ทิ้งได้** · 🔴 **อย่าไปไล่แก้สิทธิ์บัญชีเบราว์เซอร์ ไม่ใช่สาเหตุ**
>
> ⚠️ **แต่ "แล้วเขาไปอยู่โปรเจกต์นั้นได้ยังไง" ยังไม่มีคำตอบจากปากผู้ใช้ (สถานะ ณ 24 ส.ค. 2026)**
> หลักฐานข้างบน **ตัดทางหนึ่งออก — ไม่ได้ยืนยันอีกทาง** · เดิมบรรทัดนี้เขียนว่า "เป็นการไล่กดใน UI"
> **ซึ่งเป็นการสรุปสาเหตุจากหลักฐานที่ทำได้แค่ตัดตัวเลือก** — ถอนออกแล้ว **อย่าเติมกลับจนกว่าเขาจะตอบ**
> 🟢 **โชคดีที่ทางกันไม่ขึ้นกับคำตอบ:** อ่าน callback URL ก่อนแตะอะไร **ใช้ได้ทั้งสองกรณี**
> เลยไม่มีเหตุผลต้องรอคำตอบก่อนจะป้องกัน — และไม่มีเหตุผลต้องเดาคำตอบเพื่อให้เอกสารดูจบ
> ⚠️ **ที่ยังไม่รู้ (กติกา D3):** ถ้าบัญชี*อื่น*ที่ไม่มีสิทธิ์เปิดลิงก์นี้ จะขึ้น 404 หรือเด้งเงียบๆ — **ยังไม่ทดสอบ ไม่เดา**
>
> 📌 **บัญชีในเบราว์เซอร์ ≠ บัญชีของ CLI** — คนละกลไก คนละที่เก็บ อาจเป็นคนละบัญชี (และวันนี้เป็นคนละบัญชีจริง)
> 🔴 **ผลของ `supabase projects list` ใช้สรุปสิ่งที่เห็นในเบราว์เซอร์ไม่ได้ และกลับกันก็ไม่ได้**
> เคยมีคนต่อสายผิดมาแล้ว 24 ส.ค. 2026 — **ข้อเท็จจริงถูก แต่เอาไปใช้ผิดเส้นทาง**

**(ก) Email / magic link — ง่ายที่สุด ทำก่อน**
`https://supabase.com/dashboard/project/pmvxwcimjebogjfimzqy/auth/providers` → **Email**
→ เปิด **Enable Email provider** · เปิด **Enable Email OTP / Magic Link**
→ ⚠️ **ปิด "Confirm email" ไว้ก่อนสำหรับ dev** ไม่งั้นเทสต์ที่สร้างผู้ใช้จะค้างรอยืนยันอีเมล

**(ข) Google OAuth — 3 ขั้น ต้องสลับหน้าไปมา**

**ขั้น 1 — คัดลอก callback URL จาก Supabase ก่อน**
หน้า providers เดิม → **Google** → ช่อง **Callback URL (for OAuth)** (เห็นได้ตั้งแต่สวิตช์ยังปิด)
→ **คัดลอกค่านั้นไว้** — ต้องเป็น `https://pmvxwcimjebogjfimzqy.supabase.co/auth/v1/callback` **เป๊ะ**
🔴 **ต้องคัดลอกจากหน้าจริง ห้ามพิมพ์เอง** — พิมพ์ผิดตัวเดียว Google จะปฏิเสธด้วย `redirect_uri_mismatch`

> 🔴 **ตรวจซ้ำอีกครั้งก่อนวางลง Google** — ค่านี้คือด่านแรกสุดของหัวข้อนี้ (ดูกล่องบนสุดของ `§12.3`)
> ต้องขึ้นต้นด้วย `https://pmvxwcimjebogjfimzqy.` เท่านั้น
> ❌ ถ้าเป็น ref ทริป → **อย่าวางลง Google อย่ากด Save** · สลับโปรเจกต์แล้วคัดลอกใหม่
> · **ค่าที่คัดลอกมาแล้วให้ทิ้ง อย่าเอามาใช้ต่อ**

**ขั้น 2 — สร้าง OAuth client ใน Google Cloud**
`https://console.cloud.google.com/apis/credentials`
🔴 **เลือกโปรเจกต์ให้ถูกก่อน — ต้องเป็นโปรเจกต์ของ Plan Korea เอง (`plan-korea`) ไม่ใช่ของธุรกิจอื่น**
**แล้วยืนยันด้วย `project=` บนแถบที่อยู่ ไม่ใช่ด้วยชื่อที่เห็นบนหัวหน้าเว็บ** — Google เด้งบริบทกลับเองได้ (ดูกล่องด่านบนสุด)
→ **Create credentials → OAuth client ID**
→ Application type: **Web application**
→ **Authorized redirect URIs** → **Add URI** → วาง callback URL จากขั้น 1
→ Create → คัดลอก **Client ID** และ **Client secret**
· ถ้าถูกบังคับให้ตั้ง **OAuth consent screen** ก่อน: เลือก **External** · กรอกชื่อแอปกับอีเมลติดต่อ · ไม่ต้องส่ง verification
  🔴 **consent screen เป็นของโปรเจกต์ ไม่ใช่ของ client** — ชื่อที่กรอกตรงนี้คือชื่อที่ผู้ใช้ปลายทางเห็นตอนล็อกอิน
  **กรอกในโปรเจกต์ผิด = ไปเปลี่ยนหน้าล็อกอินของธุรกิจอื่น โดยไม่มี error อะไรเลย**
· ⚠️ ตอนอยู่ในโหมด Testing ต้อง **เพิ่มอีเมลตัวเองใน Test users** ไม่งั้นล็อกอินไม่ผ่าน

**ขั้น 3 — กลับมาใส่ที่ Supabase**
หน้า providers → Google → วาง **Client ID** + **Client secret** → **Save**

---

### 12.4 ยืนยัน Vercel (คำถามเดียว ตอบ 1 บรรทัด)

`https://vercel.com` → project **korea-trip-plan** → **Settings**
🔴 **แก้ 24 ส.ค. 2026 — ฉบับเดิมเขียนว่า `Settings → Git` ซึ่งผิด ทั้งสองอย่างไม่ได้อยู่ในหน้านั้น**
(ผู้ใช้เปิดตามแล้วหาไม่เจอ · เป็นข้อที่ `§12.7` เตือนไว้เองว่าชื่อเมนูเขียนจากความจำ ยืนยันไม่ได้)

**ยืนยันว่า 2 อย่างนี้ยังตั้งอยู่ — คนละหน้ากัน:**
1. **Ignored Build Step** → **Settings → Build and Deployment** · ยังเป็นเงื่อนไขที่ให้ build เฉพาะ `main`
2. **Vercel Authentication (Standard Protection)** → **Settings → Deployment Protection** · ยัง **เปิด** อยู่

→ ตอบกลับแค่ *"ยังอยู่ทั้งคู่"* หรือ *"อันไหนหาย"*

---

### 12.5 `db push` — ขั้นสุดท้าย ทำหลังจาก 12.1–12.4 ครบ

🔴 **ห้ามพิมพ์ `supabase db push` เปล่าๆ — ต้องมี `--workdir supabase-platform` ทุกครั้ง** (P8 เสนอ 24 ส.ค. 2026)
ถ้าลืม จะเจอ `Cannot find project ref` ซึ่ง **แปลว่ายืนผิดที่ ไม่ใช่ยังไม่ได้ link** · **ห้าม `link` ตรงนั้น** — ดูกล่องกับดักใน `§12.1`
· ✅ ด่านที่กันให้: `.github/guards.sh` แดงถ้าเจอ `.temp/` นอก `supabase-platform/` (แต่ `.temp/` ถูก gitignore **ด่านนี้ไม่แดงบน CI** กัดตอนรันบนเครื่องเท่านั้น)

🔴 **รัน `--dry-run` ก่อนเสมอ ห้ามข้าม** — เครื่องนี้ **ไม่มี psql และไม่มี docker** (ตรวจแล้ว)
แปลว่า **ไม่มีทางซ้อม SQL ที่ไหนได้เลย · `db push` จริงคือการรันครั้งแรกในชีวิตของไฟล์นี้**

```bash
cd /Users/park/plan-korea-platform && SUPABASE_ACCESS_TOKEN=<TOKEN> supabase db push --workdir supabase-platform --dry-run
```

**อ่านผลให้เห็นชื่อไฟล์ `20260824043822_identity.sql` และไม่มีอย่างอื่นแปลกปลอม** แล้วค่อยรันจริง:

```bash
cd /Users/park/plan-korea-platform && SUPABASE_ACCESS_TOKEN=<TOKEN> supabase db push --workdir supabase-platform
```

**ถ้าเห็นข้อความนี้ = ระบบทำงานถูกต้อง ไม่ใช่บั๊ก:**
```
ERROR: ผิดโปรเจกต์: ฐานนี้มีตาราง trip_meta = นี่คือ DB ทริปจริง ไม่ใช่ engine-dev
```
→ แปลว่ากำลังชี้ไป **DB ทริป** · **หยุดทันที อย่าฝืน อย่าใส่ `--project-ref` เพื่อข้าม** แล้วบอกทีม

**หลัง push สำเร็จ:** รัน self-check ที่ P1 เตรียมไว้ (`docs/engine/schema/0001_identity_selfcheck.sql`)
โดย **คัดลอกไปวางใน SQL Editor ของ engine-dev** — มันเป็น `select` ที่ต้องอ่านผล ไม่ใช่ DDL

---

### 12.6 สร้าง `.env.local` ของทรี `platform` (ต้องมีก่อนทดสอบล็อกอินในเบราว์เซอร์)

> # 🔴 ห้ามก๊อป `.env.local` จากทรีหลัก เด็ดขาด
> `/Users/park/plan-korea/.env.local` **ชี้ไป `ejzibhgqhxdzkovsnpds` = DB ทริปจริง**
> ก๊อปมา = **dev server ของ `platform` ต่อ DB ทริป** · `refreshSession()` ยิงไปที่นั่น**ทุก request**
> และวันที่ใครรันโค้ดที่เขียนข้อมูล **มันเขียนลงของจริง**
>
> 🔴 **เขียนไว้บนสุดเพราะมันคือสิ่งที่คนจะทำเป็นอันดับแรก** — ทรี `platform` ไม่มี `.env*` เลยสักไฟล์
> พอเปิดหน้าแล้วเจอ 500 `ไม่ได้ตั้ง env NEXT_PUBLIC_SUPABASE_URL` **ที่ที่หาง่ายที่สุดคือทรีข้างๆ**

**สร้างใหม่ที่ `/Users/park/plan-korea-platform/.env.local` — เอาค่าจาก `engine-dev` เท่านั้น**
`https://supabase.com/dashboard/project/pmvxwcimjebogjfimzqy/settings/api-keys` → คัดลอก **Project URL** + **anon public**

```
NEXT_PUBLIC_SUPABASE_URL=https://pmvxwcimjebogjfimzqy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key ของ engine-dev>
```

**ยืนยันด้วยวิธีเดียวกับที่ใช้ทั้งวัน — อ่านค่าที่อยู่ในไฟล์ ไม่ใช่เชื่อว่าก๊อปถูก:**
```bash
grep SUPABASE_URL /Users/park/plan-korea-platform/.env.local
```
· ขึ้นต้นด้วย `https://pmvxwcimjebogjfimzqy.` → ✅ · เป็น ref ทริป → 🔴 **ลบทิ้งแล้วสร้างใหม่**

✅ **ด่านที่กันให้แล้ว:** `.github/guards.sh` แดงทันทีถ้าเจอ `.env*` ในทรีที่ถือ ref ทริป
⚠️ **แต่ `.gitignore` กัน `.env*` ไม่ให้ขึ้น git → ด่านนี้ไม่มีวันแดงบน CI** กัดตอนรัน `guards.sh` บนเครื่องเท่านั้น
🔴 **ห้ามเขียน anon key จริงลงเอกสารนี้** — บันทึกแค่ว่าตั้งแล้วพอ

---

### 12.7 ⚠️ ส่วนที่ผมยืนยันไม่ได้ — บอกไว้ตรงๆ ตามกติกา D3

| ยืนยันแล้วจากอะไร | รายการ |
|---|---|
| ✅ **รัน CLI จริงบนเครื่อง** | flag ของ `link` / `db push` (`--dry-run` · `--project-ref` · `--password`) · `supabase login` เก็บ token ถาวร · CLI เวอร์ชัน 2.114.0 · ไม่มี psql/docker |
| ✅ **อ่านไฟล์จริงในทรี** | บล็อก assert ที่บรรทัด 31–39 · ชื่อไฟล์ migration · `.temp/` ยังไม่มี = ยังไม่ link |
| 🔴 **ยืนยันไม่ได้ — เขียนจากความจำของหน้า dashboard** | **ชื่อปุ่ม · ชื่อเมนู · โครงหน้าเว็บทั้งหมดใน 12.1–12.4** รวมถึงพาธ URL ของหน้า settings |

🔴 **ถ้าหน้าจอจริงไม่ตรงกับที่เขียน ให้บอกกลับมา อย่าเดาเอง** — Supabase กับ Google Cloud
ย้ายเมนูบ่อยมาก · **URL ที่ให้ไว้น่าจะพาไปถูกหน้ากว่าการไล่กดเมนู** ลองใช้ URL ก่อน
· และ **ค่าที่ต้องคัดลอก (callback URL · คีย์) ต้องคัดลอกจากหน้าจริงเสมอ ห้ามพิมพ์ตามเอกสารนี้**

---

## 13. Runbook — cutover (`E9-AC1`) · เขียน 27 ส.ค. 2026 โดย P6

> 🔴 **อ่านทั้งหัวข้อก่อนกดคำสั่งแรก** · ขั้นตอนที่ทำผิดลำดับในนี้ **ไม่มี error ให้เห็น** จนกว่าจะสาย
> **คนกด = P6** (เจ้าของโซน ops) · **คนตัดสินว่าเริ่มได้ = P1**

### 13.1 🔴 หน้าต่างนี้ครอบ *ชุดที่ย้ายรอบนี้* ไม่ใช่ทั้งแพลตฟอร์ม
P7 เสนอด่าน *"ห้าม cutover ตอนมีคนอยู่ในทริป"* · P1 ค้านว่าประธาน *"ทั้งแพลตฟอร์ม"* จะไม่มีวันว่างเมื่อมีผู้ใช้เยอะ · **P7 แก้เป็น "ชุดที่ย้ายรอบนี้" แล้ว**
→ **freeze window อ้างอิงหน่วยนั้น** · ประกาศกับผู้ใช้ของชุดนั้น ไม่ใช่ทั้งเว็บ

### 13.2 ก่อนเปิดหน้าต่าง — ทำให้เสร็จ **ก่อน** ไม่ใช่ระหว่าง
🔴 **ขั้น ① (สร้างแถว `profiles` ของ B ด้วยมือ) ต้องเสร็จก่อนหน้าต่างเปิด** — `backlog.md` เขียนไว้เอง:
> *ทำ ③ ก่อน ① ถูก FK ปฏิเสธ — **ไม่เงียบ แต่มันดังตอน freeze window เปิดอยู่***

· **ถ้าทำระหว่างหน้าต่าง = เว็บปิดอยู่ระหว่างที่เรารอคนมากดของที่ทำล่วงหน้าได้** · เป็นเวลาปิดที่ไม่จำเป็นทั้งหมด
· ✅ เช็คก่อนเปิด: `role` ของ B ถูกระบุเป็นลายลักษณ์อักษรแล้ว (`E9-AC8`) · **`viewer` พิมพ์ผิดแล้วไม่มี error** และ `E9-AC3` ยังผ่าน — **ต้องอ่านค่าจริงหลัง insert ไม่ใช่เชื่อว่าพิมพ์ถูก**

```bash
# ยืนยันว่าไม่มีโหมดค้างจากรอบก่อน (ต้องได้ read_only:false)
curl -s -X POST "$URL/rest/v1/rpc/system_mode" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" \
     -H "Content-Type: application/json" -d '{}'
```

### 13.3 เปิดหน้าต่าง
```sql
select public.set_system_mode(
  p_read_only               => true,
  p_allow_maintenance_write => true,
  p_reason                  => 'E7 cutover · ชุด <ระบุชุด> · <ชื่อคนกด> · <เวลา>',
  p_expires_in_minutes      => null          -- 🔴 ต้องเป็น null
);
```
🔴 **`p_expires_in_minutes => null` สำหรับ `E7` เท่านั้น และนี่คือเหตุผล:**
· ไม่ระบุ = **15 นาที** · ถ้า `E7` ยาวกว่านั้น **โหมดจะหลุดกลางการย้ายข้อมูล**
· → ผู้ใช้เขียนทับ half-state · **dev DB ไม่มี PITR** (`rlsMatrix.test.ts:483`) · **กู้ไม่ได้**
· 🎯 **`null` ไม่ใช่ "ค่าที่ใหญ่ที่สุด" — มันคือการปฏิเสธคำถาม** *"รอนานแค่ไหนแล้วค่อยปล่อยให้เขียนทับ half-state"* ซึ่งไม่ควรมีคำตอบ
· ⚠️ **หางที่ยังไม่มีกลไกกัน:** ถ้าคนรันลืมใส่ `null` **ไม่มีอะไรฟ้อง** · runbook นี้คือด่านเดียวที่มี · P4 pin เวลา `E7` เป็นเทสต์คู่กัน

### 13.4 ระหว่างหน้าต่าง — **ของพวกนี้จะพัง และมันคือพฤติกรรมที่ถูกต้อง**
| อาการ | ใช่บั๊กไหม |
|---|---|
| งานที่รันเป็น `service_role` (cron อุ่นแคช · edge function) **เขียนไม่ได้** | ❌ **ไม่ใช่บั๊ก** — `auth.uid()` เป็น null ต้องประกาศ `set local app.maintenance_write` จึงจะเขียนได้ |
| ชุดสด (`rls` job) แดง | ❌ **ไม่ใช่บั๊ก** — `check-readonly-mode.py` จะประกาศว่า *"ผลรอบนี้ไม่มีความหมาย"* |
| ผู้ใช้กดบันทึกแล้วไม่สำเร็จ | ✅ ตามเจตนา — ข้อความต้องบอกว่า *"ระบบอยู่ในโหมดอ่านอย่างเดียว"* ไม่ใช่ *"บันทึกไม่สำเร็จ"* |

🔴 **และข้อห้ามที่ไม่มีวันยกเว้น: `edge function` ต้องไม่ประกาศ `set local app.maintenance_write` เด็ดขาด**
· มัน **ไคลเอนต์เรียกได้** — ถ้าประกาศเจตนาได้ **ผู้ใช้คนไหนบนอินเทอร์เน็ตก็ทำให้เกิดการเขียนระหว่าง cutover ได้** แค่ขอสถานที่หนึ่งแห่ง
· 🎯 *"ทางยกเว้นกลายเป็นทางเข้า"* ในรูปที่แย่ที่สุด เพราะประตูเปิดจากอินเทอร์เน็ต
· ✅ ทิศที่ถูกตอนโหมดเปิด: **แคชเขียนไม่ได้ → ผู้ใช้ได้คำตอบช้า ไม่ใช่ได้คำตอบผิด** · และต้องล้มเงียบ (ยังตอบคำขอได้ แค่ไม่แคช) **ไม่ใช่โยน 503**

### 13.5 🔴 เกณฑ์ยกเลิก — **ตัดสินก่อนเริ่ม ไม่ใช่ตอนมันเกิน**
> **หน้าต่างที่ประกาศไว้ ไม่ใช่*คำทำนาย* แต่เป็น*คำสัญญาที่มีเงื่อนไขยกเลิกเขียนไว้ล่วงหน้า***

· **เกินเวลาที่ประกาศ → ยกเลิกและย้อนกลับ ไม่ใช่ขอต่อเวลา**
· 🎯 **เหตุผล: การเกินแล้วต่อเวลา คือสิ่งที่ทำลายความเชื่อถือของการประกาศครั้งหน้า** · การเกินแล้วยกเลิกตามที่ประกาศไว้ = แผนทำงานตามที่ออกแบบ
· ⚠️ **ยกเลิกได้ก็ต่อเมื่อ `E7` ย้อนกลับได้** — ถ้าขั้นไหนย้อนไม่ได้ **ขั้นนั้นคือจุดที่ไม่มีทางถอย และต้องรู้ก่อนเปิดหน้าต่าง ไม่ใช่ระหว่าง**

### 13.6 ปิดหน้าต่าง
```sql
select public.set_system_mode(
  p_read_only               => false,
  p_allow_maintenance_write => false,
  p_reason                  => 'E7 cutover เสร็จ · <เวลา>',
  p_expires_in_minutes      => null
);
```
🔴 **ใช้ชื่อพารามิเตอร์เสมอ ห้ามใส่ตามตำแหน่ง** — สองตัวแรกเป็น `boolean` ติดกัน
· `set_system_mode(false, true, …)` กับ `set_system_mode(true, false, …)` **หน้าตาต่างกันนิดเดียว แต่คนละโหมดคนละโลก**
· และสลับแล้ว **ไม่มี error** — Postgres รับทั้งคู่ · **ชื่อพารามิเตอร์คือด่านเดียวตรงนี้**
· ✅ ยืนยันด้วย `system_mode()` ว่าได้ `read_only:false` · **อย่าเชื่อว่าคำสั่งสำเร็จ ให้อ่านค่ากลับ**
· ✅ รัน `.github/guards.sh` และชุดสดหนึ่งรอบ — **ถ้ายังแดงด้วย `readonly-mode` แปลว่าโหมดยังไม่ปิดจริง**

### 13.7 ⚠️ ตัวเลขที่เรายังไม่มี — และวิธีได้มันมา
`E9-AC1` เขียนว่า **freeze window = เวลาจริงของ `E7-AC7` × 2** · **แต่ `E7` ยังไม่เคยรัน เราจึงยังไม่มีตัวตั้ง**
🔴 **และ `backlog.md` เตือนไว้เองว่าสูตรนี้คิดจากเวลารัน migration ล้วน ๆ — ไม่ได้เผื่อขั้นที่ต้องรอคน**
· ✅ **ขั้น ① ย้ายออกไปก่อนหน้าต่าง (13.2) แล้ว** → สูตร × 2 จึงใช้ได้กับสิ่งที่มันตั้งใจวัด

**วิธีได้ตัวตั้ง โดยไม่ต้องเดา:**
1. รัน `E7` บน**ฐานเปล่า** → ได้ **ต้นทุนคงที่** (สร้าง index · ops ที่ไม่ขึ้นกับจำนวนแถว) = พื้นล่าง
2. รันบนข้อมูลสังเคราะห์ **1× · 10× ของปริมาณที่คาด** → ได้ **ความชัน** (ต้นทุนต่อแถว)
3. ประกาศ = **(คงที่ + ชัน × N) × 2** · **ตัวเลขที่วัดมา ไม่ใช่ตัวเลขที่รู้สึกว่าน่าจะพอ**
· 🔴 **ห้ามใช้ตัวเลขจากข้อ 1 อย่างเดียว** — ฐานเปล่าให้พื้นล่าง **ไม่ใช่ค่าประมาณ** · ต่างกันตรงที่ข้อมูลจริงมีกี่แถว
· 📌 **นี่เป็นงานของ `E7` ไม่ใช่ของหัวข้อนี้** — จดไว้เพื่อให้คนทำ `E7` รู้ว่ามีคนรออยู่ปลายทาง

### 13.8 📌 ช่องที่รู้ตัวว่าเปิดอยู่ (ไม่ใช่ช่องที่มองไม่เห็น)
· **`mu-phone` อยู่ org เดียวกับ `engine-dev`** — ผู้ใช้ตัดสินแล้วว่า *"ใช้ไปก่อน"* (27 ส.ค. 2026)
  · ด่าน `allowed-project-ref` กัน **เส้นทาง `link`** · 🔴 **กันคำสั่งที่พิมพ์ `--project-ref` ตรง ๆ ไม่ได้**
  · → **ระหว่าง cutover ให้ตรวจ `--workdir` และ ref ทุกคำสั่งด้วยตา** · ไม่มีเครื่องกันให้ตรงนี้
· **`db_pre_request` ที่ตั้งจากแดชบอร์ด** — ด่าน `api-config` ของผมเห็นเฉพาะที่อยู่ใน `config.toml` · P4 ทำเคสสดถาวรคู่กัน

---

## 14. ขอบเขตของด่าน — สิ่งที่ `git ls-files` มองไม่เห็น (27 ส.ค. 2026 · P6)

> เขียนไว้ที่นี่ตามที่ P1 ขอ **เพราะมันกระทบเกือบทุกด่าน** และเรื่องแบบนี้ไม่ควรอยู่ในข้อความที่เลื่อนหาย

### 14.1 🔴 หน้าต่างที่คุณตรวจ ไม่ใช่หน้าต่างที่ด่านบังคับใช้

ด่านเกือบทั้งหมดประกาศขอบเขตด้วย **`git ls-files`** — เลือกแบบนี้โดยตั้งใจ เพราะ `P-61`
สอนว่าขอบเขตที่คนเขียนด่านพิมพ์เอง (`grep -rn lib/ app/ components/`) **จะลืมโฟลเดอร์ที่ของจริงอยู่**

⚠️ **แต่ `git ls-files` ไม่คืนไฟล์ที่ยังไม่ถูก `add`** → **ด่านมองไม่เห็นไฟล์ใหม่จนกว่าจะ stage**

**เกิดขึ้นจริงแล้ว 1 ครั้ง:** `check-naive-strip.py` รันแล้วขึ้น `✅ ตรวจ 231 ไฟล์` ตอนตรวจก่อน commit
· หลัง `c6dfa6f` (ซึ่งทำให้มัน tracked) **มันจับ canary ของตัวเองแล้วแดงทันที** บนหัว branch
· 🎯 **`git add` ไม่ได้ดูเหมือนการเปลี่ยนพฤติกรรมของด่าน แต่มันคือ** — และไม่มีอะไรเตือนระหว่างนั้น

### 14.2 ⚖️ ตัดสิน: **เตือน ไม่ขยายขอบเขต**

P1 เสนอให้เอา *untracked ที่ไม่อยู่ใน `.gitignore`* เข้าขอบเขตด้วย · **ชั่งแล้วไม่เอา**

| | |
|---|---|
| **① ใน CI ไม่มี untracked เลย** | `actions/checkout` เช็คเอาต์จาก git ล้วน → ช่องนี้**มีเฉพาะตอนรันในเครื่อง** · ขยายขอบเขตไม่เปลี่ยนคำตัดสินของ CI แม้แต่นิดเดียว |
| **② ทรีนี้ 8 เซสชันใช้ร่วมกัน** | scratch file ของคนอื่นจะทำให้ **ด่านของคุณ** แดง ทั้งที่ไฟล์นั้นไม่ใช่ของคุณ และอาจไม่มีวันถูก commit → `P-35` เต็ม ๆ |

🎯 **คือเอาความแดงปลอมมาแลกกับการปิดช่องที่มีแค่ในเครื่อง — ราคาแพงกว่าของที่ได้**

✅ **ทางที่เลือก:** `guards.sh` พิมพ์ **คำเตือนที่ไม่ทำให้แดง** เมื่อเจอ `*.ts`/`*.tsx`/`*.py`
ที่ยังไม่ถูก stage — ทำให้จุดบอด**มองเห็นได้ ณ วินาทีที่มันสำคัญ** โดยไม่แตะคำตัดสิน

### 14.3 📌 กติกาที่ใช้ได้จริง

```bash
git add -- <path> && .github/guards.sh .
```

🔴 **"รันด่านก่อน commit แล้วเขียว" ให้ผลอ่อนกว่าที่ทุกคนคิด ถ้ามีไฟล์ใหม่ในชุดนั้น**
· กับไฟล์ที่ **แก้** (tracked อยู่แล้ว) ไม่มีปัญหานี้ — `git ls-files` เห็นมันตลอด
· กับไฟล์ที่ **เพิ่งสร้าง** ต้อง `add` ก่อน ถึงจะได้คำตอบที่ตรงกับที่ CI จะเห็น
· ⚠️ และ `git add -- <พาธเต็มทีละไฟล์>` เป็นสิ่งที่ `TEAM.md` บังคับอยู่แล้วสำหรับไฟล์ใหม่ — **ไม่มีขั้นตอนใหม่ให้จำ**

### 14.4 🎯 กับดักคู่แฝด: ด่านที่ต้องถือ "ของที่ห้าม" ไว้เพื่อทดสอบตัวเอง

ด่านที่ตรวจซอร์ส **ต้องมีตัวอย่างของสิ่งที่มันห้าม** อยู่ในไฟล์ตัวเอง (canary) — ไม่งั้นพิสูจน์ไม่ได้ว่ายังจับได้
· **ถ้าด่านสแกนภาษาเดียวกับที่ตัวเองเขียน มันจะจับตัวเอง**
· ตัดคอมเมนต์ช่วยได้เฉพาะกรณีที่ตัวอย่างอยู่ใน*คอมเมนต์* · **canary ต้องเป็นสตริงจริงถึงจะป้อนเข้า regex ได้**

✅ **วิธีที่เรพนี้ใช้ (มาก่อนเรื่องนี้):** `guards-selftest.sh:11` · `TRIP_REF="$(printf 'ejzibhgqhxdz%s' 'kovsnpds')"`
→ **ประกอบทีละชิ้น** · ไฟล์ถือของที่ห้ามไว้ได้ โดยไม่ถือมันในรูปที่ค้นเจอ
· ใช้แล้วที่ `check-naive-strip.py` (`_PY`/`_TS`) และ `check-api-hosts.py` (`_D`)
· 🔴 **ไม่เลือก "ข้ามไฟล์ตัวเอง"** — ด่านคือที่ที่รูปพัง ๆ มีโอกาสโผล่จริงมากที่สุด ปิดตามันต่อตัวเองคือปิดตาผิดจุด

### 14.5 ✅ เคสด้านบวกไม่ใช่ของแถม — มันคือสิ่งเดียวที่กันการ "รัดด่าน" ที่ดูเหมือนความรอบคอบ

`E4-AC5` ห้าม **API host** (โค้ดเรายิงเอง · ใช้คีย์ · กินโควตา)
**ไม่ได้ห้าม deep-link ที่ผู้ใช้กด** (`map.kakao.com` · `map.naver.com`) — นั่นคือตัวส่งมอบของ `E4-AC4`

🔴 P4 เสนอเพิ่ม `map.*` เข้ารายการห้าม · **P1 ตัดออก และถูก** — ใส่แล้วด่านแดงที่ `lib/mapLinks.ts:49,55`
และ **การซ่อมที่ "เป็นธรรมชาติที่สุด" ของความแดงนั้นคือลบปุ่มนำทางทิ้ง** ซึ่งใช้จริงระหว่างทริป 11–21 ต.ค.

🎯 **ด่านที่มีแต่เคสด้านลบ จะถูกรัดจนกินของถูกเสมอ เพราะการรัดเพิ่มดูเหมือนความรอบคอบทุกครั้ง**
· `check-api-hosts.py` จึงมี `DEEPLINKS_OK` ที่ทำให้ **ด่านปฏิเสธที่จะรัน** ถ้ามีกฎไหนจับ deep-link
  — แดง **ที่ระดับกฎ ก่อนสแกนไฟล์ใด ๆ** พร้อมข้อความว่าทำไม · ไม่ต้องรอ CI มาบอก

### 14.6 🔴 ความตึงสองทิศที่ต้องอยู่ด้วยกัน — "รัดพอไหม" ไม่ใช่คำถามแรก

เขียนไว้ตามที่ P1 ขอ **เพราะสองกฎนี้ขัดกันเอง และความขัดนั้นคือเนื้อหา ไม่ใช่ข้อผิดพลาด**

| สถานการณ์ | ทิศที่ถูก | ตัวอย่างจริง (27 ส.ค. 2026) |
|---|---|---|
| **อยู่ในขอบเขตของเกณฑ์** | 🔴 **พลาดฝั่งหลวมแย่กว่าแดงเกิน** → รัดให้แน่น | `(?:^|\.)kakaomobility\.com` พลาด apex domain · `openapi\.naver\.com` ไม่แมตช์ `openapi.map.naver.com` เพราะมี `.map.` คั่น |
| **อยู่นอกขอบเขตของเกณฑ์** | 🔴 **การรัดเพิ่ม = เขียนเกณฑ์ใหม่โดยไม่มีใครรีวิว** → อย่าเพิ่ม | OAuth (`kauth.kakao.com` · `nid.naver.com`) — **การล็อกอินไม่ใช่ข้อมูลแผนที่** |

🎯 **คำถามแรกจึงไม่ใช่ *"รัดพอไหม"* แต่คือ *"อยู่ในขอบเขตไหม"* — และเป็นคำถามที่ regex ตอบไม่ได้**

### 14.7 🎯 เส้นแบ่งของ `E4-AC5` ฉบับที่ใช้ตัดสินจริง (P1 · 27 ส.ค. 2026)

> `AC5` พูดถึง **ข้อมูลแผนที่/เส้นทาง** — **ไม่ใช่ทุกอย่างที่ Kakao/Naver ขาย**
> → ครอบ **ทุกกลไกที่ส่งข้อมูลแผนที่มาถึงเรา** (REST · SDK · tile) · **ไม่ครอบเรื่องอื่นของบริษัทเดียวกัน**

**ทำไม OAuth ไม่เข้า:** ถ้าวันหนึ่งอยากให้คนเกาหลีล็อกอินด้วย Kakao นั่นคือการตัดสินใจเรื่อง**ตัวตนผู้ใช้**
ซึ่ง `AC5` ไม่ได้พูดถึงเลยสักคำ
· 🔴 **และด่านที่บังคับมากกว่าที่เกณฑ์เขียน จะกลายเป็นตัวเกณฑ์เอง** — วันที่มีคนเสนอ Kakao login
  ด่านจะแดง แล้วบทสนทนาจะกลายเป็น *"แก้ด่านยังไง"* แทน *"ควรทำไหม"*
  **และไม่มีใครรีวิวด่าน แบบที่รีวิวเกณฑ์**
· ถ้าอยากห้ามผู้ให้บริการตัวตนต่างชาติจริง **นั่นคือเกณฑ์ใหม่ที่ต้องเขียนก่อน แล้วค่อยมีด่าน**

**ทำไม CDN/tile เข้า (และ *ไม่ใช่* การขยายความหมาย):** 🎯 **ฝัง SDK ของ Kakao = เรียก API ของ Kakao
โดยให้ SDK เรียกแทน** · tile คือข้อมูลแผนที่ที่วิ่งมาถึงจอผู้ใช้
· 🔴 ถ้าห้าม `dapi.kakao.com` แต่ปล่อยให้ฝัง SDK ที่เรียกมันแทนเรา
  **ด่านจะห้ามแค่ *วิธีเขียน* ไม่ใช่ *สิ่งที่ทำ***
· ⚠️ **ความเสี่ยงที่ P1 รับไว้แล้ว:** `daumcdn.net` เสิร์ฟของอื่นของ Kakao ด้วย ไม่ใช่แค่ tile
  → วันที่แดงใส่ของที่ไม่ใช่แผนที่ **นั่นคือของที่ต้องคุยกัน ไม่ใช่ของที่ต้องรีบปลด**

### 14.7.2 ⏹️ `*.kakaocdn.net` — **พิจารณาแล้ว ไม่เพิ่ม** (P4 ถอนข้อเสนอของตัวเอง · 27 ส.ค. 2026)

จดไว้เพราะ **ถ้าไม่จด อีก 3 เดือนจะมีคนเสนอซ้ำ และไม่มีใครรู้ว่าเคยคิดแล้ว**

· `daumcdn.net` **เข้า** — เป็น tile ของ *Kakao/Daum Maps* โดยเฉพาะ → ตรงเกณฑ์ *"ข้อมูลแผนที่"*
· `kakaocdn.net` **ไม่เข้า** — เท่าที่ทราบเสิร์ฟ asset ของ KakaoTalk/บัญชีเป็นหลัก **ไม่ใช่ map tile**
  และ tile จริงถูก `daumcdn` ครอบไปแล้ว → **ไม่ตรงเกณฑ์ map-data ของ `14.7`**

🎯 **เหตุผลที่ P4 ถอนเอง คือสิ่งที่ควรจำมากกว่าตัวข้อสรุป:**
> *"ธง `kakaocdn` เดิมของผมมาจาก **security-appetite** (`เป็น CDN ของ Kakao → ห้าม`) —
> ซึ่งเป็น principle ตัวที่ไม่มีเพดาน · ถ้าผมดันต่อ ผมจะทำผิดซ้ำในย่อหน้าที่ผมเพิ่งรับว่าผิด"*

⚠️ **ข้อสรุปนี้ตั้งอยู่บนความเชื่อที่ยังไม่มีใครวัด** — ว่า `kakaocdn` ไม่เสิร์ฟ map tile
· 🔴 **เงื่อนไขที่เปิดเรื่องนี้ใหม่ได้:** มีคน**วัดเจอ**ว่า `kakaocdn` เสิร์ฟ tile ที่ `daumcdn` ไม่ครอบ
  → นั่นคือ **bounded finding ใหม่ ไม่ใช่ appetite** และควรเข้าทันที
· ❌ *"มันเป็น CDN ของ Kakao"* เพียงอย่างเดียว **ไม่ใช่เหตุผลที่พอ** — นั่นคือทางที่ถูกปฏิเสธไปแล้วรอบนี้

### 14.7.1 🎯 เสนอ host **จากตัวบทของเกณฑ์ ไม่ใช่จากความอยากปลอดภัย** (P4 · 27 ส.ค. 2026)

P4 สรุปเองหลังเทียบเหตุผลสองแบบที่พาไปสู่ข้อสรุปเดียวกัน (`*.ntruss.com`) — **และมันอธิบายความพลาดก่อนหน้าได้ด้วย**

| เหตุผล | เพดาน |
|---|---|
| ❌ *"เราไม่ใช้ NCP เลย → ห้ามตัวไหนก็ปลอดภัย"* | **ไม่มี** · generative principle ของมันคือ *"ห้ามอะไรก็ตามที่เกี่ยวกับ vendor แล้วเราไม่ใช้"* |
| ✅ *"`AC5` ห้าม Naver API · `ntruss.com` คือโดเมน API ทั้งใบ"* | **ตัวสเปก** |

🔴 **เหตุผลแบบแรกคือสิ่งที่ทำให้ `map.*` เกือบถูกเสนอเข้ารายการห้าม** — `map.naver.com`
"ไม่ถูกใช้ในฐานะ API" จริง **แต่ถูกใช้ในฐานะ deep-link** · เดินตาม principle ตรง ๆ มันกวาดเข้าไปด้วย
🎯 **การซ่อมที่แท้ไม่ใช่ *"จำไว้ว่าต้องยกเว้น deep-link"* แต่คือ *"ดึงกฎจากสเปก ซึ่งขีดเส้นนั้นไว้ให้แล้ว"***
· เหตุผลแบบหลังไปถึง `ntruss` **แต่ไปไม่ถึง `map.naver`** โดยไม่ต้องมีใครจำข้อยกเว้น
· 📌 **ความอยากปลอดภัยไม่มีจุดหยุด · เกณฑ์มี** — และนี่คือกลไกของ `14.6` ในรูปที่ใช้ได้ตอนเสนอของใหม่

### 14.8 ⚠️ regex ที่จับ "ลงท้ายด้วย `X.com`" เชื่อไม่ได้กับโดเมนที่มี subdomain ซ้อน

**เจอ 2 ครั้งในวันเดียว คนละคนหา:**
· `(openapi\.naver|naveropenapi)\.com` **ไม่แมตช์** `openapi.map.naver.com` (มี `.map.` คั่น) — P4 ชี้
· `(openapi\.naver|naveropenapi)\.com` **ไม่แมตช์** `naveropenapi.apigw.ntruss.com` (คนละ TLD) — P4 ชี้
· `(?:^|\.)kakaomobility\.com` **ไม่แมตช์** `https://kakaomobility.com/x` (apex · มี `/` นำหน้า) — P6 เจอ

✅ **รูปที่ใช้อยู่ตอนนี้: `(?<![a-z0-9-])<host>`** — ยอม `/` `"` `.` นำหน้า แต่ไม่ยอม `evil<host>`
🔴 **และทุกครั้งที่ขยายกฎเป็นทั้งโดเมน ต้องเพิ่มเคสด้านบวกคู่มาทันที** (เช่น `notntruss.com` ต้องไม่โดนจับ)
เพราะการขยายทำให้ความเสี่ยง *"กินคำที่ลงท้ายเหมือนกัน"* โตขึ้นพร้อมกัน
