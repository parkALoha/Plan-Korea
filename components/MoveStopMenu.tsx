"use client";

import { useRef, useState } from "react";
import { AnchoredPanel } from "@/components/AnchoredPanel";
import { Modal } from "@/components/Modal";

/**
 * เมนู "ย้ายจุดแวะ" บนแถว — **ทางเข้าที่สองของการย้าย ที่ไม่ต้องลากเลย**
 *
 * 📌 ผู้ใช้สั่งเองเมื่อ 4 ก.ย. 2026: *"ระบบ Drag & Drop บนหน้าจอคอมพิวเตอร์ทำง่าย แต่บนหน้าจอ
 * มือถือจะลากวางยากกว่า … เช่นเปลี่ยนจากการลากเป็นการกดเลือกวันแทน"* — และเลือกรูป **"เมนู
 * ย้ายไปวันที่…"** ทับทางเลือกอื่น (ปุ่มขึ้น/ลงอย่างเดียว · ปรับปรุงการลาก)
 *
 * 🔴 **เพิ่ม*ทับ*การลาก ไม่ใช่แทนที่** — `TouchSensor` ยังอยู่ที่เดิม (`useTripDnd`)
 * รูปเดียวกับที่ `TripDestinationPicker` เขียนกฎไว้ให้ตัวเองแล้วเมื่อ 28 ส.ค. 2026
 * (*"ถ้าจะเพิ่มลากวางทีหลัง ให้เพิ่มทับปุ่ม ไม่ใช่แทนที่"* — ที่นี่คือทิศกลับกันของกฎเดียวกัน)
 *
 * 🔴 **โผล่ทุกขนาดจอ ไม่ใช่เฉพาะมือถือ** — ตัดสินใจแล้วด้วยเหตุผลสามข้อ:
 * ① `useMediaQuery` คืน `false` เสมอฝั่งเซิร์ฟเวอร์ (ตั้งใจ ดูไฟล์นั้น) → เมนูที่ผูกกับ
 *    `min-width` จะ **หายตอนโหลดแรกแล้วโผล่ทีหลัง** ซึ่งเป็นตระกูลบั๊กที่รีโปนี้เจอมาแล้ว
 * ② บนคอมก็เร็วกว่าลาก เวลาวันต้นทางกับปลายทางอยู่คนละที่บนสกรอลล์ยาว 11 วัน
 * ③ **คีย์บอร์ด**: การลากข้ามวันด้วย `KeyboardSensor` ต้องข้าม `SortableContext` คนละอัน
 *    ซึ่งไม่มีใครยืนยันว่าทำได้ — ซ่อนเมนูบนจอใหญ่ = ตัดทางเดียวที่พิสูจน์ได้ทิ้ง
 */

export type MoveDayTarget = {
  dayId: string;
  /** ลำดับวันในทริป เริ่มที่ 1 */
  dayNumber: number;
  dateLabel: string;
  cityLabel: string;
  icon: string;
  /** วันที่ล็อกอยู่ — เลือกเป็นปลายทางไม่ได้ (กฎเดียวกับการลาก) */
  locked: boolean;
  /** จุดแวะของวันนั้นเรียงตามลำดับจริง — ใช้ให้เลือก *ตำแหน่ง* ไม่ใช่แค่วัน */
  stops: { id: string; label: string }[];
};

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-content hover:bg-surface-soft disabled:cursor-default disabled:text-content-soft/40 disabled:hover:bg-transparent";

export function MoveStopMenu({
  stopId,
  dayId,
  index,
  dayStopCount,
  targets,
  onMoveWithinDay,
  onMoveToDay,
}: {
  stopId: string;
  dayId: string;
  index: number;
  dayStopCount: number;
  targets: MoveDayTarget[];
  onMoveWithinDay: (dir: -1 | 1) => void;
  onMoveToDay: (targetDayId: string, atIndex: number) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** วันที่เลือกไว้ในขั้นที่ 1 ของโมดัล — `null` = ยังอยู่ขั้นเลือกวัน */
  const [pickedDayId, setPickedDayId] = useState<string | null>(null);

  /* 🔴 ชื่อจุดแวะอ่านจาก `targets` ไม่ใช่รับมาเป็น prop แยก — **หัวโมดัลกับรายการตำแหน่ง
     ต้องเรียกของชิ้นเดียวกันด้วยชื่อเดียวกันเสมอ** สองแหล่งเมื่อไหร่ก็เพี้ยนกันได้เมื่อนั้น */
  const stopLabel =
    targets.find((t) => t.dayId === dayId)?.stops.find((s) => s.id === stopId)?.label ??
    "จุดแวะนี้";

  const picked = targets.find((t) => t.dayId === pickedDayId) ?? null;
  /* ลิสต์ตำแหน่งต้องเป็นลิสต์ที่ **ไม่มีตัวมันเอง** — ตรงกับที่เซิร์ฟเวอร์คิด `rank`
     (กรอง `r.id !== id` ก่อนเสมอ) และตรงกับดัชนีปลายทางของ `arrayMove` ในวันเดิม */
  const others = picked ? picked.stops.filter((s) => s.id !== stopId) : [];
  const sameDay = picked?.dayId === dayId;

  function openPicker() {
    setMenuOpen(false);
    setPickedDayId(null);
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
    setPickedDayId(null);
  }

  function commit(atIndex: number) {
    if (!picked) return;
    closePicker();
    onMoveToDay(picked.dayId, atIndex);
  }

  return (
    <>
      <button
        ref={anchorRef}
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`ย้ายจุดแวะนี้ (${stopLabel})`}
        title="ย้ายจุดแวะนี้"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-content-soft hover:bg-surface-soft sm:h-7 sm:w-7 sm:text-xs"
      >
        ⇅
      </button>

      {menuOpen && (
        <AnchoredPanel
          anchorRef={anchorRef}
          onClose={() => setMenuOpen(false)}
          preferredMaxHeight={240}
          className="z-50 min-w-[13rem] rounded-xl border border-line bg-surface-raised p-1 text-content shadow-lg"
        >
          <div role="menu" aria-label="ย้ายจุดแวะนี้">
            <button
              role="menuitem"
              className={MENU_ITEM}
              disabled={index === 0}
              onClick={() => {
                setMenuOpen(false);
                onMoveWithinDay(-1);
              }}
            >
              ⬆️ เลื่อนขึ้นหนึ่งช่อง
            </button>
            <button
              role="menuitem"
              className={MENU_ITEM}
              disabled={index >= dayStopCount - 1}
              onClick={() => {
                setMenuOpen(false);
                onMoveWithinDay(1);
              }}
            >
              ⬇️ เลื่อนลงหนึ่งช่อง
            </button>
            <div className="my-1 border-t border-line" />
            <button role="menuitem" className={MENU_ITEM} onClick={openPicker}>
              📅 ย้ายไปวันที่…
            </button>
          </div>
        </AnchoredPanel>
      )}

      {pickerOpen && (
        <Modal
          onClose={closePicker}
          size="md"
          eyebrow="ย้ายจุดแวะ"
          title={stopLabel}
          subtitle={
            picked
              ? `ไปไว้ตรงไหนของวันที่ ${picked.dayNumber}`
              : "เลือกวันปลายทาง — ไม่ต้องลาก"
          }
          footer={
            picked ? (
              <button
                onClick={() => setPickedDayId(null)}
                className="rounded-lg px-3 py-2 text-sm text-content-soft hover:bg-surface-soft"
              >
                ← เลือกวันใหม่
              </button>
            ) : undefined
          }
        >
          {!picked ? (
            <ul className="space-y-1">
              {targets.map((t) => (
                <li key={t.dayId}>
                  <button
                    disabled={t.locked}
                    onClick={() => setPickedDayId(t.dayId)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:border-pine hover:bg-surface-soft disabled:cursor-default disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-transparent"
                  >
                    <span className="w-10 shrink-0 text-center">
                      <span className="block text-lg leading-none">{t.icon}</span>
                      <span className="block text-[10px] text-content-soft">
                        วันที่ {t.dayNumber}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-content">
                        {t.cityLabel}
                      </span>
                      <span className="block truncate text-xs text-content-soft">
                        {t.dateLabel} · {t.stops.length} จุดแวะ
                        {t.dayId === dayId ? " · วันนี้อยู่ตอนนี้" : ""}
                      </span>
                    </span>
                    {t.locked && <span className="shrink-0 text-xs">🔒</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-1">
              <InsertSlot
                label={others.length === 0 ? "วางเป็นจุดแวะแรกของวัน" : "⬆️ ต้นวัน (ก่อนทุกจุด)"}
                disabled={sameDay && index === 0}
                onClick={() => commit(0)}
              />
              {others.map((s, i) => (
                <div key={s.id}>
                  <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-content-soft">
                    <span className="w-4 shrink-0 text-right text-[11px] tabular-nums opacity-60">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  </div>
                  <InsertSlot
                    label={
                      i === others.length - 1 ? "⬇️ ท้ายวัน (หลังทุกจุด)" : "วางตรงนี้"
                    }
                    disabled={sameDay && index === i + 1}
                    onClick={() => commit(i + 1)}
                  />
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/** ช่องว่างระหว่างจุดแวะที่กดวางได้ — `disabled` เมื่อมันคือตำแหน่งที่จุดแวะนี้อยู่แล้ว */
function InsertSlot({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  if (disabled) {
    return (
      <div className="rounded-lg border border-dashed border-line px-3 py-2 text-center text-xs text-content-soft/60">
        อยู่ตรงนี้อยู่แล้ว
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-dashed border-line px-3 py-2 text-center text-xs font-medium text-content-soft hover:border-pine hover:bg-pine-soft/40 hover:text-pine"
    >
      {label}
    </button>
  );
}
