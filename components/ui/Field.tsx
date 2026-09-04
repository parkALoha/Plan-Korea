"use client";

import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/**
 * ช่องกรอกของทั้งเว็บ + ป้ายกำกับที่ *ผูกกับช่องจริง* (เฟส A3 · 4 ก.ย. 2026)
 *
 * 🔴 **ปัญหาที่ไฟล์นี้มีไว้แก้ — วัดได้ 20 จุด:**
 *    `<label>` ทั้งเว็บมี 27 อัน · ผูกด้วย `htmlFor` แค่ 2 · ห่อ field ไว้ 5 · **เหลือ 20 อัน
 *    ที่เป็นแค่ข้อความลอยข้างช่อง ไม่ได้ผูกกับอะไรเลย** ⇒ screen reader อ่านช่องนั้นว่า
 *    "edit, blank" — ผู้ใช้ที่มองไม่เห็นไม่มีทางรู้ว่าช่องนี้ให้กรอกอะไร
 *      BookingEditModal 11 จุด · IntercityEditModal 4 · TransferEditModal 3 ·
 *      HotelEditModal 1 · PlanEditModal 1
 *
 * 🎯 **วิธีแก้คือทำให้ "ผูกถูก" เป็นค่าปริยาย ไม่ใช่สิ่งที่ต้องจำ** — `Field` สร้าง id ด้วย
 *    `useId()` แล้วส่งให้ลูกผ่าน context ⇒ call site เขียนแค่ `<Field label="..."><Input/></Field>`
 *    ไม่มีอะไรให้ลืม เพราะไม่มีอะไรให้พิมพ์
 *
 * ⚠️ `Input`/`Textarea`/`Select` ใช้นอก `Field` ได้ (เช่นช่องค้นหาที่มีไอคอนแทนป้าย) —
 *    กรณีนั้น **ต้องใส่ `aria-label` เอง** ไม่งั้นจะกลับไปเป็นปัญหาเดิม
 */

type FieldCtx = { id: string; describedBy?: string };
const FieldContext = createContext<FieldCtx | null>(null);

/** class ของตัวควบคุม — เดิมถูกก๊อปแบบตัวอักษรต่อตัวอักษรไป 21 ที่ */
const CONTROL =
  "w-full rounded-control border border-line bg-surface-raised px-3 py-2 text-sm text-content " +
  "placeholder:text-content-soft/70 focus:border-maple focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  /** คำอธิบายใต้ช่อง — ผูกด้วย aria-describedby ให้ screen reader อ่านต่อจากป้าย */
  hint?: ReactNode;
  /** ข้อความผิดพลาด — แทนที่ hint และได้ role="alert" เพราะมันโผล่มาเองหลังผู้ใช้ทำอะไรบางอย่าง */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-xs font-medium text-content-soft">
        {label}
      </label>
      <FieldContext.Provider value={{ id, describedBy }}>{children}</FieldContext.Provider>
      {error ? (
        <p id={hintId} role="alert" className="text-2xs text-alert-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-2xs text-content-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** ดึง id/describedBy จาก Field ที่ครอบอยู่ · คืน {} เมื่อใช้เดี่ยวๆ (ต้องใส่ aria-label เอง) */
function useFieldBinding() {
  const ctx = useContext(FieldContext);
  return ctx ? { id: ctx.id, "aria-describedby": ctx.describedBy } : {};
}

export function Input({
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & { className?: string }) {
  return <input {...useFieldBinding()} className={cn(CONTROL, className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & { className?: string }) {
  return (
    <textarea
      {...useFieldBinding()}
      className={cn(CONTROL, "resize-y leading-relaxed", className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & { className?: string }) {
  return (
    <select {...useFieldBinding()} className={cn(CONTROL, className)} {...rest}>
      {children}
    </select>
  );
}
