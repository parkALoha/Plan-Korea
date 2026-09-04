"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

/**
 * บล็อกที่ยุบ/กางได้ (เฟส A3 · 4 ก.ย. 2026)
 *
 * เขียนซ้ำอยู่ 3 ชุดที่หน้าตาและพฤติกรรมไม่ตรงกัน:
 *   TripPrepPanel.tsx:50-70 · DayStopsSection.tsx:540-546 · EmergencyCard.tsx
 * ทั้งสามมี `aria-expanded` (ดี) แต่ **ไม่มีตัวไหนมี `aria-controls`** ⇒ screen reader รู้ว่า
 * ปุ่มนี้กางอยู่หรือยุบอยู่ แต่ไม่รู้ว่ามัน *คุมอะไร* และเนื้อที่กางออกมาอยู่ตรงไหนของหน้า
 *
 * ▲▼ เดิมเป็นตัวอักษรอิโมจิที่จัดแนวไม่นิ่งข้ามแพลตฟอร์ม และเปลี่ยนสีตามธีมไม่ได้ —
 * เปลี่ยนเป็น SVG ที่หมุนด้วย transform ซึ่งได้ทิศทางการเคลื่อนไหวมาฟรีด้วย
 * (`prefers-reduced-motion` ตัดการหมุนทิ้ง — กฎอยู่ท้าย globals.css)
 *
 * ⚠️ **ตั้งใจไม่ถอด children ออกจาก DOM ตอนยุบ** ใช้ `hidden` แทน — เนื้อในบล็อกพวกนี้คือ
 *    ที่พัก/ตั๋ว/ของที่ต้องเตรียม ซึ่ง `Ctrl+F` ของเบราว์เซอร์ควรหาเจอแม้ยังไม่กาง
 *    (`hidden` ยังซ่อนจาก screen reader และ tab order ตามที่ควร)
 */
export function Disclosure({
  open,
  onToggle,
  summary,
  className,
  panelClassName,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** เนื้อหาบนหัวบล็อก — ไม่ใช่แค่ข้อความ เพราะของจริงมีสรุปตัวเลขกับป้ายเตือนอยู่ด้วย */
  summary: ReactNode;
  className?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <Icon
          name="chevron-down"
          className={cn("text-content-soft transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      <div id={panelId} hidden={!open} className={panelClassName}>
        {children}
      </div>
    </div>
  );
}
