"use client";

import { useState } from "react";
import { useCacheFull } from "@/hooks/useCacheFull";

/**
 * แถบ "ที่เก็บในเครื่องเต็ม" — `E6-AC7` ครึ่งฝั่งผู้ใช้
 * เจ้าของ: P2-UI/UX · 3 ก.ย. 2026
 *
 * ## 🔴 เกณฑ์ของ `AC7` คือ *ผู้ใช้จริงรู้* ไม่ใช่ *มี log*
 * `noteCacheFailure` + `console.error` ครอบเฉพาะฝั่งนักพัฒนา · ผู้ใช้ที่เปิดออฟไลน์แล้วข้อมูล
 * ไม่ครบ **ไม่มีทางรู้เลยว่าเพราะที่เก็บเต็ม** — และมันไม่หายเอง (`D17` · เพดาน ~5 MB)
 *
 * ## ทำไมข้อความพูดถึง *ผลกับผู้ใช้* ไม่ใช่ *ชื่อความผิดพลาด*
 * "เขียน localStorage ไม่สำเร็จ" ไม่บอกอะไรกับคนที่กำลังจะขึ้นเครื่อง ·
 * สิ่งที่เขาต้องตัดสินใจคือ **"ของที่ฉันเพิ่งเปิดดู จะยังอยู่ไหมตอนไม่มีเน็ต"** → คำตอบคือไม่
 *
 * ## ⚠️ ปิดได้ และตั้งใจให้ปิดได้
 * มันค้างทั้งเซสชัน (`hasCacheEverBeenFull` ไม่รีเซ็ตเอง) · แถบที่ปิดไม่ได้และไม่หายเอง
 * จะกลายเป็นสิ่งที่คนเรียนรู้ที่จะมองข้าม **แล้วครั้งต่อไปที่มันสำคัญจริงก็จะถูกมองข้ามด้วย**
 * · ปิดแล้วกลับมาใหม่เมื่อรีโหลด — ซึ่งถูกต้อง เพราะถ้าที่เก็บยังเต็ม การเขียนครั้งถัดไปก็ล้มอีก
 *
 * 📌 **ไม่ซ่อนตอนออฟไลน์** ต่างจาก `SystemModeBanner` — `OfflineBanner` บอกว่า *ที่เห็นคือของเก่า* ·
 * อันนี้บอกว่า *ของใหม่จะไม่ถูกเก็บไว้เลย* · คนละเรื่อง และเรื่องที่สองแย่กว่า
 */
export function CacheFullBanner() {
  const full = useCacheFull();
  const [dismissed, setDismissed] = useState(false);
  if (!full || dismissed) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-maple-dark px-4 py-1.5 text-center text-xs font-medium text-cream print:hidden"
    >
      <span>⚠️ ที่เก็บในเครื่องเต็ม — ข้อมูลใหม่จะไม่ถูกเก็บไว้ให้ใช้ตอนไม่มีเน็ต</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="ปิดข้อความนี้"
        className="shrink-0 rounded px-1.5 py-0.5 text-cream/80 hover:bg-white/15 hover:text-cream"
      >
        ✕
      </button>
    </div>
  );
}
