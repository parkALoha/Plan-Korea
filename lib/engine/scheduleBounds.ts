/**
 * เลือกขอบต้น/ปลายของวันจากแถว `schedule_bound` — `D81` ③ · กฎจาก P5 (26 ส.ค. 2026)
 * เจ้าของ: P1-Lead · **ไม่ import อะไรที่ต่อเน็ต** เพื่อให้ทดสอบได้จริงและใช้ซ้ำได้ทุกที่
 *
 * ## 🔴 ผมถามผิดคำถาม และ P5 แก้ให้ — บันทึกไว้เพราะคำถามผิดยังอ่านดูสมเหตุสมผล
 *
 * ผมถามว่า *"`after` ควรเอาแถวแรก หรือแถวที่เวลาน้อยที่สุด"*
 * > **P5: ไม่มีขาไหน "แรก" — ขอบคือ *ข้อจำกัด* ขอบที่ซ้อนกันจึง *ตัดกัน***
 * > `after` เอา **น้อยที่สุด** · `before` เอา **มากที่สุด**
 *
 * `rank` เรียง**หน้าจอ** และผม**จงใจไม่ผูกมันกับเวลา** → **มันเป็นได้แค่ tie-break เท่านั้น**
 * · ⚠️ ถ้าใช้ `rank` เลือกจริง: วันที่มีเดดไลน์เช็คอิน 19:00 กับเวลาบิน 21:00
 *   **จะได้ 21:00 เป็นเดดไลน์ ถ้าแถวเวลาบินถูกลากขึ้นไปบนสุด** — และผู้ใช้ไม่มีทางรู้ว่าทำไม
 *
 * ## 🔴 และทางแก้ที่ตรงไปตรงมาเป็นกับดัก (P5 · ข้อที่ผมไม่ได้ถาม)
 *
 * `min()` บน **สตริง `HH:MM`** ผิด เพราะ `day_offset` มีอยู่จริงในทริปนี้:
 * ```
 * เที่ยวบิน 01:15 · day_offset 1  →  ของจริง 1515 นาที   ไม่ใช่ 75
 * ```
 * → `min()` แบบสตริงจะเลือกมันเป็นขอบปลาย **ได้ขอบปลายที่มาก่อนวันเริ่มด้วยซ้ำ**
 * · **และทริปนี้มีแถวนั้นจริง** (VN428 — migration ของ `D81` อ้างถึงมันเป็นเหตุผลของ `day_offset`)
 * 🎯 **เทียบต้องทำบน *นาทีจริง* เสมอ ไม่ใช่บนสตริง**
 */

/** รูปร่างขั้นต่ำที่ฟังก์ชันนี้ต้องการ — ไม่ผูกกับชนิดของแถวเต็ม */
export type BoundRow = {
  id: string;
  rank: string;
  schedule_bound: "before" | "after" | null;
  fixed_start_time: string | null;
  day_offset: number | null;
};

/**
 * นาทีจริงนับจากเที่ยงคืนของ **วันที่การ์ดนั้นแสดง** — รวม `day_offset` แล้ว
 * คืน `null` เมื่อไม่มีเวลา (แถวแบบนั้นเป็นขอบไม่ได้)
 */
export function effectiveMinutes(row: Pick<BoundRow, "fixed_start_time" | "day_offset">): number | null {
  const t = row.fixed_start_time;
  if (!t) return null;
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(t);
  if (!m) return null;
  return (row.day_offset ?? 0) * 1440 + Number(m[1]) * 60 + Number(m[2]);
}

export type PickedBounds<T extends BoundRow> = {
  /** ขอบต้นวัน = **มากที่สุด** · จุดแวะเริ่มนับเวลาต่อจากอันนี้ */
  before: T | null;
  /** ขอบปลายวัน = **น้อยที่สุด** · จุดแวะทั้งหมดต้องจบก่อนอันนี้ */
  after: T | null;
  /**
   * จำนวนแถวที่เป็นขอบแต่ละขา — **ไว้ให้ UI บอกผู้ใช้ ไม่ใช่ไว้ให้โค้ดตัดสิน** (P7)
   *
   * `D81` ④ ตั้งใจให้เขียนซ้ำได้ (ไม่มี unique) เพราะ 2 คนตั้งพร้อมกันแล้วคนหลังต้องไม่ได้ error
   * → **"มีขอบ 2 อัน" เป็นความไม่สวย ไม่ใช่ความไม่ถูกต้อง** ตราบใดที่ทุกเครื่องเลือกตัวเดียวกัน
   * 🔴 **แต่ห้ามเงียบ** — P7 เสนอให้แสดง *"วันนี้มีขอบปลายวัน 2 อัน — ใช้อันแรกอยู่"* พร้อมปุ่มเอาออก
   */
  beforeCount: number;
  afterCount: number;
};

/**
 * เลือกขอบจากลิสต์ที่ `dayScheduleBounds()` คืนมา
 *
 * 🔴 **ลิสต์ต้องมาเรียง `(rank, id)` แล้ว** — ฟังก์ชันนี้ไม่เรียงซ้ำโดยตั้งใจ
 * เพราะการเรียงเป็นหน้าที่ของฐาน (มี index รองรับ) และ **การเรียงสองที่คือโอกาสให้มันต่างกัน**
 * · `rank` ใช้เป็น tie-break เท่านั้น: เวลาเท่ากันเป๊ะ → เอาตัวที่มาก่อนในลิสต์
 * · แถวที่ไม่มีเวลา **ไม่นับเป็นขอบเลย** — ขอบที่ไม่มีเวลา ไม่บีบอะไรได้
 */
export function pickScheduleBounds<T extends BoundRow>(rows: readonly T[]): PickedBounds<T> {
  let before: T | null = null;
  let after: T | null = null;
  let beforeMin = -Infinity;
  let afterMin = Infinity;
  let beforeCount = 0;
  let afterCount = 0;

  for (const row of rows) {
    const mins = effectiveMinutes(row);
    if (mins === null) continue;

    if (row.schedule_bound === "before") {
      beforeCount++;
      // > ไม่ใช่ >= : เวลาเท่ากัน = ตัวที่มาก่อนในลิสต์ชนะ (tie-break ด้วย rank, id)
      if (mins > beforeMin) { beforeMin = mins; before = row; }
    } else if (row.schedule_bound === "after") {
      afterCount++;
      if (mins < afterMin) { afterMin = mins; after = row; }
    }
  }

  return { before, after, beforeCount, afterCount };
}
