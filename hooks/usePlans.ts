"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured, TripPlan } from "@/lib/supabase";
import { writeGuard } from "@/lib/writeGuard";
import { readCache, writeCache } from "@/lib/localCache";

function makePlanId() {
  return `plan-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

type CreatePlanOptions = { id?: string; duplicateFrom?: string; activate?: boolean };

export function usePlans() {
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    // ชื่อ channel ต้องไม่ซ้ำกันต่อการ mount เพราะ React Strict Mode (dev) รัน effect
    // นี้ 2 รอบ — ถ้าใช้ชื่อเดิม supabase-js จะคืน channel เดิมที่ subscribe() ไปแล้ว
    const channelName = `trip_plans_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const cached = readCache<{ plans: TripPlan[]; activePlanId: string | null }>("plans");
      if (cached) {
        setPlans(cached.plans);
        setActivePlanId(cached.activePlanId);
        setLoaded(true);
      }

      const [{ data: planRows }, { data: metaRow }] = await Promise.all([
        supabase.from("trip_plans").select("*").order("created_at", { ascending: true }),
        supabase.from("trip_meta").select("*").eq("id", 1).maybeSingle(),
      ]);
      if (cancelled) return;
      if (planRows) setPlans(planRows as TripPlan[]);
      if (metaRow) setActivePlanId(metaRow.active_plan_id);
      if (planRows) {
        writeCache("plans", {
          plans: planRows,
          activePlanId: metaRow?.active_plan_id ?? null,
        });
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_plans" },
          (payload) => {
            setPlans((prev) => {
              if (payload.eventType === "DELETE") {
                return prev.filter((p) => p.id !== (payload.old as TripPlan).id);
              }
              const row = payload.new as TripPlan;
              const exists = prev.some((p) => p.id === row.id);
              return exists ? prev.map((p) => (p.id === row.id ? row : p)) : [...prev, row];
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_meta" },
          (payload) => {
            const row = payload.new as { active_plan_id: string | null };
            setActivePlanId(row?.active_plan_id ?? null);
          }
        )
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const createPlan = useCallback(
    async (name: string, options?: CreatePlanOptions) => {
      const id = options?.id ?? makePlanId();
      const newPlan: TripPlan = { id, name, created_at: new Date().toISOString() };

      if (!supabaseConfigured) {
        setPlans((prev) => [...prev, newPlan]);
        if (options?.activate !== false) setActivePlanId(id);
        return id;
      }

      if (!(await writeGuard("สร้างแผนใหม่", () => supabase.from("trip_plans").insert(newPlan)))) {
        return undefined;
      }

      if (options?.duplicateFrom) {
        const [{ data: stopRows }, { data: settingRows }] = await Promise.all([
          supabase.from("trip_stops").select("*").eq("plan_id", options.duplicateFrom),
          supabase.from("trip_day_settings").select("*").eq("plan_id", options.duplicateFrom),
        ]);
        if (stopRows && stopRows.length > 0) {
          await writeGuard("ก๊อปจุดแวะมาแผนใหม่", () =>
            supabase.from("trip_stops").insert(
              stopRows.map((row) => ({
                ...row,
                id: `${row.id}-copy-${Math.random().toString(36).slice(2)}`,
                plan_id: id,
              }))
            )
          );
        }
        if (settingRows && settingRows.length > 0) {
          await writeGuard("ก๊อปตั้งค่ารายวันมาแผนใหม่", () =>
            supabase
              .from("trip_day_settings")
              .insert(settingRows.map((row) => ({ ...row, plan_id: id })))
          );
        }
      }

      if (options?.activate !== false) {
        await writeGuard("สลับแผนที่ใช้อยู่", () =>
          supabase.from("trip_meta").upsert({ id: 1, active_plan_id: id })
        );
      }
      return id;
    },
    []
  );

  const renamePlan = useCallback(async (id: string, name: string) => {
    if (!supabaseConfigured) {
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
      return;
    }
    await writeGuard("เปลี่ยนชื่อแผน", () =>
      supabase.from("trip_plans").update({ name }).eq("id", id)
    );
  }, []);

  const deletePlan = useCallback(
    async (id: string) => {
      if (plans.length <= 1) return; // กันลบแผนสุดท้าย
      if (!supabaseConfigured) {
        setPlans((prev) => prev.filter((p) => p.id !== id));
        if (activePlanId === id) {
          const next = plans.find((p) => p.id !== id);
          setActivePlanId(next?.id ?? null);
        }
        return;
      }
      // ลบ trip_plans แล้ว trip_stops/trip_day_settings ของแผนนี้จะถูกลบตามด้วย (on delete cascade)
      if (!(await writeGuard("ลบแผน", () => supabase.from("trip_plans").delete().eq("id", id)))) {
        return;
      }
      if (activePlanId === id) {
        const next = plans.find((p) => p.id !== id);
        if (next) {
          await writeGuard("สลับแผนที่ใช้อยู่", () =>
            supabase.from("trip_meta").upsert({ id: 1, active_plan_id: next.id })
          );
        }
      }
    },
    [plans, activePlanId]
  );

  const switchActivePlan = useCallback(async (id: string) => {
    if (!supabaseConfigured) {
      setActivePlanId(id);
      return;
    }
    await writeGuard("สลับแผนที่ใช้อยู่", () =>
      supabase.from("trip_meta").upsert({ id: 1, active_plan_id: id })
    );
  }, []);

  return {
    plans,
    activePlanId,
    loaded,
    createPlan,
    renamePlan,
    deletePlan,
    switchActivePlan,
    supabaseConfigured,
  };
}
