# UX Flows — Dynamic Travel Platform Engine

> เจ้าของไฟล์: P2-UI/UX · ระยะออกแบบเท่านั้น ไม่มีโค้ดที่รันได้ในไฟล์นี้
> อ้างอิงข้อเท็จจริงจาก `docs/engine/README.md` (ตรวจโค้ดจริง 17 ส.ค. 2026) ทุกจุดที่มีเลข B# คือ blocker ที่ P1 ระบุไว้แล้ว

---

## 0. สรุปทิศทาง

โจทย์คือเปลี่ยนจาก "1 ทริป 2 คน" เป็น "หลายทริปหลายประเทศ หลายคน" โดยที่หน้าจอเดิมที่ผ่านสนามจริงมาแล้ว
(DnD, dark theme, i18n scaffold แม้จะเล็ก) **ต้องรอดและขยายได้ ไม่ใช่รื้อทิ้ง** — เพราะทริปจริง 11–21 ต.ค. 2026
ยังใช้เว็บเวอร์ชันปัจจุบันอยู่ (`docs/engine/README.md` กติกาเหล็กข้อ 1)

หลักที่ยึดทั้งเอกสารนี้: **ขยาย prop ไม่ใช่เขียนใหม่** ทุกที่ที่ทำได้ เพราะ component ส่วนใหญ่ที่อ้างถึงด้านล่าง
(`TripHeader`, `useTripDnd`, `SortableStopRow`, `PlaceSidebar`) เป็น presentational/controlled อยู่แล้ว —
state และ business logic อยู่ที่ `app/page.tsx` ชั้นเดียว ทำให้ swap data source ได้โดยไม่แตะ UI layer เกินจำเป็น

---

## 1. โครง route ใหม่

### 1.1 เสนอ

```
/                          → หน้า "ทริปทั้งหมดของฉัน" (trip list, ใหม่)
/trip/new                  → flow สร้างทริปใหม่ (ใหม่)
/trip/[tripId]             → หน้าแผน (เดิมคือ app/page.tsx ที่ root)
/trip/[tripId]/today       → เดิม app/today/page.tsx
/trip/[tripId]/summary     → เดิม app/summary/page.tsx
/unlock                    → เดิม ไม่เปลี่ยน (ด่าน PIN คุมทั้งเว็บ ไม่ผูกกับทริปใดทริปหนึ่ง)
```

**เหตุผลที่ `/unlock` ไม่ย้ายเข้าใต้ `[tripId]`:** ด่าน PIN ปัจจุบันเป็น global gate ระดับ `proxy.ts`
(`PUBLIC_PATHS` ที่ `proxy.ts:23-29` ฮาร์ดโค้ด `/unlock`, `/api/unlock`, `/sw.js`, `/manifest.webmanifest`,
`/api/keep-alive`) — ผูกกับ "เข้าเว็บได้ไหม" ไม่ใช่ "เข้าทริปนี้ได้ไหม" สองเรื่องนี้เป็นคนละชั้น
authorization (ดู B3, และหัวข้อ 3 ด้านล่างเรื่อง role ต่อทริป) **อย่ารวมกัน** — ถ้าจะมี per-trip access control
ต้องเป็นชั้นใหม่เหนือด่าน PIN เดิม ไม่ใช่แทนที่

**`app/page.tsx` เดิม (root `/`) ต้องเปลี่ยนบทบาท ไม่ใช่ redirect เฉยๆ:**
วันนี้ root คือหน้าแผนทริปเดียว (`app/page.tsx:19` import `ITINERARY` ตรงจาก `@/data/itinerary` —
ข้อมูลทริปแบบ hardcode ไม่ได้ fetch ต่อทริป) พอมีหลายทริป root ต้องกลายเป็น "หน้าเลือกทริป" —
ไม่ใช่แค่ redirect ไป `/trip/{lastUsedId}` เพราะ:
- ผู้ใช้คนเดียวอาจมีมากกว่า 1 ทริปพร้อมกัน (เช่น วางแผนทริปถัดไปคู่ขนานกับทริปที่กำลังเดินทาง)
- collaboration (หัวข้อ 3) แปลว่าอาจมีทริปที่ "คนอื่นชวน" เข้ามาด้วย ต้องมีที่ให้เห็นทั้งหมด

ข้อเสนอ: `/` = grid การ์ดทริป (ชื่อทริป, ช่วงวันที่, ประเทศ, จำนวนคนร่วม, badge "กำลังเดินทาง" ถ้าวันนี้อยู่ในช่วงทริป)
คลิกการ์ด → `/trip/[tripId]` ปุ่ม "+ สร้างทริปใหม่" → `/trip/new`

### 1.2 คำถามที่ยังไม่ตัดสิน (ต้องคุยกับ P1 + P3 เพราะคร่อมโซน)

- **`useSearchParams()` + `?lang=`** (`lib/i18n.ts:141`) ต้องอยู่รอดข้าม dynamic segment ได้ —
  ไม่กระทบ routing โดยตรง แต่ต้องเช็คว่า `router.replace` (`lib/i18n.ts:156-164`) เขียน query string ทับ
  path param `[tripId]` หรือเปล่าตอน migrate จริง (เป็นเรื่อง implementation ของ P3 แต่ผลกระทบ UX
  คือถ้าพลาด ผู้ใช้จะโดนเด้งออกจากทริปตอนสลับภาษา — เป็น regression ที่ทดสอบง่ายควรมีเทสต์คุม)
- P3/P1 กำลังออกแบบ Server Component + Server Action คู่กัน — ผมออกแบบ route shape บนสมมติฐานว่า
  `[tripId]` เป็น path param มาตรฐานของ Next (ไม่ผูกกับว่า page เป็น server หรือ client component)
  ถ้า P3 มีเหตุผลให้ใช้ query param แทน (เช่น ข้อจำกัดเรื่อง static generation) ต้องแจ้งกลับมาเพราะกระทบ
  ข้อ 2 (trip switcher) โดยตรง

---

## 2. Trip switcher — ขยายจาก `TripHeader` เดิม

### 2.1 สถานะปัจจุบัน (`components/TripHeader.tsx`, 134 บรรทัด)

`TripHeader` วันนี้เป็น **plan switcher** ไม่ใช่ trip switcher — สลับระหว่าง `TripPlan` (แผน A/B ของทริป
เดียวกัน, type มาจาก `@/lib/supabase` ที่ `TripHeader.tsx:5`) ไม่ใช่สลับทริป ข้อเท็จจริงสำคัญ:

- ตัว header เองแทบไม่มี state (`TripHeader.tsx:46` มีแค่ `settingsOpen`) — logic การสลับ/สร้าง/ลบ plan
  ทั้งหมดอยู่ใน `TripSettingsModal` ที่ `TripHeader` เรียกใช้ (`TripHeader.tsx:107-131`) ผ่าน callback props
  (`onSwitchPlan`, `onNewPlan`, `onRenamePlan`, `onDeletePlan`) — **นี่คือจุดที่ต่อยอดง่ายที่สุด** เพราะ
  pattern "shell component ที่ trigger modal, modal ถือ logic" พร้อมรับ concept ใหม่อยู่แล้ว
- **บั๊กเชิงโครงสร้างที่ต้องแก้ก่อนขยาย ไม่ใช่ทีหลัง:** `TripHeader.tsx:56-57` และ `TripHeader.tsx:76`
  มีชื่อทริปกับวันที่ฝัง hardcode ตรงใน JSX (`11 – 21 ต.ค. 2026 · เที่ยวเกาหลี 12–20`, `🍁 แพลนเที่ยวเกาหลี`)
  — ไม่ได้มาจาก props เลย ถ้าไม่ดึงออกมาเป็น prop ก่อน ทุกทริปจะโชว์ชื่อ/วันที่ทริปนี้ทริปเดียวตลอด
  เหมือนกันกับ `lib/i18n.ts:24,65` ที่ผูก `tripDates` เป็น string ตายตัวในดิกชันนารี

### 2.2 ข้อเสนอ

**Layer ใหม่เหนือ plan switcher เดิม ไม่ใช่แทนที่:**

```
TripHeader
├─ [ใหม่] TripSwitcherTrigger — ชื่อทริปปัจจุบัน + chevron, คลิกเปิด TripSwitcherModal
│                                แทนที่ตำแหน่ง <h1> เดิมที่ TripHeader.tsx:76
├─ [เดิม] แผน A/B switcher (ปุ่ม ⚙️ → TripSettingsModal) — ไม่แตะ, ทำงานเหมือนเดิมทุกอย่าง
└─ [เดิม] shortcut nav ไป today/summary (TripHeader.tsx:59-70) — เปลี่ยนแค่ href เป็น
                                          /trip/${tripId}/today ฯลฯ
```

Props ใหม่ที่ต้องเพิ่มใน `TripHeaderProps` (ปัจจุบัน `TripHeader.tsx:9-23`):
```ts
tripName: string;          // แทน hardcode บรรทัด 76
tripDateRangeLabel: string; // แทน hardcode บรรทัด 56-57
trips: TripSummary[];       // สำหรับ switcher เห็นทริปอื่นที่ผู้ใช้เข้าถึงได้
activeTripId: string;
onSwitchTrip: (tripId: string) => void;
```

**เหตุผลที่แยกเป็น component ใหม่ (`TripSwitcherTrigger`/`TripSwitcherModal`) แทนการยัดเข้า
`TripSettingsModal` เดิม:** plan (A/B) กับ trip เป็นสอง concept ต่างชั้นกัน (ทริปมี N แผน) ถ้ารวม UI
เป็นเมนูเดียวจะสับสนว่ากำลังสลับอะไร — แยกปุ่มให้เห็นชัดว่า "สลับทริป" ≠ "สลับแผนในทริปนี้"

### 2.3 ไม่ให้ผู้ใช้ 2 คนเดิมงงตอน migrate

ผู้ใช้ปัจจุบัน 2 คนคุ้นกับ `who` (`TripHeaderProps.who`) เป็นชื่อที่พิมพ์เองเก็บใน `localStorage["trip-who"]`
(ตามที่ P1 สรุปไว้ที่ B1) — ข้อเสนอ:

- **วันแรกที่เปิดเว็บหลัง migrate**: ทริปเกาหลีที่มีอยู่ต้องถูกสร้างเป็น "ทริปที่ 1" อัตโนมัติและ
  `activeTripId` default ไปที่ทริปนั้นทันที — ผู้ใช้ที่กด bookmark เดิมไปยัง `/` ต้องยังเห็นหน้าคุ้นตา
  ไม่ใช่หน้าว่างเปล่าให้เลือกทริป (ทริปมีทริปเดียวตอนนั้น ไม่ต้องเลือก)
- **`who` string เดิมไม่ควรหาย** — ใช้เป็น seed ชื่อผู้ใช้เริ่มต้นตอนสร้าง identity จริง (E1 ใน roadmap
  ของ P1) ผู้ใช้ไม่ควรต้องพิมพ์ชื่อตัวเองใหม่
- **ปุ่มสลับทริปต้องไม่โผล่จนกว่าจะมีทริปที่ 2** — ถ้ามีทริปเดียว `TripSwitcherTrigger` ควรเป็นแค่ป้ายชื่อ
  ไม่ใช่ dropdown เปล่าๆ ที่ชวนสงสัยว่ามีทริปอื่นซ่อนอยู่ไหม

---

## 3. Collaboration UX

### 3.1 เชิญคนเข้าทริป + role

ยังไม่มี identity เลย (B1) — คนละเรื่องกับด่าน PIN (B3, กันแค่เข้าเว็บ ไม่ผูกคนกับทริป) ข้อเสนอ UX
วางบนสมมติฐานว่า E1 (Identity, roadmap P1) มาก่อนแล้ว:

- **Owner** สร้างทริป → เห็นปุ่ม "เชิญคนเข้าทริป" ใน `TripSwitcherModal` (ข้อ 2.2) หรือใน settings ของทริป
- Invite เป็นลิงก์ (ไม่ใช่ email-based ก็ได้ ถ้า identity เป็น passwordless/magic-link) — ตั้ง role ตอนสร้างลิงก์
  ได้เลย (editor/viewer) เปลี่ยนทีหลังได้จากหน้ารายชื่อผู้ร่วมทริป
- **Role 3 ระดับ:**
  - `owner` — เชิญ/ลบคน, ลบทริป, ทุกสิทธิ์ของ editor
  - `editor` — แก้แผน/DnD/checklist/booking ได้เท่าที่ผู้ใช้ 2 คนเดิมทำได้ทุกวันนี้ (นี่คือ default
    ของทั้ง 2 คนตอน migrate — **ห้ามมีใครหลุดไปเป็น viewer โดยไม่ตั้งใจ**)
  - `viewer` — อ่านอย่างเดียว, ใช้กับกรณีเช่น "แชร์แผนให้ครอบครัวดู" ที่ไม่ต้องแก้

### 3.2 แสดงว่าใครกำลังแก้อยู่ (Supabase Realtime มีแล้ว)

ข้อเสนอ presence UI แบบเบา ไม่บล็อกการทำงาน (ทริปนี้คือ 2 คนวางแผนพร้อมกันเป็นปกติอยู่แล้ว —
ต้องไม่ทำให้ workflow เดิมช้าลง):

- **Avatar stack เล็กๆ มุมบน** (ใกล้ตำแหน่ง `TripHeader.tsx:107` ที่ settings gear อยู่) — โชว์ initial/avatar
  ของคนที่ online อยู่ในทริปนี้ตอนนี้ ผ่าน Supabase Realtime presence channel ต่อ `tripId`
- **Cursor/highlight ระดับ row ไม่ใช่ระดับตัวอักษร** — เมื่อมีคนกำลังลาก stop หรือแก้ `SortableStopRow`
  แถวไหนอยู่ (ผ่าน broadcast event ตอน `handleDragStart`/`handleDragEnd` ใน `useTripDnd.ts:87-98,107-210`)
  ให้ขอบแถวนั้น highlight สีอ่อนๆ พร้อม avatar เล็กข้างๆ — ไม่ต้อง real-time cursor tracking แบบ Figma
  ซึ่งเกินความจำเป็นสำหรับ 2-4 คนวางแผนทริป
- **Conflict บนแถวเดียวกัน**: ถ้าสอง editor ลากแถวเดียวกันพร้อมกัน — ใช้ last-write-wins ที่ฝั่ง server
  (Server Action, ดูข้อ 6) แต่ฝั่ง UI ต้อง toast แจ้งเมื่อพบว่าตัวเองเพิ่งโดน override
  (pattern เดียวกับ undo toast ที่มีอยู่แล้วใน `useTripDnd.ts:145-150,157-180,196-209` — reuse
  `lib/toast.ts` ที่ `showUndoToast` ต่อยอดเป็น "คนอื่นแก้ทับ" แทน "undo การกระทำตัวเอง")

---

## 4. i18n strategy

### 4.1 ขนาดหนี้จริง (ยืนยันจากซอร์สโค้ด)

`lib/i18n.ts` เป็น scaffold ที่ตั้งใจครอบแค่ `/summary` เท่านั้น (comment `lib/i18n.ts:10-16` บอกตรงๆ ว่า
"เฟส 16" ตัดสินใจแบบนี้) DICT มี **48 คีย์ต่อภาษา** (`lib/i18n.ts:17-100`) ใช้จริงใน `app/summary/page.tsx`
ผ่าน `t()` ประมาณ 40 จุด

Thai hardcode นอก `lib/i18n.ts` กระจายทั่ว repo — ไฟล์ที่หนักสุด (grep unicode ฀-๿):

| ไฟล์ | จำนวนจุด (ประมาณ) |
|---|---|
| `app/today/page.tsx` | 381 |
| `app/page.tsx` | 246 |
| `app/summary/page.tsx` | 208 (ที่เหลือหลัง `t()` คุมแล้ว) |
| `components/SortableStopRow.tsx` | 186 |
| `components/DayMapPanel.tsx` | 177 |
| `components/DayStopsSection.tsx` | 260 |
| `components/NearbyPlacesModal.tsx` | 132 |
| `components/PlaceSidebar.tsx` | 130 |
| `components/DayEventsPanel.tsx` | 119 |
| `components/ImmigrationSheet.tsx` | 109 |
| `components/BookingEditModal.tsx` | 89 |
| `hooks/useTripDnd.ts` | 85 (ส่วนใหญ่คือ label ใน toast) |

รวมประมาณ 30+ ไฟล์ ~2,800+ จุด — **ยกทีเดียวไม่ได้จริง** ต้องมีลำดับ

### 4.2 ทำไมย้ายทั้งหมดทีเดียวไม่ได้ และลำดับที่เสนอ

`useLang()` ต้องอยู่ใต้ `<Suspense>` เพราะพึ่ง `useSearchParams()` (comment `lib/i18n.ts:133-139`,
สังเกตได้จาก `app/summary/page.tsx` ที่ห่อ `SummaryContent()` ด้วย `<Suspense>` — page อื่นไม่มีโครงนี้
ต้องเพิ่มก่อนถึงจะเรียก `useLang()` ได้) — เพิ่ม Suspense boundary ให้หน้าที่ client-heavy อย่าง `/today`
และ root `/` (381 และ 246 จุด) มีความเสี่ยงเรื่อง loading flash ที่ต้องทดสอบ ไม่ใช่แค่ import แล้วจบ

**ลำดับที่เสนอ (เล็ก → ใหญ่, ความเสี่ยง UX ต่ำ → สูง):**

1. **`components/BottomNav.tsx`** (9 จุด, 42 บรรทัดทั้งไฟล์) — เริ่มที่นี่เพราะเล็กสุด ไม่มี logic ซับซ้อน
   เป็น 3 label คงที่ (`BottomNav.tsx:9-11`: `แผนทริป`/`วันนี้`/`สรุปแผน`) + 1 aria-label ใช้พิสูจน์ pattern
   ก่อนลงมือกับไฟล์ใหญ่
2. **Component ที่ไม่มี Suspense dependency แต่ standalone** — `ChecklistPanel.tsx` (29 จุด), `BookingsPanel.tsx`
   (63), `BookingEditModal.tsx` (89) — เป็น panel/modal ที่ mount แยกจาก page shell ทำให้ทดสอบแยกได้
   โดยไม่กระทบ `/today` ทั้งหน้า
3. **`app/unlock/page.tsx`** (36 จุด) — เป็นหน้าที่ผู้ใช้ทุกคนเห็นก่อนเข้าเว็บเสมอ ทำสำเร็จแล้วพิสูจน์ว่า
   หน้าที่ยังไม่มี `<Suspense>` เพิ่มได้โดยไม่พัง (unlock page ไม่ใช้ `useSearchParams` เพื่ออย่างอื่น
   จึงเสี่ยงน้อยกว่า today/root)
4. **`app/today/page.tsx`** (381 จุด, มีอยู่แล้ว `useDarkTheme` ที่ใช้ external-store pattern เดียวกับ
   `useLang` — โครงพร้อมกว่าที่คิด) และ **root `app/page.tsx`** (246 จุด) — ทำท้ายสุดเพราะเป็นหน้าหลักที่ใช้
   บ่อยที่สุด ความเสี่ยง regression สูงสุด ต้องมี e2e ของ P4 คุมก่อนแตะ

**โครง dictionary ที่เสนอ:** แยกไฟล์ตาม domain แทนก้อนเดียว (`lib/i18n/common.ts`, `lib/i18n/today.ts`,
`lib/i18n/checklist.ts`, ...) แล้ว merge เป็น `DICT` เดียวตอน build — เหตุผลคือ 2,800+ คีย์ในไฟล์เดียว
จะ diff/review ไม่ไหว และให้แต่ละ session (P2 คนเดียวไม่มีทางไล่ทันทั้งหมด) หยิบคนละ domain ไปทำขนาน
กันได้โดยไม่ชนไฟล์ — สอดคล้องกติกา "1 คน 1 ไฟล์" ของ `docs/engine/README.md` เมื่อเข้าเฟส 2 จริง

`useLang()` เดิม (`lib/i18n.ts:140-169`) ไม่ต้องแก้ shape — แค่เปลี่ยนแหล่งของ `DICT` เป็น merge
ผลจากหลายไฟล์ เก็บ `TKey` type รวมไว้เหมือนเดิม (`lib/i18n.ts:102`)

### 4.3 "ภาษาของผู้ใช้" vs "ภาษาของประเทศปลายทาง" — คนละเรื่องกันใน UI

สองอย่างนี้ทับกันอยู่ตอนนี้เพราะมีทริปเดียว (เกาหลี) และผู้ใช้เดียว (พูดไทย) — พอเป็นหลายทริปหลายประเทศ
ต้องแยกชัด:

- **ภาษา UI** (`lib/i18n.ts` `Lang = "th" | "en"`) — การตั้งค่าระดับ**ผู้ใช้** ไม่ใช่ระดับทริป
  เก็บใน `localStorage["trip-lang"]` วันนี้ (`lib/i18n.ts:8`) — ตอน migrate ควรย้ายเป็น user preference
  ที่ sync ข้ามอุปกรณ์ (ผูกกับ identity จาก E1) แต่ยังคง default เป็น URL param ก่อนเสมอ (ลำดับ priority
  เดิมที่ `lib/i18n.ts:134-139` ดีอยู่แล้ว ไม่ต้องเปลี่ยน — เผื่อกรณีแชร์ลิงก์แบบ `?lang=en` ให้คนอื่นดู)
- **ภาษาของสถานที่/ปลายทาง** — คนละแกนกับข้างบน มีอยู่แล้วบางส่วนใน `lib/mapLinks.ts:12-19`
  (`navigationName()` เลือก `place.nameLocal || cachedLocal || place.nameEn || place.nameTh` —
  มี comment ยืนยันว่า Naver/Kakao search พังถ้าส่งชื่อไทยเข้าไป ต้องเป็นภาษาท้องถิ่นเท่านั้น) —
  นี่ไม่ใช่ "ภาษา UI" แต่เป็น "ภาษาที่ต้องส่งให้ map API ของประเทศนั้น" **ต้องไม่ใช้ `Lang` type เดียวกัน**
  เพราะ `nameLocal` อาจเป็นเกาหลี/เวียดนาม/ญี่ปุ่น ฯลฯ ซึ่งไม่ใช่ UI language ที่รองรับ (th/en เท่านั้น)
- **ข้อเสนอ**: แยก type `UiLang = "th" | "en"` (ของผู้ใช้) กับ `PlaceLocale` (ของสถานที่ ผูกกับประเทศ
  ปลายทาง ไม่ใช่ enum ปิดตายตัว เพราะประเทศเพิ่มได้เรื่อยๆ) — UI แสดงชื่อสถานที่ตาม fallback chain เดิม
  ของ `mapLinks.ts` เสมอ **ไม่ขึ้นกับ `UiLang` ของผู้ใช้เลย** เช่น ผู้ใช้ตั้ง UI เป็นอังกฤษ แต่ปุ่มนำทางไป
  ร้านในโซล ยังต้องส่งชื่อเกาหลีให้ Naver ไม่ใช่ชื่ออังกฤษ — สองแกนนี้ต้อง independent ใน data model

---

## 5. Country-aware layout

อิงจากข้อเท็จจริงที่ P1 วางไว้แล้ว (B6: `City` เป็น type ปิดตายตัว, ข้อจำกัด provider ที่ README บรรทัด 74-79):
สิ่งที่ต้องเปลี่ยนตามประเทศจริงๆ มี 4 กลุ่ม ไม่ใช่แค่ "ภาษา" อย่างเดียว —

| อะไร | วันนี้ทำยังไง | ต้องเปลี่ยนยังไงสำหรับหลายประเทศ |
|---|---|---|
| **ปุ่มนำทาง** | `lib/mapLinks.ts` โชว์ Google+Naver+Kakao ทุกที่เสมอ (comment `mapLinks.ts:1-10` บอกว่าตั้งใจ เพราะ "อันไหนดีสุด" ขึ้นกับผู้ใช้เดา) | คงพฤติกรรม "โชว์ทุกตัวเลือกเสมอ" ไว้ได้ในระยะสั้น แต่เพิ่ม provider registry (ของ P1) ต้องส่ง "ชุดปุ่มที่ควรมี" ต่อประเทศมาด้วย เช่น ฮานอยไม่ต้องมีปุ่ม Kakao เลย — ไม่ใช่ซ่อนด้วย `if` ในโค้ด UI แต่รับ list จาก registry แล้ว map เป็นปุ่ม |
| **ชื่อสถานที่ที่ส่งให้แผนที่** | `navigationName()`/`hotelNavigationName()` (`mapLinks.ts:12-30`) fallback chain ตายตัว | ใช้ต่อได้เลย ไม่ต้องแก้ — เป็นของที่ "ต้องใช้ซ้ำ" ตามที่ README ระบุไว้แล้ว |
| **เบอร์ฉุกเฉิน** | ไม่มีในโค้ดที่สำรวจ (`EmergencyCard.tsx` มี แต่ไม่ได้อยู่ใน scope การสำรวจนี้ — ต้องเช็คว่าเบอร์ฮาร์ดโค้ดเป็นเกาหลีหรือเปล่า) | **ต้องตรวจ `components/EmergencyCard.tsx` ก่อนออกแบบจริง** — ถ้าเบอร์ (112/119 เกาหลี) ฝังตรง ต้องย้ายเป็นข้อมูลต่อประเทศ ผูกกับ trip.country ไม่ใช่ constant — flag ไว้ตรงนี้เพราะอยู่นอกไฟล์ที่ agent สำรวจให้รอบนี้ |
| **สกุลเงิน/เวลา** | ไม่มี currency field ที่สำรวจเจอ (`BookingEditModal`/`HotelEditModal` มีราคาแต่ไม่ชัดว่ามี currency code) · เวลาใช้ `lib/localDate.ts` ตามนาฬิกาเครื่อง (ข้อ 6.1 ด้านล่าง) | currency ต้องเป็น field ต่อ trip/booking ไม่ใช่สมมติ ₩ เสมอ — คร่อมกับ P1 (schema) ต้องคุยร่วมกัน ไม่ใช่การตัดสินใจของ UX ฝ่ายเดียว |

**เวลา/timezone — ปัญหาที่ P1 ระบุไว้แล้วต้องแก้ก่อนเป็นหลายประเทศ:**
`lib/localDate.ts` (21 บรรทัด) ตั้งใจใช้นาฬิกาเครื่อง ไม่ใช่ UTC (comment บรรทัด 4-9 อธิบาย bug ที่เคยเจอ:
ยืน กทม. 06:00 น. วันที่ 17 ก.ย. → `toISOString()` ยังบอกว่าเป็นวันที่ 16) และมีคำเตือนแยกอีกจุด (บรรทัด 12-14):
ถ้ามือถือค้างเวลาไทยระหว่างอยู่เกาหลี จะเห็นแผนวันเก่าค้างอีก **2 ชม.** หลังเที่ยงคืนเกาหลี (KST−ICT = 2 ชม.)

ปัญหานี้ตอนนี้ "เดา" ว่า timezone ปลายทาง = timezone เครื่อง (ถูกในเคสส่วนใหญ่เพราะมือถือปรับอัตโนมัติ)
พอมีหลายประเทศพร้อมกัน (เช่น วางแผนทริปญี่ปุ่นข้างหน้าขณะยังอยู่เกาหลี) สมมติฐานนี้พังทันที — ข้อเสนอ:
เพิ่ม `trip.timezone` เป็น field explicit (ผูกกับประเทศทริป ไม่ใช่เดาจากเครื่อง) แล้วให้ `/today`
ใช้ `trip.timezone` คำนวณ "วันนี้" แทนนาฬิกาเครื่องเวลาที่ผู้ใช้กำลังดูทริปนั้นอยู่ — คงการใช้นาฬิกาเครื่อง
ไว้แค่ตอนที่ยังไม่รู้ trip.timezone (fallback) ไม่ใช่ตัดออกทั้งหมด เพราะพฤติกรรมเดิม "ปรับตามเครื่องตอนอยู่จริง"
เป็นพฤติกรรมที่ถูกต้องเวลา trip.timezone ตรงกับที่เครื่องอยู่ (กรณีปกติ 99%) — schema/implementation
เป็นเรื่อง P1, แต่ flag ไว้ตรงนี้เพราะกระทบ `/today` UX โดยตรง

---

## 6. DnD บนโมเดลใหม่ — optimistic update เมื่อย้ายไป Server Component/Server Action

### 6.1 โครงสร้างปัจจุบัน (สรุปจาก `hooks/useTripDnd.ts`, 221 บรรทัด)

DnD ทำงานได้ดีวันนี้เพราะทุกอย่างเป็น client state ก้อนเดียวใน `app/page.tsx` — `useTripDnd` เองไม่ถือ
business state เลย มีแค่ `activeDrag` (บรรทัด 83-85, ใช้โชว์ label บน `DragOverlay`) ทุกอย่างอื่นรับเป็น
callback props (`addStop`, `removeStop`, `reorderStops`, `moveStopToDay`, ...) ที่ `app/page.tsx` เป็นเจ้าของ
state จริง `handleDragEnd` (บรรทัด 107-210) เรียก callback เหล่านี้แบบ synchronous → re-render ทันที
= ความรู้สึก "ลากแล้วขยับทันที" ที่มีอยู่แล้วตามธรรมชาติของ client state

### 6.2 สิ่งที่พังถ้าย้ายไป Server Action ตรงๆ โดยไม่ออกแบบ optimistic layer

ถ้า `addStop`/`reorderStops`/`moveStopToDay` กลายเป็น Server Action ที่ await network round-trip ก่อน
update UI — การลากจะรู้สึกหน่วง (ต้องรอ server ตอบก่อนแถวถึงจะขยับ) ซึ่งเป็น UX regression ชัดเจนจาก
ของที่มีอยู่วันนี้ที่ instant

### 6.3 ข้อเสนอ: คง client state ไว้เป็น optimistic layer, Server Action เป็น "ยืนยัน" ไม่ใช่ "แหล่งความจริงเดียว"

```
handleDragEnd (useTripDnd.ts:107-210, โครงเดิมไม่เปลี่ยน)
  → เรียก callback เดิม (addStop/reorderStops/moveStopToDay) ทันที เหมือนเดิมทุกอย่าง
  → callback เหล่านี้ (ที่ app/page.tsx เป็นเจ้าของ) เปลี่ยนจาก
      "setState ตรง + supabase.from().update() ตรง" (แบบ B8 ที่ P1 ระบุ — 47 จุดยิงจาก browser)
    เป็น
      "setState ตรง (optimistic, เหมือนเดิม) + fire Server Action แบบไม่ await ในเส้นทางหลัก"
  → ถ้า Server Action fail (เช่น อีก editor ล็อกวันนั้นไปพร้อมกัน, หรือ network) →
      revert state กลับตำแหน่งเดิม + toast แจ้ง — reuse pattern `showUndoToast` ที่มีอยู่แล้ว
      (`useTripDnd.ts:145-150,157-180,196-209`) แค่เปลี่ยนความหมายจาก "undo การกระทำตัวเอง"
      เป็น "server ปฏิเสธ ต้อง revert" — โครง toast UI เดิมใช้ได้เลยไม่ต้องออกแบบใหม่
```

**ทำไมไม่ใช้ `useOptimistic` ของ React ตรงๆ:** `useTripDnd` วันนี้ไม่ได้ถือ state เอง (state อยู่ที่
`app/page.tsx`) — การใส่ `useOptimistic` ควรอยู่ชั้นเดียวกับ state จริง (`app/page.tsx` หรือ hook ที่มันเรียก
เช่น `useStops.ts`) ไม่ใช่ใน `useTripDnd.ts` เอง เพื่อไม่ให้ hook นี้ (ซึ่งเป็น orchestration บาง สะอาด
อยู่แล้ว) ต้องรู้เรื่อง server/network — คง `useTripDnd` เป็น "แปลง drag event เป็น intent" อย่างเดียว
ตามที่เป็นอยู่ตอนนี้

**ผลกระทบต่อ conflict UX (เชื่อมกับข้อ 3.2):** เมื่อมี 2 editor ลากพร้อมกัน optimistic update ของทั้งคู่
จะขึ้นทันทีฝั่งตัวเอง แต่ server ตัดสินคนชนะ (last-write-wins ระดับ row) — คนแพ้ต้องเห็น revert + toast
"อีกคนแก้แถวนี้ก่อน" ไม่ใช่แค่เงียบๆ หายไป เพราะจะดูเหมือนบั๊ก ไม่ใช่ conflict

**สิ่งที่ยังไม่ตัดสิน — ต้องคุยกับ P1/P3:** ตำแหน่งที่ Server Action ควร fire — ทุก drag event (reorder
ทีละ 1 คลิก = 1 network call) หรือ debounce/batch ตอนที่ user หยุดลากสักพัก การเลือกกระทบ perceived
latency ของ conflict detection (batch ช้ากว่าแต่ network call น้อยกว่า) — เป็นการตัดสินใจร่วมด้าน
performance/infra ไม่ใช่ UX ฝ่ายเดียว

---

## 7. สิ่งที่ขัดกับที่ P1 เขียนไว้ หรือควรตรวจเพิ่ม

- **`useDarkTheme` JSDoc ล้าสมัย**: comment ที่ `hooks/useDarkTheme.ts:47-56` บอกว่าใช้ "เฉพาะ `/today`"
  แต่จริงๆ `app/summary/page.tsx:54,502` ก็เรียกใช้ด้วย — ไม่กระทบแผนงานนี้โดยตรง แต่ P1/เจ้าของไฟล์
  ควรอัปเดต comment ให้ตรงของจริง (ไม่ใช่งานของผมแก้ เพราะ hook อยู่นอกโซน `docs/engine/`)
- **`EmergencyCard.tsx` ไม่อยู่ใน 10 ไฟล์ที่ผมสำรวจรอบนี้** — flag ไว้ในข้อ 5 แล้วว่าต้องตรวจว่าเบอร์ฉุกเฉิน
  ฝังเป็นเกาหลีตรงๆ หรือเปล่าก่อนออกแบบ country-aware layout เวอร์ชันจริง
- **currency field**: ไม่พบ field สกุลเงินชัดเจนในไฟล์ที่สำรวจ (`BookingEditModal`/`HotelEditModal`)
  — ถ้า P1 ยืนยันว่าไม่มี ต้องเพิ่มเป็นข้อคุยร่วมสำหรับ schema (E2 ใน roadmap) ไม่ใช่แค่ UX เดา
- ข้อเท็จจริงอื่นทั้งหมดที่ README ระบุ (B1-B10, DICT 48 คีย์, `useTripDnd` โครงสร้าง ฯลฯ) ตรงกับที่ผม
  ตรวจจากซอร์สโค้ดจริงทุกจุด ไม่พบจุดขัดแย้ง
