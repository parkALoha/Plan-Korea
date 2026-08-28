# `E7` — ของที่เจอก่อนเขียนสคริปต์ migrate (29 ส.ค. 2026 · P1)

> วัดจาก **สนามซ้อมในเครื่อง** (`scripts/e7-local-rehearsal.sh`) ที่มี `legacy.*` (สำเนาแช่แข็ง 14 ตาราง
> 670 แถว) กับ `public.*` (สคีมาแพลตฟอร์ม 89 migration) อยู่ฐานเดียวกัน · **ไม่แตะ Supabase สักคำสั่ง**
>
> 🎯 **นี่คือของที่ `E7-AC1` มีไว้จับ** (*"ของจริงมีเคสที่แต่งเองไม่ถูก"*) — เจอก่อนเขียนสคริปต์ ไม่ใช่ตอนรัน

---

## 🔴 ① `hidden_places` รับ custom place ไม่ได้ — **21 จาก 39 แถวไม่มีที่ลง**

```
legacy.hidden_places  39 แถว · place_id เป็นสตริงคีย์
   ชี้ไป custom place (`custom-…`)  21 แถว   ← 54%
   ชี้ไปที่อื่น                      18 แถว

public.hidden_places : trip_id, catalog_place_id (not null), hidden_by_user, legacy_hidden_by, hidden_at
                       └─ ไม่มี custom_place_id
```

**ต้นเรื่องอยู่ใน `column-map.md:117` เอง — เป็นเงื่อนไขที่ไม่มีใครปิด:**
> `place_id` → **`catalog_place_id`** *(และ `custom_place_id` **ถ้าตารางนั้นรับของทริป**)*

**"ถ้า…" ตัวนั้นไม่เคยถูกตอบ · DDL ลงไปโดยมีแค่ `catalog_place_id`** และไม่มีด่านไหนสะดุด
· 🎯 **แบบแผนมีอยู่แล้วในตารางข้าง ๆ:** `trip_stops` มีทั้ง `catalog_place_id` และ `custom_place_id`
  บังคับด้วย `trip_stops_place_by_kind` (XOR) — **`hidden_places` แค่ไม่ได้รับมันมา**
· **ต้องแก้ก่อน `E7` รัน** ไม่งั้นการซ่อนสถานที่ของผู้ใช้หายไปครึ่งหนึ่งเงียบ ๆ
  (migration ที่แตะตารางนี้ล่าสุด: `20260826163000_e2_hidden_places_freeze_row_times.sql`)

---

## 🟡 ② `trip_hotels` — `leg_id` ต้องแปลงเป็น `check_in`/`check_out` และมันเป็น *ตรรกะ* ไม่ใช่การก๊อป

```
legacy: leg_id = d1 · d4 · d5 · d6   (4 แถว · เป็น "วันที่เช็คอิน" ไม่ใช่ช่วง)
public: check_in date* · check_out date*   ← ทั้งคู่ not null
```
`D51` ตัดสินว่า `leg` เป็นค่าคำนวณจาก `trip_days` และ `trip_hotels` เก็บช่วงวันของตัวเอง
→ **`check_out` ไม่มีอยู่ในข้อมูลเดิมเลย** ต้อง derive จากโครงคืน (`overnightCity`/`noHotel` ใน `itinerary.ts`)
· 🔴 **เดาไม่ได้** — d1→d4 ห่างกัน 3 คืน ระหว่างนั้นนอนที่ไหนต้องอ่านจากโครงวัน ไม่ใช่จากตารางโรงแรม

---

## 🟢 ③ เมืองแปลงได้ครบ — ตรวจแล้วไม่ใช่ปัญหา

```
custom_places.city : busan x29 · hanoi x7 · bangkok x1
trip_hotels.city   : busan · sokcho · gangneung · seoul
คลังใหม่มี         : Busan · Hanoi · Bangkok · Sokcho · Gangneung · Seoul · (+37 เมือง)
```
**ทุกเมืองที่ข้อมูลจริงใช้ มีในคลังแล้ว** · เหลือแค่ตกลงรูปแบบคีย์ (`busan` ↔ `Busan`)

---

## ✅ สิ่งที่ตรวจแล้วว่า *ไม่* เป็นปัญหา

**คอลัมน์เก่าทุกตัวมีปลายทางจริง** — ไล่ด้วยการเทียบชุดคอลัมน์สองสคีมา ไม่ใช่การอ่านเอกสาร:
`description` → `custom_place_descriptions` · ชื่อ 3 ภาษา → `custom_place_names` (locale ต่อแถว)
· `photo_url` → `photo_path` · `file_url` → `file_path` · `day_id` → `trip_day_id` · `order_index` → `rank`
· `added_by`/`checked_by`/`hidden_by` → `*_user` + `legacy_*` · `trip_selections` ทิ้งทั้งตาราง (ตายตั้งแต่ `0006`)

**ไม่มีคอลัมน์ไหนที่ข้อมูลจะหายเพราะ "ไม่มีที่ไป"** — ข้อ ① เป็นเรื่อง *ตารางรับไม่ได้* ไม่ใช่ *ไม่มีคอลัมน์*

---

## ⏳ ที่ยังตัดสินไม่ได้ — ส่ง P3/P7 แล้ว

**`E7-AC9` ตัวระบุ** — สคีมาวันนี้ไม่มีคอลัมน์ไหนรองรับเลย และ `AC9` บังคับให้ migration ใบที่สร้าง
`trip_days` เป็นคนตั้ง → ต้องตัดสินรูปแบบก่อนเขียนสคริปต์
· ข้อเสนอ: `trips.legacy_source text` · **ข้อที่อาจฆ่ามัน:** หลัง `E7` เสร็จ `trip_days` มีวันครบและ
  `events` ไป `trip_stops` แล้ว → ไม่ต้องใช้ `ITINERARY` → **ไม่มีใครอ่านตัวระบุ** · รอ P3 ยืนยัน/หัก
