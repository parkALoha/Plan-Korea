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
  /** เนื้อหาใต้แถว เต็มความกว้าง: คำอธิบายยาว · โน้ต · ปุ่ม */
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
              {time && (
                <span className="text-xs tabular-nums text-content-soft">
                  <span className="font-semibold text-content">{time}</span>
                  {endTime && <> → {endTime}</>}
                </span>
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
