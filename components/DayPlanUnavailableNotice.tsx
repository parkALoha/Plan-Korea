"use client";

/**
 * แทนที่**เฉพาะโครงวันที่มาจาก `ITINERARY`** (dates/cities/weather + `useStops`/`useDaySettings`/
 * `useOvernightOverrides`) เมื่อ `useTripDaysGate` ยืนยันว่าทริปนี้ `trip_days` ว่างเปล่า
 *
 * 🔴 **ไม่ใช่ full-page fallback อีกต่อไป** (เคยเป็นแบบนั้นใน `08c591c` — ย้ายออกจาก `TripDataProvider`
 * แล้วเพราะที่พัก/booking/สถานที่ที่เพิ่มเองไม่ได้พึ่ง `trip_days` เลย บล็อกทั้งหน้าจึงกินของถูกไปด้วย)
 * (P1/P3, 27 ส.ค. 2026) ตอนนี้ผู้ใช้ยังเห็นที่พัก/booking ของตัวเองตามปกติ เห็นแค่ส่วนแผนรายวันที่บอกตรง ๆ
 * ว่ายังแสดงไม่ได้ — หน้าจอที่จริงบางส่วน ดีกว่าหน้าจอว่างทั้งหน้า และดีกว่าของเดิม (เต็มหน้าแต่เป็นทริปอื่น)
 *
 * 🔴 **ข้อความต้องไม่อ่านเหมือนบั๊ก** (P1) — ผู้ใช้ที่เพิ่งสร้างทริปเองไม่ได้ทำอะไรผิด
 */
export function DayPlanUnavailableNotice() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface-soft p-6 text-center">
      <p className="text-content">แผนรายวันของทริปนี้ยังแสดงไม่ได้ — ระบบกำลังรองรับทริปหลายใบอยู่</p>
      <p className="text-sm text-content-soft">ที่พัก/ตั๋วของคุณยังอยู่ครบตามปกติ</p>
    </div>
  );
}
