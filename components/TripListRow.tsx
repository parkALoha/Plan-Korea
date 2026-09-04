import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * แถวรายการของทั้งเว็บ (ผู้ใช้สั่งให้ยุบรวม 4 ก.ย. 2026)
 *
 * 🔴 **ก่อนหน้านี้ของอย่างเดียวกันถูกวาดด้วยโค้ดคนละชุด 4 ที่:**
 * ```
 *   components/DayEventsPanel.tsx     ตารางบิน/เวลาตายตัวของวัน      ✅ ยุบแล้ว
 *   components/SortableStopRow.tsx    จุดแวะในหน้าแผน (4 กรณี)        ✅ ยุบแล้ว
 *   app/(app)/summary/page.tsx        เวลาตายตัว + จุดแวะรายวัน        ✅ ยุบแล้ว (2 ลิสต์)
 *   app/(app)/today/page.tsx          "ถัดจากนี้" / "ผ่านมาแล้ว"      ⛔ **ตั้งใจไม่ยุบ**
 * ```
 * ⛔ **ทำไม `/today` ไม่ยุบเข้ามา** — สองลิสต์นั้นไม่มีรูปโดยตั้งใจ มีแค่เวลา+ชื่อ
 *    เพราะหน้านั้นมีการ์ด "จุดถัดไป" เป็นตัวเอกอยู่แล้ว ลิสต์ที่เหลือทำหน้าที่ *กวาดตาดู*
 *    ไม่ใช่ *อ่านละเอียด* · ยัดรูป 96px เข้าไปด้วยเหตุผลว่า "ต้องเหมือนกัน" จะทำให้หน้ายาวขึ้น
 *    เท่าตัวและเสียหน้าที่ของมัน
 *    🎯 **"ใช้คอมโพเนนต์เดียวกัน" กับ "หน้าตาเหมือนกัน" ไม่ใช่เรื่องเดียวกัน** — สิ่งที่ต้องรวม
 *       คือของที่ทำงานเดียวกัน ไม่ใช่ของที่บังเอิญเป็นลิสต์เหมือนกัน
 * ⇒ ขอปรับดีไซน์ทีหนึ่งต้องไล่แก้ 4 ที่ · และมันเพี้ยนจากกันไปเรื่อย ๆ จนผู้ใช้ทักว่า
 *   *"มันคนละชนิดกันหรอ มันควรจะเหมือนกันนะ"* — ซึ่งถูก
 *
 * 🎯 **เลย์เอาต์ที่ตกลงกัน (ผู้ใช้ออกแบบเอง):**
 * ```
 * ┌──────────┬─────────────────────────────────────┬────┐
 * │          │ 15:30 → 16:00                    ✏️ │    │  ← เวลาซ้ายบน · สถานะ/ที่จับ ขวาบน
 * │  รูป 96  │ 🏛️ ชื่อสถานที่                       │    │
 * │  ชิดซ้าย │ 📍 คำอธิบายรอง                       │    │
 * └──────────┴─────────────────────────────────────┴────┘
 *   คำอธิบายยาว ๆ / โน้ต / ปุ่ม  ← children เต็มความกว้าง
 * ```
 * · **รูปชิดซ้ายสุด** เพราะของเดิมมีคอลัมน์ไอคอน+เวลาคั่นก่อน ⇒ วัดจริงที่จอ 375px
 *   ช่องชื่อเหลือ 121px และชื่อถูกตัดทุกอัน
 * · `corner` อยู่ขวาบนเสมอ — 🔒 (ตั๋วจองแล้ว) หรือที่จับลาก ⠿
 * · ความหนาแน่นคุมโดย *ที่เรียก* ผ่าน `leading` — หน้าแผนใช้รูป 96px (หน้าแก้)
 *   `/summary` ใช้ 48px (หน้าอ่าน/สั่งพิมพ์ · รูปใหญ่ขึ้นเท่าตัวจะดันเอกสารที่พิมพ์ให้ยาวขึ้น
 *   โดยไม่เพิ่มข้อมูล) — **เลย์เอาต์ชุดเดียวกัน ความหนาแน่นต่างกันได้**
 *
 * ⚠️ **คอมโพเนนต์นี้ไม่รู้จัก `stop`/`event`** โดยตั้งใจ — รับแต่ชิ้นส่วนที่จะแสดง
 *   ที่เรียกเป็นคนแปลงข้อมูลของตัวเองให้ ⇒ เพิ่มลิสต์ที่ห้าได้โดยไม่ต้องแตะไฟล์นี้
 */
/** กล่องเวลา — เป็นปุ่มเมื่อมี `onClick` เป็นข้อความเฉย ๆ เมื่อไม่มี · รูปร่างเดียวกันทั้งสองทาง */
function TimeBox({
  onClick,
  label,
  children,
}: {
  onClick?: () => void;
  label?: string;
  children: ReactNode;
}) {
  const cls = "flex shrink-0 items-baseline gap-1 whitespace-nowrap tabular-nums";
  if (!onClick) return <span className={cls}>{children}</span>;
  /* `before:-inset-*` ขยาย *พื้นที่แตะ* โดยไม่ขยับเลย์เอาต์ — ตัวเลข 19px สูงราว 22px
     ซึ่งต่ำกว่า 44pt ที่นิ้วโป้งต้องการ และแถวนี้ถูกกดตอนเดินอยู่จริง */
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        cls,
        "relative rounded-md text-left before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-[''] hover:bg-surface-soft"
      )}
    >
      {children}
    </button>
  );
}

export function TripListRow({
  leading,
  time,
  endTime,
  corner,
  title,
  subtitle,
  onOpen,
  openLabel,
  muted,
  className,
  detail,
  actions,
  onTimeClick,
  timeLabel,
  timeNote,
  children,
}: {
  /** รูปย่อหรือกรอบไอคอน — ควรกว้าง 96px (`PlaceThumb size="2xl"`) ให้ทุกแถวตรงคอลัมน์กัน */
  leading: ReactNode;
  time?: ReactNode;
  /** เวลาสิ้นสุด — แสดงต่อท้ายด้วย → เมื่อมี */
  endTime?: ReactNode;
  /** มุมขวาบน: 🔒 · ✏️ · ที่จับลาก · ปุ่มลบ */
  corner?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** ใส่แล้วทั้งรูปและชื่อกดได้ — ไม่ใส่ = แถวอ่านอย่างเดียว */
  onOpen?: () => void;
  /** ชื่อที่ screen reader อ่านสำหรับ *รูป* — ชื่อเรื่องอ่านตัวเองได้อยู่แล้ว */
  openLabel?: string;
  muted?: boolean;
  className?: string;
  /**
   * ย่อหน้าคำอธิบาย/โน้ต — **สไตล์มาจากที่นี่ ไม่ใช่จากที่เรียก**
   *
   * 🔴 เพิ่ม 4 ก.ย. 2026 เพราะผู้ใช้ทักว่า *"รูปแบบการแสดงข้อความมันยังไม่เหมือนกันเลย
   *    เหมือนกับไม่ได้ใช้ component เดียวกัน"* — ซึ่งถูก · รอบแรกผมยุบแค่ *หัวแถว*
   *    ส่วนเนื้อใต้แถวปล่อยเป็น `children` ให้แต่ละที่จัดเอง ⇒ มันเลยไม่เหมือนกันอยู่ดี
   *      เวลาตายตัว  ย่อหน้าธรรมดา เต็มความกว้าง
   *      จุดแวะ      กล่องมีขอบซ้าย + เยื้อง pl-10 (ระยะที่จัดให้ตรงกับคอลัมน์แบบเก่าที่ไม่มีแล้ว)
   * 🎯 **ยุบโครงแล้วไม่ยุบสไตล์ ได้ความเหมือนกันแค่ครึ่งเดียว — และครึ่งที่เหลือคือครึ่งที่ตาเห็น**
   */
  detail?: ReactNode;
  /** แถวปุ่มใต้คำอธิบาย (ปรับเวลา · เพิ่มรูป · ลบ) — แยกจาก `detail` เพราะปุ่มไม่ใช่ข้อความ */
  actions?: ReactNode;
  /**
   * ใส่แล้ว *เวลา* กดได้ เพื่อกรอก/แก้เอง (ผู้ใช้สั่ง 4 ก.ย. 2026)
   * ⚠️ ไม่เกิด button ซ้อน button — `onOpen` ห่อเฉพาะ *รูป* กับ *ชื่อเรื่อง* ไม่ได้ห่อทั้งแถว
   */
  onTimeClick?: () => void;
  /** ชื่อที่ screen reader อ่านสำหรับปุ่มเวลา — ตัวเลขอย่างเดียวไม่บอกว่ากดแล้วได้อะไร */
  timeLabel?: string;
  /** ป้ายเล็กข้างเวลา — 📌 กรอกเอง · ⚠️ ไปไม่ทัน · บอก *ที่มาของตัวเลข* ไม่ใช่ของตกแต่ง */
  timeNote?: ReactNode;
  /** เนื้อหาอื่นที่ไม่เข้าสองช่องบน — ตัวแก้ที่กางเต็ม · แผงคำแนะนำ */
  children?: ReactNode;
}) {
  return (
    <div className={cn(muted && "opacity-80", className)}>
      <div className="flex items-start gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
        {/* รูปกดได้ด้วยเมื่อแถวเปิดรายละเอียดได้ — คนแตะรูปคาดหวังว่ามันจะเปิด
            ต้องมี aria-label เพราะรูปย่อไม่มีข้อความในตัว (ชื่อเรื่องเป็นปุ่มของมันเอง) */}
        {onOpen ? (
          <button type="button" onClick={onOpen} aria-label={openLabel} className="shrink-0">
            {leading}
          </button>
        ) : (
          leading
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {(time || corner) && (
            <div className="flex items-start gap-2">
              {/* 🔴 เวลาคือสิ่งที่ตาหาก่อนเสมอในลิสต์ตารางเวลา — ของเดิมเป็น `text-xs` (13px)
                  เท่ากับ *บรรทัดรอง* และเล็กกว่า *ชื่อเรื่อง* ⇒ มันหายไปในแถว
                  (ผู้ใช้ทัก 4 ก.ย. 2026 ว่า "การวางตำแหน่งเวลา ยังไม่เด่นเลย")
                  ⇒ 16px ตัวหนา + สีเน้น · เวลาสิ้นสุดเล็กลงหนึ่งขั้นเพราะเป็นข้อมูลรอง
                  🔴 **เน้นด้วย *ขนาด* ไม่ใช่ด้วย *สี*** — ลองสีเน้น (`panel-maple-ink`) ก่อนแล้ว
                     วัดในเบราว์เซอร์ได้ **1.15:1** บนแถวเตือน เพราะแถวนั้นมีพื้นของตัวเอง
                     ⇒ สีที่ผ่านบนพื้นหลัก ไม่ได้แปลว่าผ่านบนทุกพื้นที่แถวนี้ไปวางได้
                     ส่วน `text-content` คู่กับ `--surface*` เป็นคู่หลักของระบบ ⇒ ผ่านทุกพื้นโดยโครงสร้าง
                     · และขนาดยังทำงานตอนพิมพ์ขาวดำ กลางแดด และกับคนตาบอดสี ซึ่งสีไม่ทำ */}
              {time && (
                /* 🔴 `shrink-0 whitespace-nowrap` ไม่ใช่ของประดับ — ผู้ใช้เจอ "18:52 / → 20:07"
                     ตกคนละบรรทัดจริง (4 ก.ย. 2026) · ช่วงเวลาหนึ่งช่วงต้องอ่านเป็น *ก้อนเดียว*
                     ไม่งั้นตาอ่านเป็นเวลาสองอันคนละเรื่อง — และมันจะเกิดเฉพาะแถวที่มีเวลาจบ
                     ซึ่งเป็นส่วนน้อย ⇒ หลุดรีวิวได้ง่ายมาก */
                <TimeBox onClick={onTimeClick} label={timeLabel}>
                  <span className="text-lg font-bold leading-none text-content">{time}</span>
                  {endTime && (
                    <span className="text-2xs font-medium text-content-soft">→ {endTime}</span>
                  )}
                  {timeNote}
                </TimeBox>
              )}
              {corner && <span className="ml-auto flex shrink-0 items-center gap-1">{corner}</span>}
            </div>
          )}

          {onOpen ? (
            <button type="button" onClick={onOpen} className="min-w-0 text-left">
              <span className="block font-semibold text-content hover:underline">{title}</span>
              {subtitle && (
                <span className="block truncate text-xs text-content-soft">{subtitle}</span>
              )}
            </button>
          ) : (
            <>
              <span className="block font-semibold text-content">{title}</span>
              {subtitle && (
                <span className="block truncate text-xs text-content-soft">{subtitle}</span>
              )}
            </>
          )}
        </div>
      </div>

      {detail && (
        <div className="px-3 pb-2.5 text-xs leading-relaxed text-content-soft sm:px-4">{detail}</div>
      )}
      {actions && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5 sm:px-4">{actions}</div>
      )}
      {children}
    </div>
  );
}

/**
 * กรอบไอคอนขนาดเท่ารูปย่อ — แถวที่ไม่มีรูปต้องกินที่เท่ากัน ไม่งั้นคอลัมน์เยื้องกันทั้งลิสต์
 *
 * `size` ต้องตรงกับ `PlaceThumb size` ที่ลิสต์เดียวกันใช้ — ผู้เรียกเป็นคนคุมความหนาแน่น
 * (หน้าแผนใช้ `2xl` 96px · `/summary` ใช้ `md` 48px เพราะเป็นหน้าอ่าน/สั่งพิมพ์ ไม่ใช่หน้าแก้)
 */
export function RowIconBox({
  size = "2xl",
  children,
}: {
  size?: "md" | "2xl";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-pine-soft/50",
        size === "md" ? "h-12 w-12 text-xl" : "h-24 w-24 text-3xl",
      )}
    >
      {children}
    </span>
  );
}
