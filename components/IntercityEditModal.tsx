"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { Place } from "@/data/places";
import { stationsForCity } from "@/data/transferPoints";
import { useSystemMode } from "@/hooks/useSystemMode";

export type IntercityMode = "bus" | "ktx" | "other";

export const INTERCITY_MODE_ICON: Record<IntercityMode, string> = {
  bus: "🚌",
  ktx: "🚄",
  other: "🚗",
};

/**
 * 🔴 **ใช้ตัวนี้เมื่อค่ามาจากฐาน** — `trip_stops.intercity_mode` **ไม่มี check constraint เลย**
 * (P1 วัดฐานเอง 29 ส.ค. 2026) → ค่านอก 3 ตัวเข้ามาได้ทุกเมื่อ
 *
 * ⚠️ ท่าเดิม `INTERCITY_MODE_ICON[(x as IntercityMode) ?? "other"]` **กันได้แค่ `null`**
 * ไม่ได้กัน *ค่าที่ไม่รู้จัก* — `"เรือ"` ไม่ใช่ `null` จึงผ่าน `??` แล้วได้ `undefined` ออกไปเรนเดอร์เป็นความว่าง
 * 🎯 `?? "other"` อ่านเหมือนมี fallback แล้ว **และนั่นคือเหตุผลที่ไม่มีใครกลับมาดูมัน**
 *
 * ตกไป `other` ("🚗") ซึ่งเป็นสมาชิกจริงของตาราง — ไม่ต้องคิดค่าใหม่ และแปลว่า "โหมดอื่น" ตรงความหมาย
 */
export function intercityModeIconOf(mode: string | null | undefined): string {
  return mode && Object.hasOwn(INTERCITY_MODE_ICON, mode)
    ? INTERCITY_MODE_ICON[mode as IntercityMode]
    : INTERCITY_MODE_ICON.other;
}

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

/** ปุ่มเลือกสถานีจริงของเมืองนั้น — กดแล้วเติมชื่อลงช่องให้เลย ไม่ต้องพิมพ์เอง/จำชื่อเกาหลี
 *  ซ่อนทั้งแถวถ้าเมืองนั้นยังไม่มีสถานีในลิสต์ (ดู data/transferPoints.ts) */
function StationPicks({
  city,
  value,
  onPick,
}: {
  city: Place["city"] | undefined;
  value: string;
  onPick: (name: string) => void;
}) {
  const stations = city ? stationsForCity(city) : [];
  if (stations.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {stations.map((s) => (
        <button
          key={s.id}
          onClick={() => onPick(s.nameTh)}
          title={s.descriptionTh}
          className={`rounded-full border px-2 py-1 text-[11px] ${
            value === s.nameTh
              ? "border-maple bg-maple-soft text-maple-dark"
              : "border-line text-content-soft hover:border-maple/40"
          }`}
        >
          {s.nameTh}
        </button>
      ))}
    </div>
  );
}

export function IntercityEditModal({
  fromDefault,
  toDefault,
  fromCity,
  toCity,
  onClose,
  onSave,
}: {
  fromDefault: string;
  toDefault: string;
  /** เมืองต้นทาง/ปลายทาง — ใช้เสนอสถานีจริงของเมืองนั้นเป็นตัวเลือกด่วน (ไม่ใช่แค่ชื่อเมืองลอยๆ) */
  fromCity?: Place["city"];
  toCity?: Place["city"];
  onClose: () => void;
  onSave: (input: { from: string; to: string; mode: IntercityMode; minutes: number }) => void;
}) {
  const [mode, setMode] = useState<IntercityMode>("bus");
  const [from, setFrom] = useState(fromDefault);
  const [to, setTo] = useState(toDefault);
  const [hours, setHours] = useState(5);
  const [minutes, setMinutes] = useState(0);

  const totalMinutes = hours * 60 + minutes;

  // ปิดที่ทางเข้าตอนโมดัลเปิด ไม่ใช่แค่ปุ่ม "เพิ่ม" ตอนจบ — รูปแบบเดียวกับ BookingEditModal (E3-AC7 §9)
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;

  function handleSave() {
    if (!from.trim() || !to.trim() || totalMinutes <= 0 || readOnly) return;
    onSave({ from: from.trim(), to: to.trim(), mode, minutes: totalMinutes });
  }

  return (
    <Modal
      onClose={onClose}
      title="เดินทางข้ามเมือง"
      bodyClassName="space-y-3"
      footer={
        <button
          onClick={handleSave}
          disabled={!from.trim() || !to.trim() || totalMinutes <= 0 || readOnly}
          className="flex-1 rounded-xl bg-maple py-3 font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
        >
          เพิ่ม
        </button>
      }
    >
      {readOnly && (
        <div
          role="status"
          className="rounded-lg bg-panel-gold px-3 py-2 text-xs font-medium text-panel-gold-ink"
        >
          🔧 ระบบปิดรับการแก้ไขชั่วคราว — เพิ่มรายการนี้ตอนนี้ไม่ได้
          {systemMode.state === "ok" && systemMode.reason ? ` (${systemMode.reason})` : ""}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">พาหนะ</label>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={readOnly}
              className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium disabled:opacity-40 ${
                mode === m
                  ? "border-maple bg-maple-soft text-maple-dark"
                  : "border-line text-content-soft hover:bg-surface-soft"
              }`}
            >
              <span>{INTERCITY_MODE_ICON[m]}</span>
              <span>{INTERCITY_MODE_LABEL[m]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* มือถือซ้อนกันแนวตั้ง — ปุ่มเลือกสถานีกินที่แนวนอนเยอะ ถ้าวางคู่กันชื่อสถานีจะถูกตัดจนอ่านไม่ออก */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-content-soft">จาก</label>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={readOnly}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
          />
          {!readOnly && <StationPicks city={fromCity} value={from} onPick={setFrom} />}
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-content-soft">ไป</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={readOnly}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
          />
          {!readOnly && <StationPicks city={toCity} value={to} onPick={setTo} />}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">ใช้เวลาเดินทางประมาณ</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
            disabled={readOnly}
            className="w-20 rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
          />
          <span className="text-sm text-content-soft">ชม.</span>
          <input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
            disabled={readOnly}
            className="w-20 rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
          />
          <span className="text-sm text-content-soft">นาที</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DURATION_PRESETS_MIN.map((m) => (
            <button
              key={m}
              onClick={() => {
                setHours(Math.floor(m / 60));
                setMinutes(m % 60);
              }}
              disabled={readOnly}
              className="rounded-full border border-line bg-surface-raised px-2.5 py-1 text-xs text-content-soft hover:border-maple/40 disabled:opacity-40"
            >
              {m / 60} ชม.
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-content-soft">
        ช่วงนี้จะกินเวลาใน timeline ของวันจริงๆ — จุดแวะก่อนหน้าคำนวณเวลาต่อกันตามปกติ ส่วนจุดแวะหลังจากนี้จะเริ่มนับเวลาใหม่ตอนถึงปลายทาง
      </p>
    </Modal>
  );
}
