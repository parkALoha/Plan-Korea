"use client";

import type { TripPlan } from "@/lib/supabase";
import { Modal } from "./Modal";
import { TripCoverUpload } from "./TripCoverUpload";
import { useSystemMode } from "@/hooks/useSystemMode";

/**
 * ของที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก — ชื่อคนใช้ / จัดการแผน A-B / ล็อกทั้งทริป (เฟส 20.3)
 *
 * เดิมทุกอันกางอยู่บนหัวเว็บ ทำให้หัวสูงเกือบเต็มจอมือถือก่อนจะเห็นเนื้อหาสักบรรทัด
 * ย้ายมาไว้หลังปุ่ม ⚙️ แทน เหลือบนหัวแค่ชื่อทริป ชื่อแผนที่ใช้อยู่ และจำนวนจุด
 */
export function TripSettingsModal({
  tripId,
  who,
  onWhoChange,
  plans,
  activePlanId,
  onSwitchPlan,
  onNewPlan,
  onRenamePlan,
  onDeletePlan,
  lockedDayCount,
  totalDayCount,
  onToggleLockAll,
  onClose,
}: {
  tripId: string;
  who: string;
  onWhoChange: (value: string) => void;
  plans: TripPlan[];
  activePlanId: string | null;
  onSwitchPlan: (planId: string) => void;
  onNewPlan: () => void;
  onRenamePlan: () => void;
  onDeletePlan: () => void;
  lockedDayCount: number;
  totalDayCount: number;
  onToggleLockAll: () => void;
  onClose: () => void;
}) {
  const allLocked = totalDayCount > 0 && lockedDayCount === totalDayCount;
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;

  return (
    <Modal onClose={onClose} title="ตั้งค่าทริป" size="md" bodyClassName="space-y-5">
      <TripCoverUpload tripId={tripId} readOnly={readOnly} />

      <div>
        <label htmlFor="trip-who" className="mb-1 block text-xs font-medium text-content-soft">
          ชื่อคุณ
        </label>
        <input
          id="trip-who"
          value={who}
          onChange={(e) => onWhoChange(e.target.value)}
          placeholder="เช่น เอ / บี"
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
        />
        <p className="mt-1 text-xs text-content-soft">
          ใช้แสดงว่า “เลือกโดยใคร” ที่จุดแวะ — อีกคนจะได้รู้ว่าใครเพิ่มอะไรไว้
        </p>
      </div>

      {plans.length > 0 && (
        <div>
          <label htmlFor="trip-plan" className="mb-1 block text-xs font-medium text-content-soft">
            แผนที่ใช้อยู่
          </label>
          <select
            id="trip-plan"
            value={activePlanId ?? ""}
            onChange={(e) => onSwitchPlan(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={onNewPlan}
              className="rounded-lg bg-surface-soft px-3 py-2 text-xs font-medium text-content hover:bg-maple-soft"
            >
              + แผนใหม่
            </button>
            <button
              onClick={onRenamePlan}
              className="rounded-lg bg-surface-soft px-3 py-2 text-xs font-medium text-content hover:bg-maple-soft"
            >
              เปลี่ยนชื่อ
            </button>
            {plans.length > 1 && (
              <button
                onClick={onDeletePlan}
                className="rounded-lg px-3 py-2 text-xs font-medium text-maple-dark hover:bg-maple-soft"
              >
                ลบแผนนี้
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-content-soft">ล็อกทั้งทริป</div>
        <button
          onClick={onToggleLockAll}
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-content hover:bg-surface-soft"
        >
          {allLocked ? "🔓 ปลดล็อกทุกวัน" : "🔒 ล็อกทุกวัน"}
          {lockedDayCount > 0 && !allLocked ? ` (ล็อกแล้ว ${lockedDayCount}/${totalDayCount})` : ""}
        </button>
        <p className="mt-1 text-xs text-content-soft">
          ใช้ตอนแผนนิ่งแล้วก่อนออกเดินทาง — เปิดดูบนมือถือได้โดยไม่กลัวเผลอลากจุดแวะหลุด
        </p>
      </div>
    </Modal>
  );
}
