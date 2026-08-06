"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured, TripSelection } from "@/lib/supabase";

function makeSelection(
  dayId: string,
  slotId: string,
  placeId: string,
  selectedBy?: string
): TripSelection {
  return {
    slot_id: slotId,
    day_id: dayId,
    place_id: placeId,
    selected_by: selectedBy ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function useSelections() {
  const [selections, setSelections] = useState<Record<string, TripSelection>>({});
  // ยังไม่ได้ตั้งค่า Supabase — ใช้ state ในเครื่องไปก่อน (ไม่ sync ระหว่างเครื่อง) ถือว่าโหลดเสร็จตั้งแต่แรก
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    // ชื่อ channel ต้องไม่ซ้ำกันต่อการ mount เพราะ React Strict Mode (dev) รัน effect
    // นี้ 2 รอบ — ถ้าใช้ชื่อเดิม supabase-js จะคืน channel เดิมที่ subscribe() ไปแล้ว
    // แล้วมาเรียก .on() ซ้ำใส่ channel เดิมไม่ได้ (จะ throw)
    const channelName = `trip_selections_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const { data } = await supabase.from("trip_selections").select("*");
      if (cancelled) return;
      if (data) {
        const map: Record<string, TripSelection> = {};
        for (const row of data as TripSelection[]) map[row.slot_id] = row;
        setSelections(map);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_selections" },
          (payload) => {
            setSelections((prev) => {
              const next = { ...prev };
              if (payload.eventType === "DELETE") {
                delete next[(payload.old as TripSelection).slot_id];
              } else {
                const row = payload.new as TripSelection;
                next[row.slot_id] = row;
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
  }, []);

  const choose = useCallback(
    async (dayId: string, slotId: string, placeId: string, selectedBy?: string) => {
      if (!supabaseConfigured) {
        setSelections((prev) => ({
          ...prev,
          [slotId]: makeSelection(dayId, slotId, placeId, selectedBy),
        }));
        return;
      }
      await supabase.from("trip_selections").upsert({
        slot_id: slotId,
        day_id: dayId,
        place_id: placeId,
        selected_by: selectedBy ?? null,
        updated_at: new Date().toISOString(),
      });
    },
    []
  );

  const clear = useCallback(async (slotId: string) => {
    if (!supabaseConfigured) {
      setSelections((prev) => {
        const next = { ...prev };
        delete next[slotId];
        return next;
      });
      return;
    }
    await supabase.from("trip_selections").delete().eq("slot_id", slotId);
  }, []);

  return { selections, loaded, choose, clear, supabaseConfigured };
}
