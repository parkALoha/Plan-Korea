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
      // ด่านสุดท้ายกัน "" หลุดลง DB (ฝั่ง UI กันไว้แล้วที่ DayStopsSection แต่ start_time เป็นคอลัมน์ text
      // ไม่มีด่านจาก DB เอง — บั๊ก 7.3) เขียน "" ทับได้จริงแล้วพัง timeToMinutes ทั้งวันของทุกคนที่ sync มาเห็น
      if (!startTime.trim()) return;
      setSettings((prev) => ({
        ...prev,
        [dayId]: { ...prev[dayId], plan_id: planId, day_id: dayId, start_time: startTime },
      }));
      if (!supabaseConfigured) return;
      await supabase
        .from("trip_day_settings")
        .upsert({ plan_id: planId, day_id: dayId, start_time: startTime });
    },
    [planId]
  );

  // โหมดเดินทางขากลับที่พักของวันนั้น — คอลัมน์ return_travel_mode มาจาก migration 0015
  // ถ้ายังไม่ได้รัน migration การ upsert จะ error เงียบๆ (จับไว้) แล้วหน้าเว็บยังใช้ค่าประมาณต่อได้
  const setReturnTravelMode = useCallback(
    async (dayId: string, mode: string) => {
      if (!planId) return;
      // upsert ต้องส่ง start_time ไปด้วย (คอลัมน์ not null) — ค่าเดิมของวันนั้นหรือค่า default เดียวกับที่หน้าเว็บใช้
      const startTime = settings[dayId]?.start_time ?? "07:00";
      setSettings((prev) => ({
        ...prev,
        [dayId]: { ...prev[dayId], plan_id: planId, day_id: dayId, start_time: startTime, return_travel_mode: mode },
      }));
      if (!supabaseConfigured) return;
      await supabase.from("trip_day_settings").upsert({
        plan_id: planId,
        day_id: dayId,
        start_time: startTime,
        return_travel_mode: mode,
      });
    },
    [planId, settings]
  );

  // ล็อก/ปลดล็อกวัน — คอลัมน์ is_locked มาจาก migration 0021
  // อัปเดต state ในเครื่องก่อนเสมอ (ปุ่มต้องตอบสนองทันที) แล้วค่อยยิงขึ้น DB ให้อีกคนเห็นผ่าน realtime
  const setDaysLocked = useCallback(
    async (dayIds: string[], locked: boolean) => {
      if (!planId || dayIds.length === 0) return;
      // start_time เป็นคอลัมน์ not null — ต้องส่งไปด้วยทุกครั้งที่ upsert แถวที่อาจยังไม่มี
      const rows = dayIds.map((dayId) => ({
        plan_id: planId,
        day_id: dayId,
        start_time: settings[dayId]?.start_time ?? "07:00",
        is_locked: locked,
      }));
      setSettings((prev) => {
        const next = { ...prev };
        for (const row of rows) next[row.day_id] = { ...prev[row.day_id], ...row };
        return next;
      });
      if (!supabaseConfigured) return;
      await supabase.from("trip_day_settings").upsert(rows);
    },
    [planId, settings]
  );

  return { settings, loaded, setStartTime, setReturnTravelMode, setDaysLocked, supabaseConfigured };
}
