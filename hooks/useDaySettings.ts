"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured, TripDaySettings } from "@/lib/supabase";

export function useDaySettings(planId: string | null) {
  const [settings, setSettings] = useState<Record<string, TripDaySettings>>({});
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    const channelName = `trip_day_settings_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      if (!supabaseConfigured || !planId) {
        setSettings({});
        return;
      }

      const { data } = await supabase
        .from("trip_day_settings")
        .select("*")
        .eq("plan_id", planId);
      if (cancelled) return;
      if (data) {
        const map: Record<string, TripDaySettings> = {};
        for (const row of data as TripDaySettings[]) map[row.day_id] = row;
        setSettings(map);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "trip_day_settings",
            filter: `plan_id=eq.${planId}`,
          },
          (payload) => {
            setSettings((prev) => {
              const next = { ...prev };
              if (payload.eventType === "DELETE") {
                delete next[(payload.old as TripDaySettings).day_id];
              } else {
                const row = payload.new as TripDaySettings;
                next[row.day_id] = row;
              }
              return next;
            });
          }
        )
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [planId]);

  const setStartTime = useCallback(
    async (dayId: string, startTime: string) => {
      if (!planId) return;
      if (!supabaseConfigured) {
        setSettings((prev) => ({
          ...prev,
          [dayId]: { plan_id: planId, day_id: dayId, start_time: startTime },
        }));
        return;
      }
      await supabase
        .from("trip_day_settings")
        .upsert({ plan_id: planId, day_id: dayId, start_time: startTime });
    },
    [planId]
  );

  return { settings, loaded, setStartTime, supabaseConfigured };
}
