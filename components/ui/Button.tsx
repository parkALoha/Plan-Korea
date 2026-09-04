import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

/**
 * ปุ่มของทั้งเว็บ (เฟส A3 · 4 ก.ย. 2026)
 *
 * ก่อนหน้านี้ไม่มี primitive สักตัว — class string ของปุ่มหลักถูกก๊อปไป 6 ที่
 * (TransferEdit:74 · RouteSuggestion:145 · BookingEdit:176 · PlaceDetail:86 · HotelEdit:199 ·
 * IntercityEdit:104) และมี variant ที่หลุดออกไปอีก 3 (Modal:129 · today:721 · unlock:98)
 *
 * 🔴 **`primary` เปลี่ยนจาก bg-maple เป็น bg-maple-dark — เพราะของเดิม *ตกเกณฑ์ contrast***
 *     วัดแล้ว (WCAG relative luminance ไม่ใช่สายตา):
 *        ขาวบน maple      #d9683a → 3.50:1   ❌ ต้องการ 4.5:1 สำหรับข้อความขนาดปกติ
 *        ขาวบน maple-dark #b8502a → 4.98:1   ✅
 *     ปุ่มนี้คือ *ปุ่มยืนยันของทุกฟอร์มในเว็บ* — มันตกเกณฑ์มาตลอด
 *     🎯 และ `Modal.tsx:129` (ConfirmModal) ที่ผมนึกว่าเป็น "ตัวหลุด" กลับเป็นตัวเดียวที่ถูก
 *        เพราะมันใช้ maple-dark อยู่แล้ว — อีก 6 ที่ต่างหากที่ผิด
 *
 * ⚠️ **สิ่งที่ยังไม่ทำในไฟล์นี้: touch target 44pt** — `md`/`sm` สูงประมาณ 39px / 30px
 *    ซึ่งต่ำกว่าเกณฑ์ ยังไม่แก้รอบนี้โดยตั้งใจ เพราะการเพิ่ม min-height จะทำให้เลย์เอาต์ขยับ
 *    ปนกับการ refactor จนแยกไม่ออกว่าอะไรทำให้อะไรเปลี่ยน · เป็นงานเฟส D ที่จะวัดก่อน-หลัง
 *    และเพราะขนาดถูกนิยามที่นี่ที่เดียว **เฟส D จึงเป็นการแก้ไฟล์เดียว**
 */

const VARIANTS = {
  /** การกระทำหลักของฟอร์ม/โมดัล */
  primary: "bg-maple-dark text-white hover:bg-maple",
  /** การกระทำที่ทำแล้วกู้ไม่ได้ — สีคนละตัวกับ primary โดยตั้งใจ (เดิมใช้สีเดียวกัน) */
  danger: "bg-alert text-white hover:brightness-110",
  /** การกระทำหลักบนพื้นที่ที่โทนเขียวสนเหมาะกว่า (หัวเว็บ · หน้า /unlock) */
  pine: "bg-pine text-cream hover:bg-pine-dark",
  /** ทางเลือกรอง — มีขอบ ไม่มีพื้น */
  secondary: "border border-line text-content-soft hover:bg-surface-soft",
  /** เบาที่สุด ไม่มีทั้งขอบและพื้นจนกว่าจะชี้ */
  ghost: "text-content-soft hover:bg-surface-soft",
} as const;

const SIZES = {
  sm: "px-2.5 py-1 text-xs font-medium gap-1",
  md: "px-3 py-2 text-sm font-medium gap-1.5",
  lg: "px-4 py-3 text-base font-semibold gap-2",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

/**
 * คลาสของปุ่ม แยกออกมาให้ `<a>` / `<Link>` ที่หน้าตาเป็นปุ่มใช้ร่วมได้
 * — ไม่งั้นลิงก์ที่ดูเหมือนปุ่มจะกลายเป็นสำเนาที่ค่อยๆ เพี้ยนออกไป ซึ่งคือปัญหาเดิมทั้งหมด
 */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex items-center justify-center rounded-control",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** ไอคอนนำหน้าข้อความ — ใช้ชุด SVG ของเครื่องมือ ไม่ใช่อิโมจิ (ดู Icon.tsx) */
  icon?: IconName;
  /** ⚠️ ใช้ *เพิ่ม* เรื่องตำแหน่งในเลย์เอาต์เท่านั้น (flex-1 · w-full · mt-2) — ทับไม่ได้ ดู lib/cn.ts */
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: BaseProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {icon && <Icon name={icon} size={size === "lg" ? "md" : "sm"} />}
      {children}
    </button>
  );
}

/**
 * ปุ่มที่มีแต่ไอคอน — สี่เหลี่ยมจัตุรัส ไม่มีข้อความ
 *
 * 🔴 **`label` เป็น prop ที่บังคับ (required)** ไม่ใช่ทางเลือก — นี่คือเหตุผลหลักที่มีคอมโพเนนต์นี้
 *    ตอนตรวจพบว่า `BookingEditModal.tsx:353` (ปุ่ม ✕ ลบไฟล์แนบ) ไม่มี `aria-label`
 *    ⇒ accessible name ของมันคือ "✕" · การทำให้ TypeScript ปฏิเสธการคอมไพล์ ได้ผลกว่า
 *    การเขียนกติกาไว้ให้คนจำ — **ด่านที่แดงเป็น ดีกว่าย่อหน้าที่เตือน**
 */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-label"> & {
  /** ข้อความที่ screen reader อ่าน — บังคับ ไม่มีค่าปริยาย */
  label: string;
  icon: IconName;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center rounded-control",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        box,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}
