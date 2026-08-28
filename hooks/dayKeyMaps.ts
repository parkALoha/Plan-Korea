import type { DayBridge, DayRef } from "@/lib/engine/dayBridge";

/**
 * แมป `uuid ของฐาน` → `Day.id ที่ UI ใช้` — **แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้ยิงเทสต์ได้**
 *
 * ## 🔴 ทำไมถึงมีไฟล์นี้ (P2 · 28 ส.ค. 2026 · P4 เสนอ)
 * เดิมโค้ดนี้เป็น closure ใน `useStops`/`useBookings` → **ไม่มีเทสต์ไหนไปถึงได้ถ้าไม่ render hook**
 * แล้วบั๊กจริงก็เกิดตรงนั้นพอดี: จุดแวะทริปเกาหลี 12 จุดหลุดจากวันทั้งหมด **โดยชุด 1026 เคสเขียวทั้งชุด**
 * · P4 ปักกับดักที่ *สัญญาของสะพาน* ได้ (`dayBridge.test.ts`) **แต่ถ้าใครเปลี่ยนจุดเรียกกลับไปท่าผิด
 *   เคสนั้นจะยังเขียว** — ช่องว่างอยู่ที่ *จุดเรียก* ไม่ใช่ที่สะพาน
 * 🎯 **ปักกับดักที่สัญญา ไม่ได้ปักที่คนใช้สัญญา** — ไฟล์นี้มีเพื่อให้ปักที่คนใช้ได้
 *
 * ## 🔴 ห้ามกลับด้าน `bridge.dayKeyToDbId` เพื่อทำแมปนี้
 * `dayKeyToDbId` มี **สองคีย์ที่ชี้ `uuid` เดียวกัน** — `"d0"` และ `uuid` ของมันเอง
 * ```
 * ["d0" → u0, u0 → u0]   กลับด้าน →  [u0 → "d0", u0 → u0]   new Map เก็บตัวท้าย → u0 → u0
 * ```
 * → ทริปเกาหลีได้ `day_id` เป็น `uuid` ที่ `ITINERARY` ไม่รู้จัก → **จุดแวะ/ตั๋วหลุดจากวันทั้งหมด**
 * · ⚠️ อาการบนจอคือ *"วันนี้ยังไม่มีจุดแวะ"* ทุกวัน = **สภาพปกติที่สุดของทริปที่ยังวางแผนอยู่**
 *   และตัวเลขรวมหัวการ์ดมาจากอีกทาง **จึงยังถูก** — *"นับได้"* กับ *"ผูกกับวันถูก"* คนละคำถาม
 */
export function buildUuidToDayKey(
  dbDays: readonly DayRef[],
  bridge: DayBridge
): Map<string, string> {
  // ถามสะพานทีละวัน — ไม่กลับด้านแมปที่มีคีย์ซ้อน
  // วันที่ไม่มีในไฟล์เดิม (ทริปแพลตฟอร์ม) ใช้ `uuid` เป็น `Day.id` ตรง ๆ ซึ่ง UI หาเจอ
  return new Map(dbDays.map((d) => [d.id, bridge.toLegacyId(d.id) ?? d.id]));
}

/** รูปแถวจุดแวะที่ route คืนมา — เท่าที่ตัวแปลงนี้ต้องรู้ (ตัวเต็มอยู่ที่ `useStops`) */
type StopRowLike = { trip_day_id: string };

/**
 * เติม `day_id` (คีย์ที่ UI ใช้) และ `plan_id` ให้แถวจุดแวะ · **ทิ้งแถวที่หาวันไม่เจอ**
 *
 * 🔴 **ทิ้ง ไม่ใช่ใส่ `uuid` ดิบ** — แถวที่ `uuidToDay` ไม่มีคีย์ให้ แปลว่า **วันนั้นไม่มีในฐานของทริปนี้**
 * (ไม่ใช่ *"ไม่มีในไฟล์เดิม"* ซึ่งเป็นเรื่องปกติของทริปแพลตฟอร์มและ `buildUuidToDayKey` รองรับแล้ว)
 * · ⚠️ คอมเมนต์เดิมที่จุดเรียกเขียนว่า *"ไม่มีในไฟล์เดิม → ข้าม"* — **หมดอายุตั้งแต่ `Day.id` เป็น `uuid` ได้**
 */
export function mapStopRows<T extends StopRowLike>(
  rows: readonly T[],
  uuidToDay: ReadonlyMap<string, string>,
  planId: string
): (T & { plan_id: string; day_id: string })[] {
  const out: (T & { plan_id: string; day_id: string })[] = [];
  for (const r of rows) {
    const dayId = uuidToDay.get(r.trip_day_id);
    if (!dayId) continue;
    out.push({ ...r, plan_id: planId, day_id: dayId });
  }
  return out;
}
