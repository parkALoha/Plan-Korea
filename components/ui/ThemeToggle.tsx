"use client";

import { useDarkTheme } from "@/hooks/useDarkTheme";
import { cn } from "@/lib/cn";
import { IconButton } from "./Button";

/**
 * ปุ่มสลับธีมสว่าง/มืด (เฟส B3 · 4 ก.ย. 2026)
 *
 * เขียนซ้ำอยู่ 2 ที่ที่ไม่เหมือนกันเป๊ะ (`app/today/page.tsx:394` · `app/summary/page.tsx:648`)
 * และหน้า `/` กำลังจะเป็นที่ที่สาม — รวมมาก่อนที่มันจะกลายเป็นสามสำเนา
 *
 * 🔴 **ตัว hook `useDarkTheme` เป็นตัวที่ตั้ง `data-theme` บน `<html>` และลบทิ้งตอน unmount**
 *    ⇒ หน้าที่อยาก "รองรับธีมมืด" แค่ *เรนเดอร์ปุ่มนี้* ก็พอ ไม่ต้องเรียก hook เองซ้ำอีก
 *    (เรียกซ้ำได้ ไม่พัง — ทั้งคู่เขียนค่าเดียวกัน — แต่ไม่จำเป็น)
 *
 * `onDark` = ปุ่มนี้วางอยู่บนพื้นสีเน้นเข้ม (หัวเว็บสีสน) ซึ่งเป็นสีเดียวกันทั้งสองธีม
 * จึงต้องใช้คู่สีขาวโปร่ง ไม่ใช่โทเคน surface/content ที่จะพลิกจนจมหายไปกับพื้น
 */
export function ThemeToggle({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  const { isDark, toggle } = useDarkTheme();

  return (
    <IconButton
      onClick={toggle}
      label={isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
      icon={isDark ? "sun" : "moon"}
      variant="ghost"
      className={cn(
        "rounded-full",
        onDark ? "bg-white/10 text-cream hover:bg-white/20" : "hover:bg-surface-soft",
        className,
      )}
    />
  );
}
