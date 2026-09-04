"use client";

import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useDismissable } from "@/hooks/useDismissable";

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
  align = "sheet",
  fillHeight = false,
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
  /**
   * ที่วางกล่องบน **จอโทรศัพท์** — จอ `sm` ขึ้นไปอยู่กลางจอเหมือนกันทั้งสองค่า
   * ```
   * "sheet"  ชิดขอบล่าง เต็มความกว้าง มุมบนมน   ← ค่าเริ่มต้น · ของที่ต้องใช้นิ้วโต้ตอบนาน
   * "top"    ใต้แถบหัว มุมมนทุกด้าน มีขอบข้าง    ← ของที่เปิดจากปุ่ม *บนแถบหัว*
   * ```
   * 🔴 **เกณฑ์คือ *ปุ่มที่เปิดมันอยู่ตรงไหน* ไม่ใช่ขนาดของกล่อง** (P2 · 4 ก.ย. 2026 · ผู้ใช้ทัก)
   * โมดัลค้นหาถูกเปิดจากไอคอนมุมบนขวา แล้วกล่องไปโผล่ **ชิดขอบล่างสุด** ⇒ สายตาต้องกระโดดข้ามทั้งจอ
   * 🎯 ***กล่องที่โผล่ไกลจากสิ่งที่กด อ่านเหมือนของคนละชิ้น ไม่ใช่ผลของการกดนั้น***
   * · `"sheet"` ยังถูกสำหรับของที่นิ้วต้องทำงานนาน (เลือกจากรายการยาว ๆ) — ***อยู่ใกล้นิ้ว***
   *   ⇒ **สองค่านี้ตอบคนละคำถาม ไม่มีค่าไหนดีกว่าอีกค่าโดยทั่วไป**
   */
  align?: "sheet" | "top";
  /**
   * สูงคงที่ `90vh` เสมอ แทนที่จะ *ไม่เกิน* `90vh` — สำหรับโมดัลที่เนื้อหาโหลดทีหลัง
   *
   * 🔴 บั๊กจริง (ผู้ใช้เจอ 4 ก.ย. 2026): โมดัลค้นหาสถานที่เปิดมาเตี้ย (มีแค่ "กำลังค้นหา...")
   * แล้วพุ่งขึ้นเมื่อผลมาถึง · **ไม่ใช่แอนิเมชัน — เป็นความสูงตามเนื้อหา**
   * และมันกระตุกซ้ำทุกครั้งที่พิมพ์ค้นหา เพราะจำนวนผลเปลี่ยน
   * 🎯 โมดัลที่ *เรียกดูรายการ* ต้องมีขนาดคงที่แล้วให้เนื้อหาเลื่อนข้างใน — ไม่ใช่ให้กล่องวิ่งตามผลลัพธ์
   * ⚠️ ไม่ใช่ค่าเริ่มต้น: โมดัลยืนยัน/ฟอร์มสั้น ๆ ที่เนื้อหาครบตั้งแต่เปิด ควรพอดีตัวเหมือนเดิม
   */
  fillHeight?: boolean;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useBodyScrollLock();
  useDismissable(panelRef, onClose);

  /**
   * 🔴 **ต้อง portal ออกไปที่ `body` — `fixed inset-0 z-50` เพียงอย่างเดียวไม่พอ** (P2 · 2 ก.ย. 2026)
   *
   * ผู้ใช้เจอเอง: เปิดโมดัลจากไซด์บาร์แล้ว **แถบวันที่ทะลุขึ้นมาทับกล่อง**
   * · วัดแล้ว: `document.elementsFromPoint()` คืนปุ่มวัน **บนสุด** และคืนฉากหลังของโมดัล (`z=50`) *ใต้* มัน
   *   ทั้งที่แถบวันเป็น `z-30` — **ตัวเลขบอกว่าโมดัลควรชนะ แต่มันแพ้**
   *
   * 🎯 **กลไก: `position: sticky` สร้าง stacking context *เสมอ* — ต่างจาก `relative`/`absolute`
   * ที่สร้างก็ต่อเมื่อมี `z-index`** · คอลัมน์ไซด์บาร์เป็น `sticky top-4` (z-index: auto)
   * → `z-50` ของโมดัลถูกขังไว้ **มีความหมายแค่ภายในคอลัมน์นั้น**
   * → ที่ root: คอลัมน์ไซด์บาร์อยู่ระดับ auto(0) · แถบวัน `z-30` อยู่ root ด้วย → **30 ชนะ 0**
   *
   * ⚠️ **ไล่หา `transform`/`filter`/`will-change` ทั้งสายแล้วไม่เจอสักตัว** — ตัวการคือ `sticky` ล้วน ๆ
   *    ซึ่งเป็นของที่ไม่มีใครนึกถึงเวลาดูปัญหา z-index
   * 🔴 **และมันไม่ได้แก้ด้วยการเพิ่มเลข** — ต่อให้ `z-[999]` ก็ยังอยู่ในคอนเทกซ์เดิม
   *    เลขที่ใหญ่ขึ้นจะทำให้ *ดูเหมือน* พยายามแก้แล้ว ทั้งที่รากไม่ถูกแตะ
   *
   * ✅ portal ไปที่ `body` = อยู่ root จริง · `z-50` มีความหมายจริง · **และเป็นรูปเดียวกับที่
   *    `AnchoredPanel` ใช้อยู่แล้วในไฟล์ข้าง ๆ ด้วยเหตุผลตระกูลเดียวกัน (ถูกเฉือนโดยกล่องที่เลื่อนได้)**
   * 📌 ไม่มีการ์ด `mounted` โดยตั้งใจ — **รูปเดียวกับ `AnchoredPanel`** · โมดัลถูกเรนเดอร์
   *    ก็ต่อเมื่อ state ฝั่งไคลเอนต์เปิดมันเท่านั้น (`{open && <Modal …/>}`) จึงไม่มีรอบ SSR ที่แตะ `document`
   *    · ถ้าวันหลังมีใครเรนเดอร์โมดัลแบบไม่มีเงื่อนไข จะต้องกลับมาใส่การ์ด — **ตอนนั้น `AnchoredPanel`
   *      ก็ต้องใส่ด้วย** เพราะมันมีข้อสมมติเดียวกันเป๊ะ
   */
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/50 sm:items-center ${
        align === "top" ? "items-start p-3 pt-[4.25rem] sm:p-4" : "items-end"
      }`}
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
        className={`flex ${fillHeight ? "h-[90vh]" : "max-h-[90vh]"} w-full flex-col bg-surface-raised text-content outline-none sm:rounded-2xl ${
          align === "top" ? "rounded-2xl shadow-lg shadow-ink/20" : "rounded-t-2xl"
        } ${size === "md" ? "max-w-md" : "max-w-lg"}`}
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
            <button
              onClick={onClose}
              aria-label="ปิด"
              className="-mr-2 shrink-0 rounded-full p-2 text-content-soft hover:bg-surface-soft"
            >
              ✕
            </button>
          </div>
          {headerExtra}
        </div>

        {/* 🔴 `pb-3` มีไว้เป็น *ช่องไฟก่อนแถบปุ่มท้ายกล่อง* ไม่ใช่ระยะขอบล่างของกล่อง (P2 · 28 ส.ค. 2026)
            โมดัลที่ไม่มี `footer` จึงได้ขอบล่าง 12px ขณะที่หัวกล่องมี `pt-5` = 20px → **บนหนักกว่าล่าง**
            ผู้ใช้ทักที่ฟอร์มสร้างทริป (ไม่มี footer) ว่า "ดูไม่สมดุล" · วัดแล้ว: บน 20 · ล่าง 12 */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto px-5 ${footer ? "pb-3" : "pb-5"} ${bodyClassName}`}
        >
          {children}
        </div>

        {footer && <div className="flex shrink-0 gap-2 px-5 pb-5 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
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
          <button
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-3 text-sm font-medium text-content-soft hover:bg-surface-soft"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-maple-dark py-3 font-semibold text-white hover:bg-maple"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
