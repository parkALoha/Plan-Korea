"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * พฤติกรรมมาตรฐานของ "กล่องที่เปิดคลุมหน้าอยู่" (โมดัล / bottom sheet) — เฟส 20.1
 *
 * - กด Esc ปิด
 * - โฟกัสวิ่งวนอยู่แต่ในกล่อง (Tab / Shift+Tab ไม่หลุดไปโดนของข้างหลังที่มองไม่เห็น)
 * - ปิดแล้วโฟกัสกลับไปที่ปุ่มที่เปิดมันมา ไม่ใช่กระเด็นไปต้นหน้า
 *
 * แยกออกมาเป็น hook เพราะทั้ง `components/Modal.tsx` และ `BottomSheet` ของคลังสถานที่
 * (`components/PlaceSidebar.tsx`) ต้องการพฤติกรรมชุดเดียวกัน แต่หน้าตาคนละแบบ
 */

/** กล่องที่เปิดอยู่ตอนนี้ เรียงตามลำดับการเปิด — ตัวท้ายสุด = ตัวบนสุด
 *  ต้องมีเพราะโมดัลซ้อนกันได้จริง (เช่น NearbyPlacesModal ที่เปิดจากในชีตคลังบนมือถือ)
 *  ถ้าไม่เช็ค Esc ครั้งเดียวจะปิดทุกชั้นพร้อมกัน */
const openStack: symbol[] = [];

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // ของที่ถูกซ่อนอยู่ (เช่น <input type="file"> ที่ใช้ label คลุม) ไม่ควรอยู่ในวงโฟกัส
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

export function useDismissable(
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void
) {
  // เก็บใน ref ไม่ใช่ใส่ใน deps — ผู้เรียกเกือบทุกที่ส่ง arrow function ใหม่ทุกเรนเดอร์
  // ถ้าใส่ใน deps effect จะรื้อ-สร้างใหม่ทุกครั้ง = ดัน stack ซ้ำและชิงโฟกัสกลับไปช่องแรกเรื่อยๆ
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const token = Symbol("dismissable");
    openStack.push(token);
    const isTopmost = () => openStack[openStack.length - 1] === token;

    // ปุ่ม/ลิงก์ที่กดจนกล่องนี้เปิดขึ้นมา — เก็บไว้คืนโฟกัสตอนปิด
    const opener = document.activeElement as HTMLElement | null;

    // ย้ายโฟกัสเข้ากล่องแบบ synchronous ตรงนี้เลย ไม่ผ่าน requestAnimationFrame
    // (rAF ไม่ทำงานเมื่อแท็บถูกซ่อน/อยู่เบื้องหลัง โฟกัสจะค้างอยู่นอกกล่องแบบเงียบๆ)
    // ปลอดภัยเพราะ React ใส่ autoFocus ให้ตั้งแต่ commit phase ซึ่งจบก่อน useEffect เสมอ —
    // ถ้าข้างในมีช่องที่ autoFocus ไว้ ตรงนี้จะเห็นว่าโฟกัสอยู่ในกล่องแล้วและไม่ไปแย่ง
    const container = containerRef.current;
    if (container && !container.contains(document.activeElement)) {
      (focusableIn(container)[0] ?? container).focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!isTopmost()) return;

      if (e.key === "Escape") {
        e.stopPropagation();
        onDismissRef.current();
        return;
      }

      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const items = focusableIn(container);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      // โฟกัสหลุดออกไปนอกกล่องแล้ว (เช่นเพิ่งเปิดมาแล้วยังไม่ได้โฟกัสอะไร) — ดึงกลับเข้ามา
      if (!container.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = openStack.indexOf(token);
      if (index >= 0) openStack.splice(index, 1);
      // คืนโฟกัสเฉพาะตอนที่ปุ่มเดิมยังอยู่ในหน้าจริงๆ (บางทีมันถูกลบไปพร้อมกับสิ่งที่เพิ่งแก้)
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [containerRef]);
}
