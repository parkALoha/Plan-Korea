"use client";

import type { TripHotel } from "@/lib/supabase";

function dateRangeLabel(hotel: TripHotel) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  return hotel.check_in === hotel.check_out
    ? fmt(hotel.check_in)
    : `${fmt(hotel.check_in)} - ${fmt(hotel.check_out)}`;
}

/**
 * รูปสำรองของ `HotelLegsPanel` สำหรับทริปที่ `dayPlanGate !== "ready"` (P1/P3, 27 ส.ค. 2026 — ดู §22/§23)
 *
 * 🔴 **`HotelLegsPanel` ผูกกับ "leg" ที่คำนวณจาก `ITINERARY` ทั้งตัว** — ทั้งแสดงผล (`leg.startDate`/
 * `leg.city` จากไฟล์เดิม) และแก้ไข (`HotelEditModal` ต้องมี `legId`/`city`/ช่วงวันจาก leg ถึงจะเปิดได้)
 * ทริปแพลตฟอร์มไม่มี leg ที่ถูกต้องให้ใช้เลย — แต่ `hotels` (แถวจริงจากฐาน คีย์ด้วย `check_in`/`check_out`
 * ของตัวเอง ไม่ใช่ leg) **ถูกต้องอยู่แล้วเสมอ ไม่ว่าทริปไหน** (ยืนยันแล้ว: `useHotels`/`useHotelsStore`
 * ไม่อ้าง `trip_days`/`ITINERARY` เลยสักบรรทัด)
 *
 * 🎯 **หลักการ (P1): ซ่อนเฉพาะส่วนที่คำนวณจากแหล่งที่ผิด (leg) ไม่ซ่อนข้อมูลที่ถูก (ที่พักเอง)** — จึงแสดง
 * รายการที่พักตรง ๆ ด้วยวันที่ของตัวเอง แทนการจัดกลุ่มเป็น leg รายวันแบบ `HotelLegsPanel`
 *
 * 🔴 **อ่านอย่างเดียว — ยังไม่มีปุ่มเพิ่ม/แก้** เพราะการเพิ่มที่พักใหม่ผ่าน UI เดิมต้องมี leg เสมอ
 * (ระบุ city/ช่วงวันจาก `ITINERARY`) ทริปแพลตฟอร์มยังไม่มีทางป้อนที่พักใหม่แบบไม่ผูก leg ได้เลย — เป็นงาน
 * แยกที่ยังไม่ได้ตัดสินใจ (ไม่ใช่ขอบเขตของ gate นี้) วันนี้ยังไม่มีทริปแพลตฟอร์มใบไหนมีที่พักจริงสักที
 * (P1 ยืนยัน) รายการนี้จึงยังว่างเปล่าเสมอในทางปฏิบัติ — เตรียมไว้ก่อนที่จะมีของจริง ไม่ใช่ตอนมีคนรายงาน
 */
export function HotelsFlatList({ hotels }: { hotels: Record<string, TripHotel> }) {
  const rows = Object.values(hotels).sort((a, b) => a.check_in.localeCompare(b.check_in));
  if (rows.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
        🏨 ที่พักของทริป
      </h2>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface-raised">
        {rows.map((hotel) => (
          <div key={`${hotel.check_in}_${hotel.check_out}`} className="px-3 py-2.5 text-sm">
            <div className="text-xs text-content-soft">
              {hotel.city} · {dateRangeLabel(hotel)}
            </div>
            <div className="font-medium text-content">{hotel.hotel_name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
