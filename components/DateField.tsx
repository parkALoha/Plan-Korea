"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MONTHS_TH_FULL, WEEKDAYS_TH_SHORT, formatIsoDateTh } from "@/lib/tripDateRange";
import { E5_COPY } from "@/lib/i18n";

const COPY = E5_COPY.dateField;

/** สร้าง ISO เอง ไม่ใช้ `toISOString()` — ตัวนั้นแปลงเป็น UTC ก่อน ทำให้ผู้ใช้ไทย (UTC+7) ได้วันที่ย้อนไป
 *  หนึ่งวันทุกครั้งที่เลือกวันในช่วงเช้ามืด · เราต้องการวันตามปฏิทินที่ผู้ใช้เห็น ไม่ใช่วันตาม UTC */
function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { y: parts[0], m: parts[1], d: parts[2] };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** วันในสัปดาห์ของวันที่ 1 (0 = อาทิตย์) — `new Date(y, m-1, 1)` เป็นเวลาท้องถิ่น ไม่ผ่าน UTC */
function firstWeekday(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay();
}

function shiftIso(iso: string, days: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m - 1, p.d + days);
  return isoOf(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function todayIso(): string {
  const n = new Date();
  return isoOf(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/**
 * ปฏิทินของเราเอง — ผู้ใช้สั่ง 28 ส.ค. 2026 พร้อมกับดรอปดาวน์: *"ทำ dropdown ของเราเองสิ **รวมถึงปฎิทิน**"*
 * เดิมใช้ `<input type="date">` ซึ่งวาดด้วย native UI ของ OS — **ธีม/ฟอนต์/ภาษาของเราไม่มีผลเลย**
 * และบนเดสก์ท็อปมันโชว์ `dd/mm/yyyy` แบบตะวันตกกลางฟอร์มภาษาไทย
 *
 * 🔴 **ปี ค.ศ. ไม่ใช่ พ.ศ.** — ทั้งเว็บใช้ ค.ศ. (`tripDateRangeLabel` เขียนคำเตือนไว้ว่า `toLocaleDateString("th-TH")`
 * ใส่ปีพุทธให้เอง) ปฏิทินนี้จึงประกอบข้อความจากตัวเลขเองทั้งหมด ไม่เรียก locale API สักตัว
 * 🔴 **แผ่นปฏิทินเปิดแบบดันเนื้อหาลง (in-flow) ไม่ใช่ `absolute`** — เหตุผลเดียวกับ `Dropdown`:
 * เนื้อโมดัลเป็น `overflow-y-auto` ของที่ลอยทับจะถูกเฉือนที่ขอบกล่อง
 *
 * `min` ใช้กับช่อง "สิ้นสุด" เพื่อกันเลือกวันก่อนวันเริ่ม — **กันที่ UI เพื่อ UX เท่านั้น ไม่ใช่ด่าน**
 * `POST /api/engine/trips` ตรวจซ้ำอยู่แล้ว (วันจบต้องไม่มาก่อนวันเริ่ม)
 */
export function DateField({
  value,
  onChange,
  min,
  disabled = false,
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const autoId = useId();
  const baseId = id ?? `df${autoId.replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const initial = parseIso(value) ?? parseIso(min ?? "") ?? parseIso(todayIso())!;
  const [view, setView] = useState({ y: initial.y, m: initial.m });
  const [focusIso, setFocusIso] = useState(value || min || todayIso());

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  // เปิดแล้วเลื่อนให้เห็นทั้งแผ่น (เนื้อโมดัลเลื่อนได้ แผ่นที่เปิดใต้ขอบล่างจะไม่มีใครเห็น)
  useEffect(() => {
    if (!open) return;
    gridRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  // ย้ายโฟกัสจริงไปยังวันที่ถูกเลือกด้วยลูกศร (roving tabindex)
  useEffect(() => {
    if (!open) return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`);
    el?.focus();
  }, [open, focusIso]);

  function openPanel() {
    if (disabled) return;
    const start = value || min || todayIso();
    const p = parseIso(start)!;
    setView({ y: p.y, m: p.m });
    setFocusIso(start);
    setOpen(true);
  }

  function isBeforeMin(iso: string): boolean {
    return Boolean(min) && iso < min!;
  }

  function pick(iso: string) {
    if (isBeforeMin(iso)) return;
    onChange(iso);
    setOpen(false);
  }

  function moveFocus(days: number) {
    const next = shiftIso(focusIso, days);
    const p = parseIso(next)!;
    setFocusIso(next);
    if (p.y !== view.y || p.m !== view.m) setView({ y: p.y, m: p.m });
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    const step =
      e.key === "ArrowLeft" ? -1
      : e.key === "ArrowRight" ? 1
      : e.key === "ArrowUp" ? -7
      : e.key === "ArrowDown" ? 7
      : 0;
    if (step !== 0) {
      e.preventDefault();
      moveFocus(step);
    }
  }

  function stepMonth(delta: number) {
    const total = view.y * 12 + (view.m - 1) + delta;
    setView({ y: Math.floor(total / 12), m: (total % 12) + 1 });
  }

  const total = daysInMonth(view.y, view.m);
  const lead = firstWeekday(view.y, view.m);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  const today = todayIso();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={baseId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-left text-sm hover:border-maple/50 focus:border-maple focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`truncate ${value ? "text-content" : "text-content-soft"}`}>
          {value ? formatIsoDateTh(value) : COPY.placeholder}
        </span>
        <span aria-hidden className="shrink-0 text-xs text-content-soft">
          📅
        </span>
      </button>

      {open && (
        <div
          ref={gridRef}
          className="mt-1 rounded-lg border border-line bg-surface-raised p-2 shadow-lg shadow-ink/10"
          onKeyDown={onGridKeyDown}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label={COPY.prevMonth}
              className="rounded-lg px-2 py-1 text-sm text-content-soft hover:bg-surface-soft"
            >
              ‹
            </button>
            <div aria-live="polite" className="text-sm font-semibold text-content">
              {MONTHS_TH_FULL[view.m - 1]} {view.y}
            </div>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label={COPY.nextMonth}
              className="rounded-lg px-2 py-1 text-sm text-content-soft hover:bg-surface-soft"
            >
              ›
            </button>
          </div>

          <div aria-hidden className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-content-soft">
            {WEEKDAYS_TH_SHORT.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} />;
              const iso = isoOf(view.y, view.m, d);
              const isSelected = iso === value;
              const isToday = iso === today;
              const isDisabled = isBeforeMin(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  data-iso={iso}
                  tabIndex={iso === focusIso ? 0 : -1}
                  disabled={isDisabled}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  onClick={() => pick(iso)}
                  onFocus={() => setFocusIso(iso)}
                  className={`rounded-md py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-maple ${
                    isSelected
                      ? "bg-maple font-semibold text-white"
                      : isDisabled
                        ? "cursor-not-allowed text-content-soft/40"
                        : isToday
                          ? "bg-maple-soft font-semibold text-maple-dark"
                          : "text-content hover:bg-surface-soft"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
