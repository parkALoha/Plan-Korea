"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { Day } from "@/data/itinerary";
import { TRANSFER_POINTS } from "@/data/transferPoints";
import { AIRPORT_ACCESS } from "@/data/airportAccess";
import { DEFAULT_CHECKIN_BUFFER_MINUTES } from "@/lib/departureAdvice";
import { useSystemMode } from "@/hooks/useSystemMode";

const CHECKIN_PRESETS_MIN = [90, 120, 150, 180, 240];

const GROUPS = [
  { kind: "airport" as const, label: "✈️ สนามบิน", icon: "✈️" },
  { kind: "station" as const, label: "🚉 สถานีรถไฟ/ขนส่ง", icon: "🚉" },
];

/** สนามบินที่ควรเสนอเป็นค่าเริ่มต้นของเมืองนั้น — เมืองที่ไม่มีสนามบินของตัวเองให้เลือกเองจากลิสต์ */
const DEFAULT_AIRPORT_BY_CITY: Partial<Record<Day["city"], string>> = {
  hanoi: "airport-han",
  busan: "airport-pus",
  seoul: "airport-icn",
};

export type TransferInput = {
  placeId: string;
  checkinBufferMinutes: number;
  targetTime: string | null;
  targetLabel: string | null;
};

/**
 * แทรกแถว "✈️ ไปสนามบิน/สถานี" — ต่างจากแถวเดินทางข้ามเมืองตรงที่ไม่ต้องกรอกระยะเวลาเอง
 * ระบบดึงเวลาเดินทางจริงจาก Routes API ให้ (จุดก่อนหน้า → สนามบิน) แล้วคำนวณย้อนกลับว่าควรออกกี่โมง
 */
export function TransferEditModal({
  day,
  onClose,
  onSave,
}: {
  day: Day;
  onClose: () => void;
  onSave: (input: TransferInput) => void;
}) {
  // เที่ยวบินของวันนี้ที่จองมาแล้ว = ตัวเลือกเดดไลน์ที่ตรงกับความจริงที่สุด ไม่ต้องพิมพ์เวลาเอง
  const flights = (day.events ?? []).filter((e) => e.kind === "flight" && e.flight);
  const [placeId, setPlaceId] = useState(
    () => DEFAULT_AIRPORT_BY_CITY[day.city] ?? TRANSFER_POINTS[0].id
  );
  const [checkinBuffer, setCheckinBuffer] = useState(DEFAULT_CHECKIN_BUFFER_MINUTES);
  const [targetTime, setTargetTime] = useState(() => flights[0]?.time ?? "");
  const [targetLabel, setTargetLabel] = useState(
    () => (flights[0]?.flight ? `${flights[0].flight.no} ${flights[0].flight.fromEn} → ${flights[0].flight.toEn}` : "")
  );

  const options = AIRPORT_ACCESS[placeId] ?? [];

  // ปิดที่ทางเข้าตอนโมดัลเปิด ไม่ใช่แค่ปุ่ม "เพิ่ม" ตอนจบ — รูปแบบเดียวกับ BookingEditModal (E3-AC7 §9)
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;

  function handleSave() {
    if (readOnly) return;
    onSave({
      placeId,
      checkinBufferMinutes: checkinBuffer,
      targetTime: targetTime.trim() || null,
      targetLabel: targetLabel.trim() || null,
    });
  }

  return (
    <Modal
      onClose={onClose}
      title="ไปสนามบิน / สถานี"
      bodyClassName="space-y-4"
      footer={
        <button
          onClick={handleSave}
          disabled={readOnly}
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
        <label className="mb-1 block text-xs font-medium text-content-soft">ไปที่ไหน</label>
        {/* แยกกลุ่มสนามบิน/สถานี — รวมกันเป็นลิสต์เดียว 11 อันแล้วหาของที่ต้องการไม่เจอ
            เมืองของวันนี้ขึ้นก่อนในแต่ละกลุ่ม เพราะเกือบทุกครั้งคือที่ที่ต้องการ */}
        {GROUPS.map((group) => {
          const points = TRANSFER_POINTS.filter(
            (p) => p.transferKind === group.kind && !p.pickerHidden
          ).sort((a, b) => Number(b.city === day.city) - Number(a.city === day.city));
          return (
            <div key={group.kind} className="mb-3 last:mb-0">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-content-soft/70">
                {group.label}
              </div>
              <div className="space-y-1.5">
                {points.map((point) => (
                  <button
                    key={point.id}
                    onClick={() => setPlaceId(point.id)}
                    disabled={readOnly}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-40 ${
                      placeId === point.id
                        ? "border-maple bg-maple-soft text-maple-dark"
                        : "border-line text-content-soft hover:bg-surface-soft"
                    }`}
                  >
                    <span>{group.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{point.nameTh}</span>
                      <span className="block truncate text-xs opacity-80">{point.nameLocal}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">
          ต้องไปให้ทันอะไร (ไม่ใส่ก็ได้)
        </label>
        {flights.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {flights.map((e) => (
              <button
                key={`${e.time}-${e.flight!.no}`}
                onClick={() => {
                  setTargetTime(e.time);
                  setTargetLabel(`${e.flight!.no} ${e.flight!.fromEn} → ${e.flight!.toEn}`);
                }}
                disabled={readOnly}
                className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-40 ${
                  targetTime === e.time
                    ? "border-maple bg-maple-soft text-maple-dark"
                    : "border-line text-content-soft hover:border-maple/40"
                }`}
              >
                ✈️ {e.flight!.no} · {e.time}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="time"
            value={targetTime}
            onChange={(e) => setTargetTime(e.target.value)}
            disabled={readOnly}
            className="w-32 rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
          />
          <input
            value={targetLabel}
            onChange={(e) => setTargetLabel(e.target.value)}
            placeholder="เช่น VN409 อินชอน → โฮจิมินห์"
            disabled={readOnly}
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">
          เผื่อเวลาที่สนามบิน/สถานีก่อนออกเดินทาง
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CHECKIN_PRESETS_MIN.map((m) => (
            <button
              key={m}
              onClick={() => setCheckinBuffer(m)}
              disabled={readOnly}
              className={`rounded-full border px-2.5 py-1.5 text-xs disabled:opacity-40 ${
                checkinBuffer === m
                  ? "border-maple bg-maple-soft text-maple-dark"
                  : "border-line text-content-soft hover:border-maple/40"
              }`}
            >
              {m % 60 === 0 ? `${m / 60} ชม.` : `${Math.floor(m / 60)} ชม. ${m % 60} น.`}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-content-soft">
          เช็คอิน + ตม. + เดินไปเกต · ทริปนี้ยึด 3 ชม. สำหรับบินระหว่างประเทศ
        </p>
      </div>

      {options.length > 0 && (
        <div className="rounded-xl bg-surface-soft/50 p-3">
          <div className="mb-1.5 text-xs font-semibold text-content-soft">
            ตัวเลือกการเดินทาง (เวลาตามตารางเดินรถของผู้ให้บริการ)
          </div>
          <ul className="space-y-1 text-xs text-content-soft">
            {options.map((o) => (
              <li key={o.id}>
                {o.icon} <span className="font-medium text-content">{o.label}</span> ~{o.minutes} น. ·
                ขึ้นจาก {o.from}
                {o.note && <span className="block pl-5 opacity-80">{o.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-content-soft">
        แถวนี้กินเวลาใน timeline จริง — เวลาเดินทางจากจุดก่อนหน้ามาจาก Google (เลือกโหมดเดินทางได้ที่แถว
        เหมือนจุดแวะปกติ) แล้วระบบจะบอกว่า “ควรออกจากจุดก่อนหน้าไม่เกินกี่โมง” ให้เอง
      </p>
    </Modal>
  );
}
