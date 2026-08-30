import type { EventDto } from "@/app/api/engine/trips/[tripId]/stops/route";
import type { DayEvent, DayEventKind } from "@/data/itinerary";

/**
 * 🔴 **แยกแถว `kind='event'` ออกจากจุดแวะ แล้วแบ่งเป็น ก่อน/หลัง ตามกฎเดิมของเว็บทริป**
 * เจ้าของ: P3-FE/Perf · 30 ส.ค. 2026 · กฎต้นฉบับอยู่ที่ `hooks/useDaySchedule.ts` บน `main`
 *
 * ## ทำไมต้องมีไฟล์นี้ — ของที่หายไปตอนย้ายคือ *กฎการรวม* ไม่ใช่ *ข้อมูล*
 * โครงเดิมเป็น **สองอาเรย์**: `day.events[]` กับ `stops[]` → ตัวเรนเดอร์รวมเองได้เป็นสามส่วน
 * (events ก่อน → จุดแวะ → events หลัง) · `E7` ยุบทั้งสองเข้า `trip_stops` ใบเดียว
 * ซึ่ง **บังคับให้มีลำดับเดียว** และกฎที่เคยอยู่ในโค้ดไม่ได้ถูกย้ายมาด้วย
 * → อาการ: event ทั้ง 8 ใบของวันแรกไปกองท้ายวัน รวมถึงใบที่ควรอยู่ *ต้นวัน* ("เช็คเอาต์ออกจากโรงแรม")
 * 📌 รูปเดียวกับที่ `TEAM.md §3.4` เตือน — **สภาพแวดล้อมเดิมรับประกันอะไรให้ฟรี** (ที่นี่คือ "สองอาเรย์
 *    แปลว่าสองกลุ่ม") · พอเป็นตารางเดียว ลำดับต้องถูกทำให้เป็นจริง และไม่มีใครเขียนกฎนั้นลงไป
 *
 * ## กฎ — สามข้อ และข้อ ②③ คือที่ที่เขียนผิดแล้วยังดูถูก
 * ① **แบ่งด้วย *ลำดับ* ไม่ใช่ *เวลา*** — `fixed_start_time` ไม่เกี่ยวกับการแบ่งเลย
 *    ใช้ลำดับของแถว (`rank` → `order_index` ที่ API แจกให้) เป็น `idx` เดิม
 * ② **`before` เป็นตัว *คั่น* ไม่ใช่ *ป้ายกำกับ*** — ใบที่ `schedule_bound = null` **ก่อนหน้า** anchor
 *    ก็อยู่ฝั่ง before ด้วย · อ่านทีละแถวแล้วตัดสินจะได้ผลผิดโดยที่โค้ดดูสมเหตุสมผล
 * ③ **ไม่มี anchor `before` เลย → event *ทั้งหมด* ไปอยู่ก่อนจุดแวะ · `after` ว่าง**
 *    — **ตรงข้ามกับพฤติกรรมวันนี้เป๊ะ** (วันนี้ทุกใบไปต่อท้าย) → วันที่ไม่มี anchor จะเปลี่ยนที่ยกชุด
 *
 * ⚠️ `schedule_bound = 'after'` **ไม่ได้ถูกใช้แบ่ง** — กฎเดิมมองหาแต่ `before` · ตัว `after` เป็น
 *    ข้อมูลของ `anchor` ที่ `useDaySchedule` ใช้คำนวณเดดไลน์ ไม่ใช่ตัวคั่นกลุ่ม
 */
export type EventStopRow = {
  id: string;
  order_index: number;
  note?: string | null;
  place_id?: string;
  event?: EventDto;
};

/** แถวที่มีก้อน `event` = แถว event · **ทดสอบด้วยการมีอยู่ของก้อน ไม่ใช่เทียบสตริง `kind`**
 *  (ฐานบังคับด้วย `trip_stops_event_columns_only_on_events` แล้วว่าสองอย่างนี้ตรงกันเสมอ) */
function isEventRow<T extends EventStopRow>(r: T): boolean {
  return r.event != null;
}

export function toDayEvent(row: EventStopRow): DayEvent {
  const e = row.event!;
  return {
    time: e.fixed_start_time,
    endTime: e.fixed_end_time ?? undefined,
    icon: e.icon,
    title: e.title,
    titleEn: e.title_en ?? undefined,
    detail: row.note ?? undefined,
    alert: e.is_alert || undefined,
    editable: e.time_is_flexible || undefined,
    dayOffset: e.day_offset || undefined,
    anchor: e.schedule_bound === "before" || e.schedule_bound === "after" ? e.schedule_bound : undefined,
    kind: (e.event_kind ?? undefined) as DayEventKind | undefined,
    placeId: e.place_ref === "hotel" ? "@hotel" : row.place_id || undefined,
    flight:
      e.flight_no && e.flight_from_code && e.flight_to_code
        ? {
            no: e.flight_no,
            fromCode: e.flight_from_code,
            toCode: e.flight_to_code,
            fromEn: e.flight_from_en ?? "",
            toEn: e.flight_to_en ?? "",
          }
        : undefined,
    layover:
      e.layover_baggage && e.layover_immigration
        ? {
            baggage: e.layover_baggage as "through-checked" | "reclaim",
            immigration: e.layover_immigration as "none" | "required-to-exit",
            leavesAirport: e.layover_leaves_airport ?? false,
            terminalChange: e.layover_terminal_change ?? false,
          }
        : undefined,
  };
}

/**
 * @param rows แถวของ **วันเดียว** เรียงตามลำดับจริงแล้ว (`order_index`)
 * @returns `stops` = แถวที่ไม่ใช่ event (ไว้ให้ตารางเวลา/ลิสต์จุดแวะ) · `before`/`after` ตามกฎข้างบน
 */
export function splitDayEvents<T extends EventStopRow>(
  rows: readonly T[]
): { stops: T[]; before: DayEvent[]; after: DayEvent[] } {
  const eventRows = rows.filter(isEventRow);
  const stops = rows.filter((r) => !isEventRow(r));
  // ② `findIndex` = ตำแหน่งของตัวคั่น · ทุกใบก่อนหน้ามันอยู่ฝั่ง before ไม่ว่า `schedule_bound` จะเป็นอะไร
  const cut = eventRows.findIndex((r) => r.event?.schedule_bound === "before");
  // ③ ไม่มีตัวคั่น → ทั้งหมดไปก่อนจุดแวะ (ไม่ใช่ต่อท้าย)
  const before = cut >= 0 ? eventRows.slice(0, cut + 1) : eventRows;
  const after = cut >= 0 ? eventRows.slice(cut + 1) : [];
  return { stops, before: before.map(toDayEvent), after: after.map(toDayEvent) };
}
