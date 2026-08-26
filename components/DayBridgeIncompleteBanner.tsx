"use client";

import { useDayBridgeIncomplete } from "@/lib/engine/dayBridgeIncomplete";

/**
 * แถบ "ทริปนี้ยังแสดงข้อมูลบางส่วนไม่ได้" — `E4-AC1` (P1, 27 ส.ค. 2026)
 *
 * 🔴 **ทำไมเป็นแถบ ไม่ใช่ toast** — สำหรับทริปที่เกิดบนแพลตฟอร์ม (ยังไม่มีคู่ใน `data/itinerary.ts`)
 * เงื่อนไขนี้จะเป็นจริง**ทุกครั้งที่เปิดหน้า** จนกว่า `E5` จะให้ทริปพวกนี้อ่าน `trip_days` จากฐานตรง ๆ
 * toast ที่ดังทุก mount คือ toast ที่ผู้ใช้ปิดตาไปในสัปดาห์เดียว (P1 ชี้) — ใช้แถบเงียบ ๆ แบบเดียวกับ
 * `SystemModeBanner`/`OfflineBanner` แทน อยู่ตราบใดที่ยังไม่มีสะพาน ไม่ใช่ป๊อปอัปที่เด้งซ้ำ
 *
 * ข้อความบอกว่า **"ยังไม่รองรับ" ไม่ใช่ "พัง"** — เหตุผลเดียวกับ `SystemModeBanner` (P6 ขอ): คำถามแรก
 * ที่คนจะโดนถ้าไม่บอกคือ "มันพังหรือตั้งใจ"
 */
export function DayBridgeIncompleteBanner() {
  const incomplete = useDayBridgeIncomplete();
  if (!incomplete) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-panel-gold px-4 py-1.5 text-center text-xs font-medium text-panel-gold-ink print:hidden"
    >
      🚧 ทริปนี้ยังแสดงจุดแวะ/ตารางบางส่วนไม่ได้ — ยังไม่รองรับทริปที่สร้างบนแพลตฟอร์มเต็มรูปแบบ (อยู่ระหว่างแก้)
    </div>
  );
}
