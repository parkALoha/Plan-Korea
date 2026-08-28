"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnchoredPanel } from "@/components/AnchoredPanel";

export type DropdownOption = {
  value: string;
  label: string;
  /** ข้อความรองต่อท้ายชื่อ เช่น "(เพิ่มไว้แล้ว)" — แสดงจาง ๆ ไม่ใช่ส่วนหนึ่งของชื่อ */
  hint?: string;
  disabled?: boolean;
};

/**
 * ดรอปดาวน์ของเราเอง — ผู้ใช้สั่ง 28 ส.ค. 2026: *"ทำ dropdown ของเราเองสิ"*
 * เดิมใช้ `<select>` ของเบราว์เซอร์ ซึ่งวาดด้วย native UI ของ OS: **ธีม/ฟอนต์/สีของเราไม่มีผลกับมันเลย**
 * และบนมือถือมันเด้ง picker เต็มจอของระบบขึ้นมาแทน ทำให้หน้าตาไม่ตรงกับส่วนอื่นของเว็บ
 *
 * 🔴 **แผ่นรายการ portal ออกไปที่ `body` แล้ววางตำแหน่งเอง — ดู `AnchoredPanel`**
 * ⚠️ **ข้อความเดิมตรงนี้เขียนว่าใช้ in-flow ("ดันเนื้อหาลง") และปฏิเสธ portal ว่า "แพงกว่าและพังง่าย"
 *    — หมดอายุแล้ว ห้ามอ้างอิง** · เก็บไว้เป็นบันทึกว่าทำไมถึงเปลี่ยน ไม่ใช่ทางเลือกที่ยังเปิดอยู่
 * · เหตุผลเดิมที่ **ยังจริง**: เนื้อโมดัลเป็น `overflow-y-auto` (`Modal.tsx`) → ลูกที่ `absolute`
 *   **ถูกเฉือนที่ขอบกล่องที่เลื่อนได้** โดยไม่มีอะไรเตือน · นั่นคือเหตุที่ทั้ง in-flow และ portal ถูก
 *   เลือกมาก่อน `absolute` ธรรมดา
 * · เหตุผลที่ **ทิ้ง in-flow**: ผู้ใช้รายงาน 28 ส.ค. 2026 — *"กด dropdown แล้วมันเด้ง"* · การดันเนื้อหาลง
 *   ทำให้ทั้งโมดัลกระโดดทุกครั้งที่เปิดรายการ **ซึ่งแพงกว่าที่ประเมินไว้ตอนเลือกมัน**
 * · จำกัดสูงด้วย `max-h-56` + เลื่อนในตัว เพื่อไม่ให้รายการ 22 เมืองยาวเกินจอ
 *
 * แพทเทิร์น a11y: combobox + `aria-activedescendant` — **โฟกัสค้างที่ปุ่มเสมอ ไม่ย้ายเข้าไปในรายการ**
 * (ง่ายกว่าและไม่มีบั๊กโฟกัสหลุดตอนปิด) · คีย์บอร์ด: `↓/↑/Enter/Space` เปิด · `↓/↑` เลื่อน · `Enter/Space`
 * เลือก · `Esc` ปิด · `Tab` ปิดแล้วไปช่องถัดไป
 */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  id,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const autoId = useId();
  const baseId = id ?? `dd${autoId.replace(/:/g, "")}`;
  const listId = `${baseId}-list`;

  const selected = options.find((o) => o.value === value) ?? null;

  // เลื่อนตัวที่ไฮไลต์ให้อยู่ในสายตาเวลาใช้คีย์บอร์ด
  // (การปิดเมื่อคลิกนอก + การวางตำแหน่งแผ่น เป็นหน้าที่ของ `AnchoredPanel` แล้ว)
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector(`[data-idx="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function firstEnabled(): number {
    const i = options.findIndex((o) => !o.disabled);
    return i >= 0 ? i : 0;
  }

  function nextEnabled(cur: number, dir: 1 | -1): number {
    for (let i = cur + dir; i >= 0 && i < options.length; i += dir) {
      if (!options[i].disabled) return i;
    }
    return cur;
  }

  function openList() {
    if (disabled) return;
    const sel = options.findIndex((o) => o.value === value && !o.disabled);
    setHighlight(sel >= 0 ? sel : firstEnabled());
    setOpen(true);
  }

  function choose(i: number) {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(highlight);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((c) => nextEnabled(c, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((c) => nextEnabled(c, -1));
    }
  }

  return (
    <div className={className}>
      <button
        ref={buttonRef}
        type="button"
        id={baseId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${baseId}-opt-${highlight}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-left text-sm text-content hover:border-maple/50 focus:border-maple focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`truncate ${selected ? "text-content" : "text-content-soft"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span aria-hidden className={`shrink-0 text-xs text-content-soft ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <AnchoredPanel
          anchorRef={buttonRef}
          onClose={() => setOpen(false)}
          matchWidth
          className="rounded-lg border border-line bg-surface-raised py-1 shadow-lg shadow-ink/10"
        >
        <ul
          ref={panelRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isHighlighted = i === highlight;
            return (
              <li
                key={o.value}
                id={`${baseId}-opt-${i}`}
                data-idx={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onPointerDown={(e) => {
                  // กัน blur/โฟกัสหลุดจากปุ่ม — เลือกด้วย pointerdown ให้ทันก่อนเบราว์เซอร์ย้ายโฟกัส
                  e.preventDefault();
                  choose(i);
                }}
                // 🔴 **ต้องมี `onClick` ด้วย ไม่ใช่ `onPointerDown` อย่างเดียว** (P1 เจอ 28 ส.ค. 2026)
                // ของที่ยิง `click` โดยไม่มี pointer event นำหน้า — **voice control · AT บางตัว · ส่วนขยาย
                // เบราว์เซอร์ · เครื่องมือทดสอบ** — จะกดตัวเลือกนี้ไม่ได้เลย และ **เงียบสนิท ไม่มี error**
                // ผู้ใช้เมาส์/นิ้ว/คีย์บอร์ดไม่เคยเจอ จึงไม่มีใครรายงาน
                // 📌 ไม่ยิงซ้อนกับ pointerdown: พอ pointerdown เลือกเสร็จ ลิสต์ปิดทันที `<li>` ถูกถอดออก
                //    จาก DOM ก่อน `click` จะมาถึง — เส้นนี้จึงทำงานเฉพาะตอนที่ไม่มี pointerdown จริง ๆ
                onClick={() => choose(i)}
                onPointerEnter={() => !o.disabled && setHighlight(i)}
                className={`flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm ${
                  o.disabled
                    ? "cursor-not-allowed text-content-soft/50"
                    : isHighlighted
                      ? "bg-maple-soft text-maple-dark"
                      : "text-content"
                } ${isSelected && !o.disabled ? "font-semibold" : ""}`}
              >
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-content-soft">{o.hint}</span>}
                {isSelected && (
                  <span aria-hidden className="ml-auto shrink-0 text-xs text-maple-dark">
                    ✓
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        </AnchoredPanel>
      )}
    </div>
  );
}
