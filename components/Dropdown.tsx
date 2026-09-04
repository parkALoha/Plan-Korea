"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnchoredPanel } from "@/components/AnchoredPanel";
import { E5_COPY } from "@/lib/i18n";

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
 * · จำกัดสูงด้วยเพดาน `PANEL_MAX_H` + เลื่อนในตัว เพื่อไม่ให้รายการ 22 เมืองยาวเกินจอ
 *
 * 🔍 **พิมพ์ค้นหาได้เมื่อตัวเลือก ≥ `SEARCH_FROM`** · รายการสั้น ๆ ไม่ได้ช่องค้นหา เพราะมันเป็นเสียงรบกวน
 * — เลื่อนตาสองบรรทัดเร็วกว่าพิมพ์
 *
 * 🔴 **ช่องพิมพ์อยู่ที่ *ตัวช่องเลือก* ไม่ใช่แถวพิเศษในแผ่น** (ผู้ใช้สั่ง 28 ส.ค. 2026:
 * *"การพิมพ์ค้นหาควรอยู่ในช่องเลือกเมืองเลย ไม่ควร dropdown ช่องกรอกลงมา"*)
 * ⚠️ **ฉบับก่อนหน้าวางช่องค้นหาเป็นแถวแรกในแผ่น — ห้ามกลับไปทำแบบนั้น** มันทำให้เห็นช่องกรอก
 * *สองช่อง* ซ้อนกัน (ช่องเลือก + ช่องค้นหา) ทั้งที่ผู้ใช้กำลังกรอกอยู่ช่องเดียว
 *
 * **จึงมีตัวกด 2 ชนิด และนี่คือของที่ต้องระวังเวลาแก้ไฟล์นี้:**
 * · `variant="field"` + ค้นหาได้ → **ตัวช่องเองเป็น `<input>`** พิมพ์ทับได้เลย โฟกัสอยู่ที่นั่นตลอด
 * · `variant="inline"` หรือรายการสั้น → เป็น `<button>` เหมือนเดิม โฟกัสค้างที่ปุ่ม ไม่ย้ายเข้ารายการ
 * 🎯 `inline` ไม่ใช้ `<input>` เพราะมันคือ **หัวข้อตัวใหญ่ของการ์ดวัน ไม่ใช่ช่องกรอก** — ยัดกล่องอินพุต
 *   ลงไปแล้วลำดับความสำคัญของหัวการ์ดหายทันที (P1 ชี้ 28 ส.ค. 2026) · `inline` ที่ยาวจึงใช้
 *   ไฮไลต์+เลื่อนอย่างเดียว ไม่มีช่องค้นหา
 *
 * แพทเทิร์น a11y: combobox + `aria-activedescendant` — **โฟกัสไม่เคยย้ายเข้าไปในรายการ**
 * คีย์บอร์ด: `↓/↑/Enter/Space` เปิด · `↓/↑` เลื่อน · `Enter` เลือก · `Esc` ปิด · `Tab` ปิดแล้วไปช่องถัดไป
 * (`Space` เลือกได้เฉพาะตัวกดที่ *ไม่ใช่* `<input>` — ไม่งั้นพิมพ์ชื่อที่มีเว้นวรรคไม่ได้)
 */

/** เพดานความสูงของแผ่น — ~6 แถว แล้วเลื่อนเอา */
const PANEL_MAX_H = 264;
/** จำนวนตัวเลือกที่เริ่มพิมพ์ค้นหาได้ */
const SEARCH_FROM = 8;

/** ตัดช่องว่างและเคสออกก่อนเทียบ — ไทยไม่มีเคส แต่ชื่ออังกฤษ/โรมันจิในคลังมี */
function norm(t: string): string {
  return t.toLowerCase().replace(/\s+/g, "");
}

export function Dropdown({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  id,
  ariaLabel,
  variant = "field",
  emphasis = "quiet",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  /**
   * หน้าตาของตัวกด — **รายการที่กางออกเหมือนกันทั้งสองแบบ ต่างแค่ตัวกด**
   * · `"field"` (ค่าเริ่มต้น) — กล่องอินพุตมีขอบ ใช้ในฟอร์ม · ตัวเลือกเยอะจะพิมพ์ค้นหาในช่องได้เลย
   * · `"inline"` — ข้อความล้วนสืบสีจากพ่อ + เส้นใต้ประ + `▾` · สำหรับที่ที่**ค่านั้นคือหัวข้อ ไม่ใช่ช่องกรอก**
   *   🔴 มีเพราะหัวการ์ดวันแสดงชื่อเมืองเป็นหัวข้อตัวใหญ่มาตลอด · ยัดกล่องอินพุตสีขาวลงไปแทน
   *   ทำให้ **ลำดับความสำคัญของหัวการ์ดหายไป** และวันที่ยังไม่ระบุเมืองดูเหมือนฟอร์มที่ยังกรอกไม่เสร็จ
   *   ทั้งที่มันคือ *สถานะปกติ* ของทุกวันในทริปใหม่ (P1 ชี้ 28 ส.ค. 2026)
   */
  variant?: "field" | "inline";
  /**
   * น้ำหนักของตัวกดตอน `variant="inline"` — `E5`/UX · 4 ก.ย. 2026
   * · `quiet` (ค่าเริ่มต้น) = เส้นประใต้ข้อความ · ใช้ตอน **มีค่าอยู่แล้ว** สิ่งที่เด่นควรเป็นตัวค่าเอง
   * · `call`  = ป้ายมีขอบเต็ม · ใช้ตอน **ยังไม่มีค่า และค่านั้นจำเป็น**
   *
   * 🔴 ทำไมต้องต่างกัน: เส้นประใต้ประโยคปฏิเสธ (*"ยังไม่ระบุเมือง"*) อ่านเหมือน **ป้ายที่เสีย**
   * ไม่ใช่ปุ่มที่กดได้ — ผู้ใช้จริงถามว่ามันคืออะไร · ของที่ยังไม่ถูกกรอกและ *ต้อง* ถูกกรอก
   * ต้องหน้าตาเหมือนสิ่งที่รอให้กด ไม่ใช่เหมือนข้อความบอกสถานะ
   */
  emphasis?: "quiet" | "call";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [query, setQuery] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | HTMLInputElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const autoId = useId();
  const baseId = id ?? `dd${autoId.replace(/:/g, "")}`;
  const listId = `${baseId}-list`;

  const selected = options.find((o) => o.value === value) ?? null;
  /** ตัวกดเป็น `<input>` ที่พิมพ์ทับได้ — เฉพาะช่องในฟอร์มที่ตัวเลือกเยอะพอ */
  const typeInField = variant === "field" && options.length >= SEARCH_FROM;

  // 🔴 ทุกอย่างข้างล่างนี้อ้าง `visible` ไม่ใช่ `options` — `highlight` เป็นดัชนีของ *รายการที่เห็น*
  // ถ้าเผลอผสมสองระบบ จะเลือกผิดตัวเงียบ ๆ เฉพาะตอนกรองอยู่เท่านั้น
  const visible = useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q));
  }, [options, query]);

  // เลื่อนตัวที่ไฮไลต์ให้อยู่ในสายตาเวลาใช้คีย์บอร์ด
  // (การปิดเมื่อคลิกนอก + การวางตำแหน่งแผ่น เป็นหน้าที่ของ `AnchoredPanel` แล้ว)
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector(`[data-idx="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function firstEnabled(list: DropdownOption[]): number {
    const i = list.findIndex((o) => !o.disabled);
    return i >= 0 ? i : 0;
  }

  function nextEnabled(cur: number, dir: 1 | -1): number {
    for (let i = cur + dir; i >= 0 && i < visible.length; i += dir) {
      if (!visible[i].disabled) return i;
    }
    return cur;
  }

  function openList() {
    if (disabled) return;
    setQuery("");
    const sel = options.findIndex((o) => o.value === value && !o.disabled);
    setHighlight(sel >= 0 ? sel : firstEnabled(options));
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    setQuery("");
  }

  function onQueryChange(q: string) {
    setQuery(q);
    if (!open) setOpen(true);
    const next = norm(q) ? options.filter((o) => norm(o.label).includes(norm(q))) : options;
    setHighlight(firstEnabled(next));
  }

  function choose(i: number) {
    const o = visible[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    closeList();
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
      closeList();
    } else if (e.key === "Tab") {
      closeList();
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(highlight);
    } else if (e.key === " " && !typeInField) {
      // 🔴 เว้นวรรคเลือกได้เฉพาะตัวกดที่ไม่ใช่ `<input>` — ไม่งั้นพิมพ์ชื่อที่มีเว้นวรรคไม่ได้
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

  const fieldClass =
    "flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-left text-sm text-content hover:border-maple/50 focus:border-maple focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";
  const inlineClass =
    emphasis === "call"
      ? "flex max-w-full items-center gap-1.5 rounded-lg border border-current/50 bg-current/10 px-2.5 py-1 text-left text-base font-bold text-inherit hover:bg-current/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-60"
      : "flex max-w-full items-center gap-1.5 border-b border-dashed border-current/50 text-left text-lg font-bold text-inherit hover:border-current focus:outline-none focus-visible:ring-2 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-60";

  const aria = {
    role: "combobox" as const,
    "aria-haspopup": "listbox" as const,
    "aria-expanded": open,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant": open ? `${baseId}-opt-${highlight}` : undefined,
    "aria-label": ariaLabel,
  };

  return (
    <div className={className}>
      {/* ตัวเกาะของแผ่นคือกล่องนี้ ไม่ใช่ตัวกด — ตัวกดสลับระหว่าง input/button ได้ แต่ที่เกาะต้องนิ่ง */}
      <div ref={anchorRef} className={variant === "inline" ? "inline-flex max-w-full" : "relative"}>
        {typeInField ? (
          <>
            <input
              ref={triggerRef as React.RefObject<HTMLInputElement>}
              type="text"
              id={baseId}
              {...aria}
              aria-autocomplete="list"
              autoComplete="off"
              disabled={disabled}
              // ปิดอยู่ = โชว์ค่าที่เลือก · เปิดอยู่ = เป็นช่องค้นหา โดยมีค่าที่เลือกเป็น placeholder
              // ให้ยังเห็นว่าเดิมเลือกอะไรไว้ ระหว่างที่ยังพิมพ์ไม่เสร็จ
              value={open ? query : (selected?.label ?? "")}
              placeholder={open ? (selected?.label ?? placeholder) : placeholder}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => !open && openList()}
              onClick={() => !open && openList()}
              className={`${fieldClass} pr-8 placeholder:text-content-soft`}
            />
            <span
              aria-hidden
              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-content-soft ${
                open ? "rotate-180" : ""
              }`}
            >
              ▾
            </span>
          </>
        ) : (
          <button
            ref={triggerRef as React.RefObject<HTMLButtonElement>}
            type="button"
            id={baseId}
            {...aria}
            disabled={disabled}
            onClick={() => (open ? closeList() : openList())}
            onKeyDown={onKeyDown}
            className={variant === "inline" ? inlineClass : fieldClass}
          >
            <span
              className={`truncate ${
                variant === "inline" ? "" : selected ? "text-content" : "text-content-soft"
              }`}
            >
              {selected ? selected.label : placeholder}
            </span>
            <span
              aria-hidden
              className={`shrink-0 text-xs ${
                variant === "inline" ? "opacity-80" : "text-content-soft"
              } ${open ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </button>
        )}
      </div>

      {open && (
        <AnchoredPanel
          anchorRef={anchorRef}
          onClose={closeList}
          /* ช่องแบบฟอร์มกว้างอยู่แล้ว → แผ่นเท่าช่อง · ปุ่ม inline กว้างเท่าค่าของมันเอง →
             แผ่นต้องไม่แคบกว่าปุ่ม แต่ยืดตามเนื้อหาได้ ไม่งั้นตัวเลือกถูกตัดจนอ่านไม่ออก */
          matchWidth={variant !== "inline"}
          minWidthFromAnchor={variant === "inline"}
          preferredMaxHeight={PANEL_MAX_H}
          className="rounded-lg border border-line bg-surface-raised py-1 shadow-lg shadow-ink/10"
        >
          {visible.length === 0 && (
            <p className="px-3 py-3 text-sm text-content-soft">{E5_COPY.dropdown.noMatch(query)}</p>
          )}
          <ul ref={panelRef} id={listId} role="listbox" aria-label={ariaLabel}>
            {visible.map((o, i) => {
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
                    // กัน blur/โฟกัสหลุดจากตัวกด — เลือกด้วย pointerdown ให้ทันก่อนเบราว์เซอร์ย้ายโฟกัส
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
