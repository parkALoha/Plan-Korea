"use client";

import { useState, type ReactNode } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const STORAGE_KEY = "trip-prep-open";

/**
 * ยุบ "ที่พัก + ตั๋ว/booking + ของที่ต้องเตรียม" เป็นบล็อกเดียวที่ปิดไว้ก่อน (เฟส 20.3)
 *
 * เดิมสามแผงนี้กางเต็มอยู่เหนือการ์ดวันเสมอ ยุบไม่ได้ และ checklist ก็ยาวตามจำนวนของที่เพิ่ม
 * ผลคือเปิดหน้าแผนบนมือถือทีไรต้องเลื่อนผ่านของที่ไม่ได้แตะทุกวันก่อนถึงงานหลัก (จัดจุดแวะรายวัน)
 * เอาตัวเลขสรุปขึ้นมาไว้บนหัวแทน — ปิดอยู่ก็ยังรู้ว่าเหลืออะไรต้องทำ
 */
export function TripPrepPanel({
  hotelsSetCount,
  hotelsTotal,
  bookingCount,
  checklistCheckedCount,
  checklistTotal,
  children,
}: {
  hotelsSetCount: number;
  hotelsTotal: number;
  bookingCount: number;
  checklistCheckedCount: number;
  checklistTotal: number;
  children: ReactNode;
}) {
  // null = ยังไม่เคยกดเอง → ตามขนาดจอ (จอใหญ่กางไว้ พื้นที่ไม่ได้ขาดแคลนแบบมือถือ)
  const [choice, setChoice] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "1" ? true : saved === "0" ? false : null;
  });
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const open = choice ?? isDesktop;

  function toggle() {
    const next = !open;
    setChoice(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  // ยังตั้งที่พักไม่ครบ = เรื่องที่ลืมแล้วเจ็บตอนไปถึงจริง — ต้องเห็นแม้บล็อกจะปิดอยู่
  const hotelsIncomplete = hotelsTotal > 0 && hotelsSetCount < hotelsTotal;

  return (
    <section className="mb-5">
      <button
        onClick={toggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left ${
          hotelsIncomplete
            ? "border-maple/40 bg-maple-soft/40"
            : "border-cream-soft bg-white shadow-sm shadow-ink/5"
        }`}
      >
        <span className="shrink-0 text-base">🧳</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">เตรียมทริป</span>
          <span className="block truncate text-xs text-ink-soft">
            ที่พัก {hotelsSetCount}/{hotelsTotal}
            {hotelsIncomplete ? " ⚠️" : ""} · ตั๋ว {bookingCount} · ของที่ต้องเตรียม{" "}
            {checklistCheckedCount}/{checklistTotal}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xs text-ink-soft">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}
