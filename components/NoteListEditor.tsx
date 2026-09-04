"use client";

import { useRef, useState } from "react";
import { noteLines } from "./NoteBody";
import { Button, IconButton } from "./ui/Button";
import { Icon } from "./ui/Icon";

/**
 * แก้โน้ตของจุดแวะ **ทีละข้อ** (ผู้ใช้สั่ง 4 ก.ย. 2026)
 *
 * 🔴 เดิมเป็น `<textarea>` ก้อนเดียวให้พิมพ์ยาว ๆ — แต่ตอน *แสดงผล* `NoteBody` แตกมันเป็น
 *    บุลเล็ตทีละข้ออยู่แล้ว ⇒ **สิ่งที่เห็นกับสิ่งที่แก้เป็นคนละรูปกัน** คนที่อยากเพิ่มหนึ่งข้อ
 *    ต้องเปิดกล่องข้อความยาว หาที่ท้ายสุด แล้วขึ้นบรรทัดใหม่เอง
 *
 * 🎯 **ไม่แตะรูปแบบที่เก็บในฐานเลย** — ยังเป็น text ธรรมดาคั่นด้วย `\n` เหมือนเดิม
 *    ตัวแตก/ตัวรวมใช้ `noteLines()` ตัวเดียวกับที่ `NoteBody` ใช้แสดงผล
 *    ⇒ ไม่มี migration · ไม่มีรูปข้อมูลที่สอง · โน้ตเก่าทุกอันเปิดแก้ได้ทันที
 *    ⚠️ `noteLines()` แตก " · " เป็นคนละข้อด้วย ⇒ โน้ตเก่าที่เขียนติดกันในบรรทัดเดียว
 *       จะกลายเป็นหลายข้อตอนบันทึก **ซึ่งตรงกับที่มันแสดงผลอยู่แล้ว** ไม่ใช่การเปลี่ยนความหมาย
 */
export function NoteListEditor({
  value,
  onSave,
  onCancel,
  canDelete,
}: {
  value: string;
  /** `null` = ลบโน้ตทั้งก้อน */
  onSave: (next: string | null) => void;
  onCancel: () => void;
  canDelete: boolean;
}) {
  const [items, setItems] = useState<string[]>(() => noteLines(value));
  const [draft, setDraft] = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  const commit = (extra?: string) => {
    const all = [...items, ...(extra?.trim() ? [extra.trim()] : [])]
      .map((l) => l.trim())
      .filter(Boolean);
    onSave(all.length ? all.join("\n") : null);
  };

  /** เพิ่มข้อแล้ว **คงโฟกัสไว้ที่ช่องเดิม** — คนพิมพ์รายการมักพิมพ์ติดกันหลายข้อ */
  const addDraft = () => {
    const t = draft.trim();
    if (!t) return;
    setItems((prev) => [...prev, t]);
    setDraft("");
    addRef.current?.focus();
  };

  const field =
    "min-w-0 flex-1 rounded-control border border-line bg-surface-raised px-2 py-1.5 text-sm text-content placeholder:text-content-soft/70 focus:border-maple focus:outline-none";

  return (
    <div className="basis-full space-y-1.5">
      {items.map((line, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Icon name="chevron-right" size="sm" className="text-content-soft/50" />
          <input
            value={line}
            aria-label={`ข้อที่ ${i + 1}`}
            onChange={(e) =>
              setItems((prev) => prev.map((l, j) => (j === i ? e.target.value : l)))
            }
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
            className={field}
          />
          <IconButton
            label={`ลบข้อที่ ${i + 1}`}
            icon="close"
            size="sm"
            onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
          />
        </div>
      ))}

      {/* ช่องเพิ่มข้อใหม่ — Enter = เพิ่มแล้วพร้อมพิมพ์ข้อถัดไปทันที ไม่ใช่บันทึกแล้วปิด */}
      <div className="flex items-center gap-1.5">
        <Icon name="plus" size="sm" className="text-content-soft/50" />
        <input
          ref={addRef}
          autoFocus
          value={draft}
          aria-label="เพิ่มข้อใหม่"
          placeholder={items.length ? "เพิ่มอีกข้อ…" : "เช่น สั่งบิบิมบับหม้อหิน"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
            if (e.key === "Escape") onCancel();
          }}
          className={field}
        />
        <IconButton label="เพิ่มข้อนี้" icon="check" size="sm" onClick={addDraft} disabled={!draft.trim()} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {/* ส่ง draft เข้าไปด้วย — คนที่พิมพ์ข้อสุดท้ายค้างไว้แล้วกดบันทึกเลย ไม่ควรเสียข้อนั้น */}
        <Button variant="pine" size="sm" onClick={() => commit(draft)}>
          บันทึก
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          ยกเลิก
        </Button>
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-alert-ink hover:bg-alert-soft"
            onClick={() => onSave(null)}
          >
            ลบโน้ตทั้งหมด
          </Button>
        )}
      </div>
    </div>
  );
}
