"use client";

import Link from "next/link";
import type { TripPlan } from "@/lib/supabase";

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
}

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
}: TripHeaderProps) {
  return (
    <header className="bg-pine px-4 pb-8 pt-10 text-cream">
      <div className="mx-auto max-w-2xl lg:max-w-7xl">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-widest text-gold">
            11 – 21 ต.ค. 2026 · เที่ยวเกาหลี 12–20
          </div>
          <Link
            href="/today"
            className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-cream hover:bg-white/20"
          >
            📍 วันนี้
          </Link>
        </div>
        <h1 className="mt-1 text-3xl font-extrabold">🍁 แพลนเที่ยวเกาหลี</h1>
        <p className="mt-1 text-sm text-pine-soft/80">
          เลือกสถานที่ในแต่ละวัน — เลือกแล้วอีกคนเห็นทันที
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            value={who}
            onChange={(e) => onWhoChange(e.target.value)}
            placeholder="ชื่อคุณ (เช่น เอ / บี)"
            className="w-40 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-cream placeholder:text-cream/50 focus:border-gold focus:outline-none"
          />
          <span className="text-sm text-cream/90">🗺️ {stopsCount} จุดในแผนนี้</span>
        </div>

        {plans.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <select
              value={activePlanId ?? ""}
              onChange={(e) => onSwitchPlan(e.target.value)}
              className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-cream focus:border-gold focus:outline-none [&>option]:text-ink"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={onNewPlan}
              className="rounded-lg bg-white/10 px-2.5 py-1.5 font-medium hover:bg-white/20"
            >
              + แผนใหม่
            </button>
            <button
              onClick={onRenamePlan}
              className="rounded-lg bg-white/10 px-2.5 py-1.5 font-medium hover:bg-white/20"
            >
              เปลี่ยนชื่อ
            </button>
            {plans.length > 1 && (
              <button
                onClick={onDeletePlan}
                className="rounded-lg bg-white/10 px-2.5 py-1.5 font-medium text-maple-soft hover:bg-white/20"
              >
                ลบแผนนี้
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
