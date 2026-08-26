"use client";

/**
 * แทนที่เนื้อหาจริงเมื่อ `useTripDaysGate` ยืนยันว่า `trip_days` ว่างเปล่า — คู่กับ `TripStatusFallback.tsx`
 * (โทนเดียวกันตั้งใจ: เคยเป็นจอที่บอกว่า "ยังไม่มีทริป" ตอนนี้คือ "มีทริปแต่เปิดดูไม่ได้เต็มรูปแบบ")
 *
 * 🔴 **ข้อความต้องไม่อ่านเหมือนบั๊ก** (P1) — ผู้ใช้ที่เพิ่งสร้างทริปเองไม่ได้ทำอะไรผิด
 */
export function TripDaysEmptyNotice() {
  return (
    <div className="flex min-h-full items-center justify-center p-8 text-center">
      <p className="text-content">ทริปนี้ยังเปิดดูไม่ได้ ระบบกำลังรองรับทริปหลายใบอยู่</p>
    </div>
  );
}
