"use client";

import { useState } from "react";

export type InsertAction = {
  label: string;
  /** maple = แทรกสถานที่ (งานหลัก) · pine = แถวพิเศษ (ที่พัก/ข้ามเมือง) */
  tone: "maple" | "pine";
  onClick: () => void;
};

/**
 * แถวคั่นระหว่างจุดแวะสองจุด — กดปุ่ม + ก่อนถึงจะกางตัวเลือกว่าจะแทรกอะไร (เฟส 20.3)
 *
 * เดิมโชว์ปุ่มตัวหนังสือ 11px สามอันเรียงกัน **ทุกช่องว่างระหว่างจุด** — วันที่มี 6-7 จุด
 * จะมีแถวแบบนี้ 6-7 แถว กลายเป็นกำแพงตัวหนังสือที่กินพื้นที่แนวตั้งมากกว่าตัวจุดแวะเองอีก
 * และทำให้อ่านลำดับของวันยากขึ้นทั้งที่นั่นคือสิ่งที่ต้องอ่าน
 */
export function InsertBetweenRow({ actions }: { actions: InsertAction[] }) {
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 bg-surface-soft/30 px-3 sm:px-4">
      {open ? (
        <>
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className={`py-2 text-2xs font-medium hover:underline sm:py-1 ${
                action.tone === "maple" ? "text-maple" : "text-pine-dark"
              }`}
            >
              {action.label}
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="py-2 text-2xs text-content-soft hover:underline sm:py-1"
          >
            ยกเลิก
          </button>
        </>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="แทรกจุดแวะตรงนี้"
          /* before:-inset-[12px] ขยายพื้นที่แตะจาก 20×20 เป็น 44×44 โดยวงกลมที่มองเห็นเท่าเดิม
             — ท่าเดียวกับช่องติ๊กใน ChecklistPanel.tsx:101 (ใช้ padding/margin ติดลบแทน
             จะไปดันแถวให้สูงขึ้น ซึ่งย้อนแย้งกับเหตุผลที่ปุ่มนี้ถูกทำให้เล็กตั้งแต่แรก)
             วัดก่อนแก้: 20×20 คือเป้าที่เล็กที่สุดในหน้าแผน และมี 62 จุด */
          className="relative my-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-line text-2xs leading-none text-content-soft/50 before:absolute before:-inset-[12px] before:content-[''] hover:border-maple hover:bg-surface-raised hover:text-maple"
        >
          +
        </button>
      )}
    </div>
  );
}
