# E7 — ลำดับการรันจริงบน `engine-dev`

> 🔴 **ผู้ใช้เป็นคนรัน ไม่ใช่ทีม** — ทุกก้อนแตะฐานด้วย credential จริง ซึ่งเป็นสิทธิ์ของผู้ใช้เท่านั้น (`TEAM.md §3.5`)
> ทีมทดสอบทั้งหมดในสนามซ้อมในเครื่อง (`scripts/e7-local-rehearsal.sh`) ที่ไม่แตะ Supabase เลย

---

## ก่อนเริ่ม — ด่านสองใบที่ต้องผ่านก่อน

**① migration สองใบต้องลงก่อน** ไม่งั้นก้อน 4 จะปฏิเสธตัวเองพร้อมบอกชื่อไฟล์ที่ขาด

| ใบ | ทำอะไร | ถ้าไม่มี |
|---|---|---|
| `20260829020000_e7_hidden_places_accept_custom` | `hidden_places` รับ custom place | **หาย 21 จาก 39 แถว** |
| `20260829040000_e7_bookings_status_legacy_domain` | `bookings.status` คืนโดเมนเดิม | **ใส่ไม่ได้เลยสักแถวจาก 8** |

`20260829060000_e7_mode_domains` **ไม่บังคับ** — ลงเมื่อไหร่ก็ได้ ไม่เกี่ยวกับ E7

**② หา `owner_uuid` จากฐานจริง — ห้ามเดา ห้ามคัดจากเอกสารนี้**
```sql
select id, email from auth.users order by created_at limit 5;
```
เอา `id` ของบัญชีเจ้าของทริป · **ทุกก้อนจะปฏิเสธทันทีถ้าไม่ได้ตั้งค่านี้**

---

## ลำดับ — ห้ามสลับ ห้ามข้าม

```sql
set local e7.owner_uuid = '<uuid ที่ได้จากขั้น ②>';
```
🔴 **`set local` อยู่ได้แค่ใน transaction เดียว** — SQL editor ของ Supabase รันทีละคำสั่ง
→ **ต้องตั้งใหม่ทุกก้อน** หรือใช้ `set` (ไม่มี `local`) แล้วรันทั้ง 9 ก้อนในเซสชันเดียว

| # | ไฟล์ | ต้องพิมพ์ว่า | ต้องรันก่อน |
|---|---|---|---|
| 1 | `01_trip_skeleton.sql` | `trips.id = <uuid>` | — |
| 2 | `02_custom_places.sql` | `custom_places 37 · ชื่อ 38 · คำอธิบาย 37` | 01 |
| 3 | `03_trip_stops.sql` | `trip_stops ย้ายแล้ว 71 แถว · ลำดับตรงทุกแถว` | 01 · 02 |
| 4 | `04_trip_content.sql` | `bookings 8 · checklist 8 · hidden 39 (custom 21) · notes 2` | 01 · 02 |
| 5 | `05_trip_hotels.sql` | `trip_hotels 4 แถว · รวม 9 คืน` | 01 |
| 6 | `06_caches.sql` | `details 140 (+ท้องถิ่น 88) · photo 142 · travel 185` | — |
| 7 | `07_day_plan_settings.sql` | `18 แถว · 7 วันที่สองแผนตั้งค่าแยกกัน` | 01 |
| 8 | `08_events.sql` | `events 36 แถว (18 × 2 แผน) · custom 4 · place_ref 2` | 01 · 02 |
| 9 | `09_completeness.sql` | `13 ตารางย้ายแล้ว · 1 ตารางทิ้งโดยพิสูจน์แล้ว` | ทุกก้อน |

🔴 **ก้อน 9 คือก้อนที่ตอบว่า E7 เสร็จหรือยัง** — ก้อน 1–8 เขียวครบแต่ก้อน 9 แดง = **ยังไม่เสร็จ**

### ⚠️ ก้อน 6 ต้องรันด้วย role ที่ข้าม RLS
แคช 4 ใบ `revoke all` + **ไม่มี policy สักตัวโดยตั้งใจ** · SQL editor รันเป็น `postgres` อยู่แล้วจึงผ่าน
· ถ้าเห็น `ก้อน 6 ต้องรันด้วย role ที่ข้าม RLS` แปลว่ารันจากที่อื่น **ไม่ใช่บั๊ก**

---

## ถ้าก้อนไหนแดง

**ทุกก้อนเป็น transaction เดียว — แดงแล้ว rollback อัตโนมัติ ไม่มีของค้างครึ่งทาง**
→ อ่านข้อความ แก้เหตุ แล้วรันก้อนนั้นซ้ำได้เลย · **ไม่ต้องล้างอะไรก่อน**

**ยกเว้นก้อนที่ *ผ่านไปแล้ว*** — รันซ้ำจะชน primary key เพราะ id เป็น `md5(kind:legacy_id)` (คงที่โดยตั้งใจ เพื่อให้ซ้อมสองรอบได้ผลเดียวกัน)
→ ต้องถอนก่อน:
```sql
-- ถอนทริปทั้งใบ (cascade ครบทุกตารางที่ผูก trip_id)
delete from public.trips where id = md5('trip:korea-2026-10')::uuid;
-- แคชไม่ผูกกับทริป ต้องถอนแยก
truncate public.place_details_cache, public.place_details_local_cache,
         public.place_photo_cache, public.travel_time_cache;
```
🔴 **บน `engine-dev` เท่านั้น** — `truncate` แคชจะลบของที่คนอื่นวางไว้ด้วย **ถามในทีมก่อน**

---

## `08_events.sql` เป็นไฟล์ที่เครื่องสร้าง

ห้ามแก้ด้วยมือ · ต้นทางคือ `data/itinerary.ts` **ของทรี `main`** (ไม่ใช่ทรี platform — ไฟล์ชื่อเดียวกันมีสองใบและ blob ต่างกัน)
```bash
npx tsx supabase-platform/e7/gen/gen_08_events.mts > supabase-platform/e7/08_events.sql
```
ตรวจว่ายังตรงกับต้นทาง — หมุด `git blob` อยู่ในหัวไฟล์:
```bash
git -C /Users/park/plan-korea hash-object data/itinerary.ts
```

---

## ของที่ยังค้างหลัง E7 เสร็จ

**ไฟล์รูปใน storage ของโปรเจกต์เก่า** — `trip_stops` 1 แถวชี้รูปที่ `ejzibhgqhxdzkovsnpds` (**ห้ามแตะทุกกรณี**)
· สคริปต์แปลง URL → path ถูกต้องแล้ว (`<trip_id>/<ชื่อไฟล์>`) แต่ **ตัวไฟล์ยังอยู่ที่เดิม**
· ต้องคัดลอกผ่าน Storage API — SQL ทำไม่ได้ · **ไม่ด่วน 1 แถว** แต่ถ้าไม่ทำ รูปจะหายเงียบ
· รายละเอียด: [`waiting-on-user.md §1.5`](../../docs/engine/waiting-on-user.md)
