import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * ป้ายเล็ก / ชิป (เฟส A3 · 4 ก.ย. 2026)
 *
 * เว็บนี้มีป้ายเล็กเต็มไปหมด — "(ประมาณการ)" · จำนวนจุดแวะ · สถานะการจอง · เวลาต่อเครื่อง ·
 * "ตั๋วจองแล้ว" — เขียนแยกกันทุกที่ด้วยคู่สี panel-* ที่ต่างกันและ padding ที่ไม่ตรงกัน
 *
 * โทนผูกกับคู่โทเคน `panel-*` / `panel-*-ink` ที่ *ออกแบบมาให้พลิกตามธีมพร้อมกันทั้งคู่*
 * ⇒ เลือกโทนอย่างเดียวก็ได้ทั้งพื้นและตัวอักษรที่คอนทราสต์ถูกต้องทั้งสองธีม
 * (นี่คือเหตุผลที่โทเคนชุดนี้ถูกสร้างเป็น *คู่* ตั้งแต่เฟส 17 — ดูคอมเมนต์ใน globals.css)
 */
const TONES = {
  /** กลาง — ข้อมูลประกอบที่ไม่ต้องการน้ำหนัก */
  neutral: "bg-surface-soft text-content-soft",
  /** เขียวสน — สถานะที่เรียบร้อยแล้ว (จองแล้ว · ครบแล้ว) */
  pine: "bg-panel-pine text-panel-pine-ink",
  /** ส้มเมเปิล — สิ่งที่กำลังเกิดขึ้น / ต้องสนใจ */
  maple: "bg-panel-maple text-panel-maple-ink",
  /** ทอง — ค่าประมาณการ ข้อมูลที่เชื่อได้ไม่เต็มร้อย */
  gold: "bg-panel-gold text-panel-gold-ink",
  /** เตือน — ของที่ผิดพลาดหรือขาดหาย */
  alert: "bg-alert-soft text-alert-ink",
} as const;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-2xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
