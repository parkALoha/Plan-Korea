"use client";

import { useEffect, useRef } from "react";
import type { TripPlan, TripSelection, TripStop } from "@/lib/supabase";
import { ITINERARY } from "@/data/itinerary";

const DEFAULT_PLAN_ID = "plan-default";

interface UseLegacyBootstrapArgs {
  plansLoaded: boolean;
  selectionsLoaded: boolean;
  plans: TripPlan[];
  selections: Record<string, TripSelection>;
  createPlan: (
    name: string,
    opts?: { id?: string; duplicateFrom?: string; activate?: boolean }
  ) => Promise<unknown>;
  bulkInsert: (rows: TripStop[]) => Promise<unknown>;
}

// ระบบเดิม (fixed slot) เก็บตัวเลือกไว้ใน `selections` — ครั้งแรกที่ยังไม่มีแผนเลย
// ให้สร้าง "แผนหลัก" แล้วย้ายตัวเลือกเดิมมาเป็น stops ครั้งเดียว
// (ใช้ id คงที่ กันกรณี 2 คนเปิดพร้อมกันแล้ว bootstrap ซ้ำ — insert ซ้ำจะแค่ error เฉยๆ)
export function useLegacyBootstrap({
  plansLoaded,
  selectionsLoaded,
  plans,
  selections,
  createPlan,
  bulkInsert,
}: UseLegacyBootstrapArgs) {
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    if (!plansLoaded || !selectionsLoaded) return;
    if (plans.length > 0) return;
    bootstrapped.current = true;

    async function bootstrap() {
      const rows: TripStop[] = [];
      for (const day of ITINERARY) {
        let orderIndex = 0;
        for (const slot of day.slots) {
          const sel = selections[slot.id];
          if (!sel) continue;
          rows.push({
            id: `stop-boot-${slot.id}`,
            plan_id: DEFAULT_PLAN_ID,
            day_id: day.id,
            place_id: sel.place_id,
            order_index: orderIndex++,
            dwell_minutes: null,
            travel_mode: null,
            note: null,
            added_by: sel.selected_by,
            updated_at: sel.updated_at,
          });
        }
      }
      await createPlan("แผนหลัก", { id: DEFAULT_PLAN_ID, activate: true });
      if (rows.length > 0) await bulkInsert(rows);
    }

    bootstrap();
  }, [plansLoaded, selectionsLoaded, plans.length, selections, createPlan, bulkInsert]);
}
