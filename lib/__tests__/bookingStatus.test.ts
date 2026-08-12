import { describe, expect, it } from "vitest";
import { bookingBadge, bookingCounts, sortBookingsByUrgency } from "@/lib/bookingStatus";
import type { TripBooking } from "@/lib/supabase";

/** ตั๋วโครงเปล่า — เทสต์แต่ละอันเขียนทับเฉพาะช่องที่เกี่ยวกับสถานะ */
function booking(patch: Partial<TripBooking>): TripBooking {
  return {
    id: "b1",
    category: "ticket",
    title: "ตั๋วทดสอบ",
    day_id: null,
    date: null,
    time: null,
    confirmation_number: null,
    link: null,
    note: null,
    added_by: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    file_url: null,
    file_name: null,
    status: "pending",
    book_by_days_before: null,
    ...patch,
  };
}

const TODAY = new Date("2026-08-12T00:00:00Z");

describe("bookingBadge", () => {
  it("ทุกใบต้องมีป้ายเสมอ — จองแล้วกับซื้อหน้างานต้องแยกออกจากกัน", () => {
    // ของเดิมโชว์ป้ายเฉพาะใบที่มีเดดไลน์ ทำให้สองสถานะนี้หน้าตาเหมือนกันเป๊ะบนการ์ด
    expect(bookingBadge(booking({ status: "booked" }), TODAY).tone).toBe("done");
    expect(bookingBadge(booking({ status: "walk_up" }), TODAY).tone).toBe("walkup");
  });

  it("ยังต้องจองแต่ไม่ได้ระบุว่าต้องจองล่วงหน้ากี่วัน = ยังไม่กำหนดวันจอง", () => {
    const badge = bookingBadge(booking({ status: "pending", date: "2026-10-19" }), TODAY);
    expect(badge.tone).toBe("someday");
  });

  it("แยกรีบจอง (เหลือ ≤ 7 วัน) ออกจากรอจอง", () => {
    // ใช้ตั๋ว 21 ต.ค. ของจริงที่ต้องจองล่วงหน้า 7 วัน → เดดไลน์ 14 ต.ค. = อีก 63 วัน
    const far = booking({ status: "pending", date: "2026-10-21", book_by_days_before: 7 });
    expect(bookingBadge(far, TODAY).tone).toBe("soon");

    // ขยับวันนี้มาใกล้เดดไลน์: 10 ต.ค. → เหลือ 4 วัน
    expect(bookingBadge(far, new Date("2026-10-10T00:00:00Z")).tone).toBe("urgent");
  });

  it("เลยกำหนดจองแล้วต้องขึ้นสีแดงพร้อมจำนวนวันที่เลยมา", () => {
    const late = booking({ status: "pending", date: "2026-10-21", book_by_days_before: 7 });
    const badge = bookingBadge(late, new Date("2026-10-17T00:00:00Z"));
    expect(badge.tone).toBe("overdue");
    expect(badge.label).toContain("3 วัน");
  });
});

describe("bookingCounts", () => {
  it("นับ 3 กองแยกกัน ไม่รวมซื้อหน้างานเข้ากับจองแล้ว", () => {
    const counts = bookingCounts([
      booking({ id: "a", status: "pending" }),
      booking({ id: "b", status: "pending" }),
      booking({ id: "c", status: "booked" }),
      booking({ id: "d", status: "walk_up" }),
    ]);
    expect(counts).toEqual({ toBook: 2, booked: 1, walkUp: 1 });
  });
});

describe("sortBookingsByUrgency", () => {
  it("ของที่ใกล้เดดไลน์ลอยขึ้นบนสุด แม้วันเดินทางจะอยู่ท้ายสุด", () => {
    // เคสจริง: KTX 17 ต.ค. ต้องจองล่วงหน้า 30 วัน (เดดไลน์ 17 ก.ย.) เร่งด่วนกว่า Sky Capsule
    // 14 ต.ค. ที่จองล่วงหน้า 14 วัน (เดดไลน์ 30 ก.ย.) ทั้งที่ใช้ตั๋วทีหลัง
    const sorted = sortBookingsByUrgency(
      [
        booking({ id: "walkup", status: "walk_up", date: "2026-10-16" }),
        booking({ id: "sky", status: "pending", date: "2026-10-14", book_by_days_before: 14 }),
        booking({ id: "ktx", status: "pending", date: "2026-10-17", book_by_days_before: 30 }),
      ],
      new Date("2026-09-25T00:00:00Z")
    );
    expect(sorted.map((b) => b.id)).toEqual(["ktx", "sky", "walkup"]);
  });

  it("สีเดียวกันทั้งกอง ให้เรียงตามวันครบกำหนดจอง ไม่ใช่วันเดินทาง", () => {
    // ของจริงตอนนี้: ตั๋ว 4 ใบอยู่สีเหลืองหมด · KTX ใช้ 17 ต.ค. แต่ต้องจอง 30 วันล่วงหน้า
    // (เดดไลน์ 17 ก.ย.) = ต้องลงมือก่อน Sky Capsule 14 ต.ค. ที่จองล่วงหน้าแค่ 14 วัน (30 ก.ย.)
    const sorted = sortBookingsByUrgency(
      [
        booking({ id: "sky", status: "pending", date: "2026-10-14", book_by_days_before: 14 }),
        booking({ id: "arex", status: "pending", date: "2026-10-21", book_by_days_before: 7 }),
        booking({ id: "ktx", status: "pending", date: "2026-10-17", book_by_days_before: 30 }),
      ],
      TODAY
    );
    expect(sorted.map((b) => b.id)).toEqual(["ktx", "sky", "arex"]);
  });
});
