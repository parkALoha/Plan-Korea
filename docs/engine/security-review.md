# Security Review — Dynamic Travel Platform Engine

> เจ้าของไฟล์: **P4-QA/Sec** · เขียน 17 ส.ค. 2026 · คู่กับ [`rls-policies.sql`](./rls-policies.sql)
> ขอบเขต: รีวิวสถานะความปลอดภัยของ `plan-korea` วันนี้ + แผนกันของแพลตฟอร์มหลายผู้ใช้ในระยะ 2
>
> **วิธีตรวจ:** อ่านไฟล์ SQL + โค้ด + `node_modules` เท่านั้น · **ไม่ได้ยิง Supabase `ejzibhgqhxdzkovsnpds`
> แม้แต่ request เดียว** ตามกติกาเหล็กข้อ 2 · ทุกข้ออ้างไฟล์:บรรทัดของจริง
> ข้อที่สรุปจากกลไกแต่ยังไม่ได้พิสูจน์ด้วยการรัน จะเขียนกำกับว่า **ยังไม่ยืนยันด้วยการรัน**

---

## 0. สรุปให้ P1 อ่าน 1 นาที

**ยืนยันข้อเท็จจริงของ P1 ครบทุกข้อ** รวมบั๊ก `travel_time_cache` (ยืนยันได้ถึงชั้นไลบรารี — §7.1 ของไฟล์ SQL)
และตัวเลข 53 policy / 14 ตาราง ตรงกับที่นับได้จริง

**สิ่งที่ต้องแย้ง / เพิ่มจากที่ P1 เขียนมา — 6 ข้อ เรียงตามความสำคัญ:**

| # | เรื่อง | ทำไมสำคัญกว่าที่บรีฟไว้ |
|---|---|---|
| **F1** | Storage **แย่กว่า** ที่ B3 บรรยาย | bucket ตั้ง **Public** → เส้น `/object/public/...` **ไม่ผ่าน RLS เลย** policy 4 ตัวจึงไม่ได้กันการอ่านตั้งแต่ต้น · ซ้ำ policy `select` ยอมให้ `POST /object/list/booking-files` **ไล่ชื่อไฟล์ทั้ง bucket** → ได้รายชื่อครบแล้วเปิดอ่านทุกไฟล์ ซึ่งเป็น**รูปตั๋วที่มีชื่อตามพาสปอร์ต** · และ path ไฟล์ไม่มี prefix ทริป → เขียน policy แยก tenant กับข้อมูลที่มีอยู่**ไม่ได้เลย** ต้อง rename |
| **F2** | เปิด RLS แล้ว **realtime DELETE จะหายเงียบทุกตาราง** | บั๊ก migration `0009` กลับมาในรูปแบบใหม่ — คราวนี้ต้นเหตุคือ RLS ไม่ใช่ client filter จะไล่หาผิดที่ · ต้อง `replica identity full` ทุกตารางใน publication ไม่ใช่แค่ `trip_stops` (ยังไม่ยืนยันด้วยการรัน → เคส **T-14**) |
| **F3** | `proxy.ts` matcher **ยกเว้นทุก path ที่ลงท้ายด้วยนามสกุลไฟล์** | `proxy.ts:71` ตัด `.svg .png .jpg .jpeg .webp .ico .woff woff2` ออกจากด่าน → เส้นทางใดก็ตามที่ลงท้ายด้วยนามสกุลพวกนี้**ไม่เข้าด่าน PIN เลย** · วันนี้ไม่มีรูรั่วเพราะทุก route ไม่มีนามสกุล แต่แพลตฟอร์มจะมี `[param]` และ export ไฟล์ → รูเปิดโดยไม่มีใครแก้อะไรผิด |
| **F4** | `is_locked` (ล็อกวัน) **ไม่ใช่มาตรการอะไรเลย** | บังคับอยู่ใน client ล้วนๆ ยิง REST ตรงข้ามได้ · พอมี viewer/editor คนอื่น "ล็อกแล้ว" ต้องล็อกจริง → ต้องเป็น trigger (RLS ทำไม่ได้เพราะเทียบ OLD/NEW ไม่ได้) |
| **F5** | `file_url` / `photo_url` **ไม่ผ่าน `safeHttpUrl`** ทั้งที่ `link` ผ่าน | `lib/url.ts` มีอยู่แล้วและถูกใช้ที่ `bookings.link` ทุกจุด แต่ `BookingEditModal.tsx:346` และ `app/today/page.tsx:906` ใส่ `file_url` ลง `href` ตรงๆ · เป็นการใช้มาตรการที่มีอยู่แล้วไม่ทั่วถึง ไม่ใช่มาตรการที่ขาด |
| **F6** | ช่องทำลายข้อมูลที่**ถูกที่สุด**คือ `trip_plans` DELETE | `trip_stops.plan_id references trip_plans(id) on delete cascade` (`0006:4`) + DELETE เป็น `using (true)` → ลบแผน 1 คำสั่ง = จุดแวะทั้งแผนหายทั้งชุด ไม่ต้องรู้อะไรนอกจาก plan id |

**ไม่พบ** ในสิ่งที่หลายคนคาดว่าจะเจอ (ตรวจแล้วว่าไม่มีจริง ไม่ใช่ยังไม่ได้ตรวจ):
`dangerouslySetInnerHTML` / `eval` / `new Function` = 0 จุดทั้ง repo · raw SQL ในแอป = 0 (PostgREST parameterize ให้)
· SSRF = ปลายทาง outbound เป็น endpoint ของ Google แบบ hardcode ทั้งหมด · `bookings.link` กัน `javascript:`/`data:`
เรียบร้อยแล้วที่ **ทุกจุดที่ render** (`lib/url.ts:2-10` · `BookingsPanel.tsx:112` · `today/page.tsx:871`)
ไม่ใช่แค่ที่ช่องกรอก — ตรงนี้เขียนไว้ดีและควรใช้เป็นแบบให้ F5

**Schema ของ P1 ไม่มีรูที่อุดไม่ได้** — เขียน policy ครบทั้ง 14 ตาราง + Storage บนโมเดล `trip_members` ได้
มี 4 ข้อที่ต้องขอเพิ่มของนอก RLS: `bookings_secret` (แยกคอลัมน์อ่อนไหว §5.9.1), trigger 4 ตัว (§9),
`replica identity full` (§10), และ 3 schema แทน 1 (§1)

---

## 1. Threat model

### 1.1 ใครคือผู้โจมตี

| ผู้โจมตี | ได้อะไรมาแล้ว | ความสามารถวันนี้ |
|---|---|---|
| **A. คนที่เจอ URL** | URL เว็บ | โดนด่าน PIN 4 หลัก + rate limit 10/นาที (`app/api/unlock/route.ts:8`) — ไล่ครบ 10,000 ค่าใช้ ~16 ชม. |
| **B. คนที่ดึง anon key ออกจากบันเดิล** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🔴 **ทำได้ทุกอย่างกับทุกตารางทุกแถว + ทุกไฟล์ใน bucket** ข้ามด่าน PIN ทั้งหมด (P1 พิสูจน์ด้วย curl 11 ส.ค. 2026) |
| **C. สมาชิกทริปเอง (ระยะ 2)** | บัญชีจริง + JWT | ผู้โจมตีหลักของแพลตฟอร์ม — cross-tenant, privilege escalation, self-join |
| **D. คนถือ URL ไฟล์ที่รั่ว** | public URL ของไฟล์ตั๋ว | อ่านไฟล์ได้ตลอดกาล ไม่มีวันหมดอายุ ไม่มี log |
| **E. prompt injection ผ่าน Copilot (ระยะ 2)** | เนื้อหาที่ผู้ใช้อื่นใส่ | โน้ต/ชื่อสถานที่กลายเป็นคำสั่งให้ agent เรียก tool เขียน DB — **พื้นที่โจมตีใหม่ทั้งหมด** ส่งต่อ P5 |

**B คือแกนของทุกอย่างวันนี้** และเป็นเหตุผลที่ RLS ต้องมาก่อน (E1 มาก่อน E2 ตาม `README.md`)
ตราบใดที่ policy เป็น `using (true)` มาตรการอื่นทั้งหมด (PIN, rate limit, HTTPS, `safeHttpUrl`)
กันได้แค่ทางเข้าประตูหน้า ขณะที่ประตูหลังเปิดอยู่และเขียนบอกไว้ในโค้ดเองว่าเปิด

### 1.2 จัดลำดับตามความเสียหายจริง

เรียงด้วย **ความเสียหายถ้าเกิด × ความง่ายที่จะเกิด** ไม่ใช่เรียงตามความน่าสนใจทางเทคนิค

| ลำดับ | เกิดอะไร | ทางเข้า | ความเสียหายจริง | สถานะระยะ 2 |
|---|---|---|---|---|
| **1** | ไฟล์ตั๋วรั่วทั้ง bucket | B, D — `object/list` แล้วเปิด public URL | **ชื่อตามพาสปอร์ต + เลขที่จอง** พอโทรเข้า call center อ้างเป็นเจ้าของการจอง → เปลี่ยน/ยกเลิกตั๋วคนอื่นได้ · ย้อนกลับไม่ได้ | §6 + `rls-policies.sql` §8 |
| **2** | อ่าน `bookings` ข้าม tenant | B, C | เลขที่จอง · เลขไฟลต์ · วันเวลาเดินทาง | policy + `bookings_secret` |
| **3** | อ่าน `trip_hotels` + `trip_stops` ข้าม tenant | B, C | **นอนที่ไหนคืนไหน + อยู่จุดไหนกี่โมงย้อนหลังทั้งทริป** (`visited_at` `0020` = เวลาที่อยู่ที่นั้นจริง) = สะกดรอยได้ตรงๆ | policy |
| **4** | ลบข้อมูลข้าม tenant | B, C | `trip_plans` DELETE cascade ทิ้งจุดแวะทั้งแผน (F6) · `booking-files` DELETE ลบรูปตั๋วทั้ง bucket — **ไม่มีที่สำรองในระบบ** | policy + soft delete |
| **5** | privilege escalation / self-join | C | เขียนแถว `trip_members` ของตัวเองเข้าทริปคนแปลกหน้า หรือแก้ `role` เป็น `owner` → ได้ทุกอย่างในลำดับ 1-4 ต่อเนื่อง | policy owner-only §4.3 |
| **6** | แก้ข้อมูลข้าม tenant | B, C | เปลี่ยนเวลา/สถานที่ในแผนคนอื่น → **ผู้ใช้ไปผิดที่ผิดเวลาโดยเชื่อว่าถูก** เสียหายจริงตอนอยู่ต่างประเทศ | policy + `with check` |
| **7** | เผาโควตา Google | B — ยิง `/api/place-*` หรือเขียนแคชตรง | ค่าใช้จ่ายจริงบนบัญชีเจ้าของ · rate limit เป็น in-memory ต่อ instance ซึ่งกันไม่ได้จริง | §5 + `cache` schema |
| **8** | ปฏิเสธความรับผิด | C | `added_by` เป็นข้อความที่พิมพ์เอง (`app/page.tsx:122`) → ไม่มีทางรู้ว่าใครแก้อะไร | `created_by` + trigger §9.4 |
| **9** | XSS ผ่าน `file_url` | B (ต้องเขียน DB ได้ก่อน) + เหยื่อคลิก | F5 — เป็นผลต่อเนื่องจากลำดับ 1-6 ไม่ใช่ทางเข้าเอกเทศ | ใส่ `safeHttpUrl` |

**ข้อสังเกตสำคัญ:** ลำดับ 1-6 เป็น **ทางเดียวกันหมด** คือ policy ที่เป็น `true`
แก้ที่จุดเดียว (RLS จริง) ปิดได้ 6 ข้อพร้อมกัน — นี่คือเหตุผลที่ E1 ต้องมาก่อนทุกอย่าง
และเหตุผลที่**ห้ามให้ใครเขียน UI บนโมเดลใหม่ก่อน RLS ลง** เพราะทุกจุดที่อ่าน/เขียนตรงจาก
browser (47 จุดใน 17 ไฟล์) จะพังพร้อมกันวินาทีที่ policy จริงถูกเปิด

### 1.3 map เข้า OWASP Top 10 (2021)

| OWASP | สถานะวันนี้ | หลักฐาน | แผนระยะ 2 |
|---|---|---|---|
| **A01 Broken Access Control** | 🔴 **ไม่มีการควบคุมเลยที่ชั้นข้อมูล** | 53 policy เป็น `true` · `auth.uid()` 0 จุด · storage gate แค่ `bucket_id` | ทั้งไฟล์ `rls-policies.sql` · เทสต์ T-01…T-16 |
| **A02 Cryptographic Failures** | 🟡 การออกแบบ PIN **ถูกต้อง** แต่ข้อมูลอ่อนไหวไม่ได้กัน | `pinAuth.ts:18-31` ใช้ HMAC+secret และเขียนเหตุผลกำกับว่าทำไมไม่ใช้ `sha256(pin)` เปล่า — ดีกว่าที่เห็นทั่วไป · แต่ไฟล์พาสปอร์ตอยู่ใน bucket สาธารณะ | bucket private + signed URL อายุสั้น |
| **A03 Injection** | 🟢 ต่ำวันนี้ · 🔴 สูงในระยะ 2 | ไม่มี raw SQL / ไม่มี `dangerouslySetInnerHTML` / `eval` · **แต่ Copilot ของ P5 จะเป็นพื้นผิว injection ใหม่ทั้งก้อน** | ส่งต่อ P5: tool schema ต้อง allowlist + ทุก tool เขียนต้องผ่าน RLS ในบริบท**ผู้ใช้** ห้ามใช้ service role |
| **A04 Insecure Design** | 🔴 fail-open 2 จุดโดยตั้งใจ | `proxy.ts:43` · `keep-alive/route.ts:24-27` · rate limit in-memory (`rateLimit.ts:4` เขียนเองว่า "ไม่ใช่ด่านความปลอดภัย") | §4 + §5 |
| **A05 Security Misconfiguration** | 🔴 | bucket Public · `to public` ทุก policy · 11 ตารางใน realtime publication รวมตารางตาย `trip_selections` · default privileges ให้ `anon` อัตโนมัติ | `rls-policies.sql` §2 + §10 · self-check §11 |
| **A06 Vulnerable Components** | 🟡 ไม่รู้สถานะ | ไม่มี `npm audit` / Dependabot ใน repo · Next `16.3.0` · `supabase-js ^2.112` | ส่งต่อ P6: `npm audit --production` + Dependabot ใน CI |
| **A07 Auth Failures** | 🔴 ไม่มี identity | PIN เดียวใช้ร่วมกัน · cookie 90 วัน (`pinAuth.ts:15`) · ไม่มี logout · **ไม่มีทางแยกได้ว่าใครทำอะไร** | Supabase Auth · session ที่หมดอายุจริง · refresh rotation · ระวัง email enumeration ตอนสมัคร |
| **A08 Data Integrity Failures** | 🔴 | `added_by`/`checked_by`/`hidden_by` มาจาก `localStorage["trip-who"]` = ป้ายตกแต่ง · ไม่มี audit trail | `created_by` + trigger §9.4 + ตาราง audit แยก |
| **A09 Logging & Monitoring** | 🔴 **ศูนย์** | `writeGuard.ts` บอก**ผู้ใช้**ด้วย toast แต่ไม่บันทึกอะไรฝั่งเซิร์ฟเวอร์ → ถ้ามีคนไล่ probe cross-tenant จะไม่มีใครรู้ ทั้งตอนเกิดและย้อนหลัง | ส่งต่อ P6: log 403/42501 จาก PostgREST + alert เมื่อ error rate ของ RLS พุ่ง (= สัญญาณคนกำลังลอง) |
| **A10 SSRF** | 🟢 | outbound ทั้งหมดเป็น URL Google แบบ hardcode · ไม่มีจุดที่รับ URL จากผู้ใช้ไปยิงเอง | คงสภาพ · ถ้า P5 เพิ่ม tool ที่ fetch URL ต้องรีวิวใหม่ทั้งข้อ |

**ข้อที่ประเมินสูงกว่าค่าปกติของเช็คลิสต์: A09** — ไม่ใช่เพราะสำคัญที่สุด แต่เพราะเป็นข้อเดียวที่
**ทำให้ไม่รู้ว่าข้ออื่นถูกใช้ไปแล้วหรือยัง** วันนี้ถ้ามีคนดึง anon key ไปกวาดข้อมูลตั้งแต่เดือนที่แล้ว
เราจะไม่มีทางรู้เลย และหลังเปิด RLS แล้วก็ยังไม่รู้ว่ามีใครลองหรือไม่ถ้าไม่เก็บ log

---

## 2. แผนเทสต์ RLS

จะกลายเป็น `lib/__tests__/rls.test.ts` ในระยะ 2 · รันกับ **Supabase local (Docker)** เท่านั้น

### 2.1 Fixture

P1 ขอ 2 user × 2 trip — ขอ**ขยายเป็น 4 actor** เพราะ 2 คนพิสูจน์ได้แค่ cross-tenant
ยังพิสูจน์ **viewer เขียนไม่ได้** และ **คนนอกที่ไม่ได้เป็นสมาชิกเลย** ไม่ได้ ซึ่งเป็น 2 ใน 3
ของช่องที่ policy ชุดนี้ตั้งใจปิด

```
TRIP_1  ── U_A  owner
        └─ U_C  viewer
TRIP_2  ── U_B  owner
U_D     ไม่เป็นสมาชิกทริปใดเลย
ANON    ไม่ล็อกอิน (ใช้ anon key เปล่า — เลียนแบบผู้โจมตี B)
```

client 5 ตัว แต่ละตัวถือ JWT ของตัวเอง สร้างผ่าน `auth.admin.createUser()` แล้ว `signInWithPassword`

### 2.2 🔴 3 กับดักที่ทำให้เทสต์ RLS ขึ้นเขียวทั้งที่ policy ไม่ได้กันอะไร

อ่านข้อนี้ก่อนเขียนเทสต์บรรทัดแรก — ผิดข้อใดข้อหนึ่ง เทสต์ทั้งไฟล์ไร้ค่าและจะให้ความมั่นใจผิดๆ

**กับดัก 1 — ใช้ service-role key ใน client ทดสอบ**
`service_role` มี `BYPASSRLS` → ข้าม policy ทุกตัว → **ทุกเคสผ่านหมด** รวมเคสที่ต้องการให้ fail
ป้องกัน: assert ในไฟล์เทสต์เองว่า key ที่ใช้ไม่ใช่ service role ก่อนรันเคสใดๆ
```ts
// บรรทัดแรกของ describe block — กันตัวเองพลาด ไม่ใช่กันคนอื่น
it("ต้องไม่ใช้ service-role key", () => {
  for (const k of [ANON_KEY, ...])
    expect(JSON.parse(atob(k.split(".")[1])).role).toBe("anon");
});
```

**กับดัก 2 — assert ด้วย `error` สำหรับ SELECT/UPDATE/DELETE (ผิดทั้งหมด)**
RLS **ไม่ throw ตอนอ่าน** มันกรองแถวออกเงียบๆ → PostgREST คืน **HTTP 200 + `data: []` และ `error: null`**
เช่นเดียวกับ UPDATE/DELETE ที่แถวไม่ผ่าน `using` → 200 + ไม่มี error + ไม่มีอะไรเปลี่ยน

| verb | ถูกปฏิเสธแล้วได้อะไรกลับมา | assert ที่ถูกต้อง |
|---|---|---|
| SELECT | 200 · `data: []` · `error: null` | `expect(data).toHaveLength(0)` |
| INSERT | **403 · `error.code === "42501"`** | `expect(error?.code).toBe("42501")` |
| UPDATE | 200 · `data: []` · `error: null` | อ่านซ้ำ**ในฐานะเจ้าของ** แล้วยืนยันค่าเดิมไม่เปลี่ยน |
| DELETE | 200 · `data: []` · `error: null` | อ่านซ้ำ**ในฐานะเจ้าของ** แล้วยืนยันแถวยังอยู่ |
| upsert ที่ชน | **403 · `42501`** (ON CONFLICT DO UPDATE ตรวจ USING ของ UPDATE policy) | `expect(error?.code).toBe("42501")` |

→ **UPDATE/DELETE ต้องยืนยันด้วยการอ่านซ้ำเสมอ** เขียน helper `expectUnchanged(asOwner, table, id, field)`
ถ้าเทสต์ UPDATE/DELETE ทุกเคสเขียนแค่ `expect(error).toBeTruthy()` มันจะ**ล้มเหลวเสมอแม้ policy ถูก**
แล้วคนจะไป "แก้" ให้ผ่านด้วยการเช็คผิดทาง — ซึ่งจะกลายเป็นเทสต์ที่ผ่านตลอดไม่ว่า policy จะเป็นอะไร

**กับดัก 3 — เทสต์แต่ขาอ่าน ไม่เทสต์ `with check`**
Postgres ใช้ `using` แทน `with check` ให้เองเมื่อ UPDATE policy ไม่เขียน `with check`
→ เคสที่ทดสอบแค่ "A อ่านของ B ไม่ได้" จะผ่านทั้งที่ยังเปิดช่อง **"A ย้ายแถวของตัวเองเข้าทริปของ B"**
ซึ่งร้ายกว่า เพราะเป็นการเขียน ไม่ใช่อ่าน → เคส **T-07 / T-08** มีไว้เพื่อข้อนี้เฉพาะ

### 2.3 เมทริกซ์หลัก — ทุกตาราง ทุก verb

รูปแบบซ้ำกันทุกตารางเนื้อหา (`trip_hotels` `trip_plans` `trip_settings` `trip_places` `trip_stops`
`trip_hidden_places` `place_notes` `bookings` `checklist_items`) → เขียนเป็น loop ตัวเดียว
ไม่ใช่ copy-paste 9 ชุด ตารางไหนหลุดจากลิสต์จะเห็นทันทีเพราะ loop ต้องครบ

```ts
const TENANT_TABLES = [
  { table: "trip_hotels",        tenant: "trip_id" },
  { table: "trip_plans",         tenant: "trip_id" },
  { table: "trip_settings",      tenant: "trip_id" },
  { table: "trip_places",        tenant: "trip_id" },
  { table: "trip_hidden_places", tenant: "trip_id" },
  { table: "place_notes",        tenant: "trip_id" },
  { table: "bookings",           tenant: "trip_id" },
  { table: "checklist_items",    tenant: "trip_id" },
  { table: "trip_stops",         tenant: "trip_day_id" }, // ผูกทริปผ่าน trip_days
];
```

| เคส | ผู้กระทำ | ทำอะไร | ต้องได้ |
|---|---|---|---|
| **T-01** | `U_B` | SELECT ทุกแถวของทุกตารางใน `TENANT_TABLES` | `data.length === 0` สำหรับข้อมูลของ `TRIP_1` **ทุกตาราง** |
| **T-02** | `U_B` | INSERT แถวที่ `trip_id = TRIP_1` | `42501` ทุกตาราง |
| **T-03** | `U_B` | UPDATE แถวของ `TRIP_1` (รู้ id เพราะสมมติว่ารั่ว) | ไม่มี error แต่ `expectUnchanged` ต้องผ่าน |
| **T-04** | `U_B` | DELETE แถวของ `TRIP_1` | แถวยังอยู่เมื่ออ่านในฐานะ `U_A` |
| **T-05** | `U_D` (ไม่มีทริป) | ทำ T-01…T-04 ซ้ำทั้งชุด | ผลเหมือนกันทุกข้อ — พิสูจน์ว่ากันด้วย "เป็นสมาชิกไหม" ไม่ใช่ "มีทริปไหม" |
| **T-06** | `ANON` | ทำ T-01…T-04 ซ้ำทั้งชุด | 🔴 **เคสสำคัญที่สุดของทั้งไฟล์** — พิสูจน์ว่า anon key ที่รั่วไปไร้ประโยชน์ = ปิด B3 |

### 2.4 เคสที่ต้องเขียนมือ (loop ครอบไม่ได้)

| เคส | อะไร | ต้องได้ | ปิดช่องอะไร |
|---|---|---|---|
| **T-07** | `U_B` UPDATE แถว `trip_stops` **ของตัวเอง** แต่เขียน `trip_day_id` เป็นวันของ `TRIP_1` | `42501` | ย้ายจุดแวะ**เข้า**ทริปคนอื่น — `with check` |
| **T-08** | `U_B` UPDATE `bookings` ของตัวเอง เขียน `trip_id = TRIP_1` | `42501` | ยัดตั๋วเข้าทริปคนอื่น |
| **T-09** | `U_B` INSERT `trip_members(TRIP_1, U_B, 'viewer')` | `42501` | **self-join** — ช่องที่ร้ายที่สุดของ `trip_members` |
| **T-10** | `U_C` (viewer) UPDATE `role` ของแถวตัวเองเป็น `'owner'` | ไม่เปลี่ยน (verify ด้วยการอ่านซ้ำ) | **privilege escalation** |
| **T-11** | `U_C` (viewer) INSERT/UPDATE/DELETE ทุกตารางใน `TRIP_1` **ที่ตัวเองเป็นสมาชิก** | `42501` ทุก verb เขียน · SELECT ต้องได้ข้อมูล | viewer เขียนได้ = ไม่มี read-only จริง |
| **T-12** | `U_A` (owner) เขียนทุกตารางเมื่อ `TRIP_1.status = 'archived'` | ถูกปฏิเสธทุกตาราง | RESTRICTIVE policy ตกหล่นตารางไหน (§5.11) |
| **T-13** | ทุกตารางที่โค้ดเรียก `.upsert()` — ยิง upsert ซ้ำคู่คีย์เดิม 2 ครั้งในฐานะเจ้าของ | ครั้งที่ 2 **ต้องสำเร็จ** | 🔴 บั๊ก `travel_time_cache` ซ้ำรอย · ครั้งที่ 2 ได้ `42501` = ขาด UPDATE policy · เคสนี้จับได้ทันทีตอน CI ไม่ต้องรอเจอ race ใน production |
| **T-14** | `U_A` ลบแถวที่ `U_C` subscribe realtime อยู่ | `U_C` ได้ DELETE event | 🔴 **F2** — ถ้าไม่ได้ event ต้องเติม `replica identity full` · เคสนี้ต้องรันเป็นข้อแรกของ E1 เพราะกระทบทุกตาราง |
| **T-15** | `U_B` SELECT `profiles` ของ `U_A` (ไม่มีทริปร่วมกัน) แล้ว `U_C` SELECT `profiles` ของ `U_A` (มีทริปร่วม) | `U_B` ได้ 0 แถว · `U_C` ได้ 1 แถว | user enumeration ทั้งแพลตฟอร์ม vs ความสามารถที่ UI ต้องใช้จริง |
| **T-16** | `U_C` (viewer) SELECT `bookings_secret` ของ `TRIP_1` | 0 แถว ขณะที่ SELECT `bookings` ได้ปกติ | viewer เห็นเลขที่จอง (§5.9.1) |
| **T-17** | `U_B` ยิง `POST /storage/v1/object/list/booking-files` · แล้วยิง `GET` ไฟล์ใน `TRIP_1/` | list ไม่คืน path ของ `TRIP_1` · GET ได้ 403/404 | 🔴 **F1** — ต้องเทสต์ทั้ง list และ get แยกกัน เพราะ **list ผ่านแต่ get ไม่ผ่าน ก็ยังรั่วชื่อไฟล์** |
| **T-18** | ยิง `GET /rest/v1/travel_time_cache` และ `/place_details_cache` ด้วย anon key | **404** (schema ไม่ถูก expose) ไม่ใช่ 200 หรือ 403 | `cache` schema หลุดเข้า `db.schemas` โดยไม่มีใครสังเกต |
| **T-19** | `U_A` UPDATE `order_index` ของ `trip_stops` เมื่อ `trip_days.is_locked = true` · แล้ว UPDATE `visited_at` แถวเดียวกัน | ตัวแรกถูกปฏิเสธ · **ตัวที่สองต้องสำเร็จ** | **F4** — และพิสูจน์ว่า trigger ไม่ล็อกเกินจนติ๊ก "มาถึงแล้ว" ไม่ได้หน้างาน ซึ่งจะทำให้ฟีเจอร์ /today พังตอนใช้จริง |
| **T-20** | ลบ `U_A` ออกจาก `trip_members` ของ `TRIP_1` (ในฐานะ `U_A` เอง) ขณะเป็น owner คนเดียว | ถูกปฏิเสธด้วย exception ของ trigger | ทริปกำพร้า (§9.2) |
| **T-21** | `U_A` สร้างทริปใหม่ | สำเร็จ **และ** มีแถว `trip_members` role `owner` โดยไม่ต้อง INSERT เอง | ไก่กับไข่ (§9.1) — ถ้าเคสนี้ fail คนจะไป "แก้" ด้วยการเปิด INSERT policy ให้กว้าง ซึ่งเปิด T-09 กลับมา |

### 2.5 เทสต์ที่ไม่ต้องมี DB — ควรเขียนก่อนทุกอย่างเพราะถูกที่สุด

**ยังไม่มีเทสต์ของ `proxy.ts` / `pinAuth` / `rateLimit` แม้แต่ตัวเดียว** (13 ไฟล์เทสต์เป็น pure function ล้วน)
ทั้ง 3 ไฟล์นี้เทสต์ได้ด้วย `environment: "node"` ที่มีอยู่แล้ว ไม่ต้องรอ jsdom ไม่ต้องรอ Docker
ไม่ต้องรอระยะ 2 — เป็นงานที่คุ้มที่สุดต่อชั่วโมงในรายการทั้งหมดนี้

`lib/__tests__/proxy.test.ts` (`NextRequest` สร้างขึ้นมาเองได้ตรงๆ):

| เคส | ต้องได้ |
|---|---|
| ไม่ตั้ง `TRIP_PIN` → ขอ `/today` | ผ่าน (ยืนยันว่า fail-open **มีอยู่จริงและตั้งใจ** ไม่ใช่บั๊ก) |
| ตั้ง PIN แล้วไม่มี cookie → `/today` | 307 ไป `/unlock?next=/today` |
| ตั้ง PIN แล้วไม่มี cookie → `/api/place-details` | 401 JSON ไม่ใช่ redirect (`proxy.ts:53`) |
| cookie ผิด / cookie ยาวไม่เท่ากัน | ไม่ผ่าน และ **ไม่ throw** (`pinAuth.ts:41` กัน `timingSafeEqual` โยน) |
| `/unlock` `/api/unlock` `/sw.js` `/manifest.webmanifest` `/api/keep-alive` | ผ่านทุกเส้น |
| `/unlockfoo` (ชื่อคล้าย public path) | **ต้องไม่ผ่าน** — ยืนยันว่า `pathname === p \|\| startsWith(p + "/")` ที่ `proxy.ts:34` เขียนถูก |
| 🔴 `/api/secret.png` และ `/trip/x/export.png` | **F3** — วันนี้จะ**ผ่าน** เพราะ matcher `proxy.ts:71` ตัดนามสกุลไฟล์ออก · เขียนเทสต์ให้ fail ไว้ตอนนี้ พร้อมคอมเมนต์ว่าเป็นข้อจำกัดที่รู้อยู่ แล้วแก้ตอน E1 |

`lib/__tests__/rateLimit.test.ts` — เกินเพดานแล้ว 429 · ข้าม window แล้วนับใหม่ ·
ล้าง Map เมื่อถึง `MAX_BUCKETS` (`rateLimit.ts:15`) · **คนละ IP คนละ bucket** ·
`x-forwarded-for` ที่ปลอมมาหลายค่า (`"1.2.3.4, 5.6.7.8"`) นับ IP ไหน (วันนี้ = ตัวซ้ายสุด = ตัวที่ client คุมได้)

---

## 3. แผน E2E

### 3.1 ปัญหาวันนี้: `environment: "node"` แปลว่าเทสต์ component ไม่ได้เลย

`vitest.config.ts` ตั้ง `environment: "node"` ตัวเดียวทั้งโปรเจกต์ → ไม่มี `document`/`window`
→ 44 component และ 28 hook **ไม่มีเทสต์ได้แม้แต่ตัวเดียว** ทั้งที่ตรรกะสำคัญอยู่ในนั้นมาก
(`useTripDnd` · `writeGuard` + `reload()` · optimistic update ที่ต้องเด้งกลับเมื่อเขียนไม่ผ่าน)

**อย่าเปลี่ยน `environment` เป็น `jsdom` ทั้งโปรเจกต์** — 13 ไฟล์เทสต์ pure function ที่มีอยู่จะช้าลง
โดยไม่ได้อะไรกลับมา และ jsdom มีพฤติกรรมที่ต่างจาก node ในเรื่อง timer/`Date`/`Intl`
ซึ่ง `schedule` และ `openingHours` พึ่งพาอยู่ → เสี่ยงทำเทสต์ที่ผ่านอยู่แล้วพังโดยไม่มีเหตุ

**แยกเป็น 2 project:**

```ts
// vitest.config.ts — ต้องอัป vitest จาก ^2.1.9 เป็น ^3 ก่อน (v2 ใช้ environmentMatchGlobs
// ซึ่ง deprecated ใน v3) · การอัปเป็นงานของ P6 ในระยะ 2
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      { test: { name: "unit", environment: "node",  include: ["lib/__tests__/**/*.test.ts"] } },
      { test: { name: "dom",  environment: "jsdom", include: ["{components,hooks}/__tests__/**/*.test.tsx"],
                setupFiles: ["./test/setup.dom.ts"] } },
    ],
  },
});
```

ของที่ต้องเพิ่ม: `jsdom` · `@testing-library/react` · `@testing-library/user-event` · `@testing-library/jest-dom`
· mock ของ `supabase-js` (หรือ MSW ดักที่ชั้น HTTP ซึ่งดีกว่าเพราะไม่ผูกกับรูปร่าง API ของไลบรารี)

### 3.2 Playwright — ของที่ jsdom ทำไม่ได้จริงๆ

เพิ่ม `@playwright/test` แยกจาก vitest ไม่ปนกัน (คนละ runner คนละ config คนละคำสั่ง)

| ต้องใช้ Playwright เพราะ | เคส |
|---|---|
| ต้องมี cookie + redirect จริงผ่าน proxy | ด่าน PIN: กรอกผิด → error · กรอกถูก → เด้งกลับ `?next=` ที่ขอไว้ · cookie `httpOnly` อ่านจาก JS ไม่ได้ |
| ต้องมี pointer event จริง | **DnD ของ `@dnd-kit`** — jsdom ทำไม่ได้เลย · ⚠️ `dragTo()` ของ Playwright มักไม่ทำงานกับ dnd-kit ต้องใช้ `mouse.down()` → `mouse.move()` **หลายสเต็ป** → `mouse.up()` เพราะ sensor ต้องเห็นการขยับต่อเนื่อง ไม่ใช่กระโดดทีเดียว |
| ต้องมี service worker | PWA: SW ลงทะเบียนได้ · `/sw.js` ไม่โดนด่าน PIN (`proxy.ts:26`) · **SW ไม่ precache HTML** (ของที่เคยพลาดมาแล้ว) |
| ต้องมี 2 browser context พร้อมกัน | realtime sync ระหว่างสมาชิก 2 คน + 🔴 **T-14 DELETE event** ซึ่งเป็นเคสที่ต้องเห็นด้วยตาว่า client อีกฝั่งอัปเดต ไม่ใช่แค่ยืนยันว่า DB เปลี่ยน |
| ต้องมี viewport จริง | มือถือ (ทริปจริงใช้บนมือถือทั้งทริป) · ธีมมืด |
| ต้องมี **2 บัญชีจริง** | 🔴 E2E ของ multi-tenant: `U_B` ล็อกอินแล้วเปิด URL ทริปของ `U_A` ตรงๆ → ต้องเจอ 404/403 ไม่ใช่หน้าเปล่าที่ดูเหมือนใช้ได้ · **RLS ที่ทำงานถูกแต่ UI โชว์หน้าเปล่าแทนข้อความบอก คือบั๊ก UX ที่คนจะแจ้งว่า "เว็บพัง"** ไม่ใช่ "กันได้ดี" |

### 3.3 ลำดับที่แนะนำ (คุ้มที่สุดก่อน)

1. **`proxy.test.ts` + `rateLimit.test.ts` + `pinAuth.test.ts`** — ทำได้เลยวันนี้ ไม่ต้องเพิ่ม dependency
   ไม่ต้องรอระยะ 2 ปิดช่องว่างที่ใหญ่ที่สุดในเทสต์ปัจจุบัน (แต่ **อยู่ในโซน P1/P4 ต้องให้ P1 อนุมัติก่อน**
   เพราะแตะ `lib/__tests__/` ระหว่าง freeze)
2. `rls.test.ts` — พร้อมเมื่อ Supabase local ของ P6 ขึ้น · **ต้องผ่านก่อนเขียน UI บนโมเดลใหม่**
3. vitest 2 project + เทสต์ hook ที่ถือ optimistic state
4. Playwright — ตามหลัง เพราะแพงที่สุดและเปราะที่สุด แต่ **T-14 กับ multi-tenant E2E ข้ามไม่ได้**

---

## 4. เส้นทางเลิก fail-open ของ `proxy.ts` โดยไม่เสี่ยงเว็บตาย

### 4.1 เหตุผลเดิมถูก — และเป็นกุญแจของทางแก้

`proxy.ts:38-45` เลือกปล่อยผ่านเมื่อไม่มี env และเขียนเหตุผลไว้ชัด: ถ้าบล็อกแล้วลืมตั้ง env บน Vercel
เว็บจะตายทั้งเว็บ ซึ่งอันตรายกว่ามากตอนอยู่เกาหลีแล้วเปิด `/today` ไม่ได้ **การประเมินนี้ถูกต้อง
สำหรับบริบทของมัน** และไม่ควรถูกเรียกว่าความพลาด

แต่สังเกตรูปของ dilemma: การตัดสินใจเกิดขึ้น **ตอนมี request เข้ามาแล้ว** ซึ่งเป็นจังหวะที่เหลือทางเลือกแค่
"เว็บตาย" หรือ "เว็บเปิดโล่ง" — ไม่มีทางที่สาม **เพราะตัดสินใจสายเกินไป ไม่ใช่เพราะตัดสินใจผิด**

### 4.2 ทางแก้: ย้ายการตรวจไปตอน deploy แล้ว dilemma หายไปเอง

**ขั้นที่ 1 — ตรวจตอน build (แกนของข้อเสนอ)**
ทำให้สภาพ "production ที่รันอยู่โดยไม่มี auth env" **เป็นไปไม่ได้** ตั้งแต่ต้น
```ts
// next.config.ts — ต้องพังตอน build ไม่ใช่ตอนมี request
const REQUIRED_IN_PROD = ["TRIP_PIN_SECRET", "SUPABASE_JWT_AUD" /* ฯลฯ ของระยะ 2 */];
if (process.env.VERCEL_ENV === "production") {
  const missing = REQUIRED_IN_PROD.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`ตั้ง env ไม่ครบ: ${missing.join(", ")}`);
}
```
ผลลัพธ์: **ลืมตั้ง env = deploy ไม่ผ่าน = deploy เดิมที่ทำงานอยู่ยังให้บริการต่อไป**
ซึ่งเป็นสิ่งที่ต้องการจริงๆ ทั้งสองด้าน — ไม่มีเว็บตาย และไม่มีเว็บเปิดโล่ง
(ของ Vercel: deploy ที่ build fail ไม่ถูก promote ไป production เลย)

**ขั้นที่ 2 — runtime fail closed เฉพาะ production**
เมื่อขั้นที่ 1 ทำให้สภาพนั้นเป็นไปไม่ได้แล้ว การ fail closed จึงไม่เสี่ยงอะไร
```ts
if (!expectedPinToken()) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "misconfigured" }, { status: 503 });
  }
  return NextResponse.next();  // local dev ยังสะดวกเหมือนเดิม
}
```

**ขั้นที่ 3 — `/api/health` ที่บอก "ตั้งค่าครบไหม" ไม่ใช่แค่ 200**
คืน **boolean เท่านั้น ห้ามคืนค่า secret หรือความยาวของ secret** · อยู่ใน `PUBLIC_PATHS` และต้อง rate limit
```json
{ "ok": true, "auth": { "configured": true }, "db": { "reachable": true } }
```
ให้ P6 ตั้ง monitor ที่ alert เมื่อ `auth.configured === false` → รู้จาก monitor ไม่ใช่รู้จากการถูกเจาะ
(ปิดช่อง A09 ในส่วนที่สำคัญที่สุด: **ตรวจจับ misconfiguration ก่อนที่จะมีคนใช้ประโยชน์**)

**ขั้นที่ 4 — break-glass ที่มีอายุ แทน "ปิด auth ชั่วคราว"**
สำหรับเหตุจริง (auth provider ล่มขณะยืนอยู่กลางโซล):
- token ลงนามฝั่งเซิร์ฟเวอร์ **มีวันหมดอายุในตัว** ใช้ได้ครั้งเดียว → เปิด session ปกติ
- ทุกครั้งที่ใช้ต้อง log
- 🔴 **ห้ามทำเป็น env แบบ boolean `DISABLE_AUTH=1`** — ธงแบบนั้นถูกเปิดตอนตีสามแล้วไม่มีใครปิด
  และไม่มีอะไรเตือนว่ายังเปิดอยู่ · ของที่หมดอายุเองปลอดภัยกว่าของที่ต้องจำไปปิด

**ขั้นที่ 5 — ลดแรงจูงใจที่ทำให้อยากเปิด fail-open ตั้งแต่แรก**
ความกลัวจริงคือ "เปิด `/today` ไม่ได้ตอนอยู่หน้างาน" ไม่ใช่ "auth ไม่ทำงาน"
→ ให้ SW/IndexedDB เก็บแผน**ของวันนี้แบบอ่านอย่างเดียว** ไว้ให้ผู้ใช้ที่ล็อกอินไว้แล้ว
auth ล่ม = ดูแผนวันนี้ได้แต่แก้ไม่ได้ ดีกว่าทั้ง "เว็บตาย" และ "เว็บเปิดโล่ง"
⚠️ **นี่คือ offline อ่านอย่างเดียว ไม่ใช่ offline editing** ที่ `PLAN.md §1` ตัดออกไปแล้ว —
ไม่มี conflict resolution เพราะไม่มีการเขียน · **เป็นโซนของ P3/P7 ผมเสนอเป็นทิศทาง ไม่ได้ออกแบบ**

### 4.3 `/api/keep-alive` — fail-open แบบเดียวกัน แต่แก้ง่ายกว่า

`keep-alive/route.ts:24-27` ปล่อยผ่านเมื่อไม่มี `CRON_SECRET` (ตอนนี้ตั้งแล้ว ยืนยัน 401 แล้ว)
ความเสียหายจำกัดกว่ามาก — route คืนแค่ `{ ok, pingedAt }` ไม่คืนข้อมูลทริป (`:36-44` เขียนกำกับไว้ชัด)
เข้าขั้นที่ 1 ชุดเดียวกันได้เลย: ใส่ `CRON_SECRET` ใน `REQUIRED_IN_PROD` แล้วเปลี่ยนเป็น fail closed
**ไม่ต้องมีกลไกพิเศษของตัวเอง**

---

## 5. แผนย้าย rate limit ออกจาก in-memory

### 5.1 ทำไมของวันนี้กันไม่ได้จริง

`lib/rateLimit.ts:5` เป็น `Map` ต่อ **serverless instance** — โค้ดเขียนกำกับเองที่บรรทัด 8 ว่า
"เป็นด่านคุมค่าใช้จ่าย ไม่ใช่ด่านความปลอดภัย" ซึ่งเป็นการประเมินตัวเองที่ตรงและซื่อสัตย์
3 อย่างที่ทำให้ข้ามได้:

1. **หลาย instance = หลาย Map** · Vercel สเกลตามโหลด → ยิงแรงขึ้นได้ instance เพิ่มขึ้น เพดานจริงเพิ่มตาม
   → **ยิงแรงขึ้น = โดนจำกัดน้อยลง** ซึ่งกลับหัวจากที่ควรเป็น
2. **`x-forwarded-for` ตัวซ้ายสุด** (`:38`) เป็นค่าที่ client เติมเองได้ → เปลี่ยน IP ทุก request = ไม่เคยชนเพดาน
   (โค้ดรู้อยู่แล้ว — บรรทัด 7 เขียนว่า "ปลอมได้")
3. **`buckets.clear()` เมื่อถึง `MAX_BUCKETS`** (`:15`) → ยิงจาก IP ปลอม 5,000 ตัวรวดเดียว
   **ล้างสถานะของคนที่กำลังโดนจำกัดอยู่** = ปลด rate limit ของตัวเองได้ตามใจ
   ข้อนี้สำคัญที่สุดสำหรับ `/api/unlock` เพราะเพดาน 10/นาที คือ**สิ่งเดียว**ที่ทำให้ PIN 4 หลักพอใช้ได้
   (`unlock/route.ts:5-8` เขียนเองว่า "ห้ามถอดออก") — ช่องนี้ทำให้ไล่เดา PIN ครบ 10,000 ค่าได้ในเวลาอันสั้น

**ประเมินความเร่งด่วนอย่างตรงไปตรงมา:** ข้อ 3 เป็นช่องที่ทำให้ด่าน PIN อ่อนกว่าที่ออกแบบไว้จริง
แต่ผู้โจมตีที่ทำได้ขนาดนั้นก็ดึง anon key จากบันเดิลไปใช้ตรงๆ ง่ายกว่าอยู่แล้ว (ทางเข้า B)
→ **ไม่ใช่เหตุให้แตะโค้ดระหว่าง freeze** แต่ต้องแก้ก่อนเปิดให้คนอื่นสมัคร

### 5.2 ที่ควรเป็น

| ทางเลือก | ข้อดี | ข้อเสีย | ความเห็น |
|---|---|---|---|
| **Postgres (Supabase ที่มีอยู่)** | ไม่เพิ่ม vendor · แชร์ทุก instance จริง · นับได้ต่อ `user_id` · log ได้ในที่เดียวกับ audit | +1 round-trip ต่อ request · ใช้ connection ของ DB | ✅ **เริ่มที่นี่** |
| Upstash Redis | เร็ว · `@upstash/ratelimit` มี sliding window ให้ · Vercel integration | +1 vendor +1 ชุด secret | ย้ายไปเมื่อ latency เป็นปัญหาจริง วัดก่อน |
| Vercel Firewall / WAF | ไม่ต้องเขียนโค้ด | หยาบ · ผูกกับแพลตฟอร์ม · ไม่รู้จัก `user_id` | เสริมชั้นนอก ไม่ใช่ตัวหลัก |

**ต้องเป็น 1 statement อะตอมมิก** — อ่านแล้วเขียน (แบบที่โค้ดวันนี้ทำ) มี race ที่ทำให้ 2 request
พร้อมกันนับเป็น 1 ครั้ง ซึ่งเป็น bypass ที่พอทำซ้ำได้:
```sql
-- schema `app` (ไม่ expose ให้ PostgREST) · SECURITY DEFINER · เรียกจาก route ด้วย service role
insert into app.rate_limits (bucket_key, window_start, hits)
values (p_key, date_trunc('minute', now()), 1)
on conflict (bucket_key, window_start)
  do update set hits = app.rate_limits.hits + 1
returning hits <= p_limit;
```

**เปลี่ยนคีย์ด้วย ไม่ใช่ย้ายที่เก็บเฉยๆ** — ย้ายที่เก็บแต่ยังนับด้วย IP ที่ปลอมได้ = แก้แค่ครึ่งเดียว:

| route | คีย์ที่ควรใช้ | เหตุผล |
|---|---|---|
| ทุก route ที่ต้องล็อกอิน | `user_id` จาก JWT | ปลอมไม่ได้ (ลงนามแล้ว) · ตรงกับสิ่งที่อยากจำกัดจริง (คนหนึ่งคน ไม่ใช่ IP หนึ่งตัว) |
| `/api/unlock` และ login | IP **จากแพลตฟอร์ม** (ไม่ใช่ XFF ตัวซ้ายสุด) + คีย์ต่อบัญชีที่พยายามเข้า | ยังไม่มี identity ตอนนั้น · ต้องกันทั้ง "IP เดียวลองหลายบัญชี" และ "หลาย IP ลองบัญชีเดียว" |
| `/api/place-*` | `user_id` | เป็น route ที่คิดเงินต่อ request → ต้องรู้ว่าใครใช้ ไม่ใช่แค่กันยอดรวม |

**และปิดที่ต้นทาง:** ย้ายแคชเข้า schema `cache` ที่ไม่ expose (`rls-policies.sql` §7) ทำให้เขียนแคช
จาก browser ไม่ได้เลย → ลดสิ่งที่ต้อง rate limit ลง แทนที่จะ rate limit สิ่งที่ไม่ควรเข้าถึงได้ตั้งแต่แรก

---

## 6. Storage — ไฟล์ตั๋วเป็นข้อมูลส่วนบุคคล

### 6.1 สถานะวันนี้ (F1 — ข้อที่ต้องแย้ง P1 หนักที่สุด)

P1 เขียนว่า *"policy ของ Storage 4 ตัว gate แค่ `bucket_id` ไม่มีเงื่อนไขอื่นเลย"* — **ถูก แต่ยังไม่ถึงแก่น**
เพราะ **bucket ตั้งเป็น Public** (`0019:1,7` เขียนกำกับเอง · โค้ดใช้ `getPublicUrl` ที่
`lib/stopPhoto.ts:26` และ `BookingEditModal.tsx:97`) → เส้นทาง `/storage/v1/object/public/...`
**ไม่ผ่าน RLS เลย** · policy 4 ตัวนั้นจึงไม่เคยเป็นด่านของการอ่านตั้งแต่แรก
ต่อให้เขียน `using` ดีแค่ไหนก็ไม่เปลี่ยนอะไรถ้า bucket ยัง public

**3 ชั้นที่ต่อกันเป็นการรั่วทั้ง bucket:**

1. `select` policy `using (bucket_id = 'booking-files')` → `POST /storage/v1/object/list/booking-files`
   **ไล่ชื่อไฟล์ทั้ง bucket ได้** ด้วย anon key เปล่า
   *(สรุปจาก policy + GRANT เริ่มต้นของ Supabase บน `storage.objects` — ยืนยันโดยอ้อมจากข้อเท็จจริงว่า
   การอัปโหลดด้วย anon key ในแอปทำงานได้จริง ซึ่งต้องมี GRANT อยู่แล้ว · **ยังไม่ยืนยันด้วยการรัน** ห้ามยิง DB จริง → เคส T-17)*
2. public bucket → เปิดอ่านทุก path ที่ได้จากข้อ 1 ทันที ไม่ต้อง auth
3. ในไฟล์คือ **รูปตั๋วที่มีชื่อตามพาสปอร์ตและเลขที่จอง** — ตรงกับความเสียหายลำดับ 1 ใน §1.2

ชื่อไฟล์มี `Date.now()` + `Math.random().toString(36).slice(2)` (~57 บิต) ซึ่ง**เดาไม่ได้**จริง
→ ถ้ามีแค่ชั้น 2 ความเสี่ยงจะต่ำ · **แต่ชั้น 1 ทำให้ไม่ต้องเดา** — จุดนี้คือหัวใจ:
มาตรการที่พึ่งพา "URL เดาไม่ได้" พังทั้งหมดเมื่อมี endpoint ที่บอก URL ให้

### 6.2 ปัญหาที่ policy แก้ไม่ได้: path ไม่มี tenant key

```
lib/stopPhoto.ts:21      stop-photo-{stopId}-{ts}-{rand}-{ชื่อไฟล์เดิม}
BookingEditModal.tsx:85  {bookingId}-{ts}-{rand}-{ชื่อไฟล์เดิม}
```
**flat ทั้ง bucket ไม่มีโฟลเดอร์** → policy ที่กรองด้วย `(storage.foldername(name))[1]`
**ไม่มีอะไรให้กรอง** สำหรับไฟล์ที่มีอยู่ · แปลว่านี่ไม่ใช่งานเขียน policy แต่เป็น **งานย้ายข้อมูล**
ต้อง rename ทุก object พร้อมอัปเดต `bookings.file_url` / `trip_stops.photo_url` ที่ชี้อยู่
→ ต้องอยู่ใน `E7` (ซ้อม migrate ข้อมูลจริง 2 รอบ) ไม่ใช่ `E1` · **แจ้ง P1 ให้เผื่อเวลาไว้ในไทม์ไลน์**

### 6.3 ที่ควรเป็น — 6 ข้อ ต้องครบทั้งชุด

| # | เปลี่ยนอะไร | ปิดช่องอะไร |
|---|---|---|
| 1 | bucket → **private** · เลิก `getPublicUrl` ใช้ `createSignedUrl` อายุสั้น (5-15 นาที) | ทำให้ RLS มีผลกับการอ่าน — **ถ้าไม่ทำข้อนี้ อีก 5 ข้อไร้ความหมาย** |
| 2 | path → `{trip_id}/{bookings\|stops}/{id}/{filename}` | ให้มี tenant key ให้ policy กรอง (§8 ของไฟล์ SQL) |
| 3 | policy กรองด้วย segment แรก + `to authenticated` | cross-tenant read/write/delete/list |
| 4 | `file_size_limit` + `allowed_mime_types` **ที่ bucket** | วันนี้เพดาน 10MB อยู่ฝั่ง client เท่านั้น (`stopPhoto.ts:3` · `BookingEditModal.tsx:33`) → ยิง storage API ตรงข้ามได้ = ที่ฝากไฟล์ฟรีบนบิลเจ้าของ |
| 5 | ลบไฟล์ให้จริงเมื่อลบ booking/stop | วันนี้ลบแถวแล้วไฟล์ค้าง (โค้ดจัดการ pending upload ที่ยังไม่บันทึกไว้ดีแล้วที่ `BookingEditModal.tsx:113-120` แต่ไม่ครอบกรณีลบ booking ที่บันทึกแล้ว) → ข้อมูลส่วนบุคคลค้างอยู่หลังผู้ใช้คิดว่าลบแล้ว = ปัญหา retention ไม่ใช่แค่พื้นที่เปลือง |
| 6 | signed URL **ห้ามใส่ใน SW cache / ห้ามส่งไป Copilot** | URL อายุสั้นที่ถูก cache ถาวรกลายเป็น URL อายุยาว · ⚠️ ส่งต่อ **P5** (Copilot) และ **P3** (SW) |

### 6.4 ที่ต้องตัดสินใจ ไม่ใช่เรื่องเทคนิค — ขอ P1 ถามผู้ใช้

**ไฟล์ตั๋วของทริปจริงวันนี้อยู่ใน bucket สาธารณะที่ไล่ชื่อไฟล์ได้ และมีชื่อตามพาสปอร์ตอยู่ข้างใน**

ผมไม่เสนอให้แก้ระหว่าง freeze — เปลี่ยน bucket เป็น private ตอนนี้จะทำให้รูปตั๋วในเว็บหายทั้งหมด
(โค้ดใช้ `getPublicUrl` ทุกจุด) ซึ่งกระทบการใช้งานจริงก่อนบิน **ตรงกับกติกาข้อ 1 ว่าห้ามแตะ**

แต่นี่เป็นข้อมูลส่วนตัวของผู้ใช้เอง **ไม่ใช่การตัดสินใจทางเทคนิคที่ผมหรือ P1 ควรตัดสินแทน**
เสนอให้ P1 แจ้งผู้ใช้ตรงๆ พร้อม 3 ทางเลือกที่ทำได้โดยไม่แตะโค้ด:

- **ก.** ไม่ทำอะไร รับความเสี่ยงไว้จนจบทริป แล้วแก้ใน E7 (ความเสี่ยงจริง: ต้องมีคนดึง anon key
  จากบันเดิลก่อน ซึ่งต้องตั้งใจทำ ไม่ใช่เจอโดยบังเอิญ)
- **ข.** ลบไฟล์ตั๋วที่ไม่จำเป็นออกจาก bucket ตอนนี้ เก็บเท่าที่ต้องใช้หน้างาน — **ลดของที่รั่วได้
  โดยไม่แตะโค้ดเลย** ทำได้จาก Dashboard
- **ค.** ปิด `select` policy ของ `storage.objects` ทิ้ง (ตัดชั้น 1 = ต้องกลับไปเดา URL 57 บิต)
  ⚠️ ต้องตรวจก่อนว่าแอปไม่ได้เรียก list ที่ไหน — ผมยังไม่ตรวจข้อนี้เพราะจะกลายเป็นการเสนอ
  แก้ DB จริงระหว่าง freeze ซึ่ง**เกินขอบเขตที่ P1 มอบมา** · **ถ้า P1 สั่ง ผมตรวจให้**

---

## 7. ของที่ส่งต่อคนอื่น (P4 ไม่แก้เอง ตาม `TEAM.md`)

| ถึง | เรื่อง | อ้างอิง |
|---|---|---|
| **P1** | ตัดสิน §6.4 (ไฟล์ตั๋วในทริปจริง) · เพิ่ม rename ไฟล์ storage เข้า `E7` · อนุมัติให้เขียน `proxy.test.ts` ระหว่าง freeze ไหม · เติม `bookings_secret` + trigger 4 ตัว + `replica identity full` เข้า `architecture.md` |
| **P2** | **F5** — `BookingEditModal.tsx:346` ใส่ `file_url` ลง `href` ตรงๆ ทั้งที่ `lib/url.ts:safeHttpUrl` มีอยู่แล้วและถูกใช้กับ `link` ทุกจุด · แก้ 1 บรรทัด · **ไม่ต้องแก้ระหว่าง freeze** (ต้องเขียน DB ได้ก่อนจึงใช้ประโยชน์ได้) |
| **P3** | **F3** — matcher `proxy.ts:71` ยกเว้นทุก path ที่ลงท้ายด้วยนามสกุลไฟล์ · ต้องแคบลงก่อนมี dynamic route · **F5** ที่ `app/today/page.tsx:906` · §4.2 ขั้นที่ 5 (offline อ่านอย่างเดียว — **ไม่ใช่ offline editing**) · §6.3 ข้อ 6 (SW ห้าม cache signed URL) |
| **P5** | A03 ระยะ 2: Copilot คือพื้นผิว injection ใหม่ทั้งก้อน — โน้ต/ชื่อสถานที่ที่ผู้ใช้อื่นใส่จะเข้าไปอยู่ใน prompt · **ทุก tool ที่เขียน DB ต้องรันในบริบทของผู้ใช้ผ่าน RLS ห้ามใช้ service role** ไม่งั้น RLS ทั้งไฟล์นี้ถูกข้ามผ่าน tool เดียว · §6.3 ข้อ 6 |
| **P6** | 3 self-check query (`rls-policies.sql` §11) เข้า CI — **ข้อ 11.1 ตัวเดียวจับ B2 ได้ทั้งข้อ** · Supabase local ต้องมี auth ครบเพื่อรัน `rls.test.ts` · อัป vitest → ^3 · Dependabot + `npm audit` (A06) · monitor `/api/health` (§4.2 ขั้นที่ 3) · log 403/42501 (A09) · ตาราง rate limit (§5.2) |
| **P7** | Mobile: token เก็บที่ไหน (secure storage ไม่ใช่ AsyncStorage เปล่า) · signed URL อายุสั้นกับ offline ขัดกันโดยธรรมชาติ — ต้องออกแบบร่วมกับ §6.3 ข้อ 6 |
| **P8** | acceptance criteria ของ story ที่แตะข้อมูลข้ามผู้ใช้ **ต้องมีเคส negative** ("U_B เปิดทริปของ U_A ไม่ได้") ไม่ใช่มีแต่ happy path · owner/editor/viewer ต้องมีนิยามใน backlog ก่อน E1 เพราะ policy ทั้งชุดยึดจากมัน |

---

## 8. ข้อจำกัดของรีวิวนี้

พูดให้ชัดว่าอะไรที่**ไม่ได้**ทำ เพื่อไม่ให้ใครเข้าใจว่าครอบคลุมกว่าจริง:

- **ไม่ได้ยิง Supabase จริงแม้แต่ request เดียว** — ทุกข้อสรุปมาจากไฟล์ SQL + โค้ด + `node_modules`
  ข้อที่ต้องพิสูจน์ด้วยการรันทำเครื่องหมายไว้แล้ว: **T-14** (realtime + RLS) และ **T-17/§6.1 ชั้น 1** (storage list)
- **ไม่ได้ตรวจ Dashboard ของ Supabase** — ค่า bucket public / auth setting / เครือข่าย ยืนยันจากโค้ดกับ
  คอมเมนต์ใน migration เท่านั้น · ถ้าใครเคยแก้ค่าใน Dashboard โดยไม่ผ่าน migration รีวิวนี้ไม่เห็น
- **ไม่ได้ตรวจ dependency ว่ามี CVE ไหม** (A06) — ต้องรัน `npm audit` ซึ่งเป็นของ P6
- **ไม่ได้รีวิว `docs/engine/architecture.md`** — P1 ยังเขียนไม่เสร็จตอนที่รีวิวนี้เขียน
  ถ้า schema สุดท้ายต่างจากที่บรีฟมา policy ในไฟล์ SQL ต้องรีวิวใหม่ทั้งชุด **ไม่ใช่แก้ทีละชื่อคอลัมน์**
- **ยังไม่มีใครรีวิว policy ชุดนี้** — ผมเขียนเพราะ P1 ออกแบบ schema จึงไม่ควรตรวจงานตัวเอง
  ด้วยเหตุผลเดียวกัน **policy ที่ผมเขียนก็ควรมีคนอื่นตรวจ** · P1 ตรวจความเข้ากันได้กับ schema ได้
  แต่ข้อที่ควรมีตาที่สามคือ §9 (trigger) เพราะเป็นส่วนที่ RLS ตรวจแทนให้ไม่ได้
  และเป็นส่วนที่ถ้าผิดจะไม่มีอะไรฟ้อง
