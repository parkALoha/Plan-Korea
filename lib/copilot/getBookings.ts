/**
 * `get_bookings` — tool อ่านตัวแรกของ Copilot · `E8-AC4`
 * เจ้าของ: P5-AI/Agent · 28 ส.ค. 2026
 * สเปก: `docs/engine/copilot-spec.md §2.2` · allowlist: `§35` · เคส: `copilot-evals` `EV-C4` · `#7b`
 *
 * ## 🔴 ทำไม wrapper ตัวนี้ *ต้อง* ตัดฟิลด์ทิ้ง ไม่ใช่ส่งต่อสิ่งที่ DAL คืนมา
 * `bookingsOfTrip()` เลือก **16 คอลัมน์** — ถูกต้องแล้วสำหรับผู้เรียกคนอื่น (หน้าจอต้องใช้ไฟล์ตั๋ว)
 * · Copilot ได้ **6** · ที่ตัดออกรวม `confirmation_number` · `file_path` · `file_name` · `link` · `note`
 * 🎯 **ไม่ใช่เพราะเป็นราคา (`E8-AC2`) — เพราะไม่มีเคสไหนใน `§4` ต้องใช้มัน**
 * **เลขที่จองกับไฟล์ตั๋วเข้าไปอยู่ในบริบทโมเดลแล้วเอาออกไม่ได้**
 *
 * ## 🔴 `E8-AC4` — ไม่มีสิทธิ์พิเศษ
 * รับ `Db` จากผู้เรียก **ซึ่งเป็น client ของผู้ใช้คนนั้น** · ไม่สร้าง client เอง ไม่แตะ service role
 * → RLS ตัดสินทุกแถวเหมือนตอนผู้ใช้เปิดหน้าจอเอง
 */
import { bookingsOfTrip, type Db } from "@/lib/engine/db";

/** 6 ฟิลด์ตาม `copilot-spec §35` — ชื่อเป็น camelCase เพราะเป็นสัญญากับโมเดล ไม่ใช่ชื่อคอลัมน์ */
export type CopilotBooking = {
  title: string;
  category: string;
  status: string;
  date: string | null;
  time: string | null;
  bookByDaysBefore: number | null;
};

export type GetBookingsResult =
  | { ok: true; bookings: CopilotBooking[] }
  | { ok: false; reason: "read_failed" };

/**
 * `dayId` กรองในโค้ด ไม่ใช่ใน DAL — **จงใจ**
 * `bookingsOfTrip()` เป็นของกลางที่ผู้เรียกหลายคนใช้ · การเติมพารามิเตอร์ให้มันเพื่อผู้เรียกคนเดียว
 * คือการแก้ DAL เพื่อโซนผม ซึ่ง P1 ขอไว้ว่าอย่าทำ · จำนวนการจองต่อทริปอยู่ระดับสิบแถว
 */
export async function getBookings(
  db: Db,
  opts: { tripId: string; dayId?: string },
): Promise<GetBookingsResult> {
  const { data, error } = await bookingsOfTrip(db, opts.tripId);

  // 🔴 **ต้องแยก "ล้ม" ออกจาก "ว่าง"** — ถ้าคืน `[]` ตอน error โมเดลจะพูดว่า
  //    "ยังไม่มีการจองเลย" ให้คนที่จองไว้ 10 รายการ · RLS ปฏิเสธการอ่านด้วยการคืน
  //    array ว่างไม่ใช่ error อยู่แล้ว (`rlsMatrix` กับดักข้อ 2) — ตรงนั้นแยกไม่ได้
  //    แต่ error ที่ *มี* อยู่ตรงนี้ ห้ามกลืน
  if (error) return { ok: false, reason: "read_failed" };

  const rows = (data ?? []).filter((r) => opts.dayId == null || r.trip_day_id === opts.dayId);

  return {
    ok: true,
    bookings: rows.map((r) => ({
      title: r.title,
      category: r.category,
      status: r.status,
      date: r.date,
      time: r.time,
      bookByDaysBefore: r.book_by_days_before,
    })),
  };
}
