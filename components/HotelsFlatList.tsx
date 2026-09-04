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
 * 🔴 **อ่านอย่างเดียว — และนี่คือ *ข้อจำกัดของรูปสำรองใบนี้* ไม่ใช่สภาพของทริปแพลตฟอร์ม**
 * ตัวมันเองมีแต่แถว `trip_hotels` ล้วน **ไม่มี leg** จึงเปิด `HotelEditModal` ไม่ได้ (โมดัลรับ `HotelLeg`)
 *
 * ⚠️ **ย่อหน้าเดิมตรงนี้เขียนว่า *"ทริปแพลตฟอร์มยังไม่มีทางป้อนที่พักใหม่ได้เลย"* — เป็นเท็จไปแล้ว**
 * (P1 ยกมาเป็นใบสั่งงาน · P2 ยิงยืนยันในเบราว์เซอร์ 4 ก.ย. 2026 แล้วพบว่ามันไม่จริง)
 * `B6` ทำให้ `usePlatformItinerary` ป้อนวันจากฐานเข้า `deriveHotelLegs` ⇒ **ทริปแพลตฟอร์มมี leg จริงแล้ว**
 * → `dayPlanReady` เป็นจริง → หน้าแผนเรนเดอร์ `HotelLegsPanel` (มีปุ่มเพิ่ม/แก้/ลบครบ) **ไม่ใช่ไฟล์นี้**
 * · วัดจริง: ทริปญี่ปุ่น `647ed2c2…` กด leg → กรอก → บันทึก → แถวลงฐานพร้อม `city: "tokyo"`
 *   ที่มาจาก *วันในฐาน* ไม่ใช่ `ITINERARY` · แก้และลบได้ครบ
 *
 * 🎯 **ที่ผิดไม่ใช่ข้อเท็จจริงในย่อหน้าเดิม (ตอนเขียนมันจริง) — ที่ผิดคือมันเป็น *คำบรรยายสภาพของไฟล์อื่น***
 * คนที่ทำให้มันเป็นเท็จคือคนที่ทำ `B6` ซึ่ง **ไม่มีเหตุให้เปิดไฟล์นี้เลย** ⇒ ไม่มีเส้นทางไหนที่มันจะถูกอัปเดต
 * · ฉบับนี้จึงเขียนเป็น *ข้อจำกัดของโค้ดในไฟล์นี้* (ไม่มี leg ⇒ เปิดโมดัลไม่ได้) ซึ่งตายพร้อมโค้ดที่มันพูดถึง
 *
 * 🔴 **แก้ 27 ส.ค. 2026 (P1/P2) — เดิม `return null` ตอนไม่มีที่พัก ไม่ตรงกับรูปแบบที่เหลือของแอป**
 * `BookingsPanel`/`HotelLegsPanel` (ที่ใช้ตอน `dayPlanReady`) โชว์หัวข้อ + ข้อความ empty-state เสมอ ไม่เคย
 * ซ่อน section ทั้งก้อนเพราะไม่มีข้อมูล — `return null` เดิมทำให้ทริปที่ยังไม่มีที่พักจริงไม่เห็นแม้แต่หัวข้อ
 * "🏨 ที่พักของทริป" เลย ต่างจากทริปเดียวกันตอนอยู่ที่ `HotelLegsPanel` (โชว์หัวข้อ + "ยังไม่ได้ตั้ง" เสมอ)
 */
export function HotelsFlatList({ hotels }: { hotels: Record<string, TripHotel> }) {
  const rows = Object.values(hotels).sort((a, b) => a.check_in.localeCompare(b.check_in));

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
        🏨 ที่พักของทริป
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-content-soft">ยังไม่มีที่พักบันทึกไว้</p>
      ) : (
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
      )}
    </section>
  );
}
