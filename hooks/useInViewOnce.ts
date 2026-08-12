"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * เข้ามาอยู่ในสายตาแล้วหรือยัง — กลับเป็น true ครั้งเดียวแล้วค้างไว้ (เฟส 19)
 *
 * ใช้กับของหนักที่อยู่ล่างๆ หน้าอย่างแผนที่ Google รายวัน: จอคอมเห็นการ์ดวันพร้อมกันไม่กี่ใบ
 * แต่เดิม mount แผนที่ครบทุกวันตั้งแต่โหลดหน้า (เฟส 13 แก้ฝั่งมือถือไปแล้ว นี่คือครึ่งหลังของ P-1)
 *
 * **ไม่ยอมให้กลับเป็น false** เมื่อเลื่อนพ้นสายตา — unmount แผนที่ทิ้งแล้ว mount ใหม่ตอนเลื่อนกลับมา
 * จะโหลด tile ซ้ำและเสียตำแหน่ง/ซูมที่ผู้ใช้ปรับไว้ ซึ่งแย่กว่าปล่อยให้ค้างอยู่
 */
export function useInViewOnce(
  ref: RefObject<Element | null>,
  /** เผื่อระยะก่อนถึงจริง เพื่อให้ของโหลดเสร็จพอดีตอนเลื่อนมาถึง */
  rootMargin = "300px"
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, inView]);

  return inView;
}
