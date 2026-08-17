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
วางบนสมมติฐานว่า E1 (Identity, roadmap P1) มาก่อนแล้ว

🔴 **D26 (ผู้ใช้ตัดสิน):** flow เชิญคนที่ 3 เข้าทริปทั้งหมดในข้อนี้ **ยังเปิดใช้ไม่ได้จนกว่าจะปิด B2/B3/D12
และขยับพ้น Supabase Hobby** — เขียนไว้ที่นี่เพื่อไม่ให้ใครลัดไปสร้างปุ่ม "เชิญคนเข้าทริป" ก่อนเกณฑ์นี้ผ่าน
แม้ E1 (identity) จะเสร็จแล้วก็ตาม เพราะ RLS/security ยังไม่พร้อมรับคนที่ 3 เข้าระบบ:

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

⚠️ **วิธีวัดตัวเลขนี้ — สำคัญสำหรับตัดสินใจเรื่อง M1 vs M2:** นับจาก `grep` unicode Thai (฀-๿) เป็น
**substring occurrence ทั้งไฟล์** ไม่ได้แยกว่าอันไหน render ให้ผู้ใช้เห็นจริง อันไหนอยู่ใน comment/JSDoc
(หลายไฟล์ในนี้มี comment ภาษาไทยยาวอธิบาย logic เช่น `useTripDnd.ts` — "85 จุด" ส่วนใหญ่ตามที่ระบุไว้แล้ว
คือ label ใน toast ไม่ใช่ comment แต่ไฟล์อื่นในตารางไม่ได้แยกแบบนี้ให้) **นี่คือเพดานบน ไม่ใช่จำนวน
string ที่ต้องแปลจริง** — จำนวนจริงที่ผู้ใช้เห็นและต้องมีคู่ TH/EN น่าจะน้อยกว่านี้พอสมควร แต่ผมไม่มี
ตัวเลขที่แยก JSX-rendered ออกจาก comment ให้ตอนนี้ — ถ้าต้องใช้ตัวเลขนี้ตัดสินใจจริง ควรนับใหม่ให้แยกชัด
ก่อน ไม่ใช่เชื่อ 2,800 ตรงๆ

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
| **เบอร์ฉุกเฉิน** | `components/EmergencyCard.tsx` + `data/emergency.ts` — ดูข้อ 5.1 ด้านล่าง | ย้าย `EMERGENCY_BY_COUNTRY` → ตาราง `emergency_contacts` ตามที่ P1 เสนอใน `architecture.md §4.3` — ฝั่ง UX ไม่ต้องเปลี่ยนโครงการ์ดเลย (ดูเหตุผลข้อ 5.1) |

**สกุลเงิน — ตัดออกจาก scope แล้ว:** P1 ตรวจทั้ง repo ยืนยันไม่มี `₩`/`KRW`/`THB`/currency field ที่ไหนเลย
รวมทั้งใน `bookings` — `PLAN.md §1` ตัดงบประมาณออกตั้งแต่ต้นและผู้ใช้ยืนยันซ้ำ 17 ส.ค. 2026 ว่าคงไว้
**เอกสารนี้จึงไม่ออกแบบเผื่อ multi-currency ที่ไหนเลย** (ไม่มีจุดไหนในไฟล์นี้อ้างถึง currency อยู่แล้ว)

### 5.1 เบอร์ฉุกเฉิน — `EmergencyCard.tsx` + `data/emergency.ts` (ตรวจแล้วตามที่ P1 ขอ)

โครงสร้างปัจจุบัน:
- `data/emergency.ts:20` — `EMERGENCY_BY_COUNTRY: Record<"kr" | "vn", EmergencyContact[]>` เป็น union
  ปิดตายตัวแค่ 2 ประเทศ ตรงกับ B6 ที่ P1 ระบุ (`countryOfCity()` ที่บรรทัด 58-60 เป็น `if` เดียว
  `city === "hanoi" ? "vn" : "kr"`)
- `components/EmergencyCard.tsx:29` — `const contacts = EMERGENCY_BY_COUNTRY[countryOfCity(city)];`
  เป็นจุดเดียวที่ query ข้อมูลนี้ ทั้งการ์ดที่เหลือ (บรรทัด 61-172) เป็น presentational ล้วน — วนลูป
  `contacts.map()` render `icon`/`label`/`local`/`tel`/`detail`/`url` ตาม shape ของ `EmergencyContact`
  type (`data/emergency.ts:3-12`)

**ข้อสรุป UX: หน้าจอไม่ต้องเปลี่ยนเลยเมื่อมีประเทศที่ 3** — เพราะการ์ดนี้ออกแบบมาเป็น data-driven อยู่แล้ว
(loop ตาม array, ไม่มี `if country === "kr"` ในตัว component) จุดเดียวที่ต้องเปลี่ยนคือ **แหล่งข้อมูล**
ไม่ใช่ layout: เปลี่ยน `EMERGENCY_BY_COUNTRY[countryOfCity(city)]` (object lookup ที่ปิดตายตัว 2 คีย์)
เป็น query จากตาราง `emergency_contacts` (ที่ P1 เสนอใน `architecture.md` §1.3/§4.3) กรองด้วย
`country_code` ของทริปนั้น — component ไม่ต้องแก้ต่อเมื่อเพิ่มประเทศที่ 3, 4, 5 อีกเลย เพราะ
`.map()` เดิมรองรับ array ยาวเท่าไรก็ได้อยู่แล้ว

**สิ่งเดียวที่ต้องคิดเพิ่มสำหรับ UX (ไม่ใช่แค่ data source):**
- **ทริปข้ามหลายประเทศในทริปเดียว** (เช่น เกาหลี+ฮานอยของทริปนี้เอง) — วันนี้ `city` มาจาก
  `day.city` ต่อวันอยู่แล้ว (ผ่าน prop ที่ `EmergencyCard` รับ) ดังนั้น **ใช้งานได้ทันทีไม่ต้องแก้** —
  แค่ต้องยืนยันว่าตอน migrate `city` ยังคง resolve เป็น `country_code` ถูกต้องผ่าน FK แทนที่ predicate
  แบบ `if` เดิม (เป็นเรื่อง schema/DAL ของ P1 ไม่ใช่ UX)
- **ถ้าไม่มีข้อมูลเบอร์ฉุกเฉินของประเทศนั้นเลย** (เช่น เพิ่มประเทศใหม่แต่ยังไม่มีใครกรอกข้อมูลสถานทูต) —
  วันนี้โค้ดไม่มี fallback ถ้า key ไม่มีใน object จะ crash (`contacts` เป็น `undefined` แล้ว `.map()`
  ที่บรรทัด 78 throw) **ต้องเพิ่ม empty-state** ("ยังไม่มีข้อมูลเบอร์ฉุกเฉินของประเทศนี้ — ตรวจสอบเอง
  ก่อนเดินทาง" + ลิงก์ค้นหาสถานทูตทั่วไป) แทนที่จะปล่อยพัง — นี่คือ regression risk จริงที่ต้อง
  แก้ตอน E5 ถ้าจะมีประเทศที่ยังไม่ครบข้อมูล

### 5.2 เวลา/timezone — ตรงกับที่ P1 เสนอใน `architecture.md §5`

`lib/localDate.ts` (21 บรรทัด) ตั้งใจใช้นาฬิกาเครื่อง ไม่ใช่ UTC (comment บรรทัด 4-9 อธิบาย bug ที่เคยเจอ:
ยืน กทม. 06:00 น. วันที่ 17 ก.ย. → `toISOString()` ยังบอกว่าเป็นวันที่ 16) และมีคำเตือนแยกอีกจุด (บรรทัด 12-14):
ถ้ามือถือค้างเวลาไทยระหว่างอยู่เกาหลี จะเห็นแผนวันเก่าค้างอีก **2 ชม.** หลังเที่ยงคืนเกาหลี (KST−ICT = 2 ชม.)

**ยืนยันตรงกับข้อเสนอของ P1** (`architecture.md §5`: `trips.base_timezone` + `trip_days.timezone` รายวัน,
เก็บเวลาเป็น `"HH:MM"` local เหมือนเดิม ไม่แปลงเป็น UTC) — เหตุผลที่ตรงกันจากฝั่ง UX:
- ทริปเดียวข้ามหลายประเทศ (ฮานอย→โซล ของทริปนี้เอง) ต้องใช้ timezone **รายวัน** ไม่ใช่รายทริป
  ถึงจะตอบคำถาม "วันนี้ของ `/today` คือวันไหน" ถูกทุกวัน แม้อยู่ระหว่างวันที่ข้ามประเทศพอดี — ตรงกับ
  `trip_days.timezone` ของ P1 พอดี ไม่ใช่แค่ `trips.base_timezone` เฉยๆ
- เก็บเวลาเป็น `"HH:MM"` local ต่อ — ฝั่ง UX เห็นด้วยว่าไม่ควรแปลงเป็น UTC เพราะผู้ใช้อ่านตารางเวลาแบบ
  "8 โมงเช้าออกจากโรงแรม" ไม่ใช่คำนวณ offset เอง การเปลี่ยนไปเก็บ UTC จะบังคับให้ทุกจุดที่ render เวลา
  ต้องแปลงกลับเป็น local ก่อนโชว์เสมอ เสี่ยงบั๊กมากกว่าที่แก้ได้จริง
- **ผลต่อ UX ที่ต้องออกแบบเพิ่ม (ยังไม่มีใน `architecture.md`):** เมื่อ `trip_days.timezone`
  เปลี่ยนกลางทริป (วันข้ามประเทศ) หน้า `/today` ควรมี indicator เล็กๆ บอกว่า "วันนี้อ้างอิงเวลา
  {เมือง}" โดยเฉพาะวันที่มีไฟลต์ข้ามเที่ยงคืน (`DayEvent.dayOffset` ที่ P1 พูดถึงใน `architecture.md:226`)
  เพื่อไม่ให้ผู้ใช้สับสนว่าทำไมเวลาบนจอไม่ตรงกับนาฬิกาที่ถืออยู่ตอนอยู่ระหว่างเดินทาง

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

### 6.4 ยืนยันกับ `lib/writeGuard.ts` ที่ P1 เสนอ — รับได้ ตรงกับแผนข้อ 6.3 พอดี

P1 เสนอว่า `lib/writeGuard.ts` เป็น choke point เดียวของการเขียนทั้งโปรเจกต์ (`architecture.md §3.3`)
และตั้งใจแปลง `writeGuard(label, run)` เป็นตัวเรียก Server Action จุดเดียว โดย signature ที่ hook เรียก
ยังเหมือนเดิม — **ตรงกับแผน UX ที่ข้อ 6.3 เสนอไว้พอดี ไม่มีจุดขัดแย้ง**:

- `useTripDnd.ts` เรียก callback (`addStop`/`reorderStops`/`moveStopToDay`) ที่ `app/page.tsx` เป็นเจ้าของ
  → callback เหล่านั้นเรียก hook อย่าง `useStops.ts` → ถ้า `useStops.ts` เขียนผ่าน `writeGuard()` อยู่แล้ว
  (ตามที่ P1 อธิบาย "เฟส 20.2") การแปลง `writeGuard` เป็น Server Action caller หมายความว่า **ทุกจุดที่
  ข้อ 6.3 เสนอ optimistic layer ไว้ (ชั้นเดียวกับ state จริง ไม่ใช่ใน `useTripDnd`) จะได้ Server Action
  ฟรีโดยไม่ต้องแก้โค้ด UI เพิ่มอีกจุดเดียว**
- Revert-on-fail + toast (ข้อ 6.3) ก็ implement ได้ที่ `writeGuard()` จุดเดียวเหมือนกัน — `writeGuard`
  รู้อยู่แล้วว่า `run()` fail เมื่อไร (นั่นคือหน้าที่ปัจจุบันของมัน "พังแล้วมีเสียง") แค่เพิ่ม callback
  `onRevert` ให้ผู้เรียกส่ง state-rollback function เข้ามาได้ ก็ครบทุกอย่างที่ข้อ 6.3 ต้องการ
- **ข้อเสนอเพิ่มจากฝั่ง UX**: `onRevert` ควรเป็น optional parameter ของ `writeGuard()` ไม่ใช่ required —
  เพราะบาง call site (เช่น การเขียนที่ไม่มี optimistic UI อยู่แล้ว) ไม่มีอะไรให้ revert สิ่งนี้ไม่กระทบ
  ของเดิม 47 จุดที่เรียกอยู่ตอนนี้ เป็น backward-compatible เพิ่ม opt-in

### 6.5 ⚠️ ช่องโหว่ที่ P4 พบ (D15): `writeGuard` ไม่ครอบ Storage — 5 จุดอยู่ในโซนผม

P1 แก้ข้อสรุปเดิม ("`writeGuard` ครอบทุกการเขียน") — จริงๆ ครอบแค่การเขียนตาราง (10/10 hooks)
**ไม่ครอบ Storage เลย (0/9)** และ 5 ใน 9 จุดนั้นอยู่ที่ `components/BookingEditModal.tsx`
(`supabase.storage.from(BOOKING_FILES_BUCKET)` ที่บรรทัด 86 `.upload()`, 94/106/117 `.remove()`,
97 `.getPublicUrl()`) — เรียก Supabase Storage ตรงจาก component ไม่ผ่าน hook/choke point ใดๆ

**ผลต่อแผนข้อ 6.3/6.4:** optimistic layer + revert-on-fail ที่ออกแบบไว้ (ผ่าน `writeGuard` เป็นตัวเรียก
Server Action) **ไม่ครอบไฟล์แนบตั๋วโดยอัตโนมัติ** — ตอน E3 ต้องมีงานแยกดึง 5 จุดนี้ออกมาเป็น hook
(เช่น `useBookingFile.ts`) แล้วเดินผ่าน `writeGuard`/Server Action เหมือนจุดอื่น ไม่ใช่แค่ "ย้าย hooks
10 ตัว" อย่างที่ D10 สรุปไว้ว่างานกระจุกที่ hooks — **งานของ E3 กระทบ `components/` จริง แม้เล็กแค่ 1 ไฟล์**
นี่เป็นงานของ E3 (phase 2) ไม่ใช่ตอนนี้ — บันทึกไว้ที่นี่เพื่อไม่ให้หลุดตอนถึงเฟสจริง เกี่ยวโยงกับ D12
(bucket `booking-files` เป็น public) ที่ P1 ส่งให้ P4 แล้วเช่นกัน — สอง D นี้ชี้ไปที่ไฟล์เดียวกัน

---

## 7. สถานะคำถามค้าง (อัปเดตหลังคุยกับ P1 — ดู `docs/engine/README.md` "ข้อตัดสินของ P1")

**ตัดสินแล้ว โดย P1:**
- **D1 route `/unlock`**: คงเป็น global ไม่ใช่ per-trip ตามที่เอกสารนี้เสนอในข้อ 1.1 — P1 เอาตามข้อเสนอนี้
  เหตุผล: PIN เป็นกลไกชั่วคราวที่ E1 (Identity) จะแทนทั้งหมด สิทธิ์ต่อทริปมาจาก `trip_members` ไม่ใช่ PIN
  P3 แก้ฝั่งตัวเองแล้ว ไม่ต้องแก้ไฟล์นี้เพิ่ม
- **D2 currency**: ไม่มีจริงในระบบ (P1 ตรวจทั้ง repo ยืนยัน) และจะไม่เพิ่ม — แก้ในข้อ 5 แล้ว ไม่มีการ
  ออกแบบเผื่อ multi-currency ในเอกสารนี้
- **D3 ตัวเลข i18n**: ~2,800+ จุด/30+ ไฟล์ ที่วัดในเอกสารนี้ (ข้อ 4.1) แทนที่ตัวเลข "~25 ไฟล์" เดิมของ P1
  แล้ว — P1 แก้ `README.md` และแจ้ง P3 ให้ใช้เลขนี้
- **เบอร์ฉุกเฉิน**: ตรวจ `EmergencyCard.tsx` + `data/emergency.ts` แล้ว — สรุปไว้ที่ข้อ 5.1
- **timezone**: ยืนยันตรงกับข้อเสนอ P1 ใน `architecture.md §5` แล้ว — สรุปไว้ที่ข้อ 5.2
- **optimistic layer / `writeGuard.ts`**: ยืนยันรับได้ ไม่มีจุดขัดแย้งกับแผน P1 — สรุปไว้ที่ข้อ 6.4

**รับทราบ ไม่ต้องทำตอนนี้:**
- `useDarkTheme` JSDoc ล้าสมัย (`hooks/useDarkTheme.ts:47-56` บอกว่าใช้ "เฉพาะ `/today`" แต่
  `app/summary/page.tsx:54,502` ก็เรียกด้วย) — P1 เก็บเข้างานเก็บกวาดของ E5 (โซน P2) ระยะนี้ freeze
  โค้ดแอปทั้งหมด ไม่แก้แม้แต่คอมเมนต์

ข้อเท็จจริงอื่นทั้งหมดที่ README ระบุ (B1-B10, DICT 48 คีย์, `useTripDnd` โครงสร้าง ฯลฯ) ตรงกับที่ผม
ตรวจจากซอร์สโค้ดจริงทุกจุด ไม่พบจุดขัดแย้งเพิ่มเติม
