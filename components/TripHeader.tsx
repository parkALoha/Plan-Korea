"use client";

import Link from "next/link";
import { useState } from "react";
import type { TripPlan } from "@/lib/supabase";
import { TripSettingsModal } from "./TripSettingsModal";

interface TripHeaderProps {
  who: string;
  onWhoChange: (value: string) => void;
  stopsCount: number;
  plans: TripPlan[];
  activePlanId: string | null;
  onSwitchPlan: (planId: string) => void;
  onNewPlan: () => void;
  onRenamePlan: () => void;
  onDeletePlan: () => void;
  /** จำนวนวันที่ล็อกไว้แล้ว / ทั้งหมด — ใช้บอกสถานะบนปุ่มล็อกรวม */
  lockedDayCount: number;
  totalDayCount: number;
  onToggleLockAll: () => void;
}

/**
 * หัวเว็บของหน้าแผน — บีบให้เตี้ยลงในเฟส 20.3
 *
 * เดิมยัด ช่องชื่อคุณ + ตัวเลือกแผน + ปุ่มสร้าง/เปลี่ยนชื่อ/ลบแผน + ปุ่มล็อกทุกวัน ไว้บนหัวหมด
 * รวมกับ padding pt-10/pb-8 แล้วกินพื้นที่เกือบเต็มจอมือถือก่อนเห็นเนื้อหาสักบรรทัด
 * ทั้งหมดนั้นเป็นของที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก จึงย้ายไปอยู่หลังปุ่ม ⚙️ (TripSettingsModal)
 */
export function TripHeader({
  who,
  onWhoChange,
  stopsCount,
  plans,
  activePlanId,
  onSwitchPlan,
  onNewPlan,
  onRenamePlan,
  onDeletePlan,
  lockedDayCount,
  totalDayCount,
  onToggleLockAll,
}: TripHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activePlan = plans.find((p) => p.id === activePlanId);

  return (
    // focus-ring-on-dark: กรอบโฟกัสสีเมเปิลจมไปกับพื้นสีสน สลับเป็นสีทองเฉพาะในหัวนี้ (เฟส 20.1)
    <header className="focus-ring-on-dark bg-pine px-4 pb-4 pt-6 text-cream sm:pb-6">
      <div className="mx-auto max-w-2xl lg:max-w-7xl">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-widest text-gold">
            11 – 21 ต.ค. 2026 · เที่ยวเกาหลี 12–20
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Link
              href="/today"
              className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-cream hover:bg-white/20"
            >
              📍 วันนี้
            </Link>
            <Link
              href="/summary"
              className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-cream hover:bg-white/20"
            >
              📋 สรุปแผน
            </Link>
          </div>
        </div>

        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold sm:text-3xl">🍁 แพลนเที่ยวเกาหลี</h1>
            {/* ข้อความสอนใช้งาน อ่านรอบเดียวก็พอ — บนมือถือมันแย่งที่กับเนื้อหาจริงทุกครั้งที่เปิด */}
            <p className="mt-1 hidden text-sm text-pine-soft/80 sm:block">
              เลือกสถานที่ในแต่ละวัน — เลือกแล้วอีกคนเห็นทันที
            </p>
            <p className="mt-1 truncate text-xs text-cream/80">
              {activePlan ? `${activePlan.name} · ` : ""}🗺️ {stopsCount} จุดในแผนนี้
            </p>
          </div>

          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="ตั้งค่าทริป"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20"
          >
            ⚙️
            {/* ยังไม่ได้ใส่ชื่อ = จุดแวะที่เพิ่มจะไม่มี "เลือกโดย …" ให้อีกคนดู — สะกิดไว้ตรงนี้
                เพราะช่องกรอกหลบเข้าไปอยู่ในโมดัลแล้ว ไม่ได้เห็นเองเหมือนตอนอยู่บนหัวเว็บ */}
            {!who && (
              <span
                aria-hidden
                className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-maple ring-2 ring-pine"
              />
            )}
          </button>
        </div>
      </div>

      {settingsOpen && (
        <TripSettingsModal
          who={who}
          onWhoChange={onWhoChange}
          plans={plans}
          activePlanId={activePlanId}
          onSwitchPlan={onSwitchPlan}
          onNewPlan={() => {
            setSettingsOpen(false);
            onNewPlan();
          }}
          onRenamePlan={() => {
            setSettingsOpen(false);
            onRenamePlan();
          }}
          onDeletePlan={() => {
            setSettingsOpen(false);
            onDeletePlan();
          }}
          lockedDayCount={lockedDayCount}
          totalDayCount={totalDayCount}
          onToggleLockAll={onToggleLockAll}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </header>
  );
}
