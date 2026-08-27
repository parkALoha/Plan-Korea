"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * แผ่นที่ลอยเกาะกับปุ่ม (ดรอปดาวน์ · ปฏิทิน) — **ไม่กินที่ในเลย์เอาต์ จึงไม่ทำให้อะไรขยับ**
 *
 * 🔴 **ทำไมต้องมีไฟล์นี้ — สองข้อบังคับที่ตีกันเอง และท่าง่าย ๆ แก้ได้ทีละข้อเท่านั้น**
 * · `absolute` ธรรมดา → **ถูกเฉือน** เพราะเนื้อ `Modal` เป็น `overflow-y-auto` รายการยาวจะหายเงียบ ๆ
 * · in-flow (ดันเนื้อหาลง) → ไม่ถูกเฉือน **แต่โมดัลเด้ง/ขยับทุกครั้งที่เปิด** ซึ่งผู้ใช้บอกเองว่าไม่เอา
 *   (28 ส.ค. 2026: *"กด dropdown แล้วมันเด้ง มันควรจะไม่เด้ง"*) — ผมเคยเลือกทางนี้แล้วมันแก้ข้อแรกได้
 *   จริง แต่สร้างข้อสองขึ้นมาแทน
 * 🎯 **ทางที่ได้ทั้งสองข้อ: portal ออกไปที่ `body` + `position: fixed` + คำนวณตำแหน่งจากปุ่มเอง**
 *   อยู่นอกกล่องที่เลื่อนได้ (ไม่ถูกเฉือน) และอยู่นอก flow (ไม่ดันอะไรเลย)
 *
 * ⚠️ **ราคาที่ต้องจ่ายและต้องจ่ายให้ครบ:** พอหลุดออกจาก flow แล้ว ตำแหน่งไม่อัปเดตเอง —
 * ต้องคำนวณใหม่ทุกครั้งที่มีการเลื่อนหรือเปลี่ยนขนาด · **ดักด้วย capture (`true`)** เพราะสิ่งที่เลื่อน
 * จริงคือเนื้อโมดัลข้างใน ไม่ใช่ `window` (event เลื่อนของ element ไม่ bubble ขึ้น window)
 *
 * 🔴 **และการเช็ค "คลิกนอก" ต้องนับตัวแผ่นด้วย** — แผ่นอยู่คนละที่ใน DOM แล้ว ถ้าเช็คแค่ว่า
 * "อยู่นอกปุ่มไหม" การคลิกตัวเลือกในแผ่นจะนับเป็นคลิกนอกทันที แล้วปิดตัวเองก่อนเลือกเสร็จ
 */
export function AnchoredPanel({
  anchorRef,
  onClose,
  matchWidth = false,
  className = "",
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** ให้แผ่นกว้างเท่าปุ่ม (ดรอปดาวน์ใช้ · ปฏิทินไม่ใช้ เพราะกว้างกว่าปุ่ม) */
  matchWidth?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // เก็บ onClose ไว้ใน ref — ไม่งั้น listener ถูกถอด/ใส่ใหม่ทุกครั้งที่พาเรนต์ re-render
  // (อัปเดตในเอฟเฟกต์ ไม่ใช่ตอน render — `react-hooks/refs` ห้ามแตะ ref ระหว่าง render)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    function place() {
      const a = anchorRef.current;
      const p = panelRef.current;
      if (!a || !p) return;
      const r = a.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      // ปกติกางลง — พลิกขึ้นเฉพาะตอนข้างล่างไม่พอ *และ* ข้างบนมีมากกว่า
      const h = p.offsetHeight;
      const flipUp = spaceBelow < h + 12 && spaceAbove > spaceBelow;
      const room = (flipUp ? spaceAbove : spaceBelow) - 12;

      p.style.position = "fixed";
      p.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8))}px`;
      p.style.top = flipUp ? "auto" : `${r.bottom + 4}px`;
      p.style.bottom = flipUp ? `${window.innerHeight - r.top + 4}px` : "auto";
      p.style.maxHeight = `${Math.max(140, room)}px`;
      p.style.overflowY = "auto";
      if (matchWidth) p.style.width = `${r.width}px`;
      p.style.visibility = "visible";
    }

    place();
    // ⚠️ capture = true: ตัวที่เลื่อนจริงคือเนื้อโมดัล ไม่ใช่ window — scroll ของ element ไม่ bubble
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, matchWidth]);

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      // นับทั้งแผ่นและปุ่มเป็น "ข้างใน" — แผ่นอยู่ใน portal คนละที่ใน DOM
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onCloseRef.current();
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [anchorRef]);

  /**
   * 🔴 **Esc ต้องปิดแค่แผ่นนี้ ไม่ใช่ปิดโมดัลทั้งกล่อง** — บั๊กจริงที่เจอ 28 ส.ค. 2026
   * `Modal` ปิดตัวเองด้วย `useDismissable` ที่ดัก `keydown` ที่ **`document` ระดับ bubble**
   * → เดิมกด Esc เพื่อปิดดรอปดาวน์ **แล้วฟอร์มสร้างทริปปิดทั้งใบ ชื่อ/วันที่/จุดหมายที่กรอกไว้หายหมด**
   *
   * ดักที่ `document` **ระดับ capture (`true`)** เพราะ capture ของ document วิ่งก่อน bubble ของ document
   * เสมอ — เป็นทางเดียวที่การันตีว่าได้จัดการก่อน `useDismissable` ไม่ว่า React จะผูก listener ไว้ชั้นไหน
   * (`stopPropagation` ใน React handler พึ่งพาตำแหน่งที่ React attach ซึ่งเปลี่ยนได้ตามเวอร์ชัน)
   */
  useEffect(() => {
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCloseRef.current();
    }
    document.addEventListener("keydown", onDocKeyDown, true);
    return () => document.removeEventListener("keydown", onDocKeyDown, true);
  }, []);

  return createPortal(
    <div
      ref={panelRef}
      // ซ่อนไว้ก่อนจนกว่าจะคำนวณตำแหน่งเสร็จ — ไม่งั้นจะเห็นมันแวบที่มุมซ้ายบนก่อนกระโดดเข้าที่
      style={{ visibility: "hidden" }}
      className={`z-[60] ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
