"use client";

import { useState } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

export type IntercityMode = "bus" | "ktx" | "other";

export const INTERCITY_MODE_ICON: Record<IntercityMode, string> = {
  bus: "🚌",
  ktx: "🚄",
  other: "🚗",
};

export const INTERCITY_MODE_LABEL: Record<IntercityMode, string> = {
  bus: "รถบัส",
  ktx: "KTX",
  other: "อื่นๆ",
};

/** คู่ภาษาอังกฤษของ INTERCITY_MODE_LABEL — ใช้บนหน้า /summary?lang=en (เฟส 16) */
export const INTERCITY_MODE_LABEL_EN: Record<IntercityMode, string> = {
  bus: "Bus",
  ktx: "KTX",
  other: "Other",
};

const MODES: IntercityMode[] = ["bus", "ktx", "other"];
const DURATION_PRESETS_MIN = [60, 120, 180, 240, 300, 360];

export function IntercityEditModal({
  fromDefault,
  toDefault,
  onClose,
  onSave,
}: {
  fromDefault: string;
  toDefault: string;
  onClose: () => void;
  onSave: (input: { from: string; to: string; mode: IntercityMode; minutes: number }) => void;
}) {
  useBodyScrollLock();
  const [mode, setMode] = useState<IntercityMode>("bus");
  const [from, setFrom] = useState(fromDefault);
  const [to, setTo] = useState(toDefault);
  const [hours, setHours] = useState(5);
  const [minutes, setMinutes] = useState(0);

  const totalMinutes = hours * 60 + minutes;

  function handleSave() {
    if (!from.trim() || !to.trim() || totalMinutes <= 0) return;
    onSave({ from: from.trim(), to: to.trim(), mode, minutes: totalMinutes });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="mb-3 flex items-start justify-between">
            <h2 className="text-lg font-bold text-ink">เดินทางข้ามเมือง</h2>
            <button onClick={onClose} className="rounded-full p-2 text-ink-soft hover:bg-cream-soft">
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">พาหนะ</label>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium ${
                    mode === m
                      ? "border-maple bg-maple-soft text-maple-dark"
                      : "border-cream-soft text-ink-soft hover:bg-cream-soft"
                  }`}
                >
                  <span>{INTERCITY_MODE_ICON[m]}</span>
                  <span>{INTERCITY_MODE_LABEL[m]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-soft">จาก</label>
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-soft">ไป</label>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">ใช้เวลาเดินทางประมาณ</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={hours}
                onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
              />
              <span className="text-sm text-ink-soft">ชม.</span>
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                className="w-20 rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
              />
              <span className="text-sm text-ink-soft">นาที</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DURATION_PRESETS_MIN.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setHours(Math.floor(m / 60));
                    setMinutes(m % 60);
                  }}
                  className="rounded-full border border-cream-soft bg-white px-2.5 py-1 text-xs text-ink-soft hover:border-maple/40"
                >
                  {m / 60} ชม.
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-ink-soft">
            ช่วงนี้จะกินเวลาใน timeline ของวันจริงๆ — จุดแวะก่อนหน้าคำนวณเวลาต่อกันตามปกติ ส่วนจุดแวะหลังจากนี้จะเริ่มนับเวลาใหม่ตอนถึงปลายทาง
          </p>
        </div>

        <div className="shrink-0 flex gap-2 px-5 pb-5 pt-3">
          <button
            onClick={handleSave}
            disabled={!from.trim() || !to.trim() || totalMinutes <= 0}
            className="flex-1 rounded-xl bg-maple py-3 font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
          >
            เพิ่ม
          </button>
        </div>
      </div>
    </div>
  );
}
