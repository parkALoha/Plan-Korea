import type { TripBooking } from "./supabase";
import { bookByDate, daysUntil } from "./bookingDeadline";

/**
 * ป้ายสถานะของตั๋ว/booking หนึ่งใบ (เฟส 25)
 *
 * แยกออกมาเป็นไฟล์ของตัวเองเพราะ "สถานะที่เห็นบนการ์ด" ไม่เท่ากับคอลัมน์ `status` ใน DB:
 * DB เก็บแค่ 3 ค่าที่คนเป็นคนตัดสิน (จองแล้ว / ยังต้องจอง / ซื้อหน้างาน) ส่วนความเร่งด่วน
 * (รีบจอง / เลยกำหนด) **คำนวณสดจากวันที่ทุกครั้งที่ render** เพราะมันเปลี่ยนเองทุกวันโดยไม่มีใครไปแก้
 * ถ้าเก็บลง DB จะกลายเป็นข้อมูลเน่าที่ต้องมีคนคอยไล่อัปเดต
 */
export type BookingBadgeTone = "done" | "overdue" | "urgent" | "soon" | "someday" | "walkup";

export type BookingBadge = {
  tone: BookingBadgeTone;
  label: string;
  /** ใช้เรียงการ์ด — เลขน้อย = ต้องเห็นก่อน */
  rank: number;
};

/** เหลือกี่วันถึงวันครบกำหนดจอง ถึงจะเรียกว่า "รีบจอง" — ต่ำกว่านี้ป้ายเปลี่ยนเป็นสีส้ม */
const URGENT_DAYS = 7;

export const BOOKING_BADGE_CLASS: Record<BookingBadgeTone, string> = {
  done: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  overdue: "bg-red-50 text-red-700 ring-red-600/20",
  urgent: "bg-orange-50 text-orange-700 ring-orange-600/20",
  soon: "bg-amber-50 text-amber-800 ring-amber-600/20",
  someday: "bg-cream-soft text-ink-soft ring-ink/10",
  walkup: "bg-sky-50 text-sky-700 ring-sky-600/20",
};

/** ป้ายสถานะของตั๋วหนึ่งใบ — คืนค่าเสมอ ไม่มี null เพราะทุกใบต้องอ่านออกว่าอยู่สถานะไหน
 *  (ของเดิมโชว์เฉพาะใบที่มีเดดไลน์ ทำให้ "จองแล้ว" กับ "ซื้อหน้างาน" หน้าตาเหมือนกันเป๊ะ) */
export function bookingBadge(booking: TripBooking, today: Date = new Date()): BookingBadge {
  if (booking.status === "booked") return { tone: "done", label: "✅ จองแล้ว", rank: 4 };
  if (booking.status === "walk_up")
    return { tone: "walkup", label: "🎟️ ซื้อหน้างาน · ไม่ต้องจอง", rank: 5 };

  const deadline = bookByDate(booking.date, booking.book_by_days_before);
  if (!deadline) return { tone: "someday", label: "⚪ ยังไม่กำหนดวันจอง", rank: 3 };

  const daysLeft = daysUntil(deadline, today);
  if (daysLeft < 0)
    return { tone: "overdue", label: `🔴 เลยกำหนดจอง ${Math.abs(daysLeft)} วัน`, rank: 0 };
  if (daysLeft === 0) return { tone: "overdue", label: "🔴 ต้องจองวันนี้", rank: 0 };
  if (daysLeft <= URGENT_DAYS)
    return { tone: "urgent", label: `🟠 รีบจอง · เหลือ ${daysLeft} วัน`, rank: 1 };
  return { tone: "soon", label: `🟡 จองภายใน ${daysLeft} วัน`, rank: 2 };
}

/** ยอดรวมบนหัวแผง — แยก "ต้องจอง" ออกจาก "ซื้อหน้างาน" ให้ชัด
 *  ของเดิมนับ pending อย่างเดียวแล้วเรียกว่า "รอจอง N" ซึ่งไม่บอกว่าที่เหลือคืออะไร */
export function bookingCounts(bookings: TripBooking[]) {
  return {
    toBook: bookings.filter((b) => b.status === "pending").length,
    booked: bookings.filter((b) => b.status === "booked").length,
    walkUp: bookings.filter((b) => b.status === "walk_up").length,
  };
}

/** เรียงตามความเร่งด่วนก่อน แล้วค่อยตาม **วันครบกำหนดจอง** (ไม่ใช่วันเดินทาง)
 *
 *  จุดสำคัญคือ tie-break: ของจริงในทริปนี้มีตั๋ว 4 ใบที่อยู่สีเหลืองเหมือนกันหมด ถ้า tie-break
 *  ด้วยวันเดินทาง KTX 17 ต.ค. (ต้องจองล่วงหน้า 30 วัน = เดดไลน์ 17 ก.ย. เร็วที่สุดในทริป)
 *  จะไปโผล่เป็นใบที่ 3 ทั้งที่ต้องลงมือก่อนใครเพื่อน — ซึ่งคือปัญหาเดิมที่ตั้งใจแก้พอดี */
export function sortBookingsByUrgency(bookings: TripBooking[], today: Date = new Date()) {
  const sortKey = (b: TripBooking) =>
    bookByDate(b.date, b.book_by_days_before) ?? b.date ?? "9999-12-31";
  return [...bookings].sort((a, b) => {
    const rankDiff = bookingBadge(a, today).rank - bookingBadge(b, today).rank;
    if (rankDiff !== 0) return rankDiff;
    return sortKey(a).localeCompare(sortKey(b));
  });
}
