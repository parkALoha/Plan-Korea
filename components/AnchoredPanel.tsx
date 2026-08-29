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
  preferredMaxHeight,
  className = "",
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** ให้แผ่นกว้างเท่าปุ่ม (ดรอปดาวน์ใช้ · ปฏิทินไม่ใช้ เพราะกว้างกว่าปุ่ม) */
  matchWidth?: boolean;
  /**
   * เพดานความสูงของแผ่น (px) — **แยกจาก "ที่ว่างบนจอ" โดยตั้งใจ**
   * ที่ว่างบอกว่า *กางได้* แค่ไหน · อันนี้บอกว่า *ควร* กางแค่ไหน
   * ผู้ใช้สั่ง 28 ส.ค. 2026: *"ลองกางมาแค่ไม่เยอะมาก และให้เลื่อนดูเอา"* — จอสูง ๆ ไม่ควรได้แผ่นยาวทั้งจอ
   *
   * 🔴 **ใส่ค่านี้ = ประกาศว่า "เนื้อในแผ่นนี้เลื่อนดูได้"** และมันเปลี่ยนกฎการวางทั้งชุด ไม่ใช่แค่ความสูง
   * · ใส่   (ดรอปดาวน์) → ตัดความสูงได้ · เลื่อนในตัว · "ที่ว่างพอไหม" วัดจาก `MIN_USABLE`
   * · ไม่ใส่ (ปฏิทิน)   → **ห้ามตัด ห้ามเลื่อน** ต้องเห็นครบทั้งใบ · ที่ว่างไม่พอให้ *เลื่อนตัวแผ่นขึ้น* ให้พอดีจอ
   * ⚠️ ตั้งใจให้เป็น prop เดียวคุมทั้งสองเรื่อง — แยกเป็นสอง prop เมื่อไหร่ มันขัดกันเองได้เมื่อนั้น
   * 📌 ที่มา: ผู้ใช้ 28 ส.ค. 2026 — *"ปฏิทินไม่ควรเลื่อนดูนะ ควรเห็นทั้งเดือน"* · ตอนที่เพดานเพิ่งถูกเพิ่ม
   *    เข้ามาเพื่อดรอปดาวน์ มันไปกินปฏิทินด้วย แล้วเดือนแสดงไม่ครบ
   */
  preferredMaxHeight?: number;
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

      // 🔴 วัดความสูงธรรมชาติ ต้องล้าง maxHeight ของรอบก่อนออกก่อน
      // `place()` ถูกเรียกซ้ำทุกครั้งที่เลื่อน/เปลี่ยนขนาด — ถ้าไม่ล้าง `offsetHeight` จะคืนค่าที่
      // **ถูกคลิปด้วย maxHeight ของรอบที่แล้ว** → การตัดสินใจพลิกเปลี่ยนไปมาระหว่างรอบ
      p.style.maxHeight = "";
      p.style.overflowY = "";
      // 🔴 ตั้งความกว้างก่อนวัดทุกอย่าง — ทั้ง `offsetWidth` (ใช้หนีบขอบขวา) และ `offsetHeight`
      // (รายการที่แคบลงจะขึ้นบรรทัดใหม่ → สูงขึ้น) ขึ้นกับความกว้างทั้งคู่ · วัดก่อนตั้ง = วัดของที่ยังไม่ใช่ของจริง
      if (matchWidth) p.style.width = `${r.width}px`;
      const h = p.offsetHeight;

      const scrolls = preferredMaxHeight != null;
      // 🔴 หนีบขอบขวาด้วยความกว้าง *ของแผ่น* ไม่ใช่ของปุ่ม (P2 · 28 ส.ค. 2026)
      // เดิมใช้ `r.width` (ปุ่ม) — **ดรอปดาวน์รอดเพราะ `matchWidth` ทำให้สองค่านี้เท่ากันพอดี**
      // ปฏิทินกว้างกว่าช่องวันที่ → หนีบด้วยเลขที่เล็กเกินจริง แล้วล้นขอบขวาจอ คอลัมน์ ศ/ส หายไป
      // ⚠️ เห็นเฉพาะบนมือถือ + ช่องที่อยู่ค่อนไปทางขวา (ช่อง "สิ้นสุด") — จอกว้างไม่มีอะไรฟ้อง
      const pw = p.offsetWidth;
      const left = `${Math.max(8, Math.min(r.left, window.innerWidth - pw - 8))}px`;

      p.style.position = "fixed";
      p.style.left = left;

      if (!scrolls) {
        // 🔴 เนื้อที่เลื่อนไม่ได้ (ปฏิทิน) — เห็นครบทั้งใบเสมอ **ไม่ตัด ไม่พลิก**
        // ที่ว่างข้างล่างไม่พอ ก็แค่ *เลื่อนตัวแผ่นขึ้น* จนพอดีจอ — ยังอยู่ใต้ปุ่มในความรู้สึก
        // และเดือนไม่หายไปครึ่งใบ · ผู้ใช้ยืนยันทิศ 28 ส.ค. 2026: *"มันควรจะอยู่ด้านล่าง แบบเดียวกับปฏิทิน"*
        const top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 8 - h));
        p.style.top = `${top}px`;
        p.style.bottom = "auto";
      } else {
        // ปกติกางลง — พลิกขึ้นเฉพาะตอนข้างล่างไม่พอ *และ* ข้างบนมีมากกว่า
        // 🔴 "ไม่พอ" วัดจาก *ความสูงที่ใช้งานได้จริง* ไม่ใช่ความสูงธรรมชาติของรายการ (P2 · 28 ส.ค. 2026)
        // แผ่นนี้เลื่อนในตัวได้ → รายการ 22 เมืองสูง ~800px ไม่ได้แปลว่าต้องมีที่ 800px
        // เทียบกับความสูงธรรมชาติทำให้รายการยาวพลิกขึ้น **เสมอ** แล้วสูงเท่าที่ว่างข้างบนทั้งหมด
        // = คลุมทั้งหน้าจอ (ผู้ใช้รายงาน: *"มันต้องอยู่ด้านล่างสิ"*)
        const MIN_USABLE = 180;
        const flipUp = spaceBelow < Math.min(h + 12, MIN_USABLE) && spaceAbove > spaceBelow;
        const space = (flipUp ? spaceAbove : spaceBelow) - 12;
        p.style.top = flipUp ? "auto" : `${r.bottom + 4}px`;
        p.style.bottom = flipUp ? `${window.innerHeight - r.top + 4}px` : "auto";
        // เพดานที่ตั้งไว้กดได้แค่ตอนที่จอมีที่ให้มากกว่านั้น — ที่ว่างน้อยกว่าเพดาน ที่ว่างชนะ
        p.style.maxHeight = `${Math.max(140, Math.min(space, preferredMaxHeight))}px`;
        p.style.overflowY = "auto";
      }

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
  }, [anchorRef, matchWidth, preferredMaxHeight]);

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
