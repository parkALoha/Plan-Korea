import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * เปลือกการ์ด (เฟส A3 · 4 ก.ย. 2026)
 *
 * `rounded-2xl border border-line bg-surface-raised` ถูกก๊อปไป 10 ที่
 * (PlaceSidebar · DayCardSkeleton · app/today ×4 · app/summary ×4)
 *
 * `elevation` ผูกกับโทเคน 3 ระดับใน globals.css ที่ *พลิกตามธีม* — ของเดิมใช้เงา 9 รูปแบบ
 * ปนสองระบบ (ขนาด sm/md/lg/2xl กับ สี+alpha ink/5 ink/10 ink/20 ink/30 maple/20) และ
 * `shadow-ink/5` ไม่ระบุขนาดเลย ⇒ ไม่มีอะไรบอกว่าอะไรควรลอยเหนืออะไร
 *
 * ⚠️ ค่าปริยายคือ `flat` (ไม่มีเงา) เพราะดีไซน์เว็บนี้พึ่ง *เส้นขอบ* ไม่ใช่เงา — เงาทั้งเว็บ
 *    รวมกันมีแค่ 16 จุด นั่นเป็นทางเลือกที่เข้ากับโทนกระดาษ/ครีม และตั้งใจรักษาไว้
 */
export function Card({
  as: Tag = "div",
  elevation = "flat",
  className,
  children,
  ...rest
}: {
  /** เปลี่ยนแท็กได้เมื่อการ์ดเป็นส่วนของโครงเอกสารจริง (section / article / li) */
  as?: "div" | "section" | "article" | "li";
  elevation?: "flat" | "raised" | "overlay";
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-line bg-surface-raised",
        elevation === "raised" && "shadow-raised",
        elevation === "overlay" && "shadow-overlay",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
