"use client";

import { useId, useRef, type ReactNode } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useDismissable } from "@/hooks/useDismissable";
import { Button, IconButton } from "./ui/Button";

/**
 * กล่องโมดัลกลางของทั้งเว็บ (เฟส 20.1)
 *
 * เดิมโมดัล 8 ตัวก๊อป shell ชุดเดียวกันไปแปะทีละไฟล์ แล้วทุกตัวขาดของเหมือนกันหมด
 * (`role="dialog"` / ปิดด้วย Esc / ล็อกโฟกัส / คืนโฟกัสตอนปิด / `aria-label` ที่ปุ่ม ✕)
 * รวมมาไว้ที่เดียวแล้วแก้ครั้งเดียวได้ทั้งเว็บ · หน้าตายกมาจาก `PlanEditModal` เดิมทั้งดุ้น
 * (มือถือเป็นชีตติดขอบล่าง จอ sm ขึ้นไปลอยกลางจอ · หัวกับท้ายอยู่นิ่ง เนื้อตรงกลางเลื่อน)
 */
export function Modal({
  onClose,
  title,
  eyebrow,
  subtitle,
  headerExtra,
  footer,
  size = "lg",
  bodyClassName = "",
  children,
}: {
  onClose: () => void;
  /** ข้อความในหัวกล่อง — ผูกเป็น aria-labelledby ให้ screen reader อ่านตอนโมดัลเปิด */
  title: ReactNode;
  /** บรรทัดเล็กเหนือหัวข้อ (เช่น หมวดของสถานที่ใน PlaceDetailModal) */
  eyebrow?: ReactNode;
  /** บรรทัดเล็กใต้หัวข้อ */
  subtitle?: ReactNode;
  /** เนื้อหาเพิ่มในส่วนหัวที่ต้องอยู่นิ่ง ไม่เลื่อนไปกับเนื้อ (เช่น ช่องค้นหาของ NearbyPlacesModal) */
  headerExtra?: ReactNode;
  /** แถวปุ่มท้ายกล่อง — อยู่นิ่งเสมอ ไม่ต้องเลื่อนหา */
  footer?: ReactNode;
  size?: "md" | "lg";
  bodyClassName?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useBodyScrollLock();
  useDismissable(panelRef, onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      {/* ใช้โทเคน surface/content ไม่ใช่ bg-white/text-ink — /today กับ /summary รองรับธีมมืดแล้ว
          แต่ shell ตัวนี้ฮาร์ดโค้ดขาวไว้ ผลคือกลางจอมืดเด้งแผ่นขาวจ้าขึ้นมา และตัวหนังสือที่ไม่ได้
          ระบุสีเองจะ inherit --content (ครีม) มาอยู่บนพื้นขาว = อ่านไม่ออกเลย
          ต้องมี text-content บนตัว panel ด้วย ไม่ใช่แค่เปลี่ยนพื้น ไม่งั้นลูกที่ inherit ยังพังเหมือนเดิม */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-surface-raised text-content outline-none sm:rounded-2xl ${
          size === "md" ? "max-w-md" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              {eyebrow && <div className="text-xs text-content-soft">{eyebrow}</div>}
              <h2 id={titleId} className="text-lg font-bold text-content">
                {title}
              </h2>
              {subtitle && <div className="text-xs text-content-soft">{subtitle}</div>}
            </div>
            <IconButton onClick={onClose} label="ปิด" icon="close" className="-mr-2 rounded-full" />
          </div>
          {headerExtra}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-3 ${bodyClassName}`}>{children}</div>

        {footer && <div className="flex shrink-0 gap-2 px-5 pb-5 pt-3">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * กล่องยืนยันสำหรับงานที่ "ทำแล้วกู้ไม่ได้จริงๆ" เท่านั้น (เฟส 20.2)
 *
 * งานลบส่วนใหญ่ในเว็บนี้ใช้ toast + ปุ่มเลิกทำแทน เพราะเร็วกว่าและไม่ขวางทางในเคสที่ผู้ใช้ตั้งใจอยู่แล้ว
 * กล่องนี้เก็บไว้ใช้เฉพาะตอนที่ทำ undo ไม่ได้ (เช่น ลบตั๋วที่มีไฟล์แนบอัปโหลดไว้)
 */
export function ConfirmModal({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      onClose={onClose}
      title={title}
      size="md"
      bodyClassName="space-y-3"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            ยกเลิก
          </Button>
          {/* variant="danger" ไม่ใช่ "primary" — กล่องนี้ใช้เฉพาะงานที่ทำแล้วกู้ไม่ได้จริงๆ
              (ดูคอมเมนต์ของ ConfirmModal) ก่อนหน้านี้มันใช้สีเดียวกับปุ่มบันทึกทั่วเว็บ
              ⇒ "ยืนยันลบตั๋ว" หน้าตาเหมือน "บันทึก" ทั้งที่ผลลัพธ์ต่างกันสุดขั้ว */}
          <Button variant="danger" size="lg" onClick={onConfirm} className="flex-1">
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
