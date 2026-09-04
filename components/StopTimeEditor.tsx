"use client";

import { useState } from "react";
import { Button } from "./ui/Button";

/**
 * กรอก/แก้ **เวลาถึง** และ **เวลาสิ้นสุด** ของจุดแวะหนึ่งจุด
 * (ผู้ใช้สั่ง 4 ก.ย. 2026: "เวลาถึง และเวลาสิ้นสุด ของแต่ละจุด ผู้ใช้ควรจะกรอกเองแก้เองได้")
 *
 * 🎯 **แนวคิด: หมุด ไม่ใช่ระบบที่สอง** — ตารางยังเป็นใบเดียวและยังไหลเหมือนเดิมทุกประการ
 *    การกรอกเวลาแค่ *ตัด cursor* มาเริ่มที่จุดนั้น จุดถัดไปไหลต่อจากหมุด
 *    ⇒ ไม่มีโหมด "ตารางอัตโนมัติ" กับ "ตารางมือ" ให้ผู้ใช้ต้องเลือก ซึ่งเป็นทางที่ตั้งใจไม่เอา
 *
 * 🔴 ช่องว่าง = ปลดหมุด (กลับไปใช้ค่าคำนวณ) ไม่ใช่ "เที่ยงคืน" — ตัวเรียกแปลง `""` เป็น `null`
 *    ก่อนส่งลงฐาน เพราะคอลัมน์มี CHECK รูปแบบเวลา (migration 0032) `""` จะถูกปฏิเสธทั้งคำสั่ง
 *
 * 🔴 **ซิงก์ค่าจากฐานด้วย `key` ที่ตัวเรียก ไม่ใช่ `useEffect` ที่ setState**
 *    อีกคนแก้เวลาผ่าน Realtime ระหว่างช่องเปิดอยู่ได้ · ท่า effect+setState ถูก eslint ของ
 *    เวอร์ชันนี้ห้ามไว้ (`react-hooks/set-state-in-effect`) และห้ามถูก — remount ให้ผลเดียวกัน
 *    โดยไม่ต้องมีเรนเดอร์รอบที่ทิ้ง
 *
 * ⚠️ `<input type="time">` เท่านั้น ไม่ทำตัวเลือกเอง — มันเรียกแป้นเวลาของ OS ขึ้นมาให้บนมือถือ
 *    ซึ่งเป็นอุปกรณ์ที่หน้านี้ถูกใช้จริงตอนอยู่เกาหลี · และ `color-scheme` ที่ตั้งไว้ใน
 *    `globals.css` ทำให้ตัวเลือกของ OS เป็นธีมมืดตามหน้าเว็บด้วย
 */
export function StopTimeEditor({
  start,
  end,
  computedStart,
  computedEnd,
  onSave,
  onCancel,
}: {
  /** ค่าที่ปักไว้ตอนนี้ — null = ยังไม่เคยปัก */
  start: string | null;
  end: string | null;
  /** เวลาที่ตารางคำนวณให้ — ใช้เป็น placeholder ให้เห็นว่า "ถ้าไม่ปัก จะได้เท่านี้" */
  computedStart: string;
  computedEnd: string;
  onSave: (next: { start: string | null; end: string | null }) => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState(start ?? "");
  const [e, setE] = useState(end ?? "");

  const changed = (s || null) !== start || (e || null) !== end;

  return (
    <div className="flex flex-col gap-2 border-t border-line bg-surface-soft/40 px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-2xs font-semibold text-content-soft">
          เวลาถึง
          <input
            type="time"
            value={s}
            onChange={(ev) => setS(ev.target.value)}
            className="rounded-control border border-line bg-surface-raised px-2 py-1.5 text-base tabular-nums text-content focus:border-maple focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-2xs font-semibold text-content-soft">
          เวลาสิ้นสุด
          <input
            type="time"
            value={e}
            onChange={(ev) => setE(ev.target.value)}
            className="rounded-control border border-line bg-surface-raised px-2 py-1.5 text-base tabular-nums text-content focus:border-maple focus:outline-none"
          />
        </label>
      </div>

      {/* บอกว่า *ถ้าไม่ปัก จะได้เท่าไหร่* — ไม่งั้นผู้ใช้ไม่มีทางรู้ว่าการล้างช่องแปลว่าอะไร */}
      <p className="text-2xs leading-relaxed text-content-soft">
        เว้นว่าง = ให้คำนวณให้เอง (ตอนนี้ได้{" "}
        <span className="tabular-nums font-semibold">
          {computedStart}–{computedEnd}
        </span>
        ) · กรอกเวลาถึงแล้วจุดถัดไปจะไหลต่อจากเวลานั้น
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onSave({ start: s || null, end: e || null })} disabled={!changed}>
          บันทึก
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          ยกเลิก
        </Button>
        {(start || end) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSave({ start: null, end: null })}
            className="ml-auto"
          >
            ล้างเวลาที่กรอกไว้
          </Button>
        )}
      </div>
    </div>
  );
}
