"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { E5_COPY } from "@/lib/i18n";

/**
 * **ปุ่มย้อนกลับ — รูปทรงใบเดียวของทั้งเว็บ** · เจ้าของ: P2-UI/UX · 5 ก.ย. 2026
 * ผู้ใช้สั่งสองรอบ: *"ใช้เหมือนกันทั้งเว็บ … ทั้งคำ และลักษณะ รูปร่าง"* → *"ทำปุ่มให้สวย ๆ"*
 *
 * ## 🔴 ทำไมต้องแยกออกจาก `BackHomeLink` — **มีปุ่มญาติที่ *ไม่ได้* กลับหน้าแรก**
 * ```
 * BackHomeLink   → "/"          ทุกหน้า
 * BackLink       → "/explore"   หน้าเลือกเมือง (มือถือ) — *"← เลือกประเทศอื่น"*
 * ```
 * ปุ่มที่สองเคยเขียนคลาสของตัวเอง (`rounded-xl … py-2`) ⇒ **ต่างจากปุ่มแรกทั้งความมนและความสูง**
 * แล้วทั้งสองอยู่บน**หน้าจอเดียวกันห่างกัน 4 บรรทัด** — ผู้ใช้ส่งภาพทั้งสองปุ่มมาพร้อมกัน
 * 🎯 ***"เหมือนกันทั้งเว็บ" ที่ทำโดยคัดลอกคลาส จะเหมือนกันเฉพาะวันที่คัดลอก***
 * ⇒ `BackHomeLink` กลายเป็น *ตัวห่อบาง ๆ* ของใบนี้ **มันจึงเปลี่ยนตามเสมอ ไม่ใช่เพราะมีใครจำได้**
 *
 * ## 🔴 หน้าตาที่รื้อใหม่ — ที่เปลี่ยนคือ *ลูกศรมีที่อยู่ของตัวเอง* ไม่ใช่แค่ตัวอักษรนำหน้า
 * ของเดิม: กรอบมนเปล่า + `←` ตัวอักษรธรรมดา ⇒ ***อ่านเหมือนข้อความ ไม่เหมือนของที่กดได้***
 * ตอนนี้: ลูกศรอยู่ในวงกลมสีคู่ `panel-maple` (พื้น) / `panel-maple-ink` (หมึก) ซึ่ง **พลิกตามธีมเอง**
 * · `shadow-raised → shadow-overlay` ตอน hover · `active:translate-y-px` ⇒ กดแล้วรู้สึกว่าลง
 * · ⚠️ **ไม่ใช้ `maple-dark` ตรง ๆ** — มันผ่านคอนทราสต์เฉพาะธีมสว่าง (มืดได้ 3.72 ตก)
 *   นี่คือบั๊กเดียวกับที่เคยโดนที่ `SiteNav` **แก้ธีมหนึ่งแล้วพังอีกธีม โดยไม่มีอะไรฟ้อง**
 *
 * ## 📌 พื้นที่กดกว้างกว่าที่เห็น
 * `before:-inset-[7px]` ⇒ พื้นที่แตะจริงใหญ่กว่ากรอบ **โดยไม่ดันเลย์เอาต์รอบ ๆ**
 */
export function BackLink({
  href,
  children,
  tone = "surface",
  className = "",
}: {
  href: string;
  children: ReactNode;
  tone?: "surface" | "brand";
  className?: string;
}) {
  const base =
    "group relative inline-flex items-center gap-2 rounded-pill py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition before:absolute before:-inset-[7px] before:content-[''] active:translate-y-px";
  const skin =
    tone === "brand"
      ? /* บนแถบหัวสีเขียวทึบ — พื้นตายตัว ไม่พลิกตามธีม ⇒ ใช้คู่สีของแบรนด์ ไม่ใช่โทเคนพื้นหน้า */
        "bg-cream/10 text-cream hover:bg-cream/20"
      : /* 🔴 `border-edge` ไม่ใช่ `border-line` — ธีมมืด `--line` ได้ 1.43:1 กับพื้น ⇒ ปุ่มแทบไม่มีรูปร่าง
           (ผู้ใช้รายงานเอง 4 ก.ย. 2026) · ขอบ *ปุ่ม* กับเส้นคั่น *เนื้อหา* คนละหน้าที่ */
        "border border-edge bg-surface-raised text-content shadow-raised hover:border-pine hover:text-pine hover:shadow-overlay";
  const chip =
    tone === "brand"
      ? "bg-cream/20 text-cream"
      : "bg-panel-maple text-panel-maple-ink";

  return (
    <Link href={href} className={`${base} ${skin} ${className}`}>
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.95rem] leading-none transition-transform group-hover:-translate-x-0.5 ${chip}`}
      >
        ←
      </span>
      {children}
    </Link>
  );
}

/**
 * **ปุ่มกลับหน้าแรก** — คำเดียวของทั้งเว็บ: **"กลับหน้าหลัก"** (ผู้ใช้เลือกคำนี้เอง)
 * ⚠️ **ไม่ใช่ "ทริปทั้งหมด"** — หน้าแรกไม่ได้มีแค่รายการทริปแล้ว (มี *"ไปไหนดี?"* และทริปแนะนำด้วย)
 * 🎯 ***ปุ่มย้อนกลับควรบอก *ที่ที่จะไป* ไม่ใช่ *ส่วนหนึ่งของสิ่งที่อยู่ที่นั่น****
 */
export function BackHomeLink({
  tone = "surface",
  className = "",
}: {
  tone?: "surface" | "brand";
  className?: string;
}) {
  return (
    <BackLink href="/" tone={tone} className={className}>
      {E5_COPY.home.backHome}
    </BackLink>
  );
}
