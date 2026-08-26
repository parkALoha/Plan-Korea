"use client";

import { useSystemMode } from "@/hooks/useSystemMode";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * แถบ "ระบบปิดรับการแก้ไขชั่วคราว" — `E3-AC7` ③④
 *
 * อ่านตอน mount (`useSystemMode`) เหมือน `OfflineBanner` ทุกอย่าง — อยู่บนสุดของทุกหน้ารวม `/login`
 * เพื่อให้คนที่ปิดแอปไปแล้วกลับมาระหว่าง cutover เห็น**ก่อนเริ่มพิมพ์** ไม่ใช่หลังพิมพ์โน้ตยาวๆ แล้ว
 * กดบันทึกไม่ได้ (P7 ย้ำ, P1 เห็นด้วย)
 *
 * 🔴 **`state === "unknown"` ต้องไม่เงียบเหมือนปกติ** — แต่ก็ต้องไม่ซ้ำกับ `OfflineBanner` เวลาสาเหตุ
 * เดียวกัน: ถ้าออฟไลน์อยู่แล้ว `OfflineBanner` อธิบายเหตุผลที่ตรงกว่า (เน็ตหลุด) — ไม่ต้องซ้อนอีกข้อความ
 * ว่า "ตรวจสอบสถานะไม่ได้" ทับกัน จึงซ่อนแถบนี้ตอนออฟไลน์
 *
 * ข้อความต้องบอกว่า **"ตั้งใจ" ไม่ใช่ "พัง"** (P6 ขอ) — คำถามแรกที่คนจะโดนถ้าไม่บอกคือ "มันพังหรือตั้งใจ"
 */
export function SystemModeBanner() {
  const { mode } = useSystemMode();
  const online = useOnlineStatus();

  if (mode.state === "loading") return null;
  if (!online) return null; // OfflineBanner ครอบเหตุผลนี้อยู่แล้ว ไม่ซ้อนข้อความ

  if (mode.state === "unknown") {
    return (
      <div
        role="status"
        className="sticky top-0 z-50 bg-panel-gold px-4 py-1.5 text-center text-xs font-medium text-panel-gold-ink print:hidden"
      >
        ⚠️ ตรวจสอบสถานะระบบไม่ได้ตอนนี้ — การบันทึกอาจไม่สำเร็จ ลองรีเฟรชอีกครั้ง
      </div>
    );
  }

  if (!mode.readOnly) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-maple-dark px-4 py-1.5 text-center text-xs font-medium text-cream print:hidden"
    >
      🔧 ระบบปิดรับการแก้ไขชั่วคราว (ตั้งใจ ไม่ใช่ระบบพัง){mode.reason ? ` — ${mode.reason}` : ""}
    </div>
  );
}
