"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * **เปลือกการ์ดในกริดเลือกของ** — ใช้ร่วมกันทุกชนิด: ทริปของฉัน · เมืองปลายทาง · (กำลังมา) ทริปแนะนำ
 * เจ้าของ: P2-UI/UX · 4 ก.ย. 2026 · **ผู้ใช้สั่งเอง และเป็นรอบที่สองของข้อเดียวกัน**
 *
 * ```
 * รอบแรก   "มันควรมีอะไรที่เหมือนกัน เช่นการวางบรรทัดของข้อความ และ icon"   → พูดถึง **การจัดวาง**
 * รอบสอง   "รูปแบบ มันควรใช้ component เดียวกับพวกนี้นะ"                  → พูดถึง **โค้ดตัวเดียวกัน**
 * ```
 * 🎯 ***เขาไม่ได้ขอให้ "หน้าตาคล้าย" — เขาขอให้ "เป็นตัวเดียวกัน"***
 * ⇒ แก้ด้วยการก๊อป class ไปวางจะกลับมารอบสาม · ไฟล์นี้คือที่ที่ *เปลือก* มีอยู่ที่เดียวจริง ๆ
 *
 * ## 🔴 เปลือกถือ *โครง* · ผู้เรียกถือ *เนื้อ* — และเส้นแบ่งนี้ตั้งใจ
 * เปลือก: ขอบ · มุม · พื้น · hover/focus · ตำแหน่งป้ายมุมขวาบน · ระยะขอบใน · สไตล์ชื่อ
 * ผู้เรียก: รูปปก (ไล่ fallback เอง) · บรรทัดใต้ชื่อ (`children`) · ป้าย (ถ้ามี)
 *
 * 🔴 **ห้ามบังคับให้ทุกใบมีครบทุกช่อง** (P1 เตือน · ถูก) — การ์ดเมือง **ไม่มีความหมาย**
 * ให้ใส่ "อีก 18 วัน" · ช่วงวันที่ · จำนวนสมาชิก · ถ้าเปลือกบังคับ มันจะต้องเติมของปลอม
 * ซึ่งเป็นสิ่งเดียวกับที่เราเพิ่งปฏิเสธไปตอนไม่ใส่ *"ยังไม่ระบุเมือง"* ลงการ์ดทริปที่ไม่มีจุดหมาย
 * ✅ ทุกช่องเป็น *ทางเลือก* · ***ช่องที่มีที่ว่างแต่ว่างได้*** คือคำตอบ ไม่ใช่ช่องที่ต้องกรอก
 *
 * ## `coverLayout` มีสองค่า และทั้งคู่ถูกใช้จริง — ไม่ใช่ปุ่มเผื่ออนาคต
 * · `"adaptive"` — แถบข้างบนมือถือ → แบนเนอร์บนตั้งแต่ `sm` · **ใช้กับการ์ดทริป**
 *   เพราะบนมือถือกริดทริปเป็นคอลัมน์เดียว · แบนเนอร์ทำให้เห็นจาก ~5 ใบเหลือ ~2.5 ใบต่อจอ (วัดแล้ว)
 * · `"banner"` — รูปอยู่บนเสมอ · **ใช้กับการ์ดเมือง** เพราะกริดเมืองเป็น 2 คอลัมน์ตั้งแต่มือถือ
 *   ⇒ แถบข้างในการ์ดกว้าง ~152px จะเหลือที่ให้รูปน้อยจนดูไม่ออกว่าเมืองอะไร
 * 🎯 **ความต่างนี้มาจากความหนาแน่นของกริดที่มันอยู่ ไม่ใช่จากรสนิยม** — จึงเป็นพารามิเตอร์ ไม่ใช่การก๊อป
 */
export function CoverCard({
  href,
  onClick,
  cover,
  badge,
  title,
  titleClassName = "text-base font-bold leading-snug sm:text-lg",
  coverLayout = "banner",
  children,
}: {
  /** ลิงก์ — ใส่อย่างใดอย่างหนึ่งกับ `onClick` (การ์ดทริปเป็นลิงก์ · การ์ดเมืองเป็นปุ่มเปิดฟอร์ม) */
  href?: string;
  onClick?: () => void;
  /** รูปปก — **ผู้เรียกไล่ fallback เอง** เพราะแต่ละชนิดมีชั้นไม่เท่ากัน (เมือง→ประเทศ→พื้นไล่สี ฯลฯ) */
  cover: ReactNode;
  /** ป้ายมุมขวาบน — ไม่มีก็ได้ · เกาะ **การ์ด** ไม่ใช่เกาะรูป (บนมือถือรูปเป็นแถบแคบ ป้ายจะทับงานศิลป์) */
  badge?: ReactNode;
  title: ReactNode;
  titleClassName?: string;
  coverLayout?: "banner" | "adaptive";
  children?: ReactNode;
}) {
  const adaptive = coverLayout === "adaptive";
  const shell =
    "group relative flex overflow-hidden rounded-2xl border border-line bg-surface-raised text-left transition hover:border-maple/40 hover:shadow-md hover:shadow-ink/5" +
    (adaptive ? " sm:flex-col" : " flex-col");

  const body = (
    <>
      <div className={adaptive ? "shrink-0 sm:shrink" : ""}>{cover}</div>
      {badge}
      <div className="min-w-0 flex-1 p-3">
        {/* 🔴 เผื่อที่ขวาให้ป้ายเฉพาะตอนที่ป้ายทับบรรทัดนี้จริง — บน `adaptive` ที่ `sm` ขึ้นไป
            ป้ายอยู่เหนือแบนเนอร์ ไม่ทับชื่อ จึงไม่ต้องเผื่อ · เผื่อไว้เสมอ = ชื่อถูกตัดโดยไม่จำเป็น */}
        <h3 className={`truncate text-content ${badge ? (adaptive ? "pr-20 sm:pr-0" : "pr-20") : ""} ${titleClassName}`}>
          {title}
        </h3>
        {children}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={shell}>
      {body}
    </button>
  );
}

/**
 * ป้ายมุมขวาบนของ `CoverCard` — **รูปเดียว ตำแหน่งเดียว ทุกชนิดการ์ด**
 * 🔴 คู่สีต้องผ่าน WCAG AA เพราะเป็น `text-2xs` = ข้อความปกติ (วัดแล้ว: `maple`/white = 3.50 ❌
 * · `maple-dark`/white = 4.98 ✅ · `pine`/cream = 7.61 ✅ · `ink`/cream = 14.23 ✅)
 */
export function CardBadge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={`absolute right-2 top-2 rounded-full px-2.5 py-1 text-2xs font-semibold shadow-sm shadow-ink/20 ${tone}`}
    >
      {children}
    </span>
  );
}
