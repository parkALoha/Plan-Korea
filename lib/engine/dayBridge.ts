/**
 * สะพาน `"d0"` ⇄ `date` ⇄ `uuid` — `E3` · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## 🔴 ทำไมต้องมี และทำไมต้องมี *ที่เดียว*
 *
 * เว็บเดิมอ้างวันด้วย `Day.id` = `"d0"` ซึ่งมาจาก **ไฟล์ TS ไม่ใช่ฐาน**
 * สคีมาใหม่ `trip_days.id` เป็น **`uuid` ที่ฐานออกให้** และ **ไม่มีคอลัมน์ไหนเก็บ `"d0"` ไว้เลย** (`P-72`)
 *
 * 🎯 **คีย์ที่เชื่อมสองโลกคือ `date`** — และมันเชื่อถือได้เพราะฐานบังคับ `unique (trip_id, date)`
 * · ไม่ใช่การเดา: **หนึ่งทริปมีหนึ่งแถวต่อหนึ่งวันที่ ตามข้อบังคับของตารางเอง**
 *
 * 🔴 **hook ที่คีย์ด้วยวันมีอีกอย่างน้อย 3 ตัว** (`useDaySettings` · `useStops` · `useOvernightOverrides`)
 * ถ้าแต่ละตัวแปลงเอง **มันจะแปลงไม่เหมือนกันสักวัน** — รูปเดียวกับที่ `customPlaceShape` หลีกเลี่ยงไว้
 *
 * ## 🔴 กติกาที่สำคัญที่สุด: **"ไม่มีสะพาน" ต้องไม่หน้าตาเหมือน "แปลงแล้วไม่เจอ"**
 *
 * ถ้า `E7` ยังไม่ได้ย้ายข้อมูล ฐานจะ**ไม่มีแถว `trip_days` เลยสักแถว**
 * → สะพานว่างเปล่า → ทุกการแปลงคืน `null` → **hook ทุกตัวจะเงียบและไม่ทำอะไร**
 * **โดยที่ไม่มี error ที่ไหนเลย และหน้าจอดูเหมือนแค่ "ยังไม่มีข้อมูล"**
 * · ⚠️ **นั่นคือกับดัก `P-21` เป๊ะ: *สแกนความว่างเปล่า* กับ *สแกนแล้วไม่เจอ* ให้ผลเหมือนกัน**
 * → `buildDayBridge()` จึงคืน **`unmatchedLegacy` / `unmatchedDb` ออกมาด้วยเสมอ** ให้ผู้เรียกตัดสินใจได้
 */

export type DayRef = { id: string; date: string };

export type DayBridge = {
  /** `"d0"` → `uuid` · `null` = ไม่มีวันนั้นในฐาน */
  toDbId(legacyId: string): string | null;
  /** `uuid` → `"d0"` · `null` = วันนั้นไม่มีในไฟล์เดิม (วันที่เกิดบนแพลตฟอร์ม) */
  toLegacyId(dbId: string): string | null;
  /** 🔴 วันในไฟล์เดิมที่ **ไม่มีแถวในฐาน** — ถ้าเท่ากับจำนวนวันทั้งหมด = `E7` ยังไม่ได้รัน */
  unmatchedLegacy: string[];
  /** วันในฐานที่ไม่มีในไฟล์เดิม — ปกติสำหรับทริปที่สร้างบนแพลตฟอร์ม */
  unmatchedDb: string[];
  /** จำนวนคู่ที่จับได้จริง — **`0` กับ "ไม่มีวันเลย" ต้องแยกออกจากกันที่ผู้เรียก** */
  matched: number;
};

/**
 * @param legacyDays วันจาก `data/itinerary.ts` (`DAYS`) — **ผู้เรียกส่งเข้ามา ไม่ import ที่นี่**
 *   เพื่อไม่ให้ชั้น engine ผูกกับข้อมูลของทริปใดทริปหนึ่ง · และเพื่อให้ทดสอบได้โดยไม่ต้องมีไฟล์นั้น
 * @param dbDays แถว `trip_days` ของทริปนั้น
 */
export function buildDayBridge(
  legacyDays: readonly DayRef[],
  dbDays: readonly DayRef[]
): DayBridge {
  const dbByDate = new Map<string, string>();
  for (const d of dbDays) dbByDate.set(d.date, d.id);

  const legacyToDb = new Map<string, string>();
  const dbToLegacy = new Map<string, string>();
  const unmatchedLegacy: string[] = [];

  for (const d of legacyDays) {
    const dbId = dbByDate.get(d.date);
    if (dbId === undefined) {
      unmatchedLegacy.push(d.id);
      continue;
    }
    // 🔴 วันที่ซ้ำในไฟล์เดิมจะทับกัน — แต่ฐานบังคับ unique อยู่แล้ว จึงเกิดได้เฉพาะฝั่งไฟล์
    //    เอาตัวแรกไว้ และปล่อยให้ตัวหลังไปอยู่ใน `unmatchedLegacy` เพื่อให้เห็นว่ามีปัญหา
    if (legacyToDb.has(d.id) || dbToLegacy.has(dbId)) {
      unmatchedLegacy.push(d.id);
      continue;
    }
    legacyToDb.set(d.id, dbId);
    dbToLegacy.set(dbId, d.id);
  }

  const matchedDbIds = new Set(dbToLegacy.keys());
  const unmatchedDb = dbDays.filter((d) => !matchedDbIds.has(d.id)).map((d) => d.id);

  return {
    toDbId: (legacyId) => legacyToDb.get(legacyId) ?? null,
    toLegacyId: (dbId) => dbToLegacy.get(dbId) ?? null,
    unmatchedLegacy,
    unmatchedDb,
    matched: legacyToDb.size,
  };
}

/**
 * ข้อความเตือนเมื่อสะพานไม่สมบูรณ์ — `null` = ไม่มีอะไรต้องเตือน
 *
 * 🎯 **แยก *"ยังไม่ได้ย้ายข้อมูลเลย"* ออกจาก *"ย้ายแล้วแต่ขาดบางวัน"*** เพราะสองอย่างนี้
 * คนละสาเหตุและคนละทางแก้ · **และถ้ายุบรวมเป็น "ไม่เจอ" เฉย ๆ จะไม่มีใครรู้ว่าต้องทำอะไร**
 */
export function dayBridgeWarning(b: DayBridge, totalLegacyDays: number): string | null {
  if (totalLegacyDays > 0 && b.matched === 0) {
    return `ยังไม่มีวันของทริปนี้ในฐานเลยสักวัน (${totalLegacyDays} วันในไฟล์) — E7 ยังไม่ได้ย้ายข้อมูล`;
  }
  if (b.unmatchedLegacy.length > 0) {
    return `มี ${b.unmatchedLegacy.length} วันในไฟล์ที่ไม่มีแถวในฐาน: ${b.unmatchedLegacy.join(", ")}`;
  }
  return null;
}
